// Admin / command center + world control: feed-rate dial, act as any character, slash commands, character dossiers + Author's Note + lore
// reaching the AI, and the "build my own story" brief in the world wizard.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const A = () => G.UI.acts;
const run = (line) => E.Admin.run(line);
const run0 = async (line) => { E.Admin.setOn(true); const r = await E.Admin.run(line); E.Admin.setOn(false); return r; };
const fails = async (line) => { try { await run(line); return null; } catch (e) { return e; } };

const mkWorld = (n = 14) => {
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;
  for (let i = 0; i < n; i++) E.makeNpc({ name: 'Person ' + i, handle: '@person' + i, age: 22 + (i % 20), personality: ['bubbly, lots of emoji', 'dry sarcasm', 'ALL CAPS energy', 'kind and warm'][i % 4], followers: 800 + i * 300, role: 'friend' });
  return S;
};
const npcPosts = (S) => Object.values(S.posts).filter((p) => !p.replyTo && S.npcs[p.author]).length;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  let S = mkWorld();

  /* ================= 1. the activity dial ================= */
  check('the default activity is Calm (0.6), lower than before', G.World.feedRate() === 0.6 && G.Store.DEFAULTS === undefined || G.World.feedRate() === 0.6);
  const volume = (rate, days = 4) => {
    S = mkWorld();
    G.settings.feedRate = rate;
    const before = npcPosts(S);
    const seen = [];
    const off = E.tick; // count by clock days
    for (let d = 0; d < days; d++) E.tick(1440);
    return npcPosts(S) - before;
  };
  const v0 = volume(0), v25 = volume(0.25), v6 = volume(0.6), v1 = volume(1), v16 = volume(1.6);
  console.log('posts in 4 days  silent', v0, 'quiet', v25, 'calm', v6, 'normal', v1, 'busy', v16);
  check('Silent: nobody posts on their own', v0 === 0, v0);
  check('at every activity level nobody makes a top-level post on their own (posts need direction)', v25 === 0 && v6 === 0 && v1 === 0 && v16 === 0, [v25, v6, v1, v16].join(','));
  check('the posts dial is fixed to "only what I direct" (it cannot be turned back on)', G.__realPostDial() === 0 && G.World.POST_DIAL.length === 1);
  /* the posts dial: their own posts only when directed, comments and replies stay alive */
  S = mkWorld();
  G.World.postDial = G.__realPostDial;
  G.settings.feedRate = 1.6;
  G.settings.postDial = 0;
  const topNpc = () => Object.values(S.posts).filter((p) => !p.replyTo && S.npcs[p.author]).length;
  const t0 = topNpc();
  const activityRnd = G.World.rnd;
  G.World.rnd = G.Persona.rngFrom('admin-comment-activity');
  try {
    await E.post('hello everyone, what a day', '', null, { type: 'text' }, null);
    for (let d = 0; d < 3; d++) E.tick(1440);
  } finally { G.World.rnd = activityRnd; }
  const comments = Object.values(S.posts).filter((p) => p.replyTo && S.npcs[p.author]).length;
  check('"Only what I direct": nobody makes a post of their own in 3 days', topNpc() === t0, topNpc() - t0);
  check('…while comments and replies on posts stay alive', comments > 0, comments);
  const npcStories = () => (S.stories || []).filter((s) => S.npcs[s.author] && s.kind !== 'seed').length;
  const st0 = npcStories();
  for (let d = 0; d < 3; d++) E.tick(1440);
  check('"Only what I direct": nobody shares their own stories either', npcStories() === st0, npcStories() - st0);
  S.sim.lastReal = Date.now() - 8 * 60000; // away for 8 minutes
  const away = G.World.catchUp();
  check('the "while you were away" recap counts posts and replies separately: no posts and no stories, only replies', !!away && away.posts === 0 && away.stories === 0 && typeof away.replies === 'number', JSON.stringify(away && { p: away.posts, r: away.replies, s: away.stories }));
  await run0('/as @miav i am posting this because the storyteller said so');
  check('…and a directed post (Admin or Storyteller) still goes through', Object.values(S.posts).some((p) => p.author === Object.values(S.npcs).find((n) => n.name === 'Mia Vale').id && /storyteller said so/.test(p.text)));
  G.settings.postDial = 1;
  const t1 = topNpc();
  for (let d = 0; d < 3; d++) E.tick(1440);
  check('an old saved setting cannot bring their own posts back', topNpc() === t1, topNpc() - t1);
  G.settings.postDial = 0.3;
  const lowStart = topNpc(); for (let d = 0; d < 3; d++) E.tick(1440); const low = topNpc() - lowStart;
  G.settings.postDial = 1.8;
  const hiStart = topNpc(); for (let d = 0; d < 3; d++) E.tick(1440); const hi = topNpc() - hiStart;
  check('Rarely and Lots are both just "only what I direct" now', low === 0 && hi === 0, `${low} / ${hi}`);
  // the AI may not slip unrequested top-level posts into a turn either (replies are fine); directed paths still post
  G.World.postDial = G.__realPostDial; G.settings.postDial = 0;
  { const rr = G.AI.ready, rj = G.AI.json;
    const miaN = Object.values(S.npcs).find((n) => n.name === 'Mia Vale'), kaiN = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
    G.AI.ready = () => true;
    G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 6, virality: 3, sentiment: 2, controversy: 1, tone: 'x', summary: 'y' }, posts: [{ author: miaN.id, text: 'UNREQUESTED extra post', buzz: 3 }, { author: kaiN.id, text: 'a reply that is fine', replyTo: 'p' + (S.counters.post - 1) }] } });
    await E.post('my own post for the AI path', '', null, { type: 'text' }, null);
    check('"Only what I direct": the AI cannot add extra posts of its own to your turn…', !Object.values(S.posts).some((p) => /UNREQUESTED/.test(p.text)));
    check('…but replies to your post still come through', Object.values(S.posts).some((p) => p.text === 'a reply that is fine' && p.author === kaiN.id));
    G.AI.json = async () => ({ cost: 0, data: { posts: [{ author: miaN.id, text: 'a post I pressed the time button for', buzz: 3 }] } });
    await E.advance('refresh');
    check('…and a time-jump / event button does not bring NPC posts either (only your direction does)', !Object.values(S.posts).some((p) => /time button/.test(p.text)));
    G.settings.postDial = 1.8;
    G.AI.json = async () => ({ cost: 0, data: { judge: { quality: 6, virality: 3, sentiment: 2, controversy: 1, tone: 'x', summary: 'y' }, posts: [{ author: miaN.id, text: 'extra post when the dial is up', buzz: 3 }] } });
    await E.post('another post of mine', '', null, { type: 'text' }, null);
    check('an old saved dial value cannot let the AI extras back in', !Object.values(S.posts).some((p) => /dial is up/.test(p.text)));
    G.settings.postDial = 0;
    G.AI.ready = rr; G.AI.json = rj; }
  G.World.postDial = () => 1;
  check('the top bar has the posts dial and Settings explains it', (() => { G.UI.go('home'); return !!$('#topbar select[data-setting="postDial"]'); })() && (() => { G.UI.go('settings'); return /Their own posts/.test($('#page').textContent); })());
  S = mkWorld();
  check('/posts directed is accepted; any other level is refused (NPC posts are always directed)', (await (async () => { E.Admin.setOn(true); await run('/posts directed'); const a = G.settings.postDial === 0; const refused = await run('/posts lots').then(() => false, (e) => /always directed/.test(e.message)); return a && refused && G.settings.postDial === 0; })()));
  S = mkWorld();
  G.settings.feedRate = 1;
  const quietOne = Object.values(S.npcs).find((n) => n.name === 'Person 3');
  quietOne.postRate = 'never';
  const loud = Object.values(S.npcs).find((n) => n.name === 'Person 5');
  loud.postRate = 'often';
  for (let d = 0; d < 5; d++) E.tick(1440);
  const by = (n) => Object.values(S.posts).filter((p) => p.author === n.id && !p.replyTo).length;
  check('a character set to "never posts" posts nothing, even when the world is busy', by(quietOne) === 0, by(quietOne));
  const typical = Object.values(S.npcs).filter((n) => !n.postRate && n.name.startsWith('Person')).map(by);
  // silent mode still reacts to YOU
  S = mkWorld();
  G.settings.feedRate = 0;
  await E.post('hello world @person1 !', '', null, { type: 'text' }, null);
  for (let i = 0; i < 12; i++) E.tick(60);
  check('Silent mode: they still react to what YOU post', Object.values(S.posts).some((p) => p.replyTo && S.npcs[p.author]) || Object.values(S.posts).some((p) => (p.likedBy || []).length), 'no reaction');
  G.settings.feedRate = 0.6;
  G.UI.go('home');
  const dial = $('#topbar select[data-setting="feedRate"]');
  check('the top bar has the activity dial and it shows Calm', !!dial && /Calm/.test(dial.selectedOptions[0].textContent), dial && dial.value);
  dial.value = '0'; dial.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('changing the dial saves the setting', G.settings.feedRate === 0);
  G.settings.feedRate = 0.6;
  G.UI.go('settings');
  check('Settings has a World activity card', /World activity/.test($('#page').textContent));

  /* ================= 2. admin mode on/off ================= */
  S = mkWorld();
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  check('admin is off by default: you cannot act as a normal character', E.altOf(mia.id) === null && !S.admin);
  const e0 = await fails('/as @miav hi');
  check('commands refuse to run while admin mode is off', !!e0 && /admin mode/i.test(e0.message), e0 && e0.message);
  G.UI.go('admin');
  check('the Admin page explains itself and offers the switch', /Turn admin mode on/.test($('#page').textContent) && !$('#admincmd'));
  click('[data-act="adminToggle"]');
  check('admin mode turns on', S.admin === true && !!$('#admincmd') && /Act as/.test($('#page').textContent));
  check('now every character is an account you can act as', E.altOf(mia.id) === mia);
  check('the top bar has the 🛠 button and it is highlighted', !!$('#topbar [data-page="admin"]'));

  /* ================= 3. act as any character ================= */
  click(`[data-act="adminAs"][data-id="${mia.id}"]`);
  check('"Act as" selects the character', S.activeAlt === mia.id && E.activeAlt() === mia);
  check('the top bar shows who you are acting as', /Mia/.test($('#topbar [data-act="adminStop"]').textContent));
  G.UI.go('home');
  check('the composer says Posting as Mia', /Posting as\s*Mia Vale/.test($('.composer').textContent.replace(/\s+/g, ' ')));
  G.UI.draft = 'my secret is out, whatever @kai';
  const kaiBefore = Object.values(S.posts).length;
  await A().post();
  await H.wait(60);
  const mp = Object.values(S.posts).find((p) => p.text === 'my secret is out, whatever @kai');
  check('posting from the composer is authored by Mia, not by you', !!mp && mp.author === mia.id, mp && mp.author);
  for (let i = 0; i < 10; i++) E.tick(60);
  const reacts = Object.values(S.posts).filter((p) => p.replyTo === mp.id && p.author !== mia.id).length + (mp.likedBy || []).length;
  check('other characters react to a post made as Mia (tagged Kai answers)', reacts > 0 && (Object.values(S.posts).some((p) => p.replyTo === mp.id && p.author === kai.id) || reacts > 0), reacts);
  check('the post shows edit + delete controls for you', (() => { G.UI.go('home'); return !!$(`.post[data-id="${mp.id}"] [data-act="editPost"]`) || $$('[data-act="editPost"]').length > 0; })());
  // like / follow / story / reply as Mia
  const target = E.addPost({ author: kai.id, text: 'fresh post from Kai about the cafe', buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 50 } }); // brand new, so Mia (who is also simulated) has not liked it yet
  A().like({ id: target.id });
  check('liking as Mia is a like from Mia', (target.likedBy || []).includes(mia.id) && !target.liked);
  A().follow({ id: kai.id });
  check('following as Mia: Mia follows Kai, you do not', (mia.following || []).includes(kai.id) && !S.player.following.includes(kai.id));
  const st = E.postStory('rooftop, 2am', null, mia.id);
  check('a story can be posted as Mia', !!st && st.author === mia.id);
  await E.reply(target.id, 'you wish', mia.id);
  check('a reply as Mia is written as Mia', Object.values(S.posts).some((p) => p.text === 'you wish' && p.author === mia.id));
  const realReady0 = G.AI.ready;
  G.AI.ready = () => false; // the free built-in simulation answers
  // chat as Mia with Kai
  G.Bonds.addEdge(S, mia.id, kai.id, 'friend', 'admin test chat', G.U.dayOf(S.clock), 80);
  const thBefore = ((S.altDms || {})[mia.id] || {})[kai.id];
  const worldRnd = G.World.rnd;
  G.World.rnd = () => 0.99; // keep this integration check about thread routing, not a random leave-on-read roll
  let th;
  try {
    await E.altDm(mia.id, kai.id, 'we need to talk about last night');
    th = S.altDms[mia.id][kai.id];
    for (let i = 0; i < 30 && !th.some((m) => m.from === kai.id); i++) E.tick(60);
  } finally { G.World.rnd = worldRnd; }
  check('chatting as Mia with Kai: the message is in their thread (not in your chat with Kai)', th[0].from === 'me' && th[0].as === mia.id && !(S.dms[kai.id] || []).some((m) => m.text.includes('last night')));
  check('Kai answers Mia in that thread', th.some((m) => m.from === kai.id && m.to === mia.id));
  G.AI.ready = realReady0;
  G.UI.go('messages');
  check('Messages while acting as Mia: you cannot DM Mia herself', !$$('#newchat option').some((o) => o.value === mia.id));
  check('…and her chat with Kai is listed', /Kai/.test($('.convos').textContent));
  click('[data-act="adminStop"]');
  check('"back to me" leaves the character', !S.activeAlt);

  /* ================= 4. posts by anyone are editable / deletable in admin mode ================= */
  const np = Object.values(S.posts).find((p) => p.author === kai.id && !p.replyTo);
  A().editPost({ id: np.id });
  check('admin: the edit box opens for another character\'s post', !!$('#editbox'));
  $('#editbox').value = 'Kai definitely did NOT write this';
  A().editPostSave({ id: np.id });
  check('admin: edited Kai\'s post', np.text === 'Kai definitely did NOT write this' && np.edited);
  const doomed = Object.values(S.posts).find((p) => p.author === 'n3' && !p.replyTo) || Object.values(S.posts).find((p) => S.npcs[p.author] && !p.replyTo && p.id !== np.id);
  const cf = w.confirm; w.confirm = () => true;
  A().deletePost({ id: doomed.id });
  w.confirm = cf;
  check('admin: deleted someone else\'s post', !S.posts[doomed.id]);
  E.Admin.setOn(false);
  check('admin off: other characters\' posts are protected again', E.editPost(np.id, 'nope') === false && np.text.startsWith('Kai'));
  E.Admin.setOn(true);

  /* ================= 5. commands ================= */
  const out = [];
  const ok = async (line, re) => { try { const o = await run(line); out.push(o); return re ? re.test(o) : true; } catch (e) { console.log('   !!', line, '->', e.message); return false; } };
  check('/help lists the commands', await ok('/help', /\/as @handle text[\s\S]*\/lore/));
  check('/as posts as that character', await ok('/as @kai the cafe is MINE now', /Posted as Kai/) && Object.values(S.posts).some((p) => p.author === kai.id && p.text === 'the cafe is MINE now'));
  const lastPost = Object.values(S.posts).find((p) => p.text === 'the cafe is MINE now');
  check('/reply replies as that character', await ok(`/reply ${lastPost.id} @miav lol sure`, /replied/) && Object.values(S.posts).some((p) => p.replyTo === lastPost.id && p.author === mia.id && p.text === 'lol sure'));
  check('/like + /follow', (await ok(`/like ${lastPost.id} @miav`)) && (lastPost.likedBy || []).includes(mia.id) && (await ok('/follow @miav @kai')) && (mia.following || []).includes(kai.id));
  check('/story posts a story', await ok('/story @miav new haircut who dis', /shared a story/) && S.stories.some((s) => s.author === mia.id && s.text.includes('haircut')));
  check('/dm @from me puts a message in YOUR inbox', await ok('/dm @miav me you up?', /messaged you/) && (S.dms[mia.id] || []).some((m) => m.from === mia.id && m.text === 'you up?' && !m.read));
  check('/dm between two characters starts their private chat', await ok('/dm @kai @miav stay away from my cafe', /messaged/) && S.altDms[kai.id][mia.id][0].text === 'stay away from my cafe');
  check('/edit + /delete', (await ok(`/edit ${lastPost.id} the cafe is OURS now`)) && lastPost.text === 'the cafe is OURS now' && (await ok(`/delete ${lastPost.id}`)) && !S.posts[lastPost.id]);
  check('/set changes the numbers (and is clamped)', (await ok('/set @miav aff 55', /55/)) && mia.aff === 55 && (await ok('/set @miav rom 999')) && mia.rom === 100 && (await ok('/set @miav aff -999')) && mia.aff === -100);
  mia.aff = 20;
  check('/mood + /status', (await ok('/mood @miav jealous')) && mia.mood === 'jealous' && (await ok('/status @miav best friend')) && mia.status === 'best_friend');
  check('/status family keeps romance at zero', (await ok('/status @miav sister')) && mia.status === 'sister' && mia.rom === 0);
  mia.status = 'friend';
  check('/know plants a fact the character always knows', (await ok('/know @miav knows the player lied about the cafe')) && mia.facts.includes('knows the player lied about the cafe') && mia.memories.some((m) => /lied about the cafe/.test(typeof m === 'string' ? m : m.text || '')) || mia.facts.length === 1);
  check('/note sets the Author\'s Note and /note alone clears it', (await ok('/note Slow burn. Everyone stays in character.')) && S.authorNote.startsWith('Slow burn') && (await ok('/note')) && S.authorNote === '');
  await run('/note Slow burn. Everyone stays in character.');
  check('/lore adds keyword entries and "*" makes an always-on one', (await ok('/lore Moon Bar: the Moon Bar is where everyone goes after midnight')) && S.lore.some((l) => l.keys.includes('Moon Bar')) && (await ok('/lore *: the mayor is cheating')) && S.lore.some((l) => l.constant && /mayor/.test(l.content)));
  const chron0 = S.chronicle.length;
  check('/narrate writes into the story', (await ok('/narrate A storm knocks out the power across town.')) && S.chronicle.length === chron0 + 1);
  check('/plot starts a storyline', (await ok('/plot Cafe war | Kai and Mia fight over the cafe | @kai @miav', /Cafe war/)) && S.storylines.some((s) => s.title === 'Cafe war' && s.participants.length === 2));
  const npcs0 = Object.keys(S.npcs).length;
  check('/new creates an adult character', (await ok('/new Rae Okafor | 31, owns the Moon Bar, cold and sharp')) && Object.keys(S.npcs).length === npcs0 + 1 && Object.values(S.npcs).find((n) => n.name === 'Rae Okafor').age >= 18);
  check('/postrate + /rate', (await ok('/postrate @miav rare')) && mia.postRate === 'rare' && (await ok('/rate quiet')) && G.settings.feedRate === 0.25 && (await ok('/rate 1')) && G.settings.feedRate === 1);
  G.settings.feedRate = 0.6;
  const c0 = S.clock;
  check('/time lets time pass', (await ok('/time 3h')) && S.clock >= c0 + 180);
  check('/who summarises a character', await ok('/who @miav', /Mia Vale .*aff .* knows 1 planted fact/));
  for (const [line, re] of [['/nonsense', /Unknown command/], ['/as @nobody hi', /do not know/], ['/as @miav', /Usage/], ['/reply p99999 @miav x', /no post/], ['/set @miav foo 3', /Usage/], ['/status @miav wizard', /Statuses/], ['/rate', /Usage/], ['/time soon', /Usage/], ['/lore no colon here', /Usage/], ['hello', /start with \//], ['/postrate @miav loudly', /Choose/], ['/new | nothing', /Usage/]]) {
    const e = await fails(line);
    check(`bad input "${line}" gives a clear message`, !!e && re.test(e.message), e && e.message);
  }

  /* ================= 6. the AI actually receives all of it ================= */
  const rae = Object.values(S.npcs).find((n) => n.name === 'Rae Okafor');
  rae.card = 'Rae grew up above the bar her mother ran. She distrusts anyone who tips too well.';
  A().adminSel({ id: rae.id });
  await H.wait(30);
  $('#adm_scenario').value = 'Closes the Moon Bar at 2am every night and counts the till alone.';
  $('#adm_speech').value = 'short sentences. never says please. "Last call. Go home."';
  $('#adm_postrate').value = 'never';
  $('#adm_mood').value = 'guarded';
  $('#adm_aff').value = '-20';
  A().adminSaveChar({ id: rae.id });
  check('the character editor saves scenario, speech, post rate, mood, numbers', rae.scenario.startsWith('Closes') && rae.speech.includes('Last call') && rae.postRate === 'never' && rae.mood === 'guarded' && rae.aff === -20);
  $('#adm_fact').value = 'saw the player leave the cafe with Mia at midnight';
  A().adminAddFact({ id: rae.id });
  check('planting a fact from the editor works', rae.facts.includes('saw the player leave the cafe with Mia at midnight'));
  const ctx = G.AI.context({ focus: [rae.id], scan: 'the Moon Bar tonight' });
  check('AI context carries the character\'s imported/written CARD', /DOSSIER/.test(ctx) && /distrusts anyone who tips too well/.test(ctx));
  check('…their SCENARIO, how they talk, and what they KNOW', /Closes the Moon Bar at 2am/.test(ctx) && /Last call\. Go home\./.test(ctx) && /saw the player leave the cafe with Mia/.test(ctx));
  check('…the AUTHOR\'S NOTE', /AUTHOR'S NOTE[^\n]*Slow burn\. Everyone stays in character\./.test(ctx));
  check('…lore whose keyword came up (Moon Bar) and the always-on lore', /LORE[\s\S]*goes after midnight/.test(ctx) && /mayor is cheating/.test(ctx));
  const ctx2 = G.AI.context({ focus: [mia.id], scan: 'nothing special' });
  check('a character with no extras gets no dossier line (no noise)', !/Mia Vale \(n\d+\) DOSSIER/.test(ctx2) || /KNOWS/.test(ctx2));
  check('lore for a keyword that did not come up is left out', !/goes after midnight/.test(ctx2));
  const burn = await (async () => { G.UI.acts.altNew(); $('#altname').value = 'Desk'; A().altCreate(); return E.activeAlt(); })();
  burn.card = 'SECRET BURNER CARD';
  check('a burner account\'s own card is never sent to the AI (the world must not know it)', !/SECRET BURNER CARD/.test(G.AI.context({ focus: [burn.id] })));
  A().altSwitch({});
  A().editChar({ id: rae.id });
  G.UI.closeModal();

  /* ================= 7. the world page ================= */
  G.UI.go('admin');
  $('#adm_wname').value = 'Moon Town';
  $('#adm_wtone').value = 'noir and petty';
  $('#adm_wsetting').value = 'A small harbour town where everybody drinks at the same bar.';
  $('#adm_note').value = 'Noir voice. Short sentences.';
  A().adminSaveWorld();
  check('the world page saves name, tone, setting and Author\'s Note', S.world.name === 'Moon Town' && S.world.tone === 'noir and petty' && S.authorNote === 'Noir voice. Short sentences.');
  const lore0 = S.lore.length;
  $('#adm_lkeys').value = 'harbour, ferry';
  $('#adm_lcontent').value = 'The last ferry leaves at 11pm and nobody ever misses it.';
  A().adminLoreAdd();
  check('lore can be added from the page', S.lore.length === lore0 + 1 && /harbour, ferry/.test($('#page').textContent));
  const le = S.lore[S.lore.length - 1];
  A().adminLoreToggle({ id: le.id });
  check('lore can be disabled (and a disabled entry is not sent to the AI)', le.disabled === true && !/last ferry/.test(G.AI.context({ scan: 'the harbour ferry' })));
  A().adminLoreToggle({ id: le.id });
  check('…and enabled again', /last ferry/.test(G.AI.context({ scan: 'the harbour ferry' })));
  A().adminLoreDel({ id: le.id });
  check('…and deleted', !S.lore.some((l) => l.id === le.id));
  A().adminInject({ id: rae.id }); // empty -> nothing
  A().adminSel({ id: rae.id });
  $('#adm_inject').value = 'Closing time. You staying?';
  A().adminInject({ id: rae.id });
  check('"make them message you" puts it in your inbox with an alert', (S.dms[rae.id] || []).some((m) => m.text === 'Closing time. You staying?') && S.notifs.some((n) => n.npcId === rae.id && n.type === 'dm'));

  /* ================= 8. the AI path of /as ================= */
  const realReady = G.AI.ready, realJson = G.AI.json;
  let seen = '';
  G.AI.ready = () => true;
  G.AI.json = async (o) => { seen = o.user; return { data: { judge: { quality: 7, virality: 5, sentiment: 3, controversy: 2, tone: 'dry', summary: 'x' }, posts: [{ author: kai.id, text: 'who let her post that', replyTo: 'p' + (S.counters.post), buzz: 4 }] }, cost: 0 }; };
  await run('/as @miav Moon Bar has the worst coffee in town');
  G.AI.ready = realReady; G.AI.json = realJson;
  check('AI path: the model is told this is a user-controlled account action and gets the context', /USER-CONTROLLED ACCOUNT ACTION: Mia Vale/.test(seen) && /AUTHOR'S NOTE/.test(seen) && /Moon Bar/.test(seen));

  check('invariants after everything above (burners, admin acting, commands)', invariants(G).length === 0, invariants(G).join(';'));

  /* ================= 9. the world wizard ================= */
  H.freshWorld();
  G.S.popSize = 0;
  let prompt = '';
  const WORLD = (names) => ({ data: { world: { name: 'Harbour', setting: 'A town.', tone: 'noir' }, cast: names.map((n, i) => ({ ref: 'c' + i, name: n, handle: '@' + n.toLowerCase().replace(/\W/g, ''), age: 30, role: 'main', bio: 'b', personality: 'p', emoji: '🙂', followers: 1000, aff: 0 })), npc_rel: [{ a: 'c0', b: 'c1', type: 'rival', note: 'cafe' }], storylines: [], posts: names.map((n, i) => ({ author: 'c' + i, text: 'hello from ' + n, buzz: 3 })), trending: [], welcome: 'Welcome.' }, cost: 0 });
  G.AI.ready = () => true;
  G.AI.json = async (o) => { prompt = o.user; return WORLD(['Mia Cole', 'Rae Okafor']); };
  const brief = 'Mia Cole — 24, bubbly barista, secretly writes songs\nRae Okafor — 31, owns the Moon Bar, cold, hates the player';
  const W = await E.createWorld({ premise: 'a noir harbour town', name: 'Sam', handle: '@sam', fame: 'nobody', castBrief: brief, exact: true, size: 'small', note: 'Slow-burn romance.', loreText: 'Moon Bar, Rae: the Moon Bar opens at night\n*: the mayor is cheating' });
  check('the world prompt carries the owner\'s cast, "only these", and the Author\'s Note', /THE OWNER'S CAST/.test(prompt) && /Mia Cole — 24, bubbly barista/.test(prompt) && /ONLY these characters/.test(prompt) && /Create exactly the owner's characters/.test(prompt) && /AUTHOR'S NOTE[^\n]*Slow-burn romance/.test(prompt));
  check('a world with just the two characters the owner listed is accepted', Object.keys(W.npcs).length === 2 && Object.values(W.npcs).some((n) => n.name === 'Rae Okafor'));
  check('the Author\'s Note, lore and brief are stored with the world', W.authorNote === 'Slow-burn romance.' && W.lore.length === 2 && W.lore.some((l) => l.constant && /mayor/.test(l.content)) && W.lore.some((l) => l.keys.includes('Moon Bar')) && W.world.castBrief.startsWith('Mia Cole'));
  G.AI.json = async (o) => { prompt = o.user; return WORLD(['Only One', 'Second']); };
  let rejected = null;
  try { await E.createWorld({ premise: 'x', name: 'Sam', fame: 'nobody' }); } catch (e) { rejected = e; }
  check('without a brief, a 2-character world is still rejected as incomplete', !!rejected && /incomplete/.test(rejected.message));
  G.AI.json = async (o) => { prompt = o.user; return WORLD(['Only One', 'Second', 'Third']); };
  await E.createWorld({ premise: 'x', name: 'Sam', fame: 'nobody', castBrief: 'Only One — a hermit', exact: false, size: 'large' });
  check('size and "add more characters" are passed through', /Create 15-18 cast members/.test(prompt) && /Add more characters around them/.test(prompt));
  G.AI.ready = realReady; G.AI.json = realJson;
  G.S = null;
  G.UI.render();
  G.Pages.wiz.showWizard = true;
  G.UI.render();
  const wiz = G.Pages.wizard();
  check('the wizard has the "Your story & cast" section with every field', /Your story &amp; cast|Your story & cast/.test(wiz) && /wiz\.cast/.test(wiz) && /wiz\.exact/.test(wiz) && /wiz\.size/.test(wiz) && /wiz\.note/.test(wiz) && /wiz\.lore/.test(wiz) && /Only the characters I listed/.test(wiz));
  check('the lore parser handles keyword lines, * and plain lines', (() => { const l = E.parseLore('a, b: fact one\n*: always\nno keywords at all\n   \n: broken'); return l.length === 4 && l[0].keys.join() === 'a,b' && !l[0].constant && l[1].constant && l[2].constant && l[2].content === 'no keywords at all'; })(), JSON.stringify(E.parseLore('a, b: fact one\n*: always\nno keywords at all\n   \n: broken')));

  check('invariants at the end', !G.S || invariants(G).length === 0, G.S ? invariants(G).join(';') : '');
  H.summary('ADMIN + WORLD CONTROL');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
