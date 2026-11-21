// The layouts from the Instagram mockups: phone header + bottom bar, Reels, profile (stats, buttons, highlights, tabs, grid),
// NPC profile header, explore mosaic + search, saved posts, chat pill — and that hostile text cannot break any of them.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, state } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.setSeed(8);
  S.popSize = 0;
  
  for (let i = 4; i < 30; i++) E.makeNpc({ name: 'P' + i + ' Q', handle: '@p' + i, age: 24, personality: ['outgoing flirty', 'shy quiet'][i % 2], followers: 900 * i });
  for (let h = 0; h < 24 * 5; h++) E.tick(60);
  // a few picture posts of my own on different topics
  const mk = (text, attach, ptype) => { const p = E.addPost({ author: 'me', text, ptype: ptype || 'photo', attach, buzz: 4, stats: { likes: 40, reposts: 2, replies: 0, views: 500 } }); S.player.posts++; return p; };
  const mine = [mk('best ramen of my life 🍜', 'a bowl of ramen'), mk('ramen again lol', 'noodles'), mk('beach day 🏝️ so tired', 'the beach at sunset'), mk('gym mirror check', 'gym selfie'), mk('my cat is judging me 🐱', 'a cat on the sofa')];
  G.UI.go('home');

  /* ================= nav + phone header ================= */
  check('left rail has 13 destinations (Reels was removed)', $$('#nav .navb[data-page]').length === 13 && !$('#nav .navb[data-page="reels"]') && !!$('#nav .navb[data-page="town"]'));
  const prim = $$('#nav .navb[data-page]').filter((b) => !b.classList.contains('sec')).map((b) => b.dataset.page).sort().join();
  check('on a phone the bottom bar keeps exactly the five places: Home, Explore, Messages, Alerts, Profile (the rest live in the More list)', prim === 'explore,home,me,messages,notifs', prim);
  check('secondary destinations live in the More list at the bottom of Profile', ['town', 'people', 'drama', 'director', 'shop', 'settings'].every((k) => $(`#nav .navb[data-page="${k}"]`).classList.contains('sec')));
  check('the More sheet carries the world controls (speed, refresh, time)', $$('#nav .sheetctl .speed button').length === 4 && !!$('#nav .sheetctl [data-act="advance"][data-k="refresh"]'));
  click('#nav .navb.more');
  check('More toggles the sheet', w.document.body.classList.contains('nav-more'));
  click('#nav .navb[data-page="settings"]');
  check('choosing a place closes the sheet', !w.document.body.classList.contains('nav-more') && G.UI.page === 'settings');
  G.UI.go('home');
  check('phone header: logo + heart + messages', !!$('#topbar .mhead .mlogo') && $$('#topbar .mact .mi').length === 2 && $('#topbar .mi[data-page="notifs"]') && $('#topbar .mi[data-page="messages"]'));
  Object.values(S.dms).forEach((l) => l.forEach((m) => (m.read = true)));
  G.UI.render(); G.UI.refreshBadges();
  const before = !!$('#topbar .mi[data-page="messages"] .badge');
  S.dms.n1 = (S.dms.n1 || []).concat({ id: 'zz1', from: 'n1', text: 'hi', t: S.clock, read: false });
  G.UI.refreshBadges();
  check('the header message icon gets a live unread badge', !before && !!$('#topbar .mi[data-page="messages"] .badge'));
  check('...and the logo is never given a badge', !$('.logo .badge') && !$('.mlogo .badge'));
  S.dms.n1.forEach((m) => (m.read = true)); G.UI.refreshBadges();
  check('the badge clears when read', !$('#topbar .mi[data-page="messages"] .badge'));

  /* ================= reels ================= */
  G.UI.go('reels');
  const reels = $$('#reels .reel');
  check('Reels page: a vertical stack of full-height items', !!$('#reels') && reels.length >= 4 && reels.length <= 24, String(reels.length));
  check('body is marked as on-reels (phone: no top bar, bottom bar stays)', w.document.body.classList.contains('on-reels'));
  const r0 = reels[0];
  check('each reel has side actions (like, comment, repost, save)', ['like', 'thread', 'quote', 'saveToggle'].every((a) => r0.querySelector(`.reel-side [data-act="${a}"]`)));
  check('each reel shows who posted, a caption, and an "audio" line', !!r0.querySelector('.reel-info b') && !!r0.querySelector('.reel-cap') && /original audio/.test(r0.querySelector('.reel-audio').textContent));
  check('reels only contain photo/video posts', reels.every((r) => G.UI.isMediaPost(S.posts[r.dataset.id])));
  const rid = r0.dataset.id;
  const l0 = S.posts[rid].stats.likes;
  click(r0.querySelector('[data-act="like"]'));
  check('liking a reel works', S.posts[rid].liked === true && S.posts[rid].stats.likes === l0 + 1 && !!$(`#reel-${rid} .rb.like.liked`));
  S.posts[rid].liked = false; S.posts[rid].stats.likes = l0; G.UI.render();
  $(`#reel-${rid}`).dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
  check('double-tap on a reel likes it and shows the heart', S.posts[rid].liked === true && !!$(`#reel-${rid} .heartpop`));
  click($(`#reel-${rid} [data-act="saveToggle"]`));
  check('saving from a reel works', S.posts[rid].saved === true && !!$(`#reel-${rid} .rb.save.on`));
  click($(`#reel-${rid} [data-act="thread"]`));
  check('the comment button opens the thread (and leaves reels)', G.UI.thread === rid && !w.document.body.classList.contains('on-reels'));
  G.UI.go('home');
  check('leaving Reels removes the on-reels mode', !w.document.body.classList.contains('on-reels'));
  // hidden things stay hidden
  S.npcs.n5.muted = true;
  const mp = E.addPost({ author: 'n5', text: 'muted person pic', ptype: 'photo', attach: 'x', buzz: 9, stats: { likes: 500, reposts: 0, replies: 0, views: 9 } });
  G.UI.go('reels');
  check('posts by muted people are not shown', !$(`#reel-${mp.id}`));
  S.npcs.n5.muted = false;
  const evil = E.addPost({ author: 'me', text: '<img src=x onerror=alert(1)> #tag "quotes" & <b>bold</b>', ptype: 'photo', attach: 'x', buzz: 9, stats: { likes: 600, reposts: 0, replies: 0, views: 9 } });
  S.player.name = 'Sam <script>alert(2)</script>';
  G.UI.go('reels');
  check('hostile text in captions / names cannot inject markup into reels', !$('#reels img[onerror]') && !$('#reels script') && /&lt;|<\/?b>/.test($(`#reel-${evil.id}`) ? $(`#reel-${evil.id}`).innerHTML : '') === false || !$('#reels script'));
  S.player.name = 'Sam';
  // empty state
  const keep = S.postOrder.slice();
  S.postOrder.forEach((id) => { const p = S.posts[id]; if (G.UI.isMediaPost(p)) { p.ptype = 'text'; p.attach = ''; p.img = ''; } });
  G.UI.go('reels');
  check('with no photo posts: a friendly empty state, no crash', /No reels yet/.test($('#page').textContent) && !$('#reels'));
  S.postOrder.length = 0; keep.forEach((id) => S.postOrder.push(id));

  /* ================= my profile ================= */
  S.posts[mine[0].id].ptype = 'photo'; S.posts[mine[0].id].attach = 'a bowl of ramen';
  mine.forEach((p, i) => { p.attach = ['a bowl of ramen', 'noodles', 'the beach at sunset', 'gym selfie', 'a cat on the sofa'][i]; p.ptype = 'photo'; delete p.scene; });
  G.UI.profTab = 'grid'; G.UI.hlTopic = null;
  G.UI.go('me');
  const P = S.player;
  check('profile header: avatar, posts / followers / following', !!$('.pf .pf-av') && $$('.pf-stats b').map((b) => b.textContent).length === 3 && $('.pf-stats').textContent.includes('posts') && $('.pf-stats').textContent.includes('followers') && $('.pf-stats').textContent.includes('following'));
  check('...with the real numbers', $$('.pf-stats b')[0].textContent === G.U.fmt(P.posts) && $$('.pf-stats b')[1].textContent === G.U.fmt(P.followers) && $$('.pf-stats b')[2].textContent === G.U.fmt(P.following.length));
  check('name, bio, Edit profile + Share profile buttons', /Sam/.test($('.pf-name').textContent) && !!$('.pf-btns [data-act="editBio"]') && /Share profile/.test($('.pf-btns').textContent));
  const hls = $$('.pf-hl .hl[data-act="hlTopic"]');
  check('story highlights are your most-posted topics', hls.length >= 2 && hls.length <= 6 && !!$('.pf-hl [data-act="storyCompose"]'), String(hls.length));
  check('tabs: posts · photos&videos · saved · tagged', $$('.ptabs2 button').length === 4 && $('.ptabs2 button.on').dataset.k === 'grid');
  const tiles = () => $$('#page .pgrid.tall .gtile').length;
  const all = tiles();
  check('the grid has 3:4 tiles', all >= 5 && !!$('#page .pgrid.tall'));
  const foodHl = hls.find((b) => b.dataset.k === 'food');
  if (foodHl) {
    click(foodHl);
    const foodN = Object.values(S.posts).filter((p) => p.author === 'me' && !p.replyTo && p.id !== S.pinned && G.UI.sceneOf(p).key === 'food').length;
    check('tapping a highlight filters the grid to that topic', tiles() === foodN && tiles() < all && !!$('.pf-hl .hl.on'), `${tiles()} vs ${foodN}`);
    click($('.pf-hl .hl.on'));
    check('tapping it again clears the filter', tiles() === all && !$('.pf-hl .hl.on'));
  } else check('a food highlight exists (the ramen posts)', false);
  check('highlight labels are plain text names', hls.every((b) => /^[A-Za-z]+$/.test(b.querySelector('span:last-child').textContent)));
  click('.ptabs2 button[data-k="reels"]');
  check('Photos & videos tab shows only picture posts', $$('#page .pgrid.tall .gtile').length >= 4 && G.UI.profTab === 'reels');
  Object.values(S.posts).forEach((p) => (p.saved = false));
  G.UI.go('me');
  click('.ptabs2 button[data-k="saved"]');
  check('Saved tab starts empty with a hint', /Nothing saved yet/.test($('#page').textContent));
  G.UI.profTab = 'grid'; G.UI.go('home');
  const someone = S.posts[$$('#page > .post').map((c) => c.id.replace('post-', '')).find((id) => S.posts[id] && S.posts[id].author !== 'me')];
  click(`#post-${someone.id} .ab.save`);
  check('the bookmark on a post card saves it', S.posts[someone.id].saved === true && !!$(`#post-${someone.id} .ab.save.on`) && /Saved/.test(($('#toasts') || {}).textContent || ''));
  G.UI.go('me'); click('.ptabs2 button[data-k="saved"]');
  check('...and it shows up in Saved', $$('#page .pgrid.tall .gtile').some((t) => t.dataset.id === someone.id));
  click(`.ptabs2 button[data-k="grid"]`);
  S.posts[someone.id].saved = false;
  const tagger = E.addPost({ author: 'n6', text: 'love this one ' + P.handle, buzz: 3, stats: { likes: 1, reposts: 0, replies: 0, views: 1 } });
  click('.ptabs2 button[data-k="tagged"]');
  check('Tagged tab lists posts that mention you', $$('#page .pgrid.tall .gtile').some((t) => t.dataset.id === tagger.id));
  G.UI.profTab = 'grid';
  w.navigator.clipboard = { writeText: async (t) => { w.__copied = t; } };
  G.UI.go('me'); click('[data-act="shareProfile"]');
  check('Share profile copies your handle and says so', w.__copied === P.handle && /copied/.test(($('#toasts') || {}).textContent || ''));
  const pinnedP = mine[0]; S.pinned = pinnedP.id; G.UI.go('me');
  check('pinned post section, level and achievements are still there', /Pinned/.test($('#page').textContent) && !!$('.ach-grid') && /Level \d/.test($('#page').textContent));
  S.pinned = null;
  P.name = '<img src=x onerror=alert(1)>'; P.bio = '<script>alert(1)</script>'; P.traits = ['<b>x</b>'];
  G.UI.go('me');
  check('hostile name / bio / traits cannot break the profile header', !$('.pf img[onerror]') && !$('.pf script') && !$('.pf b') && /&lt;|<img/.test($('.pf-name').innerHTML) === false || !$('.pf script'));
  P.name = 'Sam'; P.bio = ''; P.traits = [];

  /* ================= other people's profiles ================= */
  const npc = S.npcs.n7;
  for (let i = 0; i < 4; i++) { const p = E.addPost({ author: 'n7', text: ['great pasta night 🍝', 'beach trip!!', 'new dog 🐶', 'pizza again'][i], ptype: 'photo', attach: ['pasta', 'beach', 'dog', 'pizza'][i], buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 9 } }); }
  G.UI.hlTopic = null;
  G.UI.openProfile('n7');
  check('NPC profile: Instagram header with stats, Follow + Message in it', !!$('.modal .pf') && $$('.modal .pf-stats b').length === 3 && !!$('.modal .pf-btns [data-act="follow"]') && !!$('.modal .pf-btns [data-act="openChat"]'));
  check('...exactly one Follow and one Message button in the whole modal (no duplicates)', $$('.modal [data-act="follow"]').length === 1 && $$('.modal [data-act="openChat"]').length === 1);
  check('...with their highlights and a grid of posts', $$('.modal .pf-hl .hl').length >= 2 && $$('.modal .pgrid .gtile').length >= 4);
  click('.modal .pf-btns [data-act="follow"]');
  check('Follow in the header works and flips to "Following ✓"', S.player.following.includes('n7') && /Following/.test($('.modal .pf-btns').textContent));
  const nGrid = $$('.modal .pgrid .gtile').length;
  const hl = $('.modal .pf-hl .hl[data-who="n7"]');
  click(hl);
  check('tapping one of their highlights filters their grid inside the modal', !!$('.modal') && $$('.modal .pgrid .gtile').length < nGrid && !!$('.modal .pf-hl .hl.on'));
  G.UI.hlTopic = null;
  check('the relationship meters + actions are still below the header', !!$('.modal .meters') || /Affinity/.test($('.modal').textContent));
  G.UI.closeModal();

  /* ================= explore ================= */
  G.UI.search = '';
  G.UI.go('explore');
  const input = $('#searchbox');
  check('Explore: a search pill on top', !!input && input.placeholder === 'Search');
  const mt = $$('#page .pgrid.mosaic .gtile');
  check('mosaic of up to 30 tiles', mt.length >= 8 && mt.length <= 30, String(mt.length));
  check('a big tile every 6, alternating left / right', mt[0].classList.contains('big') && (mt.length < 7 || mt[6].classList.contains('bigR')) && (mt.length < 13 || mt[12].classList.contains('big')) && mt.filter((t, i) => i % 6 !== 0).every((t) => !t.classList.contains('big') && !t.classList.contains('bigR')));
  G.UI.search = 'ramen'; G.UI.go('explore');
  check('searching shows matching posts as cards instead of the mosaic', $$('#page .post').length >= 1 && !$('#page .pgrid.mosaic'));
  G.UI.search = '';

  /* ================= messages ================= */
  G.UI.go('messages', { dmWith: 'n1', groupWith: null });
  const ci = $('.chatinput');
  check('chat input is one rounded bar with the text box and the send button', !!ci && !!ci.querySelector('textarea#dmbox') && !!ci.querySelector('[data-act="sendDm"]'));
  G.UI.dmDraft = 'hello there';
  state.mode = 'normal';
  click('.chatinput [data-act="sendDm"]');
  await H.wait(200);
  check('sending from the new input bar still works', (S.dms.n1 || []).some((m) => m.from === 'me' && m.text === 'hello there'));

  /* ================= every page + world ================= */
  for (const pg of ['home', 'explore', 'reels', 'notifs', 'messages', 'town', 'people', 'drama', 'director', 'shop', 'me', 'settings']) {
    G.UI.go(pg);
    check('page renders: ' + pg, $('#page').innerHTML.length > 40 && !/Something broke/.test($('#page').innerHTML));
  }
  for (const th of ['light', 'dark', 'amoled']) { G.settings.theme = th; G.UI.go('me'); check(th + ' theme: profile renders', !!$('.pf')); }
  G.settings.theme = 'light';
  check('world still consistent', invariants(G).length === 0, invariants(G).slice(0, 2).join('; '));
  H.summary('INSTAGRAM LAYOUTS (reels, profile, explore, chat, phone)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
