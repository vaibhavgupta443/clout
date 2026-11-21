// New people only join when you answer them (DM request / comment), and the 💞 Lover tier (a label only).
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
  w.document.body.classList.add('ingame');
  const L = G.Leads;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const n0 = Object.keys(S.npcs).length;

  /* ---------- a stranger reaches out for a real reason ---------- */
  check('with nothing going on nobody reaches out (no reason, no stranger)', (() => { S.leadT = null; S.rumors = []; S.chronicle = []; return L.tick() === null; })());
  const ru = G.World.startRumor('Sam is secretly leaving the label', 'me', [dex.id], false);
  ru.belief[dex.id] = 0.8; ru.belief[mia.id] = 0.5;
  S.leadT = null;
  const realRand = G.World.rnd;
  G.World.rnd = () => 0.1; // always rolls "yes"
  const lead = L.tick();
  G.World.rnd = realRand;
  check('a rumour that spread makes a stranger write, and their message names it', !!lead && lead.status === 'new' && /leaving the label/.test(lead.text) && lead.rumor === ru.id && lead.age >= 18);
  check('they are NOT in the cast', Object.keys(S.npcs).length === n0 && !Object.values(S.npcs).some((n) => n.name === lead.name));
  check('you are told', S.notifs.some((x) => /heard about you/.test(x.text) && x.act === 'leadOpen'));
  G.UI.go('home'); G.UI.render();
  check('Home shows a "New people" card with Reply and Ignore', !!$('.leadcard') && new RegExp(lead.name.split(' ')[0]).test($('.leadcard').textContent) && !!$('[data-act="leadReply"]') && !!$('[data-act="leadIgnore"]'));
  G.UI.go('messages'); G.UI.render();
  check('and the same card is at the top of Messages', !!$('.leadcard'));
  check('it never makes more than 2 waiting at once', (() => { S.leadT = null; G.World.rnd = () => 0.1; L.tick(); S.leadT = null; L.tick(); S.leadT = null; L.tick(); G.World.rnd = realRand; return L.list('new').length <= 2; })());

  /* ---------- ignore + fade ---------- */
  const other = L.list('new').find((l) => l.id !== lead.id);
  if (other) { G.UI.acts.leadIgnore({ id: other.id }); check('ignoring one removes the card and nobody joins', other.status === 'ignored' && Object.keys(S.npcs).length === n0); }
  const fade = { id: 'ldx', idx: 77, name: 'Old Lead', handle: '@old', age: 30, via: 'dm', text: 'hi', why: 'x', t: S.clock - 3000, status: 'new' };
  S.leads.push(fade);
  S.leadT = null;
  L.tick();
  check('after two game days an unanswered stranger fades', fade.status === 'expired');

  /* ---------- you answer in the card: they join as full cast ---------- */
  G.UI.go('home'); G.UI.render();
  const input = $('#ldr_' + lead.id);
  check('answering with nothing is refused', (() => { try { G.Leads.join(lead.id, '   '); return false; } catch (e) { return /answer/i.test(e.message); } })());
  input.value = 'hey! no, that is not true. who told you?';
  G.UI.acts.leadReply({ id: lead.id });
  S = G.S;
  const joined = S.npcs[lead.npc];
  check('they join as a real character with the profile they had', !!joined && joined.name === lead.name && joined.pop === lead.idx && Object.keys(S.npcs).length === n0 + 1 && lead.status === 'joined');
  check('a DM thread exists: what they wrote, your answer, and their reply', S.dms[joined.id].length === 3 && S.dms[joined.id][0].text === lead.text && S.dms[joined.id][1].from === 'me' && S.dms[joined.id][2].from === joined.id && !S.dms[joined.id][2].read);
  check('they remember how they heard about you and what you said', (joined.mem || []).some((m) => /leaving the label/.test(m.text) && /not true/.test(m.text)));
  check('the rumour they carried is now believed by them too', ru.belief[joined.id] >= 0.6);
  check('they are an adult acquaintance, and it is in the chronicle and your alerts', joined.status === 'acquaintance' && joined.age >= 18 && S.chronicle.some((c) => /joined the story/.test(c.text)) && S.notifs.some((x) => /joined your story/.test(x.text)));
  check('an answered lead cannot join twice', L.join(lead.id, 'again') === null);
  G.UI.go('messages'); G.UI.render();
  check('Messages now lists them like anyone else', !!$('.convo[data-id="' + joined.id + '"]'));

  /* ---------- you answer in the comments ---------- */
  const post = E.addPost({ author: 'me', text: 'working on the album', buzz: 3, stats: { likes: 1, reposts: 0, replies: 0, views: 500 } });
  S.leads.forEach((l) => { if (l.status === 'new') l.status = 'ignored'; });
  const rs = [{ w: 1, post: post.id, line: (q) => `I saw "${q}" going around. who are you really?`, q: 'working on the album' }];
  const cl = L.make(rs[0], 'comment');
  check('a comment lead is a comment under your post from a stranger (not part of the cast)', !!cl && !!S.posts[cl.comment] && S.posts[cl.comment].replyTo === post.id && S.posts[cl.comment].author === 'crowd' && S.posts[cl.comment].crowd.lead === cl.id && !Object.values(S.npcs).some((n) => n.name === cl.name));
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 5, virality: 3, controversy: 1, sentiment: 0.3 }, posts: [], crowd: [], replies: [] } });
  const n1 = Object.keys(G.S.npcs).length;
  try { await E.speak({ mode: 'reply', text: 'thanks for noticing! I am just a musician', replyTo: cl.comment, label: 'x' }); } catch (e) { console.log('speak threw', e.message); }
  await H.wait(30);
  S = G.S;
  check('replying to their comment makes them join the cast', cl.status === 'joined' && Object.keys(S.npcs).length === n1 + 1 && !!S.npcs[cl.npc] && S.dms[cl.npc].some((m) => m.from === 'me' && /musician/.test(m.text)));
  const off = Object.keys(S.npcs).length;
  G.settings.leads = false; S.leadT = null; S.leads.forEach((l) => { if (l.status === 'new') l.status = 'ignored'; });
  G.World.rnd = () => 0.1; check('switched off in Settings: nobody reaches out', L.tick() === null); G.World.rnd = realRand;
  check('the setting exists', /data-setting="leads"/.test((G.UI.go('settings'), G.UI.render(), $('#page').innerHTML)));
  G.settings.leads = true;

  /* ---------- the 💞 Lover tier: a label only ---------- */
  const T = G.Tier;
  mia.status = 'partner'; mia.rom = 90; mia.aff = 85; mia.trust = 70; mia.age = 24;
  check('the top tier needs dating/partner with romance, affection and trust all very high', T.eligible(mia) && !T.eligible(Object.assign({}, mia, { rom: 60 })) && !T.eligible(Object.assign({}, mia, { status: 'friend' })) && !T.eligible(Object.assign({}, mia, { status: 'son' })));
  S.notifs = [];
  S.clock += 400;
  T.step();
  check('they are promoted by themselves, with an alert, a memory and a chronicle line', mia.tier === 'lover' && S.notifs.some((x) => /is now your lover/.test(x.text)) && (mia.mem || []).some((m) => /lovers now/.test(m.text)) && S.chronicle.some((c) => /became lovers/.test(c.text)));
  check('it is only a label: the status is still "partner" and nothing else changed', mia.status === 'partner');
  check('the label shows wherever a status shows', /💞 Lover/.test(G.UI.chip(mia.status, mia)) && /Lover/.test(G.UI.statusMeta(mia.status, mia).label) && G.UI.statusMeta('partner').label === 'Partner');
  G.UI.go('home'); G.UI.acts.profile({ id: mia.id });
  check('their profile shows 💞 Lover and the Make/undo button', /Lover/.test(w.document.body.textContent) && !!$('[data-act="tierToggle"]'));
  check('they never doubt you: loyalty is total and the AI sees the tier', G.Reasons.loyal(mia, 'me') === 1 && /LOVER/.test(G.AI.context({ full: true, focus: [mia.id] })));
  mia.rom = 40; mia.aff = 30;
  S.clock += 400;
  T.step();
  check('when the bond falls apart the tier goes', !mia.tier && /no longer lovers/.test(S.chronicle[S.chronicle.length - 1].text));
  G.UI.acts.tierToggle({ id: mia.id });
  check('you can also make it by hand (and it stays)', mia.tier === 'lover' && mia.tierManual);
  S.clock += 400; T.step();
  check('a hand-made tier is not taken away by a bad week', mia.tier === 'lover');
  G.UI.acts.tierToggle({ id: mia.id });
  check('tapping again undoes it', !mia.tier);
  dex.status = 'friend';
  G.UI.acts.tierToggle({ id: dex.id });
  check('a friend cannot be made a lover by hand', !dex.tier);
  const saved = JSON.stringify(G.S);
  check('the save has no stray null keys for any of this', !/"tier":null|"leads":null/.test(saved));

  H.summary('NEW PEOPLE (LEADS) + LOVER TIER');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
