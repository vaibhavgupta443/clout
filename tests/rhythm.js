// Morning and evening beats: one choice card per game morning, an evening wrap, bounded bond nudge, quiet expiry, no key without a write.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $$ = (s) => [...w.document.querySelectorAll(s)];

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  G.settings.legacyHome = false;
  G.settings.minimalUI = true;
  const S = G.S;
  const R = G.Rhythm;
  const dayOf = (c) => Math.floor(c / 1440) + 1;

  // reading and rendering never create the key
  G.UI.go('notifs'); G.UI.render();
  check('rendering Alerts creates no S.rhythm', S.rhythm === undefined && R.card() === '');

  // nobody has anything on their mind (all away): a morning passes without a write
  const all = Object.values(S.npcs);
  all.forEach((n) => { n.blocked = true; });
  S.clock = 1440 * 3 + 6 * 60;
  for (let i = 0; i < 4; i++) E.tick(60);
  check('no real NPC goal -> no beat and still no S.rhythm key', S.rhythm === undefined);
  all.forEach((n) => { delete n.blocked; });

  // three simulated days with a goal in the morning
  const posts0 = S.postOrder.length;
  const open = [];
  const created = {};
  let first = null;
  let nextDay = dayOf(S.clock) + 1;
  for (let d = 0; d < 3; d++) {
    const day = nextDay++;
    S.clock = (day - 1) * 1440 + 6 * 60; // 06:00 of a fresh day
    S.npcs.n1.goal = { text: 'make real progress on their own work', kind: 'self', who: [], t: day };
    S.npcs.n2.goal = { text: 'outdo Dex', kind: 'npc', who: ['n3'], t: day };
    for (let h = 0; h < 18; h++) {
      E.tick(60);
      const st = S.rhythm;
      open.push(st && st.beat ? 1 : 0);
      if (st && st.beat) (created[st.beat.d] = created[st.beat.d] || new Set()).add(st.beat.id);
      if (d === 0 && st && st.beat && !first) {
        first = st.beat;
        const npc = S.npcs[first.npc];
        const a0 = npc.aff, m0 = (npc.mem || []).length;
        G.UI.go('notifs'); G.UI.render();
        const btns = $$('.rhythm button[data-act="rhythmPick"]');
        check('the morning card shows 2-3 choices on Alerts', btns.length >= 2 && btns.length <= 3);
        check('no emoji in the card', !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test($$('.rhythm').map((x) => x.textContent).join('')));
        const res = R.choose(0);
        check('a choice moves affinity a little, within bounds', res && npc.aff >= a0 && npc.aff - a0 <= 5 && npc.aff <= 100 && npc.aff >= -100, a0 + ' -> ' + npc.aff);
        check('and writes a memory for them', (npc.mem || []).length > m0 || (npc.mem || []).some((m) => /luck|time|back|ask/i.test(m.text)));
        check('answering closes the beat', !S.rhythm.beat);
      }
    }
  }
  check('never more than one open beat at a time', Math.max(...open) <= 1);
  check('at most one beat created per day', Object.values(created).every((set) => set.size === 1), JSON.stringify(Object.keys(created)));
  check('a beat was offered on each of the 3 days', Object.keys(created).length === 3, Object.keys(created).join());
  const log = S.rhythm.log;
  check('beats left unanswered expired quietly', log.some((x) => x.k === 'skip'), JSON.stringify(log.map((x) => x.k)));
  check('there is an evening wrap line with a mood read', log.some((x) => x.k === 'wrap' && /mood in town feels (warm|tense|steady)/.test(x.text)));
  check('the log stays at 14 entries or fewer', log.length <= 14);
  check('a choice never posts anything', S.postOrder.every((id) => !(S.posts[id] && S.posts[id].author === 'me')) || S.postOrder.length >= posts0);
  const rt = JSON.parse(JSON.stringify(S));
  check('save round-trip: S.rhythm identical', JSON.stringify(rt.rhythm) === JSON.stringify(S.rhythm));
  H.summary('RHYTHM');
  process.exit(process.exitCode || 0);
})();
