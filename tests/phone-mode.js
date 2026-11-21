// Phone mode: PIN gate, brute-force lockout, cookie safety, home-network-only rule, public assets, manifest + icons, iPhone install tip.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const root = process.argv[2] || path.resolve(__dirname, '..');
const { boot } = require('./harness');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass++; else fail++; if (!cond || process.env.VERBOSE) console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra ? ' — ' + String(extra).slice(0, 300) : '')); };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clout-phone-'));
  const stateFile = path.join(tmp, 'lan.json');
  const { makeServer, isPrivateIp } = require(path.join(root, 'serve.js'));

  /* ---- who counts as "home network" ---- */
  const yes = ['127.0.0.1', '10.0.0.5', '192.168.0.227', '172.16.0.1', '172.31.255.254', '169.254.1.1', '::1', '::ffff:192.168.1.7', 'fe80::1', 'fd12:3456::1', 'fc00::1'];
  const no = ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1', '203.0.113.9', '2001:db8::1', '::ffff:8.8.8.8', '', null, undefined, '999.1.1.1', '192.168.1', 'not-an-ip', '192.168.1.1.1'];
  check('private / home-network addresses are recognised', yes.every(isPrivateIp), yes.filter((a) => !isPrivateIp(a)).join(','));
  check('public / malformed addresses are NOT', no.every((a) => !isPrivateIp(a)), no.filter((a) => isPrivateIp(a)).join(','));

  /* ---- a phone-mode server that does not trust localhost (so we can test the PIN from here) ---- */
  const server = makeServer({ lan: true, pin: '482913', stateFile, allowAnyIp: true, trustLocal: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (p, o = {}) => new Promise((resolve) => {
    const rq = http.request(base + p, { method: o.method || 'GET', headers: o.headers || {} }, (res) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString() })); });
    rq.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
    if (o.body) rq.write(o.body);
    rq.end();
  });
  const login = (pin, extra = {}) => call('/login', { method: 'POST', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, extra), body: 'pin=' + encodeURIComponent(pin) });
  const HTML = { accept: 'text/html' };

  check('server reports the PIN it is using', server.lanInfo && server.lanInfo.pin === '482913');
  check('the PIN and secret are stored for next time (and not in the web root)', JSON.parse(fs.readFileSync(stateFile, 'utf8')).pin === '482913' && JSON.parse(fs.readFileSync(stateFile, 'utf8')).secret.length === 64);

  /* ---- locked until you enter the PIN ---- */
  const r0 = await call('/', { headers: HTML });
  check('opening the app without a PIN redirects to the login page', r0.status === 302 && r0.headers.location === '/login');
  check('API / script calls without a PIN get 401 (nothing leaks)', (await Promise.all(['/js/util.js', '/css/style.css', '/api/media/index', '/media/x.jpg', '/thumb/720/x.jpg', '/vendor/vader.js'].map((p) => call(p)))).every((r) => r.status === 401 && !/function|G\./.test(r.body)));
  const lp = await call('/login');
  check('the login page asks for a numeric PIN', lp.status === 200 && /inputmode="numeric"/.test(lp.body) && /type="password"/.test(lp.body) && /Enter the PIN/.test(lp.body));
  check('the login page is not cached and does not reflect input', /no-store/.test(lp.headers['cache-control']) && !/<script/i.test(lp.body));
  check('manifest + icons are public (iOS fetches them without your cookie)', (await call('/manifest.webmanifest')).status === 200 && (await call('/icons/icon-192.png')).status === 200 && (await call('/icons/apple-touch-icon.png')).status === 200);
  check('manifest content type is right', /application\/manifest\+json/.test((await call('/manifest.webmanifest')).headers['content-type']));

  /* ---- wrong PIN / right PIN ---- */
  const bad = await login('000000');
  check('a wrong PIN is refused and sets no cookie', bad.status === 401 && /Wrong PIN/.test(bad.body) && !bad.headers['set-cookie']);
  check('...and the wrong PIN is not echoed back', !/000000/.test(bad.body));
  const good = await login('482913');
  const cookie = ((good.headers['set-cookie'] || [])[0] || '').split(';')[0];
  const flags = ((good.headers['set-cookie'] || [])[0] || '');
  check('the right PIN redirects home and sets a cookie', good.status === 303 && good.headers.location === '/' && /^clout_auth=[a-f0-9]{64}$/.test(cookie), flags);
  check('cookie is HttpOnly, SameSite=Strict, long-lived (the home-screen app stays unlocked)', /HttpOnly/.test(flags) && /SameSite=Strict/.test(flags) && /Path=\//.test(flags) && /Max-Age=31536000/.test(flags));
  const authed = (p, o = {}) => call(p, { headers: Object.assign({ cookie }, o.headers || {}), method: o.method });
  check('with the cookie the app opens', (await authed('/', { headers: HTML })).status === 200 && /<title>Clout/.test((await authed('/', { headers: HTML })).body));
  check('with the cookie scripts, styles, media index all work', (await Promise.all(['/js/util.js', '/css/style.css', '/api/media/index', '/vendor/vader.js'].map((p) => authed(p)))).every((r) => r.status === 200));
  check('with the cookie the thumbnail + media routes work (404 only because that file does not exist)', (await authed('/thumb/720/clean/none.jpg')).status === 404 && (await authed('/media/clean/none.jpg')).status === 404);
  check('even logged in, secrets are still never served', (await Promise.all(['/.env', '/serve.js', '/package.json', '/.cache/lan.json', '/node_modules/sharp/package.json', '/tools/build.js', '/tests/harness.js'].map((p) => authed(p)))).every((r) => r.status === 404));
  check('responses carry no-referrer + frame-deny headers', (await authed('/js/util.js')).headers['referrer-policy'] === 'no-referrer' && (await authed('/js/util.js')).headers['x-frame-options'] === 'DENY');

  /* ---- cookie tampering ---- */
  const tamper = (c) => call('/js/util.js', { headers: { cookie: c } });
  const val = cookie.split('=')[1];
  check('a cookie with one character changed is rejected', (await tamper('clout_auth=' + (val[0] === 'a' ? 'b' : 'a') + val.slice(1))).status === 401);
  check('random / short / long / non-hex / empty cookies are rejected', (await Promise.all(['clout_auth=' + 'a'.repeat(64), 'clout_auth=abc', 'clout_auth=' + 'f'.repeat(200), 'clout_auth=' + 'z'.repeat(64), 'clout_auth=', 'other=' + val, 'clout_auth=' + val + 'x'].map(tamper))).every((r) => r.status === 401));
  check('the cookie from another server (different secret) is rejected', await (async () => { const s2 = makeServer({ lan: true, pin: '482913', stateFile: path.join(tmp, 'other.json'), allowAnyIp: true, trustLocal: false }); await new Promise((r) => s2.listen(0, '127.0.0.1', r)); const rr = await new Promise((resolve) => http.get('http://127.0.0.1:' + s2.address().port + '/js/util.js', { headers: { cookie } }, (res) => { res.resume(); resolve(res.statusCode); })); s2.close(); return rr === 401; })());
  check('POST / PUT / DELETE anywhere else are refused', (await Promise.all(['/', '/api/media/index', '/js/util.js'].map((p) => authed(p, { method: 'POST' })))).every((r) => r.status === 405) && (await authed('/', { method: 'DELETE' })).status === 405);

  /* ---- brute force ---- */
  const attempts = [];
  for (let i = 0; i < 5; i++) attempts.push((await login('11111' + i)).status);
  check('five wrong tries are all refused', attempts.every((s) => s === 401), attempts.join(','));
  const locked = await login('482913');
  check('then the address is LOCKED OUT — even the right PIN is refused for a while', locked.status === 429 && !locked.headers['set-cookie'] && locked.headers['retry-after'] === '600');
  check('the lockout message does not reveal the PIN', !/482913/.test(locked.body));
  check('the app itself stays locked during lockout', (await call('/js/util.js')).status === 401);
  check('a giant PIN body is handled (no crash, no unlock)', (await login('9'.repeat(100000))).status !== 303 && (await call('/login')).status === 200);
  check('server alive after all that', (await call('/manifest.webmanifest')).status === 200);
  server.close();

  /* ---- trust this PC; normal (non-phone) mode has no login at all ---- */
  const s3 = makeServer({ lan: true, pin: '123456', stateFile: path.join(tmp, 's3.json'), allowAnyIp: true });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  const p3 = s3.address().port;
  const get3 = (p, o = {}) => new Promise((resolve) => http.get('http://127.0.0.1:' + p3 + p, o, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }));
  check('phone mode: the PC itself (localhost) does not need the PIN', (await get3('/js/util.js')) === 200);
  s3.close();
  const s4 = makeServer({});
  await new Promise((r) => s4.listen(0, '127.0.0.1', r));
  const p4 = s4.address().port;
  const get4 = (p, m = 'GET') => new Promise((resolve) => { const rq = http.request('http://127.0.0.1:' + p4 + p, { method: m }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); rq.end(); });
  check('normal mode: no login page, POST /login is just 405, app files are open', (await get4('/login')) === 404 && (await get4('/login', 'POST')) === 405 && (await get4('/js/util.js')) === 200);
  s4.close();

  /* ---- the server's own home-network gate, end to end ---- */
  const gate = makeServer({ lan: true, pin: '123456', stateFile: path.join(tmp, 'g.json') }); // allowAnyIp OFF: only private callers may even get a login page
  const fake = (addr) => new Promise((resolve) => { const req = { socket: { remoteAddress: addr }, url: '/login', method: 'GET', headers: {}, on() {} }; const res = { _h: {}, setHeader(k, v) { this._h[k] = v; }, writeHead(c) { this.code = c; }, end() { resolve(this.code); } }; gate.emit('request', req, res); });
  check('a request from a PUBLIC address gets 403 and nothing else (even the login page)', (await fake('8.8.8.8')) === 403 && (await fake('203.0.113.7')) === 403 && (await fake('::ffff:1.2.3.4')) === 403);
  check('a request from your home network is allowed through to the login page', (await fake('192.168.0.50')) === 200 && (await fake('10.1.2.3')) === 200);

  /* ---- manifest + icons ---- */
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  check('manifest: standalone app named Clout with a start url', man.name === 'Clout' && man.display === 'standalone' && man.start_url === '/' && man.icons.length >= 3);
  let sharp = null; try { sharp = require(path.join(root, 'node_modules', 'sharp')); } catch (e) {}
  if (sharp) {
    const sizes = {};
    for (const i of man.icons) { const m = await sharp(path.join(root, i.src.slice(1))).metadata(); sizes[i.src] = m.width + 'x' + m.height; check('icon ' + i.src + ' is really ' + i.sizes, sizes[i.src] === i.sizes, sizes[i.src]); }
    const ap = await sharp(path.join(root, 'icons', 'apple-touch-icon.png')).metadata();
    check('apple-touch-icon is 180x180', ap.width === 180 && ap.height === 180);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  check('index.html links the manifest, the touch icon and the iOS app meta tags', /rel="manifest"/.test(html) && /rel="apple-touch-icon"/.test(html) && /apple-mobile-web-app-capable/.test(html) && /viewport-fit=cover/.test(html));

  /* ---- the iPhone install tip (jsdom) ---- */
  const tipRun = async (ua, standalone, dismissed) => {
    const H = boot(root);
    const { w, G } = H;
    Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(w.navigator, 'standalone', { value: standalone, configurable: true });
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await H.wait(120);
    H.freshWorld();
    G.settings.iosTipDismissed = !!dismissed;
    G.UI.go('home');
    const shown = !!w.document.querySelector('.tipcard');
    return { shown, H, G, w };
  };
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const a1 = await tipRun(IPHONE, false, false);
  check('iPhone Safari: the "Add to Home Screen" tip is shown', a1.shown && /Add to Home Screen/.test(a1.w.document.querySelector('.tipcard').textContent));
  a1.w.document.querySelector('[data-act="dismissIosTip"]').dispatchEvent(new a1.w.MouseEvent('click', { bubbles: true }));
  check('dismissing it hides it and remembers', !a1.w.document.querySelector('.tipcard') && a1.G.settings.iosTipDismissed === true);
  check('already installed (standalone): no tip', !(await tipRun(IPHONE, true, false)).shown);
  check('desktop browser: no tip', !(await tipRun('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36', false, false)).shown);
  check('dismissed earlier: no tip', !(await tipRun(IPHONE, false, true)).shown);
  check('iPad (desktop-class UA) with touch is treated as iOS', await (async () => { const H = boot(root); const { w, G } = H; Object.defineProperty(w.navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15', configurable: true }); Object.defineProperty(w.navigator, 'platform', { value: 'MacIntel', configurable: true }); Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true }); Object.defineProperty(w.navigator, 'standalone', { value: false, configurable: true }); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await H.wait(120); H.freshWorld(); G.UI.go('home'); return !!w.document.querySelector('.tipcard'); })());

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n== PHONE MODE (iPhone / home network): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
