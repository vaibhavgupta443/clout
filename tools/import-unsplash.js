// Imports everyday, PEOPLE-FREE photos from the Unsplash Lite Dataset into media/clean/<topic>/ .
//   node tools/import-unsplash.js [--per 25] [--topics food,travel,city] [--dry]
// Only the metadata files (~15 MB) are read out of the 320 MB dataset archive (HTTP range requests); then the chosen
// photos are downloaded one by one at feed size. Anything that mentions a person, a face, a crowd, a body or anything
// adult is skipped — these are scenery, food, pets, objects. Credits go to media/CREDITS.txt.
// Terms: https://github.com/unsplash/datasets/blob/master/TERMS.md — the Lite dataset may be downloaded, stored and used
// internally (also commercially); it must NOT be redistributed. So: keep this media/ folder on your own computer.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.resolve(__dirname, '..');
const ZIP = 'https://unsplash-datasets.s3.amazonaws.com/lite/latest/unsplash-research-dataset-lite-latest.zip';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PER = Math.max(1, Math.min(6000, Number(arg('per', 25))));
const ONLY = (arg('topics', '') || '').split(',').filter(Boolean);
const DRY = process.argv.includes('--dry');

const TOPICS = {
  food: ['food', 'pizza', 'coffee', 'dessert', 'cake', 'burger', 'sushi', 'breakfast', 'pasta', 'salad', 'cocktail', 'bakery', 'fruit', 'brunch', 'coffee cup', 'latte', 'ice cream', 'donut', 'sandwich', 'drink'],
  travel: ['beach', 'travel', 'island', 'tropical', 'lake', 'airplane', 'road trip', 'adventure', 'hiking', 'resort', 'palm tree', 'sea', 'ocean', 'coast', 'cabin'],
  city: ['city', 'street', 'skyline', 'architecture', 'urban', 'bridge', 'neon', 'rooftop', 'downtown', 'night city', 'skyscraper', 'tokyo', 'new york'],
  nature: ['nature', 'forest', 'flower', 'sunset', 'waterfall', 'landscape', 'mountain', 'sunrise', 'autumn', 'snow', 'field', 'meadow'],
  pets: ['dog', 'cat', 'puppy', 'kitten', 'pet', 'bird', 'rabbit', 'horse'],
  party: ['fireworks', 'neon lights', 'confetti', 'balloon', 'champagne', 'festival', 'disco', 'lights', 'celebration', 'cheers', 'string lights'],
  gym: ['dumbbell', 'gym', 'yoga mat', 'bicycle', 'running shoes', 'kettlebell', 'sneakers', 'skateboard', 'tennis', 'basketball', 'surfboard'],
  music: ['guitar', 'piano', 'vinyl', 'headphones', 'microphone', 'record player', 'speaker', 'violin', 'drums', 'concert'],
  art: ['painting', 'mural', 'graffiti', 'sculpture', 'gallery', 'street art', 'museum', 'canvas', 'paint'],
  home: ['interior', 'bedroom', 'living room', 'candle', 'plant', 'cozy', 'sofa', 'bookshelf', 'kitchen', 'bed', 'window', 'lamp', 'balcony'],
  shopping: ['sneakers', 'shoes', 'handbag', 'jewelry', 'watch', 'sunglasses', 'perfume', 'shop', 'fashion', 'clothes'],
  car: ['car', 'sports car', 'motorcycle', 'vintage car', 'road', 'highway', 'driving'],
};
// never import anything that is about people or anything adult/violent
const PEOPLE = /\b(person|people|man|men|woman|women|girl|girls|boy|boys|face|faces|portrait|couple|crowd|child|children|kid|kids|baby|model|selfie|human|body|skin|hand|hands|smile|smiling|lady|guy|bride|groom|wedding|family|friends|team|audience|dancer|athlete|runner|player|musician|singer|worker|student|tourist|passenger|hiker|surfer|rider|cyclist|swimmer|lingerie|bikini|nude|naked|sexy|erotic|bdsm|gun|weapon|blood|dead|corpse|war|soldier|protest|police)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'CloutLocalGame/1.0 (personal offline game; Unsplash Lite Dataset, internal use)';
const slug = (s) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-') || 'photo';

