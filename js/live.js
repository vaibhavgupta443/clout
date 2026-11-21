/* Clout — the heartbeat: the world keeps moving in real time while you look at it.
   Every few seconds a slice of game time passes (NPCs post, comment, like, post stories, text you…),
   and the screen softly updates without stealing focus or scroll position. */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const A = UI.acts;
  const $ = (s, r = document) => r.querySelector(s);

  const Live = (G.Live = { BEAT_MS: 5000, timer: null, id: null, newPosts: 0, newComments: 0, beats: 0, lastResult: null });

  const typing = () => {
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  };
  const calm = () => !typing() && !document.body.classList.contains('modal-open') && !document.body.classList.contains('story-open');

  /* ---------- little pill: "↑ 3 new posts" ---------- */

  const pill = (n, comments = 0) => {
    let el = $('#newpill');
    if (!n) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('button');
      el.id = 'newpill';
      el.dataset.act = 'showNew';
      document.body.appendChild(el);
    }
    const parts = [];
    if (n) parts.push(`${n} new ${n === 1 ? 'post' : 'posts'}`);
    if (comments) parts.push(`${comments} new ${comments === 1 ? 'comment' : 'comments'}`);
    el.textContent = `↑ ${parts.join(' · ')}`;
  };
  A.showNew = () => {
    Live.newPosts = 0;
    Live.newComments = 0;
    if (Live.markSeen) Live.markSeen();
    pill(0);
    UI.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------- nav badges without redrawing the page ---------- */

  UI.refreshBadges = function () {
    if (!G.S) return;
    const c = UI.badgeCounts();
    document.querySelectorAll('.navb[data-page], .mi[data-page]').forEach((b) => {
      const n = c[b.dataset.page] || 0;
      let i = b.querySelector('.badge');
      if (!n) {
        if (i) i.remove();
        return;
      }
      if (!i) {
        i = document.createElement('i');
        i.className = 'badge';
        b.appendChild(i);
      }
      i.textContent = n > 99 ? '99+' : String(n);
    });
  };

  /* ---------- catching up after being away ---------- */

  Live.catchUp = function () {
    const S = G.S;
    if (!S || G.busy) return null;
    const r = G.World.catchUp();
    if (r) {
      UI.toast(`Welcome back — ${r.posts} new posts, ${r.dms} new messages while you were away.`, 'info');
      G.Store.saveSoon();
      UI.render();
    }
    return r;
  };

  // the pill only makes sense on the feed, scrolled down
  Live.sync = function () {
    if (UI.page !== 'home' || UI.thread || window.scrollY < 140) {
      Live.newPosts = 0;
      Live.newComments = 0;
      pill(0);
    }
  };

  /* ---------- first sight of a world: catch up on time away + make sure it is not empty ---------- */

  Live.adopt = function () {
    const S = G.S;
    if (!S || S.id === Live.id) return;
    Live.id = S.id;
    Live.newPosts = 0;
    Live.newComments = 0;
    pill(0);
    try {
      const r = G.World.catchUp();
      if (r) UI.toast(`Welcome back — ${r.posts} new posts, ${r.dms} new messages while you were away.`, 'info');
    } catch (e) {
      console.error(e);
    }
  };

  /* ---------- one beat ---------- */

  Live.beat = function () {
    const S = G.S;
    if (!S) return null;
    if (S.id !== Live.id) {
      Live.adopt();
      UI.render();
    }
    if (G.busy || document.hidden) return null;
    let r = null;
    try {
      r = G.World.live();
    } catch (e) {
      console.error(e);
      return null;
    }
    Live.beats++;
    if (!r) return null;
    Live.lastResult = r;
    const fresh = Math.max(0, r.posts);
    const comments = Math.max(0, r.comments || 0);
    const changed = fresh || comments > 0 || r.stories > 0 || r.dms > 0;
    G.Store.saveSoon();
    if (G.Bank) G.Bank.tick(); // background: the model pre-writes more lines for the cast (no-op without a model/key)
    if (!changed) return r;
    if (!calm()) {
      Live.newPosts += fresh;
      Live.newComments += comments;
      if (UI.page === 'home' && !UI.thread && (Live.newPosts || Live.newComments)) pill(Live.newPosts, Live.newComments);
      UI.refreshBadges();
      return r;
    }
    if (UI.page === 'home' && !UI.thread) {
      if (window.scrollY < 140) {
        Live.newPosts = 0;
        Live.newComments = 0;
        pill(0);
        UI.render();
      } else {
        Live.newPosts += fresh;
        Live.newComments += comments;
        if (Live.newPosts || Live.newComments) pill(Live.newPosts, Live.newComments);
        UI.refreshBadges();
      }
    } else if ((UI.page === 'messages' && (r.dms > 0 || UI.dmWith)) || (UI.page === 'notifs' && r.comments + r.dms > 0)) {
      UI.render();
    } else UI.refreshBadges();
    return r;
  };

  Live.start = function () {
    if (Live.timer) return;
    Live.timer = setInterval(Live.beat, Live.BEAT_MS);
  };
  Live.stop = function () {
    clearInterval(Live.timer);
    Live.timer = null;
  };

  // world speed in the top bar: paused / slow / normal / fast
  A.speed = (d) => {
    G.settings.worldSpeed = +d.v;
    G.Store.saveSettings();
    UI.toast(['World paused ⏸', 'Slow ▶', 'Normal ▶▶', 'Fast ⏩'][+d.v] || 'ok', 'info');
    UI.render();
  };

  A.dismissRecap = () => {
    if (G.S) delete G.S.recap;
    G.Store.saveSoon();
    UI.render();
  };

  /* ---------- double-tap a picture to like it ---------- */

  document.addEventListener('dblclick', (e) => {
    const m = e.target.closest && e.target.closest('.media.pic, .reel');
    if (!m || !G.S) return;
    const id = m.dataset.id;
    const p = G.S.posts[id];
    if (!p) return;
    if (!UI.liked(p)) G.Engine.toggleLike(id, G.S.activeAlt);
    UI.render();
    const again = document.querySelector(`.media.pic[data-id="${id}"], .reel[data-id="${id}"]`);
    if (again) {
      const h = document.createElement('div');
      h.className = 'heartpop';
      h.textContent = '❤️';
      again.appendChild(h);
      setTimeout(() => h.remove(), 900);
    }
  });

  // a library photo that fails to load (file moved/deleted): fall back to the generated tile instead of a broken icon
  document.addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.classList.contains('lib')) {
        const m = t.closest('.media');
        if (m) m.classList.add('broken');
        t.remove();
      }
    },
    true
  );

  // coming back to the tab: the world carried on without you
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Live.catchUp();
  });

  /* ---------- the phone's / browser's Back button ---------- */
  // Everything opened on top of the feed (another tab, a thread, a profile or other modal, the story viewer) is a "layer" with its
  // own history entry, so Back (swipe or hardware button) closes the top layer instead of leaving the app.
  // Each entry we push remembers its own depth ({ clout: n }), so a popstate says exactly where the user landed.
  // Syncing is deferred to the end of the current tick (a layer often closes and another opens in the same click, e.g. replying from
  // a story), and it never pushes while one of our own history.go() jumps is still on its way (browsers process that jump late).
  const Nav = (Live.nav = { depth: 0, timer: 0, pending: 0 });
  const body = () => document.body.classList;
  Nav.layers = () => (!G.S ? 0 : (UI.page && UI.page !== 'home' ? 1 : 0) + (UI.thread ? 1 : 0) + (body().contains('modal-open') ? 1 : 0) + (body().contains('story-open') ? 1 : 0));
  Nav.apply = function () {
    Nav.timer = 0;
    if (Nav.pending) {
      Nav.timer = setTimeout(Nav.apply, 25); // wait for our own jump to land first
      return;
    }
    try {
      const want = Nav.layers();
      if (want > Nav.depth) {
        for (; Nav.depth < want; Nav.depth++) history.pushState({ clout: Nav.depth + 1 }, '');
      } else if (want < Nav.depth) {
        const n = Nav.depth - want;
        Nav.depth = want;
        const mark = (Nav.pending = Date.now());
        history.go(-n); // give the unused entries back
        setTimeout(() => { if (Nav.pending === mark) Nav.pending = 0; }, 600); // safety: a jump that never reports back must not block us forever
      }
    } catch (e) {
      Nav.pending = 0; // history unavailable (sandboxed frame): Back just behaves like the browser default
    }
  };
  Nav.sync = function () {
    if (!Nav.timer) Nav.timer = setTimeout(Nav.apply, 0);
  };
  ['render', 'modal', 'closeModal', 'renderStory', 'closeStory'].forEach((k) => {
    const orig = UI[k];
    if (typeof orig !== 'function') return;
    UI[k] = function () {
      const r = orig.apply(this, arguments);
      Nav.sync();
      return r;
    };
  });
  const closeTop = () => {
    if (body().contains('story-open') && UI.closeStory) UI.closeStory();
    else if (body().contains('modal-open')) UI.closeModal();
    else if (UI.thread) A.back();
    else if (UI.page && UI.page !== 'home') UI.go('home');
    else return false;
    return true;
  };
  window.addEventListener('popstate', () => {
    if (!G.S) return;
    if (Nav.pending) {
      Nav.pending = 0; // that was our own history.go() landing: nothing to close
      Nav.sync();
      return;
    }
    const at = (history.state && history.state.clout) || 0; // the depth of the entry we landed on
    if (at < Nav.depth) {
      // the user pressed Back: close layers until we match where they landed
      Nav.depth = at;
      for (let guard = 8; Nav.layers() > at && guard > 0 && closeTop(); guard--);
    }
    Nav.sync(); // layers and history entries agree again
  });


  Live.start();

  /* "↑ N new posts" for posts that arrive ANY way (the Director, a roleplay fallout, your burner, a time-skip), not only the world's own heartbeat */
  const tops = () => {
    const S = G.S;
    let n = 0;
    for (const id of S.postOrder) { const p = S.posts[id]; if (p && !p.replyTo) n++; }
    return n;
  };
  Live.markSeen = () => { if (G.S) { Live.topSeen = tops(); Live.topId = G.S.id; } };
  {
    const render0 = UI.render;
    UI.render = function () {
      const r = render0.apply(this, arguments);
      try {
        if (G.S && UI.page === 'home' && !UI.thread) {
          if (window.scrollY < 140 || Live.topSeen == null || Live.topId !== G.S.id) { Live.markSeen(); if (!Live.newPosts && !Live.newComments) pill(0); }
          else { const n = tops() - Live.topSeen; if (n > 0) { Live.newPosts = Math.max(Live.newPosts, n); pill(Live.newPosts, Live.newComments); } }
        }
      } catch (e) {}
      return r;
    };
  }
})(window.G);
