/* Clout — bonds: how relationships CHANGE. A small explicit state machine (no DOM, no AI calls, injectable rnd).
   Player <-> NPC: stageOf() says which status a bond SHOULD have (with different enter/exit thresholds and a minimum number of days in a stage,
   so nothing flip-flops), including the negative paths (estranged / enemy, ex <-> friend repair, a couple that falls apart).
   NPC <-> NPC: edgeStep() evolves every edge type once a day (strength, fights with a minimum length, makeups that restore the previous type,
   breakups, new couples with mutual feelings, fading friendships). consequences() turns an event into concrete state (grudges, unfollows, a mood
   that lasts days, a chronicle line, a notification, a DM-to-player intent that the caller may send). Family never loses its status.
   Day numbers are U.dayOf() values. Small state only: npc.since[...] (numbers), edge.s / d / l / g / was / m / estr, persona.moods (only while active). */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const B = (G.Bonds = {});
  const hooks = [];
  B.onChange = (fn) => { if (typeof fn === 'function' && hooks.length < 8) hooks.push(fn); return B; }; // fn(kind, npcId, info): 'stage' {from,to} or a consequence kind {ev}
  B.emit = (kind, id, info) => { hooks.forEach((fn) => { try { fn(kind, id, info || {}); } catch (e) {} }); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (x) => Math.round(x * 100) / 100;

  const FAMILY = (E && E.FAMILY) || ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'];
  const COUPLE = ['dating', 'partner'];
  const ROM = ['dating', 'partner', 'crush', 'admirer', 'situationship'];
  const HOST = ['rival', 'enemy', 'nemesis', 'hater', 'frenemy'];
  B.FAMILY = FAMILY;
  B.COUPLE = COUPLE;
  const isFam = (s) => FAMILY.includes(s);
  const dayNow = (S) => U.dayOf((S || G.S).clock);

  // minimum days a player bond stays in a stage before it may change (ctx.force skips it for a real event such as a betrayal)
  const MIN = { dating: 3, partner: 7, ex: 5, situationship: 3, crush: 3, admirer: 3, frenemy: 2, rival: 3, enemy: 4, nemesis: 4, hater: 3, stan: 3, mentor: 5, ally: 5, friend: 2, close_friend: 3, best_friend: 4, acquaintance: 1, stranger: 0 };
  B.MIN = MIN;

  /* ================= 1. the stage a player bond should have ================= */

  // a couple falls apart when romance is gone, or it is cold AND weak, or trust is gone, or affection is clearly negative
  const coupleCollapse = (aff, rom, trust) => rom < 12 || (rom < 20 && aff < 15) || aff < -25 || (trust <= 5 && aff < 25);

  // hostility ladder with hold thresholds that are looser than the enter thresholds (hysteresis)
  function hostile(aff, riv, cur) {
    if ((riv >= 75 && aff < -30) || (cur === 'nemesis' && riv >= 60 && aff < -15)) return 'nemesis';
    if ((riv >= 50 && aff < -10) || aff <= -60 || (cur === 'enemy' && ((riv >= 38 && aff < 0) || aff <= -40))) return 'enemy';
    if ((riv >= 30 && aff < 10) || (cur === 'rival' && riv >= 22 && aff < 20)) return 'rival';
    return null;
  }

  const LADDER = [['best_friend', 75], ['close_friend', 50], ['friend', 20], ['acquaintance', 5]];

  function rawStage(aff, rom, riv, trust, cur) {
    switch (cur) {
      case 'partner':
      case 'dating':
        if (coupleCollapse(aff, rom, trust)) return 'ex';
        if (cur === 'partner' && (rom < 40 || aff < 25 || trust < 30)) return 'dating';
        return cur;
      case 'situationship':
        if (rom < 15 || aff < -10) return aff >= 30 ? 'friend' : 'ex';
        return cur;
      case 'crush':
      case 'admirer':
        if (rom < (cur === 'crush' ? 10 : 8) || aff < -15) {
          if (aff <= -60) return 'enemy';
          if (aff < -15) return riv >= 30 ? 'rival' : 'acquaintance';
          return aff >= 20 ? 'friend' : 'acquaintance';
        }
        return cur;
      case 'ex':
        if (aff >= 60 && rom >= 45 && trust >= 45) return 'situationship'; // back on, unlabeled
        if (aff >= 40 && trust >= 35 && rom < 45 && riv < 35) return 'friend'; // repair
        if (aff <= -45 || (aff <= -30 && riv >= 50)) return 'enemy';
        return 'ex';
      case 'mentor':
      case 'ally':
        if (aff < -15) return aff <= -60 ? 'enemy' : riv >= 30 ? 'rival' : 'acquaintance';
        return cur;
      case 'stan':
        if (aff < -25) return 'hater';
        return aff < 10 ? 'acquaintance' : cur;
      case 'hater':
        return aff >= 15 && riv < 30 ? 'acquaintance' : cur;
      case 'frenemy':
        if (aff >= 30 && riv < 30) return 'friend';
        if (aff <= -45 || (riv >= 50 && aff < -10)) return 'enemy';
        if (aff < -15 || (riv >= 40 && aff < 10)) return 'rival';
        return cur;
      default: {
        const h = hostile(aff, riv, cur);
        if (h) return h;
        const recovering = cur === 'rival' || cur === 'enemy' || cur === 'nemesis';
        if (!recovering && cur !== 'stranger' && rom >= 25 && aff >= 30 && trust >= 25) return 'crush';
        let ti = LADDER.findIndex((l) => aff >= l[1]);
        if (recovering && ti !== -1 && ti < 2) ti = 2; // after a feud: friend at most, trust has to be rebuilt
        const ci = LADDER.findIndex((l) => l[0] === cur);
        const tn = ti === -1 ? LADDER.length : ti;
        if (ci !== -1 && tn > ci && aff >= LADDER[ci][1] - 8) return cur; // slide down only when clearly below
        if (ti === -1) return cur === 'stranger' ? 'stranger' : 'acquaintance';
        return LADDER[ti][0];
      }
    }
  }

  // ctx: { status, days (days already spent in `status`, undefined = long established), force }
  B.stageOf = function (aff, rom, riv, trust, ctx) {
    const c = ctx || {};
    const cur = c.status || 'stranger';
    if (isFam(cur)) return cur; // family is permanent
    const to = rawStage(aff, rom, riv, trust, cur);
    if (to !== cur && !c.force && typeof c.days === 'number' && c.days < (MIN[cur] != null ? MIN[cur] : 1)) return cur;
    return to;
  };

  // a blood tie can be strained into estrangement (a flag, never a status change), with hysteresis
  B.estranged = (aff, trust, riv, was) => (was ? !(aff >= -15 && trust >= 30) : (aff <= -55 && trust <= 25) || (riv >= 70 && aff <= -40));

  const daysIn = (n, day) => (n.since && typeof n.since[n.status] === 'number' ? day - n.since[n.status] : undefined);
  B.daysIn = (n, S) => daysIn(n, dayNow(S));

  // the status this npc's bond with the player should have now (pure; use instead of Engine's deriveStatus)
  B.derive = function (n, S, o) {
    o = o || {};
    const day = o.day != null ? o.day : dayNow(S);
    return B.stageOf(n.aff, n.rom, n.riv, n.trust, { status: n.status, days: daysIn(n, day), force: o.force });
  };

  // after anyone else changed n.status (AI result, owner action): remember when the new stage began
  B.stamp = function (n, from, S, day) {
    if (n.status === from) return false;
    day = day != null ? day : dayNow(S);
    n.since = n.since || {};
    if (from) delete n.since[from];
    n.since[n.status] = day;
    B.emit('stage', n.id, { from, to: n.status });
    return true;
  };

  // apply the derived stage to the npc. Returns { from, to } when the status changed, else null
  B.settle = function (n, S, o) {
    o = o || {};
    const day = o.day != null ? o.day : dayNow(S);
    if (isFam(n.status)) {
      const was = !!n.estranged;
      const now = B.estranged(n.aff, n.trust, n.riv, was);
      if (now) n.estranged = true;
      else delete n.estranged;
      return null;
    }
    const to = B.derive(n, S, { day, force: o.force });
    if (to === n.status) return null;
    const from = n.status;
    n.status = to;
    B.stamp(n, from, S, day);
    return { from, to };
  };

  /* ================= 2. confession eligibility ================= */

  // newest sign of contact between this npc and the player: a DM either way, a like on a player post, a reply to a player post. -Infinity = none seen
  B.lastContact = function (npc, S, windowDays) {
    S = S || G.S;
    let last = -Infinity;
    const dms = S.dms && S.dms[npc.id];
    if (dms && dms.length) last = Math.max(last, dms[dms.length - 1].t || 0);
    const lim = S.clock - (windowDays || 10) * 1440;
    const ord = S.postOrder || [];
    for (let i = ord.length - 1, seen = 0; i >= 0 && seen < 250; i--, seen++) {
      const p = S.posts[ord[i]];
      if (!p) continue;
      if (p.t < lim) break;
      if (p.author === 'me' && p.likedBy && p.likedBy.includes(npc.id)) last = Math.max(last, p.t);
      else if (p.author === npc.id && p.replyTo && S.posts[p.replyTo] && S.posts[p.replyTo].author === 'me') last = Math.max(last, p.t);
    }
    return last;
  };
  B.contactDays = (npc, S) => {
    S = S || G.S;
    const l = B.lastContact(npc, S, 10);
    return l === -Infinity ? Infinity : Math.max(0, (S.clock - l) / 1440);
  };

  const partnerEdge = (S, id, except) => S.npcRel.find((x) => x !== except && COUPLE.includes(x.type) && (x.a === id || x.b === id)) || null;

  const CONF_OK = ['acquaintance', 'friend', 'close_friend', 'best_friend', 'admirer', 'crush', 'situationship'];
  // '' when this npc may confess feelings to the player now, else the reason why not
  B.confessionBlock = function (npc, S, o) {
    S = S || G.S;
    o = o || {};
    const day = o.day != null ? o.day : dayNow(S);
    if (!npc || npc.userAlt || npc.blocked) return 'unavailable';
    if (npc.age != null && npc.age < 18) return 'age';
    if (isFam(npc.status)) return 'family';
    if (npc.status === 'mentor' || npc.status === 'ally') return 'platonic role';
    if (COUPLE.includes(npc.status)) return 'already together';
    if (!CONF_OK.includes(npc.status)) return 'status';
    if (!(npc.rom > 0 || ROM.includes(npc.status))) return 'no romance';
    if (npc.aff < 25 || npc.trust < 15) return 'not close enough';
    const recent = o.interacted != null ? !!o.interacted : B.lastContact(npc, S, 6) >= S.clock - 5 * 1440;
    if (!recent) return 'no recent contact';
    if (npc.since && typeof npc.since.confess === 'number' && day - npc.since.confess < 30) return 'cooldown';
    if (partnerEdge(S, npc.id)) return 'partnered';
    return '';
  };
  B.confession = (npc, S, o) => B.confessionBlock(npc, S, o) === '';
  B.markConfession = function (npc, S, day) {
    npc.since = npc.since || {};
    npc.since.confess = day != null ? day : dayNow(S);
  };

  /* ================= 3. NPC <-> NPC edges ================= */

  const DEF_S = { partner: 0.85, dating: 0.7, best_friend: 0.8, friend: 0.5, family: 1, ally: 0.5, crush: 0.4, situationship: 0.5, ex: 0.3, frenemy: 0.4, rival: 0.45, enemy: 0.5 };
  const DECAY = { friend: 0.012, best_friend: 0.007, ally: 0.007, crush: 0.02, situationship: 0.02, ex: 0.012, frenemy: 0.015, rival: 0.01, enemy: 0.006, dating: 0.012, partner: 0.008 };
  const FADE = { friend: 0.08, best_friend: 0.05, ally: 0.06, crush: 0.06, situationship: 0.08, ex: 0.05, rival: 0.05 };
  B.DEF_S = DEF_S;
  const isFamEdge = (e) => e.type === 'family' || isFam(e.type);
  const isCouple = (e) => COUPLE.includes(e.type);
  B.strength = (e) => (typeof e.s === 'number' ? e.s : DEF_S[e.type] != null ? DEF_S[e.type] : 0.4);
  const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  function traits(S, id) {
    const n = S.npcs[id];
    try {
      const t = n && G.Persona.ensure(n).t;
      if (t) return t;
    } catch (e) {}
    return { A: 50, N: 50 };
  }
  const grudgeFor = (ag, ne, rnd) => r2(clamp(0.35 + 0.35 * (1 - ag) + 0.2 * ne + 0.25 * rnd(), 0, 1));

  // a mulberry32 stream for callers that pass no rnd (deterministic from a seed)
  B.rng = function (seed) {
    let a = (seed | 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const fallbackRnd = (S) => (G.World && G.World.rnd ? G.World.rnd : B.rng(((S && S.clock) | 0) + 17));

  function go(e, to, kind, day, extra) {
    const from = e.type;
    if (extra && extra.was) e.was = extra.was;
    e.type = to;
    e.d = day;
    if (extra && extra.g != null) e.g = r2(extra.g);
    return { kind, a: e.a, b: e.b, from, to, day };
  }

  // One day of life for one NPC<->NPC edge. Mutates the edge and returns an event {kind,a,b,from,to,day} or null.
  // kinds: fight, makeup, feud, breakup, newcouple, commit, cooling, fade. On 'fade' the edge is spent: remove it (dayStep does).
  // o.hold = update strength / grudge only (the day's drama budget is used up).
  B.edgeStep = function (S, e, day, rnd, o) {
    o = o || {};
    rnd = rnd || fallbackRnd(S);
    if (e.l === day) return null;
    e.l = day;
    const t = e.type;
    const fam = isFamEdge(e);
    const ties = S.sim && S.sim.ties ? S.sim.ties : null;
    const k = pkey(e.a, e.b);
    const ties0 = ties ? ties[k] || 0 : 0;
    const c = Math.min(1, ties0 / 5);
    if (ties && ties[k] != null) {
      const v = ties[k] * 0.92;
      if (v < 0.2) delete ties[k];
      else ties[k] = r2(v);
    }
    let s = B.strength(e);
    if (!fam) {
      s = clamp(s + 0.04 * c - (DECAY[t] != null ? DECAY[t] : 0.01) * (1 - c), 0, 1);
      e.s = r2(s);
    }
    if (typeof e.g === 'number') {
      e.g = r2(e.g - 0.02 - 0.03 * c);
      if (e.g <= 0) delete e.g;
    }
    if (o.hold) return null;
    const dd = typeof e.d === 'number' ? day - e.d : Infinity;
    const tr = [traits(S, e.a), traits(S, e.b)];
    const ag = (tr[0].A + tr[1].A) / 200;
    const ne = (tr[0].N + tr[1].N) / 200;
    const roll = rnd();
    const g = typeof e.g === 'number' ? e.g : 0;

    if (fam) {
      // blood stays blood: an estrangement is only a flag on the edge
      if (typeof e.estr === 'number') {
        if (day - e.estr >= 2 && roll < clamp(0.08 + 0.3 * ag - 0.2 * g, 0.02, 0.4)) {
          delete e.estr;
          e.g = r2(g * 0.4);
          return { kind: 'makeup', a: e.a, b: e.b, from: e.type, to: e.type, day };
        }
      } else if (roll < 0.002 + 0.005 * (1 - ag) + 0.002 * ne) {
        e.estr = day;
        e.g = grudgeFor(ag, ne, rnd);
        return { kind: 'fight', a: e.a, b: e.b, from: e.type, to: e.type, day };
      }
      return null;
    }

    const free = () => !partnerEdge(S, e.a, e) && !partnerEdge(S, e.b, e);
    let ev = null;
    if (t === 'dating' || t === 'partner') {
      const neglected = ties0 < 0.5 && s < 0.4;
      const p = (t === 'partner' ? 0.002 : 0.004) + 0.014 * (1 - ag) * (0.5 + ne) + (neglected ? 0.02 : 0);
      if (dd >= 3 && roll < p) ev = go(e, 'ex', 'breakup', day, { was: t, g: grudgeFor(ag, ne, rnd) });
      else if (t === 'dating' && dd >= 30 && s >= 0.7 && roll < p + 0.03) ev = go(e, 'partner', 'commit', day);
      if (ev && ev.kind === 'breakup') e.s = r2(Math.min(s, 0.4));
    } else if (t === 'crush') {
      const mutual = e.m !== 0 && s >= 0.5 && ties0 >= 2;
      const ok = free();
      if (ok && mutual && dd >= 5 && roll < 0.08 + 0.1 * s) ev = go(e, 'dating', 'newcouple', day, { was: 'crush' });
      else if (dd >= 10 && ((!ok && roll < 0.05) || (e.m === 0 && roll < 0.1) || (s < 0.4 && roll < 0.03))) ev = go(e, 'friend', 'cooling', day);
    } else if (t === 'situationship') {
      if (free() && s >= 0.55 && ties0 >= 1 && dd >= 7 && roll < 0.05) ev = go(e, 'dating', 'newcouple', day, { was: 'situationship' });
      else if (dd >= 10 && ties0 < 0.5 && roll < 0.04) ev = go(e, 'ex', 'breakup', day, { was: t, g: grudgeFor(ag, ne, rnd) * 0.6 });
    } else if (t === 'ex') {
      if (dd >= 7) {
        if (g < 0.25 && roll < 0.05 + 0.04 * ag) ev = go(e, 'friend', 'makeup', day);
        else if (g > 0.65 && roll < 0.03 + 0.03 * ne) ev = go(e, 'enemy', 'feud', day);
        else if (dd >= 45 && g < 0.5 && roll < 0.03) ev = go(e, 'friend', 'makeup', day);
        else if (dd >= 14 && g < 0.3 && s >= 0.45 && ties0 >= 3 && (e.was === 'dating' || e.was === 'partner') && free() && roll < 0.015) ev = go(e, e.was, 'newcouple', day);
        if (ev) delete e.was;
      }
    } else if (t === 'friend' || t === 'best_friend') {
      const pf = (t === 'best_friend' ? 0.6 : 1) * (0.005 + 0.012 * (1 - ag) + 0.006 * ne);
      if (dd >= 3 && roll < pf) ev = go(e, 'frenemy', 'fight', day, { was: t, g: grudgeFor(ag, ne, rnd) });
    } else if (t === 'frenemy') {
      // a fight lasts at least 2 days; the apology chance falls with the grudge and rises with how agreeable the pair is
      if (dd >= 2) {
        const pa = clamp(0.1 + 0.4 * ag - 0.3 * g + (dd >= 14 ? 0.1 : 0), 0.03, 0.5);
        if (roll < pa * (G.Chapters ? G.Chapters.perk('makeup') : 1)) {
          const back = e.was && ['friend', 'best_friend', 'ally'].includes(e.was) ? e.was : 'friend';
          ev = go(e, back, 'makeup', day);
          delete e.was;
          e.s = r2(Math.max(0.15, s - 0.08));
          e.g = r2(g * 0.4); // a scar is left
        } else if (dd >= 6 && g > 0.6 && roll > 0.97) {
          ev = go(e, 'enemy', 'feud', day);
          delete e.was;
        } else if (dd >= 30 && roll > 0.9) {
          ev = go(e, 'rival', 'cooling', day);
          delete e.was;
        }
      }
    } else if (t === 'rival') {
      if (dd >= 7 && ties0 >= 2 && roll < 0.004 + 0.016 * (1 - ag)) ev = go(e, 'enemy', 'feud', day);
      else if (dd >= 10 && ties0 >= 1 && roll > 1 - (0.004 + 0.02 * ag)) ev = go(e, 'frenemy', 'cooling', day, { was: 'friend', g: 0.2 });
    } else if (t === 'enemy') {
      if (dd >= 14 && ties0 < 1 && roll < 0.01 + 0.02 * ag) ev = go(e, 'rival', 'cooling', day);
      else if (s <= 0.12) ev = go(e, 'rival', 'cooling', day);
      if (ev) e.s = r2(Math.max(e.s, 0.3));
    }
    if (ev) return ev;
    if (FADE[t] != null && s <= FADE[t] && dd >= 5) {
      e.gone = 1;
      return { kind: 'fade', a: e.a, b: e.b, from: t, to: '', day };
    }
    return null;
  };

  // at most one dating/partner edge per person: the weakest extras become exes
  B.enforceSingle = function (S, day, events) {
    const by = {};
    S.npcRel.forEach((e) => {
      if (!isCouple(e)) return;
      (by[e.a] = by[e.a] || []).push(e);
      (by[e.b] = by[e.b] || []).push(e);
    });
    let n = 0;
    Object.keys(by).forEach((id) => {
      const list = by[id].filter((e) => isCouple(e));
      if (list.length < 2) return;
      list.sort((x, y) => B.strength(y) - B.strength(x) || (y.d || 0) - (x.d || 0));
      list.slice(1).forEach((e) => {
        if (!isCouple(e)) return;
        const ev = go(e, 'ex', 'breakup', day, { was: e.type, g: 0.6 });
        ev.reason = 'double';
        if (events) events.push(ev);
        n++;
      });
    });
    return n;
  };

  // add an edge; when the list is over `cap`, the weakest non-family, non-couple edges go first
  B.evict = function (S, cap) {
    cap = cap || 80;
    let n = 0;
    while (S.npcRel.length > cap) {
      let wi = -1;
      let ws = Infinity;
      S.npcRel.forEach((e, i) => {
        if (isFamEdge(e) || isCouple(e)) return;
        const s = B.strength(e);
        if (s < ws) {
          ws = s;
          wi = i;
        }
      });
      if (wi < 0) break;
      S.npcRel.splice(wi, 1);
      n++;
    }
    if (n && G.React) G.React.dirty = true;
    return n;
  };
  B.addEdge = function (S, a, b, type, note, day, cap) {
    if (!a || !b || a === b || !S.npcs[a] || !S.npcs[b]) return null;
    day = day != null ? day : dayNow(S);
    let e = S.npcRel.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (e) {
      if (type && type !== e.type) {
        if (COUPLE.includes(type) && partnerEdge(S, a, e) !== null) return e;
        if (COUPLE.includes(type) && partnerEdge(S, b, e) !== null) return e;
        e.type = type;
        e.d = day;
        delete e.was;
      }
      if (note) e.note = String(note).slice(0, 80);
      if (G.React) G.React.dirty = true;
      return e;
    }
    type = type || 'friend';
    if (COUPLE.includes(type) && (partnerEdge(S, a) || partnerEdge(S, b))) return null;
    e = { a, b, type, note: String(note || '').slice(0, 80), s: DEF_S[type] != null ? DEF_S[type] : 0.4, d: day };
    S.npcRel.push(e);
    B.evict(S, cap);
    if (G.React) G.React.dirty = true;
    return S.npcRel.includes(e) ? e : null;
  };

  const nameOf = (S, id) => (id === 'me' ? S.player.name : (S.npcs[id] || {}).name || 'Someone');
  const DESC = {
    breakup: ['{A} and {B} broke up', -0.8, true],
    fight: ['{A} and {B} had a falling out', -0.6, true],
    feud: ['{A} and {B} are enemies now', -0.7, false],
    makeup: ['{A} and {B} made up', 0.6, false],
    newcouple: ['{A} and {B} are now dating', 0.8, false],
    commit: ['{A} and {B} made it official', 0.5, false],
    betrayal: ['{A} betrayed {B}', -0.8, true],
    confession: ['{A} has developed feelings for {B}', 0.5, true],
    ghosting: ['{A} stopped replying to {B}', -0.3, false],
    cooling: ['{A} and {B} cooled off', 0.1, false],
  };
  // text / valence / notify for an event, ready for W.event(kind, [a, b], text, valence, { notify })
  B.describe = function (S, ev) {
    const d = DESC[ev.kind];
    if (!d) return null;
    return { text: d[0].replace('{A}', nameOf(S, ev.a)).replace('{B}', nameOf(S, ev.b)), valence: d[1], notify: d[2] };
  };

  // one day for the whole edge list. Returns { events, intents }. Event texts are attached (ev.text, ev.valence, ev.notify) so the caller can
  // log them with W.event(); consequences are applied here WITHOUT a chronicle line or notification unless o.chron / o.notify is true.
  B.dayStep = function (S, day, rnd, o) {
    o = o || {};
    rnd = rnd || fallbackRnd(S);
    const max = o.max != null ? o.max : 3;
    const out = { events: [], intents: [] };
    const list = [];
    const edges = S.npcRel;
    for (let i = edges.length - 1; i >= 0; i--) if (!S.npcs[edges[i].a] || !S.npcs[edges[i].b]) edges.splice(i, 1);
    B.enforceSingle(S, day, list);
    const n = edges.length;
    const start = n ? (day * 7) % n : 0;
    for (let i = 0; i < n; i++) {
      const e = edges[(start + i) % n];
      const ev = B.edgeStep(S, e, day, rnd, { hold: list.length >= max });
      if (ev) list.push(ev);
    }
    for (let i = edges.length - 1; i >= 0; i--) if (edges[i].gone) edges.splice(i, 1);
    if (list.length && G.React) G.React.dirty = true;
    list.forEach((ev) => {
      if (ev.kind === 'fade') return;
      const d = B.describe(S, ev);
      if (d) {
        ev.text = d.text;
        ev.valence = d.valence;
        ev.notify = d.notify;
      }
      out.events.push(ev);
      out.intents.push(...B.consequences(S, ev, rnd, { chron: !!o.chron, notify: !!o.notify, day }));
    });
    return out;
  };

  /* ================= 4. consequences ================= */

  // moods that last days: persona.moods = [{ v, t0, until, why }]. Hook for persona.js, one line at the end of Persona.decay(n, minutes):
  //     if (G.Bonds) G.Bonds.moodHold(n, minutes);
  B.addMood = function (n, dv, days, why, S) {
    if (!dv || !(days > 0)) return null;
    S = S || G.S;
    const p = G.Persona.ensure(n);
    const m = { v: r2(clamp(dv * (0.6 + p.t.N / 100), -0.9, 0.9)), t0: S.clock, until: S.clock + Math.round(days * 1440), why: String(why || 'event').slice(0, 16) };
    p.moods = p.moods || [];
    const i = p.moods.findIndex((x) => x.why === m.why);
    if (i >= 0) p.moods[i] = m;
    else p.moods.push(m);
    if (p.moods.length > 6) p.moods.shift();
    G.Persona.nudge(n, dv, 0.2);
    return m;
  };
  // keeps the mood pulled toward the active modifiers while Persona.decay relaxes it to baseline: the fixed point is baseline + modifier level
  B.moodHold = function (n, minutes) {
    const p = n && n.psy;
    if (!p || !p.moods || !p.moods.length) return;
    const now = G.S.clock;
    const k = Math.pow(0.5, minutes / (360 * (0.7 + p.t.N / 120)));
    let add = 0;
    for (let i = p.moods.length - 1; i >= 0; i--) {
      const m = p.moods[i];
      if (now >= m.until) p.moods.splice(i, 1);
      else add += (m.v * (m.until - now)) / Math.max(1, m.until - m.t0);
    }
    if (!p.moods.length) delete p.moods;
    p.mood.v = clamp(p.mood.v + add * (1 - k), -1, 1);
  };

  // data-driven: [initiator, other] pairs. grudge = grudge toward the other party (0..1), follow = chance to unfollow the other,
  // mood = [[dv, days], [dv, days]], rel = change in the NPC's bond with the PLAYER (only when the player is a party), dmFrom = who writes to the player
  const TABLE = {
    breakup: { grudge: [0.3, 0.5], follow: 0.85, mood: [[-0.3, 4], [-0.6, 7]], rel: { aff: -15, rom: -35, trust: -12 }, dmFrom: 0 },
    fight: { grudge: [0.35, 0.45], follow: 0.4, mood: [[-0.25, 2], [-0.35, 3]], rel: { aff: -10, trust: -5, riv: 6 }, dmFrom: 1 },
    feud: { grudge: [0.6, 0.6], follow: 0.95, mood: [[-0.35, 4], [-0.35, 4]], rel: { aff: -20, riv: 15, trust: -10 }, dmFrom: -1 },
    makeup: { soothe: 0.4, mood: [[0.25, 3], [0.25, 3]], rel: { aff: 8, trust: 4 }, dmFrom: 0 },
    betrayal: { grudge: [0, 0.9], follow: 1, mood: [[-0.1, 2], [-0.7, 10]], rel: { aff: -25, trust: -35, rom: -25 }, dmFrom: 1 },
    newcouple: { mood: [[0.4, 4], [0.4, 4]], dmFrom: -1 },
    commit: { mood: [[0.2, 2], [0.2, 2]], dmFrom: -1 },
    confession: { mood: [[0.15, 2], [0, 0]], dmFrom: 0 },
    ghosting: { grudge: [0, 0.25], mood: [[0, 0], [-0.25, 3]], rel: { aff: -6, trust: -6 }, dmFrom: 1 },
  };
  B.TABLE = TABLE;
  const DM = {
    breakup: ['i think we both saw this coming. take care of yourself.', 'i do not want to drag this out. it is over for me, and i hope you understand.', 'this is not working anymore. i am sorry it ended like this.'],
    fight: ['we need to talk about what happened. i am still upset.', 'honestly i am still angry about earlier.', 'that really hurt. i need some space.'],
    makeup: ['hey, i have been thinking. i am sorry about the fight.', 'can we leave that argument behind us? i miss normal.', 'i overreacted. are we okay?'],
    betrayal: ['i know what you did. i trusted you.', 'how could you do that to me? i thought we were better than this.', 'i do not even know what to say. you broke my trust.'],
    confession: ['i have been wanting to tell you something. i think i have feelings for you.', 'this is hard to say, but i like you. more than as a friend.', 'i keep thinking about you. i had to say it.'],
    ghosting: ['did i do something wrong? you have gone quiet on me.', 'hey. you have not answered in a while. are we okay?', 'i feel like you are avoiding me. can you tell me why?'],
  };
  B.DM = DM;

  // Apply an event: { kind, a, b, by?, rel?:false }. a / b are npc ids or 'me'. Returns DM intents [{ npc, reason, text }]; sends nothing.
  // a is the actor (betrayer, ghoster, confessor); for a breakup `by` (or a coin flip) says who ended it.
  // o.chron / o.notify = false suppress the chronicle line / the player notification (default true; dayStep turns them off).
  B.consequences = function (S, ev, rnd, o) {
    o = o || {};
    S = S || G.S;
    rnd = rnd || fallbackRnd(S);
    const row = TABLE[ev && ev.kind];
    const intents = [];
    if (!row || !ev.a) return intents;
    const day = o.day != null ? o.day : dayNow(S);
    const ids = [ev.a, ev.b].filter(Boolean);
    const me = ids.includes('me');
    const init = ev.kind === 'breakup' ? ev.by || (rnd() < 0.5 ? ev.a : ev.b) : ev.a;
    ids.forEach((id) => {
      const n = S.npcs[id];
      if (!n) return;
      const other = id === ev.a ? ev.b : ev.a;
      const k = id === init ? 0 : 1;
      const p = G.Persona.ensure(n);
      p.grudges = p.grudges || {};
      if (other && row.grudge && row.grudge[k] > 0) p.grudges[other] = r2(clamp(Math.max(p.grudges[other] || 0, row.grudge[k] * (0.8 + (0.4 * p.t.N) / 100)), 0, 1));
      if (other && row.soothe != null && p.grudges[other] != null) {
        p.grudges[other] = r2(p.grudges[other] * row.soothe);
        if (p.grudges[other] < 0.04) delete p.grudges[other];
      }
      if (other && row.follow && p.following && p.following.includes(other) && rnd() < row.follow) {
        p.following.splice(p.following.indexOf(other), 1);
        if (other === 'me') S.player.followers = Math.max(0, (S.player.followers || 0) - 1);
      }
      if (row.mood && row.mood[k] && row.mood[k][0]) B.addMood(n, row.mood[k][0], row.mood[k][1], ev.kind, S);
      if (me && other === 'me' && row.rel && ev.rel !== false) {
        const r = row.rel;
        if (r.aff) n.aff = clamp(n.aff + r.aff, -100, 100);
        if (r.rom && !isFam(n.status)) n.rom = clamp(n.rom + r.rom, 0, 100);
        if (r.riv) n.riv = clamp(n.riv + r.riv, 0, 100);
        if (r.trust) n.trust = clamp(n.trust + r.trust, 0, 100);
        B.settle(n, S, { day, force: true });
      }
      if (ev.kind === 'confession' && k === 0) B.markConfession(n, S, day);
      if (me && other === 'me' && row.dmFrom === k && DM[ev.kind] && !n.blocked && !n.userAlt) {
        const list = DM[ev.kind];
        intents.push({ npc: id, reason: 'bonds:' + ev.kind, text: list[Math.floor(rnd() * list.length) % list.length] });
      }
    });
    if (me) B.emit(ev.kind, ids.find((x) => x !== 'me'), { ev });
    const d = B.describe(S, ev);
    if (d && E) {
      if (o.chron !== false) E.addChron(d.text);
      if (me && o.notify !== false) {
        const npcId = ids.find((x) => x !== 'me');
        E.addNotif('drama', d.text, npcId ? { npcId } : {});
      }
    }
    return intents;
  };

  // The player is romantically involved with an NPC who is partnered with another NPC: cool the romance (daily) and maybe voice jealousy.
  // Returns { cooled, intent, betrayal }. intent = { npc, reason: 'jealousy', text } (at most once per 14 days). betrayal = the NPC is the player's own
  // dating/partner: the caller may fire consequences({ kind: 'betrayal', a: npc.id, b: 'me' }).
  B.partnerEffects = function (S, npc, rnd, day) {
    S = S || G.S;
    const res = { cooled: 0, intent: null, betrayal: false };
    if (!npc || npc.userAlt || npc.blocked || isFam(npc.status)) return res;
    if (!(ROM.includes(npc.status) || npc.rom >= 25)) return res;
    const e = partnerEdge(S, npc.id);
    if (!e) return res;
    const other = S.npcs[e.a === npc.id ? e.b : e.a];
    if (!other) return res;
    rnd = rnd || fallbackRnd(S);
    day = day != null ? day : dayNow(S);
    const couple = COUPLE.includes(npc.status);
    const dr = Math.min(npc.rom, couple ? 3 : 2);
    npc.rom -= dr;
    res.cooled = dr;
    if (couple) {
      npc.trust = clamp(npc.trust - 2, 0, 100);
      npc.aff = clamp(npc.aff - 1, -100, 100);
      res.betrayal = true;
    }
    if (!npc.since || typeof npc.since.jeal !== 'number' || day - npc.since.jeal >= 14) {
      npc.since = npc.since || {};
      npc.since.jeal = day;
      const o1 = String(other.name).split(' ')[0];
      const texts = couple
        ? ['we need to talk. i have been seeing ' + o1 + ' and i have not been fair to you.', 'i have to be honest: there is someone else, ' + o1 + ', and it is getting serious.']
        : ['i have to be honest, ' + o1 + ' is not happy about how close we are. can we keep things lighter for a while?', o1 + ' and i are together now, so i should step back from this. i hope you understand.'];
      res.intent = { npc: npc.id, reason: 'jealousy', text: texts[Math.floor(rnd() * texts.length) % texts.length] };
    }
    return res;
  };

  /* ================= 5. follows and neglect ================= */

  // 'follow' | 'unfollow' | 'keep' (keep = change nothing). Closeness-driven: nobody follows strangers on a whim, and people drop the ones they fell out with.
  B.followDecision = function (S, npc, targetId, rnd) {
    S = S || G.S;
    rnd = rnd || fallbackRnd(S);
    const p = G.Persona.ensure(npc);
    const fol = p.following || [];
    const has = fol.includes(targetId);
    const r = G.React && G.React.relation ? G.React.relation(S, npc, targetId) : { c: 0.1, h: 0, grudge: 0, status: 'stranger' };
    const cap = Math.round(6 + (14 * p.t.E) / 100); // attention is limited
    if (has) {
      if (isFam(r.status) && !npc.estranged) return 'keep';
      let pu = 0;
      if (r.h >= 0.6) pu = 0.8;
      else if (r.grudge >= 0.5) pu = 0.7;
      else if (r.h >= 0.45) pu = 0.25;
      else if (r.c < 0.14 && fol.length > cap) pu = 0.12;
      return pu && rnd() < pu ? 'unfollow' : 'keep';
    }
    if (r.h >= 0.35 || r.grudge >= 0.25 || HOST.includes(r.status)) return 'keep';
    let pf = clamp((r.c - 0.25) * 0.9, 0, 0.55);
    if (fol.length >= cap) pf *= 0.15;
    return pf > 0 && rnd() < pf ? 'follow' : 'keep';
  };

  // [aff floor it never drops below, aff lost per day of silence once past the grace, grace days]. Family / mentor / ally are exempt or nearly so.
  const NEG = {
    best_friend: [45, 0.1, 7], close_friend: [30, 0.15, 6], friend: [14, 0.22, 5], acquaintance: [4, 0.12, 4], crush: [18, 0.3, 4], admirer: [14, 0.3, 4],
    situationship: [14, 0.35, 3], dating: [30, 0.3, 3], partner: [42, 0.2, 5], ex: [-5, 0.1, 5], stan: [10, 0.1, 10], ally: [20, 0.02, 14], mentor: [25, 0.02, 21],
  };
  // How much affection to take away for ONE more day, given `days` in a row without contact. 0 for family, hostile bonds and anything at its floor.
  B.neglect = function (npc, status, days) {
    if (isFam(status) || isFam(npc.status)) return 0;
    const row = NEG[status];
    if (!row || !(days > row[2])) return 0;
    const room = npc.aff - row[0];
    if (room <= 0) return 0;
    return r2(Math.min(room, row[1] * (1 + Math.min(1, (days - row[2]) / 30))));
  };
  // all three meters for a day of silence: { aff, rom, riv } as negative numbers (or 0). Romance and rivalry cool too, rivals and enemies slowly.
  B.drift = function (npc, status, days) {
    const out = { aff: -B.neglect(npc, status, days), rom: 0, riv: 0 };
    if (isFam(status) || isFam(npc.status)) return out;
    if (ROM.includes(status) && days > (COUPLE.includes(status) ? 5 : 7)) out.rom = -Math.min(npc.rom, COUPLE.includes(status) ? 0.15 : 0.25);
    else if (!ROM.includes(status) && npc.rom > 0 && days > 3) out.rom = -Math.min(npc.rom, 0.1);
    if (npc.riv > 0 && days > 5) out.riv = -Math.min(npc.riv, status === 'nemesis' ? 0.05 : 0.15);
    out.rom = r2(out.rom);
    out.riv = r2(out.riv);
    return out;
  };
})(window.G);
