// Hybrid retrieval: keyword (BM25) + free local vectors + optional real embeddings, merged by Reciprocal Rank Fusion.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  const R = G.Rag;

  /* ---------- local vectors ---------- */
  const cos = (a, b) => R.cos(R.vec(a), R.vec(b));
  check('spelling and word-ending variants are close, unrelated text is not', cos('she confessed everything at the lighthouse', 'her confession about the lighthouse') > cos('she confessed everything at the lighthouse', 'pizza for dinner tonight with friends') + 0.1, cos('she confessed everything at the lighthouse', 'her confession about the lighthouse').toFixed(2));
  check('a vector is 512 numbers at most and unit length', (() => { const v = R.vec('hello there general kenobi'); let n = 0; v.forEach((x) => (n += x * x)); return v.size <= 512 && Math.abs(Math.sqrt(n) - 1) < 1e-6; })());
  check('an empty text does not break anything', R.cos(R.vec(''), R.vec('hello world')) === 0);

  S.lore.push({ id: 'l1', keys: [], content: 'Mia grew up near the old lighthouse and fears the open sea.', constant: false });
  S.lore.push({ id: 'l2', keys: [], content: 'Kai bought a red guitar at the market on Saturday morning.', constant: false });
  S.lore.push({ id: 'l3', keys: [], content: 'Dex runs the night shift at the harbor cafe and hates mornings.', constant: false });
  const keywordOnly = R.retrieve('lighthose', { k: 3 }); // misspelt: no keyword matches at all
  check('a typo ("lighthose") still finds the lighthouse (the vector side catches what keywords miss)', keywordOnly.some((d) => /lighthouse/.test(d.text)) && /lighthouse/.test(keywordOnly[0].text), keywordOnly.map((d) => d.text.slice(0, 30)).join(' | '));
  check('a normal question still ranks the right text first (keywords + vectors agree)', /red guitar/.test(R.retrieve('where did Kai buy the guitar?', { k: 3 })[0].text));
  check('the fused score is a rank merge (Reciprocal Rank Fusion), not a sum of raw scores', (() => { const docs = [{ text: 'alpha beta gamma' }, { text: 'delta epsilon zeta' }]; const out = R.fuse(docs, [5, 0], 'alpha beta'); return out[0] > 0 && out[0] <= 1.8 / 61 + 1e-9 && out[1] === 0; })());
  check('recall for one character uses the same fusion (typo in the question still finds the memory)', (() => { const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale'); G.Mem.add(mia, { kind: 'event', text: 'Sam promised to meet me at the lighthouse at midnight', who: ['me'], imp: 6 }); return R.recall(mia, 'that midnight promise at the lighthose?', 3).some((t) => /lighthouse/.test(t)); })());

  /* ---------- real embeddings (optional) ---------- */
  check('without an embedding model the API side is off', R.apiOn() === false && typeof R.prepare('anything').then === 'function');
  await R.prepare('anything');
  const CONCEPTS = [['car', 'automobile', 'vehicle', 'truck'], ['food', 'dinner', 'pizza'], ['sea', 'ocean', 'harbor']];
  const embed = (t) => { const words = String(t).toLowerCase().match(/[a-z]+/g) || []; return CONCEPTS.map((c) => c.filter((k) => words.includes(k)).length); }; // whole words only: "care" is not "car"
  const calls = [];
  const f0 = w.fetch;
  w.fetch = async (url, o) => {
    if (String(url).includes('/embeddings')) {
      const body = JSON.parse(o.body);
      calls.push({ url: String(url), model: body.model, n: body.input.length, auth: (o.headers || {}).Authorization });
      return { ok: true, status: 200, json: async () => ({ data: body.input.map((t) => ({ embedding: embed(t) })) }) };
    }
    return f0(url, o);
  };
  S.lore.push({ id: 'l4', keys: [], content: 'The car broke down outside the harbor last night and nobody could fix it.', constant: false });
  S.lore.push({ id: 'l5', keys: [], content: 'Everyone ate pizza at the party and it was great.', constant: false });
  const q = 'my automobile has a problem';
  const before = R.retrieve(q, { k: 3 });
  check('before embeddings: "automobile" shares no word with "car", so the car text is not found by meaning', !(before.length && /car broke down/.test(before[0].text)));
  G.settings.embedModel = 'fake/embed-small';
  G.settings.apiKey = 'sk-test';
  G.settings.useLocal = false;
  check('with a model set the API side turns on', R.apiOn() === true);
  const ok = await R.prepare(q);
  check('prepare() embeds the question and the newest texts in one call, with your key, to the embeddings endpoint', ok === true && calls.length === 1 && /embeddings$/.test(calls[0].url) && calls[0].model === 'fake/embed-small' && calls[0].n > 3 && /Bearer sk-test/.test(calls[0].auth || ''), JSON.stringify(calls[0]));
  const after = R.retrieve(q, { k: 3 });
  check('after embeddings: the car text is found by MEANING and ranks first', /car broke down/.test(after[0].text), after.map((d) => d.text.slice(0, 25)).join(' | '));
  await R.prepare(q);
  check('everything already embedded is cached (no second call)', calls.length === 1);
  w.fetch = async (url, o) => (String(url).includes('/embeddings') ? { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) } : f0(url, o));
  R.apiVecs.clear();
  const bad = await R.prepare('another question about cars');
  check('an embeddings failure never breaks retrieval: it falls back to keywords + local vectors', bad === false && /boom/.test(R.apiErr) && R.retrieve('lighthouse', { k: 2 }).some((d) => /lighthouse/.test(d.text)));
  w.fetch = f0;
  G.settings.embedModel = '';

  /* ---------- the Director uses it ---------- */
  const prompts = [];
  G.AI.ready = () => true;
  G.AI.json = async (o) => { prompts.push(o.user); return { cost: 0, data: { answer: 'ok', suggestions: [] } }; };
  G.settings.approveActions = false;
  await E.Story.ask('who fears the sea and why?');
  check('the Director prompt carries the retrieved lighthouse text', /RELEVANT MEMORY/.test(prompts[0]) && /lighthouse/.test(prompts[0]));

  H.summary('VECTORS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
