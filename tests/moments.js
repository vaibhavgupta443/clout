// Relationship milestone moments (js/moments.js): a stage change / confession / makeup / breakup / betrayal queues exactly ONE 3-card moment,
// the same milestone never replays, the queue is capped at 3, choices nudge the bond within Engine.vetRel clamps, played moments are kept for replay.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const DAY = 1440;
const B = () => G.Bonds;

function world(n) {
  E.createBlankWorld({ name: 'Sam Rivers', handle: '@sam', fame: 'rising', premise: 'moments' });
  const S = G.S;
  G.World.setSeed(5);
  G.World.ensure(S);
  S.popSize = 0;
  S.clock = 30 * DAY;
  S.npcRel = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = E.makeNpc({ name: 'Npc' + i + ' Surname', handle: '@npc' + i, role: 'friend', age: 25 + i, personality: ['kind, warm', 'formal, polite', 'cold, sarcastic', 'bubbly, flirty'][i % 4], followers: 500, aff: 40, status: 'friend' });
    x.trust = 40;
    out.push(x);
  }
  return { S, npcs: out };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const close = (S, n) => { n.aff = 85; n.trust = 80; n.rom = 0; n.riv = 0; n.status = 'friend'; n.since = { friend: 1 }; return B().settle(n, S, { force: true }); };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const M = G.Moments;

  {
    const { S } = world(1);
    check('no moment keys before anything happens', !('momentQ' in S) && !('moments' in S) && M.queue().length === 0 && M.list().length === 0);
  }

  const { S, npcs } = world(8);
  const [n0, n1, n2, n3, n4, n5, n6] = npcs;

  /* ---- a first close friend: exactly one moment ---- */
  const ch = close(S, n0);
  check('the bond really moved to a close stage', !!ch && ['close_friend', 'best_friend'].includes(n0.status), JSON.stringify(ch));
  await flush();
  check('exactly one moment is queued', M.queue().length === 1 && M.queue()[0].kind === 'close' && M.queue()[0].npc === n0.id);
  const e0 = M.queue()[0];
  check('their line is real text in their voice (no unfilled slots)', typeof e0.line === 'string' && e0.line.length > 10 && !/[{}]/.test(e0.line), e0.line);
  check('a notification points at the moment', S.notifs.some((n) => n.act === 'momentPlay' && n.data.id === e0.id));

  /* ---- dedupe ---- */
  n0.status = 'friend'; n0.since = { friend: 1 };
  B().settle(n0, S, { force: true });
  await flush();
  check('the same milestone never replays (still one)', M.queue().length === 1 && M.list().length === 0);

  /* ---- confession, makeup, breakup, betrayal ---- */
  B().consequences(S, { kind: 'confession', a: n1.id, b: 'me' }, G.Bonds.rng(1), {});
  await flush();
  check('a confession queues a confession moment', M.queue().some((x) => x.npc === n1.id && x.kind === 'confession'));
  B().consequences(S, { kind: 'makeup', a: n2.id, b: 'me' }, G.Bonds.rng(2), {});
  await flush();
  check('queue is capped at 3', M.queue().length <= 3, String(M.queue().length));

  // a betrayal that also ends a romance is ONE moment, and the more specific one
  const before = M.queue().length + M.list().length;
  n3.status = 'dating'; n3.rom = 80; n3.aff = 70; n3.trust = 70; n3.since = { dating: 1 };
  B().consequences(S, { kind: 'betrayal', a: n3.id, b: 'me' }, G.Bonds.rng(3), {});
  await flush();
  const forN3 = M.queue().concat(M.list()).filter((x) => x.npc === n3.id);
  check('betrayal plus the collapse of the romance gives exactly one moment (betrayal)', forN3.length === 1 && forN3[0].kind === 'betrayal', JSON.stringify(forN3.map((x) => x.kind)));
  check('queue still capped; oldest dropped', M.queue().length === 3 && before >= 3 || M.queue().length <= 3);
  n4.status = 'dating'; n4.rom = 80; n4.aff = 70; n4.trust = 70; n4.since = { dating: 1 };
  B().consequences(S, { kind: 'breakup', a: n4.id, b: 'me', by: n4.id }, G.Bonds.rng(4), {});
  await flush();
  check('a breakup queues one breakup moment', M.queue().concat(M.list()).filter((x) => x.npc === n4.id).length === 1 && M.queue().concat(M.list()).find((x) => x.npc === n4.id).kind === 'breakup');
  B().consequences(S, { kind: 'breakup', a: n4.id, b: 'me', by: n4.id }, G.Bonds.rng(4), {});
  await flush();
  check('the same breakup does not queue again', M.queue().concat(M.list()).filter((x) => x.npc === n4.id).length === 1);
  check('two NPCs together (no player) never make a moment', (() => { const k = M.queue().length; B().consequences(S, { kind: 'breakup', a: n5.id, b: n6.id }, G.Bonds.rng(5), {}); return k === M.queue().length; })());

  /* ---- play and choose ---- */
  const target = M.queue()[M.queue().length - 1];
  const tn = S.npcs[target.npc];
  const snap = { aff: tn.aff, trust: tn.trust, rom: tn.rom };
  check('the cards render (their line, then choices)', (() => { M.play(target.id, false); const h1 = w.document.querySelector('#modal-root').innerHTML; G.UI.acts.momentNext(); const h2 = w.document.querySelector('#modal-root').innerHTML; return h1.includes(target.line.slice(0, 12).replace(/&/g, '&amp;')) && (h2.match(/data-act="momentPick"/g) || []).length >= 2; })());
  const memBefore = (tn.mem || []).length;
  const done = M.pick(target.id, 0);
  check('picking stores the moment (id,t,npc,kind,line,pick) and leaves the queue', !!done && done.pick === 0 && M.list().length === 1 && !M.queue().some((x) => x.id === target.id) && ['id', 't', 'npc', 'kind', 'line', 'pick'].every((k) => k in M.list()[0]));
  check('the choice nudges the bond within the vetRel clamps', Math.abs(tn.aff - snap.aff) <= E.REL_STEP.aff && Math.abs(tn.trust - snap.trust) <= E.REL_STEP.trust && Math.abs(tn.rom - snap.rom) <= E.REL_STEP.rom, JSON.stringify([tn.aff - snap.aff, tn.trust - snap.trust, tn.rom - snap.rom]));
  check('the character remembers the moment', (tn.mem || []).length > memBefore || (tn.mem || []).some((m) => /with Sam/.test(m.text)));
  check('picking twice is ignored', M.pick(target.id, 1) === null && M.list().length === 1);
  const aff1 = tn.aff;
  M.play(done.id, true);
  const rp = w.document.querySelector('#modal-root').innerHTML;
  G.UI.acts.momentNext(); G.UI.acts.momentNext();
  check('replay shows the stored line and changes nothing', rp.includes('Replay') && tn.aff === aff1 && M.list().length === 1);
  check('the Profile page lists the replay', /Moments/.test(G.Pages.me()) && /data-act="momentReplay"/.test(G.Pages.me()));

  /* ---- AI path: a stage change made by Engine.applyRel is heard ---- */
  const nz = E.makeNpc({ name: 'Zed Late', handle: '@zed', role: 'friend', age: 30, personality: 'kind', followers: 10, aff: 40, status: 'friend' });
  nz.aff = 78; nz.trust = 70;
  E.applyRel(nz, { aff: 0, status: 'best_friend' });
  await flush();
  check('a stage change from the AI path queues a moment too', M.queue().some((x) => x.npc === nz.id && x.kind === 'close'));

  /* ---- history cap and round trip ---- */
  for (let i = 0; i < 40; i++) { S.moments.push({ id: 'x' + i, t: i, npc: n0.id, kind: 'makeup', line: 'l', pick: 0 }); }
  const k = E.makeNpc({ name: 'Last One', handle: '@last', role: 'friend', age: 30, personality: 'kind', followers: 10, aff: 40, status: 'friend' });
  close(S, k);
  await flush();
  const q = M.queue().find((x) => x.npc === k.id);
  M.pick(q.id, 1);
  check('played moments are capped at 30', S.moments.length <= 30, String(S.moments.length));
  check('moment state survives a save round trip identically', JSON.stringify(JSON.parse(JSON.stringify([S.moments, S.momentQ]))) === JSON.stringify([S.moments, S.momentQ]) && !JSON.stringify([S.moments, S.momentQ]).includes(':null'));
  check('no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));

  H.summary('MOMENTS: relationship milestone moments');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
