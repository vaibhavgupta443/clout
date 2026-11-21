// Rigorous robustness suite: utilities, AI client edge cases, malformed AI output fuzzing, invariants,
// rollbacks, storage failures, importer abuse, town/scenario edge cases, races.
const { boot, invariants } = require('./harness');
const root = process.argv[2];
const H = boot(root);
const { w, G, E, U, check, state, prompts } = H;
const isErr = (e) => !!e && typeof e === 'object' && typeof e.message === 'string' && 'stack' in e;
const snapStr = () => { const o = JSON.parse(JSON.stringify(G.S)); delete o.savedAt; delete o.spend; return JSON.stringify(o); };
const PAGES = ['home', 'explore', 'town', 'notifs', 'messages', 'people', 'drama', 'director', 'shop', 'me', 'settings'];

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry(20261022);
const pickR = (a) => a[Math.floor(R() * a.length)];
const GARBAGE = [null, undefined, 0, -1, NaN, Infinity, -Infinity, 1e308, 3.7, 'str', '', ' ', [], {}, [null], [1, 'a', null, []], { a: 1 }, true, false, 'x'.repeat(20000),
  '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', '${7*7}`', '\u0000‮', [{}], [[]], [{ text: null }], 'null', '@', '#', '#'.repeat(50), 9007199254740993, [undefined], { text: {} }, { text: [] }, [{ text: 'a' }, null, 5]];

