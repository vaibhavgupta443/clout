// Render speed: how long the feed takes to draw on a busy world (jsdom; real browsers are several times faster).
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await H.wait(100);
  H.freshWorld(); const S = G.S; G.World.setSeed(9); S.popSize = 0;
  for (let i = 4; i < 80; i++) E.makeNpc({ name: 'P' + i + ' Q', handle: '@p' + i, age: 20 + (i % 25), personality: ['outgoing flirty', 'shy quiet', 'sarcastic', 'kind warm'][i % 4], followers: 500 + i * 40 });
  for (let h = 0; h < 24 * 10; h++) E.tick(60);
  G.UI.feedLimit = 40; G.UI.go('home');
  const time = (fn, n = 8) => { const t = Date.now(); for (let i = 0; i < n; i++) fn(); return (Date.now() - t) / n; };
  const home = time(() => G.UI.render());
  const html = w.document.querySelector('#page').innerHTML.length;
  G.UI.feedLimit = 200;
  const home200 = time(() => G.UI.render(), 4);
  G.UI.feedLimit = 40;
  G.UI.go('explore'); const ex = time(() => G.UI.render());
  G.UI.go('messages'); const ms = time(() => G.UI.render());
  console.log(`posts ${S.postOrder.length} | home(40 posts) ${home.toFixed(0)}ms (${(html / 1000).toFixed(0)} KB html) | home(200) ${home200.toFixed(0)}ms | explore ${ex.toFixed(0)}ms | messages ${ms.toFixed(0)}ms`);
  check('home feed draws in < 500 ms (jsdom; real browsers are ~30x faster, see perf-browser.js)', home < 500, home.toFixed(0) + 'ms');
  check('200 posts draw in < 3 s (jsdom)', home200 < 3000, home200.toFixed(0) + 'ms');
  check('explore draws in < 300 ms', ex < 300, ex.toFixed(0) + 'ms');
  check('world still consistent', invariants(G).length === 0);
  H.summary('RENDER SPEED');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
