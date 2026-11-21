/* Clout — Instagram-style stories: the tray on Home, the full-screen viewer, and posting your own */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const esc = U.esc;
  const A = UI.acts;
  const $ = (s, r = document) => r.querySelector(s);

  const SEG_MS = 5200; // how long each story stays on screen
  const REACT = ['❤️', '😂', '🔥', '😮', '👏', '😍', '🥹'];
  const MOODS = ['📸', '🍕', '💪', '🎧', '😴', '🔥', '💘', '✈️', '🎉', '😤'];

  const sv = (UI.sv = { author: null, i: 0, timer: null, list: [] });
  Object.assign(UI, { svReply: '', storyDraft: '', storyEmoji: '📸' });

  /* ---------- who has a story ---------- */

  const closeness = (n) => {
    if (!n) return 0;
    const f = G.S.player.following.includes(n.id) ? 40 : 0;
    return f + Math.max(0, n.aff) * 0.5 + n.rom * 0.4 + Math.min(20, Math.log10(n.followers + 10) * 4);
  };

  UI.storyAuthors = function () {
    const S = G.S;
    const by = {};
    (S.stories || []).forEach((st) => {
      if (st.exp <= S.clock) return;
      if (st.author !== 'me') {
        const n = S.npcs[st.author];
        if (!n || n.blocked || (n.muted && !n.userAlt)) return;
      }
      (by[st.author] = by[st.author] || []).push(st);
    });
    const ids = Object.keys(by).filter((id) => id !== 'me');
    const unseen = (id) => by[id].some((st) => !st.seen);
    ids.sort((a, b) => unseen(b) - unseen(a) || closeness(S.npcs[b]) - closeness(S.npcs[a]) || Math.max(...by[b].map((x) => x.t)) - Math.max(...by[a].map((x) => x.t)));
    return { by, ids: ids.slice(0, 30) };
  };

  UI.storiesTray = function () {
    const S = G.S;
    const { by, ids } = UI.storyAuthors();
    const mine = by.me && by.me.length;
    const cell = (id) => {
      const n = S.npcs[id];
      const unseen = by[id].some((st) => !st.seen);
      const p = G.Persona && G.Persona.presence ? G.Persona.presence(n, S.clock) : '';
      return `<button class="stry" data-act="story" data-id="${id}" title="${esc(n.name)}"><div class="ring ${unseen ? 'new' : 'seen'}" style="width:66px;height:66px"><div class="ring-in">${UI.avatar(n, 58)}</div></div>${p === 'online' ? '<i class="on-dot"></i>' : ''}<span class="sname ellip">${esc(G.U.first(n.name))}</span></button>`;
    };
    return `<div class="stories" id="stories">
      <div class="stry me">
        <button class="${mine ? 'ring seen' : ''}" ${mine ? 'data-act="story" data-id="me"' : 'data-act="storyCompose"'} style="${mine ? 'width:66px;height:66px' : 'border:0;background:none;padding:0'}"><div class="${mine ? 'ring-in' : ''}">${UI.avatar('me', mine ? 58 : 62)}</div></button>
        <button class="plus" data-act="storyCompose" title="Add to your story">+</button>
        <span class="sname ellip">Your story</span>
      </div>
      ${ids.map(cell).join('')}
    </div>`;
  };

  /* ---------- the viewer ---------- */

  const timeLeft = (st) => {
    const m = Math.max(0, st.exp - G.S.clock);
    return m >= 60 ? Math.ceil(m / 60) + 'h left' : m + 'm left';
  };

  const clearTimer = () => {
    if (sv.timer) clearTimeout(sv.timer);
    sv.timer = null;
  };
  const arm = () => {
    clearTimer();
    sv.timer = setTimeout(() => UI.storyNext(), SEG_MS);
  };

  UI.openStory = function (id) {
    const S = G.S;
    if (!S) return;
    const list = (S.stories || []).filter((st) => st.author === id && st.exp > S.clock).sort((a, b) => a.t - b.t);
    if (!list.length) return UI.toast('No story to show right now.', 'info');
    sv.author = id;
    sv.list = list.map((st) => st.id);
    const firstUnseen = list.findIndex((st) => !st.seen);
    sv.i = firstUnseen >= 0 ? firstUnseen : 0;
    UI.svReply = '';
    UI.renderStory();
  };

  UI.closeStory = function () {
    clearTimer();
    sv.author = null;
    const root = $('#story-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('story-open');
    if (G.S) {
      G.Store.saveSoon();
      if (UI.page === 'home' && !UI.thread && !G.busy) UI.render(); // refresh rings (seen → grey)
    }
  };

  UI.storyNext = function () {
    if (sv.author == null) return;
    if (sv.i < sv.list.length - 1) {
      sv.i++;
      UI.svReply = '';
      return UI.renderStory();
    }
    // on to the next person with something new, otherwise done
    const { ids } = UI.storyAuthors();
    const nxt = ids.find((id) => id !== sv.author && UI.activeStories(id).some((st) => !st.seen));
    if (nxt) return UI.openStory(nxt);
    UI.closeStory();
  };
  UI.storyPrev = function () {
    if (sv.author == null) return;
    if (sv.i > 0) sv.i--;
    UI.svReply = '';
    UI.renderStory();
  };

  UI.renderStory = function () {
    const S = G.S;
    const root = $('#story-root');
    if (!S || !root) return;
    const st = S.stories.find((x) => x.id === sv.list[sv.i]);
    if (!st || st.exp <= S.clock) {
      sv.list = sv.list.filter((id) => S.stories.some((x) => x.id === id && x.exp > S.clock));
      if (!sv.list.length) return UI.closeStory();
      sv.i = Math.min(sv.i, sv.list.length - 1);
      return UI.renderStory();
    }
    const mine = st.author === 'me' || !!(G.S.npcs[st.author] && G.S.npcs[st.author].userAlt);
    const n = mine ? null : S.npcs[st.author];
    if (!mine && !n) return UI.closeStory();
    st.seen = true;
    const sc = st.scene && st.scene.hue != null ? st.scene : { emoji: '✨', emoji2: '🌟', hue: 260, hue2: 330 };
    const bars = sv.list.map((_, k) => `<div class="sv-bar"><i class="${k < sv.i ? 'full' : k === sv.i ? 'run' : ''}" ${k === sv.i ? `style="animation-duration:${SEG_MS}ms"` : ''}></i></div>`).join('');
    let poll = '';
    if (st.poll) {
      const tot = (st.poll.v[0] + st.poll.v[1]) || 1;
      poll = `<div class="sv-poll">${st.poll.o
        .map((o, k) => {
          const pct = Math.round((st.poll.v[k] / tot) * 100);
          const done = st.poll.mine != null;
          return `<button class="sv-opt ${st.poll.mine === k ? 'mine' : ''}" ${done || mine ? '' : `data-act="storyVote" data-id="${st.id}" data-i="${k}"`}><i style="width:${done || mine ? pct : 0}%"></i><span>${esc(o)}</span><b>${done || mine ? pct + '%' : ''}</b></button>`;
        })
        .join('')}</div>`;
    }
    const ask = st.kind === 'ask' && !mine ? '<div class="sv-ask">Send me a message 👇</div>' : '';
    let foot;
    if (mine) {
      const names = st.views.map((id) => (S.npcs[id] ? G.U.first(S.npcs[id].name) : null)).filter(Boolean);
      const rx = Object.entries(st.rx || {}).filter(([id]) => S.npcs[id]);
      foot = `<div class="sv-views"><b>👁 ${st.views.length} ${st.views.length === 1 ? 'viewer' : 'viewers'}</b>${names.length ? `<div class="small">${esc(names.slice(0, 10).join(', '))}${names.length > 10 ? ' +' + (names.length - 10) : ''}</div>` : '<div class="small">Nobody has seen it yet — people check stories through the day.</div>'}
        ${rx.length ? `<div class="sv-rx">${rx.slice(0, 12).map(([id, e]) => `<span title="${esc(S.npcs[id].name)}">${esc(e)} ${esc(G.U.first(S.npcs[id].name))}</span>`).join('')}</div>` : ''}</div>`;
    } else {
      const sent = st.rx && st.rx.me;
      foot = `<div class="sv-reacts">${REACT.map((e) => `<button class="${sent === e ? 'on' : ''}" data-act="storyReact" data-id="${st.id}" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="sv-reply"><input id="svreply" data-bind="svReply" maxlength="300" placeholder="Reply to ${esc(G.U.first(n.name))}…" value="${esc(UI.svReply)}" autocomplete="off"><button class="sv-send" data-act="storySend" data-id="${n.id}">Send</button></div>`;
    }
    const who = st.author === 'me' ? 'me' : S.npcs[st.author];
    root.innerHTML = `<div class="sv-bg" data-act="storyClose"><div class="sv" data-stop="1">
      <div class="sv-bars">${bars}</div>
      <div class="sv-head">${UI.avatar(who, 36)}<div class="grow"><b>${esc(st.author === 'me' ? 'Your story' : who.name + ' · your account')}</b> <span class="sv-ago">${U.ago(S.clock, st.t)} · ${timeLeft(st)}</span></div>
        <button class="sv-x" data-act="storyClose" title="Close">✕</button></div>
      <div class="sv-media" style="background:${UI.gradientOf(sc)}">${st.img && UI.mediaImg(st.img, st.imgl, 'sv-photo', false, 1080) ? UI.mediaImg(st.img, st.imgl, 'sv-photo', false, 1080) : `<span class="m1">${esc(sc.emoji)}</span><span class="m2">${esc(sc.emoji2)}</span>`}
        <div class="sv-text">${U.rich(st.text)}</div>${poll}${ask}</div>
      <button class="sv-tap l" data-act="storyPrev" aria-label="Previous"></button><button class="sv-tap r" data-act="storyNext" aria-label="Next"></button>
      <div class="sv-foot">${foot}</div></div></div>`;
    document.body.classList.add('story-open');
    arm();
    G.Store.saveSoon();
  };

  /* ---------- actions ---------- */

  A.story = (d) => UI.openStory(d.id);
  A.storyClose = (d, e, el) => {
    if (el && e && e.target !== el && !e.target.closest('.sv-x')) return; // only the backdrop or ✕
    UI.closeStory();
  };
  A.storyNext = () => UI.storyNext();
  A.storyPrev = () => UI.storyPrev();

  A.storyReact = (d) => {
    const S = G.S;
    const st = S.stories.find((x) => x.id === d.id);
    const n = st && S.npcs[st.author];
    if (!st || !n) return;
    st.rx = st.rx || {};
    st.rx.me = d.e;
    G.World.nudgeRel(n, { aff: 0.6, rom: ['😍', '❤️', '🔥'].includes(d.e) && n.rom > 5 ? 0.4 : 0 });
    n.touched = S.clock;
    if (G.Mem) G.Mem.add(n, { kind: 'story', text: `${S.player.name} reacted ${d.e} to my story`, who: ['me'], valence: 0.3 });
    UI.toast(`Sent ${d.e} to ${G.U.first(n.name)}`, 'good');
    UI.renderStory();
  };

  A.storyVote = (d) => {
    const S = G.S;
    const st = S.stories.find((x) => x.id === d.id);
    if (!st || !st.poll || st.poll.mine != null) return;
    st.poll.mine = +d.i;
    st.poll.v[+d.i] = (st.poll.v[+d.i] || 0) + 1;
    UI.renderStory();
  };

  A.storySend = (d) => {
    const text = (UI.svReply || ($('#svreply') || {}).value || '').trim();
    if (!text) return UI.toast('Type a reply first.', 'info');
    UI.svReply = '';
    UI.closeStory();
    UI.go('messages', { dmWith: d.id, groupWith: null });
    UI.dmDraft = text;
    A.sendDm({ id: d.id });
  };

  // composer for your own story
  A.storyCompose = () => {
    UI.closeStory();
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>Add to your story</h3>
      <div class="sv-preview" id="svprev" style="background:${UI.gradientOf(G.Lex.sceneFor(['default'], UI.storyDraft || 'x'))}"><span class="m1">${esc(UI.storyEmoji)}</span><div class="sv-text" id="svprevtext">${esc(UI.storyDraft) || 'What are you up to?'}</div></div>
      <textarea id="storytext" data-bind="storyDraft" rows="2" maxlength="140" placeholder="What are you up to?">${esc(UI.storyDraft)}</textarea>
      <div class="tones">${MOODS.map((m) => `<button class="pill ${UI.storyEmoji === m ? 'on' : ''}" data-act="storyEmoji" data-e="${m}">${m}</button>`).join('')}</div>
      <p class="muted small">Stories last 24 hours. People in your world watch and react to them — and some will slide into your DMs.</p>
      <button class="btn primary wide" data-act="storyShare">Share to story</button>`);
  };
  A.storyEmoji = (d) => {
    UI.storyEmoji = d.e;
    const draft = UI.storyDraft;
    A.storyCompose();
    const ta = $('#storytext');
    if (ta) ta.value = draft;
  };
  A.storyShare = () => {
    const text = (UI.storyDraft || '').trim();
    if (!text) return UI.toast('Write something for your story first.', 'info');
    const alt = E.activeAlt(); // posting as a burner account: the story is the burner's, not yours
    const st = E.postStory(text, UI.storyEmoji, alt ? G.S.activeAlt : null, UI.audience);
    if (!st) return;
    UI.storyDraft = '';
    UI.audience = '';
    UI.closeModal();
    E.tick(25, true); // a little time passes: the first viewers show up
    G.Store.save();
    UI.toast(alt ? 'Burner story shared 🎭' : 'Story shared ✨', 'good');
    UI.go('home');
  };

  // jump to the composer (the nav's Create button)
  A.create = () => {
    UI.go('home');
    setTimeout(() => {
      const c = $('#composer');
      if (c) {
        c.focus();
        if (c.scrollIntoView) c.scrollIntoView({ block: 'center' });
      }
    }, 30);
  };

  /* ---------- keys + pause while typing ---------- */

  document.addEventListener('keydown', (e) => {
    if (sv.author == null) return;
    if (e.key === 'Escape') UI.closeStory();
    else if (e.key === 'ArrowRight' && !(e.target && e.target.id === 'svreply')) UI.storyNext();
    else if (e.key === 'ArrowLeft' && !(e.target && e.target.id === 'svreply')) UI.storyPrev();
    else if (e.key === 'Enter' && e.target && e.target.id === 'svreply') {
      const send = $('.sv-send');
      if (send) send.click();
    }
  });
  document.addEventListener('focusin', (e) => {
    if (sv.author != null && e.target && e.target.id === 'svreply') {
      clearTimer(); // typing a reply pauses the story
      const bar = $('.sv-bar i.run');
      if (bar) bar.style.animationPlayState = 'paused';
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (sv.author != null && e.target.closest && e.target.closest('.sv-media')) {
      clearTimer();
      const bar = $('.sv-bar i.run');
      if (bar) bar.style.animationPlayState = 'paused';
    }
  });
  document.addEventListener('pointerup', () => {
    // let go after holding: carry on with a fresh full segment
    if (sv.author != null && !sv.timer && document.activeElement && document.activeElement.id !== 'svreply') UI.renderStory();
  });
})(window.G);
