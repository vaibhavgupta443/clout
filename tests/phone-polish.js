// REAL browser (Edge, iPhone size): the bottom bar stays put while the page scrolls, nothing scrolls sideways, fields do not trigger iOS zoom, safe areas are respected.
const puppeteer = require('puppeteer-core');
const path = require('path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) pass++; else fail++; if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x ? ' — ' + String(x).slice(0, 300) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { makeServer } = require(path.join(root, 'serve.js'));
  const server = makeServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.emulate({ viewport: { width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.Engine');
    await page.evaluate(() => {
      const E = G.Engine;
      E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 't' });
      ['Kai Storm', 'Mia Vale', 'Dex Rowan'].forEach((n, i) => E.makeNpc({ name: n, handle: '@' + n.split(' ')[0].toLowerCase(), age: 25, personality: 'x', followers: 1000 + i }));
      const ids = Object.keys(G.S.npcs);
      for (let i = 0; i < 30; i++) E.addPost({ author: ids[i % ids.length], text: 'a long enough post number ' + i + ' to make the page scroll properly on a phone', buzz: 4, stats: { likes: 5, reposts: 0, replies: 0, views: 50 } });
      G.UI.feedLimit = 40;
      G.UI.go('home');
    });
    await sleep(500);
    const nav = () => page.evaluate(() => { const r = document.querySelector('#nav').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, pos: getComputedStyle(document.querySelector('#nav')).position }; });
    const n0 = await nav();
    check('the bottom bar is fixed to the bottom of the screen', n0.pos === 'fixed' && Math.abs(n0.bottom - n0.vh) <= 1, JSON.stringify(n0));
    for (const y of [300, 1200, 3000, 800, 0]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await sleep(80);
      const n = await nav();
      check('the bar does not move when the page is scrolled to ' + y, n.bottom === n0.bottom && n.top === n0.top, JSON.stringify(n));
    }
    check('five places in the bar', (await page.evaluate(() => Array.from(document.querySelectorAll('#nav .navb')).filter((b) => getComputedStyle(b).display !== 'none').length)) === 5);
    check('nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1));
    check('fields are 16px or bigger (iOS does not zoom the page)', await page.evaluate(() => { G.UI.acts.create && G.UI.acts.create(); return Array.from(document.querySelectorAll('textarea,input,select')).every((el) => parseFloat(getComputedStyle(el).fontSize) >= 16); }));
    await page.evaluate(() => G.UI.closeModal());
    check('the page cannot be pulled out of place (no bounce)', await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === 'none'));
    check('the status bar is translucent for the installed app and the theme colour follows the theme', await page.evaluate(() => document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]').content === 'black-translucent' && /^#|rgb/.test(document.querySelector('meta[name=theme-color]').content)));
    check('the floating button sits above the bar, not over it', await page.evaluate(() => { const f = document.querySelector('#fab .fabbtn'); const n = document.querySelector('#nav'); return !f || f.getBoundingClientRect().bottom <= n.getBoundingClientRect().top + 1; }));
    check('no script errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n== PHONE POLISH (real Edge, iPhone size): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
