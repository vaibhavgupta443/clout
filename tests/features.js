// Tests for: scenarios, population/town/swipe, post types,
// Synthetic data only.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = process.argv[2];

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true;
w.scrollTo = () => {};
w.TextDecoder = TextDecoder;
w.TextEncoder = TextEncoder;
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));

const prompts = [];
w.__npcPoll = false;
w.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const user = body.messages[1].content;
  const system = body.messages[0].content;
  prompts.push({ system, user });
  let out = {};
  if (user.includes('NEW CHAT SECTION')) out = { summary: 'GSUM: the group joked, flirted and fought.' };
  else if (user.includes('Assess where the relationship')) out = { aff: 40, rom: 10, riv: 0, trust: 30, status: 'friend', mood: 'happy', memories: ['likes music'], secret: '', chronicle: [] };
  else if (system.startsWith('You output only JSON')) out = { ok: true };
  else {
    const m = user.match(/new post id (p\d+)|\(id (p\d+)\)|to post (p\d+)/);
    const pid = m ? m[1] || m[2] || m[3] : 'p1';
    const pool = (user.match(/CROWD POOL[^\n]*\n((?:@[^\n]+\n?)+)/) || [])[1];
    const poolHandle = pool ? pool.split('\n')[0].split('|')[0] : '@nobody_1';
    out = {
      judge: { quality: 7, virality: 4, sentiment: 5, controversy: 3, tone: 'bold', summary: 'ok' },
      posts: [{ author: 'n1', text: 'nice one', replyTo: pid, buzz: 5, poll: w.__npcPoll ? ['yes', 'no', 'maybe'] : undefined, attach: w.__npcPoll ? 'a blurry sunset photo' : undefined }],
      crowd: [{ name: 'Pooly McPoolface', handle: poolHandle, text: 'love this', stance: 'fan', replyTo: pid }, { name: 'Randomer', handle: '@zzz_notinpool', text: 'meh', stance: 'neutral', replyTo: pid }],
      dms: [{ from: 'n1', text: 'saw that 😏' }],
      rel: [{ id: 'n1', aff: 5, mood: 'flirty' }],
      chronicle: 'something happened',
    };
  }
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0 } }) };
};
for (const f of ['util', 'db', 'store', 'global/limits', 'ai', 'engine', 'lexicon', 'persona', 'voice', 'bank', 'media', 'mem', 'social', 'react', 'world', 'ui', 'memory', 'extras', 'population', 'scenarios', 'pages', 'pages2', 'pages3', 'stories', 'live', 'selftest', 'main', 'studio']) w.eval(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'));
if (w.G.Live) w.G.Live.stop();
const G = w.G;
const E = G.Engine;
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
const change = (sel, val) => {
  const el = $(sel);
  el.value = val;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!cond) process.exitCode = 1;
};

/* ---- fixtures ---- */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function makePng(cardObj) {
  const b64 = Buffer.from(JSON.stringify(cardObj), 'utf8').toString('base64');
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const text = Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0]), Buffer.from(b64, 'latin1')]);
  const buf = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('tEXt', text), chunk('IDAT', Buffer.from([8, 29, 1, 0, 0, 255, 255, 0, 0, 0, 1])), chunk('IEND', Buffer.alloc(0))]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