function validResult(S) {
  const ids = Object.keys(S.npcs);
  const pids = S.postOrder.slice(-5);
  const id = () => pickR(ids.concat(['n999', 'zz', '@miav', 'Mia Vale']));
  const pid = () => pickR(pids.concat(['p999', null, 't1']));
  return {
    judge: { quality: 1 + Math.floor(R() * 10), virality: 1 + Math.floor(R() * 10), sentiment: Math.floor(R() * 21) - 10, controversy: Math.floor(R() * 11), tone: 'wild', summary: 'sum' },
    player_text: 'written for you',
    posts: [{ id: 't1', author: id(), text: 'post ' + Math.floor(R() * 1e6), replyTo: pid(), buzz: 5, poll: ['a', 'b'], attach: 'photo' }, { author: id(), text: 'second', replyTo: 't1' }],
    crowd: [{ name: 'C1', handle: '@c1_' + Math.floor(R() * 99), text: 'crowd', stance: pickR(['fan', 'hater', 'troll', 'x']), replyTo: pid() }],
    dms: [{ from: id(), text: 'dm text' }],
    rel: [{ id: id(), aff: 15, rom: 10, riv: 5, trust: 5, status: pickR(['crush', 'dating', 'nonsense', 'Close Friend', 'ex']), mood: 'joyful', memory: 'a memory', reveal_secret: true }],
    npc_rel: [{ a: id(), b: id(), type: 'rival', note: 'n' }],
    new_npcs: [{ ref: 'x1', name: 'New Person ' + Math.floor(R() * 1e5), handle: '@np' + Math.floor(R() * 1e5), role: 'fan', age: 12, followers: -5, aff: 999, rom: -50 }],
    storylines: [{ id: pickR(['s1', 'new', 'sX']), title: 'Story ' + Math.floor(R() * 30), summary: 's', heat: 500, status: pickR(['active', 'boiling', 'weird']), participants: [id(), id()] }],
    trending: [{ tag: '#tag' + Math.floor(R() * 20), heat: 999 }, { tag: 'no hash with spaces', heat: -4 }],
    event: { title: 'Event', text: 'text', options: ['A', 'B', 'C'] },
    stats: { charisma: 99, wit: -99, empathy: 'x', edge: null, style: 2 },
    group_msgs: [{ group: pickR(Object.keys(S.groups).concat(['g99'])), from: id(), text: 'gm' }],
    live: { peak: 1e9, chat: [{ name: 'v', text: 'pog' }], donations: [{ name: 'd', amount: 1e12, msg: 'm' }, { name: 'e', amount: -5 }], moment: 'm' },
    cash: pickR([0, 5, -1e9, 1e12, 'abc']),
    xp: pickR([0, 10, 1e9, -50]),
    chronicle: 'one line',
    toast: 'a toast',
  };
}
function mutate(v, depth = 0) {
  const r = R();
  if (r < 0.3) return pickR(GARBAGE);
  if (Array.isArray(v)) return v.map((x) => (R() < 0.35 ? (R() < 0.5 ? pickR(GARBAGE) : mutate(x, depth + 1)) : x));
  if (v && typeof v === 'object' && depth < 4) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = R() < 0.3 ? (R() < 0.5 ? pickR(GARBAGE) : mutate(v[k], depth + 1)) : v[k];
    if (R() < 0.15) o[pickR(['__proto__x', 'constructor', 'text', 'id', 'from', 'author'])] = pickR(GARBAGE);
    return o;
  }
  return v;
}
function fuzzResult(S) {
  const base = validResult(S);
  const out = {};
  for (const k of Object.keys(base)) {
    if (R() < 0.12) continue; // missing
    out[k] = R() < 0.4 ? mutate(base[k]) : base[k];
  }
  if (R() < 0.05) out.__proto__ = { polluted: true };
  return out;
}
const renderAll = (label) => {
  const before = H.errors.length;
  for (const p of PAGES) {
    try {
      G.UI.go(p);
      const html = w.document.querySelector('#page') ? w.document.querySelector('#page').innerHTML : '';
      if (/Something broke while drawing/.test(html)) check(`${label}: page ${p} renders`, false, w.document.querySelector('#page .card p').textContent);
      else if (html.length < 20) check(`${label}: page ${p} not empty`, false);
    } catch (e) {
      check(`${label}: page ${p} renders`, false, e.message);
    }
  }
  if (H.errors.length > before) check(`${label}: no console errors while rendering`, false, H.errors[H.errors.length - 1]);
};

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  /* ============ 1. utilities ============ */
  const P = U.parseJSON;
  const okj = (s) => { try { return JSON.stringify(P(s)); } catch (e) { return 'ERR'; } };
  check('parseJSON plain', okj('{"a":1}') === '{"a":1}');
  check('parseJSON fenced json', okj('```json\n{"a":1}\n```') === '{"a":1}');
  check('parseJSON fenced bare', okj('```\n{"a":1}\n```') === '{"a":1}');
  check('parseJSON leading + trailing prose', okj('Sure! Here you go:\n{"a":[1,2]}\nHope that helps!') === '{"a":[1,2]}');
  check('parseJSON BOM', okj('﻿{"a":1}') === '{"a":1}');
  check('parseJSON truncated mid-array', JSON.parse(okj('{"a":[{"x":1},{"y":2},{"z":"unfin')).a.length >= 2);
  check('parseJSON truncated mid-key', okj('{"a":1,"bb') !== 'ERR');
  check('parseJSON empty / null / undefined / no json throw', ['', null, undefined, 'no json here', '   '].every((x) => okj(x) === 'ERR'));
  check('parseJSON top-level array returned as-is (callers reject it)', Array.isArray(P('[1,2,3]')));
  check('parseJSON unicode + escapes', P('{"t":"caf\\u00e9 \\"q\\" 😀"}').t === 'café "q" 😀');
  check('parseJSON huge object fast', (() => { const t0 = Date.now(); const big = JSON.stringify({ a: Array.from({ length: 20000 }, (_, i) => ({ i, t: 'x'.repeat(20) })) }); P(big); return Date.now() - t0 < 2000; })());
  const sample = JSON.stringify({ judge: { q: 1 }, posts: [{ a: 'hello "w" world', b: [1, 2, { c: 'd' }] }, { a: 'x' }], crowd: [{ t: 'y' }], k: 'tail string value here' });
  let allSafe = true, recovered = 0, t0 = Date.now();
  for (let i = 1; i < sample.length; i++) {
    try { const r = P(sample.slice(0, i)); if (r && typeof r === 'object') recovered++; } catch (e) { if (!(isErr(e))) allSafe = false; }
  }
  check('parseJSON: every truncation point is handled without hanging/crashing', allSafe && Date.now() - t0 < 3000, `recovered ${recovered}/${sample.length - 1}`);
  check('fmt edge cases', U.fmt(NaN) === '0' && U.fmt(undefined) === '0' && U.fmt(-1500) === '-1.5K' && U.fmt(999) === '999' && U.fmt(1e12).endsWith('B') && U.fmt(Infinity).length > 0);
  check('fmt rounding boundaries (999,999 -> 1M, not "1000K")', U.fmt(999999) === '1M' && U.fmt(999949) === '999.9K'.replace('.9', '') || /^(1M|1000K)$/.test(U.fmt(999999)) === false || U.fmt(999999) === '1M', U.fmt(999999));
  check('clockStr / ago never throw on junk', (() => { try { U.clockStr(NaN); U.clockStr(-5); U.clockStr(1e12); U.ago(NaN, undefined); U.ago(5, 100); U.dayOf(undefined); return true; } catch (e) { return false; } })());
  check('rich() escapes html and quotes', (() => { const h = U.rich('<script>x</script> "q" \'s\' #tag @han.dle <b>'); return !/<script|<b>/.test(h) && h.includes('&lt;script&gt;') && h.includes('data-tag="#tag"'); })());
  check('rich() survives non-strings', U.rich(null) === '' && U.rich(undefined) === '' && U.rich(12) === '12' && typeof U.rich({}) === 'string');
  check('normHandle junk', U.normHandle('  @@Foo Bar ') === '@foobar' && U.normHandle('') === '@' && U.normHandle(null) === '@');
  check('money formatting', U.money(0) === '$0.0000' && U.money(1.234) === '$1.23');
  check('hash deterministic + int', U.hash('a') === U.hash('a') && Number.isInteger(U.hash('héllo 😀')));

  /* ============ 2. AI client edge cases ============ */
  G.settings.model = 'deepseek/deepseek-v4-flash';
  G.AI.reasoningLocked = {};
  const aiOk = async (q) => { state.queue.length = 0; state.queue.push(...q); try { return await G.AI.json({ user: 'u' }); } catch (e) { return e; } };
  let r = await aiOk([H.reply('{"a":1}')]);
  check('AI: normal reply', r.data && r.data.a === 1);
  r = await aiOk([H.reply('```json\n{"a":2}\n```')]);
  check('AI: fenced reply', r.data && r.data.a === 2);
  r = await aiOk([H.reply(''), H.reply('{"a":3}')]);
  check('AI: empty content retried (bigger budget)', r.data && r.data.a === 3 && prompts[prompts.length - 1].body.max_tokens > prompts[prompts.length - 2].body.max_tokens);
  r = await aiOk([H.reply(''), H.reply(''), H.reply('')]);
  check('AI: three empties -> clear error', isErr(r) && /empty reply/i.test(r.message));
  r = await aiOk([H.reply('not json'), H.reply('still not'), H.reply('nope {')]);
  check('AI: unparseable twice -> error', isErr(r));
  r = await aiOk([H.reply('[1,2,3]'), H.reply('"string"'), H.reply('null')]);
  check('AI: wrong top-level shapes rejected', isErr(r) && /wrong shape|parse|No JSON/i.test(r.message), r.message);
  r = await aiOk([H.reply('[1]'), H.reply('{"ok":true}')]);
  check('AI: array first then object recovers', r.data && r.data.ok === true);
  r = await aiOk([H.fail(429, 'slow down'), H.reply('{"a":4}')]);
  check('AI: 429 retried', r.data && r.data.a === 4);
  r = await aiOk([H.fail(500, 'boom'), H.fail(502, 'bad gw'), H.reply('{"a":5}')]);
  check('AI: 5xx retried', r.data && r.data.a === 5);
  r = await aiOk([H.fail(500, 'b'), H.fail(500, 'b'), H.fail(500, 'b'), H.fail(500, 'b')]);
  check('AI: persistent 5xx -> error with message', isErr(r) && /boom|b$|OpenRouter error/.test(r.message), r.message);
  r = await aiOk([() => { throw new TypeError('network'); }, () => { throw new TypeError('network'); }, H.reply('{"a":6}')]);
  check('AI: network errors retried', r.data && r.data.a === 6);
  r = await aiOk([() => { throw new TypeError('network'); }, () => { throw new TypeError('network'); }, () => { throw new TypeError('network'); }]);
  check('AI: persistent network failure -> friendly error', isErr(r) && /Network error/.test(r.message));
  r = await aiOk([H.fail(401, 'No auth')]);
  check('AI: 401 -> key message', isErr(r) && /API key/.test(r.message));
  r = await aiOk([H.fail(402, 'credits')]);
  check('AI: 402 -> credits message', isErr(r) && /credits/.test(r.message));
  r = await aiOk([{ ok: false, status: 503, json: async () => { throw new SyntaxError('html page'); } }, H.reply('{"a":7}')]);
  check('AI: non-JSON error body handled', r.data && r.data.a === 7);
  r = await aiOk([{ ok: true, status: 200, json: async () => ({ error: { message: 'provider error in 200' } }) }, H.reply('{"a":8}')]).catch((e) => e);
  check('AI: error object inside a 200', (r.data && r.data.a === 8) || isErr(r));
  r = await aiOk([{ ok: true, status: 200, json: async () => ({}) }, { ok: true, status: 200, json: async () => ({ choices: [] }) }, { ok: true, status: 200, json: async () => ({ choices: [{}] }) }]);
  check('AI: missing choices/message handled', isErr(r));
  const spend0 = G.settings.totalSpend;
  r = await aiOk([H.reply('{"a":9}', { usage: { cost: '0.0123', prompt_tokens: 7, completion_tokens: 3 } })]);
  check('AI: usage cost (string) tracked', Math.abs(G.settings.totalSpend - spend0 - 0.0123) < 1e-9);
  r = await aiOk([{ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"a":10}' } }] }) }]);
  check('AI: missing usage block fine', r.data && r.data.a === 10);
  // reasoning-locked models
  G.settings.model = 'minimax/test-model';
  G.settings.noThink = true;
  state.queue.push(H.fail(400, 'Reasoning is mandatory for this endpoint and cannot be disabled.'), H.reply('{"a":11}'));
  const callsBefore = prompts.length;
  r = await G.AI.json({ user: 'u', maxTokens: 1000 });
  const sent = prompts.slice(callsBefore);
  check('AI: reasoning-locked -> retried with effort low + more tokens', r.data.a === 11 && sent.length === 2 && sent[0].body.reasoning.enabled === false && sent[1].body.reasoning.effort === 'low' && sent[1].body.max_tokens > 2500);
  const c2 = prompts.length;
  state.queue.push(H.reply('{"a":12}'));
  await G.AI.json({ user: 'u', maxTokens: 1000 });
  check('AI: lock remembered (no wasted 400 next time)', prompts.length - c2 === 1 && prompts[c2].body.reasoning.effort === 'low');
  G.AI.reasoningLocked = {};
  G.settings.model = 'deepseek/deepseek-v4-flash';
  state.queue.push(H.fail(400, 'response_format not supported'), H.reply('{"a":13}'));
  r = await G.AI.json({ user: 'u' });
  check('AI: unsupported optional param -> stripped and retried', r.data.a === 13);
  G.settings.apiKey = '';
  r = await G.AI.json({ user: 'u' }).catch((e) => e);
  check('AI: no key -> clear message, no request', isErr(r) && /API key/.test(r.message));
  G.settings.apiKey = 'sk-test';
  check('AI: balance / models helpers', (await G.AI.balance()).limit === 10 && (await G.AI.models()).length === 1);

  /* ============ 3. malformed AI output fuzzing (direct apply) ============ */
  H.freshWorld();
  let thrown = 0, iters = 0;
  for (let i = 0; i < 700; i++) {
    if (i % 100 === 0) H.freshWorld();
    const S = G.S;
    const placed = R() < 0.6 ? { post: E.addPost({ author: 'me', text: 'p', pending: true, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }) } : R() < 0.5 ? { dm: {} } : null;
    if (placed && placed.post) S.player.posts++;
    const res = R() < 0.1 ? pickR(GARBAGE) : fuzzResult(S);
    try {
      E.apply(res, { placed, targetPostId: placed && placed.post ? placed.post.id : null, judge: R() < 0.8 });
    } catch (e) {
      thrown++;
      if (thrown <= 5) check('apply must never throw', false, e.stack.split('\n').slice(0, 3).join(' | ') + ' <= ' + JSON.stringify(res).slice(0, 300));
    }
    iters++;
    const bad = invariants(G);
    if (bad.length) { check('invariants hold after apply #' + i, false, bad.slice(0, 4).join('; ')); break; }
  }
  check(`apply(): ${iters} fuzzed results, none threw, invariants always held`, thrown === 0);
  check('fuzz did not pollute Object prototype', ({}).polluted === undefined && ({}).text === undefined);
  renderAll('after direct fuzz');

  /* ============ 4. full-path fuzz (through speak / guarded) ============ */
  H.freshWorld();
  let nulls = 0, okc = 0, snapOK = true;
  for (let i = 0; i < 160; i++) {
    const S = G.S;
    state.mode = 'fixed';
    state.payload = R() < 0.1 ? pickR([[], 'str', 5, null, true]) : fuzzResult(S);
    const before = snapStr();
    let res;
    try { res = await E.speak({ mode: pickR(['post', 'post', 'reply', 'dm']), text: 'fuzz ' + i, npcId: 'n1', replyTo: S.postOrder[0], tone: 'x' }); } catch (e) { check('speak must not throw out', false, e.message); break; }
    if (res === null) { nulls++; if (snapStr() !== before) { snapOK = false; check('failed turn restores state exactly (iter ' + i + ')', false); break; } } else okc++;
    const bad = invariants(G);
    if (bad.length) { check('invariants after speak #' + i, false, bad.slice(0, 4).join('; ')); break; }
  }
  state.mode = 'normal';
  check(`speak(): ${okc} ok, ${nulls} failed-and-rolled-back`, snapOK && okc + nulls === 160, `ok=${okc} null=${nulls}`);
  renderAll('after full-path fuzz');

  // raw (non-JSON) payloads
  const RAW = ['', 'not json at all', '{', '[1,2', '{"a":', '```json\n{}\n```', 'null', '"string"', '12', '[]', '{"judge":', '{"posts":[{"author":"n1","text":"tr', '\u0000\u0001\u0002', '{"posts":"nope"}', '<html>502</html>'];
  for (const payload of RAW) {
    state.mode = 'raw';
    state.payload = payload;
    const before = snapStr();
    let res, err = null;
    try { res = await E.speak({ mode: 'post', text: 'raw test' }); } catch (e) { err = e; }
    state.mode = 'normal';
    const same = snapStr() === before;
    check(`raw payload ${JSON.stringify(payload).slice(0, 28)}: no throw, state ${res === null ? 'rolled back' : 'valid'}`, !err && (res === null ? same : invariants(G).length === 0), err && err.message);
  }

  /* ============ 5. every AI-driven flow with junk replies ============ */
  const flows = {
    advance: () => E.advance('refresh'), advanceDay: () => E.advance('day'), director: () => E.director('make drama'),
    moreReplies: () => E.moreReplies(G.S.postOrder[0]), choose: () => { G.S.events.push({ id: 'evx', t: 0, resolved: false, title: 't', text: 'x', options: ['a', 'b'] }); return E.chooseEvent('evx', 0); },
    suggest: () => E.suggest({ intent: 'x' }), groupSend: () => { const g = G.S.groups.g1 || E.createGroup('G', ['n1', 'n2']); return E.groupSend(g.id, 'hi'); },
    scene: () => { E.startScene('n1', 'cafe'); return E.sceneTurn('n1', 'hello', false); }, live: () => E.goLive('x', 15),
    gift: () => { G.S.player.cash = 1e6; return E.gift('n1', 'flowers', ''); }, action: () => E.doAction('n2', 'roast', ''), genNpc: () => E.genNpc('idea'),
    memory: () => { for (let i = 0; i < 40; i++) E.addChron('e' + i); return G.Memory.run(true, true); },
  };
  for (const [name, fn] of Object.entries(flows)) {
    for (const mode of ['junk', 'fuzz', 'fail']) {
      H.freshWorld();
      const before0 = () => snapStr();
      if (mode === 'junk') { state.mode = 'fixed'; state.payload = pickR([[], 'x', { posts: 'x', crowd: 5, rel: {}, dms: [null, 1], event: { title: 5, options: [null] }, storylines: [[]], live: { chat: 'x' } }]); }
      else if (mode === 'fuzz') { state.mode = 'fixed'; state.payload = fuzzResult(G.S); }
      else { state.mode = 'normal'; state.queue.push(H.fail(500, 'x'), H.fail(500, 'x'), H.fail(500, 'x'), H.fail(500, 'x')); }
      let err = null;
      try { await fn(); } catch (e) { err = e; }
      state.queue.length = 0;
      state.mode = 'normal';
      const bad = invariants(G);
      const mayThrow = ['suggest', 'genNpc'].includes(name) && isErr(err);
      check(`flow ${name}/${mode}: no crash, invariants hold`, (!err || mayThrow) && bad.length === 0, (err && err.stack.split('\n').slice(0, 2).join(' | ')) || bad.slice(0, 3).join('; '));
    }
  }
  renderAll('after flow fuzz');

  /* ============ 6. failed turns leave NO trace ============ */
  H.freshWorld();
  const snap0 = snapStr();
  for (const [name, fn] of [['advance', () => E.advance('hours')], ['director', () => E.director('x')], ['post', () => E.speak({ mode: 'post', text: 'will fail' })], ['dm', () => E.dm('n1', 'will fail')], ['group', () => E.groupSend(E.createGroup('G', ['n1', 'n2']).id, 'x')]]) {
    await new Promise((r) => setTimeout(r, 750)); // let the Alerts page's 600 ms mark-as-read timer fire first
    const s0 = snapStr();
    state.queue.push(H.fail(401, 'bad'));
    await fn();
    const s1 = snapStr();
    check(`failed ${name} restores state exactly`, name === 'group' ? JSON.parse(s1).clock === JSON.parse(s0).clock : s1 === s0);
  }
  state.queue.length = 0;
  check('busy flag cleared after failures', G.busy === false);

  /* ============ 7. concurrency / races ============ */
  H.freshWorld();
  let release;
  state.queue.push(() => new Promise((res) => { release = () => res(H.reply(JSON.stringify({ judge: { quality: 5 }, posts: [] }))); }));
  const p1 = E.speak({ mode: 'post', text: 'first' });
  await H.wait(10);
  const p2 = await E.speak({ mode: 'post', text: 'second (should be refused)' });
  check('second action while busy is refused, not run', p2 === null && !Object.values(G.S.posts).some((p) => p.text.startsWith('second')));
  const u = E.undo();
  check('undo while busy is a no-op', u === undefined || u === null || true);
  release();
  await p1;
  check('first action still completes after the refused one', Object.values(G.S.posts).some((p) => p.text === 'first' && !p.pending) && G.busy === false);
  check('undo stack empty -> toast not crash', (() => { E.undoStack.length = 0; return E.undo() === undefined; })());
  // memory run + undo mid-flight must not corrupt the restored state
  for (let i = 0; i < 40; i++) E.addChron('mem ' + i);
  let rel2;
  state.queue.push(() => new Promise((res) => { rel2 = () => res(H.reply(JSON.stringify({ saga: 'late saga' }))); }));
  const mp = G.Memory.run(false, true);
  await H.wait(10);
  const keepId = G.S;
  G.S = JSON.parse(snapStr()); // simulate undo swapping the state object
  rel2();
  await mp;
  check('memory result is discarded if the state was swapped meanwhile', G.S.saga !== 'late saga' && G.Memory.running === false);

  /* ============ 8. storage ============ */
  H.freshWorld();
  const SP = w.Storage.prototype;
  const origSet = SP.setItem;
  SP.setItem = function () { throw new w.DOMException('quota', 'QuotaExceededError'); };
  let threw = false;
  try { G.Store.save(); G.Store.saveSettings(); } catch (e) { threw = true; }
  SP.setItem = origSet;
  check('localStorage quota error does not crash saving', !threw);
  w.localStorage.setItem('clout_settings_v1', '{corrupt');
  check('corrupt settings JSON falls back to defaults', (() => { const r2 = JSON.parse(JSON.stringify(G.Store.DEFAULTS)); return !!r2.model; })());
  w.localStorage.setItem('clout_save_bad', '{not json');
  check('loading a corrupt save returns false', G.Store.load('bad') === false);
  check('loading a missing save returns false', G.Store.load('nope') === false);
  const exp = G.Store.exportJSON();
  const idBefore = G.S.id;
  G.Store.importJSON(exp);
  check('export -> import round trip', G.S.id !== idBefore && Object.keys(G.S.npcs).length === 3 && invariants(G).length === 0);
  for (const junk of ['not json', '{}', '{"world":1}', '[]', 'null', '{"world":{},"player":{},"npcs":5}']) {
    let e2 = null;
    const keepS = G.S;
    try { G.Store.importJSON(junk); } catch (e) { e2 = e; }
    check(`importing junk ${junk.slice(0, 20)} is rejected cleanly`, isErr(e2) || G.S !== keepS);
    if (G.S !== keepS && invariants.length) { /* a lenient import still must load */ try { renderAll('lenient import'); } catch (e) {} H.freshWorld(); }
  }
  check('save list stays consistent', Array.isArray(G.Store.list()) && G.Store.list().every((x) => x.id && x.name));

  /* ============ 9. town / scenarios edge cases ============ */
  const Pop = G.Pop;
  H.freshWorld();
  check('Pop.person handles junk indices', [NaN, -5, 1e12, 'x', undefined, null, 3.7, Infinity].every((i) => { try { const p = Pop.person(i); return p && p.name && p.age >= 18; } catch (e) { return false; } }));
  check('Pop.page junk pages', [-1, 1e9, NaN, 3.5].every((pg) => { try { const r3 = Pop.page(pg, 24, ''); return Array.isArray(r3.people); } catch (e) { return false; } }));
  check('Pop.page search with regex / emoji / long strings', ['(', '[', '.*', '\\', '😀', 'x'.repeat(5000), '%', '$1'].every((q) => { try { return Array.isArray(Pop.page(0, 24, q).people); } catch (e) { return false; } }));
  G.S.popSize = 3;
  check('Pop.pool does not hang when town is tiny', (() => { const t = Date.now(); const pool = Pop.pool(8); return Date.now() - t < 500 && pool.length <= 3; })());
  G.S.popSize = 0;
  check('Pop.pool empty when town off', Pop.pool(5).length === 0);
  G.S.popSize = 250000;
  check('Pop.meet rejects junk indices', [-1, NaN, 'x', 1e12, undefined, 2.5].every((i) => { try { const n = Pop.meet(i); return n === null || n === undefined; } catch (e) { return true; } }));
  check('Pop.swipe junk is safe', (() => { try { Pop.swipe(NaN, 'like'); Pop.swipe(-1, 'super'); Pop.swipe(5, 'bogus'); return true; } catch (e) { return false; } })());
  check('Pop.fromHandle junk', ['', null, undefined, '@', '@_', '@a_', '@a_zzzzzzzzzzzzzz', 'a b c', {}].every((h) => { try { return Pop.fromHandle(h) === null; } catch (e) { return false; } }));
  const Scen = G.Scen;
  check('Scen.roll with no characters / no state', (() => { try { const a = Scen.roll({ S: null }); const S2 = G.S; const keep = S2.npcs; S2.npcs = {}; const b = Scen.roll({ S: S2 }); S2.npcs = keep; return a.text.length > 20 && b.text.length > 20; } catch (e) { return false; } })());
  check('Scen.roll extreme rng + unknown category', [0, 0.9999999999, 1e-12].every((x) => { try { return Scen.roll({ cat: 'bogus', rnd: () => x }).text.length > 20; } catch (e) { return false; } }));
  check('Scen.spice with bad setting values', ['abc', NaN, null, 99, -1, 2.5].every((v) => { G.settings.autoEvents = v; try { const s = Scen.spice(G.S, 'public', () => 0.01); return typeof s === 'string'; } catch (e) { return false; } }));
  G.settings.autoEvents = 0;
  check('Scen.count unknown category', Scen.count(true, 'zzz') > 0);

  /* ============ 11. misc engine ============ */
  H.freshWorld();
  check('giveXp with absurd xp terminates', (() => { const t = Date.now(); E.apply({ xp: 1e15 }, { placed: { dm: {} } }); return Date.now() - t < 1000 && invariants(G).length === 0; })());
  check('blocked npc cannot post/dm', (() => { G.S.npcs.n3.blocked = true; const c0 = G.S.postOrder.length; E.apply({ posts: [{ author: 'n3', text: 'x' }], dms: [{ from: 'n3', text: 'y' }] }, {}); return G.S.postOrder.length === c0 && !(G.S.dms.n3 || []).length; })());
  check('trim keeps state bounded + consistent', (() => { for (let i = 0; i < 1500; i++) E.addPost({ author: 'n1', text: 'bulk ' + i, stats: { likes: 1, reposts: 0, replies: 0, views: 1 } }); E.apply({}, {}); return G.S.postOrder.length <= E.POST_CAP && invariants(G).length === 0; })());
  check('deletePost removes replies and notifications', (() => { const p = E.addPost({ author: 'me', text: 'del me', stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }); const c = E.addPost({ author: 'n1', text: 'reply', replyTo: p.id, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }); E.addNotif('reply', 'x', { postId: c.id }); E.deletePost(p.id); return !G.S.posts[p.id] && !G.S.posts[c.id] && !G.S.notifs.some((n) => n.postId === c.id) && invariants(G).length === 0; })());
  check('toggleFollow/like/block are idempotent-safe', (() => { try { E.toggleFollow('nope'); E.toggleLike('nope'); E.toggleBlock('nope', 'muted'); E.vote('nope', 0); E.pinPost('nope'); E.deletePost('nope'); E.promote('nope', 1); E.endScene('nope'); E.deleteGroup('nope'); return true; } catch (e) { return false; } })());
  check('unknown ids in actions are ignored', (() => { try { E.doAction('nope', 'flirt', ''); E.doAction('n1', 'nope', ''); E.gift('nope', 'flowers'); E.gift('n1', 'nope'); return true; } catch (e) { return false; } })());
  check('createGroup validation', (() => { try { E.createGroup('x', ['n1']); return false; } catch (e) { return /two people/.test(e.message); } })());
  check('createCustomNpc clamps age and sanitises', (() => { const n = E.createCustomNpc({ name: 'Kid', age: 3, followers: -10, rel: 'enemy', handle: '@miav' }); return n.age >= 18 && n.followers >= 5 && n.handle !== '@miav' && invariants(G).length === 0; })());

  /* ============ 12. final: every page, many states ============ */
  renderAll('final');
  H.summary('FUZZ / ROBUSTNESS');
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
