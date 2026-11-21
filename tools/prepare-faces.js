// Turns a folder of face photos (for example an unzipped SFHQ download from Kaggle: AI-generated faces, no real people) into Clout's "faces" folder.
//   node tools/prepare-faces.js <folder with face images> [how many = 120] [--women] [--men]
// It picks that many at random, crops each to a square, shrinks it (192 px, about 15 KB), and writes
//   faces/any/face-001.jpg ...            (or faces/women, faces/men when you pass --women / --men)
//   faces/_review/sheet-1.jpg ...          contact sheets with a number on each face: LOOK AT THEM and delete any file you do not want.
// Characters in Clout are adults. A synthetic face has no real age, so you decide what looks right: delete anyone who looks young or unsuitable.
// Datasets (check each one's licence yourself): SFHQ  https://github.com/SelfishGene/SFHQ-dataset   (download from the Kaggle link on that page)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
const input = pos[0];
const count = Math.max(1, Math.min(2000, Number(pos[1]) || 120));
const group = flags.has('--women') ? 'women' : flags.has('--men') ? 'men' : 'any';
if (!input || !fs.existsSync(input)) {
  console.log('Usage: node tools/prepare-faces.js <folder with face images> [count] [--women|--men]');
  process.exit(1);
}
const OUT = process.env.CLOUT_FACES || path.join(__dirname, '..', 'faces');
const IMG = /\.(jpe?g|png|webp)$/i;

function walk(dir, out = [], depth = 0) {
  if (depth > 4 || out.length > 200000) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (IMG.test(e.name)) out.push(p);
  }
  return out;
}
// a shuffle that gives the same result every time for the same folder (so a re-run does not change faces already in use)
let seed = 1234567;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

(async () => {
  const all = walk(input);
  if (!all.length) { console.log('No images found in ' + input); process.exit(1); }
  all.sort();
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const dir = path.join(OUT, group);
  fs.mkdirSync(dir, { recursive: true });
  const start = fs.readdirSync(dir).filter((f) => IMG.test(f)).length;
  const made = [];
  for (const f of all.slice(0, count)) {
    const name = 'face-' + String(start + made.length + 1).padStart(3, '0') + '.jpg';
    try {
      await sharp(f, { failOn: 'none', limitInputPixels: 268402689 }).rotate().resize(192, 192, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, name));
      made.push(name);
    } catch (e) { /* unreadable file: skip it */ }
  }
  // contact sheets: 6 x 5 faces per sheet, each with its number
  const rev = path.join(OUT, '_review');
  fs.mkdirSync(rev, { recursive: true });
  const T = 160;
  const per = 30;
  let sheets = 0;
  for (let s = 0; s < made.length; s += per) {
    const chunk = made.slice(s, s + per);
    const rows = Math.ceil(chunk.length / 6);
    const comp = [];
    for (let i = 0; i < chunk.length; i++) {
      const x = (i % 6) * T;
      const y = Math.floor(i / 6) * T;
      comp.push({ input: await sharp(path.join(dir, chunk[i])).resize(T, T).jpeg({ quality: 80 }).toBuffer(), left: x, top: y });
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="46" height="22"><rect width="46" height="22" rx="4" fill="#000a"/><text x="23" y="16" font-family="Arial" font-size="13" fill="#fff" text-anchor="middle">${chunk[i].replace(/\D/g, '')}</text></svg>`);
      comp.push({ input: label, left: x + 4, top: y + 4 });
    }
    await sharp({ create: { width: T * 6, height: T * rows, channels: 3, background: '#222' } }).composite(comp).jpeg({ quality: 80 }).toFile(path.join(rev, `${group}-sheet-${++sheets}.jpg`));
  }
  console.log(`Wrote ${made.length} faces to ${dir}`);
  console.log(`Review sheets: ${rev}  (${sheets} sheet${sheets === 1 ? '' : 's'}). Open them, then delete the files in ${dir} you do not want (the number on each face is the file number).`);
  console.log('Then in Clout: Settings -> Profile pictures -> "Use photos from the faces folder".');
})().catch((e) => { console.error(e.message); process.exit(1); });
