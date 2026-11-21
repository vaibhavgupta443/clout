/* Clout — AROUND TOWN: one quiet place for what the town is talking about, split into communities.
   It is the second tab of Explore (Explore | Around town). A row of communities (Town talk, Love lives, Theories, The drama, Fans, News and any case threads),
   then one calm list: what is happening (hot storylines and recent events), the rumours going round, and what people are saying in the community you picked.
   You can answer in the community from the box at the bottom. Nothing here is a card or a button wall: rows, hairlines, one input. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const A = UI.acts;
  const P = G.Pages;
  const esc = U.esc;
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const Around = (G.Around = {});
  const pretty = (c) => String(c.name || c.id).replace(/^case-/, 'Case: ').replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase());

  Around.items = function () {
    const S = G.S;
    const hot = (S.storylines || []).filter((x) => x.status !== 'resolved').sort((a, b) => (b.heat || 0) - (a.heat || 0)).slice(0, 3).map((x) => ({ t: x.updated || S.clock, kind: 'Storyline', text: x.title, heat: x.heat || 0 }));
    const ev = (S.chronicle || []).slice(-4).reverse().map((c) => ({ t: c.t, kind: 'Event', text: c.text }));
    const ru = (S.rumors || []).slice(-2).reverse().map((r) => ({ t: r.t, kind: 'Rumour', text: r.text, spread: Object.keys(r.belief || {}).length }));
    return { hot, ev, ru };
  };

  Around.msgRow = function (m, chan) {
    const S = G.S;
    const n = S.npcs[m.from];
    const nm = m.from === 'me' ? S.player.name : n ? n.name : 'someone';
    return `<div class="arow"><div class="aav">${n ? UI.avatar(n, 30) : `<div class="avatar" style="width:30px;height:30px">${esc(nm.slice(0, 1))}</div>`}</div><div class="grow"><div class="ameta"><b ${n ? `data-act="profile" data-id="${n.id}"` : ''}>${esc(nm)}</b><span class="muted small">${chan ? esc(pretty(chan)) + ' · ' : ''}${U.ago(S.clock, m.t)}</span></div><div class="atext">${esc(m.text)}</div>${G.Refs && m.from !== 'me' ? G.Refs.card(G.Refs.forMsg(m)) : ''}</div></div>`;
  };

  P.around = function () {
    const S = G.S;
    const Ch = G.Channels;
    if (!Ch) return '<div class="empty">Around town is not available.</div>';
    const chans = Ch.ensure();
    const cur = UI.comm && chans.some((c) => c.id === UI.comm) ? UI.comm : 'all';
    const list = cur === 'all' ? chans.flatMap((c) => c.msgs.map((m) => ({ m, c }))) : (chans.find((c) => c.id === cur).msgs || []).map((m) => ({ m, c: chans.find((x) => x.id === cur) }));
    list.sort((a, b) => b.m.t - a.m.t);
    chans.forEach((c) => { if (cur === c.id) c.unread = 0; });
    const it = Around.items();
    const n = G.Pitches ? G.Pitches.queue().length : 0;
    const section = (title, body) => (body ? `<h4 class="sect">${title}</h4>${body}` : '');
    const happening = cur === 'all'
      ? section('Happening', it.hot.map((x) => `<div class="arow quiet"><div class="grow"><div class="atext">${esc(clip(x.text, 90))}</div><div class="abar"><i style="width:${Math.min(100, x.heat)}%"></i></div></div></div>`).join('') + it.ev.map((x) => `<div class="arow quiet"><div class="grow"><div class="atext">${esc(clip(x.text, 110))}</div><div class="muted small">${U.ago(S.clock, x.t)}</div></div></div>`).join(''))
      : '';
    const rumours = cur === 'all' || cur === 'the-drama' || cur === 'theories' ? section('Rumours', it.ru.map((x) => `<div class="arow quiet"><div class="grow"><div class="atext">${esc(clip(x.text, 110))}</div><div class="muted small">${x.spread} ${x.spread === 1 ? 'person has' : 'people have'} heard it</div></div></div>`).join('')) : '';
    return `<div class="seg"><button data-act="exTab" data-t="explore">Explore</button><button class="on" data-act="exTab" data-t="around">Around town</button></div>
      <div class="comms">${[['all', 'All']].concat(chans.map((c) => [c.id, pretty(c)])).map(([id, label]) => `<button class="comm ${cur === id ? 'on' : ''}" data-act="comm" data-id="${esc(id)}">${esc(label)}${id !== 'all' && (chans.find((c) => c.id === id) || {}).unread ? ' <i>' + chans.find((c) => c.id === id).unread + '</i>' : ''}</button>`).join('')}</div>
      ${n ? `<button class="arow quiet linkrow" data-act="pitchOpen"><div class="grow"><b>${n} suggestion${n === 1 ? '' : 's'} waiting</b><div class="muted small">Posts, stories and replies for you to approve</div></div><i>›</i></button>` : ''}
      ${happening}${rumours}
      ${section(cur === 'all' ? 'What people are saying' : esc(pretty(chans.find((c) => c.id === cur))), list.slice(0, 30).map(({ m, c }) => Around.msgRow(m, cur === 'all' ? c : null)).join('') || '<div class="empty small">Quiet for now. Say something.</div>')}
      <div class="asend"><input id="ar_text" maxlength="300" placeholder="${cur === 'all' ? 'Say something to the town' : 'Say something in ' + esc(pretty(chans.find((c) => c.id === cur)))}"><button class="btn primary" data-act="arSend">Send</button></div>`;
  };
  // one quiet row on Alerts when suggestions are waiting (the full list is behind it)
  P.sugRow = function () {
    const n = G.Pitches ? G.Pitches.queue().length : 0;
    return (n ? '<button class="arow quiet linkrow" data-act="pitchOpen"><div class="grow"><b>' + n + ' suggestion' + (n === 1 ? '' : 's') + ' waiting</b><div class="muted small">Posts, stories and replies for you to approve</div></div><i>›</i></button>' : '') + (P.linkRow ? P.linkRow() : '');
  };
  A.exTab = (d) => { UI.exTab = d.t === 'around' ? 'around' : 'explore'; UI.render(); window.scrollTo(0, 0); };
  A.comm = (d) => { UI.comm = d.id; UI.render(); };
  A.arSend = () => {
    const el = document.querySelector('#ar_text');
    const text = el ? el.value.trim() : '';
    if (!text) return UI.toast('Write something first.', 'info');
    try {
      const Ch = G.Channels;
      const id = UI.comm && UI.comm !== 'all' ? UI.comm : 'town-talk';
      Ch.send(id, text);
      if (el) el.value = '';
      UI.render();
    } catch (e) { UI.toast(e.message, 'bad'); }
  };

  // Explore gets its second tab
  const ex0 = P.explore;
  P.explore = function () {
    const seg = (on) => `<div class="seg"><button class="${on === 'explore' ? 'on' : ''}" data-act="exTab" data-t="explore">Explore</button><button class="${on === 'around' ? 'on' : ''}" data-act="exTab" data-t="around">Around town</button></div>`;
    if (UI.exTab === 'around') return P.around();
    return seg('explore') + ex0.apply(this, arguments);
  };
  // the small "more" menus (.manage) close when you tap anything else, or pick an item in them
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.manage[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('.mpop button')) d.removeAttribute('open'); });
  });
})(window.G);