function plainPng() { // a valid PNG with NO character data = an expression sprite
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const buf = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.from([8, 29, 1, 0, 0, 255, 255, 0, 0, 0, 1])), chunk('IEND', Buffer.alloc(0))]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
const file = (name, content, rel) => ({
  name, size: 1000, webkitRelativePath: rel || name,
  text: async () => (typeof content === 'string' ? content : Buffer.from(content).toString('utf8')),
  arrayBuffer: async () => (typeof content === 'string' ? Buffer.from(content, 'utf8').buffer : content),
});

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 200)); // startup is async now (opens the database)
  G.settings.apiKey = 'sk-test';
  G.settings.autoEvents = 0;
  E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 'test world' });
  const S = G.S;
  const n1 = E.makeNpc({ name: 'Mia Vale', handle: '@miav', age: 24, personality: 'flirty and bubbly', followers: 9000, aff: 20, rom: 20, trust: 20, status: 'friend' });
  const n2 = E.makeNpc({ name: 'Kai Storm', handle: '@kai', age: 28, personality: 'cocky', followers: 40000 });
  check('setup: ids are n1, n2', n1.id === 'n1' && n2.id === 'n2');
  check('blank world has population defaults', S.popSize === 250000 && S.popSeed > 0 && S.popMet && typeof S.popMet === 'object');

  /* ================= scenarios ================= */
  const Scen = G.Scen;
  const c0 = Scen.count();
  check('>= 1,000,000 distinct scenarios (clean)', c0 >= 1e6, c0.toLocaleString());
  const rolls = new Set();
  for (let i = 0; i < 1000; i++) rolls.add(Scen.roll({ cat: 'any' }).text);
  check('1000 rolls are almost all unique', rolls.size >= 990, String(rolls.size));
  const rr = Array.from({ length: 60 }, () => Scen.roll({ cat: 'romance' }).text);
  const withCast = rr.filter((t) => /Mia Vale \(n1\)|Kai Storm \(n2\)|\(@[a-z]+_[0-9a-z]+, a local\)/.test(t)).length;
  const withMe = rr.filter((t) => t.includes('Sam')).length;
  check('rolls name real characters / town people and the player', withCast >= 50 && withMe >= 50, `cast ${withCast}/60, player ${withMe}/60`);
  const r1 = Scen.roll({ cat: 'romance' });
  check('roll has twist/setting/complication/tone', /Twist:.*Setting:.*Complication:.*Tone:/.test(r1.text));
  check('spice off -> empty', Scen.spice(S, 'public', () => 0.0) === '');
  G.settings.autoEvents = 3;
  check('spice chaotic -> a scenario', Scen.spice(S, 'public', () => 0.1).length > 40);
  check('spice respects rate (rnd high -> none)', Scen.spice(S, 'public', () => 0.99) === '');
  G.settings.autoEvents = 1;
  check('spice occasional rate 15%', Scen.spice(S, 'public', () => 0.1).length > 0 && Scen.spice(S, 'public', () => 0.2) === '');

  // wildcard injected into a real turn prompt without extra calls
  G.settings.autoEvents = 3;
  prompts.length = 0;
  G.UI.go('home');
  type('#composer', 'hello town');
  const rndKeep = w.Math.random;
  w.Math.random = () => 0.1; // make the 65% roll deterministic
  click('[data-act="post"]');
  await wait(120);
  w.Math.random = rndKeep;
  const turnP = prompts.find((p) => p.user.includes('hello town'));
  check('auto-event WILDCARD woven into the prompt', turnP && /WILDCARD \(weave this in naturally/.test(turnP.user));
  check('no extra API calls for the wildcard', prompts.filter((p) => p.user.includes('hello town')).length === 1);
  G.settings.autoEvents = 0;
  prompts.length = 0;
  type('#composer', 'quiet post');
  click('[data-act="post"]');
  await wait(120);
  check('no wildcard when auto-events off', !prompts.find((p) => p.user.includes('quiet post')).user.includes('WILDCARD'));
  // time passing
  G.settings.autoEvents = 3;
  prompts.length = 0;
  w.Math.random = () => 0.1;
  await E.advance('refresh');
  w.Math.random = rndKeep;
  check('wildcard in time-passing turns too', prompts.some((p) => /TIME PASSES/.test(p.user) && /WILDCARD/.test(p.user)));
  G.settings.autoEvents = 0;

  // Director UI
  G.UI.go('director');
  check('director shows generator + count', /Random scenario generator/.test($('#page').textContent) && /distinct scenarios/.test($('#page').textContent));
  click('[data-act="scenCat"][data-k="drama"]');
  click('[data-act="scenRoll"]');
  check('roll preview shown', !!$('#page .sumbox') && /Twist:/.test($('#page').textContent));
  const rolledText = G.UI.scenRoll.text;
  prompts.length = 0;
  click('[data-act="scenGo"]');
  await wait(150);
  check('scenario sent to the model via Director', prompts.some((p) => p.user.includes('SCENARIO to play out now') && p.user.includes(rolledText.slice(0, 40))));

  /* ================= population ================= */
  const Pop = G.Pop;
  const a = Pop.person(12345), b = Pop.person(12345);
  check('person(i) is deterministic', JSON.stringify(a) === JSON.stringify(b));
  check('different seed -> different person', Pop.person(12345, 999).name !== a.name || Pop.person(12345, 999).bio !== a.bio);
  let minAge = 99, handles = new Set(), bad = 0;
  const t0 = Date.now();
  for (let i = 0; i < 200000; i++) {
    const p = Pop.person(i);
    if (p.age < minAge) minAge = p.age;
    handles.add(p.handle);
    if (!p.name || !p.bio || !(p.followers > 0)) bad++;
  }
  const ms = Date.now() - t0;
  check('200,000 people generated: all adults', minAge >= 18, 'min age ' + minAge);
  check('200,000 unique handles', handles.size === 200000, String(handles.size));
  check('no malformed people', bad === 0);
  check('generation is fast (200k in < 8s)', ms < 8000, ms + 'ms');
  const far = Pop.person(999999);
  check('person #999,999 exists (1M scale)', far.idx === 999999 && far.handle.includes('_'));
  let rt = 0;
  for (let k = 0; k < 500; k++) {
    const i = Math.floor(Math.random() * 250000);
    const p = Pop.person(i);
    const f = Pop.fromHandle(p.handle);
    if (f && f.idx === i) rt++;
  }
  check('handle -> person round trip', rt === 500, String(rt));
  check('fromHandle rejects junk', Pop.fromHandle('@nobody') === null && Pop.fromHandle('@x_zzzzzzzzzz') === null && Pop.fromHandle('@' + a.handle.slice(1, 3) + '_' + (12345).toString(36)) === null);
  const pg = Pop.page(0, 24);
  check('page 0 has 24 people, total 250k', pg.people.length === 24 && pg.total === 250000 && pg.pages === Math.ceil(250000 / 24));
  check('last page partial', Pop.page(pg.pages - 1, 24).people.length === 250000 - (pg.pages - 1) * 24);
  const sr = Pop.page(0, 24, 'barista');
  check('search finds matches', sr.people.length > 0 && sr.people.every((p) => /barista/i.test(p.job + p.bio + p.name + p.likes.join(' ') + p.vibes.join(' '))));
  const direct = Pop.page(0, 24, a.handle);
  check('search by handle finds the person', direct.people[0] && direct.people[0].idx === 12345);
  G.S.popSize = 1000000;
  check('population can be 1,000,000', Pop.size() === 1000000 && Pop.person(999999).idx === 999999);
  const pool = Pop.pool(8);
  check('pool gives 8 unique people and registers handles', pool.length === 8 && new Set(pool.map((p) => p.handle)).size === 8 && Pop.recent.has(pool[0].handle));
  G.S.popSize = 250000;

  // meeting
  const person = Pop.person(777);
  const npc = Pop.meet(777);
  check('meet promotes to a real character', npc.name === person.name && npc.pop === 777 && S.popMet[777] === npc.id && npc.age >= 18 && S.npcs[npc.id]);
  check('meet is idempotent', Pop.meet(777).id === npc.id && Object.values(S.npcs).filter((n) => n.pop === 777).length === 1);

  // swipe
  const origRandom = w.Math.random;
  w.Math.random = () => 0.01; // always lucky
  const cand = Pop.person(4242);
  const res = Pop.swipe(4242, 'like');
  w.Math.random = origRandom;
  check('swipe like -> match (lucky roll)', res.match === true && res.npc.pop === 4242 && res.npc.rom >= 18);
  check('match sends an opener DM + chronicle + notification', (S.dms[res.npc.id] || []).length === 1 && S.dms[res.npc.id][0].from === res.npc.id && S.chronicle.some((c) => /matched with/.test(c.text)) && S.notifs.some((n) => /match/i.test(n.text)));
  check('pass never matches', Pop.swipe(5000, 'pass').match === false && !S.popMet[5000]);
  w.Math.random = () => 0.999;
  check('unlucky roll -> no match', Pop.swipe(5001, 'like').match === false && !S.popMet[5001]);
  w.Math.random = origRandom;
  let matches = 0;
  for (let i = 0; i < 400; i++) { const r = Pop.swipe(10000 + i, 'like'); if (r.match) matches++; }
  check('match rate is plausible (not 0%, not 100%)', matches > 20 && matches < 380, matches + '/400');
  check('super like helps', (() => { let m1 = 0, m2 = 0; for (let i = 0; i < 600; i++) { if (Pop.swipe(20000 + i, 'like').match) m1++; if (Pop.swipe(30000 + i, 'super').match) m2++; } return m2 > m1; })());

  // town UI
  G.UI.go('town');
  check('town page: browse', !!$('.popcard') && /people/.test($('#page').textContent) && w.document.querySelectorAll('.popcard').length === 24);
  click('[data-act="townGo"][data-d="1"]');
  check('town pager next page', G.UI.townPage === 1 && w.document.querySelectorAll('.popcard').length === 24);
  type('#townq', 'barista');
  $('#townq').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('town search via UI', G.UI.townPage === 0 && w.document.querySelectorAll('.popcard').length > 0);
  G.UI.townQ = '';
  change('[data-pop="size"]', '1000000');
  check('size select changes population (1M)', G.S.popSize === 1000000 && /1\.0?M|1M/.test($('#page').textContent.replace(/\s+/g, ' ')), $('#page').textContent.slice(0, 120));
  change('[data-pop="size"]', '250000');
  click('[data-act="popProfile"]');
  check('person modal opens', /Meet them/.test($('.modal').textContent));
  click('[data-act="popMeet"]');
  await wait(30);
  check('meeting from the modal opens their profile', /Do something/.test($('.modal').textContent));
  G.UI.closeModal();
  click('[data-act="townTab"][data-t="swipe"]');
  check('swipe card shown', !!$('.swipecard') && !!$('[data-act="swipe"][data-m="super"]'));
  const swipedBefore = Object.keys(S.popMet).length;
  w.Math.random = () => 0.01;
  click('[data-act="swipe"][data-m="like"]');
  w.Math.random = origRandom;
  check('swiping from the UI matches + advances the deck', Object.keys(S.popMet).length === swipedBefore + 1 && !!$('.swipecard'));
  G.S.popSize = 0;
  G.UI.go('town');
  check('town can be switched off', /switched off/.test($('#page').textContent) && G.Pop.pool(5).length === 0);
  G.S.popSize = 250000;

  // crowd comes from the town, and is clickable
  prompts.length = 0;
  G.UI.go('home');
  type('#composer', 'who is out tonight');
  click('[data-act="post"]');
  await wait(150);
  const crowdP = prompts.find((p) => p.user.includes('who is out tonight'));
  check('prompt carries a CROWD POOL from the town', crowdP && /CROWD POOL/.test(crowdP.user) && /@[a-z]+_[0-9a-z]+\|/.test(crowdP.user));
  const myPost = Object.values(S.posts).find((p) => p.text === 'who is out tonight');
  const kids = Object.values(S.posts).filter((p) => p.replyTo === myPost.id && p.author === 'crowd');
  const linked = kids.find((k) => k.crowd.name === 'Pooly McPoolface');
  const unlinked = kids.find((k) => k.crowd.name === 'Randomer');
  check('crowd reply using a pool handle is linked to a town person', linked && linked.crowd.pop !== undefined && Pop.person(linked.crowd.pop).handle === linked.crowd.handle);
  check('crowd reply with an unknown handle is not linked', unlinked && unlinked.crowd.pop === undefined);
  A_threadOpen: {
    click(`[data-act="thread"][data-id="${myPost.id}"]`);
    check('crowd avatar opens the town profile', !!$('[data-act="popProfile"]'));
  }

  /* ================= post types ================= */
  G.UI.go('home');
  check('composer shows post types', /Photo/.test($('#page').textContent) && /Poll/.test($('#page').textContent));
  click('[data-act="ptype"][data-t="photo"]');
  check('photo type shows describe box', !!$('.attach-in'));
  type('#composer', 'sunset vibes');
  type('.attach-in', 'a golden sunset over the harbor');
  prompts.length = 0;
  click('[data-act="post"]');
  await wait(120);
  const photoPost = Object.values(S.posts).find((p) => p.text === 'sunset vibes');
  check('photo post stores attachment + type', photoPost && photoPost.attach === 'a golden sunset over the harbor' && photoPost.ptype === 'photo');
  const pp = prompts.find((p) => p.user.includes('sunset vibes'));
  check('model is told about the photo', pp && /POST TYPE: photo/.test(pp.user) && /golden sunset over the harbor/.test(pp.user));
  check('photo rendered on the post', /golden sunset over the harbor/.test($('#post-' + photoPost.id).textContent));
  check('composer resets to plain post after posting', G.UI.ptype === 'text');

  click('[data-act="ptype"][data-t="poll"]');
  type('#composer', 'best snack?');
  type('[data-bind="poll0"]', 'chips');
  click('[data-act="post"]');
  await wait(50);
  check('poll with <2 options refused', !Object.values(S.posts).some((p) => p.text === 'best snack?'));
  type('[data-bind="poll0"]', 'chips');
  type('[data-bind="poll1"]', 'candy');
  type('[data-bind="poll2"]', 'fruit');
  click('[data-act="post"]');
  await wait(150);
  const pollPost = Object.values(S.posts).find((p) => p.text === 'best snack?');
  check('poll stored with simulated votes', pollPost && pollPost.poll.options.length === 3 && pollPost.poll.options.every((o) => o.v > 0) && pollPost.poll.voted === null);
  check('poll options sent to model', prompts.some((p) => /POLL with options: chips \/ candy \/ fruit/.test(p.user)));
  G.UI.go('home');
  G.UI.feedTab = 'mine';
  G.UI.render();
  check('poll renders as options', w.document.querySelectorAll(`#post-${pollPost.id} .popt`).length === 3);
  const v0 = pollPost.poll.options[1].v;
  click(`#post-${pollPost.id} [data-act="vote"][data-i="1"]`);
  check('voting works once', pollPost.poll.voted === 1 && pollPost.poll.options[1].v === v0 + 1);
  E.vote(pollPost.id, 2);
  check('cannot vote twice', pollPost.poll.voted === 1);
  check('results shown after voting', /%/.test($('#post-' + pollPost.id).textContent));

  w.__npcPoll = true;
  type('#composer', 'trigger npc poll');
  click('[data-act="post"]');
  await wait(150);
  const npcPoll = Object.values(S.posts).find((p) => p.author === 'n1' && p.poll && /blurry sunset/.test(p.attach || ''));
  check('NPC posts can carry polls + photos', npcPoll && npcPoll.poll.options.length === 3 && /blurry sunset/.test(npcPoll.attach));
  w.__npcPoll = false;

  check('the system prompt is PG-13 and every npc is 18+', /PG-13/.test(G.AI.system()) && Object.values(S.npcs).every((n) => n.age >= 18));
  check('no adult post type is offered', !/Thirst/.test($('#page').textContent));

  /* ================= misc ================= */
  G.Store.save();
  const id = S.id;
  G.S = null;
  G.Store.load(id);
  check('save/load keeps town + polls', G.S.popMet[777] && Object.values(G.S.posts).some((p) => p.poll));
  check('old save without town fields migrates', (() => { const o = JSON.parse(JSON.stringify(G.S)); delete o.popSize; delete o.popSeed; delete o.popMet; const m = E.migrate(o); return m.popSize === 250000 && m.popSeed > 0 && m.popMet; })());
  check('no console errors', errors.length === 0, errors.join(' | '));
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