async function range(start, end) {
  const r = await fetch(ZIP, { headers: { Range: `bytes=${start}-${end}`, 'user-agent': UA } });
  if (r.status !== 206 && r.status !== 200) throw new Error('range request failed: HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function readEntries() {
  const head = await fetch(ZIP, { method: 'HEAD', headers: { 'user-agent': UA } });
  const total = Number(head.headers.get('content-length'));
  if (!total) throw new Error('could not size the dataset archive');
  const tail = await range(total - 70000, total - 1);
  let i = tail.length - 22;
  while (i >= 0 && tail.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('not a zip file');
  const cdSize = tail.readUInt32LE(i + 12), cdOff = tail.readUInt32LE(i + 16);
  const cd = await range(cdOff, cdOff + cdSize - 1);
  const out = {};
  for (let p = 0; p < cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    out[cd.toString('utf8', p + 46, p + 46 + nl)] = { method: cd.readUInt16LE(p + 10), size: cd.readUInt32LE(p + 20), off: cd.readUInt32LE(p + 42) };
    p += 46 + nl + el + cl;
  }
  return out;
}
async function readFileFromZip(e) {
  const lh = await range(e.off, e.off + 29);
  const dataStart = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw = await range(dataStart, dataStart + e.size - 1);
  return (e.method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
}
function tsv(text) {
  const lines = text.split('\n');
  const head = lines.shift().split('\t').map((h) => h.trim());
  return lines.filter(Boolean).map((l) => { const c = l.split('\t'); const o = {}; head.forEach((h, k) => (o[h] = c[k] === undefined ? '' : c[k].replace(/\r$/, ''))); return o; });
}
const seeded = (n) => { let h = n; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };

(async () => {
  console.log('Reading the dataset index (about 15 MB of the 320 MB archive)…');
  const entries = await readEntries();
  if (!entries['photos.tsv000'] || !entries['keywords.tsv000']) throw new Error('unexpected archive layout: ' + Object.keys(entries).join(', '));
  const photos = tsv(await readFileFromZip(entries['photos.tsv000']));
  const kwRows = tsv(await readFileFromZip(entries['keywords.tsv000']));
  console.log(`  ${photos.length} photos, ${kwRows.length} keywords`);
  const kw = new Map();
  for (const r of kwRows) {
    if (!kw.has(r.photo_id)) kw.set(r.photo_id, []);
    kw.get(r.photo_id).push(String(r.keyword || '').toLowerCase());
  }
  const rnd = seeded(2026);
  const credits = path.join(root, 'media', 'CREDITS.txt');
  let total = 0, skippedPeople = 0;
  for (const [topic, words] of Object.entries(TOPICS)) {
    if (ONLY.length && !ONLY.includes(topic)) continue;
    const set = new Set(words);
    const cands = [];
    for (const p of photos) {
      const keys = kw.get(p.photo_id) || [];
      if (!keys.some((k) => set.has(k))) continue;
      const text = [p.photo_description, p.ai_description, keys.join(' ')].join(' ');
      if (PEOPLE.test(text)) { skippedPeople++; continue; }
      if (!p.photo_image_url || Number(p.photo_width) < 1200) continue;
      cands.push(p);
    }
    cands.sort((a, b) => Number(b.stats_downloads || 0) - Number(a.stats_downloads || 0));
    const pool = cands.slice(0, PER * 4);
    const pick = [];
    while (pick.length < PER && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    console.log(`${topic}: ${cands.length} candidates, taking ${pick.length}`);
    if (DRY) continue;
    const dir = path.join(root, 'media', 'clean', topic);
    fs.mkdirSync(dir, { recursive: true });
    for (const p of pick) {
      const name = `${slug(p.ai_description || p.photo_description || (kw.get(p.photo_id) || []).slice(0, 3).join(' '))}-${p.photo_id.slice(0, 7)}.jpg`;
      const file = path.join(dir, name);
      if (fs.existsSync(file)) continue;
      try {
        const r = await fetch(`${p.photo_image_url}?w=1080&q=80&fm=jpg&fit=max`, { headers: { 'user-agent': UA } });
        if (!r.ok || !/image\//.test(r.headers.get('content-type') || '')) throw new Error('HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 15000) continue;
        fs.writeFileSync(file, buf);
        const who = [p.photographer_first_name, p.photographer_last_name].filter(Boolean).join(' ') || p.photographer_username;
        fs.appendFileSync(credits, `clean/${topic}/${name} — "${(p.photo_description || p.ai_description || '').slice(0, 90)}" by ${who} (@${p.photographer_username}) — Unsplash Lite Dataset — ${p.photo_url}?utm_source=clout&utm_medium=referral\n`);
        total++;
        if (total % 10 === 0) process.stdout.write(`  … ${total} photos\n`);
      } catch (e) {
        console.log(`  ! ${name}: ${e.message}`);
      }
      await sleep(180);
    }
  }
  console.log(`\nDone: ${total} photos added to media/clean/ (${skippedPeople} candidates skipped because they showed or mentioned people). Credits: media/CREDITS.txt`);
  console.log('Keep the media/ folder on this computer (the dataset terms forbid redistributing the photos).');
  console.log('Next: Settings -> Local photo library -> Rescan (or restart the game).');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
