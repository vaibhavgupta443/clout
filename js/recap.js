/* Clout — "Previously on": after you were away 30+ minutes, the Alerts recap names up to four things that happened,
   each a person plus a sentence ("Mia and Kai fell out"), tap-through to their chat or profile.
   Free and offline: it wraps World.catchUp, records the world events that happened while the clock ran, and ranks them by
   Mind.salience plus how much they involve you. Housekeeping lines (goals, moods, storyline logs) never appear.
   It extends S.recap (which World.catchUp already writes) with beats: [{ k, ids, text, act }], at most 4. No new state key. */
(function (G) {
  'use strict';
  const U = G.U;
  const esc = U.esc;
  const Recap = (G.Recap = { MAX: 4 });
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (n) => String((n && n.name) || '').split(' ')[0];
  const META = /followed through on a plan|made a move in|\bwants? to\b|\bgoal\b|\bmood\b|reflect|simulat|storyline|chronicle|catch.?up|\btick\b|director|\bAI\b|prompt|memory|memories/i;

  let cap = null; // world events seen while a catch-up runs (module memory only, never saved)

  Recap.isMeta = (text) => META.test(String(text || ''));

  const involvement = (S, ids, text) => {
    let v = 0;
    if (ids.includes('me')) v += 4;
    const pname = String((S.player && S.player.name) || '').split(' ')[0];
    if (/\byou(r|rs)?\b/i.test(text) || (pname.length > 2 && new RegExp('\\b' + pname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text))) v += 3;
    ids.forEach((id) => {
      const n = S.npcs[id];
      if (n) v += Math.max(0, Math.min(2, (n.aff || 0) / 40));
    });
    return v;
  };

  Recap.build = function (S, events, dms) {
    const M = G.Mind;
    const sal = (t, k) => (M && M.salience ? M.salience(t, k) : 3);
    const cands = [];
    (events || []).forEach((e) => {
      const ids = (e.ids || []).filter((id) => id === 'me' || S.npcs[id]);
      const npcIds = ids.filter((id) => id !== 'me');
      const text = String(e.text || '').trim();
      if (!npcIds.length || !text || Recap.isMeta(text)) return;
      const me = ids.includes('me');
      cands.push({ k: 'event', ids: npcIds.slice(0, 3), text: clip(text, 100), score: sal(text, e.kind) + involvement(S, ids, text), act: { a: me ? 'openChat' : 'profile', id: npcIds[0] } });
    });
    (dms || []).forEach((d) => {
      const n = S.npcs[d.id];
      if (!n || !d.text || Recap.isMeta(d.text)) return;
      const line = `${first(n)} messaged you: “${clip(d.text, 70)}”`;
      cands.push({ k: 'dm', ids: [d.id], text: line, score: sal(d.text, 'dm') + 4 + involvement(S, [d.id], d.text) * 0.5, act: { a: 'openChat', id: d.id } });
    });
    cands.sort((a, b) => b.score - a.score);
    const out = [];
    const seen = new Set();
    const perPerson = {};
    for (const c of cands) {
      if (seen.has(c.text) || (perPerson[c.ids[0]] || 0) >= 1) continue;
      seen.add(c.text);
      perPerson[c.ids[0]] = (perPerson[c.ids[0]] || 0) + 1;
      out.push({ k: c.k, ids: c.ids, text: c.text, act: c.act });
      if (out.length >= Recap.MAX) break;
    }
    return out;
  };

  const unreadSet = (S) => {
    const set = new Set();
    Object.keys(S.dms || {}).forEach((id) => (S.dms[id] || []).forEach((m) => { if (m.from !== 'me' && !m.read) set.add(m); }));
    return set;
  };

  // wrap World.catchUp (it returns null when you were away under 30 minutes: then there is nothing to add)
  const W = G.World;
  if (W && W.catchUp && !W.catchUp.__recap) {
    const catch0 = W.catchUp;
    const ev0 = W.event;
    W.event = function (kind, ids) {
      if (cap) { try { cap.push({ kind, ids: (ids || []).slice(), text: arguments[2] }); } catch (e) {} }
      return ev0.apply(this, arguments);
    };
    W.catchUp = function () {
      const S = G.S;
      const prev = cap;
      cap = [];
      const unread0 = S ? unreadSet(S) : new Set();
      let r = null;
      try { r = catch0.apply(this, arguments); } finally { var events = cap; cap = prev; }
      if (r && S) {
        try {
          const dms = [];
          Object.keys(S.dms || {}).forEach((id) => {
            const fresh = (S.dms[id] || []).filter((m) => m.from !== 'me' && !m.read && !unread0.has(m));
            if (fresh.length) dms.push({ id, text: fresh[fresh.length - 1].text });
          });
          r.beats = Recap.build(S, events, dms).slice(0, Recap.MAX);
        } catch (e) { r.beats = []; }
      }
      return r;
    };
    W.catchUp.__recap = true;
  }

  // the card body inside the existing recap card (Alerts)
  Recap.html = function (rc) {
    const S = G.S;
    const beats = rc && Array.isArray(rc.beats) ? rc.beats.slice(0, Recap.MAX) : [];
    if (!S || !beats.length) return '';
    return `<div class="recapbeats"><div class="small muted">Previously</div>${beats.map((b) => {
      const n = b.ids && S.npcs[b.ids[0]];
      if (!n) return '';
      const act = b.act && b.act.a === 'openChat' ? 'openChat' : 'profile';
      return `<div class="row recapbeat" data-act="${act}" data-id="${esc(n.id)}" style="cursor:pointer;gap:8px;align-items:center;margin:6px 0">${G.UI.avatar ? G.UI.avatar(n, 28) : ''}<div class="grow small">${esc(b.text)}</div></div>`;
    }).join('')}</div>`;
  };
})(window.G);
