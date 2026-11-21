// Fame & money: followers/cash that move with the clock, viral waves, daily payout, milestones, and offers you accept or decline.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  let S = G.S;
  G.World.postDial = () => 0;
  w.document.body.classList.add('ingame');
  const Fm = G.Fame;
  const P = () => G.S.player;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  mia.aff = 40; mia.age = 25;
  const post = (text, likes, extra = {}) => { const p = E.addPost({ author: 'me', text, buzz: 5, stats: { likes, reposts: 0, replies: 0, views: likes * 5 }, t: extra.t }); if (extra.t == null) delete extra.t; Object.assign(p, extra); if (extra.t != null) p.t = extra.t; return p; };

  /* ---------- the world moves without you posting ---------- */
  P().followers = 20000; P().cash = 1000; P().level = 3;
  const p1 = post('big announcement', 3000, { judge: { q: 8, v: 5, s: 5, c: 0, note: '' } });
  p1.fame = { viral: false };
  const f0 = P().followers;
  E.tick(60 * 24);
  check('a day of good engagement brings organic followers', P().followers > f0, `${f0} -> ${P().followers}`);
  check('and a creator payout arrives once the day turns (with an alert)', G.S.notifs.some((n) => /Daily creator payout/.test(n.text)) && P().cash > 1000);
  check('the history for the growth chart starts', G.S.fame.hist.length >= 1 && G.S.fame.hist[0].f > 0);
  // vanishing slowly costs followers
  S = G.S;
  S.postOrder.forEach((id) => { if (S.posts[id].author === 'me') S.posts[id].t -= 6000; });
  const f1 = P().followers;
  E.tick(60 * 24);
  check('disappearing for 3+ days slowly loses followers', P().followers < f1, `${f1} -> ${P().followers}`);

  /* ---------- virality ---------- */
  P().followers = 10000;
  S.fame.waves = [];
  const v = post('the take that broke the internet', 9000, { judge: { q: 9, v: 9, s: 6, c: 2, note: '' } });
  const cash0 = P().cash;
  E.tick(60);
  check('a post that takes off starts a viral wave, with an alert, tips and a chronicle line', S.fame.waves.length === 1 && v.fame.viral === true && S.notifs.some((n) => /is taking off/.test(n.text)) && P().cash > cash0 && S.chronicle.some((c) => /went viral/.test(c.text)));
  const f2 = P().followers;
  E.tick(60 * 6);
  check('the wave keeps bringing followers for hours', P().followers > f2 + 100, `${f2} -> ${P().followers}`);
  check('and it fades out by itself', (E.tick(60 * 40), G.S.fame.waves.length === 0));
  const plain = post('lunch', 20, { judge: { q: 4, v: 3, s: 0, c: 0, note: '' } });
  E.tick(60);
  check('an ordinary post does not trigger a wave', plain.fame && plain.fame.viral === false);

  /* ---------- milestones ---------- */
  P().followers = 4990; P().cash = 100;
  S.fame.ms = 1; // 1k already passed
  P().followers = 5100;
  S.notifs = [];
  Fm.milestones();
  check('crossing 5,000 gives a bonus, an alert and a chronicle line', S.notifs.some((n) => /(5K|5,?000) followers/.test(n.text)) && P().cash === 100 + 200 && S.chronicle.some((c) => /reached (5K|5,?000)/.test(c.text)));
  check('it only happens once', Fm.milestones() === 0);

  /* ---------- offers ---------- */
  P().followers = 50000; P().cash = 5000;
  S.fame.offers = []; S.fame.offerT = null; S.fame.hotUntil = 0; S.fame.ms = Fm.MS.filter((m) => m <= P().followers).length;
  const realRand = G.World.rnd;
  G.World.rnd = () => 0.1;
  S.clock += 700;
  const o = Fm.tick();
  G.World.rnd = realRand;
  check('an opportunity appears with a real price and an alert', !!o && o.status === 'open' && G.S.notifs.some((n) => /New opportunity/.test(n.text)));
  const kinds = ['brand', 'collab', 'appearance', 'interview', 'merch', 'giveaway'];
  const made = kinds.map((k) => Fm.make(k)).filter(Boolean);
  check('each kind can be made at this size', made.length === 6, made.map((m) => m.kind).join(','));
  check('small accounts do not get big offers', (() => { const f = P().followers; P().followers = 400; const r = ['brand', 'appearance', 'interview', 'merch'].map((k) => Fm.make(k)); P().followers = f; return r.every((x) => x === null); })());
  S.fame.offers = made.slice();
  G.UI.go('shop'); G.UI.render();
  check('the Shop page lists them with Accept / No thanks and a growth chart area', !!$('.famecard') && !!$('[data-act="gigAccept"]') && !!$('[data-act="gigDecline"]'));
  G.UI.go('home'); G.UI.render();
  check('Home has an opportunities strip', !!$('.famestrip'));

  const by = (k) => S.fame.offers.find((x) => x.kind === k);
  // appearance
  const ap = by('appearance');
  let c = P().cash; let f = P().followers;
  await G.UI.acts.gigAccept({ id: ap.id });
  S = G.S;
  check('an appearance pays the fee and brings followers', P().cash === c + ap.pay && P().followers > f && S.fame.offers.find((x) => x.id === ap.id).status === 'done');
  E.undo(); S = G.S;
  check('↩ Undo takes the money and followers back', P().cash === c && P().followers === f);
  // giveaway: costs, gains
  const gv = by('giveaway');
  c = P().cash; f = P().followers;
  await G.UI.acts.gigAccept({ id: gv.id });
  check('a giveaway costs cash and brings fans', P().cash === c - gv.cost && P().followers > f);
  // not enough cash
  const mc = by('merch');
  P().cash = 5;
  let err = null;
  try { Fm.accept(mc.id); } catch (e) { err = e; }
  check('you cannot pay what you do not have', err && /you need/i.test(err.message) && by('merch').status === 'open');
  P().cash = 5000;
  // collab
  const cb = by('collab');
  const aff0 = S.npcs[cb.npc].aff; const fo0 = P().followers; const posts0 = Object.keys(S.posts).length;
  await G.UI.acts.gigAccept({ id: cb.id });
  S = G.S;
  check('a collab: the character posts it, you both gain followers, and you grow closer', Object.keys(S.posts).length === posts0 + 1 && P().followers > fo0 && S.npcs[cb.npc].aff === aff0 + 6 && (S.npcs[cb.npc].mem || []).some((m) => /collab/.test(m.text)));
  // merch
  const mc2 = Fm.make('merch');
  S.fame.offers.push(mc2);
  c = P().cash;
  Fm.accept(mc2.id);
  check('merch takes the money now and returns it a day later', P().cash === c - mc2.cost && !!S.fame.merch);
  S.clock += 1500; Fm.follow();
  check('the merch result arrives (profit or loss) and closes', !S.fame.merch && G.S.notifs.some((n) => /Merch sold/.test(n.text)));
  // brand: needs a post that mentions it
  const br = by('brand');
  c = P().cash;
  Fm.accept(br.id);
  check('a brand deal waits for your post (a deadline, nothing paid yet)', br.status === 'accepted' && br.deadline > S.clock && P().cash === c);
  post('just a random post', 50, { t: S.clock + 1, judge: { q: 5, v: 3, s: 0, c: 0, note: '' } });
  Fm.follow();
  check('a post that does not mention them does not count', br.status === 'accepted');
  post(`honestly obsessed with ${br.brand} lately`, 400, { t: S.clock + 2, judge: { q: 8, v: 4, s: 3, c: 0, note: '' } });
  Fm.follow();
  check('mentioning the brand pays you (+20% for a post that does well)', br.status === 'done' && P().cash === c + Math.round(br.pay * 1.2));
  // brand deadline missed
  S.clock += 10; // put the deadline fixture after the earlier posts' explicit future timestamps
  const br2 = Fm.make('brand'); S.fame.offers.push(br2);
  Fm.accept(br2.id);
  P().audience.love = Math.max(P().audience.love, 50); // keep the goodwill assertion above its lower clamp
  const love0 = P().audience.love;
  S.clock += 3000; Fm.follow();
  check('missing the deadline loses the deal and a little goodwill', br2.status === 'failed' && P().audience.love < love0);
  // decline + expire
  const dd = Fm.make('collab'); S.fame.offers.push(dd);
  G.UI.acts.gigDecline({ id: dd.id });
  check('declining just closes it', dd.status === 'declined');
  const ex = Fm.make('interview'); S.fame.offers.push(ex);
  S.clock += 3000; S.fame.offerT = S.clock; Fm.tick();
  check('unanswered offers expire', ex.status === 'expired');

  /* ---------- off switch + save safety ---------- */
  G.settings.fameSim = false;
  const ht = G.S.fame.hist.length; const ft = G.S.fame.t;
  E.tick(60 * 48);
  check('switched off in Settings: the fame system does nothing', G.S.fame.hist.length === ht && G.S.fame.t === ft);
  G.settings.fameSim = true;
  G.UI.go('settings'); G.UI.render();
  check('the Settings switch exists', /data-setting="fameSim"/.test($('#page').innerHTML));
  check('a world that has never run the fame system saves without the key', (() => { H.freshWorld(); return !('fame' in G.S) && (G.UI.go('shop'), G.UI.render(), !('fame' in G.S)); })());

  H.summary('FAME + MONEY: GROWTH, VIRALITY, MILESTONES, OFFERS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
