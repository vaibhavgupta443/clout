// Server speed features over real HTTP: thumbnails (sharp) + disk cache + ETag, safety of the thumb route, and the minified bundle.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const root = process.argv[2] || path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass++; else fail++; if (!cond || process.env.VERBOSE) console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra ? ' — ' + String(extra).slice(0, 300) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let sharp;
  try { sharp = require(path.join(root, 'node_modules', 'sharp')); } catch (e) { console.log('sharp is not installed (npm install in the clout folder): thumbnail tests skipped'); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clout-speed-'));
  const mk = (rel, data) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
  const noisy = async (w, h, extra = {}) => { const raw = Buffer.alloc(w * h * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7 + ((i / 3 / w) | 0) * 3) & 255; return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).withMetadata(extra).toBuffer(); };

  process.env.CLOUT_MEDIA = tmp;
  delete require.cache[require.resolve(path.join(root, 'serve.js'))];
  if (sharp) {
    mk('clean/food/big.jpg', await noisy(2400, 1600));
    mk('clean/food/tall.jpg', await noisy(800, 1800));
    mk('clean/food/rot.jpg', await noisy(1600, 800, { orientation: 6 }));
    mk('clean/food/anim.gif', Buffer.from('R0lGODlhAQABAAAAACw=', 'base64'));
    mk('clean/food/broken.jpg', Buffer.from('this is not really a jpeg at all'));
    mk('clean/food/tiny.png', await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f80' } }).png().toBuffer());
  }
  const { server } = require(path.join(root, 'serve.js'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p, headers = {}, method = 'GET') => new Promise((resolve) => { const rq = http.request(base + p, { method, headers }, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); }); rq.on('error', () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0) })); rq.end(); });

  if (sharp) {
    const idx = JSON.parse((await get('/api/media/index')).body.toString());
    check('the index tells the app that thumbnails are available', idx.thumbs === true);

    const orig = await get('/media/clean/food/big.jpg');
    const t720 = await get('/thumb/720/clean/food/big.jpg');
    const m720 = await sharp(t720.body).metadata();
    check('720 thumbnail: 200, WebP, width 720, far smaller than the original', t720.status === 200 && t720.headers['content-type'] === 'image/webp' && m720.width === 720 && t720.body.length < orig.body.length / 3, `${t720.body.length} vs ${orig.body.length}`);
    const t360 = await get('/thumb/360/clean/food/big.jpg');
    check('360 thumbnail is smaller still', t360.body.length < t720.body.length && (await sharp(t360.body).metadata()).width === 360);
    check('1080 and 160 widths work too', (await sharp((await get('/thumb/1080/clean/food/big.jpg')).body).metadata()).width === 1080 && (await sharp((await get('/thumb/160/clean/food/big.jpg')).body).metadata()).width === 160);
    check('aspect ratio is preserved', (await sharp((await get('/thumb/720/clean/food/tall.jpg')).body).metadata()).height === Math.round(720 * 1800 / 800));
    const rot = await sharp((await get('/thumb/720/clean/food/rot.jpg')).body).metadata();
    check('EXIF rotation is applied (phone photos are not sideways)', rot.height > rot.width, `${rot.width}x${rot.height}`);
    check('small images are never enlarged', (await sharp((await get('/thumb/720/clean/food/tiny.png')).body).metadata()).width === 40);
    check('thumbnails are cached on disk', fs.readdirSync(path.join(root, '.cache', 'thumbs')).some((f) => f.endsWith('.webp')));
    const a = Date.now(); const again = await get('/thumb/720/clean/food/big.jpg'); const warm = Date.now() - a;
    check('second request returns identical bytes, fast', Buffer.compare(again.body, t720.body) === 0 && warm < 400, warm + 'ms');
    check('long browser caching headers', /max-age=86400/.test(t720.headers['cache-control']) && !!t720.headers.etag);
    const nm = await get('/thumb/720/clean/food/big.jpg', { 'if-none-match': t720.headers.etag });
    check('conditional request -> 304 with no body', nm.status === 304 && nm.body.length === 0);
    check('HEAD works', (await get('/thumb/720/clean/food/big.jpg', {}, 'HEAD')).status === 200);
    check('a width that is not allowed serves the original (no arbitrary resizing)', (await get('/thumb/500/clean/food/big.jpg')).headers['content-type'] === 'image/jpeg');
    check('huge widths are not routed at all', (await get('/thumb/99999/clean/food/big.jpg')).status === 404);
    check('animated GIFs are served as they are', (await get('/thumb/720/clean/food/anim.gif')).headers['content-type'] === 'image/gif');
    const br = await get('/thumb/720/clean/food/broken.jpg');
    check('a corrupt image falls back to the original bytes (no crash, no 500)', br.status === 200 && br.body.toString().startsWith('this is not'));
    check('server still alive after the corrupt file', (await get('/api/media/index')).status === 200);

    // safety: the same rules as /media
    const bad = async (p) => { const r = await get(p); return r.status === 404 || r.status === 400 || r.status === 0; };
    check('thumb route: traversal, hidden files, non-images, missing files are all refused', (await Promise.all(['/thumb/720/../serve.js', '/thumb/720/%2e%2e/serve.js', '/thumb/720/clean/..%2f..%2fserve.js', '/thumb/720/.env', '/thumb/720/clean/food/../../../package.json', '/thumb/720/nope.jpg', '/thumb/720/clean/food/', '/thumb/720//etc/passwd', '/thumb/720/clean/food/big.jpg%00.js'].map(bad))).every(Boolean));
    check('POST / PUT / DELETE on thumbs are refused', (await get('/thumb/720/clean/food/big.jpg', {}, 'POST')).status === 405 && (await get('/thumb/720/clean/food/big.jpg', {}, 'DELETE')).status === 405);

    // load: many different thumbnails at once, bounded work
    for (let i = 0; i < 24; i++) mk(`clean/city/c${i}.jpg`, await noisy(1600 + i, 1000));
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: 24 }, (_, i) => get(`/thumb/720/clean/city/c${i}.jpg`)));
    const ms = Date.now() - t0;
    check(`24 different 1.6-megapixel photos thumbnailed concurrently: all OK in ${ms} ms`, rs.every((r) => r.status === 200 && r.headers['content-type'] === 'image/webp') && ms < 20000, String(ms));
    const t1 = Date.now();
    await Promise.all(Array.from({ length: 24 }, (_, i) => get(`/thumb/720/clean/city/c${i}.jpg`)));
    check('and the same 24 again (cached) are much faster', Date.now() - t1 < ms / 2 + 100, Date.now() - t1 + 'ms');
    const hammer = await Promise.all(Array.from({ length: 150 }, () => get('/thumb/720/clean/food/big.jpg')));
    check('150 simultaneous requests for one photo: all served', hammer.every((r) => r.status === 200 && r.body.length === t720.body.length));
  }

  /* ---- the minified bundle ---- */
  try { execFileSync(process.execPath, [path.join(root, 'tools', 'build.js')], { stdio: 'ignore' }); } catch (e) {} // make sure the build is current
  await sleep(2200); // the server re-checks the build every 2 s
  const html = (await get('/')).body.toString();
  const dist = path.join(root, 'dist');
  const have = fs.existsSync(path.join(dist, 'manifest.json'));
  if (!have) console.log('no dist/ build found (node tools/build.js): bundle tests skipped');
  else {
    const man = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
    check('index.html uses ONE bundled script + the bundled stylesheet when the build is current', (html.match(/<script src="\/dist\/clout\.[a-f0-9]{10}\.js"><\/script>/g) || []).length === 1 && !/src="js\//.test(html) && /href="\/dist\/clout\.[a-f0-9]{10}\.css"/.test(html), html.slice(0, 200));
    check('vendor libraries are still loaded before the bundle', html.indexOf('vendor/vader.js') < html.indexOf('src="/dist/clout.') && /vendor\/morphdom\.js/.test(html));
    const js = await get('/dist/' + man.js);
    check('the bundle is served with far-future immutable caching', js.status === 200 && /immutable/.test(js.headers['cache-control']) && /javascript/.test(js.headers['content-type']));
    check('the bundle is smaller than the sources', js.body.length < man.scripts.reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0) * 0.8, String(js.body.length));
    check('dist: unknown names and traversal are refused', (await get('/dist/manifest.json')).status === 404 && (await get('/dist/../serve.js')).status === 404 && (await get('/dist/clout.0000000000.js')).status === 404);
    // the bundle really is the whole app: load it in jsdom after the vendor files
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, ''), { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.scrollTo = () => {}; w.fetch = async () => ({ ok: true, json: async () => ({ exists: false, items: [] }) });
    ['vader', 'morphdom', 'graphology.umd.min', 'graphology-library.min'].forEach((f) => w.eval(fs.readFileSync(path.join(root, 'vendor', f + '.js'), 'utf8')));
    let threw = null;
    try { w.eval(js.body.toString()); } catch (e) { threw = e; }
    check('the bundle evaluates without errors and defines the whole app', !threw && ['UI', 'World', 'Media', 'Bank', 'Voice', 'Persona', 'Engine', 'Store', 'AI'].every((k) => w.G && w.G[k]), threw && threw.message);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await sleep(250);
    check('...and renders the start screen', !!w.document.querySelector('#app .start'));
    // stale build -> plain files (so edits show up immediately while developing)
    const css = path.join(root, 'css', 'style.css');
    const old = fs.statSync(css);
    fs.utimesSync(css, new Date(), new Date(Date.now() + 5000));
    await sleep(2300);
    const stale = (await get('/')).body.toString();
    check('when a source file is newer than the build, the plain files are served instead', /src="js\/util\.js"/.test(stale) && !/\/dist\/clout/.test(stale));
    fs.utimesSync(css, old.atime, old.mtime);
    await sleep(2300);
    check('restoring the timestamp brings the bundle back', /\/dist\/clout\./.test((await get('/')).body.toString()));
  }
  check('app files get ETags and answer 304', await (async () => { const r = await get('/js/util.js'); const n = await get('/js/util.js', { 'if-none-match': r.headers.etag }); return !!r.headers.etag && n.status === 304; })());
  check('the whitelist still blocks everything else', (await Promise.all(['/serve.js', '/package.json', '/node_modules/sharp/package.json', '/tools/build.js', '/.cache/thumbs/x.webp', '/.env', '/tests/harness.js'].map(async (p) => { const r = await get(p); return r.status === 404; }))).every(Boolean));
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n== SERVER SPEED (thumbnails + bundle): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
