/* Clout — REFERENCES: when somebody talks about a specific post or story, you can open it.
   A message (DM, channel chat) that is about a post carries a reference; it is shown under the message as a small card ("📌 about this post"): who wrote it, what it says,
   and a tap opens it, even if the feed would not show it (muted or set-aside author, older post). If the post is gone, the card says so instead of leaving you guessing.
   Where references come from: DMs written from a real reason (they reacted to your post, a rival provoked you over it), channel chat about one of your posts,
   and the AI (it is told to name the exact post id whenever it talks about one, and never to talk about a post that is not in the feed). */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const esc = U.esc;
  const Refs = (G.Refs = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

  Refs.post = (id) => (G.S && id && G.S.posts[id] && !G.S.posts[id].deleted ? { type: 'post', id } : null);
  Refs.story = (id) => (G.S && id && (G.S.stories || []).some((s) => s.id === id) ? { type: 'story', id } : null);
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tops = (S) => S.postOrder.map((id) => S.posts[id]).filter((p) => p && !p.replyTo && !p.deleted && !p.pending);
  // which post is this message about? null when the words do not say (never a guess)
  Refs.infer = function (m) {
    const S = G.S;
    if (!S || !m || !m.text || m.from === 'me') return null;
    const text = String(m.text);
    const posts = tops(S);
    // 1) a quoted piece of a real post
    const quotes = (text.match(/["“”']([^"“”']{8,140})["“”']/g) || []).map((q) => norm(q.slice(1, -1)));
    for (const q of quotes) {
      const key = q.slice(0, 24);
      if (key.length < 8) continue;
      const hit = posts.slice().reverse().find((p) => norm(p.text).includes(key));
      if (hit) return { type: 'post', id: hit.id };
    }
    const low = text.toLowerCase();
    // 2) "your story"
    if (/\b(your|ur) (new |latest |last )?(story|stories)\b/.test(low)) {
      const st = (S.stories || []).filter((x) => x.author === 'me' || x.kind === 'player').slice(-1)[0];
      if (st) return { type: 'story', id: st.id };
    }
    // 3) "your last post / photo / video / tweet / caption" = your latest post
    if (/\b(your|ur) (last |latest |new |recent |latest )?(post|posts|tweet|photo|pic|picture|video|caption|thread|reel)\b/.test(low) || /\b(that|this|the) (post|tweet|photo|video)\b.{0,40}\b(you|your)\b/.test(low) || /\bsaw (what )?you (posted|wrote|shared)\b/.test(low)) {
      const mine = posts.filter((p) => p.author === 'me' || (S.npcs[p.author] && S.npcs[p.author].userAlt)).slice(-1)[0];
      if (mine) return { type: 'post', id: mine.id };
    }
    // 4) "Kai's post" / "what Kai posted" = that person's latest
    const rxq = (x) => String(x).replace(/[.*+?^$|()[\]{}\\]/g, '\\$&');
    const named = Object.values(S.npcs).find((n) => {
      if (n.userAlt || !n.name) return false;
      const f1 = rxq(String(n.name).split(' ')[0]);
      return new RegExp('\\b' + f1 + "(?:'s|’s)\\s+(?:last |latest |new )?(?:post|tweet|photo|video|story)", 'i').test(text) || new RegExp('what\\s+' + f1 + '\\s+(?:posted|wrote|shared|said)', 'i').test(text);
    });
    if (named) {
      const p = posts.filter((x) => x.author === named.id).slice(-1)[0];
      if (p) return { type: 'post', id: p.id };
    }
    return null;
  };
  // the reference of a message: the one it was given, else the one its words point to (worked out once, then kept)
  Refs.forMsg = function (m) {
    if (!m) return null;
    if (m.ref) return m.ref;
    if (m.refi) return null;
    m.refi = 1;
    const r = Refs.infer(m);
    if (r) m.ref = r;
    return r;
  };
  Refs.card = function (ref) {
    const S = G.S;
    if (!ref || !S) return '';
    if (ref.type === 'post') {
      const p = S.posts[ref.id];
      if (!p || p.deleted) return '<div class="refcard gone">📌 the post they mean is no longer available</div>';
      const a = UI.nameOf ? UI.nameOf(p) : { name: p.author };
      return `<div class="refcard" data-act="thread" data-id="${p.id}"><div class="muted small">📌 about this post · tap to open</div><b>${esc(a.name)}</b> ${esc(clip(p.text, 110))}${p.img ? ' 🖼' : ''}</div>`;
    }
    if (ref.type === 'story') {
      const st = (S.stories || []).find((s) => s.id === ref.id);
      if (!st || S.clock >= st.exp) return '<div class="refcard gone">📌 the story they mean has expired</div>';
      return `<div class="refcard" data-act="story" data-id="${st.id}"><div class="muted small">📌 about this story · tap to open</div>${esc(clip(st.text || 'a story', 90))}</div>`;
    }
    return '';
  };
})(window.G);
