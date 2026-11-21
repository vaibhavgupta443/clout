// "Previously on": after 30+ minutes away the recap names up to 4 beats (a person plus a sentence), player-related first, no housekeeping lines.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $$ = (s) => [...w.document.querySelectorAll(s)];

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  G.settings.legacyHome = false;
  G.settings.minimalUI = true;
  const S = G.S;
  const W = G.World;
  const awayMin = (m) => { S.sim.lastReal = Date.now() - (m / 4) * 60000; }; // 1 real minute away = 4 game minutes
  const hasMeta = (b) => G.Recap.isMeta(b.text);

  // under 30 game minutes away: nothing at all
  awayMin(20);
  if (S.recap) delete S.recap;
  const none = W.catchUp();
  check('a short absence (under 30 min) gives no recap and no beats', none === null && !S.recap);

  // 12 hours away with a seeded fight about the player's story, housekeeping lines and unrelated noise
  const keys0 = Object.keys(S).sort().join();
  const tick0 = E.tick;
  let seeded = false;
  E.tick = function () {
    if (!seeded) {
      seeded = true;
      W.event('fight', ['n1', 'n2'], 'Mia and Kai fought about your story', -0.5);
      W.event('event', ['n3', 'n2'], 'Dex followed through on a plan to outdo Kai', 0.03, { rumor: false });
      W.event('event', ['n3'], 'Dex thinks about his mood and his goals', 0, { rumor: false });
      W.event('event', ['n3', 'n2'], 'Dex and Kai had a small falling out', -0.2);
    }
    return tick0.apply(this, arguments);
  };
  awayMin(720);
  const rc = W.catchUp();
  E.tick = tick0;
  check('12 hours away gives a recap with 1 to 4 beats', rc && Array.isArray(rc.beats) && rc.beats.length >= 1 && rc.beats.length <= 4, JSON.stringify(rc && rc.beats));
  check('every beat is { k, ids, text, act } with a real person', rc.beats.every((b) => b.k && Array.isArray(b.ids) && b.ids.length && S.npcs[b.ids[0]] && typeof b.text === 'string' && b.text.length < 140 && b.act && b.act.id));
  check('the fight about the player\'s story made it, and comes first (player-related ranks first)', /your story/.test(rc.beats[0].text) || /\byou\b/i.test(rc.beats[0].text), JSON.stringify(rc.beats[0]));
  check('housekeeping (goals, moods, plans) never appears', !rc.beats.some(hasMeta) && !rc.beats.some((b) => /followed through|goal/i.test(b.text)));
  check('the old counts are still there (nothing removed)', typeof rc.posts === 'number' && typeof rc.dms === 'number' && rc.minutes >= 30);
  const keys1 = Object.keys(S).sort().join();
  const added = keys1.split(',').filter((k) => !keys0.split(',').includes(k));
  check('recap adds no state key of its own (only S.recap, which World.catchUp already writes, gains beats)', !added.some((k) => /recap|beat/i.test(k) && k !== 'recap') && Object.keys(S.recap).every((k) => ['minutes', 'posts', 'replies', 'stories', 'dms', 'followers', 'events', 't', 'beats'].includes(k)), added.join());

  // the Alerts hub shows them, tap-through targets a chat or a profile
  G.UI.go('notifs'); G.UI.render();
  const rows = $$('.recapbeat');
  check('Alerts shows the beats inside the recap card', rows.length === rc.beats.length && rows.length <= 4 && !!w.document.querySelector('.card.recap'));
  check('each row taps through to a chat or a profile', rows.every((r) => /^(openChat|profile)$/.test(r.getAttribute('data-act')) && S.npcs[r.getAttribute('data-id')]));
  check('no emoji in the recap labels', !/[\u{1F300}-\u{1FAFF}]/u.test(rows.map((r) => r.textContent).join('')));
  G.UI.go('home'); G.UI.render();
  check('Home stays calm: no recap card', !w.document.querySelector('.recap'));

  const rt = JSON.parse(JSON.stringify(S));
  check('save round-trip: the recap is identical', JSON.stringify(rt.recap) === JSON.stringify(S.recap));
  H.summary('PREVIOUSLY ON');
  process.exit(process.exitCode || 0);
})();
