// Retrieval (RAG), Director standing instructions, more messages without phantom "your post" texts, free world events, charts.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.settings.approveActions = false;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');

  /* ---------- RAG ---------- */
  const R = G.Rag;
  check('tokens: stems and drops filler words', R.tokens('The Lighthouse confessed').join() === 'lighthouse,confess', R.tokens('The Lighthouse confessed').join());
  check('chunks stay near 400 characters', R.chunks('One sentence here. '.repeat(60)).every((c) => c.length <= 460) && R.chunks('One sentence here. '.repeat(60)).length > 2);
  S.stSummary = { text: 'Mia grew up near the old lighthouse and fears the sea. ' + 'Filler about the weather and nothing important happened that day. '.repeat(14) + 'Kai secretly bought the recording studio on Harbor Street to surprise Mia.', t: S.clock };
  S.saga = 'Mia and Kai fell out after the festival.';
  S.lore.push({ id: 'l1', keys: ['harbor'], content: 'Harbor Street is where the old recording studio stands.', constant: false });
  S.directorLog = [{ t: S.clock - 50, text: 'Kai apologised to Mia in a long post', summary: '1 new post' }];
  const hit = R.retrieve('who bought the studio on Harbor Street?', { k: 4 });
  check('a question about the studio retrieves the studio chunk first (not the filler)', /studio/i.test(hit[0].text) && /bought the recording studio|recording studio stands/.test(hit[0].text), hit.map((x) => x.text.slice(0, 50)).join(' | '));
  check('canon (summary, lore, what you directed) is retrievable', R.retrieve('Kai apologised', { k: 5 }).some((x) => x.src === 'directed') && R.retrieve('lighthouse', { k: 5 }).some((x) => x.src === 'story'));
  const f = R.retrieve('how are things', { k: 6, focus: [mia.id] });
  check('focusing on a person prefers things about them', f.length > 0 && f.some((x) => x.who.includes(mia.id) || /Mia/.test(x.text)));
  check('context() is a labelled block with a size limit', /^RELEVANT MEMORY/.test(R.context('studio', { maxChars: 500 })) && R.context('studio', { maxChars: 500 }).length < 700);
  const m1 = G.Mem.score({ t: S.clock, imp: 5, who: [], tags: [], text: 'she confessed everything at the lighthouse' }, S.clock, { text: 'confess lighthouse' });
  const m0 = G.Mem.score({ t: S.clock, imp: 5, who: [], tags: [], text: 'we had pizza' }, S.clock, { text: 'confess lighthouse' });
  check('per-character memory scoring uses the same stemmed matching', m1 > m0);

  /* ---------- standing instructions reach the Director's prompts ---------- */
  const prompts = [];
  G.AI.json = async (o) => { prompts.push(o.user); return { cost: 0, data: { answer: 'ok', suggestions: [], posts: [] } }; };
  E.Admin.setOn(true);
  await E.Admin.run('/rules Always answer in two short paragraphs and treat the lighthouse as canon');
  check('/rules saves the text', /two short paragraphs/.test(S.directorRules.text));
  await E.Admin.run('/rules style narrator');
  const badStyle = await E.Admin.run('/rules style loud').then(() => false, () => true);
  check('/rules style sets the style, a bad style is refused', S.directorRules.style === 'narrator' && badStyle);
  await E.Story.ask('who bought the studio?');
  const p1 = prompts[prompts.length - 1];
  check('Ask carries the standing instructions, the style and retrieved memory', /STANDING INSTRUCTIONS/.test(p1) && /two short paragraphs/.test(p1) && /story narrator/.test(p1) && /RELEVANT MEMORY/.test(p1) && /studio/i.test(p1));
  await E.Story.run('Kai posted something about the studio');
  check('Act carries them too', /STANDING INSTRUCTIONS/.test(prompts[prompts.length - 1]) && /RELEVANT MEMORY/.test(prompts[prompts.length - 1]));
  await E.Admin.run('/rules clear');
  check('/rules clear removes them', !E.Story.rulesBlock());
  E.Admin.setOn(false);

  /* ---------- messages: more of them, and never about a post that does not exist ---------- */
  const runDays = (days) => { for (let i = 0; i < days * 24; i++) { if (i % 24 === 6) E.addPost({ author: 'me', text: 'working on something new today ' + i, buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 50 } }); E.tick(60); } }; // messages now need a real reason, so the player posts every day
  const dmCount = () => Object.values(G.S.dms).reduce((a, l) => a + l.filter((m) => m.from !== 'me').length, 0);
  const setup = (rate) => {
    H.freshWorld();
    S = G.S;
    G.World.postDial = () => 0;
    G.settings.dmRate = rate;
    G.settings.worldEvents = false;
    Object.values(S.npcs).forEach((n, i) => { if (!n.userAlt) { n.status = i % 3 === 0 ? 'rival' : i % 3 === 1 ? 'crush' : 'friend'; n.aff = 40; n.rom = 40; n.riv = 40; } });
    S.postOrder.forEach((id) => { if (S.posts[id] && S.posts[id].author === 'me') delete S.posts[id]; });
    S.postOrder = S.postOrder.filter((id) => S.posts[id]);
  };
  setup(0.5); runDays(6); const few = dmCount();
  setup(3); runDays(6); const lots = dmCount();
  const posty = /your (last )?post|saw your post|that post|you posted/i;
  const phantom = Object.values(G.S.dms).flat().filter((m) => m.from !== 'me' && posty.test(m.text));
  check('"Lots" gives clearly more messages than "Few" over the same time', lots > few, `few=${few} lots=${lots}`);
  check('with no post from you, nobody texts about "your post" (rivals included)', phantom.length === 0, phantom.map((m) => m.text).join(' | '));

  /* ---------- world events: free, no posts ---------- */
  setup(2);
  G.settings.worldEvents = true;
  const posts0 = Object.keys(S.posts).length;
  const ch0 = S.chronicle.length;
  let ev = null;
  for (let i = 0; i < 40 && !ev; i++) { S.sim.lastEventDay = null; ev = G.World.worldEvent(S.clock); }
  check('a world event is noted in the chronicle and nobody posts because of it', !!ev && S.chronicle.length > ch0 && Object.keys(S.posts).length === posts0, JSON.stringify(ev));
  let evDm = null;
  for (let i = 0; i < 80 && !evDm; i++) { S.sim.lastEventDay = null; G.World.worldEvent(S.clock); evDm = Object.values(S.dms).flat().find((m) => m.kind === 'eventreact'); }
  check('the people close to you message you about it', !!evDm && evDm.from !== 'me' && /\w{5,}/.test(evDm.text), evDm && evDm.text);
  G.settings.worldEvents = false;
  S.sim.lastEventDay = null;
  const c1 = S.chronicle.length;
  check('the switch turns events off', G.World.worldEvent(S.clock) === null && S.chronicle.length === c1);

  /* ---------- charts ---------- */
  const n = Object.values(S.npcs).find((x) => !x.userAlt);
  G.Charts.point(n, 1);
  G.Charts.point(n, 2);
  const card = G.Charts.npcCard(n);
  check('a character card has a personality radar and trend lines', /<svg/.test(card) && /polygon/.test(card) && /polyline/.test(card) && /Affinity/.test(card));
  G.Charts.sample({ d: 3, posts: 1, comments: 2, likes: 3, dms: 4, events: 0, follows: 1 });
  check('daily sampling records the world and the characters', S.hist.some((h) => h.d === 3 && h.dms === 4) && n.hist.length >= 2);
  {
    const day = G.U.dayOf(S.clock);
    S.sim.rollDay = day - 1;
    S.sim.day = { d: day - 1, posts: 7, comments: 2, likes: 3, stories: 0, dms: 4, events: 1, follows: 1 };
    G.World.ensure(S);
    let sampled = null, goal = 0, event = 0;
    const oldSample = G.Charts.sample, oldGoal = G.Goals.step, oldEvent = G.World.worldEvent;
    G.Charts.sample = (d) => { sampled = d; };
    G.Goals.step = () => { goal++; };
    G.World.worldEvent = () => { event++; };
    try { G.World.hourly(S.clock); } finally { G.Charts.sample = oldSample; G.Goals.step = oldGoal; G.World.worldEvent = oldEvent; }
    check('day rollover samples the prior counters and runs goals and the world event once', sampled && sampled.d === day - 1 && sampled.posts === 7 && goal === 1 && event === 1 && S.sim.rollDay === day && !('prevDay' in S.sim));
  }
  const wc = G.Charts.worldCard();
  check('the world pulse card renders lines and bars', /polyline/.test(wc) && /<rect/.test(wc) && /Messages you received/.test(wc));
  check('line() copes with a flat series and empty input', /<svg/.test(G.Charts.line([{ name: 'a', data: [5, 5, 5] }])) && G.Charts.line([]) === '');
  G.UI.go('storyteller');
  G.UI.render();
  check('the Storyteller page shows the instructions box and the charts', !!$('#st_rules') && /World pulse/.test(w.document.body.textContent));
  $('#st_rules').value = 'Be brief.';
  $('#st_style').value = 'concise';
  G.UI.acts.stRulesSave();
  check('saving the box stores the rules', S.directorRules.text === 'Be brief.' && S.directorRules.style === 'concise');

  H.summary('WORLD BRAIN');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
