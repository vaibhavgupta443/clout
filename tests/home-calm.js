// The main page is only posts and stories. Writing is a sheet; updates, new people, offers, suggestions and around town are on Alerts.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  w.document.body.classList.add('ingame');
  G.settings.legacyHome = false;
  G.settings.minimalUI = true;
  let S = G.S;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  E.addPost({ author: mia.id, text: 'hello town', buzz: 3, stats: { likes: 1, reposts: 0, replies: 0, views: 10 } });
  // things that are waiting for you
  const ru = G.World.startRumor('Sam is leaving', 'me', [mia.id], false); ru.belief[mia.id] = 0.8;
  S.leads = [{ id: 'ld1', idx: 5, name: 'Nova Reed', handle: '@nova', age: 27, job: 'nurse', via: 'dm', text: 'hi, is it true?', why: 'x', t: S.clock, status: 'new' }];
  S.fame = Object.assign(G.Fame.ensure(), { offers: [{ id: 'of1', kind: 'giveaway', status: 'open', title: 'Run a giveaway', text: 'x', cost: 10, t: S.clock, exp: S.clock + 999 }] });
  S.pitches = [{ id: 'pt1', kind: 'post', npc: mia.id, text: 'a post idea', label: 'Mia posts', why: 'x', t: S.clock }];
  S.welcome = 'Welcome in.';
  E.addChron('Kai and Mia fought outside the studio');

  G.UI.go('home'); G.UI.render();
  const page = $('#page').innerHTML;
  check('Home has stories and the feed', !!$('.tabs') && /hello town/.test(page));
  check('Home has NO composer, no new-people card, no offers, no suggestions, no around-town, no welcome, no install tip', !$('#composer') && !$('.composer') && !$('.leadcard') && !$('.famestrip') && !$('.townstrip') && !$('.card.welcome') && !$('.tipcard') && !$('.recap'));
  G.UI.go('notifs'); G.UI.render();
  check('Alerts has them: new people, offers, suggestions / around town, welcome', !!$('.leadcard') && !!$('.famestrip') && !!$('.card.welcome') && /suggestion/i.test($('#page').textContent));
  check('and the notifications list is still there under them', /Notifications/.test($('#page').textContent));
  const b = G.UI.badgeCounts();
  check('the Alerts badge counts everything waiting (new person, offer, suggestion)', b.notifs >= 3 && b.home === 0, JSON.stringify(b));

  // writing a post
  G.UI.go('home'); G.UI.render();
  G.UI.acts.create();
  check('the + sheet opens with the composer', !!$('#modal-root #composer') && /New post/.test($('#modal-root').textContent));
  $('#composer').value = 'a post from the sheet';
  $('#composer').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('the draft follows what you type', G.UI.draft === 'a post from the sheet');
  G.UI.closeModal();
  check('the floating menu has "New post" first', (() => { G.Pitches.open = true; G.Pitches.draw(); const first = w.document.querySelector('#fab .fabmenu button b'); G.Pitches.open = false; return !!first && /New post/.test(first.textContent); })());

  // the old layout is still available for tests and habits
  G.settings.legacyHome = true; G.UI.go('home'); G.UI.render();
  check('legacy layout: composer and cards are back on Home', !!$('#composer') && !!$('.leadcard'));
  H.summary('CALM HOME');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
