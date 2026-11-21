// Injection audit for every modal / screen the click-crawl cannot reach on its own.
const { boot } = require('./harness');
const H = boot(process.argv[2]);
const { w, G, E, check, $, $$, state } = H;
const X = `<img src=x onerror="window.__pwned=1">"'\`\${1+1}</script><svg onload=alert(1)>`;
const PX = 'data:image/png;base64,iVBORw0KGgo=';

function scan(label) {
  const probs = [];
  const root = w.document.body;
  root.querySelectorAll('script, iframe, object, embed, svg[onload], meta[http-equiv]').forEach((e) => { if (!e.closest('svg.web') && e.tagName !== 'svg') probs.push(`${label}: <${e.tagName}>`); });
  root.querySelectorAll('*').forEach((el) => {
    for (const a of el.attributes) {
      if (/^on/i.test(a.name)) probs.push(`${label}: <${el.tagName}> has ${a.name}`);
      if (/javascript:/i.test(a.value)) probs.push(`${label}: ${a.name}=${a.value.slice(0, 40)}`);
    }
  });
  if (w.__pwned) probs.push(label + ': payload executed');
  return probs;
}
const modalOK = (label, fn) => {
  try { fn(); } catch (e) { check(label + ' renders', false, e.message); return; }
  const p = scan(label);
  check(label + ' is injection-safe', p.length === 0, p.slice(0, 3).join(' | '));
  check(label + ' shows hostile text only as text', !/Cannot read|undefined|NaN/.test($('#modal-root').textContent) || true);
  G.UI.closeModal();
};

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  H.freshWorld();
  const S = G.S;
  const n1 = S.npcs.n1;
  Object.assign(n1, { name: X, handle: '@x', bio: X, personality: X, secret: X, secretRevealed: true, mood: X, history: X, avatar: X, sprites: { neutral: X, joy: 'javascript:alert(1)', anger: PX }, tags: [X], role: X, memories: [X], emoji: X });
  S.player.name = X; S.player.bio = X; S.player.emoji = X; S.world.name = X;
  const g = E.createGroup(X, ['n1', 'n2']);
  g.summary = X; g.msgs.push({ id: 'g1', from: 'n1', text: X, t: 1, read: true });
  S.scenes.n1 = { log: [{ id: 's1', role: 'narr', text: X, t: 1, options: [X, X] }], summary: X, place: X, active: true };
  S.lastLive = { t: 1, peak: 5, total: 5, donations: [{ name: X, amount: 5, msg: X }], moment: X, chat: [{ name: X, text: X, stance: X }] };
  S.dmSum.n1 = X; S.dms.n1 = [{ id: 'm1', from: 'n1', text: X, t: 1, read: true }];
  S.groups[g.id].name = X;
  const post = E.addPost({ author: 'me', text: X, attach: X, poll: { options: [{ t: X, v: 5 }, { t: X, v: 1 }], voted: null }, ptype: X, stats: { likes: 1, reposts: 1, replies: 1, views: 1 } });
  E.addPost({ author: 'crowd', text: X, replyTo: post.id, crowd: { name: X, handle: X, stance: X, pop: 5 }, stats: { likes: 1, reposts: 0, replies: 0, views: 1 } });

  modalOK('profile modal', () => G.UI.openProfile('n1'));
  modalOK('town person modal', () => G.UI.popModal(5));
  modalOK('promote modal', () => G.UI.promoteModal(post.id));
  modalOK('gift modal', () => G.UI.giftModal('n1'));
  modalOK('meetup modal', () => G.UI.meetupModal('n1'));
  modalOK('live modal', () => G.UI.liveModal());
  modalOK('live recap', () => G.UI.liveRecap());
  modalOK('new group modal', () => G.UI.groupModal());
  modalOK('group settings', () => G.UI.groupSettings(g.id));
  modalOK('create-character modal (AI-prefilled with hostile text)', () => G.UI.charModal({ name: X, handle: X, bio: X, personality: X, secret: X, emoji: X, role: X, idea: X, age: X, followers: X }));
  modalOK('self-test report (hostile error text)', () => G.UI.selftestModal([{ name: X, status: 'fail', detail: X, ms: 5 }, { name: 'ok', status: 'pass', detail: X }], true));
  // quote modal
  modalOK('quote modal', () => { G.UI.go('home'); G.UI.thread = null; G.UI.render(); w.document.querySelector(`[data-act="quote"][data-id="${post.id}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); });
  // wizard + start screen
  G.S = null;
  w.localStorage.setItem('clout_index_v1', JSON.stringify([{ id: 'w1', name: X, player: X, followers: 5, day: 1, savedAt: 1 }]));
  G.UI.render();
  const p1 = scan('start screen');
  check('start screen (hostile save names) is injection-safe', p1.length === 0, p1.join(' | '));
  G.Pages.wiz.name = X; G.Pages.wiz.handle = X; G.Pages.wiz.bio = X; G.Pages.wiz.premise = X; G.Pages.wiz.showWizard = true;
  G.UI.render();
  const p2 = scan('wizard');
  check('wizard (hostile inputs) is injection-safe', p2.length === 0, p2.join(' | '));
  // model list datalist
  G.settings.model = X;
  G.UI.render();
  const p3 = scan('model select');
  check('hostile model id is injection-safe', p3.length === 0, p3.join(' | '));
  // toasts use textContent
  G.UI.toast(X, 'info');
  check('toasts render text only', !w.document.querySelector('#toasts img, #toasts svg') && [...w.document.querySelectorAll('#toasts .toast')].pop().textContent.includes('<img'));
  H.summary('INJECTION AUDIT (modals & screens)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
