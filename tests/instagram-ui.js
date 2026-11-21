// Instagram-style UI: nav, post cards, stories (tray + viewer + posting), DMs (presence/typing/seen), heartbeat, recap.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (sel) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('missing ' + sel);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (mins, chunk = 30) => { for (let i = 0; i < mins / chunk; i++) E.tick(chunk); };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(150);
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'ig' });
  const S = G.S;
  G.World.setSeed(42);
  S.popSize = 0;
  const mk = (i, p, st) => E.makeNpc({ name: 'Person' + i + ' Last', handle: '@p' + i, role: 'friend', age: 25, personality: p, followers: 1000 * (i + 1), aff: 40, status: st || 'friend' });
  const ids = [
    mk(0, 'bubbly, flirty, outgoing, lots of emoji', 'crush').id, mk(1, 'arrogant, sarcastic', 'rival').id, mk(2, 'kind, warm, supportive', 'best_friend').id,
    mk(3, 'shy, quiet introvert', 'friend').id, mk(4, 'ALL CAPS troll who loves drama', 'enemy').id, mk(5, 'confident party girl night owl', 'dating').id,
    mk(6, 'calm disciplined', 'friend').id, mk(7, 'dramatic jealous', 'friend').id,
  ];
  H.seedFeed(30);
  G.UI.go('home');

  /* ---------- shell / nav ---------- */
  check('left rail renders all destinations with SVG icons', $$('#nav .navb[data-page]').length === 13 && $$('#nav .navb[data-page] svg').length === 13, $$('#nav .navb[data-page]').length + ' pages, ' + $$('#nav .navb[data-page] svg').length + ' svgs');
  check('Create button exists', !!$('.navb.create'));
  check('light theme by default', w.document.documentElement.dataset.theme === 'light');
  check('speed buttons in the top bar', $$('#topbar .speed button').length === 4);
  click('#topbar .speed button[data-v="3"]');
  check('speed setting saved', G.settings.worldSpeed === 3 && $('#topbar .speed button.on').dataset.v === '3');
  click('#topbar .speed button[data-v="2"]');

  /* ---------- post cards ---------- */
  run(24 * 60 * 2, 20); // two days of life
  G.UI.go('home');
  const cards = $$('#page > .post');
  check('feed renders Instagram-style post cards', cards.length >= 10, String(cards.length));
  check('each card has header, actions, caption/tile', cards.slice(0, 10).every((c) => c.querySelector('.ph') && c.querySelector('.pacts') && (c.querySelector('.cap') || c.querySelector('.media.txt') || c.querySelector('.poll'))));
  check('like button uses an SVG heart', !!$('.post .ab.like svg'));
  check('picture posts get a generated media tile', $$('.media.pic').length >= 1 || $$('.media.txt').length >= 1);
  check('text posts become text tiles', $$('.media.txt').length >= 1, String($$('.media.txt').length));
  const firstLike = $('.post .ab.like');
  const pid = firstLike.dataset.id;
  const before = S.posts[pid].stats.likes;
  click(firstLike);
  check('tapping the heart likes (and the heart fills)', S.posts[pid].liked === true && S.posts[pid].stats.likes === before + 1 && !!$(`#post-${pid} .ab.like.liked`));
  click($(`#post-${pid} .ab.like`));
  check('tapping again un-likes', S.posts[pid].liked === false && S.posts[pid].stats.likes === before);
  // double tap on a picture likes
  let picPost = null;
  for (let i = 0; i < 40 && !picPost; i++) { picPost = Object.values(S.posts).find((p) => !p.replyTo && (p.attach || ['photo', 'video'].includes(p.ptype))); if (!picPost) run(120, 30); }
  if (picPost) {
    G.UI.feedTab = 'foryou'; G.UI.feedLimit = 400; G.UI.go('home');
    const tile = $(`.media.pic[data-id="${picPost.id}"]`);
    check('picture tile is in the feed', !!tile);
    if (tile) {
      tile.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
      check('double-tap likes the picture', S.posts[picPost.id].liked === true);
      check('heart animation shown', !!$(`.media.pic[data-id="${picPost.id}"] .heartpop`));
    }
  } else check('a picture post appeared within the sim', false);
  G.UI.feedLimit = 40;
  // thread + comments in IG comment rows
  const withKids = Object.values(S.posts).find((p) => !p.replyTo && Object.values(S.posts).filter((x) => x.replyTo === p.id).length >= 2);
  check('some posts have comments', !!withKids);
  if (withKids) {
    G.UI.go('home');
    click(`[data-act="thread"][data-id="${withKids.id}"]`);
    check('thread opens', G.UI.thread === withKids.id);
    check('comments render as compact rows with a tiny heart', $$('.post.cmt').length >= 2 && !!$('.post.cmt .ab.tiny'));
    click('.navb[data-page="home"]');
    check('Home leaves the thread', G.UI.thread === null);
  }

  /* ---------- stories ---------- */
  H.seedStory(S.npcs[ids[0]], S.clock);
  H.seedStory(S.npcs[ids[2]], S.clock);
  H.seedStory(S.npcs[ids[2]], S.clock + 1);
  G.UI.go('home');
  check('stories tray is on Home', !!$('#stories'));
  check('"Your story" cell with plus', !!$('#stories .stry.me .plus'));
  const cells = $$('#stories .stry[data-act="story"]');
  check('tray lists people with active stories', cells.length >= 2, String(cells.length));
  check('unseen stories have the gradient ring', $$('#stories .ring.new').length >= 2);
  const firstId = cells[0].dataset.id;
  const n0 = S.stories.filter((s) => s.author === firstId && s.exp > S.clock).length;
  click(cells[0]);
  check('tapping a story opens the full-screen viewer', !!$('.sv') && w.document.body.classList.contains('story-open'));
  check('progress bars = number of stories', $$('.sv-bar').length === n0, `${$$('.sv-bar').length} vs ${n0}`);
  check('viewer shows the author and a reply box', !!$('.sv-head b') && !!$('#svreply') && $$('.sv-reacts button').length === 7);
  check('story is marked seen', S.stories.filter((s) => s.author === firstId).sort((a, b) => a.t - b.t)[0].seen === true);
  if (n0 > 1) {
    click('.sv-tap.r');
    check('next tap advances to the second story', $$('.sv-bar i.full').length === 1);
    click('.sv-tap.l');
    check('left tap goes back', $$('.sv-bar i.full').length === 0);
  }
  // react
  const rel0 = S.npcs[firstId].aff;
  click($$('.sv-reacts button').find((b) => b.dataset.e === '🔥'));
  const stx = S.stories.find((s) => s.author === firstId && s.rx && s.rx.me);
  check('reacting stores your emoji on the story', !!stx && stx.rx.me === '🔥');
  check('and nudges how they feel about you', S.npcs[firstId].aff >= rel0);
  // reply -> DM
  w.document.querySelector('#svreply').value = 'love this!';
  w.document.querySelector('#svreply').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('typing a reply updates the draft', G.UI.svReply === 'love this!');
  const dmBefore = (S.dms[firstId] || []).length;
  click('.sv-send');
  await sleep(300);
  check('sending a story reply closes the viewer and opens the chat', !$('.sv') && G.UI.page === 'messages' && G.UI.dmWith === firstId);
  check('the reply arrived as a DM from you', (S.dms[firstId] || []).length > dmBefore && S.dms[firstId].some((m) => m.from === 'me' && m.text === 'love this!'));
  // keyboard / close
  G.UI.go('home');
  click($('#stories .stry[data-act="story"]'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Escape closes the viewer', !$('.sv') && !w.document.body.classList.contains('story-open'));
  // auto-advance with timers
  G.UI.go('home');
  click($('#stories .stry[data-act="story"]'));
  const idxBefore = G.UI.sv.i;
  const authorBefore = G.UI.sv.author;
  G.UI.storyNext();
  check('storyNext moves on (next segment or next person or closes)', G.UI.sv.author !== authorBefore || G.UI.sv.i !== idxBefore || !$('.sv'));
  G.UI.closeStory();
  check('closing clears the timer', G.UI.sv.timer === null);

  // watch through everyone: ends cleanly
  G.UI.go('home');
  let guard = 0;
  click($('#stories .stry[data-act="story"]'));
  while ($('.sv') && guard++ < 40) G.UI.storyNext();
  check('watching through all stories ends cleanly', !$('.sv') && guard < 40, String(guard));
  G.UI.go('home');
  check('everything watched -> rings turn grey', $$('#stories .ring.new').length === 0);

  // post your own story
  check('you have no story yet', G.UI.activeStories('me').length === 0);
  click('#stories .stry.me .plus');
  check('story composer opens', !!$('#storytext'));
  click('[data-act="storyShare"]');
  check('empty story is refused', G.UI.activeStories('me').length === 0);
  const ta = $('#storytext');
  ta.value = 'gym then tacos 💪🌮';
  ta.dispatchEvent(new w.Event('input', { bubbles: true }));
  click($$('.pill[data-act="storyEmoji"]').find((b) => b.dataset.e === '💪'));
  check('emoji choice kept and draft survives', G.UI.storyEmoji === '💪' && $('#storytext').value === 'gym then tacos 💪🌮');
  const clock0 = S.clock;
  click('[data-act="storyShare"]');
  const mine = G.UI.activeStories('me');
  check('story posted for 24 hours', mine.length === 1 && mine[0].exp - mine[0].t === 1440 && mine[0].scene.emoji === '💪');
  check('time passes after posting (viewers can show up)', S.clock > clock0);
  check('your ring appears on Home', !!$('#stories .stry.me .ring'));
  run(60 * 8, 20);
  const myStory = G.UI.activeStories('me')[0];
  check('people in the world watch your story over time', myStory && myStory.views.length >= 2, myStory ? String(myStory.views.length) : 'gone');
  G.UI.go('home');
  click('#stories .stry.me .ring');
  check('own-story viewer lists viewers', !!$('.sv-views') && /viewer/.test($('.sv-views').textContent));
  G.UI.closeStory();
  // via the composer's Story type
  const calls0 = H.state.calls;
  G.UI.draft = 'quick one from the composer';
  G.UI.ptype = 'story';
  G.UI.go('home');
  click('[data-act="post"]');
  await sleep(100);
  check('Story type in the composer posts a story (no AI call)', G.UI.activeStories('me').length === 2 && H.state.calls === calls0, String(H.state.calls - calls0));
  // expiry
  run(1500, 60);
  check('stories expire after 24 game hours', G.UI.activeStories('me').length === 0 && S.stories.every((s) => s.exp > S.clock - 60)); // purged at the next hourly sweep
  G.UI.go('home');
  check('expired stories vanish from the tray', !$('#stories .ring.seen[data-act="story"][data-id="me"]'));
  // blocked/muted authors are hidden
  H.seedStory(S.npcs[ids[4]], S.clock);
  S.npcs[ids[4]].muted = true;
  check('muted people do not appear in the tray', !G.UI.storyAuthors().ids.includes(ids[4]));
  S.npcs[ids[4]].muted = false;

  /* ---------- DMs ---------- */
  const crush = S.npcs[ids[0]];
  G.UI.go('messages', { dmWith: ids[0], groupWith: null });
  check('DM header shows presence text', /Active now|Active recently|Offline/.test($('.chathead').textContent));
  const pres = G.Persona.presence(crush, S.clock);
  check('presence matches the persona model', ({ online: 'Active now', away: 'Active recently', offline: 'Offline' }[pres]) && $('.chathead').textContent.includes({ online: 'Active now', away: 'Active recently', offline: 'Offline' }[pres]));
  // force a deterministic scenario: awake + typing
  S.clock = Math.floor(S.clock / 1440) * 1440 + 14 * 60;
  crush.psy.lastActive = S.clock - 5;
  check('online dot for active people', G.Persona.presence(crush, S.clock) === 'online');
  const m = { id: 'mx1', from: 'me', text: 'hey you', t: S.clock, read: true, seen: true, seenAt: S.clock };
  (S.dms[ids[0]] = S.dms[ids[0]] || []).push(m);
  G.World.schedule(S.clock + 3, { type: 'dmreply', npc: ids[0], text: 'heyy' });
  G.UI.go('messages', { dmWith: ids[0], groupWith: null });
  check('typing indicator appears while a reply is about to arrive', !!$('.bubble.typing'));
  check('last message shows Seen', /Seen/.test($$('#chatlog .bubble.me').pop().textContent));
  check('online dot in the header', !!$('.chathead .on-dot'));
  E.tick(10);
  G.UI.go('messages', { dmWith: ids[0], groupWith: null });
  check('typing indicator is gone after the reply lands', !$('.bubble.typing'));
  check('the reply is in the chat', $$('#chatlog .bubble.them').some((b) => /heyy/.test(b.textContent)));
  check('conversation list rows show avatars with presence', $$('.convo .avwrap').length >= 1);

  /* ---------- heartbeat ---------- */
  G.settings.waitForMe = false; // (with it on, an unread message from a friend stops the clock by design: these checks are about the clock itself)
  G.UI.go('home');
  w.scrollTo(0, 0);
  E.addPost({ author: 'me', text: 'hello everyone, what a day', buzz: 5, stats: { likes: 3, reposts: 0, replies: 0, views: 120 } }); // NPCs no longer post on their own: give the heartbeat something of yours to react to
  const posts0 = S.postOrder.length, clock1 = S.clock;
  G.settings.worldSpeed = 3;
  const results = [];
  for (let i = 0; i < 40; i++) { const r = G.Live.beat(); if (r) results.push(r); }
  check('heartbeat advances game time', S.clock > clock1 && results.length === 40);
  check('heartbeat makes things happen (reactions, comments, messages; NPCs no longer post on their own)', S.postOrder.length > posts0 || results.some((r) => r.comments > 0) || (S.sim.day.likes + S.sim.day.comments + S.sim.day.dms + S.sim.day.follows) > 0, `${S.postOrder.length - posts0} posts, day ${JSON.stringify(S.sim.day)}`);
  check('heartbeat keeps the world consistent', invariants(G).length === 0, invariants(G).slice(0, 2).join('; '));
  G.settings.worldSpeed = 0;
  const c2 = S.clock;
  G.Live.beat();
  check('paused world does not move', S.clock === c2);
  G.settings.worldSpeed = 2;
  // does not redraw while typing
  G.UI.go('home');
  const box = $('#composer');
  box.focus();
  box.value = 'half-written post';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  const nodeBefore = $('#page');
  const html0 = nodeBefore.innerHTML;
  for (let i = 0; i < 6; i++) G.Live.beat();
  check('while you type, the page is not redrawn (no lost text)', $('#composer') === box && box.value === 'half-written post' && $('#page').innerHTML === html0);
  box.blur();
  G.UI.draft = '';
  // pill when scrolled down
  G.UI.go('home');
  Object.defineProperty(w, 'scrollY', { value: 900, configurable: true });
  for (let i = 0; i < 30; i++) G.Live.beat();
  check('when scrolled down, new posts show as a pill instead of jumping', !!$('#newpill') || G.Live.newPosts === 0);
  if ($('#newpill')) {
    Object.defineProperty(w, 'scrollY', { value: 0, configurable: true });
    click('#newpill');
    check('tapping the pill refreshes and removes it', !$('#newpill') && G.Live.newPosts === 0);
  }
  Object.defineProperty(w, 'scrollY', { value: 0, configurable: true });
  // modal open -> no redraw
  G.UI.modal('<p id="keepme">modal</p>');
  for (let i = 0; i < 4; i++) G.Live.beat();
  check('open modal survives the heartbeat', !!$('#keepme'));
  G.UI.closeModal();
  // badges update without redraw
  const homeNode = $('#page');
  G.UI.go('settings');
  const dmCount = () => G.UI.badgeCounts().messages;
  Object.values(S.dms).forEach((l) => l.forEach((m) => (m.read = true)));
  Object.values(S.groups || {}).forEach((g) => g.msgs.forEach((m) => (m.read = true)));
  S.dms[ids[3]] = [{ id: 'mq', from: ids[3], text: 'ping', t: S.clock, read: false }];
  G.UI.refreshBadges();
  check('nav badge updates without re-rendering the page', dmCount() >= 1 && /\d/.test($('.navb[data-page="messages"] .badge').textContent));
  S.dms[ids[3]][0].read = true;
  G.UI.refreshBadges();
  check('badge disappears when read', !$('.navb[data-page="messages"] .badge'));

  /* ---------- recap ---------- */
  G.UI.go('home');
  S.sim.lastReal = Date.now() - 6 * 3600 * 1000; // away for 6 real hours
  const p1 = S.postOrder.length;
  const rec = G.Live.catchUp();
  check('coming back runs a catch-up (capped at one game-day) and no NPC post appears by itself', rec && rec.minutes === 1440 && S.postOrder.slice(p1).every((id) => !S.posts[id] || S.posts[id].replyTo || S.posts[id].author === 'me' || !S.npcs[S.posts[id].author]));
  check('recap card shows what you missed', !!$('.card.recap') && /While you were away/.test($('.card.recap').textContent));
  click('[data-act="dismissRecap"]');
  check('recap can be dismissed', !S.recap && !$('.card.recap'));
  check('the catch-up kept everything consistent', invariants(G).length === 0);

  /* ---------- every page still renders in the new skin ---------- */
  for (const pg of ['home', 'explore', 'town', 'notifs', 'messages', 'people', 'drama', 'director', 'shop', 'me', 'settings']) {
    G.UI.go(pg);
    check('page renders: ' + pg, $('#page').innerHTML.length > 50 && !/Something broke/.test($('#page').innerHTML));
  }
  check('settings theme choices include light/dark/amoled', /Light/.test($('#page').innerHTML) && /Dark/.test($('#page').innerHTML));
  for (const th of ['dark', 'amoled', 'light']) { G.settings.theme = th; G.UI.render(); check('theme ' + th + ' applies', w.document.documentElement.dataset.theme === th); }

  H.summary('INSTAGRAM UI: cards, stories, DMs, heartbeat');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
