/* Clout — game engine: world creation, turns, applying AI results */
(function (G) {
  const U = G.U;
  const E = (G.Engine = {});
  const { clamp, int, esc } = U;

  const STATUSES = [
    'stranger', 'acquaintance', 'friend', 'close_friend', 'best_friend', 'admirer', 'crush', 'dating', 'partner',
    'situationship', 'ex', 'frenemy', 'rival', 'enemy', 'nemesis', 'stan', 'hater', 'ally', 'mentor',
    'mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew',
  ];
  // blood / family ties: permanent and platonic (they never become crush / dating, and never lose the tie by drifting)
  const FAMILY = ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'];
  const STICKY = ['dating', 'partner', 'ex', 'situationship', 'mentor', 'ally', 'stan', 'hater', 'frenemy', 'admirer', 'crush'].concat(FAMILY);
  E.STATUSES = STATUSES;
  E.FAMILY = FAMILY;
  E.isFamily = (n) => !!n && FAMILY.includes(n.status);
  // the world is only the characters you brought: no new named characters and no anonymous crowd accounts appear on their own
  E.mainOnly = () => G.settings.mainCastOnly !== false;

  const FAME = {
    nobody: { label: 'Nobody (200 followers)', followers: 200, cash: 150 },
    rising: { label: 'Rising (8K followers)', followers: 8000, cash: 2500 },
    micro: { label: 'Influencer (150K followers)', followers: 150000, cash: 40000 },
    celeb: { label: 'Celebrity (4M followers)', followers: 4000000, cash: 750000 },
  };
  E.FAME = FAME;

  /* ---------- state helpers ---------- */

  const newPlayer = (cfg) => ({
    cash: (FAME[cfg.fame] || FAME.nobody).cash,
    name: cfg.name || 'You',
    handle: U.normHandle(cfg.handle || cfg.name || 'you'),
    bio: cfg.bio || '',
    emoji: cfg.emoji || '😎',
    traits: cfg.traits || [],
    followers: (FAME[cfg.fame] || FAME.nobody).followers,
    followerFloor: (FAME[cfg.fame] || FAME.nobody).followers,
    following: [],
    level: 1,
    xp: 0,
    stats: { charisma: 10, wit: 10, empathy: 10, edge: 10, style: 10 },
    verified: false,
    audience: { love: 40, hate: 8 },
    heat: 0,
    posts: 0,
  });

  E.newPlayer = newPlayer;

  E.makeNpc = function (raw, S = G.S) {
    const id = 'n' + S.counters.npc++;
    let handle = U.normHandle(raw.handle || raw.name || id);
    const taken = (h) => Object.values(S.npcs).some((n) => n.handle === h) || S.player.handle === h;
    for (let i = 2; taken(handle); i++) handle = U.normHandle((raw.handle || raw.name || id) + i);
    const npc = {
      id,
      name: String(raw.name || 'Someone').slice(0, 40),
      age: Math.max(18, int(raw.age, 0) || Math.round(U.rand(20, 33))), // never below 18
      history: '',
      custom: !!raw.custom,
      avatar: raw.avatar || '', // optional image (data URL), e.g. from an imported character card
      card: String(raw.card || '').slice(0, 3000), // long-form character sheet (imported cards)
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8).map(String) : [],
      handle,
      role: String(raw.role || 'wildcard').slice(0, 20),
      bio: String(raw.bio || '').slice(0, 160),
      personality: String(raw.personality || 'unpredictable').slice(0, 260),
      emoji: raw.emoji || U.pick(['😀', '😎', '🤓', '🥸', '😈', '🦊', '🐱', '🌸', '🔥', '👑']),
      followers: Math.max(5, int(raw.followers, 500)),
      secret: String(raw.secret || '').slice(0, 200),
      secretRevealed: false,
      mood: '',
      aff: clamp(int(raw.aff), -100, 100),
      rom: clamp(int(raw.rom), 0, 100),
      riv: clamp(int(raw.riv), 0, 100),
      trust: clamp(int(raw.trust), 0, 100),
      status: STATUSES.includes(raw.status) ? raw.status : 'stranger',
      memories: [],
      followed: false,
      muted: false,
      blocked: false,
      touched: S.clock,
    };
    S.npcs[id] = npc;
    return npc;
  };

  E.findNpc = function (ref, map, S = G.S) {
    if (ref == null || ref === '') return null;
    ref = String(ref).trim();
    if (map && map[ref]) return S.npcs[map[ref]] || null;
    if (S.npcs[ref]) return S.npcs[ref];
    const m = ref.match(/^(n\d+)/i);
    if (m && S.npcs[m[1].toLowerCase()]) return S.npcs[m[1].toLowerCase()];
    const h = U.normHandle(ref.replace(/^.*\((@[^)]+)\).*$/, '$1'));
    const lower = ref.toLowerCase();
    return Object.values(S.npcs).find((n) => n.handle === h || n.name.toLowerCase() === lower) || null;
  };

  // Alerts: a hard cap of 120 where private messages and relationship news (PROTECTED) can never be pushed out by noise (offers, events, follows, cash…).
  // Each type has its own cap (the oldest of that type goes first, read ones before unread), identical lines inside an hour merge into one "(xN)",
  // and `extra.key` merges a whole family of lines (e.g. "offers") into the one newest line.
  const NOTIF_MAX = 120;
  const NOTIF_CAP = { dm: 50, rel: 30, drama: 14, event: 12, follow: 8, cash: 8, viral: 5, level: 4, ach: 12, trend: 8 };
  const NOTIF_PROTECTED = { dm: 1, rel: 1 };
  const NOTIF_NOISE_MAX = NOTIF_MAX - 40; // 40 slots are always kept free for the protected types
  const dropOldest = (list, pred) => {
    let at = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!pred(list[i])) continue;
      if (list[i].read) { at = i; break; } // a read one goes first
      if (at < 0) at = i;
    }
    if (at >= 0) list.splice(at, 1);
    return at >= 0;
  };
  E.trimNotifs = function (S = G.S) {
    const l = S.notifs;
    for (let guard = 0; guard < 300 && l.length > NOTIF_MAX; guard++) if (!dropOldest(l, (n) => !NOTIF_PROTECTED[n.type]) && !dropOldest(l, () => true)) break;
    for (let guard = 0; guard < 300 && l.filter((n) => !NOTIF_PROTECTED[n.type]).length > NOTIF_NOISE_MAX; guard++) if (!dropOldest(l, (n) => !NOTIF_PROTECTED[n.type])) break;
  };
  const addNotif = (type, text, extra = {}) => {
    const S = G.S;
    const l = S.notifs;
    const key = extra && extra.key;
    // merge: same key (any time while unread), or exactly the same line within the last hour
    const dupAt = l.findIndex((n) => (key ? n.key === key && !n.read : n.type === type && n.base === String(text) && S.clock - n.t < 60 && !n.read) && n.type === type);
    if (dupAt >= 0) {
      const old = l.splice(dupAt, 1)[0];
      old.n = (old.n || 1) + 1;
      old.base = String(text);
      old.text = key ? String(text) : `${text} (x${old.n})`;
      old.t = S.clock;
      Object.assign(old, extra);
      l.unshift(old);
      return old;
    }
    const nt = Object.assign({ id: U.uid('nt'), t: S.clock, type, text, base: String(text), read: false }, extra);
    l.unshift(nt);
    const cap = NOTIF_CAP[type] || 15;
    for (let guard = 0; guard < 200 && l.filter((n) => n.type === type).length > cap; guard++) if (!dropOldest(l, (n) => n.type === type && n !== nt)) break;
    E.trimNotifs(S);
    return nt;
  };
  E.addNotif = addNotif;

  // meta = a game-side line for the player ("reached level 4"), not something that happened in the story: gossip, trends and channels skip it
  const addChron = (text, opts) => {
    if (!text) return;
    const S = G.S;
    const ent = { id: S.counters.chron++, t: S.clock, text: String(text).slice(0, 220) };
    if (opts && opts.meta) ent.meta = true;
    S.chronicle.push(ent);
    // hard cap only; the memory module summarises long before this
    if (S.chronicle.length > 120) S.chronicle.splice(0, S.chronicle.length - 120);
  };
  E.addChron = addChron;

  // bring older / imported saves up to the current shape
  E.migrate = function (S) {
    if (S.activeAlt && !E.altOf(S.activeAlt)) S.activeAlt = null;
    S.groups = S.groups || {};
    S.scenes = S.scenes || {};
    S.dmSum = S.dmSum || {};
    S.saga = S.saga || '';
    S.lore = S.lore || [];
    S.ach = S.ach || {};
    if (G.World) G.World.ensure(S);
    S.stories = S.stories || [];
    S.queue = S.queue || [];
    S.rumors = S.rumors || [];
    if (S.popSize == null) S.popSize = 250000;
    S.popSeed = S.popSeed || Math.floor(Math.random() * 1e6) + 1;
    S.popMet = S.popMet || {};
    S.counters = Object.assign({ npc: 1, post: 1, story: 1, chron: 1, group: 1, msg: 1 }, S.counters);
    S.chronicle.forEach((c) => {
      if (c.id == null) c.id = S.counters.chron++;
    });
    S.player.cash = S.player.cash ?? 500;
    // Older saves have no recorded starting audience. Preserve their current
    // count as the floor so adding followers never shrinks an existing save.
    S.player.followerFloor = Math.max(0, int(S.player.followerFloor, S.player.followers));
    Object.values(S.npcs).forEach((n) => {
      n.age = Math.max(18, int(n.age, 0) || 25);
      n.history = n.history || '';
    });
    return S;
  };

  E.addPost = function (p, S = G.S) {
    const id = 'p' + S.counters.post++;
    const post = {
      id,
      author: p.author,
      text: String(p.text || '').slice(0, 600),
      t: p.t ?? S.clock,
      replyTo: p.replyTo || null,
      quote: p.quote || null,
      buzz: clamp(int(p.buzz, 3), 0, 10),
      crowd: p.crowd || null,
      stats: p.stats || { likes: 0, reposts: 0, replies: 0, views: 0 },
      liked: false,
      pending: !!p.pending,
      tone: p.tone || '',
      ptype: p.ptype || '',
      attach: p.attach ? String(p.attach).slice(0, 240) : '',
      poll: p.poll || null,
      audience: p.audience === 'close' ? 'close' : '',
    };
    S.posts[id] = post;
    S.postOrder.push(id);
    return post;
  };

  // inside a world, randomness comes from the world's seeded generator (reproducible); otherwise Math.random
  E.rand = () => (G.World && G.S && G.S.sim && G.S.sim.rng != null ? G.World.rnd() : Math.random());
  const rr = (a, b) => a + E.rand() * (b - a);
  E.followerCap = (S = G.S) => Math.max(
    Math.max(0, int(S.player.followerFloor, S.player.followers)),
    Math.max(1000, int(S.popSize, 250000)) * 2,
  );
  E.addFollowers = function (amount) {
    const S = G.S;
    const P = S.player;
    const before = P.followers;
    const cap = E.followerCap(S);
    P.followers = Math.min(cap, Math.max(0, before + Math.round(Number(amount) || 0)));
    return P.followers - before;
  };

  function npcStats(n, buzz) {
    const f = n ? n.followers : 300;
    const b = 0.4 + clamp(int(buzz, 3), 0, 10) / 5; // `buzz` comes from the AI: never trust its type
    const likes = Math.round(f * rr(0.004, 0.03) * b);
    return {
      likes,
      reposts: Math.round(likes * rr(0.05, 0.2)),
      replies: Math.round(likes * rr(0.02, 0.1)),
      views: Math.round(likes * rr(8, 25) + 20),
    };
  }
  E.npcStats = npcStats;
  function crowdStats(boost = 1) {
    const likes = Math.round(Math.pow(E.rand(), 2.2) * 60 * boost);
    return { likes, reposts: Math.round(likes * rr(0, 0.1)), replies: Math.round(likes * rr(0, 0.15)), views: likes * 12 + 30 };
  }

  // poll with simulated votes proportional to the author's reach
  E.makePoll = function (options, followers) {
    const opts = (options || []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 4);
    if (opts.length < 2) return null;
    const voters = Math.max(8, Math.round(followers * rr(0.01, 0.07)));
    const w = opts.map(() => Math.pow(E.rand(), 1.6) + 0.15);
    const sum = w.reduce((a, b) => a + b, 0);
    return { options: opts.map((t, i) => ({ t, v: Math.round((voters * w[i]) / sum) })), voted: null };
  };

  E.vote = function (postId, i) {
    const p = G.S.posts[postId];
    if (!p || !p.poll || p.poll.voted != null || !p.poll.options[i]) return;
    p.poll.voted = i;
    p.poll.options[i].v++;
    G.Store.saveSoon();
  };

  E.tick = function (minutes) {
    const S = G.S;
    const m = Math.max(1, Math.round(minutes));
    S.clock += m;
    // heat cools in proportion (a big scandal lingers for days instead of vanishing overnight), plus a small steady floor
    S.player.heat = clamp(S.player.heat * Math.pow(0.97, m / 60) - 0.25 * (m / 60), 0, 100);
    S.player.audience.hate = clamp(S.player.audience.hate - (m / 60) * 0.15, 2, 95);
    if (G.World) G.World.run(m); // the living world moves with the clock: NPCs post, react, text, scheme…
  };

  E.xpNeeded = (lvl) => Math.round(40 * Math.pow(lvl, 1.5));

  /* ---------- economy helpers: spam / duplicates / daily caps / audience size ---------- */

  // the most XP (and similar small rewards) a kind of action can give per game day: { key: used } kept on the player, reset every day
  E.dailyCap = function (key, cap, want) {
    const P = G.S.player;
    const d = U.dayOf(G.S.clock);
    if (!P.eco || P.eco.d !== d) P.eco = { d };
    const used = P.eco[key] || 0;
    const ok = Math.max(0, Math.min(want, cap - used));
    if (ok) P.eco[key] = used + ok;
    return ok;
  };
  // words of a text with digits, punctuation and emoji gone: "gm everyone 7!!" and "GM everyone" are the same post
  const normWords = (t) => String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
  const sameText = (a, b) => {
    if (!a.length || !b.length) return false;
    if (a.length <= 2 || b.length <= 2) return a.join(' ') === b.join(' ');
    const sa = new Set(a), sb = new Set(b);
    let inter = 0;
    sa.forEach((w) => { if (sb.has(w)) inter++; });
    return inter / (sa.size + sb.size - inter) >= 0.8;
  };
  // how tired the audience is of you right now: posts of yours in the last 24h, and whether this one repeats a recent one (last 3 days)
  E.postFatigue = function (post) {
    const S = G.S;
    const t = post.t != null ? post.t : S.clock;
    const mine = normWords(post.text);
    const raw = String(post.text || '').trim().toLowerCase();
    let n24 = 0, dup = false, gained = 0;
    for (let i = S.postOrder.length - 1, seen = 0; i >= 0 && seen < 120; i--, seen++) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p === post || p.author !== 'me' || p.replyTo || p.pending) continue;
      if (t - p.t > 4320) break;
      if (t - p.t <= 1440) { n24++; gained += Math.max(0, p.fgain || 0); }
      if (!dup && (mine.length ? sameText(mine, normWords(p.text)) : raw && raw === String(p.text || '').trim().toLowerCase())) dup = true;
    }
    return { n24, dup, gained };
  };
  E.repliesToday = function (post) {
    const S = G.S;
    const t = post.t != null ? post.t : S.clock;
    let n = 0;
    for (let i = S.postOrder.length - 1, seen = 0; i >= 0 && seen < 120; i--, seen++) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p === post || p.author !== 'me' || !p.replyTo) continue;
      if (t - p.t > 1440) break;
      n++;
    }
    return n;
  };
  // the audience this world can hold: new fans come ever more slowly as you approach it (logistic), so growth fades well before the hard ceiling
  E.audienceSoft = (S = G.S) => Math.max(1000, int(S.popSize, 250000), 2 * int(S.player.followerFloor, 0));
  E.saturation = (f, S = G.S) => Math.max(0, 1 - f / E.audienceSoft(S));

  /* ---------- player post metrics (local, deterministic-ish) ---------- */

  const GROWTH_K = 12; // new followers per repost (before fatigue, saturation and the daily limit)
  const TONE_STAT = { funny: 'wit', spicy: 'edge', vulnerable: 'empathy', wholesome: 'empathy', flirty: 'charisma', live: 'charisma' };

  E.metrics = function (j, post) {
    const P = G.S.player;
    const q = clamp(int(j.quality, 5), 1, 10) / 10;
    const v = clamp(int(j.virality, 3), 1, 10) / 10;
    let s = clamp(int(j.sentiment, 0), -10, 10) / 10;
    const c = clamp(int(j.controversy, 0), 0, 10) / 10;
    // the word-level judge can miss a put-down ("nobody likes you"); the post's stance (same Lex classifier the comments use) sets a floor on how nasty it was
    if (post.stance === 'hostile' || (G.Lex && !post.replyTo && G.Lex.intent(post.text) === 'insult')) s = Math.min(s, -0.6);
    else if (post.stance === 'critique') s = Math.min(s, -0.25);
    const mult = 1 + P.level * 0.03;
    const f = P.followers;
    const isReply = !!post.replyTo;
    const fat = isReply ? { n24: 0, dup: false, gained: 0 } : E.postFatigue(post);
    // each further post inside a day is worth less (1/(1+n)); repeating yourself is worth almost nothing; a reply is a conversation, not a broadcast
    const eff = (isReply ? 1 / (1 + E.repliesToday(post)) : 1 / (1 + fat.n24)) * (fat.dup ? 0.04 : 1);
    const tired = isReply ? 0.25 : (1 / (1 + 0.2 * fat.n24)) * (fat.dup ? 0.35 : 1);
    const stat = P.stats && P.stats[TONE_STAT[j.tone] || 'style'];
    const statMult = clamp(1 + ((stat != null ? stat : 10) - 10) / 200, 0.9, 1.3);
    const reach = (f * (0.05 + 0.9 * v * v * v + 0.15 * q) + 30) * mult * rr(0.8, 1.25) * tired;
    const likes = Math.round(reach * clamp(0.06 + 0.22 * q + 0.08 * s, 0.02, 0.4));
    const reposts = Math.round(likes * (0.04 + 0.3 * v + 0.12 * c) * rr(0.7, 1.3));
    const replies = Math.round(likes * (0.03 + 0.12 * c + 0.05 * v) * rr(0.7, 1.4)) + 1;
    post.stats = { likes, reposts, replies, views: Math.round(reach * rr(2.5, 4)) };

    // new followers are people OUTSIDE your circle who see it shared (reposts); they fade as you approach the size of the world (logistic),
    // and a day only has so many new fans
    let gain = 0;
    if (!isReply) {
      let raw = (reposts * GROWTH_K + 1.5 * q) * E.saturation(f) * statMult * eff;
      if (s < -0.3) raw = Math.min(raw * 0.15, f * 0.001) - f * (-s - 0.2) * (0.015 + 0.03 * c); // being nasty alone costs fans; being nasty AND controversial costs more
      if (fat.n24 >= 6) raw -= f * 0.0006 * Math.min(fat.n24 - 5, 8); // flooding the feed makes people mute and unfollow
      if (raw > 0) raw = Math.min(raw, Math.max(0, f * 0.02 + 6 - fat.gained)); // one day can bring at most ~2% new fans
      gain = Math.round(raw * rr(0.85, 1.15));
      if (f < 500 && gain < 0) gain = Math.max(gain, -3);
      gain = Math.max(gain, -Math.round(f * 0.06));
      gain = E.addFollowers(gain);
      post.fgain = gain;
      if (fat.dup) post.dup = true;
      P.posts++;
    }
    const spam = !isReply && fat.n24 >= 6;
    P.heat = clamp(P.heat + c * 18 + Math.max(0, -s) * 10, 0, 100);
    P.audience.love = clamp(P.audience.love + s * 4 * (0.5 + q) - (spam ? 0.4 : 0), 5, 95);
    P.audience.hate = clamp(P.audience.hate + c * 3 + Math.max(0, -s) * 5 - Math.max(0, s) * 1.5 + (spam ? 0.5 : 0), 2, 95);

    let xp = Math.max(1, Math.round((q * 10 + v * 10 + c * 3 + 2) * (isReply ? 0.15 : eff)));
    if (isReply) xp = E.dailyCap('rx', 12, Math.min(2, xp)); // replies teach a little, up to 12 XP a day
    return { gain, xp, likes, viral: v >= 0.8 && eff >= 0.5, eff: isReply ? 0.2 : eff, reply: isReply };
  };

  E.giveXp = (a) => giveXp(a);
  function giveXp(amount) {
    const P = G.S.player;
    P.xp += Math.max(0, Math.round(amount));
    let up = false;
    while (P.xp >= E.xpNeeded(P.level)) {
      P.xp -= E.xpNeeded(P.level);
      P.level++;
      up = true;
    }
    if (up) {
      G.UI.toast(`⭐ Level up! You are now level ${P.level}`, 'good');
      addNotif('level', `You reached level ${P.level}`);
      addChron(`Player reached level ${P.level}`, { meta: true });
    }
    if (!P.verified && (P.followers >= 250000 || (P.level >= 15 && P.followers >= 20000))) { // big accounts only: anyone else buys it in the Shop
      P.verified = true;
      G.UI.toast('☑️ You got verified!', 'good');
      addNotif('level', 'You are now verified');
    }
  }

  /* ---------- relationships ---------- */

  function deriveStatus(n) {
    if (G.Bonds && G.Bonds.derive) return G.Bonds.derive(n, G.S);
    if (STICKY.includes(n.status)) return n.status;
    if (n.riv >= 75 && n.aff < -30) return 'nemesis';
    if (n.riv >= 50 && n.aff < -10) return 'enemy';
    if (n.riv >= 30 && n.aff < 10) return 'rival';
    // friendship ladder: climb as soon as a threshold is met, but only slide down when clearly below it (hysteresis)
    const LADDER = [['best_friend', 75], ['close_friend', 50], ['friend', 20], ['acquaintance', 5]];
    const cur = LADDER.findIndex((l) => l[0] === n.status);
    let tgt = LADDER.findIndex((l) => n.aff >= l[1]);
    if (tgt === -1) tgt = LADDER.length;
    if (cur !== -1 && tgt > cur && n.aff >= LADDER[cur][1] - 8) return n.status;
    return tgt < LADDER.length ? LADDER[tgt][0] : n.status;
  }

  // Common sense for AI-written relationship changes: one exchange moves a bond a little, only a big event
  // (imp >= 8) moves it a lot, and nobody becomes a partner or a couple from a single comment.
  const REL_STEP = { aff: 20, rom: 12, riv: 20, trust: 15 };
  E.REL_STEP = REL_STEP;
  E.vetRel = function (n, r) {
    const o = Object.assign({}, r);
    const major = int(r.imp, 0) >= 8;
    Object.keys(REL_STEP).forEach((k) => {
      if (o[k] != null) o[k] = clamp(int(o[k]), -(major ? 45 : REL_STEP[k]), major ? 45 : REL_STEP[k]);
    });
    const st = typeof r.status === 'string' && r.status.toLowerCase().replace(/\s+/g, '_');
    if (st === 'dating' || st === 'partner') {
      const couple = n.status === 'dating' || n.status === 'partner';
      const warm = n.rom >= 35 && n.aff >= 25; // feelings that were already there before this exchange
      const deep = n.rom >= 60 && n.aff >= 40 && n.trust >= 50;
      if (st === 'partner' ? !(n.status === 'partner' || deep) : !(couple || warm)) {
        if (st === 'partner' && (couple || warm)) o.status = 'dating'; // a step up the ladder, not a leap
        else delete o.status;
      }
    }
    return o;
  };

  E.applyRel = function (n, r) {
    const d = (v, lim) => clamp(int(v), -lim, lim);
    const before = n.status;
    n.aff = clamp(n.aff + d(r.aff, 45), -100, 100);
    n.rom = clamp(n.rom + d(r.rom, 45), 0, 100);
    n.riv = clamp(n.riv + d(r.riv, 45), 0, 100);
    n.trust = clamp(n.trust + d(r.trust, 45), 0, 100);
    const st = typeof r.status === 'string' && r.status.toLowerCase().replace(/\s+/g, '_');
    if (FAMILY.includes(before) && !FAMILY.includes(st)) {
      n.status = before; // a family tie is permanent: the AI can strain it (riv, aff) but not turn it into something else
      n.rom = 0;
    } else {
      n.status = st && STATUSES.includes(st) ? st : deriveStatus(n);
      if (FAMILY.includes(n.status)) n.rom = 0;
    }
    if (typeof r.mood === 'string' && r.mood) n.mood = r.mood.slice(0, 20);
    if (typeof r.memory === 'string' && r.memory.trim()) {
      n.memories.push(r.memory.trim().slice(0, 140));
      if (n.memories.length > 10) n.memories.shift();
    }
    if (r.reveal_secret && n.secret) n.secretRevealed = true;
    n.touched = G.S.clock;
    if (n.status !== before) {
      const label = G.UI.statusMeta(n.status, n).label;
      addNotif('rel', `${n.name} is now: ${label}`, { npcId: n.id });
      addChron(`${n.name} became ${label} with the player`);
      G.UI.toast(`${G.UI.statusMeta(n.status, n).emoji} ${n.name} → ${label}`, 'info');
    }
  };

  function upsertEdge(S, a, b, type, note) {
    if (!a || !b || a === b) return;
    if (G.Bonds && G.Bonds.addEdge) {
      G.Bonds.addEdge(S, a, b, type || 'friend', note, U.dayOf(S.clock), 80);
      return;
    }
    const e = S.npcRel.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (e) {
      e.type = type || e.type;
      if (note) e.note = String(note).slice(0, 80);
    } else S.npcRel.push({ a, b, type: type || 'friend', note: String(note || '').slice(0, 80) });
    if (S.npcRel.length > 80) S.npcRel.shift();
    if (G.React) G.React.dirty = true;
  }

  /* ---------- apply an AI result ---------- */

  // AI output is untrusted: anything can be missing, null or the wrong type. These helpers make every
  // list safe to iterate and make one malformed item skippable instead of fatal for the whole turn.
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const each = (list, fn) =>
    arr(list).forEach((item) => {
      if (!isObj(item)) return;
      try {
        fn(item);
      } catch (e) {
        console.warn('[clout] skipped a malformed AI item:', e.message);
      }
    });
  const text = (x, n) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '').slice(0, n);
  E.isObj = isObj;

  // ctx: { placed:{kind,post|dm}, targetPostId, judged:boolean }
  E.apply = function (res, ctx = {}) {
    res = isObj(res) ? res : {};
    const S = G.S;
    const P = S.player;
    const map = {}; // temp ref -> npc id
    const pmap = {}; // temp post id -> real id
    let newCrowd = 0;
    const crowdOn = {};

    if (ctx.placed && ctx.placed.post && ctx.accountId && S.npcs[ctx.accountId]) {
      const n = S.npcs[ctx.accountId];
      const j = isObj(res.judge) ? res.judge : {};
      const q = clamp(int(j.quality, 5), 1, 10) / 10;
      const v = clamp(int(j.virality, 3), 1, 10) / 10;
      const c = clamp(int(j.controversy, 0), 0, 10) / 10;
      const reach = Math.max(20, Math.round(n.followers * (0.05 + 0.85 * v * v * v + 0.12 * q)));
      const likes = Math.round(reach * clamp(0.06 + 0.22 * q, 0.02, 0.4));
      ctx.placed.post.stats = { likes, reposts: Math.round(likes * (0.04 + 0.3 * v + 0.12 * c)), replies: Math.round(likes * (0.03 + 0.12 * c + 0.05 * v)) + 1, views: reach * 3 };
      ctx.placed.post.pending = false;
      ctx.placed.post.tone = text(j.tone, 20) || ctx.placed.post.tone || '';
      ctx.placed.post.judge = { q: int(j.quality, 5), v: int(j.virality, 3), s: int(j.sentiment, 0), c: int(j.controversy, 0), note: text(j.summary, 100) };
      n.followers = Math.max(5, n.followers + Math.round(n.followers * (v - 0.35) * 0.025));
      n.posts = (n.posts || 0) + 1;
      n.touched = S.clock;
    } else if (ctx.placed && ctx.placed.post && isObj(res.judge) && ctx.judge !== false) {
      const m = E.metrics(res.judge, ctx.placed.post);
      ctx.placed.post.tone = text(res.judge.tone, 20) || ctx.placed.post.tone || '';
      ctx.placed.post.pending = false;
      ctx.placed.post.judge = {
        q: int(res.judge.quality), v: int(res.judge.virality), s: int(res.judge.sentiment), c: int(res.judge.controversy),
        note: text(res.judge.summary, 100),
      };
      ctx.followerGain = m.gain;
      P.cash += Math.round(m.likes * (P.followers >= 10000 ? 0.006 : 0.003) * (1 + P.level * 0.04) * (m.reply ? 0.2 : Math.min(1, m.eff * 2)));
      giveXp(m.xp + (m.reply ? 0 : clamp(int(res.xp), 0, 25)));
      if (m.gain > 0) addNotif('follow', `+${U.fmt(m.gain)} new followers from your post`, { postId: ctx.placed.post.id });
      else if (m.gain < 0) addNotif('follow', `${U.fmt(m.gain)} followers unfollowed after that post`, { postId: ctx.placed.post.id });
      if (m.viral) {
        addNotif('viral', `Your post went VIRAL — ${U.fmt(m.likes)} likes`, { postId: ctx.placed.post.id });
        G.UI.toast('🚀 Your post is going viral!', 'good');
      }
    } else if (ctx.placed && ctx.placed.post) {
      ctx.placed.post.pending = false;
      const author = S.npcs[ctx.placed.post.author];
      ctx.placed.post.stats = npcStats({ followers: author ? author.followers : P.followers }, 3);
      if (!ctx.accountId) giveXp(3);
    } else if (ctx.placed && ctx.placed.dm) {
      giveXp(2 + clamp(int(res.xp), 0, 10));
    } else if (res.xp) giveXp(clamp(int(res.xp), 0, 15));

    // new characters
    each(res.new_npcs, (raw) => {
      if (!raw.name || (E.mainOnly() && !E.directing)) return;
      const exists = E.findNpc(raw.handle || raw.name);
      if (exists) {
        if (raw.ref) map[raw.ref] = exists.id;
        return;
      }
      const n = E.makeNpc(raw);
      if (raw.ref) map[raw.ref] = n.id;
      map[n.id] = n.id;
    });

    // named posts + replies
    const drop = (why) => { (ctx.dropped = ctx.dropped || []).push(why); };
    // Common sense gate (G.Mind.vet) for every line an NPC says: returns the line to use, a kinder replacement, or null (dropped).
    // Each rejection is recorded in ctx.dropped so the Director summary stays honest.
    const nameOf = (id) => (id === 'me' ? String(P.name || '').split(' ')[0] : S.npcs[id] ? String(S.npcs[id].name || '').split(' ')[0] : '');
    const vetLine = (npc, line, kind, about, aboutAuthor, thread) => {
      if (!G.Mind || !npc) return line;
      let rel;
      try { rel = G.React && aboutAuthor ? G.React.relation(S, npc, aboutAuthor) : undefined; } catch (e) { rel = undefined; }
      const v = G.Mind.vet(npc, line, { kind, about, aboutAuthor, thread, rel, dup: true });
      if (v.ok) return line;
      const alt = v.fix && !v.drop ? G.Mind.respond(npc, { about, rel, to: nameOf(aboutAuthor) }) : null;
      drop(npc.name + ': ' + v.why + (alt ? ' (replaced by a fitting line)' : ''));
      return alt || null;
    };
    each(res.posts, (p) => {
      if (!p.text || typeof p.text !== 'string') return;
      const a = E.findNpc(p.author, map);
      if (!a || a.blocked) { drop('a post by someone who is not in the cast (' + String(p.author || '?').slice(0, 20) + ')'); return; }
      let replyTo = p.replyTo && p.replyTo !== 'null' ? pmap[p.replyTo] || (S.posts[p.replyTo] ? p.replyTo : null) : null;
      if (!replyTo && p.replyTo && ctx.targetPostId) replyTo = ctx.targetPostId;
      if (ctx.source === 'simulation' && (!replyTo || !G.World || !G.World.knowsPost(a, replyTo))) return;
      // Reject malformed model output that makes a character reply to their own post/comment.
      if (replyTo && S.posts[replyTo] && S.posts[replyTo].author === a.id) { drop(a.name + ' replying to their own post'); return; }
      const quote = p.quote && S.posts[p.quote] ? p.quote : null;
      // Replies can emerge from the simulation. A standalone NPC post must be an approved
      // Storyteller action; old postDial values and time/event buttons never authorize it.
      if (!replyTo && !quote && !(ctx.allowNpcPosts && E.directing)) { drop(a.name + ' posting on their own (say who should post, or approve the item)'); return; }
      if (quote && !(ctx.allowNpcPosts && E.directing)) { drop(a.name + ' quote-posting'); return; }
      {
        const par = replyTo && S.posts[replyTo];
        const thread = [];
        for (let q = par, i = 0; q && i < 6; q = q.replyTo && S.posts[q.replyTo], i++) thread.push(q.author);
        const line = vetLine(a, p.text, replyTo ? 'comment' : 'post', par ? (par.text || '') + ' ' + (par.attach || '') : '', par ? par.author : '', thread);
        if (!line) return;
        p.text = line;
      }
      const np = E.addPost({
        author: a.id, text: p.text, replyTo, quote, buzz: p.buzz, stats: npcStats(a, p.buzz), audience: p.audience === 'close' && !replyTo ? 'close' : '',
        attach: p.attach, poll: Array.isArray(p.poll) ? E.makePoll(p.poll, a.followers) : null,
      });
      if (p.id) pmap[p.id] = np.id;
      if (replyTo && G.World) np.stance = G.World.inferStance(p.text);
      a.touched = S.clock;
      const parent = replyTo && S.posts[replyTo];
      if (parent) {
        parent.stats.replies = Math.max(parent.stats.replies, 0);
        if (parent.author === 'me') {
          addNotif('reply', `${a.name} replied: "${String(p.text).slice(0, 80)}"`, { npcId: a.id, postId: np.id });
        }
      } else if (String(p.text).toLowerCase().includes(P.handle)) {
        addNotif('mention', `${a.name} mentioned you: "${String(p.text).slice(0, 80)}"`, { npcId: a.id, postId: np.id });
      }
    });

    // anonymous crowd
    each(res.crowd, (c) => {
      if (!c.text || typeof c.text !== 'string' || (E.mainOnly() && !E.directing)) return;
      let replyTo = pmap[c.replyTo] || (S.posts[c.replyTo] ? c.replyTo : ctx.targetPostId || null);
      if (!replyTo) return;
      const stance = String(c.stance || 'neutral').toLowerCase();
      const boost = stance === 'troll' || stance === 'hater' ? 1.5 : stance === 'stan' ? 1.2 : 1;
      const post = E.addPost({
        author: 'crowd',
        text: c.text,
        replyTo,
        crowd: {
          name: String(c.name || 'anon').slice(0, 30), handle: U.normHandle(c.handle || c.name || 'anon'), stance,
          pop: G.Pop && G.Pop.recent.has(U.normHandle(c.handle || '')) ? G.Pop.recent.get(U.normHandle(c.handle || '')) : undefined,
        },
        stats: crowdStats(boost),
      });
      newCrowd++;
      if (G.World) post.stance = G.World.inferStance(c.text);
      const par = S.posts[replyTo];
      if (par && par.author === 'me') crowdOn[par.id] = (crowdOn[par.id] || 0) + 1;
    });
    Object.keys(crowdOn).forEach((pid) => {
      addNotif('reply', `${crowdOn[pid]} people replied to your post`, { postId: pid });
    });

    // DMs to the player
    const dmN = {};
    each(res.dms, (d) => {
      const n = E.findNpc(d.from, map);
      if (!n || !d.text || typeof d.text !== 'string' || n.blocked) return;
      const hist = S.dms[n.id] || [];
      const lastMine = hist.slice(-3).reverse().find((m) => m.from === 'me'); // what the player just said to them
      const refd = d.post && S.posts[d.post];
      const dline = vetLine(n, String(d.text), 'dm', ((lastMine && lastMine.text) || '') + ' ' + ((refd && refd.text) || '') + ' ' + ((ctx.placed && ctx.placed.post && ctx.placed.post.author === 'me' && ctx.placed.post.text) || ''), 'me', ['me']);
      if (!dline) return;
      d.text = dline;
      const reTo = ctx.placed && ctx.placed.dm && ctx.placed.npcId === n.id ? ctx.placed.dm : null; // a reply to the player's message is anchored to it, with a short typing gap
      dmN[n.id] = Math.min(3, (dmN[n.id] || 0) + 1);
      const dmsg = { id: U.uid('m'), from: n.id, text: String(d.text).slice(0, 1200), t: reTo ? Math.min(S.clock, reTo.t + dmN[n.id]) : S.clock, read: false };
      if (reTo) dmsg.replyTo = reTo.id;
      const rf = G.Refs && G.Refs.post(d.post);
      if (rf) dmsg.ref = rf; // the AI named the post the message is about
      (S.dms[n.id] = S.dms[n.id] || []).push(dmsg);
      if (S.dms[n.id].length > 120) S.dms[n.id].shift();
      n.touched = S.clock;
      if (!n.muted) addNotif('dm', `${n.name} sent you a message`, { npcId: n.id });
      ctx.newDms = (ctx.newDms || 0) + 1;
    });

    // group chat messages
    each(res.group_msgs, (gm) => {
      const g = S.groups[gm.group] || Object.values(S.groups).find((x) => x.name.toLowerCase() === String(gm.group).toLowerCase());
      const n = E.findNpc(gm.from, map);
      if (!g || !n || !gm.text || typeof gm.text !== 'string') return;
      const prev = g.msgs.slice(-3).reverse().find((m) => m.from !== n.id); // what was just said in the group
      const gline = vetLine(n, gm.text, 'channel', (prev && prev.text) || '', prev ? prev.from : '', []);
      if (!gline) return;
      gm.text = gline;
      g.msgs.push({ id: 'g' + S.counters.msg++, from: n.id, text: String(gm.text).slice(0, 500), t: S.clock, read: false });
      if (g.msgs.length > 200) g.msgs.shift();
      n.touched = S.clock;
      if (!g.muted) addNotif('dm', `${n.name} in "${g.name}": ${String(gm.text).slice(0, 60)}`, { groupId: g.id });
    });

    // money from deals / donations
    if (res.cash) {
      const lim = P.followers * 0.5 + 500;
      const d = clamp(int(res.cash), -lim, lim * 4);
      P.cash = Math.max(0, P.cash + d);
      if (d) addNotif('cash', `${d > 0 ? '+' : '-'}$${U.fmt(Math.abs(d))}`, {});
    }

    // live-stream recap
    if (isObj(res.live)) {
      const lv = res.live;
      const peak = Math.max(10, Math.round(P.followers * rr(0.02, 0.12) * (0.6 + (int(res.judge && res.judge.quality, 5) / 10))));
      const donations = arr(lv.donations)
        .filter((x) => isObj(x) && int(x.amount) > 0)
        .map((x) => ({ name: String(x.name || 'anon').slice(0, 30), amount: clamp(int(x.amount), 1, Math.max(50, Math.round(P.followers * 0.02))), msg: String(x.msg || '').slice(0, 120) }))
        .slice(0, 12);
      const total = donations.reduce((a, x) => a + x.amount, 0) + Math.round(peak * rr(0.2, 1.2));
      P.cash += total;
      S.lastLive = {
        t: S.clock, peak, total, donations, moment: String(lv.moment || '').slice(0, 160),
        chat: arr(lv.chat).filter((c) => isObj(c) && c.text).slice(0, 30).map((c) => ({ name: text(c.name, 24) || 'viewer', text: String(c.text).slice(0, 160), stance: text(c.stance, 12) })),
      };
      addNotif('cash', `Stream earned $${U.fmt(total)} · peak ${U.fmt(peak)} viewers`, {});
    }

    // relationship changes
    if (!ctx.accountId) each(res.rel, (r) => {
      const n = E.findNpc(r.id, map);
      if (n) E.applyRel(n, E.vetRel(n, r));
    });

    each(res.npc_rel, (r) => {
      const a = E.findNpc(r.a, map);
      const b = E.findNpc(r.b, map);
      if (a && b) upsertEdge(S, a.id, b.id, String(r.type || 'friend').toLowerCase(), r.note);
    });

    // storylines
    each(res.storylines, (s) => {
      if (!s.title || typeof s.title !== 'string') return;
      let st = S.storylines.find((x) => x.id === s.id) || S.storylines.find((x) => x.title.toLowerCase() === String(s.title).toLowerCase());
      const parts = arr(s.participants).map((x) => E.findNpc(x, map)).filter(Boolean).map((n) => n.id);
      if (!st) {
        st = { id: 's' + S.counters.story++, title: '', summary: '', heat: 30, status: 'active', participants: [], updated: S.clock, log: [] };
        S.storylines.push(st);
        addNotif('drama', `New storyline: ${s.title}`, { storyId: st.id });
      }
      st.title = String(s.title).slice(0, 80);
      if (s.summary && s.summary !== st.summary) {
        st.log.push({ t: S.clock, text: String(s.summary).slice(0, 220) });
        if (st.log.length > 8) st.log.shift();
      }
      st.summary = String(s.summary || st.summary).slice(0, 260);
      st.heat = clamp(int(s.heat, st.heat), 0, 100);
      st.status = ['active', 'boiling', 'resolved'].includes(s.status) ? s.status : st.heat >= 70 ? 'boiling' : 'active';
      if (parts.length) st.participants = parts;
      st.updated = S.clock;
    });
    if (S.storylines.length > 16) {
      const done = S.storylines.filter((s) => s.status === 'resolved').sort((a, b) => a.updated - b.updated);
      while (S.storylines.length > 16 && done.length) S.storylines.splice(S.storylines.indexOf(done.shift()), 1);
    }

    // trending
    if (arr(res.trending).length) {
      const m = new Map(S.trending.map((t) => [t.tag.toLowerCase(), { tag: t.tag, heat: t.heat * 0.75 }]));
      each(res.trending, (t) => {
        if (!t.tag || typeof t.tag !== 'string') return;
        const tag = ('#' + String(t.tag).replace(/^#+/, '').replace(/\s+/g, '')).slice(0, 40);
        m.set(tag.toLowerCase(), { tag, heat: clamp(int(t.heat, 50), 1, 100) });
      });
      S.trending = [...m.values()].filter((t) => t.heat > 6).sort((a, b) => b.heat - a.heat).slice(0, 8);
    }

    // stats
    if (!ctx.accountId && isObj(res.stats)) {
      Object.keys(P.stats).forEach((k) => {
        P.stats[k] = clamp(P.stats[k] + clamp(int(res.stats[k]), -3, 4), 1, 100);
      });
    }

    // event with choices
    const evOpts = isObj(res.event) ? arr(res.event.options).map((o) => (typeof o === 'string' ? o : isObj(o) ? text(o.label || o.text, 100) : '')).map((o) => o.trim().slice(0, 100)).filter(Boolean) : [];
    if (isObj(res.event) && typeof res.event.title === 'string' && res.event.title && evOpts.length >= 2 && !S.events.some((e) => !e.resolved)) {
      S.events.push({
        id: U.uid('ev'), t: S.clock, resolved: false,
        title: res.event.title.slice(0, 80), text: text(res.event.text, 400), options: evOpts.slice(0, 4),
      });
      addNotif('event', `Event: ${res.event.title.slice(0, 80)}`);
    }

    addChron(Array.isArray(res.chronicle) ? res.chronicle.filter((x) => typeof x === 'string').join('; ') : typeof res.chronicle === 'string' ? res.chronicle : '');
    if (typeof res.toast === 'string' && res.toast) G.UI.toast(res.toast.slice(0, 140), 'info');

    // cap size
    trim(S);
    ctx.newCrowd = newCrowd;
    return ctx;
  };

  E.POST_CAP = 1600;
  E.POST_KEEP = 1300;
  function trim(S) {
    if (S.postOrder.length <= E.POST_CAP) return;
    const kill = new Set();
    const cut = S.postOrder.length - E.POST_KEEP;
    for (let i = 0; i < cut; i++) {
      const p = S.posts[S.postOrder[i]];
      if (p && p.author !== 'me' && !(S.npcs[p.author] && S.npcs[p.author].userAlt)) kill.add(p.id);
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of S.postOrder) {
        const p = S.posts[id];
        if (p && !kill.has(id) && p.replyTo && kill.has(p.replyTo)) {
          kill.add(id);
          grew = true;
        }
      }
    }
    kill.forEach((id) => delete S.posts[id]);
    S.postOrder = S.postOrder.filter((id) => !kill.has(id));
    S.notifs = S.notifs.filter((n) => !n.postId || S.posts[n.postId]);
  }

  E.trim = trim; // the living world calls this every game hour so it can never grow without bound

  /* ---------- running turns ---------- */

  // Runs one AI-driven turn exclusively. Keeps a snapshot so the turn can be undone / re-rolled.
  async function guarded(label, fn, redo) {
    if (G.busy) {
      G.UI.toast('Hold on — the world is still reacting…', 'info');
      return null;
    }
    G.busy = true;
    G.UI.setBusy(label);
    const snap = G.S ? JSON.stringify(G.S) : null;
    let ok = false;
    try {
      const r = await fn();
      ok = true;
      return r;
    } catch (e) {
      // a failed turn must leave the world exactly as it was (clock, heat, optimistic posts, ...)
      if (snap) G.S = JSON.parse(snap);
      throw e;
    } finally {
      if (ok && snap) E.pushUndo({ snap, redo, label });
      G.busy = false;
      G.UI.setBusy(false);
      if (G.S) {
        try {
          E.checkAch && E.checkAch();
        } catch (e) {
          console.error(e);
        }
      }
      G.UI.render(); // the screen first ...
      if (G.S) (G.Store.saveAfter || G.Store.save)(); // ... then the save, in an idle moment (it used to block the redraw: a whole-world JSON.stringify)
      if (ok && G.Memory) G.Memory.maybe();
    }
  }
  E.guarded = guarded;
  E.undoStack = [];
  // The undo history is capped by count AND by total size (every step is the whole world as text: 12 big worlds would be tens of MB on a phone).
  E.UNDO_MAX = 12;
  E.UNDO_CHARS = 14e6; // all snapshots together; the newest step is always kept
  E.pushUndo = function (entry) {
    const st = E.undoStack;
    st.push(entry);
    let total = 0;
    for (let i = 0; i < st.length; i++) total += st[i].snap ? st[i].snap.length : 0;
    while (st.length > 1 && (st.length > E.UNDO_MAX || total > E.UNDO_CHARS)) total -= (st.shift().snap || '').length;
  };
  // go back to just before step i of the history (everything after it is undone)
  E.rollbackTo = function (i) {
    if (G.busy) return null;
    const u = E.undoStack[i];
    if (!u) return null;
    G.S = JSON.parse(u.snap);
    E.undoStack.length = i;
    G.Store.save();
    G.UI.toast('↩ Rolled back to before: ' + (u.what || u.label), 'info');
    G.UI.render();
    return u;
  };

  E.undo = function () {
    if (G.busy) return;
    const u = E.undoStack.pop();
    if (!u) return G.UI.toast('Nothing to undo.', 'info');
    G.S = JSON.parse(u.snap);
    G.Store.save();
    G.UI.toast('↩ Turn undone', 'info');
    G.UI.render();
    return u;
  };
  E.retry = function () {
    const u = E.undo();
    if (u && u.redo) return u.redo();
  };

  function placeContent(spec, text) {
    const S = G.S;
    if (spec.mode === 'dm') {
      const dm = { id: U.uid('m'), from: 'me', text: text.slice(0, 500), t: S.clock, read: true };
      (S.dms[spec.npcId] = S.dms[spec.npcId] || []).push(dm);
      return { dm, npcId: spec.npcId };
    }
    const x = spec.extra || {};
    const account = E.altOf(spec.accountId);
    const post = E.addPost({
      author: account ? account.id : 'me', text, replyTo: spec.replyTo || null, quote: spec.quote || null,
      pending: true, tone: spec.tone || '', audience: x.audience === 'close' ? 'close' : '', stats: { likes: 0, reposts: 0, replies: 0, views: 0 },
      ptype: x.type && x.type !== 'text' ? x.type : '', attach: x.attach || '', poll: x.poll ? E.makePoll(x.poll, account ? account.followers : S.player.followers) : null,
    });
    return { post };
  }
  function unplace(placed, spec) {
    const S = G.S;
    if (placed.post) {
      delete S.posts[placed.post.id];
      S.postOrder = S.postOrder.filter((i) => i !== placed.post.id);
      S.counters.post--;
      S.player.posts = Math.max(0, S.player.posts);
    }
    if (placed.dm) {
      const arr = S.dms[spec.npcId] || [];
      const i = arr.indexOf(placed.dm);
      if (i >= 0) arr.splice(i, 1);
    }
  }

  const GUIDE_PUBLIC = (c, pid) =>
    `Respond with: "judge" (rate the player's content honestly — bland=low, clever/funny/bold=high; virality reflects shareability); about ${c.named} replies from NAMED cast who would plausibly see this (set replyTo "${pid}"; anyone directly addressed or mentioned MUST react in character); about ${c.crowd} crowd replies (replyTo "${pid}", mix of fans/haters/trolls/simps matching the audience mood and the post); optionally 0-2 extra named posts elsewhere (subtweets, quote-posts, gossip); DMs if someone would slide in; "rel" updates for every named character whose feelings changed; storylines/trending/new_npcs/event only when the situation calls for it; "stats" gains; "chronicle".`;
  const GUIDE_DM = (n) =>
    `Respond with: ${n.name}'s direct reply to the player's latest message as "dms" (1-3 short messages, the first one answers what the player just said; fully in character — warm, flirty, cold, hurt, angry, or no dms at all to leave the player on read); "rel" update for ${n.id} (and anyone else affected); optional "npc_rel" or "storylines" if this would spread; "chronicle". No crowd needed.`;

  /* ---------- the free brain as a floor under the AI's words ---------- */
  // The model supplies the words; what the player said still has consequences. G.Dialogue classifies the message and
  // plans the free reply; here only its effects are used (an insult hurts and leaves a grudge, an apology repairs, a compliment warms).
  const FLOOR_ACTS = ['insult', 'apology', 'compliment'];
  const ACK_INSULT = /\b(ouch|hurt|hurts|hurting|rude|wow|really|seriously|excuse me|uncalled|not okay|not ok|that'?s (mean|harsh|not|low|a lot|unfair|messed|cold|cruel)|why (would|are|did|do) you|don'?t (talk|speak|say|call|ever)|stop|bye|whatever|i'?m done|done with|upset|sad|offend|mean|apolog|sorry|shut|block|leave me|go away|pathetic|bold|screw|jerk|ugh|talk to me|respect|boundar|attitude|tone|problem|out of line|enough|ok then|okay then|fine\.|hateful|nasty|ridiculous|how dare)\b/i;
  const ACK_CARE = /\b(sorry|here for you|i'?m here|im here|hug|that sucks|how are you|are you (ok|okay|alright)|is (she|he|it|everything)|hope|thinking of you|what happened|tell me|talk to me|call me|oh no|oh god|so hard|awful|terrible|rough|scary|worried|take care|breathe|with you|need anything|proud of you|so sorry)\b/i;
  E.dmPlan = function (n, dm) {
    const S = G.S;
    try {
      const D = G.Dialogue;
      if (!D || !D.plan || !n || n.userAlt || !dm || !G.React || S.activeAlt) return null;
      const rel = G.React.relation(S, n, 'me');
      return D.plan(n, dm.text, { S, now: S.clock, rnd: G.World && G.World.rnd ? G.World.rnd : undefined, rel, thread: (S.dms[n.id] || []).filter((m) => m !== dm).slice(-6), msgId: dm.id });
    } catch (e) { return null; }
  };
  E.dmSnap = (n) => ({ aff: n.aff, trust: n.trust, riv: n.riv, grudge: (G.Persona.ensure(n).grudges && G.Persona.ensure(n).grudges.me) || 0 });
  // 'does not acknowledge' rule: an AI reply that carries on as if an insult or heavy news never happened is replaced by the free brain's line
  // (or dropped = left on read when the free brain would say nothing). Returns a note for ctx.dropped, or ''.
  E.dmAck = function (n, res, plan, text) {
    if (!res || !Array.isArray(res.dms)) return '';
    // a message the character already sent in this chat is not sent again word for word
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const sent = new Set((G.S.dms[n.id] || []).filter((m) => m.from === n.id).slice(-8).map((m) => norm(m.text)));
    res.dms = res.dms.filter((d) => !(d && d.from === n.id && typeof d.text === 'string' && sent.has(norm(d.text))));
    if (!plan) return '';
    const mine = res.dms.filter((d) => d && d.from === n.id && typeof d.text === 'string' && d.text.trim());
    if (!mine.length) return '';
    const joined = mine.map((d) => d.text).join(' ');
    let why = '';
    if (plan.act === 'insult' && !ACK_INSULT.test(joined)) why = 'ignored an insult';
    else if (plan.acts && plan.acts.includes('share_bad') && G.Mind && G.Mind.read(text).sens >= 0.6 && !G.Mind.supportive(joined) && !ACK_CARE.test(joined)) why = 'ignored heavy news';
    if (!why) return '';
    res.dms = res.dms.filter((d) => !mine.includes(d));
    if (plan.text) res.dms.unshift({ from: n.id, text: plan.text });
    return n.name + ': ' + why + (plan.text ? ' (replaced by a fitting line)' : ' (left on read)');
  };
  E.dmFloor = function (n, plan, snap) {
    const e = plan && plan.effects;
    if (!e || !snap || !FLOOR_ACTS.includes(plan.act)) return false;
    const p = G.Persona.ensure(n);
    ['aff', 'trust', 'riv'].forEach((k) => {
      const want = e[k] || 0;
      if (!want) return;
      const got = n[k] - snap[k];
      const extra = want < 0 ? Math.min(0, want - got) : Math.max(0, want - got);
      if (extra) n[k] = clamp(n[k] + extra, k === 'aff' ? -100 : 0, 100);
    });
    if (e.grudge) {
      const cur = p.grudges.me || 0;
      const goal = clamp(snap.grudge + e.grudge, 0, 1);
      const g = e.grudge > 0 ? Math.max(cur, goal) : Math.min(cur, goal);
      if (g > 0.03) p.grudges.me = g; else delete p.grudges.me;
    }
    if (e.mood && G.Persona.nudge) G.Persona.nudge(n, e.mood);
    if (plan.memory && G.Mem) G.Mem.add(n, { kind: plan.memory.kind, text: plan.memory.text, who: ['me'], valence: plan.memory.valence, imp: plan.memory.imp });
    return true;
  };

  // Recent private chat with one character (plus a summary of older messages), oldest -> newest.
  E.dmHistory = function (npcId, n = 14, exclude) {
    const S = G.S;
    const msgs = (S.dms[npcId] || []).filter((m) => m !== exclude).slice(-n);
    const sum = S.dmSum[npcId];
    if (!msgs.length && !sum) return '';
    const name = (S.npcs[npcId] || {}).name || npcId;
    return `PRIVATE CHAT WITH ${npcId} (${name})${sum ? '\nEarlier (summary): ' + sum : ''}${msgs.length ? '\nRecent messages:\n' + msgs.map((m) => `${m.from === 'me' ? 'PLAYER' : name}: ${m.text}`).join('\n') : ''}`;
  };

  // No AI configured (or it is down)? The free built-in simulation still answers: judge, reactions, DM replies.
  function localSpeak(spec) {
    const S = G.S;
    if (!spec.text) {
      G.UI.toast('Write it yourself — or connect an AI (a free local model works) so it can write for you.', 'info');
      throw Object.assign(new Error('needs text'), { restore: null });
    }
    const placed = placeContent(spec, spec.text);
    const W = G.World;
    W.ensure(S);
    E.tick(U.rand(3, 14) + (spec.minutes || 0));
    if (spec.mode === 'dm') {
      const n = S.npcs[spec.npcId];
      if (n) {
        W.onPlayerDm(n, placed.dm, spec.text);
        n.touched = S.clock;
      }
      if (E.applyLocalStats) E.applyLocalStats(null, spec.text); // what you say to people shapes who you are (a few points a day)
      S.turns++;
      return { placed, ctx: {}, cost: 0, res: {}, offline: true };
    }
    placed.post.stance = W.inferStance(spec.text);
    const judge = W.localJudge(spec.text, spec.extra);
    const live = spec.tone === 'live' && E.localLive ? E.localLive(judge, spec) : null; // no AI: the stream recap is built here (chat, donations, a moment)
    const ctx = E.apply({ judge, live, stats: spec.accountId || !E.applyLocalStats ? null : E.applyLocalStats(judge, spec.text, placed.post.replyTo) }, { placed, targetPostId: placed.post.id, judge: true, accountId: spec.accountId });
    W.firstWave(placed.post);
    E.tagReact(placed.post);
    const target = spec.replyTo && S.posts[spec.replyTo];
    if (target && S.npcs[target.author]) W.schedule(S.clock + 4 + Math.floor(W.rnd() * 50), { type: 'respond', npc: target.author, comment: placed.post.id });
    S.turns++;
    return { placed, ctx, cost: 0, res: live ? { judge, live } : { judge }, offline: true };
  }

  // spec: {mode:'post'|'reply'|'dm', text|null, replyTo, quote, npcId, tone, instruction, label, writeFor}
  E.speak = async function (spec) {
    return guarded(spec.label || 'The world is reacting…', async () => {
      if (!AI.ready()) return localSpeak(spec);
      const S = G.S;
      const c = AI.counts();
      const pid = 'p' + S.counters.post;
      let placed = null;
      if (spec.text) placed = placeContent(spec, spec.text);
      E.tick(U.rand(3, 14) + (spec.minutes || 0));
      if (placed) G.UI.render();

      const target = spec.replyTo && S.posts[spec.replyTo];
      const focus = new Set(spec.focus || []);
      if (spec.npcId) focus.add(spec.npcId);
      if (target && target.author !== 'me' && target.author !== 'crowd') focus.add(target.author);
      // anyone @mentioned
      Object.values(S.npcs).forEach((n) => {
        if (spec.text && spec.text.toLowerCase().includes(n.handle)) focus.add(n.id);
      });

      let head;
      if (spec.mode === 'dm') {
        const n = S.npcs[spec.npcId];
        head = `PLAYER ACTION: the player sends a PRIVATE DM to ${n.id} (${n.name} ${n.handle}): ${spec.text ? '"""' + spec.text + '"""' : '(player gave no text — write it, see below)'}`;
      } else if (spec.mode === 'reply') {
        const alt = spec.accountId && S.npcs[spec.accountId];
        head = alt ? `USER-CONTROLLED ACCOUNT ACTION: ${alt.name} (${alt.handle}) publicly replies (new post id ${pid}) to post ${spec.replyTo} by ${AI.authorLabel(target)}: """${spec.text}""". The user controls this fictional account; do not invent its words or actions.` : `PLAYER ACTION: the player publicly replies (new post id ${pid}) to post ${spec.replyTo} by ${AI.authorLabel(target)}: ${spec.text ? '"""' + spec.text + '"""' : '(player gave no text — write it)'}`;
      } else {
        const alt = spec.accountId && S.npcs[spec.accountId];
        head = alt ? `USER-CONTROLLED ACCOUNT ACTION: ${alt.name} (${alt.handle}) publishes a fictional in-world post (id ${pid})${spec.tone ? ' in a ' + spec.tone + ' tone' : ''}: """${spec.text}""". The user controls this account; never write posts or actions for it.` : `PLAYER ACTION: the player publishes a new post (id ${pid})${spec.tone ? ' in a ' + spec.tone + ' tone' : ''}${spec.quote ? ', quote-posting ' + spec.quote : ''}: ${spec.text ? '"""' + spec.text + '"""' : '(player gave no text — write it, see below)'}`;
      }
      const isDm = spec.mode === 'dm';
      const parts = [isDm ? AI.SCHEMA_DM : AI.SCHEMA, '', AI.context(isDm ? { focus: [...focus], feedN: 4, scan: spec.text || '' } : { focus: [...focus], threadOf: spec.replyTo || null, scan: spec.text || '' })];
      if (isDm) {
        const hist = E.dmHistory(spec.npcId, 14, placed && placed.dm);
        if (hist) parts.push(hist);
        const rc = AI.dmRecall(S.npcs[spec.npcId], spec.text || '');
        if (rc) parts.push(rc);
      }
      parts.push('', head);
      const x = spec.extra || {};
      if (spec.mode !== 'dm' && x.type && x.type !== 'text')
        parts.push(`POST TYPE: ${x.type}${x.attach ? ` — the attached ${x.type === 'video' ? 'video' : 'photo'} shows: ${x.attach}` : ''}${x.poll ? ` — it is a POLL with options: ${x.poll.join(' / ')}` : ''}. React to the format as well as the words.`);
      if (spec.instruction) parts.push('INTENT: ' + spec.instruction);
      const spice = G.Scen && !spec.noSpice ? G.Scen.spice(S, spec.mode === 'dm' ? 'dm' : 'public') : '';
      if (spice) parts.push('WILDCARD (weave this in naturally on top of the player action if it fits; do not announce it as a wildcard): ' + spice);
      if (!spec.text)
        parts.push(`The player did not write the text. Write it yourself as "player_text" (in the player's voice, matching the intent, max 280 chars) and treat it as what was posted/sent.`);
      parts.push(spec.mode === 'dm' ? GUIDE_DM(S.npcs[spec.npcId]) : GUIDE_PUBLIC(c, pid));
      parts.push('Answer with ONLY the JSON object described by the schema at the top of this message.');

      let out;
      try {
        out = await AI.json({ task: 'turn', user: parts.join('\n'), maxTokens: spec.mode === 'dm' ? 1400 : 3200 });
      } catch (e) {
        if (placed) unplace(placed, spec);
        G.UI.toast(e.message, 'bad');
        throw Object.assign(e, { restore: spec.text });
      }
      const res = out.data;
      if (!placed) {
        const text = String(res.player_text || spec.fallbackText || '…').slice(0, 500);
        placed = placeContent(spec, text);
      }
      // a DM to a character: the free brain reads what the player said (insult, apology, ...) and its effects are a floor under the AI's words
      const dmNpc = spec.mode === 'dm' && !spec.accountId ? S.npcs[spec.npcId] : null;
      const dmPlan = dmNpc ? E.dmPlan(dmNpc, placed.dm) : null;
      const dmSnap = dmPlan ? E.dmSnap(dmNpc) : null;
      const ackNote = dmNpc ? E.dmAck(dmNpc, res, dmPlan, placed.dm.text) : '';
      const ctx = E.apply(res, {
        placed,
        accountId: spec.accountId,
        targetPostId: spec.mode === 'dm' ? null : placed.post && placed.post.id,
        judge: spec.mode !== 'dm',
      });
      if (ackNote) (ctx.dropped = ctx.dropped || []).push(ackNote);
      if (dmPlan) E.dmFloor(dmNpc, dmPlan, dmSnap);
      if (spec.mode === 'dm') {
        const n = S.npcs[spec.npcId];
        if (n) {
          // the direct reply sits right under the player's message, ahead of anything that arrived on its own while time passed
          const arr = S.dms[n.id] || [];
          const at = arr.indexOf(placed.dm);
          const replies = arr.filter((m) => m.replyTo === placed.dm.id && m.from === n.id);
          if (at >= 0 && replies.length) {
            replies.forEach((m) => arr.splice(arr.indexOf(m), 1));
            arr.splice(arr.indexOf(placed.dm) + 1, 0, ...replies);
          }
          n.touched = S.clock;
          if (G.World) G.World.onPlayerDm(n, placed.dm, placed.dm.text, { reply: false });
          if (!ctx.newDms) G.UI.toast(`${n.name} left you on read 👀`, 'info');
        }
      } else if (G.World && placed.post) {
        placed.post.stance = G.World.inferStance(placed.post.text);
        G.World.firstWave(placed.post); // more people notice over the next hours
        E.tagReact(placed.post); // and everyone tagged with @ notices it
      }
      S.turns++;
      return { placed, ctx, cost: out.cost, res };
    }, () => E.speak(spec)).catch((e) => {
      if (e && e.restore !== undefined) return null; // already toasted; caller restores its draft
      throw e;
    });
  };

  E.post = (text, tone, quote, extra, accountId) => E.speak({ mode: 'post', text, tone, quote: quote || null, extra: extra || null, accountId: accountId || null, label: 'Posting…' });
  E.reply = (postId, text, accountId) => E.speak({ mode: 'reply', text, replyTo: postId, accountId: accountId || null, label: 'Replying…' });
  E.dm = (npcId, text) => E.speak({ mode: 'dm', text, npcId, label: 'Sending…' });

  /* ---------- burner accounts: chats are separate threads and the character does not know who is behind the account ---------- */

  // an account the player may act as: their own burner accounts, and (admin mode) any character in the world
  E.altOf = (id) => {
    const S = G.S;
    const n = id && S && S.npcs[id];
    return n && (n.userAlt || ((S.admin || E.directing) && !n.blocked)) ? n : null; // E.directing: a Storyteller directive is running
  };
  E.directing = false;
  E.activeAlt = () => (G.S ? E.altOf(G.S.activeAlt) : null);
  E.altThread = (altId, npcId) => {
    const S = G.S;
    S.altDms = S.altDms || {};
    const byAlt = (S.altDms[altId] = S.altDms[altId] || {});
    return (byAlt[npcId] = byAlt[npcId] || []);
  };
  E.altDm = async function (altId, npcId, text) {
    const S = G.S;
    const alt = E.altOf(altId);
    const n = S.npcs[npcId];
    text = String(text || '').trim().slice(0, 500);
    if (!alt || !n || n.userAlt || n.id === alt.id || !text) return null;
    return guarded('Sending…', async () => {
      const th = E.altThread(altId, npcId);
      const dm = { id: U.uid('m'), from: 'me', as: altId, text, t: S.clock, read: true };
      th.push(dm);
      if (th.length > 120) th.shift();
      E.tick(U.rand(1, 6));
      const local = () => G.World.onPlayerDm(n, dm, text, { alt: altId });
      if (!AI.ready()) {
        local(); // the free built-in simulation answers
        S.turns++;
        return { dm, offline: true };
      }
      G.World.onPlayerDm(n, dm, text, { alt: altId, reply: false }); // only marks it seen
      try {
        const hist = th.slice(-15, -1).map((m) => `${m.from === 'me' ? alt.name : n.name}: ${m.text}`).join('\n');
        const out = await AI.json({
          task: 'turn',
          maxTokens: 700,
          user: [
            AI.context({ focus: alt.userAlt ? [npcId] : [npcId, alt.id], scan: text }),
            hist ? 'PRIVATE CHAT SO FAR:\n' + hist : '',
            alt.userAlt
              ? `ANONYMOUS-ACCOUNT ACTION: the account ${alt.name} (${alt.handle}) sends ${n.name} (${n.id}) a PRIVATE DM: """${text}""". ${n.name} does NOT know the human player is behind this account unless the message gives it away; treat it as a separate person ${n.name} has no history with.`
              : `CHARACTER-TO-CHARACTER DM (the story owner is steering ${alt.name}): ${alt.name} (${alt.id}, ${alt.handle}) sends ${n.name} (${n.id}) a PRIVATE DM: """${text}""". ${n.name} knows ${alt.name} and answers in character using their established relationship (see CAST RELATIONS) and memories.`,
            `Respond ONLY with {"dms":[{"from":"${n.id}","text":""}]}: 0-2 short messages fully in character (return none to leave it on read). Do not change any relationship numbers and never write anything for ${alt.name}.`,
          ].filter(Boolean).join('\n'),
        });
        const got = (Array.isArray(out.data && out.data.dms) ? out.data.dms : []).filter((d) => d && typeof d.text === 'string' && d.text.trim() && E.findNpc(d.from) === n).slice(0, 2); // only lines that really come from this character
        got.forEach((d, i) => {
          th.push({ id: U.uid('m'), from: n.id, to: altId, text: d.text.trim().slice(0, 1200), t: S.clock + i, read: false });
          if (th.length > 120) th.shift();
        });
        if (got.length) {
          n.touched = S.clock;
          addNotif('dm', `${n.name} replied to ${alt.name}`, { npcId: n.id, alt: altId });
        } else G.UI.toast(`${n.name} left ${alt.name} on read 👀`, 'info');
      } catch (e) {
        G.UI.toast(e.message || 'The AI did not answer — the built-in simulation replies instead.', 'info');
        local();
      }
      S.turns++;
      return { dm };
    }, () => E.altDm(altId, npcId, text));
  };

  // @tagging: everyone tagged in a post or reply notices it soon (the AI path already focuses on them; this also covers the free simulation)
  E.tagReact = function (post) {
    const S = G.S;
    if (!post || !G.World || !post.text) return 0;
    const tags = String(post.text).toLowerCase().match(/@[a-z0-9_.]{2,30}/g) || [];
    let n = 0;
    new Set(tags).forEach((h) => {
      const npc = Object.values(S.npcs).find((x) => x.handle === h && !x.blocked && !x.userAlt && x.id !== post.author);
      if (!npc) return;
      G.World.schedule(S.clock + 3 + Math.floor(G.World.rnd() * 25), { type: 'react', npc: npc.id, post: post.id });
      n++;
    });
    return n;
  };

  /* relationship actions (profile buttons) */
  const ACTIONS = {
    flirt: { icon: '😏', label: 'Flirt', mode: 'dm', love: true, intent: 'Flirt with them. React according to their feelings, personality and the relationship so far.' },
    confess: { icon: '💌', label: 'Confess feelings', mode: 'dm', love: true, intent: 'Confess real romantic feelings. It is a big moment — they may accept, reject, panic or surprise the player.' },
    askout: { icon: '💍', label: 'Ask them out', mode: 'dm', love: true, intent: 'Ask them to be in an official relationship (dating). Accept ONLY if romance, affinity and trust are high enough; otherwise let them down in character. If accepted set status "dating".' },
    breakup: { icon: '💔', label: 'Break up', mode: 'dm', intent: 'Break up with them. Show their emotional reaction; they may become an ex, bitter, or start drama.' },
    friend: { icon: '🤝', label: 'Be besties', mode: 'dm', intent: 'Propose a real friendship/alliance. Warm, sincere. Respond according to trust and affinity.' },
    apologize: { icon: '🙏', label: 'Apologize', mode: 'dm', intent: 'Sincerely apologize for something that went wrong between them. They may forgive, partially forgive or reject it.' },
    gossip: { icon: '🫢', label: 'Spill gossip to them', mode: 'dm', intent: 'Share juicy gossip about another cast member with them (pick someone plausible). This may spread.' },
    dig: { icon: '🕵️', label: 'Dig for secrets', mode: 'dm', intent: 'Try to get them to reveal their hidden secret through clever conversation. Only reveal (rel.reveal_secret=true and let them say it) if trust/affinity or the approach justify it; otherwise deflect and grow suspicious.' },
    hype: { icon: '🎉', label: 'Hype them publicly', mode: 'post', intent: 'Publicly hype, praise or support them in a post that tags their handle. Make it sound genuine and fun.' },
    subtweet: { icon: '🐍', label: 'Subtweet them', mode: 'post', intent: 'Post a shady subtweet about them WITHOUT naming them — everyone should be able to guess. Passive-aggressive.' },
    callout: { icon: '📢', label: 'Call them out', mode: 'post', intent: 'Publicly call them out by tagging their handle. Confrontational. This starts beef; the crowd picks sides.' },
    roast: { icon: '🔥', label: 'Roast them', mode: 'post', intent: 'Publicly roast them by tagging their handle — witty, savage, funny. The crowd will react to how good the roast is.' },
    expose: { icon: '💣', label: 'Expose their secret', mode: 'post', intent: 'Publicly expose the secret you learned about them. Massive scandal: the crowd explodes, relationships shatter. Reference the secret explicitly.' },
    collab: { icon: '🎬', label: 'Propose a collab', mode: 'post', intent: 'Publicly invite them to collaborate / do a challenge together. Tag their handle.' },
    jealous: { icon: '😏', label: 'Make them jealous', mode: 'post', love: true, intent: 'Publicly flirt or post about someone else to make them jealous. They notice.' },
  };
  E.ACTIONS = ACTIONS;

  E.doAction = function (npcId, key, text) {
    const n = G.S.npcs[npcId];
    const a = ACTIONS[key];
    if (!n || !a) return;
    if (E.isFamily(n) && a.love) return G.UI.toast(`${n.name} is your ${n.status} — romantic actions are not available for family.`, 'info');
    const intent = `Toward ${n.id} (${n.name} ${n.handle}): ${a.intent}`;
    return E.speak({
      mode: a.mode, npcId, text: (text || '').trim() || null, instruction: intent, focus: [npcId],
      label: a.icon + ' ' + a.label + '…',
      tone: a.mode === 'post' ? a.label.toLowerCase() : '',
      fallbackText: n.handle + ' …',
    });
  };

  /* time passes / director / events */
  E.advance = async function (kind, note) {
    const spans = {
      refresh: { m: 45, label: 'Refreshing the world…', n: 5, tok: 3200, txt: 'about 45 minutes pass' },
      hours: { m: 360, label: 'Hours pass…', n: 8, tok: 3800, txt: 'about 6 hours pass' },
      day: { m: 1440, label: 'A day goes by…', n: 11, tok: 4500, txt: 'a whole day passes' },
      week: { m: 10080, label: 'A week goes by…', n: 16, tok: 6000, txt: 'a whole week passes; big developments, relationships may form or collapse, storylines resolve and new ones erupt' },
    };
    const sp = spans[kind] || spans.refresh;
    return guarded(sp.label, async () => {
      const S = G.S;
      const c = AI.counts();
      E.tick(sp.m);
      if (!AI.ready()) {
        S.turns++;
        G.UI.toast('Time passed — the built-in simulation moved the world on (connect an AI for richer drama).', 'info');
        return;
      }
      const mine = S.postOrder.filter((id) => S.posts[id].author === 'me').slice(-3);
      const wild = G.Scen && !note ? G.Scen.spice(S, 'time') : '';
      const prompt = [
        AI.context({ full: false, feedN: 12, simulation: true }),
        '',
        `TIME PASSES: ${sp.txt} (now ${U.clockStr(S.clock)}). Simulate what happens on the platform while the player is away/scrolling.`,
        note ? 'DIRECTION: ' + note : '',
        wild ? 'WILDCARD (weave in naturally, do not announce): ' + wild : '',
        `Do NOT create standalone NPC posts, quotes, NPC stories, or put words/actions in the player's mouth. The player has not directed any posts during this time skip. Choose among zero, one, or a few plausible named replies/comments on existing posts, likes, follows, DMs, rumor changes, and realistic off-feed developments; never fill a quota with reactions. No NPC may comment more than once in this time-skip result. Every named reply must target a post that appears under that NPC's own exposure in the AWARENESS/RECENT POSTS map; Clout also validates this. Use only that character's memories, participating DMs, direct observations, and personally heard rumors. When information is incomplete, make them curious or uncertain instead of treating rumors as fact. Add ${Math.round(c.crowd / 2)} crowd replies to the player's recent posts (${mine.join(', ') || 'none yet'}) or relevant public threads. 0-3 DMs to the player only from characters with a real motive and relevant knowledge. Progress storylines only through plausible observed events and private exchanges; update "npc_rel" and "rel" when relationships change; add an "event" only if it requires the player's decision. Always include "trending" and "chronicle".`,
        AI.SCHEMA,
      ].join('\n');
      const out = await AI.json({ task: 'tick', user: prompt, maxTokens: sp.tok }).catch((e) => {
        G.UI.toast(e.message, 'bad');
        throw e;
      });
      // time passed already; decay of fans/followers over long skips is small
      E.apply(out.data, { judge: false, source: 'simulation' });
      S.turns++;
    }, () => E.advance(kind, note)).catch(() => null);
  };

  E.director = (text) =>
    E.advance('refresh', `DIRECTOR COMMAND from the game's omnipotent author — make this happen in the world right now, realistically woven in, with the cast and crowd reacting: "${text}". You may create, change or reveal anything (relationships, secrets, scandals, characters).`);

  // turn an event down: it is dismissed, nothing happens, no AI call
  E.declineEvent = function (evId) {
    const S = G.S;
    const ev = S.events.find((e) => e.id === evId);
    if (!ev || ev.resolved) return false;
    ev.resolved = true;
    ev.declined = true;
    addChron('You turned down: ' + ev.title);
    G.Store.saveSoon();
    return true;
  };
  E.chooseEvent = async function (evId, idx) {
    const S = G.S;
    const ev = S.events.find((e) => e.id === evId);
    if (!ev || ev.resolved) return;
    const choice = idx >= 0 ? ev.options[idx] : 'Let it play out on its own: the player does nothing and lets things unfold'; // idx -1 = "let it play out"
    ev.resolved = true;
    ev.choice = choice;
    return guarded('Consequences loading…', async () => {
      E.tick(U.rand(10, 40));
      const prompt = [
        AI.context({ full: true }),
        '',
        `EVENT: "${ev.title}" — ${ev.text}`,
        `The player chose: "${choice}". Resolve the consequences: how the cast and crowd react (named posts, crowd replies to relevant posts, DMs), "rel" changes, storylines, "stats" gains, "xp" bonus (5-25), "chronicle". Be dramatic; choices matter.`,
        AI.SCHEMA,
      ].join('\n');
      const out = await AI.json({ task: 'event', user: prompt, maxTokens: 3200 }).catch((e) => {
        ev.resolved = false;
        delete ev.choice;
        G.UI.toast(e.message, 'bad');
        throw e;
      });
      E.apply(out.data, { judge: false });
      S.turns++;
    }, () => E.chooseEvent(evId, idx)).catch(() => null);
  };

  E.moreReplies =async function (postId) {
    return guarded('Loading more replies…', async () => {
      const S = G.S;
      const post = S.posts[postId];
      if (!post) return;
      const c = AI.counts();
      const prompt = [
        AI.context({ threadOf: postId, feedN: 3, full: false, focus: post.author in S.npcs ? [post.author] : [] }),
        '',
        `The post ${postId} by ${AI.authorLabel(post)} is getting more replies. Generate ${c.crowd + 4} NEW crowd replies (replyTo "${postId}") with varied stances, jokes, arguments between commenters, and ${Math.max(1, Math.round(c.named / 2))} replies from named cast if any would chime in. Do not repeat existing replies.${post.author === 'me' ? ` Audience mood: ${Math.round(S.player.audience.love)}% love / ${Math.round(S.player.audience.hate)}% hate.` : ''} Only "crowd" and "posts" needed.`,
        AI.SCHEMA,
      ].join('\n');
      const out = await AI.json({ task: 'crowd', user: prompt, maxTokens: 2200 }).catch((e) => {
        G.UI.toast(e.message, 'bad');
        throw e;
      });
      E.apply(out.data, { targetPostId: postId, judge: false });
    }, () => E.moreReplies(postId)).catch(() => null);
  };

  E.suggest = async function ({ intent, replyTo, npcId }) {
    if (!G.AI.ready()) throw new Error(G.AI.notReadyMsg());
    const S = G.S;
    const target = replyTo && S.posts[replyTo];
    const prompt = [
      AI.context({ focus: npcId ? [npcId] : [], threadOf: replyTo || null, feedN: 6, full: false }),
      '',
      target
        ? `The player wants to reply to post ${replyTo} by ${AI.authorLabel(target)}.`
        : npcId
        ? `The player wants to message/talk about ${npcId}.`
        : 'The player wants to write a new post.',
      intent ? `Their rough idea: "${intent}"` : 'They have no idea yet — pitch things that fit the current drama, mood and the player\'s personality.',
      `Write 4 DIFFERENT ready-to-post options (max 240 chars each), each with a clearly different tone chosen from: funny, wholesome, spicy, savage, flirty, vulnerable, chaotic, mysterious, hype. Make them sound like real posts, with emoji/hashtags where natural. Return {"options":[{"tone":"","text":""}]}`,
    ].join('\n');
    const out = await AI.json({ task: 'idea', user: prompt, maxTokens: 900, temperature: 1 });
    return (out.data.options || []).filter((o) => o && o.text).slice(0, 5);
  };

  /* ---------- cheap local interactions ---------- */

  E.toggleLike = function (postId, altId) {
    const S = G.S;
    const p = S.posts[postId];
    if (!p) return;
    const alt = E.altOf(altId);
    if (alt) {
      // a burner account likes it: shows up as one of the likers, changes nobody's feelings about the player
      const list = (p.likedBy = p.likedBy || []);
      const i = list.indexOf(alt.id);
      if (i >= 0) list.splice(i, 1);
      else list.push(alt.id);
      p.stats.likes = Math.max(0, p.stats.likes + (i >= 0 ? -1 : 1));
      G.Store.saveSoon();
      return;
    }
    p.liked = !p.liked;
    p.stats.likes += p.liked ? 1 : -1;
    const n = S.npcs[p.author];
    if (n && p.liked) {
      n.aff = clamp(n.aff + 1, -100, 100);
      n.touched = S.clock;
    }
    G.Store.saveSoon();
  };

  // the player's own 24-hour story (free, no AI call: people in the world watch and react as time passes)
  E.postStory = function (text, emoji, accountId, audience) {
    const S = G.S;
    const account = E.altOf(accountId);
    text = String(text || '').trim().slice(0, 140);
    if (!text || !S) return null;
    const an = G.Lex.analyze(text);
    const sc = G.Lex.sceneFor(an.topics.length ? an.topics : ['default'], text);
    if (emoji && typeof emoji === 'string') sc.emoji = emoji.slice(0, 8);
    S.stories = S.stories || [];
    const st = { id: 'st' + (S.counters.story_n = (S.counters.story_n || 1) + 1), author: account ? account.id : 'me', t: S.clock, exp: S.clock + 1440, kind: 'player', text, scene: sc, poll: null, views: [], seen: true, rx: {}, audience: audience === 'close' ? 'close' : '' };
    S.stories.push(st);
    if (S.stories.length > 220) S.stories.splice(0, S.stories.length - 220);
    if (account) account.posts = (account.posts || 0) + 1;
    else E.giveXp(E.dailyCap('story', 6, 2)); // stories teach a little: up to 3 a day count
    G.Store.saveSoon();
    return st;
  };

  E.toggleSave = function (postId) {
    const p = G.S.posts[postId];
    if (!p) return false;
    p.saved = !p.saved;
    G.Store.saveSoon();
    return p.saved;
  };

  E.toggleFollow = function (npcId, altId) {
    const S = G.S;
    const n = S.npcs[npcId];
    if (!n) return;
    const alt = E.altOf(altId);
    if (alt) {
      if (alt.id === npcId) return;
      const f = (alt.following = alt.following || []);
      const j = f.indexOf(npcId);
      if (j >= 0) f.splice(j, 1);
      else f.push(npcId);
      G.Store.saveSoon();
      return;
    }
    const i = S.player.following.indexOf(npcId);
    if (i >= 0) S.player.following.splice(i, 1);
    else {
      S.player.following.push(npcId);
      n.aff = clamp(n.aff + 2, -100, 100);
    }
    G.Store.saveSoon();
  };

  E.toggleBlock = function (npcId, key) {
    const n = G.S.npcs[npcId];
    if (n) n[key] = !n[key];
    G.Store.saveSoon();
  };

  E.visibleNpc = (n) => n && !n.blocked;

  /* ---------- world creation ---------- */

  // "keyword, other keyword: fact" per line -> World Info entries (a line with no keywords, or * as the keyword, is always on)
  E.parseLore = (text) =>
    String(text || '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((l) => {
        const i = l.indexOf(':');
        const keys = i > 0 ? l.slice(0, i).split(',').map((k) => k.trim()).filter(Boolean) : [];
        const content = (i > 0 ? l.slice(i + 1) : l).trim().slice(0, 900);
        const constant = !keys.length || keys.includes('*');
        return { id: U.uid('lo'), source: 'wizard', keys: constant ? [] : keys, content, constant };
      })
      .filter((e) => e.content);

  E.createWorld = async function (cfg) {
    if (!G.AI.ready()) throw new Error(G.AI.notReadyMsg());
    const fame = FAME[cfg.fame] || FAME.nobody;
    let prompt = [
      'Create a brand-new CLOUT world.',
      `PREMISE: ${cfg.premise}`,
      `PLAYER: ${cfg.name} ${U.normHandle(cfg.handle || cfg.name)}; bio: ${cfg.bio || '(blank — write one)'}; traits: ${(cfg.traits || []).join(', ') || 'none'}; starts with ${fame.followers} followers.`,
      ...(cfg.castBrief ? [
        `THE OWNER'S CAST (canonical: include EVERY character listed here, keep each name, relationship and personality exactly as the owner wrote it, and invent details only where the owner is silent):\n${String(cfg.castBrief).slice(0, 4000)}`,
        cfg.exact ? 'ONLY these characters: do not invent extra named cast members. (Anonymous crowd accounts are handled elsewhere.) Ignore the role quotas in the RULES below.' : 'Add more characters around them so the world feels alive.',
      ] : []),
      ...(cfg.note ? [`AUTHOR'S NOTE (standing rules for this whole world, follow them everywhere): ${String(cfg.note).slice(0, 1200)}`] : []),
      `Return JSON:
{"world":{"name":"short title","setting":"3-4 vivid sentences about the world and what is going on","tone":"few words"},
"player_bio":"only if bio blank",
"cast":[{"ref":"c1","name":"","handle":"@h","age":18-45,"role":"main|rival|love_interest|friend|mentor|influencer|journalist|troll|wildcard|brand","bio":"<=90 chars","personality":"<=25 words: traits AND exactly how they type","emoji":"","followers":0,"secret":"","aff":0,"rom":0,"riv":0,"trust":0,"status":"stranger|acquaintance|friend|rival|crush"}],
"npc_rel":[{"a":"c1","b":"c2","type":"friend|best_friend|dating|crush|ex|rival|enemy|family|ally|frenemy|situationship","note":""}],
"storylines":[{"title":"","summary":"","heat":0-100,"participants":["c1","c2"]}],
"posts":[{"author":"c1","text":"","buzz":0-10}],
"trending":[{"tag":"#tag","heat":1-100}],
"story_people":[{"name":"","who":"one line"}],
"welcome":"2-sentence opening narration addressed to the player"}`,
      `RULES: ALL characters must be adults (age 18+; if the premise is a school/academy, they are college-age or older). ${cfg.exact && cfg.castBrief ? 'Create exactly the owner\'s characters.' : `Create ${{ small: '7-8', large: '15-18' }[cfg.size] || '12-14'} cast members.`} If the premise names a franchise/fandom/universe, use its recognisable characters (as fan-fiction parody) with their real personalities; otherwise invent a colourful cast. Include: 2 potential love interests with different vibes, a best-friend candidate, 2 rivals, a gossip/journalist, a troll, a mentor or idol, wildcards, and a couple of mega-popular accounts. Starting feelings toward the player: mostly strangers/acquaintances (aff -5..15), a few with built-in history or sparks. Give them secrets. 3-4 simmering storylines among the cast (some involve the player's arrival). 12 initial feed posts with distinct voices, cast talking to and about each other (use their handles). Followers realistic for each account (the player has ${fame.followers}).`,
    ].join('\n');

    const out = await AI.json({ task: 'world', user: prompt, maxTokens: 7000, system: AI.system() });
    const d = out.data;
    if (!d.cast || d.cast.length < (cfg.exact && cfg.castBrief ? 1 : 3)) throw new Error('The AI returned an incomplete world. Try again (or pick a stronger model).');

    const S = {
      v: 1, id: U.uid('w'), createdAt: Date.now(), savedAt: 0,
      world: {
        name: String((d.world && d.world.name) || cfg.premise.slice(0, 30)).slice(0, 50),
        setting: String((d.world && d.world.setting) || cfg.premise).slice(0, 700),
        tone: String((d.world && d.world.tone) || '').slice(0, 80),
        premise: cfg.premise,
      },
      clock: 660,
      player: newPlayer(Object.assign({}, cfg, { bio: cfg.bio || d.player_bio })),
      npcs: {}, posts: {}, postOrder: [], dms: {}, notifs: [], npcRel: [], storylines: [], trending: [],
      chronicle: [], events: [], counters: { npc: 1, post: 1, story: 1, chron: 1, group: 1, msg: 1 }, spend: out.cost || 0, turns: 0,
      groups: {}, scenes: {}, dmSum: {}, saga: '', ach: {}, lore: [],
      popSize: 250000, popSeed: Math.floor(Math.random() * 1e6) + 1, popMet: {},
    };
    E.migrate(S); // living-world fields (sim, queue, stories, rumors) from the start
    G.S = S;
    E.undoStack.length = 0;
    S.player.verified = S.player.followers >= 100000;

    const map = {};
    const castCap = 20;
    d.cast.slice(0, castCap).forEach((raw) => {
      const n = E.makeNpc(raw, S);
      map[raw.ref || n.id] = n.id;
    });
    // everyone beyond the central cast stays a story person: background the AI knows, not someone who acts in the world
    (d.npc_rel || []).forEach((r) => {
      const a = E.findNpc(r.a, map, S);
      const b = E.findNpc(r.b, map, S);
      if (a && b) upsertEdge(S, a.id, b.id, String(r.type || 'friend').toLowerCase(), r.note);
    });
    (d.storylines || []).forEach((s) => {
      if (!s || !s.title) return;
      S.storylines.push({
        id: 's' + S.counters.story++, title: String(s.title).slice(0, 80), summary: String(s.summary || '').slice(0, 260),
        heat: clamp(int(s.heat, 40), 0, 100), status: int(s.heat) >= 70 ? 'boiling' : 'active',
        participants: (s.participants || []).map((x) => E.findNpc(x, map, S)).filter(Boolean).map((n) => n.id),
        updated: S.clock, log: [],
      });
    });
    const posts = (d.posts || []).filter((p) => p && p.text);
    posts.forEach((p, i) => {
      const a = E.findNpc(p.author, map, S);
      if (!a) return;
      // Put a few real library photos into the opening feed so a fresh world feels populated.
      // The library is topic based, so these are everyday scene photos, never character portraits.
      const photo = i % 3 === 1;
      const post = E.addPost({ author: a.id, text: p.text, ptype: photo ? 'photo' : '', buzz: p.buzz, t: Math.max(1, S.clock - Math.round((posts.length - i) * rr(12, 55))), stats: npcStats(a, p.buzz) }, S);
      if (photo && G.Media && G.Media.enabled()) {
        const topics = G.Lex ? G.Lex.analyze(p.text).topics : [];
        const im = G.Media.forPost(a, { kind: 'photo', topics, attach: true, force: true }, E.rand);
        if (im) {
          post.img = im.img;
          post.imgl = im.imgl;
        }
      }
    });
    S.trending = (d.trending || []).map((t) => ({ tag: '#' + String(t.tag || '').replace(/^#+/, ''), heat: clamp(int(t.heat, 40), 1, 100) })).filter((t) => t.tag.length > 1).slice(0, 8);
    addChron(`The player (${S.player.name}) joined ${S.world.name}`);
    if (cfg.note) S.authorNote = String(cfg.note).slice(0, 1200);
    if (cfg.loreText) S.lore = (S.lore || []).concat(E.parseLore(cfg.loreText));
    if (cfg.castBrief) S.world.castBrief = String(cfg.castBrief).slice(0, 4000);
    S.welcome = String(d.welcome || '').slice(0, 400);
    if (G.World) G.World.seedStories(S); // not an empty tray on day one
    G.Store.save();
    return S;
  };

  /* ---------- empty world (no AI call): the starting point for a new game ---------- */
  E.createBlankWorld = function (cfg) {
    const S = {
      v: 1, id: U.uid('w'), createdAt: Date.now(), savedAt: 0,
      world: { name: String(cfg.worldName || 'My World').slice(0, 50), setting: String(cfg.premise || 'A small online world.').slice(0, 700), tone: 'dramatic and funny', premise: cfg.premise || '' },
      clock: 660, player: E.newPlayer(cfg), npcs: {}, posts: {}, postOrder: [], dms: {}, notifs: [], npcRel: [], storylines: [], trending: [],
      chronicle: [], events: [], counters: { npc: 1, post: 1, story: 1, chron: 1, group: 1, msg: 1 }, spend: 0, turns: 0,
      groups: {}, scenes: {}, dmSum: {}, saga: '', ach: {}, lore: [],
      popSize: 250000, popSeed: Math.floor(Math.random() * 1e6) + 1, popMet: {},
      welcome: 'Your world is empty. Ask the Director to add people, or hit Refresh and watch the town wake up.',
    };
    G.S = E.migrate(S); // gives a brand-new world the same living-world fields a reloaded one has
    E.undoStack.length = 0;
    G.Store.save();
    return G.S;
  };

  const AI = G.AI;
})(window.G);
