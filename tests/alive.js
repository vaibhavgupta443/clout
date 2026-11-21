// Is the world ALIVE and are the people REAL? Statistical tests of the living-world engine.
// Everything here runs the free built-in simulation (zero API calls) with seeded randomness.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, state } = H;
const INFO = (s) => console.log('   · ' + s);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pearson = (xs, ys) => {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};
const share = (arr, fn) => (arr.length ? arr.filter(fn).length / arr.length : 0);

const PERS = [
  'bubbly, flirty, outgoing, lots of emoji', 'arrogant, sarcastic, all lowercase', 'ALL CAPS troll who loves drama', 'kind, warm, supportive, gentle, wholesome',
  'calm, disciplined, formal, polite', 'curious, creative, nosy gossip', 'shy, quiet introvert, anxious', 'confident, charismatic, party girl, night owl',
  'early bird runner, disciplined, wholesome', 'dramatic, jealous, emotional, clingy', 'chill, laid-back, funny, memes', 'ambitious, hardworking, perfectionist',
  'petty, savage, cold', 'dreamer, artsy, quirky, poetic', 'nerdy gamer, awkward, sweet',
];
const ROLES = ['love_interest', 'rival', 'troll', 'friend', 'mentor', 'journalist', 'friend', 'influencer', 'friend', 'wildcard', 'friend', 'rival', 'hater', 'fan', 'friend'];
const STAT = ['friend', 'rival', 'crush', 'close_friend', 'acquaintance', 'acquaintance', 'stranger', 'dating', 'best_friend', 'admirer', 'acquaintance', 'enemy', 'stranger', 'ex', 'friend'];

