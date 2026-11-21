/* Clout — Town (population browser + swipe) and the scenario generator card */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const P = G.Pages;
  const esc = U.esc;

  Object.assign(UI, { townTab: 'browse', townPage: 0, townQ: '', cand: null, scenCat: 'any', scenRoll: null });

  /* ---------- scenario generator (Director page) ---------- */

  P.scenarioCard = function () {
    const cats = G.Scen.CATS;
    const cnt = G.Scen.count(UI.scenCat);
    const r = UI.scenRoll;
    return `<h4 class="sect">🎲 Random scenario generator</h4>
      <div class="card"><div class="small muted">${U.fmt(cnt)} distinct scenarios in this category — and each one can involve any of your characters or anyone in town.</div>
        <div class="tones" style="margin-top:8px">${cats.map((c) => `<button class="pill ${UI.scenCat === c.k ? 'on' : ''}" data-act="scenCat" data-k="${c.k}">${c.icon} ${esc(c.label)}</button>`).join('')}</div>
        ${r ? `<div class="sumbox" style="margin:8px 0">${esc(r.text)}</div>` : ''}
        <div class="row between"><button class="btn" data-act="scenRoll">🎲 ${r ? 'Re-roll' : 'Roll a scenario'}</button><button class="btn primary" data-act="scenGo" ${r ? '' : 'disabled'}>▶ Make it happen</button></div></div>`;
  };

  /* ---------- town ---------- */

  const popCard = (p) => {
    const S = G.S;
    const met = S.popMet && S.popMet[p.idx] && S.npcs[S.popMet[p.idx]];
    return `<div class="relcard popcard" data-act="popProfile" data-i="${p.idx}">
      <div class="row"><div class="avatar" style="width:44px;height:44px;font-size:18px;background:${U.gradient(p.handle)}">${esc(p.name.charAt(0))}</div>
        <div class="grow"><b>${esc(p.name)}</b> <span class="muted small">${p.age}</span><div class="muted small">${esc(p.handle)} · ${U.fmt(p.followers)} followers</div></div>
        ${met ? '<span class="chip green">met</span>' : ''}</div>
      <div class="small" style="margin-top:6px">${esc(p.bio)}</div><div class="muted small">${esc(p.vibes.join(' · '))}</div></div>`;
  };
  P.popCard = popCard;

  P.town = function () {
    const S = G.S;
    const size = G.Pop.size();
    const met = Object.keys(S.popMet || {}).length;
    const head = `<div class="card"><div class="row between"><div><div class="muted small">🌆 Everyone in town</div><div class="bigstat">${size ? U.fmt(size) : 'Off'} <span class="muted small">people · ${met} met</span></div></div>
      <select data-pop="size" style="width:auto">${[[0, 'Off'], [10000, '10,000'], [100000, '100,000'], [250000, '250,000'], [500000, '500,000'], [1000000, '1,000,000']].map((o) => `<option value="${o[0]}" ${size === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
      <p class="muted small">Every person is generated on demand — nothing is stored until you meet them. The crowd replying to your posts is drawn from this town, so you can find and meet them.</p></div>
      <div class="tabs"><button class="${UI.townTab === 'browse' ? 'on' : ''}" data-act="townTab" data-t="browse">🔍 Browse</button><button class="${UI.townTab === 'swipe' ? 'on' : ''}" data-act="townTab" data-t="swipe">💘 Swipe</button></div>`;
    if (!size) return head + '<div class="empty">The town is switched off. Pick a population size above.</div>';
    if (UI.townTab === 'swipe') {
      if (!UI.cand || UI.cand.idx >= size) UI.cand = G.Pop.nextCandidate();
      const p = UI.cand;
      return `${head}<div class="card swipecard"><div class="avatar" style="width:96px;height:96px;font-size:40px;margin:0 auto 10px;background:${U.gradient(p.handle)}">${esc(p.name.charAt(0))}</div>
        <h2 style="text-align:center;margin:0">${esc(p.name)}, ${p.age}</h2><div class="muted" style="text-align:center">${esc(p.handle)} · ${esc(p.job)} · ${esc(p.hood)} · ${U.fmt(p.followers)} followers</div>
        <p style="text-align:center;margin:10px 0">${esc(p.personality)}</p>
        <div class="row center" style="margin:8px 0 0"><button class="btn big" data-act="swipe" data-m="pass">✖ Pass</button><button class="btn big primary" data-act="swipe" data-m="like">💚 Like</button><button class="btn big" data-act="swipe" data-m="super">🔥 Super</button></div>
        <div class="muted small" style="text-align:center">Your charisma, style and fame decide your odds.</div></div>`;
    }
    const per = 24;
    const r = G.Pop.page(UI.townPage, per, UI.townQ);
    const pager = r.pages
      ? `<div class="row between" style="margin:10px 0"><button class="btn sm" data-act="townGo" data-d="-1" ${UI.townPage <= 0 ? 'disabled' : ''}>← Prev</button><span class="muted small">page ${U.fmt(UI.townPage + 1)} of ${U.fmt(r.pages)}</span><button class="btn sm" data-act="townGo" data-d="1" ${UI.townPage >= r.pages - 1 ? 'disabled' : ''}>Next →</button></div>`
      : `<div class="row between" style="margin:10px 0"><button class="btn sm" data-act="townGo" data-d="-1" ${UI.townPage <= 0 ? 'disabled' : ''}>← Prev</button><span class="muted small">search results · page ${UI.townPage + 1}</span><button class="btn sm" data-act="townGo" data-d="1" ${r.more ? '' : 'disabled'}>Next →</button></div>`;
    return `${head}<div class="searchbar"><input id="townq" data-bind="townQ" value="${esc(UI.townQ)}" placeholder="Search by name, job, vibe, interest — or paste a @handle"></div>${pager}
      <div class="cards">${r.people.map(popCard).join('') || '<div class="empty">Nobody matches that in the first 120,000 people.</div>'}</div>${pager}`;
  };

  UI.popModal = (idx) => {
    const S = G.S;
    const p = G.Pop.person(idx);
    const metId = S.popMet && S.popMet[idx];
    const n = metId && S.npcs[metId];
    UI.modal(`<button class="close" data-act="closeModal">✕</button>
      <div class="phead2"><div class="avatar" style="width:76px;height:76px;font-size:32px;background:${U.gradient(p.handle)}">${esc(p.name.charAt(0))}</div>
        <div><h2>${esc(p.name)}</h2><div class="muted">${esc(p.handle)} · age ${p.age} · ${U.fmt(p.followers)} followers</div></div></div>
      <p>${esc(p.job)} from ${esc(p.hood)}.</p><p class="muted small">${esc(p.personality)}</p>
      <div class="row wrap">${(p.likes || []).map((l) => `<span class="chip gray">${esc(l)}</span>`).join('')}</div>
      <div class="row wrap" style="margin-top:14px">${n ? `<button class="btn primary" data-act="profile" data-id="${n.id}">Open their profile</button>` : `<button class="btn primary" data-act="popMeet" data-i="${idx}">🤝 Meet them</button><button class="btn" data-act="popMeet" data-i="${idx}" data-dm="1">✉️ Meet &amp; message</button>`}</div>
      <p class="muted small">Meeting promotes them to a full character with memory, a relationship and DMs.</p>`);
  };
})(window.G);
