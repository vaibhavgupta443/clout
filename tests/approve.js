// Director approval: the AI proposes, NOTHING changes until you press Approve; Reject changes nothing.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = true;
  w.document.body.classList.add('ingame');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const miaPost = E.addPost({ author: mia.id, text: 'new song is out', buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 50 } });
  let calls = 0;
  G.AI.json = async () => { calls++; return { cost: 0.003, data: { posts: [{ author: kai.id, text: 'approved reply text', replyTo: miaPost.id }], character_updates: [{ who: 'Kai Storm', mood: 'calm' }] } }; };
  const wait = async (f, n = 40) => { for (let i = 0; i < n && !f(); i++) await H.wait(25); return f(); };

  /* ---- Act: the card appears, the world is untouched ---- */
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  $('#stdock textarea').value = 'Kai replied to Mia Vale\'s latest post';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="act"]'));
  check('an approval card appears with Approve and Reject', await wait(() => $('#stdock [data-d="approve"]') && $('#stdock [data-d="reject"]')));
  check('the card says in plain words what would happen', /Kai Storm replies to Mia Vale: “approved reply text”/.test($('#stdock .prop').textContent) && /Kai Storm: mood/.test($('#stdock .prop').textContent), $('#stdock .prop') && $('#stdock .prop').textContent);
  check('NOTHING has changed yet (no post, no mood change)', !Object.values(S.posts).some((p) => p.text === 'approved reply text') && calls === 1);

  /* ---- Reject ---- */
  click($('#stdock [data-d="reject"]'));
  await wait(() => !$('#stdock [data-d="approve"]'));
  await H.wait(100);
  check('Reject: still nothing changed, and the bar says so', !Object.values(S.posts).some((p) => p.text === 'approved reply text') && /Rejected/.test($('#stdock').textContent));

  /* ---- Approve ---- */
  $('#stdock textarea').value = 'Kai replied to Mia Vale\'s latest post';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="act"]'));
  await wait(() => $('#stdock [data-d="approve"]'));
  const callsBefore = calls;
  click($('#stdock [data-d="approve"]'));
  check('Approve: it happens (the reply exists)', await wait(() => Object.values(S.posts).some((p) => p.text === 'approved reply text')));
  await H.wait(150);
  check('approving costs no second AI call', calls === callsBefore);
  check('a Done card with undo follows, and the approval card is gone', !!$('#stdock .done') && !$('#stdock .prop'));
  E.undo();
  check('undo still removes it', !Object.values(G.S.posts).some((p) => p.text === 'approved reply text'));

  /* ---- the switch ---- */
  G.settings.approveActions = false;
  $('#stdock textarea').value = 'Kai replied to Mia Vale\'s latest post';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="act"]'));
  check('with the switch off it just happens (old behaviour)', await wait(() => Object.values(G.S.posts).some((p) => p.text === 'approved reply text')) && !$('#stdock [data-d="approve"]'));

  H.summary('DIRECTOR APPROVAL');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
