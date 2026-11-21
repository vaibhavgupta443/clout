/* Clout — event wiring + boot */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const P = G.Pages;
  const esc = U.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const A = UI.acts;

  A.altAccounts = () => {
    const S = G.S;
    const accounts = Object.values(S.npcs).filter((n) => n.userAlt);
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>Burner accounts</h3>
      <p class="muted">Fictional accounts you control completely: post, reply, comment, share stories, like, follow, tag people and chat in private. Nobody knows it is you, and each account has its own separate chats. The world never writes anything for them.</p>
      <div class="col"><button class="btn ${!S.activeAlt ? 'primary' : ''}" data-act="altSwitch">${esc(S.player.name)} · ${esc(S.player.handle)} (main)</button>
      ${accounts.map((n) => `<div class="row"><button class="btn grow ${S.activeAlt === n.id ? 'primary' : ''}" data-act="altSwitch" data-id="${n.id}">${esc(n.emoji)} ${esc(n.name)} · ${esc(n.handle)}</button><button class="btn sm danger" data-act="altDelete" data-id="${n.id}" title="Delete this account and everything it posted">🗑</button></div>`).join('')}
      <button class="btn" data-act="altNew">＋ Create burner account</button>
      ${S.admin ? '<button class="btn" data-act="nav" data-page="admin">🛠 Act as any character (Admin)</button>' : ''}</div>`);
  };
  A.altNew = () => UI.modal(`<button class="close" data-act="altAccounts">✕</button><h3>Create burner account</h3>
    <label>Display name</label><input id="altname" maxlength="40" placeholder="The Gossip Desk">
    <label>Handle</label><input id="althandle" maxlength="30" placeholder="@gossipdesk">
    <label>Bio</label><input id="altbio" maxlength="160" placeholder="A fictional account in this story">
    <label>Avatar emoji</label><input id="altemoji" maxlength="8" value="🕵️">
    <div class="row between" style="margin-top:12px"><button class="btn" data-act="altAccounts">Cancel</button><button class="btn primary" data-act="altCreate">Create</button></div>`);
  A.altCreate = () => {
    const S = G.S;
    const name = ($('#altname')?.value || '').trim();
    if (!name) return UI.toast('Give this account a name.', 'info');
    const handle = ($('#althandle')?.value || name).trim();
    const n = E.makeNpc({ name, handle, bio: ($('#altbio')?.value || '').trim(), emoji: ($('#altemoji')?.value || '🎭').trim(), role: 'burner account', age: 25, personality: 'A fictional user controlled directly by the player. Never invent posts or actions for this account.' }, S);
    n.userAlt = true;
    n.muted = true;
    n.posts = 0;
    S.activeAlt = n.id;
    G.Store.save();
    UI.toast(`${n.name} is ready to post.`, 'good');
    UI.closeModal();
    UI.render();
  };
  A.altSwitch = (d) => {
    const S = G.S;
    if (d.id && !E.altOf(d.id)) return;
    S.activeAlt = d.id || null;
    UI.dmWith = null; // each account has its own chats
    UI.suggestions = null;
    G.Store.save();
    UI.closeModal();
    UI.render();
  };
  A.altDelete = (d) => {
    const n = E.altOf(d.id);
    if (!n) return;
    if (!confirm(`Delete ${n.name} (${n.handle}) with all its posts, stories and chats? This cannot be undone.`)) return;
    E.deleteAlt(n.id);
    UI.dmWith = null;
    UI.toast(`${n.name} deleted.`, 'info');
    A.altAccounts();
    UI.render();
  };

  // run an async action, surfacing unexpected errors as toasts
  const safe = (fn) =>
    Promise.resolve()
      .then(fn)
      .catch((e) => {
        if (!e || !e.user) console.error(e); // expected validation messages are shown as toasts only
        UI.toast(e.message || String(e), 'bad');
        UI.setBusy(false);
        G.busy = false;
        UI.render();
      });

  /* ---------- profile modal ---------- */

  UI.openProfile = function (id) {
    const S = G.S;
    const n = S.npcs[id];
    if (!n) return;
    UI.openProfileId = id;
    const f = UI.following(id);
    const rels = S.npcRel
      .filter((e) => e.a === id || e.b === id)
      .map((e) => {
        const o = S.npcs[e.a === id ? e.b : e.a];
        return o ? `<span class="pchip" data-act="profile" data-id="${o.id}">${esc(o.emoji)} ${esc(o.name)} <i class="muted">${esc(e.type)}</i></span>` : '';
      })
      .join('');
    const posts = S.postOrder
      .map((pid) => S.posts[pid])
      .filter((p) => p && p.author === id && !p.replyTo)
      .slice(-3)
      .reverse();
    const allPosts = S.postOrder.map((pid) => S.posts[pid]).filter((p) => p && p.author === id && !p.replyTo).reverse();
    const topic = UI.hlTopic && UI.hlTopic.who === id ? UI.hlTopic.key : null;
    const shown = topic ? allPosts.filter((p) => UI.sceneOf(p).key === topic) : allPosts;
    const st = n.status;
    const romantic = ['dating', 'partner'].includes(st);
    const keys = Object.keys(E.ACTIONS).filter((k) => {
      if (E.isFamily(n) && E.ACTIONS[k].love) return false; // family: no romantic actions
      if (k === 'askout') return !romantic;
      if (k === 'breakup') return romantic || st === 'situationship';
      if (k === 'expose') return n.secretRevealed;
      return true;
    });
    const btn = (k) => {
      const a = E.ACTIONS[k];
      return `<button class="btn sm act ${['callout', 'subtweet', 'roast', 'expose', 'breakup'].includes(k) ? 'warn' : ''}" data-act="npcAct" data-id="${id}" data-k="${k}">${a.icon} ${a.label}</button>`;
    };
    UI.modal(
      `<button class="close" data-act="closeModal">✕</button>
      ${UI.profileHead({ avatar: UI.ringAvatar(n, 86, n.id), name: n.name, verified: n.followers >= 100000, bio: esc(n.bio), sub: `${esc(n.handle)} · ${esc(n.role)} · age ${n.age}${n.mood ? ' · mood: ' + esc(n.mood) : ''} ${UI.chip(n.status, n)}`, posts: allPosts.length, followers: n.followers, following: n.psy && n.psy.following ? n.psy.following.length : 0, who: id, active: topic, addNew: false, highlights: UI.highlightsOf(allPosts), buttons: `<button class="btn sm grow ${f ? '' : 'primary'}" data-act="follow" data-id="${id}">${f ? 'Following ✓' : 'Follow'}</button><button class="btn sm grow" data-act="openChat" data-id="${id}">Message</button>` })}
      <p class="muted small">Vibe: ${esc(n.personality)}</p>
      <div class="grid2 meters">${UI.bar2('💚 Affinity', n.aff)}${UI.bar('💘 Romance', n.rom, 100, 'pink')}${UI.bar('⚔️ Rivalry', n.riv, 100, 'red')}${UI.bar('🤝 Trust', n.trust, 100, 'blue')}</div>
      ${G.Charts ? G.Charts.npcCard(n) : ''}
      <div class="row wrap" style="margin:10px 0">
        <button class="btn sm" data-act="meetup" data-id="${id}">🎭 Meet up</button>
        ${G.Tier ? G.Tier.button(n) : ''}${G.Mem2 ? G.Mem2.button(n) : ''}<button class="btn sm" data-act="toggleClose" data-id="${id}" title="Close friends see your close-friends posts and stories">${E.isClose(n) ? '💚 In your close friends' : '＋ Close friend'}</button>
        <button class="btn sm" data-act="editChar" data-id="${id}">✏️ Edit</button>
        <button class="btn sm" data-act="askAbout" data-id="${id}" title="Ask the Director about ${esc(n.name)}">🎬 Ask about ${esc(G.U.first(n.name))}</button>
        <button class="btn sm" data-act="talkTo" data-id="${id}" title="Chat with ${esc(n.name)} in character from the Director bar">💬 Talk</button>
        ${S.admin ? `<button class="btn sm primary" data-act="adminAs" data-id="${id}">🛠 Act as</button><button class="btn sm" data-act="adminSel" data-id="${id}">🛠 Admin edit</button>` : ''}
        <button class="btn sm" data-act="giftModal" data-id="${id}">🎁 Gift</button>
        <button class="btn sm" data-act="muteNpc" data-id="${id}">${n.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn sm danger" data-act="blockNpc" data-id="${id}">Block</button></div>
      ${n.secretRevealed ? `<div class="secret">🤫 <b>Secret you uncovered:</b> ${esc(n.secret)}</div>` : n.secret ? '<div class="muted small">🤫 They are hiding something… try “Dig for secrets”.</div>' : ''}
      ${G.Media && G.Media.ready ? `<div class="row wrap small"><span class="muted">Look: ${esc(G.Media.lookFor(n).join(', '))}</span><button class="btn sm ghost" data-act="editLook" data-id="${id}">🖼 Edit look</button></div>` : ''}
      ${n.history ? `<div class="sumbox small">🧠 Long-term memory: ${esc(n.history)}</div>` : ''}
      ${n.memories.length ? `<h4 class="sect">What they remember about you</h4><ul class="mem">${n.memories.slice(-5).reverse().map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${rels ? `<h4 class="sect">Connections</h4><div class="row wrap">${rels}</div>` : ''}
      <h4 class="sect">Do something</h4>
      <textarea id="actext" rows="2" maxlength="400" placeholder="Optional: say it in your own words. Leave blank and the AI writes it in your voice."></textarea>
      <div class="row wrap">${keys.map(btn).join('')}</div>
      ${shown.length ? `<h4 class="sect">Recent posts</h4><div class="pgrid tall">${shown.slice(0, 18).map((p) => UI.gridTile(p)).join('')}</div>` : ''}`,
      'profile'
    );
  };

  /* ---------- actions ---------- */

  A.nav = (d) => {
    document.body.classList.remove('nav-more');
    if (d.page === 'home') UI.thread = null; // "Home" always means the feed, even from inside a thread
    UI.go(d.page, d.page === 'messages' ? {} : { dmWith: UI.dmWith });
  };
  A.closeModal = (d, e, el) => {
    if (e.target !== el) return;
    UI.closeModal();
  };
  A.profile = (d) => UI.openProfile(d.id);
  A.mention = (d) => {
    const h = U.normHandle(d.handle);
    if (h === G.S.player.handle) return UI.go('me');
    const n = Object.values(G.S.npcs).find((x) => x.handle === h);
    if (n) UI.openProfile(n.id);
    else UI.toast(`${d.handle} is just some random account.`, 'info');
  };
  A.tag = (d) => {
    UI.trend = d.tag; // a hashtag or a trend opens its own page: why it is hot, who is talking, the posts, what you can do
    UI.go('trend');
  };
  A.thread = (d) => {
    UI.suggestions = null;
    UI.replyDraft = '';
    UI.page = 'home';
    UI.thread = d.id;
    UI.closeModal();
    UI.vt('open', d.id); // the picture of the post glides into the thread
    UI.render();
    window.scrollTo(0, 0);
  };
  A.back = () => {
    UI.thread = null;
    UI.suggestions = null;
    UI._pop = true; // back to the feed at the place you left it
    UI.vt('back');
    UI.render();
  };
  A.like = (d) => {
    E.toggleLike(d.id, G.S.activeAlt);
    UI.likeNow(d.id); // the heart answers this frame ...
    UI.renderSoon(); // ... the full redraw follows when the browser has a moment
  };
  A.follow = (d) => {
    E.toggleFollow(d.id, G.S.activeAlt);
    if (UI.openProfileId === d.id) {
      UI.openProfile(d.id);
      UI.render();
    } else {
      UI.followNow(d.id);
      UI.renderSoon();
    }
  };
  A.muteNpc = (d) => {
    E.toggleBlock(d.id, 'muted');
    UI.openProfile(d.id);
    UI.render();
  };
  A.blockNpc = (d) => {
    if (!confirm('Block this person? They will disappear from your feed and messages.')) return;
    E.toggleBlock(d.id, 'blocked');
    UI.closeModal();
    UI.render();
  };
  A.feedTab = (d) => {
    UI.feedTab = d.t;
    UI.feedLimit = 40;
    UI.render();
  };
  A.moreFeed = () => {
    UI.feedLimit += 40;
    UI.render();
  };
  A.tone = (d) => {
    UI.tone = d.t;
    UI.render();
  };
  A.routePreset = (d) => {
    const pr = G.AI.PRESETS[d.p];
    if (!pr) return;
    G.settings.route = Object.assign({}, pr.route);
    G.Store.saveSettings();
    UI.toast(`${pr.label}: ${pr.note}`, 'good');
    UI.render();
  };
  A.helperReset = () => {
    G.AI.helperReset();
    UI.toast('Helper un-paused', 'info');
    UI.render();
  };
  A.detectHelper = () =>
    safe(async () => {
      UI.setBusy('Looking for models on your helper server…');
      try {
        const list = await G.AI.helperModels();
        const dl = $('#helperlist');
        if (dl) dl.innerHTML = list.map((m) => `<option value="${esc(m)}"></option>`).join('');
        if (!list.length) return UI.toast('The helper server is up but reports no models. Load one first.', 'info');
        if (!list.includes(G.settings.helperModel)) {
          G.settings.helperModel = list[0];
          G.Store.saveSettings();
          const el = $('input[data-setting="helperModel"]');
          if (el) el.value = list[0];
        }
        UI.toast(`Found ${list.length} model(s): ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`, 'good');
      } finally {
        UI.setBusy(false);
      }
    });
  A.testHelper = () =>
    safe(async () => {
      if (!G.AI.helperReady()) return UI.toast('Tick "Use a local helper model" and fill in the model name first.', 'info');
      UI.setBusy('Testing the helper…');
      try {
        G.AI.helperReset();
        const r = await G.AI.json({ task: 'helpertest', user: 'Reply with exactly this JSON: {"ok":true}', maxTokens: 40, system: 'You output only JSON.', temperature: 0 });
        UI.toast(r.data.ok ? `✅ Helper works! (${G.settings.helperModel})` : 'Connected, but the reply looked odd.', r.data.ok ? 'good' : 'info');
      } finally {
        UI.setBusy(false);
        UI.render();
      }
    });
  A.capReset = () => {
    G.AI.newWindow();
    UI.toast('New spending window started', 'info');
    UI.updateSpend();
    UI.render();
  };
  A.bankFill = () =>
    safe(async () => {
      if (!G.AI.ready()) return UI.toast(G.AI.notReadyMsg(), 'info');
      UI.toast('Writing lines for the cast…', 'info');
      const n = await G.Bank.refill();
      UI.toast(n ? `Banked ${n} new lines ✍️` : 'Nothing new was banked: ' + (G.Bank.lastErr || 'try again'), n ? 'good' : 'bad');
      if (UI.page === 'settings') UI.render();
    });
  A.bankClear = () => {
    G.Bank.clear();
    UI.toast('Banked lines cleared', 'info');
    if (UI.page === 'settings') UI.render();
  };
  A.mediaRescan = () =>
    safe(async () => {
      UI.toast('Scanning your media folder…', 'info');
      const n = await G.Media.load(true);
      if (G.S) G.Media.assignAll(G.S);
      UI.toast(n ? `Found ${n} photos` : G.Media.error || 'No photos found', n ? 'good' : 'info');
      G.Store.saveSoon();
      if (UI.page === 'settings') UI.render();
    });
  A.editLook = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    const cur = G.Media.lookFor(n).join(', ');
    const v = prompt('How does ' + n.name + ' look? Tags are matched against your photo library (e.g. woman, blonde, curvy, tattoos):', cur);
    if (v == null) return;
    G.Media.setLook(n, v);
    n.avImg = '';
    G.Media.assign(n, G.S);
    G.Store.save();
    UI.openProfile(d.id);
  };
  A.followPill = (d) => A.follow(d);
  A.capMore = (d, e, el) => {
    const cap = el.closest('.cap');
    if (cap) {
      cap.classList.remove('clamp');
      if (cap.dataset.pid) UI.expanded.add(cap.dataset.pid); // stays unfolded across refreshes
    }
    el.remove();
  };
  A.moreNav = () => document.body.classList.toggle('nav-more');
  A.inlineComment = (d, e, el) =>
    safe(async () => {
      const box = el.closest('.addc');
      const input = box && box.querySelector('input');
      const text = input ? input.value.trim() : '';
      if (!text) {
        if (input) input.focus();
        return;
      }
      if (input) input.value = '';
      const alt = E.activeAlt();
      const r = await E.reply(d.id, text, alt ? alt.id : null);
      if (!r && input) {
        input.value = text;
        UI.render();
      }
    });
  A.hlTopic = (d) => {
    const same = UI.hlTopic && UI.hlTopic.who === d.who && UI.hlTopic.key === d.k;
    UI.hlTopic = same ? null : { who: d.who, key: d.k };
    if (d.who === 'me') UI.render();
    else UI.openProfile(d.who);
  };
  A.profTab = (d) => {
    UI.profTab = d.k;
    UI.render();
  };
  A.shareProfile = () => {
    const h = G.S.player.handle;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(h).catch(() => {});
    UI.toast(`Your handle ${h} copied — share it!`, 'good');
  };
  A.saveToggle = (d) => {
    const on = E.toggleSave(d.id);
    UI.toast(on ? 'Saved' : 'Removed from saved', 'info');
    UI.render();
  };
  A.dismissIosTip = () => {
    G.settings.iosTipDismissed = true;
    G.Store.saveSettings();
    UI.render();
  };
  A.dismissWelcome = () => {
    delete G.S.welcome;
    G.Store.save();
    UI.render();
  };
  A.peopleView = (d) => {
    UI.peopleView = d.v;
    UI.render();
  };

  A.post = () =>
    safe(async () => {
      const text = UI.draft.trim();
      if (!text) return UI.toast('Write something first — or tap ✨ Ideas.', 'info');
      const type = UI.ptype || 'text';
      const accountId = E.activeAlt() ? G.S.activeAlt : null;
      if (type === 'story') {
        const st = E.postStory(text, null, accountId, UI.audience);
        if (!st) return;
        UI.draft = '';
        UI.audience = '';
        UI.ptype = 'text';
        E.tick(25, true);
        G.Store.save();
        UI.toast(accountId ? 'Burner account story shared ✨' : 'Story shared ✨ — people will start watching it', 'good');
        UI.render();
        return;
      }
      const extra = { type };
      if (UI.audience === 'close') extra.audience = 'close';
      if (['photo', 'video', 'meme'].includes(type)) extra.attach = (UI.attach || '').trim();
      if (type === 'poll') {
        extra.poll = [UI.poll0, UI.poll1, UI.poll2].map((x) => String(x || '').trim()).filter(Boolean);
        if (extra.poll.length < 2) return UI.toast('A poll needs at least two options.', 'info');
      }
      const saved = { attach: UI.attach, poll0: UI.poll0, poll1: UI.poll1, poll2: UI.poll2 };
      UI.draft = '';
      UI.audience = '';
      UI.suggestions = null;
      UI.ptype = 'text';
      UI.attach = UI.poll0 = UI.poll1 = UI.poll2 = '';
      const r = await E.post(text, UI.tone, null, extra, accountId);
      if (!r) {
        UI.draft = text;
        UI.ptype = type;
        Object.assign(UI, saved);
        UI.render();
      }
    });
  A.sendReply = (d) =>
    safe(async () => {
      const text = UI.replyDraft.trim();
      if (!text) return UI.toast('Write a reply first.', 'info');
      UI.replyDraft = '';
      UI.suggestions = null;
      const activeAlt = E.activeAlt() ? G.S.activeAlt : null;
      const r = await E.reply(d.id, text, activeAlt);
      if (!r) {
        UI.replyDraft = text;
        UI.render();
      }
    });
  A.sendDm = (d) =>
    safe(async () => {
      const text = UI.dmDraft.trim();
      if (!text) return;
      UI.dmDraft = '';
      UI.suggestions = null;
      const alt = E.activeAlt();
      const r = alt ? await E.altDm(alt.id, d.id, text) : await E.dm(d.id, text);
      if (!r) {
        UI.dmDraft = text;
        UI.render();
      }
    });

  A.quote = (d) => {
    const p = G.S.posts[d.id];
    if (!p) return;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>Repost with comment</h3>
      <div class="quote">${esc(UI.nameOf(p).name)}: ${U.rich(p.text.slice(0, 200))}</div>
      <textarea id="quotebox" rows="3" maxlength="400" placeholder="Add your take…"></textarea>
      <div class="row between"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="sendQuote" data-id="${d.id}">Post</button></div>`);
    setTimeout(() => $('#quotebox') && $('#quotebox').focus(), 50);
  };
  A.sendQuote = (d) =>
    safe(async () => {
      const text = ($('#quotebox').value || '').trim();
      if (!text) return;
      UI.closeModal();
      UI.page = 'home';
      UI.thread = null;
      await E.post(text, '', d.id, null, E.activeAlt() ? G.S.activeAlt : null); // a quote-post from a burner is the burner's
    });

  // AI suggestions
  const runSuggest = (target, args) =>
    safe(async () => {
      UI.suggestTarget = target;
      UI.suggestLoading = true;
      UI.suggestions = null;
      UI.render();
      try {
        UI.suggestions = await E.suggest(args);
        if (!UI.suggestions.length) UI.toast('No ideas came back — try again.', 'info');
      } catch (e) {
        UI.toast(e.message, 'bad');
      } finally {
        UI.suggestLoading = false;
        UI.render();
      }
    });
  A.suggest = () => runSuggest('draft', { intent: UI.draft.trim() });
  A.suggestReply = (d) => runSuggest('replyDraft', { intent: UI.replyDraft.trim(), replyTo: d.id });
  A.suggestDm = (d) => runSuggest('dmDraft', { intent: UI.dmDraft.trim(), npcId: d.id });
  A.useSuggestion = (d) => {
    const o = UI.suggestions[+d.i];
    if (!o) return;
    UI[UI.suggestTarget || 'draft'] = o.text;
    if ((UI.suggestTarget || 'draft') === 'draft') UI.tone = '';
    UI.suggestions = null;
    UI.render();
  };
  A.closeSuggest = () => {
    UI.suggestions = null;
    UI.render();
  };

  A.advance = (d) => safe(() => E.advance(d.k));
  A.moreReplies = (d) => safe(() => E.moreReplies(d.id));
  A.choose = (d) => safe(() => E.chooseEvent(d.id, +d.i));
  A.eventContinue = (d) => safe(() => E.chooseEvent(d.id, -1));
  A.eventDecline = (d) => {
    if (E.declineEvent(d.id)) UI.toast('You turned it down. Nothing happens.', 'info');
    UI.render();
  };
  A.direct = () =>
    safe(async () => {
      const t = (UI.dirDraft || '').trim();
      if (!t) return UI.toast('Tell the Director what should happen.', 'info');
      UI.dirDraft = '';
      await E.director(t);
      UI.go('home');
    });
  A.scenario = (d) =>
    safe(async () => {
      await E.director(P.SCENARIOS[+d.i][2]);
      UI.go('home');
    });
  A.stir = (d) =>
    safe(() => {
      const s = G.S.storylines.find((x) => x.id === d.id);
      if (!s) return;
      const how = {
        escalate: 'ESCALATE it dramatically — things get messier, more people pile in.',
        join: 'The player publicly jumps into this storyline and picks a side / adds fuel. Show the consequences.',
        calm: 'The player tries to calm things down and de-escalate. It may or may not work.',
        twist: 'Introduce a shocking plot twist in this storyline.',
      }[d.m];
      return E.advance('refresh', `Storyline "${s.title}" (id ${s.id}): ${how}`);
    });

  A.npcAct = (d) =>
    safe(async () => {
      const text = ($('#actext') && $('#actext').value) || '';
      const a = E.ACTIONS[d.k];
      UI.closeModal();
      const r = await E.doAction(d.id, d.k, text);
      if (!r) return;
      if (a.mode === 'dm') UI.go('messages', { dmWith: d.id });
      else if (r.placed.post) A.thread({ id: r.placed.post.id });
    });

  A.openChat = (d) => {
    UI.suggestions = null;
    if (d.alt && E.altOf(d.alt)) G.S.activeAlt = d.alt; // a notification about a burner account's chat opens that account
    UI.go('messages', { dmWith: d.id, groupWith: null });
  };
  A.closeChat = () => {
    UI.dmWith = null;
    UI.groupWith = null;
    UI.suggestions = null;
    UI.render();
  };

  A.editBio = () => {
    const b = prompt('Your bio', G.S.player.bio);
    if (b === null) return;
    G.S.player.bio = b.slice(0, 160);
    G.Store.save();
    UI.render();
  };
  A.editAvatar = () => {
    let input = document.getElementById('player-avatar-file');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'player-avatar-file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        try {
          if (!G.Studio || !G.Studio.shrink) throw new Error('Photo tools are still loading. Try again in a moment.');
          G.S.player.avatar = await G.Studio.shrink(file);
          G.Store.save();
          UI.toast('Profile photo updated.', 'good');
          UI.render();
        } catch (err) { UI.toast(err.message || 'Could not use that photo.', 'bad'); }
      });
    }
    input.value = '';
    input.click();
  };
  A.removeAvatar = () => {
    G.S.player.avatar = '';
    G.Store.save();
    UI.toast('Profile photo removed.', 'info');
    UI.render();
  };

  /* ---------- worlds / wizard ---------- */

  A.newWizard = () => {
    P.wiz.showWizard = true;
    UI.render();
  };
  A.cancelWizard = () => {
    P.wiz.showWizard = false;
    UI.render();
  };
  A.preset = (d) => {
    P.wiz.premise = P.PRESETS[+d.i][2];
    UI.render();
  };
  A.pickEmoji = (d) => {
    P.wiz.emoji = d.e;
    UI.render();
  };
  A.toggleTrait = (d) => {
    const t = P.wiz.traits;
    const i = t.indexOf(d.t);
    if (i >= 0) t.splice(i, 1);
    else if (t.length < 4) t.push(d.t);
    UI.render();
  };
  A.createWorld = () =>
    safe(async () => {
      const w = P.wiz;
      const keyEl = $('#apikey');
      if (keyEl) G.settings.apiKey = keyEl.value.trim();
      G.Store.saveSettings();
      if (!G.AI.ready()) return UI.toast(G.AI.notReadyMsg(), 'bad');
      if (!w.premise.trim()) return UI.toast('Describe the world (or pick a preset).', 'bad');
      if (!w.name.trim()) return UI.toast('Give your character a name.', 'bad');
      w.loading = true;
      G.busy = true;
      UI.render();
      try {
        const S = await E.createWorld({
          premise: w.premise.trim(), name: w.name.trim(), handle: w.handle.trim() || w.name.trim().split(/\s+/)[0],
          bio: w.bio.trim(), traits: w.traits, fame: w.fame, emoji: w.emoji,
          castBrief: w.cast.trim(), exact: w.exact === 'yes', size: w.size, note: w.note.trim(), loreText: w.lore.trim(),
        });
        P.wiz.showWizard = false;
        UI.page = 'home';
        UI.thread = null;
        UI.toast('World created! Say something 👋', 'good');
        S && G.Store.save();
      } finally {
        w.loading = false;
        G.busy = false;
        UI.render();
      }
    });
  A.loadWorld = (d) => {
    if (G.Store.load(d.id)) {
      E.undoStack.length = 0;
      UI.page = 'home';
      UI.thread = null;
      UI.dmWith = null;
      UI.groupWith = null;
      UI.render();
    } else UI.toast('Could not load that save.', 'bad');
  };
  A.delWorld = (d) => {
    if (!confirm('Delete this world permanently?')) return;
    G.Store.remove(d.id);
    UI.render();
  };
  A.leave = () => {
    G.Store.save();
    G.S = null;
    P.wiz.showWizard = false;
    UI.render();
  };
  A.delCurrent = () => {
    if (!confirm('Delete this world permanently? Export it first if you want a backup.')) return;
    G.Store.remove(G.S.id);
    G.S = null;
    UI.render();
  };
  // write now and say plainly whether it worked (on an iPhone: the database may have been cut while the app was in the background)
  A.saveNow = async () => {
    UI.toast('Saving…', 'info');
    G.Store.save();
    await G.Store.flush();
    let i = {};
    try { i = await G.Store.storageInfo(); } catch (e) {}
    const mb = (n) => (n / 1e6).toFixed(1);
    if (G.Store.lastError) UI.toast('Saving has trouble: ' + String(G.Store.lastError.message || G.Store.lastError).slice(0, 90) + '. Use Export save to keep a copy.', 'bad');
    else UI.toast(`Saved ✓ (${mb(i.bytes || 0)} MB${i.quota ? ' of ' + Math.round(i.quota / 1e6) + ' MB available' : ''})${i.persisted === false ? ' · iPhone clears unused sites after a few weeks: add Clout to your Home Screen to keep it' : ''}`, 'good');
    UI.render();
  };
  A.exportWorld = () => {
    const blob = new Blob([G.Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clout-${G.S.world.name.replace(/\W+/g, '-').toLowerCase()}-day${U.dayOf(G.S.clock)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  A.importWorld = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      try {
        G.Store.importJSON(await inp.files[0].text());
        UI.page = 'home';
        UI.toast('World imported!', 'good');
        UI.render();
      } catch (e) {
        UI.toast('Import failed: ' + e.message, 'bad');
      }
    };
    inp.click();
  };

  /* ---------- settings actions ---------- */

  A.saveKey = () => {
    G.settings.apiKey = ($('#apikey').value || '').trim();
    G.Store.saveSettings();
    UI.toast('API key saved in this browser.', 'good');
  };
  A.testKey = () =>
    safe(async () => {
      A.saveKey();
      UI.setBusy('Testing connection…');
      try {
        const r = await G.AI.json({ task: 'selftest', user: 'Reply with exactly this JSON: {"ok":true}', maxTokens: 40, system: 'You output only JSON.', temperature: 0 });
        UI.toast(r.data.ok ? `✅ Works! (${G.settings.model})` : 'Connected, but the reply looked odd.', r.data.ok ? 'good' : 'info');
      } finally {
        UI.setBusy(false);
      }
    });
  A.balance = () =>
    safe(async () => {
      A.saveKey();
      const d = await G.AI.balance();
      const el = $('#keyinfo');
      const txt = `OpenRouter key usage: $${(d.usage || 0).toFixed(3)}${d.limit != null ? ` of $${d.limit} limit — $${(d.limit_remaining ?? d.limit - d.usage).toFixed(2)} left` : ' (no key limit set)'}`;
      if (el) el.textContent = txt;
      UI.toast(txt, 'info');
    });
  A.detectModels = () =>
    safe(async () => {
      UI.setBusy('Looking for models on your server…');
      try {
        const list = await G.AI.models();
        const dl = $('#modellist');
        if (dl) dl.innerHTML = list.map((m) => `<option value="${esc(m.id)}"></option>`).join('');
        if (!list.length) UI.toast('The server is up but reports no models. Load one first.', 'info');
        else {
          if (!list.some((m) => m.id === G.settings.model)) {
            G.settings.model = list[0].id;
            G.Store.saveSettings();
            const mc = $('#modelcustom');
            if (mc) mc.value = G.settings.model;
          }
          UI.toast(`Found ${list.length} model(s): ${list.slice(0, 3).map((m) => m.id).join(', ')}${list.length > 3 ? '…' : ''}`, 'good');
        }
      } finally {
        UI.setBusy(false);
      }
    });
  A.loadModels = () =>
    safe(async () => {
      UI.setBusy('Loading models…');
      try {
        const list = await G.AI.models();
        const dl = $('#modellist');
        dl.innerHTML = list
          .slice(0, 300)
          .map((m) => `<option value="${esc(m.id)}">$${m.inP.toFixed(2)} in / $${m.outP.toFixed(2)} out per 1M</option>`)
          .join('');
        const cu = $('#modelcustom');
        $('#modelsel').value = '__custom';
        cu.style.display = '';
        cu.focus();
        UI.toast(`${list.length} models loaded — start typing in the box to pick one.`, 'good');
      } finally {
        UI.setBusy(false);
      }
    });


  /* ================= extra features ================= */

  A.undo = () => E.undo();
  A.retry = () => safe(() => E.retry());

  // ---- shop / money
  A.buyPR = () => {
    if (E.hirePR()) UI.render();
  };
  A.buyVerify = () => {
    if (E.buyVerified()) UI.render();
  };
  A.promoteModal = (d) => UI.promoteModal(d.id);
  A.doPromote = (d) => {
    if (E.promote(d.id, d.k)) {
      UI.closeModal();
      UI.render();
    }
  };
  A.giftFromShop = () => {
    const id = $('#giftnpc').value;
    if (!id) return UI.toast('Choose who to spoil first.', 'info');
    UI.giftModal(id);
  };
  A.giftModal = (d) => UI.giftModal(d.id);
  A.doGift = (d) =>
    safe(async () => {
      const note = ($('#giftnote') && $('#giftnote').value) || '';
      UI.closeModal();
      const r = await E.gift(d.id, d.k, note);
      if (r) UI.go('messages', { dmWith: d.id, groupWith: null });
    });
  A.pinPost = (d) => {
    E.pinPost(d.id);
    UI.render();
  };
  A.editPost = (d) => {
    const p = G.S.posts[d.id];
    if (!p || !(p.author === 'me' || E.altOf(p.author))) return;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>Edit post</h3>
      <textarea id="editbox" rows="4" maxlength="500">${esc(p.text)}</textarea>
      <p class="muted small">Fixes the text only: the reactions people already had stay as they were.</p>
      <div class="row between" style="margin-top:10px"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="editPostSave" data-id="${p.id}">Save</button></div>`);
  };
  A.editPostSave = (d) => {
    const box = $('#editbox');
    if (!box) return;
    if (!E.editPost(d.id, box.value)) return UI.toast('Write something first.', 'info');
    UI.closeModal();
    UI.render();
  };
  A.deletePost = (d) => {
    if (!confirm('Delete this post and its replies?')) return;
    if (UI.thread === d.id) UI.thread = null;
    E.deletePost(d.id);
    UI.render();
  };

  // ---- live stream
  A.goLiveModal = () => UI.liveModal();
  A.startLive = () =>
    safe(async () => {
      const title = ($('#livetitle').value || '').trim() || 'Chatting with you all';
      const len = +$('#livelen').value || 30;
      UI.closeModal();
      UI.page = 'home';
      UI.thread = null;
      const r = await E.goLive(title, len);
      if (r && G.S.lastLive) UI.liveRecap();
    });

  // ---- groups
  A.newGroup = () => UI.groupModal();
  A.makeGroup = () => {
    const ids = [...document.querySelectorAll('.gmember:checked')].map((x) => x.value);
    try {
      const g = E.createGroup($('#groupname').value, ids);
      UI.closeModal();
      UI.go('messages', { groupWith: g.id, dmWith: null });
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
  };
  A.openGroup = (d) => {
    UI.suggestions = null;
    UI.go('messages', { groupWith: d.id, dmWith: null });
  };
  A.sendGroup = (d) =>
    safe(async () => {
      const text = UI.dmDraft.trim();
      if (!text) return UI.toast('Type a message (or tap 💤 Idle to let the chat run).', 'info');
      UI.dmDraft = '';
      const r = await E.groupSend(d.id, text);
      if (!r && r !== undefined) UI.dmDraft = text;
    });
  A.runGroup = (d) => safe(() => E.groupSend(d.id, ''));
  A.groupSettings = (d) => UI.groupSettings(d.id);
  A.renameGroup = (d) => {
    const g = G.S.groups[d.id];
    g.name = ($('#grename').value || g.name).slice(0, 40);
    G.Store.save();
    UI.closeModal();
    UI.render();
  };
  A.addToGroup = (d) => {
    const g = G.S.groups[d.id];
    const id = $('#gradd').value;
    if (id && !g.members.includes(id)) g.members.push(id);
    G.Store.save();
    UI.groupSettings(d.id);
  };
  A.muteGroup = (d) => {
    const g = G.S.groups[d.id];
    g.muted = !g.muted;
    G.Store.save();
    UI.groupSettings(d.id);
  };
  A.deleteGroup = (d) => {
    if (!confirm('Delete this group chat?')) return;
    E.deleteGroup(d.id);
    UI.groupWith = null;
    UI.closeModal();
    UI.render();
  };

  // ---- scenes
  A.meetup = (d) => UI.meetupModal(d.id);
  A.startScene = (d) =>
    safe(async () => {
      let place = d.place;
      if (place === '__custom') place = ($('#customplace').value || '').trim();
      if (!place) return UI.toast('Where are you meeting?', 'info');
      E.startScene(d.id, place);
      G.S.scenes[d.id].log = G.S.scenes[d.id].log.length ? G.S.scenes[d.id].log : [];
      UI.closeModal();
      UI.sceneDraft = '';
      UI.go('scene', { sceneWith: d.id });
      await E.sceneTurn(d.id, '', true);
    });
  A.resumeScene = (d) => {
    const sc = G.S.scenes[d.id];
    if (sc) sc.active = true;
    UI.closeModal();
    UI.go('scene', { sceneWith: d.id });
  };
  const sceneGo = (id, text) =>
    safe(async () => {
      UI.sceneDraft = '';
      const r = await E.sceneTurn(id, text);
      if (r === null && text) UI.sceneDraft = text;
      UI.render();
      const log = $('#storylog');
      if (log && log.lastElementChild && log.lastElementChild.scrollIntoView) log.lastElementChild.scrollIntoView({ block: 'end' });
    });
  A.sceneSend = (d) => {
    const text = (UI.sceneDraft || '').trim();
    if (!text) return UI.toast('Say or do something — or tap ▶ Flow.', 'info');
    return sceneGo(d.id, text);
  };
  A.sceneFlow = (d) => sceneGo(d.id, '');
  A.sceneDirect = (d) => {
    const text = (UI.sceneDraft || '').trim();
    if (!text) return UI.toast('Type what should happen next, then press 🎬 Direct.', 'info');
    return sceneGo(d.id, '/dir ' + text);
  };
  A.sceneOpt = (d) => sceneGo(UI.sceneWith, d.t);
  A.leaveScene = () => UI.go('messages', { dmWith: UI.sceneWith, groupWith: null });
  A.endScene = (d) => {
    E.endScene(d.id);
    UI.toast('Scene ended — they will remember it.', 'info');
    UI.go('messages', { dmWith: d.id, groupWith: null });
  };

  // ---- custom characters
  A.createChar = () => UI.charModal();
  const charForm = () => ({
    name: $('#cname').value, handle: $('#chandle').value, age: +$('#cage').value, emoji: $('#cemoji').value, role: $('#crole').value,
    followers: +$('#cfollowers').value, bio: $('#cbio').value, personality: $('#cpers').value, secret: $('#csecret').value,
    rel: $('#crel').value, idea: $('#charidea').value,
  });
  A.genChar = () =>
    safe(async () => {
      UI.setBusy('✨ Designing a character…');
      try {
        const d = await E.genNpc($('#charidea').value);
        UI.charModal(Object.assign({}, charForm(), d, { idea: $('#charidea').value }));
      } finally {
        UI.setBusy(false);
      }
    });
  A.saveChar = () =>
    safe(async () => {
      const f = charForm();
      const announce = $('#cannounce').checked;
      const n = E.createCustomNpc(f);
      UI.closeModal();
      UI.toast(`${n.name} joined the world!`, 'good');
      UI.render();
      if (announce)
        await E.director(`A brand-new character just arrived on the platform: ${n.id} (${n.name}, ${n.handle}, ${n.role}). Have them introduce themselves with a post, and have a couple of existing cast members and the crowd react to the newcomer. Their relationship with the player starts as "${f.rel}".`);
    });

  // ---- memory + self test
  A.summarize = () =>
    safe(async () => {
      const n = await G.Memory.run(true, false);
      if (!n) UI.toast('Nothing needs summarising yet.', 'info');
      UI.render();
    });
  A.selftest = () =>
    safe(async () => {
      if (!G.AI.ready()) return UI.toast(G.AI.notReadyMsg(), 'bad');
      if (G.busy || G.SelfTest.running) return;
      let rows = [];
      UI.selftestModal(rows, false);
      try {
        rows = await G.SelfTest.run((r) => UI.selftestModal(r, false));
        UI.selftestModal(rows, true);
      } finally {
        UI.render();
      }
    });

  A.blankWorld = () =>
    safe(async () => {
      const w = P.wiz;
      if (!w.name.trim()) return UI.toast('Give your character a name first (step 3).', 'bad');
      E.createBlankWorld({
        name: w.name.trim(), handle: w.handle.trim() || w.name.trim().split(/\s+/)[0], bio: w.bio.trim(), traits: w.traits, fame: w.fame, emoji: w.emoji,
        worldName: 'My World', premise: w.premise.trim(),
      });
      P.wiz.showWizard = false;
      UI.page = 'people';
      UI.thread = null;
      UI.render();
    });


  /* ================= post types, town, scenarios ================= */

  A.ptype = (d) => {
    UI.ptype = d.t;
    UI.render();
  };
  A.vote = (d) => {
    E.vote(d.id, +d.i);
    UI.render();
  };
  A.popProfile = (d) => UI.popModal(+d.i);
  A.popMeet = (d) =>
    safe(async () => {
      const n = G.Pop.meet(+d.i);
      G.Store.save();
      UI.closeModal();
      UI.toast(`You met ${n.name}!`, 'good');
      if (d.dm) UI.go('messages', { dmWith: n.id, groupWith: null });
      else UI.openProfile(n.id);
      UI.render();
    });
  A.townTab = (d) => {
    UI.townTab = d.t;
    UI.cand = null;
    UI.render();
  };
  A.townGo = (d) => {
    UI.townPage = Math.max(0, UI.townPage + +d.d);
    UI.render();
    window.scrollTo(0, 0);
  };
  A.swipe = (d) => {
    const p = UI.cand;
    const r = G.Pop.swipe(p.idx, d.m);
    if (r.match) {
      UI.toast(`💘 It's a match with ${r.npc.name}! They messaged you.`, 'good');
      G.Store.save();
    } else if (d.m !== 'pass') UI.toast('No match this time…', 'info');
    UI.cand = G.Pop.nextCandidate();
    UI.render();
  };
  A.scenCat = (d) => {
    UI.scenCat = d.k;
    UI.scenRoll = null;
    UI.render();
  };
  A.scenRoll = () => {
    UI.scenRoll = G.Scen.roll({ cat: UI.scenCat });
    UI.render();
  };
  A.scenGo = () =>
    safe(async () => {
      if (!UI.scenRoll) return;
      const text = UI.scenRoll.text;
      UI.scenRoll = null;
      await E.director(`SCENARIO to play out now (fully, with reactions): ${text}`);
      UI.go('home');
    });
  A.stToggleG = (d, e, el) => {
    const g = UI.st.parsed && UI.st.parsed.groups[+d.i];
    if (g) g.include = el.checked;
  };

  /* ---------- delegated listeners ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = A[el.dataset.act];
    if (!fn) return;
    // let buttons nested in clickable cards win over the card
    e.stopPropagation();
    try {
      const result = fn(el.dataset, e, el);
      // Async UI actions must never fail silently. Several flows wait on storage
      // or the network; surface unexpected rejections as a visible error.
      if (result && typeof result.then === 'function') result.catch((err) => {
        console.error('[Clout action]', el.dataset.act, err);
        UI.toast((err && err.message) || 'That action could not be completed.', 'bad');
      });
    } catch (err) {
      console.error('[Clout action]', el.dataset.act, err);
      UI.toast((err && err.message) || 'That action could not be completed.', 'bad');
    }
  });

  const setPath = (path, val) => {
    if (path.startsWith('wiz.')) P.wiz[path.slice(4)] = val;
    else UI[path] = val;
  };

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.bind) {
      setPath(t.dataset.bind, t.value);
      return;
    }
    if (t.dataset && t.dataset.show) {
      const o = document.getElementById(t.dataset.show); // live number next to a slider
      if (o) o.textContent = t.value;
      return;
    }
    if (t.id === 'baseurl') {
      G.settings.baseUrl = t.value.trim();
      G.Store.saveSettings();
    } else if (t.id === 'modelcustom') {
      G.settings.model = t.value.trim();
      G.Store.saveSettings();
    } else if (t.id === 'apikey') {
      G.settings.apiKey = t.value.trim();
      G.Store.saveSettings();
    } else if (t.dataset && t.dataset.setting === 'temperature') {
      G.settings.temperature = +t.value;
      const tv = $('#tempval');
      if (tv) tv.textContent = t.value;
      G.Store.saveSettings();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'provider') {
      const prev = G.AI.PROVIDERS[G.AI.provider()];
      G.settings.provider = t.value;
      G.settings.baseUrl = '';
      const next = G.AI.PROVIDERS[t.value];
      // keep a custom model the user typed; otherwise switch to the new provider's sensible default
      const wasDefault = !G.settings.model || G.settings.model === prev.model || G.Store.MODELS.some((m) => m[0] === G.settings.model);
      if (wasDefault) G.settings.model = next.model;
      G.Store.saveSettings();
      UI.render();
    } else if (t.id === 'modelsel') {
      const cu = $('#modelcustom');
      if (t.value === '__custom') {
        cu.style.display = '';
        cu.focus();
        if (cu.value) G.settings.model = cu.value.trim();
      } else {
        cu.style.display = 'none';
        G.settings.model = t.value;
      }
      G.Store.saveSettings();
    } else if (t.dataset && t.dataset.route) {
      const cls = t.dataset.route;
      if (G.AI.CLASSES.some((c) => c[0] === cls) && (t.value === 'local' || t.value === 'cloud')) {
        G.settings.route = Object.assign({}, G.AI.PRESETS.balanced.route, G.settings.route && typeof G.settings.route === 'object' ? G.settings.route : {}, { [cls]: t.value });
        G.Store.saveSettings();
        const hi = $('#hybridinfo');
        if (hi) hi.innerHTML = P.hybridInfo();
      }
    } else if (t.dataset && t.dataset.pop === 'size') {
      G.S.popSize = +t.value;
      UI.cand = null;
      UI.townPage = 0;
      G.Store.save();
      UI.render();
    } else if (t.dataset && t.dataset.setting) {
      const k = t.dataset.setting;
      const num = t.type === 'range' || (t.tagName === 'SELECT' && t.value !== '' && !isNaN(+t.value));
      G.settings[k] = t.type === 'checkbox' ? t.checked : num ? +t.value : t.value;
      if (k === 'theme') UI.applyTheme();
      if (k === 'feedRate' || k === 'postDial') G.Store.saveSettings(), UI.render();
      if (k === 'spendCap') {
        G.AI.newWindow(); // choosing a limit starts a fresh window from now
        UI.updateSpend();
        UI.render();
      }
      G.Store.saveSettings();
    } else if (t.id === 'newchat') {
      if (t.value) {
        UI.dmWith = t.value;
        UI.groupWith = null;
        UI.render();
      }
    } else if (t.dataset && t.dataset.bind === 'wiz.fame') {
      P.wiz.fame = t.value;
    }
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.id === 'composer' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) A.post();
    else if (t.id === 'replybox' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) A.sendReply({ id: UI.thread });
    else if (t.id === 'dmbox' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (UI.groupWith) A.sendGroup({ id: UI.groupWith });
      else A.sendDm({ id: UI.dmWith });
    } else if (t.id === 'scenebox' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) A.sceneSend({ id: UI.sceneWith });
    else if (t.id === 'searchbox' && e.key === 'Enter') UI.render();
    else if (t.id === 'townq' && e.key === 'Enter') {
      UI.townPage = 0;
      UI.render();
    }
    else if (e.key === 'Escape') UI.closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.classList && e.target.classList.contains('cmtin')) {
      e.preventDefault();
      const go = e.target.parentNode.querySelector('.cmtgo');
      if (go) go.click();
    }
  });

  // leaving the page: write at once (routine saves are rare and idle, so this is where the last changes go)
  const leaving = () => {
    if (G.S) G.Store.save();
    G.Store.flush();
  };
  window.addEventListener('beforeunload', leaving);
  window.addEventListener('pagehide', leaving); // iOS Safari skips beforeunload when the app is swiped away
  // phones/tabs may never fire beforeunload: write to the database whenever the page is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving();
  });

  /* ---------- boot ---------- */

  document.addEventListener('DOMContentLoaded', async () => {
    UI.applyTheme();
    await G.Store.init(); // open the local database (falls back to localStorage if unavailable)
    UI.render(); // first screen as soon as the database is open (the inline splash in index.html covers the wait before this)
    // after the first screen: the heavy language libraries (idle), then the local photo library (needs start.bat)
    const later = (fn, ms) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: ms }) : setTimeout(fn, 200));
    later(() => { if (G.lazy) G.lazy.all(); }, 1500);
    if (G.Media && /^https?:/.test(location.protocol)) {
      later(() => G.Media.load().then(() => {
        const el = document.activeElement;
        const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
        if (G.Media.ready && G.S && !typing && !document.body.classList.contains('modal-open')) UI.render(); // photos can appear now
      }), 1200);
    }
  });
})(window.G);
