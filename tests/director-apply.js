// "I approved it and it said nothing needed to change": an approved item really happens, and the summary says what happened or why something was not used.
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
  const St = E.Story;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  G.AI.ready = () => true;
  G.settings.approveActions = true; // the real default: you approve every item
  St.approver = async (prop) => prop.items.map((i) => i.id); // you tick everything
  const ask = (data) => { G.AI.json = async () => ({ cost: 0.002, data }); };

  // 1) a standalone post you APPROVED happens even though your sentence never said "post"
  ask({ posts: [{ author: kai.id, text: 'honestly done with the drama' }], judge: {} });
  const p0 = Object.keys(S.posts).length;
  let r = await St.run('make Kai furious about the leak');
  S = G.S;
  check('an approved standalone post by Kai really appears (approval is the permission)', Object.keys(S.posts).length >= p0 + 1 && Object.values(S.posts).some((p) => p.author === kai.id && /done with the drama/.test(p.text)), r.summary);
  check('and the summary says so (not "nothing needed to change")', /1 new post/.test(r.summary) && !/nothing/i.test(r.summary), r.summary);

  // 2) only a DM: it is counted
  ask({ dms: [{ from: mia.id, text: 'we need to talk about the tape' }], judge: {} });
  r = await St.run('Mia messages me about the tape');
  S = G.S;
  check('a DM-only change is reported as a message, not as nothing', (S.dms[mia.id] || []).some((m) => /talk about the tape/.test(m.text)) && /1 message/.test(r.summary), r.summary);

  // 3) a feelings change is counted too
  ask({ rel: [{ id: mia.id, aff: 9, mood: 'furious' }], judge: {} });
  r = await St.run('make Mia furious at me');
  check('a relationship / mood change is reported', /changed how they feel/.test(r.summary) || /Mia/.test(r.summary), r.summary);

  // 4) something the world cannot use is explained
  const mine = Object.values(G.S.posts).find((p) => p.author === mia.id) || E.addPost({ author: mia.id, text: 'a post by Mia', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  ask({ posts: [{ author: mia.id, text: 'replying to myself', replyTo: mine.id }], judge: {} });
  r = await St.run('Mia replies to herself');
  check('an item the world cannot use is explained (a character replying to their own post)', /not used/.test(r.summary) && /replying to their own post/.test(r.summary), r.summary);

  // 5) a truly empty proposal gets a helpful sentence
  ask({ judge: {} });
  r = await St.run('do something');
  check('an empty proposal says what to try instead of a bare "nothing"', /proposed nothing/.test(r.summary) && /Try naming who does what/.test(r.summary), r.summary);

  // 6) ticking nothing is still "rejected: nothing changed" (that is true)
  St.approver = async () => [];
  ask({ posts: [{ author: kai.id, text: 'x x x x' }], judge: {} });
  r = await St.run('Kai says something');
  check('if you untick everything it is a clean rejection', r.rejected === true);

  H.summary('DIRECTOR: APPROVED THINGS HAPPEN, AND THE SUMMARY IS HONEST');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
