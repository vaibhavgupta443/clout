// NPC rumor protocol: a rumor must be privately considered and discussed before
// a new character learns it. Runs only the local simulation; no model calls.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(30);
  const S = H.freshWorld();
  S.popSize = 0;
  G.World.postDial = () => 0;
  const mia = S.npcs.n1;
  const kai = S.npcs.n2;
  const dex = S.npcs.n3;
  S.npcRel.push({ a: mia.id, b: kai.id, type: 'best_friend', note: 'trusted' });
  S.npcRel.push({ a: kai.id, b: dex.id, type: 'friend', note: 'same circle' });
  G.Social.analyze(S, G.World.rnd);
  const group = E.createGroup('After hours', [mia.id, kai.id]);
  const rumor = G.World.startRumor('Mia saw Kai leave the studio upset.', mia.id, [mia.id], true);
  const postCount = S.postOrder.length;
  const realRnd = G.World.rnd;
  G.World.rnd = () => 0; // make the deliberation branch deterministic for this protocol test

  check('only a direct participant knows a new rumor', rumor.belief[mia.id] === 1 && rumor.belief[kai.id] == null);
  check('planning a rumor exchange succeeds', G.World.planRumorTalk(rumor, mia, kai, S.clock) === true);
  check('recipient does not learn it merely because it was planned', rumor.belief[kai.id] == null);
  check('private conversation is scheduled before any handoff', S.queue.some((q) => q.type === 'rumorTalk' && q.npc === mia.id && q.target === kai.id));
  check('existing small group is selected as private discussion context', rumor.pendingTalks[mia.id].channel.label === 'private circle: ' + group.name);

  const due = rumor.pendingTalks[mia.id].due;
  G.World.processQueue(due);
  check('recipient learns the rumor only after the private conversation', rumor.belief[kai.id] != null);
  check('handoff has an auditable private discussion record', rumor.discussions.length === 1 && /Mia Vale/.test(rumor.discussions[0].words));
  check('rumor path records a private channel rather than a broadcast', rumor.path.some((p) => p.from === mia.id && p.to === kai.id && p.channel === 'private_group'));
  check('private rumor talk does not create a public post', S.postOrder.length === postCount);
  check('recipient has hearsay, not direct knowledge', (kai.awareness || []).some((x) => x.kind === 'rumor' && x.ref === rumor.id && x.channel === 'hearsay'));
  check('both characters retain a concise intention record', (mia.mindLog || []).some((x) => x.action === 'shared_rumor_privately') && (kai.mindLog || []).some((x) => x.action === 'heard_rumor'));

  const intel = G.World.intel(S);
  const view = intel.rumors.find((r) => r.id === rumor.id);
  check('Director intel exposes the discussion trail', view && view.discussions.length === 1 && view.discussions[0].to === kai.id);
  const context = G.AI.context({ ownerView: true, full: false, scan: 'studio rumor' });
  check('Director AI context includes the private rumor discussion', context.includes('private discussion') && context.includes('Mia Vale told Kai Storm privately'));

  // A later recipient cannot immediately relay it. They need a cooling period, then
  // their own separate scheduled discussion.
  G.World.spreadRumors(due + 60);
  check('a new recipient has a cooling period before considering a relay', !rumor.pendingTalks[kai.id]);
  G.World.spreadRumors(due + 181);
  check('second private handoff is planned by the new holder after cooling', !!rumor.pendingTalks[kai.id]);
  check('third character is still unaware before that discussion', rumor.belief[dex.id] == null);
  const due2 = rumor.pendingTalks[kai.id].due;
  G.World.processQueue(due2);
  check('third character learns only after the second private discussion', rumor.belief[dex.id] != null && rumor.discussions.length === 2);
  check('NPC rumor state keeps world invariants intact', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  check('NPC rumor protocol makes zero model calls', H.state.calls === 0, String(H.state.calls));
  G.World.rnd = realRnd;
  H.summary('NPC RUMOR FLOW');
  w.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
