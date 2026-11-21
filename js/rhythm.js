/* Clout — morning and evening beats. Each game morning ONE small choice from what a real person in your circle wants today
   ("Kai wants to outdo Mia today": back him / stay out of it); each evening one line wrapping up the day with a mood read.
   A choice nudges that person's bond a little (through E.vetRel clamps) and writes a memory. It never posts anything.
   An unanswered beat expires quietly the next day. Free and offline. Shown on Alerts (P.hub), no new button.
   State: S.rhythm = { d, beat: { id, npc, text, opts[2-3] }, log[<=14] } — created only by the first real write (reads use EMPTY). */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const esc = U.esc;
  const Rhythm = (G.Rhythm = { LOG: 14, MORNING: [7, 15], EVENING: 19 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const first = (n) => String((n && n.name) || '').split(' ')[0];
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const EMPTY = Object.freeze({ d: 0, log: Object.freeze([]) });
  Rhythm.state = () => (G.S && G.S.rhythm) || EMPTY; // reading never creates the key
  Rhythm.ensure = () => (G.S.rhythm = G.S.rhythm || { d: 0, log: [] });
  const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;

  // the two or three things you can do about it, by what the person wants. n = [aff, trust] nudges (small on purpose)
  const optsFor = (n, goal) => {
    const f = first(n);
    const k = goal.kind;
    if (k === 'player') {
      return [
        { t: `Make time for ${f}`, aff: 4, trust: 3, say: `${G.S.player.name} made time for me today`, v: 0.5 },
        { t: 'Not today', aff: -1, trust: -1, say: `${G.S.player.name} had no time for me today`, v: -0.2 },
      ];
    }
    if (k === 'npc') {
      return [
        { t: `Back ${f}`, aff: 3, trust: 2, say: `${G.S.player.name} had my back today`, v: 0.4 },
        { t: 'Stay out of it', aff: 0, trust: 0, say: `${G.S.player.name} stayed out of it`, v: 0 },
      ];
    }
    if (k === 'plot') {
      return [
        { t: `Ask ${f} how it's going`, aff: 3, trust: 2, say: `${G.S.player.name} asked how it was going`, v: 0.4 },
        { t: 'Let it play out', aff: 0, trust: 0, say: `${G.S.player.name} let it play out`, v: 0 },
      ];
    }
    return [
      { t: `Text ${f} good luck`, aff: 3, trust: 2, say: `${G.S.player.name} wished me luck today`, v: 0.5 },
      { t: 'Ignore it', aff: -1, trust: 0, say: `${G.S.player.name} did not notice my day`, v: -0.1 },
    ];
  };
  const lineFor = (n, goal) => {
    const f = first(n);
    const g = String(goal.text || '').replace(/\s+/g, ' ');
    if (goal.kind === 'player') return `${f} wants to ${g.replace(new RegExp('\\s*' + (G.S.player.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), ' you').trim()} today.`;
    return `${f} wants to ${g} today.`;
  };

  // who has something on their mind today (main cast only, a real goal, not the same person as yesterday)
  Rhythm.pick = function (S, day) {
    const last = (Rhythm.state().log || []).filter((x) => x.k === 'beat' || x.k === 'skip').slice(-1)[0];
    const pool = Object.values(S.npcs || {})
      .filter((n) => n && !n.userAlt && !n.blocked && n.goal && n.goal.text && n.goal.t != null && day - n.goal.t <= 1 && (!last || last.npc !== n.id || day - last.d > 3))
      .sort((a, b) => (b.touched || 0) - (a.touched || 0) || (a.id < b.id ? -1 : 1))
      .slice(0, 6);
    if (!pool.length) return null;
    return pool[(day + hash(S.player.name || '')) % Math.min(3, pool.length)];
  };

  const push = (st, e) => { st.log.push(e); while (st.log.length > Rhythm.LOG) st.log.shift(); };

  // the evening line: what happened around you today, and the mood of the people around you
  const POS = /happy|excit|joy|glad|warm|content|calm|cheer|proud|love|hope|playful|flirt|relax|good/i;
  const NEG = /sad|angry|upset|anxi|annoy|jealous|hurt|tense|stress|lonely|bitter|mad|worr|frustr|bad|tired/i;
  Rhythm.wrap = function (S, day) {
    const events = (S.chronicle || []).filter((c) => c && c.t >= (day - 1) * 1440).length;
    let pos = 0, neg = 0;
    Object.values(S.npcs).forEach((n) => {
      if (!n || n.userAlt || n.blocked || !n.mood) return;
      if (NEG.test(n.mood)) neg++; else if (POS.test(n.mood)) pos++;
    });
    const tone = pos > neg + 1 ? 'warm' : neg > pos + 1 ? 'tense' : 'steady';
    const busy = events >= 6 ? 'A lot happened' : events >= 2 ? 'A few things happened' : 'A quiet day';
    const mine = (Rhythm.state().log || []).filter((x) => x.k === 'beat' && x.d === day).slice(-1)[0];
    return `${busy} around you today${mine ? ', and ' + mine.did : ''}. The mood in town feels ${tone}.`;
  };

  let scanned = -1; // memory only: look for a beat at most once per game hour
  Rhythm.step = function () {
    const S = G.S;
    if (!S || !S.player || !S.npcs) return;
    const day = U.dayOf(S.clock);
    const hour = hourOf(S.clock);
    const st = Rhythm.state();
    if (st.beat && st.beat.d < day) { // unanswered: it quietly goes away
      const w = Rhythm.ensure();
      push(w, { k: 'skip', d: w.beat.d, npc: w.beat.npc });
      delete w.beat;
    }
    if (hour >= Rhythm.MORNING[0] && hour < Rhythm.MORNING[1] && st.d !== day && !st.beat) {
      const key = day * 24 + Math.floor(hour);
      if (scanned === key) return;
      scanned = key;
      const n = Rhythm.pick(S, day);
      if (n) {
        const w = Rhythm.ensure();
        w.d = day;
        w.beat = { id: 'rh' + day, d: day, npc: n.id, text: lineFor(n, n.goal), opts: optsFor(n, n.goal).slice(0, 3).map((o) => ({ t: o.t, aff: o.aff, trust: o.trust, say: o.say, v: o.v })) };
      }
    }
    if (hour >= Rhythm.EVENING && !(st.log || []).some((x) => x.k === 'wrap' && x.d === day) && (st.d === day || (S.chronicle || []).some((c) => c && c.t >= (day - 1) * 1440))) {
      push(Rhythm.ensure(), { k: 'wrap', d: day, text: Rhythm.wrap(S, day) });
    }
  };

  // the owner answers: a small nudge to the bond, a memory for them, nothing is posted
  Rhythm.choose = function (i) {
    const S = G.S;
    const st = Rhythm.state();
    const b = st.beat;
    const o = b && b.opts && b.opts[+i];
    if (!o) return null;
    const n = S.npcs[b.npc];
    const w = Rhythm.ensure();
    if (n) {
      const before = n.aff;
      E.applyRel(n, E.vetRel(n, { aff: o.aff, trust: o.trust, imp: 2 }));
      if (G.Mem) { try { G.Mem.add(n, { kind: 'event', text: o.say, who: ['me'], valence: o.v, imp: 3 }); } catch (e) {} }
      n.touched = S.clock;
      push(w, { k: 'beat', d: b.d, npc: b.npc, pick: o.t, did: /^(Not today|Stay out of it|Let it play out|Ignore it)/.test(o.t) ? 'you let it pass' : o.t.charAt(0).toLowerCase() + o.t.slice(1), aff: n.aff - before });
    }
    delete w.beat;
    return { npc: n, opt: o };
  };

  // the card on Alerts (nothing at all when there is nothing to show)
  Rhythm.card = function () {
    const S = G.S;
    if (!S) return '';
    const st = Rhythm.state();
    const day = U.dayOf(S.clock);
    let out = '';
    const b = st.beat;
    const n = b && S.npcs[b.npc];
    if (b && n && b.d === day) {
      out += `<div class="card rhythm"><div class="small muted">This morning</div><div class="row" style="gap:10px;align-items:center;margin:6px 0">${UI.avatar ? UI.avatar(n, 36) : ''}<div class="grow"><b>${esc(b.text)}</b></div></div><div class="row" style="gap:8px;flex-wrap:wrap">${b.opts.map((o, i) => `<button class="btn sm ${i === 0 ? 'primary' : 'ghost'}" data-act="rhythmPick" data-i="${i}">${esc(o.t)}</button>`).join('')}</div></div>`;
    }
    const wr = (st.log || []).filter((x) => x.k === 'wrap' && x.d === day).slice(-1)[0];
    if (wr) out += `<div class="card rhythm"><div class="small muted">Tonight</div><div class="small">${esc(wr.text)}</div></div>`;
    return out;
  };

  A.rhythmPick = async (d) => {
    try {
      let res;
      await E.guarded('Answering…', async () => { res = Rhythm.choose(d.i); return !!res; }, () => A.rhythmPick(d));
      if (res && res.npc) UI.toast(`Noted. ${first(res.npc)} will remember.`, 'good');
      G.Store.saveSoon();
      UI.render();
    } catch (e) {}
  };

  { const tick0 = E.tick; E.tick = function () { const r = tick0.apply(this, arguments); try { Rhythm.step(); } catch (e) {} return r; }; }
})(window.G);
