// Do different people react DIFFERENTLY to the same post? Statistical tests of the reaction model.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const INFO = (s) => console.log('   · ' + s);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const share = (arr, fn) => (arr.length ? arr.filter(fn).length / arr.length : 0);

const PERS = ['bubbly, flirty, outgoing, lots of emoji', 'arrogant, sarcastic, all lowercase', 'ALL CAPS troll who loves drama', 'kind, warm, supportive, gentle, wholesome', 'calm, disciplined, formal, polite', 'curious, creative, nosy gossip', 'shy, quiet introvert, anxious', 'confident, charismatic, party girl, night owl', 'early bird runner, disciplined, wholesome', 'dramatic, jealous, emotional, clingy', 'chill, laid-back, funny, memes', 'ambitious, hardworking, perfectionist', 'petty, savage, cold', 'dreamer, artsy, quirky, poetic', 'nerdy gamer, awkward, sweet'];
const ROLES = ['love_interest', 'rival', 'troll', 'friend', 'mentor', 'journalist', 'friend', 'influencer', 'friend', 'wildcard', 'friend', 'rival', 'hater', 'fan', 'friend'];
const PROF = { friend: [45, 0, 0, 40], close_friend: [60, 0, 0, 55], best_friend: [75, 0, 0, 70], crush: [32, 45, 0, 30], dating: [60, 70, 0, 55], admirer: [30, 35, 0, 25], rival: [-12, 0, 45, 5], enemy: [-50, 0, 70, 0], ex: [-5, 22, 30, 15], acquaintance: [8, 0, 0, 10], stranger: [0, 0, 0, 0] };
// 60 people: 10 of each relationship type to the player, personalities cycled so every type has every temperament
const TYPES = ['friend', 'close_friend', 'crush', 'rival', 'enemy', 'stranger'];
function build(seed) {
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'people' });
  const S = G.S;
  G.World.setSeed(seed);
  S.popSize = 0;
  let i = 0;
  TYPES.forEach((st) => {
    for (let k = 0; k < PERS.length; k++) {
      const npc = E.makeNpc({ name: `${st}${k}`, handle: `@${st}${k}`.replace('_', ''), role: ROLES[k], age: 20 + k, personality: PERS[k], followers: 3000, status: st });
      const pr = PROF[st];
      npc.aff = pr[0]; npc.rom = pr[1]; npc.riv = pr[2]; npc.trust = pr[3];
      i++;
    }
  });
  G.Social.analyze(S, G.World.rnd);
  return S;
}
const player = (text, judge, extra = {}) => {
  const p = E.addPost(Object.assign({ author: 'me', text, stats: { likes: 20, reposts: 1, replies: 0, views: 200 } }, extra));
  p.judge = judge;
  return p;
};
const J = (s, c, q = 7) => ({ q, v: 4, s, c, note: '' });
// one decision per NPC per sample (decide never mutates anything)
function sample(post, n = 40, comments = [], adult = true) {
  const rnd = () => G.World.rnd();
  const out = {};
  Object.values(G.S.npcs).forEach((npc) => {
    out[npc.id] = [];
    for (let i = 0; i < n; i++) out[npc.id].push(G.React.decide(G.S, npc, post, { rnd, now: G.S.clock, comments, adult }));
  });
  return out;
}
const groupOf = (type) => Object.values(G.S.npcs).filter((n) => n.status === type);
const decisions = (res, group) => group.flatMap((n) => res[n.id]);
const commentsOf = (ds) => ds.filter((d) => d.comment);
const SUPPORT = ['cheer', 'compliment', 'agree', 'empathize', 'defend', 'flirt', 'thanks'];
const NEGATIVE = ['hostile', 'shade', 'critique', 'jealous'];
const distinctStances = (ds) => new Set(commentsOf(ds).map((d) => d.stance));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = build(99);
  
  const trait = (n, k) => n.psy.t[k];

  /* ================= one ordinary post, everyone reacts ================= */
  const beach = player('had the best day at the beach with friends today, so grateful ☀️ #blessed', J(8, 1));
  const R1 = sample(beach, 50);
  const all = Object.values(S.npcs);
  const allDs = decisions(R1, all);
  const kinds = distinctStances(allDs);
  INFO(`stances seen on an ordinary post: ${[...kinds].join(', ')}`);
  check('one post gets >= 5 different kinds of reaction', kinds.size >= 5, [...kinds].join(','));
  check('not everyone comments (most people just scroll or like)', share(allDs, (d) => d.comment) < 0.5 && share(allDs, (d) => d.comment) > 0.04, share(allDs, (d) => d.comment).toFixed(2));
  check('more people like than comment', share(allDs, (d) => d.like) > share(allDs, (d) => d.comment));

  // friends vs rivals
  const friends = groupOf('friend').concat(groupOf('close_friend'));
  const rivals = groupOf('rival').concat(groupOf('enemy'));
  const fC = commentsOf(decisions(R1, friends)), rC = commentsOf(decisions(R1, rivals));
  const sup = (cs) => share(cs, (d) => SUPPORT.includes(d.stance));
  const neg = (cs) => share(cs, (d) => NEGATIVE.includes(d.stance));
  INFO(`friends: support ${sup(fC).toFixed(2)} neg ${neg(fC).toFixed(2)} | rivals: support ${sup(rC).toFixed(2)} neg ${neg(rC).toFixed(2)}`);
  check('friends are supportive, rivals much less so (gap >= 0.25)', sup(fC) - sup(rC) >= 0.25);
  check('rivals/enemies are more negative than friends (gap >= 0.2)', neg(rC) - neg(fC) >= 0.2);
  check('friends rarely attack a happy post (< 6% negative)', neg(fC) < 0.06, neg(fC).toFixed(3));
  const likeRate = (g) => share(decisions(R1, g), (d) => d.like);
  check('friends like your posts far more than enemies do', likeRate(friends) > likeRate(groupOf('enemy')) * 2.2, `${likeRate(friends).toFixed(2)} vs ${likeRate(groupOf('enemy')).toFixed(2)}`);
  check('strangers mostly ignore you', likeRate(groupOf('stranger')) < likeRate(friends) * 0.75, `${likeRate(groupOf('stranger')).toFixed(2)} vs ${likeRate(friends).toFixed(2)}`);

  // temperament within the same relationship (strangers): kind vs unkind
  const strangers = groupOf('stranger');
  const kind = strangers.filter((n) => trait(n, 'A') >= 60), unkind = strangers.filter((n) => trait(n, 'A') <= 38);
  const supK = sup(commentsOf(decisions(sample(beach, 120), kind))), supU = sup(commentsOf(decisions(sample(beach, 120), unkind)));
  check('agreeable people are warmer than disagreeable ones (same relationship)', kind.length >= 2 && unkind.length >= 2 && supK > supU + 0.08, `${supK.toFixed(2)} vs ${supU.toFixed(2)} (${kind.length}/${unkind.length})`);
  const ext = all.filter((n) => trait(n, 'E') >= 70), intro = all.filter((n) => trait(n, 'E') <= 40);
  const rate = (g, res) => share(decisions(res, g), (d) => d.comment);
  check('extraverts comment more than introverts (>= 1.5x)', ext.length >= 4 && intro.length >= 4 && rate(ext, R1) >= rate(intro, R1) * 1.5, `${rate(ext, R1).toFixed(3)} vs ${rate(intro, R1).toFixed(3)}`);
  const trollRole = all.filter((n) => n.role === 'troll' || n.role === 'hater');
  const trollNeg = neg(commentsOf(decisions(R1, trollRole))), restNeg = neg(commentsOf(decisions(R1, all.filter((n) => !trollRole.includes(n)))));
  check('trolls/haters are the most hostile group', trollNeg > restNeg * 1.5, `${trollNeg.toFixed(2)} vs ${restNeg.toFixed(2)}`);

  /* ================= romance ================= */
  const crush = groupOf('crush');
  const cC = commentsOf(decisions(R1, crush));
  const selfie = player('new selfie, feeling myself 😎', J(7, 2), { ptype: 'photo', attach: 'a mirror selfie in a leather jacket' });
  const Rs = sample(selfie, 60);
  const flirtShare = (g, res) => share(commentsOf(decisions(res, g)), (d) => d.stance === 'flirt');
  INFO(`flirty comments on a selfie: crushes ${flirtShare(crush, Rs).toFixed(2)}, friends ${flirtShare(friends, Rs).toFixed(2)}, rivals ${flirtShare(rivals, Rs).toFixed(2)}`);
  check('people with a crush on you flirt; rivals do not', flirtShare(crush, Rs) >= 0.12 && flirtShare(rivals, Rs) < 0.03, `${flirtShare(crush, Rs).toFixed(2)} vs ${flirtShare(rivals, Rs).toFixed(2)}`);
  check('flirting is concentrated in people who actually have feelings (precision >= 0.8)', (() => { const fl = all.flatMap((n) => R1 && Rs[n.id].filter((d) => d.comment && d.stance === 'flirt').map(() => n)); return fl.length >= 10 && share(fl, (n) => n.rom >= 20 || n.status === 'dating') >= 0.8; })());
  check('photos earn compliments', share(commentsOf(decisions(Rs, friends)), (d) => d.stance === 'compliment') > share(commentsOf(decisions(R1, friends)), (d) => d.stance === 'compliment'));

  /* ================= jealousy ================= */
  const jPost = player('can not stop thinking about @friend0 tonight 😏🔥', J(6, 3));
  const Rj = sample(jPost, 80);
  const jealous = (g) => share(commentsOf(decisions(Rj, g)), (d) => d.stance === 'jealous');
  const romantic = all.filter((n) => n.rom >= 35);
  const nonRom = all.filter((n) => n.rom < 5);
  INFO(`jealous share: romantic interests ${jealous(romantic).toFixed(2)}, others ${jealous(nonRom).toFixed(2)}`);
  check('people who fancy you get jealous when you flirt with someone else', jealous(romantic) >= 0.15 && jealous(nonRom) < 0.03, `${jealous(romantic).toFixed(2)} vs ${jealous(nonRom).toFixed(2)}`);
  const anxious = romantic.filter((n) => n.psy.attach === 'anxious' || trait(n, 'N') >= 60), secure = romantic.filter((n) => n.psy.attach === 'secure' && trait(n, 'N') < 45);
  if (anxious.length >= 2 && secure.length >= 2) check('anxious/neurotic admirers are more jealous than secure ones', jealous(anxious) > jealous(secure), `${jealous(anxious).toFixed(2)} vs ${jealous(secure).toFixed(2)}`);

  /* ================= success breeds envy ================= */
  const brag = player('just got signed to a huge record deal!! booked and busy, so grateful', J(8, 2));
  const Rb = sample(brag, 70);
  const shade = (g) => share(commentsOf(decisions(Rb, g)), (d) => d.stance === 'shade');
  const cheer = (g) => share(commentsOf(decisions(Rb, g)), (d) => ['cheer', 'compliment', 'agree'].includes(d.stance));
  check('a brag draws shade from rivals but not from friends', shade(rivals) >= 0.08 && shade(rivals) > shade(friends) * 3, `${shade(rivals).toFixed(2)} vs ${shade(friends).toFixed(2)}`);
  check('friends cheer a win', cheer(friends) >= 0.45, cheer(friends).toFixed(2));

  /* ================= vulnerability brings out the best ================= */
  const sad = player("honestly struggling lately. feeling so anxious and tired of pretending i'm fine", J(-5, 1));
  const Rv = sample(sad, 70);
  const care = (g) => share(commentsOf(decisions(Rv, g)), (d) => ['empathize', 'concern', 'relate'].includes(d.stance));
  const mean_ = (g) => share(commentsOf(decisions(Rv, g)), (d) => ['hostile', 'shade'].includes(d.stance));
  check('friends respond to a vulnerable post with care (>= 50%)', care(friends) >= 0.5, care(friends).toFixed(2));
  const calmGroups = all.filter((n) => !['rival', 'enemy'].includes(n.status));
  check('outside of rivals/enemies, almost nobody piles on a vulnerable post (< 5% hostile)', share(commentsOf(decisions(Rv, calmGroups)), (d) => ['hostile', 'shade'].includes(d.stance)) < 0.05, share(commentsOf(decisions(Rv, calmGroups)), (d) => ['hostile', 'shade'].includes(d.stance)).toFixed(3));
  check('even rivals soften on a vulnerable post (less hostile than on the beach post)', mean_(rivals) < share(commentsOf(decisions(R1, rivals)), (d) => ['hostile', 'shade'].includes(d.stance)) + 0.02);

  /* ================= social proof (herding) ================= */
  const plain = (likes) => player('coffee and a good playlist this morning', J(4, 0), { stats: { likes, reposts: 0, replies: 0, views: likes * 8 } });
  const pop = plain(400), cold = plain(0);
  const lr = (post) => share(decisions(sample(post, 80), all), (d) => d.like);
  const lp = lr(pop), lc = lr(cold);
  INFO(`like rate: popular ${lp.toFixed(3)} vs untouched ${lc.toFixed(3)}`);
  check('positive herding: a post that already has likes gets liked more (>= +8%)', lp >= lc * 1.08, `${lp.toFixed(3)} vs ${lc.toFixed(3)}`);
  check('...but herding is a nudge, not a takeover (< +90%)', lp <= lc * 1.9);
  const hostileKids = Array.from({ length: 5 }, () => ({ stance: 'hostile' }));
  const lPile = share(decisions(sample(plain(10), 80, hostileKids), friends), (d) => d.like);
  const lNorm = share(decisions(sample(plain(10), 80), friends), (d) => d.like);
  check('friends "correct" a pile-on by liking the target more (asymmetric herding)', lPile > lNorm, `${lPile.toFixed(3)} vs ${lNorm.toFixed(3)}`);
  const lEnemyPile = share(decisions(sample(plain(10), 80, hostileKids), groupOf('enemy')), (d) => d.like);
  const lEnemyNorm = share(decisions(sample(plain(10), 80), groupOf('enemy')), (d) => d.like);
  check('enemies do not bother to correct it', lEnemyPile <= lEnemyNorm + 0.02, `${lEnemyPile.toFixed(3)} vs ${lEnemyNorm.toFixed(3)}`);
  const defendKids = [{ stance: 'hostile' }, { stance: 'hostile' }];
  const defend = share(commentsOf(decisions(sample(plain(10), 80, defendKids), friends)), (d) => d.stance === 'defend');
  const defendNo = share(commentsOf(decisions(sample(plain(10), 80), friends)), (d) => d.stance === 'defend');
  check('friends step in to defend you when others attack', defend >= 0.1 && defendNo < 0.01, `${defend.toFixed(2)} vs ${defendNo.toFixed(2)}`);

  /* ================= a polarising opinion splits the room ================= */
  const hot = player('hot take: hustle culture is toxic and burnout is real. rest is productive too', J(2, 7));
  const Rh = sample(hot, 60);
  const strongFor = all.filter((n) => n.psy.stance.hustle <= -0.5); // would agree (post is anti-hustle = side B)
  const strongAgainst = all.filter((n) => n.psy.stance.hustle >= 0.5);
  INFO(`strong opinions: ${strongFor.length} agree-side, ${strongAgainst.length} opposed-side`);
  const sc = (g) => commentsOf(decisions(Rh, g));
  check('both camps exist in the cast', strongFor.length >= 4 && strongAgainst.length >= 4);
  const agreeS = (g) => share(sc(g), (d) => ['agree', 'cheer'].includes(d.stance)); // ('debate' = stating their OWN side, not agreeing)
  const critS = (g) => share(sc(g), (d) => ['critique', 'hostile'].includes(d.stance));
  check('people who share the view back you up more than people who disagree', agreeS(strongFor) > agreeS(strongAgainst) + 0.15, `${agreeS(strongFor).toFixed(2)} vs ${agreeS(strongAgainst).toFixed(2)}`);
  check('people who disagree push back more', critS(strongAgainst) > critS(strongFor) + 0.1, `${critS(strongAgainst).toFixed(2)} vs ${critS(strongFor).toFixed(2)}`);
  check('the same post produces both agreement AND disagreement', sc(all).some((d) => d.stance === 'critique') && sc(all).some((d) => d.stance === 'agree'));
  // consistency: a person with a strong view reacts the same way (on the same side) again and again
  const strongOne = strongAgainst.find((n) => Math.abs(n.psy.stance.hustle) > 0.6 && n.rom < 5 && trait(n, 'E') > 55);
  if (strongOne) {
    const own = Rh[strongOne.id].filter((d) => d.comment);
    const sideAgree = share(own, (d) => ['agree', 'cheer'].includes(d.stance));
    check('a person with a firm opinion is consistent across many tries (does not flip sides)', own.length < 3 || sideAgree < 0.4, `${strongOne.name} agree-share ${sideAgree.toFixed(2)} of ${own.length}`);
  }
  // different post, different debate: opinions are per-topic, not one global mood
  const topicGroups = G.Lex.DEBATES.slice(0, 6).map((d) => all.filter((n) => n.psy.stance[d.id] > 0.3).map((n) => n.id).sort().join());
  check('opinions differ by topic (people are not all aligned on every issue)', new Set(topicGroups).size >= 5);
  check('opinions are stable: the same NPC keeps the same stance', (() => { const n = all[3]; const s0 = JSON.stringify(n.psy.stance); G.Persona.ensure(n); return JSON.stringify(n.psy.stance) === s0; })());

  /* ================= grudges and memory ================= */
  const victim = G.S.npcs[friends[0].id];
  const cause = groupOf('stranger')[0];
  const before = G.React.relation(S, victim, cause.id);
  for (let i = 0; i < 4; i++) G.World.addComment(cause, player('x', J(0, 0)), 'hostile', 'cringe', S.clock); // 4 slights from the same person
  const slight = E.addPost({ author: victim.id, text: 'new day', stats: { likes: 3, reposts: 0, replies: 0, views: 30 } });
  for (let i = 0; i < 4; i++) G.World.addComment(cause, slight, 'hostile', 'delete this', S.clock);
  G.Mem.reflect(victim, S.clock + 600);
  const after = G.React.relation(S, victim, cause.id);
  check('slights create a grudge (hostility toward the offender rises)', after.h > before.h + 0.1 && (victim.psy.grudges[cause.id] || 0) > 0.2, `h ${before.h.toFixed(2)} -> ${after.h.toFixed(2)}`);
  check('the victim remembers it', victim.mem.some((m) => m.who.includes(cause.id) && m.v < 0));
  const retrieved = G.Mem.retrieve(victim, { who: [cause.id] }, 3);
  check('memory retrieval surfaces what is relevant (the offender first)', retrieved.length && retrieved[0].who.includes(cause.id));
  victim.psy.grudges[cause.id] = 0.8;
  G.Persona.decay(victim, 60 * 24 * 5);
  check('grudges fade with time', (victim.psy.grudges[cause.id] || 0) < 0.35, String(victim.psy.grudges[cause.id]));

  /* ================= mood ================= */
  const happy = all[3], sadN = all[4];
  G.Persona.nudge(sadN, -0.9);
  const loPost = player('cool day', J(3, 0));
  const mood0 = sample(loPost, 120);
  check('a bad mood makes the same person less supportive', share(commentsOf(mood0[sadN.id]), (d) => SUPPORT.includes(d.stance)) <= share(commentsOf(mood0[happy.id]), (d) => SUPPORT.includes(d.stance)) + 0.15);
  G.Persona.decay(sadN, 60 * 48);
  check('moods recover toward the personal baseline within two days', Math.abs(sadN.psy.mood.v - sadN.psy.baseline) < 0.12, `${sadN.psy.mood.v.toFixed(2)} vs ${sadN.psy.baseline}`);
  const neuro = all.filter((n) => trait(n, 'N') >= 70)[0], calm = all.filter((n) => trait(n, 'N') <= 25)[0];
  if (neuro && calm) {
    const v0 = neuro.psy.mood.v, c0 = calm.psy.mood.v;
    G.Persona.nudge(neuro, -0.3); G.Persona.nudge(calm, -0.3);
    check('neurotic people swing harder than calm people', Math.abs(neuro.psy.mood.v - v0) > Math.abs(calm.psy.mood.v - c0));
  }


  const rnd = () => G.World.rnd();
  /* ================= replies, local DM tones ================= */
  const rep = (npc, stance) => { const cm = { author: 'me', stance, text: 'x' }; let n = 0; for (let i = 0; i < 200; i++) if (G.React.replyStance(S, npc, cm, { rnd })) n++; return n / 200; };
  const friendN = friends[0], enemyN = groupOf('enemy')[0];
  check('you get replies from people close to you more often than from enemies', rep(friendN, 'cheer') > rep(enemyN, 'cheer'));
  const tone = (n, text) => G.World.localReply(n, text).tone;
  check('DM tone: enemy hostile, stranger cold/neutral, friend warm, crush flirty', tone(groupOf('enemy')[0], 'hey') === 'hostile' && ['cold', 'neutral'].includes(tone(groupOf('stranger')[0], 'hey')) && tone(friends[0], 'hey') === 'warm' && tone(groupOf('crush').find((n) => trait(n, 'E') > 30), 'hey you') === 'flirty');
  const replies = new Set();
  for (let i = 0; i < 30; i++) replies.add(G.World.localReply(friends[1], 'how are you?').text);
  check('DM replies vary (not a canned line)', replies.size >= 5, String(replies.size));
  check('an insult to a friend is not answered with a warm hug', !/love you|so proud|sweet/i.test(G.World.localReply(friends[2], 'you are stupid and ugly').text));

  /* ================= nothing the model does can break the state ================= */
  check('invariants hold after all of this', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  H.summary('PEOPLE: do different people react differently?');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
