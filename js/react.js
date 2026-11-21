/* Clout — the reaction model. How would THIS person react to THIS post, right now?
   Inputs: relationship (closeness / hostility / romance), personality (Big Five), mood, grudges and beliefs from
   memory, shared interests, the post's sentiment (VADER) and what it is about, the debate it touches (and the
   NPC's own stance on it), jealousy and envy, social proof (herding) and how the thread is already going.
   Research baked in: extraversion drives commenting; agreeable people support; positive herding is strong while
   negative herding is weak because friends step in to correct (Muchnik, Aral & Taylor, Science 2013).        */
(function (G) {
  const U = G.U;
  const R = (G.React = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cl01 = (v) => clamp(v, 0, 1);

  const FAMILY = ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'];
  const FRIENDLY = ['friend', 'close_friend', 'best_friend', 'dating', 'partner', 'ally', 'mentor', 'stan'].concat(FAMILY);
  const ROMANTIC = ['dating', 'partner', 'crush', 'admirer', 'situationship'];
  const HOSTILE = ['rival', 'enemy', 'nemesis', 'hater', 'frenemy'];
  const EDGE = {
    // type: [closeness, hostility, romance]
    dating: [0.8, 0, 0.8], partner: [0.9, 0, 0.9], best_friend: [0.9, 0, 0], friend: [0.65, 0, 0], family: [0.7, 0, 0], ally: [0.55, 0, 0],
    crush: [0.4, 0, 0.6], situationship: [0.5, 0.05, 0.6], ex: [0.3, 0.3, 0.35], frenemy: [0.35, 0.4, 0], rival: [0.1, 0.65, 0], enemy: [0, 0.85, 0],
  };

  // npc<->npc edge lookup, indexed once (edge objects are shared, so type changes are seen immediately)
  let idx = null;
  let idxS = null;
  let idxLen = -1;
  R.dirty = false;
  R.edge = function (S, a, b) {
    if (idxS !== S || idxLen !== S.npcRel.length || R.dirty) {
      idx = new Map();
      S.npcRel.forEach((e) => idx.set(e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a, e));
      idxS = S;
      idxLen = S.npcRel.length;
      R.dirty = false;
    }
    return idx.get(a < b ? a + '|' + b : b + '|' + a) || null;
  };

  const authorOf = (S, post) => (post.author === 'me' ? { id: 'me', followers: S.player.followers, name: S.player.name, handle: S.player.handle } : S.npcs[post.author] ? { id: post.author, followers: S.npcs[post.author].followers, name: S.npcs[post.author].name, handle: S.npcs[post.author].handle } : null);

  // npc -> author: closeness c, hostility h, romance r (all 0..1), familiarity, same circle
  R.relation = function (S, npc, authorId) {
    const p = G.Persona.ensure(npc);
    let c = 0.08, h = 0, r = 0, fam = 0.1, status = 'stranger';
    if (authorId === 'me') {
      status = npc.status;
      c = cl01((npc.aff + 15) / 85) * (0.6 + npc.trust / 250);
      h = cl01(npc.riv / 100 + Math.max(0, -npc.aff - 10) / 110);
      r = cl01(npc.rom / 100 + (ROMANTIC.includes(npc.status) ? 0.15 : 0));
      if (FRIENDLY.includes(npc.status)) c = Math.max(c, 0.55);
      if (HOSTILE.includes(npc.status)) h = Math.max(h, 0.45);
      fam = cl01(0.15 + Math.abs(npc.aff) / 120 + (S.player.following.includes(npc.id) ? 0.15 : 0));
    } else if (S.npcs[authorId]) {
      const e = R.edge(S, npc.id, authorId);
      const other = S.npcs[authorId];
      const sim = (p.interests || []).filter((t) => G.Persona.ensure(other).interests.includes(t)).length / 3;
      if (e && EDGE[e.type]) {
        [c, h, r] = EDGE[e.type];
        status = e.type;
        fam = 0.6;
      } else {
        c = 0.1 + sim * 0.3 + (G.Social && G.Social.sameCircle(npc, other) ? 0.22 : 0);
        fam = 0.15 + sim * 0.2;
      }
      if (p.following && p.following.includes(authorId)) c += 0.12;
    } else return { c: 0.05, h: 0, r: 0, fam: 0.05, status, same: false, grudge: 0 };
    const grudge = p.grudges[authorId] || 0;
    const belief = G.Mem ? G.Mem.belief(npc, authorId) : 0;
    h = cl01(h + grudge * 0.55 + Math.max(0, -belief) * 0.3);
    c = cl01(c - grudge * 0.3 + Math.max(0, belief) * 0.2 - Math.max(0, -belief) * 0.15);
    return { c, h, r, fam, status, same: !!(G.Social && S.npcs[authorId] && G.Social.sameCircle(npc, S.npcs[authorId])), grudge };
  };

  // what a post is about + how it feels (cached on the post; VADER-assisted)
  R.features = function (S, post) {
    if (post.fx) return post.fx;
    const an = G.Lex.analyze((post.text || '') + ' ' + (post.attach || ''));
    const j = post.judge;
    const s = an.sent;
    const mr = G.Mind ? G.Mind.read((post.text || '') + ' ' + (post.attach || '')) : { sens: 0, good: false, ask: false };
    const hurting = mr.sens >= 0.5; // common sense: a hospital / grief / heartbreak post is a vulnerable post, whatever the word list says
    const fx = {
      topics: an.topics,
      tags: an.tags,
      mentions: an.mentions,
      debate: an.debate,
      pos: hurting ? Math.min(0.1, s.pos) : Math.max(s.pos, j ? cl01(j.s / 10) : 0),
      neg: Math.max(s.neg, j ? cl01(-j.s / 10) : 0, hurting ? mr.sens * 0.8 : 0),
      brag: hurting ? 0 : s.brag,
      vuln: Math.max(s.vuln, mr.sens),
      sens: mr.sens,
      good: !!mr.good,
      flirt: s.flirt,
      ctrl: Math.max(s.ctrl, j ? cl01(j.c / 10) : 0),
      shade: s.shade,
      q: s.question,
      photo: !!post.attach || post.ptype === 'photo',
      compound: s.compound || 0,
    };
    post.fx = { topics: fx.topics, debate: fx.debate, pos: round(fx.pos), neg: round(fx.neg), brag: round(fx.brag), vuln: round(fx.vuln), sens: round(fx.sens), good: fx.good, flirt: round(fx.flirt), ctrl: round(fx.ctrl), shade: round(fx.shade), q: fx.q, photo: fx.photo, mentions: fx.mentions };
    return post.fx;
  };
  const round = (x) => Math.round(x * 100) / 100;

  // which side of a debate the post takes: +1 side A, -1 side B
  R.debateSide = function (S, post, fx) {
    if (!fx.debate) return 0;
    const d = G.Lex.DEBATES.find((x) => x.id === fx.debate);
    const low = ((post.text || '') + ' ' + (post.attach || '')).toLowerCase();
    if (post.author !== 'me' && S.npcs[post.author]) {
      const st = G.Persona.ensure(S.npcs[post.author]).stance[fx.debate];
      return st >= 0 ? 1 : -1;
    }
    // a post that NAMES a side is not necessarily FOR it: "hustle culture is toxic" is against side A
    const mood = fx.pos - fx.neg;
    const aIn = d && low.includes(String(d.a).toLowerCase());
    const bIn = d && low.includes(String(d.b).toLowerCase());
    if (aIn && !bIn) return mood < -0.05 ? -1 : 1;
    if (bIn && !aIn) return mood < -0.05 ? 1 : -1;
    return fx.pos >= fx.neg ? 1 : -1;
  };

  // social proof: how much attention a post already has, relative to its author's audience (0..1)
  R.proof = function (post, followers) {
    return cl01(Math.log10((post.stats.likes || 0) + 1) / Math.log10(Math.max(100, followers) + 10));
  };

  // softmax over the options that are actually possible (weight <= 0 means "not an option", never a lottery ticket)
  const choose = (weights, rnd, temp = 0.4) => {
    const ks = Object.keys(weights).filter((k) => weights[k] > 0.001);
    if (!ks.length) return 'indifferent';
    const ex = ks.map((k) => Math.exp(Math.max(0, weights[k]) / temp));
    const sum = ex.reduce((a, b) => a + b, 0);
    let x = rnd() * sum;
    for (let i = 0; i < ks.length; i++) {
      x -= ex[i];
      if (x <= 0) return ks[i];
    }
    return ks[ks.length - 1];
  };

  // Main entry. ctx: { rnd, now, comments:[child posts] }
  // returns { like, comment, stance, why, side?, agree? } — and never mutates anything.
  R.decide = function (S, npc, post, ctx) {
    const rnd = ctx.rnd;
    const p = G.Persona.ensure(npc);
    const t = p.t;
    const E = t.E / 100, A = t.A / 100, N = t.N / 100, O = t.O / 100, C = t.C / 100;
    const au = authorOf(S, post);
    if (!au || post.author === npc.id) return { like: false, comment: false, stance: 'indifferent' };
    const rel = post.author === 'crowd' ? { c: 0.05, h: 0.05, r: 0, fam: 0.05, status: 'stranger', same: false, grudge: 0 } : R.relation(S, npc, post.author);
    const fx = R.features(S, post);
    const { c, h, r } = rel;
    const mood = p.mood.v;
    const interest = cl01((fx.topics || []).filter((x) => p.interests.includes(x)).length * 0.4 + rel.fam * 0.25 + Math.min(0.2, Math.log10((au.followers || 10) + 10) / 30));
    const proof = R.proof(post, au.followers);
    const kids = ctx.comments || [];
    const negKids = kids.filter((k) => ['hostile', 'critique', 'shade', 'jealous'].includes(k.stance)).length;
    const posKids = kids.filter((k) => ['cheer', 'compliment', 'agree', 'defend', 'flirt', 'empathize'].includes(k.stance)).length;
    const authorStatus = (S.sim && S.sim.status && S.sim.status[post.author]) || 0.3;
    const myStatus = p.status != null ? p.status : 0.3;

    // ---- a delicate post (hospital, grief, heartbreak, fear): people who care show it; everyone else stays out of it.
    // No tease / hostile / jealous / cheer / bandwagon / gossip here, ever. Hostile or distant people simply do not comment.
    const sens = fx.sens != null ? fx.sens : G.Mind ? G.Mind.read((post.text || '') + ' ' + (post.attach || '')).sens : 0;
    if (sens >= 0.5 && post.author !== 'crowd') {
      const likeD = h < 0.3 && c >= 0.3 && rnd() < 0.1 + 0.5 * c;
      const troll = npc.role === 'troll' || npc.role === 'hater';
      const pCare = clamp((-0.08 + 1.05 * c + 0.25 * A) * (0.6 + 0.6 * E) - 0.6 * h, 0, 0.85);
      if (troll || h > 0.45 || c < 0.12 || rnd() >= pCare) return { like: likeD, comment: false, stance: 'indifferent', rel };
      const wd = { empathize: 0.5 + 0.8 * A + 0.4 * c, concern: sens >= 0.75 ? 0.3 + 1.3 * c : 0.1 + 0.6 * c };
      return { like: likeD, comment: true, stance: choose(wd, rnd, 0.42), side: 0, agree: false, other: false, hot: false, rel, w: wd, care: true };
    }

    // ---- like
    const independence = 0.5 + O * 0.35; // open people herd a little less
    const herd = 1 + 0.32 * proof * (1.1 - independence) * 2 + (negKids > posKids + 1 ? -0.08 : 0);
    let pLike = (0.1 + 0.55 * c + 0.32 * r * (fx.flirt > 0.3 ? 1.25 : 1) + 0.35 * interest + 0.1 * E + 0.08 * mood - 0.5 * h) * herd;
    // friends "correct" a negative pile-on by liking the author's post (asymmetric herding)
    if (negKids > posKids && c > 0.5) pLike += 0.25;
    pLike = clamp(pLike, 0, 0.95);
    const like = rnd() < pLike;

    // ---- comment (extraverts comment far more often)
    const ctrlBoost = fx.ctrl * 0.18;
    let pCom = (0.025 + 0.26 * c + 0.2 * h + 0.2 * r + 0.18 * interest + ctrlBoost + 0.05 * Math.abs(mood)) * (0.3 + 1.5 * E);
    if (p.attach === 'anxious' && r > 0.3) pCom += 0.08;
    if (post.author === 'crowd') pCom *= 0.35;
    pCom = clamp(pCom, 0, 0.85);
    const comment = rnd() < pCom;
    if (!comment) return { like, comment: false, stance: 'indifferent' };

    // ---- stance of the comment
    const side = R.debateSide(S, post, fx);
    const myStance = fx.debate ? p.stance[fx.debate] : 0;
    const opposed = fx.debate && side !== 0 && Math.sign(myStance || 0.0001) !== side && Math.abs(myStance) > 0.25;
    const agreeing = fx.debate && side !== 0 && Math.sign(myStance || 0.0001) === side && Math.abs(myStance) > 0.25;
    const mentionsOther = (fx.mentions || []).some((m) => m !== npc.handle && m !== S.player.handle);
    const jealousTrigger = r > 0.28 && post.author === 'me' && (mentionsOther || (fx.flirt > 0.3 && /@/.test(post.text || ''))) ? 1 : 0;
    const envy = fx.brag * (0.4 + Math.max(0, authorStatus - myStatus));
    const w = {};
    w.cheer = 0.25 + 0.9 * A + 1.0 * c + 0.6 * fx.pos + 0.4 * fx.brag * c - 1.6 * h - 0.5 * fx.neg;
    w.compliment = (fx.photo ? 0.95 : 0.15) * (0.3 + c + 0.5 * r + 0.4 * A) - 1.2 * h;
    w.flirt = r > 0.28 ? (2.0 * r * (0.5 + E) + (ROMANTIC.includes(rel.status) ? 0.35 : 0)) * (fx.flirt > 0.3 ? 1.35 : 1) * (1 - 0.5 * h) : 0;
    w.tease = (0.3 + (p.humor === 'silly' || p.humor === 'dry' ? 0.45 : 0.1)) * (0.2 + c) * (1.15 - A * 0.5) + (fx.topics.includes('memes') ? 0.4 : 0);
    w.relate = (fx.vuln > 0.25 ? 0.7 : 0.15) * (0.3 + c + 0.5 * interest) + (N > 0.6 && fx.neg > 0.3 ? 0.3 : 0);
    w.empathize = fx.vuln * (0.4 + 1.3 * A + 0.9 * c) + fx.neg * 0.3 * A - 1.6 * h;
    w.concern = fx.vuln * (0.2 + 1.4 * c + 0.4 * A);
    w.jealous = jealousTrigger * (1.4 * r + 0.4 * c) * (0.5 + 0.95 * N) * (p.attach === 'anxious' ? 1.35 : 1) * 1.6;
    w.shade = (envy * 1.7 + fx.shade * 0.7) * (1.5 * h + 0.55 * (1 - A) + 0.25 * N);
    w.critique = opposed ? fx.ctrl * (0.55 + 0.9 * (1 - A) + 0.25 * O) + Math.abs(myStance) * 0.5 : 0;
    w.agree = agreeing ? fx.ctrl * (0.5 + 0.5 * c) + Math.abs(myStance) * 0.6 : 0;
    w.debate = fx.debate && Math.abs(myStance) > 0.45 ? 0.55 + Math.abs(myStance) * 0.7 : 0;
    w.hostile = (1.5 * h + 0.75 * (1 - A) + (npc.role === 'troll' || npc.role === 'hater' ? 1.1 : 0) + rel.grudge + 0.35 * fx.ctrl) * (1 - c * 0.85) * (mood < 0 ? 1.2 : 1);
    w.hostile *= 1 - 0.55 * fx.brag; // a brag draws envy ("must be nice"), not plain abuse
    if (opposed) w.cheer *= 0.5; // people who disagree do not cheer an opinion they oppose
    if (agreeing) w.cheer *= 1.25;
    w.defend = negKids > 0 ? (1.6 * c + 0.6 * A) * (1 - h) * Math.min(1.4, 0.6 + negKids * 0.25) : 0;
    w.curious = (fx.q ? 0.55 : 0.2) * (interest * 1.2 + O * 0.5);
    w.indifferent = (1 - E) * 0.65 + 0.15 + (1 - interest) * 0.35;
    w.bandwagon = kids.length >= 3 ? 0.35 * (1 - O * 0.5) * (posKids >= negKids ? 1 : 0.3) : 0;
    w.gossip = fx.topics.includes('drama') ? 0.5 * E + 0.2 : 0;
    // post kinds that invite specific replies
    if (post.ptype === 'poll') {
      w.curious += 0.3;
      w.debate += 0.2;
    }
    if (post.ptype === 'confession') w.empathize += 0.4;
    if (fx.vuln > 0.3) {
      w.hostile *= 0.55; // most people soften on vulnerable posts
      w.tease *= 0.4;
    }
    // a low mood makes people sourer and less supportive
    if (mood < -0.25) {
      w.cheer *= 0.7;
      w.shade *= 1.3;
      w.hostile *= 1.15;
    }
    // good news from somebody they like is met with warmth, never shade (envy stays possible for people who are hostile or distant)
    if (fx.good && c > 0.3 && h < 0.4) {
      w.shade = w.tease = w.hostile = w.critique = w.jealous = w.gossip = w.indifferent = w.bandwagon = 0;
      w.cheer = Math.max(w.cheer, 0) + 1.2;
      if (fx.photo) w.compliment += 0.3;
    }
    const stance = choose(w, rnd, 0.42);
    return { like: like || (stance !== 'indifferent' && rnd() < 0.55), comment: true, stance, side, agree: !!agreeing, other: !!opposed, hot: false, rel, w };
  };

  // does the author reply to a comment on their own post? returns a stance for the reply, or null
  R.replyStance = function (S, npc, comment, ctx) {
    const rnd = ctx.rnd;
    const p = G.Persona.ensure(npc);
    const A = p.t.A / 100, N = p.t.N / 100, E = p.t.E / 100, C = p.t.C / 100;
    if (!comment.author || comment.author === npc.id) return null;
    const rel = comment.author === 'crowd' ? { c: 0.05, h: 0.1, r: 0, grudge: 0 } : R.relation(S, npc, comment.author);
    const st = comment.stance || 'indifferent';
    const pos = ['cheer', 'compliment', 'flirt', 'agree', 'empathize', 'defend'].includes(st);
    const neg = ['hostile', 'critique', 'shade', 'jealous'].includes(st);
    let p0 = 0.1 + 0.4 * rel.c + 0.25 * E + (pos ? 0.2 : 0) + (neg ? 0.1 + 0.3 * N * (1 - C * 0.6) : 0);
    if (comment.author === 'crowd') p0 *= 0.45;
    if (rnd() > clamp(p0, 0, 0.85)) return null;
    if (pos) return rel.r > 0.35 && ['flirt', 'compliment'].includes(st) ? 'flirt_back' : 'thanks';
    if (neg) {
      if (A < 0.35 || N > 0.7) return rnd() < 0.55 ? 'clapback' : 'soften';
      return rnd() < 0.6 ? 'soften' : null;
    }
    return rnd() < 0.5 ? 'thanks' : null;
  };

  R.FRIENDLY = FRIENDLY;
  R.ROMANTIC = ROMANTIC;
  R.HOSTILE = HOSTILE;
})(window.G);
