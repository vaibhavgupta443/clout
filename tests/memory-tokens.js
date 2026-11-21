// Memory that lasts (a character recalls things from long ago) and prompts that stay small and cache-friendly.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.settings.approveActions = false;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');

  /* ---------- a character remembers far more than the last few things ---------- */
  G.Mem.add(mia, { kind: 'event', text: 'Sam gave me a red scarf at the lighthouse and promised to come back', who: ['me'], imp: 5 });
  for (let i = 0; i < 150; i++) G.Mem.add(mia, { kind: 'comment', text: 'saw a generic post number ' + i + ' about the weather', who: [], imp: 3 });
  check('memory holds well past the old 60-item limit', mia.mem.length > 100, mia.mem.length);
  const r1 = G.Rag.recall(mia, 'what about the scarf at the lighthouse?', 3);
  check('an old, specific memory is recalled for a question about it (not lost, not buried)', r1.some((x) => /red scarf/.test(x)), JSON.stringify(r1));
  S.dms[mia.id] = [{ id: 'm1', from: 'me', text: 'I promise I will never ghost you again, Mia', t: 5, read: true }].concat(Array.from({ length: 70 }, (_, i) => ({ id: 'x' + i, from: i % 2 ? mia.id : 'me', text: 'chat line ' + i, t: 10 + i, read: true })));
  const r2 = G.Rag.recall(mia, 'you promised never to ghost me', 4);
  check('what you said in a message long ago comes back when it matters', r2.some((x) => /never ghost you again/.test(x)), JSON.stringify(r2));
  mia.facts = ['Mia is afraid of deep water'];
  check('established facts are always recallable', G.Rag.recall(mia, 'swimming in the sea', 4).some((x) => /deep water/.test(x)));
  E.addChron('Mia and Kai had a screaming fight outside the studio');
  check('public events she was part of are recalled', G.Rag.recall(mia, 'the fight outside the studio', 4).some((x) => /screaming fight/.test(x)));
  check('recall is quick even with a big memory', (() => { const t0 = Date.now(); for (let i = 0; i < 20; i++) G.Rag.recall(mia, 'scarf', 5); return Date.now() - t0 < 600; })());

  /* ---------- the prompt: memory once, stable start, volatile end ---------- */
  const ctx = G.AI.context({ focus: [mia.id], scan: 'the scarf at the lighthouse' });
  const count = (re) => (ctx.match(re) || []).length;
  check('what she remembers appears once (not in two sections)', count(/REMEMBERS:/g) === 1 && !/ remembers: /.test(ctx.replace(/REMEMBERS:/g, '')), ctx.split('\n').filter((l) => /remember/i.test(l)).map((l) => l.slice(0, 60)).join(' || '));
  check('…and it is the relevant memory', /red scarf/.test(ctx));
  const ix = (re) => ctx.search(re);
  check('stable parts first (world, cast), changing parts last (clock, player numbers, feed)', ix(/^WORLD:/m) < ix(/^CAST/m) && ix(/^CAST/m) < ix(/^NOW:/m) && ix(/^NOW:/m) < ix(/^RECENT POSTS/m) && ix(/^PLAYER \(id/m) < ix(/^RECENT POSTS/m));
  const head1 = ctx.slice(0, ix(/^NOW:/m));
  S.clock += 95;
  S.player.followers += 123;
  const ctx2 = G.AI.context({ focus: [mia.id], scan: 'the scarf at the lighthouse' });
  check('the start of the prompt is identical when only the clock and numbers change (what provider caching needs)', ctx2.slice(0, ctx2.search(/^NOW:/m)) === head1 && head1.length > 150, head1.length);

  /* ---------- a turn: the long static instructions are first ---------- */
  const seen = [];
  G.AI.ready = () => true;
  G.AI.json = async (o) => { seen.push(o.user); return { cost: 0, data: { dms: [{ from: mia.id, text: 'hey you' }] } }; };
  await E.dm(mia.id, 'hi Mia');
  const p = seen[0];
  check('a DM turn puts the schema/instructions first and the situation last', !!p && p.indexOf('Return JSON') >= 0 && p.indexOf('Return JSON') < p.indexOf('WORLD:') && p.indexOf('WORLD:') < p.indexOf('PLAYER ACTION') && /ONLY the JSON object/.test(p.slice(-300)), p && p.slice(0, 80));
  check('…and the DM history is still in it', /DM|message/i.test(p));

  /* ---------- a huge town no longer makes a huge prompt ---------- */
  const many = {};
  for (let i = 0; i < 600; i++) many['z' + i] = { id: 'z' + i, name: 'Town ' + i, handle: '@town' + i, role: 'fan', age: 30, followers: 10, personality: 'x', status: 'stranger', aff: 0, rom: 0, riv: 0, trust: 0, touched: i, awareness: [{ kind: 'public_post', ref: S.postOrder[0], text: 'saw a post with some text in it' }], facts: [] };
  Object.assign(S.npcs, many);
  const big = G.AI.context({ simulation: true, focus: [], feedN: 9 });
  check('a 600-person town: the simulation prompt stays small (cast and exposure are capped)', big.length < 14000 && (big.match(/has actually seen/g) || []).length <= 14, big.length);
  Object.keys(many).forEach((k) => delete S.npcs[k]);

  /* ---------- the Director sends a smart slice of a long story ---------- */
  const filler = 'Nothing much happened that afternoon, people walked around and talked about ordinary things. '.repeat(260);
  S.stSummary = { text: 'PREMISE: Mia and Sam met at the old lighthouse. ' + filler + 'The secret vault key is hidden inside the piano at Harbor Studio. ' + filler + 'LATEST: Kai and Mia are barely speaking after the fight.', t: S.clock };
  const prompts = [];
  G.AI.json = async (o) => { prompts.push(o.user); return { cost: 0, data: { answer: 'ok', suggestions: [] } }; };
  G.settings.directorMemory = 'smart';
  await E.Story.ask('where is the vault key hidden?');
  const smart = prompts[prompts.length - 1];
  G.settings.directorMemory = 'full';
  await E.Story.ask('where is the vault key hidden?');
  const full = prompts[prompts.length - 1];
  check('smart mode is much smaller than sending the whole summary', smart.length < full.length * 0.6, `${smart.length} vs ${full.length}`);
  check('…and still carries the premise, the latest part and the relevant detail from the middle', /PREMISE: Mia and Sam/.test(smart) && /LATEST: Kai and Mia/.test(smart) && /vault key is hidden inside the piano/.test(smart));
  check('full mode sends everything', /PREMISE/.test(full) && /LATEST/.test(full) && full.length > 40000);

  H.summary('MEMORY + TOKENS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
