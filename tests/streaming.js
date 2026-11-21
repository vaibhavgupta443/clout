// Streaming: the character's words appear as they are written (Server-Sent Events), with the same key, rules and cost counting as every call.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

// a fake streaming server: events can be split across chunks, and a chunk can wait for us
function sse(events, o = {}) {
  const chunks = [];
  events.forEach((e) => chunks.push(e === '[DONE]' ? 'data: [DONE]\n\n' : 'data: ' + JSON.stringify(e) + '\n\n'));
  const joined = chunks.join('');
  const parts = [];
  for (let i = 0; i < joined.length; i += o.size || 37) parts.push(joined.slice(i, i + (o.size || 37))); // chunk boundaries fall in the middle of events
  return parts;
}
const mkFetch = (parts, o = {}) => async (url, init) => {
  mkFetch.last = { url: String(url), init, body: JSON.parse(init.body) };
  if (/chat\/completions$/.test(String(url))) mkFetch.lastChat = mkFetch.last;
  if (o.fail) return { ok: false, status: o.fail, json: async () => ({}) };
  if (o.noBody) return { ok: true, status: 200, json: async () => ({}) };
  let i = 0;
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => { if (o.gateAt === i && o.gate) await o.gate; return i < parts.length ? { done: false, value: parts[i++] } : { done: true }; } }) } };
};
const delta = (t) => ({ choices: [{ delta: { content: t } }] });

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.settings.apiKey = 'sk-test';
  G.settings.approveActions = false;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const f0 = w.fetch;

  /* ---------- AI.stream ---------- */
  const seen = [];
  const spend0 = G.settings.totalSpend;
  w.fetch = mkFetch(sse([delta('Hel'), delta('lo th'), delta('ere, *waves*'), { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 8, cost: 0.0004 } }, '[DONE]']));
  const r = await G.AI.stream({ task: 'scene', user: 'say hi' }, (t) => seen.push(t));
  check('the text arrives piece by piece (each callback has the text so far)', seen.length === 3 && seen[0] === 'Hel' && seen[1] === 'Hello th' && seen[2] === 'Hello there, *waves*', JSON.stringify(seen));
  check('events split across network chunks are reassembled', r.text === 'Hello there, *waves*');
  check('cost and tokens come from the final usage event and are counted like any call', r.cost === 0.0004 && r.tokens === 128 && Math.abs(G.settings.totalSpend - spend0 - 0.0004) < 1e-9);
  const req = mkFetch.last;
  check('it sends stream:true, plain messages (no JSON mode), the key, the cost flag and the content rules', req.body.stream === true && !req.body.response_format && /Bearer sk-test/.test(req.init.headers.Authorization) && req.body.usage && req.body.usage.include === true && req.body.messages[0].content.includes(G.Limits.prompt()) && /chat\/completions$/.test(req.url), JSON.stringify(Object.keys(req.body)));

  w.fetch = mkFetch(sse([delta("I'm sorry, but I can't help with that."), '[DONE]']));
  let refused = '';
  try { await G.AI.stream({ task: 'scene', user: 'x' }); } catch (e) { refused = e.kind + ':' + e.message; }
  check('a refusal is detected the same way as in every other call', /^refused:/.test(refused), refused);
  w.fetch = mkFetch([], { noBody: true });
  let ns = '';
  try { await G.AI.stream({ task: 'scene', user: 'x' }); } catch (e) { ns = e.kind; }
  check('a server that cannot stream says so (kind "nostream"), so callers can fall back', ns === 'nostream');
  w.fetch = mkFetch([], { fail: 500 });
  ns = '';
  try { await G.AI.stream({ task: 'scene', user: 'x' }); } catch (e) { ns = e.kind; }
  check('an HTTP error also falls back', ns === 'nostream');
  w.fetch = mkFetch(sse([delta('   '), '[DONE]']));
  let empty = '';
  try { await G.AI.stream({ task: 'scene', user: 'x' }); } catch (e) { empty = e.message; }
  check('an empty stream is an error, not a blank bubble', /nothing/.test(empty), empty);

  /* ---------- Story.chat streams, and falls back ---------- */
  G.AI.ready = () => true;
  w.fetch = mkFetch(sse([delta(`${mia.name}: "I missed you`), delta(', you know."'), { choices: [{ delta: {} }], usage: { cost: 0.0002, prompt_tokens: 50, completion_tokens: 6 } }, '[DONE]']));
  const live = [];
  const c1 = await E.Story.chat(mia.id, 'did you miss me?', { onText: (t) => live.push(t) });
  check('Story.chat streams in character, and the reply is cleaned (no name prefix, no wrapping quotes)', c1.reply === "I missed you, you know." && live.length >= 2 && live[live.length - 1] === "I missed you, you know." && c1.cost === 0.0002, JSON.stringify({ r: c1.reply, live }));
  check('the streaming prompt asks for plain text, not JSON', !/Return JSON/.test(mkFetch.lastChat.body.messages[1].content) && /plain text/.test(mkFetch.lastChat.body.messages[1].content));
  w.fetch = mkFetch([], { noBody: true });
  const calls = [];
  G.AI.json = async (o) => { calls.push(o); return { cost: 0.001, data: { reply: 'fallback reply' } }; };
  const c2 = await E.Story.chat(mia.id, 'hello again', { onText: () => {} });
  check('if streaming is not available it quietly uses the normal JSON call', c2.reply === 'fallback reply' && calls.length === 1 && /Return JSON/.test(calls[0].user));
  w.fetch = mkFetch(sse([delta("I'm sorry, but I can't help with that."), '[DONE]']));
  let err = '';
  try { await E.Story.chat(mia.id, 'x', { onText: () => {} }); } catch (e) { err = e.message; }
  check('a refusal is shown as a refusal (it does not silently retry another way)', /refused/.test(err) && calls.length === 1, err);
  const c3 = await (async () => { G.AI.json = async () => ({ cost: 0, data: { reply: 'plain json reply' } }); return E.Story.chat(mia.id, 'no streaming wanted'); })();
  check('without a streaming callback it behaves exactly as before', c3.reply === 'plain json reply');

  /* ---------- the Director bar: the bubble fills in while it streams ---------- */
  w.document.body.classList.add('ingame');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  let release;
  const gate = new Promise((res) => { release = res; });
  const parts = [].concat(sse([delta('I was at the stu')], { size: 9999 }), ['__GATE__'], sse([delta('dio all night, *sighs*'), { choices: [{ delta: {} }], usage: { cost: 0.0003, prompt_tokens: 40, completion_tokens: 9 } }, '[DONE]'], { size: 9999 }));
  w.fetch = async (url, init) => {
    let i = 0;
    return { ok: true, status: 200, body: { getReader: () => ({ read: async () => { if (parts[i] === '__GATE__') { await gate; i++; } return i < parts.length ? { done: false, value: parts[i++] } : { done: true }; } }) } };
  };
  G.AI.json = async () => { throw new Error('should not fall back'); };
  G.UI.acts.talkTo({ id: mia.id });
  $('#stdock textarea').value = 'where were you?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('#stdock [data-d="say"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 80 && !/I was at the stu/.test(($('#stdock .d2-b.chat .t') || {}).textContent || ''); i++) await H.wait(15);
  const mid = ($('#stdock .d2-b.chat .t') || {}).textContent;
  check('while the model is still writing, the bubble already shows the words so far', /I was at the stu/.test(mid) && !/sighs/.test(mid), mid);
  release();
  for (let i = 0; i < 80 && !/sighs/.test(($('#stdock .d2-b.chat .t') || {}).textContent || ''); i++) await H.wait(15);
  await H.wait(60);
  check('when it finishes the bubble has the whole reply and its cost', /I was at the studio all night/.test($('#stdock .d2-b.chat').textContent) && /<\$0\.01|\$0\.00/.test($('#stdock .d2-b.chat').textContent), $('#stdock .d2-b.chat').textContent);
  check('the exchange is kept in the world as before', (S.dirChat[mia.id] || []).length >= 2 && (S.dirChat[mia.id].slice(-1)[0].text || '').includes('studio'));
  check('no half-written placeholder is left in the thread', !(G.S.stThread || []).some((x) => x.live));
  w.fetch = f0;

  H.summary('STREAMING');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
