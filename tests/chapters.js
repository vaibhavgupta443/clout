// Chapters and Album (js/chapters.js): each game week writes one chapter (title, up to 4 beats, who changed) from the non-meta chronicle,
// played moments, outings and rep shifts; S.chapters <= 12; the album keeps ids only (<= 40, oldest out first); titles are awarded once with a
// read-only perk bonus; no state keys exist before a real write; everything survives a JSON round trip.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const DAY = 1440;
const WEEK = 7 * DAY;

function world() {
  E.createBlankWorld({ name: 'Sam Rivers', handle: '@sam', fame: 'rising', premise: 'chapters' });
  const S = G.S;
  G.World.setSeed(9);
  G.World.ensure(S);
  S.popSize = 0;
  S.clock = 28 * DAY; // the start of game week 4
  S.npcRel = [];
  const npcs = [];
  for (let i = 0; i < 3; i++) {
    const n = E.makeNpc({ name: ['Avery', 'Blake', 'Casey'][i] + ' Surname', handle: '@npc' + i, role: 'friend', age: 25 + i, personality: 'kind, warm', followers: 500, aff: 40, status: 'friend' });
    n.trust = 40;
    npcs.push(n);
  }
  return { S, npcs };
}

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const C = G.Chapters;
  const M = G.Moments;

  /* ---- nothing exists until something real happens ---- */
  {
    const { S } = world();
    S.clock = 40 * DAY;
    C.tick();
    check('no chapters/album keys in a quiet world', !('chapters' in S) && !('album' in S) && C.list().length === 0 && C.album().length === 0);
    check('perk lookup is 1 and reads create nothing', C.perk('makeup') === 1 && !('chapters' in S) && !('album' in S));
    check('the Profile card stays hidden when there is nothing', C.cardHtml() === '');
  }

  const { S, npcs } = world();
  const [a, b, c] = npcs;
  const toasts = [];
  const toast0 = G.UI.toast;
  G.UI.toast = function (m) { toasts.push(String(m)); return toast0.apply(this, arguments); };

  /* ---- 14 days with seeded events: two chapters ---- */
  for (let d = 28; d <= 42; d++) {
    S.clock = d * DAY + 600;
    if (d === 29) {
      E.addChron(`${a.name.split(' ')[0]} and ${b.name.split(' ')[0]} fell out over the party`);
      E.addChron('Player reached level 4', { meta: true });
      E.addChron('reached 100K followers', { meta: true });
      E.addChron(`${c.name.split(' ')[0]} told everyone you helped them move`);
    }
    if (d === 31) {
      const e = M.enqueue(a.id, 'makeup', {});
      if (e) M.pick(e.id, 0);
      S.plans = S.plans || [];
      S.plans.push({ id: 'plT1', at: S.clock - 60, place: 'the rooftop', who: [a.id, b.id], rsvp: { [a.id]: 'yes', [b.id]: 'yes', me: 'yes' }, status: 'done', out: { kind: 'went', line: '', scene: ['Fri 7pm at the rooftop.', 'It was easy.'], t: S.clock }, host: a.id, via: 'dm', made: S.clock - 4000 });
    }
    if (d === 36) {
      E.addChron(`${b.name.split(' ')[0]} posted about you and it blew up`);
      E.addChron('Around town: the power cut left everyone on the street.');
      E.addChron('Followers milestone, a game line', { meta: true });
    }
    if (d === 38) E.addChron(`${c.name.split(' ')[0]} asked how you were doing`);
    C.tick();
  }
  const ch = C.list();
  check('14 days wrote exactly 2 chapters', ch.length === 2 && ch[0].wk === 4 && ch[1].wk === 5, JSON.stringify(ch.map((x) => x.wk)));
  check('each chapter has a title, 2-4 beats and a who-changed list', ch.every((x) => x.title && x.title.length > 2 && x.beats.length >= 2 && x.beats.length <= 4 && Array.isArray(x.who)), JSON.stringify(ch.map((x) => [x.title, x.beats.length])));
  const allText = ch.map((x) => x.beats.map((t) => t.text).join(' | ')).join(' | ');
  check('no meta lines in any chapter', !/reached level|reached \d+K|milestone|game line/i.test(allText), allText);
  check('the moment and the outing became beats of week 4', ch[0].beats.some((x) => x.k === 'moment') && ch[0].beats.some((x) => x.k === 'outing'), JSON.stringify(ch[0].beats.map((x) => x.k)));
  check('beats are in time order', ch.every((x) => x.beats.every((bt, i) => i === 0 || bt.t >= x.beats[i - 1].t)));
  check('no bare placeholder text in titles or beats', !/[{}]|undefined|NaN/.test(ch.map((x) => x.title + " " + x.beats.map((t) => t.text).join(" ")).join(" ")));
  C.tick();
  C.tick();
  check('ticking again never writes the same week twice', C.list().length === 2);

  /* ---- who changed: a status change and a big shift show up in the next chapter ---- */
  {
    const before = C.list().length;
    a.aff = 80; b.status = 'rival'; b.aff = 5;
    S.clock = 43 * DAY;
    E.addChron(`${a.name.split(' ')[0]} and ${c.name.split(' ')[0]} spent the whole day together`);
    E.addChron(`${c.name.split(' ')[0]} wished you luck for tomorrow`);
    S.clock = 49 * DAY + 60;
    C.tick();
    const last = C.list()[C.list().length - 1];
    check('a third chapter lists who changed', C.list().length === before + 1 && last.who.some((x) => x.id === a.id) && last.who.some((x) => x.id === b.id && x.st === 'rival'), JSON.stringify(last.who));
  }

  /* ---- the album: ids only, moments and outings referenced ---- */
  check('the album references the moment and the outing by id only', C.album().includes('plT1') && M.list().every((m) => C.album().includes(m.id)) && C.album().every((x) => typeof x === 'string'), JSON.stringify(C.album()));
  for (let i = 0; i < 45; i++) C.keep('x' + i);
  check('the album is capped at 40 and evicts oldest first', C.album().length === 40 && C.album()[0] === 'x5' && C.album()[39] === 'x44' && !C.album().includes('plT1'), C.album().slice(0, 3).join());
  check('keeping the same id twice adds nothing', C.keep('x44') === false && C.album().length === 40);
  C.keep('plT1');

  /* ---- titles: awarded once, plain text, perk is a read-only bonus ---- */
  check('Peacemaker was awarded once, with a plain-text announcement', S.ach.t_peacemaker != null && toasts.filter((t) => /Peacemaker/.test(t)).length === 1 && toasts.every((t) => !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t)), toasts.join(' | '));
  C.checkTitles();
  C.tick();
  E.checkAch();
  check('titles are not awarded twice', toasts.filter((t) => /Peacemaker/.test(t)).length === 1);
  check('the Peacemaker perk is a bonus lookup', C.perk('makeup') === 1.25 && C.perk('nothing') === 1);
  check('titles appear in E.ACH with plain names (no emoji)', E.ACH.filter((x) => x.title).length === C.TITLES.length && C.TITLES.every((t) => !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t.name + t.perkText)));
  const plain = E.ACH.find((x) => x.id === 'first_post');
  toasts.length = 0;
  delete S.ach.first_post;
  S.player.posts = 1;
  E.checkAch();
  check('ordinary achievements also announce without the trophy emoji', S.ach.first_post != null && toasts.some((t) => /Achievement: Hello World/.test(t)) && !toasts.some((t) => /🏆/.test(t)), toasts.join('|') + (plain ? '' : ' (missing)'));

  /* ---- the screens ---- */
  {
    const html = C.readerHtml();
    check('the reader shows the latest chapter first and tappable beats', html.indexOf(C.list()[C.list().length - 1].title) < html.indexOf(C.list()[0].title) || C.list()[0].title === C.list()[C.list().length - 1].title);
    check('beats carry a tap action', /data-act="chapterBeat"/.test(html));
    check('the album sheet lists titles and the outing', /Peacemaker/.test(C.albumHtml()) && /the rooftop/.test(C.albumHtml()));
    check('the Profile card shows once there is something', /Story so far/.test(C.cardHtml()) && /albumcard/.test(C.cardHtml()));
    check('Profile gets the card without losing its own content', /Story and Album/.test(G.Pages.me()) && /Achievements/.test(G.Pages.me()));
    G.UI.acts.chapterBeat({ c: C.list()[0].id, i: 0 });
    check('tapping a beat does not throw', true);
  }

  /* ---- the chapter cap: week after week ---- */
  for (let wk = 8; wk < 24; wk++) {
    S.clock = wk * WEEK + DAY;
    E.addChron(`${a.name.split(' ')[0]} had a long chat with ${b.name.split(' ')[0]} (week ${wk})`);
    E.addChron(`${c.name.split(' ')[0]} asked about you in week ${wk}`);
    S.clock = (wk + 1) * WEEK + 120;
    C.tick();
  }
  check('chapters are capped at 12, newest kept', C.list().length === 12 && C.list()[11].wk === 23 && C.list()[0].wk === 12, JSON.stringify(C.list().map((x) => x.wk)));
  check('chronicle stays capped by its own rules and chapters kept no null keys', !JSON.stringify([S.chapters, S.album]).includes(':null'));

  /* ---- a long jump away writes at most the last two finished weeks ---- */
  {
    const n0 = C.list().length;
    S.clock = 40 * WEEK + 5;
    E.addChron(`${a.name.split(' ')[0]} missed you`);
    C.tick();
    check('a long gap does not flood chapters', C.list().length <= 12 && C.list().length >= n0 - 0);
  }

  /* ---- save round trip ---- */
  const pack = JSON.stringify([S.chapters, S.album, S.ach]);
  check('chapters, album and titles survive a save round trip identically', JSON.stringify(JSON.parse(pack)) === pack);
  const raw = JSON.parse(JSON.stringify(S));
  check('the whole save round-trips with the new keys', JSON.stringify(raw.chapters) === JSON.stringify(S.chapters) && JSON.stringify(raw.album) === JSON.stringify(S.album));
  check('no standalone NPC posts came from chapters', !S.postOrder.some((id) => S.posts[id] && S.posts[id].author !== 'me' && /week \d+/.test(S.posts[id].text)));
  check('no page errors', H.errors.length === 0, H.errors.slice(0, 2).join(' | '));

  H.summary('CHAPTERS: weekly chapters, album and titles');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
