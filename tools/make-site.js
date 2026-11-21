// Builds the installable phone app (a PWA) as a plain static folder:   node tools/make-site.js   ->   site/
// Put the "site" folder on any static host (Netlify Drop, Cloudflare Pages, a private server...), send the link on WhatsApp, open it in Safari,
// Share > Add to Home Screen: it becomes a full-screen app with its own icon that also works offline. Each person's world is saved on their own phone.
// To update everybody: change the code, run this again, upload the folder again. The app checks for a new version every time it opens.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'site');

execSync('node tools/build.js', { cwd: root, stdio: 'inherit' });
const m = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'manifest.json'), 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'dist'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(out, to || from));
const copyTree = (from, to = from) => {
  const source = path.join(root, from), dest = path.join(out, to);
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst); else copy(src, dst);
  });
};
copy('dist/' + m.js);
copy('dist/' + m.css);
copyTree('vendor'); // includes lazy libraries and nested Leaflet assets, available offline after install
fs.readdirSync(path.join(root, 'icons')).forEach((f) => copy('icons/' + f));
copy('THIRD_PARTY_NOTICES.md');

// index.html: the bundle instead of 40+ scripts, relative paths (works at the root of a domain or in a sub-folder), and the service worker
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
let first = true;
html = html.replace(/<script src="js\/[a-z0-9/]+\.js"><\/script>\n?/g, () => {
  if (!first) return '';
  first = false;
  return `<script defer src="dist/${m.js}"></script>\n`; // defer: the splash in index.html paints before the bundle is parsed
});
html = html.replace('<link rel="stylesheet" href="css/style.css">', `<link rel="stylesheet" href="dist/${m.css}">`);
html = html.replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"').replace('href="/icons/apple-touch-icon.png"', 'href="icons/apple-touch-icon.png"');
const register = `<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var check = function () { try { reg.update(); } catch (e) {} };
      document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(function () {});
    var had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!had) { had = true; return; } // the very first install is not an update
      try { if (window.G && G.UI && G.UI.toast) G.UI.toast('Clout was updated. Close and reopen the app to use the new version.', 'info'); } catch (e) {}
    });
  });
}
</script>
`;
html = html.replace('</body>', register + '</body>');
fs.writeFileSync(path.join(out, 'index.html'), html);

// the web-app manifest with relative paths
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
man.start_url = './';
man.scope = './';
man.id = './';
man.icons.forEach((i) => { i.src = i.src.replace(/^\//, ''); });
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(man, null, 2));

// the service worker: the app opens instantly and works offline; a new build is picked up automatically
// every vendor .js (the lazy ones too: chrono, compromise, graphology) is precached, so the app works offline after the first visit
const walkFiles = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walkFiles(path.join(dir, e.name), prefix ? prefix + '/' + e.name : e.name) : [prefix ? prefix + '/' + e.name : e.name]);
const files = ['./', 'index.html', 'manifest.webmanifest', 'dist/' + m.js, 'dist/' + m.css]
  .concat(walkFiles(path.join(out, 'vendor'), 'vendor').filter((f) => /\.(?:js|css|png)$/.test(f)))
  .concat(fs.readdirSync(path.join(out, 'icons')).map((f) => 'icons/' + f));
const version = crypto.createHash('sha1').update(m.js + m.css + html).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(out, 'sw.js'), `// Clout service worker, build ${version}
const VERSION = 'clout-${version}';
const PRECACHE = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // AI providers and anything else on the internet are never touched
  if (u.pathname.indexOf('/api/') >= 0) return;
  const page = r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html');
  if (page) { // always try the newest page first, fall back to the saved one when offline
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(VERSION).then((x) => x.put('index.html', c)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then((x) => x.put(r, c)); } return res; })));
});
`);
fs.writeFileSync(path.join(out, '_headers'), '/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n');
fs.writeFileSync(path.join(out, 'README.txt'), 'Clout phone app (PWA). Upload this whole folder to a static host, open the link in Safari on the iPhone, Share > Add to Home Screen.\nTo update: run "node tools/make-site.js" again and upload the folder again.\n');
const size = (d) => fs.readdirSync(d).reduce((a, f) => { const p = path.join(d, f); return a + (fs.statSync(p).isDirectory() ? size(p) : fs.statSync(p).size); }, 0);
console.log(`site/ ready: ${(size(out) / 1024).toFixed(0)} KB, build ${version}`);
