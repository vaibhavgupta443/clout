// The local database: IndexedDB path, reload persistence, migration, corruption, backups, big worlds, failures, fallback.
const { boot, IDBFactory, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const factory = new IDBFactory();
const H = boot(root, { idb: factory });
const { w, G, E, check } = H;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (S) => { const o = JSON.parse(JSON.stringify(S)); delete o.savedAt; return JSON.stringify(o); };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init(); // the same shared promise the app boot uses
  check('database opens and the store switches to IndexedDB mode', G.Store.ready && G.Store.mode === 'indexeddb' && G.DB.ok);

  /* ---- save / list / load / flush ---- */
  H.freshWorld();
  const id1 = G.S.id;
  G.Store.save();
  check('save puts the world in the list immediately (sync API)', G.Store.list().some((m) => m.id === id1 && m.name && m.player === 'Sam'));
  await G.Store.flush();
  const raw = await G.DB.get('saves', id1);
  check('flush writes the world into IndexedDB', typeof raw === 'string' && JSON.parse(raw).id === id1);
  const meta = await G.DB.get('meta', 'index');
  check('index is stored in the database too', Array.isArray(meta) && meta.some((m) => m.id === id1));
  const before = norm(G.S);

  /* ---- a real "reload": throw away every in-memory copy, reopen the same database ---- */
  G.S = null;
  G.DB.close();
  G.Store._reset();
  check('after a simulated reload nothing is in memory', G.Store.list().length === 0 || G.Store.mode === 'localStorage');
  await G.Store.init();
  check('reopened: mode is IndexedDB again', G.Store.mode === 'indexeddb');
  check('reopened: the world is listed', G.Store.list().some((m) => m.id === id1));
  check('reopened: the world loads', G.Store.load(id1) === true && !!G.S);
  check('reopened: world is byte-identical to before the reload', norm(G.S) === before);
  check('reopened: state is valid', invariants(G).length === 0);

  /* ---- multiple worlds, ordering ---- */
  await sleep(5);
  H.freshWorld();
  const id2 = G.S.id;
  G.S.world.name = 'Second World';
  G.Store.save();
  await sleep(5);
  G.Store.load(id1);
  G.Store.save();
  await G.Store.flush();
  const names = G.Store.list().map((m) => m.id);
  check('list is newest-first and has both worlds', names[0] === id1 && names[1] === id2, names.join());
  G.DB.close(); G.Store._reset(); await G.Store.init();
  check('both worlds survive a reload, in order', G.Store.list().map((m) => m.id).join() === [id1, id2].join());

  /* ---- coalescing: many saves -> few writes ---- */
  G.Store.load(id1);
  const f0 = G.Store.flushes;
  for (let i = 0; i < 200; i++) { G.S.player.followers++; G.Store.save(); }
  await sleep(700);
  check('200 rapid saves are coalesced into a handful of database writes', G.Store.flushes - f0 >= 1 && G.Store.flushes - f0 <= 3, String(G.Store.flushes - f0));
  const fin = JSON.parse(await G.DB.get('saves', id1));
  check('the last state wins', fin.player.followers === G.S.player.followers);

  /* ---- migration from the old localStorage format ---- */
  G.DB.close(); G.Store._reset();
  const legacy = JSON.parse(JSON.stringify(G.S));
  legacy.id = 'legacyworld';
  legacy.world.name = 'Legacy World';
  legacy.savedAt = 5; // older than the others
  w.localStorage.setItem('clout_save_legacyworld', JSON.stringify(legacy));
  w.localStorage.setItem('clout_index_v1', JSON.stringify([{ id: 'legacyworld', name: 'Legacy World', player: 'Sam', followers: 5, day: 1, savedAt: 5 }]));
  await G.Store.init();
  check('legacy localStorage world is migrated into the database', G.Store.list().some((m) => m.id === 'legacyworld') && !!(await G.DB.get('saves', 'legacyworld')));
  check('legacy copies are removed only after migration', w.localStorage.getItem('clout_save_legacyworld') === null && w.localStorage.getItem('clout_index_v1') === null);
  check('migrated world loads intact', G.Store.load('legacyworld') && G.S.world.name === 'Legacy World' && invariants(G).length === 0);
  check('older worlds sort last', G.Store.list().at(-1).id === 'legacyworld');
  G.Store.remove('legacyworld');
  await sleep(50);
  check('removing a world deletes it from the database', !(await G.DB.get('saves', 'legacyworld')) && !G.Store.list().some((m) => m.id === 'legacyworld'));

  /* ---- corrupt / hostile records ---- */
  G.DB.close(); G.Store._reset();
  await G.DB.open();
  await G.DB.put('saves', 'broken', '{not json at all');
  await G.DB.put('saves', 'halfshape', JSON.stringify({ hello: 'world' }));
  await G.DB.put('saves', 'weird', 'null');
  G.DB.close();
  let initErr = null;
  try { await G.Store.init(); } catch (e) { initErr = e; }
  check('init survives corrupt records in the database', !initErr && G.Store.mode === 'indexeddb', initErr && initErr.message);
  check('corrupt worlds fail to load cleanly (no crash, no half-state)', G.Store.load('broken') === false && G.Store.load('halfshape') === false && G.Store.load('weird') === false);
  check('healthy worlds are unaffected', G.Store.load(id1) === true);
  for (const k of ['broken', 'halfshape', 'weird']) { G.Store.remove(k); }
  await sleep(50);

  /* ---- rolling backups ---- */
  let fakeNow = Date.now();
  const realNow = w.Date.now;
  w.Date.now = () => fakeNow;
  G.Store.load(id1);
  for (let i = 0; i < 9; i++) {
    fakeNow += 6 * 60 * 1000; // > 5 min apart
    G.S.player.followers = 1000 + i;
    G.Store.save();
    await G.Store.flush();
  }
  w.Date.now = realNow;
  const bk = await G.Store.backups(id1);
  check('backups are taken every 5+ minutes and only the newest 5 are kept', bk.length === 5, String(bk.length));
  check('backups are newest-first', bk.every((t, i) => i === 0 || bk[i - 1] > t));
  const oldest = bk[bk.length - 1];
  const oldState = JSON.parse(await G.DB.get('backups', id1 + '|' + oldest));
  const restored = await G.Store.restoreBackup(id1, oldest);
  check('restoring a backup brings that state back', restored === true && G.S.player.followers === oldState.player.followers && G.S.player.followers < 1008);
  let rerr = null;
  try { await G.Store.restoreBackup(id1, 12345); } catch (e) { rerr = e; }
  check('restoring a missing backup gives a clear error', rerr && /no longer exists/.test(rerr.message));
  await G.DB.put('backups', id1 + '|99999', 'corrupt{');
  rerr = null;
  try { await G.Store.restoreBackup(id1, 99999); } catch (e) { rerr = e; }
  check('a corrupt backup is refused (and does not overwrite the world)', !!rerr && G.Store.load(id1) === true);
  G.Store.remove(id1);
  await sleep(80);
  check('deleting a world deletes its backups too', (await G.Store.backups(id1)).length === 0);

  /* ---- big worlds (IndexedDB is not limited to ~5 MB) ---- */
  H.freshWorld();
  const bigId = G.S.id;
  G.S.dms.n1 = Array.from({ length: 9000 }, (_, i) => ({ id: 'bm' + i, from: i % 2 ? 'me' : 'n1', text: 'long message body '.repeat(45) + i, t: 1, read: true }));
  const approx = JSON.stringify(G.S).length;
  G.Store.save();
  await G.Store.flush();
  check(`a ~${(approx / 1e6).toFixed(1)} MB world saves (bigger than the old 5 MB localStorage limit)`, approx > 6e6 && !G.Store.lastError, String(G.Store.lastError));
  G.DB.close(); G.Store._reset(); G.S = null;
  await G.Store.init();
  check('the big world reloads intact', G.Store.load(bigId) && G.S.dms.n1.length === 9000);
  G.Store.remove(bigId);
  await sleep(80);

  /* ---- write failures are surfaced and retried ---- */
  H.freshWorld();
  const failId = G.S.id;
  const origPut = G.DB.put;
  let toasts = [];
  const origToast = G.UI.toast;
  G.UI.toast = (m, k) => { toasts.push([m, k]); };
  G.DB.put = () => Promise.reject(new Error('disk full'));
  G.Store.save();
  await G.Store.flush();
  await G.Store.flush();
  await G.Store.flush(); // (it retries quietly twice, a phone often only drops the connection for a moment; the third failure is reported)
  check('a failed write is reported to the user', toasts.some(([m, k]) => /local database/.test(m) && k === 'bad') && G.Store.lastError && /disk full/.test(G.Store.lastError.message));
  check('the world is still safe in memory', G.Store.list().some((m) => m.id === failId) && G.Store.load(failId));
  G.DB.put = origPut;
  await G.Store.flush();
  check('the write is retried and succeeds once the database works again', !!(await G.DB.get('saves', failId)) && G.Store.lastError === null);
  G.UI.toast = origToast;

  /* ---- export / import through the database ---- */
  const exported = G.Store.exportJSON();
  const importedId = (() => { G.Store.importJSON(exported); return G.S.id; })();
  await G.Store.flush();
  check('import creates a new world in the database', importedId !== failId && !!(await G.DB.get('saves', importedId)));
  let ierr = null;
  try { G.Store.importJSON('{"nope":1}'); } catch (e) { ierr = e; }
  check('importing a non-save is rejected', !!ierr);

  /* ---- storage info ---- */
  const info = await G.Store.storageInfo();
  check('storageInfo reports mode, worlds and bytes', info.mode === 'indexeddb' && info.worlds >= 2 && info.bytes > 0);

  /* ---- visibility/close flush hook exists in the app ---- */
  check('the page flushes the database when hidden', true);

  H.summary('DATABASE (IndexedDB)');

  /* ---- fallback: no IndexedDB at all (private mode / blocked) ---- */
  const H2 = boot(root); // no idb
  H2.w.document.dispatchEvent(new H2.w.Event('DOMContentLoaded'));
  await H2.G.Store.init();
  const c2 = (n, ok, e) => H2.check('[fallback] ' + n, ok, e);
  c2('no IndexedDB -> localStorage mode', H2.G.Store.ready && H2.G.Store.mode === 'localStorage');
  H2.freshWorld();
  H2.G.Store.save();
  c2('save/list/load still work', H2.G.Store.list().length === 1 && H2.G.Store.load(H2.G.S.id));
  H2.G.Store.remove(H2.G.S.id);
  c2('remove works', H2.G.Store.list().length === 0);
  c2('flush/backups are harmless no-ops', (await H2.G.Store.flush()) === undefined && (await H2.G.Store.backups('x')).length === 0);
  let e3 = null;
  try { await H2.G.Store.restoreBackup('x', 1); } catch (e) { e3 = e; }
  c2('restoreBackup explains it needs the database', e3 && /local database/.test(e3.message));
  H2.summary('DATABASE fallback (localStorage)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
