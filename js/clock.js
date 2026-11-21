/* Clout — the clock: time you can SEE, time that waits for you, and appointments.
   - A clock in the top bar (tap it for time controls).
   - "Wait for my reply": while someone is waiting for your answer (an unread message from the last few game hours) the world's clock stands still,
     so "meet me at 3" never turns into three days. Press ▶ in the clock window to let time go on anyway.
   - Appointments: when someone writes a time ("at 3", "tomorrow at 7pm", "in 2 hours") the game remembers it, reminds you 30 minutes before, and the
     clock STOPS at that moment; you go, skip or snooze. Nothing skips past it, not even a time-skip or coming back to the app.
   - Close friends: a post or story can be for your close friends only (green); only they react to it. Same for theirs. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const W = G.World;
  const A = UI.acts;
  const { esc } = U;
  const Clock = (G.Clock = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

  Clock.hhmm = (clock) => {
    const m = ((Math.round(clock) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const rel = (min) => { const a = Math.abs(Math.round(min)); const t = a < 90 ? a + ' min' : a < 2880 ? Math.round(a / 60) + ' h' : Math.round(a / 1440) + ' days'; return min >= 0 ? 'in ' + t : t + ' ago'; };

  /* ---------- reading a time out of a message ---------- */
  const CTX = /\b(meet|see you|come (?:over|by|to)|pick (?:you )?up|dinner|lunch|brunch|breakfast|coffee|drinks?|call|party|hang(?:ing)? out|catch up|date|movie|walk|swing by|stop by|get together|tonight|tomorrow|today|later|this (?:morning|afternoon|evening)|at the)\b/i;
  // returns the game minute it means, or null. "now" is when the message was written.
  Clock.parseWhen = function (text, now) {
    const t = String(text || '').toLowerCase();
    if (!CTX.test(t)) return null;
    let m = /\bin (?:about |around )?(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hours?|hrs?|h)\b/.exec(t);
    if (m) return now + Math.round(Number(m[1]) * (/^m/.test(m[2]) ? 1 : 60));
    let h = null;
    let mi = 0;
    let mer = null;
    if (/\bat noon\b|\bnoon\b/.test(t)) { h = 12; mer = 'pm'; }
    else if (/\bmidnight\b/.test(t)) { h = 12; mer = 'am'; }
    else if ((m = /\b(?:at|@|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d:])/.exec(t)) || (m = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/.exec(t))) { h = Number(m[1]); mi = Number(m[2] || 0); mer = m[3] ? m[3][0] + 'm' : null; }
    else if ((m = /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/.exec(t))) { h = Number(m[1]); mer = m[2][0] + 'm'; }
    const day = Math.floor(now / 1440);
    const minNow = ((now % 1440) + 1440) % 1440;
    const tomorrow = /\btomorrow\b/.test(t);
    const evening = /\b(tonight|this evening|evening)\b/.test(t);
    const morning = /\b(this morning|in the morning|morning)\b/.test(t);
    if (h === null) {
      if (/\btonight\b/.test(t)) { h = 8; mer = 'pm'; }
      else if (/\bthis evening\b/.test(t)) { h = 6; mer = 'pm'; }
      else if (/\bthis afternoon\b/.test(t)) { h = 3; mer = 'pm'; }
      else return null;
    }
    if (h > 23 || mi > 59) return null;
    let cands;
    if (mer) cands = [((h % 12) + (mer === 'pm' ? 12 : 0)) * 60 + mi];
    else if (h > 12 || (h === 0)) cands = [h * 60 + mi];
    else cands = [(h % 12) * 60 + mi, ((h % 12) + 12) * 60 + mi].filter((x) => x >= 7 * 60 && x <= 23 * 60 + 59);
    if (!cands.length) return null;
    if (!mer && cands.length === 2) { if (evening) cands = [cands[1]]; else if (morning) cands = [cands[0]]; }
    let best = null;
    cands.forEach((c) => {
      let at = day * 1440 + c + (tomorrow ? 1440 : 0);
      if (!tomorrow && at <= now) at += 1440; // the next time it is that time
      if (best === null || at < best) best = at;
    });
    return best !== null && best - now <= 3 * 1440 ? best : null;
  };

  /* ---------- appointments ---------- */
  Clock.appts = () => (G.S && G.S.appts) || [];
  Clock.active = () => Clock.appts().filter((a) => a.status === 'pending' || a.status === 'confirmed');
  const nameOf = (id) => (G.S.npcs[id] || {}).name || 'Someone';
  Clock.add = function (npcId, at, text, t) {
    const S = G.S;
    S.appts = S.appts || [];
    if (S.appts.some((a) => a.npc === npcId && (a.status === 'pending' || a.status === 'confirmed') && Math.abs(a.at - at) < 60)) return null;
    const a = { id: U.uid('ap'), npc: npcId, at, text: clip(text, 90), status: 'pending', made: t != null ? t : S.clock };
    S.appts.push(a);
    if (S.appts.length > 40) S.appts.shift();
    try { E.addNotif('event', `🕒 Noted: ${nameOf(npcId)} at ${Clock.hhmm(at)} (${rel(at - S.clock)})`, { act: 'clockOpen' }); } catch (e) {}
    return a;
  };
  const YES = /\b(yes|yeah|yep|sure|ok|okay|see you|i'?ll be there|i will be there|sounds good|deal|can'?t wait|on my way|be there)\b/i;
  // reads new messages: times people write become appointments; your "ok see you" confirms the latest one
  Clock.scan = function () {
    const S = G.S;
    if (!S) return 0;
    S.apptSeen = S.apptSeen || {};
    let n = 0;
    Object.keys(S.dms || {}).forEach((id) => {
      if (!S.npcs[id]) return;
      (S.dms[id] || []).slice(-6).forEach((m) => {
        if (!m || S.apptSeen[m.id]) return;
        S.apptSeen[m.id] = 1;
        if (m.from === id) {
          const at = Clock.parseWhen(m.text, m.t != null ? m.t : S.clock);
          if (at && at > S.clock - 5 && Clock.add(id, at, m.text, m.t)) n++;
        } else if (m.from === 'me' && YES.test(m.text || '')) {
          const a = Clock.active().filter((x) => x.npc === id && x.status === 'pending').slice(-1)[0];
          if (a) a.status = 'confirmed';
        }
      });
    });
    const keys = Object.keys(S.apptSeen);
    if (keys.length > 400) keys.slice(0, 200).forEach((k) => delete S.apptSeen[k]);
    return n;
  };
  // reminders, and the stop at the moment itself
  Clock.tick = function () {
    const S = G.S;
    if (!S) return;
    Clock.init();
    Clock.scan();
    Clock.active().forEach((a) => {
      if (!a.remind && a.at > S.clock && a.at - S.clock <= 30) {
        a.remind = true;
        try { E.addNotif('event', `🕒 In ${Math.round(a.at - S.clock)} min: ${nameOf(a.npc)} at ${Clock.hhmm(a.at)}`, { act: 'clockOpen' }); } catch (e) {}
      }
      if (a.at <= S.clock && !a.due) {
        a.due = true;
        if (a.status === 'confirmed') {
          S.clockHold = a.id; // you said yes: the world waits for you
          try { E.addNotif('event', `🕒 It is ${Clock.hhmm(a.at)}: ${nameOf(a.npc)} is expecting you`, { act: 'clockOpen' }); } catch (e) {}
        } else {
          try { E.addNotif('event', `🕒 It is ${Clock.hhmm(a.at)}: ${nameOf(a.npc)} suggested meeting now`, { act: 'clockOpen' }); } catch (e) {}
        }
      }
      if (a.status === 'pending' && a.due && S.clock - a.at > 60) a.status = 'expired'; // nobody agreed and an hour went by: it lapses without a penalty
    });
  };
  const resolve = (a, status) => {
    a.status = status;
    if (G.S.clockHold === a.id) delete G.S.clockHold;
    G.Store.saveSoon();
  };

  /* ---------- the clock stands still ---------- */
  Clock.holdAppt = () => {
    const S = G.S;
    const a = S && S.clockHold && Clock.appts().find((x) => x.id === S.clockHold && (x.status === 'pending' || x.status === 'confirmed'));
    if (!a && S && S.clockHold) delete S.clockHold;
    return a || null;
  };
  Clock.waiting = function () {
    const S = G.S;
    if (!S || !G.settings.waitForMe) return null; // off unless you switch it on
    for (const id of Object.keys(S.dms || {})) {
      const n = S.npcs[id];
      if (!n || n.muted || n.blocked || n.userAlt) continue;
      const list = S.dms[id] || [];
      const m = list[list.length - 1];
      if (m && m.from === id && !m.read && S.clock - m.t < 240 && S.clockPass !== m.id) return { npc: n, m };
    }
    return null;
  };
  Clock.blocked = () => !!(Clock.holdAppt() || Clock.waiting());
  Clock.why = function () {
    const h = Clock.holdAppt();
    if (h) return `${nameOf(h.npc)} is expecting you (${Clock.hhmm(h.at)})`;
    const w = Clock.waiting();
    if (w) return `waiting for your reply to ${w.npc.name}`;
    return '';
  };
  // time never jumps past an appointment: a time-skip or coming back to the app stops AT it
  Clock.guard = function (minutes) {
    const S = G.S;
    if (!S || !(minutes > 0)) return minutes;
    const next = Clock.active().filter((a) => a.status === 'confirmed' && a.at > S.clock && a.at <= S.clock + Math.round(minutes)).sort((a, b) => a.at - b.at)[0]; // only meetings you agreed to stop a time-skip
    return next ? Math.max(1, Math.round(next.at - S.clock)) : minutes;
  };
  if (E && E.tick) {
    const tick0 = E.tick;
    E.tick = function (minutes) {
      const rest = Array.prototype.slice.call(arguments, 1);
      const r = tick0.apply(this, [Clock.guard(minutes)].concat(rest));
      try { Clock.tick(); } catch (e) {}
      return r;
    };
  }
  if (W) {
    W.liveBlocked = () => Clock.blocked();
    const catch0 = W.catchUp;
    W.catchUp = function () {
      if (Clock.blocked()) return null; // someone is waiting for you: nothing happens while you were away
      return catch0.apply(this, arguments);
    };
  }
  // earlier versions let time run fast: a calmer default, once
  Clock.init = function () {
    const s = G.settings;
    // once: the owner chose to let the background AI (line-writer, automatic summaries) run for a few cents more
    if (s && s.dirV !== 1) { s.dirV = 1; s.directorOnly = false; try { G.Store.saveSettings(); } catch (e) {} }
    if (!s || s.clockV === 2) return;
    const was = s.clockV;
    s.clockV = 2;
    // v1 froze the world while a message waited for you and ran it slowly: a quiet phone looked dead. Back to a moving world (a meeting you agreed to still stops the clock).
    if (s.worldSpeed == null || was !== 1 || s.worldSpeed === 1) s.worldSpeed = 2;
    s.waitForMe = false;
    try { G.Store.saveSettings(); } catch (e) {}
  };

  /* ---------- close friends ---------- */
  // who counts as a close friend: the people you are close to, unless you decided otherwise
  E.isClose = function (n) {
    if (!n) return false;
    if (n.close === true) return true;
    if (n.close === false) return false;
    return ['close_friend', 'best_friend', 'dating', 'partner'].includes(n.status) || E.isFamily(n);
  };
  A.audience = () => { UI.audience = UI.audience === 'close' ? '' : 'close'; UI.render(); };
  A.toggleClose = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    n.close = !E.isClose(n);
    G.Store.saveSoon();
    UI.toast(n.close ? `💚 ${n.name} is in your close friends` : `${n.name} removed from your close friends`, 'good');
    UI.closeModal();
    A.profile && A.profile({ id: d.id });
  };

  /* ---------- the chip and the clock window ---------- */
  Clock.chip = function () {
    const S = G.S;
    if (!S) return '';
    const h = Clock.holdAppt();
    if (h) return `⏰ ${esc(nameOf(h.npc).split(' ')[0])} is waiting`;
    const w = Clock.waiting();
    const paused = !W.speedMinutes();
    return `🕒 ${Clock.hhmm(S.clock)}${w ? ' ⏸ ' + esc(G.U.first(w.npc.name)) + '…' : paused ? ' ⏸' : ''}`;
  };
  Clock.modal = function () {
    const S = G.S;
    const why = Clock.why();
    const spd = G.settings.worldSpeed != null ? G.settings.worldSpeed : 1;
    const list = Clock.appts().filter((a) => a.status !== 'missed' || S.clock - a.at < 1440).slice(-8).reverse();
    const row = (a) => {
      const done = a.status === 'done' || a.status === 'missed' || a.status === 'cancelled';
      const due = !done && a.at <= S.clock;
      return `<div class="row between small" style="margin:6px 0;gap:6px"><span><b>${Clock.hhmm(a.at)}</b> · ${esc(nameOf(a.npc))} <span class="muted">${esc(done ? a.status : rel(a.at - S.clock))}${a.status === 'confirmed' ? ' · you said yes' : ''}</span><div class="muted">${esc(a.text)}</div></span><span class="row wrap" style="gap:4px;justify-content:flex-end">${done ? '' : due ? `<button class="btn primary sm" data-act="clockGo" data-id="${a.id}">I'm here</button><button class="btn sm" data-act="clockSkip" data-id="${a.id}">Skip it</button><button class="btn sm" data-act="clockSnooze" data-id="${a.id}">+30 min</button>` : `${a.status === 'confirmed' ? '' : `<button class="btn sm" data-act="clockConfirm" data-id="${a.id}">I'll be there</button>`}<button class="btn sm" data-act="clockCancel" data-id="${a.id}">Cancel</button>`}<button class="btn sm" data-act="clockChat" data-id="${a.npc}">💬</button></span></div>`;
    };
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🕒 Game time</h3>
      <div class="clockbig">${Clock.hhmm(S.clock)} <span class="muted small">${esc(U.clockStr(S.clock).split(' · ')[0])}${S.storyDate ? ' · story: ' + esc(S.storyDate) : ''}</span></div>
      ${why ? `<p class="small" style="color:#e1306c">⏸ The clock is standing still: ${esc(why)}. <button class="btn sm" data-act="clockResume">Let time go on</button></p>` : '<p class="small muted">▶ The world is moving. It stops by itself when someone is waiting for you or an appointment comes up.</p>'}
      <div class="row wrap" style="gap:6px">${[['0', '⏸ Pause'], ['1', '🐢 Slow'], ['2', '▶ Normal'], ['3', '⚡ Fast']].map(([v, l]) => `<button class="btn sm ${String(spd) === v ? 'primary' : ''}" data-act="speed" data-v="${v}">${l}</button>`).join('')}</div>
      <label class="check" style="margin-top:8px"><input type="checkbox" data-setting="waitForMe" ${G.settings.waitForMe ? 'checked' : ''}> Wait for my reply (the clock stops while someone is waiting for your answer)</label>
      <h4 class="sect">Appointments</h4>${list.map(row).join('') || '<div class="empty small">None yet. When someone writes “meet me at 3”, it shows up here.</div>'}
      <div class="row wrap" style="margin-top:8px;gap:6px"><button class="btn sm" data-act="clockSkipTime" data-m="30">+30 min</button><button class="btn sm" data-act="clockSkipTime" data-m="60">+1 hour</button><button class="btn sm" data-act="clockSkipTime" data-m="240">+4 hours</button><button class="btn sm" data-act="clockNext">⏭ To the next appointment</button></div>`);
  };
  A.clockOpen = () => Clock.modal();
  const reopen = () => { UI.closeModal(); Clock.modal(); UI.render(); };
  A.clockResume = () => { const S = G.S; delete S.clockHold; const w = Clock.waiting(); if (w) S.clockPass = w.m.id; G.Store.saveSoon(); reopen(); };
  A.clockConfirm = (d) => { const a = Clock.appts().find((x) => x.id === d.id); if (a) a.status = 'confirmed'; G.Store.saveSoon(); reopen(); };
  A.clockCancel = (d) => { const a = Clock.appts().find((x) => x.id === d.id); if (a) resolve(a, 'cancelled'); reopen(); };
  A.clockSnooze = (d) => {
    const a = Clock.appts().find((x) => x.id === d.id);
    if (a) { a.at = G.S.clock + 30; a.due = false; a.remind = false; if (G.S.clockHold === a.id) delete G.S.clockHold; G.Store.saveSoon(); }
    reopen();
  };
  A.clockGo = (d) => {
    const a = Clock.appts().find((x) => x.id === d.id);
    if (!a) return;
    const n = G.S.npcs[a.npc];
    resolve(a, 'done');
    if (n) {
      try { G.Mem.add(n, { kind: 'event', text: `${G.S.player.name} showed up when we agreed to meet`, who: ['me'], imp: 6, valence: 0.4 }); } catch (e) {}
      W.nudgeRel && W.nudgeRel(n, { aff: 2 });
    }
    UI.closeModal();
    UI.go('messages', { dmWith: a.npc });
  };
  A.clockSkip = (d) => {
    const a = Clock.appts().find((x) => x.id === d.id);
    if (!a) return;
    const n = G.S.npcs[a.npc];
    const promised = a.status === 'confirmed';
    resolve(a, 'missed');
    if (n) {
      try { G.Mem.add(n, { kind: 'rejection', text: promised ? `${G.S.player.name} said they would come and never showed up` : `${G.S.player.name} did not show up when I asked to meet`, who: ['me'], imp: promised ? 7 : 5, valence: -0.5 }); } catch (e) {}
      W.nudgeRel && W.nudgeRel(n, { aff: promised ? -5 : -2, trust: promised ? -3 : 0 });
    }
    reopen();
  };
  A.clockSkipTime = (d) => { E.tick(Number(d.m) || 30, true); UI.closeModal(); UI.render(); Clock.modal(); };
  A.clockNext = () => {
    const next = Clock.active().filter((a) => a.at > G.S.clock).sort((a, b) => a.at - b.at)[0];
    if (!next) { UI.toast('No appointment coming up.', 'info'); return; }
    E.tick(next.at - G.S.clock, true);
    UI.closeModal();
    UI.render();
    Clock.modal();
  };
  A.clockChat = (d) => { UI.closeModal(); UI.go('messages', { dmWith: d.id }); };
  // the chip tells the time without a redraw
  setInterval(() => {
    try {
      const el = document.querySelector('.clockchip');
      if (el && G.S) { const t = Clock.chip(); if (el.innerHTML !== t) el.innerHTML = t; }
    } catch (e) {}
  }, 1500);
})(window.G);
