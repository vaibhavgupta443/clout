// The "free demo" start (no API key): a ready-made town built with no model call, a populated feed, and a world that ticks for free.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  let aiCalls = 0;
  const real = G.AI.json;
  G.AI.json = async (...a) => { aiCalls++; return real.apply(G.AI, a); };
  w.fetch = async (u) => { if (!String(u).includes('/api/media/')) aiCalls++; return { ok: false, status: 503, json: async () => ({}), text: async () => '' }; };

  check('the first screen offers the free demo', /Try the free demo/.test(G.Pages.wizard()) && /data-act="demoWorld"/.test(G.Pages.wizard()));
  G.UI.acts.demoWorld();
  await H.wait(200);
  const S = G.S;
  check('a demo world exists', !!S && S.world.name === 'Demo Town');
  const npcs = Object.values(S.npcs);
  check('it has 14 people', npcs.length === 14, String(npcs.length));
  check('the feed is not empty', S.postOrder.length >= 10, String(S.postOrder.length));
  check('every post has a real author', S.postOrder.every((id) => S.npcs[S.posts[id].author]));
  check('everyone is an adult', npcs.every((n) => n.age >= 18));
  check('no model call was made', aiCalls === 0, String(aiCalls));
  check('the app shows the home page', G.UI.page === 'home');

  const clock0 = S.clock;
  for (let i = 0; i < 6; i++) { G.Engine.tick(60); G.World.run(60); }
  check('the free simulation advances with no model', G.S.clock === clock0 + 360 && aiCalls === 0, 'clock ' + clock0 + ' -> ' + G.S.clock + ', calls ' + aiCalls);
  check('no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));

  H.summary('DEMO WORLD: free start with no API key');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
