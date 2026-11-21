// Do they REMEMBER, and do they REACT to it (not with a generic line)? Memories are planted, then comments and DMs are collected for weeks.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 1;
  const M2 = G.Mem2;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const nobody = E.makeNpc({ name: 'Zed Park', handle: '@zedpark', role: 'friend', age: 27, bio: 'new in town', personality: 'quiet, kind, short texts', followers: 400 }, S);
  [mia, kai, dex].forEach((n) => { n.mem = []; n.touched = S.clock; n.aff = 40; n.trust = 50; });
  nobody.mem = [];
  mia.status = 'close_friend'; kai.status = 'rival'; kai.aff = -20; dex.status = 'friend';

  // plant: Mia was promised a lighthouse meeting; Kai was roasted in public; Dex was told a secret about the label contract
  G.Mem.add(mia, { kind: 'said', text: 'Sam promised: "I will be at the lighthouse at midnight."', who: ['me'], imp: 8, valence: -0.5, tags: ['promise'] });
  G.Mem.add(kai, { kind: 'shade', text: 'Sam mocked my new song in front of everyone', who: ['me'], imp: 8, valence: -0.7 });
  G.Mem.add(dex, { kind: 'said', text: 'Sam told me a secret: "the label contract is a trap."', who: ['me'], imp: 9, valence: 0.3, tags: ['secret'] });
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me they love jazz', who: ['me'], imp: 5, valence: 0.3 });

  /* ---------- 1. what they would say is about THEIR memory ---------- */
  const cm = M2.callback(mia, {}); const ck = M2.callback(kai, {}); const cd = M2.callback(dex, {});
  check('each person brings up THEIR strongest memory of you', /lighthouse/.test(cm.core) && /mocked my new song/.test(ck.core) && /label contract/.test(cd.core), [cm.core, ck.core, cd.core].join(' | '));
  check('a person with no memory of you has nothing to bring up (the line stays generic)', M2.callback(nobody, {}) === null);
  const rnd = () => 0.3;
  const lm = M2.say(mia, cm, 'comment', rnd, true); const lk = M2.say(kai, ck, 'comment', rnd, true); const ld = M2.say(dex, cd, 'dm', rnd, true);
  check('Mia (hurt, a broken promise) is sharp about it, in her voice', /lighthouse/i.test(lm) && /(funny|remember|memory|just saying|yeah)/i.test(lm), lm);
  check('Kai (the roasted rival) is sharp, Dex (a trusted secret) is careful: different tones', /mocked/i.test(lk) && /(contract|secret)/i.test(ld) && lm !== lk && lk !== ld, [lk, ld].join(' | '));

  /* ---------- 2. over weeks of comments, most reactions are personal where there is a memory ---------- */
  const mine = (txt) => { const p = E.addPost({ author: 'me', text: txt, buzz: 4, stats: { likes: 10, reposts: 0, replies: 0, views: 100 } }); return p; };
  const collect = (n, count) => {
    const out = [];
    const rnd = G.Persona.rngFrom('callback-variety|' + n.id);
    for (let i = 0; i < count; i++) {
      n.mem.forEach((m) => { delete m.cb; });
      const p = mine('new post number ' + i);
      out.push(G.Voice.comment(n, ['cheer', 'tease', 'curious', 'critique', 'agree'][i % 5], { post: p, rnd, authorName: S.player.name, authorHandle: S.player.handle }));
    }
    return out;
  };
  const cMia = collect(mia, 60); const cKai = collect(kai, 60); const cDex = collect(dex, 60); const cNo = collect(nobody, 60);
  const pers = (arr, re) => arr.filter((t) => re.test(t)).length;
  check('Mia often (not always) mentions the lighthouse promise', pers(cMia, /lighthouse|jazz/i) >= 6 && pers(cMia, /lighthouse|jazz/i) <= 45, String(pers(cMia, /lighthouse|jazz/i)));
  check('Kai brings up the roast; Dex brings up the secret', pers(cKai, /mocked|song/i) >= 6 && pers(cDex, /contract|secret/i) >= 6, `${pers(cKai, /mocked|song/i)} / ${pers(cDex, /contract|secret/i)}`);
  check('nobody mentions someone ELSE\'s memory (Mia never talks about the contract, Kai never about the lighthouse)', pers(cMia, /contract/i) === 0 && pers(cKai, /lighthouse|contract/i) === 0 && pers(cDex, /lighthouse|mocked/i) === 0);
  check('a stranger with no history never invents one', pers(cNo, /lighthouse|contract|mocked|promised/i) === 0);
  const uniq = (a) => new Set(a.map((t) => t.toLowerCase().replace(/[^a-z]/g, ''))).size / a.length;
  check('the reactions are varied (not the same line again and again)', uniq(cMia) > 0.4 && uniq(cKai) > 0.4, `${uniq(cMia).toFixed(2)} / ${uniq(cKai).toFixed(2)}`);

  /* ---------- 3. each memory is brought up at most once a day, and is rehearsed ---------- */
  mia.mem.forEach((m) => { delete m.cb; m.rh = 0; });
  const p1 = mine('first');
  let first = null;
  for (let i = 0; i < 80 && !first; i++) { const t = G.Voice.comment(mia, 'agree', { post: p1, rnd: Math.random, authorName: 'S', authorHandle: '' }); if (/lighthouse|jazz/i.test(t)) first = t; }
  const used = mia.mem.filter((m) => m.cb != null);
  check('when she brings it up, it is marked and rehearsed', !!first && used.length === 1 && used[0].rh === 1);
  let again = 0;
  for (let i = 0; i < 60; i++) { const t = G.Voice.comment(mia, 'agree', { post: p1, rnd: Math.random, authorName: 'S', authorHandle: '' }); if (new RegExp(used[0].text.includes('lighthouse') ? 'lighthouse' : 'jazz', 'i').test(t)) again++; }
  check('the same memory is not thrown at you again within a day', again === 0, String(again));
  S.clock += 1500;
  let later = 0;
  for (let i = 0; i < 80 && !later; i++) { const t = G.Voice.comment(mia, 'agree', { post: p1, rnd: Math.random, authorName: 'S', authorHandle: '' }); if (/lighthouse|jazz/i.test(t)) later = 1; }
  check('...but a day later it can come back', later === 1);

  /* ---------- 4. in DMs: a callback is one of their real reasons to write ---------- */
  mia.mem.forEach((m) => { delete m.cb; });
  const ctx = (n) => ({ rel: G.React.relation(S, n, 'me'), rnd: () => 0.3, st: n.status, waiting: false, last: undefined, myRecent: [], fam: false });
  const rm = G.Reasons.candidates(mia, S.clock, ctx(mia)).find((c) => c.kind === 'callback');
  const rd = G.Reasons.candidates(dex, S.clock, ctx(dex)).find((c) => c.kind === 'callback');
  check('their DMs include a callback to a specific memory (lighthouse / the secret)', !!rm && /lighthouse/i.test(rm.text) && !!rd && /contract|secret/i.test(rd.text), (rm && rm.text) + ' | ' + (rd && rd.text));
  const before = mia.mem.filter((m) => m.cb != null).length;
  G.Reasons.candidates(mia, S.clock, ctx(mia));
  check('only drafting a DM does not use up the memory (it counts when it is really sent)', mia.mem.filter((m) => m.cb != null).length === before);
  rm.done();
  check('when it is sent it is marked and rehearsed', mia.mem.some((m) => /lighthouse/.test(m.text) && m.cb != null && m.rh >= 1));

  /* ---------- 5. weeks of play: the DMs they really send are specific ---------- */
  H.freshWorld(); S = G.S;
  const a = Object.values(S.npcs).find((n) => n.name === 'Mia Vale'); const b = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  [a, b].forEach((n) => { n.status = 'friend'; n.aff = 60; n.trust = 60; n.mem = []; });
  G.Mem.add(a, { kind: 'said', text: 'Sam promised: "I will take you to the pier."', who: ['me'], imp: 8, valence: 0.4, tags: ['promise'] });
  G.Mem.add(b, { kind: 'said', text: 'Sam told me they hate coffee', who: ['me'], imp: 7, valence: -0.2 });
  const got = [];
  for (let d = 0; d < 20; d++) { E.tick(24 * 60); [a, b].forEach((n) => (S.dms[n.id] || []).forEach((m) => { if (m.from === n.id && !got.includes(m)) got.push(m); })); }
  const specific = got.filter((m) => /pier|coffee/i.test(m.text));
  check('over 20 days they really did write to you about those memories', specific.length >= 1, `${specific.length} of ${got.length} DMs: ${got.slice(0, 3).map((m) => m.text).join(' | ')}`);
  check('and most of their other messages are still about real things (not all callbacks)', got.length === 0 || specific.length < got.length);

  H.summary('NPC MEMORY: SPECIFIC REACTIONS, NOT GENERIC ONES');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
