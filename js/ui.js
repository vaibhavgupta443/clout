/* Clout — UI core: components, toasts, modals, render dispatcher */
(function (G) {
  const U = G.U;
  const $ = (s, r = document) => r.querySelector(s);
  const UI = (G.UI = {
    page: 'home',
    feedTab: 'latest', // newest first: what just happened is at the top
    thread: null,
    dmWith: null,
    search: '',
    draft: '',
    replyDraft: '',
    dmDraft: '',
    tone: '',
    peopleView: 'cards',
    suggestions: null,
    feedLimit: 40,
    acts: {},
  });

  /* ---------- small helpers ---------- */

  const SM = {
    stranger: ['Stranger', '👤', 'gray'], acquaintance: ['Acquaintance', '🙂', 'gray'], friend: ['Friend', '😊', 'green'],
    close_friend: ['Close friend', '🤗', 'green'], best_friend: ['Best friend', '💞', 'green'], admirer: ['Admirer', '😳', 'pink'],
    crush: ['Has a crush', '😍', 'pink'], dating: ['Dating', '💑', 'pink'], partner: ['Partner', '💍', 'pink'],
    situationship: ['Situationship', '🫠', 'pink'], ex: ['Ex', '💔', 'red'], frenemy: ['Frenemy', '🎭', 'amber'],
    rival: ['Rival', '⚔️', 'amber'], enemy: ['Enemy', '😡', 'red'], nemesis: ['Nemesis', '☠️', 'red'], stan: ['Stan', '🤩', 'purple'],
    hater: ['Hater', '👿', 'red'], ally: ['Ally', '🛡️', 'blue'], mentor: ['Mentor', '🎓', 'blue'],
    mother: ['Mother', '👩', 'blue'], father: ['Father', '👨', 'blue'], son: ['Son', '👦', 'blue'], daughter: ['Daughter', '👧', 'blue'],
    brother: ['Brother', '👬', 'blue'], sister: ['Sister', '👭', 'blue'], grandmother: ['Grandmother', '👵', 'blue'], grandfather: ['Grandfather', '👴', 'blue'],
    aunt: ['Aunt', '🧕', 'blue'], uncle: ['Uncle', '🧔', 'blue'], cousin: ['Cousin', '🧑‍🤝‍🧑', 'blue'], niece: ['Niece', '👧', 'blue'], nephew: ['Nephew', '👦', 'blue'],
  };
  UI.statusMeta = (s) => {
    const m = SM[s] || SM.stranger;
    return { label: m[0], emoji: m[1], cls: m[2] };
  };
  UI.GROUPS = [
    ['💘 Romance', ['dating', 'partner', 'crush', 'admirer', 'situationship', 'ex']],
    ['💚 Friends & allies', ['best_friend', 'close_friend', 'friend', 'ally', 'mentor']],
    ['⚔️ Rivals & enemies', ['nemesis', 'enemy', 'hater', 'rival', 'frenemy']],
    ['👨‍👩‍👧 Family', ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew']],
    ['🤩 Stans', ['stan']],
    ['👥 Everyone else', ['acquaintance', 'stranger']],
  ];

  // the account the player is acting as: a burner account when one is selected, else null (the main account)
  UI.acting = () => (G.S ? G.Engine.activeAlt() : null);
  UI.liked = (p) => {
    const a = UI.acting();
    return a ? (p.likedBy || []).includes(a.id) : !!p.liked;
  };
  UI.following = (id) => {
    const a = UI.acting();
    return a ? (a.following || []).includes(id) : G.S.player.following.includes(id);
  };

  UI.chip = (status) => {
    const m = UI.statusMeta(status);
    return `<span class="chip ${m.cls}">${m.emoji} ${m.label}</span>`;
  };

  // only well-formed data: image URLs are ever placed into markup
  UI.safeImg = (u) => (typeof u === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : '');
  // an <img> for a library photo (only if it is in the index; hidden otherwise)
  UI.expanded = new Set(); // captions the player unfolded with "more"
  UI.mediaImg = (rel, lv, extraCls, _unused, w = 720) => {
    const M = G.Media;
    if (!M || !M.allowedPath(rel, lv)) return '';

    return `<img class="lib ${extraCls || ''}" loading="lazy" decoding="async" alt="" src="${U.esc(M.url(rel, w))}">`
  };
  // A picture avatar is written ONCE as a CSS rule (class cav1, cav2 ...) and every card that shows that person only names the class.
  // (A 2 KB data URI repeated in every post header made one post ~4.7 KB of HTML.) The picture itself does not change.
  const avMap = new Map(); // picture url -> class name
  let avN = 0;
  UI.avClass = (url) => {
    let c = avMap.get(url);
    if (c) return c;
    let st = document.getElementById('avcss');
    if (!st) {
      st = document.createElement('style');
      st.id = 'avcss';
      document.head.appendChild(st);
    }
    if (avMap.size >= 1500) {
      // far more distinct faces than anyone scrolls through: start over, and redraw so every card names a rule that exists
      avMap.clear();
      st.textContent = '';
      UI._avReset = true;
    }
    c = 'cav' + (++avN).toString(36);
    avMap.set(url, c);
    st.appendChild(document.createTextNode(`.avatar.${c}{background:url("${String(url).replace(/["\\\n\r<]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))}") center/cover}`));
    return c;
  };
  const picAv = (url, size, more) => `<div class="avatar${more ? ' ' + more : ''} ${UI.avClass(url)}" style="width:${size}px;height:${size}px"></div>`;
  UI.picAvatar = picAv;
  UI.avatar = (who, size = 44) => {
    if (who === 'me' && UI.safeImg(G.S.player.avatar)) return picAv(UI.safeImg(G.S.player.avatar), size);
    if (who && who !== 'me' && !who.crowd && who.avImg && G.Media && G.Media.allowedPath(who.avImg, 0) && G.settings.mediaOn !== false) return picAv(G.Media.url(who.avImg, 160), size);
    if (who && who !== 'me' && !who.crowd && UI.safeImg(who.avatar)) return picAv(UI.safeImg(who.avatar), size);
    let emoji = '🙂';
    let seed = 'x';
    if (who === 'me') {
      emoji = G.S.player.emoji;
      seed = G.S.player.handle;
    } else if (who && who.crowd) {
      const st = who.crowd.stance;
      emoji = { fan: '😍', hater: '😒', troll: '🧌', simp: '🥺', stan: '🤩', concerned: '😟' }[st] || ['🙂', '😶', '🧑', '👤'][U.hash(who.crowd.handle) % 4];
      seed = who.crowd.handle;
    } else if (who) {
      emoji = who.emoji;
      seed = who.handle;
    }
    if (G.Faces && G.Faces.on() && who && who !== 'me') return G.Faces.avatar(seed, size); // a face instead of an emoji
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.52)}px;background:${U.gradient(seed)}">${U.esc(emoji)}</div>`;
  };

  UI.toast = (msg, kind = 'info') => {
    const root = $('#toasts');
    if (!root) return;
    // never more than 3 on screen (older ones go first), and an identical message is not shown twice
    const live = [...root.querySelectorAll('.toast')];
    if (live.some((t) => t.textContent === String(msg))) return;
    while (live.length >= 3) live.shift().remove();
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.classList.add('out'), kind === 'bad' ? 6000 : 3200);
    setTimeout(() => el.remove(), kind === 'bad' ? 6400 : 3600);
  };

  UI.setBusy = (label) => {
    const el = $('#progress');
    document.body.classList.toggle('busy', !!label);
    if (el) el.innerHTML = label ? `<div class="bar"></div><span>${U.esc(label)}</span>` : '';
    // the button you just pressed shows it is working (a quiet sheen, same size, taps ignored) until the AI call ends
    if (label) {
      const b = UI._tapBtn;
      if (b && b.isConnected && Date.now() - (UI._tapAt || 0) < 2500 && !b.classList.contains('pending')) {
        b.classList.add('pending');
        b.setAttribute('aria-busy', 'true');
        UI._pendingBtn = b;
      }
    } else if (UI._pendingBtn) {
      UI._pendingBtn.classList.remove('pending');
      UI._pendingBtn.removeAttribute('aria-busy');
      UI._pendingBtn = null;
    }
  };

  UI.applyTheme = () => {
    document.documentElement.dataset.theme = G.settings.theme || 'light';
  };
  UI.memBadge = (on) => {
    const el = $('#membadge');
    if (el) el.textContent = on ? '🧠 summarising memory…' : '';
  };

  const spendText = () => {
    const A = G.AI;
    if (A && A.capOn && A.capOn()) return `${U.money(A.spent())} of ${U.money(A.capVal())} limit`;
    return U.money(G.settings.totalSpend || 0) + ' spent';
  };
  UI.updateSpend = () => {
    const el = $('#spend');
    if (el) el.textContent = spendText();
  };

  UI.modal = (html, cls = '') => {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg" data-act="closeModal"><div class="modal ${cls}" data-stop="1">${html}</div></div>`;
    document.body.classList.add('modal-open');
  };
  UI.closeModal = () => {
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('modal-open');
    UI.openProfileId = null;
  };

  UI.bar = (label, v, max, cls) =>
    `<div class="meter"><div class="meter-top"><span>${label}</span><b>${Math.round(v)}</b></div><div class="track"><div class="fill ${cls || ''}" style="width:${U.clamp((v / max) * 100, 0, 100)}%"></div></div></div>`;

  // two-way meter for -100..100 values
  UI.bar2 = (label, v) => {
    const pos = v >= 0;
    const w = Math.min(50, (Math.abs(v) / 100) * 50);
    return `<div class="meter"><div class="meter-top"><span>${label}</span><b>${v > 0 ? '+' : ''}${Math.round(v)}</b></div><div class="track two"><div class="fill ${pos ? 'green' : 'red'}" style="${pos ? 'left:50%' : 'right:50%'};width:${w}%"></div></div></div>`;
  };

  /* ---------- posts ---------- */

  UI.nameOf = (p) => {
    const S = G.S;
    if (p.author === 'me') return { name: S.player.name, handle: S.player.handle, verified: S.player.verified, who: 'me' };
    if (p.author === 'crowd') return { name: p.crowd.name, handle: p.crowd.handle, who: p, stance: p.crowd.stance };
    const n = S.npcs[p.author];
    if (!n) return { name: 'Unknown', handle: '@unknown', who: null };
    return { name: n.name, handle: n.handle, npc: n, who: n, verified: n.followers >= 100000 };
  };

  const STANCE = { fan: '💖', hater: '😤', troll: '🧌', simp: '🥺', stan: '🤩', concerned: '😟', neutral: '' };

  /* ---------- icons (outline SVG, Instagram-style) ---------- */

  const IC = {
    camera: '<rect x="3" y="6.5" width="18" height="14" rx="3"/><path d="m8 6.5 1.4-2h5.2l1.4 2"/><circle cx="12" cy="13.5" r="4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    story: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8M8 10h6"/>',
    town: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    codex: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8M8 10h6"/>',
    notifs: '<path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.1-8 11-8 11z"/>',
    messages: '<path d="m21 3-9.5 18-2.2-7.8L2 11z"/><path d="m21 3-11.7 10.2"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
    drama: '<path d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5-3.5-8-2 1-3 3-3 4.5C10 10 9 9 9 7c-2.5 2-3 5-3 8a6 6 0 0 0 6 6z"/>',
    director: '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="m3 9 2-5 4 1.5M9 5.5 13 7l-1 2M13 7l5.5-3L21 9"/>',
    shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    create: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    comment: '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-5.3A8.5 8.5 0 1 1 21 11.5z"/>',
    reels: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8.5h18M8.5 3l3 5.5M14.5 3l3 5.5"/><path d="M10.5 12.2v4.6l4-2.3z"/>',
    save: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    repost: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  };
  UI.icon = (name, size = 24) =>
    `<svg class="i i-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  // Buttons v6 helpers (the Lucide shapes and the approval card live in js/icons.js): icon button (44px target, named) and one overflow menu
  UI.ibtn = (name, label, attrs, cls) => `<button type="button" class="ibtn ${cls || ''}" aria-label="${U.esc(String(label))}" title="${U.esc(String(label))}" ${attrs || ''}>${UI.icon(name, 20)}<span class="sr">${U.esc(String(label))}</span></button>`;
  UI.menu = (label, items, cls) => `<details class="manage kebab ${cls || ''}"><summary title="${U.esc(String(label || 'More'))}" aria-label="${U.esc(String(label || 'More'))}">${UI.icon('ellipsis', 20)}</summary><span class="mpop">${items.filter(Boolean).map((i) => `<button type="button" class="${i.danger ? 'danger' : ''}" ${i.attrs || ''}>${U.esc(String(i.label))}</button>`).join('')}</span></details>`;
  // the shapes live once in a hidden sprite (smaller HTML for every card = faster parse and diff)
  if (typeof document !== 'undefined' && document.body && !document.getElementById('icsprite')) {
    const d = document.createElement('div');
    d.id = 'icsprite';
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = `<svg width="0" height="0" style="position:absolute" focusable="false">${Object.keys(IC).map((k) => `<symbol id="ic-${k}" viewBox="0 0 24 24">${IC[k]}</symbol>`).join('')}</svg>`;
    document.body.insertBefore(d, document.body.firstChild);
  }

  /* ---------- per-render indexes: one pass over the world instead of a scan per card ---------- */

  const buildIndex = () => {
    const S = G.S;
    const kids = new Map();
    for (const id of S.postOrder) {
      const p = S.posts[id];
      if (p && p.replyTo) {
        let l = kids.get(p.replyTo);
        if (!l) kids.set(p.replyTo, (l = []));
        l.push(p);
      }
    }
    // replies are also reachable if they are not in postOrder (older saves)
    if (kids.size === 0) for (const k in S.posts) { const p = S.posts[k]; if (p.replyTo) { let l = kids.get(p.replyTo); if (!l) kids.set(p.replyTo, (l = [])); l.push(p); } }
    const stories = new Map();
    for (const st of S.stories || []) {
      if (st.exp <= S.clock) continue;
      let l = stories.get(st.author);
      if (!l) stories.set(st.author, (l = []));
      l.push(st);
    }
    return { kids, stories, clock: S.clock };
  };
  UI.idx = () => {
    if (!UI._idx || UI._idx.clock !== G.S.clock) {
      UI._idx = buildIndex();
      queueMicrotask(() => (UI._idx = null)); // valid for this render / call only
    }
    return UI._idx;
  };
  UI.kidsOf = (id) => UI.idx().kids.get(id) || [];
  UI.replyCount = (p) => Math.max(p.stats.replies, UI.kidsOf(p.id).length);

  /* ---------- stories: who has one right now ---------- */

  UI.activeStories = (id) => UI.idx().stories.get(id) || [];
  // a story ring around an avatar (gradient = something new to watch, grey = already seen)
  UI.ringAvatar = (who, size, id) => {
    const list = id ? UI.activeStories(id) : [];
    if (!list.length) return UI.avatar(who, size);
    const unseen = id === 'me' ? false : list.some((st) => !st.seen);
    return `<div class="ring ${unseen ? 'new' : 'seen'}" data-act="story" data-id="${id}" style="width:${size + 8}px;height:${size + 8}px"><div class="ring-in">${UI.avatar(who, size)}</div></div>`;
  };

  /* ---------- a procedurally painted "photo" for a post (no image files needed) ---------- */

  const sceneCache = new Map();
  UI.sceneOf = (p) => {
    if (p.scene && p.scene.hue != null) return p.scene;
    const key = p.id + ':' + p.text.length;
    let sc = sceneCache.get(key);
    if (!sc) {
      const an = G.Lex ? G.Lex.analyze(p.text + ' ' + (p.attach || '')) : { topics: [] };
      sc = G.Lex ? G.Lex.sceneFor(an.topics.length ? an.topics : ['default'], p.text) : { key: 'default', emoji: '✨', emoji2: '🌟', hue: 210, hue2: 280 };
      if (sceneCache.size > 600) sceneCache.clear();
      sceneCache.set(key, sc);
    }
    return sc;
  };
  UI.gradientOf = (sc) => `linear-gradient(135deg,hsl(${sc.hue} 78% 60%),hsl(${sc.hue2} 82% 48%))`;

  // Soft, photo-like backdrops: blurred bokeh + a topic silhouette (mountains, skyline, plate, moon…) + film grain + vignette.
  // At most ~12 variants per topic exist; each is written ONCE into a <style> block and referenced by class name (cheap to render).
  const ART_KIND = { travel: 'mountains', nature: 'mountains', fitness: 'sun', pets: 'blobs', food: 'plate', work: 'skyline', tech: 'skyline', money: 'skyline', school: 'skyline', music: 'bokeh', gaming: 'grid', movies: 'bokeh', art: 'waves', love: 'hearts', friends: 'bokeh', fashion: 'waves', mental: 'moon', default: 'waves' };
  const artSeen = new Set();
  const lcg = (n) => { let h = (n >>> 0) || 1; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const paintArt = (key, n) => {
    const base = (G.Lex && G.Lex.SCENES[key] ? G.Lex.SCENES[key].hue : 215);
    const hue = (base + (n - 6) * 7 + 360) % 360;
    const h2 = (hue + 55) % 360;
    const r = lcg(U.hash(key + n) + n * 977);
    const kind = ART_KIND[key] || 'waves';
    let b = '';
    for (let i = 0; i < 5; i++) b += `<circle cx="${Math.round(r() * 480)}" cy="${Math.round(r() * 480)}" r="${Math.round(70 + r() * 110)}" fill="hsl(${Math.round(hue + r() * 80 - 25)} 90% ${Math.round(58 + r() * 22)}%)" opacity="${(0.28 + r() * 0.3).toFixed(2)}" filter="url(#b)"/>`;
    if (kind === 'mountains') {
      b += `<circle cx="${Math.round(300 + r() * 100)}" cy="${Math.round(130 + r() * 70)}" r="46" fill="hsl(44 100% 82%)" opacity=".92" filter="url(#s)"/>`;
      b += `<path d="M0 480V${Math.round(330 - r() * 40)}L${Math.round(80 + r() * 40)} ${Math.round(250 - r() * 30)}L170 ${Math.round(330 - r() * 20)}L${Math.round(250 + r() * 40)} ${Math.round(210 - r() * 30)}L360 ${Math.round(340 - r() * 20)}L430 ${Math.round(280 - r() * 20)}L480 330V480Z" fill="hsl(${h2} 45% 22%)" opacity=".8"/><path d="M0 480V390L120 330L220 400L330 320L480 410V480Z" fill="hsl(${h2} 50% 12%)" opacity=".9"/>`;
    } else if (kind === 'skyline') {
      let x = 0;
      while (x < 480) { const w = 28 + Math.round(r() * 46), h = 90 + Math.round(r() * 230); b += `<rect x="${x}" y="${480 - h}" width="${w}" height="${h}" fill="hsl(${h2} 40% ${10 + Math.round(r() * 8)}%)" opacity=".92"/>`; for (let k = 0; k < 7; k++) if (r() < 0.55) b += `<rect x="${x + 5 + Math.round(r() * (w - 12))}" y="${480 - h + 10 + Math.round(r() * (h - 20))}" width="4" height="5" fill="hsl(48 100% 75%)" opacity=".75"/>`; x += w + 3; }
    } else if (kind === 'plate') {
      b += `<circle cx="240" cy="250" r="178" fill="rgba(255,255,255,.2)"/><circle cx="240" cy="250" r="130" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.35)" stroke-width="3"/>`;
      for (let i = 0; i < 7; i++) b += `<circle cx="${Math.round(170 + r() * 140)}" cy="${Math.round(190 + r() * 120)}" r="${Math.round(18 + r() * 34)}" fill="hsl(${Math.round(8 + r() * 60)} 85% ${Math.round(48 + r() * 20)}%)" opacity=".9"/>`;
    } else if (kind === 'sun') {
      b += `<circle cx="${Math.round(330 + r() * 60)}" cy="${Math.round(110 + r() * 40)}" r="${Math.round(90 + r() * 30)}" fill="hsl(40 100% 78%)" opacity=".7" filter="url(#s)"/><path d="M0 480V420Q120 380 240 420T480 410V480Z" fill="rgba(0,0,0,.35)"/>`;
    } else if (kind === 'moon') {
      b += `<circle cx="${Math.round(310 + r() * 60)}" cy="${Math.round(130 + r() * 50)}" r="62" fill="hsl(50 90% 90%)" opacity=".92" filter="url(#s)"/>`;
      for (let i = 0; i < 26; i++) b += `<circle cx="${Math.round(r() * 480)}" cy="${Math.round(r() * 300)}" r="${(0.8 + r() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
    } else if (kind === 'hearts') {
      for (let i = 0; i < 4; i++) { const x = Math.round(80 + r() * 320), y = Math.round(100 + r() * 280), s = 0.8 + r() * 1.6; b += `<path transform="translate(${x} ${y}) scale(${s.toFixed(2)})" d="M0 24C-34 -6 -22 -34 0 -16C22 -34 34 -6 0 24Z" fill="hsl(${Math.round(335 + r() * 25)} 90% ${Math.round(62 + r() * 14)}%)" opacity="${(0.4 + r() * 0.4).toFixed(2)}" filter="url(#s)"/>`; }
    } else if (kind === 'grid') {
      for (let i = 0; i < 12; i++) b += `<path d="M0 ${240 + i * 22}H480" stroke="hsl(${h2} 100% 75%)" stroke-opacity=".25"/><path d="M${i * 44 - 40} 240L${(i - 5) * 150 + 240} 480" stroke="hsl(${h2} 100% 75%)" stroke-opacity=".2"/>`;
    } else if (kind === 'blobs') {
      for (let i = 0; i < 4; i++) b += `<ellipse cx="${Math.round(100 + r() * 280)}" cy="${Math.round(200 + r() * 200)}" rx="${Math.round(60 + r() * 60)}" ry="${Math.round(50 + r() * 50)}" fill="hsl(${Math.round(25 + r() * 25)} 70% ${Math.round(48 + r() * 20)}%)" opacity=".75"/>`;
    } else {
      for (let i = 0; i < 3; i++) b += `<path d="M0 ${300 + i * 60}C120 ${250 + i * 60 + Math.round(r() * 60)} 240 ${350 + i * 40} 360 ${300 + i * 50}S480 ${330 + i * 40} 480 ${320 + i * 40}V480H0Z" fill="rgba(255,255,255,${(0.07 + i * 0.05).toFixed(2)})"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 78% 62%)"/><stop offset="1" stop-color="hsl(${h2} 82% 36%)"/></linearGradient><filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="30"/></filter><filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${n + 3}"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .5 0"/></filter><radialGradient id="v" cx=".5" cy=".42" r=".78"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs><rect width="480" height="480" fill="url(#g)"/>${b}<rect width="480" height="480" filter="url(#n)" opacity=".16"/><rect width="480" height="480" fill="url(#v)"/></svg>`;
    return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
  };
  UI.artClass = (sc, id) => {
    const key = ART_KIND[sc.key] || sc.key === 'default' ? sc.key || 'default' : 'default';
    const n = U.hash(String(id)) % 12;
    const cls = `art-${key}-${n}`;
    if (!artSeen.has(cls)) {
      artSeen.add(cls);
      let st = document.getElementById('artcss');
      if (!st) {
        st = document.createElement('style');
        st.id = 'artcss';
        document.head.appendChild(st);
      }
      st.appendChild(document.createTextNode(`.${cls}{background-image:${paintArt(key, n)};background-size:cover;background-position:center}`));
    }
    return cls;
  };

  const PIC_TYPES = ['photo', 'video', 'meme'];
  const SHORT_TEXT_TILE = 150;

  UI.postHTML = function (p, o = {}) {
    const S = G.S;
    const a = UI.nameOf(p);
    const mine = p.author === 'me' || !!(S.npcs[p.author] && S.npcs[p.author].userAlt);
    const avAct = a.npc ? `data-act="profile" data-id="${a.npc.id}"` : p.author === 'crowd' && p.crowd.pop !== undefined ? `data-act="popProfile" data-i="${p.crowd.pop}"` : '';
    const quoted = p.quote && S.posts[p.quote];
    const nReplies = UI.replyCount(p);
    const tags = [];
    if (mine && p.judge && !p.pending) {
      if (p.judge.v >= 8) tags.push('<span class="chip hot">🚀 viral</span>');
      if (p.judge.c >= 7) tags.push('<span class="chip red">🌶️ controversial</span>');
      if (p.tone) tags.push(`<span class="chip gray">${U.esc(p.tone)}</span>`);
      if (p.edited) tags.push('<span class="chip gray">edited</span>');
      tags.push(`<span class="chip gray" title="${U.esc(p.judge.note)}">⭐ ${p.judge.q}/10</span>`);
    }
    if (mine && p.promoted) tags.push('<span class="chip blue">📣 promoted</span>');
    if (mine && S.pinned === p.id) tags.push('<span class="chip gray">📌 pinned</span>');
    const manage = (mine || S.admin) && !p.pending
      ? `<details class="manage"><summary title="More" aria-label="More">${UI.icon('more', 20)}</summary><span class="mpop">${p.author === 'me' ? `<button data-act="pinPost" data-id="${p.id}" title="${S.pinned === p.id ? 'Unpin' : 'Pin to profile'}">${S.pinned === p.id ? 'Unpin' : 'Pin to profile'}</button>${p.replyTo ? '' : `<button data-act="promoteModal" data-id="${p.id}" title="Promote this post">Promote</button>`}` : ''}<button data-act="editPost" data-id="${p.id}" title="Edit">Edit</button><button data-act="deletePost" data-id="${p.id}" title="Delete">Delete</button></span></details>`
      : '';
    const stanceTag = a.stance && STANCE[a.stance] ? `<span class="stance" title="${a.stance}">${STANCE[a.stance]}</span>` : '';
    const heart = (tiny) => `<button class="ab like ${UI.liked(p) ? 'liked' : ''} ${tiny ? 'tiny' : ''}" data-act="like" data-id="${p.id}" title="Like">${UI.icon('notifs', tiny ? 14 : 26)}${tiny ? '' : `<span>${U.fmt(p.stats.likes)}</span>`}</button>`;

    /* --- a comment / reply: the compact Instagram comment row --- */
    if (o.depth) {
      return `<article class="post cmt ${mine ? 'mine' : ''} ${p.pending ? 'pending' : ''} depth${Math.min(o.depth, 3)}" id="post-${p.id}">
        <div ${avAct}>${UI.avatar(a.who, 32)}</div>
        <div class="pbody">
          <div class="ptext" data-act="thread" data-id="${p.id}"><b class="pname" ${avAct}>${U.esc(a.name)}</b>${a.verified ? '<span class="vf">✔</span>' : ''} ${stanceTag}<span class="ctext">${U.rich(p.text)}</span></div>
          <div class="cmeta"><span>${U.ago(S.clock, p.t)}</span>${p.stats.likes ? `<span>${U.fmt(p.stats.likes)} like${p.stats.likes === 1 ? '' : 's'}</span>` : ''}<button data-act="thread" data-id="${p.id}">Reply</button>${manage}${tags.join('')}</div>
        </div>
        ${heart(true)}
      </article>`;
    }

    /* --- a full post card --- */
    const sc = UI.sceneOf(p);
    const isPic = PIC_TYPES.includes(p.ptype) || !!p.attach;
    const textTile = !isPic && !p.poll && !p.replyTo && p.text.length <= SHORT_TEXT_TILE;
    let media = '';
    const libImg = !p.replyTo && p.img ? UI.mediaImg(p.img, p.imgl) : '';
    if (libImg) {
      media = `<div class="media photo ${UI.artClass(sc, p.id)}" data-id="${p.id}">${libImg}${p.ptype === 'video' ? '<span class="play">▶</span>' : ''}</div>`;
    } else if (!p.replyTo && !p.poll) {
      if (isPic) {
        media = `<div class="media pic ${UI.artClass(sc, p.id)}" data-id="${p.id}"><span class="sticker">${U.esc(sc.emoji)}</span>${p.ptype === 'video' ? '<span class="play">▶</span>' : ''}${p.attach ? `<div class="mcap">${U.esc(p.attach)}</div>` : ''}</div>`;
      } else if (textTile) {
        const sz = p.text.length < 40 ? 28 : p.text.length < 90 ? 22 : 18;
        media = `<div class="media txt ptext" data-id="${p.id}" ${o.thread ? '' : `data-act="thread"`} style="background:${UI.gradientOf(sc)};font-size:${sz}px"><span class="m2">${U.esc(sc.emoji)}</span><div class="mtxt">${U.rich(p.text)}</div></div>`;
      }
    }
    let pollHTML = '';
    if (p.poll) {
      const tot = p.poll.options.reduce((acc, x) => acc + x.v, 0) || 1;
      pollHTML = `<div class="poll">${p.poll.options
        .map((x, i) => {
          const pct = Math.round((x.v / tot) * 100);
          const done = p.poll.voted != null;
          return `<div class="popt ${p.poll.voted === i ? 'mine' : ''}" ${done ? '' : `data-act="vote" data-id="${p.id}" data-i="${i}"`}><div class="pbar" style="width:${done ? pct : 0}%"></div><span>${U.esc(x.t)}</span><b>${done ? pct + '%' : ''}</b></div>`;
        })
        .join('')}<div class="muted small">${U.fmt(tot)} votes${p.poll.voted == null ? ' · tap to vote' : ''}</div></div>`;
    }
    const typeTag = p.ptype && !['photo', 'video', 'poll', 'text'].includes(p.ptype) ? `<span class="chip gray">${U.esc(p.ptype)}</span>` : '';
    if (typeTag) tags.unshift(typeTag);
    const replyingTo =
      o.showReplyTo && p.replyTo && S.posts[p.replyTo]
        ? `<div class="muted small rto">↩ replying to ${U.esc(UI.nameOf(S.posts[p.replyTo]).handle)}</div>`
        : '';
    const kids = o.preview
      ? UI.kidsOf(p.id)
          .slice()
          .sort((x, y) => (y.author !== 'crowd') - (x.author !== 'crowd') || y.stats.likes - x.stats.likes)
          .slice(0, 2)
      : [];
    const kidsHTML = kids.length
      ? `<div class="preview" data-act="thread" data-id="${p.id}">${kids
          .map((k) => {
            const ka = UI.nameOf(k);
            return `<div class="pv"><b>${U.esc(ka.name)}</b> ${U.rich(k.text.slice(0, 140))}</div>`;
          })
          .join('')}</div>`
      : '';
    const long = p.text.length > 120 && !UI.expanded.has(p.id);
    const caption = textTile && !libImg
      ? ''
      : `<div class="cap ${long && !o.thread ? 'clamp' : ''}" data-pid="${p.id}"><b class="pname" ${avAct}>${U.esc(a.name)}</b> <span class="ptext" ${o.thread ? '' : `data-act="thread" data-id="${p.id}"`}>${U.rich(p.text)}</span>${long && !o.thread ? ' <button class="more" data-act="capMore">more</button>' : ''}</div>`;
    const status = a.npc ? `<span class="chip tiny ${UI.statusMeta(a.npc.status, a.npc).cls}" title="${UI.statusMeta(a.npc.status, a.npc).label}">${UI.statusMeta(a.npc.status, a.npc).emoji}</span>` : '';
    const ringId = p.author === 'me' ? 'me' : a.npc ? a.npc.id : null;
    const hasRing = !!(ringId && UI.activeStories(ringId).length);
    const followPill = a.npc && !mine && !UI.following(a.npc.id) ? `<button class="followpill" data-act="followPill" data-id="${a.npc.id}">Follow</button>` : '';
    // "Liked by Mia, Kai and 1,203 others" — real people from the sim, shown as faces
    const likers = (p.likedBy || []).map((id) => S.npcs[id]).filter(Boolean);
    const seenL = [];
    for (let i = likers.length - 1; i >= 0 && seenL.length < 2; i--) if (!seenL.includes(likers[i])) seenL.push(likers[i]);
    const others = Math.max(0, p.stats.likes - seenL.length - (p.liked ? 1 : 0));
    const likedBy = !o.thread && (seenL.length || p.liked) && p.stats.likes > 0
      ? `<div class="likedby"><span class="faces">${seenL.map((n) => UI.avatar(n, 18)).join('')}</span><span>Liked by ${p.liked ? '<b>you</b>' : ''}${p.liked && seenL.length ? ', ' : ''}${seenL.map((n) => `<b>${U.esc(G.U.first(n.name))}</b>`).join(', ')}${others ? ` and <b>${U.fmt(others)} others</b>` : ''}</span></div>`
      : '';
    const ago = U.ago(S.clock, p.t);
    const canComment = !o.thread && !p.pending && !p.replyTo;
    return `<article class="post ${mine ? 'mine' : ''} ${p.pending ? 'pending' : ''}" id="post-${p.id}">
      <header class="ph">
        <div class="phav" ${hasRing ? '' : avAct}>${hasRing ? UI.ringAvatar(a.who, 32, ringId) : UI.avatar(a.who, 40)}</div>
        <div class="pmeta phead" ${avAct}>
          <div class="pn"><b class="pname">${U.esc(a.name)}</b>${a.verified ? '<span class="vf">✔</span>' : ''} <span class="dot">•</span> <span class="ago">${ago}</span> ${stanceTag} ${status}${S.npcs[p.author] && S.npcs[p.author].userAlt ? '<span class="chip tiny gray" title="Your burner account">🎭 burner</span>' : ''}${p.audience === 'close' ? `<span class="cfbadge" title="${a.npc && !G.Engine.isClose(a.npc) ? 'Close friends only. You are not on their list: you see it as the owner of this world' : 'Close friends only'}">💚${a.npc && !G.Engine.isClose(a.npc) ? '👁' : ''}</span>` : ''}</div>
          <div class="muted small">${U.esc(a.handle)}</div>
        </div>
        ${followPill}${manage}
      </header>
      ${replyingTo}
      ${caption}
      ${media}
      <div class="pacts">
        ${heart(false)}
        <button class="ab" data-act="thread" data-id="${p.id}" title="Comments">${UI.icon('comment', 25)}<span>${U.fmt(nReplies)}</span></button>
        <button class="ab" data-act="quote" data-id="${p.id}" title="Repost with comment">${UI.icon('repost', 25)}<span>${U.fmt(p.stats.reposts)}</span></button>
        <button class="ab save ${p.saved ? 'on' : ''}" data-act="saveToggle" data-id="${p.id}" title="Save">${UI.icon('save', 25)}</button>
      </div>
      <div class="pbody">
        ${likedBy}
        ${quoted ? `<div class="quote" data-act="thread" data-id="${quoted.id}"><b>${U.esc(UI.nameOf(quoted).name)}</b> <span class="muted">${U.esc(UI.nameOf(quoted).handle)}</span><div>${U.rich(quoted.text.slice(0, 200))}</div></div>` : ''}
        ${pollHTML}
        ${tags.length ? `<div class="ptags">${tags.join('')}</div>` : ''}
        ${!o.thread && nReplies > 2 ? `<button class="vall" data-act="thread" data-id="${p.id}">View all ${U.fmt(nReplies)} comments</button>` : ''}
        ${kidsHTML}
        ${o.thread ? '' : `<time class="when">${ago}${/^\d/.test(ago) ? ' ago' : ''} · ${U.fmt(p.stats.views || p.stats.likes * 10)} views</time>`}
        ${canComment ? `<div class="addc"><input class="cmtin" data-pid="${p.id}" maxlength="400" placeholder="Add a comment…" autocomplete="off"><button class="cmtgo" data-act="inlineComment" data-id="${p.id}">Post</button></div>` : ''}
      </div>
    </article>`;
  };

  // Instagram grid tile (profile grid, explore mosaic): picture tiles show the scene, text tiles show the words
  UI.gridTile = function (p, big) {
    const sc = UI.sceneOf(p);
    const pic = PIC_TYPES.includes(p.ptype) || !!p.attach;
    const snippet = p.text.length > 70 ? p.text.slice(0, 68).trim() + '…' : p.text;
    const nRep = Math.max(p.stats.replies, 0);
    const lib = p.img ? UI.mediaImg(p.img, p.imgl, '', false, 360) : '';
    return `<button class="gtile ${big === true ? 'big' : big || ''} ${pic || lib ? UI.artClass(sc, p.id) : ''}" data-act="thread" data-id="${p.id}" ${pic || lib ? '' : `style="background:${UI.gradientOf(sc)}"`} title="${U.esc(p.text.slice(0, 120))}">
      ${lib ? lib.replace('data-act="reveal"', '') : pic ? `<span class="g1">${U.esc(sc.emoji)}</span>` : `<span class="gt">${U.esc(snippet)}</span>`}
      ${p.ptype === 'video' ? '<span class="gplay">▶</span>' : p.poll ? '<span class="gplay">📊</span>' : ''}
      <span class="gstat">❤ ${U.fmt(p.stats.likes)} &nbsp; 💬 ${U.fmt(nRep)}</span></button>`;
  };

  /* ---------- Instagram-style profile pieces: header, highlights, tabs ---------- */

  const TOPIC_NAME = { food: 'Food', travel: 'Travel', fitness: 'Gym', music: 'Music', fashion: 'Style', love: 'Love', friends: 'Friends', work: 'Work', school: 'Study', gaming: 'Games', movies: 'Movies', art: 'Art', tech: 'Tech', money: 'Money', mental: 'Mood', pets: 'Pets', default: 'Life' };
  UI.topicName = (k) => TOPIC_NAME[k] || String(k).charAt(0).toUpperCase() + String(k).slice(1);
  UI.isMediaPost = (p) => !p.replyTo && !p.poll && (PIC_TYPES.includes(p.ptype) || !!p.attach || !!p.img);
  // story-highlight circles = the topics someone posts about most (tap one to filter their grid)
  UI.highlightsOf = (posts) => {
    const by = new Map();
    for (const p of posts) {
      const sc = UI.sceneOf(p);
      const k = sc.key || 'default';
      const e = by.get(k) || { key: k, n: 0, emoji: sc.emoji };
      e.n++;
      by.set(k, e);
    }
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  };
  UI.profileHead = (o) => `<div class="pf">
    <div class="pf-top"><div class="pf-av">${o.avatar}</div>
      <div class="pf-stats"><div><b>${U.fmt(o.posts)}</b><span>posts</span></div><div><b>${U.fmt(o.followers)}</b><span>followers</span></div><div><b>${U.fmt(o.following)}</b><span>following</span></div></div></div>
    <div class="pf-name">${U.esc(o.name)}${o.verified ? '<span class="vf">✔</span>' : ''}</div>
    ${o.sub ? `<div class="pf-sub muted small">${o.sub}</div>` : ''}
    <div class="pf-bio">${o.bio}</div>
    <div class="pf-btns">${o.buttons}</div>
    <div class="pf-hl">${o.addNew ? `<button class="hl" data-act="storyCompose"><span class="hl-c plus">＋</span><span>New</span></button>` : ''}${o.highlights
      .map((h) => `<button class="hl ${o.active === h.key ? 'on' : ''}" data-act="hlTopic" data-k="${h.key}" data-who="${o.who}"><span class="hl-c ${UI.artClass({ key: h.key }, 'hl' + h.key)}">${U.esc(h.emoji)}</span><span>${U.esc(UI.topicName(h.key))}</span></button>`)
      .join('')}</div>
  </div>`;
  UI.profTabs = (tab, tabs) => `<div class="ptabs2">${tabs.map(([k, ic, label]) => `<button class="${tab === k ? 'on' : ''}" data-act="profTab" data-k="${k}" title="${label}">${UI.icon(ic, 24)}</button>`).join('')}</div>`;

  /* ---------- render dispatcher ---------- */

  UI.NAV = [
    ['home', 'home', 'Home'],
    ['explore', 'explore', 'Explore'],
    ['town', 'town', 'Town'],
    ['notifs', 'notifs', 'Alerts'],
    ['messages', 'messages', 'Messages'],
    ['people', 'people', 'People'],
    ['drama', 'drama', 'Drama'],
    ['director', 'director', 'Director'],
    ['storyteller', 'drama', 'Storyteller'],
    ['admin', 'director', 'Admin'],
    ['shop', 'shop', 'Shop'],
    ['me', 'me', 'Profile'],
    ['settings', 'settings', 'Settings'],
  ];

  UI.go = (page, extra = {}) => {
    UI.page = page;
    Object.assign(UI, extra);
    UI.thread = extra.thread || null; // navigating always leaves any open thread
    UI.closeModal();
    UI.render();
    window.scrollTo(0, 0);
  };

  UI.badgeCounts = function () {
    const S = G.S;
    const unreadN = S.notifs.filter((n) => !n.read && n.type !== 'dm').length;
    const unreadDm =
      Object.values(S.dms).reduce((a, arr) => a + arr.filter((m) => m.from !== 'me' && !m.read).length, 0) +
      Object.values(S.altDms || {}).reduce((a, byNpc) => a + Object.values(byNpc).reduce((b, arr) => b + arr.filter((m) => m.from !== 'me' && !m.read).length, 0), 0) +
      Object.values(S.groups || {}).reduce((a, g) => a + (g.muted ? 0 : g.msgs.filter((m) => m.from !== 'me' && !m.read).length), 0);
    const pendingEv = S.events.filter((e) => !e.resolved).length;
    return { notifs: unreadN, messages: unreadDm, home: pendingEv };
  };

  // Make `el`'s children match `src`'s children changing as little as possible. Nodes with an id are matched by id,
  // so a new post at the top does not rebuild everything below it; unchanged nodes are never touched.
  const patchFallback = (el, src) => {
    const want = Array.from(src.childNodes);
    const byId = new Map();
    for (const c of el.childNodes) if (c.nodeType === 1 && c.id) byId.set(c.id, c);
    const fin = want.map((n, i) => {
      if (n.nodeType === 1 && n.id) {
        const old = byId.get(n.id);
        if (old && (old.isEqualNode(n) || old.contains(document.activeElement))) return old; // untouched (or being typed in)
        return n;
      }
      const cur = el.childNodes[i];
      return cur && !(cur.nodeType === 1 && cur.id) && cur.isEqualNode(n) ? cur : n;
    });
    fin.forEach((n, i) => {
      const cur = el.childNodes[i];
      if (cur !== n) el.insertBefore(n, cur || null);
    });
    while (el.childNodes.length > fin.length) el.lastChild.remove();
  };
  // morphdom (MIT) does the real work when present: it updates text/attributes inside a card instead of replacing the card,
  // keeps images and focus, and matches cards by id.
  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // motion is for real screens: not jsdom (no matchMedia / animate), not a hidden tab, not for people who asked for less
  const canMove = () => typeof matchMedia === 'function' && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !document.hidden && !reducedMotion();
  UI.canMove = canMove;
  const EASE = 'cubic-bezier(.22,.9,.24,1)';
  UI.patchChildren = (el, src) => {
    if (!window.morphdom) return patchFallback(el, src);
    // FLIP by hand: note where every card is, patch, then let the cards that moved glide from the old place and the new ones ease in.
    // (Cards are matched by id, exactly like morphdom does, so it works with the keyed patch and costs one measure + one read.)
    let before = null;
    if (canMove() && el.firstElementChild) {
      before = new Map();
      for (const c of el.children) if (c.id) before.set(c.id, c.getBoundingClientRect().top);
    }
    window.morphdom(el, src, {
      childrenOnly: true,
      getNodeKey: (n) => (n.nodeType === 1 && n.id ? n.id : undefined),
      onBeforeElUpdated: (from, to) => {
        // state that lives in the page, not in the markup, must survive a patch
        if (from.classList.contains('loaded') && !to.classList.contains('loaded')) to.classList.add('loaded'); // a photo that already arrived
        if (from === UI._pendingBtn && !to.classList.contains('pending')) to.classList.add('pending'); // a button waiting for the AI
        if (from.isEqualNode(to)) return false; // nothing changed here: skip the whole subtree
        if ((from.tagName === 'INPUT' || from.tagName === 'TEXTAREA') && from.value && !to.value) to.value = from.value; // keep half-typed text
        return true;
      },
    });
    if (before && before.size) {
      const vh = window.innerHeight;
      const moves = [];
      let fresh = 0;
      for (const c of el.children) {
        if (!c.id) continue;
        const r = c.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue; // only what can be seen is worth animating
        const was = before.get(c.id);
        if (was === undefined) {
          fresh++;
          moves.push([c, null]);
        } else if (Math.abs(was - r.top) > 2) moves.push([c, was - r.top]);
      }
      if (fresh > 8) return; // a whole new list (another tab, a search): no choreography, the page-enter rise is enough
      for (const [c, dy] of moves) {
        c.animate(dy === null ? [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }] : [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: dy === null ? 320 : 260, easing: EASE });
      }
    }
  };

  /* ---------- answer the finger first, redraw second ---------- */

  let soon = 0;
  // one full redraw, a moment from now (when the browser has a free frame), however many taps asked for it
  UI.renderSoon = () => {
    if (soon) return;
    soon = 1;
    const run = () => { soon = 0; if (G.S) UI.render(); };
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16);
    raf(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 250 }) : setTimeout(run, 40)));
  };
  const pop = (el) => {
    if (el && el.animate && canMove()) el.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.35)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  };
  // flip the hearts and counters of a post right now (every copy on screen), from the state that was just changed
  UI.likeNow = (id) => {
    const p = G.S && G.S.posts[id];
    if (!p) return;
    const on = UI.liked(p);
    document.querySelectorAll('[data-act="like"]').forEach((b) => {
      if (b.dataset.id !== id) return;
      const was = b.classList.contains('liked');
      b.classList.toggle('liked', on);
      const n = b.querySelector(':scope > span');
      if (n) n.textContent = U.fmt(p.stats.likes);
      if (on && !was) pop(b.querySelector('svg'));
    });
  };
  // the same for a Follow button: it turns into Following at once
  UI.followNow = (id) => {
    const on = UI.following(id);
    document.querySelectorAll('[data-act="follow"],[data-act="followPill"]').forEach((b) => {
      if (b.dataset.id !== id) return;
      if (b.dataset.act === 'followPill') {
        if (on) {
          b.style.transition = 'opacity .2s';
          b.style.opacity = '0';
          b.style.pointerEvents = 'none';
        }
        return;
      }
      b.classList.toggle('primary', !on);
      if (b.dataset.sfx === undefined) b.dataset.sfx = /✓/.test(b.textContent) ? ' ✓' : '';
      b.textContent = on ? 'Following' + b.dataset.sfx : 'Follow';
    });
  };

  // put the text boxes back to what the state says (a failed post restores your draft; DM log scrolls to the newest message)
  const restoreDrafts = () => {
    // UI.draft is synced on every keystroke, so assigning it back never disturbs typing
    const ta = $('#composer');
    if (ta && ta.value !== UI.draft) ta.value = UI.draft;
    const rd = $('#replybox');
    if (rd && rd.value !== UI.replyDraft) rd.value = UI.replyDraft;
    const dm = $('#dmbox');
    if (dm) {
      if (dm.value !== UI.dmDraft) dm.value = UI.dmDraft;
      const log = $('#chatlog');
      if (log) {
        const key = (UI.dmWith || UI.groupWith) + '|' + log.children.length; // jump to the newest message only when the chat changed
        if (UI._logKey !== key) {
          log.scrollTop = log.scrollHeight;
          UI._logKey = key;
        }
      }
    }
  };

  /* ---------- motion: where you were (scroll memory) and a short view transition between screens ---------- */

  const scrollMem = new Map(); // "page+thread" -> scrollY. Memory only, never saved
  UI.scrollMem = scrollMem;
  UI.vt = (kind, id) => { UI._vt = { kind, id }; }; // "the next screen change is a tap you can see": open a thread, go back, change tab
  const shareEl = (root) => (root && root.querySelector ? root.querySelector('.media') : null); // the picture of a post: the same piece on both screens
  const viewTransition = (swap, hint, prevKey) => {
    if (!hint || typeof document.startViewTransition !== 'function' || reducedMotion() || document.hidden) return false;
    const named = [];
    const mark = (el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return; // off screen: nothing to follow
      el.style.viewTransitionName = 'cl-shared';
      named.push(el);
    };
    const left = /^home(.+)$/.exec(prevKey || '');
    if (hint.kind === 'open' && hint.id) mark(shareEl(document.getElementById('post-' + hint.id)));
    else if (hint.kind === 'back') mark(shareEl(document.querySelector('#page .rootpost')));
    try {
      const t = document.startViewTransition(() => {
        try { swap(); } catch (e) { console.error(e); }
        if (hint.kind === 'open') mark(shareEl(document.querySelector('#page .rootpost')));
        else if (hint.kind === 'back' && left) mark(shareEl(document.getElementById('post-' + left[1])));
      });
      const clear = () => named.forEach((el) => { el.style.viewTransitionName = ''; });
      if (t && t.finished) t.finished.then(clear, clear);
      return true;
    } catch (e) {
      return false;
    }
  };
  // taps we want to know about before the click's own handler runs: a bottom-bar tap is a visible navigation; the pressed button may need a waiting look
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      if (el.closest('[data-act="nav"]') && !UI._vt) {
        UI.vt('tab');
        setTimeout(() => { UI._vt = null; }, 0);
      }
      const b = el.closest('.btn[data-act], button.btn');
      if (b) { UI._tapBtn = b; UI._tapAt = Date.now(); }
    }, true);
    document.addEventListener('touchstart', () => {}, { passive: true }); // (iPhone Safari only shows :active press feedback when a touch listener exists)
    // a photo that arrived: the shimmer placeholder goes away (load does not bubble, so listen while it travels down)
    document.addEventListener('load', (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.classList.contains('lib') && t.parentElement) t.parentElement.classList.add('loaded');
    }, true);
  }

  // messages you are looking at are read. (This used to happen inside the page builder: drawing a page must not change the world.)
  UI.markRead = () => {
    const S = G.S;
    if (!S || UI.page !== 'messages') return false;
    let list = null;
    if (UI.groupWith && S.groups[UI.groupWith]) list = S.groups[UI.groupWith].msgs;
    else if (UI.dmWith && S.npcs[UI.dmWith]) {
      const alt = UI.acting();
      const store = alt ? (S.altDms && S.altDms[alt.id]) || {} : S.dms;
      list = store[UI.dmWith] || [];
    }
    let ch = false;
    for (const m of list || []) if (!m.read) { m.read = true; ch = true; }
    if (ch) {
      G.Store.saveSoon();
      UI.renderSoon(); // the unread badges follow
    }
    return ch;
  };

  // endless feed: when the "Show more" button comes within a screen of the bottom, press it for you (the button stays as the fallback)
  let io = null;
  let ioEl = null;
  UI._moreAt = 0;
  const watchMore = () => {
    if (typeof IntersectionObserver !== 'function') return;
    const btn = document.querySelector('#page > [data-act="moreFeed"]');
    if (!btn) {
      if (io && ioEl) io.unobserve(ioEl);
      ioEl = null;
      return;
    }
    if (!io) {
      io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting) || !UI.acts.moreFeed) return;
        const wait = 350 - (Date.now() - UI._moreAt);
        if (wait > 0) return void setTimeout(() => { if (ioEl) { io.unobserve(ioEl); io.observe(ioEl); } }, wait); // look again shortly
        UI._moreAt = Date.now();
        UI.acts.moreFeed();
      }, { rootMargin: '0px 0px 900px 0px' });
    }
    if (ioEl && ioEl !== btn) io.unobserve(ioEl);
    else if (ioEl === btn) io.unobserve(btn); // observe again: asks "is it still in view?" after the list grew
    ioEl = btn;
    btn.classList.add('autoload');
    io.observe(btn);
  };

  // the chat log (a clean container: only bubbles come and go) eases new messages in with auto-animate (vendor/auto-animate.min.js, loaded after the first screen; absent = no motion, nothing breaks)
  let aaState = 0; // 0 not asked, 1 loading, 2 ready, -1 unavailable
  const animateLog = () => {
    const log = document.getElementById('chatlog');
    if (!log || log._aa || !canMove()) return;
    if (aaState === 2 && window.autoAnimate) {
      log._aa = 1;
      window.autoAnimate(log, { duration: 220, easing: 'ease-out' });
    } else if (aaState === 0) {
      aaState = 1;
      const sc = document.createElement('script');
      sc.src = 'vendor/auto-animate.min.js';
      sc.onload = () => { aaState = window.autoAnimate ? 2 : -1; animateLog(); };
      sc.onerror = () => { aaState = -1; };
      document.head.appendChild(sc);
    }
  };
  UI.afterPaint = () => {
    animateLog();
    if (!(UI.page === 'messages' && UI.dmWith)) UI._chatPrev = null; // leaving a chat forgets what it showed
    document.body.classList.toggle('in-chat', UI.page === 'messages' && !!(UI.dmWith || UI.groupWith)); // (the floating button steps aside over a chat's input)
    UI.markRead();
    watchMore();
    if (UI._avReset) {
      UI._avReset = false;
      UI.renderSoon();
    }
  };

  UI.render = function () {
    const app = $('#app');
    if (!G.S) {
      document.body.classList.remove('ingame');
      app.innerHTML = G.Pages.start();
      return;
    }
    document.body.classList.add('ingame');
    document.body.classList.toggle('on-reels', UI.page === 'reels' && !UI.thread);
    UI.applyTheme();
    if (G.Live) G.Live.adopt(); // first sight of a world: catch up + seed a few stories
    if (G.Live) G.Live.sync();
    const S = G.S;
    const badge = UI.badgeCounts();
    const PRIMARY = ['home', 'explore', 'messages', 'notifs', 'me']; // the owner's five places; the rest live in the More list and the Story link card
    const nav = UI.NAV.map(
      ([k, ic, lb]) =>
        `<button class="navb ${PRIMARY.includes(k) ? '' : 'sec'} ${UI.page === k ? 'on' : ''}" data-act="nav" data-page="${k}" title="${lb}"><span class="ic">${UI.icon(ic, 26)}</span><span class="lb">${lb}</span>${badge[k] ? `<i class="badge">${badge[k] > 99 ? '99+' : badge[k]}</i>` : ''}</button>`
    ).join('');
    const createBtn = `<button class="navb create" data-act="create" title="Create a post"><span class="ic">${UI.icon('create', 26)}</span><span class="lb">Create</span></button><button class="navb more" data-act="moreNav" title="More"><span class="ic">${UI.icon('more', 26)}</span><span class="lb">More</span></button><div class="sheetctl">${G.Pages.controls()}</div>`;

    const y = window.scrollY;
    const keep = app.dataset.page === UI.page + (UI.thread || '');
    let page = '';
    try {
      page = G.Pages[UI.page] ? G.Pages[UI.page]() : '';
    } catch (e) {
      console.error(e);
      page = `<div class="card"><h3>Something broke while drawing this page</h3><p class="muted">${U.esc(e.message)}</p></div>`;
    }
    let html = `
      <nav id="nav"><div class="logo" data-act="nav" data-page="home"><span class="lg">☁️</span><b>Clout</b></div>${nav}${createBtn}
        <div class="spendbox"><span id="spend">${spendText()}</span><div id="membadge"></div></div></nav>
      <main id="main">${G.Pages.topbar()}<div id="page">${page}</div></main>
      <aside id="side">${G.Pages.side()}</aside>`;
    if (G.Minimal) html = G.Minimal.html(html); // minimal interface: no emoji in the app's own labels (what people write is kept)
    const cur = $('#page');
    if (keep && cur && $('#nav') && html === UI._lastHtml) {
      restoreDrafts(); // identical to what is on screen: no DOM work, but the text boxes still follow the state
      UI._vt = null;
      UI._pop = false;
      return;
    }
    UI._lastHtml = html;
    if (keep && cur && $('#nav')) {
      // same screen: update IN PLACE — only the pieces that changed are touched (no flicker, hover/animation/scroll survive)
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const T = (sel) => tpl.content.querySelector(sel);
      ['#nav', '#topbar', '#side'].forEach((sel) => {
        const a = $(sel), b = T(sel);
        if (a && b && !a.isEqualNode(b) && !a.contains(document.activeElement)) a.replaceWith(b);
      });
      UI.patchChildren(cur, T('#page'));
    } else {
      // a different screen: remember where this one was scrolled to, then swap (through a short view transition when the browser has one)
      const prevKey = app.dataset.page || '';
      const newKey = UI.page + (UI.thread || '');
      if (prevKey && prevKey !== newKey) {
        scrollMem.delete(prevKey);
        scrollMem.set(prevKey, y);
        if (scrollMem.size > 60) scrollMem.delete(scrollMem.keys().next().value);
      }
      const hint = UI._vt;
      UI._vt = null;
      const popping = !!UI._pop;
      UI._pop = false;
      const swap = () => {
        app.innerHTML = html;
        const pg = $('#page');
        if (pg) {
          pg.classList.add('enter'); // a soft rise-in when you change screen
          setTimeout(() => pg.classList.remove('enter'), 700);
        }
        app.dataset.page = newKey;
        const target = popping ? scrollMem.get(newKey) || 0 : 0;
        window.scrollTo(0, target); // going back to a list: the same place you left it
        if (target && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (Math.abs(window.scrollY - target) > 2 && UI.page + (UI.thread || '') === newKey) window.scrollTo(0, target); }); // (a view transition can settle the scroll back to the top once)
        restoreDrafts();
        UI.afterPaint();
      };
      if (!viewTransition(swap, hint, prevKey)) swap();
      return;
    }
    app.dataset.page = UI.page + (UI.thread || '');
    UI._vt = null;
    UI._pop = false;
    restoreDrafts();
    UI.afterPaint();
  };
})(window.G);
