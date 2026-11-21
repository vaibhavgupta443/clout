/* Clout — what is trending, and why.
   Trends are worked out from what is REALLY going on (hashtags people use, storylines, rumours, events, the pending event), merged with any the AI added,
   refreshed as the game clock moves. Tapping one opens a page: how hot it is, why, who is talking, the posts and channel messages about it, and what you
   can do (ask the Director, make it bigger, mute it). Free: no AI call. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const P = G.Pages;
  const A = UI.acts;
  const { esc } = U;
  const Trends = (G.Trends = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const STOP = new Set('the and for that with this have from they them then than were was are you your not but all can had her his him she out one our has its who what when where how why will would could should there their about into just like after before again very more most some such only over still too any off own same other which while said says'.split(' '));
  const META = (c) => !!c && (c.meta === true || c.kind === 'meta' || /(^|\W)(Player|You) reached level|reached \d+K/i.test(String(c.text || ''))); // game-meta lines are not story
  const camel = (s) => '#' + String(s || '').replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase())).slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const words = (tag) => String(tag).replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

  // works out the list from the world as it is now
  Trends.compute = function () {
    const S = G.S;
    const out = new Map();
    const muted = new Set(S.mutedTrends || []);
    const add = (tag, heat, why, src) => {
      if (!tag || tag.length < 4 || tag.length > 34) return;
      if (G.Mind && G.Mind.read(String(tag) + ' ' + String(why || '')).sens >= 0.5) return; // a grief, a diagnosis or a crisis is never turned into a trending topic
      const k = tag.toLowerCase();
      if (muted.has(k)) return;
      const cur = out.get(k);
      if (!cur || heat > cur.heat) out.set(k, { tag, heat: Math.round(Math.max(1, Math.min(100, heat))), why: why || '', src: src || '' });
    };
    const recent = S.postOrder.slice(-150).map((id) => S.posts[id]).filter((p) => p && S.clock - p.t < 4320);
    const tags = new Map();
    recent.forEach((p) => (String(p.text).match(/#[A-Za-z0-9_]{3,30}/g) || []).forEach((t) => {
      const e = tags.get(t.toLowerCase()) || { tag: t, heat: 0, n: 0 };
      e.n++;
      e.heat += 14 + ((p.stats && p.stats.likes) || 0) / 20 + ((p.stats && p.stats.replies) || 0) * 3;
      tags.set(t.toLowerCase(), e);
    }));
    tags.forEach((e) => add(e.tag, e.heat, `${e.n} post${e.n > 1 ? 's' : ''} use it`, 'posts'));
    S.storylines.filter((s) => s.status !== 'resolved').forEach((s) => add(camel(s.title), 30 + (s.heat || 0) * 0.6, 'Storyline: ' + s.title, 'plot'));
    (S.rumors || []).filter((r) => !META(r)).slice(-4).forEach((r) => add(camel(r.text), 45, 'Rumour: ' + clip(r.text, 80), 'rumor'));
    (S.chronicle || []).filter((c) => !META(c)).slice(-5).forEach((c, i) => add(camel(c.text), 42 - i * 5, clip(c.text, 100), 'event'));
    (S.events || []).filter((e) => !e.resolved).forEach((e) => add(camel(e.title), 72, 'Event: ' + e.title, 'event'));
    // what the AI added earlier cools off a little each time
    (S.trending || []).forEach((t) => { if (!muted.has(String(t.tag).toLowerCase())) add(t.tag, (t.heat || 0) * 0.9, t.why || 'Trending in the world', t.src || 'ai'); });
    return [...out.values()].filter((t) => t.heat > 8).sort((a, b) => b.heat - a.heat).slice(0, 8);
  };
  // only touches the save when something actually changed
  Trends.refresh = function () {
    const S = G.S;
    if (!S) return false;
    const next = Trends.compute();
    const sig = (l) => l.map((t) => t.tag + ':' + t.heat).join('|');
    if (sig(next) === sig(S.trending || [])) return false;
    S.trending = next;
    G.Store.saveSoon();
    return true;
  };
  if (E && E.tick) {
    const tick0 = E.tick;
    E.tick = function () {
      const r = tick0.apply(this, arguments);
      try {
        const S = G.S;
        if (S && (S.trendT == null || S.clock - S.trendT >= 60)) {
          S.trendT = S.clock;
          Trends.refresh();
        }
      } catch (e) {}
      return r;
    };
  }

  // everything the world has about one trend
  Trends.detail = function (tag) {
    const S = G.S;
    const k = String(tag).toLowerCase();
    const w = words(tag);
    const t = (S.trending || []).find((x) => x.tag.toLowerCase() === k) || { tag, heat: 0, why: '' };
    const hit = (txt) => { const x = String(txt || '').toLowerCase(); return x.includes(k) || (w.length && w.filter((y) => x.includes(y)).length >= Math.min(2, w.length)); };
    const posts = S.postOrder.map((id) => S.posts[id]).filter((p) => p && !p.replyTo && hit(p.text)).slice(-15).reverse();
    const who = new Map();
    S.postOrder.map((id) => S.posts[id]).filter((p) => p && hit(p.text)).forEach((p) => who.set(p.author, (who.get(p.author) || 0) + 1));
    const people = [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ id, n, name: id === 'me' ? S.player.name : (S.npcs[id] || {}).name || '' })).filter((x) => x.name);
    const chat = [];
    (S.channels || []).forEach((c) => c.msgs.slice(-40).forEach((m) => { if (hit(m.text)) chat.push({ chan: c.name, who: m.from === 'me' ? S.player.name : (S.npcs[m.from] || {}).name || 'someone', text: m.text, t: m.t }); }));
    const plot = S.storylines.filter((s) => s.status !== 'resolved' && hit(s.title + ' ' + s.summary)).slice(0, 2);
    const events = (S.chronicle || []).filter((c) => !META(c) && hit(c.text)).slice(-4).reverse();
    return { t, posts, people, chat: chat.slice(-6).reverse(), plot, events };
  };

  P.trend = function () {
    const S = G.S;
    const tag = UI.trend || '';
    const d = Trends.detail(tag);
    const heat = d.t.heat || 0;
    return `<div class="card"><div class="row between"><button class="btn sm" data-act="nav" data-page="explore">← Back</button><span class="muted small">${heat ? '🔥 heat ' + heat + '/100' : 'not trending right now'}</span></div>
      <h2 style="margin:6px 0">${esc(tag)}</h2>
      <div class="bar"><i style="width:${Math.max(3, heat)}%;background:linear-gradient(90deg,#f5a524,#e1306c)"></i></div>
      <p class="small" style="margin-top:8px">${d.t.why ? '<b>Why:</b> ' + esc(d.t.why) : 'Nothing in the story points at this yet.'}</p>
      ${d.plot.length ? `<p class="small">📖 Storyline: ${d.plot.map((s) => '<b>' + esc(s.title) + '</b>: ' + esc(clip(s.summary, 120))).join(' · ')}</p>` : ''}
      ${d.events.length ? `<p class="small">🕘 ${d.events.map((c) => esc(clip(c.text, 110))).join(' · ')}</p>` : ''}
      ${d.people.length ? `<div class="row wrap small" style="gap:6px">👥 ${d.people.map((p) => `<button class="pill" ${p.id === 'me' ? '' : `data-act="profile" data-id="${p.id}"`}>${esc(p.name)} · ${p.n}</button>`).join('')}</div>` : ''}
      <div class="row wrap" style="margin-top:10px;gap:6px"><button class="btn sm primary" data-act="trendAsk" data-tag="${esc(tag)}">🎬 Ask the Director what is going on</button><button class="btn sm" data-act="trendBoost" data-tag="${esc(tag)}">🔥 Make it bigger</button><button class="btn sm" data-act="trendMute" data-tag="${esc(tag)}">🙅 Mute this trend</button></div></div>
      ${d.chat.length ? `<div class="card"><h4 class="sect">📣 In the channels</h4>${d.chat.map((m) => `<div class="small" style="margin:4px 0"><b>#${esc(m.chan)}</b> · ${esc(m.who)}: ${esc(m.text)}</div>`).join('')}</div>` : ''}
      <h4 class="sect">Posts</h4>${d.posts.map((p) => UI.postHTML(p, { preview: true })).join('') || '<div class="empty">No posts about this yet. Press “Make it bigger” to have the Director start the conversation.</div>'}`;
  };
  A.trendMute = (d) => {
    const S = G.S;
    S.mutedTrends = (S.mutedTrends || []).concat(String(d.tag).toLowerCase());
    S.trending = (S.trending || []).filter((t) => t.tag.toLowerCase() !== String(d.tag).toLowerCase());
    G.Store.saveSoon();
    UI.toast('🙅 ' + d.tag + ' muted', 'info');
    UI.go('explore');
  };
})(window.G);
