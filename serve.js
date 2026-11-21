// Tiny static server for Clout. Serves ONLY the app files (never .env, saves, or anything else), plus — read-only —
// the images you put in the media/ folder (your own local photo library).
//   node serve.js [port]                  this computer only (http://localhost:8080)
//   node serve.js [port] --lan [--pin N]  PHONE MODE: also reachable from your iPhone / other devices on your home Wi-Fi,
//                                         locked behind a PIN, and refused to anything outside your home network.
// Media folder: ./media (or set CLOUT_MEDIA=C:\path\to\folder)
// Speed: photos are resized on the fly to small WebP thumbnails (sharp, cached in .cache/), and a minified bundle
// (node tools/build.js) is used automatically when it is newer than the sources. Both are optional.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const root = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const ALLOWED = /^\/(index\.html|js\/[a-z0-9\-]+\.js|js\/global\/limits\.js|css\/style\.css|vendor\/[a-z0-9.\-]+\.js|vendor\/leaflet\/leaflet\.(?:js|css)|vendor\/leaflet\/images\/(?:layers(?:-2x)?|marker-icon(?:-2x)?|marker-shadow)\.png)$/;
const PUBLIC_ASSET = /^\/(manifest\.webmanifest|icons\/[a-z0-9\-]+\.png)$/; // harmless, and iOS fetches them without your login cookie
const DIST_FILE = /^\/dist\/clout\.[a-f0-9]{10}\.(js|css)$/;

let sharp = null;
try {
  sharp = require('sharp');
  sharp.cache({ files: 0, memory: 128 });
  sharp.concurrency(2);
} catch (e) {}

/* ---------- local media library ---------- */

const MEDIA_DIR = path.resolve(process.env.CLOUT_MEDIA || path.join(root, 'media'));
const IMG = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
const MAX_ITEMS = 250000;
const MAX_DEPTH = 8;
const THUMB_WIDTHS = new Set([160, 360, 720, 1080]);
const CACHE_DIR = path.join(root, '.cache', 'thumbs');
let mediaReal = null;
try {
  mediaReal = fs.realpathSync(MEDIA_DIR);
} catch (e) {}
let cache = { at: 0, body: null, gz: null, etag: '' };

// walks the folder: [relative path, optional extra tags from a folder's tags.json]
function scanMedia() {
  const items = [];
  const walk = (dir, rel, depth, inherited) => {
    if (depth > MAX_DEPTH || items.length >= MAX_ITEMS) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    let tagFile = {};
    const tf = entries.find((e) => e.isFile() && e.name.toLowerCase() === 'tags.json');
    if (tf) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, tf.name), 'utf8'));
        if (j && typeof j === 'object') tagFile = j;
      } catch (e) {}
    }
    const folderTags = [].concat(inherited, Array.isArray(tagFile._all) ? tagFile._all.filter((t) => typeof t === 'string').slice(0, 20) : []);
    for (const e of entries) {
      if (e.name.startsWith('.') || items.length >= MAX_ITEMS) continue;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue; // never follow links out of the folder
      if (e.isDirectory()) walk(full, rel ? rel + '/' + e.name : e.name, depth + 1, folderTags);
      else if (e.isFile() && IMG[path.extname(e.name).toLowerCase()]) {
        const own = Array.isArray(tagFile[e.name]) ? tagFile[e.name].filter((t) => typeof t === 'string').slice(0, 20) : [];
        const extra = folderTags.concat(own);
        items.push(extra.length ? [rel ? rel + '/' + e.name : e.name, extra] : [rel ? rel + '/' + e.name : e.name]);
      }
    }
  };
  if (mediaReal) walk(mediaReal, '', 0, []);
  return { exists: !!mediaReal, dir: path.basename(MEDIA_DIR), count: items.length, capped: items.length >= MAX_ITEMS, thumbs: !!sharp, items, at: Date.now() };
}

