// Fills media/clean/ with everyday-life photos so the feed has real pictures from day one.
//   node tools/fetch-clean-photos.js [--per 3] [--topics food,travel,city]
// Source: Wikimedia Commons "Featured pictures" only (high quality, curated). Only freely licensed files are kept
// (Public domain, CC0, CC BY, CC BY-SA — never NC/ND). Every file's title, author, licence and link is written to
// media/CREDITS.txt (CC BY / BY-SA require that credit). Clean topics only: no people-portrait or adult searches.
// Your own photos always come from YOU — this tool never touches those folders.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'media', 'clean');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PER = Math.max(1, Math.min(8, Number(arg('per', 3))));
const ONLY = (arg('topics', '') || '').split(',').filter(Boolean);
const UA = 'CloutLocalGame/1.0 (personal offline game; downloads a few freely licensed photos)';

const TOPICS = {
  food: ['coffee', 'pizza', 'cake dessert', 'sushi', 'breakfast', 'pasta', 'hamburger', 'fruit market'],
  travel: ['beach', 'tropical island', 'mountain lake', 'temple', 'train station', 'harbour boats'],
  city: ['city skyline night', 'street at night', 'bridge', 'cafe terrace', 'rooftop view'],
  nature: ['forest', 'flower macro', 'sunset sky', 'waterfall', 'snowy mountain'],
  pets: ['cat', 'dog', 'puppy', 'kitten'],
  party: ['fireworks', 'concert stage lights', 'festival lanterns'],
  gym: ['running marathon', 'yoga pose', 'cycling', 'climbing wall'],
  music: ['guitar', 'piano', 'vinyl record'],
  art: ['oil painting', 'street art mural', 'sculpture'],
};
const OK_LICENSE = /^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]\d)/i;
const BAD_WORDS = /\b(girl|girls|woman|women|man|men|boy|boys|people|lady|child|children|kid|kids|couple|family|crowd|nude|naked|erotic|sex|porn|topless|lingerie|bikini|fetish|corpse|dead|war|gun|weapon|blood|portrait|bust|actress|actor|president|politician|minister|general|king|queen|born|died|funeral|soldier|prisoner|1[89]\d\d)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (q) => {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, q));
  const r = await fetch(u, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const slug = (s) => s.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48) || 'photo';
const clean = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const credits = path.join(root, 'media', 'CREDITS.txt');
  fs.mkdirSync(out, { recursive: true });
  const have = fs.existsSync(credits) ? fs.readFileSync(credits, 'utf8') : '';
  let total = 0, skipped = 0;
  for (const [topic, queries] of Object.entries(TOPICS)) {
    if (ONLY.length && !ONLY.includes(topic)) continue;
    const dir = path.join(out, topic);
    fs.mkdirSync(dir, { recursive: true });
    let got = 0;
    for (const q of queries) {
      let j;
      try {
        j = await api({ action: 'query', generator: 'search', gsrsearch: `incategory:"Featured pictures on Wikimedia Commons" ${q}`, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1280' });
      } catch (e) {
        console.log(`  ! search "${q}" failed: ${e.message}`);
        continue;
      }
      const pages = Object.values((j.query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      let took = 0;
      for (const p of pages) {
        if (took >= PER) break;
        const i = (p.imageinfo || [])[0];
        if (!i || i.mime !== 'image/jpeg' || !i.thumburl || i.width < 1000) continue;
        const m = i.extmetadata || {};
        const lic = clean((m.LicenseShortName || {}).value);
        const desc = clean((m.ImageDescription || {}).value) + ' ' + p.title;
        const cats = clean((m.Categories || {}).value).replace(/\|/g, ' ');
        const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        const hay = (p.title + ' ' + cats).toLowerCase();
        const relevant = words.some((w) => new RegExp('\\b' + w.replace(/[^a-z]/g, '') + 's?\\b').test(hay)); // the topic word must be in the title or the categories
        if (!OK_LICENSE.test(lic) || /\b(NC|ND)\b/i.test(lic) || BAD_WORDS.test(desc) || BAD_WORDS.test(cats) || !relevant) { skipped++; continue; }
        const file = path.join(dir, slug(p.title) + '.jpg');
        if (fs.existsSync(file)) { took++; continue; }
        try {
          const r = await fetch(i.thumburl, { headers: { 'user-agent': UA } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 20000) continue;
          fs.writeFileSync(file, buf);
          const author = clean((m.Artist || {}).value).slice(0, 80) || 'unknown';
          fs.appendFileSync(credits, `${path.relative(path.join(root, 'media'), file).replace(/\\/g, '/')} — "${p.title.replace(/^File:/, '')}" by ${author} — ${lic} — ${i.descriptionurl}\n`);
          took++; got++; total++;
          process.stdout.write(`  + ${topic}/${path.basename(file)}  (${(buf.length / 1024).toFixed(0)} KB, ${lic})\n`);
        } catch (e) {
          console.log(`  ! ${p.title}: ${e.message}`);
        }
        await sleep(350); // be polite to Wikimedia
      }
      await sleep(250);
    }
    console.log(`${topic}: ${got} new photos`);
  }
  console.log(`\nDone: ${total} photos downloaded to media/clean/ (${skipped} skipped for licence/content). Credits are in media/CREDITS.txt.`);
  console.log('Next: open Settings -> Local photo library -> Rescan (or just restart the game).');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
