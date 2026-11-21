// Bonds: the relationship-dynamics state machine (js/bonds.js). Pure logic, seeded randomness, zero API calls.
// Covers: stage table (every status at +-100), hysteresis + minimum days, confession eligibility, no double partners, fights >= 2 days and
// makeups that restore the previous type, follows that do not saturate, family that never decays, edge eviction, consequences, moods, jealousy.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const INFO = (s) => console.log('   · ' + s);

const PERS = ['bubbly, flirty, outgoing', 'arrogant, sarcastic', 'kind, warm, supportive, gentle', 'calm, disciplined, formal', 'dramatic, jealous, emotional', 'shy, quiet introvert', 'petty, savage, cold', 'chill, laid-back, funny'];
const DAY = 1440;

function world(n = 12, seed = 1) {
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'bonds' });
  const S = G.S;
  G.World.setSeed(seed);
  G.World.ensure(S);
  S.popSize = 0;
  S.clock = 20 * DAY;
  S.npcRel = [];
  const ids = [];
  for (let i = 0; i < n; i++) {
    const npc = E.makeNpc({ name: 'Npc' + i + ' Surname', handle: '@npc' + i, role: 'friend', age: 22 + (i % 15), personality: PERS[i % PERS.length], followers: 500 + 300 * i, aff: 40, status: 'friend' });
    npc.trust = 40;
    ids.push(npc.id);
  }
  return { S, ids };
}
const edgeOf = (S, a, b) => S.npcRel.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
const coupleCount = (S, id) => S.npcRel.filter((e) => ['dating', 'partner'].includes(e.type) && (e.a === id || e.b === id)).length;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const B = G.Bonds;
  check('G.Bonds exists with the documented API', !!B && ['stageOf', 'confession', 'edgeStep', 'consequences', 'partnerEffects', 'followDecision', 'neglect', 'settle', 'dayStep', 'addEdge', 'evict'].every((k) => typeof B[k] === 'function'));
  const R = G.React;
  const HOSTILE = R.HOSTILE;
  const FRIENDLY = R.FRIENDLY;
  const FAM = E.FAMILY;

  /* =============== 1. the stage table: every status at the extremes =============== */
  const bad = [];
  E.STATUSES.forEach((st) => [-100, 100].forEach((aff) => [0, 100].forEach((rom) => [0, 100].forEach((riv) => [0, 100].forEach((trust) => {
    const to = B.stageOf(aff, rom, riv, trust, { status: st });
    const tag = `${st}@aff${aff}/rom${rom}/riv${riv}/trust${trust}->${to}`;
    if (!E.STATUSES.includes(to)) bad.push('unknown ' + tag);
    if (FAM.includes(st) && to !== st) bad.push('family changed ' + tag);
    if (!FAM.includes(st) && aff === -100 && FRIENDLY.includes(to)) bad.push('still warm at -100 ' + tag);
    if (!FAM.includes(st) && aff === 100 && riv === 0 && HOSTILE.includes(to)) bad.push('hostile at +100 ' + tag);
    if (!FAM.includes(st) && aff === 100 && riv === 0 && rom === 0 && st !== 'stranger' && to === 'stranger') bad.push('forgot them ' + tag);
  })))));
  check('every status x extreme meters gives a sensible stage (256x32 combinations)', bad.length === 0, bad.slice(0, 4).join(' | '));
  const st = (s, aff, rom, riv, trust) => B.stageOf(aff, rom, riv, trust, { status: s });
  check('best_friend at aff -100 becomes an enemy (no more friend)', st('best_friend', -100, 0, 0, 50) === 'enemy');
  check('partner at aff -100 / trust 0 is an ex', st('partner', -100, 80, 0, 0) === 'ex');
  check('dating whose affection and romance collapse is an ex', st('dating', 5, 10, 0, 40) === 'ex' && st('dating', 60, 70, 0, 60) === 'dating');
  check('a partner who cools drops to dating, not straight to nothing', st('partner', 60, 30, 0, 60) === 'dating');
  check('an ex at aff 90 (calm, trusting) becomes a friend again', st('ex', 90, 0, 0, 60) === 'friend');
  check('an ex at aff -80 becomes an enemy', st('ex', -80, 0, 20, 10) === 'enemy');
  check('mentor and ally can be lost when affection collapses', st('mentor', -100, 0, 0, 0) === 'enemy' && st('ally', -30, 0, 0, 0) !== 'ally');
  check('a frenemy with affection is a friend again', st('frenemy', 80, 0, 0, 60) === 'friend');
  check('an enemy whose rivalry is gone and who warms up recovers (friend at most)', st('enemy', 80, 0, 0, 60) === 'friend');
  check('a crush whose romance fizzled with affection stays a friend, with none is an acquaintance', st('crush', 50, 0, 0, 50) === 'friend' && st('crush', 5, 0, 0, 50) === 'acquaintance');
  check('family keeps its status at aff -100 and is flagged estranged instead', st('mother', -100, 0, 0, 0) === 'mother' && B.estranged(-100, 0, 0, false) && !B.estranged(-5, 50, 0, true));

  /* =============== 2. hysteresis + minimum days =============== */
  check('hysteresis: a friend at aff 15 stays a friend (exit threshold below the enter threshold)', st('friend', 15, 0, 0, 40) === 'friend' && st('friend', 11, 0, 0, 40) === 'acquaintance');
  check('hysteresis: a stranger at aff 15 is not yet a friend, at 20 they are', st('acquaintance', 15, 0, 0, 40) === 'acquaintance' && st('acquaintance', 20, 0, 0, 40) === 'friend');
  check('minimum days: a best friend does not turn enemy on day 1 of the stage, does on day 4, and an event can force it', B.stageOf(-100, 0, 0, 0, { status: 'best_friend', days: 1 }) === 'best_friend' && B.stageOf(-100, 0, 0, 0, { status: 'best_friend', days: 4 }) === 'enemy' && B.stageOf(-100, 0, 0, 0, { status: 'best_friend', days: 0, force: true }) === 'enemy');
  const flipTest = (label, gen) => {
    const { S } = world(1, 3);
    const n = Object.values(S.npcs)[0];
    const rnd = B.rng(99);
    const tr = [];
    for (let d = 1; d <= 220; d++) {
      S.clock = d * DAY;
      gen(n, d, rnd);
      const r = B.settle(n, S);
      if (r) tr.push({ d, to: r.to });
    }
    let ok = true;
    let why = '';
    for (let i = 0; i + 1 < tr.length; i++) if (tr[i + 1].d - tr[i].d < (B.MIN[tr[i].to] || 1)) { ok = false; why = `${tr[i].to} on day ${tr[i].d} left on day ${tr[i + 1].d}`; }
    check(`no flip-flop (${label}): every stage lasts at least its minimum days`, ok && tr.length >= 2, why || tr.length + ' changes');
    INFO(`${label}: ${tr.length} changes in 220 days`);
  };
  flipTest('affection swings daily', (n, d) => { n.aff = d % 2 ? 60 : -10; n.rom = 0; n.riv = 0; n.trust = 50; });
  flipTest('everything random', (n, d, rnd) => { n.aff = Math.round(rnd() * 200 - 100); n.rom = Math.round(rnd() * 100); n.riv = Math.round(rnd() * 100); n.trust = Math.round(rnd() * 100); });
  {
    const { S } = world(1, 3);
    const n = Object.values(S.npcs)[0];
    n.status = 'best_friend';
    n.aff = -100;
    n.trust = 0;
    n.since = { best_friend: 20 };
    S.clock = 21 * DAY;
    check('settle respects npc.since: still a best friend 1 day into the stage', B.settle(n, S) === null && n.status === 'best_friend');
    S.clock = 26 * DAY;
    const r = B.settle(n, S);
    check('settle moves them after the minimum, stamps the new stage and drops the old one', r && r.to === 'enemy' && n.since.enemy === U_day(S) && n.since.best_friend === undefined);
  }
  function U_day(S) { return G.U.dayOf(S.clock); }

  /* =============== 3. confession =============== */
  {
    const { S, ids } = world(4, 5);
    const n = S.npcs[ids[0]];
    const other = S.npcs[ids[1]];
    S.dms[n.id] = [{ id: 'm1', from: n.id, text: 'hey', t: S.clock - DAY }, { id: 'm2', from: 'me', text: 'hi', t: S.clock - DAY + 5 }];
    n.status = 'friend'; n.aff = 60; n.rom = 20; n.trust = 50;
    check('a friend with romance, warmth and a recent DM may confess', B.confession(n, S) === true);
    S.dms[n.id] = [{ id: 'm1', from: n.id, text: 'hey', t: S.clock - 8 * DAY }];
    check('no recent interaction (8 days) -> no confession', B.confession(n, S) === false);
    S.postOrder.push('px');
    S.posts.px = { id: 'px', author: 'me', t: S.clock - DAY, text: 'hello', likedBy: [n.id], stats: { likes: 1 } };
    check('a like on the player\'s post in the last 5 days counts as interaction', B.confession(n, S) === true);
    delete S.posts.px; S.postOrder.pop();
    S.dms[n.id] = [{ id: 'm1', from: 'me', text: 'hi', t: S.clock - DAY }];
    ['mentor', 'ally', 'mother', 'brother', 'dating', 'partner', 'ex', 'enemy', 'rival', 'hater'].forEach((s) => { n.status = s; n.rom = 40; check(`${s} never confesses`, B.confession(n, S) === false, B.confessionBlock(n, S)); });
    n.status = 'friend'; n.rom = 0;
    check('a friend with zero romance does not confess', B.confession(n, S) === false);
    n.status = 'crush'; n.rom = 0;
    check('a crush (romantic status) may confess even at rom 0', B.confession(n, S) === true);
    n.status = 'friend'; n.rom = 30;
    B.markConfession(n, S, G.U.dayOf(S.clock));
    check('once per 30 days: blocked right after', B.confession(n, S) === false && B.confessionBlock(n, S) === 'cooldown');
    S.clock += 29 * DAY; S.dms[n.id] = [{ id: 'm3', from: 'me', text: 'hi', t: S.clock - DAY }];
    check('still blocked on day 29', B.confession(n, S) === false);
    S.clock += 2 * DAY; S.dms[n.id] = [{ id: 'm4', from: 'me', text: 'hi', t: S.clock - DAY }];
    check('allowed again after 30 days', B.confession(n, S) === true);
    S.npcRel.push({ a: n.id, b: other.id, type: 'dating' });
    check('not while partnered with another NPC', B.confession(n, S) === false && B.confessionBlock(n, S) === 'partnered');
  }

  /* =============== 4. no double partners over 60 days, 12 NPCs =============== */
  let newCouples = 0;
  let doubles = 0;
  let worst = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { S, ids } = world(12, seed);
    const p = (a, b, type, extra) => S.npcRel.push(Object.assign({ a: ids[a], b: ids[b], type }, extra || {}));
    p(0, 1, 'crush'); p(0, 2, 'crush'); p(0, 3, 'crush'); p(1, 2, 'crush'); p(4, 5, 'dating'); p(4, 6, 'crush'); p(6, 7, 'crush'); p(7, 8, 'crush'); p(7, 9, 'situationship'); p(10, 11, 'situationship'); p(9, 10, 'crush'); p(2, 11, 'crush');
    if (seed === 1) { p(8, 9, 'dating'); p(8, 10, 'dating'); } // a corrupt save with a double partner
    const rnd = B.rng(seed * 7919);
    for (let d = 1; d <= 60; d++) {
      S.clock = d * DAY + 20 * DAY;
      S.npcRel.forEach((e) => { S.sim.ties[e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a] = 6; });
      const out = B.dayStep(S, G.U.dayOf(S.clock), rnd, { max: 6 });
      out.events.forEach((ev) => { if (ev.kind === 'newcouple') newCouples++; if (ev.reason === 'double') doubles++; });
      ids.forEach((id) => { worst = Math.max(worst, coupleCount(S, id)); });
    }
  }
  check('nobody ever has two dating/partner edges (6 worlds x 12 NPCs x 60 days, with overlapping crushes and a corrupt save)', worst <= 1, 'max ' + worst);
  check('the corrupt double partner is repaired by an exit (the weaker becomes an ex)', doubles >= 1, String(doubles));
  check('crushes with mutual feelings and contact do turn into couples (the sim is not frozen)', newCouples >= 2, String(newCouples));
  INFO(`60-day sims: ${newCouples} new couples, ${doubles} double-partner repairs`);
  {
    const { S, ids } = world(4, 2);
    B.addEdge(S, ids[0], ids[1], 'dating');
    check('addEdge refuses a second couple edge for someone already partnered', B.addEdge(S, ids[0], ids[2], 'dating') === null && coupleCount(S, ids[0]) === 1);
    B.addEdge(S, ids[2], ids[3], 'friend');
    check('addEdge refuses to upgrade a friend edge into a double partnership', (B.addEdge(S, ids[0], ids[3], 'friend'), B.addEdge(S, ids[3], ids[0], 'dating').type !== 'dating'));
  }

  /* =============== 5. fights last >= 2 days, makeup restores the previous type =============== */
  {
    const { S, ids } = world(12, 11);
    ids.forEach((a, i) => ids.forEach((b, j) => { if (j > i) S.npcRel.push({ a, b, type: (i + j) % 3 === 0 ? 'best_friend' : 'friend' }); }));
    const rnd = B.rng(2024);
    const open = {};
    let fights = 0, makeups = 0, wrong = 0, early = 0;
    for (let d = 1; d <= 90; d++) {
      S.clock = d * DAY + 20 * DAY;
      S.npcRel.forEach((e) => { S.sim.ties[e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a] = 3; });
      const out = B.dayStep(S, G.U.dayOf(S.clock), rnd, { max: 999 });
      out.events.forEach((ev) => {
        const k = ev.a + '|' + ev.b;
        if (ev.kind === 'fight') { fights++; open[k] = { day: ev.day, was: ev.from }; }
        else if (ev.kind === 'feud') delete open[k];
        else if (ev.kind === 'makeup' && open[k]) {
          makeups++;
          if (ev.day - open[k].day < 2) early++;
          if (ev.to !== open[k].was) wrong++;
          delete open[k];
        }
      });
    }
    check('fights happen in a big friend group (the model is alive)', fights >= 8, String(fights));
    check('every fight lasts at least 2 days before the makeup', makeups >= 3 && early === 0, `${makeups} makeups, ${early} early`);
    check('a makeup restores the PREVIOUS type (best_friend stays best_friend, friend stays friend)', wrong === 0, String(wrong));
    INFO(`90 days, 66 edges: ${fights} fights, ${makeups} makeups`);
    // an explicit single edge
    const e = { a: ids[0], b: ids[1], type: 'frenemy', was: 'best_friend', d: 100, g: 0.1, s: 0.5 };
    S.npcRel = [e];
    const seen = [];
    for (let d = 100; d < 130 && e.type === 'frenemy'; d++) { const ev = B.edgeStep(S, e, d, () => 0.0, {}); if (ev) seen.push(ev.day); }
    check('at roll 0 the apology waits for day 2 and restores best_friend', seen.length === 1 && seen[0] === 102 && e.type === 'best_friend' && e.was === undefined, JSON.stringify(seen));
    check('the same edge never steps twice in one day', B.edgeStep(S, e, 102, () => 0, {}) === null);
  }

  /* =============== 6. follows do not saturate =============== */
  {
    const { S, ids } = world(24, 17);
    ids.forEach((id, i) => { const n = S.npcs[id]; n.status = ['friend', 'acquaintance', 'stranger', 'best_friend'][i % 4]; n.aff = [40, 10, 0, 80][i % 4]; });
    ids.forEach((a, i) => { for (const off of [1, 5]) S.npcRel.push({ a, b: ids[(i + off) % ids.length], type: off === 1 ? 'friend' : 'ally' }); });
    G.Social.analyze(S, B.rng(5));
    const rnd = B.rng(31337);
    const zero = { tries: 0, follows: 0 };
    const near = { tries: 0, follows: 0 };
    ids.forEach((id) => { G.Persona.ensure(S.npcs[id]).following = []; });
    for (let d = 1; d <= 60; d++) {
      ids.forEach((id) => {
        const n = S.npcs[id];
        const p = G.Persona.ensure(n);
        for (let k = 0; k < 2; k++) {
          const t = ids[Math.floor(rnd() * ids.length)];
          if (t === id) continue;
          const rel = R.relation(S, n, t);
          const dec = B.followDecision(S, n, t, rnd);
          const bucket = rel.c < 0.25 ? zero : rel.c >= 0.6 ? near : null;
          if (bucket && !p.following.includes(t)) { bucket.tries++; if (dec === 'follow') bucket.follows++; }
          if (dec === 'follow' && !p.following.includes(t)) p.following.push(t);
          else if (dec === 'unfollow') p.following = p.following.filter((x) => x !== t);
        }
      });
    }
    const avg = ids.reduce((a, id) => a + G.Persona.ensure(S.npcs[id]).following.length, 0) / ids.length;
    const max = Math.max(...ids.map((id) => G.Persona.ensure(S.npcs[id]).following.length));
    check('follows stay selective: average follows per NPC after 60 days is below 12 of 23 possible', avg < 12, avg.toFixed(1));
    check('nobody follows nearly everybody (max <= 20 of 23)', max <= 20, String(max));
    check('no base chance at zero closeness: distant strangers are never followed', zero.follows === 0, `${zero.follows}/${zero.tries}`);
    check('close people do get followed', near.tries > 0 && near.follows / near.tries > 0.1, `${near.follows}/${near.tries}`);
    INFO(`avg follows ${avg.toFixed(1)}, max ${max}; distant ${zero.follows}/${zero.tries}, close ${near.follows}/${near.tries}`);
    const a = S.npcs[ids[0]];
    const b = S.npcs[ids[1]];
    G.Persona.ensure(a).following = [b.id];
    G.Persona.ensure(a).grudges[b.id] = 0.8;
    check('after a grudge the follow is dropped (high chance)', B.followDecision(S, a, b.id, () => 0.1) === 'unfollow');
  }

  /* =============== 7. family never decays =============== */
  {
    const { S, ids } = world(3, 4);
    const n = S.npcs[ids[0]];
    let anyDecay = false;
    FAM.forEach((f) => { n.aff = 60; n.rom = 0; if (B.neglect(n, f, 400) !== 0 || B.drift(n, f, 400).aff !== 0) anyDecay = true; });
    check('neglect() is 0 for every family status, however long the silence', !anyDecay);
    n.status = 'mother'; n.aff = -100; n.trust = 0; n.riv = 80;
    for (let d = 1; d <= 40; d++) { S.clock = d * DAY; B.settle(n, S); }
    check('a mother at aff -100 is still a mother, flagged estranged', n.status === 'mother' && n.estranged === true);
    n.aff = 10; n.trust = 60; B.settle(n, S);
    check('the estrangement flag clears (key deleted, never null) when things mend', n.estranged === undefined && !('estranged' in n));
    const e = { a: ids[0], b: ids[1], type: 'family' };
    S.npcRel = [e];
    const rnd = B.rng(8);
    for (let d = 1; d <= 400; d++) B.edgeStep(S, e, d, rnd, {});
    check('a family edge stays family with full strength after 400 days', e.type === 'family' && B.strength(e) === 1 && S.npcRel.includes(e));
    const f = { a: ids[0], b: ids[1], type: 'family' };
    let tripped = false;
    for (let d = 1; d <= 30; d++) { const ev = B.edgeStep(S, f, d, () => 0, {}); if (ev && ev.kind === 'fight') { tripped = true; break; } }
    check('a family fight is only an estranged flag on the edge (type unchanged)', tripped && f.type === 'family' && typeof f.estr === 'number');
  }

  /* =============== 8. eviction never removes family or couples =============== */
  {
    const { S, ids } = world(12, 6);
    const add = (a, b, type, s) => S.npcRel.push({ a: ids[a], b: ids[b], type, s });
    add(0, 1, 'family', 0.01); add(0, 2, 'family', 0.01); add(1, 2, 'family', 0.01); add(3, 4, 'dating', 0.02); add(5, 6, 'partner', 0.02);
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (!edgeOf(S, ids[i], ids[j])) add(i, j, j % 2 ? 'friend' : 'rival', 0.1 + ((i * 12 + j) % 50) / 100);
    const before = S.npcRel.length;
    const lowest = S.npcRel.filter((e) => !['family', 'dating', 'partner'].includes(e.type)).map((e) => e.s).sort((x, y) => x - y);
    const n = B.evict(S, 40);
    check('evict() trims to the cap', S.npcRel.length === 40 && n === before - 40, S.npcRel.length + '/' + before);
    check('eviction keeps every family and couple edge', S.npcRel.filter((e) => e.type === 'family').length === 3 && S.npcRel.filter((e) => ['dating', 'partner'].includes(e.type)).length === 2);
    const kept = S.npcRel.filter((e) => !['family', 'dating', 'partner'].includes(e.type)).map((e) => e.s);
    check('what goes is the weakest (every kept plain edge is at least as strong as every evicted one)', Math.min(...kept) >= lowest[n - 1] - 1e-9);
    // all protected: nothing is evicted, no infinite loop
    S.npcRel = S.npcRel.filter((e) => ['family', 'dating', 'partner'].includes(e.type));
    check('with only protected edges left, evict() removes nothing', B.evict(S, 2) === 0 && S.npcRel.length === 5);
    // addEdge under pressure
    S.npcRel = [];
    for (let i = 0; i < 11; i++) B.addEdge(S, ids[i], ids[i + 1], i < 3 ? 'family' : 'friend', '', 1, 6);
    for (let i = 0; i < 12; i++) for (let j = i + 2; j < 12; j++) B.addEdge(S, ids[i], ids[j], 'friend', '', 1, 6);
    check('addEdge with a small cap never loses the family edges', S.npcRel.length <= 6 && S.npcRel.filter((e) => e.type === 'family').length === 3);
  }

  /* =============== 9. consequences, moods, jealousy, neglect =============== */
  {
    const { S, ids } = world(6, 9);
    const [a, b, c] = [S.npcs[ids[0]], S.npcs[ids[1]], S.npcs[ids[2]]];
    [a, b].forEach((n) => { const p = G.Persona.ensure(n); p.following = [a.id, b.id, 'me'].filter((x) => x !== n.id); });
    S.player.followers = 100;
    const chronBefore = S.chronicle.length;
    const out = B.consequences(S, { kind: 'breakup', a: a.id, b: b.id, by: a.id }, () => 0.1);
    const pa = G.Persona.ensure(a), pb = G.Persona.ensure(b);
    check('breakup: mutual grudges, the dumped one holds the bigger one', pa.grudges[b.id] > 0 && pb.grudges[a.id] > pa.grudges[b.id] - 0.001);
    check('breakup: they unfollow each other', !pa.following.includes(b.id) && !pb.following.includes(a.id));
    check('breakup: both get a mood modifier with an expiry that lasts days', pa.moods && pb.moods && pb.moods[0].until - S.clock >= 5 * DAY && pa.moods[0].until - S.clock >= 3 * DAY);
    check('breakup between NPCs: a chronicle line, no DM to the player', S.chronicle.length === chronBefore + 1 && /broke up/.test(S.chronicle[S.chronicle.length - 1].text) && out.length === 0);
    const quiet = B.consequences(S, { kind: 'fight', a: b.id, b: c.id }, () => 0.9, { chron: false, notify: false });
    check('chron:false suppresses the chronicle line (dayStep uses it with W.event)', S.chronicle.length === chronBefore + 1 && quiet.length === 0);

    G.Persona.ensure(c).following = ['me'];
    const notifs0 = S.notifs.length;
    const intents = B.consequences(S, { kind: 'breakup', a: c.id, b: 'me', by: c.id }, () => 0.1);
    check('breakup with the player: one DM intent from the NPC, a notification, a grudge, one fewer follower', intents.length === 1 && intents[0].npc === c.id && /^bonds:breakup/.test(intents[0].reason) && typeof intents[0].text === 'string' && S.notifs.length === notifs0 + 1 && G.Persona.ensure(c).grudges.me > 0 && S.player.followers === 99);
    const rd = B.consequences(S, { kind: 'betrayal', a: 'me', b: c.id }, () => 0.1);
    check('betrayal of an NPC by the player: grudge, trust crash, a confronting DM intent', rd.length === 1 && rd[0].reason === 'bonds:betrayal' && G.Persona.ensure(c).grudges.me >= 0.8);
    const gh = B.consequences(S, { kind: 'ghosting', a: 'me', b: c.id }, () => 0.1);
    check('ghosting: the ghosted NPC asks what is wrong', gh.length === 1 && gh[0].reason === 'bonds:ghosting');
    const cf = B.consequences(S, { kind: 'confession', a: b.id, b: 'me' }, () => 0.1);
    check('confession: an intent from the confessor and the 30-day cooldown is stamped', cf.length === 1 && cf[0].reason === 'bonds:confession' && typeof b.since.confess === 'number');
    const mk = G.Persona.ensure(c).grudges.me;
    B.consequences(S, { kind: 'makeup', a: 'me', b: c.id }, () => 0.5);
    check('makeup soothes the grudge', G.Persona.ensure(c).grudges.me < mk);
    check('unknown event kinds are ignored', B.consequences(S, { kind: 'nonsense', a: a.id, b: b.id }, () => 0).length === 0);
  }
  {
    // a mood hit lasts days, then goes (Persona.decay would erase it in hours alone)
    const { S, ids } = world(2, 12);
    const n = S.npcs[ids[1]];
    const p = G.Persona.ensure(n);
    const hooked = /Bonds/.test(String(G.Persona.decay));
    check('Persona.decay holds relationship moods over time', hooked);
    const ctrl = S.npcs[ids[0]];
    const pc = G.Persona.ensure(ctrl);
    pc.baseline = p.baseline = 0.2;
    pc.mood.v = p.mood.v = 0.2;
    B.consequences(S, { kind: 'breakup', a: ids[0], b: ids[1], by: ids[0] }, () => 0.99);
    delete pc.moods; // this control character deliberately gets no persistent modifier
    G.Persona.nudge(ctrl, -0.6, 0.2); // the same immediate hit, but with nothing holding it
    const at = {};
    for (let h = 1; h <= 14 * 24; h++) {
      S.clock += 60;
      [n, ctrl].forEach((x) => { G.Persona.decay(x, 60); });
      if (!hooked) B.moodHold(n, 60);
      if (h === 48 || h === 6 * 24 || h === 14 * 24) at[h] = { held: p.mood.v - p.baseline, free: pc.mood.v - pc.baseline, moods: !!p.moods };
    }
    check('without the hold the mood hit is gone in 2 days', Math.abs(at[48].free) < 0.02, String(at[48].free));
    check('with the hold the mood is still clearly down after 2 days and after 6 days', at[48].held < -0.15 && at[6 * 24].held < -0.05, `${at[48].held.toFixed(2)} / ${at[6 * 24].held.toFixed(2)}`);
    check('after 14 days the modifier has expired (key deleted) and the mood is back at baseline', !at[14 * 24].moods && Math.abs(at[14 * 24].held) < 0.03, String(at[14 * 24].held));
    check('moods array is capped', (() => { for (let i = 0; i < 12; i++) B.addMood(n, -0.1, 2, 'w' + i, S); return p.moods.length <= 6; })());
    INFO('persona.js mood hold ' + (hooked ? 'wired' : 'missing'));
  }
  {
    const { S, ids } = world(4, 13);
    const n = S.npcs[ids[0]];
    const o = S.npcs[ids[1]];
    n.status = 'crush'; n.rom = 30; n.aff = 50;
    check('no jealousy without a partner edge', B.partnerEffects(S, n, () => 0.1, 30).cooled === 0);
    S.npcRel.push({ a: n.id, b: o.id, type: 'dating' });
    const r1 = B.partnerEffects(S, n, () => 0.1, 30);
    check('a crush partnered with another NPC: romance cools and a jealousy intent comes back', r1.cooled === 2 && n.rom === 28 && r1.intent && r1.intent.reason === 'jealousy' && r1.intent.npc === n.id && r1.betrayal === false);
    const r2 = B.partnerEffects(S, n, () => 0.1, 31);
    check('the intent is rate limited (14 days) but the cooling continues', r2.intent === null && n.rom === 26);
    for (let d = 32; d < 80; d++) B.partnerEffects(S, n, () => 0.1, d);
    check('romance bottoms out at 0, never negative', n.rom === 0);
    const q = S.npcs[ids[2]];
    q.status = 'partner'; q.rom = 80; q.trust = 70; q.aff = 70;
    S.npcRel.push({ a: q.id, b: S.npcs[ids[3]].id, type: 'partner' });
    const r3 = B.partnerEffects(S, q, () => 0.1, 40);
    check('the player\'s own partner who is partnered with an NPC: stronger cooling, trust loss, betrayal flag', r3.betrayal === true && q.rom === 77 && q.trust === 68 && r3.intent && /someone else|seeing/.test(r3.intent.text));
  }
  {
    const { S, ids } = world(2, 14);
    const n = S.npcs[ids[0]];
    n.aff = 90;
    check('partner drifts when ignored (after the grace), friend too, mentor/ally barely, family not at all',
      B.neglect(n, 'partner', 2) === 0 && B.neglect(n, 'partner', 30) > 0 && B.neglect(n, 'friend', 30) > B.neglect(n, 'best_friend', 30) * 0 && B.neglect(n, 'mentor', 60) <= 0.05 && B.neglect(n, 'ally', 60) <= 0.05 && B.neglect(n, 'mother', 400) === 0);
    check('neglect is 0 for hostile bonds and never pushes below the status floor', B.neglect(n, 'enemy', 100) === 0 && (() => { n.aff = 16; const x = B.neglect(n, 'friend', 100); return x <= 2 && B.neglect(Object.assign({}, n, { aff: 14 }), 'friend', 100) === 0; })());
    n.aff = 70; n.rom = 40; n.riv = 40;
    const d = B.drift(n, 'crush', 20);
    check('drift cools romance for a crush and rivalry for a rival over time', d.rom < 0 && d.riv < 0 && d.aff < 0);
    let aff = 80;
    const fn = { aff, rom: 0, riv: 0 };
    for (let day = 1; day <= 200; day++) fn.aff -= B.neglect(fn, 'friend', day);
    check('200 days of silence takes a friend down to the friend floor but not below', fn.aff >= 14 && fn.aff < 30, String(fn.aff));
  }

  /* =============== 10. determinism, tiny state, world invariants =============== */
  const runOnce = () => {
    const { S, ids } = world(12, 21);
    ids.forEach((a, i) => ids.forEach((b, j) => { if (j > i && (i + j) % 4 === 0) S.npcRel.push({ a, b, type: ['friend', 'crush', 'dating', 'rival', 'ex', 'best_friend'][(i * 3 + j) % 6] }); }));
    const rnd = B.rng(555);
    const log = [];
    for (let d = 1; d <= 50; d++) {
      S.clock = d * DAY + 20 * DAY;
      S.npcRel.forEach((e) => { S.sim.ties[e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a] = 2 + (d % 4); });
      const out = B.dayStep(S, G.U.dayOf(S.clock), rnd, { max: 4 });
      out.events.forEach((ev) => log.push([ev.kind, ev.a, ev.b, ev.from, ev.to, ev.day].join(':')));
    }
    return { log: log.join(','), S };
  };
  const r1 = runOnce();
  const r2 = runOnce();
  check('same seed -> identical event log (deterministic, injectable rnd)', r1.log === r2.log && r1.log.length > 0, r1.log.slice(0, 80));
  const nulls = [];
  r1.S.npcRel.forEach((e) => Object.keys(e).forEach((k) => { if (e[k] == null) nulls.push('edge.' + k); }));
  Object.values(r1.S.npcs).forEach((n) => Object.keys(n.since || {}).forEach((k) => { if (typeof n.since[k] !== 'number') nulls.push('since.' + k); }));
  check('no null/undefined keys written to edges or npc.since', nulls.length === 0, nulls.slice(0, 3).join(','));
  const bytes = JSON.stringify(r1.S.npcRel).length;
  check('edge state stays tiny (< 130 bytes per edge)', bytes / Math.max(1, r1.S.npcRel.length) < 130, (bytes / Math.max(1, r1.S.npcRel.length)).toFixed(0));
  check('world invariants hold after the sims', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  check('the module made no API calls and no DOM changes of its own', H.state.calls === 0);

  /* =============== 11. the live game loop: 60 days, 10 NPCs through E.tick (wiring end to end) =============== */
  {
    const { S, ids } = world(10, 77);
    const W = G.World;
    const N = (i) => S.npcs[ids[i]];
    [[0, 1], [2, 3], [4, 5]].forEach(([a, b]) => { S.npcRel.push({ a: ids[a], b: ids[b], type: 'dating', s: 0.1 }); N(a).status = N(b).status = 'friend'; });
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) if (!edgeOf(S, ids[i], ids[j]) && (i + j) % 3 === 0) S.npcRel.push({ a: ids[i], b: ids[j], type: (i + j) % 2 ? 'friend' : 'best_friend' });
    Object.assign(N(6), { status: 'mentor', rom: 30, aff: 70, trust: 60 });
    Object.assign(N(7), { status: 'ally', rom: 30, aff: 70, trust: 60 });
    Object.assign(N(8), { status: 'mother', rom: 0, aff: 60, trust: 60 });
    Object.assign(N(9), { status: 'friend', rom: 30, aff: 60, trust: 50 });
    Object.assign(N(3), { status: 'friend', rom: 30, aff: 60, trust: 50 });
    ids.forEach((id) => { G.Persona.ensure(S.npcs[id]).following = ids.filter((x) => x !== id); });
    const old = S.clock - 20 * DAY;
    ids.forEach((id) => { S.dms[id] = [{ id: 'm0', from: 'me', text: 'hey', t: old, read: true }]; });
    const spy = { goals: 0, charts: 0, worldEvent: 0, drift: [], dayStep: 0 };
    const o = { gs: G.Goals.step, cs: G.Charts && G.Charts.sample, we: W.worldEvent, dr: B.drift, ds: B.dayStep, sd: W.sendDm };
    G.Goals.step = function () { spy.goals++; return o.gs.apply(this, arguments); };
    if (G.Charts) G.Charts.sample = function () { spy.charts++; return o.cs.apply(this, arguments); };
    W.worldEvent = function () { spy.worldEvent++; return o.we.apply(this, arguments); };
    B.drift = function (n, status, days) { const r = o.dr.apply(this, arguments); spy.drift.push({ status, days, aff: r.aff }); return r; };
    const evs = [];
    const bk = [];
    B.dayStep = function (St, day, rnd, opt) {
      spy.dayStep++;
      const r = o.ds.apply(this, arguments);
      r.events.forEach((ev) => {
        evs.push(ev);
        if (ev.kind === 'breakup') {
          const pa = G.Persona.ensure(St.npcs[ev.a]);
          const pb = G.Persona.ensure(St.npcs[ev.b]);
          bk.push({ g: (pa.grudges[ev.b] || 0) > 0 && (pb.grudges[ev.a] || 0) > 0, unf: !pa.following.includes(ev.b) || !pb.following.includes(ev.a) });
        }
      });
      return r;
    };
    const conf = [];
    W.sendDm = function (npc, kind, t, extra) { if (/confession/.test(kind)) conf.push({ id: npc.id, status: npc.status }); return o.sd.apply(this, arguments); };
    const open = {};
    let early = 0, wrong = 0, makeups = 0, doubleSeen = 0;
    const fam0 = N(8).aff;
    for (let d = 1; d <= 60; d++) {
      ids.forEach((id) => { S.dms[id].push({ id: 'm' + d, from: 'me', text: 'hi', t: S.clock - 60, read: true }); if (S.dms[id].length > 3) S.dms[id].shift(); });
      S.npcRel.forEach((e) => { if (e.type === 'friend' || e.type === 'best_friend') S.sim.ties[e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a] = 3; });
      for (let h = 0; h < 24; h++) E.tick(60);
      ids.forEach((id) => { if (coupleCount(S, id) > 1) doubleSeen++; });
    }
    evs.forEach((ev) => {
      const k = ev.a + '|' + ev.b;
      if (ev.kind === 'fight') open[k] = { day: ev.day, was: ev.from };
      else if (ev.kind === 'feud') delete open[k];
      else if (ev.kind === 'makeup' && open[k]) { makeups++; if (ev.day - open[k].day < 2) early++; if (ev.to !== open[k].was) wrong++; delete open[k]; }
    });
    Object.assign(G.Goals, { step: o.gs }); if (G.Charts) G.Charts.sample = o.cs; W.worldEvent = o.we; B.drift = o.dr; B.dayStep = o.ds; W.sendDm = o.sd;
    check('daily rollover runs: Goals.step, Charts.sample and World.worldEvent each fire about once a day (60 days)', spy.goals >= 55 && spy.charts >= 55 && spy.worldEvent >= 55, JSON.stringify({ g: spy.goals, c: spy.charts, w: spy.worldEvent }));
    check('Bonds.dayStep runs once per day inside the live loop', spy.dayStep >= 55 && spy.dayStep <= 62, String(spy.dayStep));
    check('no NPC ever holds two partner edges in the live loop', doubleSeen === 0);
    check('breakups happened and left grudges on both sides and at least one unfollow', bk.length >= 1 && bk.every((x) => x.g && x.unf), `${bk.length} breakups ${JSON.stringify(bk).slice(0, 120)}`);
    check('mentor, ally and family never confess; the eligible friend can', conf.length >= 1 && conf.every((c) => !['mentor', 'ally', 'mother'].includes(c.status) && c.id !== ids[6] && c.id !== ids[7] && c.id !== ids[8]), JSON.stringify(conf));
    check('ignore-decay is called daily for people with old contact and spares family', spy.drift.some((x) => x.status === 'friend' || x.status === 'crush') && spy.drift.filter((x) => ['mother'].includes(x.status)).every((x) => x.aff === 0) && N(8).status === 'mother' && N(8).aff >= fam0 - 2, `mother aff ${fam0} -> ${N(8).aff}`);
    check('makeups in the live loop come after >= 2 days and restore the previous type', early === 0 && wrong === 0, `${makeups} makeups early ${early} wrong ${wrong}`);
    INFO(`live loop: ${evs.length} bond events, ${bk.length} breakups, ${conf.length} confessions, ${makeups} makeups, goals ${spy.goals}/charts ${spy.charts}/events ${spy.worldEvent}`);
    check('world invariants hold after the live 60 days', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  }

  H.summary('BONDS: relationship dynamics (stages, edges, consequences)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
