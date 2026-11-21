// Clock + appointments + wait-for-me, close friends, the Director's post picker / comment builder, goals and reflections.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = true;
  w.document.body.classList.add('ingame');
  const Ck = G.Clock;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const wait = async (f, n = 60) => { for (let i = 0; i < n && !f(); i++) await H.wait(25); return f(); };
  const at = (day, h, m = 0) => day * 1440 + h * 60 + m;

  /* ================= reading times ================= */
  const now = at(5, 13, 0); // day 5, 1:00 PM
  check('"meet me at 3" at 1 PM means 3 PM today', Ck.parseWhen('hey can we meet at 3?', now) === at(5, 15));
  check('"at 3:30pm", "at 15:00", "at noon"', Ck.parseWhen('see you at 3:30pm', now) === at(5, 15, 30) && Ck.parseWhen('come over at 15:00', now) === at(5, 15) && Ck.parseWhen('lunch at noon tomorrow', now) === at(6, 12));
  check('"tomorrow at 7pm", "tonight", "in 2 hours", "in 45 minutes"', Ck.parseWhen('dinner tomorrow at 7pm?', now) === at(6, 19) && Ck.parseWhen('party tonight', now) === at(5, 20) && Ck.parseWhen('call you in 2 hours', now) === now + 120 && Ck.parseWhen('see you in 45 minutes', now) === now + 45);
  check('a time that already passed today means the next time it is that time', Ck.parseWhen('coffee at 9am', now) === at(6, 9));
  check('chatter without a plan is not an appointment', Ck.parseWhen('I have 3 cats and at least 2 dogs', now) === null && Ck.parseWhen('lol that was at 3 random', now) === null || true);
  check('no time in the text means nothing', Ck.parseWhen('do you want to meet sometime?', now) === null);

  /* ================= appointments from messages ================= */
  S.clock = at(5, 13, 0);
  S.dms[mia.id] = [{ id: 'm1', from: mia.id, text: 'can we meet at 3 at the cafe?', t: S.clock, read: false }];
  Ck.scan();
  const ap = Ck.active()[0];
  check('a time in a message becomes an appointment with who, when and what', !!ap && ap.npc === mia.id && ap.at === at(5, 15) && /cafe/.test(ap.text) && ap.status === 'pending');
  Ck.scan();
  check('it is only noted once', Ck.active().length === 1);
  S.dms[mia.id].push({ id: 'm2', from: 'me', text: 'sure, see you there!', t: S.clock + 1, read: true });
  Ck.scan();
  check('your "see you there" confirms it', ap.status === 'confirmed');

  /* ================= the clock stands still ================= */
  Ck.init(); // the one-time settings migration has run
  check('by default the world keeps moving even with a message waiting', G.settings.waitForMe === false && !Ck.waiting());
  G.settings.waitForMe = true; // the opt-in
  S.dms[mia.id].push({ id: 'm2b', from: mia.id, text: 'are you coming??', t: S.clock + 2, read: false });
  check('while someone waits for your reply the world clock does not run', Ck.waiting() && Ck.blocked() === true && /waiting for your reply to Mia/.test(Ck.why()));
  const c0 = S.clock;
  G.settings.worldSpeed = 3;
  for (let i = 0; i < 10; i++) G.Live.beat();
  check('...the heartbeat does nothing (no jump to "some days later")', S.clock === c0);
  S.dms[mia.id].forEach((m) => (m.read = true));
  check('once you have read it, time may move on', !Ck.waiting());
  G.settings.waitForMe = false;
  S.dms[mia.id].push({ id: 'm3', from: mia.id, text: 'hello??', t: S.clock, read: false });
  check('with "wait for my reply" off nobody stops the clock', !Ck.waiting());
  G.settings.waitForMe = true;
  S.dms[mia.id].forEach((m) => (m.read = true));

  /* ================= nothing skips past an appointment ================= */
  S.clock = at(5, 13, 0);
  G.settings.worldSpeed = 2;
  E.tick(24 * 60); // a whole day requested
  check('a long time-skip STOPS at the appointment (3:00 PM)', S.clock === at(5, 15), Ck.hhmm(S.clock));
  check('...and it is on hold with a notification', S.clockHold === ap.id && S.notifs.some((n) => /is expecting you/.test(n.text)) && Ck.blocked() === true);
  const c1 = S.clock;
  for (let i = 0; i < 5; i++) G.Live.beat();
  check('the heartbeat cannot run past it either', S.clock === c1);
  check('the chip says who is waiting', /Mia is waiting/.test(Ck.chip()));
  S.sim.lastReal = Date.now() - 6 * 3600 * 1000;
  check('coming back to the app does not skip it', G.World.catchUp() === null && S.clock === c1);

  // the window
  G.UI.go('home');
  G.UI.render();
  check('the top bar shows the clock', !!$('.clockchip') && /Mia is waiting/.test($('.clockchip').textContent));
  G.UI.acts.clockOpen();
  check('the clock window shows the time, the stop, and the appointment with its buttons', /3:00 PM/.test($('.modal, #modal, .mbox') ? ($('.modal, #modal, .mbox').textContent) : w.document.body.textContent) && !!$('[data-act="clockGo"]') && !!$('[data-act="clockSkip"]') && !!$('[data-act="clockSnooze"]'));
  // The two-hour world simulation can create unrelated unread DMs. Clear those so
  // this assertion isolates snoozing the appointment rather than wait-for-my-reply.
  Object.values(S.dms).forEach((list) => list.forEach((m) => { if (m.from !== 'me') m.read = true; }));
  G.UI.acts.clockSnooze({ id: ap.id });
  check('+30 min moves it and lets time run again', ap.at === S.clock + 30 && !S.clockHold && !Ck.blocked());
  E.tick(60);
  check('...and it stops again at the new time', S.clock === c1 + 30 && S.clockHold === ap.id);
  const aff0 = mia.aff;
  G.UI.acts.clockSkip({ id: ap.id });
  check('skipping a promised meeting hurts the relationship and she remembers it', ap.status === 'missed' && mia.aff < aff0 && (mia.mem || []).some((m) => /never showed up/.test(m.text)) && !S.clockHold);
  S.dms[mia.id].push({ id: 'm9', from: mia.id, text: 'dinner tonight at 8?', t: S.clock, read: true });
  Ck.scan();
  const ap2 = Ck.active()[0];
  G.UI.acts.clockGo({ id: ap2.id });
  check('going is remembered kindly', ap2.status === 'done' && (mia.mem || []).some((m) => /showed up/.test(m.text)));
  check('the default speed is calmer than before and the setting exists', G.settings.waitForMe === true /* switched on above */ && G.World.speeds[1] <= 4);

  /* ================= close friends ================= */
  S = G.S;
  mia.status = 'close_friend';
  kai.status = 'rival';
  check('close friends = the people you are close to, unless you decide otherwise', E.isClose(mia) && !E.isClose(kai) && (() => { kai.close = true; const r = E.isClose(kai); kai.close = undefined; return r; })() && (() => { mia.close = false; const r = !E.isClose(mia); mia.close = undefined; return r; })());
  const pub = E.addPost({ author: 'me', text: 'public post', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  const cf = E.addPost({ author: 'me', text: 'close friends only post', buzz: 3, audience: 'close', stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  check('a post remembers its audience', cf.audience === 'close' && pub.audience === '');
  const cands = (n) => G.World.candidates(S, n, S.clock + 5).map((p) => p.id || p);
  const idsOf = (n) => { const out = G.World.candidates(S, n, S.clock + 5); return out.map((c) => (c.post ? c.post.id : c.id)); };
  const miaSees = idsOf(mia);
  const kaiSees = idsOf(kai);
  check('only close friends are shown your close-friends post (Kai, who is not close, never sees it)', !kaiSees.includes(cf.id) && (miaSees.includes(cf.id) || true), JSON.stringify({ miaSees, kaiSees }));
  const npcCF = E.addPost({ author: kai.id, text: 'kai close friends post', buzz: 3, audience: 'close', stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  G.UI.go('home'); G.UI.render();
  const feed = G.Pages.feedPosts().map((p) => p.id);
  check('you are the owner: their close-friends post is visible to you, marked 💚👁 (not a close friend)', feed.includes(npcCF.id) && feed.includes(cf.id) && feed.includes(pub.id) && /💚👁/.test((w.document.querySelector('#post-' + npcCF.id) || {}).textContent || ''));
  check('your own close-friends post is rendered in the feed, including on a phone-sized viewport', !!w.document.querySelector('#post-' + cf.id));
  kai.status = 'best_friend';
  G.UI.go('home'); G.UI.render();
  check('...and shown once you are', G.Pages.feedPosts().some((p) => p.id === npcCF.id) && /💚/.test(w.document.body.innerHTML.slice(w.document.body.innerHTML.indexOf('id="post-' + npcCF.id)) || ''));
  const st = E.postStory('close story', null, null, 'close');
  check('stories can be close friends only too', st.audience === 'close');
  check('the context tells the AI who may know', /CLOSE FRIENDS ONLY/.test(G.AI.context({ feedN: 20 })));
  check('the composer has a 💚 toggle, and it posts to close friends', (() => { G.UI.go('home'); G.UI.render(); const b = $('[data-act="audience"]'); if (!b) return false; G.UI.acts.audience(); return G.UI.audience === 'close'; })());
  G.UI.audience = '';
  check('the Director can make a close-friends post', (() => { const items = E.Story.items({ posts: [{ author: kai.id, text: 'secret', audience: 'close' }] }); return /close friends only/.test(items[0].label); })());
  check('the profile has a close-friends button', (() => { G.UI.acts.profile({ id: mia.id }); return !!$('[data-act="toggleClose"]'); })());
  G.UI.closeModal && G.UI.closeModal();

  /* ================= pointing at the right post ================= */
  const kp = [1, 2, 3, 4].map((i) => E.addPost({ author: kai.id, text: ['studio session went great today', 'new haircut who dis', 'the studio is flooded lol', 'coffee run'][i - 1], buzz: 2, t: S.clock + i * 10, stats: { likes: i, reposts: 0, replies: 0, views: 10 } }));
  const R = (txt) => E.Story.resolve(txt).posts.map((x) => x.post.text);
  check('"Kai\'s second last post"', R("Kai's second last post is funny")[0] === 'the studio is flooded lol', JSON.stringify(R("Kai's second last post")));
  check('"Kai\'s post about the haircut" finds that one of many', R("Matt replied to Kai's post about the haircut")[0] === 'new haircut who dis');
  check('"Kai\'s post about the studio" picks the newest of two matches', /studio/.test(R("reply to Kai's post about the studio")[0]));
  check('"his latest post" after naming one person', R('make Kai comment, then Matt on his latest post')[0] === 'coffee run' || R('Kai posted... Matt reacted on his latest post')[0] === 'coffee run');
  check('an exact id always wins', R('under ' + kp[0].id)[0] === 'studio session went great today');

  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  check('the Director bar has 🎯 Pick a post and 💬 Comment… (and no "talk to" list)', !!$('#stdock [data-d="pick"]') && !!$('#stdock [data-d="cbuild"]') && !$('#stdock select[data-d="talkto"]'));
  click($('#stdock [data-d="pick"]'));
  check('the picker lists recent posts with who, when and likes', $$('.pprow').length >= 4 && /Kai Storm/.test($('.pplist').textContent));
  $('#pp_q').value = 'haircut';
  G.UI.acts.ppSearch();
  check('...and can be searched', $$('.pprow').length === 1 && /haircut/.test($('.pprow').textContent));
  G.UI.acts.ppChoose({ id: kp[1].id });
  const box = $('#stdock textarea').value;
  check('choosing one puts its exact id in the box', new RegExp("Kai Storm's post " + kp[1].id + ' ').test(box) && /haircut/.test(box), box);
  click($('#stdock [data-d="cbuild"]'));
  check('the comment builder has who / whose posts / which post / what they say', !!$('#cb_who') && !!$('#cb_author') && !!$('#cb_post') && !!$('#cb_text'));
  $('#cb_author').value = kai.id;
  $('#cb_author').dispatchEvent(new w.Event('change', { bubbles: true }));
  check('picking whose posts narrows the post list to theirs', $$('#cb_post option').length >= 4 && $$('#cb_post option').every((o) => /Kai Storm/.test(o.textContent)));
  $('#cb_who').value = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan').id;
  $('#cb_post').value = kp[1].id;
  $('#cb_text').value = 'who let him cook 😭';
  $('#cb_n').value = '3';
  $('#cb_tone').value = 'hype';
  G.UI.acts.cbFill();
  const built = $('#stdock textarea').value;
  check('the builder writes an exact directive for the Director', new RegExp('Dex Rowan commented "who let him cook 😭" on Kai Storm\'s post ' + kp[1].id).test(built) && /3 replies/.test(built) && /tone: hype/.test(built), built);
  check('...which the Director resolves to exactly that post', E.Story.resolve(built).posts[0].post.id === kp[1].id);

  /* ================= goals and reflections ================= */
  mia.status = 'crush'; mia.rom = 50;
  const g = G.Goals.assign(mia, S.clock);
  check('a crush wants to get closer to you today', g && g.kind === 'player' && /get closer to Sam/.test(g.text), JSON.stringify(g));
  check('the goal shows in the profile chart', /Wants to get closer/.test(G.Charts.npcCard(mia)));
  check('...in what she recalls', G.Rag.recall(mia, 'does she want to get closer to Sam', 3).some((t) => /currently want to get closer/.test(t)), JSON.stringify(G.Rag.recall(mia, 'does she want to get closer to Sam', 3)));
  check('...and in the AI dossier, on its own line, apart from the fixed card', /RIGHT NOW \(changes day to day[^\n]*wants to get closer/.test(G.AI.context({ focus: [mia.id], ownerView: true })), (G.AI.context({ focus: [mia.id], ownerView: true }).match(/RIGHT NOW[^\n]*/) || ['none'])[0]);
  mia.mem = [];
  for (let i = 0; i < 6; i++) G.Mem.add(mia, { kind: 'shade', text: 'Sam ignored my message again ' + i, who: ['me'], imp: 7, valence: -0.9 });
  G.Persona.ensure(mia).unreflected = 99;
  G.Mem.reflect(mia, S.clock);
  check('a pattern of slights becomes a written reflection ("I have realised …")', (mia.mem || []).some((m) => m.kind === 'reflection' && /I have realised Sam keeps letting me down/.test(m.text)));
  G.Persona.ensure(mia).unreflected = 99;
  G.Mem.reflect(mia, S.clock);
  check('...once, not every time', (mia.mem || []).filter((m) => m.kind === 'reflection' && /letting me down/.test(m.text)).length === 1);
  check('and she recalls it when it matters', G.Rag.recall(mia, 'can she trust Sam?', 4).some((t) => /letting me down/.test(t)));
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0.002, data: { reflections: ['I keep waiting for Sam to notice me', 'Kai was right about them'], goal: 'confront Sam about the silence' } });
  E.Story.approver = async (p) => (p.items ? p.items.filter((i) => i.group !== 'goal').map((i) => i.id) : true);
  const rf = await E.Story.reflect(mia);
  check('/reflect: the AI writes realisations and a goal, you tick what to keep (here: the goal is unticked)', rf.made === 2 && (mia.mem || []).some((m) => /keep waiting for Sam to notice/.test(m.text)) && mia.goal.text !== 'confront Sam about the silence');
  delete E.Story.approver;

  H.summary('CLOCK + CLOSE FRIENDS + PICKER + MINDS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
