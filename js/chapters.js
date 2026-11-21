/* Clout — Chapters and Album.
   Each game WEEK writes one short chapter of your story: a title, up to 4 beats and who changed. Free and offline (no AI call): the beats
   are picked from the non-meta chronicle, played moments, outings that happened, town arcs (their chronicle lines) and reputation shifts,
   ranked by Mind.salience plus how much they involve you. Titles are short rule-based lines.
   The ALBUM keeps ids only (moments and outings) so the keepsakes stay one tap away, and the TITLES you earn (plain-text names, a small perk).
   Perks are only a bonus lookup, Chapters.perk('makeup') -> a multiplier (1 when not earned), that other modules may read.
   State is written only on the first real event: S.chapters (<= 12) and S.album (<= 40 ids). Titles are stored in the existing S.ach. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const A = UI.acts;
  const { esc } = U;
  const C = (G.Chapters = {});
  const EMPTY = Object.freeze([]);
  const WEEK = 7 * 1440;
  const CMAX = 12;
  const AMAX = 40;
  const BEATS = 4;
  const first = (s) => String(s || '').split(' ')[0];
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const label = (s) => String(s || '').replace(/_/g, ' ');

  C.WEEK = WEEK;
  C.list = () => (G.S && G.S.chapters) || EMPTY;
  C.album = () => (G.S && G.S.album) || EMPTY;
  const ensureC = () => (G.S.chapters = G.S.chapters || []);
  const ensureA = () => (G.S.album = G.S.album || []);
  const save = () => { try { G.Store.saveSoon(); } catch (e) {} };

  /* ---------- titles: plain names, a small perk. Registered into E.ACH so the existing unlock path (and S.ach) carries them. ---------- */
  const moments = () => (G.Moments && G.Moments.list ? G.Moments.list() : EMPTY);
  const played = (kind) => moments().some((m) => m.kind === kind);
  const outings = () => (G.Plans && G.Plans.list ? G.Plans.list().filter((p) => p.status === 'done') : EMPTY);
  const TITLES = [
    { id: 't_peacemaker', name: 'Peacemaker', desc: 'Make up after a falling out', perk: 'makeup', mult: 1.25, perkText: 'Makeups come about a quarter sooner.', test: () => played('makeup') },
    { id: 't_regular', name: 'Regular', desc: 'Go out with your people three times', perk: 'outing', mult: 1.2, perkText: 'Friends propose outings a little more often.', test: () => outings().length >= 3 },
    { id: 't_openheart', name: 'Open Heart', desc: 'Hear someone out when they confess', perk: 'open', mult: 1.15, perkText: 'People open up to you a little sooner.', test: () => played('confession') },
    { id: 't_keeper', name: 'Keeper of Friends', desc: 'Grow close to a friend', perk: 'trust', mult: 1.1, perkText: 'Trust builds a little faster.', test: () => played('close') },
    { id: 't_steady', name: 'Steady Hand', desc: 'Keep every standing at 60 or above', perk: 'repfade', mult: 1.2, perkText: 'Bad press fades a little faster.', test: () => { const R = G.Rep && G.Rep.state ? G.Rep.state() : null; return !!R && ['fans', 'friends', 'press', 'town'].every((k) => typeof R[k] === 'number' && R[k] >= 60); } },
  ];
  C.TITLES = TITLES;
  if (E && E.ACH && !E.ACH.some((a) => a.id === TITLES[0].id)) {
    TITLES.forEach((t) => E.ACH.push({ id: t.id, icon: '', name: t.name, desc: t.desc + '. ' + t.perkText, test: t.test, title: true, perkText: t.perkText }));
  }
  C.earned = () => TITLES.filter((t) => G.S && G.S.ach && G.S.ach[t.id] != null);
  C.has = (id) => !!(G.S && G.S.ach && G.S.ach[id] != null);
  // a bonus others may read: the product of the perks you earned for this key (1 when none)
  C.perk = (key) => C.earned().reduce((m, t) => (t.perk === key ? m * t.mult : m), 1);

  // plain-text unlock line (E.checkAch calls this; no trophy emoji, no loud toast). Returns true when it handled the announcement.
  C.announce = function (a) {
    try {
      const msg = a.title ? `New title: ${a.name}. ${a.perkText}` : `Achievement: ${a.name}`;
      UI.toast(msg, 'good');
      E.addNotif('level', a.title ? `New title: ${a.name}. ${a.perkText}` : `Achievement unlocked: ${a.name}`, a.title ? { act: 'nav', data: { page: 'me' } } : undefined);
      return true;
    } catch (e) { return false; }
  };
  C.checkTitles = function () {
    const S = G.S;
    if (!S || !S.ach) return 0;
    let n = 0;
    TITLES.forEach((t) => {
      if (S.ach[t.id] != null) return;
      let ok = false;
      try { ok = t.test(); } catch (e) {}
      if (!ok) return;
      S.ach[t.id] = S.clock;
      n++;
      const a = E.ACH.find((x) => x.id === t.id);
      C.announce(a || { id: t.id, name: t.name, title: true, perkText: t.perkText });
    });
    if (n) save();
    return n;
  };

  /* ---------- the album: ids only ---------- */
  C.keep = function (id) {
    if (!id || !G.S) return false;
    const al = C.album();
    if (al.includes(id)) return false;
    const l = ensureA();
    l.push(id);
    while (l.length > AMAX) l.shift();
    return true;
  };
  C.sync = function () {
    let n = 0;
    moments().forEach((m) => { if (m && m.id && C.keep(m.id)) n++; });
    if (G.Plans && G.Plans.list) G.Plans.list().forEach((p) => { if (p.status === 'done' && C.keep(p.id)) n++; });
    if (n) save();
    return n;
  };

  /* ---------- picking the beats ---------- */
  const SENT = {
    close: (n) => `${n} became one of your closest friends.`,
    confession: (n) => `${n} told you how they feel.`,
    makeup: (n) => `You and ${n} made up.`,
    breakup: (n) => `Things ended between you and ${n}.`,
    betrayal: (n) => `Trust broke between you and ${n}.`,
  };
  const REP_OF = { fans: 'your fans', friends: 'your friends', press: 'the press', town: 'the town' };
  const involvement = (S, ids, text) => {
    let v = 0;
    if (ids.includes('me')) v += 3;
    const pn = first(S.player && S.player.name);
    if (/\byou(r|rs)?\b/i.test(text) || (pn.length > 2 && text.toLowerCase().includes(pn.toLowerCase()))) v += 2;
    ids.forEach((id) => { const n = S.npcs[id]; if (n) v += Math.max(0, Math.min(2, (n.aff || 0) / 40)); });
    return v;
  };
  const isMeta = (c) => !!c && ((G.Channels && G.Channels.isMeta && G.Channels.isMeta(c)) || c.meta === true || c.kind === 'meta' || (G.Recap && G.Recap.isMeta && G.Recap.isMeta(c.text)));
  const nameList = (S, ids) => {
    const l = ids.filter((x) => x !== 'me').map((x) => first((S.npcs[x] || {}).name)).filter(Boolean);
    return l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0] || '';
  };

  C.candidates = function (S, wk) {
    const t0 = wk * WEEK;
    const t1 = t0 + WEEK;
    const sal = (t, k) => (G.Mind && G.Mind.salience ? G.Mind.salience(t, k) : 3);
    const inWin = (t) => typeof t === 'number' && t >= t0 && t < t1;
    const out = [];
    (S.chronicle || []).forEach((c) => {
      if (!c || !inWin(c.t) || isMeta(c)) return;
      const text = String(c.text || '').trim();
      if (!text) return;
      let ids = [];
      try { ids = G.Channels && G.Channels.mentionIds ? G.Channels.mentionIds(text).filter((id) => S.npcs[id]).slice(0, 2) : []; } catch (e) {}
      const town = /^Around town/i.test(text);
      const me = involvement(S, ids.concat(/\byou(r|rs)?\b/i.test(text) ? ['me'] : []), text);
      const ref = ids[0];
      out.push({ k: town ? 'town' : 'event', t: c.t, text: clip(text, 110), ids, score: sal(text, 'chron') + me + (town ? 1 : 0), a: ref ? (me >= 3 ? 'openChat' : 'profile') : '', d: ref || '' });
    });
    moments().forEach((m) => {
      if (!m || !inWin(m.t) || !S.npcs[m.npc] || !SENT[m.kind]) return;
      out.push({ k: 'moment', t: m.t, text: SENT[m.kind](first(S.npcs[m.npc].name)), ids: [m.npc], score: 9 + (m.pick === 0 ? 0.3 : 0), a: 'momentReplay', d: m.id });
    });
    (G.Plans && G.Plans.list ? G.Plans.list() : EMPTY).forEach((p) => {
      if (!p.out || !inWin(p.out.t)) return;
      const who = nameList(S, p.who);
      if (p.status === 'done') out.push({ k: 'outing', t: p.out.t, text: clip(`You went out to ${p.place}${who ? ' with ' + who : ''}.`, 110), ids: p.who.filter((x) => S.npcs[x]).slice(0, 2), score: 7.5, a: 'planOpen', d: p.id });
      else if (p.status === 'missed') out.push({ k: 'outing', t: p.out.t, text: clip(`You missed the night at ${p.place}.`, 110), ids: p.host && S.npcs[p.host] ? [p.host] : [], score: 5.5, a: 'planOpen', d: p.id });
    });
    const net = {};
    (S.repLog || []).forEach((r) => {
      if (!r || !inWin(r.t)) return;
      Object.keys(r.d || {}).forEach((k) => { if (REP_OF[k]) net[k] = (net[k] || 0) + r.d[k]; });
    });
    const rk = Object.keys(net).sort((a, b) => Math.abs(net[b]) - Math.abs(net[a]) || (a < b ? -1 : 1))[0];
    if (rk && Math.abs(net[rk]) >= 3) out.push({ k: 'rep', t: t0 + WEEK - 1, text: `Your standing with ${REP_OF[rk]} ${net[rk] > 0 ? 'rose' : 'slipped'} this week.`, ids: [], score: 6 + Math.min(3, Math.abs(net[rk]) / 4), a: '', d: '' });
    return out;
  };
  C.pick = function (S, cands) {
    const sorted = cands.slice().sort((a, b) => b.score - a.score || b.t - a.t || (a.text < b.text ? -1 : 1));
    const out = [];
    const seen = new Set();
    const kinds = {};
    const people = {};
    for (const c of sorted) {
      if (seen.has(c.text) || (kinds[c.k] || 0) >= 2) continue;
      if (c.ids[0] && (people[c.ids[0]] || 0) >= 2) continue;
      seen.add(c.text);
      kinds[c.k] = (kinds[c.k] || 0) + 1;
      if (c.ids[0]) people[c.ids[0]] = (people[c.ids[0]] || 0) + 1;
      out.push(c);
      if (out.length >= BEATS) break;
    }
    return out.sort((a, b) => a.t - b.t);
  };

  /* ---------- the title: short, rule-based ---------- */
  C.titleFor = function (S, beats, wk) {
    const top = beats.slice().sort((a, b) => b.score - a.score)[0];
    const n = top && top.ids[0] && S.npcs[top.ids[0]] ? first(S.npcs[top.ids[0]].name) : '';
    const h = ((wk * 2654435761) >>> 0) % 3;
    const pickT = (l) => l[h % l.length];
    if (!top) return 'A Quiet Week';
    if (top.k === 'moment') {
      const m = moments().find((x) => x.id === top.d);
      const T = { close: n ? `Closer to ${n}` : 'A Closer Friend', confession: n ? `${n} Speaks Up` : 'A Confession', makeup: n ? `Making Up with ${n}` : 'Making Up', breakup: 'The End of Something', betrayal: 'Broken Trust' };
      return T[(m && m.kind) || 'close'] || 'A Turning Point';
    }
    if (top.k === 'outing') return /missed/.test(top.text) ? 'The Empty Seat' : pickT(['A Night Out', 'Out With Friends', 'The Whole Crew']);
    if (top.k === 'town') return pickT(['Around Town', 'The Town Talks', 'Town News']);
    if (top.k === 'rep') return /rose/.test(top.text) ? 'Rising Standing' : 'A Rougher Week';
    return n ? pickT([`A Week with ${n}`, `${n} in Focus`, `Around ${n}`]) : pickT(['What Happened', 'A Busy Week', 'Small Turns']);
  };

  /* ---------- who changed: compared with the snapshot kept in the previous chapter ---------- */
  const snapNow = (S) => {
    const o = {};
    Object.values(S.npcs).filter((n) => n && !n.blocked && !n.userAlt && !n.setAside).sort((a, b) => Math.abs(b.aff || 0) - Math.abs(a.aff || 0) || (a.id < b.id ? -1 : 1)).slice(0, 8).forEach((n) => { o[n.id] = [Math.round(n.aff || 0), String(n.status || '').slice(0, 20)]; });
    return o;
  };
  C.changed = function (S, prev, now, beatIds) {
    const out = [];
    Object.keys(now).forEach((id) => {
      const b = now[id];
      const a = prev && prev[id];
      if (!a || !S.npcs[id]) return;
      const da = b[0] - a[0];
      const st = a[1] !== b[1] && b[1];
      if (!st && Math.abs(da) < 6) return;
      out.push({ id, da, st: st || '', s: (st ? 100 : 0) + Math.abs(da) + (beatIds.includes(id) ? 3 : 0) });
    });
    return out.sort((x, y) => y.s - x.s || (x.id < y.id ? -1 : 1)).slice(0, 3).map((x) => ({ id: x.id, da: x.da, st: x.st }));
  };

  /* ---------- writing a chapter ---------- */
  C.write = function (wk) {
    const S = G.S;
    if (!S) return null;
    const have = C.list();
    if (have.some((c) => c.wk === wk)) return null;
    const beats = C.pick(S, C.candidates(S, wk));
    if (beats.length < 2) return null; // a quiet week is no chapter
    const prev = have.length ? have[have.length - 1].snap : null;
    const now = snapNow(S);
    const ch = {
      id: U.uid('ch'), wk, t: S.clock,
      title: C.titleFor(S, beats, wk),
      beats: beats.map((b) => ({ k: b.k, t: b.t, text: b.text, ids: b.ids.slice(0, 2), a: b.a, d: b.d })),
      who: C.changed(S, prev, now, beats.reduce((l, b) => l.concat(b.ids), [])),
      snap: now,
    };
    const l = ensureC();
    l.push(ch);
    while (l.length > CMAX) l.shift();
    save();
    return ch;
  };

  // runs about once per game hour: catches up on finished weeks (at most the last two), keeps the album and titles in step
  let seenS = null;
  let seenWk = -1;
  C.tick = function () {
    const S = G.S;
    if (!S || !S.player) return;
    if (seenS !== S) { seenS = S; seenWk = -1; }
    try { C.sync(); } catch (e) {}
    try { C.checkTitles(); } catch (e) {}
    const done = Math.floor(S.clock / WEEK) - 1; // the latest finished week
    if (done < 0 || done <= seenWk) return;
    const l = C.list();
    const lastWk = l.length ? l[l.length - 1].wk : -1;
    for (let wk = Math.max(lastWk + 1, seenWk + 1, done - 1); wk <= done; wk++) {
      try { C.write(wk); } catch (e) {}
    }
    seenWk = done;
    try { C.checkTitles(); } catch (e) {}
  };
  let lastHour = -1;
  if (E && E.tick) {
    const tick0 = E.tick;
    E.tick = function () {
      const r = tick0.apply(this, arguments);
      try {
        if (G.S) {
          const hr = Math.floor(G.S.clock / 60);
          if (hr !== lastHour) { lastHour = hr; C.tick(); }
        }
      } catch (e) {}
      return r;
    };
  }

  /* ---------- the screens ---------- */
  const weekName = (c) => `Week ${c.wk + 1}`;
  C.beatRow = function (c, i) {
    const S = G.S;
    const b = c.beats[i];
    const n = b.ids && S.npcs[b.ids[0]];
    const tap = b.a ? ` data-act="chapterBeat" data-c="${esc(c.id)}" data-i="${i}" style="cursor:pointer;gap:8px;align-items:center;margin:6px 0"` : ' style="gap:8px;align-items:center;margin:6px 0"';
    return `<div class="row chapbeat"${tap}>${n && UI.avatar ? UI.avatar(n, 28) : '<span style="display:inline-block;width:28px"></span>'}<div class="grow small">${esc(b.text)}</div></div>`;
  };
  C.changedHtml = function (c) {
    const S = G.S;
    const l = (c.who || []).filter((w) => S.npcs[w.id]).map((w) => {
      const nm = first(S.npcs[w.id].name);
      return `<span class="chip ${w.st ? '' : w.da > 0 ? 'green' : 'gray'}">${esc(nm)}: ${esc(w.st ? 'now ' + label(w.st) : w.da > 0 ? 'closer' : 'cooler')}</span>`;
    });
    return l.length ? `<div class="row wrap" style="gap:6px;margin-top:6px">${l.join(' ')}</div>` : '';
  };
  C.readerHtml = function () {
    const S = G.S;
    const l = C.list().slice().reverse();
    const body = l.length
      ? l.map((c) => `<div class="sumbox" style="margin:10px 0"><div class="row between" style="align-items:baseline"><b>${esc(c.title)}</b><span class="muted small">${esc(weekName(c))} · ${esc(U.ago(S.clock, c.t))}</span></div>${c.beats.map((b, i) => C.beatRow(c, i)).join('')}${C.changedHtml(c)}</div>`).join('')
      : '<div class="muted small" style="margin:10px 0">Nothing written yet. A chapter appears at the end of each week that had something in it.</div>';
    return `<button class="close" data-act="closeModal">✕</button><h3>Story so far</h3>${body}`;
  };
  C.albumHtml = function () {
    const S = G.S;
    const al = C.album();
    const titles = C.earned();
    const plans = al.map((id) => (G.Plans && G.Plans.get ? G.Plans.get(id) : null)).filter((p) => p && p.status === 'done').reverse();
    const hasMoment = al.some((id) => moments().some((m) => m.id === id));
    let h = `<button class="close" data-act="closeModal">✕</button><h3>Album</h3>`;
    h += `<h4 class="sect" style="margin-top:6px">Titles</h4>`;
    h += titles.length ? titles.map((t) => `<div class="sumbox small"><b>${esc(t.name)}</b><div>${esc(t.perkText)}</div></div>`).join('') : '<div class="muted small">No titles yet. They come from things you do with your people.</div>';
    h += `<h4 class="sect">Outings</h4>`;
    h += plans.length ? plans.map((p) => `<div class="row between small" style="margin:6px 0;gap:6px"><span><b>${esc(G.Plans.when(p.at))}</b>, ${esc(p.place)}<div class="muted">${esc(nameList(S, p.who))}</div></span><button class="btn sm" data-act="planOpen" data-id="${esc(p.id)}">Open</button></div>`).join('') : '<div class="muted small">No outings kept yet.</div>';
    if (hasMoment && G.Moments && G.Moments.profileHtml) { try { h += `<h4 class="sect">Milestones</h4>` + G.Moments.profileHtml(); } catch (e) {} }
    return h;
  };
  // a small card under Profile; it exists only once there is something to show
  C.cardHtml = function () {
    const S = G.S;
    const nc = C.list().length;
    const na = C.album().length;
    const nt = C.earned().length;
    if (!S || (!nc && !na && !nt)) return '';
    const last = C.list()[nc - 1];
    return `<div class="card albumcard"><h4 class="sect" style="margin-top:0">Story and Album</h4>${last ? `<div class="small" style="margin:4px 0"><b>${esc(last.title)}</b> <span class="muted">${esc(weekName(last))}</span></div>` : ''}<div class="row wrap" style="gap:8px;margin-top:6px"><button class="btn sm primary" data-act="chaptersOpen">Story so far${nc ? ' (' + nc + ')' : ''}</button><button class="btn sm" data-act="albumOpen">Album${nt ? ' · ' + nt + (nt === 1 ? ' title' : ' titles') : ''}</button></div></div>`;
  };
  A.chaptersOpen = () => { UI.modal(C.readerHtml()); };
  A.albumOpen = () => { UI.modal(C.albumHtml()); };
  A.chapterBeat = (d) => {
    const c = C.list().find((x) => x.id === d.c);
    const b = c && c.beats[Number(d.i)];
    if (!b || !b.a) return;
    const S = G.S;
    UI.closeModal();
    if (b.a === 'momentReplay') { if (G.Moments && G.Moments.entry(b.d)) A.momentReplay({ id: b.d }); else UI.toast('That moment has passed.', 'info'); }
    else if (b.a === 'planOpen') A.planOpen({ id: b.d });
    else if (S.npcs[b.d] && A[b.a]) A[b.a]({ id: b.d });
  };
  if (G.Pages && G.Pages.me) {
    const me0 = G.Pages.me;
    G.Pages.me = function () {
      const out = me0.apply(this, arguments);
      let extra = '';
      try { extra = C.cardHtml(); } catch (e) {}
      return out + extra;
    };
  }
})(window.G);
