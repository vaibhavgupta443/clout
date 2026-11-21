/* Clout — the AI "content bank".
   One cheap call writes a batch of in-voice posts / comments / DMs / stories for several characters.
   The free simulator then spends those lines over the next hours, so the world's WORDS are as varied as your model — while almost all of the activity stays free.
   Generated text is cleaned for valid strings and length; no keyword filter is applied. */
(function (G) {
  const U = G.U;
  const Bank = (G.Bank = { busy: false, lastErr: '', calls: 0, filled: 0, used: 0, rejected: 0, lastAt: 0, backoff: 0, EVERY_MS: 45000, EVERY_FREE_MS: 15000, BATCH: 2, LOW: 4 }); // 2 characters per call: bigger batches get cut off by the model's output limit

  const POST_KINDS = ['selfie', 'food', 'vent', 'meme', 'win', 'romance', 'motivation', 'night', 'subtweet'];
  const COMMENT_KEYS = ['cheer', 'compliment', 'tease', 'flirt', 'hostile', 'critique', 'curious', 'empathize', 'indifferent'];
  const DM_KEYS = ['checkin', 'flirt', 'latenight', 'gossip', 'reactstory'];
  const CAP = { post: 5, comment: 4, dm: 4, story: 10 }; // lines kept per key / per list
  const STANCE_KEY = { cheer: 'cheer', agree: 'cheer', relate: 'cheer', compliment: 'compliment', tease: 'tease', flirt: 'flirt', hostile: 'hostile', critique: 'critique', curious: 'curious', empathize: 'empathize', concern: 'empathize', indifferent: 'indifferent' };

  const clean = (v, max = 280) => {
    if (typeof v !== 'string') return '';
    const t = v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > max) return '';
    return t;
  };

  const store = (S) => (S.bank = S.bank && typeof S.bank === 'object' ? S.bank : {});
  const slot = (S, id) => {
    const b = store(S);
    const s = (b[id] = b[id] && typeof b[id] === 'object' ? b[id] : {});
    s.post = s.post || {};
    s.comment = s.comment || {};
    s.dm = s.dm || {};
    s.story = Array.isArray(s.story) ? s.story : [];
    return s;
  };
  const cnt = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0) : 0);
  // read-only: safe to call from a render (never creates anything in the saved world)
  const size = (s) => (s ? cnt(s.post) + cnt(s.comment) + cnt(s.dm) + (Array.isArray(s.story) ? s.story.length : 0) : 0);

  Bank.enabled = () => !!(G.S && G.settings.liveBank !== false && G.AI && G.AI.ready() && G.AI.usable());
  Bank.stock = (S = G.S) => (S && S.bank ? Object.keys(S.bank).reduce((a, id) => a + size(S.bank[id]), 0) : 0);

  /* ---------- spending a line (called by Voice) ---------- */

  function pop(list, npc) {
    if (!Array.isArray(list)) return null;
    for (let tries = 0; tries < 4 && list.length; tries++) {
      const t = list.shift();
      if (typeof t !== 'string') continue;
      if (G.Persona && G.Persona.dupText(npc, t)) continue; // never say the same thing twice
      return t;
    }
    return null;
  }
  // returns text or null (the caller then falls back to its free templates)
  Bank.take = function (npc, type, key) {
    const S = G.S;
    if (!S || !S.bank || !S.bank[npc.id] || G.settings.liveBank === false) return null;
    const s = slot(S, npc.id);
    let t = null;
    if (type === 'post') {
      t = pop(s.post[key], npc);
    } else if (type === 'comment') {
      const k = STANCE_KEY[key];
      if (!k) return null;
      t = pop(s.comment[k], npc);
    } else if (type === 'dm') {
      t = pop(s.dm[key], npc);
    } else if (type === 'story') t = pop(s.story, npc);
    if (t) Bank.used++;
    return t;
  };

  /* ---------- asking the model ---------- */

  const traitWords = (n) => {
    const p = G.Persona.ensure(n);
    const t = p.t;
    const w = [];
    w.push(t.E > 62 ? 'outgoing' : t.E < 38 ? 'reserved' : 'balanced');
    w.push(t.A > 62 ? 'warm' : t.A < 38 ? 'blunt/abrasive' : 'fair');
    if (t.N > 62) w.push('emotional/anxious');
    if (t.C > 62) w.push('disciplined');
    if (t.O > 62) w.push('creative/curious');
    return w.join(', ') + `; humour: ${p.humor}; interests: ${p.interests.join('/') || 'varied'}; typing: ${p.style && p.style.lower ? 'all lowercase' : p.style && p.style.caps ? 'CAPS' : 'normal'}${p.style && p.style.emoji > 0.5 ? ', lots of emoji' : ''}`;
  };

  const buildPrompt = (npcs) => {
    const S = G.S;
    const postKeys = POST_KINDS;
    const commentKeys = COMMENT_KEYS;
    const dmKeys = DM_KEYS;
    const who = npcs
      .map((n) => `- ${n.id}: ${n.name} (@${String(n.handle).replace(/^@/, '')}), age ${n.age}, ${String(n.personality || '').slice(0, 140)}. ${traitWords(n)}. Relationship to the player ${S.player.name}: ${n.status}${G.Tier && G.Tier.is(n) ? ' (LOVER: the deepest bond, they are in love and fully at ease with each other)' : ''}.`)
      .join('\n');
    return `World: ${S.world.name} — ${String(S.world.setting || '').slice(0, 240)}
Write a bank of ready-to-post social media lines for these characters. Each line must sound EXACTLY like that character (their slang, typing style, humour, attitude); no two lines alike; no hashtags spam; each under 200 characters; never mention being an AI.
CHARACTERS:
${who}

For EACH character write: 2 lines for each of these post kinds [${postKeys.join(', ')}]; 2 short generic comments (reactions that fit ANY post, no specifics) for each of these stances [${commentKeys.join(', ')}]; 2 DMs the character would START a chat with for each of [${dmKeys.join(', ')}] (checkin = casual hello, latenight = late-night text, gossip = juicy news, reactstory = replying to the player's story); and 5 short Instagram-story captions.
Return ONLY this JSON: {"npcs":{"<id>":{"posts":{"<kind>":["..",".."]},"comments":{"<stance>":["..",".."]},"dms":{"<key>":["..",".."]},"stories":["..",..]}}}`;  };

  const absorb = (S, npc, raw) => {
    if (!raw || typeof raw !== 'object') return 0;
    const s = slot(S, npc.id);
    let n = 0;
    const add = (list, v, cap) => {
      const t = clean(v);
      if (!t || list.includes(t)) return;
      list.push(t);
      if (list.length > cap) list.shift();
      n++;
    };
    const lists = (obj, into, cap, keys) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      Object.keys(obj).forEach((k) => {
        if (!keys.includes(k) || !Array.isArray(obj[k])) return;
        into[k] = into[k] || [];
        obj[k].slice(0, 4).forEach((v) => add(into[k], v, cap));
      });
    };
    lists(raw.posts, s.post, CAP.post, POST_KINDS);
    lists(raw.comments, s.comment, CAP.comment, COMMENT_KEYS);
    lists(raw.dms, s.dm, CAP.dm, DM_KEYS);
    if (Array.isArray(raw.stories)) raw.stories.slice(0, 8).forEach((v) => add(s.story, v, CAP.story));
    return n;
  };

  // who needs lines most: people the player cares about and active posters, whose bank is low
  Bank.pickNeedy = function (limit = Bank.BATCH) {
    const S = G.S;
    return Object.values(S.npcs)
      .filter((n) => !n.blocked)
      .map((n) => {
        const have = S.bank && S.bank[n.id] ? size(S.bank[n.id]) : 0;
        const p = G.Persona.ensure(n);
        return { n, have, score: (have < Bank.LOW ? 100 : 0) - have + p.t.E / 10 + Math.max(0, n.aff) / 25 + n.rom / 30 + Math.random() };
      })
      .filter((x) => x.have < 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.n);
  };

  // one batch. Returns the number of lines stored (0 on failure; the reason is in Bank.lastErr)
  Bank.refill = async function (npcs) {
    const S = G.S;
    if (!S || Bank.busy || !G.AI.ready()) return 0;
    npcs = (npcs && npcs.length ? npcs : Bank.pickNeedy()).slice(0, Bank.BATCH);
    if (!npcs.length) return 0;
    Bank.busy = true;
    const mine = S;
    try {
      const out = await G.AI.json({ task: 'bank', user: buildPrompt(npcs), maxTokens: 2200 * npcs.length, temperature: Math.min(1.1, (G.settings.temperature || 0.9) + 0.1), system: G.AI.system() });
      Bank.calls++;
      if (G.S !== mine) return 0; // the player switched worlds meanwhile
      const map = out.data.npcs && typeof out.data.npcs === 'object' ? out.data.npcs : out.data;
      let n = 0;
      npcs.forEach((npc) => {
        n += absorb(mine, npc, map[npc.id] || map[npc.name] || null);
      });
      Bank.filled += n;
      Bank.lastErr = n ? '' : 'The model returned no usable lines.';
      Bank.backoff = n ? 0 : Math.min(600000, (Bank.backoff || 15000) * 2);
      G.Store.saveSoon();
      return n;
    } catch (e) {
      Bank.lastErr = String((e && e.message) || e).slice(0, 200);
      Bank.backoff = Math.min(600000, (Bank.backoff || 15000) * 2);
      return 0;
    } finally {
      Bank.busy = false;
      Bank.lastAt = Date.now();
    }
  };

  // called from the heartbeat: top the bank up in the background, never while a turn is running
  Bank.tick = function () {
    if (!Bank.enabled() || Bank.busy || G.busy || document.hidden) return null;
    if (Date.now() - Bank.lastAt < (G.AI.routesLocal('bank') ? Bank.EVERY_FREE_MS : Bank.EVERY_MS) + Bank.backoff) return null; // a free local helper can top up more often
    if (!G.World.speedMinutes()) return null;
    Bank.lastAt = Date.now();
    return Bank.refill();
  };

  Bank.stats = () => ({ stock: G.S ? Bank.stock() : 0, filled: Bank.filled, used: Bank.used, rejected: Bank.rejected, calls: Bank.calls, error: Bank.lastErr });
  Bank.clear = () => {
    if (G.S) G.S.bank = {};
    G.Store.saveSoon();
  };
  Bank.STANCE_KEY = STANCE_KEY;
})(window.G);
