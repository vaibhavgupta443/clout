/* Clout — settings (localStorage) + world saves (IndexedDB local database, localStorage fallback).
   The API stays synchronous: saves live in an in-memory cache that is written through to IndexedDB. */
(function (G) {
  const SETTINGS_KEY = 'clout_settings_v1';
  const INDEX_KEY = 'clout_index_v1';
  const SAVE_PREFIX = 'clout_save_';
  const BACKUP_EVERY_MS = 5 * 60 * 1000;
  const BACKUPS_KEPT = 5;

  const MODELS = [
    ['deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash — cheapest live model, good & permissive (~$0.09 in / $0.18 out per 1M)'],
    ['~deepseek/deepseek-v4-flash-latest', 'DeepSeek V4 Flash (latest alias) (~$0.05 / $0.16 per 1M)'],
    ['deepseek/deepseek-v4.1-flash-1017', 'DeepSeek V4.1 Flash 1017 — newest (17 Oct), half the price of plain 4.1 (~$0.15 / $0.60 per 1M)'],
    ['deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash — newer, pricier (~$0.30 / $1.20 per 1M)'],
    ['z-ai/glm-5.3-flash', 'GLM 5.3 Flash — very cheap (~$0.005 / $0.19 per 1M)'],
    ['qwen/qwen3.5-flash-02-23', 'Qwen 3.5 Flash (~$0.07 / $0.26 per 1M)'],
    ['xiaomi/mimo-v2.5', 'MiMo V2.5 — creative (~$0.12 / $0.24 per 1M)'],
    ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B — permissive (~$0.10 / $0.32 per 1M)'],
    ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5 — best writing (~$0.10 / $0.50 per 1M)'],
  ];

  const DEFAULTS = {
    apiKey: '',
    provider: 'openrouter', // openrouter | ollama | lmstudio | koboldcpp | custom
    baseUrl: '', // blank = the provider's default address
    model: 'deepseek/deepseek-v4-flash',
    temperature: 0.95,
    drama: 2, // 1 gentle, 2 spicy, 3 chaos
    romance: 2, // 1 slow burn, 2 flirty, 3 passionate
    richness: 2, // 1 lean, 2 normal, 3 busy  (replies per action)
    autoEvents: 2, // 0 off, 1 occasional, 2 frequent, 3 chaotic (random wildcard scenarios woven into turns)
    autoSummary: true,
    worldSpeed: 2, // 0 paused, 1 slow, 2 normal, 3 fast (the living world keeps going while the app is open)
    directorOnly: false, // (off) the background line-writer and the automatic summaries run; turn on to spend credits only when you direct
    waitForMe: false, // (off) when on, the clock stands still while someone is waiting for your reply
    minimalUI: true, // no emoji in the app's own buttons, menus and headings (what people write keeps its emoji)
    fameSim: true, // followers and money move with the clock; virality, milestones and offers (Shop)
    leads: true, // strangers who heard about you can reach out; if you answer, they join the cast
    mainCastOnly: true, // only the characters you brought: nobody new shows up by themselves; turn off later to let the town grow
    suggestions: true, // the world prepares posts, stories and replies for you to approve
    fab: true, // the floating ✨ button
    faces: true, // drawn portraits as profile pictures instead of emoji
    channels: true, // public channels where the town talks about the story (free, never part of the feed)
    dmRate: 2, // how often characters message you: 0.5 few, 1 normal, 2 more (default), 3 lots
    worldEvents: true, // free random world events (a festival, a blackout, a meme...) that people react to by messaging you
    postDial: 0, // how often the cast makes its OWN posts: 0 = only what I direct (Storyteller / Admin / after a roleplay), 0.3 rarely, 1 normal, 1.8 lots
    feedRate: 0.6, // how much the cast does on its own: 0 silent (they only react to you), 0.25 quiet, 0.6 calm, 1 normal, 1.6 busy
    liveBank: true, // let the AI pre-write richer NPC posts in the background (a few cents per refill)
    helperOn: false, // a free LOCAL model does the cheap background jobs
    helperProvider: 'ollama', // ollama | lmstudio | koboldcpp | custom
    helperBase: '', // blank = the provider's default address
    helperModel: '',
    cheapModel: '', // optional cheaper OpenRouter model for background jobs when no helper is set
    route: { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' }, // which side handles each kind of job
    localCalls: 0,
    localTokens: 0,
    fallbackModel: '', // retried here when the main model refuses (same provider)
    spendCap: 1, // USD hard stop for paid (OpenRouter) calls in this window; 0 = no limit
    spendBase: null, // totalSpend when the current cap window started (null = start now)
    iosTipDismissed: false, // the "Add to Home Screen" hint on iPhone
    mediaOn: true, // use photos from the local media/ folder
    mediaChance: 70, // % of photo-type posts that get a photo from your library
    theme: 'light',
    noThink: true,
    totalSpend: 0,
    totalTokens: 0,
  };

  const EMERG_PREFIX = 'clout_emerg_'; // the newest copy of a world, kept here while the database cannot be reached
  const Store = (G.Store = { MODELS, DEFAULTS, ready: false, mode: 'localStorage', lastError: null, flushes: 0 });

  const read = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, typeof v === 'string' && k.startsWith(SAVE_PREFIX) ? v : JSON.stringify(v));
      return true;
    } catch (e) {
      Store.lastError = e;
      G.UI && G.UI.toast('Could not save — browser storage is full. Export your world from Settings.', 'bad');
      return false;
    }
  };

  G.settings = Object.assign({}, DEFAULTS, read(SETTINGS_KEY, {}));
  Store.saveSettings = () => write(SETTINGS_KEY, G.settings);

  /* ---------- the world database ---------- */

  let cache = {}; // id -> JSON text of the world
  let index = []; // [{id,name,player,followers,day,savedAt}] newest first
  const dirty = new Set();
  const lastBackup = {};
  let timer = null;

  const metaOf = (S) => ({ id: S.id, name: S.world.name, player: S.player.name, followers: S.player.followers, day: G.U.dayOf(S.clock), savedAt: S.savedAt });
  const useDb = () => Store.mode === 'indexeddb';

  // Open the database, bring saves into memory, migrate anything still in localStorage.
  Store.init = function () {
    // one shared promise: boot, tests or a double call can never open/migrate the database twice
    if (!Store._initP) Store._initP = Store._init();
    return Store._initP;
  };
  Store._init = async function () {
    if (Store.ready) return Store.mode;
    let ok = await G.DB.open();
    if (!ok && typeof indexedDB !== 'undefined') {
      await new Promise((r) => setTimeout(r, 1500)); // one more try before giving up on the database (a phone can be slow on a cold start)
      ok = await G.DB.open();
      if (!ok && G.UI && G.UI.toast) G.UI.toast('The phone database is not available right now: your world is kept in a smaller backup store.', 'info');
    }
    if (ok) {
      try {
        Store.mode = 'indexeddb';
        cache = await G.DB.all('saves');
        // a copy written while the database was unreachable is NEWER than what it holds: bring it in
        try {
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(EMERG_PREFIX)) keys.push(k); }
          for (const k of keys) {
            const id = k.slice(EMERG_PREFIX.length);
            const raw = localStorage.getItem(k);
            let em = null;
            try { em = JSON.parse(raw); } catch (e) {}
            let cur = 0;
            try { cur = cache[id] ? JSON.parse(cache[id]).savedAt || 0 : 0; } catch (e) {}
            if (em && em.world && (em.savedAt || 0) > cur) { cache[id] = raw; await G.DB.put('saves', id, raw); }
            localStorage.removeItem(k);
          }
        } catch (e) {}
        index = (await G.DB.get('meta', 'index')) || [];
        // make sure the index matches what is really stored
        index = index.filter((m) => cache[m.id]);
        for (const id of Object.keys(cache)) {
          if (!index.some((m) => m.id === id)) {
            try {
              index.push(metaOf(JSON.parse(cache[id])));
            } catch (e) {}
          }
        }
        // one-time migration from the old localStorage saves
        for (const m of read(INDEX_KEY, [])) {
          const raw = localStorage.getItem(SAVE_PREFIX + m.id);
          if (raw && !cache[m.id]) {
            cache[m.id] = raw;
            index.push(m);
            await G.DB.put('saves', m.id, raw);
          }
        }
        index.sort((a, b) => b.savedAt - a.savedAt);
        await G.DB.put('meta', 'index', index);
        // old copies are only removed once they are safely in the database
        for (const m of read(INDEX_KEY, [])) {
          if (cache[m.id]) {
            try {
              localStorage.removeItem(SAVE_PREFIX + m.id);
            } catch (e) {}
          }
        }
        try {
          localStorage.removeItem(INDEX_KEY);
        } catch (e) {}
        // ask the browser not to evict our data under storage pressure
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      } catch (e) {
        Store.mode = 'localStorage';
        Store.lastError = e;
      }
    }
    Store.ready = true;
    return Store.mode;
  };

  Store.list = () => (useDb() ? index.slice() : read(INDEX_KEY, []));

  const flushNow = async () => {
    timer = null;
    if (!useDb() || !dirty.size) return;
    const ids = [...dirty];
    dirty.clear();
    try {
      for (const id of ids) {
        if (cache[id] == null) continue;
        await G.DB.put('saves', id, cache[id]);
        if (Date.now() - (lastBackup[id] || 0) > BACKUP_EVERY_MS) {
          lastBackup[id] = Date.now();
          await G.DB.put('backups', id + '|' + Date.now(), cache[id]);
          const keys = (await G.DB.keys('backups')).filter((k) => String(k).startsWith(id + '|')).sort();
          for (const k of keys.slice(0, Math.max(0, keys.length - BACKUPS_KEPT))) await G.DB.del('backups', k);
        }
      }
      await G.DB.put('meta', 'index', index);
      Store.flushes++;
      Store.lastError = null;
      Store._fails = 0;
      ids.forEach((id) => { try { localStorage.removeItem(EMERG_PREFIX + id); } catch (e) {} });
    } catch (e) {
      ids.forEach((id) => dirty.add(id)); // try again next time
      Store.lastError = e;
      // keep the newest copy where a reload will find it, and keep trying (the connection may only have been dropped by the phone)
      ids.forEach((id) => { try { if (cache[id] && cache[id].length < 4.5e6) localStorage.setItem(EMERG_PREFIX + id, cache[id]); } catch (er) {} });
      Store._fails = (Store._fails || 0) + 1;
      if (Store._fails === 3) G.UI && G.UI.toast('Could not write to the local database — export your world from Settings.', 'bad');
      if (Store._fails <= 8) {
        clearTimeout(Store._retry);
        Store._retry = setTimeout(() => G.DB.reopen().then(() => Store.flush()), Math.min(30000, 1500 * Store._fails));
      }
    }
  };
  // write everything that is pending (also called when the tab is hidden / closed)
  Store.flush = () => {
    if (timer) clearTimeout(timer);
    return flushNow();
  };
  const queue = (id) => {
    dirty.add(id);
    if (!timer) timer = setTimeout(flushNow, 500);
  };

  Store.save = () => {
    const S = G.S;
    if (!S) return;
    S.savedAt = Date.now();
    pending = false;
    pendingSince = 0;
    lastSaveAt = S.savedAt;
    if (useDb()) {
      try {
        cache[S.id] = JSON.stringify(S);
        if (cache[S.id].length > 6e6) { Store.slim(S); cache[S.id] = JSON.stringify(S); }
      } catch (e) {
        Store.lastError = e;
        G.UI && G.UI.toast('Could not save: ' + e.message, 'bad');
        return;
      }
      index = index.filter((x) => x.id !== S.id);
      index.unshift(metaOf(S));
      queue(S.id);
      return;
    }
    let raw = JSON.stringify(S);
    if (raw.length > 3.5e6) { Store.slim(S); raw = JSON.stringify(S); } // the backup store is only about 5 MB
    if (write(SAVE_PREFIX + S.id, raw)) {
      const idx = read(INDEX_KEY, []).filter((x) => x.id !== S.id);
      idx.unshift(metaOf(S));
      write(INDEX_KEY, idx);
    }
  };
  // keeps the best of everything and drops the long tail: old, unimportant memories, long histories, old chat
  Store.slim = (S) => {
    const keep = (n, k) => {
      if (!n.mem || n.mem.length <= k) return;
      const ranked = n.mem.map((m) => [m.imp * 1.5 + 8 * Math.pow(0.99, (S.clock - m.t) / 60) + (m.pin || m.imp >= 8 || m.kind === 'reflection' ? 100 : 0), m]).sort((a, b) => b[0] - a[0]);
      ranked.slice(k).forEach((x) => { try { if (G.Vault) G.Vault.archive(n, x[1]); } catch (e) {} }); // trimmed, not forgotten: filed in the vault
      n.mem = ranked.slice(0, k).map((x) => x[1]).sort((a, b) => a.t - b.t);
    };
    Object.values(S.npcs || {}).forEach((n) => {
      keep(n, (n.touched || 0) >= S.clock - 4320 ? 120 : 40);
      if (n.hist && n.hist.length > 20) n.hist = n.hist.slice(-20);
    });
    if (S.hist && S.hist.length > 60) S.hist = S.hist.slice(-60);
    if (S.dirChat) Object.keys(S.dirChat).forEach((k) => { S.dirChat[k] = S.dirChat[k].slice(-30); });
    (S.channels || []).forEach((c) => { if (c.msgs.length > 60) c.msgs = c.msgs.slice(-60); });
    if (S.apptSeen) S.apptSeen = {};
    Store.slimmed = (Store.slimmed || 0) + 1;
    if (Store.slimmed === 1 && G.UI && G.UI.toast) G.UI.toast('Your world got big, so old details were trimmed to keep it fast on your phone.', 'info');
  };

  /* ---------- routine saves: rare, quiet, never in the middle of a scroll or a sentence ----------
     Store.save() stringifies the whole world on the main thread, so the many saveSoon() calls (every heartbeat, every small change) only
     mark "something changed". The real save runs in an idle moment, at most once per SAVE_GAP_MS, and not while the person is scrolling or typing
     (unless it has been waiting a whole minute). Leaving the page always saves at once (main.js: pagehide / hidden / beforeunload);
     Store.save() is still immediate; Store.saveAfter() is the "right after an action" save (idle, no gap). */
  const SAVE_GAP_MS = 15000;
  const ACTIVE_MS = 1200; // scrolled / typed / dragged this recently = busy
  const MAX_WAIT_MS = 60000;
  let pending = false;
  let pendingSince = 0;
  let lastSaveAt = 0;
  let lastActive = 0;
  let soonTimer = null;
  const idle = (fn, timeout) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout });
    else setTimeout(fn, 0);
  };
  const busyNow = () => {
    if (Date.now() - lastActive < ACTIVE_MS) return true;
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value);
  };
  const runSoon = (urgent) => {
    soonTimer = null;
    if (!pending) return;
    if (!urgent && busyNow() && Date.now() - pendingSince < MAX_WAIT_MS) return arm(1500, false); // still busy: look again in a moment
    idle(() => {
      if (!pending) return; // (a direct Store.save() got there first)
      if (!urgent && busyNow() && Date.now() - pendingSince < MAX_WAIT_MS) return arm(1500, false);
      Store.save(); // (looked up here so a test can swap Store.save out)
    }, 4000);
  };
  const arm = (ms, urgent) => {
    if (soonTimer) {
      if (!urgent) return;
      clearTimeout(soonTimer); // an action wants it sooner than the routine schedule
    }
    soonTimer = setTimeout(() => runSoon(urgent), ms);
  };
  Store.saveSoon = () => {
    if (!G.S) return;
    if (!pending) { pending = true; pendingSince = Date.now(); }
    arm(Math.max(500, SAVE_GAP_MS - (Date.now() - lastSaveAt)), false);
  };
  // right after something the person did (a turn): the screen is drawn first, the save follows in an idle moment
  Store.saveAfter = () => {
    if (!G.S) return;
    if (!pending) { pending = true; pendingSince = Date.now(); }
    arm(250, true);
  };
  Store.pending = () => pending;
  if (typeof window !== 'undefined') {
    const mark = () => { lastActive = Date.now(); };
    ['scroll', 'touchmove', 'wheel', 'keydown', 'input'].forEach((ev) => window.addEventListener(ev, mark, { passive: true, capture: true }));
  }

  Store.load = (id) => {
    let S = null;
    try {
      S = useDb() ? (cache[id] ? JSON.parse(cache[id]) : null) : read(SAVE_PREFIX + id, null);
    } catch (e) {
      S = null;
    }
    if (!S || !S.world || !S.player || !S.npcs) return false;
    const predatesSim = !S.sim; // only saves from before the living-world engine need a first batch of stories; a normal reload changes nothing
    G.S = G.Engine.migrate(S);
    if (predatesSim && G.World) G.World.seedStories(G.S);
    return true;
  };

  Store.remove = (id) => {
    delete cache[id];
    dirty.delete(id);
    if (useDb()) {
      index = index.filter((x) => x.id !== id);
      G.DB.del('saves', id)
        .then(() => G.DB.put('meta', 'index', index))
        .then(() => G.DB.keys('backups'))
        .then((keys) => Promise.all(keys.filter((k) => String(k).startsWith(id + '|')).map((k) => G.DB.del('backups', k))))
        .catch((e) => (Store.lastError = e));
      return;
    }
    try {
      localStorage.removeItem(SAVE_PREFIX + id);
    } catch (e) {}
    write(INDEX_KEY, read(INDEX_KEY, []).filter((x) => x.id !== id));
  };

  /* ---------- backups / info ---------- */

  Store.backups = async (id) => (useDb() ? (await G.DB.keys('backups')).filter((k) => String(k).startsWith(id + '|')).map((k) => Number(String(k).split('|')[1])).sort((a, b) => b - a) : []);
  Store.restoreBackup = async (id, ts) => {
    if (!useDb()) throw new Error('Backups need the local database.');
    const raw = await G.DB.get('backups', id + '|' + ts);
    if (!raw) throw new Error('That backup no longer exists.');
    JSON.parse(raw); // refuse corrupt backups
    cache[id] = raw;
    queue(id);
    await Store.flush();
    return Store.load(id);
  };
  Store.storageInfo = async () => {
    const out = { mode: Store.mode, worlds: index.length, bytes: Object.values(cache).reduce((a, s) => a + s.length, 0), quota: null, used: null, persisted: null };
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        out.quota = e.quota;
        out.used = e.usage;
      }
      if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    } catch (e) {}
    return out;
  };

  Store.exportJSON = () => JSON.stringify(G.S);
  Store.importJSON = (txt) => {
    const S = JSON.parse(txt);
    if (!S || !S.world || !S.player || !S.npcs) throw new Error('Not a Clout save file');
    S.id = G.U.uid('w');
    G.S = G.Engine.migrate(S);
    Store.save();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !useDb()) return;
      G.DB.get('meta', 'index').then(() => dirty.size && Store.flush()).catch(() => {});
    });
  }

  // test helper: forget the in-memory copy (as if the page had just been reloaded)
  Store._reset = () => {
    cache = {};
    index = [];
    dirty.clear();
    pending = false;
    clearTimeout(soonTimer);
    soonTimer = null;
    Store._initP = null;
    Store.ready = false;
    Store.mode = 'localStorage';
  };
})(window.G);
