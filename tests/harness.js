// Shared test harness: boots the real app (all scripts) inside jsdom with a scriptable fake OpenRouter.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const FILES = ['util', 'db', 'store', 'global/limits', 'ai', 'engine', 'lexicon', 'persona', 'voice', 'bank', 'media', 'mem', 'social', 'react', 'world', 'ui', 'icons', 'memory', 'extras', 'population', 'scenarios', 'pages', 'pages2', 'pages3', 'rag', 'directives', 'charts', 'reasons', 'channels', 'goals', 'clock', 'faces', 'trends', 'pitches', 'vault', 'refs', 'leads', 'tier', 'fame', 'memplus', 'mind', 'dialogue', 'bonds', 'rep', 'seasons', 'chapters', 'plans', 'moments', 'recap', 'rhythm', 'admin', 'stories', 'live', 'selftest', 'main', 'studio', 'around', 'minimal'];

const { IDBFactory } = require('fake-indexeddb');
exports.IDBFactory = IDBFactory;
exports.boot = function (root, opts = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  w.confirm = () => true;
  w.prompt = () => 'x';
  w.scrollTo = () => {};
  w.TextDecoder = TextDecoder;
  w.TextEncoder = TextEncoder;
  if (opts.idb) w.indexedDB = opts.idb === true ? new IDBFactory() : opts.idb;
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};
  w.addEventListener('error', (e) => errors.push('window.error: ' + e.message));
  w.console.error = (...a) => errors.push('console.error: ' + a.map(String).join(' '));
  const warns = [];
  w.console.warn = (...a) => warns.push(a.map(String).join(' '));
  process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e && e.message)));
  // collapse real back-off sleeps so retry logic is testable quickly (keep the 120s abort timer real)
  const realST = w.setTimeout.bind(w);
  const BACKOFFS = new Set([1200, 2400, 3600, 1500, 3000, 4500]); // the AI client's retry delays only
  w.setTimeout = (fn, ms, ...a) => realST(fn, BACKOFFS.has(ms) ? 0 : ms, ...a);

  const prompts = [];
  const state = { mode: 'normal', payload: null, calls: 0, queue: [] };
  // A well-formed generic reply that references whatever ids the prompt mentions
  const generic = (user, system) => {
    if (system.startsWith('You output only JSON')) return { ok: true };
    if (user.includes('NEW CHAT SECTION')) return { summary: 'summary text' };
    if (user.includes('Assess where the relationship')) return { aff: 30, rom: 10, riv: 0, trust: 20, status: 'friend', mood: 'happy', memories: ['m1'], secret: '', chronicle: [] };
    if (system.includes('You compress the memory')) {
      const out = { saga: 'a saga of events', npc: {}, dm: {}, group: {}, scene: {} };
      for (const m of user.matchAll(/CHARACTER (n\d+)/g)) out.npc[m[1]] = 'hist';
      for (const m of user.matchAll(/PRIVATE CHAT with (n\d+)/g)) out.dm[m[1]] = 'dmsum';
      for (const m of user.matchAll(/GROUP CHAT (g\d+)/g)) out.group[m[1]] = 'gsum';
      for (const m of user.matchAll(/SCENES with (n\d+)/g)) out.scene[m[1]] = 'ssum';
      return out;
    }
    if (user.includes('Write 4 DIFFERENT')) return { options: [{ tone: 'funny', text: 'idea one' }, { tone: 'spicy', text: 'idea two' }] };
    if (user.includes('Design ONE new character')) return { name: 'Vera Holt', handle: '@veraholt', age: 30, role: 'journalist', emoji: '📰', bio: 'gossip', personality: 'nosy', followers: 5000, secret: 'x' };
    if (user.includes('INTERACTIVE SCENE')) return { scene_text: 'The room is warm. ' + 'Words '.repeat(40), scene_options: ['a', 'b', 'c'], rel: [{ id: (user.match(/between the player and (n\d+)/) || [])[1], aff: 3, memory: 'scene memory' }] };
    const gid = (user.match(/group chat (g\d+)/) || [])[1];
    if (gid) return { group_msgs: [{ group: gid, from: 'n1', text: 'hello group' }, { group: gid, from: 'n2', text: 'hi' }] };
    const m = user.match(/new post id (p\d+)|\(id (p\d+)\)|to post (p\d+)/);
    const pid = m ? m[1] || m[2] || m[3] : 'p1';
    const res = {
      judge: { quality: 7, virality: 5, sentiment: 5, controversy: 3, tone: 'bold', summary: 'ok' },
      posts: [{ author: 'n1', text: 'nice one', replyTo: pid, buzz: 5 }],
      crowd: [{ name: 'Fan', handle: '@fan_1', text: 'love it', stance: 'fan', replyTo: pid }],
      dms: [{ from: 'n1', text: 'saw that' }],
      rel: [{ id: 'n1', aff: 3, mood: 'happy', memory: 'm' }],
      trending: [{ tag: '#x', heat: 50 }],
      chronicle: 'something happened',
    };
    if (user.includes('streaming LIVE')) res.live = { peak: 50, chat: [{ name: 'v', text: 'pog', stance: 'fan' }], donations: [{ name: 'd', amount: 5, msg: 'hi' }], moment: 'clip' };
    return res;
  };
  w.fetch = async (url, o) => {
    const u = String(url);
    if (u.includes('/api/media')) return { ok: true, json: async () => ({ exists: false, items: [] }) };
    state.calls++;
    if (u.includes('/models')) return { ok: true, json: async () => ({ data: [{ id: 'a/b', pricing: { prompt: '0.0000001', completion: '0.0000002' }, supported_parameters: ['response_format'] }] }) };
    if (u.endsWith('/key')) return { ok: true, json: async () => ({ data: { usage: 0.1, limit: 10, limit_remaining: 9.9 } }) };
    const body = JSON.parse(o.body);
    const user = body.messages[1].content;
    const system = body.messages[0].content;
    prompts.push({ system, user, body });
    if (state.queue.length) {
      const q = state.queue.shift();
      if (typeof q === 'function') return q(body);
      return q;
    }
    const content = state.mode === 'raw' ? state.payload : JSON.stringify(state.mode === 'fixed' ? state.payload : generic(user, system));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0 } }) };
  };
  ['vader', 'morphdom', 'graphology.umd.min', 'graphology-library.min', 'chrono.min', 'compromise.min'].forEach((f) => w.eval(fs.readFileSync(path.join(root, 'vendor', f + '.js'), 'utf8')));
  FILES.forEach((f) => w.eval(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')));
  const realPostDial = w.G.World.postDial;
  w.G.World.postDial = () => 1; // test worlds simulate characters posting on their own; a test can restore the real dial via H.realPostDial
  w.G.__realPostDial = realPostDial;
  if (w.G.Live) w.G.Live.stop(); // the real-time heartbeat would race the deterministic tests
  const G = w.G;
  G.settings.apiKey = 'sk-test';
  G.settings.legacyHome = true; // old layout on Home (composer + update cards): most tests were written for it; tests/home-calm.js checks the new one
  G.settings.minimalUI = false; // the tests read the full labels; tests/minimal-ui.js checks the minimal mode
  G.settings.autoEvents = 0;

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const H = {
    w, G, E: G.Engine, U: G.U, errors, warns, prompts, state, $, $$,
    click: (sel) => {
      const el = typeof sel === 'string' ? $(sel) : sel;
      if (!el) throw new Error('missing ' + sel);
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    },
    type: (sel, val) => {
      const el = typeof sel === 'string' ? $(sel) : sel;
      el.value = val;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
    },
    change: (sel, val) => {
      const el = typeof sel === 'string' ? $(sel) : sel;
      el.value = val;
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
    },
    wait: (ms = 30) => new Promise((r) => setTimeout(r, ms)),
    ok: (resp) => ({ ok: true, status: 200, json: async () => resp }),
    reply: (content, extra = {}) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: Object.assign({ prompt_tokens: 10, completion_tokens: 10, cost: 0 }, extra.usage) }) }),
    fail: (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) }),
  };
  let pass = 0;
  let fail = 0;
  const failures = [];
  H.check = (name, cond, extra = '') => {
    if (cond) pass++;
    else {
      fail++;
      failures.push(name + (extra ? ' — ' + extra : ''));
    }
    if (process.env.VERBOSE || !cond) console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? ' — ' + String(extra).slice(0, 400) : ''));
  };
  // NPC stories are only made when the owner directs them, so tests that need a story in the tray put one there directly
  H.seedStory = (npc, t) => {
    const S = G.S;
    S.stories = S.stories || [];
    const text = 'a quiet moment from ' + npc.name.split(' ')[0];
    const st = { id: 'st' + (S.counters.story_n = (S.counters.story_n || 1) + 1), author: npc.id, t, exp: t + 1440, kind: 'npc', text, scene: G.Lex.sceneFor(['default'], text), poll: null, views: [], seen: false, rx: {} };
    S.stories.push(st);
    return st;
  };
  H.seedFeed = (n = 40) => {
    const E = G.Engine;
    const S = G.S;
    const ppl = Object.values(S.npcs).filter((x) => !x.userAlt);
    const lines = ['good morning everyone ☀️', 'this coffee is unreal', 'who else is up??', 'new song snippet 🎵', 'rough day honestly', 'weekend plans?? #weekend', 'look at this view'];
    for (let i = 0; i < n; i++) {
      const a = ppl[i % ppl.length];
      E.addPost({ author: a.id, text: lines[i % 7] + ' #' + i, ptype: i % 4 === 0 ? 'photo' : '', attach: i % 4 === 0 ? 'a sunset over the harbor' : '', buzz: 2 + (i % 5), t: Math.max(1, S.clock - (n - i) * 25), stats: { likes: 20 + i * 3, reposts: i % 4, replies: 0, views: 300 + i * 40 } }, S);
    }
  };
  H.summary = (label) => {
    console.log(`\n== ${label}: ${pass} passed, ${fail} failed, ${errors.length} console/window errors`);
    if (errors.length) errors.slice(0, 8).forEach((e) => console.log('  ERR ' + e.slice(0, 300)));
    if (fail || errors.length) process.exitCode = 1;
  };
  H.freshWorld = (opts2 = {}) => {
    G.settings.postDial = 1; // the test worlds simulate NPCs posting on their own
    G.settings.approveActions = false; // tests act without waiting for a human (tests/approve.js covers the approval flow)
    const E = G.Engine;
    E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: opts2.fame || 'rising', premise: 'test' });
    const S = G.S;
    E.makeNpc({ name: 'Mia Vale', handle: '@miav', age: 24, personality: 'flirty', followers: 9000, aff: 20, rom: 20, trust: 20, status: 'friend', role: 'love_interest' });
    E.makeNpc({ name: 'Kai Storm', handle: '@kai', age: 28, personality: 'cocky', followers: 40000, role: 'rival' });
    E.makeNpc({ name: 'Dex Rowan', handle: '@dex', age: 31, personality: 'ALL CAPS', followers: 3000, role: 'troll' });
    E.addPost({ author: 'n1', text: 'good morning!', buzz: 3, stats: { likes: 100, reposts: 5, replies: 2, views: 900 } });
    E.addPost({ author: 'n2', text: 'imagine being @dex lol', buzz: 8, stats: { likes: 900, reposts: 40, replies: 30, views: 12000 } });
    S.npcRel.push({ a: 'n1', b: 'n2', type: 'ex', note: 'messy' });
    S.storylines.push({ id: 's1', title: 'Prom scandal', summary: 'who leaked it', heat: 55, status: 'active', participants: ['n1', 'n2'], updated: S.clock, log: [] });
    S.counters.story = 2;
    E.checkAch(); // achievements the fixture already qualifies for
    return S;
  };
  return H;
};

