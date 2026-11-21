/* Clout — NPC memory stream + reflection. Algorithm re-implemented from "Generative Agents" (Park et al. 2023,
   Apache-2.0): every memory is scored by RECENCY (exponential decay), IMPORTANCE (1-10) and RELEVANCE to the current
   situation; the top ones shape what an NPC says and feels. Periodic REFLECTION turns piles of memories into beliefs
   about specific people ("she keeps being kind to me", "he keeps taking shots at me"), which then change how the NPC
   treats them. Rule-based, so it costs nothing; the AI gets the same memories in its prompt. */
(function (G) {
  const U = G.U;
  const Mem = (G.Mem = { CAP: 200 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const BASE_IMPORTANCE = {
    breakup: 9, confession: 8, secret: 8, betrayal: 9, fight: 7, rumor: 6, rejection: 7, apology: 5, flirt: 5,
    compliment: 4, shade: 5, defend: 5, reply: 3, comment: 3, like: 1, follow: 3, story: 2, dm: 4, event: 6, gift: 6, post: 2,
  };
  /* ---------- what is worth remembering (Generative Agents: importance by MEANING; Mem0: ADD / UPDATE / NOOP instead of storing every utterance) ---------- */
  const CHATTER = new Set(['comment', 'reply', 'like', 'follow', 'post', 'story']); // low-value kinds: never more than a gist per person
  const DISCLOSE = new Set(['said', 'dm', 'secret', 'told', 'news', 'feeling', 'family', 'event']); // kinds that can carry something the PLAYER told them
  const OWN = /^I (?:told|said|replied|texted|posted|reached|started|did|accused|keep)\b/; // their own words are not a disclosure
  const CHAN = / in #([\w-]+)/;
  const first = (s) => String(s || '').split(' ')[0];
  const mind = () => (G.Mind && G.Mind.read ? G.Mind : null); // (mind.js loads after this file: always look it up lazily)
  const isDisclosure = (kind, text, who, tags) => DISCLOSE.has(kind) && (who || []).includes('me') && !OWN.test(text) && !CHAN.test(text) && !(tags || []).includes('hearsay');
  Mem.importance = function (text, kind) {
    let imp = BASE_IMPORTANCE[kind] != null ? BASE_IMPORTANCE[kind] : 3;
    try {
      if (window.vader && text) imp += Math.abs(window.vader.SentimentIntensityAnalyzer.polarity_scores(String(text)).compound) * 2;
    } catch (e) {}
    const M = mind();
    if (M && text) {
      try {
        const sal = M.salience(text, kind);
        if (CHATTER.has(kind)) { if (sal <= 3) imp = Math.min(imp, 3); } // small talk stays small talk
        else if (sal >= 7 && !CHAN.test(text)) imp = Math.max(imp, OWN.test(text) ? Math.min(sal, 6) : sal); // illness, grief, loss, good news: by meaning, not by volume
      } catch (e) {}
    }
    return clamp(Math.round(imp), 1, 10);
  };
  // something delicate the player told them (kept for ever, always comes to mind when the player talks to them)
  Mem.isDelicate = function (m) {
    if (!m) return false;
    if (m.sens != null) return m.sens >= 0.5;
    const M = mind();
    if (!M || !isDisclosure(m.kind, m.text, m.who, m.tags)) return false;
    try { return M.read(m.text).sens >= 0.5; } catch (e) { return false; }
  };
  Mem.delicate = (npc) => (npc.mem || []).filter(Mem.isDelicate).sort((a, b) => b.imp - a.imp || b.t - a.t);
  // everything the player told them (kind 'said', not hearsay), strongest first
  Mem.told = (npc) => (npc.mem || []).filter((m) => m.kind === 'said' && (m.who || []).includes('me') && !(m.tags || []).includes('hearsay')).sort((a, b) => (Mem.isDelicate(b) ? 1 : 0) - (Mem.isDelicate(a) ? 1 : 0) || b.imp - a.imp || b.t - a.t);

  const tk = (s) => new Set(G.Rag ? G.Rag.tokens(s) : String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
  const jac = (a, b) => {
    if (!a.size || !b.size) return 0;
    let i = 0;
    a.forEach((x) => { if (b.has(x)) i++; });
    return i / (a.size + b.size - i);
  };
  const DUP_WINDOW = 2880; // two days
  // ADD / UPDATE / NOOP: the same thing said twice is one memory that happened twice
  Mem.findDup = function (npc, kind, text, t) {
    const arr = npc.mem || [];
    const pre = text.slice(0, 8).toLowerCase();
    let tt = null;
    for (let i = arr.length - 1, seen = 0; i >= 0 && seen < 60; i--, seen++) {
      const x = arr[i];
      if (x.kind !== kind || Math.abs(t - x.t) > DUP_WINDOW) continue;
      if (x.text === text) return x;
      if (x.text.slice(0, 8).toLowerCase() !== pre) continue;
      if ((x.text.match(/\d+/g) || []).join() !== (text.match(/\d+/g) || []).join()) continue; // ("number 12" and "number 13" are different things)
      tt = tt || tk(text);
      if (tt.size >= 4 && jac(tt, tk(x.text)) >= 0.8) return x;
    }
    return null;
  };
  // PROVENANCE: two paths that record the same story message (the beat's own memory and the story event's memory) share the tag "link:<message id>".
  // The same fact reaching one character twice from the same message is ONE memory that was reinforced, whatever its kind or wording.
  Mem.findSrcDup = function (npc, tags, text) {
    const src = (tags || []).find((t) => /^link:/.test(t));
    if (!src) return null;
    const arr = npc.mem || [];
    let tt = null;
    for (let i = arr.length - 1, seen = 0; i >= 0 && seen < 40; i--, seen++) {
      const x = arr[i];
      if (!(x.tags || []).includes(src)) continue;
      if (x.text === text) return x;
      tt = tt || tk(text);
      const xt = tk(x.text);
      if (tt.size < 3 || xt.size < 3) continue;
      let hit = 0;
      tt.forEach((w) => { if (xt.has(w)) hit++; });
      if (hit / Math.min(tt.size, xt.size) >= 0.6) return x; // (overlap against the shorter line)
    }
    return null;
  };
  const isChatter = (kind, text, imp, o) => !o.pin && kind !== 'reflection' && ((CHATTER.has(kind) && imp <= 3) || ((kind === 'comment' || kind === 'rumor') && CHAN.test(text) && imp <= 5));

  // how a repeated pattern reads as one line of belief: [what THEY keep doing to me, what I keep doing to them]
  const PAT = {
    comment: [(N) => N + ' keeps commenting on my stuff', (N) => 'I keep commenting on ' + N + "'s posts"],
    reply: [(N) => N + ' keeps replying to me', (N) => 'I keep replying to ' + N],
    like: [(N) => N + ' keeps liking my posts', (N) => 'I keep liking ' + N + "'s posts"],
    follow: [(N) => N + ' keeps showing up in my feed', (N) => 'I keep checking in on ' + N],
    story: [(N) => N + ' keeps reacting to my stories', (N) => 'I keep reacting to ' + N + "'s stories"],
    post: [(N) => N + ' keeps posting', () => 'I keep posting'],
    shade: [(N, v) => N + (v > -0.4 ? ' keeps teasing me' : ' keeps taking shots at me'), (N, v) => 'I keep ' + (v > -0.4 ? 'teasing ' : 'taking shots at ') + N],
    compliment: [(N) => N + ' keeps being kind to me', (N) => 'I keep complimenting ' + N],
    flirt: [(N) => N + ' keeps flirting with me', (N) => 'I keep flirting with ' + N],
    defend: [(N) => N + ' keeps standing up for me', (N) => 'I keep standing up for ' + N],
    dm: [(N) => N + ' keeps texting me', (N) => 'I keep texting ' + N],
    rumor: [(N) => N + ' keeps talking about me', (N) => 'I keep talking about ' + N],
    fight: [(N) => N + ' keeps clashing with me', (N) => 'I keep clashing with ' + N],
  };
  const nameOfId = (id) => (id === 'me' ? first(G.S.player && G.S.player.name) : id && G.S.npcs[id] ? first(G.S.npcs[id].name) : '');
  const dirOf = (text) => (/^I\b/.test(text) ? 1 : 0);
  Mem.gistText = function (kind, who0, text, n, v) {
    const chan = (String(text).match(CHAN) || [])[1];
    const N = nameOfId(who0);
    const dir = dirOf(text);
    let line;
    if (chan) line = dir ? 'I keep chatting' + (N ? ' with ' + N : '') + ' in #' + chan : (N || 'Someone') + (kind === 'rumor' ? ' keeps talking about me' : ' keeps chatting with me') + ' in #' + chan;
    else if (PAT[kind]) line = N || kind === 'post' ? PAT[kind][dir](N || 'someone', v) : dir ? 'I keep ' + kind + 'ing around' : 'Someone keeps ' + kind + 'ing me';
    else line = (N || 'Someone') + ' and I keep crossing paths (' + kind + ')';
    return (line + ' (x' + n + ')').slice(0, 200);
  };
  const gistKey = (kind, who, text) => kind + '|' + ((who || []).find((w) => w) || '_') + '|' + dirOf(text) + '|' + ((String(text).match(CHAN) || [])[1] || '');

  // a character who has piled up many small memories of the same person folds them into one belief line with a count ("Mia keeps teasing me (x6)").
  // Pinned items, strong memories (imp 8+), reflections, secrets, promises and anything delicate are never folded; the strongest sample is filed in the vault.
  const FOLD = new Set(['shade', 'comment', 'reply', 'compliment', 'flirt', 'defend', 'dm', 'rumor', 'fight', 'like', 'follow', 'story']);
  Mem.consolidate = function (npc, min = 4) {
    const arr = npc.mem || [];
    const groups = {};
    arr.forEach((m) => {
      if (!FOLD.has(m.kind) || m.pin || m.imp >= 8 || m.sens >= 0.5 || (m.tags || []).includes('intimate')) return;
      const who0 = (m.who || []).find((w) => w && w !== npc.id);
      if (!who0) return;
      const k = m.gk || gistKey(m.kind, m.who, m.text);
      (groups[k] = groups[k] || []).push(m);
    });
    let folded = 0;
    const drop = new Set();
    Object.keys(groups).forEach((k) => {
      const g = groups[k];
      if (g.length < min) return;
      const keep = g.find((x) => x.gk === k) || g[0];
      const strongest = g.slice().sort((a, b) => b.imp - a.imp)[0];
      const total = g.reduce((a, x) => a + (x.n || 1), 0);
      const v = g.reduce((a, x) => a + x.v * (x.n || 1), 0) / total;
      if (G.Vault && strongest.imp >= 4) G.Vault.archive(npc, strongest);
      g.forEach((x) => { if (x !== keep) drop.add(x); });
      keep.n = total;
      keep.gk = k;
      keep.t = Math.max.apply(null, g.map((x) => x.t));
      keep.v = clamp(Math.round(v * 100) / 100, -1, 1);
      keep.imp = Math.min(7, Math.max.apply(null, g.map((x) => x.imp)));
      keep.text = Mem.gistText(keep.kind, (keep.who || []).find((w) => w && w !== npc.id), keep.text, total, v);
      folded += g.length - 1;
    });
    if (drop.size) npc.mem = arr.filter((x) => !drop.has(x));
    return folded;
  };

  // add a memory to an NPC. who: ids involved. valence: -1..1 (how it felt). Returns the memory.
  Mem.add = function (npc, o) {
    const S = G.S;
    const kind = o.kind || 'event';
    const text = String(o.text || '').slice(0, 220);
    const t = o.t != null ? o.t : S.clock;
    const who = (o.who || []).filter(Boolean).slice(0, 4);
    const v = clamp(o.valence || 0, -1, 1);
    let imp = o.imp != null ? clamp(Math.round(o.imp), 1, 10) : Mem.importance(text, kind);
    let sens = 0;
    const M = mind();
    if (M && text && isDisclosure(kind, text, who, o.tags)) { // the player told them something: judge it by what it MEANS
      try {
        const r = M.read(text);
        if (r.sens >= 0.5) { sens = r.sens; imp = Math.max(imp, M.salience(text, kind), 8); } else if (r.good) imp = Math.max(imp, 7);
      } catch (e) {}
    }
    npc.mem = npc.mem || [];
    const p = G.Persona.ensure(npc);
    if (!o.pin && kind !== 'reflection') {
      const d = Mem.findDup(npc, kind, text, t); // NOOP / UPDATE: it already knows this
      if (d) {
        d.n = (d.n || 1) + 1;
        d.t = Math.max(d.t, t);
        d.imp = Math.max(d.imp, imp);
        if (sens && !(d.sens >= 0.5)) d.sens = sens;
        p.unreflected = (p.unreflected || 0) + 1;
        return d;
      }
    }
    if (!o.pin && kind !== 'reflection') {
      const d2 = Mem.findSrcDup(npc, o.tags, text);
      if (d2) { // the same story message already told them this
        d2.n = (d2.n || 1) + 1;
        d2.imp = Math.max(d2.imp, imp);
        return d2;
      }
    }
    if (isChatter(kind, text, imp, o) && (who.some((w) => w !== npc.id) || CHAN.test(text))) { // small talk is folded into ONE gist per (kind, person, channel): it can never crowd out a real memory
      const gk = gistKey(kind, who, text);
      const g = npc.mem.find((x) => x.gk === gk);
      if (g) {
        g.n = (g.n || 1) + 1;
        g.t = Math.max(g.t, t);
        g.v = clamp(Math.round(((g.v * (g.n - 1)) + v) / g.n * 100) / 100, -1, 1);
        g.imp = Math.min(4, Math.max(g.imp, imp) + (g.n === 4 || g.n === 12 ? 1 : 0));
        g.text = Mem.gistText(kind, who.find((w) => w !== npc.id), text, g.n, g.v);
        p.unreflected = (p.unreflected || 0) + 1;
        return g;
      }
      o = Object.assign({}, o, { gk });
    }
    const m = { t, kind, text, imp, who, tags: (o.tags || []).slice(0, 4), v };
    if (o.gk) m.gk = o.gk;
    if (sens) { m.sens = sens; if (!m.tags.includes('delicate') && m.tags.length < 4) m.tags.push('delicate'); }
    npc.mem.push(m);
    const cap = (npc.touched || 0) >= S.clock - 4320 ? Mem.CAP : 60; // people you have been dealing with lately keep 200, the rest 60: saves stay small
    if (npc.mem.length > cap * 0.75 && npc.mem.length % 8 === 0) Mem.consolidate(npc); // (many small memories of one person become one belief line)
    while (npc.mem.length > cap) {
      // the least valuable memory leaves the front of the mind (old AND unimportant first; strong memories, realisations and anything delicate leave last).
      // Small stuff (imp < 5) always goes before anything of weight, so chatter can never evict a real event.
      // It is not forgotten: it is filed into the note about that person (js/vault.js) and can still be recalled.
      const low = (x) => !x.pin && x.kind !== 'reflection' && x.imp < 5 && x.kind !== 'said' && !(x.sens >= 0.5);
      const pool = npc.mem.filter((x) => x !== m && low(x));
      if (low(m) && m.imp <= 3) pool.push(m);
      const cand = pool.length ? pool : npc.mem.filter((x) => x !== m);
      let worst = null;
      let ws = Infinity;
      cand.forEach((x) => {
        const s = x.imp * 1.5 + 8 * Math.pow(0.99, (S.clock - x.t) / 60) + (x.imp >= 8 || x.kind === 'reflection' || x.pin ? 100 : 0) + (x.pin || x.sens >= 0.5 ? 900 : 0);
        if (s < ws) {
          ws = s;
          worst = x;
        }
      });
      if (!worst) break;
      npc.mem.splice(npc.mem.indexOf(worst), 1);
      if (G.Vault) G.Vault.archive(npc, worst);
    }
    p.unreflected = (p.unreflected || 0) + m.imp;
    return m;
  };

  // score = recency + importance + relevance (all 0..1), like the paper (equal weights)
  Mem.score = function (m, now, q) {
    const hours = Math.max(0, now - m.t) / 60;
    const recency = Math.pow(0.99, hours / (1 + 0.35 * (m.rh || 0))); // a memory that keeps being recalled fades more slowly
    const importance = m.imp / 10;
    let relevance = 0;
    if (q) {
      if (q.who && m.who.some((w) => q.who.includes(w))) relevance += 0.6;
      if (q.tags && m.tags.some((t) => q.tags.includes(t))) relevance += 0.3;
      if (q.text) {
        const R = G.Rag;
        const words = R ? R.tokens(q.text) : String(q.text).toLowerCase().match(/[a-z]{4,}/g) || [];
        const hay = R ? new Set(R.tokens(m.text)) : m.text.toLowerCase();
        const hit = words.filter((w) => (R ? hay.has(w) : hay.includes(w))).length;
        relevance += Math.min(0.4, hit * 0.1);
      }
    }
    return recency + importance + Math.min(1, relevance);
  };
  Mem.retrieve = function (npc, q, k = 5, now = G.S.clock) {
    return (npc.mem || [])
      .map((m) => [Mem.score(m, now, q), m])
      .sort((a, b) => b[0] - a[0])
      .slice(0, k)
      .map((x) => x[1]);
  };

  // beliefs about specific people, built from many memories
  Mem.reflect = function (npc, now = G.S.clock) {
    const p = G.Persona.ensure(npc);
    if ((p.unreflected || 0) < 22) return null; // not enough has happened (the paper uses a threshold too)
    p.unreflected = 0;
    p.beliefs = p.beliefs || {};
    Mem.consolidate(npc, 4); // many small memories of one person -> one belief line with a count (their weight is kept below)
    const byWho = {};
    (npc.mem || []).forEach((m) => {
      const age = (now - m.t) / 60;
      const cnt = m.n || 1; // a folded line stands for several memories
      const w = (m.imp / 10) * Math.pow(0.992, age) * Math.min(3, 1 + Math.log2(cnt));
      m.who.forEach((id) => {
        const b = (byWho[id] = byWho[id] || { v: 0, w: 0, n: 0 });
        b.v += m.v * w;
        b.w += w;
        b.n += cnt;
      });
    });
    const out = [];
    Object.keys(byWho).forEach((id) => {
      const b = byWho[id];
      if (b.n < 2 || b.w < 0.4) return;
      const v = clamp(b.v / b.w, -1, 1);
      p.beliefs[id] = { v: Math.round(v * 100) / 100, n: b.n, t: now };
      // a pattern of slights hardens into a grudge; a pattern of kindness is remembered too
      if (v < -0.35) p.grudges[id] = clamp((p.grudges[id] || 0) + 0.25 * -v, 0, 1);
      out.push([id, v]);
    });
    // the strongest patterns are written down as memories of their own ("I have realised ..."): that is what lets them act on what they learned
    if (G.Goals) {
      out.filter(([id, v]) => Math.abs(v) > 0.35 && (byWho[id] || {}).n >= 3).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).forEach(([id, v]) => {
        const text = G.Goals.reflectText(npc, id, v);
        if ((npc.mem || []).some((m) => m.kind === 'reflection' && m.text === text)) return;
        Mem.add(npc, { kind: 'reflection', text, who: [id], imp: 8, valence: v, t: now });
      });
    }
    return out;
  };
  // how the NPC currently feels about someone because of what they remember (-1..1), 0 if nothing
  Mem.belief = (npc, id) => ((npc.psy && npc.psy.beliefs && npc.psy.beliefs[id]) || { v: 0 }).v;

  // short text for AI prompts: the memories that matter most right now
  // (delicate things the player told them always come to mind when the player is the one they are talking to)
  Mem.promptLines = function (npc, q, k = 4) {
    const got = Mem.retrieve(npc, q, k);
    if (q && (q.who || []).includes('me') && k >= 3) {
      const d = Mem.delicate(npc)[0];
      if (d && !got.includes(d)) { if (got.length >= k) got.pop(); got.push(d); }
    }
    return got.map((m) => { if (G.Mem2) G.Mem2.rehearse(m); return m.text; });
  };
})(window.G);
