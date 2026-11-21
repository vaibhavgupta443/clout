// Outings with real times (js/plans.js): a clique proposes "Fri 7pm, rooftop", it becomes an appointment with RSVPs, the scene resolves
// from the real relationships, going stores ONE shared memory for everyone there, skipping costs a small bounded dip plus a "you missed it" line,
// the clock holds at the moment like any confirmed meeting. Deterministic, zero API calls.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const DAY = 1440;

function world() {
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'plans' });
  const S = G.S;
  G.World.setSeed(3);
  G.World.ensure(S);
  S.popSize = 0;
  S.clock = 20 * DAY + 10 * 60;
  S.npcRel = [];
  const mk = (i, nm, per) => {
    const n = E.makeNpc({ name: nm, handle: '@' + nm.split(' ')[0].toLowerCase(), role: 'friend', age: 25, personality: per, followers: 900, aff: 60, status: 'friend' });
    n.aff = 60; n.trust = 55; n.status = 'friend';
    return n;
  };
  const a = mk(0, 'Ava Stone', 'kind, warm, supportive');
  const b = mk(1, 'Ben Park', 'chill, laid-back, funny');
  const c = mk(2, 'Cy Moreno', 'calm, disciplined, formal');
  S.npcRel.push({ a: a.id, b: b.id, type: 'friend' }, { a: b.id, b: c.id, type: 'rival' });
  return { S, a, b, c };
}
const memOf = (n, rx) => (n.mem || []).filter((m) => rx.test(m.text));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const P = G.Plans;
  const yes = (ids) => Object.fromEntries(ids.map((i) => [i, 'yes']));

  /* ---- nothing exists until something real happens ---- */
  {
    const { S } = world();
    check('no plans key before any proposal', !('plans' in S) && P.list().length === 0);
    E.tick(120);
    check('a quiet tick with no reason writes no plans key', !('plans' in S));
  }

  /* ---- a proposal needs a real reason, and shows up in the DM ---- */
  const { S, a, b, c } = world();
  G.Persona.ensure(a).mood.v = 0.6; // good mood
  const p0 = P.consider({ force: true, chance: 1 });
  check('a good mood leads to a proposal', !!p0 && p0.host === a.id && p0.why === 'mood', JSON.stringify(p0));
  check('the proposal is in the host DM, carries the plan id and names a day/time', !!p0 && (S.dms[a.id] || []).some((m) => m.plan === p0.id && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/.test(m.text)));
  check('the invitation line is in the thread (it names the place)', !!p0 && (S.dms[a.id] || []).some((m) => m.plan === p0.id && m.text.toLowerCase().includes(p0.place.toLowerCase())));
  check('a plan holds an appointment with the host', !!p0 && !!G.Clock.appts().find((x) => x.id === p0.ap && x.npc === a.id));
  check('a second proposal does not pile up while one is open', P.consider({ force: true, chance: 1 }) === null);
  P.finish(P.get(p0.id), 'unanswered');
  check('at most one proposal per 3 game days', P.consider({ force: true, chance: 1 }) === null);
  S.clock += 3 * DAY + 60;
  check('three game days later a new one may come', !!P.consider({ force: true, chance: 1 }));
  G.Persona.ensure(a).mood.v = 0;
  check('the Messages page shows the plan card with RSVP chips', (() => { G.UI.dmWith = a.id; G.UI.page = 'messages'; const html = G.Pages.messages(); G.UI.dmWith = null; return /plancard/.test(html) && /data-act="planRsvp"/.test(html); })());

  /* ---- 7pm, going: the clock holds, one shared memory ---- */
  S.plans.forEach((p) => { if (p.status === 'open') P.finish(p, 'unanswered'); });
  const day = Math.floor(S.clock / DAY);
  const at = (day + 1) * DAY + 19 * 60;
  const p1 = P.propose(a.id, { at, place: 'rooftop', via: 'dm', who: [b.id, c.id], rsvp: yes([b.id, c.id]), why: 'mood' });
  check('plan at 7pm is made', !!p1 && /7pm/.test(P.when(at)));
  P.rsvp(p1.id, 'yes');
  check('saying yes confirms the appointment', G.Clock.appts().find((x) => x.id === p1.ap).status === 'confirmed' && P.get(p1.id).status === 'set');
  E.tick(3 * DAY);
  check('time stops exactly at 7pm (a confirmed meeting holds)', S.clock === at, S.clock + ' vs ' + at);
  check('the clock is held for the plan', G.Clock.blocked() && S.clockHold === p1.ap);
  check('the plan is not resolved until you decide', P.get(p1.id).status === 'set');
  const before = { a: a.aff, b: b.aff, c: c.aff };
  const out = P.attend(p1.id);
  check('attending resolves with a short scene (2-3 lines)', !!out && out.scene.length >= 2 && out.scene.length <= 3 && P.get(p1.id).status === 'done');
  check('the tense pair (Ben/Cy rivals) shows in the scene', out.scene.join(' ').includes('distance'));
  check('the hold is released', !S.clockHold && !G.Clock.blocked());
  const texts = [a, b, c].map((n) => memOf(n, /We all went out/)[0]);
  check('every attendee stored the SAME memory', texts.every(Boolean) && texts[0].text === texts[1].text && texts[1].text === texts[2].text, JSON.stringify(texts.map((x) => x && x.text)));
  check('going grows closeness a little, bounded (+2 aff each)', a.aff - before.a === 2 && b.aff - before.b === 2 && c.aff - before.c === 2, [a.aff - before.a, b.aff - before.b, c.aff - before.c].join(','));

  /* ---- skipping: bounded dip and "you missed it" ---- */
  S.clock = (day + 5) * DAY + 8 * 60;
  const at2 = S.clock + 12 * 60;
  const p2 = P.propose(a.id, { at: at2, place: 'arcade', via: 'dm', who: [b.id], rsvp: yes([b.id]) });
  P.rsvp(p2.id, 'yes');
  E.tick(DAY);
  check('time stops at the second plan too', S.clock === at2);
  const b2 = { a: a.aff, b: b.aff };
  const lastBefore = (S.dms[a.id] || []).length;
  P.skip(p2.id);
  const q2 = P.get(p2.id);
  check('skipping marks it missed with a line', q2.status === 'missed' && q2.out && q2.out.line.length > 3);
  check('the host dips by 3 and the others by 1 (bounded)', a.aff - b2.a === -3 && b.aff - b2.b === -1, (a.aff - b2.a) + ',' + (b.aff - b2.b));
  const last = (S.dms[a.id] || []).slice(-1)[0];
  check('the host says "you missed it" in the thread', (S.dms[a.id] || []).length === lastBefore + 1 && last.text === q2.out.line && last.from === a.id);
  check('the host remembers you did not come', memOf(a, /did not come to arcade/).length === 1);
  check('the hold is gone after skipping', !S.clockHold);

  /* ---- said no / never answered ---- */
  S.clock = (day + 9) * DAY + 8 * 60;
  const at3 = S.clock + 6 * 60;
  const p3 = P.propose(b.id, { at: at3, place: 'park', via: 'dm', who: [a.id], rsvp: yes([a.id]) });
  P.rsvp(p3.id, 'no');
  E.tick(8 * 60);
  check('saying no resolves as declined, no hold', P.get(p3.id).status === 'declined' && !S.clockHold);
  const at4 = S.clock + 3 * 60;
  const p4 = P.propose(b.id, { at: at4, place: 'pier', via: 'dm', who: [a.id], rsvp: yes([a.id]) });
  E.tick(5 * 60);
  check('never answering lapses quietly', P.get(p4.id).status === 'missed' && P.get(p4.id).out.kind === 'unanswered');
  check('rsvp after the time is refused', P.rsvp(p4.id, 'yes') === null);

  /* ---- group chat ---- */
  const g = E.createGroup('The crew', [a.id, b.id, c.id]);
  S.clock += 4 * DAY;
  const p5 = P.propose(c.id, { at: S.clock + 30 * 60, place: 'lake', via: g.id, who: [a.id, b.id], rsvp: yes([a.id, b.id]) });
  check('a group proposal lands in the group chat', !!p5 && g.msgs.some((m) => m.plan === p5.id && m.from === c.id));
  check('group plan card shows in the group thread', (() => { G.UI.groupWith = g.id; G.UI.dmWith = null; const html = G.Pages.messages(); G.UI.groupWith = null; return /plancard/.test(html); })());
  check('the proposal shows in Alerts', S.notifs.some((n) => n.act === 'planOpen' && n.data && n.data.id === p5.id));

  /* ---- caps, clock-window path, save round trip ---- */
  for (let i = 0; i < 16; i++) { S.clock += 30; P.propose(a.id, { at: S.clock + 2000 + i, place: 'p' + i, via: 'dm', who: [b.id] }); }
  check('plans stay capped at 12', S.plans.length <= 12, String(S.plans.length));
  const rt = JSON.parse(JSON.stringify(S.plans));
  check('plans survive a save round trip identically', JSON.stringify(rt) === JSON.stringify(S.plans));
  check('no null values in plans', !JSON.stringify(S.plans).includes(':null'));
  check('no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));

  H.summary('PLANS: outings with real times');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
