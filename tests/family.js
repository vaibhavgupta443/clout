// Family relationship types: mother / father / son / daughter / brother / sister / grandparents / aunt / uncle / cousin / niece / nephew.
// They must exist everywhere a relationship status is chosen or shown, stay permanent, and never turn romantic or adult.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const FAMILY = ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'];

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;
  const toasts = [];
  const realToast = G.UI.toast;
  G.UI.toast = (...a) => { toasts.push(a[0]); return realToast.apply(G.UI, a); };

  /* ================= the list exists everywhere ================= */
  check('every family type is a known status', FAMILY.every((f) => E.STATUSES.includes(f)));
  check('the four asked-for ones are there: son, daughter, sister, brother', ['son', 'daughter', 'sister', 'brother'].every((f) => E.STATUSES.includes(f)));
  check('E.FAMILY lists them all', FAMILY.every((f) => E.FAMILY.includes(f)) && E.FAMILY.length === FAMILY.length);
  check('every family type has its own label + emoji + colour (not the "Stranger" fallback)', FAMILY.every((f) => { const m = G.UI.statusMeta(f); return m.label.toLowerCase() === f && m.emoji && m.cls === 'blue'; }));
  check('every family type is a "Starting relationship" preset', FAMILY.every((f) => E.REL_PRESETS.includes(f)));
  check('every family type sits in a People-page group', FAMILY.every((f) => G.UI.GROUPS.some(([, sts]) => sts.includes(f))));
  check('every status in the list belongs to exactly one People-page group (nobody vanishes)', E.STATUSES.every((s) => G.UI.GROUPS.filter(([, sts]) => sts.includes(s)).length === 1), E.STATUSES.filter((s) => G.UI.GROUPS.filter(([, sts]) => sts.includes(s)).length !== 1).join(','));
  check('the AI prompt tells the model about the family statuses', FAMILY.every((f) => G.AI.system().includes(f)));

  /* ================= creating family ================= */
  for (const f of FAMILY) {
    const n = E.createCustomNpc({ name: 'Fam ' + f, rel: f, age: 40 });
    check(`createCustomNpc with rel "${f}" → status ${f}, warm, trusting, not romantic`, n.status === f && n.aff >= 50 && n.trust >= 50 && n.rom === 0 && n.age >= 18);
  }
  const young = E.createCustomNpc({ name: 'Young Son', rel: 'son', age: 12 });
  check('a "son" can never be under 18', young.age >= 18, young.age);
  const viaStudio = G.Studio.create({ name: 'Rosa Vale', handle: '@rosav', age: 52, role: 'friend', rel: 'mother', rom: 80 });
  check('Studio.create with relationship "mother" + a romance slider of 80 still gives rom 0', viaStudio.status === 'mother' && viaStudio.rom === 0);
  const sis = G.Studio.create({ name: 'Nia Vale', handle: '@niav', age: 24, role: 'friend', rel: 'sister' });
  const edited = G.Studio.update(sis.id, Object.assign(G.Studio.sanitize({ name: 'Nia Vale', age: 24, status: 'brother', rom: 90 })));
  check('editing a character to status "brother" works and romance is forced to 0', edited.status === 'brother' && edited.rom === 0);
  G.UI.charModal();
  await H.wait(30);
  const relOpts = $$('#crel option').map((o) => o.value);
  check('the "Starting relationship with you" dropdown in Create offers son, daughter, sister, brother + all family', FAMILY.every((f) => relOpts.includes(f)), relOpts.join(','));
  const sel = $('#crel');
  sel.value = 'son';
  check('"son" can be selected in the dropdown', sel.value === 'son');
  G.UI.closeModal && G.UI.closeModal();
  G.UI.charModal({ edit: sis.id });
  await H.wait(30);
  const stOpts = $$('select[data-f="status"] option').map((o) => o.value || o.textContent);
  check('the Edit form "Status" dropdown offers every family type', FAMILY.every((f) => stOpts.includes(f)), stOpts.join(','));
  G.UI.closeModal && G.UI.closeModal();

  /* ================= they stay family ================= */
  const bro = E.createCustomNpc({ name: 'Theo Park', rel: 'brother', age: 29 });
  E.applyRel(bro, { aff: 10, rom: 30, status: 'dating' });
  check('the AI cannot turn a brother into "dating"', bro.status === 'brother' && bro.rom === 0);
  E.applyRel(bro, { aff: -40, riv: 40, status: 'enemy' });
  check('a feud changes the numbers but he is still your brother', bro.status === 'brother' && bro.aff < 50 && bro.riv >= 40);
  E.applyRel(bro, { aff: 5, status: 'crush' });
  check('"crush" / "partner" / "situationship" are all refused for family', bro.status === 'brother' && bro.rom === 0);
  const frd = E.makeNpc({ name: 'Pal', age: 25, aff: 60, status: 'friend' });
  E.applyRel(frd, { status: 'son' });
  check('a friend can become family (e.g. adopted / revealed): status "son" is accepted from the AI', frd.status === 'son' && frd.rom === 0);
  const drift = E.createCustomNpc({ name: 'Drifty', rel: 'sister', age: 30 });
  drift.aff = 2;
  E.applyRel(drift, { aff: -1 });
  check('a low-affinity sister does not slide down to "stranger"', drift.status === 'sister');
  const crushy = E.createCustomNpc({ name: 'Crusher', rel: 'daughter', age: 22 });
  crushy.aff = 90;
  for (let i = 0; i < 6; i++) G.World.nudgeRel(crushy, { aff: 2, rom: 2 });
  check('world drift (nudgeRel) can never give family romance', crushy.status === 'daughter' && crushy.rom === 0);

  /* ================= the world never makes them romantic or adult ================= */
  for (const n of Object.values(S.npcs)) if (!E.isFamily(n)) { n.aff = 0; n.rom = 99; }
  for (let i = 0; i < 400; i++) G.World.socialEvents(S.clock + i * 60);
  check('"develops feelings for the player" never picks a family member', Object.values(S.npcs).filter((n) => E.isFamily(n)).every((n) => n.rom === 0 && E.FAMILY.includes(n.status)));
  const dmKindsSeen = new Set();
  const realSend = G.World.sendDm;
  G.World.sendDm = (npc, kind, t, extra) => { if (E.isFamily(npc)) dmKindsSeen.add(kind); return realSend(npc, kind, t, extra); };
  const fam = Object.values(S.npcs).filter((n) => E.isFamily(n));
  fam.forEach((n) => { n.aff = 80; n.trust = 80; });
  for (let d = 0; d < 20; d++) for (let h = 0; h < 24; h++) { const t = S.clock + (d * 24 + h) * 60; fam.forEach((n) => { G.Persona.ensure(n).lastDm = -1e9; G.World.dmPass(n, t); }); }
  G.World.sendDm = realSend;
  const ADULTY = ['flirt', 'latenight'];
  check('family members text you (they do talk)', dmKindsSeen.size > 0, [...dmKindsSeen].join(','));
  check('…but never flirty messages, even at high affinity and trust', ![...dmKindsSeen].some((k) => ADULTY.includes(k)), [...dmKindsSeen].join(','));

  /* ================= player actions + UI ================= */
  const before = toasts.length;
  const r = await E.doAction(fam[0].id, 'flirt');
  check('doAction("flirt") on family is blocked with a message', r === undefined && toasts.length === before + 1 && /family/i.test(toasts[toasts.length - 1]), toasts[toasts.length - 1]);
  for (const k of ['jealous', 'confess', 'askout']) {
    const t0 = toasts.length;
    const out = await E.doAction(fam[0].id, k);
    check(`doAction("${k}") on family is blocked`, out === undefined && toasts.length === t0 + 1);
  }
  G.UI.openProfile(fam[0].id);
  await H.wait(30);
  const keys = $$('[data-act="npcAct"]').map((b) => b.dataset.k);
  check('family profile still has the friendly actions (gift, apologize, hype, collab…)', ['friend', 'apologize', 'hype', 'collab', 'gossip'].every((k) => keys.includes(k)), keys.join(','));
  check('family profile hides every romantic action', !keys.some((k) => E.ACTIONS[k].love || k === 'breakup'), keys.join(','));
  check('the profile shows the family chip', !!$('.modal .chip.blue') && new RegExp(G.UI.statusMeta(fam[0].status).label).test($('.modal').textContent));
  G.UI.closeModal && G.UI.closeModal();
  G.UI.openProfile(Object.values(S.npcs).find((n) => n.name === 'Mia Vale').id);
  await H.wait(30);
  const keys2 = $$('[data-act="npcAct"]').map((b) => b.dataset.k);
  check('a non-family friend still gets flirt / confess buttons (nothing else changed)', ['flirt', 'confess'].every((k) => keys2.includes(k)), keys2.join(','));
  G.UI.closeModal && G.UI.closeModal();

  /* ================= pages render ================= */
  G.UI.peopleView = 'cards';
  const html = G.Pages.people();
  check('People page has a Family group listing the family cards', /Family/.test(html) && FAMILY.some((f) => html.includes(G.UI.statusMeta(f).label)));
  G.UI.peopleView = 'web';
  const web = G.Pages.people();
  check('Social web renders with family members and a family legend', /● family/.test(web) && /<svg/.test(web));
  /* ================= persistence + survival ================= */
  const json = JSON.parse(JSON.stringify(S));
  check('family statuses survive a save/load round-trip', fam.every((n) => json.npcs[n.id].status === n.status));
  check('invariants at the end', invariants(G).length === 0, invariants(G).join(';'));

  H.summary('FAMILY RELATIONSHIPS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
