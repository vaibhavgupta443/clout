// Speed in a REAL Edge: page load (cold + warm), feed redraw, a heartbeat that changes something, the simulation, image loading.
// Needs the game server running:   node serve.js   (default http://localhost:8080/)      usage: node perf-browser.js <root> [url] [shots-dir]
const puppeteer = require('puppeteer-core');
const path = require('path');
const base = process.argv[3] || 'http://localhost:8080/';
const shots = process.argv[4] || require('os').tmpdir();
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 1280, height: 900 });
  const nav = async () => { await p.goto(base, { waitUntil: 'load' }); await p.waitForSelector('#app .start'); return p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domReady: Math.round(n.domContentLoadedEventEnd), loaded: Math.round(n.loadEventEnd), kb: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) }; }); };
  const cold = await nav();
  const warm = await nav();
  const out = await p.evaluate(async () => {
    const G = window.G, E = G.Engine;
    G.settings.mediaChance = 100; G.settings.postDial = 1; // the feed needs posts to measure
    E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'perf' });
    G.World.setSeed(9); G.S.popSize = 0;
    for (let i = 0; i < 80; i++) E.makeNpc({ name: 'P' + i + ' Q', handle: '@p' + i, age: 20 + (i % 25), personality: ['outgoing flirty', 'shy quiet', 'sarcastic', 'kind warm'][i % 4], followers: 500 + i * 40 });
    for (let h = 0; h < 24 * 10; h++) E.tick(60);
    { const ppl = Object.values(G.S.npcs).filter((x) => !x.userAlt); for (let i = 0; i < 400; i++) E.addPost({ author: ppl[i % ppl.length].id, text: 'post number ' + i + ' #life', ptype: i % 4 === 0 ? 'photo' : '', attach: i % 4 === 0 ? 'a view of the city' : '', buzz: 3, t: Math.max(1, G.S.clock - (400 - i) * 20), stats: { likes: 30 + i, reposts: 1, replies: 0, views: 400 } }, G.S); }
    G.UI.feedLimit = 40; G.UI.go('home');
    const T = (fn, n = 20) => { fn(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(2); };
    const r = { posts: G.S.postOrder.length, photoPosts: G.S.postOrder.filter((id) => G.S.posts[id].img).length, libraryPhotos: G.Media.count, thumbs: G.Media.thumbs };
    r.render40_unchanged = T(() => G.UI.render());
    const shown = G.Pages.feedPosts()[0];
    r.render40_oneLikeChanged = T(() => { shown.stats.likes++; G.UI.render(); });
    G.UI.feedLimit = 200; r.render200_unchanged = T(() => G.UI.render(), 8); G.UI.feedLimit = 40;
    r.fullRebuild40 = T(() => { document.querySelector('#app').dataset.page = 'x'; G.UI.render(); }, 10);
    r.sim_1hour_80npc = T(() => E.tick(60), 20);
    return r;
  });
  await new Promise((r) => setTimeout(r, 1500));
  const imgs = await p.evaluate(() => { const l = [...document.querySelectorAll('img.lib')]; const rs = performance.getEntriesByType('resource').filter((r) => /\/thumb\//.test(r.name)); return { imgs: l.length, loaded: l.filter((i) => i.complete && i.naturalWidth > 0).length, kbTotal: Math.round(rs.reduce((a, r) => a + r.encodedBodySize, 0) / 1024), n: rs.length }; });
  await p.screenshot({ path: path.join(shots, 'perf-home.png') });
  await p.evaluate(() => { window.G.UI.go('explore'); });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: path.join(shots, 'perf-explore.png') });
  await p.setViewport({ width: 390, height: 800, isMobile: true });
  await p.evaluate(() => { window.G.UI.go('home'); window.scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: path.join(shots, 'perf-phone.png') });
  console.log('page load  cold:', JSON.stringify(cold), ' warm(cached):', JSON.stringify(warm));
  console.log(JSON.stringify(out));
  console.log('feed images:', JSON.stringify(imgs));
  console.log('page errors:', errs.length, errs.slice(0, 2).join(' | '));
  let pass = 0, fail = 0;
  const check = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('FAIL ' + n + ' — ' + x); } };
  check('cold page load < 600 ms', cold.loaded < 600, cold.loaded);
  check('warm (cached) page load < 300 ms and < 50 KB transferred', warm.loaded < 300 && warm.kb < 50, JSON.stringify(warm));
  check('redrawing an unchanged feed < 6 ms', out.render40_unchanged < 6, out.render40_unchanged);
  check('redrawing after one like changed < 25 ms (a 60 fps frame is 16 ms)', out.render40_oneLikeChanged < 25, out.render40_oneLikeChanged);
  check('redrawing 200 posts < 60 ms', out.render200_unchanged < 60, out.render200_unchanged);
  check('rebuilding a whole screen from scratch < 60 ms', out.fullRebuild40 < 60, out.fullRebuild40);
  check('one game hour for 80 people < 60 ms', out.sim_1hour_80npc < 60, out.sim_1hour_80npc);
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log('\n== REAL BROWSER SPEED: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
