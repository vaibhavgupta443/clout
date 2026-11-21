// The database on a phone: the browser may cut the connection when the app is in the background, open slowly, or refuse a write.
// Nothing may be lost, and the world must still load afterwards.
const { boot, IDBFactory, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const factory = new IDBFactory();
const H = boot(root, { idb: factory });
const { w, G, E, check } = H;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emerg = (id) => w.localStorage.getItem('clout_emerg_' + id);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  check('the database opens', G.Store.mode === 'indexeddb' && G.DB.ok);
  H.freshWorld();
  const id = G.S.id;
  G.Store.save();
  await G.Store.flush();
  const stored = async () => JSON.parse(await G.DB.get('saves', id));

  /* ---------- the phone cuts the connection while the app is in the background ---------- */
  G.DB._kill();
  G.S.player.name = 'Changed after the connection died';
  G.Store.save();
  await G.Store.flush();
  check('a dead connection is replaced and the save still goes through (nothing lost, no error)', (await stored()).player.name === 'Changed after the connection died' && !G.Store.lastError && G.DB.ok);
  G.DB._kill();
  G.S.player.name = 'Changed again';
  G.Store.save();
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await sleep(300);
  await G.Store.flush();
  check('coming back to the app checks the connection and writes what is pending', (await stored()).player.name === 'Changed again');
  const all = await G.DB.all('saves');
  G.DB._kill();
  check('reading everything also repairs a dead connection', Object.keys(await G.DB.all('saves')).length === Object.keys(all).length);

  /* ---------- a write is refused: the newest copy is kept, and retried ---------- */
  const put0 = G.DB.put;
  let calls = 0;
  G.DB.put = async (...a) => { if (calls++ < 1) throw new Error('UnexpectedWriteFailure'); return put0(...a); };
  G.S.player.name = 'Retried automatically';
  G.Store.save();
  await G.Store.flush();
  check('a failed write keeps an emergency copy where a reload can find it', Store_failed() && !!emerg(id) && JSON.parse(emerg(id)).player.name === 'Retried automatically');
  function Store_failed() { return G.Store._fails === 1; }
  await sleep(2600);
  check('...and retries by itself (no need to touch anything): the database has it, the emergency copy is gone', (await stored()).player.name === 'Retried automatically' && !emerg(id) && G.Store._fails === 0);
  G.DB.put = put0;

  /* ---------- the app is closed while the database is unreachable: the next start recovers ---------- */
  G.DB.put = async () => { throw new Error('QuotaExceededError'); };
  G.S.player.name = 'Typed while the database was down';
  G.Store.save();
  await G.Store.flush();
  clearTimeout(G.Store._retry);
  check('the emergency copy holds what was typed', !!emerg(id) && JSON.parse(emerg(id)).player.name === 'Typed while the database was down');
  G.DB.put = put0;
  G.S = null;
  G.DB.close && G.DB.close();
  G.Store._reset();
  await G.Store.init();
  check('on the next start the newer emergency copy wins over the older database copy', G.Store.load(id) === true && G.S.player.name === 'Typed while the database was down' && !emerg(id));
  check('...and it is written into the database', (await stored()).player.name === 'Typed while the database was down');
  w.localStorage.setItem('clout_emerg_' + id, JSON.stringify({ world: {}, savedAt: 1, player: { name: 'OLD' } }));
  G.S = null;
  G.Store._reset();
  await G.Store.init();
  check('an OLDER emergency copy never overwrites newer data', G.Store.load(id) === true && G.S.player.name === 'Typed while the database was down' && !emerg(id));

  /* ---------- a slow first open is not a failure ---------- */
  const open0 = G.DB.open;
  let opens = 0;
  G.DB.open = async () => (opens++ === 0 ? false : open0());
  G.S = null;
  G.Store._reset();
  const t0 = Date.now();
  await G.Store.init();
  check('if the first open fails it tries once more before giving up on the database', G.Store.mode === 'indexeddb' && opens === 2, `mode ${G.Store.mode} opens ${opens}`);
  check('and the saved world is still there', G.Store.list().some((m) => m.id === id) && G.Store.load(id) === true);
  G.DB.open = open0;

  /* ---------- big worlds are trimmed, not choked ---------- */
  const S = G.S;
  const npcs = Object.values(S.npcs).filter((n) => !n.userAlt);
  const old = npcs[0];
  const near = npcs[1];
  S.clock = 20000;
  old.touched = 0;
  near.touched = S.clock;
  old.mem = [];
  near.mem = [];
  for (let i = 0; i < 300; i++) { G.Mem.add(old, { kind: 'comment', text: 'old thing ' + i, who: [], imp: 3 }); G.Mem.add(near, { kind: 'comment', text: 'recent thing ' + i, who: [], imp: 3 }); }
  check('people you have not dealt with lately keep 60 memories, people in the picture keep 200', old.mem.length === 60 && near.mem.length === 200, `${old.mem.length}/${near.mem.length}`);
  const keepers = near.mem.filter((m) => m.imp >= 3).length;
  G.Mem.add(near, { kind: 'breakup', text: 'the big one', who: ['me'], imp: 9 });
  check('...and what is forgotten is the least important, never the big moments', near.mem.some((m) => m.text === 'the big one') && keepers > 0);
  S.hist = Array.from({ length: 150 }, (_, i) => ({ d: i, followers: 1, posts: 0, comments: 0, likes: 0, dms: 0, follows: 0, events: 0, mood: 0 }));
  near.hist = Array.from({ length: 45 }, (_, i) => [i, 0, 0, 0, 0, 0]);
  S.dirChat = { [near.id]: Array.from({ length: 80 }, (_, i) => ({ r: 'you', text: 'x' + i, t: i })) };
  G.Channels.ensure();
  S.channels[0].msgs = Array.from({ length: 120 }, (_, i) => ({ id: 'cm' + i, from: near.id, text: 'hello ' + i, t: i }));
  const bytes0 = JSON.stringify(S).length;
  G.Store.slim(S);
  check('slimming shrinks the world and keeps the best of it (60 days of history, 30 chat lines, 60 channel messages)', S.hist.length === 60 && near.hist.length === 20 && S.dirChat[near.id].length === 30 && S.channels[0].msgs.length === 60 && near.mem.length <= 120 && JSON.stringify(S).length < bytes0, `${bytes0} -> ${JSON.stringify(S).length}`);
  check('slimming keeps the newest history and the important memories', S.hist[59].d === 149 && near.mem.some((m) => m.text === 'the big one'));
  check('it never breaks the world: it still loads and passes the invariants', (() => { G.Store.save(); return G.Store.load(S.id) && invariants(G).length === 0; })());

  /* ---------- the Settings check ---------- */
  G.UI.go('settings');
  G.UI.render();
  const $ = (q) => w.document.querySelector(q);
  check('Settings says where the world is saved and has a Save now button', /Saved in this browser/.test($('#page').textContent) && !!$('[data-act="saveNow"]'));
  G.DB._kill();
  G.S.player.name = 'Saved by the button';
  await G.UI.acts.saveNow();
  check('Save now repairs a dead connection and writes the world', (await stored()).player.name === 'Saved by the button' && !G.Store.lastError);
  const put1 = G.DB.put;
  G.DB.put = async () => { throw new Error('QuotaExceededError'); };
  G.Store.save();
  await G.UI.acts.saveNow();
  clearTimeout(G.Store._retry);
  check('when saving fails it says so on the page instead of staying silent', /trouble/.test($('#page').textContent) || !!G.Store.lastError, G.Store.lastError && G.Store.lastError.message);
  G.DB.put = put1;
  w.localStorage.removeItem('clout_emerg_' + G.S.id);

  H.summary('PHONE DATABASE');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
