// Memory quality: importance by meaning, no flooding by chatter, duplicates merge, delicate disclosures are kept and surface, folding into belief lines.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  const M2 = G.Mem2;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  // the test world is small: add a few clones so there are enough different people
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const nm = ['Zoe Park', 'Leo Marsh', 'Ava Cole', 'Ian Frost', 'Nia Bell', 'Raj Patel', 'Tess Wu', 'Omar Haze'];
  nm.forEach((name, i) => { const c = JSON.parse(JSON.stringify(kai)); c.id = 'tx' + i; c.name = name; c.handle = '@tx' + i; c.mem = []; S.npcs[c.id] = c; });
  const others = Object.values(S.npcs).filter((n) => n !== mia && !n.userAlt).slice(0, 12);
  mia.mem = [];
  mia.touched = S.clock;

  /* ---------- importance by meaning ---------- */
  check('Mem.importance: a funeral is imp >= 8, small talk is not', G.Mem.importance('my dad died last night, the funeral is friday', 'said') >= 8 && G.Mem.importance('lol nice one', 'comment') <= 3);
  check('Mem.importance: good news >= 7', G.Mem.importance('I got the job!', 'said') >= 7);
  check('Mem.importance: a like stays tiny', G.Mem.importance('liked your post', 'like') <= 2);

  /* ---------- the player tells her something delicate ---------- */
  const made = M2.learn(mia, 'Honestly I have been in the hospital all week. The doctor said it is cancer.');
  const dis = mia.mem.find((m) => /hospital|cancer/.test(m.text));
  check('a delicate disclosure is learned even though no keyword rule matches', made.length >= 1 && !!dis, JSON.stringify(mia.mem.map((m) => m.text)));
  check('...and it is imp >= 8 and marked delicate', dis && dis.imp >= 8 && dis.sens >= 0.5 && dis.tags.includes('delicate'));
  const good = M2.learn(mia, 'We are expecting our first baby in spring.');
  check('good news about them is imp >= 7', good.length >= 1 && good.every((m) => m.imp >= 7), JSON.stringify(good.map((m) => [m.text, m.imp])));
  check('delicate things are not spread as gossip', (() => { dis.t = S.clock - 1000; for (let i = 0; i < 5; i++) M2.spread(); return !others.some((o) => (o.mem || []).some((m) => /cancer/.test(m.text))); })());

  /* ---------- duplicates merge ---------- */
  const before = mia.mem.length;
  const a = G.Mem.add(mia, { kind: 'event', text: 'Sam helped me move the sofa', who: ['me'], imp: 5, t: S.clock });
  const b = G.Mem.add(mia, { kind: 'event', text: 'Sam helped me move the sofa', who: ['me'], imp: 5, t: S.clock + 30 });
  check('the same thing twice is one memory with a count', a === b && b.n === 2 && mia.mem.length === before + 1 && b.t === S.clock + 30);
  const c = G.Mem.add(mia, { kind: 'event', text: 'Sam helped me move the sofa upstairs', who: ['me'], imp: 5, t: S.clock + 40 });
  check('a near-duplicate merges too', c === a && a.n === 3);
  const far = G.Mem.add(mia, { kind: 'event', text: 'Sam helped me move the sofa', who: ['me'], imp: 5, t: S.clock + 20000 });
  check('...but not when it happened days later', far !== a);

  /* ---------- a flood of chatter never evicts anything that matters ---------- */
  mia.pinTest = null; delete mia.pinTest;
  const promise = G.Mem.add(mia, { kind: 'said', text: 'Sam told me they promised to visit', who: ['me'], imp: 7, t: S.clock });
  for (let i = 0; i < 300; i++) {
    const o = others[i % others.length];
    G.Mem.add(mia, { kind: i % 3 === 0 ? 'rumor' : 'comment', text: i % 3 === 0 ? `${o.name} was talking about me in #news: "take number ${i} about pizza${i}"` : `I said in #town-talk: "@${o.name.split(' ')[0]} this. so much this ${i}"`, who: [o.id], imp: i % 3 === 0 ? 4 : 3, t: S.clock + 100 + i });
  }
  for (let i = 0; i < 80; i++) G.Mem.add(mia, { kind: 'like', text: `${others[i % others.length].name} liked my post ${i}`, who: [others[i % others.length].id], t: S.clock + 500 + i });
  check('300 chatter memories + 80 likes never evict the delicate disclosure', mia.mem.includes(dis));
  check('...nor the imp>=5 memories', mia.mem.includes(promise) && mia.mem.includes(a));
  const small = mia.mem.filter((m) => m.imp <= 4 && m.kind !== 'said');
  check('chatter is folded into gists (not 380 separate memories)', mia.mem.length < 60 && mia.mem.some((m) => m.n >= 5 && /\(x\d+\)/.test(m.text)), mia.mem.length + ' ' + small.length);
  check('a gist is a belief line with a count', mia.mem.some((m) => /keeps? .* \(x\d+\)/.test(m.text) || /^I keep .*\(x\d+\)/.test(m.text)), JSON.stringify(mia.mem.filter((m) => m.n).map((m) => m.text).slice(0, 4)));
  check('gists never rise to the level of real memories', mia.mem.filter((m) => m.gk).every((m) => m.imp <= 4));

  // a full mind with only strong memories: more chatter still cannot push one out
  const bob = others[0];
  bob.mem = []; bob.touched = S.clock;
  for (let i = 0; i < 200; i++) G.Mem.add(bob, { kind: 'event', text: `event number ${i} something unique${i} happened differently`, who: ['me'], imp: 5, t: S.clock + i });
  for (let i = 0; i < 40; i++) G.Mem.add(bob, { kind: 'comment', text: `I said in #news: "hello ${i} there"`, who: [others[1].id], imp: 3, t: S.clock + 300 + i });
  check('with a mind full of imp 5 memories, chatter does not evict them', bob.mem.filter((m) => m.kind === 'event').length === 200, bob.mem.filter((m) => m.kind === 'event').length + '');

  /* ---------- folding many small memories of one person ---------- */
  const eve = others[2];
  eve.mem = []; eve.touched = S.clock;
  const mm = others[3];
  for (let i = 0; i < 6; i++) G.Mem.add(eve, { kind: 'shade', text: `${mm.name} teased me about thing ${i} and shoes${i}`, who: [mm.id], imp: 5, valence: -0.2, t: S.clock + i * 100 });
  const strong = G.Mem.add(eve, { kind: 'fight', text: `${mm.name} and I had a huge fight about the rent`, who: [mm.id], imp: 8, valence: -0.8 });
  const pinned = G.Mem.add(eve, { kind: 'shade', text: `${mm.name} said I was a fraud, pinned`, who: [mm.id], imp: 5, valence: -0.5, pin: true });
  const folded = G.Mem.consolidate(eve);
  const line = eve.mem.find((m) => m.n >= 5 && m.kind === 'shade');
  check('consolidate folds six teases into one belief line with a count', folded >= 5 && !!line && /teas|shots/.test(line.text) && /\(x\d+\)/.test(line.text), JSON.stringify(eve.mem.map((m) => m.text)));
  check('...without losing pinned or strong memories', eve.mem.includes(strong) && eve.mem.includes(pinned));
  check('...and the strongest sample is filed in the vault', G.Vault.lines(eve).length >= 1);

  /* ---------- recall: delicate things always surface, "what do you know about X" works ---------- */
  mia.mem = mia.mem.filter((m) => m === dis || m.gk || m === promise);
  for (let i = 0; i < 40; i++) G.Mem.add(mia, { kind: 'event', text: `Sam and I talked about weather topic${i} and gardens${i} for ages`, who: ['me'], imp: 6, t: S.clock + 2000 + i * 50 });
  const r = G.Rag.recall(mia, 'what should we have for dinner tonight', 5);
  check('Rag.recall always surfaces the delicate disclosure when the player talks to her', r.some((x) => /cancer|hospital/.test(x)), JSON.stringify(r));
  const lines = G.Mem.promptLines(mia, { who: ['me'], text: 'dinner' }, 4);
  check('Mem.promptLines surfaces it too', lines.some((x) => /cancer|hospital/.test(x)), JSON.stringify(lines));
  M2.learn(mia, 'I really love jazz music.');
  const r2 = G.Rag.recall(mia, 'what did I tell you?', 5);
  check('"what did I tell you" answers from what the player said', r2.some((x) => /cancer|hospital/.test(x)) && r2.some((x) => /jazz/.test(x)), JSON.stringify(r2));
  const r3 = G.Rag.recall(mia, 'what do you know about jazz?', 5);
  check('"what do you know about X" puts X first', /jazz/.test(r3[0] || ''), JSON.stringify(r3));

  /* ---------- care, not a punchline ---------- */
  const cb = M2.callback(mia, { pub: true });
  check('a delicate memory is never turned into a public quip', !cb || !G.Mem.isDelicate(cb.m));
  const cbDm = M2.callback(mia, {});
  if (cbDm && G.Mem.isDelicate(cbDm.m)) check('...in a private message it becomes care', !/anyway|remember when/.test(M2.say(mia, cbDm, 'dm', () => 0.1, true)));
  else check('(callback picked something else for the DM)', true);

  /* ---------- save-safe ---------- */
  const js = JSON.stringify(mia.mem);
  check('no null / undefined keys in memories', !/null|undefined/.test(js) && mia.mem.every((m) => Object.values(m).every((v) => v != null)));
  check('all memories bounded by the cap', mia.mem.length <= G.Mem.CAP);

  H.summary('MIND MEMORY: BY MEANING, NO FLOOD, FOLDING, RECALL');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
