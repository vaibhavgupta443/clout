// Memory and NPCs are wired into EVERY place: everything you say is heard by the right people, and everything they remember reaches the AI, the comments and the DMs.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  [mia, kai, dex].forEach((n) => { n.mem = []; n.aff = 60; n.trust = 60; n.touched = S.clock; });
  mia.status = 'close_friend'; kai.status = 'rival'; kai.aff = -20; dex.status = 'friend';
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 5, virality: 3, controversy: 0, sentiment: 1 }, dms: [], posts: [], crowd: [], group_msgs: [] } });
  const has = (n, re) => (n.mem || []).some((m) => re.test(m.text));

  // 1) every way you speak is heard
  await E.speak({ mode: 'dm', text: 'I promise I will bring the song to you on Friday.', npcId: mia.id, label: 'x' });
  await H.wait(30);
  check('a DM: the person you wrote to remembers the promise', has(mia, /promised/));
  const post = E.addPost({ author: dex.id, text: 'hello', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  await E.speak({ mode: 'reply', text: 'I hate waiting in queues, honestly.', replyTo: post.id, label: 'x' });
  await H.wait(30);
  check('a reply: the person whose post you answered remembers it', has(dex, /hate waiting in queues/));
  await E.speak({ mode: 'post', text: 'My sister is visiting next week.', label: 'x' });
  await H.wait(30);
  check('a public post: people close to you (and family) learn it, a rival does not', has(mia, /sister is visiting/) && !has(kai, /sister is visiting/));
  const gid = Object.keys(S.groups)[0] || (() => { const g = { id: 'g1', name: 'The crew', members: [mia.id, kai.id], msgs: [], summary: '' }; S.groups.g1 = g; return 'g1'; })();
  S.groups[gid].members = [mia.id, kai.id];
  try { await E.groupSend(gid, 'I just got a new job at the harbour.'); } catch (e) { console.log('groupSend threw', e.message); }
  await H.wait(30);
  check('a group chat: its members hear what you say', has(mia, /new job/) && has(kai, /new job/));
  G.Channels.ensure();
  G.Channels.send('town-talk', 'I love jazz, come to the bar tonight.');
  check('a public channel: close people learn it', has(mia, /love jazz/) && !has(kai, /love jazz/));
  E.postStory('I am so tired today', '😴');
  check('your own story: close people learn it', has(mia, /feel tired/));
  // never from a burner
  G.S.activeAlt = 'zz';
  const before = mia.mem.filter((m) => m.kind === 'said').length;
  G.Channels.send('town-talk', 'I love opera and I promise nothing at all.');
  G.S.activeAlt = null;
  check('nothing is learned while you act as a burner account', mia.mem.filter((m) => m.kind === 'said').length === before);

  // 2) what they remember reaches the AI, the comments and the DMs
  const ctx = G.AI.context({ full: true, focus: [mia.id], scan: 'lighthouse song promise Friday', ownerView: true });
  check('the AI prompt carries what Mia remembers about you', /promised|bring the song/.test(ctx));
  mia.vault = { me: { n: 3, pos: 1, neg: 0, first: 5, last: 9, lines: [{ t: 5, text: 'Sam told me a secret about the old ferry', imp: 7, v: 0 }] } };
  const ctx2 = G.AI.context({ full: true, focus: [mia.id], scan: 'what was that secret about the ferry', ownerView: true });
  check('...including old things filed in the vault', /old ferry/.test(ctx2));
  check('...and the story together (the timeline)', (G.Mem2.timeline(mia) || []).length >= 1 && G.Rag.recall(mia, 'our first moment', 6).some((t) => /Our story|first/i.test(t)));
  const p = E.addPost({ author: 'me', text: 'new post', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  let said = null;
  for (let i = 0; i < 80 && !said; i++) { mia.mem.forEach((m) => delete m.cb); const t = G.Voice.comment(mia, 'agree', { post: p, rnd: Math.random, authorName: 'S', authorHandle: '' }); if (/promised|bring the song|Friday/i.test(t)) said = t; }
  check('a comment on your post brings up a real memory of you', !!said, said);
  mia.mem.forEach((m) => delete m.cb);
  const cb = G.Reasons.candidates(mia, S.clock, { rel: G.React.relation(S, mia, 'me'), rnd: () => 0.3, st: 'close_friend', waiting: false, last: undefined, myRecent: [], fam: false }).find((c) => c.kind === 'callback');
  check('a DM can be a callback to it', !!cb && /Friday|song|promise/i.test(cb.text), cb && cb.text);

  // 3) facts travel, rumours spread, set-aside people stay out
  S.npcRel.push({ a: mia.id, b: dex.id, type: 'best_friend', note: '' });
  const m0 = (dex.mem || []).length;
  mia.mem.forEach((m) => { if (m.kind === 'said') { m.t = S.clock - 2000; delete m.told; } });
  const rr = w.Math.random; w.Math.random = () => 0.1;
  S.clock += 700; G.Mem2.spread();
  w.Math.random = rr;
  check('a friend hears what Mia learned (hearsay), never a secret', (dex.mem || []).length > m0 && (dex.mem || []).some((m) => /Mia told me about/.test(m.text)) && !(dex.mem || []).some((m) => /secret/.test(m.text)));

  H.summary('MEMORY + NPC WIRING');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
