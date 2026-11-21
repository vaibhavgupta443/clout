/* Clout — FAME & MONEY: followers and cash that move with the clock, virality that spreads, and offers you can take.
   Before: followers only changed in the moment you posted, and money came only from likes on your own posts. A quiet day meant a flat world.
   Now (all free, offline, no AI call):
   - ORGANIC GROWTH every game hour from how your recent posts are doing (engagement), slow decay if you vanish for 3 days;
   - VIRAL WAVES: a post that really takes off keeps bringing followers over the next day (and tips), and makes brands notice you;
   - CREATOR PAYOUT once a day from 1,000 followers, scaled by engagement;
   - FOLLOWER MILESTONES with a cash reward and a line in the chronicle;
   - OFFERS (💼 Opportunities) that you accept or decline, each undoable: brand deals (mention the brand in a post within 2 days), collabs with a character,
     paid appearances, press interviews, merch drops (money in, money out after a day, can lose), giveaways (spend cash, gain fans);
   - a growth chart and earnings on the Shop page.
   Nothing happens to you without your tap: the offers wait for you, and they expire. */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const esc = U.esc;
  const Fame = (G.Fame = { EVERY: 600, MAX: 3, MS: [1e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6] });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (l, r) => l[Math.floor(r() * l.length) % l.length];
  const rand = () => (G.World && G.World.rnd ? G.World.rnd() : Math.random());
  const fmt = (v) => U.fmt(Math.round(v));
  const enabled = () => G.settings.fameSim !== false;
  const EMPTY = { offers: [], waves: [], hist: [], earned: 0, ms: 0, hotUntil: 0 };
  Fame.state = () => (G.S && G.S.fame) || EMPTY; // reading never creates the key (a lazily made key would make a reloaded world differ from the saved one)
  Fame.ensure = (at) => (G.S.fame = G.S.fame || { t: at != null ? at : G.S.clock, day: U.dayOf(at != null ? at : G.S.clock), frac: 0, offers: [], waves: [], hist: [], earned: 0, ms: Fame.MS.filter((m) => m <= G.S.player.followers).length, hotUntil: 0, n: 0, since: at != null ? at : G.S.clock });

  const BRANDS = ['Glowhaus', 'Nimbus Energy', 'Pocketwise', 'Velvet Oat', 'Orbit Sneakers', 'Kettle & Co', 'Lumen Skin', 'PixelPup', 'Fernwood Tea', 'Skylark Audio', 'Mintly', 'Harbor Denim'];
  const WHAT = ['a launch party', 'a podcast taping', 'a festival meet & greet', 'a store opening', 'a panel talk'];

  const mine = (S, within) => S.postOrder.slice(-120).map((id) => S.posts[id]).filter((p) => p && p.author === 'me' && !p.replyTo && !p.pending && (within == null || S.clock - p.t <= within));
  // how well your recent posts are doing, relative to your size
  Fame.engagement = function (S = G.S) {
    const ps = mine(S, 2880);
    if (!ps.length) return 0;
    const f = Math.max(50, S.player.followers);
    return clamp(ps.reduce((a, p) => a + ((p.stats && p.stats.likes) || 0), 0) / (ps.length * f), 0, 1);
  };

  /* ---------- virality ---------- */
  Fame.scanPosts = function () {
    const S = G.S;
    const F = Fame.ensure();
    let n = 0;
    mine(S).forEach((p) => {
      if (p.fame || !p.judge || !p.stats) return;
      if (p.dup) { p.fame = { viral: false }; return; } // a repeat of an old post never goes viral
      const f = Math.max(50, S.player.followers);
      const base = f * 0.04 + 20;
      const v = p.judge.v || 0;
      const viral = v >= 8 || p.stats.likes >= 5 * base;
      p.fame = { viral };
      if (!viral) return;
      const pending = F.waves.reduce((a, w) => a + w.left, 0);
      const total = Math.round(Math.max(10, f * clamp(0.02 + 0.006 * (v - 5), 0.015, 0.1)) * E.saturation(S.player.followers, S) * Math.max(0, 1 - pending / (f * 0.1))); // one wave at a time, smaller as you near the size of the world
      if (total < 1) return;
      F.waves.push({ post: p.id, left: total, t: S.clock });
      F.hotUntil = S.clock + 2880;
      const tips = Math.round(p.stats.likes * 0.01 * (1 + S.player.level * 0.04));
      S.player.cash += tips;
      F.earned += tips;
      try { E.addNotif('viral', `🔥 "${String(p.text).slice(0, 40)}" is taking off: about +${fmt(total)} followers over the next day${tips ? ' and $' + fmt(tips) + ' in tips' : ''}`, { postId: p.id }); } catch (e) {}
      try { E.addChron(`${S.player.name}'s post went viral`); } catch (e) {}
      n++;
    });
    return n;
  };

  /* ---------- milestones ---------- */
  Fame.milestones = function () {
    const S = G.S;
    const F = Fame.ensure();
    let hit = 0;
    while (F.ms < Fame.MS.length && S.player.followers >= Fame.MS[F.ms]) {
      const m = Fame.MS[F.ms++];
      const bonus = Math.round(m * 0.04);
      S.player.cash += bonus;
      F.earned += bonus;
      try { E.addNotif('follow', `🎉 ${fmt(m)} followers! Bonus +$${fmt(bonus)}${!S.player.verified ? ' · you can buy verification (Shop)' : ''}`, {}); } catch (e) {}
      try { E.addChron(`${S.player.name} reached ${fmt(m)} followers`, { meta: true }); } catch (e) {}
      try { UI.toast(`🎉 ${fmt(m)} followers!`, 'good'); } catch (e) {}
      hit++;
    }
    return hit;
  };

  /* ---------- scandal: heat above 70 ---------- */
  Fame.scandal = function (S, F) {
    const P = S.player;
    if (P.heat > 70) {
      if (!F.pile) { // once per scandal: the pile-on lands in the alerts and costs a bit of goodwill
        F.pile = true;
        P.audience.love = clamp(P.audience.love - 3, 5, 95);
        P.audience.hate = clamp(P.audience.hate + 3, 2, 95);
        try { E.addNotif('drama', 'People are piling on you: the heat is high. Followers are leaving and brands are backing off.', { key: 'pile' }); } catch (e) {}
      }
      F.offers.forEach((o) => {
        if (['brand', 'appearance', 'interview'].includes(o.kind) && (o.status === 'open' || (o.kind === 'brand' && o.status === 'accepted' && P.heat > 85))) {
          o.status = 'revoked';
          try { E.addNotif('event', `💼 ${o.title} was withdrawn: too much controversy`, { key: 'offers-revoked' }); } catch (e) {}
        }
      });
    } else if (P.heat < 45 && F.pile) F.pile = false;
  };

  /* ---------- one game hour ---------- */
  Fame.hour = function () {
    const S = G.S;
    const F = Fame.ensure();
    const P = S.player;
    const recent = mine(S, 4320);
    const last = recent.length ? Math.max(...recent.map((p) => p.t)) : -1e9;
    const er = Fame.engagement(S);
    const active = S.clock - last < 4320;
    const love = P.audience ? P.audience.love : 50;
    const hate = P.audience ? P.audience.hate : 5;
    const mood = clamp(0.6 + love / 125, 0.6, 1.4) * (P.verified ? 1.1 : 1); // a warm audience (and a blue tick) spreads you further
    let g = active ? (P.followers * 0.00012 * clamp(er * 6, 0.2, 1.6) * E.saturation(P.followers, S) * mood + 0.02 * P.level) : -P.followers * 0.00004;
    if (hate > 40) g -= P.followers * 0.00003 * (hate - 40) / 10; // haters wear a following down
    if (P.heat > 70) g -= P.followers * 0.0012 * (P.heat - 70) / 30; // a scandal: an unfollow wave while it burns
    Fame.scandal(S, F);
    F.waves = F.waves.filter((w) => {
      const take = Math.min(w.left, Math.max(0.5, w.left * 0.12));
      w.left -= take;
      g += take;
      return w.left >= 1 && S.clock - w.t < 2160;
    });
    F.frac += g;
    const whole = F.frac >= 0 ? Math.floor(F.frac) : Math.ceil(F.frac);
    F.frac -= whole;
    if (whole) E.addFollowers(whole);
    Fame.milestones();
  };

  /* ---------- once a day ---------- */
  Fame.upkeep = () => Math.round(4 + G.S.player.level * 3 + Math.max(0, G.S.player.cash) * 0.003);
  Fame.day = function () {
    const S = G.S;
    const F = Fame.ensure();
    const P = S.player;
    if (P.followers >= 1000) {
      const pay = Math.round(P.followers * 0.0025 * (0.5 + clamp(Fame.engagement(S) * 5, 0, 1.5)) * (S.clock < F.hotUntil ? 1.3 : 1));
      if (pay > 0) {
        P.cash += pay;
        F.earned += pay;
        try { E.addNotif('cash', `💰 Daily creator payout: +$${fmt(pay)}`, {}); } catch (e) {}
      }
    }
    // living costs: rent, staff and gear grow with your level and with the cash you keep (a sink that is shown, never hidden)
    const up = Math.min(Math.max(0, P.cash), Fame.upkeep());
    if (up > 0) {
      P.cash -= up;
      F.spent = (F.spent || 0) + up;
      try { E.addNotif('cash', `🏠 Living costs: -$${fmt(up)} (rent, staff, gear)`, { key: 'upkeep' }); } catch (e) {}
    }
    F.hist.push({ d: U.dayOf(S.clock), f: P.followers, c: Math.round(P.cash) });
    if (F.hist.length > 60) F.hist.shift();
  };

  /* ---------- offers ---------- */
  const nextId = () => 'of' + (Fame.ensure().n = (Fame.ensure().n || 0) + 1);
  const people = (S) => Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted && (n.age == null || n.age >= 18) && (n.aff || 0) >= 15);
  const hot = () => G.S.clock < Fame.state().hotUntil;
  Fame.make = function (kind, r = rand) {
    const S = G.S;
    const f = S.player.followers;
    const h = (hot() ? 1.5 : 1) * (S.player.verified ? 1.25 : 1); // a blue tick is worth a quarter more to a brand
    const base = { id: nextId(), kind, t: S.clock, exp: S.clock + 2880, status: 'open' };
    if (kind === 'brand' && f >= 1500) {
      const brand = pick(BRANDS, r);
      const pay = Math.round(Math.max(60, f * (0.012 + 0.018 * r())) * h);
      return Object.assign(base, { brand, pay, title: `${brand} sponsorship`, text: `${brand} wants you to mention them in a post within 2 days of saying yes. They pay $${fmt(pay)} when it is up (+20% if the post does well).` });
    }
    if (kind === 'collab' && f >= 300) {
      const n = pick(people(S), r);
      if (!n) return null;
      return Object.assign(base, { npc: n.id, title: `Collab with ${n.name}`, text: `${n.name} proposes a joint post that tags you both. You both gain followers and grow closer. Free.`, gain: Math.round(f * 0.012) });
    }
    if (kind === 'appearance' && (f >= 15000 || (S.player.verified && f >= 6000))) { // verified opens this door earlier
      const pay = Math.round(f * (0.01 + 0.01 * r()) * h);
      return Object.assign(base, { pay, title: `Paid appearance`, text: `You are invited to ${pick(WHAT, r)}. The fee is $${fmt(pay)} and a crowd of new followers.` });
    }
    if (kind === 'interview' && f >= 8000) return Object.assign(base, { title: 'Press interview', text: 'A magazine wants an interview. It brings followers, but a bad quote can stir up trouble.', gain: Math.round(f * 0.01) });
    if (kind === 'merch' && f >= 3000 && !Fame.state().merch) {
      const cost = Math.round(f * 0.012 + 30);
      return Object.assign(base, { cost, title: 'Merch drop', text: `Print a limited run for $${fmt(cost)}. The money comes back after a day, from how loved you are and how your posts are doing. It can lose money.` });
    }
    if (kind === 'giveaway' && f >= 800) {
      const cost = Math.round(f * 0.006 + 20);
      return Object.assign(base, { cost, title: 'Run a giveaway', text: `Spend $${fmt(cost)} on prizes. A big wave of new followers and a warmer audience.` });
    }
    return null;
  };
  Fame.open = () => Fame.state().offers.filter((o) => o.status === 'open' || o.status === 'accepted');

  Fame.tick = function () {
    const S = G.S;
    if (!S || !enabled()) return null;
    const F = Fame.ensure();
    F.offers.forEach((o) => { if (o.status === 'open' && S.clock > o.exp) o.status = 'expired'; });
    F.offers = F.offers.filter((o) => o.status === 'open' || o.status === 'accepted' || S.clock - o.t < 4320).slice(-14);
    if (Fame.open().filter((o) => o.status === 'open').length >= Fame.MAX) return null;
    if (F.offerT != null && S.clock - F.offerT < (hot() ? 120 : Fame.EVERY)) return null;
    F.offerT = S.clock;
    if (rand() > (hot() ? 1 : 0.7)) return null;
    const scandal = S.player.heat > 70;
    const kinds = ['brand', 'collab', 'appearance', 'interview', 'merch', 'giveaway'].filter((k) => !(scandal && ['brand', 'appearance', 'interview'].includes(k))).sort(() => rand() - 0.5);
    for (const k of kinds) {
      if (F.offers.some((o) => o.status === 'open' && o.kind === k)) continue;
      const o = Fame.make(k);
      if (o) {
        F.offers.push(o);
        try { E.addNotif('event', `💼 New opportunity: ${o.title}`, { act: 'nav', data: { page: 'shop' }, key: 'offers' }); } catch (e) {}
        return o;
      }
    }
    return null;
  };

  // brand deliverables, merch returns, deadlines
  Fame.follow = function () {
    const S = G.S;
    const F = Fame.ensure();
    F.offers.filter((o) => o.kind === 'brand' && o.status === 'accepted').forEach((o) => {
      const post = mine(S).find((p) => p.t >= o.acc && String(p.text).toLowerCase().includes(o.brand.toLowerCase()));
      if (post) {
        const pay = Math.round(o.pay * (post.judge && post.judge.q >= 7 ? 1.2 : 1));
        S.player.cash += pay;
        F.earned += pay;
        o.status = 'done';
        o.paid = pay;
        try { E.addNotif('cash', `💼 ${o.brand} paid you $${fmt(pay)} for your post`, { postId: post.id }); } catch (e) {}
      } else if (S.clock > o.deadline) {
        o.status = 'failed';
        S.player.audience.love = clamp(S.player.audience.love - 3, 5, 95);
        try { E.addNotif('event', `💼 ${o.brand} dropped you: no post mentioning them in time`, {}); } catch (e) {}
      }
    });
    if (F.merch && S.clock >= F.merch.due) {
      const m = F.merch;
      const rev = Math.round(m.cost * (0.5 + 2.4 * clamp(Fame.engagement(S) * 5, 0, 1) + S.player.audience.love / 120) * (0.7 + 0.6 * rand()));
      S.player.cash += rev;
      F.earned += rev - m.cost;
      delete F.merch;
      try { E.addNotif('cash', `🧢 Merch sold: +$${fmt(rev)} (${rev >= m.cost ? 'profit $' + fmt(rev - m.cost) : 'a loss of $' + fmt(m.cost - rev)})`, {}); } catch (e) {}
    }
  };

  /* ---------- accept / decline ---------- */
  Fame.accept = function (id) {
    const S = G.S;
    const F = Fame.ensure();
    const o = F.offers.find((x) => x.id === id);
    if (!o || o.status !== 'open') return null;
    const P = S.player;
    if (o.cost && P.cash < o.cost) throw Object.assign(new Error(`You need $${fmt(o.cost)} for this (you have $${fmt(P.cash)}).`), { user: true });
    const f = P.followers;
    const stunt = S.clock - (F.stuntT != null ? F.stuntT : -1e9) < 1440 ? 0.3 : 1; // a second stunt inside a day gets a cooler reception
    const gainF = (x) => (F.stuntT = S.clock, E.addFollowers)(Math.max(1, Math.round(x * stunt * E.saturation(P.followers, S))));
    let msg = '';
    if (o.kind === 'brand') {
      o.status = 'accepted';
      o.acc = S.clock;
      o.deadline = S.clock + 2880;
      msg = `Deal on. Post something that mentions ${o.brand} within 2 days.`;
    } else if (o.kind === 'collab') {
      const n = S.npcs[o.npc];
      if (!n) { o.status = 'expired'; return null; }
      const me = String(P.handle || '@me');
      const text = pick([`collab szn with ${me} 🤝 you are going to want to see this`, `${me} and I made something. watch this space ✨`, `finally working with ${me}. this one is special 🎬`], rand);
      E.addPost({ author: n.id, text, buzz: 5, stats: { likes: Math.round((n.followers || 100) * 0.03) + 5, reposts: 2, replies: 1, views: Math.round((n.followers || 100) * 0.2) + 50 } });
      const g = gainF(o.gain * (0.7 + 0.6 * rand()));
      n.followers = (n.followers || 0) + Math.round(g * 0.8);
      n.aff = clamp((n.aff || 0) + 6, -100, 100);
      n.touched = S.clock;
      try { G.Mem.add(n, { kind: 'event', text: `I did a collab post with ${P.name}; it went well`, who: ['me'], imp: 5, valence: 0.5 }); } catch (e) {}
      o.status = 'done';
      msg = `${n.name} posted the collab. +${fmt(g)} followers.`;
    } else if (o.kind === 'appearance') {
      P.cash += o.pay;
      F.earned += o.pay;
      const g = gainF(f * 0.008);
      P.audience.love = clamp(P.audience.love + 2, 5, 95);
      o.status = 'done';
      try { E.addChron(`${P.name} made a paid appearance`); } catch (e) {}
      msg = `+$${fmt(o.pay)} and +${fmt(g)} followers.`;
    } else if (o.kind === 'interview') {
      const g = gainF(o.gain);
      o.status = 'done';
      if (rand() < 0.25) { P.heat = clamp(P.heat + 18, 0, 100); P.audience.hate = clamp(P.audience.hate + 3, 2, 95); msg = `+${fmt(g)} followers, but one quote stirred up trouble.`; } else msg = `+${fmt(g)} followers.`;
    } else if (o.kind === 'merch') {
      P.cash -= o.cost;
      F.earned -= o.cost;
      F.merch = { cost: o.cost, due: S.clock + 1440 };
      o.status = 'done';
      msg = `Merch is printing. Results in a day.`;
    } else if (o.kind === 'giveaway') {
      P.cash -= o.cost;
      F.earned -= o.cost;
      const g = gainF(f * (0.012 + 0.016 * rand()));
      P.audience.love = clamp(P.audience.love + 3, 5, 95);
      P.heat = clamp(P.heat - 3, 0, 100);
      o.status = 'done';
      msg = `+${fmt(g)} followers from the giveaway.`;
    }
    Fame.milestones();
    G.Store.saveSoon();
    return { offer: o, msg };
  };
  Fame.decline = function (id) {
    const o = Fame.state().offers.find((x) => x.id === id);
    if (o && o.status === 'open') { o.status = 'declined'; G.Store.saveSoon(); }
    return o;
  };

  // world.js playerDrift grew followers up to 0.4% on every world step (it compounded to millions); organic growth now lives in Fame.hour (engagement, love, hate, saturation)
  if (G.World && G.World.playerDrift) { const pd = G.World.playerDrift; G.World.playerDrift = function () { if (enabled()) return; const r = pd.apply(this, arguments); E.addFollowers(0); return r; }; }

  /* ---------- the clock ---------- */
  Fame.advance = function (from) {
    const S = G.S;
    if (!S || !enabled()) return;
    const F = Fame.ensure(from); // (first run starts counting from before this tick, not after it)
    if (F.t == null) F.t = S.clock;
    if (S.clock - F.t > 72 * 60) F.t = S.clock - 72 * 60;
    let steps = 0;
    while (S.clock - F.t >= 60 && steps++ < 72) {
      F.t += 60;
      Fame.scanPosts();
      Fame.hour();
      if (U.dayOf(F.t) > F.day) { F.day = U.dayOf(F.t); Fame.day(); }
    }
    Fame.follow();
    Fame.tick();
  };
  { const tick0 = E.tick; E.tick = function () { const t0 = G.S ? G.S.clock : null; const r = tick0.apply(this, arguments); try { Fame.advance(t0); } catch (e) { if (window.console) console.warn('fame', e); } return r; }; }

  /* ---------- the cards ---------- */
  const line = (o) => {
    const st = o.status === 'accepted' ? `<span class="chip blue">in progress${o.deadline ? ' · ' + Math.max(0, Math.ceil((o.deadline - G.S.clock) / 60)) + 'h left' : ''}</span>` : '';
    const btns = o.status === 'open'
      ? `<button class="btn sm primary" data-act="gigAccept" data-id="${o.id}">${o.cost ? 'Pay $' + fmt(o.cost) : 'Accept'}</button><button class="btn sm" data-act="gigDecline" data-id="${o.id}">No thanks</button>`
      : o.kind === 'brand' ? `<button class="btn sm primary" data-act="gigWrite" data-id="${o.id}">✍️ Write the post</button>` : '';
    return `<div class="gig"><div class="row between"><b>${esc(o.title)}</b>${st}</div><div class="muted small">${esc(o.text)}</div><div class="row wrap" style="gap:6px;margin-top:6px">${btns}</div></div>`;
  };
  Fame.card = function () {
    const S = G.S;
    if (!S) return '';
    const F = Fame.state();
    const open = Fame.open();
    const days = Math.max(1, (S.clock - (F.since != null ? F.since : S.clock)) / 1440);
    const wave = F.waves.reduce((a, w) => a + w.left, 0);
    const hist = F.hist.map((x) => x.f);
    return `<div class="card famecard"><h3>💼 Opportunities</h3>
      <div class="muted small">${S.player.followers >= 1000 ? `Creator payout: about $${fmt(S.player.followers * 0.0025 * (0.5 + clamp(Fame.engagement(S) * 5, 0, 1.5)))}/day · ` : 'Reach 1,000 followers to start earning a daily payout · '}living costs about ${fmt(Fame.upkeep())}/day · earned so far: ${fmt(F.earned)} · ${fmt(S.player.followers)} followers${wave >= 1 ? ` · 🔥 about +${fmt(wave)} still coming from a viral post` : ''}</div>
      ${open.length ? open.map(line).join('') : '<div class="muted small" style="margin:8px 0">No offers right now. Post things people love, go viral, and brands, collabs and appearances will come.</div>'}
      ${hist.length >= 3 && G.Charts ? `<div style="margin-top:8px">${G.Charts.line([{ name: 'Followers', data: hist }], { w: 320, h: 110, title: 'Followers by day' })}</div>` : ''}
      ${F.merch ? `<div class="muted small">🧢 Merch is selling: results in ${Math.max(0, Math.ceil((F.merch.due - S.clock) / 60))}h.</div>` : ''}</div>`;
  };
  Fame.strip = function () {
    if (!G.S || !enabled()) return '';
    const open = Fame.open();
    if (!open.length) return '';
    const top = open[0];
    return `<div class="card famestrip"><div class="row between"><div><b>💼 ${open.length} opportunit${open.length > 1 ? 'ies' : 'y'}</b><div class="muted small">${esc(top.title)}${open.length > 1 ? ' and more' : ''}</div></div><button class="btn sm primary" data-act="nav" data-page="shop">Review</button></div></div>`;
  };

  // the gift sheet shows prices for the person it is open for (a gift for somebody famous costs more)
  { const gm = UI.giftModal; if (gm) UI.giftModal = function (id) { E.giftTarget = id; return gm.apply(this, arguments); }; }

  A.gigAccept = async (d) => {
    try {
      let res;
      await E.guarded('💼 Taking the offer…', async () => { res = Fame.accept(d.id); return !!res; }, () => A.gigAccept(d));
      if (res) UI.toast(`💼 ${res.msg}`, 'good');
      UI.render();
    } catch (e) { UI.toast(e.message, 'bad'); }
  };
  A.gigDecline = (d) => { Fame.decline(d.id); UI.render(); };
  A.gigWrite = (d) => {
    const o = Fame.state().offers.find((x) => x.id === d.id);
    if (!o) return;
    UI.draft = UI.draft && UI.draft.trim() ? UI.draft : `okay I have to talk about ${o.brand} 👀 `;
    UI.go('home');
    UI.render();
    setTimeout(() => { const c = document.querySelector('#composer'); if (c) { c.focus(); } }, 60);
  };
})(window.G);
