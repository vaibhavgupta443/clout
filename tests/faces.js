// Profile pictures: drawn portraits for everyone, optional photos from the faces folder, the server routes, and the prepare tool.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const sharp = require(path.join(root, 'node_modules', 'sharp'));
const H = boot(root);
const { w, G, check } = H;

const get = (port, p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: p }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(c) })); }).on('error', () => resolve({ status: 0, body: Buffer.alloc(0) })));
const jpg = (color) => sharp({ create: { width: 300, height: 260, channels: 3, background: color } }).jpeg().toBuffer();

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  const F = G.Faces;
  const UI = G.UI;

  /* ---------- the drawn portraits ---------- */
  const a = F.svg('@mia');
  check('a portrait is an SVG, the same every time for the same person', /^<svg/.test(a) && /<\/svg>$/.test(a) && a === F.svg('@mia') && !/undefined|NaN/.test(a));
  const set = new Set();
  for (let i = 0; i < 300; i++) set.add(F.svg('@person' + i));
  check('different people look different (>= 95% unique over 300 handles)', set.size >= 285, set.size);
  const tags = (s) => ({ open: (s.match(/<(?!\/)[a-zA-Z]/g) || []).length, close: (s.match(/<\/[a-zA-Z]+>/g) || []).length + (s.match(/\/>/g) || []).length });
  check('every portrait is well-formed (every tag closes)', [...set].slice(0, 60).every((s) => { const t = tags(s); return t.open === t.close; }));
  check('there is real variety: skin tones, hair colours, glasses, beards', new Set([...set].map((s) => (s.match(/<ellipse[^>]*fill="(#[0-9a-f]{6})"/) || [])[1])).size >= 5 && [...set].some((s) => /<circle[^>]*r="5.6"/.test(s)) && [...set].some((s) => /opacity="\.85"/.test(s)));
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  G.settings.faces = true;
  const av = UI.avatar(mia, 40);
  // pictures are written once as a CSS rule (class cavN in #avcss), not repeated in every card
  const ruleOf = (h) => { const m = /class="avatar[^"]*?(cav[0-9a-z]+)"/.exec(h); return m ? (w.document.getElementById('avcss').textContent.split('.avatar.' + m[1] + '{')[1] || '') : ''; };
  check('characters show a face instead of an emoji', /class="avatar face cav/.test(av) && /data:image\/svg\+xml/.test(ruleOf(av)) && !/data:image/.test(av) && !av.includes(mia.emoji || '\u0000'));
  check('a crowd account gets a face too', /avatar face/.test(UI.avatar({ crowd: { handle: '@rando', stance: 'fan' } }, 30)));
  check('you keep the avatar you chose', !/avatar face/.test(UI.avatar('me', 40)));
  mia.avatar = 'data:image/jpeg;base64,AAAA';
  check('a photo someone already has always wins over the drawing', /data:image\/jpeg;base64,AAAA/.test(ruleOf(UI.avatar(mia, 40))) && !/AAAA/.test(UI.avatar(mia, 40)) && !/avatar face/.test(UI.avatar(mia, 40)));
  mia.avatar = '';
  G.settings.faces = false;
  check('switched off: the old emoji avatars come back', !/avatar face/.test(UI.avatar(mia, 40)));
  G.settings.faces = true;
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) UI.avatar({ handle: '@p' + (i % 300), emoji: '🙂' }, 40);
  check('2000 avatars draw fast (cached)', Date.now() - t0 < 1500, Date.now() - t0 + ' ms');

  /* ---------- photos from the folder ---------- */
  check('names guess a folder: Mia -> women, Kai -> men, unknown -> any', F.guessGender('Mia Vale') === 'f' && F.guessGender('Kai Storm') === 'm' && F.guessGender('Zxqv Plorb') === 'any');
  const names = ['Mia Vale', 'Kai Storm', 'Dex Rowan'];
  const files = [{ f: 'women/w1.jpg', g: 'f' }, { f: 'women/w2.jpg', g: 'f' }, { f: 'men/m1.jpg', g: 'm' }, { f: 'men/m2.jpg', g: 'm' }, { f: 'any/a1.jpg', g: 'any' }, { f: 'any/a2.jpg', g: 'any' }];
  F.list = async () => files;
  F.toData = async (url) => 'data:image/jpeg;base64,' + Buffer.from(url).toString('base64');
  const people = Object.values(S.npcs).filter((n) => !n.userAlt);
  people.forEach((n) => { n.avatar = ''; n.avImg = ''; });
  const keep = people[people.length - 1];
  keep.avatar = 'data:image/png;base64,KEEP';
  const r = await F.assignPhotos({ max: 50 });
  const got = people.filter((n) => n !== keep && n.avatar);
  check('characters without a photo get one from the folder', r.files === 6 && r.assigned === got.length && r.assigned >= 2 && r.assigned <= 6, JSON.stringify(r));
  check('nobody shares a face', new Set(got.map((n) => n.avatar)).size === got.length);
  check('a photo someone already has is never replaced', keep.avatar === 'data:image/png;base64,KEEP');
  const miaP = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kaiP = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const decode = (n) => Buffer.from(n.avatar.split(',')[1], 'base64').toString();
  check('women get women\'s (or neutral) photos, men get men\'s (or neutral) ones', !/men\//.test(decode(miaP).replace(/women\//, '')) && !/women\//.test(decode(kaiP)), decode(miaP) + ' | ' + decode(kaiP));
  check('which photo went to whom is remembered in the save', Object.keys(S.faceUsed).length === r.assigned && JSON.parse(JSON.stringify(S.faceUsed)));
  const r2 = await F.assignPhotos({ max: 50 });
  check('asking again changes nothing for people who already have one (it only fills gaps)', r2.assigned <= people.length - got.length - 1);
  F.list = async () => [];
  check('an empty folder is fine', (await F.assignPhotos()).files === 0);

  /* ---------- the server routes ---------- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clout-faces-'));
  fs.mkdirSync(path.join(dir, 'women'));
  fs.mkdirSync(path.join(dir, '_review'));
  fs.writeFileSync(path.join(dir, 'a.jpg'), await jpg('#c98d67'));
  fs.writeFileSync(path.join(dir, 'women', 'b.jpg'), await jpg('#e0a982'));
  fs.writeFileSync(path.join(dir, '_review', 'sheet.jpg'), await jpg('#000000'));
  fs.writeFileSync(path.join(dir, '.hidden.jpg'), await jpg('#111111'));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'private');
  const port = 8100 + Math.floor(Math.random() * 400);
  const srv = spawn(process.execPath, ['serve.js', String(port), '--no-st'], { cwd: root, env: Object.assign({}, process.env, { CLOUT_FACES: dir }), stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await H.wait(150); up = (await get(port, '/')).status === 200; }
  try {
    check('the server starts for the test', up);
    const idx = await get(port, '/api/faces/index');
    const list = JSON.parse(idx.body.toString() || '{}').files || [];
    check('the index lists the photos (with women/men folders marked), and hides _review, hidden files and non-images', idx.status === 200 && list.length === 2 && list.some((x) => x.f === 'a.jpg' && x.g === 'any') && list.some((x) => x.f === 'women/b.jpg' && x.g === 'f'), idx.body.toString());
    const img = await get(port, '/faces/a.jpg');
    check('a photo is served as an image', img.status === 200 && /image\/jpeg/.test(img.type) && img.body.length > 500);
    check('the private and the unsafe are refused', (await get(port, '/faces/_review/sheet.jpg')).status === 404 && (await get(port, '/faces/.hidden.jpg')).status === 404 && (await get(port, '/faces/notes.txt')).status === 404 && (await get(port, '/faces/../serve.js')).status === 404 && (await get(port, '/faces/%2e%2e/serve.js')).status === 404 && (await get(port, '/faces/women%2fb.jpg')).status !== 500);
  } finally {
    srv.kill();
  }

  /* ---------- the prepare tool ---------- */
  const inDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clout-in-'));
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(inDir, 'raw' + i + '.jpg'), await sharp({ create: { width: 400 + i * 10, height: 300, channels: 3, background: { r: 20 * i, g: 90, b: 160 } } }).jpeg().toBuffer());
  fs.writeFileSync(path.join(inDir, 'readme.txt'), 'x');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clout-out-'));
  const run = (extra) => spawnSync(process.execPath, [path.join(root, 'tools', 'prepare-faces.js'), inDir, '10'].concat(extra || []), { env: Object.assign({}, process.env, { CLOUT_FACES: outDir }), encoding: 'utf8' });
  const o1 = run();
  const made = fs.readdirSync(path.join(outDir, 'any'));
  const m0 = await sharp(path.join(outDir, 'any', made[0])).metadata();
  check('the tool picks the faces, crops them square and shrinks them to 192 px', o1.status === 0 && made.length === 10 && m0.width === 192 && m0.height === 192 && fs.statSync(path.join(outDir, 'any', made[0])).size < 40000, o1.stdout + o1.stderr);
  check('it writes numbered contact sheets for you to review', fs.readdirSync(path.join(outDir, '_review')).some((f) => /^any-sheet-1\.jpg$/.test(f)) && /Review sheets/.test(o1.stdout));
  const o2 = run(['--women']);
  check('--women puts them in the women folder', o2.status === 0 && fs.readdirSync(path.join(outDir, 'women')).length === 10);
  const o3 = run();
  check('running again adds new numbers instead of overwriting', fs.readdirSync(path.join(outDir, 'any')).length === 20 && fs.existsSync(path.join(outDir, 'any', 'face-011.jpg')));
  check('a folder that does not exist is a clear message, not a crash', spawnSync(process.execPath, [path.join(root, 'tools', 'prepare-faces.js'), path.join(os.tmpdir(), 'nope-nope')], { encoding: 'utf8' }).status === 1);
  [dir, inDir, outDir].forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

  H.summary('FACES');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
