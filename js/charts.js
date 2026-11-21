/* Small dependency-free SVG charts (line, bars, radar) that follow the app's light/dark colours, plus the daily history they draw.
   History: once per game day the world records the player's numbers and, for the characters who matter lately, how they feel about the
   player (affinity, romance, rivalry, mood). Stored compactly: n.hist = [[day, aff, rom, riv, mood], ...]. */
(function (G) {
  'use strict';
  const Ch = (G.Charts = {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COLORS = ['#0095f6', '#e1306c', '#f5a524', '#2ecc71', '#9b59b6'];
  const fmt = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + 'k' : String(Math.round(v * 10) / 10));

  // series: [{name, color?, data:[number,...]}] sharing the same x positions
  Ch.line = function (series, o = {}) {
    const W = o.w || 320;
    const H = o.h || 120;
    const pad = { l: 34, r: 8, t: 8, b: 16 };
    const all = [].concat(...series.map((s) => s.data)).filter((v) => isFinite(v));
    if (!all.length) return '';
    let lo = o.min != null ? o.min : Math.min(...all);
    let hi = o.max != null ? o.max : Math.max(...all);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const n = Math.max(...series.map((s) => s.data.length));
    const x = (i) => pad.l + (n < 2 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const grid = [0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${pad.l - 4}" y="${y(v) + 3}" class="ch-t" text-anchor="end">${fmt(v)}</text>`; }).join('');
    const lines = series.map((s, si) => {
      const c = s.color || COLORS[si % COLORS.length];
      const pts = s.data.map((v, i) => [x(i), y(v)]);
      const last = pts[pts.length - 1];
      return `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pts.length < 3 ? pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${c}"/>`).join('') : `<circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="${c}"/>`}`;
    }).join('');
    const legend = series.length > 1 || o.legend ? `<div class="ch-leg">${series.map((s, si) => `<span><i style="background:${s.color || COLORS[si % COLORS.length]}"></i>${esc(s.name)} <b>${fmt(s.data[s.data.length - 1])}</b></span>`).join('')}</div>` : '';
    const xl = o.labels ? `<text x="${pad.l}" y="${H - 3}" class="ch-t">${esc(o.labels[0])}</text><text x="${W - pad.r}" y="${H - 3}" class="ch-t" text-anchor="end">${esc(o.labels[1])}</text>` : '';
    return `<div class="ch"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'chart')}">${grid}${lines}${xl}</svg>${legend}</div>`;
  };

  // bars: [{label, v}]
  Ch.bars = function (items, o = {}) {
    const W = o.w || 320;
    const H = o.h || 90;
    if (!items.length) return '';
    const hi = Math.max(1, ...items.map((i) => i.v));
    const bw = (W - 8) / items.length;
    const c = o.color || COLORS[0];
    return `<div class="ch"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'bars')}">${items.map((it, i) => { const h = Math.max(1, (it.v / hi) * (H - 18)); return `<rect x="${4 + i * bw + 1}" y="${H - 14 - h}" width="${Math.max(1, bw - 3)}" height="${h}" rx="2" fill="${c}" opacity="${i === items.length - 1 ? 1 : 0.7}"><title>${esc(it.label)}: ${it.v}</title></rect>`; }).join('')}<text x="4" y="${H - 2}" class="ch-t">${esc(items[0].label)}</text><text x="${W - 4}" y="${H - 2}" class="ch-t" text-anchor="end">${esc(items[items.length - 1].label)} · max ${fmt(hi)}</text></svg></div>`;
  };

  // radar: [{k:'Openness', v:0..100}]
  Ch.radar = function (items, o = {}) {
    const S = o.size || 190;
    const c = S / 2;
    const R = S / 2 - 34;
    const n = items.length;
    const pt = (i, f) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * R * f, c + Math.sin(a) * R * f]; };
    const ring = (f) => `<polygon points="${items.map((_, i) => pt(i, f).join(',')).join(' ')}" class="ch-grid" fill="none"/>`;
    const shape = items.map((it, i) => pt(i, Math.max(0.04, Math.min(1, it.v / 100))).join(',')).join(' ');
    return `<div class="ch"><svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(o.title || 'personality')}">${[0.33, 0.66, 1].map(ring).join('')}${items.map((_, i) => `<line x1="${c}" y1="${c}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" class="ch-grid"/>`).join('')}<polygon points="${shape}" fill="${COLORS[0]}" fill-opacity=".25" stroke="${COLORS[0]}" stroke-width="2"/>${items.map((it, i) => { const [tx, ty] = pt(i, 1.28); return `<text x="${tx}" y="${ty + 3}" class="ch-t" text-anchor="middle">${esc(it.k)} ${Math.round(it.v)}</text>`; }).join('')}</svg></div>`;
  };

  /* ---------- history ---------- */
  const avgMood = () => {
    const ppl = Object.values(G.S.npcs).filter((n) => n.psy && n.psy.mood).slice(0, 200);
    return ppl.length ? Math.round((ppl.reduce((a, n) => a + n.psy.mood.v, 0) / ppl.length) * 100) : 0;
  };
  // called when a game day ends (world.js) with that day's activity counters
  Ch.sample = function (day) {
    const S = G.S;
    if (!S || !day || day.d == null) return;
    S.hist = (S.hist || []).filter((h) => h.d !== day.d).concat({ d: day.d, followers: S.player.followers, posts: day.posts || 0, comments: day.comments || 0, likes: day.likes || 0, dms: day.dms || 0, follows: day.follows || 0, events: day.events || 0, mood: avgMood() }).slice(-180);
    Object.values(S.npcs).filter((n) => !n.userAlt).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 250).forEach((n) => Ch.point(n, day.d));
  };
  Ch.point = function (n, d) {
    d = d != null ? d : G.U.dayOf(G.S.clock);
    const h = (n.hist = n.hist || []);
    const pd = n.psy && n.psy.day && n.psy.day.d === d ? n.psy.day : null; // what they did that day: comments, likes, messages, posts, stories
    const acts = pd ? (pd.comments || 0) + (pd.likes || 0) + (pd.dms || 0) + (pd.posts || 0) + (pd.stories || 0) : 0;
    const row = [d, Math.round(n.aff), Math.round(n.rom), Math.round(n.riv), Math.round(((n.psy && n.psy.mood && n.psy.mood.v) || 0) * 100), acts];
    if (h.length && h[h.length - 1][0] === d) h[h.length - 1] = row;
    else h.push(row);
    if (h.length > 45) h.shift();
  };

  const TRAITS = [['O', 'Openness'], ['C', 'Conscientious'], ['E', 'Extraverted'], ['A', 'Agreeable'], ['N', 'Neurotic']];
  // one character: personality shape + how they feel about the player over time
  Ch.npcCard = function (n) {
    const p = G.Persona.ensure(n);
    Ch.point(n); // today's point, so a trend exists as soon as you open the profile
    const h = n.hist;
    const trend = h.length >= 2
      ? Ch.line([{ name: 'Affinity', data: h.map((r) => r[1]), color: '#2ecc71' }, { name: 'Romance', data: h.map((r) => r[2]), color: '#e1306c' }, { name: 'Rivalry', data: h.map((r) => r[3]), color: '#f5a524' }, { name: 'Mood', data: h.map((r) => r[4]), color: '#9b59b6' }], { title: 'How they feel about you', labels: ['Day ' + h[0][0], 'Day ' + h[h.length - 1][0]] })
      : '<p class="muted small">Trends start drawing after the first full day.</p>';
    return `<div class="card chcard"><h4 class="sect">📊 Nature & trends</h4><div class="chrow">${Ch.radar(TRAITS.map(([k, l]) => ({ k: l.slice(0, 5) + '.', v: p.t[k] })), { title: 'Personality (Big Five)', size: 190 })}<div class="chtrend">${trend}</div></div><div class="muted small">${n.goal && n.goal.text ? '🎯 Wants to ' + esc(n.goal.text) + ' · ' : ''}${p.attach ? 'Attachment: ' + p.attach + ' · ' : ''}Mood now ${Math.round(((p.mood && p.mood.v) || 0) * 100)} · ${TRAITS.map(([k, l]) => l + ' ' + Math.round(p.t[k])).join(' · ')}</div></div>`;
  };

  // are the characters working? what each of the busiest people did over the last two weeks, and what looks wrong
  Ch.health = function () {
    const S = G.S;
    const ppl = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 14);
    return ppl.map((n) => {
      Ch.point(n);
      const h = (n.hist || []).slice(-14);
      const acts = h.map((r) => r[5] || 0);
      const total = acts.reduce((a, b) => a + b, 0);
      const recent = acts.slice(-3).reduce((a, b) => a + b, 0);
      let idle = 0;
      for (let i = acts.length - 1; i >= 0 && acts[i] === 0; i--) idle++;
      const mood = h.length ? h[h.length - 1][4] : 0;
      const flags = [];
      if (h.length >= 4 && total === 0) flags.push('silent for ' + h.length + ' days');
      else if (idle >= 5) flags.push('quiet for ' + idle + ' days');
      if (Math.abs(mood) >= 90) flags.push('mood stuck at the extreme');
      if (!(n.mem || []).length) flags.push('no memories yet');
      return { n, acts, total, recent, idle, mood, flags, mem: (n.mem || []).length };
    });
  };
  const spark = (acts) => {
    const hi = Math.max(1, ...acts);
    const bars = acts.map((v, i) => { const hh = Math.max(1, (v / hi) * 18); return `<rect x="${i * 5}" y="${19 - hh}" width="4" height="${hh}" rx="1" fill="${v ? '#0095f6' : '#8883'}"/>`; }).join('');
    return `<svg viewBox="0 0 ${Math.max(5, acts.length * 5)} 20" width="${Math.max(30, acts.length * 5)}" height="20" aria-label="activity per day">${bars}</svg>`;
  };
  Ch.healthCard = function () {
    const rows = Ch.health();
    if (!rows.length) return '';
    const active = rows.filter((r) => r.recent > 0).length;
    const bad = rows.filter((r) => r.flags.length);
    return `<div class="card chcard"><h4 class="sect">🩺 Are the characters working? <span class="muted small">· last 14 days</span></h4>
      <p class="small">${active} of ${rows.length} were active in the last 3 days${bad.length ? `, <b>${bad.length}</b> need a look` : ', nothing looks wrong'}.</p>
      <div class="hrows">${rows.map((r) => `<div class="hrow"><span class="hn" data-act="profile" data-id="${r.n.id}"><b>${esc(r.n.name)}</b> <span class="muted small">${esc(String(r.n.status).replace('_', ' '))}</span></span>${spark(r.acts)}<span class="muted small">${r.total} acts · mood ${r.mood} · ${r.mem} memories${r.n.goal && r.n.goal.text ? ' · 🎯' : ''}</span>${r.flags.length ? `<span class="hflag">⚠ ${esc(r.flags.join(', '))}</span>` : ''}</div>`).join('')}</div>
      <div class="small muted">Bars = what each person did that day (comments, likes, messages, posts). A person with no memories or a flat line is not reacting to the world.</div></div>`;
  };

  // the whole world: your followers, the day's activity, how everyone feels
  Ch.worldCard = function () {
    const S = G.S;
    const day = S.sim && S.sim.day ? S.sim.day : {};
    const h = (S.hist || []).concat({ d: day.d != null ? day.d : G.U.dayOf(S.clock), followers: S.player.followers, posts: day.posts || 0, comments: day.comments || 0, likes: day.likes || 0, dms: day.dms || 0, follows: day.follows || 0, events: day.events || 0, mood: avgMood() }).slice(-30);
    const L = (d) => 'Day ' + d;
    return `<div class="card chcard"><h4 class="sect">📈 World pulse <span class="muted small">· last ${h.length} day${h.length === 1 ? '' : 's'}</span></h4>
      <div class="small muted">Your followers</div>${Ch.line([{ name: 'Followers', data: h.map((r) => r.followers) }], { title: 'followers', labels: [L(h[0].d), L(h[h.length - 1].d)] })}
      <div class="small muted">Messages you received per day</div>${Ch.bars(h.map((r) => ({ label: L(r.d), v: r.dms })), { title: 'DMs per day', color: '#e1306c' })}
      <div class="small muted">Comments + likes per day</div>${Ch.bars(h.map((r) => ({ label: L(r.d), v: (r.comments || 0) + (r.likes || 0) })), { title: 'reactions per day', color: '#0095f6' })}
      <div class="small muted">Average mood of the cast (−100 … 100)</div>${Ch.line([{ name: 'Mood', data: h.map((r) => r.mood), color: '#9b59b6' }], { title: 'mood', min: -100, max: 100 })}</div>`;
  };
})(window.G);
