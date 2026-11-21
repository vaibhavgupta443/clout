const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true;
w.prompt = () => 'new bio';
w.scrollTo = () => {};
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
const calls = [];
const prompts = [];

const WORLD = {
  world: { name: 'Hex Academy', setting: 'A magic school.', tone: 'snarky' },
  cast: [
    { ref: 'c1', name: 'Mia Vale', handle: '@miav', role: 'love_interest', bio: 'sunshine', personality: 'bubbly emoji spam', emoji: '🌸', followers: 12000, secret: 'cheated on exam', aff: 5, rom: 10, riv: 0, trust: 5, status: 'stranger' },
    { ref: 'c2', name: 'Kai Storm', handle: '@kaistorm', role: 'rival', bio: 'prince', personality: 'arrogant lowercase', emoji: '😈', followers: 90000, secret: 'broke', aff: -5, rom: 0, riv: 20, trust: 0 },
    { ref: 'c3', name: 'Dex', handle: '@dex', role: 'troll', bio: 'lol', personality: 'caps', emoji: '🧌', followers: 400 },
  ],
  npc_rel: [{ a: 'c1', b: 'c2', type: 'dating', note: 'on and off' }],
  storylines: [{ title: 'Prom scandal', summary: 'Who leaked the list?', heat: 55, participants: ['c1', 'c2'] }],
  posts: [{ author: 'c1', text: 'good morning hex!! ☀️ #hexlife', buzz: 3 }, { author: 'c2', text: 'imagine being @dex lol', buzz: 8 }],
  trending: [{ tag: '#hexlife', heat: 60 }],
  welcome: 'Welcome to Hex.',
};
const TURN = (pid) => ({
  judge: { quality: 8, virality: 9, sentiment: 6, controversy: 7, tone: 'funny', summary: 'witty' },
  posts: [{ id: 't1', author: 'n1', text: 'ok @nova that was good 😭', replyTo: pid, buzz: 5 }, { id: 't2', author: 'n2', text: 'whatever', replyTo: 't1' }, { author: 'n2', text: 'self reply should be dropped', replyTo: 't2' }],
  crowd: [{ name: 'Fan1', handle: '@fan1', text: 'QUEEN', stance: 'fan', replyTo: pid }, { name: 'Hater', handle: '@h8', text: 'cringe', stance: 'hater', replyTo: pid }],
  dms: [{ from: 'n1', text: 'hey, saw your post 👀' }],
  rel: [{ id: 'n1', aff: 15, rom: 12, mood: 'flustered', memory: 'Nova made her laugh', status: 'admirer' }, { id: 'n2', riv: 20, aff: -10 }],
  new_npcs: [{ ref: 'x1', name: 'Rin Okada', handle: '@rin', role: 'journalist', bio: 'gossip', personality: 'nosy', emoji: '📰', followers: 3000 }],
  storylines: [{ id: 's1', title: 'Prom scandal', summary: 'Nova joins the fray', heat: 80, status: 'boiling', participants: ['n1', 'n2'] }],
  trending: [{ tag: '#novagate', heat: 90 }],
  event: { title: 'Brand deal', text: 'A brand DMs you.', options: ['Accept', 'Decline'] },
  stats: { wit: 2, charisma: 1 },
  xp: 10,
  chronicle: 'Nova posted something viral.',
  toast: 'The internet noticed.',
});