// The index can hold 100,000+ photos (megabytes of JSON), so it is gzipped once and revalidated with an ETag:
// a reload with nothing new costs a ~200-byte "304 Not Modified".
function serveMediaIndex(req, res) {
  if (Date.now() - cache.at > 20000 || !cache.body || req.url.includes('refresh=1')) {
    const body = JSON.stringify(scanMedia());
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"';
    cache = etag === cache.etag ? Object.assign(cache, { at: Date.now() }) : { at: Date.now(), body, etag, gz: zlib.gzipSync(body, { level: 6 }) };
  }
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-cache', etag: cache.etag, vary: 'Accept-Encoding', 'x-content-type-options': 'nosniff' };
  if (req.headers['if-none-match'] === cache.etag) {
    res.writeHead(304, head);
    return res.end();
  }
  if (/gzip/i.test(String(req.headers['accept-encoding'] || ''))) {
    res.writeHead(200, Object.assign({ 'content-encoding': 'gzip', 'content-length': cache.gz.length }, head));
    return res.end(cache.gz);
  }
  res.writeHead(200, head);
  res.end(cache.body);
}

const notFound = (res) => {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
};

// one place decides whether a requested media path is allowed: inside the folder, an image, not hidden, no links out
function resolveMedia(rel) {
  if (!mediaReal || typeof rel !== 'string' || rel.includes('..') || rel.includes('\\') || rel.includes('\0') || rel.startsWith('/')) return null;
  if (rel.split('/').some((seg) => seg === '' || seg.startsWith('.'))) return null; // no hidden files/folders, no empty segments
  const ext = path.extname(rel).toLowerCase();
  if (!IMG[ext]) return null;
  let real;
  try {
    real = fs.realpathSync(path.join(mediaReal, rel));
  } catch (e) {
    return null;
  }
  if (!real.startsWith(mediaReal + path.sep)) return null; // a symlink that points outside is refused
  let st;
  try {
    st = fs.statSync(real);
  } catch (e) {
    return null;
  }
  return st.isFile() ? { real, st, ext } : null;
}

// profile photos: the "faces" folder (separate from the media library, which has its own rules). Images only, nothing hidden, nothing outside, _review stays private.
const FACES_DIR = process.env.CLOUT_FACES || path.join(__dirname, 'faces');
const facesBase = () => {
  try {
    return fs.realpathSync(FACES_DIR);
  } catch (e) {
    return null;
  }
};
function resolveFace(rel) {
  const base = facesBase();
  if (!base || typeof rel !== 'string' || rel.includes('..') || rel.includes('\\') || rel.includes('\0') || rel.startsWith('/')) return null;
  if (rel.split('/').some((seg) => seg === '' || seg.startsWith('.') || seg.startsWith('_'))) return null;
  const ext = path.extname(rel).toLowerCase();
  if (!IMG[ext]) return null;
  let real;
  try {
    real = fs.realpathSync(path.join(base, rel));
  } catch (e) {
    return null;
  }
  if (!real.startsWith(base + path.sep)) return null;
  let st;
  try {
    st = fs.statSync(real);
  } catch (e) {
    return null;
  }
  return st.isFile() ? { real, st, ext } : null;
}
function serveFaceIndex(req, res) {
  const base = facesBase();
  const files = [];
  const walk = (dir, rel, depth) => {
    if (depth > 3 || files.length >= 3000) return;
    let es;
    try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    es.forEach((e) => {
      if (e.name.startsWith('.') || e.name.startsWith('_')) return;
      const r2 = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r2, depth + 1);
      else if (IMG[path.extname(e.name).toLowerCase()] && files.length < 3000) files.push({ f: r2, g: /^women\//i.test(r2) ? 'f' : /^men\//i.test(r2) ? 'm' : 'any' });
    });
  };
  if (base) walk(base, '', 0);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ files }));
}
function serveFaceFile(rel, req, res) {
  let r = null;
  try { r = resolveFace(decodeURIComponent(rel)); } catch (e) {}
  if (!r) return notFound(res);
  sendFile(r.real, r.st.size, IMG[r.ext], req, res, { 'cache-control': 'public, max-age=3600' });
}

