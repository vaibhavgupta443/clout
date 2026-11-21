/* Clout — relationship milestone moments.
   When a bond really turns (first close friend, a confession, a makeup, a breakup, a betrayal) a short 3-card scene waits for you:
   their line (in their own voice, picked with Dialogue.styleOf), your answer (2-3 choices) and the aftermath. Each milestone plays once.
   Free (no AI). Bonds.onChange tells us about stage changes and conflict events; the AI path (Engine.applyRel) is watched too.
   State is written only when something happens: S.momentQ (<= 3 waiting) and S.moments (<= 30 played, {id,t,npc,kind,line,pick}). */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const A = UI.acts;
  const { esc } = U;
  const M = (G.Moments = {});
  const EMPTY = Object.freeze([]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const first = (s) => String(s || '').split(' ')[0];
  const QMAX = 3;
  const HMAX = 30;
  const COUPLE = ['dating', 'partner'];
  const CLOSE = ['close_friend', 'best_friend'];
  const PRIORITY = ['betrayal', 'breakup', 'confession', 'makeup', 'close'];
  const COOL = { close: Infinity, confession: Infinity, makeup: 6 * 1440, breakup: 6 * 1440, betrayal: 6 * 1440 }; // the same milestone does not replay inside this window
  const WHAT = { close: 'becoming close friends', confession: 'their confession', makeup: 'making up', breakup: 'the breakup', betrayal: 'the betrayal' };
  const TITLE = { close: 'A closer friend', confession: 'A confession', makeup: 'Making up', breakup: 'The end of something', betrayal: 'Broken trust' };

  /* ---------- their line, by voice: warm (shy, bubbly, flirty) / plain (formal, blunt) / sharp (cold, snarky) ---------- */
  const GROUP = { shy: 'warm', bubbly: 'warm', flirty: 'warm', formal: 'plain', blunt: 'plain', cold: 'sharp', snarky: 'sharp' };
  const LINES = {
    close: {
      warm: ['i don\'t say this much, but you\'re one of my people now, {me}.', 'honestly? i think you might be my closest friend here. don\'t make it weird.'],
      plain: ['I want you to know I count you among my closest friends, {me}.', 'You are someone I trust. I wanted to say so.'],
      sharp: ['don\'t get a big head, {me}, but you made the short list.', 'fine, i\'ll say it once: you\'re a real friend. i don\'t hand that out.'],
    },
    confession: {
      warm: ['i have to say it before i lose my nerve: i like you, {me}. a lot.', 'i keep thinking about you, and i needed you to know.'],
      plain: ['I will be direct. I have feelings for you, {me}, and I would rather say it than guess.', 'I find that I care for you in a way that is more than friendship.'],
      sharp: ['don\'t laugh. i like you, {me}. there. i said it.', 'ugh. fine. i have feelings for you and i hate how that sounds.'],
    },
    makeup: {
      warm: ['i hate fighting with you, {me}. can we start over?', 'i was thinking about it all day. i\'m sorry, and i miss you.'],
      plain: ['I was out of line. I would like to put this behind us, {me}.', 'I have thought it over, and I would like us to be on good terms again.'],
      sharp: ['fine. i\'m sorry, {me}. happy now? i did miss you.', 'i\'m not good at this. truce?'],
    },
    breakup: {
      warm: ['i think we both know this isn\'t working, {me}. i\'m so sorry.', 'i care about you, but i can\'t keep doing this. i\'m sorry.'],
      plain: ['I do not think we should continue, {me}. I am sorry it ends this way.', 'This has run its course. I wish you well.'],
      sharp: ['we\'re done, {me}. i\'d rather we both say it out loud.', 'it\'s over. don\'t make me explain it twice.'],
    },
    betrayal: {
      warm: ['i messed up, {me}, and i let you down. i won\'t pretend i didn\'t.', 'i broke your trust and i feel sick about it.'],
      plain: ['I broke your trust, {me}. I will not insult you with an excuse.', 'I acted against what we agreed. That is on me.'],
      sharp: ['yeah, i did it, {me}. you\'d have found out anyway.', 'i\'m not going to grovel. it happened.'],
    },
    hurt: {
      warm: ['i heard what happened, {me}, and it really hurt. i trusted you.', 'i don\'t even know what to say. i thought we were better than this.'],
      plain: ['I trusted you, {me}, and I now know that was misplaced.', 'What you did has changed how I see you.'],
      sharp: ['so that\'s who you are, {me}. good to know.', 'wow. just wow. i won\'t forget this.'],
    },
  };
  // your answers: type warm / steady / cool, and how far the bond moves (clamped again by Engine.vetRel)
  const CHOICES = {
    close: [['Say you feel the same', 'warm', { aff: 6, trust: 4 }], ['Smile and say thank you', 'steady', { aff: 3, trust: 2 }], ['Tease them, lightly', 'cool', { aff: 1 }]],
    confession: [['Say you feel the same', 'warm', { rom: 10, aff: 4, trust: 2 }], ['Ask for time to think', 'steady', { aff: 1, trust: 3 }], ['Say you only see a friend', 'cool', { rom: -6, aff: -2, trust: 2 }]],
    makeup: [['Forgive them and let it go', 'warm', { aff: 6, trust: 5 }], ['Accept, but talk it through', 'steady', { aff: 3, trust: 4 }], ['Say you need more time', 'cool', { trust: -1 }]],
    breakup: [['Wish them well', 'warm', { aff: 3, trust: 2 }], ['Ask for an honest reason', 'steady', { trust: 3 }], ['Let them go without a word', 'cool', { aff: -3 }]],
    betrayal: [['Hear them out', 'warm', { trust: 3, aff: 2 }], ['Set a firm boundary', 'steady', { trust: 1 }], ['Cut contact', 'cool', { aff: -6, trust: -4 }]],
  };
  const AFTER = {
    warm: { warm: ['{n} lets out a breath and smiles. something between you gets softer.', '{n} nods, relieved. it feels easier to be around each other.'], plain: ['{n} inclines their head. "Thank you." It means more than it sounds.', '{n} seems quietly relieved.'], sharp: ['{n} looks away, but the corner of their mouth moves. "ok. good."', '{n} shrugs it off, though they do not leave.'] },
    steady: { warm: ['{n} takes your answer in. it is honest, and they respect that.', '{n} nods slowly. you both leave it there for now.'], plain: ['{n} accepts your answer without comment.', '{n} nods. "Understood."'], sharp: ['{n} raises an eyebrow, then lets it go. "fair."', '{n} says nothing, but they are listening.'] },
    cool: { warm: ['{n} goes quiet. it stings, and they do not hide it.', '{n} smiles a little too fast. the air between you changes.'], plain: ['{n} nods once and says nothing more.', '{n} thanks you stiffly and leaves it at that.'], sharp: ['{n} snorts. "right." that is the end of it for today.', '{n} turns away. you will not hear about this again soon.'] },
  };
  const NOTE = { warm: 'it brought you closer', steady: 'it left things honest', cool: 'it left some distance' };

  const rngFor = (S, id, kind) => {
    const B = G.Bonds;
    const seed = ((S.clock | 0) + (U.hash ? U.hash(id + kind) : 7)) | 0;
    return B && B.rng ? B.rng(seed) : Math.random;
  };
  const pickOne = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length];
  const toneOf = (npc) => {
    let rel = null;
    try { rel = G.React.relation(G.S, npc, 'me'); } catch (e) {}
    let st = 'shy';
    try { st = G.Dialogue.styleOf(npc, rel || undefined); } catch (e) {}
    return GROUP[st] || 'warm';
  };
  const stylize = (npc, text, rnd) => { try { return G.Voice.stylize(text, npc, rnd, { short: true }) || text; } catch (e) { return text; } };
  const lineFor = (npc, kind, actor, rnd) => {
    const key = kind === 'betrayal' && actor === 'me' ? 'hurt' : kind;
    const t = pickOne(LINES[key][toneOf(npc)], rnd).replace(/\{me\}/g, first(G.S.player.name));
    return stylize(npc, t, rnd).slice(0, 220);
  };

  /* ---------- state (written only on a real event) ---------- */
  M.queue = () => (G.S && G.S.momentQ) || EMPTY;
  M.list = () => (G.S && G.S.moments) || EMPTY;
  const ensureQ = () => (G.S.momentQ = G.S.momentQ || []);
  const ensureH = () => (G.S.moments = G.S.moments || []);
  M.entry = (id) => M.queue().find((x) => x.id === id) || M.list().find((x) => x.id === id) || null;

  const recent = (npcId, kind, t) => {
    const cool = COOL[kind] != null ? COOL[kind] : 6 * 1440;
    return M.list().concat(M.queue()).some((x) => x.npc === npcId && x.kind === kind && (cool === Infinity || t - x.t < cool));
  };
  const eligible = (n) => n && !n.blocked && !n.userAlt && !n.setAside;

  // returns the queued entry, or null when it is a repeat / not allowed
  M.enqueue = function (npcId, kind, o) {
    o = o || {};
    const S = G.S;
    const n = S && S.npcs[npcId];
    if (!eligible(n) || !LINES[kind === 'betrayal' && o.actor === 'me' ? 'hurt' : kind]) return null;
    if (recent(npcId, kind, S.clock)) return null;
    const rnd = rngFor(S, npcId, kind);
    const q = ensureQ();
    const e = { id: U.uid('mo'), t: S.clock, npc: npcId, kind, line: lineFor(n, kind, o.actor, rnd) };
    if (o.actor === 'me' && kind === 'betrayal') e.actor = 'me';
    q.push(e);
    while (q.length > QMAX) q.shift();
    try { E.addNotif('rel', `A moment with ${first(n.name)} is waiting: ${TITLE[kind].toLowerCase()}`, { act: 'momentPlay', data: { id: e.id }, key: 'moment' + e.id }); } catch (er) {}
    try { G.Store.saveSoon(); } catch (er) {}
    return e;
  };

  /* ---------- hearing about changes ---------- */
  const pend = {};
  let scheduled = false;
  M.note = function (kind, npcId, info) {
    const S = G.S;
    if (!S || !npcId || npcId === 'me' || !S.npcs[npcId]) return;
    info = info || {};
    let k = null;
    let actor;
    if (kind === 'stage') {
      const fam = E.isFamily && E.isFamily(S.npcs[npcId]);
      if (!fam && CLOSE.includes(info.to) && !CLOSE.includes(info.from)) k = 'close';
      else if (COUPLE.includes(info.from) && !COUPLE.includes(info.to)) k = 'breakup';
    } else if (PRIORITY.includes(kind)) {
      k = kind;
      if (kind === 'betrayal') actor = info.ev && info.ev.a === 'me' ? 'me' : 'npc';
    }
    if (!k) return;
    const cur = pend[npcId];
    if (!cur || PRIORITY.indexOf(k) < PRIORITY.indexOf(cur.kind)) pend[npcId] = { kind: k, actor };
    if (!scheduled) {
      scheduled = true;
      Promise.resolve().then(M.flush); // after the whole tick: a betrayal that also ends a romance is ONE moment
    }
  };
  M.flush = function () {
    scheduled = false;
    const ids = Object.keys(pend);
    ids.forEach((id) => {
      const p = pend[id];
      delete pend[id];
      try { M.enqueue(id, p.kind, { actor: p.actor }); } catch (e) {}
    });
    return ids.length;
  };
  if (G.Bonds && G.Bonds.onChange) G.Bonds.onChange((kind, id, info) => M.note(kind, id, info));
  // stage changes the AI path makes (Engine.applyRel) do not go through Bonds.stamp
  if (E.applyRel) {
    const ar0 = E.applyRel;
    E.applyRel = function (n) {
      const before = n && n.status;
      const r = ar0.apply(this, arguments);
      if (n && n.status !== before) { try { M.note('stage', n.id, { from: before, to: n.status }); } catch (e) {} }
      return r;
    };
  }

  /* ---------- choosing: the bond moves a little, both of you remember ---------- */
  M.pick = function (id, i) {
    const S = G.S;
    const e = M.queue().find((x) => x.id === id);
    if (!e) return null;
    const ch = (CHOICES[e.kind] || [])[i];
    const n = S.npcs[e.npc];
    if (!ch || !n) return null;
    const tgt = E.vetRel ? E.vetRel(n, Object.assign({ imp: 5 }, ch[2])) : ch[2];
    if (tgt.aff) n.aff = clamp(n.aff + tgt.aff, -100, 100);
    if (tgt.rom && !(E.isFamily && E.isFamily(n))) n.rom = clamp(n.rom + tgt.rom, 0, 100);
    if (tgt.riv) n.riv = clamp(n.riv + tgt.riv, 0, 100);
    if (tgt.trust) n.trust = clamp(n.trust + tgt.trust, 0, 100);
    const me = first(S.player.name);
    const good = ch[1] === 'warm' ? 0.5 : ch[1] === 'steady' ? 0.2 : -0.3;
    try { G.Mem.add(n, { kind: 'event', text: `${WHAT[e.kind][0].toUpperCase() + WHAT[e.kind].slice(1)} with ${me}: ${ch[0].toLowerCase()}`.slice(0, 200), who: ['me'], imp: 7, valence: good }); } catch (er) {}
    const done = { id: e.id, t: S.clock, npc: e.npc, kind: e.kind, line: e.line, pick: i };
    if (e.actor) done.actor = e.actor;
    S.momentQ = S.momentQ.filter((x) => x.id !== id);
    const h = ensureH();
    h.push(done);
    while (h.length > HMAX) h.shift();
    try { G.Persona.nudge(n, good > 0 ? 0.08 : -0.05); } catch (er) {}
    try { G.Store.saveSoon(); } catch (er) {}
    return done;
  };

  /* ---------- the three cards ---------- */
  let cur = null; // { id, step, pick, replay }
  const afterText = (e, n, pickIdx) => {
    const ch = CHOICES[e.kind][pickIdx];
    const rnd = rngFor(G.S, e.npc, e.kind + pickIdx);
    return pickOne(AFTER[ch[1]][toneOf(n)], rnd).replace(/\{n\}/g, first(n.name));
  };
  M.cardsHtml = function () {
    const S = G.S;
    const e = cur && M.entry(cur.id);
    if (!e) return '';
    const n = S.npcs[e.npc];
    if (!n) return '';
    const dots = [0, 1, 2].map((k) => `<i style="display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 2px;background:var(--${k === cur.step ? 'accent' : 'panel2'},#888)"></i>`).join('');
    const head = `<button class="close" data-act="closeModal">✕</button><h3>${esc(TITLE[e.kind])}</h3><div class="row" style="gap:10px;align-items:center;margin:6px 0">${UI.avatar(n, 48)}<div><b>${esc(n.name)}</b><div class="muted small">${esc(cur.replay ? 'Replay' : WHAT[e.kind])}</div></div></div>`;
    let body;
    if (cur.step === 0) {
      body = `<div class="sumbox" style="font-size:1.05em;margin:10px 0">"${esc(e.line)}"</div><button class="btn primary" data-act="momentNext">Reply</button>`;
    } else if (cur.step === 1) {
      body = `<div class="muted small" style="margin:8px 0">How do you answer?</div>${CHOICES[e.kind].map((c, i) => `<button class="btn ${cur.replay && cur.pick === i ? 'primary' : ''}" style="display:block;width:100%;margin:6px 0;text-align:left" ${cur.replay ? 'disabled' : `data-act="momentPick" data-i="${i}"`}>${esc(c[0])}</button>`).join('')}${cur.replay ? '<button class="btn primary" data-act="momentNext">Next</button>' : ''}`;
    } else {
      const pk = cur.pick;
      const ch = CHOICES[e.kind][pk];
      body = `<div class="muted small">You: ${esc(ch[0])}</div><div class="sumbox" style="margin:10px 0">${esc(afterText(e, n, pk))}</div><div class="muted small">${esc(NOTE[ch[1]])}.</div><button class="btn primary" style="margin-top:8px" data-act="closeModal">Done</button>`;
    }
    return head + body + `<div style="text-align:center;margin-top:10px">${dots}</div>`;
  };
  M.play = function (id, replay) {
    if (!M.entry(id)) return false;
    const e = M.entry(id);
    cur = { id, step: 0, pick: replay && e.pick != null ? e.pick : null, replay: !!replay };
    UI.modal(M.cardsHtml());
    return true;
  };
  const rerender = () => UI.modal(M.cardsHtml());
  A.momentPlay = (d) => { if (!M.play(d.id, false)) UI.toast('That moment has passed.', 'info'); };
  A.momentReplay = (d) => { M.play(d.id, true); };
  A.momentNext = () => { if (!cur) return; cur.step = Math.min(2, cur.step + 1); rerender(); };
  A.momentPick = (d) => {
    if (!cur || cur.replay) return;
    const id = cur.id;
    const i = Number(d.i);
    const run = () => { const r = M.pick(id, i); if (r) { cur.pick = i; cur.step = 2; cur.replay = false; } return r; };
    Promise.resolve(E.guarded ? E.guarded('A moment…', run) : run()).then(() => { if (cur && cur.id === id) rerender(); });
  };

  /* ---------- the replay list under Profile (the Album builds on M.list / M.profileHtml) ---------- */
  M.profileHtml = function () {
    const S = G.S;
    const q = M.queue();
    const h = M.list();
    if (!S || (!q.length && !h.length)) return '';
    const nm = (id) => esc(first((S.npcs[id] || {}).name || 'Someone'));
    const row = (x, replay) => `<div class="row between small" style="margin:6px 0;gap:6px"><span><b>${nm(x.npc)}</b> · ${esc(TITLE[x.kind] || x.kind)}<div class="muted">${esc(U.ago(S.clock, x.t))}</div></span><button class="btn sm ${replay ? '' : 'primary'}" data-act="${replay ? 'momentReplay' : 'momentPlay'}" data-id="${x.id}">${replay ? 'Replay' : 'Play'}</button></div>`;
    return `<div class="card momentscard"><h4 class="sect" style="margin-top:0">Moments</h4>${q.map((x) => row(x, false)).join('')}${h.slice(-12).reverse().map((x) => row(x, true)).join('')}</div>`;
  };
  if (G.Pages && G.Pages.me) {
    const me0 = G.Pages.me;
    G.Pages.me = function () {
      const out = me0.apply(this, arguments);
      let extra = '';
      try { extra = M.profileHtml(); } catch (e) {}
      return out + extra;
    };
  }
})(window.G);
