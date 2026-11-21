/* Clout — REPUTATION AND PR: four standings (Fans, Friends, Press, Town; 0..100, 50 = neutral) that follow how you behave.
   Derived from heat, your judged posts, hostile posts (yours, and hostile replies under them) and rumours about you, all through fields that already exist.
   A standing changes: which offers appear (Fame.make), how fast strangers arrive (Leads.EVERY), who follows or unfollows you (Bonds.followDecision) and what the channels say.
   You can lay low (heat falls faster, standings drift back to neutral) or draft a public apology (it goes through the Suggestions approval queue, nothing is posted until you approve).
   Free and offline. Nothing is saved until the first real change: S.rep and S.repLog do not exist in a world that never had one (reads use the frozen EMPTY). */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const esc = U.esc;
  const Rep = (G.Rep = { KEYS: ['fans', 'friends', 'press', 'town'], LAB: { fans: 'Fans', friends: 'Friends', press: 'Press', town: 'Town' }, LAY: 2880, APOLOGY_GAP: 4320 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const rand = () => (G.World && G.World.rnd ? G.World.rnd() : Math.random());
  const first = (s) => String(s || '').split(' ')[0];
  const enabled = () => !!G.S && G.settings.reputation !== false;
  const EMPTY = Object.freeze({ fans: 50, friends: 50, press: 50, town: 50 });
  Rep.state = () => (G.S && G.S.rep) || EMPTY; // reading never creates the key
  Rep.ensure = () => {
    const S = G.S;
    if (!S.rep) S.rep = { fans: 50, friends: 50, press: 50, town: 50, h: Math.floor(S.clock / 60) };
    if (!S.repLog) S.repLog = [];
    return S.rep;
  };
  Rep.layingLow = () => !!G.S && !!G.S.rep && G.S.rep.lay > G.S.clock;

  const SAY = {
    press: { down: ['{P} has been in the news for the wrong reasons lately', 'the press is not being kind to {P} this week'], up: ['{P} is getting really good press right now', 'every headline about {P} this week has been a good one'] },
    town: { down: ['people around town are getting tired of the drama around {P}', 'the town is losing patience with {P}'], up: ['the whole town seems to like {P} right now', 'people around here have good things to say about {P}'] },
    fans: { down: ['the fans have gone quiet. {P} has not given them much lately', 'some of the fan crowd is drifting away from {P}'], up: ['the fans are really behind {P} right now', 'the fan crowd is loud for {P} this week'] },
    friends: { down: ['{P} has been a bit distant with the people who know them best', 'the close circle feels like {P} has been pulling away'], up: ['everyone close to {P} is saying how good they have been to them', 'the close circle is in a good place with {P}'] },
  };
  const CHAN = { press: 'news', town: 'town-talk', fans: 'fans', friends: 'town-talk' };

  // one calm line in the right channel when a standing crosses 30 (down) or 70 (up); at most one per game day
  Rep.chatter = function (key, dir) {
    const S = G.S;
    const R = S.rep;
    if (!R || !G.Channels || !G.Channels.push || G.settings.channels === false || (G.World && G.World.feedRate && G.World.feedRate() === 0)) return null; // (a silent cast keeps the channels silent)
    if (R.chT != null && S.clock - R.chT < 1440) return null;
    try {
      const chan = G.Channels.ensure().find((c) => c.id === CHAN[key]);
      const cast = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted && (n.age == null || n.age >= 18)).sort((a, b) => (b.touched || 0) - (a.touched || 0) || (a.id < b.id ? -1 : 1));
      if (!chan || !cast.length) return null;
      const l = SAY[key][dir];
      const text = l[Math.floor(rand() * l.length) % l.length].replace('{P}', first(S.player.name));
      R.chT = S.clock;
      return G.Channels.push(chan, cast[0].id, text, { about: ['me'] });
    } catch (e) { return null; }
  };

  // change standings. d = { press: -9, ... }; the biggest mover goes into the short log (last 10)
  Rep.nudge = function (d, why) {
    const S = G.S;
    if (!S || !Object.keys(d || {}).some((k) => Rep.KEYS.includes(k) && d[k])) return null;
    const R = Rep.ensure();
    const done = {};
    let tot = 0;
    Rep.KEYS.forEach((k) => {
      if (!d[k]) return;
      const was = R[k];
      R[k] = r2(clamp(was + d[k], 0, 100));
      const real = r2(R[k] - was);
      if (!real) return;
      done[k] = real;
      tot += Math.abs(real);
      if (was >= 30 && R[k] < 30) Rep.chatter(k, 'down');
      else if (was < 70 && R[k] >= 70) Rep.chatter(k, 'up');
    });
    if (tot >= 2) {
      S.repLog.push({ t: S.clock, why: String(why || '').slice(0, 80), d: done });
      if (S.repLog.length > 10) S.repLog.splice(0, S.repLog.length - 10);
    }
    return done;
  };

  /* ---------- what happened lately (read through existing fields only) ---------- */
  Rep.scan = function () {
    const S = G.S;
    const d = { fans: 0, friends: 0, press: 0, town: 0 };
    const why = [];
    const add = (o, w) => { Rep.KEYS.forEach((k) => { d[k] += o[k] || 0; }); if (w && !why.includes(w)) why.push(w); };
    S.postOrder.slice(-150).forEach((id) => {
      const p = S.posts[id];
      if (!p || p.repd || S.clock - p.t > 4320) return;
      if (p.author === 'me' && !p.replyTo && p.judge && !p.pending) {
        const j = p.judge;
        const q = j.q || 5, v = j.v || 0, s = j.s || 0, c = j.c || 0;
        const hostile = c >= 8 || s <= -6 || (!!G.Lex && G.Lex.intent(p.text) === 'insult');
        const o = { fans: 0, friends: 0, press: 0, town: 0 };
        let w = '';
        if (hostile) { Object.assign(o, { press: -9, town: -5, fans: -3, friends: -2 }); w = 'a hostile post'; }
        else {
          if (c >= 5) { o.press -= (c - 4); o.town -= (c - 4) * 0.4; w = 'a controversial post'; }
          if (s <= -3) o.town += s * 0.3;
          if (q >= 7) { o.fans += (q - 6) * 0.7; o.press += (q - 6) * 0.4; w = w || 'a well-liked post'; }
          if (s >= 3 && q >= 6) { o.town += 1; o.friends += 0.5; }
          if (v >= 8) { o.fans += 3; o.press += 2; w = 'a post that took off'; }
        }
        if (Rep.KEYS.some((k) => o[k])) { p.repd = 1; add(o, w); }
      } else if (p.replyTo && p.author !== 'me' && p.author !== 'crowd' && (p.stance === 'hostile' || p.stance === 'shade')) {
        const par = S.posts[p.replyTo];
        if (par && par.author === 'me') { p.repd = 1; add({ town: -0.5 }, 'people turning on you'); }
      }
    });
    (S.rumors || []).slice(-8).forEach((r) => {
      if (!r || r.repd || r.about !== 'me') return;
      const spread = Object.keys(r.belief || {}).length;
      if (spread < 3) return;
      let neg = false;
      try { neg = G.Lex.analyze(String(r.text)).sent.compound < -0.15; } catch (e) {}
      if (!neg) return;
      r.repd = 1;
      add({ press: -Math.min(6, 2 + spread / 3), town: -Math.min(4, 1 + spread / 4) }, 'a rumour about you');
    });
    if (!Rep.KEYS.some((k) => d[k])) return null;
    return Rep.nudge(d, why.join(', '));
  };

  /* ---------- one game hour, one game day ---------- */
  const recover = (R, step) => Rep.KEYS.forEach((k) => { if (R[k] !== 50) R[k] = r2(R[k] + clamp(50 - R[k], -step, step)); });
  Rep.day = function () {
    const S = G.S;
    const P = S.player;
    const pal = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && ['friend', 'close_friend', 'best_friend', 'partner', 'dating', 'ally'].includes(n.status));
    const out = { fans: 0, friends: 0 };
    if (pal.length) {
      const avg = pal.reduce((a, n) => a + (n.aff || 0), 0) / pal.length;
      out.friends = clamp((50 + avg * 0.5 - Rep.state().friends) * 0.08, -1.5, 1.5);
    }
    const au = P.audience || { love: 40, hate: 8 };
    out.fans = clamp((50 + (au.love - 40) * 0.8 - (au.hate - 8) * 0.6 - Rep.state().fans) * 0.08, -1.5, 1.5);
    if (Math.abs(out.fans) < 0.05) out.fans = 0;
    if (Math.abs(out.friends) < 0.05) out.friends = 0;
    if (out.fans || out.friends) Rep.nudge(out, '');
  };
  Rep.hour = function (t, h) {
    const S = G.S;
    const P = S.player;
    const R = S.rep;
    const lay = !!R && R.lay > t;
    if (lay) {
      if (P.heat > 0) P.heat = clamp(P.heat - 4, 0, 100);
      recover(R, 0.6);
      Rep.nudge({ fans: -0.1 }, '');
    } else if (R) {
      recover(R, 0.12);
      if (P.heat >= 70) Rep.nudge({ town: -0.15, press: -0.1 }, 'a lot of heat');
    } else if (P.heat >= 70) Rep.nudge({ town: -0.15, press: -0.1 }, 'a lot of heat');
    if (S.rep && S.rep.lay && S.rep.lay <= t) delete S.rep.lay;
    if (S.rep && h % 24 === 0) Rep.day();
  };
  Rep.advance = function (from) {
    const S = G.S;
    if (!S || !enabled()) return;
    const now = Math.floor(S.clock / 60);
    let h = S.rep && S.rep.h != null ? S.rep.h : Math.floor(from / 60);
    if (now - h > 72) h = now - 72;
    if (now <= h) return;
    Rep.scan();
    while (h < now) { h++; Rep.hour(h * 60, h); }
    if (S.rep) S.rep.h = h;
  };
  { const tick0 = E.tick; E.tick = function () { const t0 = G.S ? G.S.clock : 0; const r = tick0.apply(this, arguments); try { Rep.advance(t0); } catch (e) { if (window.console) console.warn('rep', e); } return r; }; }

  /* ---------- what a standing changes ---------- */
  // offers: a bad name closes doors
  Rep.allows = function (kind) {
    const s = Rep.state();
    switch (kind) {
      case 'brand': return s.press >= 35 && s.town >= 30;
      case 'interview': return s.press >= 30;
      case 'appearance': return s.town >= 35 && s.fans >= 30;
      case 'collab': return s.friends >= 25;
      case 'merch': return s.fans >= 25 && s.town >= 20;
      default: return true;
    }
  };
  if (G.Fame && G.Fame.make) {
    const make0 = G.Fame.make;
    G.Fame.make = function (kind) { if (enabled() && !Rep.allows(kind)) return null; return make0.apply(this, arguments); };
  }
  // strangers: a bad name slows them down, a good one speeds them up
  if (G.Leads && G.Leads.tick) {
    const tick1 = G.Leads.tick;
    const base = G.Leads.EVERY;
    G.Leads.tick = function () {
      const s = Rep.state();
      const bad = s.town < 25 || s.press < 20;
      const good = s.fans >= 70 || s.town >= 70;
      G.Leads.EVERY = enabled() ? Math.round(base * (bad ? 2.5 : good ? 0.6 : 1)) : base;
      try { return tick1.apply(this, arguments); } finally { G.Leads.EVERY = base; }
    };
  }
  // follows: fans follow a loved name, the lukewarm leave a shamed one (only once a standing exists; hostile or close people are untouched)
  if (G.Bonds && G.Bonds.followDecision) {
    const fd0 = G.Bonds.followDecision;
    G.Bonds.followDecision = function (S, npc, targetId, rnd) {
      const res = fd0.apply(this, arguments);
      S = S || G.S;
      if (targetId !== 'me' || !enabled() || !S.rep) return res;
      const R = S.rep;
      const r = rnd || rand;
      let rel = { c: 0.1, h: 0, fam: 0 };
      try { rel = G.React.relation(S, npc, 'me'); } catch (e) {}
      const has = (G.Persona.ensure(npc).following || []).includes('me');
      if (res === 'follow' && R.fans < 30 && r() < 0.5) return 'keep';
      if (res === 'keep' && !has && R.fans >= 70 && rel.h < 0.2 && r() < 0.1) return 'follow';
      if (res === 'keep' && has && (R.town < 25 || R.press < 20) && rel.c < 0.3 && (rel.fam || 0) < 0.3 && r() < 0.06) return 'unfollow';
      return res;
    };
  }

  /* ---------- lay low ---------- */
  Rep.layLow = function () {
    const S = G.S;
    if (Rep.layingLow()) throw Object.assign(new Error('You are already laying low.'), { user: true });
    const R = Rep.ensure();
    R.lay = S.clock + Rep.LAY;
    S.repLog.push({ t: S.clock, why: 'you decided to lay low', d: {} });
    if (S.repLog.length > 10) S.repLog.shift();
    return R;
  };

  /* ---------- a public apology (goes through the Suggestions approval queue) ---------- */
  Rep.canApologize = function () {
    const S = G.S;
    const s = Rep.state();
    if ((S.pitches || []).some((p) => p.kind === 'apology')) return { ok: false, why: 'An apology is already waiting for your approval.' };
    if (S.rep && S.rep.apT != null && S.clock - S.rep.apT < Rep.APOLOGY_GAP) return { ok: false, why: 'You apologised recently. Give it time.' };
    if (Math.min(s.press, s.town) >= 45 && S.player.heat < 40) return { ok: false, why: 'There is nothing to apologise for right now.' };
    return { ok: true };
  };
  const APOLOGY = [
    'I owe people an apology. I got it wrong and I am sorry. I am going to do better.',
    'I have been thinking about what I posted. It was not okay and I am sorry to anyone it hurt.',
    'Taking responsibility: I let my temper write that. I am sorry and I will be more careful.',
  ];
  Rep.draftApology = function () {
    const S = G.S;
    const c = Rep.canApologize();
    if (!c.ok) throw Object.assign(new Error(c.why), { user: true });
    const text = APOLOGY[Math.floor(rand() * APOLOGY.length) % APOLOGY.length];
    const item = { id: 'ptap' + S.clock, kind: 'apology', npc: 'me', text, why: 'to clear the air', label: `Public apology from you: “${text}”`, t: S.clock };
    (S.pitches || (S.pitches = [])).push(item);
    return item;
  };
  Rep.applyApology = function (p) {
    const S = G.S;
    const s = Rep.state();
    const need = clamp((50 - Math.min(s.press, s.town)) / 50, 0.3, 1);
    const post = E.addPost({ author: 'me', text: p.text, buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } }, S);
    post.repd = 1;
    S.player.heat = clamp(S.player.heat - 15, 0, 100);
    if (S.player.audience) S.player.audience.hate = clamp(S.player.audience.hate - 2, 2, 95);
    Rep.nudge({ press: 10 * need, town: 8 * need, friends: 4, fans: -1 }, 'your public apology');
    Rep.ensure().apT = S.clock;
    try { E.addChron(`${S.player.name} posted a public apology`); } catch (e) {}
    return true;
  };
  if (G.Pitches && G.Pitches.apply) {
    const apply0 = G.Pitches.apply;
    G.Pitches.apply = function (p) { return p && p.kind === 'apology' ? Rep.applyApology(p) : apply0.apply(this, arguments); };
  }

  /* ---------- the card on the Profile page ---------- */
  const NOTE = { fans: 'people who follow your work', friends: 'the people who know you', press: 'what the news says', town: 'what the neighbourhood thinks' };
  Rep.card = function () {
    const S = G.S;
    if (!S || !enabled()) return '';
    const R = Rep.state();
    const lay = Rep.layingLow();
    const last = (S.repLog || []).slice(-1)[0];
    const ap = Rep.canApologize();
    const btns = lay
      ? `<span class="chip blue">Laying low · ${Math.max(0, Math.ceil((R.lay - S.clock) / 60))}h left</span>`
      : `<button class="btn sm" data-act="repLayLow">Lay low for two days</button>`;
    return `<div class="card repcard"><h3>Reputation</h3>
      <div class="grid2">${Rep.KEYS.map((k) => UI.bar(Rep.LAB[k], R[k], 100, 'blue')).join('')}</div>
      <div class="muted small" style="margin-top:6px">Fans: ${NOTE.fans}. Friends: ${NOTE.friends}. Press: ${NOTE.press}. Town: ${NOTE.town}. A low standing closes doors: fewer offers, fewer new people, and followers who drift away.</div>
      ${last ? `<div class="small" style="margin-top:6px">Latest: ${esc(last.why || 'a change')}</div>` : ''}
      <div class="row wrap" style="gap:6px;margin-top:8px">${btns}${ap.ok ? '<button class="btn sm primary" data-act="repApology">Draft a public apology</button>' : ''}</div>
      ${G.Seasons ? G.Seasons.prompt() : ''}</div>`;
  };

  A.repLayLow = async () => {
    try {
      await E.guarded('Laying low…', async () => { Rep.layLow(); return true; }, () => A.repLayLow());
      UI.toast('You are laying low for two days. Heat falls faster and your standing recovers.', 'good');
    } catch (e) { UI.toast(e.message, 'bad'); }
  };
  A.repApology = async () => {
    try {
      Rep.draftApology();
      UI.render();
      await G.Pitches.review();
    } catch (e) { UI.toast(e.message, 'bad'); }
  };
})(window.G);
