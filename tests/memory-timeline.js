// The story together (a timeline of milestones per person) and wider contradiction detection (places, jobs, relationship status, moods, favourites, birthdays).
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
  mia.mem = []; mia.tl = []; mia.touched = S.clock; mia.tls = mia.status = 'acquaintance';

  /* ---------- #4 wider contradictions ---------- */
  const learn = (t) => M2.learn(mia, t);
  const front = (re) => mia.mem.filter((m) => re.test(m.text));
  learn('I moved to Lisbon last month.');
  learn('I am moving to Tokyo next spring.');
  check('a new city retires the old one (only the newest place is in front)', front(/live in|they live/).length === 1 && /tokyo/i.test(front(/live in/)[0].text) && G.Vault.lines(mia).some((l) => /outdated.*lisbon/i.test(l.text)));
  learn('I just got a new job at a bakery.');
  learn('I got fired yesterday.');
  check('a new job situation retires the old one', front(/told me news/).length === 1 && /fired/.test(front(/told me news/)[0].text), mia.mem.map((m) => m.text).join(' | '));
  learn('I am single.');
  learn('I am engaged.');
  check('relationship status: "engaged" retires "single"', front(/they are/).length === 1 && /engaged/.test(front(/they are/)[0].text));
  learn('I feel so sad today.');
  learn('I am really excited!');
  check('a mood replaces the older mood', front(/they feel/).length === 1 && /excited/.test(front(/they feel/)[0].text));
  learn('My favourite colour is blue.');
  learn('My favourite colour is green.');
  check('a favourite is replaced by a newer favourite', front(/favourite colour/).length === 1 && /green/.test(front(/favourite colour/)[0].text));
  learn('My favourite food is ramen.');
  check('...but a different favourite is kept', front(/favourite food/).length === 1 && front(/favourite colour/).length === 1);
  learn('My birthday is March 3rd.');
  learn('My birthday is on June 9.');
  check('a corrected birthday replaces the old one', front(/birthday/).length === 1 && /June/.test(front(/birthday/)[0].text));
  check('one sentence makes one memory (the job sentence is not also "news" twice)', front(/fired/).length === 1);
  const pin = G.Mem.add(mia, { kind: 'said', text: 'Sam told me they live in Paris (pinned)', who: ['me'], imp: 6, topic: 'place', pin: true });
  learn('I moved to Berlin.');
  check('a pinned memory is never retired by a newer fact', mia.mem.includes(pin));

  /* ---------- #1 the story together ---------- */
  mia.mem = []; mia.tl = [];
  G.Mem.add(mia, { kind: 'comment', text: 'Sam replied to my post about the lighthouse', who: ['me'], imp: 5, t: 100 });
  G.Mem.add(mia, { kind: 'fight', text: 'Sam and I argued about the song', who: ['me'], imp: 7, valence: -0.6, t: 200 });
  G.Mem.add(mia, { kind: 'fight', text: 'Sam insulted my family', who: ['me'], imp: 9, valence: -0.9, t: 300 });
  G.Mem.add(mia, { kind: 'apology', text: 'Sam apologised for what they said', who: ['me'], imp: 6, valence: 0.3, t: 400 });
  M2.learn(mia, 'between us, I am scared of the label.');
  G.Mem.add(mia, { kind: 'said', text: 'Sam promised: "I will be at the lighthouse."', who: ['me'], imp: 7, tags: ['promise'], t: 500 });
  G.Mem.add(mia, { kind: 'event', text: 'Sam never showed up to the lighthouse', who: ['me'], imp: 7, valence: -0.5, t: 600 });
  const tl = M2.timeline(mia);
  const has = (re) => tl.some((e) => re.test(e.text));
  check('the first moment is recorded', has(/Our first moment: Sam replied/));
  check('the first falling out is recorded once, a later big fight is a separate "bad moment"', tl.filter((e) => /first falling out/.test(e.text)).length === 1 && has(/A bad moment: Sam insulted/));
  check('an apology, a secret, a promise and a broken promise are milestones', has(/An apology/) && has(/trusted me with a secret/) && has(/promised/) && has(/promise was broken/));
  check('"first" milestones happen only once (a second secret adds nothing)', (() => { const n0 = M2.timeline(mia).length; M2.learn(mia, 'don\'t tell anyone, I cheated at cards.'); return M2.timeline(mia).filter((e) => /trusted me with a secret/.test(e.text)).length === 1 && M2.timeline(mia).length >= n0; })());
  check('it is in time order', tl.every((e, i) => i === 0 || tl[i - 1].t <= e.t));
  check('nothing about a different person or hearsay lands on the timeline', (() => { G.Mem.add(mia, { kind: 'said', text: 'Dex told me about Sam: "they love jazz"', who: ['me', 'n3'], imp: 5, tags: ['hearsay'] }); return !M2.timeline(mia).some((e) => /Dex told me/.test(e.text)); })());
  // status changes
  mia.status = 'friend';
  S.clock += 120; M2.statusWatch();
  mia.status = 'dating'; S.clock += 120; M2.statusWatch();
  check('a change in how they stand with you is a milestone ("We became: friend", "dating")', M2.timeline(mia).some((e) => /We became: friend/.test(e.text)) && M2.timeline(mia).some((e) => /We became: dating \(before: friend\)/.test(e.text)));
  mia.rom = 95; mia.aff = 90; mia.trust = 90; mia.status = 'partner';
  G.Tier.promote(mia);
  check('becoming lovers is a milestone', M2.timeline(mia).some((e) => /lovers now|changed things/.test(e.text)));
  for (let i = 0; i < 60; i++) G.Mem.add(mia, { kind: 'fight', text: `huge fight number ${i} about thing${i}`, who: ['me'], imp: 9, valence: -0.8, t: 1000 + i });
  check('the timeline stays small (the first ten and the latest thirty)', mia.tl.length <= 40 && mia.tl[0].id === 'first');

  /* ---------- you can ask about it, and see it ---------- */
  const rec = G.Rag.recall(mia, 'when did we first fall out', 6);
  check('recall can answer "when did we first fall out" from the timeline', rec.some((t) => /first falling out/i.test(t)), rec.join(' | '));
  G.UI.go('home'); G.UI.acts.profile({ id: mia.id });
  G.UI.acts.memOpen({ id: mia.id });
  check('the Memories window shows "Your story together" with the milestones', /Your story together/.test($('.modal, #modal, .mbox') ? $('.modal, #modal, .mbox').textContent : document.body.textContent) || /Your story together/.test(w.document.body.textContent) && /Our first moment/.test(w.document.body.textContent));
  check('the timeline survives a save round trip', JSON.parse(JSON.stringify(mia)).tl.length === mia.tl.length);

  H.summary('STORY TOGETHER + WIDER CONTRADICTIONS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
