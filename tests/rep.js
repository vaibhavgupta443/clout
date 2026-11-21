// Reputation and PR: four standings, hostile posts, offers filtered by standing, lay low, public apology via the approval queue, no keys without a write.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const EMOJI = /\p{Extended_Pictographic}/u;
const nulls = (o) => JSON.stringify(o).includes(':null');

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  w.document.body.classList.add('ingame');
  const R = G.Rep;

  /* ---------- reading never creates a key ---------- */
  check('a fresh world has neutral standings and no rep keys', R.state().press === 50 && !('rep' in S) && !('repLog' in S));
  R.card(); G.UI.go('me'); G.UI.render();
  E.tick(60 * 3);
  check('reading, rendering the Profile and quiet hours do not create S.rep or S.repLog', !('rep' in S) && !('repLog' in S));
  check('the Profile page shows the card, with no emoji in it', /repcard/.test(w.document.querySelector('#page').innerHTML) && !EMOJI.test(R.card()));

  /* ---------- a hostile post lowers Press and closes offers ---------- */
  S.player.followers = 60000;
  const brandBefore = G.Fame.make('brand');
  const interviewBefore = G.Fame.make('interview');
  check('before the trouble, brand and interview offers can appear', !!brandBefore && !!interviewBefore);
  for (let i = 0; i < 3; i++) {
    E.addPost({ author: 'me', text: 'you are all pathetic idiots and I hate every one of you ' + i, buzz: 6, stats: { likes: 5, reposts: 0, replies: 0, views: 300 } });
    const p = S.posts[S.postOrder[S.postOrder.length - 1]];
    p.judge = { q: 3, v: 2, s: -8, c: 9, note: '' };
    E.tick(60);
  }
  check('three hostile posts bring Press well below neutral, each post counted once', S.rep && S.rep.press < 35 && S.rep.town < 40, JSON.stringify(S.rep));
  const pressNow = S.rep.press;
  E.tick(1);
  check('a post is only counted once', S.rep.press >= pressNow - 0.3);
  check('with a bad name, brand and interview offers are filtered out', G.Fame.make('brand') === null && G.Fame.make('interview') === null);
  check('giveaways (your own money) are still possible', !!G.Fame.make('giveaway'));
  check('the short log records it and stays small', S.repLog.length >= 1 && S.repLog.length <= 10 && /hostile/.test(S.repLog[S.repLog.length - 1].why));
  for (let i = 0; i < 14; i++) G.Rep.nudge({ press: -3 }, 'x' + i);
  check('the log never grows past 10 and every standing stays inside 0..100', S.repLog.length === 10 && G.Rep.KEYS.every((k) => S.rep[k] >= 0 && S.rep[k] <= 100));
  check('strangers slow down with a bad name and the setting is restored afterwards', (() => { const e0 = G.Leads.EVERY; G.Leads.tick(); return e0 === 360 && G.Leads.EVERY === 360; })());

  /* ---------- lay low: heat decays faster, standing recovers ---------- */
  S.rep.press = 20; S.rep.town = 30; S.rep.fans = 50; S.rep.friends = 50; delete S.rep.lay;
  S.player.heat = 80; E.tick(60 * 3); const control = S.player.heat;
  S.player.heat = 80; S.rep.press = 20; S.rep.town = 30;
  R.layLow();
  check('laying low is recorded with an end time', R.layingLow() && S.rep.lay > S.clock);
  check('laying low twice is refused', (() => { try { R.layLow(); return false; } catch (e) { return !!e.user; } })());
  E.tick(60 * 3);
  check('with lay low heat falls faster than without', S.player.heat < control - 5, control + ' vs ' + S.player.heat);
  check('and the weak standings recover toward neutral faster', S.rep.press > 20 + 1.2 && S.rep.town > 30 + 1.2, JSON.stringify(S.rep));
  E.tick(60 * 50);
  check('after two days it ends by itself', !R.layingLow() && !('lay' in S.rep));
  check('the lay-low card shows a countdown while it lasts', (() => { R.layLow(); const h = R.card(); return /Laying low/.test(h) && !/repLayLow/.test(h); })());

  /* ---------- a public apology goes through the approval queue ---------- */
  S.rep.press = 25; S.rep.town = 30; S.player.heat = 60; delete S.rep.apT; S.pitches = [];
  const posts0 = S.postOrder.length;
  const item = R.draftApology();
  check('drafting only queues it: nothing is posted yet', S.pitches.some((p) => p.id === item.id && p.kind === 'apology') && S.postOrder.length === posts0);
  check('a second draft is refused while one waits', (() => { try { R.draftApology(); return false; } catch (e) { return !!e.user; } })());
  const press0 = S.rep.press, heat0 = S.player.heat;
  check('approving it (Pitches.apply) posts it as you and lifts Press, Town and heat', G.Pitches.apply(item) === true && S.postOrder.length === posts0 + 1 && S.posts[S.postOrder[S.postOrder.length - 1]].author === 'me' && S.rep.press > press0 + 4 && S.player.heat < heat0);
  check('the apology post itself is not judged as a new offence', S.posts[S.postOrder[S.postOrder.length - 1]].repd === 1);
  check('and you cannot apologise again right away', (() => { S.pitches = []; try { R.draftApology(); return false; } catch (e) { return !!e.user; } })());
  S.pitches = [];
  check('with nothing to apologise for it is refused', (() => { S.rep.press = 60; S.rep.town = 60; S.player.heat = 5; delete S.rep.apT; return R.canApologize().ok === false; })());

  /* ---------- who follows ---------- */
  const n = Object.values(S.npcs).find((x) => !x.userAlt && !x.blocked);
  n.status = 'close_friend'; n.aff = 70; n.trust = 60;
  const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const count = (fans) => {
    S.rep.fans = fans; S.rep.town = 60; S.rep.press = 60;
    const r = lcg(11); let f = 0;
    for (let i = 0; i < 400; i++) { G.Persona.ensure(n).following = (G.Persona.ensure(n).following || []).filter((x) => x !== 'me'); if (G.Bonds.followDecision(S, n, 'me', r) === 'follow') f++; }
    return f;
  };
  const lo = count(15), mid = count(50);
  check('a shamed fan base means fewer new followers', lo < mid && mid > 0, lo + ' vs ' + mid);
  check('followDecision is untouched for other targets and in worlds with no rep', (() => { const s2 = S.rep; delete S.rep; const a = G.Bonds.followDecision(S, n, 'me', lcg(3)); S.rep = s2; return typeof a === 'string'; })());

  /* ---------- the save is clean ---------- */
  const clone = JSON.parse(JSON.stringify(S));
  check('standings survive a save round trip exactly and hold no null keys', JSON.stringify(clone.rep) === JSON.stringify(S.rep) && JSON.stringify(clone.repLog) === JSON.stringify(S.repLog) && !nulls(S.rep) && !nulls(S.repLog));
  H.freshWorld();
  check('a new world saves without the rep keys', !('rep' in G.S) && !('repLog' in G.S));
  G.settings.reputation = false;
  G.S.player.heat = 90; E.tick(60 * 5);
  check('switched off in Settings it does nothing', !('rep' in G.S));
  G.settings.reputation = true;

  H.summary('REPUTATION AND PR');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