w.fetch = async (url, opts) => {
  if (w.__fail) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
  if (String(url).includes('/models'))
    return { ok: true, json: async () => ({ data: [{ id: 'a/b', pricing: { prompt: '0.0000001', completion: '0.0000002' }, supported_parameters: ['response_format'] }] }) };
  if (String(url).endsWith('/key')) return { ok: true, json: async () => ({ data: { usage: 0.12, limit: 10, limit_remaining: 9.88 } }) };
  const body = JSON.parse(opts.body);
  const user = body.messages[1].content;
  calls.push(user.slice(0, 80).replace(/\n/g, ' '));
  prompts.push({ system: body.messages[0].content, user });
  let out;
  if (user.startsWith('Create a brand-new CLOUT world')) out = WORLD;
  else if (user.startsWith('Reply with exactly this JSON')) out = { ok: true };
  else if (user.includes('Write 4 DIFFERENT')) out = { options: [{ tone: 'funny', text: 'idea one' }, { tone: 'spicy', text: 'idea two' }] };
  else if (user.includes('Design ONE new character')) out = { name: 'Vera Holt', handle: '@veraholt', age: 15, role: 'journalist', emoji: '📰', bio: 'gossip podcaster', personality: 'nosy, clipped', followers: 5000, secret: 'sources are fake' };
  else if (user.includes('You compress') || body.messages[0].content.includes('You compress')) {
    out = { saga: 'SAGA-TEXT: Nova and Mia grew close; Kai became a rival.', npc: {}, dm: {}, group: {}, scene: {} };
    for (const m of user.matchAll(/CHARACTER (n\d+)/g)) out.npc[m[1]] = 'HIST for ' + m[1];
    for (const m of user.matchAll(/PRIVATE CHAT with (n\d+)/g)) out.dm[m[1]] = 'DMSUM for ' + m[1];
    for (const m of user.matchAll(/GROUP CHAT (g\d+)/g)) out.group[m[1]] = 'GROUPSUM for ' + m[1];
    for (const m of user.matchAll(/SCENES with (n\d+)/g)) out.scene[m[1]] = 'SCENESUM for ' + m[1];
  }
  else if (user.includes('INTERACTIVE SCENE')) out = { scene_text: 'The cafe smells of roasted beans. Mia smiles at you across the table.\n\n"You came," she says softly. ' + 'Words '.repeat(30), scene_options: ['Compliment her', 'Take her hand', 'Order drinks'], rel: [{ id: user.match(/SCENE between the player and (n\d+)/)[1], aff: 5, rom: 6, memory: 'Had coffee together' }], chronicle: 'Coffee date with Mia' };
  else if (user.includes('writes in group chat') || user.includes('stays quiet')) {
    const gid = user.match(/group chat (g\d+)/)[1];
    out = { group_msgs: [{ group: gid, from: 'n1', text: 'lol karaoke??' }, { group: gid, from: 'n2', text: 'i refuse' }, { group: gid, from: 'n3', text: 'LETS GOOO' }], rel: [{ id: 'n3', aff: 3 }] };
  }
  else if (user.includes('streaming LIVE')) { out = TURN('p1'); out.live = { peak: 100, chat: Array.from({ length: 8 }, (_, i) => ({ name: 'viewer' + i, text: 'PogChamp ' + i, stance: 'fan' })), donations: [{ name: 'BigFan', amount: 50, msg: 'love u' }], moment: 'cat walked on keyboard' }; out.judge.virality = 3; const pid2 = user.match(/new post id (p\d+)|\(id (p\d+)\)/); out.posts = []; out.crowd = [{ name: 'F', handle: '@f', text: 'live!', stance: 'fan', replyTo: pid2[1] || pid2[2] }]; }
  else {
    const m = user.match(/new post id (p\d+)|\(id (p\d+)\)|to post (p\d+)/);
    const pid = m ? m[1] || m[2] || m[3] : 'p1';
    out = TURN(pid);
    if (user.includes('PRIVATE DM')) out = { dms: [{ from: user.match(/DM to (n\d+)/)[1], text: 'aww thanks' }], rel: [{ id: user.match(/DM to (n\d+)/)[1], aff: 8 }], chronicle: 'dm' };
    if (user.includes('TIME PASSES')) out = { posts: [{ author: 'n3', text: 'LOL', buzz: 9 }], crowd: [], trending: [{ tag: '#later', heat: 40 }], chronicle: 'time' };
    if (user.includes('EVENT:')) out = { posts: [{ author: 'n1', text: 'thanks!!', buzz: 4 }], chronicle: 'resolved', xp: 15 };
    if (user.includes('more replies')) out = { crowd: [{ name: 'Z', handle: '@z', text: 'late reply', stance: 'neutral', replyTo: pid }] };
  }
  // simulate a model that wraps JSON in fences
  const text = '```json\n' + JSON.stringify(out) + '\n```';
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 2000, completion_tokens: 1200, cost: 0.0008 } }) };
};

