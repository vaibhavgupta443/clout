/* Clout — what people WANT (daily goals) and what they have REALISED (reflections).
   From the Generative Agents line of work: believable characters plan (a goal for today, drawn from their relationships, the storylines they are in and
   their own nature) and reflect (turn many small memories into a few higher-level beliefs, written down as memories of their own). Both are free
   (no AI); "/reflect Name" asks the AI for richer reflections on demand, shown for approval first.
   Stable identity (card, traits, speech) stays separate from changing state (mood, goal, what they remember): the prompt gets each in its own line,
   which is what keeps long roleplay from drifting. */
(function (G) {
  'use strict';
  const U = G.U;
  const Goals = (G.Goals = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const first = (s) => String(s || '').split(' ')[0];

  // what this person would want today, most pressing first
  Goals.candidates = function (n) {
    const S = G.S;
    const me = S.player.name;
    const out = [];
    const p = G.Persona ? G.Persona.ensure(n) : { t: { O: 50, C: 50, N: 50 }, grudges: {} };
    const st = n.status;
    // somebody close, after the player's heavy post: first thing on their mind is to check on them (the DM itself comes from Reasons 'checkin' / World.planCare)
    if (G.Reasons && G.Reasons.delicatePost && n.aff > 40 && !['rival', 'enemy', 'nemesis', 'frenemy'].includes(st)) {
      const dp = G.Reasons.delicatePost(S.clock);
      if (dp && !(dp.care && dp.care[n.id] & 2)) out.push({ kind: 'player', who: ['me'], text: `check on ${me}` });
    }
    if (['crush', 'admirer', 'situationship', 'dating', 'partner'].includes(st) && n.rom > 30) out.push({ kind: 'player', who: ['me'], text: st === 'dating' || st === 'partner' ? `spend time with ${me}` : `get closer to ${me}` });
    if (st === 'ex' && n.rom > 15) out.push({ kind: 'player', who: ['me'], text: `work out where things really stand with ${me}` });
    if (['rival', 'enemy', 'nemesis'].includes(st) && n.riv > 30) out.push({ kind: 'player', who: ['me'], text: `get one over on ${me}` });
    if ((p.grudges && p.grudges.me > 0.4) || (n.aff < -25 && n.trust < 20)) out.push({ kind: 'player', who: ['me'], text: `get an honest apology from ${me}` });
    if (n.aff > 55 && ['friend', 'close_friend', 'best_friend', 'ally'].includes(st)) out.push({ kind: 'player', who: ['me'], text: `catch up with ${me}` });
    (S.npcRel || []).filter((r) => (r.a === n.id || r.b === n.id) && S.npcs[r.a] && S.npcs[r.b]).forEach((r) => {
      const o = S.npcs[r.a === n.id ? r.b : r.a];
      if (!o || o.userAlt || o.blocked) return;
      if (r.type === 'rival') out.push({ kind: 'npc', who: [o.id], text: `outdo ${first(o.name)}` });
      else if (r.type === 'enemy') out.push({ kind: 'npc', who: [o.id], text: `confront ${first(o.name)}` });
      else if (r.type === 'ex') out.push({ kind: 'npc', who: [o.id], text: `avoid ${first(o.name)} (or win them back)` });
      else if (['crush', 'dating', 'situationship'].includes(r.type)) out.push({ kind: 'npc', who: [o.id], text: `spend time with ${first(o.name)}` });
    });
    (S.storylines || []).filter((x) => x.status !== 'resolved' && (x.participants || []).includes(n.id)).slice(-2).forEach((x) => out.push({ kind: 'plot', who: (x.participants || []).filter((id) => id !== n.id).slice(0, 2), text: `see "${clip(x.title, 50)}" through` }));
    if (p.t.C > 70) out.push({ kind: 'self', who: [], text: 'make real progress on their own work' });
    if (p.t.O > 70) out.push({ kind: 'self', who: [], text: 'try something new today' });
    if (p.t.N > 70) out.push({ kind: 'self', who: [], text: 'stay out of drama and calm down' });
    return out;
  };
  Goals.assign = function (n, t) {
    const c = Goals.candidates(n);
    if (!c.length) { delete n.goal; return null; }
    const day = U.dayOf(t != null ? t : G.S.clock);
    const g = c[(day + hash(n.id)) % Math.min(2, c.length)]; // the most pressing, or the runner-up on some days: people are not robots
    n.goal = { text: g.text, kind: g.kind, who: g.who, t: day };
    return n.goal;
  };
  // Turn a small number of yesterday's intentions into simulated activity. NPCs do not
  // publish posts or stories here: social goals strengthen existing ties, plot goals
  // move an existing storyline, and self goals have a small mood effect.
  Goals.act = function (n, goal, day) {
    const S = G.S;
    if (!S || !S.sim || !n || !goal || goal.t >= day || goal.actionDay === day) return null;
    if (S.sim.goalActionDay !== day) { S.sim.goalActionDay = day; S.sim.goalActionCount = 0; }
    if ((S.sim.goalActionCount || 0) >= 3) return null;
    let action = null;
    if (goal.kind === 'npc') {
      const targetId = (goal.who || []).find((id) => id !== n.id && S.npcs[id]);
      const target = targetId && S.npcs[targetId];
      const edge = target && (S.npcRel || []).find((e) => (e.a === n.id && e.b === targetId) || (e.b === n.id && e.a === targetId));
      if (edge) {
        S.sim.ties = S.sim.ties || {};
        const key = n.id < targetId ? n.id + '|' + targetId : targetId + '|' + n.id;
        S.sim.ties[key] = Math.min(20, (S.sim.ties[key] || 0) + 1);
        action = { kind: 'npc', target, edge };
      }
    } else if (goal.kind === 'plot') {
      const story = (S.storylines || []).find((x) => x.status !== 'resolved' && (x.participants || []).includes(n.id) && (goal.who || []).every((id) => (x.participants || []).includes(id)));
      if (story && story.goalActionDay !== day) {
        story.goalActionDay = day;
        story.heat = Math.min(100, (story.heat || 0) + 3);
        story.updated = S.clock;
        story.log = Array.isArray(story.log) ? story.log : [];
        const line = `${n.name} made a move in “${clip(story.title, 50)}”`;
        story.log.push({ t: S.clock, text: line });
        if (story.log.length > 30) story.log.shift();
        action = { kind: 'plot', story, line };
      }
    } else if (goal.kind === 'self') {
      if (G.Persona && G.Persona.nudge) {
        const settle = /stay out of drama|calm down/i.test(goal.text);
        G.Persona.nudge(n, settle ? -0.025 : 0.025, 0.05);
        action = { kind: 'self' };
      }
    }
    if (!action) return null;
    goal.actionDay = day;
    S.sim.goalActionCount = (S.sim.goalActionCount || 0) + 1;
    if (action.kind === 'npc' && G.World && G.World.event) {
      G.World.event('event', [n.id, action.target.id], `${n.name} followed through on a plan to ${goal.text}`, 0.03, { rumor: false, imp: 3 });
    } else if (action.kind === 'plot' && G.World && G.World.event) {
      G.World.event('event', (action.story.participants || []).slice(0, 3), action.line, 0.03, { rumor: false, imp: 4 });
    }
    return action;
  };
  // once per game day, for the people who matter lately
  Goals.step = function (t) {
    const S = G.S;
    let n = 0;
    const day = U.dayOf(t);
    Object.values(S.npcs).filter((x) => !x.userAlt && !x.blocked).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 80).forEach((x) => {
      if (x.goal && x.goal.t < day) Goals.act(x, x.goal, day);
      if (Goals.assign(x, t)) n++;
    });
    return n;
  };
  Goals.line = (n) => (n && n.goal && n.goal.text ? `wants to ${n.goal.text}` : '');

  // written reflections: what a pattern of memories has made someone realise
  Goals.reflectText = function (npc, id, v) {
    const S = G.S;
    const name = id === 'me' ? S.player.name : (S.npcs[id] || {}).name || 'them';
    if (v < 0) return id === 'me' ? `I have realised ${name} keeps letting me down` : `I have realised I cannot trust ${name}`;
    return id === 'me' ? `I trust ${name}: they have been good to me` : `${name} has been good to me, I can rely on them`;
  };
})(window.G);
