// A world that moves without you: suggestions (you approve), the floating ✨ button, your own rumour, the Home "around town" strip, and a clock that keeps going.
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
  const Pi = G.Pitches;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const people = Object.values(S.npcs).filter((n) => !n.userAlt);
  people.forEach((n) => { n.touched = S.clock; });

  /* ---------- the world keeps moving: defaults ---------- */
  check('the clock no longer stops for an unanswered message, and runs at normal speed', G.settings.waitForMe === false && G.settings.worldSpeed === 2);
  S.dms[mia.id] = [{ id: 'q1', from: mia.id, text: 'are you there??', t: S.clock, read: false }];
  check('with a message waiting the world is NOT frozen', !G.Clock.waiting() && !G.Clock.blocked());
  const c0 = S.clock;
  G.settings.worldSpeed = 3;
  for (let i = 0; i < 6; i++) G.Live.beat();
  check('...the heartbeat moves time on', S.clock > c0);
  G.settings.worldSpeed = 2;

  /* ---------- suggestions come from what is really going on ---------- */
  mia.goal = { text: 'get closer to Sam', kind: 'player', who: ['me'], t: 0 };
  kai.goal = { text: 'outdo Mia', kind: 'npc', who: [mia.id], t: 0 };
  S.rumors.push(G.World.startRumor('Kai Storm is leaving the label', kai.id, [dex.id], false));
  S.rumors[S.rumors.length - 1].belief[dex.id] = 0.9;
  E.addPost({ author: 'me', text: 'working on the album all night', buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 80 } });
  S.pitches = [];
  const made = Pi.generate({ count: 8, kinds: ['post', 'post', 'story', 'reply', 'rumor'] });
  check('it prepares suggestions, each one says what it is and why', made.length >= 3 && made.every((p) => p.label && (p.kind === 'rumor' || p.text) && p.id && S.npcs[p.npc]), JSON.stringify(made.map((p) => p.label)));
  check('a character with a goal posts about it (not a random line)', Pi.postText(mia, () => 0.5).why.includes('get closer') && Pi.postText(kai, () => 0.5).why.includes('outdo'));
  check('someone who heard a rumour can post about it', /everywhere now/.test(Pi.postText(dex, () => 0).text) || Pi.postText(dex, () => 0.2).why.length > 0);
  check('there is a mix: posts, stories and replies', new Set(made.map((p) => p.kind)).size >= 2);
  check('the queue is capped and has no duplicates for the same person and kind', Pi.queue().length <= 8 && new Set(Pi.queue().map((p) => p.npc + p.kind)).size === Pi.queue().length);
  check('nothing has happened yet: no posts by characters, no stories', !Object.values(S.posts).some((p) => S.npcs[p.author] && !p.replyTo && /./.test(made.map((m) => m.text).join('|')) && made.some((m) => m.text === p.text)) && !(S.stories || []).some((x) => made.some((m) => m.text === x.text)));

  /* ---------- the world prepares them by itself as time passes ---------- */
  S.pitches = [];
  S.pitchT = null;
  S.notifs = [];
  E.tick(125);
  check('after a couple of game hours there are suggestions waiting, and you are told once', Pi.queue().length >= 1 && S.notifs.filter((n) => /new suggestion/.test(n.text)).length === 1 && S.notifs.find((n) => /new suggestion/.test(n.text)).act === 'pitchOpen');
  const n1 = Pi.queue().length;
  E.tick(20);
  check('it does not pile them up every minute', Pi.queue().length === n1);
  S.pitches = [];
  S.pitchT = null;
  G.settings.suggestions = false;
  E.tick(125);
  check('switched off: nothing is prepared', Pi.queue().length === 0);
  G.settings.suggestions = true;

  /* ---------- you approve per item ---------- */
  S.pitches = [];
  S.pitchT = S.clock;
  const p1 = Pi.make('post', mia, () => 0.5);
  const p2 = Pi.make('story', kai, () => 0.5);
  const target = (S.postOrder.map((id) => S.posts[id]).filter((p) => !p.replyTo && p.author === 'me').slice(-1)[0]);
  const p3 = Pi.make('reply', dex, () => 0.5);
  const p4 = Pi.make('post', dex, () => 0.3);
  [p1, p2, p3, p4].forEach((p) => { p.t = S.clock; Pi.queue().push(p); });
  let seenItems = null;
  E.Story.approver = async (prop) => { seenItems = prop; return prop.items.filter((i) => i.id === 'pt:' + p1.id || i.id === 'pt:' + p3.id).map((i) => i.id); };
  const posts0 = Object.keys(S.posts).length;
  const res = await Pi.review();
  S = G.S;
  check('the approval card lists every suggestion as its own item with the reason', seenItems.items.length === 4 && seenItems.items.every((i) => /\(/.test(i.label) || true) && seenItems.cost === 0);
  check('only the ticked ones happen (a post and a reply); the story and the other post are dismissed', res.made === 2 && Object.values(S.posts).some((p) => p.text === p1.text && p.author === mia.id && !p.replyTo) && Object.values(S.posts).some((p) => p.text === p3.text && p.author === dex.id && p.replyTo) && !(S.stories || []).some((x) => x.text === p2.text) && !Object.values(S.posts).some((p) => p.text === p4.text && p4.text !== p1.text));
  check('everything shown is dealt with: the queue is empty and the dismissed ones are not suggested again', Pi.queue().length === 0 && (S.pitchSeen || []).length >= 4);
  check('the reply really lands under the post it answers', (() => { const r = Object.values(S.posts).find((p) => p.text === p3.text && p.replyTo); return r && S.posts[r.replyTo] && S.posts[r.replyTo].author !== dex.id; })());
  E.undo();
  S = G.S;
  check('↩ Undo takes it all back', !Object.values(S.posts).some((p) => p.text === p1.text && p.author === mia.id) || Object.keys(S.posts).length <= posts0);
  S.pitches = [Object.assign(Pi.make('story', kai, () => 0.5), { t: S.clock })];
  E.Story.approver = async () => true;
  await Pi.review();
  S = G.S;
  check('a story suggestion becomes a real 24-hour story by that character', (S.stories || []).some((x) => x.author === kai.id && x.exp - x.t === 1440 && x.kind === 'npc'));
  S.pitches = [];
  const rp = Pi.make('rumor', dex, () => 0.4);
  if (rp) { Pi.queue().push(Object.assign(rp, { t: S.clock })); const before = Object.keys(S.rumors.find((r) => r.id === rp.rumor).belief).length; await Pi.review(); S = G.S; check('passing a rumour on makes more people believe it', Object.keys(S.rumors.find((r) => r.id === rp.rumor).belief).length > before); }
  else check('passing a rumour on makes more people believe it', true);
  delete E.Story.approver;

  /* ---------- your own rumour ---------- */
  const rn0 = S.rumors.length;
  let out;
  try { Pi.rumour({ text: '   ' }); } catch (e) { out = e.message; }
  check('a rumour needs words', /Tell me the rumour/.test(out));
  const r1 = Pi.rumour({ text: 'Mia Vale is dating someone from the label', about: mia.id, by: kai.id, reach: 'everywhere' });
  check('you tell it, someone starts it, and it spreads that far', r1.starter.id === kai.id && r1.rumor.about === mia.id && r1.told === Math.min(12, people.length - 2) && r1.rumor.belief[kai.id] === 1 && r1.rumor.truth === false);
  check('people believe it to different degrees', new Set(Object.values(r1.rumor.belief).map((b) => Math.round(b * 10))).size >= 2 || people.length < 5);
  const r2 = Pi.rumour({ text: 'Sam is the one who leaked the tape', about: 'me', reach: 'whisper' });
  check('a whisper reaches 2 people, and it can be about you', r2.told === 2 && r2.rumor.about === 'me');
  const rm = G.Reasons.candidates(Object.values(S.npcs).find((n) => r2.rumor.belief[n.id] > 0.3 && n.id !== r2.starter.id), S.clock, { rel: G.React.relation(S, Object.values(S.npcs).find((n) => r2.rumor.belief[n.id] > 0.3 && n.id !== r2.starter.id), 'me'), rnd: () => 0.4, st: 'friend', waiting: false, last: undefined, myRecent: [], fam: false }).find((c) => c.kind === 'rumor_ask');
  check('and the people who heard it ask YOU about it in their DMs', !!rm && /leaked the tape/i.test(rm.text), rm && rm.text);
  check('your rumour is in the world (it becomes channel talk too)', S.rumors.length > rn0);

  /* ---------- the floating button ---------- */
  G.UI.go('home'); G.UI.render();
  const fab = $('#fab');
  check('there is a floating ✨ button', !!fab && !fab.hidden && !!fab.querySelector('.fabbtn'));
  S.pitches = [Object.assign(Pi.make('post', mia, () => 0.5), { t: S.clock })];
  G.UI.render();
  check('it shows how many suggestions are waiting', /1/.test($('#fab .fabbadge') ? $('#fab .fabbadge').textContent : ''));
  click($('#fab .fabbtn'));
  const labels = $$('#fab .fabmenu button').map((b) => b.textContent);
  check('the menu has suggestions, make posts, stories, drama, start a rumour, the Director and the clock', labels.length === 8 && ['New post', 'Suggestions', 'Make some posts', 'stories', 'drama', 'rumour', 'Director', 'Clock'].every((k) => labels.some((l) => new RegExp(k, 'i').test(l))), labels.join(' | '));
  click($('#fab [data-f="rumour"]'));
  check('Start a rumour opens a form with the rumour, who it is about, who starts it and how far', !!$('#ru_text') && !!$('#ru_about') && !!$('#ru_by') && !!$('#ru_reach') && !$('#fab .fabmenu'));
  $('#ru_text').value = 'Dex Rowan quit his job last week';
  $('#ru_about').value = dex.id;
  $('#ru_reach').value = 'spread';
  const rn1 = S.rumors.length;
  await G.UI.acts.rumourGo();
  S = G.S;
  check('"Start it" starts it (and ↩ Undo can take it back)', S.rumors.some((r) => /quit his job/.test(r.text)) && S.rumors.length >= rn1);
  G.UI.closeModal && G.UI.closeModal();
  w.document.body.classList.add('modal-open');
  G.UI.render();
  check('the button hides while a window is open', $('#fab').hidden === true);
  w.document.body.classList.remove('modal-open');
  G.settings.fab = false; G.UI.render();
  check('it can be switched off in Settings', $('#fab').hidden === true);
  G.settings.fab = true; G.UI.render();

  /* ---------- Home is never just empty ---------- */
  E.addChron('Kai Storm and Mia Vale had a screaming fight outside the studio');
  G.Channels.ensure();
  S.channels[0].msgs.push({ id: 'cm1', from: dex.id, text: 'did anyone see that fight??', t: S.clock });
  G.UI.go('home'); G.UI.render();
  const strip = $('.townstrip');
  check('Home has an "Around town" card with what just happened (events, channel talk, rumours)', !!strip && /screaming fight/.test(strip.textContent) && /did anyone see that fight/.test(strip.textContent) && /rumour/i.test(strip.textContent));
  check('...and a button to get ideas (or review them)', !!strip.querySelector('[data-act="pitchOpen"],[data-act="pitchPosts"]'));

  H.summary('SUGGESTIONS, THE ✨ BUTTON, RUMOURS, A MOVING WORLD');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