for (const f of ['util', 'db', 'store', 'global/limits', 'ai', 'engine', 'lexicon', 'persona', 'voice', 'bank', 'media', 'mem', 'social', 'react', 'world', 'ui', 'memory', 'extras', 'population', 'scenarios', 'pages', 'pages2', 'pages3', 'stories', 'live', 'selftest', 'main', 'studio']) w.eval(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'));
if (w.G.Live) w.G.Live.stop();
const G = w.G;
const $ = (s) => w.document.querySelector(s);
const click = (sel) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('missing ' + sel);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
};
const type = (sel, val) => {
  const el = $(sel);
  el.value = val;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
};
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!cond) process.exitCode = 1;
};

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 200)); // startup is async now (opens the database)
  check('start->wizard renders', !!$('.start.wide'));
  type('#apikey', 'sk-or-test');
  type('[data-bind="wiz.name"]', 'Nova Reyes');
  click('[data-act="toggleTrait"][data-t="Funny"]');
  click([...w.document.querySelectorAll('[data-act="pickEmoji"]')].find(b=>b.dataset.e==='🔥'));
  click('[data-act="createWorld"]');
  await wait(100);
  check('world created', !!G.S && Object.keys(G.S.npcs).length === 3, G.S && Object.keys(G.S.npcs).join());
  check('home renders posts', w.document.querySelectorAll('.post').length >= 2);
  check('name/handle/trait kept', G.S.player.name === 'Nova Reyes' && G.S.player.handle === '@nova' && G.S.player.traits[0] === 'Funny');

  // post
  type('#composer', 'hello hex #hexlife');
  click('[data-act="tone"][data-t="funny"]');
  click('[data-act="post"]');
  await wait(100);
  const mine = Object.values(G.S.posts).filter((p) => p.author === 'me');
  check('player post created + judged', mine.length === 1 && !mine[0].pending && mine[0].stats.likes > 0, JSON.stringify(mine[0] && mine[0].stats));
  check('named reply threaded', Object.values(G.S.posts).some((p) => p.author === 'n1' && p.replyTo === mine[0].id));
  check('nested reply via temp id', Object.values(G.S.posts).some((p) => p.author === 'n2' && p.replyTo && G.S.posts[p.replyTo].author === 'n1'));
  check('NPC cannot reply to their own comment, even if the AI returns one', !Object.values(G.S.posts).some((p) => p.text === 'self reply should be dropped'));
  check('crowd replies', Object.values(G.S.posts).filter((p) => p.author === 'crowd').length === 2);
  check('dm received', (G.S.dms.n1 || []).length === 1);
  check('rel applied + status', G.S.npcs.n1.aff === 20 && G.S.npcs.n1.status === 'admirer' && G.S.npcs.n1.memories.length === 1, JSON.stringify(G.S.npcs.n1));
  check('new npc created', Object.values(G.S.npcs).some((n) => n.handle === '@rin'));
  check('storyline updated not duplicated', G.S.storylines.length === 1 && G.S.storylines[0].heat === 80);
  check('event pending', G.S.events.filter((e) => !e.resolved).length === 1);
  check('followers changed', G.S.player.followers !== 200, G.S.player.followers);
  check('xp/level', G.S.player.xp > 0 || G.S.player.level > 1);
  check('spend tracked', G.S.spend > 0 && G.settings.totalSpend > 0);
  check('event card visible', !!$('.card.event'));

  click('[data-act="choose"][data-i="0"]');
  await wait(100);
  check('event resolved', G.S.events.every((e) => e.resolved));

  // thread
  click(`[data-act="thread"][data-id="${mine[0].id}"]`);
  check('thread view', !!$('.rootpost') && !!$('#replybox'));
  type('#replybox', 'thanks everyone');
  click('[data-act="sendReply"]');
  await wait(100);
  check('reply posted', Object.values(G.S.posts).some((p) => p.author === 'me' && p.replyTo === mine[0].id));
  click('[data-act="moreReplies"]');
  await wait(100);
  check('more replies', Object.values(G.S.posts).some((p) => p.crowd && p.text === 'late reply'));
  click('[data-act="suggestReply"]');
  await wait(100);
  check('suggestions shown', w.document.querySelectorAll('.sug').length === 2);
  click('[data-act="useSuggestion"][data-i="0"]');
  check('suggestion fills reply box', $('#replybox').value === 'idea one');

  // every page
  for (const pg of ['explore', 'notifs', 'messages', 'people', 'drama', 'director', 'me', 'settings', 'home']) {
    click(`.navb[data-page="${pg}"]`);
    check('page ' + pg, !w.document.querySelector('#page .card h3')?.textContent.includes('broke') && $('#page').innerHTML.length > 50);
  }
  click('.navb[data-page="people"]');
  click('[data-act="peopleView"][data-v="web"]');
  check('social web svg', !!$('svg.web'));

  // profile + actions
  click('.navb[data-page="people"]');
  click('[data-act="profile"][data-id="n1"]');
  check('profile modal', !!$('.modal.profile'));
  type('#actext', 'you are cute');
  click('[data-act="npcAct"][data-k="flirt"]');
  await wait(100);
  check('flirt DM goes to messages', G.UI.page === 'messages' && G.UI.dmWith === 'n1');
  check('dm convo', G.S.dms.n1.some((m) => m.from === 'me' && m.text === 'you are cute') && G.S.dms.n1.some((m) => m.text === 'aww thanks'));
  type('#dmbox', 'how are you');
  click('[data-act="sendDm"]');
  await wait(100);
  check('dm send', G.S.dms.n1.some((m) => m.text === 'how are you'));
  // AI-written action (blank text)
  G.UI.openProfile('n2');
  click('[data-act="npcAct"][data-k="roast"]');
  await wait(100);
  check('blank-text public action creates post', Object.values(G.S.posts).filter((p) => p.author === 'me').length >= 3);

  // advance + director
  click('.navb[data-page="home"]');
  click('[data-act="advance"][data-k="hours"]');
  await wait(100);
  check('advance adds posts', Object.values(G.S.posts).some((p) => p.text === 'LOL'));
  click('.navb[data-page="director"]');
  type('#dirbox', 'Mia confesses');
  click('[data-act="direct"]');
  await wait(100);
  check('director returns home', G.UI.page === 'home' && G.S.chronicle.length > 3);
  click('.navb[data-page="drama"]');
  click('[data-act="stir"]');
  await wait(100);

  // quote
  const anyPost = Object.values(G.S.posts).find((p) => p.author === 'n2' && !p.replyTo);
  click('.navb[data-page="home"]');
  G.UI.thread = null;
  G.UI.render();
  click(`[data-act="quote"][data-id="${anyPost.id}"]`);
  type('#quotebox', 'this ^^');
  click('[data-act="sendQuote"]');
  await wait(100);
  check('quote post', Object.values(G.S.posts).some((p) => p.author === 'me' && p.quote === anyPost.id));

  // save/load
  G.Store.save();
  const id = G.S.id;
  G.S = null;
  G.UI.render();
  check('start screen with save', !!$('[data-act="loadWorld"]'));
  click('[data-act="loadWorld"]');
  check('reload world', G.S && G.S.id === id && !!$('.post'));

  // failure path: restore draft
  const okFetch = w.fetch;
  w.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) });
  type('#composer', 'will fail');
  const before = Object.keys(G.S.posts).length;
  click('[data-act="post"]');
  await wait(100);
  check('failed post rolled back, draft restored', Object.keys(G.S.posts).length === before && G.UI.draft === 'will fail' && $('#composer').value === 'will fail');

  w.fetch = okFetch;
  const E = G.Engine;

  /* ===== content level + hard rules ===== */
  check('system prompt: PG-13 level + hard rules', prompts.filter((p) => /CLOUT/.test(p.system)).every((p) => /HARD LIMITS/.test(p.system) && /aged 18/.test(p.system)));
  check('the prompt is PG-13', /PG-13/.test(G.AI.system()));
  check('npcs never below 18', Object.values(G.S.npcs).every((n) => n.age >= 18), Object.values(G.S.npcs).map((n) => n.age).join());
  check('makeNpc clamps age 12 -> 18', E.makeNpc({ name: 'Kid', age: 12 }).age === 18);

  /* ===== DM history is sent to the model ===== */
  prompts.length = 0;
  G.UI.go('messages', { dmWith: 'n1', groupWith: null });
  type('#dmbox', 'second message about karaoke');
  click('[data-act="sendDm"]');
  await wait(100);
  const dmPrompt = prompts.find((p) => p.user.includes('PRIVATE DM'));
  check('DM prompt includes earlier chat', dmPrompt && dmPrompt.user.includes('PRIVATE CHAT WITH n1') && dmPrompt.user.includes('you are cute') && dmPrompt.user.includes('aww thanks'), dmPrompt && dmPrompt.user.slice(-900));

  /* ===== undo / retry ===== */
  G.UI.go('home');
  const pc0 = Object.keys(G.S.posts).length, fol0 = G.S.player.followers;
  type('#composer', 'undo me please');
  click('[data-act="post"]');
  await wait(100);
  check('post made (undo test)', Object.keys(G.S.posts).length > pc0 && E.undoStack.length > 0);
  check('undo button visible', !!$('[data-act="undo"]'));
  click('[data-act="undo"]');
  check('undo restores state', Object.keys(G.S.posts).length === pc0 && G.S.player.followers === fol0 && !Object.values(G.S.posts).some((p) => p.text === 'undo me please'));
  type('#composer', 'retry me');
  click('[data-act="post"]');
  await wait(100);
  const cntA = Object.values(G.S.posts).filter((p) => p.text === 'retry me').length;
  click('[data-act="retry"]');
  await wait(100);
  check('retry re-rolls (still exactly one copy)', cntA === 1 && Object.values(G.S.posts).filter((p) => p.text === 'retry me').length === 1);

  /* ===== post management ===== */
  const myP = Object.values(G.S.posts).find((p) => p.author === 'me' && p.text === 'retry me');
  click(`[data-act="pinPost"][data-id="${myP.id}"]`);
  check('pin post', G.S.pinned === myP.id);
  G.UI.go('me');
  check('pinned shown on profile + achievements grid', /Pinned/.test($('#page').textContent) && !!$('.ach-grid'));

  /* ===== shop: promote, PR, verify, gifts ===== */
  G.S.player.cash = 100000;
  G.S.player.verified = false;
  G.UI.go('shop');
  check('shop page', !!$('.shopgrid') && /Promote a post/.test($('#page').textContent));
  const likes0 = myP.stats.likes, cash0 = G.S.player.cash;
  click(`[data-act="promoteModal"][data-id="${myP.id}"]`);
  click('[data-act="doPromote"][data-k="2"]');
  check('promote boosts likes + spends cash', myP.stats.likes > likes0 * 2 && G.S.player.cash < cash0 && myP.promoted === 2);
  G.S.player.heat = 80;
  click('[data-act="buyPR"]');
  check('PR cools heat', G.S.player.heat <= 36);
  click('[data-act="buyVerify"]');
  check('buy verified', G.S.player.verified === true);
  G.S.player.cash = 5;
  const bad = E.promote(myP.id, 1);
  check('cannot afford -> refused', bad === false);
  G.S.player.cash = 100000;
  G.UI.giftModal('n1');
  const cashG = G.S.player.cash;
  click('[data-act="doGift"][data-k="jewelry"]');
  await wait(100);
  check('gift costs cash + DM reaction', G.S.player.cash === cashG - 2000 && G.S.dms.n1.some((m) => m.text === 'aww thanks'), G.S.player.cash);
  w.__fail = true;
  const cashF = G.S.player.cash;
  await E.gift('n1', 'dinner', '');
  w.__fail = false;
  check('failed gift refunds cash', G.S.player.cash === cashF);

  /* ===== groups ===== */
  G.UI.go('messages', { dmWith: null, groupWith: null });
  click('[data-act="newGroup"]');
  type('#groupname', 'Karaoke Crew');
  w.document.querySelectorAll('.gmember').forEach((c) => { if (['n1', 'n2', 'n3'].includes(c.value)) c.checked = true; });
  click('[data-act="makeGroup"]');
  const gid = Object.keys(G.S.groups)[0];
  check('group created + opened', gid && G.UI.groupWith === gid && G.S.groups[gid].members.length === 3);
  type('#dmbox', 'who is singing first');
  click(`[data-act="sendGroup"][data-id="${gid}"]`);
  await wait(100);
  check('group replies from several members', G.S.groups[gid].msgs.filter((m) => m.from !== 'me').length === 3 && G.S.groups[gid].msgs[0].from === 'me');
  check('group chat renders bubbles', w.document.querySelectorAll('#chatlog .bubble').length === 4);
  click(`[data-act="runGroup"][data-id="${gid}"]`);
  await wait(100);
  check('idle group chat continues', G.S.groups[gid].msgs.length === 7);
  prompts.length = 0;
  type('#dmbox', 'ok pick a song');
  click(`[data-act="sendGroup"][data-id="${gid}"]`);
  await wait(100);
  const gp = prompts.find((p) => p.user.includes('writes in group chat'));
  check('group prompt has history + members', gp && gp.user.includes('lol karaoke??') && gp.user.includes('GROUP CHAT ' + gid), gp && gp.user.slice(-1500, -900));
  click(`[data-act="groupSettings"][data-id="${gid}"]`);
  type('#grename', 'Renamed Crew');
  click(`[data-act="renameGroup"][data-id="${gid}"]`);
  check('rename group', G.S.groups[gid].name === 'Renamed Crew');

  /* ===== scene ===== */
  G.UI.openProfile('n1');
  click('[data-act="meetup"][data-id="n1"]');
  click([...w.document.querySelectorAll('[data-act="startScene"]')].find((b) => b.dataset.place === 'Coffee date'));
  await wait(150);
  check('scene page open with narration', G.UI.page === 'scene' && !!$('.narr') && G.S.scenes.n1.log.length === 1);
  const optBtn = $('[data-act="sceneOpt"]');
  check('scene options shown', !!optBtn && optBtn.dataset.t === 'Compliment her');
  click(optBtn);
  await wait(100);
  check('scene continues after option', G.S.scenes.n1.log.length === 3 && G.S.scenes.n1.log[1].role === 'me');
  type('#scenebox', 'I lean in and whisper something');
  click('[data-act="sceneSend"][data-id="n1"]');
  await wait(100);
  check('scene free text', G.S.scenes.n1.log.length === 5);
  click('[data-act="sceneFlow"][data-id="n1"]');
  await wait(100);
  check('scene flow', G.S.scenes.n1.log.length === 6);
  check('scene updated relationship memory', G.S.npcs.n1.memories.includes('Had coffee together'));
  click('[data-act="endScene"][data-id="n1"]');
  check('scene ended', G.S.scenes.n1.active === false && G.UI.page === 'messages');
  
  G.UI.openProfile('n1'); click('[data-act="meetup"][data-id="n1"]');
  check('meet-up places are everyday ones', !/Their place|Hotel/.test($('.modal').textContent));
  G.UI.closeModal();

  /* ===== live stream ===== */
  G.UI.go('home');
  click('[data-act="goLiveModal"]');
  type('#livetitle', 'Karaoke disaster stream');
  const cashL = G.S.player.cash;
  click('[data-act="startLive"]');
  await wait(150);
  check('live recap stored', !!G.S.lastLive && G.S.lastLive.chat.length === 8 && G.S.lastLive.donations.length === 1, JSON.stringify(G.S.lastLive && { p: G.S.lastLive.peak, t: G.S.lastLive.total }));
  check('stream earned cash', G.S.player.cash > cashL);
  check('recap modal shown', /Stream recap/.test($('.modal').textContent));
  G.UI.closeModal();

  /* ===== custom characters ===== */
  G.UI.go('people');
  click('[data-act="createChar"]');
  type('#charidea', 'a bitter gossip journalist');
  click('[data-act="genChar"]');
  await wait(100);
  check('AI fills character form', $('#cname').value === 'Vera Holt');
  $('#crel').value = 'crush';
  click('[data-act="saveChar"]');
  await wait(150);
  const vera = Object.values(G.S.npcs).find((n) => n.handle === '@veraholt');
  check('custom NPC created, age >= 18, relationship preset', vera && vera.custom && vera.age >= 18 && vera.status === 'crush' && vera.rom >= 50, vera && JSON.stringify([vera.age, vera.status, vera.rom, vera.aff, vera.custom]));
  check('manual create validation', (() => { try { E.createCustomNpc({ name: '  ' }); return false; } catch (e) { return true; } })());

  /* ===== memory summarisation ===== */
  const SG = G.S;
  for (let i = 0; i < 30; i++) E.addChron('Filler event ' + i);
  for (let i = 0; i < 12; i++) SG.npcs.n1.memories.push('memory ' + i);
  for (let i = 0; i < 30; i++) SG.dms.n1.push({ id: 'zz' + i, from: i % 2 ? 'n1' : 'me', text: 'chat line ' + i, t: SG.clock, read: true });
  for (let i = 0; i < 34; i++) SG.groups[gid].msgs.push({ id: 'gg' + i, from: 'n1', text: 'group line ' + i, t: SG.clock, read: true });
  for (let i = 0; i < 15; i++) SG.scenes.n1.log.push({ id: 'ss' + i, role: 'narr', text: 'scene line ' + i, t: SG.clock });
  const pend = G.Memory.pending(false);
  check('memory.pending finds all job types', pend.chron.length > 0 && pend.npc.length >= 1 && pend.dm.length >= 1 && pend.group.length >= 1 && pend.scene.length >= 1, JSON.stringify({ c: pend.chron.length, n: pend.npc.length, d: pend.dm.length, g: pend.group.length, s: pend.scene.length }));
  const chron0 = SG.chronicle.length;
  const kept = SG.chronicle.slice(-10).map((c) => c.id);
  prompts.length = 0;
  const done = await G.Memory.run(false, true);
  check('memory.run applied summaries', done >= 4, 'done=' + done);
  check('saga stored + chronicle compacted', SG.saga.startsWith('SAGA-TEXT') && SG.chronicle.length <= 11 && kept.every((id) => SG.chronicle.some((c) => c.id === id)), `${chron0} -> ${SG.chronicle.length}`);
  check('npc history stored, recent memories kept', SG.npcs.n1.history === 'HIST for n1' && SG.npcs.n1.memories.length <= 5 && SG.npcs.n1.memories.includes('memory 11') /* per-job cap leaves a few for the next round */, JSON.stringify({ h: SG.npcs.n1.history, n: SG.npcs.n1.memories.length, m: SG.npcs.n1.memories }));
  check('dm summarised, newest 10 kept', SG.dmSum.n1 === 'DMSUM for n1' && SG.dms.n1.length === 10 && SG.dms.n1[9].text === 'chat line 29', SG.dms.n1.length + ' left');
  check('group + scene summarised', SG.groups[gid].summary === 'GROUPSUM for ' + gid && SG.groups[gid].msgs.length === 10 && SG.scenes.n1.summary === 'SCENESUM for n1' && SG.scenes.n1.log.length <= 5, JSON.stringify({ gs: SG.groups[gid].summary, gl: SG.groups[gid].msgs.length, ss: SG.scenes.n1.summary, sl: SG.scenes.n1.log.length }));
  check('memory prompt used cheap compression system prompt', prompts.some((p) => /You compress the memory/.test(p.system)), prompts.map((p) => p.system.slice(0, 40)).join(' | '));
  prompts.length = 0;
  G.UI.go('home');
  type('#composer', 'after the summary');
  click('[data-act="post"]');
  await wait(100);
  const afterP = prompts.find((p) => /after the summary/.test(p.user));
  check('next turn context includes SAGA + character history', afterP && afterP.user.includes('SAGA (summary of earlier events): SAGA-TEXT') && afterP.user.includes('hist: HIST for n1'), afterP ? afterP.user.slice(0, 1400) : 'no prompt found ' + prompts.length);
  G.UI.go('drama');
  check('saga card on drama page', /The saga so far/.test($('#page').textContent));
  G.UI.go('messages', { dmWith: 'n1', groupWith: null });
  check('dm summary box shown in chat', /Earlier in this chat/.test($('#page').textContent));

  // auto-trigger: after a normal turn, maybe() should kick in without manual call
  for (let i = 0; i < 30; i++) E.addChron('Second batch event ' + i);
  const memRuns0 = SG.memRuns;
  G.UI.go('home');
  type('#composer', 'trigger auto summary');
  click('[data-act="post"]');
  await wait(300);
  check('auto summarisation fires after a turn', SG.memRuns > memRuns0, `memRuns ${memRuns0} -> ${SG.memRuns}`);
  // failure back-off
  w.__fail = true;
  for (let i = 0; i < 30; i++) E.addChron('Third batch ' + i);
  const failRes = await G.Memory.run(false, true);
  w.__fail = false;
  check('summary failure is safe + backs off', failRes === 0 && G.Memory.failUntil > SG.turns);
  G.Memory.failUntil = 0;

  /* ===== migration of an old save ===== */
  const old = JSON.parse(JSON.stringify(G.S));
  ['groups', 'scenes', 'dmSum', 'saga', 'ach'].forEach((k) => delete old[k]);
  old.counters = { npc: 5, post: 20, story: 3 };
  old.chronicle.forEach((c) => delete c.id);
  delete old.player.cash;
  Object.values(old.npcs).forEach((n) => { delete n.age; delete n.history; });
  const mig = E.migrate(old);
  check('migrate old save', mig.groups && mig.scenes && mig.dmSum && mig.ach && mig.counters.chron && mig.chronicle.every((c) => c.id != null) && mig.player.cash != null && Object.values(mig.npcs).every((n) => n.age >= 18));

  /* ===== achievements ===== */
  E.checkAch();
  const got = Object.keys(G.S.ach);
  check('achievements unlocked', ['first_post', 'viral', 'dating', 'group', 'scene', 'creator', 'live', 'saga'].filter((k) => !got.includes(k)).length <= 2, got.join());

  /* ===== settings page + theme + selftest ===== */
  G.UI.go('settings');
  check('settings shows content + memory cards', /Content/.test($('#page').textContent) && /Memory/.test($('#page').textContent));
  const themeSel = $('[data-setting="theme"]');
  themeSel.value = 'light';
  themeSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('theme applies', w.document.documentElement.dataset.theme === 'light' && G.settings.theme === 'light');
  themeSel.value = 'dark'; themeSel.dispatchEvent(new w.Event('change', { bubbles: true }));

  const sid = G.S.id;
  const postsBefore = Object.keys(G.S.posts).length;
  click('[data-act="selftest"]');
  await wait(2000);
  const modalTxt = $('.modal') ? $('.modal').textContent : '';
  check('selftest finished', /All features work|failed/.test(modalTxt), modalTxt.slice(0, 700));
  check('selftest all pass', /All features work/.test(modalTxt) && !/❌/.test(modalTxt));
  check('selftest restored the real world untouched', G.S.id === sid && Object.keys(G.S.posts).length === postsBefore && G.busy === false);
  G.UI.closeModal();

  /* ===== persistence round trip of everything ===== */
  G.Store.save();
  G.S = null;
  G.Store.load(sid);
  check('save/load round-trips new state', G.S.groups[gid] && G.S.scenes.n1 && G.S.saga && G.S.ach.first_post != null);

  // parser robustness
  const U = G.U;
  check('parse truncated json', U.parseJSON('{"a":[{"x":1},{"y":2},{"z":"unfini').a.length >= 2);
  check('fmt', U.fmt(1234) === '1.2K' && U.fmt(4200000) === '4.2M');

  console.log('calls:', calls.length, '| errors:', errors);
  console.log('counts: npcs', Object.keys(G.S.npcs).length, 'posts', Object.keys(G.S.posts).length, 'spend', G.S.spend.toFixed(4));
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
