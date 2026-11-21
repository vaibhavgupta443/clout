/* Retrieval for the Director (and anything else that needs "what is relevant right now"): free, offline, no embeddings.
   Design from two well-known systems:
   - Generative Agents (Stanford, 2023): every memory is scored by recency x importance x relevance, each normalised, then summed.
   - Lorebook-style retrieval: long text is cut into ~400-character chunks, and the query is the latest message(s); canon (lorebook / summary) never decays.
   Relevance is BM25 over word stems (so "apologised" finds "apologize"), with a boost for the characters the question is about. */
(function (G) {
  'use strict';
  const Rag = (G.Rag = { K1: 1.4, B: 0.75, W: { rel: 3, imp: 1.5, rec: 1 }, HALF_LIFE: 4320 });
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const STOP = new Set('the and for that with this have from they them then than were was are you your not but all can had her his him she out one our has its who what when where how why will would could should there their about into just like get got did does done been being also very more most some such only over still too any off own same other which while said say says tell told make made want wants think thinks'.split(' '));
  const stem = (w) => (w.length > 4 ? w.replace(/(ingly|edly|ing|ed|ly|es|s)$/, '') : w);
  Rag.tokens = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).map(stem).filter((w) => w.length >= 3 && !STOP.has(w));

  // cut long text into ~400 character chunks on sentence ends
  Rag.chunks = function (text, size = 400) {
    const out = [];
    let cur = '';
    String(text || '').split(/(?<=[.!?\n])\s+/).forEach((s) => {
      if (cur && (cur + ' ' + s).length > size) {
        out.push(cur);
        cur = '';
      }
      cur = cur ? cur + ' ' + s : s;
    });
    if (cur.trim()) out.push(cur);
    return out;
  };

  let cache = null;
  // everything the world "knows", as scored chunks. canon = never fades (summary, saga, lore, what you directed).
  Rag.corpus = function () {
    const S = G.S;
    if (!S) return [];
    const sig = [Math.floor(S.clock / 20), S.chronicle.length, (S.lore || []).length, (S.directorLog || []).length, S.stSummary ? S.stSummary.text.length : 0, (S.saga || '').length, S.postOrder.length, Object.keys(S.npcs).length].join('|');
    if (cache && cache.sig === sig && cache.S === S) return cache.docs;
    const docs = [];
    const add = (src, text, o = {}) => {
      text = String(text || '').trim();
      if (text.length < 8) return;
      const tk = Rag.tokens(text + ' ' + (o.extra || ''));
      const tf = new Map();
      tk.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      docs.push({ src, text, t: o.t != null ? o.t : S.clock, imp: o.imp != null ? o.imp : 4, canon: !!o.canon, who: o.who || [], tf, len: tk.length || 1, title: o.title || '', links: o.links || [], priv: !!o.priv });
    };
    if (S.stSummary && S.stSummary.text) Rag.chunks(S.stSummary.text).forEach((c) => add('story', c, { imp: 8, canon: true }));
    if (S.saga) Rag.chunks(S.saga).forEach((c) => add('saga', c, { imp: 8, canon: true }));
    (S.lore || []).forEach((l) => add('lore', l.content || l.text || '', { priv: false, imp: l.constant ? 8 : 7, canon: true, extra: (l.keys || []).join(' ') + ' ' + (l.title || ''), title: l.title || '', links: l.links || (G.Vault ? G.Vault.linksOf(l.content || l.text || '') : []) }));
    (S.directorLog || []).forEach((l) => add('directed', l.text + (l.summary ? ' (' + l.summary + ')' : ''), { t: l.t, imp: 7, canon: true }));
    (S.chronicle || []).slice(-80).forEach((c) => add('event', c.text, { t: c.t, imp: 6 }));
    (S.storylines || []).filter((x) => x.status !== 'resolved').forEach((x) => add('plot', `${x.title}: ${x.summary || ''}`, { imp: 6 }));
    // people: what they know, remember, and said to you (only the people who matter lately, so a huge town stays cheap)
    const people = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 300);
    people.forEach((n) => {
      (n.facts || []).slice(-8).forEach((f) => add('fact', `${n.name}: ${f}`, { imp: 7, canon: true, who: [n.id], extra: n.name }));
      (n.mem || []).slice(-12).forEach((m) => add('memory', `${n.name} remembers: ${m.text}`, { t: m.t, imp: m.imp, who: [n.id].concat(m.who || []), extra: n.name }));
      (S.dms[n.id] || []).slice(-6).forEach((m) => add('dm', `${m.from === n.id ? n.name : S.player.name} to ${m.from === n.id ? S.player.name : n.name}: ${m.text}`, { t: m.t, imp: 4, who: [n.id], extra: n.name }));
    });
    (S.channels || []).forEach((c) => c.msgs.slice(-20).forEach((m) => add('channel', `${m.from === 'me' ? S.player.name : (S.npcs[m.from] && S.npcs[m.from].name) || 'someone'} in #${c.name}: ${m.text}`, { t: m.t, imp: 3, who: [m.from] })));
    S.postOrder.slice(-120).forEach((id) => {
      const p = S.posts[id];
      if (!p || p.deleted) return;
      const a = p.author === 'me' ? S.player.name : (S.npcs[p.author] && S.npcs[p.author].name) || '';
      add('post', `${a}${p.replyTo ? ' replied' : ' posted'}: ${p.text}`, { t: p.t, imp: p.author === 'me' ? 4 : 3, who: [p.author], extra: a });
    });
    const df = new Map();
    docs.forEach((d) => d.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const avg = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);
    cache = { sig, S, docs, df, avg };
    return docs;
  };

  /* ---------- vectors ----------
     Free and offline: every text becomes a 512-number vector made from its words, word pairs and 3-letter pieces (feature hashing), so spelling variants,
     word endings and typos still match ("confessed" ~ "confession", "lighthose" ~ "lighthouse"). If you set an embedding model (Storyteller page: an
     OpenRouter id like openai/text-embedding-3-small, or a model on your local server) real semantic vectors are added on top: "car" finds "automobile".
     Keyword (BM25) and vector rankings are merged with Reciprocal Rank Fusion (Cormack et al. 2009, k = 60), the standard hybrid-retrieval recipe. */
  const DIM = 512;
  const h32 = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  Rag.vec = function (text) {
    const toks = Rag.tokens(text);
    const v = new Map();
    const bump = (feat, w) => {
      const h = h32(feat);
      const idx = h % DIM;
      v.set(idx, (v.get(idx) || 0) + ((h >>> 9) & 1 ? w : -w));
    };
    toks.forEach((t) => {
      bump('w:' + t, 1);
      for (let i = 0; i + 3 <= t.length && t.length >= 4; i++) bump('c:' + t.slice(i, i + 3), 0.5);
    });
    for (let i = 0; i + 1 < toks.length; i++) bump('b:' + toks[i] + ' ' + toks[i + 1], 0.7);
    let n = 0;
    v.forEach((x) => (n += x * x));
    n = Math.sqrt(n) || 1;
    v.forEach((x, k) => v.set(k, x / n));
    return v;
  };
  Rag.cos = (a, b) => {
    let s = 0;
    const [x, y] = a.size < b.size ? [a, b] : [b, a];
    x.forEach((v, k) => {
      const o = y.get(k);
      if (o) s += v * o;
    });
    return s;
  };
  // real embeddings (optional): cached for the session, fetched only when you set a model
  Rag.apiVecs = new Map();
  Rag.apiOn = () => !!(G.settings && String(G.settings.embedModel || '').trim() && G.AI && (G.AI.isLocal() || String(G.settings.apiKey || '').trim()));
  Rag.embedBatch = async function (texts) {
    const AI = G.AI;
    const local = AI.isLocal();
    const headers = { 'Content-Type': 'application/json' };
    const key = String(G.settings.apiKey || '').trim();
    if (key) headers.Authorization = 'Bearer ' + key;
    const r = await fetch((local ? AI.base() : 'https://openrouter.ai/api/v1') + '/embeddings', { method: 'POST', headers, body: JSON.stringify({ model: String(G.settings.embedModel).trim(), input: texts }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.data)) throw new Error((j.error && (j.error.message || JSON.stringify(j.error))) || 'embeddings HTTP ' + r.status);
    return j.data.map((x) => x.embedding);
  };
  const cosF = (a, b) => {
    let s = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      s += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return na && nb ? s / Math.sqrt(na * nb) : 0;
  };
  // embeds the question and the newest documents so the next retrieve() can use them (a few hundred tokens: a fraction of a cent)
  Rag.prepare = async function (query) {
    if (!Rag.apiOn() || !String(query || '').trim()) return false;
    const need = [String(query)].concat(Rag.corpus().slice(-120).map((d) => d.text)).filter((t, i, a) => !Rag.apiVecs.has(t) && a.indexOf(t) === i).slice(0, 96);
    if (!need.length) return true;
    try {
      const embs = await Rag.embedBatch(need);
      need.forEach((t, i) => embs[i] && Rag.apiVecs.set(t, Float32Array.from(embs[i])));
      if (Rag.apiVecs.size > 1500) Rag.apiVecs.delete(Rag.apiVecs.keys().next().value);
      Rag.apiErr = '';
      return true;
    } catch (e) {
      Rag.apiErr = e.message; // retrieval carries on with keywords + local vectors
      return false;
    }
  };
  // relevance of each document to the query: the keyword scores (bm) and the vector similarities, merged by rank
  Rag.fuse = function (docs, bm, query) {
    if (!Rag.tokens(query).length) return bm;
    const K = 60;
    const lists = [[bm, 1]]; // [scores, weight]: real embeddings are the most precise signal, the hashed vectors the loosest
    const qv = Rag.vec(query);
    lists.push([docs.map((d) => {
      const c = Rag.cos(d.vec || (d.vec = Rag.vec(d.text)), qv);
      return c > 0.12 ? c : 0;
    }), 0.8]);
    const aq = Rag.apiOn() && Rag.apiVecs.get(String(query));
    if (aq) lists.push([docs.map((d) => { const v = Rag.apiVecs.get(d.text); const c = v ? cosF(aq, v) : 0; return c > 0.2 ? c : 0; }), 1.5]);
    const out = docs.map(() => 0);
    lists.forEach(([sc, wt]) => {
      sc.map((v, i) => [v, i]).filter((x) => x[0] > 1e-6).sort((a, b) => b[0] - a[0]).forEach((x, r) => { out[x[1]] += wt / (K + r + 1); });
    });
    return out;
  };

  const norm = (arr) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    return arr.map((v) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo)));
  };

  // the k most useful chunks for this question: relevance (BM25, boosted for the people named) + importance + recency
  Rag.retrieve = function (query, opts = {}) {
    const S = G.S;
    const docs = Rag.corpus();
    if (!docs.length) return [];
    const k = opts.k || 8;
    const focus = opts.focus || [];
    const names = focus.map((id) => S.npcs[id] && S.npcs[id].name).filter(Boolean).map((n) => n.toLowerCase());
    const q = Rag.tokens(query);
    const N = docs.length;
    const bm = docs.map((d) => {
      let s = 0;
      q.forEach((w) => {
        const f = d.tf.get(w);
        if (!f) return;
        const n = cache.df.get(w) || 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += (idf * f * (Rag.K1 + 1)) / (f + Rag.K1 * (1 - Rag.B + (Rag.B * d.len) / cache.avg));
      });
      if (focus.length && (d.who.some((w) => focus.includes(w)) || names.some((n) => d.text.toLowerCase().includes(n)))) s += 1.2;
      return s;
    });
    const rel = Rag.fuse(docs, bm, query);
    const imp = docs.map((d) => d.imp / 10);
    const rec = docs.map((d) => (d.canon ? 0.85 : Math.pow(0.5, Math.max(0, S.clock - d.t) / Rag.HALF_LIFE)));
    const nr = norm(rel);
    const ni = norm(imp);
    const nc = norm(rec);
    const W = Rag.W;
    const hasQuery = q.length || focus.length;
    const scored = docs.map((d, i) => ({ d, s: (hasQuery ? W.rel * nr[i] : 0) + W.imp * ni[i] + W.rec * nc[i], r: rel[i] }));
    scored.sort((a, b) => b.s - a.s);
    const out = [];
    const seen = new Set();
    for (const x of scored) {
      if (out.length >= k) break;
      if (x.d.priv && !(G.Engine && G.Engine.directing)) continue; // a person-entry of the lorebook is the Director's knowledge only
      if (hasQuery && x.r <= 0 && out.length >= Math.ceil(k / 2)) break; // past the relevant ones, keep only a few "always matters" items
      const key = x.d.text.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x.d);
    }
    if (opts.links !== false && out.some((d) => d.title || (d.links && d.links.length))) {
      const lc = (t) => String(t || '').toLowerCase();
      const byTitle = new Map();
      docs.forEach((d) => { if (d.title) byTitle.set(lc(d.title), d); });
      const have = new Set(out.map((d) => d.text.slice(0, 60)));
      const extra = [];
      const take = (d) => { if (d && extra.length < 3 && !have.has(d.text.slice(0, 60))) { have.add(d.text.slice(0, 60)); extra.push(Object.assign({}, d, { src: 'linked' })); } };
      out.forEach((d) => (d.links || []).forEach((t) => take(byTitle.get(lc(t)))));
      const titles = new Set(out.filter((d) => d.title).map((d) => lc(d.title)));
      if (titles.size) docs.forEach((d) => { if ((d.links || []).some((l) => titles.has(lc(l)))) take(d); });
      out.push(...extra);
    }
    return out;
  };

  const SRC = { story: 'story so far', saga: 'story so far', lore: 'lore', directed: 'you directed', event: 'happened', plot: 'storyline', fact: 'canon', memory: 'memory', dm: 'message', post: 'feed', channel: 'public chat', linked: 'linked note', vault: 'old memory' };
  // a block for a prompt
  Rag.context = function (query, opts = {}) {
    const maxChars = opts.maxChars || 2000;
    let used = 0;
    const lines = [];
    for (const d of Rag.retrieve(query, opts)) {
      const line = `- [${SRC[d.src] || d.src}${d.canon ? '' : ', ' + (G.U && G.U.clockStr ? G.U.clockStr(d.t) : 'earlier')}] ${clip(d.text, 380)}`;
      if (used + line.length > maxChars) break;
      used += line.length;
      lines.push(line);
    }
    return lines.length ? 'RELEVANT MEMORY (retrieved for this question: canon first, then what matters most and most recent):\n' + lines.join('\n') : '';
  };

  // what ONE character remembers about this moment: their whole memory (not just the last few), what they know, every message with the player,
  // the public events they were part of, and the rumours they believe. Same scoring as retrieve().
  Rag.recall = function (n, text, k = 5) {
    const S = G.S;
    if (!n || !S) return [];
    const docs = [];
    const add = (t, o) => {
      t = String(t || '').trim();
      if (t.length < 6) return;
      const tk = Rag.tokens(t);
      const tf = new Map();
      tk.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      docs.push({ text: t, t: o.t != null ? o.t : S.clock, imp: o.imp != null ? o.imp : 4, canon: !!o.canon, tf, len: tk.length || 1, ref: o.ref });
    };
    (n.mem || []).forEach((m) => add(m.text, { t: m.t, imp: m.pin ? Math.max(8, m.imp) : m.imp, ref: m }));
    (n.facts || []).forEach((f) => add(f, { imp: 8, canon: true }));
    if (n.goal && n.goal.text) add('I currently want to ' + n.goal.text, { imp: 8, canon: true });
    (n.tl || []).forEach((e) => add('Our story: ' + e.text, { t: e.t, imp: 8, canon: true }));
    if (G.Vault) {
      G.Vault.lines(n).forEach((l) => add(l.text, { t: l.t, imp: l.imp }));
      const ql = String(text || '').toLowerCase();
      Object.keys(n.vault || {}).forEach((k) => {
        const nm = k === 'me' ? S.player.name : (S.npcs[k] || {}).name;
        const f = String(nm || '').toLowerCase().split(' ')[0];
        if (f.length > 2 && ql.includes(f)) { const sm = G.Vault.summary(n, k); if (sm) add('What I know about ' + nm + ': ' + sm, { imp: 8, canon: true }); }
      });
    }
    (S.dms[n.id] || []).slice(-80).forEach((m) => add(`${m.from === n.id ? 'I' : S.player.name} said: ${m.text}`, { t: m.t, imp: 4 }));
    const first = String(n.name || '').toLowerCase().split(' ')[0];
    if (first.length > 2) {
      (S.chronicle || []).forEach((c) => { if (String(c.text).toLowerCase().includes(first)) add(c.text, { t: c.t, imp: 6 }); });
      (S.directorLog || []).forEach((l) => { if (String(l.text).toLowerCase().includes(first)) add(l.text, { t: l.t, imp: 7, canon: true }); });
    }
    (S.rumors || []).filter((r) => r.belief && r.belief[n.id] >= 0.35).slice(-6).forEach((r) => add('heard: ' + r.text, { t: r.t, imp: 5 }));
    if (!docs.length) return [];
    const q = Rag.tokens(text);
    const df = new Map();
    docs.forEach((d) => d.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
    const N = docs.length;
    const bm = docs.map((d) => {
      let sc = 0;
      q.forEach((w) => {
        const f = d.tf.get(w);
        if (!f) return;
        const c = df.get(w) || 0;
        sc += (Math.log(1 + (N - c + 0.5) / (c + 0.5)) * f * (Rag.K1 + 1)) / (f + Rag.K1 * (1 - Rag.B + (Rag.B * d.len) / avg));
      });
      return sc;
    });
    const rel = Rag.fuse(docs, bm, text);
    const nb = norm(bm);
    const nr = norm(rel).map((v, i) => 0.6 * v + 0.4 * nb[i]); // (rank fusion alone flattens a rare exact word into "one of many that mention Sam": keep some of the keyword strength)
    const ni = norm(docs.map((d) => d.imp / 10));
    const nc = norm(docs.map((d) => (d.canon ? 0.85 : Math.pow(0.5, Math.max(0, S.clock - d.t) / (Rag.HALF_LIFE * (1 + 0.35 * ((d.ref && d.ref.rh) || 0)))))));
    const W = Rag.W;
    const ranked = docs.map((d, i) => ({ d, s: (q.length ? W.rel * nr[i] : 0) + W.imp * ni[i] + W.rec * nc[i] })).sort((a, b) => b.s - a.s);
    const seen = new Set();
    let picks = [];
    for (const x of ranked) {
      if (picks.length >= k) break;
      const key = x.d.text.slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(x.d);
    }
    // what the player TOLD them is never crowded out: delicate things (illness, grief, loss) always surface when the player talks to them,
    // and "what do you know about X / what did I tell you" is answered from everything the player said (about X first)
    if (G.Mem && G.Mem.told && k >= 3) {
      const must = [];
      const docOf = (m) => docs.find((d) => d.ref === m);
      if (ASK.test(String(text || ''))) {
        const topic = new Set(q.filter((w) => !ASK_NOISE.has(w)));
        const said = G.Mem.told(n);
        const on = topic.size ? said.filter((m) => G.Rag.tokens(m.text).some((w) => topic.has(w))) : [];
        (on.length ? on.concat(said.filter((m) => !on.includes(m))) : said).slice(0, k - 1).forEach((m) => must.push(m));
      } else if (k >= 4) {
        G.Mem.delicate(n).slice(0, 1).forEach((m) => must.push(m));
      }
      const mustDocs = must.map(docOf).filter(Boolean);
      if (mustDocs.length) {
        const rest = picks.filter((d) => !mustDocs.includes(d));
        picks = ASK.test(String(text || '')) ? mustDocs.concat(rest).slice(0, k) : picks.filter((d) => !mustDocs.includes(d)).concat(mustDocs).slice(0, k + 1); // (a delicate thing comes on top of the usual k, it never pushes a relevant one out)
      }
    }
    return picks.map((d) => {
      if (d.ref && G.Mem2) G.Mem2.rehearse(d.ref); // used = remembered a bit better next time
      return clip(d.text, 150);
    });
  };
  const ASK = /\bwhat (?:do|did|have|would) you (?:know|remember|recall|hear)|\bwhat (?:did|have|was) i (?:tell|told|say|said|share|mention)|\bdo you (?:remember|recall|know) (?:what|when|that|anything|about)|\bdid i (?:tell|mention|say)\b|\bremind me what\b/i;
  const ASK_NOISE = new Set(['know', 'remember', 'recall', 'hear', 'tell', 'told', 'say', 'said', 'share', 'mention', 'remind', 'anything', 'everything']);
})(window.G);
