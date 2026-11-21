/* Clout — the living world. Runs in the browser for FREE (no API calls): NPCs wake, browse, like, comment, argue,
   post, tell stories, text you, fall in and out of love, gossip, and hold grudges — whether or not you are acting.
   Design borrows from Generative Agents (memory/reflection), OASIS (social-media action space + feed ranking) and
   AI Town (an agent loop that ticks the world forward).                                                       */
(function (G) {
  const U = G.U;
  const E = G.Engine;
  const W = (G.World = { STEP: 10, listener: null, speeds: [0, 4, 10, 25] });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================= state + rng ================= */

  W.ensure = function (S = G.S) {
    S.sim = S.sim || {};
    const m = S.sim;
    if (m.seed == null) m.seed = Math.floor(Math.random() * 1e9) + 1;
    if (m.rng == null) m.rng = U.hash('sim' + m.seed) | 0;
    m.acc = m.acc || 0;
    m.lastReal = m.lastReal || Date.now();
    m.lastHour = m.lastHour != null ? m.lastHour : Math.floor(S.clock / 60);
    m.lastSocial = m.lastSocial != null ? m.lastSocial : -1e9;
    m.ties = m.ties || {};
    m.rollDay = m.rollDay != null ? m.rollDay : U.dayOf(S.clock);
    if (m.day && m.day.d !== U.dayOf(S.clock) && m.rollDay !== U.dayOf(S.clock)) m.prevDay = m.day;
    m.day = m.day && m.day.d === U.dayOf(S.clock) ? m.day : { d: U.dayOf(S.clock), posts: 0, comments: 0, likes: 0, stories: 0, dms: 0, events: 0, follows: 0 };
    S.queue = S.queue || [];
    S.stories = S.stories || [];
    S.rumors = S.rumors || [];
    return m;
  };
  W.setSeed = function (seed, S = G.S) {
    W.ensure(S);
    S.sim.seed = seed;
    S.sim.rng = U.hash('sim' + seed) | 0;
  };
  W.rnd = function () {
    const m = G.S.sim && G.S.sim.rng != null ? G.S.sim : W.ensure(G.S);
    let a = (m.rng = (m.rng + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rnd = () => W.rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const emit = (type, data) => {
    if (W.listener) W.listener(type, data);
  };
  const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const npcs = (S) => Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt); // burner accounts are driven only by the player

  // children of a post, indexed once per run
  const kidsOf = (S, id) => {
    if (!W._kids) indexKids(S);
    return W._kids[id] || [];
  };
  const indexKids = (S) => {
    W._kids = {};
    S.postOrder.forEach((pid) => {
      const p = S.posts[pid];
      if (p && p.replyTo) (W._kids[p.replyTo] = W._kids[p.replyTo] || []).push(p);
    });
  };

  const dayBudget = (npc, S) => {
    const p = G.Persona.ensure(npc);
    const d = U.dayOf(S.clock);
    if (!p.day || p.day.d !== d) p.day = { d, posts: 0, stories: 0, comments: 0, dms: 0, likes: 0 };
    return p.day;
  };
  // A compact per-character awareness ledger. The world owns the event; each NPC only
  // receives a record when they see it, participate in it, or hear it through gossip.
  W.remember = function (npc, entry = {}) {
    if (!npc) return null;
    const list = (npc.awareness = Array.isArray(npc.awareness) ? npc.awareness : []);
    const kind = String(entry.kind || 'event');
    const ref = entry.ref == null ? '' : String(entry.ref);
    const key = `${kind}:${ref || String(entry.text || '').slice(0, 60)}`;
    const old = list.find((x) => x.key === key);
    if (old) {
      old.seenAt = G.S.clock;
      old.confidence = entry.confidence == null ? old.confidence : clamp(Number(entry.confidence) || 0, 0, 1);
      return old;
    }
    const item = {
      key, id: U.uid('kn'), kind, ref, text: String(entry.text || '').slice(0, 200),
      source: entry.source || '', from: entry.from || '', t: entry.t == null ? G.S.clock : entry.t,
      seenAt: G.S.clock, confidence: clamp(Number(entry.confidence == null ? 1 : entry.confidence) || 0, 0, 1),
      channel: entry.channel || 'direct',
    };
    list.push(item);
    if (list.length > 100) list.splice(0, list.length - 100);
    return item;
  };
  W.think = function (npc, entry = {}) {
    if (!npc) return null;
    const item = {
      t: entry.t == null ? G.S.clock : entry.t, action: String(entry.action || 'idle').slice(0, 24),
      summary: String(entry.summary || '').slice(0, 140), reason: String(entry.reason || '').slice(0, 180),
      ref: entry.ref || '', kind: entry.kind || '', confidence: clamp(Number(entry.confidence == null ? 1 : entry.confidence) || 0, 0, 1),
    };
    npc.mind = item;
    npc.mindLog = (Array.isArray(npc.mindLog) ? npc.mindLog : []).concat(item).slice(-24);
    return item;
  };
  W.knowsPost = function (npcOrId, postId) {
    const id = typeof npcOrId === 'string' ? npcOrId : npcOrId && npcOrId.id;
    const p = G.S && G.S.posts && G.S.posts[postId];
    const n = id && G.S.npcs[id];
    return !!(p && (p.author === id || (p.rx && p.rx[id]) || (n && (n.awareness || []).some((x) => x.kind === 'public_post' && x.ref === postId))));
  };
  W.intel = function (S = G.S) {
    const cast = Object.values(S.npcs || {}).filter((n) => !n.blocked && !n.userAlt).map((n) => ({
      id: n.id, name: n.name, handle: n.handle, role: n.role, mind: n.mind || null,
      thoughts: (n.mindLog || []).slice(-5).reverse(),
      draft: n.mindDraft || null,
      knowledge: (n.awareness || []).slice(-10).reverse(),
      facts: (n.facts || []).slice(-8),
      memories: G.Mem ? G.Mem.retrieve(n, { who: [], text: '' }, 5).map((m) => ({ t: m.t, kind: m.kind, text: m.text, who: m.who || [] })) : [],
    }));
    const rumors = (S.rumors || []).map((r) => ({
      id: r.id, text: r.text, about: r.about, truth: r.truth, t: r.t, heat: r.heat,
      holders: Object.entries(r.belief || {}).filter(([, v]) => Number(v) >= 0.35).map(([id, confidence]) => ({ id, name: (S.npcs[id] || {}).name || (id === 'me' ? S.player.name : id), confidence })),
      path: Array.isArray(r.path) ? r.path.slice(-12) : [],
      discussions: Array.isArray(r.discussions) ? r.discussions.slice(-12) : [],
      pendingTalks: Object.values(r.pendingTalks || {}),
    })).reverse();
    return { cast, rumors };
  };
  const tie = (S, a, b, n = 1) => {
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    S.sim.ties[k] = Math.min(20, (S.sim.ties[k] || 0) + n);
  };

  // gentle, capped drift of how an NPC feels about the PLAYER from ordinary interactions
  W.nudgeRel = function (npc, d) {
    const p = G.Persona.ensure(npc);
    const day = U.dayOf(G.S.clock);
    if (!p.rd || p.rd.d !== day) p.rd = { d: day, aff: 0, rom: 0, riv: 0 };
    const cap = (k, v, lo, hi) => {
      const next = clamp(p.rd[k] + v, lo, hi);
      const real = next - p.rd[k];
      p.rd[k] = next;
      return real;
    };
    const rel = {};
    if (d.aff) rel.aff = cap('aff', d.aff, -3, 3);
    if (d.rom) rel.rom = cap('rom', d.rom, -2, 2);
    if (d.riv) rel.riv = cap('riv', d.riv, -2, 3);
    const mag = Math.abs(rel.aff || 0) + Math.abs(rel.rom || 0) + Math.abs(rel.riv || 0);
    if (mag < 0.02) return;
    // apply in whole steps so the (integer) relationship meters actually move over time
    p.frac = p.frac || { aff: 0, rom: 0, riv: 0 };
    const whole = {};
    ['aff', 'rom', 'riv'].forEach((k) => {
      if (!rel[k]) return;
      p.frac[k] += rel[k];
      const w = Math.trunc(p.frac[k]);
      if (w) {
        whole[k] = w;
        p.frac[k] -= w;
      }
    });
    if (Object.keys(whole).length) E.applyRel(npc, whole);
  };

  /* ================= posting primitives ================= */

  W.addNpcPost = function () {
    // NPC-authored top-level posts require an explicit Storyteller direction.
    return null;
  };

  const VAL = { cheer: 0.08, compliment: 0.08, flirt: 0.07, agree: 0.06, empathize: 0.05, defend: 0.06, thanks: 0.03, hostile: -0.14, shade: -0.08, critique: -0.07, jealous: -0.04, clapback: -0.05 };

  // aggregated notification ("Mia and 4 others liked your post")
  W.notifAgg = function (type, postId, name, now) {
    const S = G.S;
    let n = S.notifs.find((x) => x.type === type && x.postId === postId && x.agg);
    if (!n) {
      n = { id: U.uid('nt'), t: now, type, postId, agg: true, names: [], count: 0, text: '', read: false };
      S.notifs.unshift(n);
      if (S.notifs.length > 120) S.notifs.length = 120;
    }
    n.names = Array.isArray(n.names) ? n.names : [];
    if (!n.names.includes(name)) n.names.push(name);
    n.count++;
    n.t = now;
    n.read = false;
    const first = n.names[0];
    const verb = type === 'like' ? 'liked your post' : type === 'storylike' ? 'reacted to your story' : 'replied to your post';
    n.text = n.count <= 1 ? `${first} ${verb}` : `${first} and ${n.count - 1} other${n.count > 2 ? 's' : ''} ${verb}`;
  };

  W.like = function (npc, post, t) {
    const S = G.S;
    post.stats.likes++;
    post.stats.views = Math.max(post.stats.views || 0, post.stats.likes * 6);
    (post.likedBy = post.likedBy || []).push(npc.id);
    if (post.likedBy.length > 40) post.likedBy.shift();
    G.Persona.ensure(npc).lastActive = t;
    dayBudget(npc, S).likes++;
    S.sim.day.likes++;
    tie(S, npc.id, post.author, 0.3);
    if (post.author === 'me') {
      W.notifAgg('like', post.id, npc.name, t);
      W.nudgeRel(npc, { aff: 0.12 });
    } else if (S.npcs[post.author]) G.Persona.nudge(S.npcs[post.author], 0.01);
    emit('like', { npc, post });
  };

  W.addComment = function (npc, parent, stance, text, t, opt = {}) {
    const S = G.S;
    if (!opt.vetted) { // the last safety net: whatever wrote this line, common sense has the final word (callers tolerate null = said nothing)
      const v = W.vetComment(npc, parent, stance, text);
      if (!v.text) return null;
      if (v.text !== text) { text = v.text; stance = v.stance || stance; }
    }
    const c = E.addPost({ author: npc.id, text, replyTo: parent.id, t, buzz: 2, stats: E.npcStats(npc, 2) }, S);
    c.stance = stance;
    c.rx = {};
    if (W._kids) (W._kids[parent.id] = W._kids[parent.id] || []).push(c);
    parent.stats.replies = (parent.stats.replies || 0) + 1;
    const p = G.Persona.ensure(npc);
    p.lastActive = t;
    dayBudget(npc, S).comments++;
    S.sim.day.comments++;
    const au = parent.author;
    tie(S, npc.id, au, 1);
    if (S.npcs[au]) W.remember(S.npcs[au], { kind: 'comment_received', ref: c.id, text: `${npc.name} commented on my post: ${text}`, source: npc.id, t, confidence: 1, channel: 'notification' });
    const neg = ['hostile', 'shade', 'critique', 'jealous', 'clapback'].includes(stance);
    if (au === 'me') {
      E.addNotif('reply', `${npc.name} ${stance === 'hostile' ? 'commented' : 'replied'}: "${text.slice(0, 80)}"`, { npcId: npc.id, postId: c.id });
      if (G.Mem) G.Mem.add(npc, { kind: neg ? 'shade' : stance === 'flirt' ? 'flirt' : 'comment', text: `I told ${S.player.name}: "${text.slice(0, 60)}"`, who: ['me'], valence: neg ? -0.3 : 0.3 });
      if (neg) W.nudgeRel(npc, { riv: stance === 'hostile' ? 0.3 : 0.12, aff: -0.1 });
      else if (stance === 'flirt') W.nudgeRel(npc, { rom: 0.25, aff: 0.1 });
      else if (VAL[stance] > 0) W.nudgeRel(npc, { aff: 0.18 });
    } else if (S.npcs[au]) {
      const target = S.npcs[au];
      G.Persona.nudge(target, VAL[stance] || 0);
      const tp = G.Persona.ensure(target);
      if (G.Mem) {
        G.Mem.add(target, { kind: neg ? (stance === 'hostile' ? 'fight' : 'shade') : stance === 'flirt' ? 'flirt' : VAL[stance] > 0.05 ? 'compliment' : 'comment', text: `${npc.name} said "${text.slice(0, 70)}" on my post`, who: [npc.id], valence: neg ? -0.6 : 0.4 });
        G.Mem.add(npc, { kind: neg ? 'shade' : 'comment', text: `I replied to ${target.name}'s post: "${text.slice(0, 60)}"`, who: [target.id], valence: neg ? -0.2 : 0.2 });
      }
      if (neg) tp.grudges[npc.id] = clamp((tp.grudges[npc.id] || 0) + 0.12 * (0.6 + tp.t.N / 100), 0, 1);
      // friends of the target may step in (the "correction" effect)
      if (['hostile', 'shade', 'critique'].includes(stance)) {
        npcs(S).forEach((f) => {
          if (f.id === npc.id || f.id === target.id) return;
          const r = G.React.relation(S, f, target.id);
          if (r.c > 0.55 && rnd() < 0.55) W.schedule(t + 8 + Math.floor(rnd() * 200), { type: 'defend', npc: f.id, comment: c.id });
        });
        if (au !== 'me') W.schedule(t + 20 + Math.floor(rnd() * 240), { type: 'respond', npc: au, comment: c.id });
      }
    }
    if (opt.noEmit) return c;
    emit('comment', { npc, post: parent, comment: c, stance });
    return c;
  };

  /* ================= common sense (G.Mind): nothing an NPC says should be tone-deaf ================= */

  const postBody = (p) => String((p && p.text) || '') + (p && p.attach ? ' ' + p.attach : '');
  const nameOf = (S, id) => (id === 'me' ? S.player.name : (S.npcs[id] || {}).name || '');

  // is this line fine for this NPC to say under `parent`? -> { text, stance? } (text null = say nothing; a different text = the repaired line)
  W.vetComment = function (npc, parent, stance, text) {
    const S = G.S;
    const ok = { text };
    if (!G.Mind || !npc || !text) return text ? ok : { text: null };
    try {
      const isReply = !!parent.replyTo;
      const root = (isReply && S.posts[parent.replyTo]) || parent;
      const about = isReply ? postBody(root) + ' ' + String(parent.text || '') : postBody(parent);
      const rel = parent.author === 'crowd' ? { c: 0.05, h: 0.05 } : G.React.relation(S, npc, parent.author);
      const thread = [root.author, parent.author].concat(kidsOf(S, root.id).map((k) => k.author));
      const v = G.Mind.vet(npc, text, { kind: isReply ? 'reply' : 'comment', about, aboutAuthor: parent.author, thread, rel });
      if (v.ok) return ok;
      if (v.drop) return { text: null };
      if (isReply) return { text: G.Voice.safeReply(npc, rnd), stance: 'thanks' }; // a plain thank-you instead of the joke
      const r = G.Mind.read(about);
      const fixed = G.Voice.care(npc, { about, rel, rnd, authorName: nameOf(S, parent.author) }, r.good ? 'cheer' : 'empathize');
      return fixed ? { text: fixed, stance: r.sens >= 0.5 ? 'empathize' : 'cheer' } : { text: null };
    } catch (e) {
      return ok;
    }
  };

  // write a comment (or a reply) that fits: care for a delicate post, a topical line for an ordinary one, templates as fallback; every candidate is vetted.
  // -> { text, stance } or null (nothing worth saying: like it, or stay out)
  W.composeComment = function (npc, parent, stance, ctx) {
    if (!parent.replyTo && G.Mind && G.Voice.care) {
      const care = G.Voice.care(npc, ctx, stance); // goes straight to the caring voice: the memory / story callbacks wrapped around Voice.comment know nothing about feelings
      if (care != null) return care ? { text: care, stance } : null;
    }
    for (let i = 0; i < 4; i++) {
      const text = G.Voice.comment(npc, stance, ctx);
      if (!text || G.Persona.dupText(npc, text)) continue;
      const v = W.vetComment(npc, parent, stance, text);
      if (v.text) return { text: v.text, stance: v.stance || stance };
    }
    for (let i = 0; i < 3; i++) { // the plain voice: no callbacks, no gossip, always on topic
      const text = (G.Voice.plainComment || G.Voice.comment)(npc, stance, ctx);
      if (!text) continue;
      const v = W.vetComment(npc, parent, stance, text);
      if (v.text) return { text: v.text, stance: v.stance || stance };
    }
    return null;
  };

  // a crowd / AI-written comment under `parent`: refuse rumours and strangers' names under an unrelated post (true = fine to post)
  W.crowdOk = function (parent, text, who) {
    if (!G.Mind) return true;
    try {
      return G.Mind.vet(who || { id: 'crowd', name: '' }, text, { kind: 'comment', about: postBody(parent), aboutAuthor: parent.author, thread: [parent.author], rel: { c: 0.05, h: 0.05 } }).ok;
    } catch (e) {
      return true;
    }
  };

  // minutes until this person is awake (0 = awake now)
  W.untilAwake = function (npc, t) {
    for (let m = 0; m <= 960; m += 10) if (G.Persona.awake(npc, hourOf(t + m)) > 0) return m;
    return 360;
  };

  // They SAW something heavy or wonderful from someone: it is remembered (important, so chatter never evicts it) and it moves their mood. Once per person per post.
  W.absorb = function (npc, post, rel, t) {
    if (!G.Mind || !post || !G.Mem) return false;
    const body = postBody(post);
    const r = G.Mind.read(body);
    if (r.sens < 0.5 && !r.good) return false;
    rel = rel || G.React.relation(G.S, npc, post.author);
    if (rel.c < 0.2 || rel.h > 0.55) return false; // strangers and enemies are not moved (and do not keep it)
    const flag = (post.care && post.care[npc.id]) || 0;
    if (flag & 1) return false;
    (post.care = post.care || {})[npc.id] = flag | 1;
    const who = nameOf(G.S, post.author) || 'Someone';
    const heavy = r.sens >= 0.5;
    G.Mem.add(npc, { kind: 'event', text: heavy ? `${who} posted something heavy: "${String(post.text || '').slice(0, 80)}". I want to be there for them` : `${who} shared good news: "${String(post.text || '').slice(0, 80)}"`, who: [post.author], valence: heavy ? -0.4 : 0.5, imp: G.Mind.salience(body, 'event'), t });
    const f = G.Mind.feel(npc, r, rel);
    if (f && f.dv) G.Persona.nudge(npc, f.dv, 0.1);
    return true;
  };

  // when does a caring DM go out? within a few hours, but not while they sleep, unless it is an emergency and they are close
  const careDelay = (npc, t, sens, rel) => {
    const emergency = sens >= 0.75 && rel.c >= 0.45;
    if (emergency) return 10 + Math.floor(rnd() * 50);
    const base = 20 + Math.floor(rnd() * 160);
    const asleep = W.untilAwake(npc, t + base);
    return base + (asleep ? asleep + 5 + Math.floor(rnd() * 40) : 0);
  };
  // the player posted something heavy: the people who love them check in, ONE message each, once per post (cap 4 per post)
  W.planCare = function (obj, t, isStory) {
    const S = G.S;
    if (!G.Mind || !obj || obj.author !== 'me' || obj.replyTo) return 0;
    const r = G.Mind.read(postBody(obj));
    if (r.sens < 0.5) return 0;
    const cands = [];
    npcs(S).forEach((npc) => {
      if (obj.audience === 'close' && !E.isClose(npc)) return;
      if (obj.care && obj.care[npc.id] & 2) return;
      const rel = G.React.relation(S, npc, 'me');
      if (rel.c < 0.45 || rel.h > 0.3) return;
      cands.push([rel.c, npc, rel]);
    });
    cands.sort((a, b) => b[0] - a[0]);
    let n = 0;
    cands.slice(0, 4).forEach(([, npc, rel]) => {
      obj.care = obj.care || {};
      obj.care[npc.id] = (obj.care[npc.id] || 0) | 2;
      W.schedule(t + careDelay(npc, t, r.sens, rel), { type: 'care', npc: npc.id, post: obj.id, story: !!isStory });
      n++;
    });
    return n;
  };
  W.deliverCare = function (npc, q) {
    const S = G.S;
    const obj = q.story ? (S.stories || []).find((s) => s.id === q.post) : S.posts[q.post];
    if (!obj || obj.deleted || !G.Mind) return null;
    const rel = G.React.relation(S, npc, 'me');
    if (rel.h > 0.55) return null;
    const list = S.dms[npc.id] || [];
    const lastMe = list.slice().reverse().find((m) => m.from === 'me');
    if (lastMe && lastMe.t >= obj.t) return null; // they are already talking: the reply covers it
    const body = postBody(obj);
    const line = G.Voice.care(npc, { about: body, rel, rnd, authorName: S.player.name, dm: true });
    if (!line) return null;
    W.absorb(npc, obj, rel, q.due);
    const m = W.sendDm(npc, 'care', q.due, { text: line, care: true, ref: G.Refs ? (q.story ? G.Refs.story(obj.id) : G.Refs.post(obj.id)) : null });
    if (m && G.Mem) G.Mem.add(npc, { kind: 'said', text: `I checked on ${S.player.name} after they posted: "${String(obj.text || '').slice(0, 70)}"`, who: ['me'], valence: 0.3, imp: Math.max(8, G.Mind.salience(body, 'said')), t: q.due });
    return m;
  };

  // is the player in a heavy moment with THIS person right now? (their last message to them, or their latest posts)
  W.heavyContext = function (npc, t) {
    const S = G.S;
    if (!G.Mind) return null;
    let best = null;
    const list = S.dms[npc.id] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.from !== 'me') continue;
      if (t - m.t <= 240) {
        const r = G.Mind.read(m.text);
        if (r.sens >= 0.5) best = { sens: r.sens, text: m.text, post: null };
      }
      break;
    }
    for (let i = S.postOrder.length - 1, seen = 0; i >= 0 && seen < 30; i--) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p.replyTo || p.author !== 'me') continue;
      seen++;
      if (t - p.t > 4320) break;
      const s = p.fx && p.fx.sens != null ? p.fx.sens : G.Mind.read(postBody(p)).sens;
      const window = s >= 0.9 ? 4320 : s >= 0.75 ? 2160 : 720; // grief and crisis stay heavy for days, a bad day for hours
      if (s >= 0.5 && t - p.t <= window && (!best || s > best.sens)) best = { sens: s, text: postBody(p), post: p };
    }
    for (let i = (S.stories || []).length - 1, seen = 0; i >= 0 && seen < 10; i--) {
      const st = S.stories[i];
      if (!st || st.author !== 'me') continue;
      seen++;
      if (t - st.t > 720) break;
      const s = G.Mind.read(st.text).sens;
      if (s >= 0.5 && (!best || s > best.sens)) best = { sens: s, text: String(st.text), post: st };
    }
    return best;
  };

  /* ================= scheduling ================= */

  W.schedule = function (due, item) {
    const S = G.S;
    if (S.queue.length > 400) S.queue.shift();
    S.queue.push(Object.assign({ due }, item));
  };
  W.processQueue = function (t) {
    const S = G.S;
    if (!S.queue.length) return;
    const due = S.queue.filter((q) => q.due <= t);
    if (!due.length) return;
    S.queue = S.queue.filter((q) => q.due > t);
    due.forEach((q) => {
      try {
        const npc = S.npcs[q.npc];
        if (!npc || npc.blocked) return;
        if (q.type === 'defend' || q.type === 'respond') {
          const cm = S.posts[q.comment];
          if (!cm || !cm.replyTo || !S.posts[cm.replyTo]) return;
          if (cm.rb) return;
          const parent = S.posts[cm.replyTo];
          const p = G.Persona.ensure(npc);
          if (q.type === 'defend') {
            const r = G.React.relation(S, npc, parent.author);
            if (rnd() > r.c * (0.35 + 0.55 * p.t.A / 100) * 1.5) return;
            cm.rb = true;
            const out = W.composeComment(npc, cm, 'defend', { rnd, authorName: parent.author === 'me' ? S.player.name : (S.npcs[parent.author] || {}).name, authorHandle: '' });
            if (out) W.addComment(npc, cm, out.stance, out.text, q.due, { vetted: true });
          } else {
            const st = G.React.replyStance(S, npc, cm, { rnd });
            if (!st) return;
            cm.rb = true;
            const out = W.composeComment(npc, cm, st, { rnd, authorName: (S.npcs[cm.author] || {}).name || '' });
            if (out) W.addComment(npc, cm, st === 'flirt_back' ? 'flirt' : out.stance, out.text, q.due, { vetted: true });
          }
        } else if (q.type === 'care') {
          W.deliverCare(npc, q);
        } else if (q.type === 'dmreply') {
          W.deliverReply(npc, q);
        } else if (q.type === 'react') {
          const post = S.posts[q.post];
          if (post && !(post.rx && post.rx[npc.id])) W.reactTo(npc, post, q.due);
        } else if (q.type === 'rumorTalk') {
          W.completeRumorTalk(q, q.due);
        }
      } catch (e) {
        console.warn('[clout] queue item failed:', e.message);
      }
    });
  };

  /* ================= browsing the feed ================= */

  const AGE_TAU = 600; // minutes: how fast a post goes stale in the feed
  W.candidates = function (S, npc, t) {
    const out = [];
    const ids = S.postOrder;
    for (let i = ids.length - 1, seen = 0; i >= 0 && seen < 70; i--) {
      const p = S.posts[ids[i]];
      if (!p || p.replyTo) continue;
      seen++;
      const age = t - p.t;
      if (age > 2160) break;
      if (p.author === npc.id || (p.rx && p.rx[npc.id])) continue;
      if (p.author !== 'me' && seen > 14 && rnd() < 0.5) continue; // nobody reads every post: skim the older ones
      const au = S.npcs[p.author];
      if (au && au.blocked) continue;
      if (p.audience === 'close') { // a close-friends post is only seen by close friends (yours: the people you chose; theirs: their own circle)
        if (p.author === 'me' || (au && au.userAlt)) { if (!E.isClose(npc)) continue; }
        else if (!(au && G.Social.sameCircle(npc, au))) continue;
      }
      const rel = p.author === 'crowd' ? { c: 0.05, fam: 0.05 } : G.React.relation(S, npc, p.author);
      const persona = G.Persona.ensure(npc);
      // `following` belongs to the reader: an NPC sees the player in their feed
      // only if that NPC follows 'me', not because the player follows the NPC.
      const follows = (persona.following || []).includes(p.author);
      const sameCircle = !!(au && G.Social.sameCircle(npc, au));
      const mentioned = String(p.text || '').toLowerCase().includes(String(npc.handle || '').toLowerCase());
      const topics = G.React.features(S, p).topics || [];
      const interested = topics.some((topic) => (persona.interests || []).includes(topic));
      const proof = G.React.proof(p, (au ? au.followers : S.player.followers) || 100);
      // Public does not mean personally seen: most posts stay inside a character's
      // circles unless a strong signal or topic interest puts them in discovery.
      const reached = follows || sameCircle || rel.c > 0.22 || mentioned || (proof > 0.7 && rnd() < 0.25) || (interested && rnd() < 0.3);
      if (!reached) continue;
      const w = Math.exp(-age / AGE_TAU) * (0.25 + rel.c + 0.5 * rel.fam + (follows ? 0.25 : 0) + (mentioned ? 0.8 : 0) + (p.author === 'me' ? 0.2 : 0)) * (1 + proof);
      out.push([w, p]);
    }
    return out;
  };

  W.browse = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    const E1 = p.t.E / 100;
    const k = 1 + Math.floor(rnd() * (2 + 3 * E1));
    const cands = W.candidates(S, npc, t);
    for (let n = 0; n < k && cands.length; n++) {
      const sum = cands.reduce((a, x) => a + x[0], 0);
      let x = rnd() * sum;
      let i = 0;
      while (i < cands.length - 1 && (x -= cands[i][0]) > 0) i++;
      W.reactTo(npc, cands.splice(i, 1)[0][1], t);
    }
  };

  // one NPC sees one post: maybe like it, maybe comment (in character)
  W.reactTo = function (npc, post, t) {
    const S = G.S;
    post.rx = post.rx || {};
    post.rx[npc.id] = 1;
    const author = post.author === 'me' ? G.S.player : G.S.npcs[post.author];
    W.remember(npc, { kind: 'public_post', ref: post.id, text: `${author ? author.name : 'Someone'} posted: ${post.text}`, source: post.author, t: post.t, confidence: 1, channel: 'feed' });
    const tagged = post.author === 'me' && npc.handle && String(post.text || '').toLowerCase().includes(String(npc.handle).toLowerCase());
    const hostileTag = tagged && (G.Lex.intent(post.text) === 'insult' || G.Lex.analyze(post.text).sent.compound < -0.45);
    if (hostileTag) {
      post.taggedHit = post.taggedHit || {};
      if (!post.taggedHit[npc.id]) {
        post.taggedHit[npc.id] = 1;
        E.applyRel(npc, { aff: -5, trust: -5, riv: 4 });
        const p = G.Persona.ensure(npc);
        p.grudges.me = clamp((p.grudges.me || 0) + 0.18, 0, 1);
        if (G.Mem) G.Mem.add(npc, { kind: 'fight', text: `${S.player.name} called me out publicly: "${String(post.text).slice(0, 70)}"`, who: ['me'], valence: -0.7, imp: 6 });
      }
    }
    const p = G.Persona.ensure(npc);
    const E1 = p.t.E / 100;
    const budget = dayBudget(npc, S);
      const maxC = 1 + Math.round(2 * E1); // a few deliberate comments per day, not a reply to everything
    const kids = kidsOf(S, post.id).filter((c) => c.stance);
    const d = G.React.decide(S, npc, post, { rnd, now: t, comments: kids });
    const topic = ((post.fx && post.fx.topics) || [])[0] || 'the post';
    const willComment = d.comment && budget.comments < maxC;
    const heldBack = d.comment && !willComment;
    const reason = willComment ? `${d.stance} response to ${author ? author.name : 'a public account'}; relevance, relationship and the thread made it worth joining.` : heldBack ? 'Had a response in mind but held back after already commenting enough today.' : d.like ? `Showed quiet support for ${author ? author.name : 'the post author'} without joining the thread.` : 'Saw it, but chose not to react; it was not compelling enough to join.';
    W.think(npc, { t, action: willComment ? 'comment' : heldBack ? 'hold_comment' : d.like ? 'like' : 'scroll', summary: willComment ? `Joined a thread about ${topic}.` : heldBack ? `Held back from replying about ${topic}.` : d.like ? `Liked a post about ${topic}.` : `Scrolled past a post about ${topic}.`, reason, ref: post.id, kind: 'feed_decision' });
    if (d.like) W.like(npc, post, t);
    if (post.fx && (post.fx.sens >= 0.5 || post.fx.good)) W.absorb(npc, post, d.rel, t); // they saw something heavy / wonderful: remembered, and it moves their mood
    if (willComment) {
      const au = post.author === 'me' ? S.player : S.npcs[post.author] || { name: '', handle: '' };
      const ctx = { post, rnd, rel: d.rel, authorName: au.name, authorHandle: au.handle, side: '', other: '', agree: d.agree, hot: d.hot, topic: post.fx && post.fx.topics && post.fx.topics[0] };
      if (d.stance === 'debate' && post.fx && post.fx.debate) {
        const dd = G.Lex.DEBATES.find((x) => x.id === post.fx.debate);
        const mine = p.stance[post.fx.debate] >= 0;
        ctx.side = mine ? dd.a : dd.b;
        ctx.other = mine ? dd.b : dd.a;
        ctx.agree = true;
      }
      const out = W.composeComment(npc, post, d.stance, ctx);
      if (out) {
        G.Persona.noteText(npc, out.text);
        const c = W.addComment(npc, post, out.stance, out.text, t, { vetted: true });
        if (c && d.stance === 'critique' && post.fx && post.fx.debate) c.debate = post.fx.debate;
      }
    }
    if (post.author === 'me' && !d.like && !d.comment) W.nudgeRel(npc, { aff: -0.02 }); // scrolled past you
    return d;
  };

  // reactions to something the player just posted trickle in over the next hours (people notice at different speeds)
  W.firstWave = function (post) {
    const S = G.S;
    W.ensure(S);
    const t = S.clock;
    if (post.author === 'me' && !post.replyTo) W.planCare(post, t); // something heavy? the people who love them check in, privately
    npcs(S).forEach((npc) => {
      const p = G.Persona.ensure(npc);
      const aw = G.Persona.awake(npc, hourOf(t));
      const rel = G.React.relation(S, npc, post.author);
      const follows = (p.following || []).includes(post.author);
      const connected = follows || rel.c > 0.22 || (S.npcs[post.author] && G.Social.sameCircle(npc, S.npcs[post.author]));
      if (!connected && !String(post.text || '').toLowerCase().includes(String(npc.handle || '').toLowerCase())) return;
      const notice = clamp((0.08 + (follows ? 0.35 : 0) + 0.55 * rel.fam + 0.35 * rel.c) * (0.3 + 0.7 * Math.min(1, aw)) * (0.5 + p.t.E / 100), 0, 0.88);
      if (rnd() > notice) return;
      const delay = Math.round(-Math.log(1 - rnd()) * (aw ? 45 : 240) * (1.25 - p.t.E / 110)); // exponential waiting time
      W.schedule(t + 2 + delay, { type: 'react', npc: npc.id, post: post.id });
    });
  };

  // a quick guess at a comment's stance (for AI-written comments, so threads can continue locally)
  W.inferStance = function (text) {
    const an = G.Lex.analyze(text);
    const it = G.Lex.intent(text);
    const s = an.sent;
    if (it === 'flirt' || s.flirt > 0.45) return 'flirt';
    if (it === 'insult' || s.compound < -0.5) return 'hostile';
    if (s.compound < -0.15 || s.shade > 0.4) return 'critique';
    if (s.question) return 'curious';
    if (s.compound > 0.35) return 'cheer';
    if (s.compound > 0.05) return 'agree';
    return 'tease';
  };

  // offline judge of the player's own post (no AI): sentiment (VADER), hooks, format
  W.localJudge = function (text, extra) {
    const x = extra || {};
    const an = G.Lex.analyze(text + ' ' + (x.attach || ''));
    const s = an.sent;
    const emojis = (String(text).match(/\p{Extended_Pictographic}/gu) || []).length;
    const len = String(text).length;
    let q = 4 + (len > 18 && len < 230 ? 1.4 : 0) + (an.topics.length ? 0.8 : 0) + (/[!?]/.test(text) ? 0.3 : 0) + Math.min(1.2, emojis * 0.4) + (an.tags.length ? 0.5 : 0) + Math.abs(s.compound || 0) * 1.4 + (['photo', 'poll', 'video'].includes(x.type) ? 1 : 0) + (rnd() - 0.5) * 2;
    let v = 2 + s.ctrl * 4 + (Math.abs(s.compound || 0) > 0.6 ? 1.4 : 0) + (an.tags.length ? 0.8 : 0) + s.brag * 1.2 + (rnd() - 0.5) * 2.2;
    const c = Math.round(clamp(Math.max(s.ctrl, s.shade) * 10, 0, 10));
    const tone = /lol|haha|😂|lmao/i.test(text) ? 'funny' : s.ctrl > 0.5 ? 'spicy' : s.vuln > 0.4 ? 'vulnerable' : s.flirt > 0.4 ? 'flirty' : s.pos > 0.6 ? 'wholesome' : 'casual';
    return { quality: clamp(Math.round(q), 1, 10), virality: clamp(Math.round(v), 1, 10), sentiment: clamp(Math.round((s.compound || 0) * 10), -10, 10), controversy: c, tone, summary: 'built-in simulation' };
  };

  // reply to comments people left on this NPC's own posts
  W.replyPass = function (npc, t) {
    const S = G.S;
    const ids = S.postOrder;
    let handled = 0;
    for (let i = ids.length - 1, scanned = 0; i >= 0 && scanned < 260 && handled < 2; i--, scanned++) {
      const p = S.posts[ids[i]];
      if (!p) continue;
      if (t - p.t > 1440) break; // postOrder is chronological: nothing older matters
      if (p.replyTo || p.author !== npc.id) continue;
      for (const c of kidsOf(S, p.id)) {
        if (c.rb || !c.stance || c.author === npc.id) continue;
        c.rb = true;
        const st = G.React.replyStance(S, npc, c, { rnd });
        if (!st) continue;
        const out = W.composeComment(npc, c, st, { rnd, authorName: (S.npcs[c.author] || {}).name || '' });
        if (!out) continue;
        W.addComment(npc, c, st === 'flirt_back' ? 'flirt' : out.stance, out.text, t, { vetted: true });
        handled++;
        break;
      }
    }
  };

  /* ================= the NPC's own posts + stories ================= */

  W.chooseKind = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    const tr = p.t;
    const E1 = tr.E / 100, A = tr.A / 100, N = tr.N / 100, C = tr.C / 100, O = tr.O / 100;
    const h = hourOf(t);
    const mood = p.mood.v;
    const likes = (x) => (p.interests.includes(x) ? 1 : 0);
    const edges = S.npcRel.filter((e) => e.a === npc.id || e.b === npc.id);
    const partner = edges.find((e) => e.type === 'dating' || e.type === 'partner');
    const crush = edges.find((e) => e.type === 'crush');
    const grudge = Math.max(0, ...Object.values(p.grudges));
    const meal = (h >= 11 && h <= 14) || (h >= 18 && h <= 21) ? 2 : 0.5;
    const w = {
      selfie: 0.5 + 0.9 * E1 + 0.3 * A,
      food: 0.5 * meal + likes('food') * 0.9,
      fitness: 0.12 + 0.3 * C + likes('fitness') * 1.1,
      motivation: 0.1 + 0.8 * C * (mood > 0 ? 1 : 0.4),
      vent: N * (mood < -0.1 ? 2.2 : 0.35),
      subtweet: grudge > 0.2 ? 0.6 + grudge * 2.2 : 0.06 + (1 - A) * 0.25 * N,
      callout: grudge > 0.6 ? 0.5 + grudge : 0,
      win: mood > 0.35 ? 0.35 : 0.04,
      meme: p.humor === 'none' ? 0.2 : 0.6 + 0.3 * E1 + likes('memes') * 0.6,
      romance: partner ? 0.9 : crush ? 0.45 : 0.08,
      poll: 0.1 + O * 0.35 + E1 * 0.25,
      throwback: 0.12,
      night: h < 4.5 || h >= 23 ? 1.4 : 0,
      morning: h >= 6 && h <= 10 ? 0.9 * (p.chrono === 0 ? 1.6 : 1) : 0,
      shoutout: edges.some((e) => e.type === 'friend' || e.type === 'best_friend') ? 0.3 * A + 0.1 : 0,
      travel: 0.05 + likes('travel') * 0.8,
      pet: likes('pets') * 0.9,
      art: likes('art') * 0.7,
    };
    if (h >= 1 && h < 5.5) {
      w.selfie *= 0.3;
      w.food *= 0.2;
      w.fitness *= 0.1;
    }
    // people vary what they post: never the same kind twice running, and the one before that is less likely too
    const lk = p.lastKinds || [];
    if (lk.length && w[lk[lk.length - 1]] != null) w[lk[lk.length - 1]] = 0;
    if (lk.length > 1 && w[lk[lk.length - 2]] != null) w[lk[lk.length - 2]] *= 0.55;
    let sum = 0;
    Object.keys(w).forEach((k) => (sum += Math.max(0, w[k])));
    let x = rnd() * sum;
    for (const k of Object.keys(w)) {
      x -= Math.max(0, w[k]);
      if (x <= 0) {
        p.lastKinds = (p.lastKinds || []).concat(k).slice(-3);
        return k;
      }
    }
    return 'selfie';
  };

  W.considerPost = function (npc, t) {
    const p = G.Persona.ensure(npc);
    if (npc.mindDraft && npc.mindDraft.expires > t) return npc.mindDraft;
    if (p.lastPostThought != null && t - p.lastPostThought < 480) return null;
    p.lastPostThought = t;
    const E1 = p.t.E / 100;
    const urge = 0.07 + 0.15 * E1 + Math.max(0, p.mood.v) * 0.05;
    if (rnd() > urge) {
      W.think(npc, { t, action: 'hold_post', summary: 'Thought about posting, but kept scrolling.', reason: 'Nothing felt worth sharing publicly right now.', kind: 'post_decision' });
      return null;
    }
    const kind = W.chooseKind(npc, t);
    const edges = G.S.npcRel.filter((e) => e.a === npc.id || e.b === npc.id);
    const friendEdge = edges.find((e) => ['friend', 'best_friend'].includes(e.type));
    const friend = friendEdge && G.S.npcs[friendEdge.a === npc.id ? friendEdge.b : friendEdge.a];
    const out = G.Voice.post(npc, kind, { rnd, slots: { friend: friend ? friend.handle : 'my people', rival: 'someone' } });
    if (!out || !out.text || G.Persona.dupText(npc, out.text)) return null;
    npc.mindDraft = { id: U.uid('draft'), kind, text: String(out.text).slice(0, 500), created: t, expires: t + 1440 };
    W.think(npc, { t, action: 'draft_post', summary: `Has a private ${kind} post draft in mind.`, reason: 'This is an unposted idea; it waits for the Director before publication.', ref: npc.mindDraft.id, kind: 'post_draft' });
    return npc.mindDraft;
  };

  W.postSession = function (npc, t) {
    if (W.postDial() === 0) return W.considerPost(npc, t); // private thought only; never publish
    const S = G.S;
    const p = G.Persona.ensure(npc);
    const E1 = p.t.E / 100;
    const b = dayBudget(npc, S);
    const maxP = Math.max(1, Math.round(0.8 + 3.6 * E1));
    const mine = W.postRateOf(npc) * W.postDial();
    const cap = Math.max(1, Math.round(maxP * Math.min(2, Math.max(1, mine)))); // "posts a lot" may also post more per day
    if (mine > 0 && mine < 1 && rnd() > mine) return null; // "rarely" really is rare, whatever the activity dial says
    if (mine <= 0 || b.posts >= cap || t - p.lastPost < 75 / Math.min(2, Math.max(0.3, mine))) return null;
    const mood = p.mood.v;
    const urge = (0.06 + 0.22 * E1 + (mood > 0.3 ? 0.07 : 0) + (p.t.N > 60 && mood < -0.1 ? 0.1 : 0)) * mine;
    if (rnd() > urge * (1 - b.posts / (maxP + 1))) return null;
    const kind = W.chooseKind(npc, t);
    const edges = S.npcRel.filter((e) => e.a === npc.id || e.b === npc.id);
    const friendEdge = edges.find((e) => ['friend', 'best_friend'].includes(e.type));
    const friend = friendEdge ? S.npcs[friendEdge.a === npc.id ? friendEdge.b : friendEdge.a] : null;
    let rivalId = null;
    let g = 0;
    Object.keys(p.grudges).forEach((id) => {
      if (p.grudges[id] > g) {
        g = p.grudges[id];
        rivalId = id;
      }
    });
    const rival = rivalId === 'me' ? { name: S.player.name, handle: S.player.handle } : S.npcs[rivalId];
    const debate = kind === 'poll' ? pick(G.Lex.DEBATES) : null;
    const slots = { friend: friend ? friend.handle : 'my people', rival: rival ? rival.handle || rival.name : 'someone' };
    let out = G.Voice.post(npc, kind, { rnd, slots, debate });
    for (let tries = 0; tries < 5 && G.Persona.dupText(npc, out.text); tries++) out = G.Voice.post(npc, kind, { rnd, slots, debate });
    if (G.Persona.dupText(npc, out.text)) return null;
    G.Persona.noteText(npc, out.text);
    const post = W.addNpcPost(npc, { kind, text: out.text, attach: out.attach, ptype: out.ptype, poll: out.poll, buzz: kind === 'callout' || kind === 'subtweet' ? 7 : 3 }, t);
    if (G.Mem && (kind === 'callout' || kind === 'subtweet') && rival) G.Mem.add(npc, { kind: 'shade', text: `I posted a ${kind} about ${rival.name}`, who: [rivalId], valence: -0.3 });
    return post;
  };

  W.addStory = function () {
    // NPC stories are authored posts too; the ambient simulation cannot publish them.
    return null;
  };

  // a brand-new (or old, story-less) world should not look empty: a few people already posted something in the last hours
  W.seedStories = function (S = G.S) {
    if (!S || (S.stories && S.stories.length) || S !== G.S) return 0;
    W.ensure(S);
    const all = npcs(S).filter((n) => !n.blocked);
    let made = 0;
    all.forEach((n) => {
      if (made >= 8 || rnd() > 0.5) return;
      if (W.addStory(n, S.clock - Math.floor(rnd() * 700), true)) made++;
    });
    if (!made && all.length && W.addStory(pick(all), S.clock - Math.floor(rnd() * 400), true)) made++; // at least one
    return made;
  };

  // NPCs watch (and react to) stories — especially the player's
  const EMOJI_RX = ['❤️', '😂', '🔥', '😮', '👏', '😍', '🥹'];
  W.watchStories = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    let watched = 0;
    for (let si = S.stories.length - 1, looked = 0; si >= 0 && looked < 40; si--, looked++) {
      const st = S.stories[si];
      st.views = Array.isArray(st.views) ? st.views : [];
      if (st.exp <= t || st.author === npc.id || st.views.includes(npc.id)) continue;
      if (st.audience === 'close' && st.author === 'me' && !E.isClose(npc)) continue;
      const rel = G.React.relation(S, npc, st.author);
      const base = st.author === 'me' ? 0.28 + 0.6 * rel.c + 0.35 * rel.r : 0.12 + 0.5 * rel.c;
      if (rnd() > clamp(base * (0.5 + p.t.E / 100), 0, 0.9)) continue;
      st.views.push(npc.id);
      watched++;
      if (st.author === 'me') {
        W.nudgeRel(npc, { aff: 0.06, rom: rel.r > 0.3 ? 0.05 : 0 });
        if (G.Mind && st.text && rel.c >= 0.45 && rel.h <= 0.3 && Object.keys(st.care || {}).length < 4 && !((st.care && st.care[npc.id]) & 2)) { // a heavy story: the people who love them check in, once
          const sr = G.Mind.read(st.text);
          if (sr.sens >= 0.5) {
            st.care = st.care || {};
            st.care[npc.id] = 2;
            W.schedule(t + careDelay(npc, t, sr.sens, rel), { type: 'care', npc: npc.id, post: st.id, story: true });
          }
        }
        const pr = clamp(0.1 + 0.45 * rel.c + 0.35 * rel.r - 0.5 * rel.h, 0, 0.7);
        if (rnd() < pr) {
          const e = rel.r > 0.35 && rnd() < 0.5 ? pick(['😍', '🔥', '❤️']) : pick(EMOJI_RX);
          st.rx[npc.id] = e;
          W.notifAgg('storylike', st.id, npc.name, t);
        }
        // a few people reply to the story in your DMs
        if (rnd() < clamp(0.04 + 0.22 * rel.r + 0.12 * rel.c - 0.1 * rel.h, 0, 0.5)) W.sendDm(npc, 'reactstory', t, { storyId: st.id, ref: G.Refs ? G.Refs.story(st.id) : null });
      } else if (rnd() < 0.15 * rel.c) st.rx[npc.id] = pick(EMOJI_RX);
      if (watched >= 3) break;
    }
  };

  /* ================= DMs ================= */

  W.dmMult = () => {
    const v = G.settings && G.settings.dmRate;
    const base = typeof v === 'number' && isFinite(v) ? Math.max(0.3, Math.min(4, v)) : 2;
    return Math.max(0.3, Math.min(5, base * (G.Directives ? G.Directives.dial('chatty') : 1)));
  };
  const DM_RATE = { partner: 0.22, dating: 0.22, crush: 0.17, admirer: 0.12, situationship: 0.16, best_friend: 0.11, close_friend: 0.07, friend: 0.035, ally: 0.03, mentor: 0.03, ex: 0.02, frenemy: 0.03, rival: 0.025, enemy: 0.012, nemesis: 0.012, stan: 0.04, hater: 0.01, acquaintance: 0.006, stranger: 0, mother: 0.1, father: 0.08, son: 0.09, daughter: 0.1, brother: 0.07, sister: 0.09, grandmother: 0.05, grandfather: 0.04, aunt: 0.03, uncle: 0.03, cousin: 0.035, niece: 0.04, nephew: 0.04 };
  W.sendDm = function (npc, kind, t, extra = {}) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    let text = extra.text || G.Voice.dm(npc, kind, { rnd, hot: extra.hot, x: extra.x || 'someone' }); // extra.text = a message written from a real reason (reasons.js)
    if (G.Mind && !extra.care) { // common sense: while the player is in a heavy moment nobody jokes, flirts, provokes or gossips. People who love them care; enemies stay out of it
      const hc = W.heavyContext(npc, t);
      if (hc) {
        const rel = G.React.relation(S, npc, 'me');
        if (rel.h > 0.55) return null;
        const v = G.Mind.vet(npc, text, { kind: 'dm', about: hc.text, rel });
        const tonal = ['flirt', 'latenight', 'hype', 'provoke', 'provoke_np', 'gossip', 'eventreact', 'share', 'reactstory', 'reactpost', 'plan', 'ghost', 'promo', 'personal', 'welcome'].includes(kind);
        if (!v.ok || tonal) {
          const flag = (hc.post && hc.post.care && hc.post.care[npc.id]) || 0;
          const line = flag & 2 ? null : G.Voice.care(npc, { about: hc.text, rel, rnd, authorName: S.player.name, dm: true });
          if (!line) return null;
          if (hc.post) (hc.post.care = hc.post.care || {})[npc.id] = flag | 2;
          text = line;
          kind = 'care';
          extra = Object.assign({}, extra, { ref: hc.post && G.Refs ? (hc.post.kind === 'player' ? G.Refs.story(hc.post.id) : G.Refs.post(hc.post.id)) : extra.ref });
        }
      }
    }
    const list = (S.dms[npc.id] = S.dms[npc.id] || []);
    const m = { id: 'm' + S.counters.msg++, from: npc.id, text, t, read: false, kind };
    if (extra.storyId) m.storyId = extra.storyId;
    if (extra.ref) m.ref = extra.ref; // the post or story the message is about
    list.push(m);
    if (list.length > 120) list.shift();
    p.lastDm = t;
    p.lastActive = t;
    const b = dayBudget(npc, S);
    b.dms++;
    S.sim.day.dms++;
    npc.touched = t;
    if (!npc.muted) E.addNotif('dm', `${npc.name} sent you a message`, { npcId: npc.id });
    W.remember(npc, { kind: 'private_dm', ref: m.id, text: `I messaged ${S.player.name}: ${text}`, source: 'me', t, confidence: 1, channel: 'private' });
    if (kind === 'gossip') W.think(npc, { t, action: 'dm_rumor', summary: `Privately asked ${S.player.name} about a rumor.`, reason: 'Heard it through their social circle and trusts the player enough to ask.', ref: m.id, kind: 'private_message' });
    if (G.Mem) G.Mem.add(npc, { kind: 'dm', text: `I texted ${S.player.name}: "${text.slice(0, 60)}"`, who: ['me'], valence: 0.1 });
    emit('dm', { npc, msg: m, kind });
    return m;
  };

  W.dmPass = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    const b = dayBudget(npc, S);
    const rate0 = DM_RATE[npc.status] != null ? DM_RATE[npc.status] : 0.01;
    if (!rate0) return;
    const cap = ['partner', 'dating'].includes(npc.status) ? 7 : ['crush', 'situationship', 'admirer', 'best_friend'].includes(npc.status) ? 4 : 2;
    if (b.dms >= Math.ceil(cap * W.dmMult()) || t - p.lastDm < 120 / Math.max(0.6, W.dmMult())) return;
    const list = S.dms[npc.id] || [];
    const last = list[list.length - 1];
    // do not pile on while they are waiting for you to answer (but follow up once if the silence is long)
    const waiting = last && last.from === npc.id && !last.read;
    if (waiting && t - last.t < 600) return;
    const hour = hourOf(t);
    const rel = G.React.relation(S, npc, 'me');
    const lonely = last ? Math.min(1.6, (t - last.t) / 2880) : 0.6;
    let rate = W.dmMult() * rate0 * (0.7 + 0.6 * lonely) * (0.6 + p.t.E / 160) * (p.attach === 'anxious' ? 1.3 : p.attach === 'avoidant' ? 0.6 : 1);
    if (waiting) rate *= 0.4;
    if (rnd() > 1 - Math.exp(-rate / 6)) return;
    // what kind of message?
    const st = npc.status;
    const late = hour >= 23 || hour < 3;
    const myRecent = S.postOrder.slice(-12).map((id) => S.posts[id]).filter((x) => x && x.author === 'me' && !x.replyTo && t - x.t < 480 && x.rx && x.rx[npc.id]);
    const w = {};
    w.checkin = 0.6;
    w.share = 0.4 + 0.3 * p.t.O / 100;
    const fam = E.isFamily(npc);
    if (fam || ['friend', 'close_friend', 'best_friend', 'ally', 'dating', 'partner'].includes(st)) w.plan = 0.5;
    if (!fam && (['crush', 'admirer', 'situationship', 'dating', 'partner'].includes(st) || (rel.r > 0.35 && rel.c > 0.3))) w.flirt = 1.1 + rel.r;
    if (late && ['crush', 'ex', 'situationship', 'dating', 'partner', 'admirer'].includes(st)) w.latenight = 1.6;
    if (myRecent.length) w.reactpost = 1.4;
    if (['rival', 'enemy', 'nemesis', 'frenemy'].includes(st)) w.provoke = 1.3 + rel.h;
    if (rel.grudge > 0.35 && rel.c > 0.3) w.apology = 0.8;
    if (p.mood.v < -0.25 && rel.c > 0.4) w.vent = 1.2;
    if (fam || ['stan', 'friend', 'close_friend', 'best_friend'].includes(st)) { if (S.player.followers > 5000) w.hype = 0.5; }
    if (waiting) {
      w.ghost = 0.8;
      delete w.flirt;
    }
    if (rel.c > 0.5 && S.rumors.some((r) => r.belief && r.belief[npc.id] > 0.5 && r.about !== npc.id)) w.gossip = 1.2;
    // Only REAL reasons: the old bag of generic lines (check-ins, "u up?", hype, random flirting) is gone. Every message below has something real behind it
    // (your post, a rumour, a storyline, a shared memory, a plan with a time...) and quotes it. No reason, no message. (reasons.js)
    ['checkin', 'share', 'plan', 'flirt', 'latenight', 'reactpost', 'provoke', 'apology', 'vent', 'hype', 'ghost', 'gossip'].forEach((k) => delete w[k]);
    const reasons = G.Reasons ? G.Reasons.candidates(npc, t, { rel, rnd, st, waiting, last, myRecent, fam }) : [];
    const DL0 = G.Directives;
    reasons.forEach((r, i) => {
      let m = 1;
      if (DL0) {
        if (['followup', 'rumor_ask', 'news'].includes(r.kind)) m *= DL0.dial('curious');
        if (['accuse', 'point', 'rumor_ask', 'provoke', 'vent'].includes(r.kind)) m *= DL0.dial('drama');
        if (['plan', 'goal', 'followup'].includes(r.kind)) m *= DL0.dial('warm');
        if (['provoke', 'accuse'].includes(r.kind)) m *= DL0.dial('edgy');
        if (r.kind === 'goal') m *= DL0.dial('flirty');
      }
      w['r:' + i] = r.w * m;
    });
    if (npc.goal && npc.goal.kind === 'player') ['checkin', 'flirt', 'provoke', 'apology'].forEach((k) => { if (w[k]) w[k] *= 1.5; }); // what they want today shapes what they text about
    const DL = G.Directives; // "/global act more curious" and friends nudge what people text about
    if (DL) {
      const c = DL.dial('curious'), dr = DL.dial('drama'), wm = DL.dial('warm'), ed = DL.dial('edgy'), fl = DL.dial('flirty');
      ['checkin', 'share', 'plan'].forEach((k) => { if (w[k]) w[k] *= c; });
      ['gossip', 'provoke', 'vent', 'apology'].forEach((k) => { if (w[k]) w[k] *= dr; });
      ['checkin', 'hype', 'plan', 'apology'].forEach((k) => { if (w[k]) w[k] *= wm; });
      if (w.provoke) w.provoke *= ed;
      ['flirt', 'latenight'].forEach((k) => { if (w[k]) w[k] *= fl; });
    }
    if (!Object.keys(w).length) return; // nothing real to say: say nothing
    let sum = 0;
    Object.keys(w).forEach((k) => (sum += w[k]));
    let x = rnd() * sum;
    let kind = 'checkin';
    for (const k of Object.keys(w)) {
      x -= w[k];
      if (x <= 0) {
        kind = k;
        break;
      }
    }
    const rr = kind.startsWith('r:') ? reasons[Number(kind.slice(2))] : null;
    if (rr) {
      W.sendDm(npc, rr.kind, t, { text: rr.text, ref: rr.ref });
      if (rr.done) rr.done();
      return;
    }
    // never talk about "your post" when the player has not posted anything lately (that is what made rivals text "saw your post" out of nowhere)
    const posted = S.postOrder.slice(-40).some((id) => { const x = S.posts[id]; return x && x.author === 'me' && !x.replyTo && t - x.t < 1440; });
    if (kind === 'provoke' && !posted) kind = 'provoke_np';
    if (kind === 'reactpost' && !myRecent.length) kind = 'checkin';
    const rumor = kind === 'gossip' ? S.rumors.find((r) => r.belief && r.belief[npc.id] > 0.5 && r.about !== npc.id) : null;
    const aboutN = rumor && rumor.about !== 'me' ? S.npcs[rumor.about] : null;
    W.sendDm(npc, kind, t, { x: aboutN ? aboutN.name : 'someone', hot: ['partner', 'dating'].includes(st) || rel.r > 0.6 });
  };

  // local (free) reply to a DM from the player — used when there is no AI configured, or the model fails
  W.localReply = function (npc, text, t = G.S.clock, opts = {}) {
    const S = G.S;
    // A burner is a stranger; an owner-steered NPC is not. Character-to-character
    // dialogue uses their existing edge instead of borrowing the player's bond.
    const rel = opts.anon
      ? { c: 0.15, h: 0, r: 0, fam: 0.1, status: 'stranger', same: false, grudge: 0 }
      : G.React.relation(S, npc, opts.alt || 'me');
    if (G.Dialogue && G.Dialogue.plan) {
      const alt = opts.alt && E.altOf(opts.alt);
      const thread = alt ? E.altThread(alt.id, npc.id) : (S.dms[npc.id] || []);
      const plan = G.Dialogue.plan(npc, text, { S, now: t, rnd, rel, thread: thread.filter((m) => m.id !== opts.msgId).slice(-6), anon: !!opts.anon, alt: alt && alt.id });
      const intent = G.Lex.intent(text);
      plan.intent = intent;
      if (rel.h > 0.5 || (!opts.anon && !opts.alt && npc.aff < -35)) plan.tone = 'hostile';
      else if (rel.c < 0.2 && (opts.anon || (!opts.alt && npc.aff < 5))) plan.tone = 'cold';
      else if (rel.r > 0.38 && ['flirt', 'greeting', 'statement', 'invite', 'brag'].includes(intent) && G.Persona.ensure(npc).t.E > 25) plan.tone = 'flirty';
      else if (rel.c > 0.4 || npc.aff > 25) plan.tone = 'warm';
      else plan.tone = 'neutral';
      return plan;
    }
    const intent = G.Lex.intent(text);
    const out = G.Voice.dmReply(npc, text, 'neutral', { rnd, rel, authorName: S.player.name, anon: !!opts.anon });
    return { text: out.text, intent, tone: 'neutral' };
  };
  W.deliverReply = function (npc, q) {
    const S = G.S;
    // Replies already in flight remain in their original account's thread even if
    // the owner switches out of admin mode before the simulated delay ends.
    const alt = q.alt && S.npcs[q.alt];
    if (q.alt && (!alt || alt.blocked)) return;
    const list = alt ? E.altThread(alt.id, npc.id) : (S.dms[npc.id] = S.dms[npc.id] || []);
    let reply = q.text;
    if (q.input != null && G.Dialogue && G.Dialogue.plan) {
      const anon = !!(alt && alt.userAlt);
      const rel = anon ? { c: 0.15, h: 0, r: 0, fam: 0.1, status: 'stranger', same: false, grudge: 0 } : G.React.relation(S, npc, alt ? alt.id : 'me');
      const plan = G.Dialogue.plan(npc, q.input, { S, now: q.due, rnd, rel, thread: list.filter((m) => m.id !== q.msgId).slice(-6), anon, alt: alt && alt.id, msgId: q.msgId });
      G.Dialogue.apply(npc, plan, { S });
      reply = plan.text;
      if (!reply) return;
    }
    const m = { id: 'm' + S.counters.msg++, from: npc.id, text: reply, t: q.due, read: false, kind: 'reply' };
    if (alt) m.to = alt.id;
    list.push(m);
    if (list.length > 120) list.shift();
    G.Persona.ensure(npc).lastActive = q.due;
    npc.touched = q.due;
    E.addNotif('dm', alt ? `${npc.name} replied to ${alt.name}` : `${npc.name} replied to you`, alt ? { npcId: npc.id, alt: alt.id } : { npcId: npc.id });
    emit('dm', { npc, msg: m, kind: 'reply' });
  };
  // player sent a DM -> after a human-like delay the NPC reads it (and maybe answers)
  W.onPlayerDm = function (npc, dm, text, opts = {}) {
    const S = G.S;
    const alt = E.altOf(opts.alt);
    const p = G.Persona.ensure(npc);
    const t = S.clock;
    const awake = G.Persona.awake(npc, hourOf(t)) > 0;
    const anon = !!(alt && alt.userAlt);
    const rel = anon ? { c: 0.15, h: 0, r: 0, fam: 0.1, status: 'stranger', same: false, grudge: 0 } : G.React.relation(S, npc, alt ? alt.id : 'me');
    // asleep? they answer when they wake up (a few minutes after), unless it is an emergency and they are close: then they pick up
    const emergency = !!G.Mind && !anon && G.Mind.read(text).sens >= 0.75 && rel.c >= 0.45 && rel.h < 0.3;
    const delay = awake ? 1 + Math.floor(rnd() * (p.t.E > 60 ? 8 : 40)) : emergency ? 3 + Math.floor(rnd() * 12) : W.untilAwake(npc, t) + 3 + Math.floor(rnd() * 40);
    dm.seenAt = t + delay;
    dm.seen = true;
    if (opts.reply === false) return;
    const r = W.localReply(npc, text, t, { anon, alt: alt && alt.id, msgId: dm.id });
    const sal = G.Mind ? G.Mind.salience(text, 'dm') : 3; // something heavy or wonderful is remembered as such, whatever happens next
    const memo = () => { if (G.Mem) G.Mem.add(npc, Object.assign({ kind: 'dm', text: `${alt ? alt.name : S.player.name} texted me: "${String(text).slice(0, 60)}"`, who: [alt ? alt.id : 'me'], valence: r.tone === 'hostile' ? -0.4 : 0.3 }, sal >= 7 ? { imp: sal } : {})); };
    if (!r.text || r.leave_on_read) { // nothing fitting to say (e.g. they are an enemy and you are hurting): they do not make it worse
      if (sal >= 7) memo();
      return;
    }
    // sometimes people just leave you on read
    if (rel.c < 0.12 && rnd() < 0.5) return;
    const q = { type: 'dmreply', npc: npc.id, input: text, msgId: dm.id, due: t + delay + 1 + Math.floor(rnd() * 6) };
    if (alt) q.alt = alt.id;
    W.schedule(q.due, q);
    memo();
  };

  /* ================= follows, trending, followers ================= */

  W.followPass = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    p.following = p.following || [];
    if (rnd() > 0.04) return;
    const targets = npcs(S).filter((o) => o.id !== npc.id && !p.following.includes(o.id));
    // Follow the player only after there is something to discover, and keep the
    // choice in the NPC's hands; the player's follow list must not imply reciprocity.
    const recentPlayerPosts = S.postOrder.slice(-30).some((id) => {
      const post = S.posts[id];
      return post && post.author === 'me' && !post.replyTo && t - post.t < 7 * 1440;
    });
    if (recentPlayerPosts && !p.following.includes('me')) targets.push({ id: 'me' });
    if (!targets.length) return;
    const target = pick(targets);
    const r = G.React.relation(S, npc, target.id);
    const shouldFollow = G.Bonds && G.Bonds.followDecision
      ? G.Bonds.followDecision(S, npc, target.id, rnd) === 'follow'
      : rnd() < 0.2 + r.c * 0.7 && r.h < 0.5;
    if (shouldFollow) {
      p.following.push(target.id);
      if (target.id === 'me') E.addFollowers ? E.addFollowers(1) : (S.player.followers = (S.player.followers || 0) + 1);
      S.sim.day.follows++;
      emit('follow', { npc, target });
    }
  };

  W.recomputeTrending = function (t) {
    const S = G.S;
    const heat = {};
    const bump = (tag, v) => (heat[tag] = (heat[tag] || 0) + v);
    for (let i = S.postOrder.length - 1, seen = 0; i >= 0 && seen < 220; i--) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p.replyTo) continue;
      seen++;
      const age = t - p.t;
      if (age > 1440) continue;
      const w = Math.exp(-age / 700) * (1 + Math.log10((p.stats.likes || 0) + 10));
      (String(p.text).match(/#[\p{L}\p{N}_]{2,30}/gu) || []).forEach((tg) => bump(tg.toLowerCase(), w * 1.4));
      if (p.fx && p.fx.debate) bump('#' + p.fx.debate, w * 1.6);
      if (p.fx) (p.fx.topics || []).slice(0, 1).forEach((tp) => bump('#' + tp, w * 0.5));
    }
    const old = new Map(S.trending.map((x) => [x.tag.toLowerCase(), x.heat * 0.5]));
    Object.keys(heat).forEach((k) => old.set(k, Math.max(old.get(k) || 0, 0) + heat[k] * 9));
    S.trending = [...old.entries()].map(([tag, h]) => ({ tag, heat: clamp(Math.round(h), 1, 100) })).filter((x) => x.heat > 6).sort((a, b) => b.heat - a.heat).slice(0, 8);
  };

  W.playerDrift = function (t) {
    const S = G.S;
    const P = S.player;
    const mine = S.postOrder.map((id) => S.posts[id]).filter((p) => p && p.author === 'me' && !p.replyTo && t - p.t < 2880);
    const eng = mine.reduce((a, p) => a + (p.stats.likes || 0) + 3 * (p.stats.replies || 0), 0);
    const rate = mine.length ? clamp(eng / Math.max(500, P.followers * 8), 0, 0.004) : -0.0003;
    const d = Math.round(P.followers * rate + (rate > 0 ? 0.5 : 0));
    if (d) P.followers = Math.max(0, P.followers + d);
  };

  /* ================= relationship events + gossip ================= */

  W.event = function (kind, ids, text, valence, opts = {}) {
    const S = G.S;
    S.sim.day.events++;
    E.addChron(text);
    ids.forEach((id) => {
      const n = S.npcs[id];
      if (!n) return;
      W.remember(n, { kind: 'known_event', ref: `event:${S.clock}:${kind}:${id}`, text, source: 'direct_participant', t: S.clock, confidence: 1, channel: 'direct' });
      if (G.Mem) G.Mem.add(n, { kind, text, who: ids.filter((x) => x !== id), valence, imp: opts.imp });
      G.Persona.nudge(n, valence * 0.35, 0.2);
    });
    const playerCares = ids.some((id) => {
      const n = S.npcs[id];
      return n && (n.aff > 20 || G.React.FRIENDLY.includes(n.status));
    });
    if (playerCares || opts.notify) E.addNotif('drama', text, { npcId: ids[0] });
    if (opts.rumor !== false) W.startRumor(text, ids[0], ids, opts.truth !== false);
    emit('event', { kind, ids, text });
  };

  W.startRumor = function (text, about, ids, truth = true) {
    const S = G.S;
    if (S.rumors.length > 8) S.rumors.shift();
    const r = { id: U.uid('ru'), text, about, truth, t: S.clock, belief: {}, heat: 1, path: [], discussions: [], pendingTalks: {}, lastShared: {} };
    ids.forEach((id) => {
      r.belief[id] = 1; // participants know what happened directly
      r.path.push({ from: '', to: id, t: S.clock, confidence: 1, channel: 'direct' });
    });
    S.rumors.push(r);
    emit('rumor', r);
    return r;
  };

  // Gossip moves as a private social action, never as a broadcast. A character first
  // decides whether it is worth repeating, then has a delayed one-to-one or small-circle
  // conversation. The Director can audit both the decision and the actual wording.
  const rumorChannel = (S, from, to) => {
    const g = Object.values(S.groups || {}).find((x) => (x.members || []).length <= 5 && x.members.includes(from.id) && x.members.includes(to.id));
    return g ? { type: 'private_group', label: `private circle: ${g.name}` } : { type: 'private_chat', label: 'private chat' };
  };
  const rumorWords = (r, source, confidence) => {
    const certainty = confidence >= 0.8 ? 'I think this may be real' : confidence >= 0.55 ? 'I heard this, but I am not sure' : 'This might be nothing, so keep it between us';
    return `${source.name}: “${certainty}: ${String(r.text).slice(0, 240)}.”`;
  };
  W.planRumorTalk = function (r, src, tgt, t) {
    if (!r || !src || !tgt || r.pendingTalks[src.id]) return false;
    const sp = G.Persona.ensure(src);
    const confidence = Number(r.belief[src.id]) || 0;
    const discretion = clamp(0.25 + sp.t.A / 220 + sp.t.N / 500, 0.2, 0.85);
    const urgency = clamp(0.12 + r.heat * 0.05 + sp.t.E / 450 - discretion * 0.18, 0.04, 0.6);
    if (rnd() > urgency) {
      W.think(src, { t, action: 'hold_rumor', summary: 'Kept a rumor private for now.', reason: confidence < 0.65 ? 'The information is too uncertain to repeat.' : 'Did not see a safe reason to involve anyone else.', ref: r.id, kind: 'rumor', confidence });
      r.lastShared[src.id] = t;
      return false;
    }
    const channel = rumorChannel(G.S, src, tgt);
    const due = t + 25 + Math.round(rnd() * 155);
    r.pendingTalks[src.id] = { from: src.id, to: tgt.id, planned: t, due, channel };
    W.think(src, { t, action: 'consider_rumor', summary: `Considering whether to tell ${tgt.name} privately.`, reason: confidence >= 0.65 ? 'Trusts this person enough to compare notes before the rumor goes any further.' : 'Wants a second opinion before repeating an uncertain claim.', ref: r.id, kind: 'rumor', confidence });
    W.schedule(due, { type: 'rumorTalk', npc: src.id, rumor: r.id, target: tgt.id });
    return true;
  };
  W.completeRumorTalk = function (q, t) {
    const S = G.S;
    const r = (S.rumors || []).find((x) => x.id === q.rumor);
    const src = S.npcs[q.npc], tgt = S.npcs[q.target];
    if (!r || !src || !tgt || r.belief[tgt.id] != null) return false;
    if (r.about === tgt.id && (r.pendingTalks || {})[src.id]) { delete r.pendingTalks[src.id]; return false; } // nobody whispers a rumour to the person it is about
    const plan = (r.pendingTalks || {})[src.id];
    if (!plan || plan.to !== tgt.id) return false;
    delete r.pendingTalks[src.id];
    const tp = G.Persona.ensure(tgt);
    const trust = G.React.relation(S, tgt, src.id).c;
    const skeptic = 0.25 + tp.t.O / 250 + tp.t.A / 400;
    const sourceBelief = Number(r.belief[src.id]) || 0;
    const belief = clamp(sourceBelief * 0.3 + trust * 0.55 + rnd() * 0.35 - skeptic + (r.truth ? 0.12 : -0.05), 0, 1);
    const channel = plan.channel || rumorChannel(S, src, tgt);
    const words = rumorWords(r, src, sourceBelief);
    r.belief[tgt.id] = Math.round(belief * 100) / 100;
    r.path = Array.isArray(r.path) ? r.path : [];
    r.path.push({ from: src.id, to: tgt.id, t, confidence: r.belief[tgt.id], channel: channel.type });
    if (r.path.length > 40) r.path.shift();
    r.discussions = Array.isArray(r.discussions) ? r.discussions : [];
    r.discussions.push({ from: src.id, to: tgt.id, t, channel: channel.label, words, sourceConfidence: sourceBelief, belief: r.belief[tgt.id] });
    if (r.discussions.length > 40) r.discussions.shift();
    r.lastShared[src.id] = t;
    r.lastShared[tgt.id] = t; // a new recipient sits with it before deciding whether to repeat it
    r.heat++;
    W.remember(tgt, { kind: 'rumor', ref: r.id, text: r.text, source: 'gossip', from: src.id, t, confidence: r.belief[tgt.id], channel: 'hearsay' });
    W.think(src, { t, action: 'shared_rumor_privately', summary: `Discussed a rumor with ${tgt.name} in ${channel.label}.`, reason: 'Chose a trusted private setting instead of broadcasting it.', ref: r.id, kind: 'rumor', confidence: sourceBelief });
    W.think(tgt, { t, action: 'heard_rumor', summary: `Heard a rumor privately from ${src.name}.`, reason: r.belief[tgt.id] > 0.7 ? 'Trusts the source, but treats it as hearsay until confirmed.' : 'The source is not fully convincing; keeping it uncertain.', ref: r.id, kind: 'rumor', confidence: r.belief[tgt.id] });
    if (G.Mem) G.Mem.add(tgt, { kind: 'rumor', text: `Heard privately from ${src.name}: ${r.text}`, who: [src.id, r.about].filter((x) => x !== 'me'), valence: -0.1, imp: 5 });
    emit('gossip', { from: src, to: tgt, rumor: r, belief: r.belief[tgt.id], private: true, channel: channel.type });
    return true;
  };
  // Each hour, at most one person starts a private discussion for a rumor. The
  // recipient does not learn it until that scheduled discussion actually occurs.
  W.spreadRumors = function (t) {
    const S = G.S;
    S.rumors = S.rumors.filter((r) => t - r.t < 4320);
    S.rumors.forEach((r) => {
      r.pendingTalks = r.pendingTalks || {};
      r.lastShared = r.lastShared || {};
      const holders = Object.keys(r.belief).filter((id) => S.npcs[id] && r.belief[id] > 0.35);
      if (!holders.length) return;
      const ready = holders.filter((id) => !r.pendingTalks[id] && t - (r.lastShared[id] || -1e9) >= 180);
      if (!ready.length) return;
      const options = ready.map((id) => ({ src: S.npcs[id], near: G.Social.neighbors(S, id, r).filter((nid) => nid !== 'me' && S.npcs[nid] && r.belief[nid] == null) })).filter((x) => x.src && x.near.length);
      if (!options.length) return;
      const choice = pick(options);
      W.planRumorTalk(r, choice.src, S.npcs[pick(choice.near)], t);
    });
  };

  // The relationship model owns daily edge movement and the consequences around it.
  // Keep one checkpoint per simulated day so hourly ticks cannot repeat a breakup or confession.
  W.socialEvents = function (t) {
    const S = G.S;
    const B = G.Bonds;
    if (!B || S.sim.bondDay === U.dayOf(t)) return;
    const day = U.dayOf(t);
    S.sim.bondDay = day;
    const result = B.dayStep(S, day, rnd, { max: (G.settings.drama || 2) + 1 });
    result.events.forEach((ev) => W.event(ev.kind, [ev.a, ev.b].filter(Boolean), ev.text, ev.valence, { notify: !!ev.notify, rumor: ev.kind !== 'fade' }));
    result.intents.forEach((intent) => {
      const n = S.npcs[intent.npc];
      if (n && intent.text) W.sendDm(n, intent.reason || 'relationship', t, { text: intent.text });
    });
    const cast = npcs(S);
    // Existing cast members can form a friendship through a shared circle; no new characters or posts are created.
    if (cast.length > 1 && rnd() < 0.35) {
      const a = pick(cast);
      const candidates = cast.filter((n) => n.id !== a.id && G.Social.sameCircle(a, n) && !S.npcRel.some((e) => (e.a === a.id && e.b === n.id) || (e.a === n.id && e.b === a.id)));
      if (candidates.length) {
        const b = pick(candidates);
        const shared = G.Persona.ensure(a).interests.filter((i) => G.Persona.ensure(b).interests.includes(i)).length;
        if (shared) {
          B.addEdge(S, a.id, b.id, 'friend', 'grew closer in their circle', day, 80);
          W.event('event', [a.id, b.id], `${a.name} and ${b.name} became friends`, 0.4, { rumor: false });
        }
      }
    }
    // A confession only comes from someone who already has a real crush, trust, and recent contact.
    if (rnd() < 0.08) {
      const candidates = cast.filter((n) => B.confession(n, S, { day }));
      if (candidates.length) {
        const n = pick(candidates);
        const intents = B.consequences(S, { kind: 'confession', a: n.id, b: 'me' }, rnd, { day });
        intents.forEach((intent) => { const from = S.npcs[intent.npc]; if (from && intent.text) W.sendDm(from, intent.reason, t, { text: intent.text }); });
      }
    }
    cast.forEach((n) => {
      B.settle(n, S, { day });
      const follow = G.Persona.ensure(n).following || [];
      follow.slice().forEach((target) => {
        if (B.followDecision(S, n, target, rnd) !== 'unfollow') return;
        const p = G.Persona.ensure(n);
        p.following.splice(p.following.indexOf(target), 1);
        if (target === 'me') S.player.followers = Math.max(0, (S.player.followers || 0) - 1);
      });
      const days = B.contactDays(n, S);
      if (isFinite(days)) {
        const drift = B.drift(n, n.status, Math.floor(days));
        if (drift.aff || drift.rom || drift.riv) W.nudgeRel(n, drift); // fractions accumulate in p.frac (applyRel rounds 0.2 to 0)
      }
      const partner = B.partnerEffects(S, n, rnd, day);
      if (partner.betrayal && partner.intent) {
        const intents = B.consequences(S, { kind: 'betrayal', a: n.id, b: 'me' }, rnd, { day });
        intents.forEach((intent) => { const from = S.npcs[intent.npc]; if (from) W.sendDm(from, intent.reason, t, { text: intent.text }); });
      } else if (partner.intent) W.sendDm(n, partner.intent.reason, t, { text: partner.intent.text });
    });
  };

  /* ================= the tick ================= */

  W.npcStep = function (npc, t) {
    const S = G.S;
    const p = G.Persona.ensure(npc);
    const hour = hourOf(t);
    const act = G.Persona.activityAt(npc, hour);
    if (act <= 0) return;
    const E1 = p.t.E / 100;
    const rate = act * (0.3 + 1.4 * E1) * (0.9 + 0.3 * p.t.N / 100) * (1 + 0.4 * Math.abs(p.mood.v)) * W.feedRate();
    if (rate <= 0 || rnd() > 1 - Math.exp(-rate / 6)) return;
    p.lastActive = t;
    W.replyPass(npc, t);
    W.browse(npc, t);
    W.postSession(npc, t);
    if (rnd() < (0.05 + 0.17 * E1) * Math.min(1.5, W.postDial()) * Math.min(1.5, W.postRateOf(npc))) W.addStory(npc, t); // 0 when posts are "only what I direct"
    W.watchStories(npc, t);
    W.dmPass(npc, t);
    W.followPass(npc, t);
  };

  W.hourly = function (t) {
    const S = G.S;
    const all = npcs(S);
    all.forEach((n) => {
      G.Persona.decay(n, 60);
      if (n.mindDraft && n.mindDraft.expires <= t) delete n.mindDraft;
      if (G.Mem) G.Mem.reflect(n, t);
    });
    S.stories = S.stories.filter((s) => s.exp > t);
    if (G.Media && G.Media.enabled()) all.slice(0, 6).forEach((n) => G.Media.assign(n, S)); // a few characters per hour get a face from the library
    E.trim(S);
    if (t - S.sim.lastSocial >= 360) {
      G.Social.analyze(S, rnd);
      S.sim.lastSocial = t;
    }
    W.socialEvents(t);
    W.spreadRumors(t);
    W.recomputeTrending(t);
    W.playerDrift(t);
    // Relationship drift is handled once per day by Bonds inside W.socialEvents.
    const d = U.dayOf(t);
    if (S.sim.rollDay !== d) {
      try { if (G.Charts) G.Charts.sample(S.sim.prevDay || S.sim.day); } catch (e) {}
      try { if (G.Goals) G.Goals.step(t); } catch (e) {}
      S.sim.rollDay = d;
      delete S.sim.prevDay;
      try { W.worldEvent(t); } catch (e) {}
    }
  };

  // a free random event once in a while (no AI, no posts): the chronicle notes it, moods shift, and the people closest to you message you about it
  W.EVENTS = [
    ['a street festival is happening across town this weekend', 0.12],
    ['a city-wide power cut has everyone stuck at home and online', -0.05],
    ['a huge storm is rolling in tonight', -0.08],
    ['an awards show is on tonight and everyone has opinions', 0.06],
    ['a heatwave has the whole town on edge', -0.1],
    ['a viral meme is going around and everyone is talking about it', 0.1],
    ['a rumour is spreading that someone in the circle is about to announce something big', 0.03],
  ];
  W.worldEvent = function (t) {
    const S = G.S;
    if (!G.settings || G.settings.worldEvents === false) return null;
    if (G.Seasons && G.Seasons.day(t)) return null; // a town arc (js/seasons.js) is running or began today
    if (S.sim.lastEventDay != null && U.dayOf(t) - S.sim.lastEventDay < 2) return null;
    if (rnd() > 0.5) return null;
    const ev = W.EVENTS[Math.floor(rnd() * W.EVENTS.length)];
    S.sim.lastEventDay = U.dayOf(t);
    E.addChron('Around town: ' + ev[0] + '.');
    const all = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted);
    all.forEach((n) => { if (rnd() < 0.35) { const p = G.Persona.ensure(n); p.mood.v = Math.max(-1, Math.min(1, p.mood.v + ev[1])); } });
    // the closest people (friends, crushes, family, partners) reach out about it
    const close = all.filter((n) => ['friend', 'close_friend', 'best_friend', 'crush', 'dating', 'partner', 'family', 'ally', 'admirer', 'situationship'].includes(n.status) || E.isFamily(n)).sort((a, b) => b.aff + b.rom - (a.aff + a.rom)).slice(0, 6);
    let sent = 0;
    close.forEach((n) => { if (sent < 2 && rnd() < 0.6 && !(S.dms[n.id] || []).slice(-1).some((m) => m.from === n.id && !m.read)) { W.sendDm(n, 'eventreact', t, { x: ev[0] }); sent++; } });
    return { text: ev[0], dms: sent };
  };

  // advance the world by `minutes` of game time. The caller has already moved S.clock to the END of the span.
  W.run = function (minutes) {
    const S = G.S;
    if (!S || !(minutes > 0)) return;
    W.ensure(S);
    const m = S.sim;
    const end = S.clock;
    const span = Math.min(minutes, 7 * 1440); // at most a week of simulated time in one call
    let t = end - span;
    indexKids(S);
    const n = npcs(S);
    n.forEach((x) => G.Persona.ensure(x));
    if (m.lastHour * 60 < t - 60) m.lastHour = Math.floor(t / 60); // do not replay hours that were skipped over
    for (let left = span; left > 0; ) {
      const dt = Math.min(W.STEP, left);
      left -= dt;
      t += dt;
      S.clock = t;
      W.processQueue(t);
      for (const npc of n) W.npcStep(npc, t);
      const h = Math.floor(t / 60);
      while (m.lastHour < h) {
        m.lastHour++;
        W.hourly(m.lastHour * 60);
      }
    }
    S.clock = end;
    m.lastTick = end;
    W._kids = null;
  };

  // how much the cast does on its own (posts, stories, replies, DMs): the player's dial, plus a per-character override
  W.RATES = [[0, '🤫 Silent (they only react to me)'], [0.25, '🌙 Quiet'], [0.6, '🙂 Calm'], [1, '⚡ Normal'], [1.6, '🔥 Busy']];
  W.feedRate = () => {
    const v = G.settings && G.settings.feedRate;
    return typeof v === 'number' && isFinite(v) ? clamp(v, 0, 3) : 0.6;
  };
  // their own top-level posts (comments, replies, likes, DMs and stories follow the activity dial above, and can stay lively)
  W.POST_DIAL = [[0, 'Only when I direct in Storyteller']];
  W.postDial = () => 0; // retained for old saves/UI compatibility; NPC-authored posts require Storyteller direction
  W.POST_RATES = [['normal', 'Normal'], ['often', 'Posts a lot'], ['rare', 'Rarely posts'], ['never', 'Never posts on their own']];
  W.postRateOf = (npc) => ({ never: 0, rare: 0.3, often: 2 })[npc && npc.postRate] ?? 1;

  // real-time heartbeat: runs while the app is open
  W.speedMinutes = () => W.speeds[G.settings.worldSpeed != null ? G.settings.worldSpeed : 2] || 0;
  W.live = function () {
    const S = G.S;
    if (!S || G.busy || document.hidden || !W.speedMinutes()) return null;
    if (W.liveBlocked && W.liveBlocked()) return null;
    const before = snapshotCounts(S);
    E.tick(W.speedMinutes(), true);
    const after = snapshotCounts(S);
    return { posts: after.posts - before.posts, comments: after.comments - before.comments, stories: after.stories - before.stories, dms: after.dms - before.dms };
  };
  // The home feed contains standalone posts only; replies live inside a post thread.
  // Count those separately so the live pill never promises a feed post that is hidden in a thread.
  const snapshotCounts = (S) => {
    let posts = 0, comments = 0;
    S.postOrder.forEach((id) => {
      const p = S.posts[id];
      if (!p) return;
      if (p.replyTo) comments++;
      else posts++;
    });
    return { posts, comments, stories: S.stories.length, dms: Object.values(S.dms).reduce((a, l) => a + l.filter((m) => m.from !== 'me' && !m.read).length, 0) };
  };

  // you were away: simulate (up to a day) in one go and summarise what you missed
  W.catchUp = function (maxMinutes = 1440) {
    const S = G.S;
    if (!S) return null;
    W.ensure(S);
    const awayMs = Date.now() - (S.sim.lastReal || Date.now());
    const minutes = Math.min(maxMinutes, Math.round((awayMs / 60000) * 4)); // 1 real minute away = 4 game minutes (it used to be 20: an hour away was most of a day)
    if (minutes < 30) return null;
    const tops = () => S.postOrder.filter((id) => S.posts[id] && !S.posts[id].replyTo).length;
    const topsBefore = tops();
    const before = { posts: S.postOrder.length, stories: S.stories.length, unreadDms: countUnreadDms(S), followers: S.player.followers, notifs: S.notifs.filter((n) => !n.read).length, chron: S.chronicle.length };
    const stories0 = new Set(S.stories.map((s) => s.id));
    E.tick(minutes, true);
    const newPosts = S.postOrder.length - before.posts;
    const recap = {
      minutes,
      posts: Math.max(0, tops() - topsBefore),
      replies: Math.max(0, newPosts - Math.max(0, tops() - topsBefore)),
      stories: S.stories.filter((s) => !stories0.has(s.id)).length,
      dms: Math.max(0, countUnreadDms(S) - before.unreadDms),
      followers: S.player.followers - before.followers,
      events: S.chronicle.slice(before.chron).map((c) => c.text).slice(-4),
      t: S.clock,
    };
    S.recap = recap;
    S.sim.lastReal = Date.now();
    return recap;
  };
  const countUnreadDms = (S) => Object.values(S.dms).reduce((a, l) => a + l.filter((m) => m.from !== 'me' && !m.read).length, 0);
})(window.G);
