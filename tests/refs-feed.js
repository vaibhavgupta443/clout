// Messages about a post carry a link you can open; new posts always arrive at the top.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  w.document.body.classList.add('ingame');
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const mine = E.addPost({ author: 'me', text: 'finally finished the lighthouse song', buzz: 4, stats: { likes: 3, reposts: 0, replies: 0, views: 40 } });
  mia.status = 'close_friend'; mia.aff = 70;

  /* ---------- the reason-based DM names its post ---------- */
  const ctx = (n) => ({ rel: G.React.relation(S, n, 'me'), rnd: () => 0.3, st: n.status, waiting: false, last: undefined, myRecent: [mine], fam: false });
  const rp = G.Reasons.candidates(mia, S.clock, ctx(mia)).find((c) => c.kind === 'reactpost');
  check('a DM that reacts to your post carries the reference to that exact post', !!rp && rp.ref && rp.ref.type === 'post' && rp.ref.id === mine.id);
  kai.status = 'rival'; kai.riv = 80; kai.aff = -40;
  const pv = G.Reasons.candidates(kai, S.clock, ctx(kai)).find((c) => c.kind === 'provoke');
  check('so does a rival provoking you over it', !pv || (pv.ref && pv.ref.id === mine.id));
  G.World.sendDm(mia, 'reactpost', S.clock, { text: rp.text, ref: rp.ref });
  G.UI.go('messages'); G.UI.openChat ? G.UI.openChat(mia.id) : (G.UI.dmWith = mia.id);
  G.UI.dmWith = mia.id; G.UI.render();
  const card = $('.refcard[data-act="thread"]');
  check('Messages shows a "📌 about this post" card under that message', !!card && /about this post/.test(card.textContent) && /lighthouse song/.test(card.textContent));
  card.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('tapping the card opens that post', G.UI.thread === mine.id);
  G.UI.thread = null;

  /* ---------- a post that is gone says so ---------- */
  const gone = E.addPost({ author: kai.id, text: 'a post that will be deleted', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  G.World.sendDm(kai, 'news', S.clock, { text: 'did you see what I posted?', ref: { type: 'post', id: gone.id } });
  gone.deleted = true;
  G.UI.go('messages'); G.UI.dmWith = kai.id; G.UI.render();
  check('a deleted post is shown as "no longer available" instead of leaving you guessing', /no longer available/.test($('#chatlog') ? $('#chatlog').textContent : w.document.body.textContent));
  check('a reference to a post that never existed is never attached', G.Refs.post('p99999') === null && G.Refs.card({ type: 'post', id: 'p99999' }).includes('no longer available'));

  /* ---------- channels ---------- */
  G.Channels.ensure();
  const chan = S.channels.find((c) => c.id === 'town-talk') || S.channels[0];
  const real = G.Channels.topics;
  G.Channels.topics = () => [{ kind: 'post', text: 'finally finished the lighthouse song', who: ['me'], t: S.clock, w: 3, postId: mine.id }];
  let m = null;
  for (let i = 0; i < 40 && !(m && m.ref); i++) m = G.Channels.say(chan, Math.random);
  G.Channels.topics = real;
  check('channel chat about your post carries the post, shown as a card', !!m && m.ref && m.ref.id === mine.id);
  G.UI.go('channels'); G.UI.render();
  check('and the channel page renders the card', $$('.refcard').length >= 1);

  /* ---------- the AI names the post ---------- */
  G.AI.ready = () => true;
  const id2 = mine.id;
  G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 5, virality: 3, controversy: 0, sentiment: 1 }, dms: [{ from: mia.id, text: 'that post is everything', post: id2 }, { from: mia.id, text: 'and that other post', post: 'p404404' }], posts: [], crowd: [] } });
  try { await E.speak({ mode: 'post', text: 'hello again', label: 'x' }); } catch (e) { console.log('speak threw', e.message); }
  S = G.S;
  const dm1 = (S.dms[mia.id] || []).find((x) => /everything/.test(x.text));
  const dm2 = (S.dms[mia.id] || []).find((x) => /other post/.test(x.text));
  check('an AI message that names a real post gets the card; one that names a post that does not exist gets none', !!dm1 && dm1.ref && dm1.ref.id === id2 && !!dm2 && !dm2.ref);
  check('the AI is told to name the post and never to talk about one that is not in the feed', /NEVER talk about a post, story or screenshot that is not in the feed/.test(G.AI.context({ full: true })));

  /* ---------- new posts are on top ---------- */
  S = G.S;
  G.UI.feedTab = 'latest';
  const old1 = E.addPost({ author: kai.id, text: 'older by timestamp', buzz: 3, t: S.clock - 3000, stats: { likes: 1, reposts: 0, replies: 0, views: 0 } });
  const later = E.addPost({ author: mia.id, text: 'arrived later but timestamped long ago', buzz: 3, stats: { likes: 1, reposts: 0, replies: 0, views: 0 } });
  later.t = S.clock - 5000; // catch-up posts are timestamped inside the time that passed
  let feed = G.Pages.feedPosts().map((p) => p.id);
  check('Latest: the post that ARRIVED last is first, even when its timestamp is older', feed[0] === later.id && feed.indexOf(later.id) < feed.indexOf(old1.id));
  G.UI.feedTab = 'foryou';
  for (let i = 0; i < 3; i++) E.addPost({ author: kai.id, text: 'a very buzzy old one ' + i, buzz: 10, t: S.clock - 1500, stats: { likes: 9000, reposts: 0, replies: 0, views: 0 } });
  const fresh = E.addPost({ author: mia.id, text: 'brand new quiet post', buzz: 1, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  feed = G.Pages.feedPosts().map((p) => p.id);
  check('For you: a brand-new quiet post is pinned above older buzzy ones', feed[0] === fresh.id, feed.slice(0, 3).join(','));
  const buzzyOld = Object.values(S.posts).find((p) => p.buzz === 10 && S.postOrder.indexOf(p.id) < S.postOrder.length - 8);
  G.UI.feedTab = 'latest';
  G.UI.go('home'); G.UI.render();
  const first = $('.post');
  check('the home page shows the newest post first', !!first && (first.id === 'post-' + fresh.id || /brand new quiet post/.test(first.textContent)));

  H.summary('POST LINKS + NEW POSTS ON TOP');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
