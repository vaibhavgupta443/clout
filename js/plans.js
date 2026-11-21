/* Clout — outings with real times.
   A close clique proposes a plan in a group chat or a DM ("Fri 7pm, rooftop") when there is a real reason (a good mood, or a goal about catching up),
   at most once per 3 game days and never while you are in a heavy moment. It becomes an appointment (Clock) with RSVP chips. At the time a short scene
   resolves from the real relationships between the people who came. Going: everyone who was there stores the SAME memory and grows a little closer.
   Skipping: a small dip and a "you missed it" line. A plan you said yes to holds the clock exactly like a confirmed meeting.
   Free (no AI). State: S.plans (<= 12) {id,at,place,who[],rsvp{},status,out,made,via,host,why,ap}, created on the first proposal. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const W = G.World;
  const A = UI.acts;
  const { esc } = U;
  const Plans = (G.Plans = {});
  const EMPTY = Object.freeze([]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const first = (s) => String(s || '').split(' ')[0];
  const MAX = 12;
  const GAP = 3 * 1440; // at most one proposal per 3 game days
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const FRIENDLY = ['friend', 'close_friend', 'best_friend', 'ally'];
  const TENSE = ['rival', 'enemy', 'nemesis', 'frenemy', 'ex'];
  const ROMANCE = ['crush', 'dating', 'partner', 'situationship'];
  const live = (p) => p.status === 'open' || p.status === 'set';

  Plans.list = () => (G.S && G.S.plans) || EMPTY;
  Plans.live = () => Plans.list().filter(live);
  Plans.get = (id) => Plans.list().find((p) => p.id === id) || null;
  const ensure = () => (G.S.plans = G.S.plans || []);
  const ok = (n) => n && !n.blocked && !n.userAlt && !n.setAside && !n.muted;

  Plans.when = function (at) {
    const m = ((Math.round(at) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${DOW[Math.floor(at / 1440) % 7]} ${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
  };
  const rngFor = (seed) => (G.Bonds && G.Bonds.rng ? G.Bonds.rng(seed) : Math.random);
  const pickOne = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length];
  const names = (ids) => {
    const l = ids.map((x) => (x === 'me' ? first(G.S.player.name) : first((G.S.npcs[x] || {}).name)));
    return l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l[0] || '';
  };

  /* ---------- what they say, in their voice: warm / plain / sharp ---------- */
  const GROUP = { shy: 'warm', bubbly: 'warm', flirty: 'warm', formal: 'plain', blunt: 'plain', cold: 'sharp', snarky: 'sharp' };
  const INVITE = {
    warm: ['we should all go out. {when}, {place}?', '{when} at {place}. the whole crew is in, say you\'ll come!', 'who is free {when}? {place}, all of us.'],
    plain: ['Proposal: {when}, {place}. Let me know if you can make it.', 'A few of us are meeting {when} at {place}. I would like you there.'],
    sharp: ['{when}, {place}. you\'re coming, right?', '{place}, {when}. don\'t be late this time.'],
  };
  const PREFIX = {
    mood: { warm: ['i\'m in such a good mood today.', 'today is a good day.'], plain: ['I am in good spirits today.'], sharp: ['for once i\'m in a decent mood.'] },
    goal: { warm: ['we haven\'t properly caught up in a while.', 'i\'ve been meaning to see you.'], plain: ['We have not caught up properly in some time.'], sharp: ['it\'s been too long.'] },
  };
  const MISSED = {
    warm: ['you missed it! it was a good one, next time for sure.', 'we kept your seat empty. you owe us a story.'],
    plain: ['You were missed last night. We will try again.', 'It would have been good to have you there.'],
    sharp: ['you missed it. we noticed.', 'nice of you to skip. it was fun without you, mostly.'],
  };
  const PLACE = { food: 'the ramen place', music: 'the rooftop bar', fitness: 'the climbing gym', art: 'the gallery cafe', nature: 'the park by the lake', movies: 'the late cinema', gaming: 'the arcade', books: 'the bookstore cafe', party: 'the rooftop', travel: 'the night market' };
  const DEF_PLACES = ['the rooftop', 'the corner cafe', 'the park by the lake'];

  const toneOf = (npc) => {
    let rel = null;
    try { rel = G.React.relation(G.S, npc, 'me'); } catch (e) {}
    let st = 'shy';
    try { st = G.Dialogue.styleOf(npc, rel || undefined); } catch (e) {}
    return GROUP[st] || 'warm';
  };
  const stylize = (npc, text, rnd) => { try { return G.Voice.stylize(text, npc, rnd, { short: true }) || text; } catch (e) { return text; } };
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

  /* ---------- sending the proposal into the thread ---------- */
  function say(plan, host, text, t) {
    const S = G.S;
    if (plan.via !== 'dm') {
      const g = S.groups && S.groups[plan.via];
      if (!g) return null;
      const m = { id: 'g' + S.counters.msg++, from: host.id, text, t, read: false };
      g.msgs.push(m);
      if (g.msgs.length > 200) g.msgs.shift();
      return m;
    }
    const before = (S.dms[host.id] || []).slice(-1)[0];
    W.sendDm(host, 'plan', t, { text });
    const m = (S.dms[host.id] || []).slice(-1)[0];
    return m && m !== before && m.text === text ? m : null;
  }

  /* ---------- proposing ---------- */
  // o: { at, place, via ('dm' or a group id), who (npc ids besides the host), why, rsvp, rnd }
  Plans.propose = function (hostId, o) {
    o = o || {};
    const S = G.S;
    const host = S.npcs[hostId];
    if (!ok(host)) return null;
    const t = S.clock;
    const rnd = o.rnd || rngFor(((t | 0) + (U.hash ? U.hash(hostId) : 3)) | 0);
    const others = (o.who || []).filter((id) => id !== hostId && ok(S.npcs[id])).slice(0, 3);
    const at = o.at != null ? o.at : (Math.floor(t / 1440) + 1 + Math.floor(rnd() * 2)) * 1440 + pickOne([12, 18, 19, 20], rnd) * 60;
    const ints = G.Persona.ensure(host).interests || [];
    const place = o.place || PLACE[ints.find((k) => PLACE[k])] || pickOne(DEF_PLACES, rnd);
    const tone = toneOf(host);
    const when = Plans.when(at);
    const why = o.why || 'mood';
    const pre = PREFIX[why] ? pickOne(PREFIX[why][tone], rnd) + ' ' : '';
    const text = stylize(host, (pre + fill(pickOne(INVITE[tone], rnd), { when, place })).trim(), rnd).slice(0, 220);
    const plan = { id: U.uid('pl'), at, place: String(place).slice(0, 40), who: [hostId].concat(others), rsvp: {}, status: 'open', made: t, via: o.via || 'dm', host: hostId, why };
    plan.who.forEach((id) => { plan.rsvp[id] = id === hostId || (o.rsvp ? o.rsvp[id] !== 'no' : (S.npcs[id].aff || 0) >= 15 && rnd() > 0.2) ? 'yes' : 'no'; });
    const m = say(plan, host, text, t);
    if (!m) return null; // a heavy moment of yours, or the thread is gone: no plan
    m.plan = plan.id;
    S.apptSeen = S.apptSeen || {};
    S.apptSeen[m.id] = 1; // the plan makes its own appointment; the clock must not read the same message again
    if (G.Clock && G.Clock.add) {
      let ap = G.Clock.add(hostId, at, `${place}, ${when}`, t);
      if (!ap) ap = G.Clock.appts().find((x) => x.npc === hostId && (x.status === 'pending' || x.status === 'confirmed') && Math.abs(x.at - at) < 60);
      if (ap) plan.ap = ap.id;
    }
    const l = ensure();
    l.push(plan);
    while (l.length > MAX) {
      const i = l.findIndex((x) => !live(x));
      l.splice(i >= 0 ? i : 0, 1);
    }
    try { E.addNotif('event', `${first(host.name)} suggests ${when}, ${place}`, { act: 'planOpen', data: { id: plan.id }, key: 'plan' + plan.id }); } catch (e) {}
    try { G.Store.saveSoon(); } catch (e) {}
    return plan;
  };

  // the real reasons: a good mood, or a goal about catching up with you. At most one proposal per 3 game days, one open plan at a time.
  Plans.consider = function (o) {
    o = o || {};
    const S = G.S;
    if (!S) return null;
    const t = S.clock;
    const hour = (((t % 1440) + 1440) % 1440) / 60;
    if (!o.force && (hour < 9 || hour > 20)) return null;
    const list = Plans.list();
    if (list.some(live)) return null;
    if (list.some((p) => t - p.made < GAP)) return null;
    const rnd = o.rnd || rngFor(Math.floor(t / 60) * 31 + 5);
    if (!o.force && rnd() >= (o.chance != null ? o.chance : 0.05)) return null;
    const cast = Object.values(S.npcs).filter(ok);
    const friendly = (n) => FRIENDLY.includes(n.status) && (n.aff || 0) >= 35 && (n.trust == null || n.trust >= 25);
    const whyOf = (n) => {
      if (!friendly(n)) return '';
      if (n.goal && /catch up|spend time|get closer/.test(String(n.goal.text))) return 'goal';
      return G.Persona.ensure(n).mood.v >= 0.25 ? 'mood' : '';
    };
    const hosts = cast.filter((n) => whyOf(n)).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const host of hosts) {
      if (W.heavyContext && W.heavyContext(host, t)) continue;
      const g = Object.values(S.groups || {}).find((x) => x.members.includes(host.id) && x.members.filter((id) => id !== host.id && ok(S.npcs[id])).length >= 1);
      let via = 'dm';
      let who = [];
      if (g) {
        via = g.id;
        who = g.members.filter((id) => id !== host.id && ok(S.npcs[id]));
      } else {
        who = cast.filter((n) => n.id !== host.id && friendly(n) && (S.npcRel || []).some((e) => ['friend', 'best_friend'].includes(e.type) && ((e.a === host.id && e.b === n.id) || (e.b === host.id && e.a === n.id)))).map((n) => n.id);
      }
      who = who.slice(0, 3);
      if (!who.length) continue;
      const p = Plans.propose(host.id, { via, who, why: whyOf(host), rnd });
      if (p) return p;
    }
    return null;
  };

  /* ---------- the scene, from the real relationships ---------- */
  function sceneFor(plan, att, went) {
    const S = G.S;
    const hostN = S.npcs[plan.host];
    const edgeBetween = (a, b) => (S.npcRel || []).find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    let tense = null;
    let warm = null;
    let friend = null;
    for (let i = 0; i < att.length; i++) {
      for (let j = i + 1; j < att.length; j++) {
        const e = edgeBetween(att[i], att[j]);
        if (!e) continue;
        const pair = [att[i], att[j]];
        if (TENSE.includes(e.type)) tense = tense || pair;
        else if (ROMANCE.includes(e.type)) warm = warm || pair;
        else friend = friend || pair;
      }
    }
    const out = [`${Plans.when(plan.at)} at ${plan.place}: ${names(att.concat(went ? ['me'] : []))}.`];
    let beat;
    if (tense) beat = `${first(S.npcs[tense[0]].name)} and ${first(S.npcs[tense[1]].name)} kept it civil, and kept their distance.`;
    else if (warm) beat = `${first(S.npcs[warm[0]].name)} and ${first(S.npcs[warm[1]].name)} sat close and laughed at the same jokes.`;
    else {
      const a = G.Persona.ensure(S.npcs[att[0]]).interests || [];
      const b = att[1] ? G.Persona.ensure(S.npcs[att[1]]).interests || [] : [];
      const shared = a.find((k) => b.includes(k)) || a[0];
      beat = friend || shared ? `The talk kept coming back to ${shared || 'old stories'}, and nobody checked the time.` : 'The night was easy, with no plans beyond staying a while.';
    }
    out.push(beat);
    const aff = hostN ? hostN.aff || 0 : 0;
    const h = first((hostN || {}).name);
    if (went) out.push(aff >= 60 ? `${h} saved you a seat and kept the stories coming.` : aff >= 30 ? `${h} was glad you came.` : `${h} was polite but kept it short.`);
    else out.push('Your seat stayed empty.');
    return { lines: out.map((s) => s.slice(0, 160)), tense: !!tense };
  }

  /* ---------- resolving ---------- */
  // mode: 'went' | 'missed' (said yes, did not come) | 'declined' (said no) | 'unanswered'
  Plans.finish = function (plan, mode) {
    const S = G.S;
    if (!plan || !live(plan)) return null;
    const went = mode === 'went';
    const att = plan.who.filter((id) => plan.rsvp[id] === 'yes' && ok(S.npcs[id]));
    const ap = plan.ap && G.Clock ? G.Clock.appts().find((x) => x.id === plan.ap) : null;
    const clockDid = !!ap && ap.status === (went ? 'done' : 'missed'); // the clock window already applied its own effects to the host
    if (ap && (ap.status === 'pending' || ap.status === 'confirmed')) ap.status = went ? 'done' : mode === 'missed' ? 'missed' : 'cancelled';
    if (ap && S.clockHold === ap.id) delete S.clockHold;
    if (!att.length) {
      plan.status = 'cancelled';
      return null;
    }
    const sc = sceneFor(plan, att, went);
    const me = first(S.player.name);
    const text = (went ? `We all went out: ${sc.lines[0]} ${sc.lines[1]}` : `We went out without ${me}: ${sc.lines[0]} ${sc.lines[1]}`).slice(0, 210);
    att.forEach((id) => {
      const n = S.npcs[id];
      try { G.Mem.add(n, { kind: 'event', text, who: att.concat(['me']), imp: 5, valence: went && !sc.tense ? 0.4 : went ? 0.1 : -0.1 }); } catch (e) {}
      if (went) {
        n.aff = clamp((n.aff || 0) + 2, -100, 100);
        n.trust = clamp((n.trust || 0) + 1, 0, 100);
        try { G.Persona.nudge(n, sc.tense ? 0 : 0.06); } catch (e) {}
      } else {
        const dip = mode === 'missed' && id === plan.host ? (clockDid ? 0 : -3) : -1;
        if (dip) n.aff = clamp((n.aff || 0) + dip, -100, 100);
      }
    });
    let line = '';
    if (!went) {
      const host = S.npcs[plan.host];
      if (host) {
        const rnd = rngFor((S.clock | 0) + 11);
        line = stylize(host, pickOne(MISSED[toneOf(host)], rnd), rnd).slice(0, 160);
        try { say(plan, host, line, S.clock); } catch (e) {}
        try { G.Mem.add(host, { kind: 'rejection', text: `${me} did not come to ${plan.place} when we planned it`, who: ['me'], imp: mode === 'missed' ? 6 : 4, valence: -0.3 }); } catch (e) {}
      }
    }
    plan.status = went ? 'done' : mode === 'declined' ? 'declined' : 'missed';
    plan.out = { kind: mode, line, scene: sc.lines, t: S.clock };
    try { E.addNotif('event', went ? `You went out: ${Plans.when(plan.at)}, ${plan.place}` : `You missed it: ${Plans.when(plan.at)}, ${plan.place}`, { act: 'planOpen', data: { id: plan.id }, key: 'plan' + plan.id + 'x' }); } catch (e) {}
    try { G.Store.saveSoon(); } catch (e) {}
    return plan.out;
  };

  Plans.rsvp = function (id, v) {
    const p = Plans.get(id);
    if (!p || !live(p) || (v !== 'yes' && v !== 'no') || G.S.clock >= p.at) return null;
    p.rsvp.me = v;
    p.status = 'set';
    const ap = p.ap && G.Clock ? G.Clock.appts().find((x) => x.id === p.ap) : null;
    if (ap && (ap.status === 'pending' || ap.status === 'confirmed' || ap.status === 'cancelled')) {
      ap.status = v === 'yes' ? 'confirmed' : 'cancelled';
      if (v === 'no' && G.S.clockHold === ap.id) delete G.S.clockHold;
    }
    try { G.Store.saveSoon(); } catch (e) {}
    return p;
  };
  Plans.attend = (id) => { const p = Plans.get(id); return p && G.S.clock >= p.at ? Plans.finish(p, 'went') : null; };
  Plans.skip = (id) => { const p = Plans.get(id); return p && G.S.clock >= p.at ? Plans.finish(p, p.rsvp.me === 'yes' ? 'missed' : 'declined') : null; };

  // every tick: stay in step with the clock window, and resolve what is due
  Plans.tick = function () {
    const S = G.S;
    if (!S || !S.plans) return;
    const t = S.clock;
    S.plans.filter(live).forEach((p) => {
      const ap = p.ap && G.Clock ? G.Clock.appts().find((x) => x.id === p.ap) : null;
      if (ap) {
        if (ap.status === 'done') return Plans.finish(p, 'went');
        if (ap.status === 'missed') return Plans.finish(p, 'missed');
        if (ap.status === 'confirmed' && p.rsvp.me !== 'yes') { p.rsvp.me = 'yes'; p.status = 'set'; } // you wrote "ok, see you" in the chat
        if (ap.status === 'cancelled' && p.rsvp.me !== 'no') { p.rsvp.me = 'no'; p.status = 'set'; }
      }
      if (t < p.at) return;
      if (p.rsvp.me === 'yes') {
        if (t - p.at > 120) Plans.finish(p, 'missed'); // the clock held for you; you let time go on
        else if (!p.due) {
          p.due = true;
          try { E.addNotif('event', `It is time: ${p.place}, ${Plans.when(p.at)}`, { act: 'planOpen', data: { id: p.id }, key: 'plan' + p.id + 'd' }); } catch (e) {}
        }
      } else if (p.rsvp.me === 'no') Plans.finish(p, 'declined');
      else if (t - p.at >= 60) Plans.finish(p, 'unanswered');
    });
  };

  /* ---------- cards in Messages and Alerts ---------- */
  Plans.cardHtml = function (p) {
    const S = G.S;
    const chips = p.who.map((id) => `<span class="chip ${p.rsvp[id] === 'yes' ? 'green' : ''}">${esc(first((S.npcs[id] || {}).name))} ${p.rsvp[id] === 'yes' ? 'in' : 'out'}</span>`).join(' ');
    const me = p.rsvp.me;
    const due = S.clock >= p.at;
    let body = '';
    if (live(p) && !due) {
      body = `<div class="row wrap" style="gap:6px;margin-top:6px"><button class="btn sm ${me === 'yes' ? 'primary' : ''}" data-act="planRsvp" data-id="${p.id}" data-v="yes">Going</button><button class="btn sm ${me === 'no' ? 'primary' : ''}" data-act="planRsvp" data-id="${p.id}" data-v="no">Can't make it</button></div>`;
    } else if (live(p)) {
      body = `<div class="row wrap" style="gap:6px;margin-top:6px"><button class="btn sm primary" data-act="planGo" data-id="${p.id}">I'm here</button><button class="btn sm" data-act="planSkip" data-id="${p.id}">Skip it</button></div>`;
    } else if (p.out) {
      body = `<div style="margin-top:6px">${p.out.scene.map((l) => `<div>${esc(l)}</div>`).join('')}${p.out.line ? `<div class="muted" style="margin-top:4px">"${esc(p.out.line)}"</div>` : ''}</div>`;
    }
    const lab = live(p) ? (me === 'yes' ? 'You are going' : me === 'no' ? 'You said no' : 'Plan') : { done: 'You went', declined: 'You could not make it', missed: 'You missed it', cancelled: 'Cancelled' }[p.status] || 'Plan';
    return `<div class="sumbox small plancard" data-plan="${p.id}"><b>${esc(lab)}: ${esc(Plans.when(p.at))}, ${esc(p.place)}</b><div style="margin-top:4px">${chips}</div>${body}</div>`;
  };
  function threadCards() {
    const S = G.S;
    if (!S || !S.plans) return '';
    const show = S.plans.filter((p) => (live(p) || (p.out && S.clock - p.out.t < 2880)) && ((UI.groupWith && p.via === UI.groupWith) || (UI.dmWith && !UI.groupWith && p.via === 'dm' && p.who.includes(UI.dmWith))));
    return show.slice(-2).map(Plans.cardHtml).join('');
  }
  if (G.Pages && G.Pages.messages) {
    const m0 = G.Pages.messages;
    G.Pages.messages = function () {
      const html = m0.apply(this, arguments);
      try {
        const c = threadCards();
        const key = '<div class="chatinput">';
        if (c && html.indexOf(key) >= 0) return html.replace(key, () => c + key);
      } catch (e) {}
      return html;
    };
  }
  const redraw = () => { UI.closeModal(); UI.render(); };
  A.planOpen = (d) => {
    const p = Plans.get(d.id);
    if (!p) { UI.toast('That plan is gone.', 'info'); return; }
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>Plan</h3>${Plans.cardHtml(p)}<div class="row wrap" style="margin-top:8px;gap:6px"><button class="btn sm" data-act="planChat" data-id="${p.id}">Open the chat</button></div>`);
  };
  A.planChat = (d) => {
    const p = Plans.get(d.id);
    UI.closeModal();
    if (!p) return;
    if (p.via === 'dm') UI.go('messages', { dmWith: p.host });
    else if (A.openGroup) A.openGroup({ id: p.via });
  };
  A.planRsvp = (d) => { Promise.resolve(E.guarded('Plan…', () => Plans.rsvp(d.id, d.v))).then(redraw); };
  A.planGo = (d) => {
    Promise.resolve(E.guarded('Plan…', () => Plans.attend(d.id))).then((out) => {
      if (!out) { redraw(); return; }
      UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>The night out</h3>${out.scene.map((l) => `<p>${esc(l)}</p>`).join('')}<button class="btn primary" data-act="closeModal">Done</button>`);
      UI.render();
    });
  };
  A.planSkip = (d) => { Promise.resolve(E.guarded('Plan…', () => Plans.skip(d.id))).then(redraw); };

  /* ---------- the heartbeat: no new timers, we ride the game tick ---------- */
  let lastHour = -1;
  if (E && E.tick) {
    const tick0 = E.tick;
    E.tick = function () {
      const r = tick0.apply(this, arguments);
      try {
        if (G.S) {
          Plans.tick();
          const hr = Math.floor(G.S.clock / 60);
          if (hr !== lastHour) { lastHour = hr; Plans.consider(); }
        }
      } catch (e) {}
      return r;
    };
  }
})(window.G);
