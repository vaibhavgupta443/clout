/* Clout — page views (return HTML strings) */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const esc = U.esc;
  const P = (G.Pages = {});

  const PRESETS = [
    ['🧙', 'Wizard school', 'A magical boarding school with rival houses, secret societies, a house-cup feud, crushes, scandals and something sinister in the dungeons. (Or type a franchise like Harry Potter below.)'],
    ['🎤', 'K-pop industry', 'The cutthroat world of K-pop idols and trainees: debut rivalries, dating bans, fan wars, scandals, variety shows and company politics.'],
    ['🏫', 'College drama', 'A big university campus: roommates, frat/sorority feuds, situationships, finals stress, a gossip account that knows everything.'],
    ['🏝️', 'Reality dating house', 'A reality dating show villa: couples forming and exploding, love triangles, recoupling, ex-drama, producers stirring chaos, and fans voting.'],
    ['🎬', 'Hollywood & influencers', 'Influencers, actors and tabloid journalists in Los Angeles: brand deals, secret relationships, feuds, leaked DMs, PR crises.'],
    ['🥷', 'Anime hero academy', 'A hero academy with rival classes, a tournament arc, mysterious villains, intense friendships and rivalries, and a ranking board.'],
    ['🚀', 'Startup & tech Twitter', 'Founders, VCs, hustle-bros and burned-out engineers feuding over funding rounds, layoffs, hot takes and a rival launch.'],
    ['🧛', 'Supernatural town', 'A small town secretly full of vampires, werewolves, witches and humans who keep suspicious secrets; love triangles and old grudges.'],
    ['🌆', 'Cyberpunk city', 'A neon megacity: streamers, hackers, corp-sponsored idols, street gangs and an AI nobody trusts, all fighting for clout.'],
    ['🌍', 'Everyday influencer life', 'A realistic influencer scene in a big city: creators, brand reps, haters, collab drama, exes and a tabloid page that watches everyone.'],
  ];
  const TRAITS = ['Funny', 'Charming', 'Mysterious', 'Chaotic', 'Kind', 'Savage', 'Nerdy', 'Dramatic', 'Shy', 'Ambitious', 'Flirty', 'Petty'];
  const TONES = [
    ['', '✍️ Natural'], ['funny', '😂 Funny'], ['spicy', '🌶️ Spicy'], ['savage', '🐍 Savage'], ['flirty', '😏 Flirty'],
    ['wholesome', '🥰 Wholesome'], ['vulnerable', '🥺 Vulnerable'], ['chaotic', '🌀 Chaotic'], ['mysterious', '🕶️ Mysterious'],
  ];
  const EMOJIS = ['😎', '🤩', '😈', '🦄', '🔥', '👑', '🌸', '🐺', '🎧', '🧿', '🥷', '🐱'];

  P.PRESETS = PRESETS;
  P.wiz = { premise: PRESETS[0][2], name: '', handle: '', bio: '', traits: [], fame: 'nobody', emoji: '😎', showWizard: false, loading: false, cast: '', exact: 'no', size: 'medium', note: '', lore: '' };

  /* ---------- start / wizard ---------- */

  P.start = function () {
    const s = G.settings;
    const saves = G.Store.list();
    if (P.wiz.showWizard || !saves.length) return P.wizard();
    return `<div class="start">
      <div class="hero"><div class="bigicon">☁️</div><h1>Clout</h1><p>The social-media life sim. No energy bars. Unlimited posts. Build relationships, start drama, make enemies, grow a huge audience.</p></div>
      <div class="card"><h3>Your worlds</h3>
        ${saves
          .map(
            (w) => `<div class="save"><div><b>${esc(w.name)}</b><div class="muted small">${esc(w.player)} · ${U.fmt(w.followers)} followers · day ${w.day}</div></div>
          <div class="row"><button class="btn primary" data-act="loadWorld" data-id="${w.id}">▶ Continue</button><button class="btn ghost" data-act="delWorld" data-id="${w.id}" title="Delete">🗑</button></div></div>`
          )
          .join('')}
        <div class="row" style="margin-top:12px"><button class="btn primary" data-act="newWizard">✨ New world</button>
        <button class="btn" data-act="importWorld">📥 Import save</button>${G.AI.ready() ? '' : '<span class="muted small">Set up your AI in the wizard.</span>'}</div>
      </div></div>`;
  };

  P.wizard = function () {
    const w = P.wiz;
    const s = G.settings;
    return `<div class="start wide">
      <div class="hero small"><div class="bigicon">☁️</div><h1>New world</h1></div>
      <div class="card"><h3>1 · AI</h3>${P.providerBlock(false)}</div>
      <div class="card"><h3>2 · The world</h3>
        <div class="presets">${PRESETS.map(
          (p) => `<button class="preset ${w.premise === p[2] ? 'on' : ''}" data-act="preset" data-i="${PRESETS.indexOf(p)}"><span>${p[0]}</span>${p[1]}</button>`
        ).join('')}</div>
        <label>Premise — or type ANY fandom / universe / idea <span class="muted small">(Harry Potter, Naruto, Marvel, Love Island, your own idea…)</span></label>
        <textarea data-bind="wiz.premise" rows="3">${esc(w.premise)}</textarea>
      </div>
      <div class="card"><h3>2b · Your story & cast <span class="muted small">(optional: you decide who is in it)</span></h3>
        <label>Characters I want <span class="muted small">(one per line: name — who they are. Add relationships, looks, secrets, how they type…)</span></label>
        <textarea data-bind="wiz.cast" rows="5" placeholder="Mia Cole — 24, bubbly barista, secretly writes songs, has a crush on the player\nRae Okafor — 31, owns the Moon Bar, cold, hates the player, knows a secret about Mia\nDex — gossip podcaster, types in all caps">${esc(w.cast)}</textarea>
        <div class="grid2"><div><label>Who else lives there</label><select data-bind="wiz.exact"><option value="no" ${w.exact !== 'yes' ? 'selected' : ''}>Add more characters around mine</option><option value="yes" ${w.exact === 'yes' ? 'selected' : ''}>Only the characters I listed</option></select></div>
        <div><label>Size of the cast</label><select data-bind="wiz.size"><option value="small" ${w.size === 'small' ? 'selected' : ''}>Small (7-8)</option><option value="medium" ${w.size === 'medium' ? 'selected' : ''}>Medium (12-14)</option><option value="large" ${w.size === 'large' ? 'selected' : ''}>Large (15-18)</option></select></div></div>
        <label>Author's Note <span class="muted small">(standing rules the AI follows all game long)</span></label>
        <textarea data-bind="wiz.note" rows="2" placeholder="Slow-burn romance. Everyone stays in character. Never reveal the cafe secret before day 5.">${esc(w.note)}</textarea>
        <label>World Info <span class="muted small">(one per line: keyword, keyword: fact. Joins the AI's memory whenever those words come up)</span></label>
        <textarea data-bind="wiz.lore" rows="3" placeholder="Moon Bar, Rae: the Moon Bar is where everyone goes after midnight\n*: the whole town knows the mayor is cheating">${esc(w.lore)}</textarea></div>
      <div class="card"><h3>3 · You</h3>
        <div class="grid2"><div><label>Name</label><input data-bind="wiz.name" value="${esc(w.name)}" placeholder="Nova Reyes"></div>
        <div><label>Handle</label><input data-bind="wiz.handle" value="${esc(w.handle)}" placeholder="@nova"></div></div>
        <label>Bio <span class="muted small">(optional — AI writes one if blank)</span></label>
        <input data-bind="wiz.bio" value="${esc(w.bio)}" placeholder="chaos coordinator. professional overthinker.">
        <label>Avatar</label><div class="row wrap">${EMOJIS.map((e) => `<button class="emo ${w.emoji === e ? 'on' : ''}" data-act="pickEmoji" data-e="${e}">${e}</button>`).join('')}</div>
        <label>Personality</label><div class="row wrap">${TRAITS.map((t) => `<button class="pill ${w.traits.includes(t) ? 'on' : ''}" data-act="toggleTrait" data-t="${t}">${t}</button>`).join('')}</div>
        <label>Starting fame</label>
        <select data-bind="wiz.fame">${Object.entries(G.Engine.FAME).map(([k, v]) => `<option value="${k}" ${w.fame === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      </div>
      <div class="row center">
        <button class="btn primary big" data-act="createWorld" ${w.loading ? 'disabled' : ''}>${w.loading ? '⏳ Generating your world… (10–30s)' : '🚀 Create world'}</button>
        <button class="btn" data-act="blankWorld" title="No AI call: makes an empty world you can fill in yourself">Start with an empty world</button>
        ${G.Store.list().length ? '<button class="btn ghost" data-act="cancelWizard">Back</button>' : ''}
      </div></div>`;
  };

  const LOCAL_HELP = {
    ollama: 'Install Ollama, run <code>ollama pull &lt;model&gt;</code>, and start it with <code>OLLAMA_ORIGINS=*</code> so this page may connect. Free, private, no filters.',
    lmstudio: "Load a model in LM Studio, open the Developer tab, start the local server and enable CORS. Free, private, no filters.",
    koboldcpp: 'Launch KoboldCpp with your GGUF model; its OpenAI-compatible API is served at /v1. Free, private, no filters.',
    custom: 'Any server that implements /v1/chat/completions (text-generation-webui, vLLM, llama.cpp server…).',
  };
  // provider + address + key + model (shared by the wizard and Settings)
  P.providerBlock = function (withSave) {
    const s = G.settings;
    const prov = G.AI.provider();
    const pr = G.AI.PROVIDERS[prov];
    const local = prov !== 'openrouter';
    return `<label>AI provider</label>
      <select id="provider">${Object.entries(G.AI.PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === prov ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <label>Server address <span class="muted small">${local ? '(your computer — nothing leaves it)' : '(OpenRouter default — leave blank)'}</span></label>
      <input id="baseurl" value="${esc(s.baseUrl || '')}" placeholder="${esc(pr.base || 'http://localhost:8000/v1')}" autocomplete="off" spellcheck="false">
      <label>API key <span class="muted small">${local ? '(usually not needed for local servers)' : '(stays in this browser, only sent to openrouter.ai)'}</span></label>
      <div class="row"><input type="password" id="apikey" placeholder="${local ? 'leave empty' : 'sk-or-v1-…'}" value="${esc(s.apiKey)}" autocomplete="off" spellcheck="false" class="grow">${withSave ? '<button class="btn" data-act="saveKey">Save</button>' : ''}</div>
      <label>Model</label>${P.modelSelect()}
      ${local ? `<div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="detectModels">🔎 Detect models on my server</button></div><p class="muted small">${LOCAL_HELP[prov]}</p>` : ''}`;
  };

  P.modelSelect = function () {
    const s = G.settings;
    if (G.AI.isLocal()) {
      return `<input id="modelcustom" list="modellist" placeholder="model name, e.g. ${esc(G.AI.PROVIDERS[G.AI.provider()].model || 'my-model')}" value="${esc(s.model)}" autocomplete="off" spellcheck="false"><datalist id="modellist"></datalist>`;
    }
    const known = G.Store.MODELS.some((m) => m[0] === s.model);
    return `<select id="modelsel">${G.Store.MODELS.map((m) => `<option value="${m[0]}" ${s.model === m[0] ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}<option value="__custom" ${known ? '' : 'selected'}>Custom model id…</option></select>
      <input id="modelcustom" list="modellist" placeholder="vendor/model-name" value="${known ? '' : esc(s.model)}" style="${known ? 'display:none' : ''}">
      <datalist id="modellist"></datalist>`;
  };

  /* ---------- chrome ---------- */

  // the world controls (speed, refresh, time): in the top bar on desktop, inside the "More" sheet on phones
  P.controls = function () {
    const can = G.Engine.undoStack.length > 0;
    const acting = G.S.activeAlt ? G.Engine.activeAlt() : null;
    return `${acting ? `<button class="btn sm primary" data-act="adminStop" title="Stop acting as ${esc(acting.name)}">🎭 ${esc(G.U.first(acting.name))} ✕</button>` : ''}<button class="btn sm ${G.S.admin ? 'primary' : 'ghost'}" data-act="nav" data-page="admin" title="Admin / command center: act as anyone, edit anything">🛠</button>${can ? '<button class="btn sm ghost" data-act="undo" title="Undo the last turn">↩</button><button class="btn sm ghost" data-act="retry" title="Undo and re-roll the last turn">🎲</button>' : ''}
        <select class="actsel" data-setting="postDial" title="How often they make their OWN posts">${G.World.POST_DIAL.map(([v, l]) => `<option value="${v}" ${Math.abs(G.World.postDial() - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="actsel" data-setting="feedRate" title="How much the cast posts and does on its own">${G.World.RATES.map(([v, l]) => `<option value="${v}" ${Math.abs(G.World.feedRate() - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm clockchip" data-act="clockOpen" title="Game time: tap for the clock, appointments and time controls">${G.Clock ? G.Clock.chip() : ''}</button><span class="speed" title="How fast the world moves while you watch">${[['0', '⏸'], ['1', '▶'], ['2', '⏩'], ['3', '⚡']].map(([v, ic]) => `<button class="${String(G.settings.worldSpeed != null ? G.settings.worldSpeed : 2) === v ? 'on' : ''}" data-act="speed" data-v="${v}">${ic}</button>`).join('')}</span>
        <button class="btn sm" data-act="advance" data-k="refresh" title="Let a little time pass and see what everyone is doing">🔄 Refresh</button>
        <button class="btn sm" data-act="advance" data-k="hours">⏳ +6h</button>
        <button class="btn sm" data-act="advance" data-k="day">🌙 Day</button>`;
  };

  P.topbar = function () {
    const S = G.S;
    const bc = UI.badgeCounts();
    const mi = (pg, ic) => `<button class="mi" data-act="nav" data-page="${pg}" title="${pg}">${UI.icon(ic, 26)}${bc[pg] ? `<i class="badge">${bc[pg] > 99 ? '99+' : bc[pg]}</i>` : ''}</button>`;
    return `<header id="topbar"><div class="mhead"><b class="mlogo" data-act="nav" data-page="home">Clout</b><span class="mact">${mi('notifs', 'notifs')}${mi('messages', 'messages')}</span></div>
      <div class="tb-info"><b>${esc(S.world.name)}</b><div class="muted small">${S.storyDate ? esc(S.storyDate) + ' · ' : ''}${U.clockStr(S.clock)} · 💰 $${U.fmt(S.player.cash)}</div></div>
      <div class="row wrap end tb-ctl">${P.controls()}</div></header>`;
  };

  P.side = function () {
    const S = G.S;
    const p = S.player;
    const need = G.Engine.xpNeeded(p.level);
    const tr = S.trending
      .slice(0, 6)
      .map((t, i) => `<div class="trend" data-act="tag" data-tag="${esc(t.tag)}"><span class="muted small">${i + 1} · Trending</span><b>${esc(t.tag)}</b></div>`)
      .join('');
    const hot = S.storylines
      .filter((s) => s.status !== 'resolved')
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 3)
      .map((s) => `<div class="trend" data-act="nav" data-page="drama"><span class="muted small">🔥 ${s.heat} heat</span><b>${esc(s.title)}</b></div>`)
      .join('');
    return `<div class="card mini"><div class="row between"><b>${esc(p.name)}</b><span class="chip gray">Lv ${p.level}</span></div>
        <div class="muted small">${esc(p.handle)}${p.verified ? ' ✔' : ''}</div>
        <div class="bigstat">${U.fmt(p.followers)} <span class="muted small">followers</span></div>
        <div class="small" style="margin-bottom:6px">💰 <b>$${U.fmt(p.cash)}</b> <span class="muted">· 🏆 ${Object.keys(S.ach || {}).length}/${G.Engine.ACH.length}</span></div>
        ${UI.bar('XP', p.xp, need, 'blue')}
        ${UI.bar('Fans', p.audience.love, 100, 'green')}
        ${UI.bar('Haters', p.audience.hate, 100, 'red')}
        ${UI.bar('🔥 Heat', p.heat, 100, 'amber')}</div>
      <div class="card mini"><h4>Trending</h4>${tr || '<div class="muted small">Nothing trending yet.</div>'}</div>
      ${hot ? `<div class="card mini"><h4>Hot drama</h4>${hot}</div>` : ''}`;
  };

  /* ---------- home / feed ---------- */

  P.composer = function (opts = {}) {
    const loading = UI.suggestLoading;
    const activeAlt = G.S.npcs[G.S.activeAlt];
    return `<div class="composer">
      <div>${UI.avatar(activeAlt || 'me', 46)}</div>
      <div class="cbody">
        <div class="row between"><span class="muted small">Posting as <b>${esc(activeAlt ? activeAlt.name : G.S.player.name)}</b></span><button class="btn sm" data-act="altAccounts">${activeAlt ? 'Switch account' : '＋ Burner account'}</button></div>
        <textarea id="composer" data-bind="draft" rows="3" maxlength="500" placeholder="${esc(opts.ph || "What's happening?")}"></textarea>
        <div class="tones">${P.POST_TYPES.map((t) => `<button class="pill ${UI.ptype === t[0] ? 'on' : ''}" data-act="ptype" data-t="${t[0]}">${t[0] === 'photo' ? UI.icon('camera', 16) + ' Photo' : t[1]}</button>`).join('')}</div>
        ${P.typeExtras()}
        <div class="tones">${TONES.map((t) => `<button class="pill ${UI.tone === t[0] ? 'on' : ''}" data-act="tone" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
        <div class="row between">
          <div class="row"><button class="btn" data-act="tagPick" data-for="composer" title="Tag someone with @">＠ Tag</button><button class="btn" data-act="suggest" ${loading ? 'disabled' : ''}>${loading ? '⏳ thinking…' : '✨ Ideas'}</button>
          <button class="btn ${UI.audience === 'close' ? 'primary' : ''}" data-act="audience" title="${UI.audience === 'close' ? 'Close friends only: tap to post to everyone' : 'Tap to post only to your close friends'}">💚${UI.audience === 'close' ? ' Close friends' : ''}</button><button class="btn" data-act="goLiveModal" title="Stream live to your followers">🔴 Live</button></div>
          <button class="btn primary" data-act="post">Post</button>
        </div>
        ${UI.suggestions && !opts.noSuggest ? P.suggestBox() : ''}
      </div></div>`;
  };

  P.POST_TYPES = [['text', '✍️ Post'], ['photo', 'Photo'], ['video', '🎥 Video'], ['poll', '📊 Poll'], ['story', '⏳ Story'], ['confession', '🤫 Confession'], ['announce', '📢 Announce'], ['meme', '😂 Meme'], ['giveaway', '🎁 Giveaway'], ['ama', '❓ AMA']];

  P.typeExtras = function () {
    const t = UI.ptype || 'text';
    if (['photo', 'video', 'meme'].includes(t))
      return `<input class="attach-in" data-bind="attach" value="${esc(UI.attach || '')}" maxlength="240" placeholder="Describe the ${t === 'video' ? 'video' : 'photo'} — the AI reads this…">`;
    if (t === 'poll')
      return `<div class="pollin">${[0, 1, 2].map((i) => `<input data-bind="poll${i}" value="${esc(UI['poll' + i] || '')}" maxlength="60" placeholder="Option ${i + 1}${i < 2 ? '' : ' (optional)'}">`).join('')}</div>`;
    return '';
  };

  P.suggestBox = function () {
    return `<div class="suggest">${UI.suggestions
      .map((o, i) => `<button class="sug" data-act="useSuggestion" data-i="${i}"><span class="chip gray">${esc(o.tone || '')}</span> ${esc(o.text)}</button>`)
      .join('')}<button class="btn ghost sm" data-act="closeSuggest">close</button></div>`;
  };

  P.eventCards = function () {
    return G.S.events
      .filter((e) => !e.resolved)
      .map(
        (e) => `<div class="card event"><div class="muted small">Event</div><h3>${esc(e.title)}</h3><p>${U.rich(e.text)}</p>
        <div class="col">${e.options.map((o, i) => `<button class="btn" data-act="choose" data-id="${e.id}" data-i="${i}">${esc(o)}</button>`).join('')}</div>
        <div class="row wrap" style="margin-top:8px;gap:6px"><button class="btn sm ghost" data-act="eventContinue" data-id="${e.id}" title="Let it play out on its own: you step back">▶ Let it play out</button><button class="btn sm ghost" data-act="eventDecline" data-id="${e.id}" title="Turn it down: it is dismissed and costs nothing">✕ Decline</button></div></div>`
      )
      .join('');
  }

  P.feedPosts = function () {
    const S = G.S;
    const q = UI.search.trim().toLowerCase();
    let list = S.postOrder.map((id) => S.posts[id]).filter((p) => p && !p.replyTo);
    list = list.filter((p) => {
      const n = S.npcs[p.author];
      return !(n && (n.blocked || (n.muted && !n.userAlt)));
    });
    // You own this world, so close-friends posts are always visible to you (marked 💚, or 💚👁 when you are not on their list). Only the characters are kept out of what is not theirs.
    if (UI.feedTab === 'following') {
      const f = new Set(S.player.following.concat('me', Object.values(S.npcs).filter((n) => n.userAlt).map((n) => n.id)));
      list = list.filter((p) => f.has(p.author));
    } else if (UI.feedTab === 'drama') {
      const live = new Set(S.storylines.filter((s) => s.status !== 'resolved').flatMap((s) => s.participants));
      list = list.filter((p) => p.buzz >= 7 || (live.has(p.author) && p.buzz >= 4) || (p.judge && p.judge.c >= 6));
    } else if (UI.feedTab === 'mine') {
      list = list.filter((p) => p.author === 'me' || !!(S.npcs[p.author] && S.npcs[p.author].userAlt));
    }
    if (q) list = list.filter((p) => p.text.toLowerCase().includes(q) || UI.nameOf(p).name.toLowerCase().includes(q));
    const arrival = new Map(S.postOrder.map((id, i) => [id, i]));
    const byArrival = (a, b) => (arrival.get(b.id) || 0) - (arrival.get(a.id) || 0);
    if (UI.feedTab === 'foryou') {
      // light algorithm: recency + buzz + your own posts; whatever JUST arrived (the last 6 posts, or under 3 game hours old) is always pinned on top
      const now = S.clock;
      const top = S.postOrder.length - 6;
      const fresh = (p) => (arrival.get(p.id) || 0) >= top || now - p.t < 180;
      const a1 = list.filter(fresh).sort(byArrival);
      const rest = list.filter((p) => !fresh(p)).sort((a, b) => score(b, now) - score(a, now));
      list = a1.concat(rest);
    } else list.sort(byArrival);
    return list;
  };
  const score = (p, now) => -(now - p.t) / 60 + p.buzz * 0.6 + (p.author === 'me' || (G.S.npcs[p.author] && G.S.npcs[p.author].userAlt) ? 3 : 0) + Math.log10(p.stats.likes + 10);

  // on an iPhone in Safari (not yet installed): show how to put Clout on the Home Screen
  P.iosTip = function () {
    if (typeof navigator === 'undefined' || G.settings.iosTipDismissed) return '';
    const ua = navigator.userAgent || '';
    const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
    if (!ios || standalone) return '';
    return `<div class="card tipcard"><span class="tipic">📲</span><div class="grow"><b>Install Clout on your iPhone</b><div class="small muted">Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>. It opens full-screen like a real app.</div></div>${UI.ibtn('x', 'Dismiss', 'data-act="dismissIosTip"')}</div>`;
  };

  // the update cards: what is waiting for you (events, new people, offers, suggestions, around town, tips). They live on the Alerts page, not on the main page.
  P.hub = function () {
    const S = G.S;
    const rc = S.recap;
    const recap = rc && rc.minutes
      ? `<div class="card recap"><div class="row between"><b>☀️ While you were away</b>${UI.ibtn('x', 'Dismiss', 'data-act="dismissRecap"')}</div>
          <p class="small">About ${rc.minutes >= 120 ? Math.round(rc.minutes / 60) + ' hours' : rc.minutes + ' minutes'} passed in-game: <b>${rc.posts}</b> new post${rc.posts === 1 ? '' : 's'} · <b>${rc.replies || 0}</b> repl${rc.replies === 1 ? 'y' : 'ies'} · <b>${rc.stories}</b> stor${rc.stories === 1 ? 'y' : 'ies'} · <b>${rc.dms}</b> new message${rc.dms === 1 ? '' : 's'}${rc.followers ? ' · ' + (rc.followers > 0 ? '+' : '') + rc.followers + ' followers' : ''}.</p>
          ${G.Recap ? G.Recap.html(rc) : ''}${(rc.events || []).map((e) => `<div class="small muted">• ${esc(e)}</div>`).join('')}</div>`
      : '';
    return `<div class="hub">${P.iosTip()}${recap}${G.Rhythm ? G.Rhythm.card() : ''}${S.welcome ? `<div class="card welcome"><div class="row between"><b>Welcome to ${esc(S.world.name)}</b>${UI.ibtn('x', 'Dismiss', 'data-act="dismissWelcome"')}</div><p>${esc(S.welcome)}</p><p class="muted small">${esc(S.world.setting)}</p></div>` : ''}
      ${P.eventCards()}
      ${G.Leads ? G.Leads.strip() : ''}
      ${G.Fame ? G.Fame.strip() : ''}
      ${G.Seasons ? G.Seasons.strip() : ''}
      ${G.settings.legacyHome ? (G.Pitches ? G.Pitches.strip() : '') : (P.sugRow ? P.sugRow() : '')}</div>`;
  };

  P.home = function () {
    if (UI.thread) return P.threadView();
    const S = G.S;
    const list = P.feedPosts();
    const tabs = [['latest', '🕒 Latest'], ['foryou', 'For you'], ['following', 'Following'], ['drama', '🔥 Drama'], ['mine', 'My posts']];
    const legacy = !!G.settings.legacyHome; // (old layout: the composer and the update cards on Home)
    return `${UI.storiesTray()}${legacy ? P.hub() + P.composer() : ''}
      <div class="tabs">${tabs.map((t) => `<button class="${UI.feedTab === t[0] ? 'on' : ''}" data-act="feedTab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
      ${list.slice(0, UI.feedLimit).map((p) => UI.postHTML(p, { preview: true })).join('') || '<div class="empty">Nothing here yet. Post something, or hit 🔄 Refresh!</div>'}
      ${list.length > UI.feedLimit ? '<button class="btn wide" data-act="moreFeed">Show more</button>' : ''}`;
  };

  /* ---------- thread ---------- */

  P.threadView = function () {
    const S = G.S;
    const root = S.posts[UI.thread];
    if (!root) {
      UI.thread = null;
      return P.home();
    }
    const chain = [];
    let c = root;
    while (c.replyTo && S.posts[c.replyTo] && chain.length < 5) {
      c = S.posts[c.replyTo];
      chain.unshift(c);
    }
    const renderKids = (id, depth) => {
      const kids = UI.kidsOf(id)
        .slice()
        .sort((a, b) => (b.author !== 'crowd') - (a.author !== 'crowd') || b.stats.likes - a.stats.likes);
      return kids
        .map((k) => UI.postHTML(k, { depth }) + (depth < 3 ? renderKids(k.id, depth + 1) : ''))
        .join('');
    };
    const total = UI.kidsOf(root.id).length;
    return `<div class="row between" style="margin-bottom:8px"><button class="btn ghost" data-act="back">← Back</button>
        <button class="btn sm" data-act="moreReplies" data-id="${root.id}">💬 Load more replies</button></div>
      ${chain.map((p) => UI.postHTML(p, { thread: false })).join('')}
      <div class="rootpost">${UI.postHTML(root, { thread: true })}</div>
      <div class="composer slim"><div>${UI.avatar(UI.acting() || 'me', 38)}</div><div class="cbody">
        ${P.actingBar('Replying as')}
        <textarea id="replybox" data-bind="replyDraft" rows="2" maxlength="500" placeholder="Reply…"></textarea>
        <div class="row between"><span class="row"><button class="btn" data-act="tagPick" data-for="replybox" title="Tag someone with @">＠ Tag</button><button class="btn" data-act="suggestReply" data-id="${root.id}">${UI.suggestLoading ? '⏳' : '✨ Ideas'}</button></span><button class="btn primary" data-act="sendReply" data-id="${root.id}">Reply</button></div>
        ${UI.suggestions ? P.suggestBox() : ''}</div></div>
      <div class="muted small" style="margin:8px 4px">${U.fmt(Math.max(root.stats.replies, total))} replies · ${total} loaded</div>
      ${renderKids(root.id, 1) || '<div class="empty">No replies yet.</div>'}`;
  };

  /* ---------- explore ---------- */

  P.explore = function () {
    const S = G.S;
    const q = UI.search.trim();
    const ql = q.toLowerCase();
    const results = q ? P.feedPosts().slice(0, 40) : [];
    const people = Object.values(S.npcs)
      .filter((n) => !n.blocked && (!q || n.name.toLowerCase().includes(ql) || n.handle.includes(ql) || n.bio.toLowerCase().includes(ql)))
      .sort((a, b) => b.followers - a.followers);
    return `<div class="searchbar"><input id="searchbox" data-bind="search" placeholder="Search" value="${esc(UI.search)}"></div>
      ${
        q
          ? `<h4 class="sect">Posts matching “${esc(q)}”</h4>${results.map((p) => UI.postHTML(p, { preview: true })).join('') || '<div class="empty">No posts found.</div>'}`
          : `${P.mosaic()}<h4 class="sect">Trending now</h4>${
              S.trending.map((t, i) => `<div class="trend big" data-act="tag" data-tag="${esc(t.tag)}"><span class="muted small">${i + 1} · Trending</span><b>${esc(t.tag)}</b><span class="muted small">${esc(String(t.why || 'Trending in the world').slice(0, 70))} · 🔥 ${t.heat}</span></div>`).join('') ||
              '<div class="empty">Nothing trending yet — post or refresh the world.</div>'
            }`
      }
      <h4 class="sect">People</h4>
      <div class="people-list">${people.slice(0, q ? 30 : 20).map((n) => P.personRow(n)).join('')}</div>`;
  };

  P.personRow = (n) => {
    const f = UI.following(n.id);
    return `<div class="prow"><div data-act="profile" data-id="${n.id}">${UI.avatar(n, 46)}</div>
      <div class="grow" data-act="profile" data-id="${n.id}"><b>${esc(n.name)}</b> ${UI.chip(n.status, n)}<div class="muted small">${esc(n.handle)} · ${U.fmt(n.followers)} followers</div><div class="small">${esc(n.bio)}</div></div>
      <button class="btn sm follow ${f ? 'ghost' : 'soft'}" data-act="follow" data-id="${n.id}">${f ? 'Following' : 'Follow'}</button></div>`;
  };

  /* ---------- notifications ---------- */

  // where tapping an alert takes you: the alert can name its own action ({act, data}); otherwise what it is about; otherwise a sensible page for its kind
  P.notifTarget = (n) => {
    if (n.act) return `data-act="${esc(n.act)}"${Object.entries(n.data || {}).map(([k, v]) => ` data-${esc(k)}="${esc(v)}"`).join('')}`;
    if (n.postId) return `data-act="thread" data-id="${n.postId}"`;
    if (n.groupId) return `data-act="openGroup" data-id="${n.groupId}"`;
    if (n.npcId) return `data-act="${n.type === 'dm' ? 'openChat' : 'profile'}" data-id="${n.npcId}"${n.alt ? ` data-alt="${n.alt}"` : ''}`;
    if (n.storyId) return 'data-act="nav" data-page="drama"';
    const page = { dm: 'messages', rel: 'messages', level: 'me', follow: 'me', cash: 'me', drama: 'drama', event: 'home', viral: 'home', mention: 'home', reply: 'home' }[n.type] || 'home';
    return `data-act="nav" data-page="${page}"`;
  };
  P.notifs = function () {
    const S = G.S;
    const ic = { reply: '💬', mention: '📣', follow: '👥', viral: '🚀', rel: '💞', dm: '✉️', drama: '🔥', event: '⚡', level: '⭐' };
    setTimeout(() => {
      let ch = false;
      S.notifs.forEach((n) => {
        if (!n.read) {
          n.read = true;
          ch = true;
        }
      });
      if (ch) G.Store.saveSoon();
    }, 600);
    return `${G.settings.legacyHome ? '' : P.hub()}<h4 class="sect">Notifications</h4>${
      S.notifs
        .map((n) => {
          const act = P.notifTarget(n);
          return `<div class="notif ${n.read ? '' : 'unread'}" ${act}><span class="nic">${ic[n.type] || '🔔'}</span><div class="grow">${esc(n.text)}<div class="muted small">${U.ago(S.clock, n.t)}</div></div></div>`;
        })
        .join('') || '<div class="empty">No notifications yet.</div>'
    }`;
  };

  /* ---------- messages (DMs + group chats) ---------- */

  // "Posting as / Messaging as / Replying as" strip, only shown once a burner account exists
  P.actingBar = (label) => {
    const S = G.S;
    if (!Object.values(S.npcs).some((n) => n.userAlt)) return '';
    const a = UI.acting();
    return `<div class="actbar small">🎭 ${label} <b>${esc(a ? a.name : S.player.name)}</b> <button class="btn sm ghost" data-act="altAccounts">Switch</button></div>`;
  };

  // the secondary tools of a chat live in one quiet "more" menu (a plain <details>: the buttons stay in the page, nothing is lost)
  P.moreMenu = (inner) => `<details class="manage chatmore"><summary title="More" aria-label="More tools">${UI.icon('more', 20)}</summary><span class="mpop">${inner}</span></details>`;

  P.messages = function () {
    const S = G.S;
    const alt = UI.acting();
    const store = alt ? (S.altDms && S.altDms[alt.id]) || {} : S.dms; // a burner account has its own, separate chats
    const convos = Object.keys(store)
      .filter((id) => S.npcs[id] && !S.npcs[id].userAlt && !(alt && id === alt.id) && store[id].length)
      .map((id) => ({ n: S.npcs[id], last: store[id][store[id].length - 1], unread: store[id].filter((m) => m.from !== 'me' && !m.read).length }))
      .sort((a, b) => b.last.t - a.last.t);
    const groups = Object.values(S.groups).sort((a, b) => ((b.msgs[b.msgs.length - 1] || {}).t || b.created) - ((a.msgs[a.msgs.length - 1] || {}).t || a.created));
    const glist = groups
      .map((g) => {
        const last = g.msgs[g.msgs.length - 1];
        const unread = g.msgs.filter((m) => m.from !== 'me' && !m.read).length;
        return `<div class="convo ${UI.groupWith === g.id ? 'on' : ''}" data-act="openGroup" data-id="${g.id}"><div class="avatar gav" style="width:42px;height:42px">👥</div><div class="grow"><b>${esc(g.name)}</b><div class="muted small ellip">${last ? esc((last.from === 'me' ? 'You' : (S.npcs[last.from] || {}).name || '?') + ': ' + last.text) : g.members.length + ' members'}</div></div>${unread ? `<i class="badge static">${unread}</i>` : ''}</div>`;
      })
      .join('');
    const list = convos
      .map(
        (c) => `<div class="convo ${UI.dmWith === c.n.id && !UI.groupWith ? 'on' : ''}" data-act="openChat" data-id="${c.n.id}"><div class="avwrap">${UI.avatar(c.n, 42)}${P.presenceDot(c.n)}</div><div class="grow"><b>${esc(c.n.name)}</b><div class="muted small ellip">${c.last.from === 'me' ? 'You: ' : ''}${esc(c.last.text)}</div></div>${c.unread ? `<i class="badge static">${c.unread}</i>` : ''}</div>`
      )
      .join('');
    let chat = '<div class="empty">Select a conversation, or start a new one 👇</div>';
    if (UI.groupWith && S.groups[UI.groupWith]) {
      const g = S.groups[UI.groupWith];
      chat = `<div class="chathead"><div class="avatar gav" style="width:40px;height:40px">👥</div><div class="grow"><b>${esc(g.name)}</b><div class="muted small">${g.members.map((id) => esc((S.npcs[id] || {}).name || id)).join(', ')}</div></div>${UI.ibtn('sliders', 'Group settings', `data-act="groupSettings" data-id="${g.id}"`)}</div>
        <div class="chatlog" id="chatlog">${
          g.msgs
            .map((m) => {
              const n = S.npcs[m.from];
              return `<div class="bubble ${m.from === 'me' ? 'me' : 'them'}">${m.from === 'me' ? '' : `<b class="who" data-act="profile" data-id="${m.from}">${esc(n ? n.name : '?')}</b>`}${esc(m.text)}<span>${U.ago(S.clock, m.t)}</span></div>`;
            })
            .join('') || '<div class="empty">Say something to get the chat going 👋</div>'
        }</div>
        <div class="chatinput"><textarea id="dmbox" data-bind="dmDraft" rows="2" maxlength="600" placeholder="Message the group…"></textarea>
        <div class="col">${P.moreMenu('<button data-act="runGroup" data-id="' + g.id + '" title="Let the chat carry on by itself">💤 Let the chat carry on</button>')}<button class="btn primary" data-act="sendGroup" data-id="${g.id}">Send</button></div></div>`;
    } else if (UI.dmWith && S.npcs[UI.dmWith]) {
      const n = S.npcs[UI.dmWith];
      const pres = G.Persona ? G.Persona.presence(n, S.clock) : '';
      const presTxt = { online: 'Active now', away: 'Active recently', offline: 'Offline' }[pres] || '';
      // a reply that lands while you watch the chat comes in after a short typing bubble (never when you open the chat, never when one was already showing)
      const all = store[n.id] || [];
      const ck = n.id + '|' + (alt ? alt.id : '');
      let cp = UI._chatPrev;
      if (!cp || cp.key !== ck) cp = UI._chatPrev = { key: ck, count: all.length, until: 0, typing: false };
      let holding = false;
      if (cp.until && Date.now() < cp.until) holding = true;
      else if (UI.canMove && UI.canMove() && !cp.until && all.length > cp.count && !cp.typing && all.slice(cp.count).every((m) => m.from !== 'me')) {
        cp.until = Date.now() + 650 + (U.hash(all[all.length - 1].text || 'x') % 550);
        holding = true;
        setTimeout(() => { if (UI._chatPrev === cp && UI.page === 'messages') UI.render(); }, cp.until - Date.now() + 30);
      }
      if (!holding) {
        cp.until = 0;
        cp.count = all.length;
      }
      const msgs = holding ? all.slice(0, cp.count) : all;
      const lastMine = [...msgs].reverse().find((m) => m.from === 'me');
      const waiting = (S.queue || []).some((q) => q.type === 'dmreply' && q.npc === n.id && (q.alt || null) === (alt ? alt.id : null) && q.due - S.clock <= 6);
      const showTyping = holding || (waiting && lastMine && lastMine.seenAt != null && S.clock >= lastMine.seenAt);
      cp.typing = showTyping;
      chat = `<div class="chathead" data-act="profile" data-id="${n.id}"><div class="avwrap">${UI.avatar(n, 40)}${P.presenceDot(n)}</div><div><b>${esc(n.name)}</b> ${UI.chip(n.status, n)}<div class="muted small">${esc(n.handle)} · <span class="pres ${pres}">${presTxt}</span> · mood: ${esc(n.mood || 'unknown')}</div></div></div>
        ${!alt && S.dmSum[n.id] ? `<div class="sumbox small">🧠 Earlier in this chat: ${esc(S.dmSum[n.id])}</div>` : ''}
        <div class="chatlog" id="chatlog">${
          msgs.map((m) => `<div class="bubble ${m.from === 'me' ? 'me' : 'them'}">${m.storyId ? '<em class="srep">Replied to your story</em>' : ''}${m.img ? UI.mediaImg(m.img, m.imgl, 'dm-photo') : ''}${esc(m.text)}${G.Refs && m.from !== 'me' ? G.Refs.card(G.Refs.forMsg(m)) : ''}<span>${U.ago(S.clock, m.t)}${m === lastMine ? (m.seen && S.clock >= (m.seenAt || 0) ? ' · Seen' : ' · Sent') : ''}</span></div>`).join('') + (showTyping ? '<div class="bubble them typing"><i></i><i></i><i></i></div>' : '') || '<div class="empty">Say hi 👋</div>'
        }</div>
        <div class="chatinput"><textarea id="dmbox" data-bind="dmDraft" rows="2" maxlength="600" placeholder="Message ${esc(n.name)}…"></textarea>
        <div class="col">${P.moreMenu('<button data-act="tagPick" data-for="dmbox" title="Tag someone with @">＠ Tag someone</button><button data-act="suggestDm" data-id="' + n.id + '">' + (UI.suggestLoading ? '⏳ Thinking…' : '✨ Ideas for a reply') + '</button><button data-act="meetup" data-id="' + n.id + '" title="Meet up in person">🎭 Meet up in person</button>')}<button class="btn primary" data-act="sendDm" data-id="${n.id}">Send</button></div></div>
        ${UI.suggestions ? P.suggestBox() : ''}`;
    }
    const others = Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt && !(alt && n.id === alt.id)).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="msgs ${UI.dmWith || UI.groupWith ? 'chatting' : ''}">
      <div class="convos">${G.Leads && !alt && G.settings.legacyHome ? G.Leads.strip() : ''}<div class="row between msghead"><h4 class="sect">Messages</h4><span class="qrow">${UI.ibtn('hash', 'Channels', 'data-act="nav" data-page="channels"')}${UI.ibtn('users', 'New group', 'data-act="newGroup"')}</span></div>${P.actingBar('Messaging as')}
        <select id="newchat"><option value="">＋ New message…</option>${others.map((n) => `<option value="${n.id}">${esc(n.name)} (${esc(n.handle)})</option>`).join('')}</select>
        ${glist}${list || (glist ? '' : '<div class="empty small">No conversations yet.</div>')}</div>
      <div class="chat">${UI.dmWith || UI.groupWith ? `<button type="button" class="btn ghost back backchat" data-act="closeChat" aria-label="Back to chats">${UI.icon('chevron-left', 20)}Chats</button>` : ''}${chat}</div></div>`;
  };

  /* ---------- people / relationships ---------- */

  P.people = function () {
    const S = G.S;
    const npcs = Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt);
    const toggle = `<div class="tabs"><button class="${UI.peopleView === 'cards' ? 'on' : ''}" data-act="peopleView" data-v="cards">Cards</button><button class="${UI.peopleView === 'web' ? 'on' : ''}" data-act="peopleView" data-v="web">Social web</button><button data-act="createChar">➕ Create</button><button data-act="importChar">📥 Character file</button></div>`;
    if (UI.peopleView === 'web') return toggle + P.web(npcs);
    return (
      toggle +
      UI.GROUPS.map(([title, sts]) => {
        const list = npcs.filter((n) => sts.includes(n.status)).sort((a, b) => Math.abs(b.aff) + b.rom + b.riv - (Math.abs(a.aff) + a.rom + a.riv));
        if (!list.length) return '';
        return `<h4 class="sect">${title} <span class="muted small">${list.length}</span></h4><div class="cards">${list.map((n) => P.relCard(n)).join('')}</div>`;
      }).join('')
    );
  };

  P.presenceDot = (n) => {
    const pr = G.Persona ? G.Persona.presence(n, G.S.clock) : '';
    return pr === 'online' ? '<i class="on-dot" title="Active now"></i>' : pr === 'away' ? '<i class="on-dot away" title="Active recently"></i>' : '';
  };

  P.relCard = (n) => `<div class="relcard" data-act="profile" data-id="${n.id}"><div class="row">${UI.avatar(n, 44)}<div class="grow"><b>${esc(n.name)}</b><div class="muted small">${esc(n.handle)} · ${esc(n.mood || '—')}</div></div>${UI.chip(n.status, n)}</div>
      <div class="mini-meters"><span title="Affinity">💚 ${n.aff}</span><span title="Romance">💘 ${n.rom}</span><span title="Rivalry">⚔️ ${n.riv}</span><span title="Trust">🤝 ${n.trust}</span></div></div>`;

  P.web = function (npcs) {
    const S = G.S;
    const W = 720, H = 560, cx = W / 2, cy = H / 2;
    const list = npcs.slice(0, 32);
    const pos = {};
    list.forEach((n, i) => {
      const outer = list.length > 14 && i % 2 === 1;
      const r = outer ? 245 : list.length > 14 ? 150 : 205;
      const idx = list.length > 14 ? Math.floor(i / 2) : i;
      const cnt = list.length > 14 ? Math.ceil(list.length / 2) : list.length;
      const ang = (idx / cnt) * Math.PI * 2 - Math.PI / 2 + (outer ? Math.PI / cnt : 0);
      pos[n.id] = [cx + Math.cos(ang) * r * 1.15, cy + Math.sin(ang) * r * 0.9];
    });
    const col = { dating: '#ff5fa2', crush: '#ff5fa2', situationship: '#ff9ac7', ex: '#9a6b7e', friend: '#3ddc84', best_friend: '#3ddc84', ally: '#3ddc84', family: '#7aa7ff', rival: '#ffb020', frenemy: '#ffb020', enemy: '#ff4d4d' };
    const edges = S.npcRel
      .filter((e) => pos[e.a] && pos[e.b])
      .map((e) => `<line x1="${pos[e.a][0]}" y1="${pos[e.a][1]}" x2="${pos[e.b][0]}" y2="${pos[e.b][1]}" stroke="${col[e.type] || '#666'}" stroke-width="1.6" opacity=".6" ${e.type === 'ex' ? 'stroke-dasharray="4 4"' : ''}><title>${esc(S.npcs[e.a].name)} — ${esc(S.npcs[e.b].name)}: ${esc(e.type)}</title></line>`)
      .join('');
    const pc = { pink: '#ff5fa2', green: '#3ddc84', red: '#ff4d4d', amber: '#ffb020', purple: '#a78bfa', blue: '#7aa7ff', gray: '#555' };
    const mine = list
      .filter((n) => n.status !== 'stranger')
      .map((n) => `<line x1="${cx}" y1="${cy}" x2="${pos[n.id][0]}" y2="${pos[n.id][1]}" stroke="${pc[UI.statusMeta(n.status, n).cls]}" stroke-width="3" opacity=".75"/>`)
      .join('');
    const nodes = list
      .map((n) => {
        const [x, y] = pos[n.id];
        return `<g class="node" data-act="profile" data-id="${n.id}" transform="translate(${x},${y})"><circle r="21" fill="#1b1f2a" stroke="${pc[UI.statusMeta(n.status, n).cls]}" stroke-width="3"/><text y="7" text-anchor="middle" font-size="21">${esc(n.emoji)}</text><text y="38" text-anchor="middle" class="nl">${esc(G.U.first(n.name))}</text></g>`;
      })
      .join('');
    return `<div class="card"><svg viewBox="0 0 ${W} ${H}" class="web">${edges}${mine}${nodes}
      <g transform="translate(${cx},${cy})"><circle r="30" fill="#1b1f2a" stroke="#7aa7ff" stroke-width="4"/><text y="9" text-anchor="middle" font-size="28">${esc(S.player.emoji)}</text><text y="48" text-anchor="middle" class="nl">YOU</text></g></svg>
      <div class="legend small muted"><span style="color:#ff5fa2">● romance</span> <span style="color:#3ddc84">● friends</span> <span style="color:#7aa7ff">● family</span> <span style="color:#ffb020">● rivals</span> <span style="color:#ff4d4d">● enemies</span> · thick lines = your relationships, thin = between them. Tap a character.</div></div>`;
  };

  /* ---------- drama ---------- */

  P.drama = function () {
    const S = G.S;
    const stories = S.storylines.slice().sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved') || b.heat - a.heat);
    const cards = stories
      .map(
        (s) => `<div class="card story ${s.status}"><div class="row between"><h3>${s.status === 'boiling' ? '🌋' : s.status === 'resolved' ? '✅' : '🔥'} ${esc(s.title)}</h3><span class="chip ${s.heat >= 70 ? 'red' : s.heat >= 40 ? 'amber' : 'gray'}">${s.heat} heat</span></div>
      <div class="track"><div class="fill ${s.heat >= 70 ? 'red' : 'amber'}" style="width:${s.heat}%"></div></div>
      <p>${esc(s.summary)}</p>
      <div class="row wrap">${(s.participants || []).map((id) => S.npcs[id]).filter(Boolean).map((n) => `<span class="pchip" data-act="profile" data-id="${n.id}">${esc(n.emoji)} ${esc(n.name)}</span>`).join('')}</div>
      ${s.log && s.log.length > 1 ? `<details><summary class="muted small">Timeline (${s.log.length})</summary>${s.log.slice().reverse().map((l) => `<div class="small tl"><span class="muted">${U.ago(S.clock, l.t)}</span> ${esc(l.text)}</div>`).join('')}</details>` : ''}
      ${s.status !== 'resolved' ? `<div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="stir" data-id="${s.id}" data-m="escalate">🔥 Escalate</button><button class="btn sm" data-act="stir" data-id="${s.id}" data-m="join">🙋 Jump in</button><button class="btn sm" data-act="stir" data-id="${s.id}" data-m="calm">🕊️ Calm it</button><button class="btn sm" data-act="stir" data-id="${s.id}" data-m="twist">🎭 Plot twist</button></div>` : ''}</div>`
      )
      .join('');
    return `${S.saga ? `<div class="card saga"><h3>🧠 The saga so far</h3><p class="small">${esc(S.saga)}</p><div class="muted small">Auto-summarised memory — the AI reads this every turn.</div></div>` : ''}<h4 class="sect">Drama board</h4>${cards || '<div class="empty">No storylines yet. Head to the 🎬 Director and start some trouble.</div>'}
      <h4 class="sect">Your story so far</h4><div class="card chron">${S.chronicle.slice().reverse().map((c) => `<div class="small tl"><span class="muted">${U.clockStr(c.t)}</span> ${esc(c.text)}</div>`).join('') || '<span class="muted">Nothing yet.</span>'}</div>`;
  };

  /* ---------- director ---------- */

  const SCENARIOS = [
    ['💥', 'Start a scandal about me', 'A juicy scandal about the player breaks — rumours, screenshots, everyone has an opinion.'],
    ['🔺', 'Love triangle', 'Create a love triangle involving the player and two cast members.'],
    ['😈', 'Make me a new enemy', 'Someone becomes the player\'s sworn enemy and starts a public campaign against them.'],
    ['💘', 'Someone falls for me', 'A cast member develops a serious secret crush on the player and starts acting strange.'],
    ['📰', 'Exposé article', 'A journalist character publishes an exposé about the player.'],
    ['🚀', 'Old post goes viral', 'One of the player\'s old posts resurfaces and goes viral — for better or worse.'],
    ['🫂', 'Obsessed fan', 'A fan becomes borderline obsessed with the player (keep it comedic/dramatic, not dangerous).'],
    ['🤝', 'Collab offer', 'A famous account offers the player a surprise collaboration — with strings attached.'],
    ['🥀', 'Friend betrays me', 'A close friend or ally betrays the player in a public way.'],
    ['⚔️', 'Two people feud over me', 'Two cast members start publicly feuding over the player.'],
    ['🎭', 'Plot twist!', 'A huge plot twist reshapes the relationships and storylines of the world.'],
    ['🧊', 'Ex returns', 'Someone from the player\'s romantic past (or an ex of a cast member) returns and stirs everything up.'],
    ['📱', 'Leaked DMs', 'Private DMs between the player and a cast member are leaked publicly. Everyone reacts to what they said.'],
    ['#️⃣', 'Hashtag challenge', 'The player starts a hashtag challenge that spreads: cast and crowd join in, some embarrassingly.'],
    ['💼', 'Brand deal', 'A brand offers the player a sponsorship; include a dilemma (selling out vs. money). Use an event with choices.'],
    ['🎊', 'Wild house party', 'A huge party where lots of cast members mix, flirt, fight and post chaos from the same night.'],
    ['💞', 'Rumor: secret relationship', 'A rumor spreads that the player is secretly dating someone from the cast. Is it true? Everyone reacts.'],
    ['🤯', 'Secret revealed', 'One cast member hidden secret comes out publicly, wrecking at least one relationship.'],
  ];

  P.director = function () {
    return `<h4 class="sect">🎬 Director mode</h4>
      <div class="card"><p class="muted">You are the author of this world. Type anything and it happens — new characters, secrets revealed, relationships changed, scandals, weddings, plot twists.</p>
      <textarea id="dirbox" data-bind="dirDraft" rows="3" placeholder="e.g. Mia has been secretly in love with me since day one and finally posts about it…">${esc(UI.dirDraft || '')}</textarea>
      <div class="row between"><span class="muted small">Costs one AI call (~$0.002)</span><button class="btn primary" data-act="direct">🎬 Make it happen</button></div></div>
      ${P.scenarioCard()}
      <h4 class="sect">Quick scenarios</h4><div class="scen">${SCENARIOS.map((s, i) => `<button class="btn scn" data-act="scenario" data-i="${i}"><span>${s[0]}</span>${s[1]}</button>`).join('')}</div>
      <h4 class="sect">Time machine</h4><div class="row wrap">
        <button class="btn" data-act="advance" data-k="refresh">🔄 45 minutes</button><button class="btn" data-act="advance" data-k="hours">⏳ 6 hours</button>
        <button class="btn" data-act="advance" data-k="day">🌙 One day</button><button class="btn" data-act="advance" data-k="week">📅 One week</button></div>`;
  };
  P.SCENARIOS = SCENARIOS;

  /* ---------- my profile ---------- */

  P.me = function () {
    const S = G.S;
    const p = S.player;
    const E = G.Engine;
    const all = S.postOrder.map((id) => S.posts[id]).filter((x) => x && x.author === 'me' && !x.replyTo).reverse();
    const pinned = S.pinned && S.posts[S.pinned];
    const done = Object.keys(S.ach || {}).length;
    const tab = UI.profTab || 'grid';
    const topic = UI.hlTopic && UI.hlTopic.who === 'me' ? UI.hlTopic.key : null;
    let list = all.filter((x) => x.id !== S.pinned);
    if (tab === 'saved') list = S.postOrder.map((id) => S.posts[id]).filter((x) => x && x.saved && !x.replyTo).reverse();
    else if (tab === 'reels') list = list.filter(UI.isMediaPost);
    else if (tab === 'tagged') list = S.postOrder.map((id) => S.posts[id]).filter((x) => x && x.author !== 'me' && !x.replyTo && x.text.toLowerCase().includes(p.handle)).reverse();
    if (topic && tab !== 'saved' && tab !== 'tagged') list = list.filter((x) => UI.sceneOf(x).key === topic);
    const head = UI.profileHead({
      avatar: UI.ringAvatar('me', 86, 'me'), name: p.name, verified: p.verified, bio: esc(p.bio) || '<span class="muted">No bio yet.</span>',
      sub: `${esc(p.handle)} · 💰 $${U.fmt(p.cash)}${p.traits.length ? ' · ' + p.traits.map(esc).join(' · ') : ''}`,
      posts: p.posts, followers: p.followers, following: p.following.length, who: 'me', active: topic, addNew: true, highlights: UI.highlightsOf(all),
      buttons: `<button class="btn grow soft" data-act="editBio">Edit profile</button>${UI.ibtn('camera', p.avatar ? 'Change photo' : 'Add photo', 'data-act="editAvatar"')}${UI.ibtn('share', 'Share profile', 'data-act="shareProfile"')}${UI.ibtn('plus', 'Add to your story', 'data-act="storyCompose"')}${p.avatar ? UI.menu('More photo options', [{ label: 'Remove photo', attrs: 'data-act="removeAvatar"', danger: true }]) : ''}`,
    });
    const empty = { grid: 'You haven\'t posted yet. Share your first post from Home ✨', reels: 'No photo or video posts yet.', saved: 'Nothing saved yet — tap the bookmark on any post.', tagged: 'Nobody has tagged you yet.' }[tab];
    return `${head}
      ${pinned ? `<h4 class="sect">📌 Pinned</h4>${UI.postHTML(pinned, { preview: true })}` : ''}
      ${UI.profTabs(tab, [['grid', 'grid', 'Posts'], ['reels', 'reels', 'Photos & videos'], ['saved', 'save', 'Saved'], ['tagged', 'me', 'Tagged']])}
      ${list.length ? `<div class="pgrid tall">${list.slice(0, 60).map((x) => UI.gridTile(x)).join('')}</div>` : `<div class="empty">${empty}</div>`}
      <h4 class="sect">Progress</h4><div class="card"><h3>Level ${p.level}</h3>${UI.bar('XP to next level', p.xp, E.xpNeeded(p.level), 'blue')}
      <div class="grid2" style="margin-top:8px">${Object.entries(p.stats).map(([k, v]) => UI.bar(k, v, 100, 'purple')).join('')}</div></div>
      <div class="card"><h3>Audience</h3><div class="grid2">${UI.bar('Fans', p.audience.love, 100, 'green')}${UI.bar('Haters', p.audience.hate, 100, 'red')}${UI.bar('🔥 Controversy heat', p.heat, 100, 'amber')}</div>
      <p class="muted small">Heat rises when you post spicy or controversial things and cools over time. Too hot and the internet may pile on — the 🛍️ Shop sells PR help.</p></div>
      ${G.Rep ? G.Rep.card() : ''}
      <details class="card fold"><summary>🏆 Achievements <span class="muted small">${done}/${E.ACH.length}</span></summary><div class="ach-grid">${E.ACH.map((a) => `<div class="ach ${S.ach[a.id] ? 'on' : ''}" title="${esc(a.desc)}"><span>${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div></details>`;
  };

  /* ---------- reels: a vertical, full-screen scroll of the best photo posts ---------- */

  P.reelItems = function () {
    const S = G.S;
    const now = S.clock;
    const score = (p) => -(now - p.t) / 400 + p.buzz * 0.5 + Math.log10(p.stats.likes + 10) * 2 + (p.img ? 2 : 0);
    return S.postOrder
      .slice(-400)
      .map((id) => S.posts[id])
      .filter((p) => p && !p.replyTo && UI.isMediaPost(p))
      .filter((p) => {
        const n = S.npcs[p.author];
        return !(n && (n.blocked || n.muted));
      })
      .sort((a, b) => score(b) - score(a))
      .slice(0, 24);
  };
  P.reels = function () {
    const S = G.S;
    const list = P.reelItems();
    if (!list.length) return '<div class="empty">No reels yet — people post photos as the world runs. Hit ⏩ or 🔄 and check back.</div>';
    return `<div class="reels" id="reels">${list
      .map((p) => {
        const a = UI.nameOf(p);
        const sc = UI.sceneOf(p);
        const img = p.img ? UI.mediaImg(p.img, p.imgl, 'reel-img', false, 1080) : '';
        const follow = a.npc && !UI.following(a.npc.id) ? `<button class="followpill light" data-act="followPill" data-id="${a.npc.id}">Follow</button>` : '';
        const ringId = p.author === 'me' ? 'me' : a.npc ? a.npc.id : null;
        return `<section class="reel" id="reel-${p.id}" data-id="${p.id}">
          <div class="reel-bg ${UI.artClass(sc, p.id)}">${img}</div>
          <div class="reel-shade"></div>
          <div class="reel-side">
            <button class="rb like ${UI.liked(p) ? 'liked' : ''}" data-act="like" data-id="${p.id}" title="Like">${UI.icon('notifs', 30)}<span>${U.fmt(p.stats.likes)}</span></button>
            <button class="rb" data-act="thread" data-id="${p.id}" title="Comments">${UI.icon('comment', 30)}<span>${U.fmt(UI.replyCount(p))}</span></button>
            <button class="rb" data-act="quote" data-id="${p.id}" title="Repost">${UI.icon('repost', 30)}<span>${U.fmt(p.stats.reposts)}</span></button>
            <button class="rb save ${p.saved ? 'on' : ''}" data-act="saveToggle" data-id="${p.id}" title="Save">${UI.icon('save', 28)}</button>
          </div>
          <div class="reel-info">
            <div class="row"><div ${a.npc ? `data-act="profile" data-id="${a.npc.id}"` : ''}>${ringId ? UI.ringAvatar(a.who, 30, ringId) : UI.avatar(a.who, 34)}</div><b>${esc(a.name)}</b>${a.verified ? '<span class="vf">✔</span>' : ''}${follow}</div>
            <div class="reel-cap">${U.rich(p.text.slice(0, 160))}</div>
            <div class="reel-audio">♪ original audio · ${esc(a.name)} · ${U.ago(S.clock, p.t)}</div>
          </div>
        </section>`;
      })
      .join('')}</div>`;
  };

  /* ---------- explore: a mosaic with a big tile alternating left / right ---------- */

  P.mosaic = function () {
    const S = G.S;
    const now = S.clock;
    const list = S.postOrder
      .slice(-400)
      .map((id) => S.posts[id])
      .filter((p) => p && !p.replyTo)
      .filter((p) => {
        const n = S.npcs[p.author];
        return !(n && (n.blocked || n.muted));
      })
      .map((p) => ({ p, s: Math.log10(p.stats.likes + 10) * 2 + p.buzz * 0.5 - (now - p.t) / 600 + (p.attach || p.img ? 1.5 : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.p);
    if (!list.length) return '';
    return `<div class="pgrid mosaic tall">${list.map((p, i) => UI.gridTile(p, i % 6 === 0 ? (Math.floor(i / 6) % 2 ? 'bigR' : 'big') : '')).join('')}</div>`;
  };

  /* ---------- settings ---------- */

  P.mediaInfo = () => {
    const m = G.Media.stats();
    if (!m.count) return `<div class="small muted">${esc(m.error || 'No photos found yet.')}</div>`;
    return `<div class="small">📚 <b>${U.fmt(m.count)}</b> photos · ${m.people} people/sets.</div>`;
  };

  P.capInfo = () => {
    const A = G.AI;
    if (!A.capOn()) return '<span class="muted">No limit set.</span>';
    const left = A.capLeft();
    return `Used in this window: <b>${U.money(A.spent())}</b> of ${U.money(A.capVal())} · <b>${U.money(left)}</b> left ${left <= 0 ? '<span class="chip red">limit reached — AI paused</span>' : ''} <button class="btn sm ghost" data-act="capReset">Start a new window</button>
      <div class="muted small">This is the game's own brake. For a guarantee, also set a credit limit on the key at openrouter.ai → Keys.</div>`;
  };

  P.bankInfo = () => {
    const b = G.Bank ? G.Bank.stats() : { stock: 0, filled: 0, used: 0, rejected: 0, calls: 0, error: '' };
    return `Banked lines: <b>${b.stock}</b> · written: ${b.filled} · used: ${b.used} · filtered out: ${b.rejected} · calls: ${b.calls}${b.error ? `<div class="muted">Last problem: ${esc(b.error)}</div>` : ''}`;
  };

  // live numbers for the Hybrid AI card
  P.hybridInfo = function () {
    const A = G.AI;
    const st = A.stats;
    const s = G.settings;
    const state = !A.helperReady() ? '<b>off</b>' : A.helperUp() ? '✅ ready' : `⏸ paused for ${Math.max(1, Math.ceil((A.helper.until - Date.now()) / 60000))} min (it failed twice; the main model is covering)`;
    const rows = Object.entries(st.byTask).map(([t, b]) => `<tr><td>${esc(t)}</td><td>${b.calls}</td><td>${b.local}</td><td>${U.money(b.cost)}</td></tr>`).join('');
    return `Helper: ${state} · lifetime free local calls: <b>${U.fmt(s.localCalls || 0)}</b> (${U.fmt(s.localTokens || 0)} tokens) · est. saved so far: <b>${U.money(A.saved())}</b><br>This session: ${st.localCalls} local · ${st.cloudCalls} cloud (${U.money(st.cloudCost)}) · times the other side took over: ${st.failovers}${rows ? `<table class="small" style="margin-top:6px;width:100%"><tr><th align="left">job</th><th align="left">calls</th><th align="left">free</th><th align="left">cost</th></tr>${rows}</table>` : ''}`;
  };

  P.settings = function () {
    const s = G.settings;
    const S = G.S;
    const sel = (key, opts) => `<select data-setting="${key}">${opts.map((o) => `<option value="${o[0]}" ${String(s[key]) === String(o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    const pend = G.Memory.pending(false);
    const nPending = (pend.chron.length ? 1 : 0) + pend.npc.length + pend.dm.length + pend.group.length + pend.scene.length;
    return `<h4 class="sect">Settings</h4>
      <h4 class="sect">AI and cost</h4>
      <div class="card"><h3>AI</h3>${P.providerBlock(true)}
        <div class="row wrap" style="margin-top:8px">${G.AI.isLocal() ? '' : '<button class="btn sm" data-act="loadModels">Browse all models (sorted by price)</button><button class="btn sm" data-act="balance">Check balance</button>'}<button class="btn sm" data-act="testKey">Test connection</button></div>
        <p class="muted small" id="keyinfo">${G.AI.isLocal() ? 'Running on your own computer — no cost.' : `Spent in this world: <b>${U.money(S.spend || 0)}</b> · All worlds: <b>${U.money(s.totalSpend)}</b> · ${U.fmt(s.totalTokens)} tokens`}</p>
        ${G.AI.isLocal() ? '' : `<label>💰 Spending limit for this key <span class="muted small">(the game stops calling the AI once this much is spent)</span></label>${sel('spendCap', [[1, '$1'], [2, '$2'], [5, '$5'], [10, '$10'], [0, 'No limit']])}
        <div class="small" id="capinfo">${P.capInfo()}</div>`}
        <button class="btn" data-act="selftest">🧪 Run live self-test <span class="muted small">(${G.AI.isLocal() ? 'free' : '~$0.003'})</span></button>
        <p class="muted small">Calls every feature once with your model and checks the replies really work.</p></div>
      <details class="card fold"><summary>🧩 Hybrid AI — free local helper + OpenRouter</summary>
        <p class="small">A small model running on your own PC does the cheap background jobs <b>for free</b>; OpenRouter handles the moments you read closely. If either side is down, out of credits or refuses, the other one takes over automatically — so the game never stalls.</p>
        <label class="row" style="gap:8px"><input type="checkbox" data-setting="helperOn" ${s.helperOn ? 'checked' : ''}> Use a local helper model</label>
        <div class="grid2"><div><label>Server</label>${sel('helperProvider', [['ollama', 'Ollama'], ['lmstudio', 'LM Studio'], ['koboldcpp', 'KoboldCpp'], ['custom', 'Other (OpenAI-compatible)']])}</div>
          <div><label>Address <span class="muted small">(blank = default)</span></label><input data-setting="helperBase" value="${esc(s.helperBase || '')}" placeholder="${esc(G.AI.PROVIDERS[G.AI.helperProvider()].base)}" autocomplete="off" spellcheck="false"></div></div>
        <label>Helper model <span class="muted small">(a small fast one is best: e.g. llama3.1:8b, qwen2.5:7b, gemma2:9b)</span></label>
        <input data-setting="helperModel" list="helperlist" value="${esc(s.helperModel || '')}" placeholder="llama3.1:8b" autocomplete="off" spellcheck="false"><datalist id="helperlist"></datalist>
        <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="detectHelper">🔎 Find models</button><button class="btn sm" data-act="testHelper">🧪 Test helper</button><button class="btn sm ghost" data-act="helperReset">▶ Un-pause</button></div>
        <label style="margin-top:12px">Who does what</label>
        ${G.AI.CLASSES.map((c) => `<div class="row between" style="gap:8px;margin:4px 0"><span class="small"><b>${c[1]}</b><br><span class="muted">${c[2]}</span></span><select data-route="${c[0]}"><option value="local" ${G.AI.routeFor(c[0]) === 'local' ? 'selected' : ''}>🖥️ Local helper (free)</option><option value="cloud" ${G.AI.routeFor(c[0]) === 'cloud' ? 'selected' : ''}>☁️ Main model</option></select></div>`).join('')}
        <div class="row wrap" style="margin-top:8px">${Object.entries(G.AI.PRESETS).map(([k, v]) => `<button class="btn sm ghost" data-act="routePreset" data-p="${k}" title="${esc(v.note)}">${v.label}</button>`).join('')}</div>
        <label style="margin-top:12px">Cheaper OpenRouter model for background jobs <span class="muted small">(used when the helper is off or down; blank = the main model)</span></label>
        <input data-setting="cheapModel" value="${esc(s.cheapModel || '')}" placeholder="e.g. qwen/qwen3.5-flash-02-23" autocomplete="off" spellcheck="false">
        <div class="small" id="hybridinfo" style="margin-top:10px">${P.hybridInfo()}</div>
        <p class="muted small">Tip: the world already runs for free without any AI (the living-world engine); the helper only upgrades its writing. Photo matching is free too. Local servers must allow this page (Ollama: <code>OLLAMA_ORIGINS=*</code>).</p></details>
      <h4 class="sect">World</h4>
      <div class="card"><h3>🌍 World activity</h3>
        <p class="muted small">How much the cast does by itself (posts, stories, comments, messages). <b>Silent</b> = nobody posts unless you or the admin tools make it happen; they still react to what you do. You can also set one person to post more, less or never in 🛠 Admin.</p>
        <select data-setting="feedRate">${G.World.RATES.map(([v, l]) => `<option value="${v}" ${Math.abs(G.World.feedRate() - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label style="margin-top:10px">Their own posts <span class="muted small">(no more random posts without context: you direct them with 🎬 Storyteller / 🛠 Admin)</span></label>
        <select data-setting="postDial">${G.World.POST_DIAL.map(([v, l]) => `<option value="${v}" ${Math.abs(G.World.postDial() - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label style="margin-top:10px">Messages from characters <span class="muted small">(how often people text you first; replies to what you send are always on)</span></label>
        <select data-setting="dmRate">${[[0.5, '🌙 Few'], [1, '🙂 Normal'], [2, '💬 More (default)'], [3, '📱 Lots']].map(([v, l]) => `<option value="${v}" ${Math.abs(G.World.dmMult() - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="faces" ${s.faces !== false ? 'checked' : ''}> 🖼 Drawn portraits as profile pictures <span class="muted small">(instead of emoji: everyone gets a different face)</span></label>
        <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="facesAssign">📸 Use photos from the faces folder</button></div>
        <p class="muted small">Put AI-generated face photos in the <b>faces</b> folder next to Clout. <code>node tools/prepare-faces.js &lt;folder&gt;</code> shrinks a downloaded set and makes contact sheets so you can delete faces you do not want. Each character then gets their own photo.</p>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="fameSim" ${s.fameSim !== false ? 'checked' : ''}> 📈 Followers and money move with time <span class="muted small">(organic growth, viral waves, a daily creator payout, milestones and 💼 offers you accept or decline. Nothing happens to you without your tap)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="leads" ${s.leads !== false ? 'checked' : ''}> 👋 Strangers who hear about you can reach out <span class="muted small">(a DM request or a comment. They only join your cast if you answer them)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="mainCastOnly" ${s.mainCastOnly !== false ? 'checked' : ''}> 👥 Only my main characters <span class="muted small">(nobody new, and no anonymous crowd, appears by themselves. Turn off when you want the town to grow. You can still add people yourself)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="minimalUI" ${s.minimalUI !== false ? 'checked' : ''}> Minimal interface <span class="muted small">(no emoji in buttons, menus and headings. What people write keeps its emoji)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="suggestions" ${s.suggestions !== false ? 'checked' : ''}> ✨ The world prepares suggestions for you to approve <span class="muted small">(posts, stories, replies, gossip: nothing happens until you tick it; free)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="fab" ${s.fab !== false ? 'checked' : ''}> Show the floating ✨ button</label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="channels" ${s.channels !== false ? 'checked' : ''}> 📣 Public channels where the town talks about your story <span class="muted small">(curious, gossipy, free, never part of your feed)</span></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-setting="worldEvents" ${s.worldEvents !== false ? 'checked' : ''}> Random world events (a festival, a blackout, a meme…) that the people close to you message you about <span class="muted small">(free, no AI, never makes posts)</span></label></div>
      <h4 class="sect">Content</h4>
      <div class="card"><h3>Content</h3>
        <p class="muted small">This edition is a clean (PG-13) simulation. Every character is an adult (18+).</p></div>
            <details class="card fold"><summary>🔁 Fallback model</summary>
        <label>Fallback model <span class="muted small">(used automatically when the main model refuses; same provider)</span></label>
        <input data-setting="fallbackModel" value="${esc(s.fallbackModel || '')}" placeholder="${G.AI.isLocal() ? 'another local model name' : 'e.g. a less restrictive model id'}" autocomplete="off" spellcheck="false">
      </details>
      <details class="card fold"><summary>✍️ AI-written world</summary>
        <label class="check"><input type="checkbox" data-setting="liveBank" ${s.liveBank !== false ? 'checked' : ''}> Let the AI write lines for the people in your world in the background</label>
        <p class="muted small">Every ~45 s while you play, one cheap call writes in-voice posts, comments, DMs and stories for 5 characters. The free simulator then spends them, so people sound like themselves while nearly all activity stays free. Turn off for a fully offline world.</p>
        <div class="small" id="bankinfo">${P.bankInfo()}</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="bankFill">✍️ Write lines now</button><button class="btn sm ghost" data-act="bankClear">Clear banked lines</button></div></details>
      <details class="card fold"><summary>🖼️ Local photo library</summary>${P.mediaInfo()}
        <label class="check"><input type="checkbox" data-setting="mediaOn" ${s.mediaOn !== false ? 'checked' : ''}> Use photos from my media folder in posts, stories, profiles, DMs and scenes</label>
        <label>Photo chance on photo-type posts</label>${sel('mediaChance', [[30, '30%'], [50, '50%'], [70, '70%'], [90, '90%'], [100, 'Always']])}
        <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="mediaRescan">🔄 Rescan media folder</button></div>
        <p class="muted small">Put everyday photos in the <code>media</code> folder next to <code>index.html</code> (start.bat serves it read-only to this computer only). Folder names are tags (<code>food/…</code>, <code>travel/…</code>); <code>people/&lt;name&gt;/…</code> keeps one person consistent; a <code>tags.json</code> can add tags. Anything with an adult-content word in its path or tags is never used. Clout never generates or uploads images.</p></details>
      <h4 class="sect">Play</h4>
      <div class="card"><h3>Gameplay</h3>
        <label>Drama level</label>${sel('drama', [[1, '😇 Gentle'], [2, '🌶️ Spicy'], [3, '🌋 Chaos']])}
        <label>Romance style</label>${sel('romance', [[1, '🕯️ Slow burn'], [2, '😏 Flirty'], [3, '💘 Passionate']])}
        <label>Auto-events <span class="muted small">(a random wildcard scenario is woven into turns — free, no extra API call)</span></label>${sel('autoEvents', [[0, '⛔ Off'], [1, '🎲 Occasional (15%)'], [2, '🎲 Frequent (35%)'], [3, '🌪️ Chaotic (65%)']])}
        <label>Replies per action <span class="muted small">(more = livelier, costs a bit more)</span></label>${sel('richness', [[1, 'Lean'], [2, 'Normal'], [3, 'Busy / huge crowds']])}
        <label>Creativity (temperature): <b id="tempval">${s.temperature}</b></label><input type="range" min="0.4" max="1.3" step="0.05" value="${s.temperature}" data-setting="temperature">
        <label>Theme</label>${sel('theme', [['light', '☀️ Light'], ['dark', '🌙 Dark'], ['amoled', '⚫ AMOLED black']])}
        <label class="check"><input type="checkbox" data-setting="noThink" ${s.noThink ? 'checked' : ''}> Disable "thinking" on reasoning models (faster &amp; cheaper)</label></div>
      <details class="card fold"><summary>🧠 Memory</summary>
        <label class="check"><input type="checkbox" data-setting="autoSummary" ${s.autoSummary ? 'checked' : ''}> Automatically summarise old history so characters never forget</label>
        <p class="small">Long chats, memories and events get folded into short summaries (one cheap call every so often). Details live in the saga, each character's history, DM / group / scene summaries.</p>
        <div class="small muted">Saga: ${S && S.saga ? esc(S.saga.slice(0, 220)) + (S.saga.length > 220 ? '…' : '') : 'none yet'}<br>Summaries made: ${(S && S.memRuns) || 0} · waiting to be compressed: ${nPending}</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="summarize">🧠 Summarise now</button></div></details>
      <h4 class="sect">Your data</h4>
      ${G.Vault ? G.Vault.card() : ''}
      <div class="card"><h3>Your world</h3><div class="row wrap">
        <div class="small muted" style="width:100%;margin-bottom:6px">💾 ${G.Store.mode === 'indexeddb' ? 'Saved in this browser\'s database' : 'Saved in the smaller backup store'}${G.S && G.S.savedAt ? ' · last saved ' + Math.max(0, Math.round((Date.now() - G.S.savedAt) / 1000)) + ' s ago' : ''}${G.Store.lastError ? ' · <b style="color:#e1306c">trouble: ' + esc(String(G.Store.lastError.message || G.Store.lastError).slice(0, 80)) + '</b>' : ''}</div><button class="btn" data-act="saveNow" title="Write the world to storage right now and check it worked">💾 Save now</button><button class="btn" data-act="exportWorld">📤 Export save</button><button class="btn" data-act="importWorld">📥 Import save</button>
        <button class="btn" data-act="leave">🏠 Switch world</button><button class="btn danger" data-act="delCurrent">🗑 Delete this world</button></div>
        <p class="muted small">Saves live in this browser. Export a backup now and then.</p></div>`;
  };
})(window.G);
