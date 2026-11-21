// Scale / performance / size limits.
const { boot, invariants } = require('./harness');
const H = boot(process.argv[2]);
const { w, G, E, U, check, state, prompts } = H;
const time = (fn) => { const t = Date.now(); const r = fn(); return [Date.now() - t, r]; };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  H.freshWorld();
  const S = G.S;

  /* a very large world */
  for (let i = 0; i < 400; i++) {
    const n = E.makeNpc({ name: 'NPC ' + i, handle: '@npc' + i, age: 20 + (i % 30), personality: 'p'.repeat(200), bio: 'b', followers: 100 + i, status: E.STATUSES[i % E.STATUSES.length], role: 'extra' });
    n.touched = i;
    for (let k = 0; k < 8; k++) n.memories.push('memory ' + k + ' of ' + i);
  }
  for (let i = 0; i < 780; i++) E.addPost({ author: i % 7 === 0 ? 'me' : i % 3 === 0 ? 'crowd' : 'n' + (1 + (i % 400)), text: 'post number ' + i + ' ' + 'lorem ipsum '.repeat(10), crowd: i % 3 === 0 ? { name: 'c', handle: '@c', stance: 'fan' } : null, replyTo: i > 30 && i % 4 === 0 ? 'p' + (i - 20) : null, buzz: i % 10, stats: { likes: i, reposts: 1, replies: 2, views: 100 } });
  for (let i = 0; i < 400; i++) { S.dms['n' + (1 + (i % 50))] = S.dms['n' + (1 + (i % 50))] || []; for (let k = 0; k < 30; k++) S.dms['n' + (1 + (i % 50))].push({ id: 'm' + i + '_' + k, from: k % 2 ? 'me' : 'n' + (1 + (i % 50)), text: 'dm text '.repeat(10), t: 1, read: true }); }
  for (let i = 0; i < 100; i++) E.addChron('chronicle entry ' + i);
  for (let i = 0; i < 200; i++) S.lore.push({ id: 'l' + i, keys: ['key' + i], content: 'lore '.repeat(60), constant: i < 3 });
  for (let i = 0; i < 80; i++) S.npcRel.push({ a: 'n' + (1 + (i % 100)), b: 'n' + (2 + (i % 100)), type: 'friend', note: 'x' });
  for (let i = 0; i < 12; i++) E.createGroup('G' + i, ['n1', 'n2', 'n3']);
  const bad = invariants(G);
  check('big world is consistent', bad.length === 0, bad.slice(0, 3).join('; '));
  check('big world: 400+ npcs, 700+ posts', Object.keys(S.npcs).length > 400 && S.postOrder.length >= 780);

  // prompt size stays bounded no matter how big the world is
  const ctx = G.AI.context({ focus: ['n1'], full: true });
  check('AI.context stays bounded with 400 npcs / 780 posts / 200 lore (< 14k chars)', ctx.length < 14000, ctx.length + ' chars');
  const [tctx] = time(() => { for (let i = 0; i < 50; i++) G.AI.context({ focus: ['n1'] }); });
  check('AI.context is fast (50 builds < 1.5s)', tctx < 1500, tctx + 'ms');
  check('lore keyword activation caps at 5 entries', (G.AI.context({ scan: Array.from({ length: 200 }, (_, i) => 'key' + i).join(' ') }).match(/\n- lore/g) || []).length <= 5);

  // every page renders in reasonable time on the big world
  for (const p of ['home', 'explore', 'town', 'notifs', 'messages', 'people', 'drama', 'director', 'shop', 'me', 'settings']) {
    const [ms] = time(() => G.UI.go(p));
    const html = w.document.querySelector('#page').innerHTML;
    check(`page ${p} renders on a huge world in < 2.5s`, ms < 2500 && !/Something broke/.test(html), ms + 'ms');
  }
  G.UI.go('people'); G.UI.peopleView = 'web';
  const [msw] = time(() => G.UI.render());
  check('social web with 400 characters renders (capped) fast', msw < 2500 && w.document.querySelectorAll('svg.web g.node').length <= 32, msw + 'ms');
  G.UI.peopleView = 'cards';

  // saving: size + speed
  const json = JSON.stringify(S);
  const [msSave] = time(() => G.Store.save());
  check('huge save serialises quickly', msSave < 1500, msSave + 'ms');
  console.log(`   (info) full state is ${(json.length / 1e6).toFixed(2)} MB of JSON; browser storage allows ~5 MB`);
  check('typical big-world save fits in the 5 MB browser quota', json.length < 5e6, (json.length / 1e6).toFixed(2) + 'MB');

  // trim keeps growth bounded
  for (let i = 0; i < 3000; i++) E.addPost({ author: 'n1', text: 'bulk ' + i, stats: { likes: 1, reposts: 0, replies: 0, views: 1 } });
  E.apply({}, {});
  check('post count is trimmed back down (<= cap)', S.postOrder.length <= E.POST_CAP && invariants(G).length === 0, String(S.postOrder.length));
  for (let i = 0; i < 200; i++) E.addNotif('reply', 'n' + i);
  check('notifications are capped (120)', S.notifs.length <= 120);
  for (let i = 0; i < 300; i++) E.addChron('more ' + i);
  check('chronicle hard-capped (120)', S.chronicle.length <= 120);

  // memory summariser on a big world: a single call handles a bounded number of jobs
  const jobs = G.Memory.pending(true);
  const count = (jobs.chron.length ? 1 : 0) + jobs.npc.length + jobs.dm.length + jobs.group.length + jobs.scene.length;
  check('memory jobs per call are bounded (<= 8)', count <= 8, String(count));
  const [mp, prompt] = time(() => G.Memory.buildPrompt(jobs));
  check('memory prompt size bounded (< 40k chars) and quick', prompt.length < 40000 && mp < 500, prompt.length + ' chars');
  prompts.length = 0;
  await G.Memory.run(true, true);
  const sysCall = prompts.find((p) => /You compress the memory/.test(p.system));
  check('memory compaction issues exactly one call', prompts.filter((p) => /You compress the memory/.test(p.system)).length === 1 && !!sysCall);

  // each AI turn builds a bounded prompt on the huge world
  prompts.length = 0;
  await E.speak({ mode: 'post', text: 'big world post' });
  await E.advance('day');
  await E.dm('n1', 'hi');
  const sizes = prompts.map((p) => p.user.length);
  check('all turn prompts on the huge world stay under 30k chars', sizes.every((n) => n < 30000), sizes.join(','));

  // town at scale
  G.S.popSize = 1000000;
  const [mt] = time(() => { for (let i = 0; i < 50; i++) G.Pop.pool(10); });
  check('1M town: 50 crowd pools in < 1s', mt < 1000, mt + 'ms');
  const [ms2] = time(() => G.Pop.page(41666, 24));
  check('1M town: last page instant', ms2 < 100 && G.Pop.page(41666, 24).people.length === 16);
  const [ms3, found] = time(() => G.Pop.page(0, 24, 'zzzzqqqq-no-such-thing'));
  check('1M town: a search with no hits terminates in < 6s', ms3 < 6000 && found.people.length === 0, ms3 + 'ms');
  let metAll = 0;
  for (let i = 0; i < 3000; i++) if (G.Pop.meet(i)) metAll++;
  check('promoting 3,000 town people works and stays consistent', metAll === 3000 && invariants(G).length === 0);
  check('met people appear in the cast once each', new Set(Object.values(S.popMet)).size === Object.keys(S.popMet).length);

  // rapid repeated actions
  H.freshWorld();
  let refused = 0, done = 0;
  const ps = [];
  for (let i = 0; i < 12; i++) ps.push(E.speak({ mode: 'post', text: 'rapid ' + i }).then((r) => (r === null ? refused++ : done++)));
  await Promise.all(ps);
  check('12 simultaneous posts: exactly one runs, the rest are refused', done === 1 && refused === 11, `done ${done}, refused ${refused}`);
  check('state valid after the pile-up', invariants(G).length === 0 && G.busy === false);
  H.summary('STRESS / SCALE');
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