// invariants that must hold for ANY game state, whatever the AI sent
exports.invariants = function (G) {
  const S = G.S;
  const bad = [];
  const E = G.Engine;
  const add = (m) => bad.length < 25 && bad.push(m);
  // 1) no NaN / Infinity anywhere
  const walk = (o, p, depth) => {
    if (depth > 12) return;
    if (typeof o === 'number' && !Number.isFinite(o)) add('non-finite number at ' + p);
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], p + '.' + k, depth + 1);
  };
  walk(S, 'S', 0);
  const P = S.player;
  const inr = (v, a, b) => typeof v === 'number' && v >= a && v <= b;
  if (!(Number.isInteger(P.followers) && P.followers >= 0)) add('followers ' + P.followers);
  if (!(typeof P.cash === 'number' && P.cash >= 0)) add('cash ' + P.cash);
  if (!inr(P.heat, 0, 100)) add('heat ' + P.heat);
  if (!(P.level >= 1 && Number.isInteger(P.level))) add('level ' + P.level);
  if (!inr(P.audience.love, 0, 100) || !inr(P.audience.hate, 0, 100)) add('audience');
  Object.entries(P.stats).forEach(([k, v]) => !inr(v, 1, 100) && add('stat ' + k + '=' + v));
  const handles = new Set();
  Object.values(S.npcs).forEach((n) => {
    if (!inr(n.aff, -100, 100) || !inr(n.rom, 0, 100) || !inr(n.riv, 0, 100) || !inr(n.trust, 0, 100)) add('npc meters ' + n.id);
    if (!(n.age >= 18)) add('npc age ' + n.id + '=' + n.age);
    if (!E.STATUSES.includes(n.status)) add('npc status ' + n.id + '=' + n.status);
    if (typeof n.name !== 'string' || !n.name) add('npc name ' + n.id);
    if (typeof n.handle !== 'string' || !n.handle.startsWith('@')) add('npc handle ' + n.id);
    if (handles.has(n.handle)) add('duplicate handle ' + n.handle);
    handles.add(n.handle);
    if (!Array.isArray(n.memories) || n.memories.length > 10 || n.memories.some((m) => typeof m !== 'string')) add('npc memories ' + n.id);
    if (!(n.followers >= 5)) add('npc followers ' + n.id);
  });
  // posts
  const seen = new Set();
  S.postOrder.forEach((id) => {
    if (!S.posts[id]) add('postOrder dangling ' + id);
    if (seen.has(id)) add('postOrder duplicate ' + id);
    seen.add(id);
  });
  Object.values(S.posts).forEach((p) => {
    if (!seen.has(p.id)) add('post not in order ' + p.id);
    if (p.replyTo && (!S.posts[p.replyTo] || p.replyTo === p.id)) add('bad replyTo ' + p.id + '->' + p.replyTo);
    if (p.author !== 'me' && p.author !== 'crowd' && !S.npcs[p.author]) add('post author ' + p.id);
    if (typeof p.text !== 'string') add('post text ' + p.id);
    ['likes', 'reposts', 'replies', 'views'].forEach((k) => !(p.stats[k] >= 0 || p.liked) && add('post stat ' + p.id + k));
    if (p.poll && (!Array.isArray(p.poll.options) || p.poll.options.length < 2)) add('poll ' + p.id);
    if (p.author === 'crowd' && (!p.crowd || typeof p.crowd.handle !== 'string')) add('crowd obj ' + p.id);
  });
  Object.keys(S.dms).forEach((id) => {
    if (!S.npcs[id]) add('dm for missing npc ' + id);
    S.dms[id].forEach((m) => {
      if (m.from !== 'me' && m.from !== id) add('dm from ' + m.from);
      if (typeof m.text !== 'string') add('dm text');
    });
  });
  Object.values(S.groups).forEach((g) => {
    g.members.forEach((m) => !S.npcs[m] && add('group member ' + m));
    g.msgs.forEach((m) => m.from !== 'me' && !S.npcs[m.from] && add('group msg from ' + m.from));
  });
  S.storylines.forEach((s) => {
    if (!inr(s.heat, 0, 100) || !['active', 'boiling', 'resolved'].includes(s.status)) add('storyline ' + s.id);
    (s.participants || []).forEach((id) => !S.npcs[id] && add('storyline participant ' + id));
  });
  if (S.trending.length > 8 || S.trending.some((t) => typeof t.tag !== 'string' || !t.tag.startsWith('#') || !inr(t.heat, 0, 100))) add('trending');
  S.events.forEach((e) => (!Array.isArray(e.options) || e.options.length < 2 || e.options.some((o) => typeof o !== 'string')) && add('event ' + e.id));
  const cids = new Set();
  S.chronicle.forEach((c) => {
    if (typeof c.text !== 'string') add('chron text');
    if (cids.has(c.id)) add('chron dup id ' + c.id);
    cids.add(c.id);
  });
  S.notifs.forEach((n) => typeof n.text !== 'string' && add('notif text'));
  try {
    if (JSON.parse(JSON.stringify(S)).postOrder.length !== S.postOrder.length) add('json round trip');
  } catch (e) {
    add('not serialisable: ' + e.message);
  }
  return bad;
};
