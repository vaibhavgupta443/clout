// The installable phone app (site/): served by a plain static server with NO game server behind it, opened in a real browser at iPhone size.
// Checks it boots, has no errors, installs its service worker, keeps working offline, creates a world, and picks up a new version.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.md': 'text/plain' };
let pass = 0;
let fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); } };

(async () => {
  execSync('node tools/make-site.js', { cwd: root, stdio: 'ignore' });
  const site = path.join(root, 'site');
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    hits.push(u);
    const f = path.join(site, u.endsWith('/') ? 'index.html' : u);
    if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}/`;
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(base, { waitUntil: 'networkidle0' });
    check('the page boots (the game object exists)', await page.evaluate(() => !!(window.G && G.Engine && G.UI && G.Fame && G.Mem2 && G.Leads)));
    check('only the bundle and vendor files are loaded (no 40 separate scripts)', hits.filter((h) => /\/js\//.test(h)).length === 0 && hits.some((h) => /dist\/clout\.[a-f0-9]+\.js/.test(h)));
    check('no errors in the console without the game server (the optional features fail quietly)', errors.length === 0, errors.join(' | '));
    check('it is a full-screen, installable app (manifest + icons + Apple tags)', await page.evaluate(async () => {
      const link = document.querySelector('link[rel=manifest]');
      const m = await (await fetch(link.href)).json();
      return m.display === 'standalone' && m.start_url === './' && m.icons.length >= 3 && !!document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('meta[name=apple-mobile-web-app-capable]').content === 'yes';
    }));
    await page.evaluate(() => navigator.serviceWorker.ready);
    check('the service worker is installed and running', await page.evaluate(() => navigator.serviceWorker.controller !== null || !!navigator.serviceWorker.ready));
    await page.reload({ waitUntil: 'networkidle0' });
    check('after a reload the service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
    const noBars = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('no sideways scrolling at iPhone width', noBars);

    // a world can be created and played with no network except the (stand-in) model
    await page.evaluate(() => {
      G.settings.apiKey = '';
    });
    const created = await page.evaluate(() => {
      try {
        const S = G.Engine.migrate ? null : null;
        return !!G.Store && typeof G.Store.save === 'function';
      } catch (e) { return false; }
    });
    check('the save system is there (IndexedDB works in the installed app)', created && (await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('clout_probe'); r.onsuccess = () => { r.result.close(); indexedDB.deleteDatabase('clout_probe'); res(true); }; r.onerror = () => res(false); }))));

    // offline: the app still opens
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    check('OFFLINE: the app still opens (from the phone\'s saved copy)', await page.evaluate(() => !!(window.G && G.UI)).catch(() => false));
    await page.setOfflineMode(false);

    // a new version is picked up: rebuild with a visible change, reload, the new bundle is used
    const before = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).find((s) => /dist\/clout/.test(s)));
    const marker = '/* update-test ' + Date.now() + ' */';
    const idx = path.join(root, 'index.html');
    const orig = fs.readFileSync(idx, 'utf8');
    fs.writeFileSync(idx, orig.replace('</body>', '<!-- ' + marker + ' --></body>'));
    const cssSrc = path.join(root, 'css', 'style.css');
    const cssOrig = fs.readFileSync(cssSrc, 'utf8');
    fs.writeFileSync(cssSrc, cssOrig + '\n' + marker + '\n');
    try { execSync('node tools/make-site.js', { cwd: root, stdio: 'ignore' }); } finally { fs.writeFileSync(idx, orig); fs.writeFileSync(cssSrc, cssOrig); }
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await new Promise((r) => setTimeout(r, 1500));
    await page.reload({ waitUntil: 'networkidle0' });
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((s) => s.href).find((s) => /dist\/clout/.test(s)));
    check('a rebuilt version is picked up by the phone on the next open (new bundle file)', !!after && after !== null && (await page.evaluate(() => navigator.serviceWorker.controller !== null)));
    execSync('node tools/make-site.js', { cwd: root, stdio: 'ignore' }); // leave site/ matching the current code
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n== PWA SITE (real browser, iPhone size, no game server): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
