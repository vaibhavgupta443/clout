// DMs only for a real reason; suspicion that works like the Werewolf-agent papers; finger-pointing; investigation channels.
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
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  G.settings.worldEvents = false;
  G.settings.dmRate = 4;
  const R = G.Reasons;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const rnd = () => 0.4;
  const ctx = (n, o = {}) => Object.assign({ rel: G.React.relation(S, n, 'me'), rnd, st: n.status, waiting: false, last: (S.dms[n.id] || []).slice(-1)[0], myRecent: [], fam: false }, o);
  const allowed = new Set(['reactpost', 'followup', 'rumor_ask', 'accuse', 'point', 'goal', 'vent', 'plan', 'news', 'provoke', 'bonds:confession']); // confession is a real Bonds intent; the last five come from Desire

  /* ---------- nothing real, nothing sent ---------- */
  [mia, kai, dex].forEach((n) => { n.status = 'friend'; n.aff = 40; n.mem = []; n.goal = undefined; });
  S.rumors = []; S.storylines = []; S.chronicle = [];
  Object.values(S.npcs).forEach((n) => { S.dms[n.id] = []; });
  const day = G.U.dayOf(S.clock);
  const quiet = (n) => R.candidates(n, S.clock, ctx(n)).filter((r) => r.kind !== 'plan');
  check('with nothing going on, a friend has no reason to message you (only an optional plan with a time)', quiet(mia).length === 0);
  const dmCount = () => Object.values(G.S.dms).reduce((a, l) => a + l.filter((m) => m.from !== 'me').length, 0);
  const kinds = new Set();
  for (let i = 0; i < 24 * 8; i++) { E.tick(60); }
  S = G.S;
  Object.values(S.dms).flat().filter((m) => m.from !== 'me').forEach((m) => kinds.add(m.kind));
  check('over 8 quiet days the old filler is gone: no "check-in", "u up", hype or random flirting', ![...kinds].some((k) => ['checkin', 'share', 'latenight', 'hype', 'ghost', 'gossip', 'flirt', 'reactpost_np', 'provoke_np'].includes(k)), [...kinds].join());
  check('and whatever was sent had a real reason (a plan with a time, here)', [...kinds].every((k) => allowed.has(k) || ['eventreact', 'reply'].includes(k)), [...kinds].join());

  /* ---------- reacting to your post ---------- */
  S = G.S;
  const post = E.addPost({ author: 'me', text: 'finally told the label no thanks', buzz: 4, stats: { likes: 10, reposts: 0, replies: 0, views: 100 } });
  post.rx = { [mia.id]: { liked: true } };
  mia.status = 'crush'; mia.rom = 40; mia.aff = 50;
  const r1 = R.candidates(mia, S.clock, ctx(mia, { myRecent: [post] })).find((r) => r.kind === 'reactpost');
  check('a message about your post quotes your post', !!r1 && /told the label no thanks/i.test(r1.text), r1 && r1.text);
  kai.status = 'rival'; kai.riv = 50;
  const r2 = R.candidates(kai, S.clock, ctx(kai)).find((r) => r.kind === 'provoke');
  check('a rival only provokes you about something you really posted', !!r2 && /label no thanks/i.test(r2.text));
  S.postOrder = S.postOrder.filter((id) => id !== post.id);
  check('...and not when you have not posted', !R.candidates(kai, S.clock, ctx(kai)).some((r) => r.kind === 'provoke'));

  /* ---------- following up when you do not answer ---------- */
  dex.status = 'friend';
  S.dms[dex.id] = [{ id: 'd1', from: dex.id, text: 'can you help me move on saturday?', t: S.clock - 400, read: false }];
  const fu = R.candidates(dex, S.clock, ctx(dex, { waiting: true, last: S.dms[dex.id][0] })).find((r) => r.kind === 'followup');
  check('an unanswered question gets a follow-up that quotes it, once', !!fu && /help me move/i.test(fu.text));
  fu.done();
  check('...never twice', !R.candidates(dex, S.clock, ctx(dex, { waiting: true, last: S.dms[dex.id][0] })).some((r) => r.kind === 'followup'));

  /* ---------- a rumour about you ---------- */
  S.rumors.push({ id: 'r1', text: 'Sam is the one who leaked the demo tape', about: 'me', belief: { [mia.id]: 0.8, [dex.id]: 0.5, [kai.id]: 0.2 }, t: S.clock });
  mia.status = 'friend'; mia.trust = 25; mia.aff = 20;
  const ra = R.candidates(mia, S.clock, ctx(mia)).find((r) => r.kind === 'rumor_ask');
  check('someone who believes it confronts you with the rumour itself', !!ra && /leaked the demo tape/i.test(ra.text) && /explain|true|explanation/i.test(ra.text), ra && ra.text);
  const rb = R.candidates(dex, S.clock, ctx(dex)).find((r) => r.kind === 'rumor_ask');
  check('someone unsure asks you whether it is true', !!rb && /is it true|people are saying/i.test(rb.text));
  kai.status = 'best_friend'; kai.aff = 70;
  const rc = R.candidates(kai, S.clock, ctx(kai)).find((r) => r.kind === 'rumor_ask');
  check('a close friend who does not believe it tells you so', !!rc && /ignore the talk|do not believe/i.test(rc.text));
  ra.done();
  check('each person asks about a rumour once', !R.candidates(mia, S.clock, ctx(mia)).some((r) => r.kind === 'rumor_ask'));

  /* ---------- suspicion: evidence, trust in the accuser, smoothing ---------- */
  [mia, kai, dex].forEach((n) => { n.heard = {}; });
  // Reset the rumor target pair after the eight-day simulation above. Its graph and
  // relationship drift are stochastic, but this assertion is about evidence weighting.
  mia.status = 'acquaintance'; mia.aff = 0; mia.trust = 0; mia.mem = []; mia.psy.grudges = {};
  S.npcRel = S.npcRel.filter((e) => !((e.a === mia.id && e.b === kai.id) || (e.a === kai.id && e.b === mia.id)));
  S.rumors = [{ id: 'r2', text: 'Kai was seen near the studio that night', about: kai.id, belief: { [mia.id]: 0.9 }, t: S.clock }];
  const s0 = R.suspect(mia, kai.id);
  check('suspicion grows with a rumour the person believes about someone', s0 >= 0.4 && R.suspect(mia, kai.id) > R.suspect(dex, kai.id));
  mia.psy.grudges = { [kai.id]: 0.8 };
  check('...and with a grudge', R.suspect(mia, kai.id) > s0);
  dex.trust = 90; dex.aff = 70;
  const lo = { trust: 5, aff: -40, heard: {} };
  const hi = { trust: 90, aff: 70, heard: {} };
  S.npcs.speaker1 = { id: 'speaker1', name: 'S1', trust: 10, aff: 10 };
  R.hear(lo, 'x', 'speaker1', 0.7);
  R.hear(hi, 'x', 'speaker1', 0.7);
  check('the same accusation moves a listener who trusts the speaker more than one who does not (weighted by the accuser, not only the claim)', hi.heard.x > lo.heard.x * 1.5, `${hi.heard.x.toFixed(3)} vs ${lo.heard.x.toFixed(3)}`);
  const sm = { trust: 90, aff: 70, heard: {} };
  R.hear(sm, 'x', 'speaker1', 1);
  check('one accusation never flips a mind (smoothed: well under the maximum)', sm.heard.x < 0.3, sm.heard.x);
  for (let i = 0; i < 12; i++) R.hear(sm, 'x', 'speaker1', 1);
  check('repeated accusations from the crowd do add up, but stay bounded', sm.heard.x > 0.5 && sm.heard.x <= 1);
  delete S.npcs.speaker1;

  /* ---------- pointing the finger ---------- */
  S.storylines = [{ id: 'sl1', title: 'The leaked demo tape', summary: 'Someone leaked an unreleased track', heat: 80, status: 'active', participants: [mia.id, kai.id, dex.id] }];
  mia.status = 'friend'; mia.aff = 50; mia.trust = 60;
  const pt = R.candidates(mia, S.clock, ctx(mia)).find((r) => r.kind === 'point');
  check('a friend who suspects Kai tells YOU who they suspect, with their evidence', !!pt && /Kai/i.test(pt.text) && /leaked demo tape/i.test(pt.text) && /Kai was seen near the studio|I heard/i.test(pt.text), pt && pt.text);
  mia.aff = -30; mia.trust = 10;
  S.rumors.push({ id: 'r3', text: 'Sam sold the demo to a blog', about: 'me', belief: { [mia.id]: 0.9 }, t: S.clock });
  mia.psy.grudges = { me: 0.8 };
  // The previous suspicion fixture leaves a strong belief about Kai; isolate this
  // assertion so the player is the only well-supported suspect in this case.
  const kaiRumor = S.rumors.find((r) => r.id === 'r2');
  S.rumors = S.rumors.filter((r) => r.id === 'r3');
  const ac = R.candidates(mia, S.clock, ctx(mia)).find((r) => r.kind === 'accuse');
  check('someone who suspects YOU points the finger at you directly, with the reason', !!ac && /it was (you|u)\b|(you|u) were in the middle|explain/i.test(ac.text) && /demo tape/i.test(ac.text), ac && ac.text);
  if (ac) ac.done();
  if (kaiRumor) S.rumors.push(kaiRumor);
  check('they accuse once a day, not every hour', !R.candidates(mia, S.clock, ctx(mia)).some((r) => r.kind === 'accuse'));
  const th = R.theory(dex, S.storylines[0], rnd);
  check('in public, a person with no real suspicion asks or shares instead of making something up', th.mode !== 'accuse' && th.accused === null, JSON.stringify(th));
  const th2 = R.theory(mia, S.storylines[0], rnd);
  check('and one who really suspects someone names them and says why', th2.mode === 'accuse' && /demo tape/i.test(th2.text) && th2.accused, JSON.stringify(th2));

  /* ---------- the theories channel and case threads ---------- */
  const Ch = G.Channels;
  S.channels = null;
  Ch.ensure();
  check('there is a #theories channel (and older worlds get it too)', S.channels.some((c) => c.id === 'theories') && (() => { S.channels = S.channels.filter((c) => c.id !== 'theories'); Ch.ensure(); return S.channels.some((c) => c.id === 'theories'); })());
  S.rumors = S.rumors.filter((r) => r.id !== 'r3'); // from here the people suspect Kai, not you
  mia.psy.grudges = { [kai.id]: 0.8 };
  const th3 = S.channels.find((c) => c.id === 'theories');
  let said = 0;
  for (let i = 0; i < 40; i++) if (Ch.say(th3)) said++;
  check('#theories only talks about the open questions (storylines), and says something', said > 15 && th3.msgs.every((m) => !m.topic || /^mystery:/.test(m.topic)), `${said} / ${th3.msgs.map((m) => m.topic).filter((x, i, a) => a.indexOf(x) === i).join()}`);
  const pointed = th3.msgs.filter((m) => m.style === 'accuse' && m.accused);
  check('some of it is finger-pointing with evidence', pointed.length > 0 && pointed.every((m) => /demo tape/i.test(m.text)), pointed.length);
  const hit = pointed.find((m) => m.accused !== 'me' && S.npcs[m.accused]);
  if (hit) check('the person accused hears it (it is in their memory) and the crowd moves a little', (S.npcs[hit.accused].mem || []).some((x) => /accused me in #theories/.test(x.text)) && Object.values(S.npcs).some((n) => n.heard && n.heard[hit.accused] > 0));
  else check('the person accused hears it', false, 'nobody was accused');
  // a hot storyline: somebody opens a thread
  S.channels = S.channels.filter((c) => !c.case);
  S.chanLast = S.clock - 600;
  let opened = null;
  for (let i = 0; i < 60 && !opened; i++) { S.chanLast = S.clock - 600; Ch.step(); opened = S.channels.find((c) => c.case); }
  check('when a storyline gets hot someone opens a public thread for it, says why, and you are told', !!opened && opened.case === 'sl1' && /Opening this thread/i.test(opened.msgs[0].text) && S.notifs.some((n) => /opened #case-/.test(n.text) && n.act === 'chanGo'), opened && opened.name);
  for (let i = 0; i < 12; i++) { S.storylines.push({ id: 'sx' + i, title: 'Case ' + i + ' trouble', summary: 'x', heat: 90, status: 'active', participants: [mia.id, kai.id] }); }
  for (let i = 0; i < 80; i++) { S.chanLast = S.clock - 600; Ch.step(); }
  check('never more than 3 open threads at once', S.channels.filter((c) => c.case && !c.closed).length <= 3, S.channels.filter((c) => c.case && !c.closed).length);
  const cs = S.channels.find((c) => c.case === 'sl1');
  for (let i = 0; i < 30; i++) Ch.say(cs);
  check('a case thread talks only about its own case', cs.msgs.every((m) => !m.topic || m.topic === 'mystery:The leaked demo tape'), [...new Set(cs.msgs.map((m) => m.topic))].join());
  S.storylines.find((x) => x.id === 'sl1').status = 'resolved';
  S.chanLast = S.clock - 600;
  Ch.step();
  check('when the storyline is resolved the thread is closed', cs.closed === true && /Closed/.test(cs.about));

  /* ---------- you point a finger in public ---------- */
  const mem0 = (kai.mem || []).length;
  kai.trust = Math.max(kai.trust, 40); // (trust is 0..100, so it needs room to fall)
  const trust0 = kai.trust;
  Ch.send('theories', 'I think Kai leaked the tape and lied about it');
  const reply = th3.msgs.slice(-8).find((m) => m.from === kai.id && /not true|nothing to do/i.test(m.text));
  check('the person you accuse answers you, remembers it, and trusts you less', !!reply && (kai.mem || []).some((x) => /accused me in public/.test(x.text)) && kai.trust < trust0, JSON.stringify({ reply: !!reply, mem: (kai.mem || []).filter((x) => /accused me/.test(x.text)).length, trust: [trust0, kai.trust], last: th3.msgs.slice(-5).map((m) => (m.from === 'me' ? 'ME' : (S.npcs[m.from] || {}).name) + ': ' + m.text.slice(0, 40)) }));
  check('...and others hear it', Object.values(S.npcs).some((n) => n.id !== kai.id && n.heard && n.heard[kai.id] > 0));

  /* ---------- the page ---------- */
  G.UI.go('channels'); G.UI.render();
  check('the Channels page shows #theories and the case threads as tabs', $$tabs().some((t) => /theories/.test(t)) && $$tabs().some((t) => /case-/.test(t)));
  function $$tabs() { return Array.from(w.document.querySelectorAll('[data-act="chanOpen"]')).map((b) => b.textContent); }

  H.summary('REASONS (real DMs, suspicion, finger-pointing, case threads)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
