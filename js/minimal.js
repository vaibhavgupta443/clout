/* Clout — MINIMAL INTERFACE: no emoji in the buttons, headings, labels, menus and messages of the app itself.
   Emoji stay where they are CONTENT: what people write (posts, comments, DMs, channel chat, stories), avatars, and the reactions you choose.
   It is done when the screen is drawn (not by editing every string), so the in-place updates stay smooth and the setting can be switched off (Settings > Minimal interface).
   A control that was only an emoji gets a short word instead. */
(function (G) {
  'use strict';
  const UI = G.UI;
  const Min = (G.Minimal = {});
  // colourful emoji only (not the plain symbols the interface uses: arrows, check and cross marks, dots, play triangles)
  const EMO = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️?))*|[\u{1F1E6}-\u{1F1FF}]{2}|️|⃣/gu;
  const HAS = new RegExp(EMO.source, 'u'); // (a plain test copy: a /g regex remembers its position)
  const WORD = { '🔄': 'Refresh', '💚': 'Close friends', '✨': 'Ideas', '🎭': 'Burner', '📣': 'Promote', '🎬': 'Director', '🧠': 'Memory', '🔥': 'Hot', '⏳': 'Skip time', '📌': 'Pin', '🗑': 'Delete', '✏': 'Edit', '➕': 'Add', '❓': 'Ask', '💬': 'Comment', '🎯': 'Pick', '📖': 'Story', '🔒': 'Private', '🌍': 'Everyone', '👥': 'People', '💼': 'Offers', '🗣': 'Rumour', '👋': 'New', '⚙': 'Settings', '🔔': 'Alerts', '❤': 'Like', '🔖': 'Save', '🐢': 'Slow', '⚡': 'Fast', '⏸': 'Pause', '▶': 'Normal' };
  // where emoji are content and stay: what people write, avatars, stories. (A card or a time inside a message is still interface.)
  const KEEP = '.ptext,.cap,.bubble,.cmt,.cmtext,.chmsg .chbody>div,.story-text,.quote,.avatar,.avwrap,.sprite,.react,.emojis,[data-keep-emoji],textarea,.d2-b.you,.d2-b.ai.chat .t';
  const CHROME_INSIDE = '.refcard,.cfbadge,.chip,.badge,button,.btn,.pill';
  Min.on = () => !G.settings || G.settings.minimalUI !== false;
  Min.strip = (s) => String(s || '').replace(EMO, '').replace(/ {2,}/g, ' ').replace(/^\s+(?=\S)/, (m) => (m.length > 1 ? ' ' : m));
  const keep = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return false;
    const k = el.closest(KEEP);
    if (!k) return false;
    const c = el.closest(CHROME_INSIDE);
    return !(c && k.contains(c) && c !== k && !c.matches('.avatar,.avwrap,.sprite,.react,.emojis'));
  };
  Min.apply = function (root) {
    if (!root || !Min.on()) return root;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue && HAS.test(n.nodeValue)) nodes.push(n);
    
    const lost = new Map();
    nodes.forEach((n) => {
      
      if (keep(n)) return;
      const found = n.nodeValue.match(EMO) || [];
      
      const owner = n.parentElement && n.parentElement.closest('button,a,[data-act],[data-d],[data-f]');
      if (owner && found.length && !lost.has(owner)) lost.set(owner, found[0].replace(/️/g, ''));
      n.nodeValue = Min.strip(n.nodeValue);
    });
    // a control that was only an emoji gets a word (its own title, or a short name)
    lost.forEach((emo, el) => {
      if (el.textContent.trim() || el.querySelector('svg,img') || el.closest(KEEP)) return;
      const speed = el.getAttribute('data-act') === 'speed' ? ['Pause', 'Slow', 'Normal', 'Fast'][Number(el.getAttribute('data-v'))] : '';
      const word = (speed || el.getAttribute('title') || el.getAttribute('aria-label') || WORD[emo] || '').split(/[.(]/)[0].trim();
      if (word) el.textContent = word;
    });
    root.querySelectorAll && root.querySelectorAll('[title],[placeholder],[aria-label]').forEach((el) => {
      ['title', 'placeholder', 'aria-label'].forEach((a) => { const v = el.getAttribute(a); if (v && HAS.test(v)) el.setAttribute(a, Min.strip(v));  });
    });
    return root;
  };

  // 1) the main screen: ui.js passes the new page through Min.html before it is compared with what is on screen (so nothing flickers and unchanged cards are skipped)
  Min.html = (h) => { if (!Min.on()) return h; const t = document.createElement('template'); t.innerHTML = h; Min.apply(t.content); return t.innerHTML; };
  // 2) toasts and windows
  { const t = UI.toast; UI.toast = function (msg, kind) { return t.call(this, Min.on() ? Min.strip(msg) : msg, kind); }; }
  { const m = UI.modal; UI.modal = function () { const r = m.apply(this, arguments); try { Min.apply(document.getElementById('modal-root')); } catch (e) {} return r; }; }
  // 3) the Director sheet, the floating menu and anything else drawn straight into the page
  const watch = (id) => {
    if (!document || !document.getElementById) return; // (the page is gone, e.g. a test tearing down)
    const el = document.getElementById(id);
    if (!el || el.__min) return;
    el.__min = true;
    let busy = false;
    new MutationObserver(() => {
      if (busy || !Min.on()) return;
      busy = true;
      (window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (f) => setTimeout(f, 16))(() => { try { Min.apply(el); } catch (e) {} busy = false; });
    }).observe(el, { childList: true, subtree: true });
    try { Min.apply(el); } catch (e) {} // (whatever was drawn into it before it was watched)
  };
  const arm = () => ['stdock', 'fab', 'toasts', 'story-root'].forEach(watch);
  if (document.readyState !== 'loading') arm(); else document.addEventListener('DOMContentLoaded', arm);
  // (stdock and fab are created when a world opens: an observer on <body>'s direct children arms them the moment they appear. No polling timer.)
  { const obs = new MutationObserver(arm); const start = () => { if (document.body) obs.observe(document.body, { childList: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }
  { const r0 = UI.render; UI.render = function () { const r = r0.apply(this, arguments); try { arm(); ['stdock', 'fab'].forEach((id) => Min.apply(document.getElementById(id))); } catch (e) {} return r; }; }

  // one calm colour family: avatars and tiles are drawn in blues (same person, same colour, every time)
  { const g0 = G.U.gradient; G.U.gradient = function (seed) { if (!Min.on()) return g0.call(this, seed); const h = 205 + (G.U.hash ? Math.abs(G.U.hash(String(seed))) % 30 : 15); return 'linear-gradient(135deg,hsl(' + h + ' 70% 56%),hsl(' + (h + 8) + ' 75% 42%))'; }; }
  { const o0 = UI.gradientOf; if (o0) UI.gradientOf = function (sc) { if (!Min.on() || !sc) return o0.call(this, sc); const h = 205 + (Math.abs(Number(sc.hue) || 0) % 30); return 'linear-gradient(135deg,hsl(' + h + ' 72% 55%),hsl(' + (h + 10) + ' 78% 40%))'; }; }
  // the main page is only posts and stories: writing is a sheet, and everything that is waiting for you is on Alerts (with one badge)
  const legacy = () => !!(G.settings && G.settings.legacyHome);
  { const bc = UI.badgeCounts; UI.badgeCounts = function () { const b = bc.apply(this, arguments); if (legacy() || !G.S) return b; const S = G.S; const waiting = S.events.filter((e) => !e.resolved).length + (G.Leads ? G.Leads.list('new').length : 0) + (G.Fame ? G.Fame.open().filter((o) => o.status === 'open').length : 0) + (G.Pitches ? G.Pitches.queue().length : 0); b.notifs = (b.notifs || 0) + waiting; b.home = 0; return b; }; }
  { const c0 = UI.acts.create; UI.acts.create = function () { if (legacy() || !G.S) return c0.apply(this, arguments); UI.modal('<button class="close" data-act="closeModal">✕</button><h3>New post</h3>' + G.Pages.composer()); setTimeout(() => { const c = document.getElementById('composer'); if (c) c.focus(); }, 60); }; }
  { const p0 = UI.acts.post; UI.acts.post = function () { const r = p0.apply(this, arguments); Promise.resolve(r).then(() => { if (!legacy() && G.S && !String(UI.draft || '').trim()) UI.closeModal(); }); return r; }; }
  // Story, Map and Codex are first-class phone destinations; less-used pages stay under Profile.
  const P = G.Pages;
  const me0 = P.me;
  P.me = function () {
    const prim = ['home', 'explore', 'messages', 'notifs', 'me'];
    const rows = (UI.NAV || []).filter((n) => !prim.includes(n[0])).map(([k, ic, lb]) => '<button class="morerow" data-act="nav" data-page="' + k + '"><span>' + UI.icon(ic, 22) + '</span><b>' + lb + '</b><i>›</i></button>').join('');
    const story = '';
    return me0.apply(this, arguments) + '<div class="card morecard"><h4 class="sect" style="margin-top:0">More</h4>' + story + rows + '</div>';
  };

  // the browser / status bar colour follows the theme (the installed app has a translucent status bar over our own top bar)
  { const th = UI.applyTheme; UI.applyTheme = function () { const r = th.apply(this, arguments); try { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); const m = document.querySelector('meta[name=theme-color]'); if (m && bg) m.setAttribute('content', bg); } catch (e) {} return r; }; }
})(window.G);
