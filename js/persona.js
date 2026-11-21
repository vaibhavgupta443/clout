/* Clout — persona model. Every NPC gets a stable, distinct psychology:
   Big Five traits, typing style, chronotype, attachment style, interests, opinions on debates, and a living mood.
   Grounded in research: extraversion predicts posting/commenting/sharing most consistently; neuroticism = more
   venting but a smaller, more passive network; agreeableness = supportive tone and more photos (see README). */
(function (G) {
  const U = G.U;
  const Persona = (G.Persona = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // seeded PRNG from a string
  Persona.rngFrom = function (str) {
    let a = U.hash(String(str)) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // role priors: [O, C, E, A, N]
  const ROLE = {
    love_interest: [55, 50, 62, 65, 45], rival: [50, 72, 66, 28, 48], troll: [55, 28, 72, 14, 56], mentor: [65, 82, 50, 72, 24],
    journalist: [75, 66, 72, 45, 50], influencer: [60, 62, 82, 50, 50], friend: [55, 50, 55, 72, 45], main: [55, 55, 60, 55, 45],
    wildcard: [72, 40, 58, 45, 55], brand: [45, 78, 60, 50, 34], fan: [55, 45, 58, 66, 55], hater: [40, 40, 55, 18, 58],
    imported: [55, 50, 55, 55, 50], local: [55, 50, 55, 55, 50],
  };
  // personality keywords -> trait shifts [O, C, E, A, N]
  const KW = [
    [/\b(bubbly|outgoing|loud|chatty|energetic|popular|charismatic|extrovert|party|confident|flirty|playful|social)\b/, [0, 0, 18, 4, -4]],
    [/\b(shy|quiet|introvert|reserved|loner|aloof|withdrawn|mysterious|private|soft-?spoken)\b/, [0, 0, -22, 0, 4]],
    [/\b(kind|sweet|warm|caring|supportive|gentle|wholesome|friendly|loyal|generous|empathetic|nurturing)\b/, [0, 0, 2, 20, -4]],
    [/\b(arrogant|cocky|rude|sarcastic|petty|cold|ruthless|mean|savage|smug|condescending|manipulative|toxic|ruthless)\b/, [0, 2, 4, -22, 2]],
    [/\b(anxious|dramatic|jealous|insecure|moody|emotional|overthink|clingy|sensitive|neurotic|volatile)\b/, [0, 0, 0, 0, 22]],
    [/\b(calm|chill|steady|laid-?back|easygoing|stoic|unbothered|composed)\b/, [0, 2, 0, 2, -20]],
    [/\b(organi[sz]ed|disciplined|ambitious|hardworking|perfectionist|driven|focused|responsible|diligent)\b/, [0, 22, 0, 0, -2]],
    [/\b(lazy|messy|chaotic|procrastinat|impulsive|reckless|flaky|spontaneous|unreliable)\b/, [4, -22, 4, 0, 4]],
    [/\b(creative|artsy|curious|weird|dreamer|quirky|nerdy|imaginative|eccentric|poetic|artistic)\b/, [22, -2, 0, 2, 0]],
    [/\b(traditional|practical|blunt|down-?to-?earth|conservative|no-?nonsense)\b/, [-18, 6, 0, 0, 0]],
  ];
  const EMOJIS = ['😂', '🔥', '💀', '🥹', '😭', '✨', '🙄', '😏', '💅', '🫶', '😤', '🤍', '👀', '🥰', '😎', '🙃', '💯', '🤌'];
  const CATCH = ['literally', 'ngl', 'honestly', 'fr', 'lowkey', 'ok but', 'no because', 'respectfully', 'bestie', 'bro', 'iconic', 'wild', 'not me', 'imagine', 'sir', 'queen'];

  // Build (or return) an NPC's psychology. Deterministic from id/handle/text + world seed.
  Persona.ensure = function (n) {
    if (n.psy && n.psy.v === 1) return n.psy;
    const S = G.S;
    const r = Persona.rngFrom(n.id + '|' + n.handle + '|' + ((S && S.sim && S.sim.seed) || 0));
    const text = `${n.personality || ''} ${n.bio || ''} ${(n.tags || []).join(' ')} ${String(n.card || '').slice(0, 500)}`.toLowerCase();
    const base = (ROLE[n.role] || ROLE.local).slice();
    const t = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    const order = ['O', 'C', 'E', 'A', 'N'];
    order.forEach((k, i) => (t[k] = base[i] + (r() - 0.5) * 30));
    KW.forEach(([re, sh]) => {
      if (re.test(text)) order.forEach((k, i) => (t[k] += sh[i]));
    });
    order.forEach((k) => (t[k] = Math.round(clamp(t[k], 4, 96))));

    const has = (re) => re.test(text);
    const age = n.age || 25;
    const style = {
      lower: has(/lowercase|all lowercase|lowkey|no caps/) || (!has(/formal|proper|polite/) && r() < 0.3),
      caps: has(/all caps|\bcaps\b|shouts?|yells?|screams?/),
      emoji: has(/emoji/) ? 3 : clamp(Math.round(t.E / 32 + (r() - 0.5) * 1.6 + (age < 27 ? 0.5 : -0.3)), 0, 3),
      slang: has(/slang|gen z|memes?|texts like/) ? 3 : clamp(Math.round((age < 22 ? 2.6 : age < 30 ? 1.7 : 0.6) + (r() - 0.5) * 1.4), 0, 3),
      formal: has(/formal|proper|polite|well-spoken|refined/) || (t.C > 78 && t.A > 60 && age > 32),
      stretch: r() < 0.35 + t.E / 300, // "sooooo"
      noPunct: r() < 0.4,
    };
    if (style.caps) style.lower = false;
    const humor = has(/sarcas|dry|deadpan|witty/) ? 'dry' : has(/goofy|silly|bubbly|playful|funny/) ? 'silly' : has(/dark|morbid|edgy/) ? 'dark' : has(/wholesome|sweet|gentle/) ? 'wholesome' : pickFrom(r, ['dry', 'silly', 'dark', 'wholesome', 'none']);
    const chrono = has(/night owl|nocturnal|up late|insomn|partygoer|party/) ? 2 : has(/early bird|morning person|5am|runner|disciplin/) ? 0 : n.role === 'troll' || n.role === 'rival' ? (r() < 0.55 ? 2 : 1) : n.role === 'mentor' ? (r() < 0.55 ? 0 : 1) : r() < 0.22 ? 0 : r() < 0.72 ? 1 : 2;
    const attach = t.N > 62 && t.A > 42 ? 'anxious' : t.E < 40 && t.A < 46 ? 'avoidant' : r() < 0.12 ? 'anxious' : 'secure';

    // interests: from the text, then topped up by trait-weighted picks
    const interests = [];
    const LX = G.Lex;
    LX.TOPIC_LIST.forEach((tp) => {
      if (LX.TOPICS[tp].some((k) => text.includes(k.trim())) && interests.length < 4) interests.push(tp);
    });
    const weight = (tp) => {
      const w = { party: t.E, fashion: (t.E + t.O) / 2, art: t.O, music: (t.O + t.E) / 2, fitness: t.C, work: t.C, money: t.C, mental: t.N, love: 50 + (t.A - 50) / 2, friends: t.E, memes: 50 + (t.E - 50) / 2, drama: 100 - t.A, gaming: 100 - t.E, tech: t.O, books: 100 - t.E + 10, nature: t.O, beauty: t.E, pets: t.A };
      return (w[tp] != null ? w[tp] : 50) + r() * 60;
    };
    LX.TOPIC_LIST.slice().sort((a, b) => weight(b) - weight(a)).forEach((tp) => {
      if (interests.length < 5 && !interests.includes(tp)) interests.push(tp);
    });

    // stable opinion on every debate (-1 = side B ... +1 = side A), mildly shaped by traits
    const bias = { hustle: (t.C - 50) / 90 - (t.N - 50) / 140, aiart: (t.O - 50) / 100 - (t.A - 50) / 300, cancel: (50 - t.A) / 160, phonefree: (t.N - 50) / 140 + (t.O - 50) / 220, pda: (t.E - 50) / 140 + (t.A - 50) / 260, ghosting: (50 - t.A) / 130 + (t.E < 40 ? 0.2 : 0), morning: (50 - (chrono === 2 ? 100 : chrono === 0 ? 0 : 50)) / 130, remote: (50 - t.E) / 140, gymbro: (t.C - 50) / 160 + (t.E - 50) / 200 };
    const stance = {};
    LX.DEBATES.forEach((d) => {
      stance[d.id] = Math.round(clamp((r() * 2 - 1) * 0.85 + (bias[d.id] || 0), -1, 1) * 100) / 100;
    });

    const fav = [pickFrom(r, EMOJIS), pickFrom(r, EMOJIS), pickFrom(r, EMOJIS)];
    const quirks = { emoji: [...new Set(fav)], catch: r() < 0.7 ? [pickFrom(r, CATCH)] : [] };
    const v0 = clamp(0.22 - (t.N - 50) / 180 + (r() - 0.5) * 0.2, -0.5, 0.6);
    n.psy = {
      v: 1, t, style, humor, chrono, attach, interests, stance, quirks,
      baseline: Math.round(v0 * 100) / 100,
      mood: { v: Math.round(v0 * 100) / 100, a: 0.3 },
      energy: 0.7,
      wake: [[5.5, 21.5], [7.5, 23.5], [10.5, 27.5]][chrono][0] + (r() - 0.5) * 1.2,
      sleep: [[5.5, 21.5], [7.5, 23.5], [10.5, 27.5]][chrono][1] + (r() - 0.5) * 1.4,
      lastActive: S ? S.clock - Math.floor(r() * 600) : 0,
      lastPost: -9999, lastDm: -9999, dmToday: 0, dmDay: 0, recent: [], following: [],
      grudges: {}, // authorId -> intensity 0..1 (slights remembered)
    };
    return n.psy;
  };
  function pickFrom(r, arr) {
    return arr[Math.floor(r() * arr.length)];
  }

  /* ---------- time of day ---------- */

  // 0..1 how awake this person is at a game hour (0-24, wraps)
  Persona.awake = function (n, hour) {
    const p = Persona.ensure(n);
    const win = (x) => (x >= p.wake && x <= p.sleep ? Math.min(1, Math.min(x - p.wake, p.sleep - x) + 0.35) : 0);
    return Math.max(win(hour), win(hour + 24)); // sleep windows can run past midnight
  };
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  // relative urge to post/browse at this hour (peaks at lunch and in the evening / late for night owls)
  Persona.activityAt = function (n, hour) {
    const p = Persona.ensure(n);
    const aw = Persona.awake(n, hour);
    if (!aw) return 0;
    const ev = p.chrono === 2 ? 23.2 : p.chrono === 0 ? 19 : 20.5;
    const peak = Math.max(gauss(hour, 12.6, 1.6), gauss(hour, ev, 2.4), gauss(hour + 24, ev, 2.4) * 0.9, gauss(hour, 8, 1.2) * (p.chrono === 0 ? 1 : 0.35));
    return aw * (0.28 + 0.72 * peak);
  };
  // 'online' (active in last 25 game-min while awake) / 'away' (awake) / 'offline'
  Persona.presence = function (n, clock) {
    const p = Persona.ensure(n);
    const hour = ((clock % 1440) + 1440) % 1440 / 60;
    if (!Persona.awake(n, hour)) return 'offline';
    return clock - p.lastActive <= 25 ? 'online' : 'away';
  };

  /* ---------- mood ---------- */

  Persona.nudge = function (n, dv, da = 0) {
    const p = Persona.ensure(n);
    const sens = 0.6 + p.t.N / 100; // neurotic people swing harder
    p.mood.v = clamp(p.mood.v + dv * sens, -1, 1);
    p.mood.a = clamp(p.mood.a + da, 0, 1);
  };
  // drift back toward baseline (half-life ~6 game hours; neurotic = slower to recover)
  Persona.decay = function (n, minutes) {
    const p = Persona.ensure(n);
    const half = 360 * (0.7 + p.t.N / 120);
    const k = Math.pow(0.5, minutes / half);
    p.mood.v = p.baseline + (p.mood.v - p.baseline) * k;
    p.mood.a = 0.3 + (p.mood.a - 0.3) * k;
    p.energy = clamp(p.energy + (0.7 - p.energy) * (1 - k), 0, 1);
    Object.keys(p.grudges).forEach((id) => {
      p.grudges[id] *= Math.pow(0.5, minutes / (2880 * (0.5 + p.t.N / 100)));
      if (p.grudges[id] < 0.04) delete p.grudges[id];
    });
    if (G.Bonds && G.Bonds.moodHold) G.Bonds.moodHold(n, minutes);
  };
  // word for the current mood (feeds the sprite system + UI)
  Persona.moodWord = function (n) {
    const p = Persona.ensure(n);
    const { v, a } = p.mood;
    if (v > 0.45) return a > 0.55 ? 'excited' : 'happy';
    if (v > 0.15) return 'content';
    if (v > -0.15) return 'neutral';
    if (v > -0.45) return a > 0.55 ? 'annoyed' : 'down';
    return a > 0.55 ? 'angry' : 'sad';
  };
  // the player (or any account) may write in a style; keep a small memory to avoid repeating ourselves
  Persona.remember = function (n, key) {
    const p = Persona.ensure(n);
    p.recent.push(key);
    if (p.recent.length > 40) p.recent.shift();
  };
  Persona.recently = (n, key) => Persona.ensure(n).recent.includes(key);
  // exact-text memory: people do not post the identical sentence twice in a row
  // (stored as small hashes so a long memory costs almost nothing in the save file)
  // (the same words with another emoji or punctuation are still the same line)
  const sameLine = (text) => U.hash(String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, '').replace(/\s+/g, ' ').trim());
  Persona.dupText = (n, text) => (Persona.ensure(n).texts || []).includes(sameLine(text));
  Persona.noteText = (n, text) => {
    const p = Persona.ensure(n);
    p.texts = p.texts || [];
    p.texts.push(sameLine(text));
    if (p.texts.length > 150) p.texts.shift();
  };
})(window.G);
