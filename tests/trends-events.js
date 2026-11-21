// Trending that works (real trends, a page for each), events you can let play out or decline, and the "are the characters working?" check.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  w.document.body.classList.add('ingame');
  const T = G.Trends;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');

  /* ---------- trends come from what is really going on ---------- */
  S.trending = [];
  E.addPost({ author: 'me', text: 'finally dropping the album #NewSound tonight', buzz: 4, stats: { likes: 400, reposts: 3, replies: 12, views: 5000 } });
  E.addPost({ author: mia.id, text: 'cannot wait for #NewSound', buzz: 3, stats: { likes: 120, reposts: 1, replies: 4, views: 900 } });
  S.storylines.push({ id: 'sl1', title: 'The leaked demo tape', summary: 'Someone leaked an unreleased track', heat: 80, status: 'active', participants: [mia.id, kai.id] });
  S.rumors.push({ id: 'r1', text: 'Mia Vale is leaving the label', about: mia.id, belief: { [kai.id]: 0.6 }, t: S.clock });
  E.addChron('Kai Storm walked out of the studio after a fight');
  const c = T.compute();
  check('trends are worked out from hashtags in posts, storylines, rumours and events', c.some((t) => t.tag === '#NewSound') && c.some((t) => /LeakedDemoTape/.test(t.tag)) && c.some((t) => /MiaValeLeaving/.test(t.tag)) && c.some((t) => /KaiStormWalked/.test(t.tag)), c.map((t) => t.tag).join(' '));
  check('the one with the most going on is hottest, every trend says why', c[0].heat >= c[c.length - 1].heat && c.every((t) => t.why && t.heat > 0 && t.heat <= 100), JSON.stringify(c.slice(0, 2)));
  check('at most 8, no duplicates', c.length <= 8 && new Set(c.map((t) => t.tag.toLowerCase())).size === c.length);
  check('refresh() updates the list, and does not touch the save when nothing changed', T.refresh() === true && T.refresh() === false && S.trending.length > 0);
  S.trendT = null;
  E.tick(10);
  check('it refreshes by itself as the clock moves', S.trendT != null);
  S.trending.push({ tag: '#FromTheAI', heat: 60 });
  check('what the AI added is kept for a while', T.compute().some((t) => t.tag === '#FromTheAI'));

  /* ---------- tapping one opens a page ---------- */
  G.UI.go('explore');
  G.UI.render();
  const tr = $$('[data-act="tag"]').find((e) => /NewSound/.test(e.textContent));
  check('trends are listed with why they are hot', !!tr && !!$$('.trend.big').length && /post|Storyline|Rumour|tonight|Kai/.test($('.trend.big').textContent));
  click(tr);
  check('tapping a trend opens its own page', G.UI.page === 'trend' && G.UI.trend === '#NewSound');
  const page = $('#page').textContent;
  check('the page shows the heat, why, the people talking, and the posts', /#NewSound/.test(page) && /heat/.test(page) && /2 posts use it|posts use it/.test(page) && /Mia Vale/.test(page) && $$('#page article.post').length >= 2, page.slice(0, 200));
  check('...and what you can do about it', !!$('[data-act="trendAsk"]') && !!$('[data-act="trendBoost"]') && !!$('[data-act="trendMute"]'));
  S.channels = null; G.Channels.ensure(); S.channels[0].msgs.push({ id: 'cm1', from: kai.id, text: 'everyone is talking about the leaked demo tape', t: S.clock });
  G.UI.trend = '#LeakedDemoTape'; G.UI.go('trend'); G.UI.render();
  check('a storyline trend shows the storyline and what the channels are saying', /leaked demo tape/i.test($('#page').textContent) && /In the channels/.test($('#page').textContent) && /everyone is talking/.test($('#page').textContent));
  const prompts = [];
  G.AI.ready = () => true;
  G.AI.json = async (o) => { prompts.push(o.user); return { cost: 0, data: { answer: 'It is the demo tape.', suggestions: [] } }; };
  G.UI.acts.trendAsk({ tag: '#LeakedDemoTape' });
  for (let i = 0; i < 60 && !prompts.length; i++) await H.wait(25);
  check('"Ask the Director" asks it about that trend (no change to the world)', prompts.length === 1 && /LeakedDemoTape/.test(prompts[0]) && /THE OWNER ASKS/.test(prompts[0]));
  G.UI.acts.trendBoost({ tag: '#LeakedDemoTape' });
  check('"Make it bigger" puts a ready directive in the box for you to approve', /Make #LeakedDemoTape blow up/.test($('#stdock textarea').value));
  G.UI.acts.trendMute({ tag: '#LeakedDemoTape' });
  check('muting removes it and it stays gone', !S.trending.some((t) => t.tag === '#LeakedDemoTape') && !T.compute().some((t) => t.tag === '#LeakedDemoTape') && G.UI.page === 'explore');
  G.UI.trend = '#SomethingRandom'; G.UI.go('trend'); G.UI.render();
  check('a hashtag that is not trending still opens a page (with a clear empty state)', /not trending/.test($('#page').textContent) && /No posts about this yet/.test($('#page').textContent));

  /* ---------- events: play out or decline ---------- */
  S = G.S;
  S.events.push({ id: 'ev1', t: S.clock, resolved: false, title: 'A paparazzi photo leaks', text: 'A photo of you and Mia is everywhere.', options: ['Deny it', 'Own it'] });
  S.events.push({ id: 'ev2', t: S.clock, resolved: false, title: 'A brand offers a deal', text: 'A sneaker brand wants you.', options: ['Accept', 'Refuse'] });
  G.UI.go('home'); G.UI.render();
  check('an event shows its choices plus "Let it play out" and "Decline"', $$('[data-act="choose"]').length >= 4 && $$('[data-act="eventContinue"]').length === 2 && $$('[data-act="eventDecline"]').length === 2);
  const calls = [];
  G.AI.json = async (o) => { calls.push(o.user); return { cost: 0.003, data: { chronicle: 'The photo story ran its course', posts: [] } }; };
  const ch0 = S.chronicle.length;
  G.UI.acts.eventDecline({ id: 'ev2' });
  const ev2 = G.S.events.find((e) => e.id === 'ev2');
  check('Decline dismisses it: no AI call, no cost, and it is noted', ev2.resolved && ev2.declined && calls.length === 0 && G.S.chronicle.length > ch0 && /turned down/i.test(G.S.chronicle[G.S.chronicle.length - 1].text));
  check('...and its card is gone', !$$('.event').some((e) => /brand offers/.test(e.textContent)));
  G.UI.acts.eventContinue({ id: 'ev1' });
  for (let i = 0; i < 80 && !calls.length; i++) await H.wait(25);
  await H.wait(50);
  const ev1 = G.S.events.find((e) => e.id === 'ev1');
  check('"Let it play out" lets the AI continue the event on its own', calls.length === 1 && /Let it play out on its own/.test(calls[0]) && /A paparazzi photo leaks/.test(calls[0]) && ev1.resolved);
  check('...and the story moves on', /ran its course/.test(G.S.chronicle.map((c) => c.text).join(' ')));
  check('a normal choice still works the same', await (async () => { G.S.events.push({ id: 'ev3', t: G.S.clock, resolved: false, title: 'T', text: 'x', options: ['A', 'B'] }); calls.length = 0; await G.Engine.chooseEvent('ev3', 1); return calls.length === 1 && /The player chose: "B"/.test(calls[0]); })());

  /* ---------- are the characters working? ---------- */
  S = G.S;
  const people = Object.values(S.npcs).filter((n) => !n.userAlt);
  people.forEach((n) => { n.touched = S.clock; });
  const day = G.U.dayOf(S.clock);
  for (let d = day - 8; d < day; d++) {
    G.Charts.sample({ d, posts: 0, comments: 3, likes: 5, dms: 1 });
  }
  const dead = people[0];
  dead.hist = (dead.hist || []).map((r) => [r[0], r[1], r[2], r[3], r[4], 0]);
  const busy = people[1];
  busy.hist = (busy.hist || []).map((r) => [r[0], r[1], r[2], r[3], r[4], 6]);
  G.Persona.ensure(dead).day = { d: day, comments: 0, likes: 0, dms: 0, posts: 0, stories: 0 }; // nothing today either
  const rows = G.Charts.health();
  check('every row has 14 days of bars at most, a total, an idle count, mood, memory count and flags', rows.length >= 3 && rows.every((r) => r.acts.length <= 14 && typeof r.total === 'number' && typeof r.idle === 'number' && Array.isArray(r.flags)));
  check('a person who did nothing for days is flagged as silent', rows.find((r) => r.n.id === dead.id).flags.some((f) => /silent|quiet/.test(f)));
  check('a person who is reacting is not flagged for that', !rows.find((r) => r.n.id === busy.id).flags.some((f) => /silent|quiet/.test(f)) && rows.find((r) => r.n.id === busy.id).recent > 0);
  check('the history now records what each person did (actions per day)', S.hist.length >= 8 && people.some((n) => (n.hist || []).some((r) => r.length >= 6)));
  G.UI.go('storyteller'); G.UI.render();
  check('the Storyteller page shows the check with a bar chart per person and the warnings', /Are the characters working/.test($('#page').textContent) && $$('.hrow svg rect').length > 10 && /silent|quiet/.test($('.hflag') ? $('.hflag').textContent : ''));
  check('tapping a person opens them', !!$('.hrow .hn[data-act="profile"]'));

  H.summary('TRENDS + EVENTS + HEALTH');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
