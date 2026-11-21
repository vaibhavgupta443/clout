// The gaps in memory: nothing is lost when a world is trimmed, old vault lines survive overflow, public words are known by close people, facts travel between friends,
// and a year of noise does not make anyone forget the specific things that mattered.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');

  /* ---------- 1. trimming a big world files memories instead of deleting them ---------- */
  mia.mem = []; mia.touched = S.clock;
  const pinned = G.Mem.add(mia, { kind: 'event', text: 'Sam saved my life at the pier', who: ['me'], imp: 9, pin: true, t: 5 });
  for (let i = 0; i < 150; i++) mia.mem.push({ t: 10 + i, kind: 'comment', text: `small talk number ${i} about topic${i % 7}`, imp: 2, who: ['me'], tags: [], v: 0 });
  mia.mem.push({ t: 20, kind: 'said', text: 'Sam told me they are afraid of deep water', imp: 6, who: ['me'], tags: ['dislike'], v: -0.2 });
  G.Store.slim(S);
  check('after a trim the pinned memory is still in front', mia.mem.some((m) => m === pinned || /saved my life/.test(m.text)));
  check('what was trimmed was filed in the vault, not thrown away', mia.mem.length <= 120 && G.Vault.lines(mia).length >= 1 && (mia.mem.concat(G.Vault.lines(mia))).some((m) => /afraid of deep water/.test(m.text)));

  /* ---------- 2. a vault note that overflows keeps its oldest lines in a compact layer ---------- */
  dex.vault = {};
  for (let i = 0; i < 80; i++) G.Vault.archive(dex, { text: `unique event ${i} with item${i} and thing${i * 3} and word${i * 7}`, who: ['me'], imp: 5 + (i % 4), v: 0, t: i * 50, kind: 'event' });
  const note = dex.vault.me;
  check('the note holds 30 lines and a compact older layer (not lost)', note.lines.length === 30 && note.old.length >= 10 && note.old.length <= 40, `${note.lines.length} / ${(note.old || []).length}`);
  check('the older layer is part of what they can recall', G.Vault.lines(dex).length === note.lines.length + note.old.length);
  const key = note.old[0].text.match(/item[0-9]+/)[0];
  const olderHit = G.Rag.recall(dex, `what happened with ${key}`, 5);
  check('and recall can still reach it', olderHit.some((t) => t.includes(key)), olderHit.join(' | '));

  /* ---------- 3. what you say in public is known by people close to you ---------- */
  [mia, kai, dex].forEach((n) => { n.mem = []; });
  mia.aff = 60; kai.aff = -10; dex.aff = 50; mia.status = 'sister'; kai.status = 'rival'; dex.status = 'friend';
  const nPub = G.Mem2.learnPublic('I hate coffee. My sister is visiting. Between us, I am moving. I promise I will call.');
  check('close people and family learn what you said in public', mia.mem.some((m) => /hate coffee/.test(m.text)) && dex.mem.some((m) => /hate coffee/.test(m.text)) && nPub > 0);
  check('a rival who is not close does not', !kai.mem.some((m) => /coffee/.test(m.text)));
  check('private things (a secret, a promise) are never learned from a public post', ![mia, dex].some((n) => n.mem.some((m) => /secret|promised/.test(m.text))));

  /* ---------- 4. facts travel between friends, never secrets ---------- */
  mia.mem = []; dex.mem = []; kai.mem = [];
  S.npcRel = S.npcRel.filter((e) => !((e.a === mia.id && e.b === dex.id) || (e.a === dex.id && e.b === mia.id)));
  S.npcRel.push({ a: mia.id, b: dex.id, type: 'best_friend', note: '' });
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me they love jazz', who: ['me'], imp: 6, valence: 0.3, tags: ['like'], t: S.clock - 2000 });
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me a secret: "the label is a trap."', who: ['me'], imp: 8, valence: 0, tags: ['secret'], t: S.clock - 2000 });
  const realRandom = w.Math.random; w.Math.random = () => 0.1;
  S.clock += 400;
  G.Mem2.spread();
  w.Math.random = realRandom;
  check('a friend hears it: "Mia told me about Sam: ..."', dex.mem.some((m) => /Mia told me about Sam: "Sam told me they love jazz"/.test(m.text) && (m.tags || []).includes('hearsay')));
  check('...but a secret is never passed on', !dex.mem.some((m) => /label is a trap/.test(m.text)));
  check('it is told only once', (() => { const n0 = dex.mem.length; w.Math.random = () => 0.1; G.Mem2.spread(); w.Math.random = realRandom; return dex.mem.length === n0; })());
  check('hearsay is weaker than what they lived (lower importance)', dex.mem.find((m) => /Mia told me about/.test(m.text)).imp < 6);

  /* ---------- 5. a year of noise: specific old facts are still found ---------- */
  const lena = E.makeNpc({ name: 'Lena Cho', handle: '@lenacho', role: 'friend', age: 28, bio: 'x', personality: 'warm, precise', followers: 900 }, S);
  lena.touched = S.clock; lena.mem = [];
  const FACTS = [
    ['bakery', 'Sam promised to take me to the Aldoro bakery on my birthday'], ['pier', 'Sam told me they are afraid of the old pier'], ['brother', 'Sam mentioned their brother Tomas moved to Lisbon'],
    ['guitar', 'Sam told me they hate playing the guitar in public'], ['contract', 'Sam told me the label contract has a hidden clause'], ['marathon', 'Sam told me news: they signed up for the Harbor marathon'],
    ['allergy', 'Sam told me they are allergic to peanuts'], ['apology', 'Sam apologised for forgetting my sister Mira on her graduation'], ['studio', 'Sam promised to show me the secret rooftop studio'],
    ['grandma', 'Sam mentioned their grandma Odette taught them to sing'],
  ];
  FACTS.forEach(([k, t], i) => G.Mem.add(lena, { kind: 'said', text: t, who: ['me'], imp: 5 + (i % 3), valence: 0.1, t: 100 + i * 40 }));
  for (let day = 0; day < 365; day++) {
    for (let k = 0; k < 4; k++) G.Mem.add(lena, { kind: 'comment', text: `chatted about ${['weather', 'trains', 'soup', 'football', 'tea'][(day + k) % 5]} number ${day}-${k} with item${day * 7 + k}`, who: ['me'], imp: 2 + ((day + k) % 3), t: 1000 + day * 1440 + k * 60 });
    if (day % 10 === 0) S.clock = 1000 + day * 1440;
  }
  S.clock = 1000 + 366 * 1440;
  const QUERIES = { bakery: 'where did you want to go on your birthday', pier: 'what is Sam afraid of', brother: 'where does Sams brother live', guitar: 'does Sam like to play guitar', contract: 'what do you know about the label contract', marathon: 'is Sam running something soon', allergy: 'what is Sam allergic to', apology: 'what did Sam forget about your sister', studio: 'what did Sam promise to show you', grandma: 'who taught Sam to sing' };
  let found = 0;
  const missed = [];
  FACTS.forEach(([k, t]) => {
    const rec = G.Rag.recall(lena, QUERIES[k], 6).join(' | ').toLowerCase();
    if (rec.includes(k) || rec.includes(t.split(' ').slice(-2).join(' ').toLowerCase())) found++; else missed.push(k);
  });
  check('after a year and 1,460 other memories they still recall at least 9 of 10 specific facts', found >= 9, `${found}/10 found; missed: ${missed.join(',')}`);
  check('their memory stays bounded (stream capped, vault capped)', lena.mem.length <= G.Mem.CAP && Object.values(lena.vault || {}).every((n) => n.lines.length <= 30 && (n.old || []).length <= 40), `${lena.mem.length}`);
  check('the whole person stays small in the save (< 60 KB)', JSON.stringify(lena).length < 60000, `${JSON.stringify(lena).length}`);

  H.summary('MEMORY GAPS CLOSED');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
