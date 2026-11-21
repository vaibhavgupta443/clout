/* Clout — the town: up to 1,000,000 procedurally generated people.
   Person #i is computed on demand from (seed, i), so nothing is stored until you "meet" someone, at which
   point they are promoted into a full character with memory, relationship and DMs.                      */
(function (G) {
  const U = G.U;
  const E = G.Engine;
  const Pop = (G.Pop = { recent: new Map(), DEFAULT: 250000, MAX: 1000000 });

  const FIRST = ('Mira Jonah Lena Kofi Aiko Dante Priya Mateo Sasha Noor Theo Isla Rafael Yuki Amara Leo Zara Felix Nia Hugo Carmen Idris Mei Tobias Luna Omar Freya Kai Anya Rowan ' +
    'Selena Marcus Talia Ezra Rhea Jin Bianca Caleb Dalia Emil Farah Gael Hana Ivo Jade Kian Lia Milo Nadia Orin Petra Quincy Remy Sana Tariq Uma Vik Wren Xavi Yara Zane Aaliyah Bruno Chloe ' +
    'Darius Elena Finn Gia Hector Ines Jasper Keiko Lucas Maya Nico Odette Pablo Quinn Rosa Soren Tessa Ulrich Vera Wes Ximena Yosef Zoe Adaeze Beau Cleo Dev Esme Fatima Gus Hiro Ivy Jules ' +
    'Kira Liam Marta Nate Olive Pia Raj Stella Troy Una Vance Willa Yash Zelda').split(' ');
  const LAST = ('Okafor Silva Nakamura Haddad Moreau Kowalski Reyes Tanaka Petrov Larsen Costa Mbeki Rossi Yilmaz Kim Novak Dubois Singh Ibrahim Fischer Santos Ahmed Park Jensen Bianchi Varga ' +
    'Lindqvist Castillo Demir Abara Zhao Mendes Volkov Hartman Ortega Nguyen Ferreira Kaya Andersson Sato Romero Hassan Bauer Delgado Popescu Mahlaba Ivanov Cohen Murphy Quinn Ellis Brooks ' +
    'Frost Hale Vance Stone Reed Banks Cruz Dang Eze Fong Gupta Hirsch Ito Jovanovic Khan Lopez Martin Nair Oyelaran Patel Qureshi Ramos Suzuki Torres Usman Vasquez Wong Xu Young Zaman').split(' ');
  const SYL_A = ['ka', 'mi', 'ra', 'to', 'li', 'no', 've', 'sa', 'jo', 'el', 'an', 'zi', 'ba', 'de', 'fi', 'gu', 'ha', 'ki', 'lo', 'mo', 'na', 'pe', 'qu', 'ri', 'su', 'ta', 'ul', 'wa', 'xe', 'yo'];
  const SYL_B = ['ra', 'lin', 'ko', 'vi', 'na', 'ten', 'mo', 'sha', 'ri', 'do', 'la', 'ne', 'tu', 'ven', 'zo', 'ka', 'mir', 'sel', 'dro', 'fa'];
  const SYL_C = ['', '', '', 'a', 'e', 'o', 'n', 's', 'ya', 'ia', 'el', 'is'];
  const SUR_A = ['Ash', 'Black', 'Bright', 'Cold', 'Dark', 'East', 'Fair', 'Gold', 'Green', 'High', 'Iron', 'Lake', 'Moon', 'North', 'Oak', 'Red', 'Silver', 'Storm', 'West', 'Wild'];
  const SUR_B = ['ford', 'wood', 'field', 'stone', 'brook', 'hill', 'wick', 'ton', 'ley', 'worth', 'dale', 'haven', 'ridge', 'well', 'moor', 'ward', 'croft', 'shaw', 'bury', 'combe'];

  const JOBS = ['barista', 'nurse', 'graphic designer', 'line cook', 'grad student', 'dj', 'personal trainer', 'bartender', 'photographer', 'junior lawyer', 'streamer', 'tattoo artist',
    'software engineer', 'teacher', 'florist', 'mechanic', 'dancer', 'journalist', 'paramedic', 'bookseller', 'yoga instructor', 'influencer', 'actor', 'chef', 'pilot', 'model',
    'barber', 'nail tech', 'musician', 'game dev', 'librarian', 'delivery rider', 'real-estate agent', 'vet tech', 'architect', 'fashion student', 'podcaster', 'event planner',
    'lifeguard', 'sales rep', 'accountant', 'comedian', 'painter', 'bouncer', 'copywriter', 'physio', 'pastry chef', 'esports coach', 'film student', 'stylist'];
  const HOODS = ['Riverside', 'Old Town', 'the Docks', 'Midtown', 'Hillcrest', 'the Arts District', 'Eastgate', 'Harbor Row', 'Lakeshore', 'Maple Heights', 'Uptown', 'the University quarter',
    'Greenpoint', 'Foxglove Lane', 'Skyline', 'Westbrook', 'Cobble Street', 'Neon Alley', 'Sunset Mile', 'the Marina'];
  const VIBES = ['sarcastic', 'soft-spoken', 'chaotic', 'romantic', 'gym-obsessed', 'bookish', 'flirty', 'grumpy', 'wholesome', 'dramatic', 'mysterious', 'party animal', 'anxious but sweet',
    'competitive', 'ironic', 'earnest', 'petty', 'dreamy', 'blunt', 'clingy', 'aloof', 'goofy', 'ambitious', 'nostalgic', 'shy', 'loud', 'protective', 'gossipy', 'cynical',
    'adventurous', 'cozy', 'edgy', 'charming', 'nerdy', 'confident', 'jealous', 'laid-back', 'intense', 'playful'];
  const LIKES = ['indie music', 'anime', 'true crime', 'gym', 'cooking', 'thrifting', 'k-pop', 'gaming', 'hiking', 'astrology', 'film photography', 'basketball', 'skincare', 'coffee', 'tattoos',
    'karaoke', 'sci-fi', 'horror movies', 'dancing', 'cats', 'dogs', 'plants', 'fashion', 'politics', 'memes', 'podcasts', 'cycling', 'poetry', 'clubbing', 'baking', 'vinyl', 'fantasy books',
    'road trips', 'board games', 'street food', 'vintage cars', 'surfing', 'crypto', 'drag shows', 'stand-up comedy', 'pottery', 'running', 'wine', 'tarot', 'streetwear', 'museums',
    'late-night drives', 'rooftop parties', 'reality TV', 'chess'];

  function mulberry(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  Pop.size = () => {
    const n = G.S && G.S.popSize != null ? Math.floor(Number(G.S.popSize)) : Pop.DEFAULT;
    return Number.isFinite(n) ? Math.max(0, Math.min(Pop.MAX, n)) : Pop.DEFAULT;
  };
  Pop.seed = () => (G.S && G.S.popSeed) || 7;

  // person #i — pure function of (seed, i)
  Pop.person = function (i, seed = Pop.seed()) {
    i = Number.isFinite(Number(i)) ? Math.max(0, Math.floor(Number(i))) : 0;
    const r = mulberry(U.hash(seed + ':' + i));
    const pick = (a) => a[Math.floor(r() * a.length)];
    const first = r() < 0.55 ? pick(FIRST) : cap(pick(SYL_A) + pick(SYL_B) + pick(SYL_C));
    const last = r() < 0.55 ? pick(LAST) : pick(SUR_A) + pick(SUR_B);
    const age = Math.min(64, 18 + Math.floor(Math.pow(r(), 1.8) * 40)); // always >= 18
    const vibes = [pick(VIBES), pick(VIBES)];
    const likes = [pick(LIKES), pick(LIKES), pick(LIKES)];
    const job = pick(JOBS);
    const hood = pick(HOODS);
    const u = r();
    const followers = Math.min(5e6, Math.round(25 / Math.pow(1 - u * 0.9995, 0.95)));
    const handle = '@' + first.toLowerCase().replace(/[^a-z]/g, '') + '_' + i.toString(36);
    return {
      idx: i, id: 'pop' + i, name: `${first} ${last}`, handle, age, job, hood, vibes, likes, followers,
      bio: `${job} from ${hood}. into ${likes[0]} & ${likes[1]}.`,
      personality: `${vibes[0]} and ${vibes[1]}; loves ${likes.join(', ')}; works as a ${job}.`,
    };
  };

  Pop.fromHandle = (h) => {
    const m = String(h || '').match(/^@?[a-z]+_([0-9a-z]+)$/i);
    if (!m) return null;
    const i = parseInt(m[1], 36);
    if (!Number.isFinite(i) || i < 0 || i >= Pop.size()) return null;
    const p = Pop.person(i);
    return p.handle === '@' + String(h).replace(/^@/, '').toLowerCase() ? p : null;
  };

  // browse / search. Filtering scans a window of the population (keeps it instant even at 1M)
  Pop.page = function (page, per = 24, q = '') {
    page = Math.max(0, Math.floor(Number(page)) || 0);
    const size = Pop.size();
    q = String(q || '').trim().toLowerCase();
    if (!q) {
      const out = [];
      for (let k = 0; k < per; k++) {
        const i = page * per + k;
        if (i < size) out.push(Pop.person(i));
      }
      return { people: out, total: size, pages: Math.ceil(size / per) };
    }
    const direct = Pop.fromHandle(q);
    const hits = direct ? [direct] : [];
    const SCAN = Math.min(size, 120000);
    const skip = page * per;
    for (let i = 0; i < SCAN && hits.length < skip + per + 1; i++) {
      const p = Pop.person(i);
      if (direct && p.idx === direct.idx) continue;
      if ((p.name + ' ' + p.job + ' ' + p.hood + ' ' + p.vibes.join(' ') + ' ' + p.likes.join(' ')).toLowerCase().includes(q)) hits.push(p);
    }
    return { people: hits.slice(skip, skip + per), total: null, pages: null, more: hits.length > skip + per };
  };

  // random sample of accounts handed to the AI as the "crowd pool" so crowd replies come from persistent people
  Pop.pool = function (k = 10, rnd = Math.random) {
    const S = G.S;
    if (!S || !(Pop.size() > 0)) return [];
    k = Math.min(k, Pop.size());
    const out = [];
    const seen = new Set();
    let tries = 0;
    let last = 0;
    while (out.length < k) {
      // bounded: a degenerate random source must never hang the game, so fall back to consecutive people
      let i = Math.floor(rnd() * Pop.size());
      if (++tries > k * 25) i = (last + 1) % Pop.size();
      last = i;
      if (seen.has(i)) continue;
      seen.add(i);
      const p = Pop.person(i);
      out.push(p);
      Pop.recent.set(p.handle, i);
    }
    while (Pop.recent.size > 400) Pop.recent.delete(Pop.recent.keys().next().value);
    return out;
  };

  // promote a procedural person into a real, persistent character
  Pop.meet = function (idx, extra = {}) {
    idx = Number(idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= Pop.size()) return null;
    const S = G.S;
    S.popMet = S.popMet || {};
    if (S.popMet[idx] && S.npcs[S.popMet[idx]]) return S.npcs[S.popMet[idx]];
    const p = Pop.person(idx);
    const n = E.makeNpc(
      Object.assign({ name: p.name, handle: p.handle, role: 'local', age: p.age, bio: p.bio, personality: p.personality, emoji: U.pick(['🙂', '😎', '😏', '🤍', '🌟', '🔥', '🌸', '🦊']), followers: p.followers }, extra)
    );
    n.pop = idx;
    S.popMet[idx] = n.id;
    return n;
  };

  /* ---------- swipe (dating) ---------- */

  const OPEN_CLEAN = [
    'hey! your profile made me laugh 😄', 'okay we matched, so what is your most controversial opinion?', 'hi!! saw we both like {x}. rank your top 3?',
    'be honest, are you actually {v} or just pretending 😏', 'we matched so now you have to recommend me something to watch', 'hey you. coffee this week?',
    'hi 👋 {x} person detected. same.', 'so... what is your story?',
  ];

  Pop.swipe = function (idx, mode) {
    const S = G.S;
    const P = S.player;
    idx = Number(idx);
    if (mode === 'pass' || !Number.isInteger(idx) || idx < 0 || idx >= Pop.size()) return { match: false };
    const p = Pop.person(idx);
    const appeal = (P.stats.charisma + P.stats.style) / 400 + Math.min(0.22, Math.log10(P.followers + 10) / 30) + (P.verified ? 0.05 : 0);
    const chance = U.clamp(0.2 + appeal + (mode === 'super' ? 0.3 : 0) - (p.followers > 100000 ? 0.1 : 0), 0.08, 0.92);
    if (Math.random() > chance) return { match: false };
    const n = Pop.meet(idx, { status: 'acquaintance', aff: 12, rom: mode === 'super' ? 28 : 18, trust: 8 });
    const lines = OPEN_CLEAN;
    const text = U.pick(lines).replace('{x}', p.likes[0]).replace('{v}', p.vibes[0]);
    (S.dms[n.id] = S.dms[n.id] || []).push({ id: 'm' + S.counters.msg++, from: n.id, text, t: S.clock, read: false });
    n.memories.push('Matched with the player on a dating app');
    n.touched = S.clock;
    E.addChron(`Player matched with ${n.name} on a dating app`);
    E.addNotif('dm', `It's a match! ${n.name} messaged you`, { npcId: n.id });
    return { match: true, npc: n };
  };

  // fresh swipe candidate (adult, not already met)
  Pop.nextCandidate = function () {
    const S = G.S;
    for (let k = 0; k < 20; k++) {
      const i = Math.floor(Math.random() * Pop.size());
      if (!(S.popMet && S.popMet[i])) return Pop.person(i);
    }
    return Pop.person(Math.floor(Math.random() * Pop.size()));
  };
})(window.G);
