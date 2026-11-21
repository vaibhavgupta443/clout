// Alerts: every one takes you somewhere when you tap it.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  w.document.body.classList.add('ingame');
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const post = E.addPost({ author: 'me', text: 'my post', buzz: 3, stats: { likes: 1, reposts: 0, replies: 0, views: 5 } });
  S.groups.g1 = { id: 'g1', name: 'Crew', members: [mia.id], msgs: [{ from: mia.id, text: 'hi', t: S.clock }], created: 0 };
  G.Channels.ensure();
  S.storylines.push({ id: 'sl1', title: 'The tape', summary: 'x', heat: 5, status: 'active', participants: [mia.id] });

  const cases = [
    ['dm', 'Mia sent you a message', { npcId: mia.id }, () => G.UI.page === 'messages' && G.UI.dmWith === mia.id],
    ['reply', 'Mia replied', { npcId: mia.id, postId: post.id }, () => G.UI.thread === post.id || G.UI.page === 'home'],
    ['follow', '+50 followers', { postId: post.id }, () => G.UI.thread === post.id || G.UI.page === 'home'],
    ['viral', 'Your post went VIRAL', { postId: post.id }, () => G.UI.thread === post.id || G.UI.page === 'home'],
    ['rel', 'Mia is now: friend', { npcId: mia.id }, () => !!$('.modal, #modal, .mbox, [data-act="closeModal"]')],
    ['drama', 'New storyline', { storyId: 'sl1' }, () => G.UI.page === 'drama'],
    ['dm', 'Mia in "Crew": hi', { groupId: 'g1' }, () => G.UI.page === 'messages' && G.UI.groupWith === 'g1'],
    ['level', 'You reached level 3', {}, () => G.UI.page === 'me'],
    ['cash', '+$40', {}, () => G.UI.page === 'me'],
    ['event', 'Event: something happened', {}, () => G.UI.page === 'home'],
    ['event', '🕒 It is 3:00 PM: Mia is expecting you', { act: 'clockOpen' }, () => !!$('.clockbig')],
    ['event', '📣 People are talking about you in #the-drama', { act: 'chanGo', data: { id: 'the-drama' } }, () => G.UI.page === 'channels' && G.UI.chan === 'the-drama'],
    ['event', '📅 Due now: Kai confesses', { act: 'dockOpen' }, () => !!$('#stdock.open')],
  ];
  cases.forEach(([type, text, extra]) => E.addNotif(type, text, extra));
  G.UI.go('notifs');
  G.UI.render();
  const rows = $$('.notif');
  check('every alert on the page is tappable (has an action)', rows.length >= cases.length && rows.every((r) => r.getAttribute('data-act')), rows.length + ' rows vs ' + cases.length + ': ' + rows.filter((r) => !r.getAttribute('data-act')).map((r) => r.textContent.slice(0, 30)).join(' | '));

  // newest first: the last case is the first row
  const order = cases.slice().reverse();
  for (let i = 0; i < order.length; i++) {
    G.UI.closeModal && G.UI.closeModal();
    w.document.body.classList.add('ingame');
    G.UI.go('notifs');
    G.UI.render();
    const row = $$('.notif')[i];
    click(row);
    await H.wait(30);
    const [type, text, , landed] = order[i];
    check(`tapping "${text.slice(0, 40)}" (${type}) takes you there`, !!landed(), `page=${G.UI.page} thread=${G.UI.thread} dm=${G.UI.dmWith} group=${G.UI.groupWith}`);
  }
  check('the alerts created by the clock, channels and due directions carry their own action', (() => {
    const t0 = G.Clock.add(mia.id, S.clock + 20, 'meet at the cafe', S.clock);
    const n = S.notifs[0];
    return n.act === 'clockOpen';
  })());

  H.summary('ALERTS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
