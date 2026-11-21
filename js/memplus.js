/* Clout — MEMORY, better. Four things the memory system was missing (free, offline, no AI call):
   1. LEARNING FROM WHAT YOU SAY: promises, secrets, likes and dislikes, personal facts, news about you and how you feel about them become typed memories of the
      person you said it to (DMs and replies; never from a burner account, they do not know it is you).
   2. NEWER REPLACES OLDER: "we broke up" retires "we are together" (it is filed in the vault as outdated); "I hate coffee" retires "I love coffee".
   3. REHEARSAL: every time a memory is actually used it decays more slowly (spaced repetition), so what keeps coming up sticks and trivia fades.
   4. YOU CAN SEE AND FIX IT: 🧠 Memories on a profile lets you pin, edit, delete or add a memory. Pinned memories never leave the front of their mind. */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const Mem = G.Mem;
  const esc = U.esc;
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (s) => String(s || '').split(' ')[0];
  const Mem2 = (G.Mem2 = {});

  /* ---------- 1. learn from what you say ---------- */
  const RULES = [
    { kind: 'secret', imp: 8, re: /\b(secret|don'?t tell|do not tell|between us|nobody knows|no one knows|keep this to yourself|promise me you won'?t)\b/i, say: (P, s) => `${P} told me a secret: "${s}"` },
    { kind: 'promise', imp: 7, re: /\b(i promise|i swear|i will be there|i'?ll be there|i'?ll come|i will come|i'?ll call you|i will call you|i'?ll make it up|i won'?t forget)\b/i, say: (P, s) => `${P} promised: "${s}"` },
    { kind: 'like', imp: 5, re: /\bi (really |absolutely |totally )?(love|like|enjoy|adore|prefer) (?!(?:you|it|that|this|them|her|him)(?![a-z]))([a-z][a-z' -]{2,30})/i, topic: (m) => 'like:' + stemWord(m[3]), say: (P, s, m) => `${P} told me they ${m[2].toLowerCase()} ${clip(m[3].trim(), 30)}` },
    { kind: 'dislike', imp: 6, re: /\bi (really |absolutely |totally )?(hate|can'?t stand|cannot stand|dislike|am afraid of|am scared of|am terrified of) ([a-z][a-z' -]{2,30})/i, topic: (m) => 'like:' + stemWord(m[3]), say: (P, s, m) => `${P} told me they ${m[2].toLowerCase()} ${clip(m[3].trim(), 30)}`, v: -0.2 },
    { kind: 'feeling', imp: 7, re: /\bi (love|miss|trust|need|am sorry|apologi[sz]e|forgive)\b[^.!?]{0,30}\byou\b/i, say: (P, s) => `${P} told me: "${s}"` },
    { kind: 'family', imp: 6, re: /\bmy (mom|mum|mother|dad|father|sister|brother|ex|boss|best friend|roommate|grandma|grandpa|dog|cat|birthday)\b/i, say: (P, s) => `${P} mentioned: "${s}"` },
    { kind: 'place', imp: 6, topical: true, re: /\bi (?:just |recently |finally )?(?:moved|am moving|live|relocated|will move) (?:to|in) ([a-z][a-z' -]{2,25})/i, topic: () => 'place', say: (P, s, m) => P + ' told me they live in ' + clip(m[1].trim(), 25) },
    { kind: 'job', imp: 6, topical: true, re: /\bi (?:just |recently |finally )?(?:got a new job|got hired|started (?:a )?(?:new )?job|work (?:at|as|for) [a-z][a-z' &-]{2,25}|quit my job|got fired|lost my job|got promoted)/i, topic: () => 'job', say: (P, s) => P + ' told me news: "' + s + '"' },
    { kind: 'relstatus', imp: 7, topical: true, re: /\bi(?:'m| am) (single|engaged|married|divorced|seeing someone|dating someone|in a relationship)/i, topic: () => 'relstatus', say: (P, s, m) => P + ' told me they are ' + m[1].toLowerCase() },
    { kind: 'birthday', imp: 6, topical: true, re: /\bmy birthday is (?:on )?([a-z0-9 ,]{3,20})/i, topic: () => 'birthday', say: (P, s) => P + ' told me: "' + s + '"' },
    { kind: 'fav', imp: 5, topical: true, re: /\bmy favou?rite ([a-z ]{3,20}) is ([a-z0-9' -]{2,30})/i, topic: (m) => 'fav:' + stemWord(m[1]), say: (P, s, m) => P + ' told me they have a favourite ' + m[1].trim() + ': ' + clip(m[2].trim(), 30) },
    { kind: 'mood', imp: 4, topical: true, re: /\bi(?:'m| am| feel) (?:so |really |very )?(sad|happy|anxious|angry|exhausted|lonely|excited|stressed|scared|tired)/i, topic: () => 'mood', say: (P, s, m) => P + ' told me they feel ' + m[1].toLowerCase(), v: -0.1 },
    { kind: 'news', imp: 6, re: /\bi (just |finally )?(got|am getting|am moving|moved|quit|lost|won|failed|passed|got fired|got promoted|signed|bought|adopted)\b[^.!?]{3,40}/i, say: (P, s) => `${P} told me news: "${s}"` },
  ];
  function stemWord(w) { return String(w || '').toLowerCase().replace(/[^a-z ]/g, '').trim().split(' ')[0].replace(/(ing|ed|es|s)$/, ''); }
  Mem2.extract = function (text) {
    const P = first(G.S.player.name);
    const out = [];
    String(text || '').split(/(?<=[.!?\n])\s+/).forEach((sent) => {
      sent = sent.trim();
      if (sent.length < 8 || /\?\s*$/.test(sent)) return; // questions teach nothing
      let topical = false;
      const before = out.length;
      RULES.slice().sort((a, b) => (b.topical ? 1 : 0) - (a.topical ? 1 : 0)).forEach((r) => { // (changing facts first, so they win over the general rules)
        const m = sent.match(r.re);
        if (!m || out.some((o) => o.kind === r.kind) || ((r.kind === 'news' || r.kind === 'family') && topical)) return;
        if (r.topical) topical = true;
        out.push({ kind: r.kind, text: r.say(P, clip(sent, 110), m), imp: r.imp, topic: r.topic ? r.topic(m) : null, v: r.v || 0.1 });
      });
      // nothing above matched, but it is something heavy (illness, grief, loss, crisis) or good news about THEM: it must not be lost (judged by meaning, G.Mind)
      if (out.length === before && G.Mind && /\b(i|i'?m|im|i'?ve|my|me|we|we'?re|our)\b/i.test(sent)) {
        try {
          const r = G.Mind.read(sent);
          if (r.sens >= 0.5) out.push({ kind: 'disclosure', text: P + ' told me something heavy: "' + clip(sent, 110) + '"', imp: G.Mind.salience(sent), topic: null, v: -0.2 });
          else if (r.good) out.push({ kind: 'goodnews', text: P + ' told me good news: "' + clip(sent, 110) + '"', imp: 7, topic: null, v: 0.4 });
        } catch (e) {}
      }
    });
    return out.slice(0, 5);
  };
  Mem2.learn = function (npc, text) {
    if (!npc || npc.userAlt || npc.blocked || !text) return [];
    const made = [];
    Mem2.extract(text).forEach((x) => {
      if ((npc.mem || []).some((m) => m.text === x.text)) return;
      made.push(Mem.add(npc, { kind: 'said', text: x.text, who: ['me'], imp: x.imp, valence: x.v, topic: x.topic, tags: [x.kind] }));
    });
    return made;
  };
  { // DMs and replies you send (a burner account is a stranger to them: nothing is learned)
    const speak0 = E.speak;
    E.speak = function (o) {
      const p = speak0.apply(this, arguments);
      try {
        const S = G.S;
        if (o && (o.mode === 'dm' || o.mode === 'reply') && !o.accountId && !(S && S.activeAlt)) {
          const par = o.mode === 'reply' && S.posts[o.replyTo];
          const npc = o.mode === 'dm' ? S.npcs[o.npcId] : par && S.npcs[par.author];
          const text = o.text;
          if (npc) Promise.resolve(p).then((r) => { if (r !== false && r != null) { try { Mem2.learn(npc, text); } catch (e) {} } }, () => {});
        }
      } catch (e) {}
      return p;
    };
  }

  // what you say in PUBLIC (your own posts) is known by the people close to you and by family, but never the private kinds (secrets, promises)
  Mem2.learnPublic = function (text) {
    const S = G.S;
    let n = 0;
    Mem2.extract(text).filter((x) => !['secret', 'promise', 'feeling'].includes(x.kind)).forEach((x) => {
      Object.values(S.npcs).filter((c) => !c.userAlt && !c.blocked && ((c.aff || 0) >= 35 || E.isFamily(c)) && (c.age == null || c.age >= 18) && n < 6).forEach((c) => {
        if ((c.mem || []).some((m) => m.text === x.text)) return;
        Mem.add(c, { kind: 'said', text: x.text, who: ['me'], imp: Math.max(3, x.imp - 1), valence: x.v, topic: x.topic, tags: [x.kind, 'public'] });
        n++;
      });
    });
    return n;
  };
  {
    const speak1 = E.speak;
    E.speak = function (o) {
      const p = speak1.apply(this, arguments);
      try {
        if (o && o.mode === 'post' && !o.accountId && !(G.S && G.S.activeAlt) && o.text) { const text = o.text; Promise.resolve(p).then((r) => { if (r !== false && r != null) { try { Mem2.learnPublic(text); } catch (e) {} } }, () => {}); }
      } catch (e) {}
      return p;
    };
  }

  // facts travel: what someone learned about you is told, a day or two later, to a friend they are close to (never secrets)
  Mem2.spread = function () {
    const S = G.S;
    if (!S || G.settings.memSpread === false) return 0;
    let made = 0;
    Object.values(S.npcs).forEach((a) => {
      if (a.userAlt || a.blocked || made >= 4) return;
      (a.mem || []).forEach((m) => {
        if (m.told || m.kind !== 'said' || (m.tags || []).includes('secret') || (m.tags || []).includes('promise') || Mem.isDelicate(m) || S.clock - m.t < 600 || S.clock - m.t > 14400) return;
        m.told = 1;
        const edges = (S.npcRel || []).filter((e) => (e.a === a.id || e.b === a.id) && ['friend', 'best_friend', 'family', 'dating', 'partner', 'ally'].includes(e.type));
        if (!edges.length || Math.random() > 0.5) return;
        const e = edges[Math.floor(Math.random() * edges.length)];
        const b = S.npcs[e.a === a.id ? e.b : e.a];
        if (!b || b.userAlt || b.blocked) return;
        if ((b.mem || []).some((x) => x.text.includes('"' + m.text + '"'))) return;
        Mem.add(b, { kind: 'said', text: G.U.first(a.name) + ' told me about ' + G.U.first(S.player.name) + ': "' + m.text + '"', who: ['me', a.id], imp: Math.max(3, m.imp - 2), valence: m.v, tags: ['hearsay'] });
        made++;
      });
    });
    return made;
  };
  {
    let lastSlot = -1;
    const tick1 = E.tick;
    E.tick = function () {
      const r = tick1.apply(this, arguments);
      try { const S = G.S; const slot = Math.floor(S.clock / 360); if (slot !== lastSlot) { lastSlot = slot; Mem2.spread(); } } catch (e) {}
      return r;
    };
  }

  /* ---------- the story together (a timeline of milestones with you) ---------- */
  const MILESTONES = [
    { id: 'first', test: () => true, once: true, say: (m) => 'Our first moment: ' + clip(m.text, 80) },
    { id: 'fight1', once: true, test: (m) => ['fight', 'betrayal', 'shade'].includes(m.kind) && m.imp >= 6 && m.v < 0, say: (m) => 'Our first falling out: ' + clip(m.text, 80) },
    { id: 'conflict', test: (m) => ['fight', 'betrayal'].includes(m.kind) && m.imp >= 8, say: (m) => 'A bad moment: ' + clip(m.text, 80) },
    { id: 'secret1', once: true, test: (m) => (m.tags || []).includes('secret') || m.kind === 'secret', say: () => 'You trusted me with a secret for the first time' },
    { id: 'promise', test: (m) => (m.tags || []).includes('promise'), say: (m) => clip(m.text, 90) },
    { id: 'broken', test: (m) => /never showed up/i.test(m.text), say: (m) => 'A promise was broken: ' + clip(m.text, 80) },
    { id: 'kept', test: (m) => /\bshowed up\b/i.test(m.text) && !/never/i.test(m.text), say: (m) => 'A promise was kept: ' + clip(m.text, 80) },
    { id: 'apology', test: (m) => m.kind === 'apology', say: (m) => 'An apology: ' + clip(m.text, 80) },
    { id: 'kind1', once: true, test: (m) => ['compliment', 'gift', 'defend'].includes(m.kind), say: (m) => 'The first kind thing: ' + clip(m.text, 80) },
    { id: 'confession', test: (m) => m.kind === 'confession', say: (m) => clip(m.text, 90) },
    { id: 'breakup', test: (m) => m.kind === 'breakup', say: (m) => clip(m.text, 90) },
    { id: 'rejection', test: (m) => m.kind === 'rejection', say: (m) => clip(m.text, 90) },
    { id: 'big', test: (m) => m.imp >= 9, say: (m) => 'A moment that changed things: ' + clip(m.text, 80) },
  ];
  Mem2.milestone = function (npc, m) {
    if (!m || !(m.who || []).includes('me') || /^I (reached out|said in)/.test(m.text) || (m.tags || []).includes('hearsay')) return null;
    const tl = npc.tl || [];
    const hit = MILESTONES.find((x) => x.test(m) && (!x.once || !tl.some((e) => e.id === x.id)));
    if (!hit) return null;
    const text = hit.say(m);
    if (tl.some((e) => e.text === text)) return null;
    npc.tl = tl;
    const e = { t: m.t, id: hit.id, text };
    tl.push(e);
    if (tl.length > 40) { const keep = tl.slice(0, 10).concat(tl.slice(-30)); tl.length = 0; keep.forEach((x) => tl.push(x)); } // the first ten and the latest thirty
    return e;
  };
  Mem2.timeline = (npc) => (npc && npc.tl ? npc.tl.slice().sort((a, b) => a.t - b.t) : []);
  // a change of how they stand with you is a milestone too ("became close friends", "started dating", "no longer lovers")
  Mem2.statusWatch = function () {
    const S = G.S;
    Object.values(S.npcs).forEach((n) => {
      if (n.userAlt || n.blocked) return;
      if (n.tls == null) { n.tls = n.status; return; }
      if (n.tls === n.status) return;
      const label = UI.statusMeta(n.status, n).label.toLowerCase();
      n.tl = n.tl || [];
      n.tl.push({ t: S.clock, id: 'status', text: 'We became: ' + label + ' (before: ' + String(n.tls).replace(/_/g, ' ') + ')' });
      if (n.tl.length > 40) n.tl.splice(10, n.tl.length - 40);
      n.tls = n.status;
    });
  };
  {
    let slot = -1;
    const tick2 = E.tick;
    E.tick = function () {
      const r = tick2.apply(this, arguments);
      try { const S = G.S; const s2 = Math.floor(S.clock / 60); if (s2 !== slot) { slot = s2; Mem2.statusWatch(); } } catch (e) {}
      return r;
    };
  }

  // every other place you speak is heard too: a group chat (its members), a public channel (people close to you), your own stories (people close to you)
  Mem2.learnGroup = function (groupId, text) {
    const S = G.S;
    const g = S.groups && S.groups[groupId];
    if (!g) return 0;
    let n = 0;
    (g.members || []).forEach((id) => { const c = S.npcs[id]; if (c && !c.userAlt && !c.blocked && Mem2.learn(c, text).length) n++; });
    return n;
  };
  {
    const gs0 = E.groupSend;
    if (gs0) E.groupSend = function (id, text) {
      const p = gs0.apply(this, arguments);
      try { if (text && !(G.S && G.S.activeAlt)) Promise.resolve(p).then((r) => { if (r !== false) { try { Mem2.learnGroup(id, text); } catch (e) {} } }, () => {}); } catch (e) {}
      return p;
    };
    const ch0 = G.Channels && G.Channels.send;
    if (ch0) G.Channels.send = function (id, text) {
      const r = ch0.apply(this, arguments);
      try { if (!(G.S && G.S.activeAlt)) Mem2.learnPublic(text); } catch (e) {}
      return r;
    };
    const ps0 = E.postStory;
    if (ps0) E.postStory = function (text, emoji, accountId) {
      const r = ps0.apply(this, arguments);
      try { if (text && !accountId && !(G.S && G.S.activeAlt)) Mem2.learnPublic(text); } catch (e) {}
      return r;
    };
  }

  /* ---------- 2. newer replaces older ---------- */
  const TOPIC_KINDS = { breakup: 'relationship', confession: 'relationship', rejection: 'relationship' };
  Mem2.supersede = function (npc, topic, who) {
    let n = 0;
    npc.mem = (npc.mem || []).filter((m) => {
      if (m.topic !== topic || m.pin || m.sens >= 0.5) return true;
      if (who && who.length && m.who && m.who.length && !m.who.some((w) => who.includes(w))) return true;
      if (G.Vault) G.Vault.archive(npc, Object.assign({}, m, { text: '(outdated) ' + m.text, imp: Math.max(1, m.imp - 2) }));
      n++;
      return false;
    });
    return n;
  };
  {
    const add0 = Mem.add;
    Mem.add = function (npc, o) {
      o = o || {};
      const topic = o.topic || TOPIC_KINDS[o.kind] || null;
      if (topic) Mem2.supersede(npc, topic, o.who);
      const m = add0.call(this, npc, o);
      if (topic && m) m.topic = topic;
      if (o.pin && m) m.pin = true;
      try { if (m) Mem2.milestone(npc, m); } catch (e) {}
      return m;
    };
  }

  /* ---------- 3. rehearsal ---------- */
  // used by Mem.score / Rag.recall: a memory that keeps being recalled fades more slowly
  Mem2.rehearse = function (m) {
    if (!m) return;
    m.rh = Math.min(8, (m.rh || 0) + 1);
    if (m.rh === 3 || m.rh === 6) m.imp = Math.min(10, m.imp + 1);
  };

  /* ---------- 5. CALLBACKS: a reaction that is about YOU, not a generic one ----------
     When a character comments on your post or writes to you, and they really remember something specific about you (what you said, promised, did to them),
     they bring that up in their own voice. Warm memories get a warm callback, bad ones a sharp one. Each memory is brought up at most once a day, and every
     time it is, it is rehearsed (remembered a little better). Free: no AI call. */
  const KINDS = ['said', 'secret', 'promise', 'apology', 'defend', 'compliment', 'gift', 'flirt', 'breakup', 'confession', 'rejection', 'fight', 'betrayal', 'event', 'shade'];
  const re = (x) => new RegExp(x, 'i');
  Mem2.phrase = function (m) {
    const P = first(G.S.player.name).replace(/[.*+?^$()|[\]\{}]/g, '\$&');
    let t = String(m.text || '');
    let core;
    let x;
    if ((x = t.match(re('^' + P + ' told me a secret: "(.*)"$')))) core = 'what you told me in secret ("' + x[1].replace(/\.$/, '') + '")';
    else if ((x = t.match(re('^' + P + ' promised: "(.*)"$')))) core = 'you promised "' + x[1].replace(/\.$/, '') + '"';
    else if ((x = t.match(re('^' + P + ' told me they (.*)$')))) core = 'you told me you ' + x[1];
    else if ((x = t.match(re('^' + P + ' mentioned: "(.*)"$')))) core = 'you mentioned "' + x[1].replace(/\.$/, '') + '"';
    else if ((x = t.match(re('^' + P + ' told me news: "(.*)"$')))) core = 'you told me "' + x[1].replace(/\.$/, '') + '"';
    else if ((x = t.match(re('^' + P + ' told me (?:something heavy|good news): "(.*)"$')))) core = 'what you told me ("' + x[1].replace(/\.$/, '') + '")';
    else if ((x = t.match(re('^' + P + ' told me: "(.*)"$')))) core = 'you told me "' + x[1].replace(/\.$/, '') + '"';
    else core = t.replace(new RegExp('\\b' + P + "(?:'s)?\\b", 'gi'), (m) => (/'s$/i.test(m) ? 'your' : 'you')).replace(/\bthem\b/gi, 'you');
    return core.replace(/\s*\(x\d+\)/g, '').replace(/\s+/g, ' ').trim(); // (never "Sam's" / "(x9)": the player is "you", and gist counters stay inside the memory)
  };
  const GOOD = [(c) => 'I have not forgotten: ' + c + ' 🥹', (c) => 'still thinking about this: ' + c, (c) => 'remember when ' + c + '? that stays with me', (c) => c + '. I keep that close', (c) => 'I keep coming back to ' + c, (c) => 'that meant a lot to me: ' + c, (c) => 'I still smile when I think of ' + c, (c) => 'I remember that moment with you: ' + c]; // eslint-disable-line
  const SHARP = [(c) => 'funny, because ' + c + ' and now this?', (c) => 'remember when ' + c + '? yeah. I do.', (c) => c + '. just saying', (c) => 'I have a good memory: ' + c, (c) => 'I have not forgotten ' + c, (c) => c + '. I noticed.', (c) => 'that is still on my mind: ' + c, (c) => 'in case you forgot, ' + c, (c) => 'you remember what you said? ' + c, (c) => 'hard to move past this one: ' + c, (c) => 'I still hear this in my head: ' + c, (c) => 'you really said it out loud: ' + c];
  const MEH = [(c) => c + '... anyway 👀', (c) => 'this made me think of it: ' + c, (c) => 'I was just remembering ' + c, (c) => 'I remembered this today: ' + c, (c) => 'funny what sticks with you: ' + c, (c) => 'that came back to me: ' + c];
  const CARE = [(c) => 'I have been thinking about what you told me. how are you holding up?', (c) => 'I have not stopped thinking about it. are you okay?', (c) => 'no pressure, but I am here if you want to talk about it']; // eslint-disable-line
  const DMS = [(c) => 'I keep coming back to this: ' + c, (c) => 'remember ' + c + '? it has been on my mind', (c) => 'can we talk about it? ' + c, (c) => 'I wanted to bring this up again: ' + c, (c) => 'I have been meaning to ask about ' + c, (c) => 'I keep thinking about what happened: ' + c];
  // the strongest, freshest thing they remember about you that fits what is going on (null when nothing is worth bringing up)
  Mem2.callback = function (n, o = {}) {
    const S = G.S;
    if (!n || n.userAlt || n.blocked) return null;
    const now = S.clock;
    const cand = (n.mem || []).filter((m) => KINDS.includes(m.kind) && (m.who || []).includes('me') && m.imp >= 5 && now - (m.cb != null ? m.cb : -1e9) > 1440 && !/^I (reached out|said in)/.test(m.text) && !(o.pub && Mem.isDelicate(m))); // (something delicate is never turned into a public quip)
    if (!cand.length) return null;
    const m = cand.map((x) => [G.Mem.score(x, now, { who: ['me'], text: o.ctx || '' }) + (x.rh || 0) * 0.05, x]).sort((a, b) => b[0] - a[0])[0][1];
    const own = G.U.first(n.name);
    const core = Mem2.phrase(m).replace(new RegExp('\\b' + own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), 'me'); // (a shared memory lists everyone who was there: they say "me and Ava", never their own name)
    return { m, core };
  };
  Mem2.say = function (n, cb, kind, rnd, dry) {
    const bad = cb.m.v < -0.3;
    const good = cb.m.v > 0.15;
    const list = Mem.isDelicate(cb.m) ? CARE : kind === 'dm' ? DMS : bad ? SHARP : good ? GOOD : MEH;
    let text = list[Math.floor(rnd() * list.length) % list.length](cb.core);
    try { text = G.Voice.stylize(text, n, rnd, { short: true }); } catch (e) {}
    if (!dry) { cb.m.cb = G.S.clock; Mem2.rehearse(cb.m); } // (dry = only drafting a possible message: it counts when it is really sent)
    return text;
  };
  { // comments on your posts
    const comment0 = G.Voice.comment;
    G.Voice.comment = function (n, stance, ctx) {
      try {
        if (ctx && ctx.post && ctx.post.author === 'me' && ctx.rnd && !ctx.hot) {
          const cb = Mem2.callback(n, { ctx: ctx.post.text, pub: true });
          if (cb && ctx.rnd() < Math.min(0.55, 0.16 + 0.06 * (cb.m.imp - 5) + 0.03 * (cb.m.rh || 0))) return Mem2.say(n, cb, 'comment', ctx.rnd);
        }
      } catch (e) {}
      return comment0.apply(this, arguments);
    };
  }

  /* ---------- 4. see and fix what they remember ---------- */
  Mem2.open = function (id) {
    const S = G.S;
    const n = S.npcs[id];
    if (!n) return;
    UI.memId = id;
    const list = (n.mem || []).map((m, i) => [m, i]).sort((a, b) => (b[0].pin ? 100 : 0) + b[0].imp - ((a[0].pin ? 100 : 0) + a[0].imp) || b[0].t - a[0].t).slice(0, 40);
    const vault = Object.keys(n.vault || {}).map((k) => G.Vault.summary(n, k)).filter(Boolean);
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🧠 What ${esc(n.name)} remembers</h3>
      ${Mem2.timeline(n).length ? `<div class="card" style="margin:6px 0"><b>📖 Your story together</b>${Mem2.timeline(n).map((e) => `<div class="small" style="margin-top:4px"><span class="muted">${esc(U.clockStr ? U.clockStr(e.t) : e.t)}</span> · ${esc(e.text)}</div>`).join('')}</div>` : ''}
      <p class="muted small">Strongest first. 📌 pinned memories never leave the front of their mind. Older things are filed in the vault, not lost.</p>
      <div class="memlist">${list.map(([m, i]) => `<div class="memrow"><div class="grow small">${m.pin ? '📌 ' : ''}${esc(m.text)} <span class="muted">· ${m.imp}/10${m.rh ? ' · recalled ' + m.rh + 'x' : ''}${m.topic ? ' · ' + esc(m.topic) : ''}</span></div><div class="row" style="gap:4px"><button class="btn sm" data-act="memPin" data-i="${i}" title="Pin or unpin">📌</button><button class="btn sm" data-act="memEdit" data-i="${i}" title="Edit">✏️</button><button class="btn sm danger" data-act="memDel" data-i="${i}" title="Forget this">🗑</button></div></div>`).join('') || '<div class="muted small">Nothing yet.</div>'}</div>
      ${vault.length ? `<div class="muted small" style="margin-top:6px"><b>Filed in the vault:</b><br>${vault.map(esc).join('<br>')}</div>` : ''}
      <label style="margin-top:8px">Add a memory</label><textarea id="mem_add" rows="2" maxlength="220" placeholder="${esc(n.name)} remembers that…"></textarea>
      <div class="row" style="gap:8px;margin-top:6px"><select id="mem_imp"><option value="5">Normal</option><option value="7">Important</option><option value="9">Unforgettable</option></select><button class="btn primary" data-act="memAdd">➕ Add</button></div>`);
  };
  const cur = () => (G.S && G.S.npcs[UI.memId]) || null;
  A.memOpen = (d) => Mem2.open(d.id);
  A.memPin = (d) => { const n = cur(); const m = n && n.mem[+d.i]; if (!m) return; m.pin = !m.pin; G.Store.saveSoon(); Mem2.open(n.id); };
  A.memEdit = (d) => {
    const n = cur(); const m = n && n.mem[+d.i];
    if (!m) return;
    const t = window.prompt('Edit this memory', m.text);
    if (t != null && t.trim()) { m.text = t.trim().slice(0, 220); G.Store.saveSoon(); }
    Mem2.open(n.id);
  };
  A.memDel = (d) => { const n = cur(); if (!n || !n.mem[+d.i]) return; n.mem.splice(+d.i, 1); G.Store.saveSoon(); Mem2.open(n.id); };
  A.memAdd = () => {
    const n = cur();
    const t = ((document.querySelector('#mem_add') || {}).value || '').trim();
    if (!n || !t) return UI.toast('Write the memory first.', 'info');
    const imp = +((document.querySelector('#mem_imp') || {}).value || 5);
    Mem.add(n, { kind: 'event', text: t, who: ['me'], imp, pin: imp >= 9 });
    G.Store.saveSoon();
    Mem2.open(n.id);
  };
  Mem2.button = (n) => (n ? `<button class="btn sm" data-act="memOpen" data-id="${n.id}" title="See, pin, edit or add what they remember">🧠 Memories</button>` : '');
})(window.G);
