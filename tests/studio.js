// Character Studio: validation (every character must be 18+), create, edit, export / import, hostile input.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;
const $ = (s) => w.document.querySelector(s);
const St = () => G.Studio;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;

  const base = () => ({ name: 'Ruby Vale', handle: '@rubyv', age: 27, role: 'friend', emoji: '💎', bio: 'bartender by night', personality: 'witty, warm, a night owl', secret: 'writes songs', followers: 5000 });

  /* ================= validation ================= */
  const ok = St().sanitize(base());
  check('a normal character validates', ok.name === 'Ruby Vale' && ok.age === 27 && ok.role === 'friend' && ok.followers === 5000);
  for (const age of [17, 16, 15, 0, -5, 17.5, 18.5, 'abc', 150, 1e9, NaN, Infinity, '17', '17.9']) {
    const e = threw(() => St().sanitize(Object.assign(base(), { age })));
    check('age ' + JSON.stringify(age) + ' is REFUSED (never quietly "adjusted")', !!e && e.user === true && /18|whole|120/.test(e.message), e && e.message);
  }
  check('age 18 and "30" (text) are accepted', St().sanitize(Object.assign(base(), { age: 18 })).age === 18 && St().sanitize(Object.assign(base(), { age: '30' })).age === 30);
  for (const bad of [null, undefined, 5, 'x', [], true]) check('sanitize(' + JSON.stringify(bad) + ') is refused with a friendly error', !!threw(() => St().sanitize(bad)));
  check('a nameless character is refused', !!threw(() => St().sanitize(Object.assign(base(), { name: '   ' }))));
  const hostile = St().sanitize(Object.assign(base(), { name: '<img src=x onerror=alert(1)>'.repeat(10), bio: 'x'.repeat(5000), personality: '\u0000\u0001evil\n\n'.repeat(100), role: '__proto__', followers: -50 }));
  check('text is length-limited, control characters removed, bad roles fall back, followers clamped', hostile.name.length <= 40 && hostile.bio.length <= 160 && hostile.personality.length <= 260 && !/[\u0000-\u0008]/.test(hostile.personality) && hostile.role !== '__proto__' && hostile.followers >= 0);
  check('relationship numbers are clamped; unknown status ignored', (() => { const c = St().sanitize(Object.assign(base(), { aff: 999, rom: -50, riv: 'x', trust: 55.6, status: 'bogus' })); return c.aff === 100 && c.rom === 0; })());
  check('avatars: PNG data URL accepted', St().validAvatar(PNG));
  for (const bad of ['', null, 'http://x/y.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'data:image/png;base64,', 'data:image/png;base64,@@@', PNG + '"onerror="x'])
    check('avatar rejected: ' + String(bad).slice(0, 36), !St().validAvatar(bad));
  check('a bad avatar in a form refuses the whole form with a friendly message', /not usable/.test((threw(() => St().sanitize(Object.assign(base(), { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }))) || {}).message || ''));

  /* ================= create ================= */
  const full = Object.assign(base(), { aff: 40, rom: 35, riv: 5, trust: 60, status: 'friend', avatar: PNG, look: 'blonde, curvy, tattoos', gender: 'woman', chrono: 2 });
  const n = St().create(full);
  check('creating makes a real character with everything set', n && S.npcs[n.id] === n && n.name === 'Ruby Vale' && n.age === 27 && n.custom === true && n.bio === 'bartender by night');
  check('exact relationship numbers + status override the preset', n.aff === 40 && n.rom === 35 && n.riv === 5 && n.trust === 60 && n.status === 'friend');
  check('photo is stored', n.avatar === PNG && /cav\d+|background/.test(G.UI.avatar(n, 40)));
  check('look tags + gender feed the photo matcher', G.Media.lookFor(n).includes('blonde') && G.Media.lookFor(n).includes('curvy') && G.Media.lookFor(n).includes('woman'));
  check('schedule: night owl', G.Persona.ensure(n).chrono === 2);
  const dup = St().create(base());
  check('same name + handle twice: handles stay unique', dup.handle !== n.handle && new Set(Object.values(S.npcs).map((x) => x.handle)).size === Object.keys(S.npcs).length, dup.handle + ' vs ' + n.handle);
  check('the world stays consistent', invariants(G).length === 0);
  check('creating with age 17 creates nothing', (() => { const before = Object.keys(S.npcs).length; const e = threw(() => St().create(Object.assign(base(), { name: 'Kid', age: 17 }))); return !!e && Object.keys(S.npcs).length === before; })());

  /* ================= edit ================= */
  n.memories.push('remembers the party');
  const idBefore = n.id;
  const u = St().update(n.id, Object.assign({}, full, { name: 'Ruby Vale-Reyes', age: 29, bio: 'now a bar owner', aff: 80, status: 'best_friend', avatar: undefined, clearAvatar: true }));
  check('editing changes the fields and keeps identity + memories', u.id === idBefore && u.name === 'Ruby Vale-Reyes' && u.age === 29 && u.bio === 'now a bar owner' && u.aff === 80 && u.status === 'best_friend' && n.memories.includes('remembers the party'));
  check('edit: photo cleared', !n.avatar);
  check('editing to age 17 is refused and changes nothing', (() => { const e = threw(() => St().update(n.id, Object.assign({}, full, { age: 17, avatar: undefined }))); return !!e && n.age === 29; })());
  check('taking another character\'s handle is refused', (() => { const e = threw(() => St().update(n.id, Object.assign({}, full, { handle: dup.handle, avatar: undefined }))); return !!e && /taken/.test(e.message) && n.handle !== dup.handle; })());
  check('editing an unknown id gives a friendly error', /no longer exists/.test((threw(() => St().update('n9999', base())) || {}).message || ''));
  check('changing the handle works (and is normalised)', St().update(n.id, { name: n.name, age: n.age, handle: 'ruby new' }).handle === '@rubynew' || /@ruby/.test(n.handle));
  check('prototype-pollution keys in a form do nothing', (() => { const f = JSON.parse('{"name":"P","age":30,"__proto__":{"polluted":1}}'); St().create(f); return ({}).polluted === undefined; })());

  /* ================= export / import ================= */
  const json = St().exportJSON(n.id);
  const o = JSON.parse(json);
  check('export is a small, valid, tagged JSON file', o.clout === 'character' && o.v === 1 && o.name === n.name && o.age === 29 && json.length < 20000);
  check('export has no internal state (posts, dms, memories, ids)', !('mem' in o) && !('id' in o) && !('memories' in o));
  const back = St().importJSON(json);
  check('import creates a NEW character from the file', back.id !== n.id && back.name === n.name && back.age === 29 && back.bio === n.bio);
  check('an imported character starts as a stranger (the file cannot hand out relationships)', back.aff === 0 && back.rom === 0 && back.status !== 'best_friend');
  const badFiles = [['not json {{{', 'valid JSON'], ['[]', 'not a Clout'], ['{"clout":"nope"}', 'not a Clout'], [JSON.stringify(Object.assign({}, o, { age: 15 })), '18'], [JSON.stringify(Object.assign({}, o, { age: 17.9 })), 'whol']];
  for (const [f, re] of badFiles) {
    const e = threw(() => St().importJSON(f));
    check('import refuses: ' + String(f).slice(0, 38).replace(/\n/g, ' '), !!e && e.user === true && new RegExp(re).test(e.message), e && e.message);
  }
  check('an import file with age 15 creates nobody', (() => { const c = Object.keys(S.npcs).length; threw(() => St().importJSON(JSON.stringify(Object.assign({}, o, { age: 15 })))); return Object.keys(S.npcs).length === c; })());
  check('an import file claiming status "dating" + max numbers is ignored', (() => { const x = St().importJSON(JSON.stringify(Object.assign({}, o, { status: 'dating', aff: 100, rom: 100, trust: 100, name: 'Sneaky', handle: '@sneaky' }))); return x.aff === 0 && x.rom === 0; })());
  check('world consistent after all that', invariants(G).length === 0);

  /* ================= the form ================= */
  G.UI.go('people');
  check('People page has Create + Character-file buttons', !!$('[data-act="createChar"]') && !!$('[data-act="importChar"]'));
  $('[data-act="createChar"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('the studio opens with its sections', !!$('#cname') && /Photo/.test($('.modal').textContent) && /Relationship/.test($('.modal').textContent));
  check('the studio has no adult sections', !/Desire|Creator page/.test($('.modal').textContent));

  H.summary('CHARACTER STUDIO');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