// text assets (the app bundle, styles, vendor scripts) are sent brotli / gzip compressed when the browser accepts it: ~4x smaller on Wi-Fi.
// Compressed once per file version and kept in memory (images are already compressed and are never touched).
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg)/;
const zcache = new Map();
function pickEncoding(req) {
  const a = String(req.headers['accept-encoding'] || '');
  return /\bbr\b/.test(a) ? 'br' : /\bgzip\b/.test(a) ? 'gzip' : '';
}
function compressed(file, enc) {
  let st;
  try {
    st = fs.statSync(file);
  } catch (e) {
    return null;
  }
  const key = file + '|' + enc + '|' + st.size + '|' + Math.round(st.mtimeMs);
  let buf = zcache.get(key);
  if (!buf) {
    const raw = fs.readFileSync(file);
    buf = enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : zlib.gzipSync(raw, { level: 6 });
    zcache.set(key, buf);
    if (zcache.size > 40) zcache.delete(zcache.keys().next().value);
  }
  return buf;
}
function sendFile(file, size, type, req, res, extra) {
  const enc = size > 1024 && COMPRESSIBLE.test(type) ? pickEncoding(req) : '';
  const buf = enc ? compressed(file, enc) : null;
  if (buf) {
    res.writeHead(200, Object.assign({ 'content-type': type, 'content-length': buf.length, 'content-encoding': enc, vary: 'Accept-Encoding', 'x-content-type-options': 'nosniff' }, extra));
    return req.method === 'HEAD' ? res.end() : res.end(buf);
  }
  res.writeHead(200, Object.assign({ 'content-type': type, 'content-length': size, 'x-content-type-options': 'nosniff', vary: 'Accept-Encoding' }, extra));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function serveMediaFile(rel, req, res) {
  const r = resolveMedia(rel);
  if (!r) return notFound(res);
  sendFile(r.real, r.st.size, IMG[r.ext], req, res, { 'cache-control': 'public, max-age=3600' });
}

// small WebP thumbnails, generated once and kept in .cache/ (a 6 MB photo becomes ~40 KB)
const waiters = [];
let busy = 0;
const slot = () => new Promise((resolve) => (busy < 3 ? (busy++, resolve()) : waiters.push(resolve)));
const release = () => {
  const next = waiters.shift();
  if (next) next();
  else busy--;
};
async function makeThumb(r, w, file) {
  await slot();
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    await sharp(r.real, { failOn: 'none', limitInputPixels: 268402689 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 76, effort: 3 }).toFile(tmp);
    fs.renameSync(tmp, file);
  } finally {
    release();
  }
}
async function serveThumb(w, rel, req, res) {
  const r = resolveMedia(rel);
  if (!r) return notFound(res);
  if (!sharp || !THUMB_WIDTHS.has(w) || r.ext === '.gif') return sendFile(r.real, r.st.size, IMG[r.ext], req, res, { 'cache-control': 'public, max-age=3600' });
  const key = crypto.createHash('sha1').update(rel + '|' + r.st.mtimeMs + '|' + r.st.size + '|' + w).digest('hex').slice(0, 24);
  const file = path.join(CACHE_DIR, key + '.webp');
  const etag = '"' + key + '"';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'public, max-age=86400' });
    return res.end();
  }
  try {
    if (!fs.existsSync(file)) await makeThumb(r, w, file);
    const st = fs.statSync(file);
    sendFile(file, st.size, 'image/webp', req, res, { etag, 'cache-control': 'public, max-age=86400' });
  } catch (e) {
    sendFile(r.real, r.st.size, IMG[r.ext], req, res, { 'cache-control': 'public, max-age=300' }); // could not resize: send the original
  }
}

/* ---------- app files (with the optional minified bundle) ---------- */

let bundle = { at: 0, ok: null };
function bundleInfo() {
  if (Date.now() - bundle.at < 2000) return bundle.ok;
  bundle.at = Date.now();
  bundle.ok = null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'manifest.json'), 'utf8'));
    const newest = Math.max(...m.scripts.concat(['css/style.css', 'index.html']).map((f) => fs.statSync(path.join(root, f)).mtimeMs));
    if (newest <= m.stamp && fs.existsSync(path.join(root, 'dist', m.js)) && fs.existsSync(path.join(root, 'dist', m.css))) bundle.ok = m; // up to date
  } catch (e) {}
  return bundle.ok;
}
function indexHtml() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = bundleInfo();
  if (!m) return html;
  let first = true;
  html = html.replace(/<script src="js\/[a-z0-9\/]+\.js"><\/script>\n?/g, () => {
    if (!first) return '';
    first = false;
    return `<script src="/dist/${m.js}"></script>\n`;
  });
  return html.replace(/<link rel="stylesheet" href="css\/style\.css">/, `<link rel="stylesheet" href="/dist/${m.css}">`);
}

/* ---------- phone mode: PIN + home network only ---------- */

