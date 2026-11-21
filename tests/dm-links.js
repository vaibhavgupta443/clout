// Links in DMs: whoever wrote the message (the free world, the AI, an old save), a message that talks about a post carries a card that opens it.
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
  w.document.body.classList.add('ingame');
  let S = G.S;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const mine = E.addPost({ author: 'me', text: 'finally finished the lighthouse song, it took all night', buzz: 4, stats: { likes: 3, reposts: 0, replies: 0, views: 30 } });
  const kp = E.addPost({ author: kai.id, text: 'some people never learn when to stop talking', buzz: 4, stats: { likes: 3, reposts: 0, replies: 0, views: 30 } });
  const R = G.Refs;
  const msg = (text, from) => ({ id: 'x' + Math.random(), from: from || mia.id, text, t: S.clock, read: false });

  check('a quoted piece of a real post links to that post', R.infer(msg('saw "finally finished the lighthouse song" and I am proud of you')).id === mine.id);
  check('a quote in curly marks works too', R.infer(msg('“some people never learn when to stop talking”, was that about me?')).id === kp.id);
  check('"your last post" links to your latest post', R.infer(msg('your last post was wild')).id === mine.id);
  check('"that post you made" / "saw what you posted" too', R.infer(msg('that post you made, we need to talk')).id === mine.id && R.infer(msg('I saw what you posted')).id === mine.id);
  check('"Kai\'s post" links to Kai\'s latest', R.infer(msg("did you see Kai's post?")).id === kp.id && R.infer(msg('what Kai posted today is unreal')).id === kp.id);
  check('"your story" links to your story when you have one', (() => { S.stories = [{ id: 'st1', author: 'me', kind: 'player', text: 'my day', t: S.clock, exp: S.clock + 1000 }]; return R.infer(msg('loved your story')).type === 'story'; })());
  check('words that do not point at a post never get a link', R.infer(msg('hey, how are you today?')) === null && R.infer(msg('a post office opened downtown')) === null);
  check('your own messages never get one', R.infer(msg('your last post was wild', 'me')) === null);

  // drawn in the chat, from every source, even an old message with no link stored
  S.dms[mia.id] = [msg('your last post was wild, honestly'), msg('good morning')];
  G.UI.go('messages'); G.UI.dmWith = mia.id; G.UI.render();
  const cards = $$('.bubble .refcard[data-act="thread"]');
  check('the chat shows a card under the message that talks about your post (and only that one)', cards.length === 1 && /lighthouse song/.test(cards[0].textContent), String(cards.length));
  cards[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('tapping it opens the post', G.UI.thread === mine.id);
  G.UI.thread = null;
  check('the link is kept on the message after the first time', !!S.dms[mia.id][0].ref && S.dms[mia.id][0].ref.id === mine.id && S.dms[mia.id][1].ref === undefined);
  mine.deleted = true;
  G.UI.go('messages'); G.UI.dmWith = mia.id; G.UI.render();
  check('if the post is gone the card says so', /no longer available/.test($('#page').textContent));
  mine.deleted = false;

  // a message the AI wrote (no "post" field at all) still gets its link
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 5, virality: 3, controversy: 0, sentiment: 1 }, dms: [{ from: kai.id, text: 'honestly your latest post made me laugh' }], posts: [], crowd: [] } });
  const aiPost = await E.speak({ mode: 'post', text: 'one more post', label: 'x' });
  S = G.S;
  await H.wait(60);
  G.UI.go('messages'); G.UI.dmWith = kai.id; G.UI.render();
  check('the AI-authored post action completes', !!aiPost);
  check('an AI message that never named a post still gets a card', $$('.bubble .refcard[data-act="thread"]').some((card) => /one more post/.test(card.textContent)));

  H.summary('LINKS IN DMS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
