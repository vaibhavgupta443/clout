// Player growth: strong posts help, spam has diminishing returns, audiences saturate, and replies do not earn follower growth.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = H.freshWorld();
  const P = S.player;
  G.World.postDial = () => 0;
  G.World.rnd = () => 0.5;
  P.followers = 8000;
  S.popSize = 250000;
  const metrics = { quality: 10, virality: 10, sentiment: 5, controversy: 0 };
  const post = (text, replyTo) => E.addPost({ author: 'me', text, replyTo, buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }, S);

  const first = post('a distinct high quality post');
  const firstGain = E.metrics(metrics, first).gain;
  for (let i = 0; i < 6; i++) E.metrics(metrics, post('a different post ' + i));
  const seventh = post('one more distinct post');
  const seventhGain = E.metrics(metrics, seventh).gain;
  check('one strong post grows followers', firstGain > 0);
  check('many posts in one day have diminishing returns', seventhGain < firstGain, `${firstGain} -> ${seventhGain}`);

  P.followers = S.popSize * 2 - 5;
  const nearCap = post('almost at the town ceiling');
  E.metrics(metrics, nearCap);
  check('followers saturate at twice the simulated population', P.followers <= S.popSize * 2, String(P.followers));

  P.followers = S.popSize * 2 + 100;
  E.addFollowers(500);
  check('the population ceiling does not ratchet upward with current followers', P.followers === S.popSize * 2, String(P.followers));

  const celebrity = E.newPlayer({ name: 'Star', fame: 'celeb' });
  check('a celebrity start keeps its starting audience above the town ceiling', celebrity.followers === 4000000 && celebrity.followerFloor === 4000000);

  const legacy = JSON.parse(JSON.stringify(S));
  legacy.player.followers = 1234567;
  delete legacy.player.followerFloor;
  E.migrate(legacy);
  check('a legacy save records its existing audience as the floor', legacy.player.followerFloor === 1234567 && E.followerCap(legacy) >= 1234567);

  const beforeFollowers = P.followers;
  const beforePosts = P.posts;
  const reply = post('a reply does not add followers', 'p1');
  const replyResult = E.metrics(metrics, reply);
  check('a reply adds no followers and is not counted as a standalone post', replyResult.gain === 0 && P.followers === beforeFollowers && P.posts === beforePosts);

  const mia = Object.values(S.npcs).find((n) => /mia/i.test(n.name));
  mia.aff = 50; mia.trust = 50; mia.riv = 0; mia.status = 'friend';
  const targeted = post(`${mia.handle} you are a liar, you ruin everything`);
  const rel0 = { aff: mia.aff, trust: mia.trust, riv: mia.riv };
  G.World.reactTo(mia, targeted, S.clock);
  const rel1 = { aff: mia.aff, trust: mia.trust, riv: mia.riv };
  G.World.reactTo(mia, targeted, S.clock + 1);
  check('a hostile post tagging a character damages trust and adds lasting resentment once', rel1.aff < rel0.aff && rel1.trust < rel0.trust && rel1.riv > rel0.riv && G.Persona.ensure(mia).grudges.me > 0 && JSON.stringify({ aff: mia.aff, trust: mia.trust, riv: mia.riv }) === JSON.stringify(rel1));
  /* ---------- the player loop over time (offline, no AI) ---------- */
  G.settings.apiKey = '';
  G.settings.postDial = 0;
  const A1 = ['sunny', 'quiet', 'loud', 'tiny', 'golden', 'rainy', 'weird', 'lazy', 'bright', 'cozy', 'sharp', 'gentle'];
  const N1 = ['garden', 'train', 'coffee', 'puzzle', 'neighbour', 'bicycle', 'playlist', 'sunset', 'market', 'library', 'harbour', 'recipe'];
  const V1 = ['surprised', 'inspired', 'delighted', 'confused', 'amused', 'grateful', 'curious', 'relaxed', 'excited'];
  const uniq = (i) => `${A1[i % 12]} ${N1[(i * 7 + 3) % 12]} made me ${V1[(i * 5 + 1) % 9]} near the ${N1[(i * 11 + 5) % 12]} ${A1[(i * 3 + 7) % 12]} corner`;
  async function simulate(perDay, days) {
    const S1 = H.freshWorld();
    G.settings.postDial = 0;
    S1.player.followers = 8000;
    S1.player.followerFloor = 8000;
    let k = 0;
    for (let d = 0; d < days; d++) {
      for (let i = 0; i < perDay; i++) await E.speak({ mode: 'post', text: uniq(k++) });
      for (let h = 0; h < 8; h++) E.tick(180);
    }
    return G.S;
  }
  const one = await simulate(1, 30);
  const growth1 = one.player.followers / 8000;
  check('one ordinary post a day for 30 days is a believable rising account (about 1.1x-3.5x)', growth1 > 1.1 && growth1 < 3.5, `x${growth1.toFixed(2)} (${one.player.followers})`);
  const two = (await simulate(2, 30)).player.followers;
  const eight = (await simulate(8, 30)).player.followers;
  check('8 posts a day do not beat 2 a day', eight <= two, `2/day ${two}, 8/day ${eight}`);
  check('nothing exceeds the soft audience of the world', one.player.followers < S.popSize && eight < S.popSize && two < S.popSize);

  const s5 = H.freshWorld();
  G.settings.postDial = 0;
  s5.player.followers = 8000;
  const gains = [];
  for (let i = 0; i < 5; i++) {
    await E.speak({ mode: 'post', text: 'gm everyone, big news about my cozy garden project' });
    gains.push(Object.values(G.S.posts).filter((p) => p.author === 'me').slice(-1)[0].fgain);
  }
  check('five identical posts are worth almost nothing after the first', gains.slice(1).reduce((a, b) => a + Math.max(0, b), 0) <= Math.max(3, gains[0] * 0.15), JSON.stringify(gains));
  const gm = await E.speak({ mode: 'post', text: 'GM everyone!! big news about my cozy garden project 77' });
  check('digits, case and punctuation do not hide a repeat', gm.placed.post.dup === true);

  // replies: no followers, little XP, capped per day
  const sr = H.freshWorld();
  G.settings.postDial = 0;
  const f0 = sr.player.followers;
  const xpAll = () => G.S.player.xp + G.S.player.level * 1000;
  const xp0 = xpAll();
  const tgt = sr.postOrder.map((id) => sr.posts[id]).find((p) => p.author !== 'me');
  for (let i = 0; i < 25; i++) await E.speak({ mode: 'reply', text: `love this take ${uniq(i)}`, replyTo: tgt.id });
  check('twenty-five replies in a day add no followers (only the slow drift of a quiet account)', G.S.player.followers <= f0 && G.S.player.followers >= f0 - 3, `${f0} -> ${G.S.player.followers}`);
  check('reply XP is small and capped (12 a day)', xpAll() - xp0 <= 12, String(xpAll() - xp0));

  // hostile post: the target remembers, followers and goodwill drop, heat rises
  const sh = H.freshWorld();
  G.settings.postDial = 0;
  const miaH = Object.values(sh.npcs).find((n) => /mia/i.test(n.name));
  miaH.aff = 40; miaH.trust = 50; miaH.riv = 0; miaH.status = 'friend';
  const love0 = sh.player.audience.love, heat0 = sh.player.heat, fol0 = sh.player.followers;
  const hostile = await E.speak({ mode: 'post', text: `${miaH.handle} you are a stupid ugly loser and everyone knows it` });
  E.tick(120);
  check('a hostile post tagging someone costs followers, goodwill and adds heat', hostile.placed.post.fgain < 0 && G.S.player.followers < fol0 && G.S.player.audience.love < love0 && G.S.player.heat > heat0, `gain ${hostile.placed.post.fgain}, love ${love0}->${G.S.player.audience.love}, heat ${heat0}->${G.S.player.heat.toFixed(1)}`);
  check('the insulted character took it personally', miaH.aff < 40 || (G.Persona.ensure(miaH).grudges.me || 0) > 0, `aff ${miaH.aff}`);

  // heat: an unfollow wave and withdrawn offers; a big scandal does not vanish overnight
  const sf = H.freshWorld();
  G.settings.postDial = 0;
  sf.player.followers = 20000;
  const Fm = G.Fame.ensure();
  Fm.offers.push({ id: 'ofx', kind: 'brand', brand: 'Glowhaus', pay: 500, title: 'Glowhaus sponsorship', text: 'x', t: sf.clock, exp: sf.clock + 2880, status: 'open' });
  sf.player.heat = 100;
  const ff0 = sf.player.followers;
  for (let h = 0; h < 24; h++) E.tick(60);
  check('a scandal brings an unfollow wave', G.S.player.followers < ff0 - 50, `${ff0} -> ${G.S.player.followers}`);
  check('the brand deal is withdrawn and a pile-on lands in the alerts', Fm.offers.find((o) => o.id === 'ofx').status === 'revoked' && G.S.notifs.some((n) => n.type === 'drama' && /piling/i.test(n.text)));
  check('heat 100 is still warm a day later (no overnight reset)', G.S.player.heat > 30 && G.S.player.heat < 70, G.S.player.heat.toFixed(1));

  // meta chronicle
  const sm = H.freshWorld();
  G.settings.postDial = 0;
  sm.player.xp = E.xpNeeded(sm.player.level) - 1;
  E.giveXp(5);
  const lvEntry = sm.chronicle.filter((c) => /reached level/i.test(c.text)).pop();
  G.Fame.ensure().ms = 0;
  sm.player.followers = 1100;
  G.Fame.milestones();
  const fEntry = sm.chronicle.filter((c) => /followers/.test(c.text)).pop();
  check('level and follower milestones are tagged meta (player-facing only)', !!lvEntry && lvEntry.meta === true && !!fEntry && fEntry.meta === true && G.Channels.isMeta(lvEntry));

  // notifications: noise never evicts DMs / relationship news
  const sn = H.freshWorld();
  for (let i = 0; i < 12; i++) E.addNotif('dm', `Mia: message ${i}`, { npcId: 'n1' });
  E.addNotif('rel', 'Kai is now: friend', { npcId: 'n2' });
  for (let i = 0; i < 400; i++) E.addNotif(['event', 'follow', 'cash', 'viral', 'level', 'drama'][i % 6], `noise ${i}`);
  for (let i = 0; i < 5; i++) E.addNotif('event', 'same line');
  const nt = G.S.notifs;
  check('400 pieces of noise never evict DMs or relationship news', nt.filter((n) => n.type === 'dm').length === 12 && nt.some((n) => n.type === 'rel'));
  check('alerts stay under the cap, each type is capped', nt.length <= 120 && nt.filter((n) => n.type === 'event').length <= 12 && nt.filter((n) => n.type === 'cash').length <= 8);
  check('the same line merges into one (xN)', nt.filter((n) => n.base === 'same line').length === 1 && /x5/.test(nt.find((n) => n.base === 'same line').text));
  for (let i = 0; i < 5; i++) E.addNotif('event', `Opportunity ${i}`, { key: 'offers' });
  check('a keyed family of alerts keeps one line', G.S.notifs.filter((n) => n.key === 'offers').length === 1);

  // offline live stream works without AI.json
  const sl = H.freshWorld();
  G.settings.postDial = 0;
  const calls0 = H.state.calls;
  const cash0 = sl.player.cash;
  const live = await E.goLive('Q&A night', 30);
  check('an offline live stream builds its own recap (no AI call)', H.state.calls === calls0 && !!G.S.lastLive && G.S.lastLive.chat.length >= 3 && G.S.lastLive.peak > 0 && !!G.S.lastLive.moment && !!live && !!live.res.live, JSON.stringify(G.S.lastLive || {}).slice(0, 120));
  check('the stream paid and unlocked the Live achievement', G.S.player.cash > cash0 && !!G.S.ach.live);

  // stories: XP through giveXp with a daily cap
  const ss = H.freshWorld();
  const xs0 = xpAll();
  for (let i = 0; i < 10; i++) E.postStory(`story ${i}`);
  check('stories give XP, but only up to 6 a day', xpAll() - xs0 === 6, String(xpAll() - xs0));

  // cash sinks: gifts scale with the receiver, living costs are charged and shown
  const sg = H.freshWorld();
  const kaiG = Object.values(sg.npcs).find((n) => /kai/i.test(n.name));
  const lowG = E.makeNpc({ name: 'Pat Small', handle: '@pats', age: 30, personality: 'calm', followers: 600, role: 'friend' });
  E.giftTarget = kaiG.id;
  const kaiCost = E.GIFTS[1].cost;
  E.giftTarget = lowG.id;
  const lowCost = E.GIFTS[1].cost;
  E.giftTarget = null;
  check('a gift for somebody famous costs more than one for a small account', kaiCost > lowCost * 2, `${kaiCost} vs ${lowCost}`);
  const sc = H.freshWorld();
  sc.player.cash = 5000;
  const up = G.Fame.upkeep();
  G.Fame.ensure();
  for (let d = 0; d < 3; d++) E.tick(1440);
  check('living costs are charged daily and shown in the alerts', up > 0 && G.S.fame.spent > 0 && G.S.notifs.some((n) => /Living costs/.test(n.text)));
  check('verification is no longer automatic at 100K followers', (() => { const sv = H.freshWorld(); sv.player.followers = 120000; E.giveXp(1); return !G.S.player.verified; })());

  // 30-day soak: invariants hold
  const so = await simulate(3, 30);
  check('30-day soak keeps every number finite and in range', invariants(G).length === 0 && Number.isFinite(so.player.followers) && Number.isFinite(so.player.cash) && so.player.heat >= 0 && so.player.heat <= 100, invariants(G).slice(0, 3).join('; '));

  check('no AI calls were made', H.state.calls === 0, String(H.state.calls));
  H.summary('ECONOMY: saturating growth and reply accounting');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