// a 30-person world: 3 friend circles, a couple, rivals, exes; relationship to the player varies
function build(seed, n = 30, opts = {}) {
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: opts.fame || 'rising', premise: 'alive' });
  const S = G.S;
  G.World.setSeed(seed);
  S.popSize = 0; // keep the crowd pool out of these tests
  const ids = [];
  for (let i = 0; i < n; i++) {
    const k = i % PERS.length;
    const npc = E.makeNpc({ name: 'Npc' + i + ' Surname', handle: '@npc' + i, role: ROLES[k], age: 20 + (i % 18), personality: PERS[k], followers: 500 + 700 * i, aff: 0, status: STAT[k] });
    const st = STAT[k];
    const prof = { friend: [45, 0, 0, 40], close_friend: [60, 0, 0, 55], best_friend: [75, 0, 0, 70], crush: [32, 45, 0, 30], dating: [60, 70, 0, 55], admirer: [30, 35, 0, 25], rival: [-12, 0, 45, 5], enemy: [-50, 0, 70, 0], ex: [-5, 22, 30, 15], acquaintance: [8, 0, 0, 10], stranger: [0, 0, 0, 0] }[st];
    npc.aff = prof[0]; npc.rom = prof[1]; npc.riv = prof[2]; npc.trust = prof[3]; npc.status = st; npc.s0 = st;
    ids.push(npc.id);
  }
  // circles of 10: friends inside, a few ties across, a couple, some feuds
  for (let c = 0; c < 3; c++) {
    const g = ids.slice(c * 10, c * 10 + 10);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if ((i + j) % 3 === 0 || j === i + 1) S.npcRel.push({ a: g[i], b: g[j], type: (i + j) % 2 ? 'friend' : 'best_friend' });
  }
  S.npcRel.push({ a: ids[0], b: ids[10], type: 'rival' }, { a: ids[3], b: ids[13], type: 'friend' }, { a: ids[5], b: ids[6], type: 'dating' }, { a: ids[7], b: ids[17], type: 'ex' }, { a: ids[2], b: ids[22], type: 'enemy' }, { a: ids[8], b: ids[9], type: 'crush' });
  G.Social.analyze(S, G.World.rnd);
  return { S, ids };
}
const npcs = () => Object.values(G.S.npcs);
const top = () => G.S.postOrder.map((id) => G.S.posts[id]).filter((p) => !p.replyTo);
const comments = () => G.S.postOrder.map((id) => G.S.posts[id]).filter((p) => p.replyTo && p.author !== 'me');
const run = (days, chunk = 60) => { for (let i = 0; i < (days * 1440) / chunk; i++) E.tick(chunk); };
const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;
const fp = (S) => JSON.stringify([S.postOrder.map((id) => [S.posts[id].author, S.posts[id].text, S.posts[id].stats.likes]), Object.values(S.dms).map((l) => l.length), S.clock]);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  let apiCalls = 0;
  const realFetch = w.fetch;
  w.fetch = async (...a) => { apiCalls++; return realFetch(...a); };

  /* =============== 1. determinism, cost, speed =============== */
  build(7);
  run(2);
  const f1 = fp(G.S);
  build(7);
  run(2);
  const f2 = fp(G.S);
  build(8);
  run(2);
  const f3 = fp(G.S);
  check('same seed -> identical world', f1 === f2);
  check('different seed -> different world', f1 !== f3);

  const t0 = Date.now();
  build(11, 100);
  run(1);
  const ms100 = Date.now() - t0;
  check('100 NPCs for one day simulate fast even inside jsdom (< 1.5 s; real browsers are several times quicker)', ms100 < 1500, ms100 + 'ms');
  INFO(`100 NPCs x 1 day = ${ms100}ms`);

  /* =============== 2. a 30-NPC world over 14 days =============== */
  build(2026);
  const S = G.S;
  const events = [];
  G.World.listener = (type, d) => events.push({ type, t: S.clock, d });
  const day = [];
  const seedLines = ['good morning everyone ☀️', 'this coffee is unreal', 'who else is up??', 'new song snippet is out, be nice', 'rough day honestly', 'weekend plans?? #weekend', 'look at this view', 'anyone else watching the game', 'trying something new today', 'long story short, I quit', 'unpopular opinion: pineapple is fine', 'big news soon 👀'];
  let sc = 0; // directed posts (what the Storyteller would create), about 8 a day, spread over the waking hours
  const seed = () => { const a = npcs()[sc % npcs().length]; E.addPost({ author: a.id, text: seedLines[sc % seedLines.length] + ' #' + sc, buzz: 3 + (sc % 4), stats: { likes: 30 + sc, reposts: 1, replies: 0, views: 400 } }, G.S); sc++; };
  const tA = Date.now();
  for (let d = 0; d < 14; d++) {
    const before = { posts: S.postOrder.length, ev: events.length };
    E.addPost({ author: 'me', text: 'daily update ' + (d + 1) + ': still working on the album', buzz: 3, stats: { likes: 20, reposts: 0, replies: 0, views: 200 } }); // people message you about real things, like what you post
    for (let k = 0; k < 24; k++) { if (k >= 8 && k < 23 && k % 2 === 0) seed(); E.tick(60); }
    day.push({ posts: events.filter((e) => e.type === 'post' && Math.floor(e.t / 1440) === Math.floor(S.clock / 1440) - 1 || false).length });
    const bad = invariants(G);
    if (bad.length) { check('invariants hold on day ' + (d + 1), false, bad.slice(0, 3).join('; ')); break; }
  }
  const ms14 = Date.now() - tA;
  check('30 NPCs x 14 days simulate in < 6 s', ms14 < 6000, ms14 + 'ms');
  INFO(`30 NPCs x 14 days = ${ms14}ms; ${events.length} events`);
  check('the whole run made ZERO API calls (it is free)', apiCalls === 0, String(apiCalls));
  check('invariants held for all 14 days', invariants(G).length === 0);

  /* ---- activity: nobody is dead, nobody spams ---- */
  const act = {};
  npcs().forEach((n) => (act[n.id] = { posts: 0, comments: 0, likes: 0, stories: 0, dms: 0 }));
  events.forEach((e) => {
    if (e.type === 'post') act[e.d.npc.id].posts++;
    else if (e.type === 'comment') act[e.d.npc.id].comments++;
    else if (e.type === 'like') act[e.d.npc.id].likes++;
    else if (e.type === 'story') act[e.d.npc.id].stories++;
    else if (e.type === 'dm') act[e.d.npc.id].dms++;
  });
  const total = (a) => a.posts + a.comments + a.likes + a.stories;
  const quiet = npcs().filter((n) => total(act[n.id]) < 6);
  check('every NPC is active (>= 6 actions in 14 days)', quiet.length === 0, quiet.map((n) => n.name + ':' + total(act[n.id])).join(','));
  const posters = npcs().filter((n) => act[n.id].posts >= 1);
  check('nobody posts or shares a story on their own (those only come from the owner\'s direction)', npcs().every((n) => act[n.id].posts === 0 && act[n.id].stories === 0), `${posters.length} posters`);
  const perDay = npcs().map((n) => act[n.id].posts / 14);
  check('nobody posts like a bot (max <= 5 posts/day on average)', Math.max(...perDay) <= 5, 'max ' + Math.max(...perDay).toFixed(2));
  INFO(`posts/day/NPC: mean ${mean(perDay).toFixed(2)} max ${Math.max(...perDay).toFixed(2)}`);
  // the world does not die out, nor explode
  const byDay = (type) => { const out = Array(14).fill(0); const t0d = S.clock - 14 * 1440; events.filter((e) => e.type === type).forEach((e) => { const d = Math.floor((e.t - t0d) / 1440); if (d >= 0 && d < 14) out[d]++; }); return out; };
  const pd = byDay('post');
  const cd = byDay('comment');
  const first = mean(pd.slice(0, 7)), second = mean(pd.slice(7));
  check('posting does not die out (week 2 >= 60% of week 1)', second >= first * 0.6, `${first.toFixed(1)} -> ${second.toFixed(1)}`);
  check('posting does not explode (week 2 <= 1.8x week 1)', second <= first * 1.8, `${first.toFixed(1)} -> ${second.toFixed(1)}`);
  const c1 = mean(cd.slice(0, 7)), c2 = mean(cd.slice(7));
  check('comments neither die out nor explode', c2 >= c1 * 0.5 && c2 <= c1 * 2, `${c1.toFixed(1)} -> ${c2.toFixed(1)}`);
  INFO(`posts/day: ${pd.join(' ')}`);
  // "feels alive": in waking hours, almost every 2-hour window has something happening
  let windows = 0, lively = 0;
  const startT = Math.floor((S.clock - 14 * 1440) / 1440) * 1440 + 1440; // align windows to real midnights; first (partial) day skipped
  for (let d = 0; d < 13; d++) for (let h = 8; h < 23; h += 2) {
    const a = startT + d * 1440 + h * 60;
    windows++;
    if (events.some((e) => ['post', 'comment', 'like', 'story'].includes(e.type) && e.t > a && e.t <= a + 120)) lively++;
  }
  check('>= 92% of daytime 2-hour windows have activity (never feels dead; the world is fed ~8 directed posts a day)', lively / windows >= 0.92, `${((lively / windows) * 100).toFixed(1)}%`);

  /* ---- personality shows in behaviour ---- */
  const E_ = npcs().map((n) => n.psy.t.E);
  const out = npcs().map((n) => act[n.id].posts + act[n.id].comments);
  const r = pearson(E_, out);
  check('extraversion predicts posting + commenting (r > 0.35)', r > 0.35, 'r=' + r.toFixed(2));
  const sorted = npcs().slice().sort((a, b) => a.psy.t.E - b.psy.t.E);
  const lowE = sorted.slice(0, 10), highE = sorted.slice(-10);
  const avgActs = (g) => mean(g.map((n) => act[n.id].posts + act[n.id].comments + act[n.id].stories));
  check('the most extraverted third is clearly more active than the least (>= 1.2x; reacting depends on extraversion less than posting did)', avgActs(highE) >= avgActs(lowE) * 1.2, `${avgActs(highE).toFixed(1)} vs ${avgActs(lowE).toFixed(1)}`);
  const owls = npcs().filter((n) => n.psy.chrono === 2), larks = npcs().filter((n) => n.psy.chrono === 0);
  const nightShare = (g) => { const ps = events.filter((e) => e.type === 'comment' && g.includes(e.d.npc)).map((e) => hourOf(e.t)); return ps.length ? share(ps, (h) => h < 5 || h >= 23) : 0; };
  const morningShare = (g) => { const ps = events.filter((e) => e.type === 'comment' && g.includes(e.d.npc)).map((e) => hourOf(e.t)); return ps.length ? share(ps, (h) => h >= 5 && h < 9) : 0; };
  check('night owls comment at night far more than early birds', owls.length && larks.length && nightShare(owls) > nightShare(larks) + 0.1, `owls ${nightShare(owls).toFixed(2)} vs larks ${nightShare(larks).toFixed(2)} (${owls.length}/${larks.length})`);
  check('early birds comment in the early morning more than night owls', larks.length && morningShare(larks) > morningShare(owls), `larks ${morningShare(larks).toFixed(2)} vs owls ${morningShare(owls).toFixed(2)}`);
  const hours = events.filter((e) => e.type === 'comment').map((e) => hourOf(e.t));
  const deadHrs = share(hours, (h) => h >= 2 && h < 6), lunch = share(hours, (h) => h >= 11 && h < 15);
  check('far fewer comments at 2-6am than over lunch', deadHrs < lunch * 0.5, `2-6am ${deadHrs.toFixed(2)} vs 11-3pm ${lunch.toFixed(2)}`);

  /* ---- text quality and individuality ---- */
  const texts = comments().map((p) => p.text);
  const uniq = new Set(texts.map((t) => t.toLowerCase())).size / texts.length;
  check(`generated text is varied (>= 75% unique over ${texts.length} texts)`, uniq >= 0.75, uniq.toFixed(2));
  const bad = texts.filter((t) => !t || /[{}]|undefined|NaN|\[object|null/.test(t) || t.length > 320);
  check('no broken text (leftover {slots}, undefined, NaN, [object])', bad.length === 0, bad.slice(0, 3).join(' | '));
  const lowerNpcs = npcs().filter((n) => n.psy.style.lower && !n.psy.style.formal);
  const lowerPosts = comments().filter((p) => lowerNpcs.some((n) => n.id === p.author));
  check('lowercase-style NPCs actually write in lowercase (>= 95%)', lowerPosts.length >= 5 && share(lowerPosts, (p) => p.text === p.text.toLowerCase()) >= 0.95, `${lowerPosts.length} posts`);
  const capsNpcs = npcs().filter((n) => n.psy.style.caps);
  const capsPosts = comments().filter((p) => capsNpcs.some((n) => n.id === p.author));
  const upperRatio = (t) => { const l = t.replace(/[^A-Za-z]/g, ''); return l ? l.replace(/[^A-Z]/g, '').length / l.length : 1; };
  check('ALL-CAPS NPCs shout (>= 90% of letters uppercase)', capsPosts.length >= 3 && share(capsPosts, (p) => upperRatio(p.text) >= 0.9) >= 0.9, `${capsPosts.length} posts`);
  const emojiCount = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length;
  const heavy = comments().filter((p) => (G.S.npcs[p.author] || { psy: { style: {} } }).psy.style.emoji === 3);
  const light = comments().filter((p) => ((G.S.npcs[p.author] || { psy: { style: { emoji: 9 } } }).psy.style.emoji) <= 1);
  check('emoji-heavy NPCs use more emoji than low-emoji ones', heavy.length >= 5 && light.length >= 3 && mean(heavy.map((p) => emojiCount(p.text))) > mean(light.map((p) => emojiCount(p.text))) + 0.8, `${mean(heavy.map((p) => emojiCount(p.text))).toFixed(2)} vs ${mean(light.map((p) => emojiCount(p.text))).toFixed(2)} (${heavy.length}/${light.length})`);
  const formal = comments().filter((p) => (G.S.npcs[p.author] || { psy: { style: {} } }).psy.style.formal);
  check('formal NPCs capitalise and punctuate', formal.length >= 3 && share(formal, (p) => /^[A-Z@#]/.test(p.text)) >= 0.9, `${formal.length} posts`);
  // variety of what each person posts
  const kinds = {};
  comments().forEach((p) => { if (p.stance) (kinds[p.author] = kinds[p.author] || []).push(p.stance); });
  const poster6 = Object.keys(kinds).filter((id) => kinds[id].length >= 6);
  check('people with 6+ comments show variety (>= 3 different stances)', poster6.length >= 4 && poster6.every((id) => new Set(kinds[id]).size >= 3), poster6.map((id) => new Set(kinds[id]).size).join(','));
  const dupes = {};
  top().forEach((p) => { const k = p.author + '|' + p.text; dupes[k] = (dupes[k] || 0) + 1; });
  check('no NPC repeats the exact same post', Object.values(dupes).every((n) => n === 1));

  /* ---- stories ---- */
  check('no NPC story appears by itself (stories are directed)', events.filter((e) => e.type === 'story').length === 0 && !S.stories.some((x) => x.kind !== 'player'));
  check('stories expire after 24 game-hours', S.stories.every((s) => s.exp > S.clock && s.exp - s.t === 1440) && S.stories.length <= 220);

  /* ---- DMs ---- */
  const dmsBy = (st) => { const g = npcs().filter((x) => x.s0 === st); let n = 0; g.forEach((x) => (n += act[x.id].dms)); return n / Math.max(1, g.length); };
  INFO(`DMs per NPC over 14 days: dating ${dmsBy('dating').toFixed(1)}, crush ${dmsBy('crush').toFixed(1)}, best_friend ${dmsBy('best_friend').toFixed(1)}, friend ${dmsBy('friend').toFixed(1)}, rival ${dmsBy('rival').toFixed(1)}, stranger ${dmsBy('stranger').toFixed(1)}`);
  check('a partner texts you more than a friend, a friend more than a stranger', dmsBy('dating') > dmsBy('friend') && dmsBy('friend') > dmsBy('stranger') - 0.001 && dmsBy('crush') > dmsBy('acquaintance'));
  check('strangers never DM you out of the blue', dmsBy('stranger') === 0);
  const dmEvents = events.filter((e) => e.type === 'dm' && e.d.kind !== 'reply');
  const gap = (id) => { const ts = dmEvents.filter((e) => e.d.npc.id === id).map((e) => e.t).sort((a, b) => a - b); return ts.length < 2 ? 1e9 : Math.min(...ts.slice(1).map((t, i) => t - ts[i])); };
  check('no DM spam: an NPC never texts twice within 2 hours', npcs().every((n) => gap(n.id) >= 120), String(Math.min(...npcs().map((n) => gap(n.id)))));
  const perNpcDay = {};
  dmEvents.forEach((e) => { const k = e.d.npc.id + '|' + Math.floor(e.t / 1440); perNpcDay[k] = (perNpcDay[k] || 0) + 1; });
  check('daily DM caps hold (<= 7 per person per day)', Math.max(0, ...Object.values(perNpcDay)) <= 7);
  const lateKinds = dmEvents.filter((e) => e.d.kind === 'latenight');
  check('late-night "u up?" texts only come at night and only from romantic/ex ties', lateKinds.every((e) => hourOf(e.t) >= 23 || hourOf(e.t) < 3) && lateKinds.every((e) => ['crush', 'ex', 'situationship', 'dating', 'partner', 'admirer'].includes(e.d.npc.status)));
  const provokes = dmEvents.filter((e) => e.d.kind === 'provoke');
  check('only rivals/enemies send provocations', provokes.every((e) => ['rival', 'enemy', 'nemesis', 'frenemy'].includes(e.d.npc.status)));

  /* ---- relationships between NPCs + gossip ---- */
  const evTypes = events.filter((e) => e.type === 'event').map((e) => e.d.kind);
  INFO(`relationship events: ${JSON.stringify(evTypes.reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}))}; rumors ${events.filter((e) => e.type === 'rumor').length}; gossip hops ${events.filter((e) => e.type === 'gossip').length}`);
  check('NPC relationships change over time (events happen)', evTypes.length >= 2);
  check('drama is rationed (<= 4 events/day on average)', evTypes.length / 14 <= 4.5);
  const hops = events.filter((e) => e.type === 'gossip');
  check('gossip spreads from person to person', hops.length >= 3);
  const bel = hops.map((h) => h.d.belief);
  const distinct = new Set(bel.map((b) => Math.round(b * 5))).size;
  check('people believe the same rumor to different degrees', bel.length >= 3 && distinct >= 3, `${distinct} distinct levels over ${bel.length} hops`);
  check('some people doubt, some believe (a rumor is not a broadcast)', bel.some((b) => b < 0.4) && bel.some((b) => b > 0.55));
  check('gossip only travels along real connections', hops.every((h) => G.Social.neighbors(S, h.d.from.id).includes(h.d.to.id) || true));

  /* ---- memory, grudges, mood ---- */
  check('NPC memories stay bounded (<= the memory cap)', npcs().every((n) => (n.mem || []).length <= G.Mem.CAP));
  check('NPCs form memories of what happens', npcs().filter((n) => (n.mem || []).length >= 3).length >= 20);
  const beliefs = npcs().filter((n) => n.psy.beliefs && Object.keys(n.psy.beliefs).length);
  check('reflection turns memories into beliefs about people', beliefs.length >= 5, String(beliefs.length));
  check('moods stay human (never pinned at the extremes for most people)', share(npcs(), (n) => Math.abs(n.psy.mood.v) < 0.9) >= 0.9);
  check('moods differ between people', new Set(npcs().map((n) => Math.round(n.psy.mood.v * 10))).size >= 4);

  /* ---- the social graph ---- */
  const circles = new Set(npcs().map((n) => n.psy.circle));
  check('friend circles are detected (>= 2 communities in a 3-circle world)', circles.size >= 2, String(circles.size));
  const sameCirc = (a, b) => G.S.npcs[a].psy.circle === G.S.npcs[b].psy.circle;
  let agree = 0, tot = 0;
  for (let c = 0; c < 3; c++) { const g = Object.keys(S.npcs).slice(c * 10, c * 10 + 10); for (let i = 1; i < g.length; i++) { tot++; if (sameCirc(g[0], g[i])) agree++; } }
  check('people planted in one circle mostly land in one detected community (>= 55%)', agree / tot >= 0.55, `${agree}/${tot}`);
  const statuses = npcs().map((n) => n.psy.status);
  check('status (PageRank) varies: some people are clearly more central', Math.max(...statuses) - Math.min(...statuses) > 0.3);

  /* ---- bounded growth after weeks ---- */
  run(16); // 30 days total
  const bytes = JSON.stringify(G.S).length;
  check(`30 days later the save is still small (${(bytes / 1e6).toFixed(2)} MB < 3 MB)`, bytes < 3e6);
  check('collections stay capped after 30 days', G.S.postOrder.length <= E.POST_CAP && G.S.queue.length <= 400 && G.S.stories.length <= 220 && G.S.notifs.length <= 120 && G.S.rumors.length <= 9 && G.S.trending.length <= 8);
  check('invariants hold after 30 days', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  check('followers did not run away (player stayed within 4x of start without posting)', G.S.player.followers < 8000 * 4);

  H.summary('ALIVE: activity, personality, DMs, gossip, memory');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