// 127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x, ::1, fe80::, fc00::/7 — i.e. this computer or your home/office network
function isPrivateIp(addr) {
  let a = String(addr || '').toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(a) || /^fe80:/.test(a)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (!m) return false;
  const [o1, o2] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((x) => Number(x) > 255)) return false;
  return o1 === 127 || o1 === 10 || (o1 === 192 && o2 === 168) || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 169 && o2 === 254);
}
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((l) => (l || []).forEach((a) => a.family === 'IPv4' && !a.internal && isPrivateIp(a.address) && out.push(a.address)));
  return out;
}
function lanState(pinArg, stateFile) {
  const file = stateFile || path.join(root, '.cache', 'lan.json');
  let st = null;
  try {
    st = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  if (!st || !st.secret) st = { secret: crypto.randomBytes(32).toString('hex'), pin: String(crypto.randomInt(0, 1000000)).padStart(6, '0') };
  if (pinArg) st.pin = String(pinArg).replace(/\D/g, '').slice(0, 12) || st.pin;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(st));
  } catch (e) {}
  return st;
}
const LOGIN_PAGE = (msg) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><title>Clout</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;color:#262626;font:16px -apple-system,Segoe UI,Roboto,sans-serif}form{width:min(340px,88vw);text-align:center}h1{font-size:34px;margin:0 0 6px;background:linear-gradient(45deg,#f09433,#dc2743,#bc1888);-webkit-background-clip:text;background-clip:text;color:transparent}p{color:#737373;margin:6px 0 18px}input{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.35em;text-align:center;padding:14px;border:1px solid #dbdbdb;border-radius:14px;background:#fff}button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#0095f6;color:#fff;font-size:17px;font-weight:700}.e{color:#ed4956;margin-top:12px;min-height:20px}@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f5}input{background:#121212;color:#fff;border-color:#363636}}</style></head>
<body><form method="POST" action="/login"><h1>Clout</h1><p>Enter the PIN shown on your computer</p><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus maxlength="12" aria-label="PIN"><button>Unlock</button><div class="e">${msg || ''}</div></form></body></html>`;

function makeServer(opts = {}) {
  const lan = opts.lan ? lanState(opts.pin, opts.stateFile) : null;
  const token = lan ? crypto.createHmac('sha256', lan.secret).update('clout-lan|' + lan.pin).digest('hex') : null;
  const tries = new Map(); // ip -> { n, until }
  const cookieOf = (req) => {
    const m = /(?:^|;\s*)clout_auth=([a-f0-9]{64})(?=;|\s*$)/.exec(req.headers.cookie || ''); // exactly 64 hex characters, nothing after
    return m ? m[1] : '';
  };
  const authed = (req) => {
    const c = cookieOf(req);
    return c.length === 64 && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(token));
  };
  const deny = (res, code, body, extra) => {
    res.writeHead(code, Object.assign({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, extra));
    res.end(body);
  };

  const handler = (req, res) => {
    const remote = req.socket.remoteAddress;
    if (lan) {
      if (!(opts.allowAnyIp || isPrivateIp(remote))) return deny(res, 403, 'forbidden'); // never answer anyone outside your home network
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-frame-options', 'DENY');
    }
    let p;
    try {
      p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    } catch (e) {
      res.writeHead(400);
      return res.end('bad request');
    }

    if (lan && p === '/login') {
      if (req.method === 'GET' || req.method === 'HEAD') return deny(res, 200, LOGIN_PAGE(''));
      if (req.method !== 'POST') return deny(res, 405, 'method not allowed', { allow: 'GET, POST' });
      const rec = tries.get(remote) || { n: 0, until: 0 };
      if (rec.until > Date.now()) return deny(res, 429, LOGIN_PAGE('Too many tries. Wait a few minutes.'), { 'retry-after': '600' });
      let body = '';
      req.on('data', (c) => { if (body.length < 2000) body += c; });
      req.on('end', () => {
        const pin = new URLSearchParams(body).get('pin') || '';
        const a = crypto.createHash('sha256').update(pin).digest();
        const b = crypto.createHash('sha256').update(lan.pin).digest();
        if (crypto.timingSafeEqual(a, b)) {
          tries.delete(remote);
          return deny(res, 303, '', { location: '/', 'set-cookie': `clout_auth=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
        }
        rec.n++;
        if (rec.n >= 5) { rec.until = Date.now() + 10 * 60 * 1000; rec.n = 0; }
        tries.set(remote, rec);
        deny(res, 401, LOGIN_PAGE('Wrong PIN.'));
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' });
      return res.end('method not allowed');
    }
    const fromThisPc = opts.trustLocal !== false && /^(::1|127\.|::ffff:127\.)/.test(String(remote)); // anyone at this computer already has everything
    if (lan && !fromThisPc && !PUBLIC_ASSET.test(p) && !authed(req)) {
      if (/text\/html/.test(req.headers.accept || '')) return deny(res, 302, '', { location: '/login' });
      return deny(res, 401, 'locked');
    }

    if (p === '/api/media/index') return serveMediaIndex(req, res);
    if (p.startsWith('/media/')) return serveMediaFile(p.slice(7), req, res);
    if (p === '/api/faces/index') return serveFaceIndex(req, res);
    if (p.startsWith('/faces/')) return serveFaceFile(p.slice(7), req, res);
    const tm = /^\/thumb\/(\d{2,4})\/(.+)$/.exec(p);
    if (tm) return serveThumb(Number(tm[1]), tm[2], req, res);
    if (DIST_FILE.test(p)) {
      const f = path.join(root, p);
      if (!f.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(f)) return notFound(res);
      return sendFile(f, fs.statSync(f).size, MIME[path.extname(f)], req, res, { 'cache-control': 'public, max-age=31536000, immutable' });
    }
    if (p === '/' || p === '/index.html') {
      const body = indexHtml();
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    // exact whitelist: no dot-segments, no encoded traversal, no other files
    if ((!ALLOWED.test(p) && !PUBLIC_ASSET.test(p)) || p.includes('..')) return notFound(res);
    const file = path.join(root, p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return notFound(res);
    const st = fs.statSync(file);
    const etag = 'W/"' + st.size + '-' + Math.round(st.mtimeMs) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': 'no-cache' });
      return res.end();
    }
    sendFile(file, st.size, MIME[path.extname(file)] || 'text/plain', req, res, { etag, 'cache-control': 'no-cache' });
  };
  const server = http.createServer(handler);
  server.lanInfo = lan ? { pin: lan.pin } : null;
  return server;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const pinIdx = args.indexOf('--pin');
  const pinVal = pinIdx >= 0 ? args[pinIdx + 1] : undefined;
  const port = Number(args.find((a) => /^\d+$/.test(a) && a !== pinVal)) || 8080;
  const server = makeServer({ lan, pin: pinIdx >= 0 ? args[pinIdx + 1] : null });
  server.on('error', (e) => {
    if (e && e.code === 'EADDRINUSE') { // one copy only: a second launch does not start a duplicate server
      console.log(`Clout is already running on port ${port}. Use that one: http://localhost:${port} (nothing new was started).`);
      process.exit(0);
    }
    throw e;
  });
  server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    const ips = lan ? lanAddresses() : [];
    console.log(lan ? `Clout PHONE MODE is running on port ${port} (home network only, PIN protected). Press Ctrl+C to stop.` : `Clout is running at http://localhost:${port}  (this computer only — press Ctrl+C to stop)`);
    console.log(`Media library: ${mediaReal ? MEDIA_DIR : MEDIA_DIR + '  (folder not found — create it and drop images in)'}`);
    console.log(`Thumbnails: ${sharp ? 'on (sharp)' : 'off (npm install to enable)'}  ·  Bundle: ${bundleInfo() ? 'minified build in use' : 'plain files (run: node tools/build.js)'}`);
    if (lan) {
      console.log(`\n  On your computer:  http://localhost:${port}`);
      ips.forEach((ip) => console.log(`  On your iPhone:    http://${ip}:${port}`));
      console.log(`  PIN:               ${server.lanInfo.pin}\n`);
      if (!ips.length) console.log('  (No home-network address found — connect this computer to Wi-Fi.)');
      else {
        try {
          require('qrcode').toString(`http://${ips[0]}:${port}`, { type: 'terminal', small: true }, (e, s) => !e && console.log('  Scan with the iPhone camera:\n' + s));
        } catch (e) {}
      }
    }
  });
}
module.exports = { server: makeServer(), makeServer, scanMedia, isPrivateIp, lanAddresses };
