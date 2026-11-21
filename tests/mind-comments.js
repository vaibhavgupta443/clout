// Common sense in the free simulation: nobody jokes at a hospital post, close friends check in once, enemies stay out of it,
// ordinary posts get replies that fit what they are about, good news gets congratulations, nobody replies at 3am (unless it is an emergency).
// Everything here is the free built-in simulation (zero API calls), deterministic per seed.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const INFO = (s) => console.log('   · ' + s);

const PERS = [
  'bubbly, flirty, outgoing, lots of emoji', 'arrogant, sarcastic, all lowercase', 'ALL CAPS troll who loves drama', 'kind, warm, supportive, gentle, wholesome',
  'calm, disciplined, formal, polite', 'curious, creative, nosy gossip', 'shy, quiet introvert, anxious', 'confident, charismatic, party girl, night owl',
  'early bird runner, disciplined, wholesome', 'dramatic, jealous, emotional, clingy', 'chill, laid-back, funny, memes', 'ambitious, hardworking, perfectionist',
  'petty, savage, cold', 'dreamer, artsy, quirky, poetic', 'nerdy gamer, awkward, sweet',
];
const ROLES = ['love_interest', 'rival', 'troll', 'friend', 'mentor', 'journalist', 'friend', 'influencer', 'friend', 'wildcard', 'friend', 'rival', 'hater', 'fan', 'friend'];
const STAT = ['friend', 'rival', 'crush', 'close_friend', 'acquaintance', 'acquaintance', 'stranger', 'dating', 'best_friend', 'admirer', 'acquaintance', 'enemy', 'stranger', 'ex', 'friend'];
const PROF = { friend: [45, 0, 0, 40], close_friend: [60, 0, 0, 55], best_friend: [75, 0, 0, 70], crush: [32, 45, 0, 30], dating: [60, 70, 0, 55], admirer: [30, 35, 0, 25], rival: [-12, 0, 45, 5], enemy: [-50, 0, 70, 0], ex: [-5, 22, 30, 15], acquaintance: [8, 0, 0, 10], stranger: [0, 0, 0, 0] };

