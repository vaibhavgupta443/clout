// Better memory: learns what you say, newer replaces older, rehearsal, and the Memories editor.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  const M2 = G.Mem2;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  mia.mem = []; mia.touched = S.clock;

  /* ---------- 1. learning ---------- */
  const ex = M2.extract('I promise I will be there on Friday. Also I hate coffee. My sister is visiting. Do you love pizza? I love you, honestly.');
  const kinds = ex.map((x) => x.kind);
  check('it picks out promises, dislikes, family and feelings (and ignores questions)', ['promise', 'dislike', 'family', 'feeling'].every((k) => kinds.includes(k)) && !ex.some((x) => /pizza/.test(x.text)), kinds.join(','));
  const made = M2.learn(mia, 'between us, I am moving to Lisbon next month. I really love jazz.');
  check('a secret and a like become memories of the person you told', made.some((m) => m.kind === 'said' && /secret/.test(m.text) && m.imp >= 8) && mia.mem.some((m) => /love jazz/.test(m.text)));
  check('the same thing is not stored twice', M2.learn(mia, 'I really love jazz.').length === 0);
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0, data: { dms: [{ from: mia.id, text: 'ok' }], posts: [], judge: {} } });
  mia.mem = [];
  try { await E.speak({ mode: 'dm', text: 'I promise I will call you tomorrow, I swear.', npcId: mia.id, label: 'x' }); } catch (e) { console.log('speak threw', e.message); }
  await H.wait(30);
  check('a real DM you send teaches them (promise remembered)', mia.mem.some((m) => /promised/.test(m.text)));
  const n0 = mia.mem.length;
  S.activeAlt = null;
  const alt = Object.values(S.npcs).find((n) => n.userAlt);
  M2.learn(S.npcs[alt ? alt.id : mia.id], 'x');
  check('nothing is learned from a burner account', (() => { mia.mem = []; try { E.speak({ mode: 'dm', text: 'I swear I will be there tomorrow for you.', npcId: mia.id, accountId: 'zz', label: 'x' }).catch(() => {}); } catch (e) {} return true; })());
  await H.wait(30);
  check('...(nothing was learned from the burner message)', !mia.mem.some((m) => m.kind === 'said'));

  /* ---------- 2. newer replaces older ---------- */
  mia.mem = [];
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me they love coffee', who: ['me'], imp: 5, topic: 'like:coffee' });
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me they hate coffee', who: ['me'], imp: 6, topic: 'like:coffee' });
  check('"I hate coffee" retires "I love coffee" (only the new one is in front)', mia.mem.filter((m) => /coffee/.test(m.text)).length === 1 && /hate/.test(mia.mem.find((m) => /coffee/.test(m.text)).text));
  check('...and the old one is filed in the vault as outdated', G.Vault.lines(mia).some((l) => /outdated.*love coffee/.test(l.text)));
  G.Mem.add(mia, { kind: 'confession', text: 'Sam confessed their feelings to me', who: ['me'], imp: 8 });
  G.Mem.add(mia, { kind: 'breakup', text: 'Sam and I broke up', who: ['me'], imp: 9 });
  check('a breakup retires the earlier confession', !mia.mem.some((m) => /confessed/.test(m.text)) && mia.mem.some((m) => /broke up/.test(m.text)));

  /* ---------- 3. rehearsal ---------- */
  mia.mem = [];
  const m = G.Mem.add(mia, { kind: 'event', text: 'Sam and I watched the lighthouse storm together', who: ['me'], imp: 5, t: 100 });
  const old = G.Mem.add(mia, { kind: 'event', text: 'Sam and I discussed pizza toppings once', who: ['me'], imp: 5, t: 100 });
  const s0 = G.Mem.score(m, 100 + 60 * 24 * 20);
  for (let i = 0; i < 4; i++) G.Rag.recall(mia, 'lighthouse storm', 1);
  check('each time a memory is used it is rehearsed (and fades more slowly)', m.rh >= 3 && G.Mem.score(m, 100 + 60 * 24 * 20) > s0 && !old.rh);
  check('a memory recalled many times gains importance (capped at 10)', m.imp >= 6 && m.imp <= 10);

  /* ---------- 4. the Memories editor ---------- */
  G.UI.go('home'); G.UI.acts.profile({ id: mia.id });
  check('the profile has a Memories button', !!$('[data-act="memOpen"]'));
  G.UI.acts.memOpen({ id: mia.id });
  check('the window lists what she remembers with pin / edit / delete', !!$('[data-act="memPin"]') && !!$('[data-act="memDel"]') && /lighthouse/.test($('.memlist').textContent));
  G.UI.acts.memPin({ i: mia.mem.indexOf(old) });
  check('pinning marks it', old.pin === true);
  mia.touched = S.clock;
  for (let i = 0; i < 260; i++) G.Mem.add(mia, { kind: 'comment', text: `chatter ${i} about ${['pizza2', 'trains', 'rain', 'shoes'][i % 4]} number${i}`, who: ['zz'], imp: 2, t: 200 + i });
  check('a pinned memory survives a flood of newer ones', mia.mem.some((x) => x === old));
  w.document.querySelector('#mem_add') || G.UI.acts.memOpen({ id: mia.id });
  $('#mem_add').value = 'Sam saved my life once';
  $('#mem_imp').value = '9';
  G.UI.acts.memAdd();
  const added = mia.mem.find((x) => /saved my life/.test(x.text));
  check('you can add a memory (unforgettable = pinned)', !!added && added.imp === 9 && added.pin === true);
  G.UI.acts.memDel({ i: mia.mem.indexOf(added) });
  check('you can delete one', !mia.mem.some((x) => /saved my life/.test(x.text)));
  const edit0 = w.prompt;
  w.prompt = () => 'edited text';
  const keep = mia.mem.find((x) => x.pin);
  G.UI.acts.memEdit({ i: mia.mem.indexOf(keep) });
  w.prompt = edit0;
  check('you can edit one', keep.text === 'edited text');
  check('the save has no undefined holes', !/undefined/.test(JSON.stringify(mia.mem)));

  H.summary('BETTER MEMORY: LEARN, REPLACE, REHEARSE, EDIT');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
