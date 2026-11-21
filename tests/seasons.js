// Town seasons: rare 3-day arcs with one choice. At most one active, a choice applies once, people react through DMs and channels, nobody posts.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const EMOJI = /\p{Extended_Pictographic}/u;
const day = () => G.U.dayOf(G.S.clock);
const npcTop = () => G.S.postOrder.map((id) => G.S.posts[id]).filter((p) => p && !p.replyTo && p.author !== 'me' && p.author !== 'crowd').length;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  w.document.body.classList.add('ingame');
  const Se = G.Seasons;

  check('a fresh world has no season keys, and the card and strip are empty', !('season' in S) && !('seasonLast' in S) && Se.prompt() === '' && Se.strip() === '');

  /* ---------- 30-day soak ---------- */
  G.World.setSeed(7);
  const top0 = npcTop();
  const starts = [];
  let maxActive = 0, bad = 0, seen = null;
  for (let h = 0; h < 30 * 24; h++) {
    E.tick(60);
    const s = G.S.season;
    maxActive = Math.max(maxActive, s ? 1 : 0);
    if (s && seen !== s.day0) { seen = s.day0; starts.push(s.day0); }
    if (s && (typeof s.id !== 'string' || s.step < 0 || s.step > 2 || typeof s.choice !== 'string' || s.day0 == null)) bad++;
  }
  S = G.S;
  check('over 30 days there is at least one arc and never more than one at a time', starts.length >= 1 && maxActive === 1, 'arcs started: ' + starts.join(','));
  check('arcs are rare: at least 6 game days apart, at most 4 in a month', starts.length <= 4 && starts.every((d, i) => i === 0 || d - starts[i - 1] >= 6), starts.join(','));
  check('S.season always has the right shape', bad === 0);
  check('no NPC posted anything top-level because of an arc', npcTop() === top0, top0 + ' -> ' + npcTop());
  check('the chronicle noted the arcs and a finished arc leaves no S.season behind', S.chronicle.some((c) => /Around town/.test(c.text)) && (!S.season || S.season.day0 >= day() - 2));

  /* ---------- one choice, applied exactly once ---------- */
  delete S.season;
  S.channels = null; G.Channels.ensure();
  Object.values(S.npcs).forEach((n) => { if (!n.userAlt) { n.status = n.status || 'friend'; } });
  const near = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).slice(0, 4);
  near.forEach((n, i) => { n.status = 'close_friend'; n.aff = 40 + i; n.touched = S.clock - i; });
  S.dms = S.dms || {};
  near.forEach((n) => { S.dms[n.id] = (S.dms[n.id] || []).filter((m) => m.from === 'me' || m.read !== false); });
  const st = Se.start('festival', day());
  check('an arc can be started once; a second start is refused while one runs', !!st && S.season.choice === '' && Se.start('blackout', day()) === null);
  check('the Profile card and the Alerts strip offer the choices', (() => { G.UI.go('me'); G.UI.render(); const a = /seasonPick/.test(w.document.querySelector('#page').innerHTML); return a && /seasonPick|Your call/.test(Se.strip()) && !EMOJI.test(Se.prompt()) && !EMOJI.test(Se.strip()); })());
  const rep0 = JSON.stringify(G.Rep.state()), heat0 = S.player.heat;
  const aff0 = near.map((n) => n.aff), dms0 = Object.values(S.dms).reduce((a, l) => a + l.length, 0);
  const chat0 = S.channels.reduce((a, c) => a + c.msgs.length, 0);
  const c1 = Se.choose('stage');
  const rep1 = JSON.stringify(G.Rep.state());
  check('the choice shifts Reputation and heat', !!c1 && S.season.choice === 'stage' && G.Rep.state().fans > JSON.parse(rep0).fans + 5 && S.player.heat > heat0);
  check('it shifts a few Bonds', near.some((n, i) => n.aff > aff0[i]) || near.some((n) => (G.Persona.ensure(n).rd || {}).aff > 0));
  check('people react through the channels (and at most 2 DMs)', S.channels.reduce((a, c) => a + c.msgs.length, 0) > chat0 && Object.values(S.dms).reduce((a, l) => a + l.length, 0) - dms0 <= 2);
  check('a second choice (or the same one again) does nothing', Se.choose('stage') === null && Se.choose('skip') === null && JSON.stringify(G.Rep.state()) === rep1 && S.season.choice === 'stage');
  check('an unknown choice is refused', (() => { const s = S.season; s.choice = ''; try { Se.choose('nope'); return false; } catch (e) { s.choice = 'stage'; return !!e.user; } })());
  const clone = JSON.parse(JSON.stringify(S));
  check('the running arc survives a save round trip and holds no null', JSON.stringify(clone.season) === JSON.stringify(S.season) && !JSON.stringify(S.season).includes(':null'));
  check('the card now shows the call you made, no buttons', !/seasonPick/.test(Se.prompt()) && /Your call/.test(Se.prompt()) && Se.strip() === '');
  const top1 = npcTop();
  E.tick(60 * 24 * 4);
  S = G.S;
  check('after three days it resolves: S.season is deleted and the chronicle remembers your call', !('season' in S) && S.chronicle.some((c) => /main stage/.test(c.text)) && typeof S.seasonLast === 'number');
  check('and no NPC posted on their own meanwhile', npcTop() === top1);
  check('the choice cannot be made once it is over', (() => { try { Se.choose('stage'); return false; } catch (e) { return !!e.user; } })());

  /* ---------- an arc nobody answers just passes ---------- */
  Se.start('rumour', day());
  E.tick(60 * 24 * 4);
  check('an arc with no call passes by itself and is deleted', !('season' in G.S) && /passed without a word/.test(G.S.chronicle.slice(-8).map((c) => c.text).join(' ')));

  /* ---------- the one-line event stays as the fallback ---------- */
  S.seasonLast = day();
  let events = 0;
  for (let i = 0; i < 25; i++) { S.sim.lastEventDay = null; if (G.World.worldEvent(S.clock)) events++; }
  check('with no arc running, W.worldEvent still fires its one-line events', events > 0 && !('season' in S), 'events: ' + events);
  G.settings.seasons = false;
  delete S.seasonLast;
  S.clock += 1440 * 20;
  let started = false;
  for (let i = 0; i < 20; i++) { S.sim.lastEventDay = null; G.World.worldEvent(S.clock + i * 1440); if (S.season) started = true; }
  check('switched off in Settings no arc ever starts', !started);
  G.settings.seasons = true;

  H.summary('TOWN SEASONS AND EVENTS WITH CHOICES');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
