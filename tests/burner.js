// Burner accounts (post / reply / comment / chat / like / follow / stories, all as the account), @ + # tagging, edit post, delete account.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const typeInto = (el, text) => { el.focus(); el.value = text; el.setSelectionRange(text.length, text.length); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const A = () => G.UI.acts;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');

  /* ---------- create ---------- */
  $('#modal-root') || 0;
  G.UI.go('home');
  A().altNew();
  $('#altname').value = 'The Gossip Desk';
  $('#althandle').value = '@gossipdesk';
  A().altCreate();
  const alt = E.activeAlt();
  check('a burner account is created and becomes the active account', !!alt && alt.userAlt === true && alt.handle === '@gossipdesk' && S.activeAlt === alt.id);
  check('the "Posting as" strip names the burner', /Gossip Desk/.test($('.composer').textContent));

  /* ---------- the simulation never plays the burner ---------- */
  const before = JSON.stringify({ posts: Object.values(S.posts).filter((p) => p.author === alt.id).length, stories: (S.stories || []).filter((s) => s.author === alt.id).length, dms: (S.dms[alt.id] || []).length });
  for (let i = 0; i < 10; i++) E.tick(1440);
  const after = JSON.stringify({ posts: Object.values(S.posts).filter((p) => p.author === alt.id).length, stories: (S.stories || []).filter((s) => s.author === alt.id).length, dms: (S.dms[alt.id] || []).length });
  check('10 simulated days: the world never posts, stories or texts as your burner account', before === after, before + ' → ' + after);
  check('the world never sends the burner DMs of its own either (no thread under its id)', !S.dms[alt.id] || S.dms[alt.id].length === 0);

  /* ---------- post + comment + reply as the burner ---------- */
  const r1 = await E.post('anyone seen @miav at the cafe? 👀', '', null, { type: 'text' }, alt.id);
  const post = Object.values(S.posts).find((p) => p.author === alt.id && !p.replyTo);
  check('posting as the burner works and is authored by it', !!r1 && !!post && post.text.includes('@miav'));
  check('tagging @miav scheduled a reaction from Mia in the free simulation', S.queue.some((q) => q.type === 'react' && q.npc === mia.id && q.post === post.id) || (S.posts && Object.values(S.posts).some((p) => p.author === mia.id && p.replyTo === post.id)));
  const target = S.postOrder.map((id) => S.posts[id]).find((p) => p && p.author === 'n2' && !p.replyTo);
  G.UI.go('home');
  const card = $(`.post[data-id="${target.id}"]`) || $('.post');
  const box = card && card.querySelector('.addc input');
  if (box) {
    box.value = 'lol same';
    click(card.querySelector('.addc [data-act="inlineComment"]'));
    await H.wait(120);
  } else await E.reply(target.id, 'lol same', alt.id);
  const cm = Object.values(S.posts).find((p) => p.replyTo && p.text === 'lol same');
  check('a quick comment on the feed is written as the burner (not as you)', !!cm && cm.author === alt.id, cm && cm.author);
  const rr = await E.reply(target.id, 'thread reply from burner', alt.id);
  check('a thread reply is written as the burner', Object.values(S.posts).some((p) => p.text === 'thread reply from burner' && p.author === alt.id));
  const st = E.postStory('late night thoughts', null, alt.id);
  check('a story can be shared as the burner', !!st && st.author === alt.id);
  // the Story composer page and quote-posts used to ignore the active burner and go out as YOU
  G.UI.storyDraft = 'story from the composer page';
  A().storyShare();
  const st2 = (S.stories || []).find((x) => x.text === 'story from the composer page');
  check('the Story composer page posts as the burner too, not as you', !!st2 && st2.author === alt.id, st2 && st2.author);
  A().quote({ id: post.id });
  $('#quotebox').value = 'quoting from my burner';
  await A().sendQuote({ id: post.id });
  await H.wait(60);
  const qp = Object.values(S.posts).find((p) => p.text === 'quoting from my burner');
  check('a quote-post made while on the burner is the burner\'s', !!qp && qp.author === alt.id && qp.quote === post.id, qp && qp.author);
  check('and none of it touched YOUR numbers or posts', S.player.posts === 0 && !Object.values(S.posts).some((p) => p.author === 'me' && /composer page|quoting from my burner/.test(p.text)) && !(S.stories || []).some((x) => x.author === 'me' && /composer page/.test(x.text)));
  G.UI.go('home');
  G.UI.render();
  check('the feed tags a burner post with 🎭 burner, so it is never mistaken for yours', /burner/.test(($('#post-' + post.id) || { textContent: '' }).textContent), ($('#post-' + post.id) || {}).className);

  /* ---------- like / follow as the burner ---------- */
  const likes0 = target.stats.likes;
  const mainLiked0 = !!target.liked;
  A().like({ id: target.id });
  check('liking as the burner adds a like from it, not from you', target.stats.likes === likes0 + 1 && (target.likedBy || []).includes(alt.id) && !!target.liked === mainLiked0);
  check('the heart shows as liked while acting as the burner', G.UI.liked(target) === true);
  A().like({ id: target.id });
  check('un-liking removes it again', target.stats.likes === likes0 && !(target.likedBy || []).includes(alt.id));
  const f0 = S.player.following.slice();
  const affBefore = mia.aff;
  A().follow({ id: mia.id });
  check('following as the burner follows with the burner (your own following list and Mia\'s feelings are untouched)', (alt.following || []).includes(mia.id) && JSON.stringify(S.player.following) === JSON.stringify(f0) && mia.aff === affBefore && G.UI.following(mia.id));
  A().follow({ id: mia.id });
  check('unfollow works', !(alt.following || []).includes(mia.id));

  /* ---------- chat as the burner: separate thread, NPC does not know you ---------- */
  const mainBefore = (S.dms[mia.id] || []).length;
  const stat0 = [mia.aff, mia.rom, mia.riv, mia.trust, mia.status].join('|');
  const res = await E.altDm(alt.id, mia.id, 'hey, who are you really?');
  const th = (S.altDms[alt.id] || {})[mia.id] || [];
  check('a DM as the burner lands in the burner\'s own thread', !!res && th.length >= 1 && th[0].from === 'me' && th[0].as === alt.id);
  check('your real chat with Mia is untouched', (S.dms[mia.id] || []).length === mainBefore);
  for (let i = 0; i < 40 && th.filter((m) => m.from === mia.id).length === 0; i++) E.tick(60);
  const reply = th.find((m) => m.from === mia.id);
  check('Mia answers the burner (free simulation) in the burner\'s thread', !!reply && reply.to === alt.id);
  check('…and the notification names the burner account', S.notifs.some((n) => n.type === 'dm' && n.alt === alt.id && n.npcId === mia.id));
  const same = () => Math.abs(mia.aff - +stat0.split('|')[0]) <= 1 && mia.rom === +stat0.split('|')[1] && mia.status === stat0.split('|')[4]; // +-1 = the normal slow drift of an ignored friend
  check('Mia\'s feelings about YOU did not change (she does not know it is you)', same());
  check('your main DM thread with Mia still has no burner messages in it', !(S.dms[mia.id] || []).some((m) => m.as === alt.id || m.to === alt.id));

  // Messages page
  G.UI.go('messages', { dmWith: mia.id, groupWith: null });
  await H.wait(30);
  check('Messages page shows the burner chat while acting as the burner', $$('.bubble').some((b) => /who are you really/.test(b.textContent)) && /Messaging as/.test($('.msgs').textContent));
  check('the new-message picker never lists your own burner accounts', !$$('#newchat option').some((o) => o.value === alt.id));
  A().altSwitch({});
  G.UI.go('messages', { dmWith: mia.id, groupWith: null });
  await H.wait(30);
  check('switching back to the main account hides the burner chat', !$$('.bubble').some((b) => /who are you really/.test(b.textContent)));
  A().altSwitch({ id: alt.id });

  // AI path: a stubbed model answers; no relationship numbers may change
  const realReady = G.AI.ready, realJson = G.AI.json;
  G.AI.ready = () => true;
  let seen = '';
  G.AI.json = async (o) => { seen = o.user; return { data: { dms: [{ from: mia.id, text: 'who is this?' }, { from: 'n999', text: 'ignored' }], rel: [{ id: mia.id, aff: 40, status: 'dating' }] }, cost: 0 }; };
  await E.altDm(alt.id, mia.id, 'good evening');
  G.AI.ready = realReady; G.AI.json = realJson;
  const th2 = S.altDms[alt.id][mia.id];
  check('AI path: the model sees an anonymous account, not the player', /does NOT know the human player is behind this account/.test(seen) && !/PLAYER ACTION/.test(seen));
  check('AI path: her answer lands in the burner thread; strangers\' lines and rel changes are ignored', th2.some((m) => m.text === 'who is this?' && m.to === alt.id) && !th2.some((m) => m.text === 'ignored') && same() && mia.status !== 'dating');
  G.AI.ready = () => true;
  G.AI.json = async () => { throw new Error('model down'); };
  const t0 = th2.length;
  await E.altDm(alt.id, mia.id, 'still there?');
  G.AI.ready = realReady; G.AI.json = realJson;
  check('AI failure: your message is kept and the free simulation answers instead', S.altDms[alt.id][mia.id].length >= t0 + 1 && S.altDms[alt.id][mia.id].some((m) => m.text === 'still there?'));

  // unread badge + opening from a notification
  S.altDms[alt.id][mia.id].push({ id: 'mx1', from: mia.id, to: alt.id, text: 'psst', t: S.clock, read: false });
  check('unread burner chats count in the Messages badge', G.UI.badgeCounts().messages >= 1);
  A().altSwitch({});
  A().openChat({ id: mia.id, alt: alt.id });
  check('opening a notification about a burner chat switches to that account', S.activeAlt === alt.id && G.UI.dmWith === mia.id);

  /* ---------- tagging: @ and # ---------- */
  G.UI.go('home');
  await H.wait(30);
  const comp = $('#composer');
  typeInto(comp, 'hello @ka');
  let pop = $('#tagpop');
  check('typing @ka opens the suggestion list with Kai first', !!pop && pop.querySelector('.tagrow.on').textContent.includes('Kai'), pop && pop.textContent);
  check('the list never offers your own burner account', !/gossipdesk/i.test(pop ? pop.textContent : ''));
  key(comp, 'Enter');
  check('Enter picks the person (inserts the handle, keeps the rest of the text) and does not post', comp.value === 'hello @kai ' && !$('#tagpop') && G.UI.draft === 'hello @kai ', comp.value);
  typeInto(comp, '@');
  check('a bare @ lists people (the best-known first)', $$('#tagpop .tagrow').length >= 3);
  key(comp, 'ArrowDown');
  key(comp, 'Escape');
  check('Escape closes the list and leaves the text alone', !$('#tagpop') && comp.value === '@');
  S.trending = [{ tag: '#hexlife', heat: 60 }];
  typeInto(comp, 'so #hex');
  check('typing # suggests topics from what is trending', !!$('#tagpop') && /#hexlife/i.test($('#tagpop').textContent), $('#tagpop') && $('#tagpop').textContent);
  typeInto(comp, 'mail me at a@b.com');
  check('an e-mail address does not trigger tagging', !$('#tagpop'));
  typeInto(comp, 'hey @zzzzqqq');
  check('no match → no list', !$('#tagpop'));
  comp.value = '';
  click('[data-act="tagPick"][data-for="composer"]');
  check('the ＠ Tag button inserts an @ and opens the list', comp.value.endsWith('@') && !!$('#tagpop'));
  const items = $$('#tagpop .tagrow');
  items[1].dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  check('tapping a suggestion inserts that person', /^@[a-z0-9_.]+ $/.test(comp.value) && !$('#tagpop'), comp.value);
  // DM box: Enter while the list is open must not send
  G.UI.go('messages', { dmWith: mia.id, groupWith: null });
  await H.wait(30);
  const dmbox = $('#dmbox');
  const sent0 = S.altDms[alt.id][mia.id].length;
  typeInto(dmbox, 'tell @de');
  key(dmbox, 'Enter');
  await H.wait(60);
  check('in a chat box, Enter on a suggestion tags the person and does NOT send the message', S.altDms[alt.id][mia.id].length === sent0 && /@dex /.test(dmbox.value), dmbox.value);
  // as the main account the main chat is used
  A().altSwitch({});
  G.UI.go('messages', { dmWith: mia.id, groupWith: null });
  await H.wait(30);
  const main0 = (S.dms[mia.id] || []).length;
  typeInto($('#dmbox'), 'main account says hi');
  A().sendDm({ id: mia.id });
  await H.wait(80);
  check('as the main account the message goes to your real chat', (S.dms[mia.id] || []).length > main0 && (S.dms[mia.id] || []).some((m) => m.text === 'main account says hi' && !m.as));

  /* ---------- edit post ---------- */
  A().altSwitch({ id: alt.id });
  const mine = Object.values(S.posts).find((p) => p.author === alt.id && !p.replyTo);
  A().editPost({ id: mine.id });
  $('#editbox').value = 'anyone seen @miav at the cafe today? 👀👀';
  A().editPostSave({ id: mine.id });
  check('a burner account can edit its own post; it is marked as edited', mine.text.endsWith('👀👀') && mine.edited === true);
  const others = Object.values(S.posts).find((p) => p.author === 'n2' && !p.replyTo);
  check('other people\'s posts cannot be edited', E.editPost(others.id, 'hacked') === false && others.text !== 'hacked');
  check('an empty edit is refused', E.editPost(mine.id, '   ') === false);
  const own = await E.post('main account post', '', null, { type: 'text' }, null);
  const myMain = Object.values(S.posts).find((p) => p.author === 'me' && p.text === 'main account post');
  check('you can edit your own main post too', E.editPost(myMain.id, 'main account post (fixed)') === true && myMain.text.includes('(fixed)'));
  G.UI.go('home');
  check('the feed shows the edit button on your posts', !!$('[data-act="editPost"]'));

  /* ---------- delete the burner ---------- */
  const ids = Object.values(S.posts).filter((p) => p.author === alt.id).map((p) => p.id);
  const likedBefore = target.stats.likes;
  A().like({ id: target.id });
  const cfm = w.confirm; w.confirm = () => true;
  A().altDelete({ id: alt.id });
  w.confirm = cfm;
  check('deleting the burner removes the account', !S.npcs[alt.id] && !S.activeAlt);
  check('…its posts, replies, stories and chats', ids.every((id) => !S.posts[id]) && !(S.stories || []).some((s) => s.author === alt.id) && !(S.altDms || {})[alt.id]);
  check('…its likes and notifications', !Object.values(S.posts).some((p) => (p.likedBy || []).includes(alt.id)) && target.stats.likes === likedBefore && !S.notifs.some((n) => n.alt === alt.id || n.npcId === alt.id));
  check('the feed and every page still draw after the burner is gone', (() => { try { for (const pg of ['home', 'explore', 'messages', 'notifs', 'people', 'me']) { G.UI.go(pg); } return true; } catch (e) { return false; } })());
  check('invariants at the end', invariants(G).length === 0, invariants(G).join(';'));

  H.summary('BURNER ACCOUNTS + TAGGING');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
