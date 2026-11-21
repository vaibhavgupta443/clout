// REAL browser (Edge, iPhone-sized): the bottom bar stays glued to the bottom of the screen while scrolling, after redraws and with the More sheet open.
// It also checks the things that make iPhone Safari wobble: no backdrop blur on the fixed bar, its own compositing layer, no ancestor that breaks "fixed".
const puppeteer = require('puppeteer-core');
const path = require('path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else fail++;
  if (!cond || process.env.VERBOSE) console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra ? ' — ' + String(extra).slice(0, 300) : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { makeServer } = require(path.join(root, 'serve.js'));
  const server = makeServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulate({ viewport: { width: 390, height: 664, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.Engine');
    await page.evaluate(() => {
      const E = G.Engine;
      E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 't' });
      for (let i = 0; i < 12; i++) E.makeNpc({ name: 'N' + i, handle: '@n' + i, age: 25, personality: 'x', followers: 1000 });
      for (let i = 0; i < 40; i++) E.addPost({ author: 'n' + ((i % 10) + 1), text: 'post number ' + i + ' lorem ipsum dolor sit amet', buzz: 3, stats: { likes: 10, reposts: 1, replies: 1, views: 100 } });
      G.UI.go('home');
    });
    await sleep(500);
    const m = () => page.evaluate(() => {
      const n = document.querySelector('#nav');
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return { pos: cs.position, gap: Math.round(window.innerHeight - r.bottom), left: Math.round(r.left), width: Math.round(r.width), vw: window.innerWidth, blur: cs.backdropFilter || cs.webkitBackdropFilter || 'none', transform: cs.transform, scrollY: Math.round(scrollY) };
    });

    const a = await m();
    check('the bar is position: fixed on a phone', a.pos === 'fixed', a.pos);
    check('it sits exactly on the bottom edge and spans the full width', a.gap === 0 && a.left === 0 && a.width === a.vw, JSON.stringify(a));
    check('no backdrop blur on the fixed bar (it makes iPhone Safari repaint late and wobble)', a.blur === 'none', a.blur);
    check('the bar has its own compositing layer (translate3d)', a.transform !== 'none', a.transform);
    for (const y of [150, 900, 2500, 8000, 99999]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await sleep(200);
      const s = await m();
      check(`scrolled to ${s.scrollY}px: the bar has not moved`, s.gap === 0, JSON.stringify(s));
    }
    await page.evaluate(() => G.UI.render());
    await sleep(150);
    check('after a redraw the bar is still at the bottom', (await m()).gap === 0);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) { G.Engine.tick(60); G.Live.beat(); } });
    await sleep(150);
    check('after world heartbeats the bar is still at the bottom', (await m()).gap === 0);

    // (the "More" sheet was replaced by a More list at the bottom of Profile; tests/minimal-ui.js checks it)

    // the phone's Back button in a real browser: closes the top layer, never leaves the app
    await page.evaluate(() => { window.scrollTo(0, 0); G.UI.go('home'); });
    await sleep(200);
    await page.evaluate(() => G.UI.openProfile('n1'));
    await sleep(200);
    check('a profile adds a history entry', await page.evaluate(() => history.length > 1 && document.body.classList.contains('modal-open')));
    await page.goBack();
    await sleep(300);
    check('Back closes the profile and stays in the app', (await page.evaluate(() => !document.body.classList.contains('modal-open'))) && page.url() === base);
    await page.evaluate(() => G.UI.go('messages'));
    await sleep(300);
    await page.evaluate(() => { G.UI.openProfile('n1'); G.UI.closeModal(); G.UI.go('explore'); });
    await sleep(600);
    check('closing a layer and opening another in one tick does not bounce you out (real browser)', await page.evaluate(() => G.UI.page === 'explore' && !document.body.classList.contains('modal-open')));
    await page.goBack();
    await sleep(300);
    check('Back from a tab goes Home, still in the app', (await page.evaluate(() => G.UI.page === 'home')) && page.url() === base);

    // @tagging on a phone: the suggestion list opens next to the box, fully on screen, and a tap picks a person
    await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); G.UI.go('home'); G.UI.acts.create(); }); // the composer is the + sheet now
    await sleep(300);
    await page.evaluate(() => { const c = document.querySelector('#composer'); c.focus(); c.value = 'hi @'; c.setSelectionRange(4, 4); c.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    const tp = await page.evaluate(() => { const p = document.querySelector('#tagpop'); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight, rows: p.querySelectorAll('.tagrow').length }; });
    check('typing @ on a phone opens the list fully on screen', !!tp && tp.l >= 0 && tp.r <= tp.vw && tp.t >= 0 && tp.b <= tp.vh && tp.rows >= 3, JSON.stringify(tp));
    await page.touchscreen.tap((tp.l + tp.r) / 2, tp.t + 25);
    await sleep(200);
    check('tapping a person inserts the tag', await page.evaluate(() => /^hi @[a-z0-9_.]+ $/.test(document.querySelector('#composer').value) && !document.querySelector('#tagpop')));

    // nothing between the bar and the document root can break position: fixed
    const bad = await page.evaluate(() => {
      const out = [];
      for (let e = document.querySelector('#nav').parentElement; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' || c.contain !== 'none' || c.willChange !== 'auto') out.push(e.tagName + '#' + e.id);
      }
      return out;
    });
    check('no ancestor has transform / filter / contain / will-change (those make "fixed" scroll with the page)', bad.length === 0, bad.join(','));
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); // (while a field is focused the bar steps aside for the keyboard)
    await page.evaluate(() => window.scrollTo({ top: 1e9, behavior: 'instant' })); // jump to the end, then let it settle
    await sleep(400);
    check('the last item is not hidden behind the bar (page has bottom padding)', await page.evaluate(() => { const l = document.querySelector('#page').lastElementChild; return !l || l.getBoundingClientRect().bottom <= document.querySelector('#nav').getBoundingClientRect().top + 1; }));
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n== MOBILE BOTTOM BAR (real Edge, iPhone size): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
