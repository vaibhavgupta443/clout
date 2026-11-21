// The phone's / browser's Back button (swipe or hardware): every layer opened on top of the feed gets a history entry,
// and Back closes the top layer instead of leaving the app. Also checks the in-app Back button, pause and speed buttons.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const modalOpen = () => w.document.body.classList.contains('modal-open');
const back = async (n = 1) => { for (let i = 0; i < n; i++) { w.history.back(); await H.wait(60); } };
const settle = () => H.wait(80);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;
  G.UI.go('home');
  await settle();
  const N = G.Live.nav;
  const root0 = $('#page');
  const postId = S.postOrder.filter((i) => !S.posts[i].replyTo)[0];

  check('on the feed with nothing open there are no extra history entries', N.depth === 0 && N.layers() === 0);

  /* ---- pause + speed ---- */
  const speeds = [0, 4, 10, 25];
  for (let v = 0; v < 4; v++) {
    click(`#topbar .speed button[data-v="${v}"]`);
    const c0 = S.clock;
    G.World.live();
    check(`speed button ${v} moves the world ${speeds[v]} min per beat and is highlighted`, S.clock - c0 === speeds[v] && $('#topbar .speed button.on').dataset.v === String(v), S.clock - c0);
  }
  click('#topbar .speed button[data-v="0"]');
  const c1 = S.clock, p1 = S.postOrder.length, f1 = S.player.followers;
  for (let i = 0; i < 60; i++) G.Live.beat();
  check('PAUSED: 60 heartbeats change nothing (clock, posts, followers)', S.clock === c1 && S.postOrder.length === p1 && S.player.followers === f1);
  const c2 = S.clock;
  E.tick(60);
  check('the manual +time buttons still work while paused', S.clock === c2 + 60);
  click('#topbar .speed button[data-v="2"]');
  const c3 = S.clock;
  G.Live.beat();
  check('un-pausing: time flows again', S.clock > c3);

  /* ---- in-app Back button ---- */
  G.UI.acts.thread({ id: postId });
  await settle();
  check('opening a thread adds one history entry', G.UI.thread === postId && N.depth === 1);
  click('[data-act="back"]');
  await settle();
  check('the in-app "← Back" returns to the feed and gives the history entry back', G.UI.thread === null && N.depth === 0);

  /* ---- phone Back: thread ---- */
  G.UI.acts.thread({ id: postId });
  await settle();
  await back();
  check('phone Back closes the thread (back on the feed, app not left)', G.UI.thread === null && G.UI.page === 'home' && N.depth === 0);

  /* ---- phone Back: profile modal ---- */
  G.UI.openProfile('n1');
  await settle();
  check('opening a profile adds a history entry', modalOpen() && N.depth === 1);
  await back();
  check('phone Back closes the profile', !modalOpen() && N.depth === 0);
  G.UI.openProfile('n1');
  await settle();
  click('.modal .close');
  await settle();
  check('closing with ✕ also releases the history entry (no ghost entry left)', !modalOpen() && N.depth === 0);
  G.UI.openProfile('n1');
  await settle();
  click('.modal-bg');
  await settle();
  check('tapping outside closes it and releases the entry', !modalOpen() && N.depth === 0);

  /* ---- profile → another profile does not stack up ---- */
  G.UI.openProfile('n1');
  G.UI.openProfile('n2');
  await settle();
  check('profile → profile uses a single entry', N.depth === 1);
  await back();
  check('one Back closes it', !modalOpen() && N.depth === 0);

  /* ---- tab → thread → profile : three Backs unwind in order ---- */
  G.UI.go('messages');
  await settle();
  check('opening another tab is one layer', N.depth === 1 && G.UI.page === 'messages');
  G.UI.go('explore');
  await settle();
  check('switching between tabs does not pile up entries', N.depth === 1 && G.UI.page === 'explore');
  G.UI.acts.thread({ id: postId });
  await settle();
  G.UI.openProfile('n2');
  await settle();
  check('tab → thread → profile: opening the thread replaces the tab layer, so thread + profile = 2 layers', N.depth === 2 && modalOpen(), 'depth ' + N.depth);
  await back();
  check('Back 1: profile closes, thread stays', !modalOpen() && G.UI.thread === postId);
  await back();
  check('Back 2: thread closes', G.UI.thread === null && G.UI.page === 'home' && N.depth === 0);

  /* ---- tab → Back goes Home ---- */
  G.UI.go('notifs');
  await settle();
  await back();
  check('Back from another tab goes Home', G.UI.page === 'home' && N.depth === 0);

  /* ---- Back on the feed with nothing open does nothing harmful ---- */
  const before = JSON.stringify([G.UI.page, G.UI.thread]);
  await back();
  check('Back with nothing open changes nothing and never goes below 0', JSON.stringify([G.UI.page, G.UI.thread]) === before && N.depth === 0);

  /* ---- nav to Home from inside a thread releases entries ---- */
  G.UI.acts.thread({ id: postId });
  await settle();
  click('.navb[data-page="home"]');
  await settle();
  check('tapping Home inside a thread releases the entries', G.UI.thread === null && N.depth === 0);

  /* ---- a layer closing and another opening in the same click (replying from a story, closing a modal then navigating) ---- */
  G.UI.openProfile('n1');
  await settle();
  G.UI.closeModal();
  G.UI.go('messages');
  await settle();
  await H.wait(150); // a late history jump must not bounce us back out
  check('close a modal + open a tab in the same tick: we stay on the tab (no bounce) and hold one entry', G.UI.page === 'messages' && !modalOpen() && N.depth === 1, `page ${G.UI.page} depth ${N.depth}`);
  await back();
  check('…and Back then goes Home', G.UI.page === 'home' && N.depth === 0);
  G.UI.go('explore');
  await settle();
  G.UI.openProfile('n1');
  G.UI.closeModal();
  G.UI.openProfile('n2');
  G.UI.closeModal();
  G.UI.go('home');
  G.UI.go('notifs');
  await settle();
  await H.wait(150);
  check('a burst of opens/closes in one tick settles on the final state', G.UI.page === 'notifs' && N.depth === 1 && !modalOpen(), `page ${G.UI.page} depth ${N.depth}`);
  G.UI.go('home');
  await settle();

  /* ---- hammering ---- */
  for (let i = 0; i < 25; i++) {
    G.UI.openProfile('n1');
    if (i % 3 === 0) G.UI.go('explore');
    if (i % 4 === 0) G.UI.acts.thread({ id: postId });
    if (i % 2 === 0) await back(); else if ($('.modal .close')) click('.modal .close');
  }
  await settle();
  await back(4);
  await settle();
  check('25 random open/close/back sequences: depth is consistent and nothing is stuck open', N.depth === N.layers(), `depth ${N.depth} layers ${N.layers()}`);
  G.UI.go('home'); await settle();
  check('afterwards everything closes cleanly and Home leaves zero entries', N.depth === 0 && N.layers() === 0);
  check('invariants at the end', invariants(G).length === 0);

  H.summary('BACK BUTTON + PAUSE');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