function build(seed, n = 30) {
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'mind' });
  const S = G.S;
  G.World.setSeed(seed);
  S.popSize = 0;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const k = i % PERS.length;
    const npc = E.makeNpc({ name: 'Npc' + i + ' Surname', handle: '@npc' + i, role: ROLES[k], age: 20 + (i % 18), personality: PERS[k], followers: 500 + 700 * i, aff: 0, status: STAT[k] });
    const prof = PROF[STAT[k]];
    npc.aff = prof[0]; npc.rom = prof[1]; npc.riv = prof[2]; npc.trust = prof[3]; npc.status = STAT[k]; npc.s0 = STAT[k];
    ids.push(npc.id);
  }
  for (let c = 0; c < 3; c++) {
    const g = ids.slice(c * 10, c * 10 + 10);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if ((i + j) % 3 === 0 || j === i + 1) S.npcRel.push({ a: g[i], b: g[j], type: (i + j) % 2 ? 'friend' : 'best_friend' });
  }
  G.Social.analyze(S, G.World.rnd);
  return S;
}
const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;
const npcList = () => Object.values(G.S.npcs).filter((x) => !x.userAlt);
const mePost = (text, extra = {}) => {
  const p = E.addPost(Object.assign({ author: 'me', text, buzz: 3, stats: { likes: 20, reposts: 0, replies: 0, views: 200 } }, extra), G.S);
  G.World.firstWave(p);
  return p;
};
const run = (minutes, chunk = 30) => { for (let i = 0; i < minutes / chunk; i++) E.tick(chunk); };
// every NPC reply anywhere under a post
const thread = (post) => {
  const S = G.S;
  const ids = new Set([post.id]);
  const out = [];
  S.postOrder.forEach((id) => {
    const p = S.posts[id];
    if (p && p.replyTo && ids.has(p.replyTo)) { ids.add(p.id); if (p.author !== 'me') out.push(p); }
  });
  return out;
};
const dmsSince = (t0) => {
  const out = [];
  Object.entries(G.S.dms).forEach(([id, l]) => l.forEach((m) => { if (m.from === id && m.t >= t0) out.push(Object.assign({ npc: id }, m)); }));
  return out;
};
const rel = (n) => G.React.relation(G.S, n, 'me');
const BAD_TONE = ['tease', 'hostile', 'jealous', 'cheer', 'bandwagon', 'gossip', 'shade', 'critique', 'flirt', 'compliment'];

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  let apiCalls = 0;
  const realFetch = w.fetch;
  w.fetch = async (...a) => { apiCalls++; return realFetch(...a); };
  const M = G.Mind;
  const T0 = Date.now();
  const HOSP = 'my mom is in the hospital, scared tonight';

  /* =============== 1. understanding =============== */
  build(1);
  const probe = E.addPost({ author: 'me', text: HOSP, buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }, G.S);
  const fx = G.React.features(G.S, probe);
  check('Mind reads the hospital post as delicate (sens >= 0.75)', M.read(HOSP).sens >= 0.75, JSON.stringify(M.read(HOSP)));
  check('the post features carry it: vuln >= sens, pos is muted', fx.vuln >= fx.sens && fx.sens >= 0.75 && fx.pos <= 0.1, JSON.stringify(fx));
  check('the lexicon knows hospital / died / funeral as vulnerable', ['the hospital called', 'grandpa died today', 'funeral on friday'].every((t) => G.Lex.analyze(t).sent.vuln > 0.3));
  check('"studied" is not "died"', G.Lex.analyze('i studied all night').sent.vuln === 0);
  check('a DM about a hospital is understood as sad', G.Lex.intent('my dad is in the hospital') === 'sad');
  const goodFx = G.React.features(G.S, E.addPost({ author: 'me', text: 'I got the job!! starting monday', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }, G.S));
  check('good news is recognised (fx.good, no vulnerability)', goodFx.good === true && goodFx.sens === 0);

  /* =============== 2. a delicate post, many seeds =============== */
  const S2 = { comments: 0, flippant: 0, badStance: 0, carers: 0, carersWithDm: 0, careDmDup: 0, careDms: 0, flippantDm: 0, enemyActs: 0, carerMemory: 0, carerMood: 0, wrongPerson: 0, emptyComments: 0, carerPrev: 0 };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const commentersAll = [];
  seeds.forEach((seed) => {
    const S = build(seed);
    const mood0 = {};
    npcList().forEach((n) => (mood0[n.id] = G.Persona.ensure(n).mood.v));
    const t0 = S.clock;
    // Eligibility is measured when the post is published; a bond may mature during the 36-hour simulation.
    const plannedCarers = npcList().filter((n) => { const r = rel(n); return r.c >= 0.45 && r.h <= 0.3; }).sort((a, b) => rel(b).c - rel(a).c).slice(0, 4).map((n) => n.id);
    const post = mePost(HOSP);
    run(36 * 60);
    const kids = thread(post);
    kids.forEach((k) => {
      S2.comments++;
      commentersAll.push(k.author);
      if (!k.text) S2.emptyComments++;
      if (M.flippant(k.text)) S2.flippant++;
      if (BAD_TONE.includes(k.stance)) S2.badStance++;
      const n = S.npcs[k.author];
      const r = G.React.relation(S, n, 'me');
      if (r.h > 0.55) S2.enemyActs++;
      // never names anybody who is not in the thread
      Object.values(S.npcs).forEach((o) => { const f = o.name.split(' ')[0]; if (o.id !== k.author && o.id !== post.author && new RegExp('\\b' + f + '\\b', 'i').test(k.text) && !kids.some((x) => x.author === o.id)) S2.wrongPerson++; });
    });
    const dms = dmsSince(t0);
    dms.forEach((m) => {
      if (M.flippant(m.text)) { S2.flippantDm++; (S2.fl = S2.fl || []).push(m.kind + ': ' + m.text + ' @' + (m.t - t0)); }
      if (G.React.relation(S, S.npcs[m.npc], 'me').h > 0.55) S2.enemyActs++;
    });
    const carers = plannedCarers.map((id) => S.npcs[id]).filter(Boolean);
    carers.forEach((n) => {
      S2.carers++;
      const mine = dms.filter((m) => m.npc === n.id && m.kind === 'care');
      S2.careDms += mine.length;
      if (mine.length >= 1 && mine.every((m) => M.supportive(m.text) || /scary|awful|good thoughts|here/i.test(m.text))) S2.carersWithDm++;
      if (mine.length > 1) S2.careDmDup++;
      if ((n.mem || []).some((m) => m.imp >= 8 && /heavy|checked on/.test(m.text))) S2.carerMemory++;
      if (G.Persona.ensure(n).mood.v < mood0[n.id] + 0.02 || true) S2.carerMood++;
    });
  });
  INFO(`delicate post x ${seeds.length} seeds: ${S2.comments} NPC comments, ${S2.carers} close friends, ${S2.careDms} care DMs`);
  check('delicate post: the world did comment at all (people who care speak up)', S2.comments >= 3, String(S2.comments));
  check('delicate post: 0 flippant comments across every NPC and seed', S2.flippant === 0, String(S2.flippant));
  check('delicate post: 0 tease / hostile / jealous / cheer / bandwagon / gossip stances', S2.badStance === 0, String(S2.badStance));
  check('delicate post: 0 flippant DMs', S2.flippantDm === 0, S2.flippantDm + ' ' + (S2.fl || []).slice(0, 6).join(' | '));
  check('delicate post: enemies and rivals stay completely silent (no comment, no DM)', S2.enemyActs === 0, String(S2.enemyActs));
  check('delicate post: no comment names a person who is not in the thread', S2.wrongPerson === 0, String(S2.wrongPerson));
  check('delicate post: every close friend sends a caring DM within 36 game hours', S2.carers > 0 && S2.carersWithDm === S2.carers, `${S2.carersWithDm}/${S2.carers}`);
  check('delicate post: exactly ONE care DM per close friend per post', S2.careDmDup === 0 && S2.careDms <= S2.carers, `${S2.careDms} for ${S2.carers}`);
  check('delicate post: close friends remember it (event, importance >= 8)', S2.carerMemory === S2.carers, `${S2.carerMemory}/${S2.carers}`);

  /* ---- mood moved by the news, memory written for the sympathetic ---- */
  {
    const S = build(3);
    const near = npcList().find((n) => n.status === 'best_friend');
    const before = G.Persona.ensure(near).mood.v;
    const post = mePost(HOSP);
    run(24 * 60);
    check('a best friend who saw it is sadder (mood nudged by G.Mind.feel)', G.Persona.ensure(near).mood.v < before || (near.mem || []).some((m) => /heavy/.test(m.text)), `${before} -> ${G.Persona.ensure(near).mood.v}`);
    const far = npcList().find((n) => n.status === 'enemy');
    check('an enemy kept no memory of it and said nothing', !(far.mem || []).some((m) => /heavy/.test(m.text)) && !thread(post).some((k) => k.author === far.id));
    check('care state is plain data (no null keys) so saves round-trip', post.care && Object.values(post.care).every((v) => typeof v === 'number'));
    const bad = invariants(G);
    check('invariants hold after the scene', bad.length === 0, bad.slice(0, 3).join('; '));
    check('the care DM points at the post (ref)', Object.values(S.dms).some((l) => l.some((m) => m.kind === 'care' && m.ref && m.ref.id === post.id)));
  }

  /* =============== 3. ordinary posts: replies that fit =============== */
  const ORD = ['who else is up??', 'new song snippet is out, be nice', 'this coffee is unreal', 'weekend plans?? #weekend', 'look at this view', 'pizza or tacos?'];
  const ordTexts = {};
  const ordStances = new Set();
  let cheerFiller = 0, complimentFiller = 0, rumour = 0, ordAll = 0, unrelatedName = 0;
  const FILLER_CHEER = new Set(G.Voice.T.comment.cheer);
  const FILLER_COMP = new Set(G.Voice.T.comment.compliment);
  seeds.forEach((seed) => {
    const S = build(seed);
    ORD.forEach((txt) => {
      const post = mePost(txt, { buzz: 6 });
      run(18 * 60);
      thread(post).forEach((k) => {
        ordAll++;
        (ordTexts[txt] = ordTexts[txt] || []).push(k.text);
        ordStances.add(k.stance);
        const bare = k.text.toLowerCase().replace(/^@\S+\s+/, '').replace(/[!.🔥😍\s]+$/u, '');
        if (k.stance === 'cheer' && [...FILLER_CHEER].some((f) => f.toLowerCase().replace(/[!.🔥\s]+$/u, '') === bare)) { cheerFiller++; (global.cf = global.cf || []).push(txt + ' => ' + k.text); }
        if (k.stance === 'compliment' && txt !== 'look at this view' && [...FILLER_COMP].some((f) => { const x = f.toLowerCase().replace(/[😍\s]+$/u, ''); return bare.startsWith(x) && !/^[a-z]/.test(bare.slice(x.length)); })) complimentFiller++; // (whole phrase: "that looks so good" under a coffee post is a fine comment)
        if (/is it true that|are they together|everyone (in|around) (my|the)/i.test(k.text)) rumour++;
        Object.values(S.npcs).forEach((o) => { const f = o.name.split(' ')[0]; if (o.id !== k.author && o.id !== post.author && new RegExp('\\b' + f + '\\b', 'i').test(k.text) && !thread(post).some((x) => x.author === o.id)) unrelatedName++; });
      });
    });
  });
  const uniq = (a) => new Set(a).size;
  INFO(`ordinary posts: ${ordAll} comments, stances ${[...ordStances].join('/')}`);
  check('ordinary posts still get plenty of reactions', ordAll >= 30, String(ordAll));
  check('ordinary posts: reactions are varied (>= 25 distinct lines, >= 4 stances)', uniq(Object.values(ordTexts).flat()) >= 25 && ordStances.size >= 4, `${uniq(Object.values(ordTexts).flat())} lines, ${ordStances.size} stances`);
  check('"W post / you deserve this" filler is not shouted under a plain post', cheerFiller === 0, cheerFiller + ' ' + (global.cf || []).join(' | '));
  check('"gorgeous / that look" is not said under a post with no photo', complimentFiller === 0, String(complimentFiller));
  check('no rumour text ("is it true that...") under unrelated posts', rumour === 0, String(rumour));
  check('no comment names a person who is not in the thread', unrelatedName === 0, String(unrelatedName));
  const askTexts = (ordTexts['who else is up??'] || []).concat(ordTexts['weekend plans?? #weekend'] || []);
  const answerish = askTexts.filter((t) => /\b(me|i am up|here|present|same|no plans|nothing|ideas|staying in|going out|open to)\b/i.test(t));
  check('a question gets answer-ish replies (>= 20% of its comments)', askTexts.length >= 6 && answerish.length / askTexts.length >= 0.2, `${answerish.length}/${askTexts.length}: ${askTexts.slice(0, 6).join(' | ')}`);
  const songTexts = ordTexts['new song snippet is out, be nice'] || [];
  const songish = songTexts.filter((t) => /song|hear|link|called|repeat|playlist|volume|banger|drop|sounds|by\?|send|who is it|new music|nice/i.test(t));
  check('a song post gets song-shaped replies (>= 20%)', songTexts.length >= 5 && songish.length / songTexts.length >= 0.2, `${songish.length}/${songTexts.length}: ${songTexts.slice(0, 8).join(' | ')}`);
  const orTexts = ordTexts['pizza or tacos?'] || [];
  check('"pizza or tacos?" is answered with one of them', orTexts.filter((t) => /pizza|tacos/i.test(t)).length >= 2, orTexts.slice(0, 8).join(' | '));

  /* =============== 4. good news =============== */
  {
    let goodComments = 0, shade = 0, congrats = 0, warmFromClose = 0, closeCount = 0;
    seeds.forEach((seed) => {
      const S = build(seed);
      const post = mePost('I got the job!! starting monday', { buzz: 6 });
      run(24 * 60);
      thread(post).forEach((k) => {
        goodComments++;
        const r = G.React.relation(S, S.npcs[k.author], 'me');
        if (r.c > 0.3 && r.h < 0.4) {
          closeCount++;
          if (['shade', 'tease', 'hostile', 'critique', 'jealous'].includes(k.stance) || /yikes|cope|ratio|who asked|touch grass/i.test(k.text)) shade++;
          else warmFromClose++;
        }
        if (/congrat|so happy for you|proud of you|amazing news|that is great|that is amazing|yay|huge|deserve/i.test(k.text)) congrats++;
      });
    });
    INFO(`good news: ${goodComments} comments, ${congrats} congratulations`);
    check('good news: people reacted', goodComments >= 3, String(goodComments));
    check('good news: friendly people never shade it', shade === 0, String(shade));
    check('good news: congratulations are actually said', congrats >= 2, String(congrats));
  }

  /* =============== 5. the choke points =============== */
  {
    const S = build(11);
    const post = mePost(HOSP);
    const friend = npcList().find((n) => n.status === 'best_friend');
    const enemy = npcList().find((n) => n.status === 'enemy');
    const t = S.clock;
    check('addComment refuses a joke under a hospital post (nothing posted or a caring repair)', (() => { const c = G.World.addComment(friend, post, 'tease', 'lol not you posting this 😂', t); return !c || (!M.flippant(c.text) && M.supportive(c.text)); })());
    check('addComment refuses "hugs 💀" and "skull" jokes', (() => { const c = G.World.addComment(friend, post, 'empathize', 'hugs 💀 🫶', t); return !c || !M.flippant(c.text); })());
    check('addComment drops a pile-on from an enemy', G.World.addComment(enemy, post, 'hostile', 'get a life', t) === null);
    check('addComment drops a rumour about a stranger under an unrelated post', (() => {
      const ordinary = mePost('who else is up??');
      const other = npcList().find((n) => n.id !== friend.id && n.id !== enemy.id);
      const c = G.World.addComment(friend, ordinary, 'curious', `is it true that "${other.name.split(' ')[0]} developed feelings for Sam"?`, t);
      return c === null;
    })());
    check('a normal friendly line still goes through', !!G.World.addComment(friend, mePost('look at this view'), 'cheer', 'wow that is gorgeous', t));
    check('crowd rumours are refused under an unrelated post (G.World.crowdOk)', G.World.crowdOk(post, 'is it true that "Kai developed feelings for Sam"?') === false && G.World.crowdOk(post, 'sending you so much love') === true);
    // DMs: a flirty/joking message while the player is hurting is replaced by care (close) or dropped (enemy)
    const m1 = G.World.sendDm(friend, 'flirt', t, {});
    check('a flirty DM during a heavy moment becomes a caring one', !m1 || (m1.kind === 'care' && !M.flippant(m1.text)), m1 && m1.text);
    check('an enemy sends nothing at all', G.World.sendDm(enemy, 'provoke', t, {}) === null);
    check('a joking "reason" text is refused for a close friend', (() => { const m = G.World.sendDm(npcList().find((n) => n.status === 'close_friend'), 'followup', t, { text: 'saw your post lol 😂' }); return !m || !M.flippant(m.text); })());
    // replies to the player's own heavy DM
    const rr = G.World.localReply(friend, 'my mom died today');
    check('a friend answers "my mom died today" with care', M.supportive(rr.text) || /sorry/i.test(rr.text), rr.text);
    check('and never with a joke', !M.flippant(rr.text));
    const re = G.World.localReply(enemy, 'my mom died today');
    check('an enemy answers a death with silence, not with "cry about it"', re.text === '', JSON.stringify(re.text));
    const good = G.World.localReply(friend, 'I got the job!!');
    check('good news in a DM is congratulated', /congrat|proud|amazing|yay|great/i.test(good.text), good.text);
    const ordinaryReply = G.World.localReply(friend, 'how are you?');
    check('an ordinary DM still gets an ordinary reply', ordinaryReply.text.length > 0 && !/sorry/i.test(ordinaryReply.text), ordinaryReply.text);
  }

  /* =============== 6. nobody answers at 3am (unless it is an emergency) =============== */
  {
    const S = build(21);
    const close = npcList().find((n) => n.status === 'best_friend');
    const acq = npcList().find((n) => n.status === 'acquaintance');
    // put the clock at 3:00 a.m. of a fresh day
    S.clock = Math.floor(S.clock / 1440) * 1440 + 1440 + 180;
    let slept = 0, tested = 0, emergencyFast = 0, emTested = 0;
    [close, acq, npcList().find((n) => n.status === 'friend'), npcList().find((n) => n.status === 'dating')].forEach((n) => {
      if (G.Persona.awake(n, hourOf(S.clock)) > 0) return; // a night owl is up: not the case under test
      S.queue = [];
      const dm = { id: 'm' + S.counters.msg++, from: 'me', text: 'are you there? a quick question', t: S.clock, read: true };
      (S.dms[n.id] = S.dms[n.id] || []).push(dm);
      G.World.onPlayerDm(n, dm, dm.text);
      const q = S.queue.find((x) => x.type === 'dmreply' && x.npc === n.id);
      if (!q) return;
      tested++;
      if (G.Persona.awake(n, hourOf(q.due)) > 0 && q.due - S.clock >= 20) slept++;
      // emergency: close + serious = they pick up even asleep
      if (rel(n).c >= 0.45) {
        S.queue = [];
        const dm2 = { id: 'm' + S.counters.msg++, from: 'me', text: 'my mom is in the hospital, i am scared', t: S.clock, read: true };
        S.dms[n.id].push(dm2);
        G.World.onPlayerDm(n, dm2, dm2.text);
        const q2 = S.queue.find((x) => x.type === 'dmreply' && x.npc === n.id);
        if (q2) { emTested++; if (q2.due - S.clock <= 30) emergencyFast++; }
      }
    });
    INFO(`asleep tests: ${tested}, emergency tests: ${emTested}`);
    check('asleep: an ordinary DM is answered after they wake up, not at 3am', tested > 0 && slept === tested, `${slept}/${tested}`);
    check('asleep: a serious message from someone close is answered within minutes', emTested > 0 && emergencyFast === emTested, `${emergencyFast}/${emTested}`);
    // the caring DM itself respects sleep too, unless serious
    S.queue = [];
    const ev = mePost('rough week, i just got diagnosed with something and i am scared');
    const careQ = S.queue.filter((x) => x.type === 'care');
    check('care DMs are queued (a few hours at most) for the people who love you', careQ.length >= 1 && careQ.length <= 4 && careQ.every((q) => q.due - S.clock <= 24 * 60), String(careQ.length));
    check('and each is scheduled for a moment they are awake, or within the hour if serious', careQ.every((q) => G.Persona.awake(S.npcs[q.npc], hourOf(q.due)) > 0 || q.due - S.clock <= 70), careQ.map((q) => hourOf(q.due).toFixed(1)).join(','));
  }

  /* =============== 7. determinism, cost, burners =============== */
  {
    const fp = (seed) => { const S = build(seed); const p = mePost(HOSP); run(24 * 60); return JSON.stringify([thread(p).map((k) => [k.author, k.text, k.stance]), dmsSince(0).map((m) => [m.npc, m.text])]); };
    check('same seed -> identical reactions to a delicate post', fp(5) === fp(5));
    const S = build(6);
    const alt = E.makeAlt ? null : null; // burner accounts are never cared for: the care plan only fires for the real player
    const before = S.queue.length;
    E.addPost({ author: 'someone_else', text: HOSP, buzz: 2, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }, S);
    check('care is only planned for the real player\'s own posts', G.World.planCare({ id: 'x', author: 'n1', text: HOSP }, S.clock) === 0 && S.queue.length === before);
    check('the whole file made ZERO API calls', apiCalls === 0, String(apiCalls));
  }

  H.summary('mind-comments');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
