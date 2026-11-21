// Common sense on the AI-written path: E.apply vets every NPC line with G.Mind.vet and sanity-checks relationship swings.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const noStats = { likes: 0, reposts: 0, replies: 0, views: 0 };
  const post = (author, text) => E.addPost({ author, text, buzz: 3, stats: Object.assign({}, noStats) });
  const repliesTo = (id) => Object.values(S.posts).filter((p) => p.replyTo === id);

  /* ---------- 1. a joke under a distress post ---------- */
  const sad = post(kai.id, 'my mom is in the hospital tonight, the doctor said it is serious. i am so scared');
  let ctx = { dropped: [] };
  S.npcs[mia.id].status = 'friend'; mia.aff = 60; mia.trust = 60;
  E.apply({ posts: [{ author: mia.id, text: 'lmao 😂 that is so you, touch grass', replyTo: sad.id }] }, ctx);
  const rs = repliesTo(sad.id).filter((p) => p.author === mia.id);
  check('a joking comment under a hospital post is not posted as written', !rs.some((p) => /lmao|touch grass/.test(p.text)), rs.map((p) => p.text).join(' | '));
  check('…it is reported in ctx.dropped', (ctx.dropped || []).some((d) => /Mia Vale/.test(d) && /flippant/.test(d)), JSON.stringify(ctx.dropped));
  check('…and when a fitting line exists it is a caring one', rs.length === 0 || G.Mind.supportive(rs[0].text) || /sorry|thinking of you|hope|thoughts/i.test(rs[0].text), rs.map((p) => p.text).join(' | '));

  // an enemy says nothing at all
  const foe = Object.values(S.npcs).find((n) => n.id !== mia.id && n.id !== kai.id);
  foe.aff = -80; foe.riv = 90; foe.status = 'enemy';
  S.npcRel.push({ a: foe.id, b: kai.id, type: 'enemy', note: '' }); G.React.dirty = true;
  const sad2 = post(kai.id, 'we lost my grandma last night. the funeral is on friday');
  ctx = { dropped: [] };
  E.apply({ posts: [{ author: foe.id, text: 'lol 😂 cry about it', replyTo: sad2.id }] }, ctx);
  check('an enemy joking at a funeral post is dropped, nothing is posted', repliesTo(sad2.id).length === 0 && ctx.dropped.length === 1, JSON.stringify(ctx.dropped));

  /* ---------- 2. a normal line still applies ---------- */
  const fun = post(kai.id, 'new playlist is up, give it a listen');
  ctx = { dropped: [] };
  E.apply({ posts: [{ author: mia.id, text: 'lol this slaps, adding it to my gym list 😂', replyTo: fun.id }] }, ctx);
  check('a normal funny comment under a normal post applies untouched', repliesTo(fun.id).some((p) => /slaps/.test(p.text)) && !(ctx.dropped || []).length, JSON.stringify(ctx.dropped));

  /* ---------- 3. self in the third person ---------- */
  const q = post(kai.id, 'what is everyone up to this weekend?');
  ctx = { dropped: [] };
  E.apply({ posts: [{ author: mia.id, text: 'Mia is going to the beach, Mia loves the beach', replyTo: q.id }] }, ctx);
  check('a line where Mia talks about Mia in the third person is dropped', repliesTo(q.id).length === 0 && (ctx.dropped || []).some((d) => /third person/.test(d)), JSON.stringify(ctx.dropped));

  /* ---------- 4. DMs and group messages go through the same gate ---------- */
  S.dms[mia.id] = [{ id: 'm1', from: 'me', text: 'my dad died this morning. i do not know what to do', t: S.clock, read: true }];
  ctx = { dropped: [] };
  E.apply({ dms: [{ from: mia.id, text: 'lmao 😂 ok and?' }] }, ctx);
  const dm = S.dms[mia.id];
  check('a flippant DM answering a grief message is not delivered as written', !dm.some((m) => /lmao/.test(m.text)) && (ctx.dropped || []).some((d) => /flippant/.test(d)), JSON.stringify(ctx.dropped) + JSON.stringify(dm.map((m) => m.text)));
  S.dms[mia.id] = [{ id: 'm2', from: 'me', text: 'did you see the match last night?', t: S.clock, read: true }];
  ctx = { dropped: [] };
  E.apply({ dms: [{ from: mia.id, text: 'hey, saw your new playlist earlier, it is great' }] }, ctx);
  check('a normal DM is delivered', S.dms[mia.id].some((m) => /new playlist/.test(m.text)) && !(ctx.dropped || []).length);
  const grp = { id: 'gtest', name: 'Test crew', members: [mia.id, kai.id], msgs: [], muted: false };
  S.groups[grp.id] = grp;
  {
    ctx = { dropped: [] };
    grp.msgs.push({ id: 'g-x', from: kai.id, text: 'i just got diagnosed with cancer, i am scared', t: S.clock, read: true });
    E.apply({ group_msgs: [{ group: grp.id, from: mia.id, text: 'haha 😂 skill issue' }] }, ctx);
    check('a joke in a group chat after bad news is stopped too', !grp.msgs.some((m) => /skill issue/.test(m.text)) && (ctx.dropped || []).length === 1, JSON.stringify(ctx.dropped));
  }

  /* ---------- 5. relationship swings ---------- */
  const lena = kai;
  Object.assign(lena, { aff: 0, rom: 0, riv: 0, trust: 10, status: 'stranger' });
  E.apply({ rel: [{ id: lena.id, aff: 90, rom: 90, riv: -90, trust: 90, status: 'partner' }] }, {});
  check('one exchange cannot swing a bond by an absurd amount', lena.aff <= E.REL_STEP.aff && lena.rom <= E.REL_STEP.rom && lena.trust <= 10 + E.REL_STEP.trust && lena.riv === 0, JSON.stringify([lena.aff, lena.rom, lena.riv, lena.trust]));
  check('a stranger never becomes a partner from one comment', lena.status !== 'partner' && lena.status !== 'dating', lena.status);
  Object.assign(lena, { aff: 0, rom: 0, riv: 0, trust: 10, status: 'stranger' });
  E.apply({ rel: [{ id: lena.id, aff: 40, trust: 40, imp: 9 }] }, {});
  check('a major event (imp >= 8) may move a bond a lot', lena.aff >= 30 && lena.trust >= 40, JSON.stringify([lena.aff, lena.trust]));
  Object.assign(lena, { aff: 40, rom: 50, riv: 0, trust: 40, status: 'crush' });
  E.apply({ rel: [{ id: lena.id, rom: 8, status: 'dating' }] }, {});
  check('a real crush with feelings already there can start dating', lena.status === 'dating', lena.status);
  Object.assign(lena, { aff: 40, rom: 50, riv: 0, trust: 40, status: 'dating' });
  E.apply({ rel: [{ id: lena.id, rom: 5, status: 'partner' }] }, {});
  check('…but "partner" needs real depth first (steps through dating)', lena.status === 'dating', lena.status);

  /* ---------- 5b. "does not acknowledge": an AI reply that ignores an insult or heavy news ---------- */
  {
    const dmx = Object.values(S.npcs).find((n) => n.id !== mia.id && n.id !== kai.id && n.id !== lena.id) || kai;
    const plan = (t) => E.dmPlan(dmx, { id: 'mx', from: 'me', text: t, t: S.clock });
    const ins = plan('you are a stupid ugly loser');
    check('the free brain classifies a plain insult as an insult', ins && ins.act === 'insult', ins && ins.act);
    let r = { dms: [{ from: dmx.id, text: 'lucky ur cute. 7pm.' }] };
    check('a reply that carries on past an insult is flagged and replaced', /ignored an insult/.test(E.dmAck(dmx, r, ins, 'you are a stupid ugly loser')) && !/lucky ur cute/.test(JSON.stringify(r.dms)), JSON.stringify(r.dms));
    r = { dms: [{ from: dmx.id, text: 'wow, that was rude' }] };
    check('a reply that reacts to it is left alone', E.dmAck(dmx, r, ins, 'x') === '' && r.dms.length === 1);
    const sad = plan('my dad died this morning. i do not know what to do');
    r = { dms: [{ from: dmx.id, text: 'ok see you friday' }] };
    check('a reply that carries on past a death is flagged', /ignored heavy news/.test(E.dmAck(dmx, r, sad, 'my dad died this morning. i do not know what to do')));
    r = { dms: [{ from: dmx.id, text: 'oh no, i am so sorry. i am here' }] };
    check('a caring reply is left alone', E.dmAck(dmx, r, sad, 'my dad died this morning') === '' && r.dms.length === 1);
    const hi = plan('good morning, how are you?');
    r = { dms: [{ from: dmx.id, text: 'morning! all good' }] };
    check('an ordinary message is never second-guessed', E.dmAck(dmx, r, hi, 'good morning') === '' && r.dms.length === 1);
  }

  /* ---------- 6. prompt ---------- */
  const sys = G.AI.system();
  check('the system prompt carries the short COMMON SENSE block', /COMMON SENSE/.test(sys) && G.AI.COMMON_SENSE.length < 600, G.AI.COMMON_SENSE.length);
  check('…and it is the same text every turn (provider caching)', G.AI.system() === sys);

  H.summary('COMMON SENSE ON THE AI PATH');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
