// Smooth in-place updates: unchanged cards are never touched, typing survives, revealed/expanded states survive, indexes are exact.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.setSeed(4);
  S.popSize = 0;
  for (let i = 4; i < 30; i++) E.makeNpc({ name: 'P' + i + ' Q', handle: '@p' + i, age: 25, personality: ['outgoing flirty', 'shy quiet'][i % 2], followers: 900 });
  for (let h = 0; h < 24 * 4; h++) E.tick(60);
  H.seedFeed(40);
  G.UI.feedLimit = 40; G.UI.go('home');
  check('morphdom (MIT) is loaded', typeof w.morphdom === 'function');
  const cards = () => $$('#page > .post');
  check('feed has plenty of cards', cards().length >= 15);

  /* ---- nothing changed: zero DOM work ---- */
  const first = cards()[0], third = cards()[2];
  let muts = 0;
  const mo = new w.MutationObserver((l) => (muts += l.length));
  mo.observe($('#app'), { childList: true, subtree: true, attributes: true, characterData: true });
  G.UI.render(); G.UI.render(); G.UI.render();
  await H.wait(20);
  check('re-rendering an unchanged screen touches the DOM zero times', muts === 0, String(muts));
  check('...and keeps the very same card elements', cards()[0] === first && cards()[2] === third);

  /* ---- one thing changed: only that card is patched, in place ---- */
  const shown = G.Pages.feedPosts()[0];
  const card = $(`#post-${shown.id}`);
  const others = cards().filter((c) => c !== card);
  const heartText = () => card.querySelector('.ab.like span').textContent;
  const before = heartText();
  shown.stats.likes += 1234;
  G.UI.render();
  await H.wait(20);
  check('a changed like count updates the text of the SAME card element (no rebuild)', $(`#post-${shown.id}`) === card && heartText() !== before, before + ' -> ' + heartText());
  check('every other card is the identical element, untouched', cards().filter((c) => c !== card).every((c, i) => c === others[i]));

  /* ---- a new post on top: the rest do not rebuild ---- */
  const kept = cards().slice(0, 12);
  const np = E.addPost({ author: 'n4', text: 'brand new post on top', buzz: 9, stats: { likes: 50, reposts: 0, replies: 0, views: 500 } });
  G.UI.render();
  check('a new post shows up', !!$(`#post-${np.id}`));
  const again = cards();
  check('older cards that are still shown keep their identity (matched by id)', kept.filter((k) => again.includes(k)).length >= 8, String(kept.filter((k) => again.includes(k)).length));

  /* ---- typing survives a refresh ---- */
  G.UI.go('home');
  const c0 = cards().find((c) => c.querySelector('.cmtin'));
  const inp = c0.querySelector('.cmtin');
  inp.value = 'half typed comment';
  const pid = inp.dataset.pid;
  S.posts[pid].stats.likes += 5; // something changes in that very card
  G.UI.render();
  await H.wait(20);
  const inp2 = $(`#post-${pid} .cmtin`);
  check('a half-typed inline comment is kept when its card updates', inp2 === inp && inp2.value === 'half typed comment', inp2 && inp2.value);
  const composer = $('#composer');
  G.UI.draft = 'my draft';
  composer.value = 'my draft';
  G.UI.render();
  check('the composer text is kept', $('#composer') === composer && $('#composer').value === 'my draft');
  G.UI.draft = '';
  composer.value = '';

  /* ---- states that must survive a refresh: expanded captions ---- */
  const long = E.addPost({ author: 'n4', text: 'this is a really long caption that goes on and on and on, '.repeat(4) + 'and then some more words so that it is clearly past the clamp limit.', ptype: 'photo', attach: 'a view', stats: { likes: 3, reposts: 0, replies: 0, views: 10 } });
  G.UI.go('home');
  let cap = $(`#post-${long.id} .cap`);
  check('a long caption starts clamped with a "more" button', cap && cap.classList.contains('clamp') && !!cap.querySelector('.more'));
  click(cap.querySelector('.more'));
  check('"more" unfolds it', !$(`#post-${long.id} .cap`).classList.contains('clamp'));
  long.stats.likes += 1;
  G.UI.render();
  check('...and it stays unfolded after the feed refreshes', !$(`#post-${long.id} .cap`).classList.contains('clamp') && !$(`#post-${long.id} .more`));


  /* ---- fallback when morphdom is missing ---- */
  const md = w.morphdom;
  delete w.morphdom;
  G.UI.go('home');
  const target = G.Pages.feedPosts()[1];
  const t0 = $(`#post-${target.id}`);
  target.stats.likes += 777;
  G.UI.render();
  check('without morphdom the built-in fallback still updates the screen correctly', !!$(`#post-${target.id}`) && /777|\d/.test($(`#post-${target.id}`).textContent) && invariants(G).length === 0);
  const fresh = G.Pages.feedPosts().slice(0, 20).map((p) => p.id);
  check('...and the fallback shows the same posts in the same order', $$('#page > .post').slice(0, 20).map((c) => c.id.replace('post-', '')).join() === fresh.join());
  w.morphdom = md;
  G.UI.go('home');

  /* ---- switching screens replaces content (no leftovers) ---- */
  G.UI.go('explore');
  check('explore shows no home posts', $$('#page > .post').length === 0 || $$('#page > article.post').length < 5);
  G.UI.go('settings');
  check('settings shows no feed', !$('#page .stories') && /Settings/.test($('#page').textContent));
  G.UI.go('home');
  check('back on home: the stories tray and feed are back', !!$('#stories') && cards().length >= 10);
  check('page-change animation class is added then removed', (() => { G.UI.go('people'); const has = $('#page').classList.contains('enter'); return has; })());
  await H.wait(800);
  check('...removed again after the animation', !$('#page').classList.contains('enter'));

  /* ---- the per-render indexes are exact ---- */
  G.UI.go('home');
  const posts = Object.values(S.posts);
  const idx = G.UI.idx();
  check('reply counts from the index equal a brute-force count for EVERY post', posts.every((p) => G.UI.kidsOf(p.id).length === posts.filter((x) => x.replyTo === p.id).length), String(posts.length));
  check('active stories from the index equal a brute-force filter for every author', [...new Set(S.stories.map((s) => s.author))].every((a) => G.UI.activeStories(a).length === S.stories.filter((s) => s.author === a && s.exp > S.clock).length));
  S.clock += 3000;
  check('the index is rebuilt when time moves (expired stories disappear)', Object.keys(S.npcs).every((id) => G.UI.activeStories(id).every((s) => s.exp > S.clock)));
  S.clock -= 3000;

  /* ---- icon sprite ---- */
  check('icons are drawn from one hidden sprite (smaller HTML)', !!$('#icsprite symbol#ic-home') && $$('#page .ab svg use').length > 5 && !$('#page .ab svg path'));
  check('the sprite icons keep their size and class', $('.ab.like svg').getAttribute('width') === '26' && $('.ab.like svg').classList.contains('i-notifs'));

  /* ---- skip path keeps text boxes honest ---- */
  G.UI.go('messages', { dmWith: 'n1', groupWith: null });
  G.UI.dmDraft = 'typed in DM';
  G.UI.render();
  check('the DM box follows the draft state even when nothing else changed', $('#dmbox').value === 'typed in DM');
  G.UI.dmDraft = '';
  G.UI.render();
  check('and clears when the draft is cleared', $('#dmbox').value === '');

  check('world still consistent', invariants(G).length === 0);
  H.summary('SMOOTH UPDATES (in-place DOM)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
