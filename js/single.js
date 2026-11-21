/* Clout — one copy at a time (G.Single).
   Opening Clout in a second tab, window or installed app of the same browser used to start a second copy of the whole world:
   two copies writing the same save corrupt it and waste memory. Now a newcomer asks "is Clout already open?" over a
   BroadcastChannel; the copy that is already open answers, and the newcomer shows one calm screen with a single button:
   "Use this tab" (the other copy goes to sleep and stops saving) . Nothing is lost either way.
   Works across tabs, windows and the installed app of the SAME browser profile; other devices have their own save anyway. */
(function (G) {
  const S1 = (G.Single = { sleeping: false, id: Math.random().toString(36).slice(2) });
  if (typeof BroadcastChannel === 'undefined') return;
  let bc;
  try { bc = new BroadcastChannel('clout-one-copy'); } catch (e) { return; }

  const COVER = 'one-copy-cover';
  const say = (m) => { try { bc.postMessage(Object.assign({ id: S1.id }, m)); } catch (e) {} };

  // a sleeping copy must never write the save
  const guard = () => {
    const St = G.Store;
    if (!St || St.__oneCopy) return;
    St.__oneCopy = true;
    ['save', 'saveSoon', 'saveAfter'].forEach((k) => {
      const f = St[k];
      if (typeof f !== 'function') return;
      St[k] = function () { return S1.sleeping ? undefined : f.apply(this, arguments); };
    });
  };

  const show = (why) => {
    S1.sleeping = true;
    guard();
    if (document.getElementById(COVER)) return;
    const d = document.createElement('div');
    d.id = COVER;
    d.setAttribute('role', 'dialog');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--c-bg,#f8fafc);color:var(--c-text,#0f172a);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif';
    d.innerHTML = '<div style="max-width:380px;text-align:center"><h2 style="margin:0 0 8px;font-size:22px">Clout is open somewhere else</h2>'
      + '<p style="margin:0 0 20px;color:var(--c-text-2,#475569)">' + (why === 'moved' ? 'You opened Clout in another tab, so this one is resting. Nothing was lost.' : 'Clout is already open in another tab or window. Two copies at once could damage your save, so this one is waiting.') + '</p>'
      + '<button id="one-copy-use" style="appearance:none;border:0;border-radius:999px;padding:14px 28px;font:inherit;font-weight:600;background:var(--c-accent,#2f6fe4);color:var(--c-on-accent,#fff);min-height:44px;cursor:pointer">Use this tab</button></div>';
    document.body.appendChild(d);
    d.querySelector('#one-copy-use').addEventListener('click', () => {
      say({ t: 'takeover' }); // the other copy goes to sleep
      S1.sleeping = false;
      d.remove();
      try { if (G.Store && G.Store.init && !G.S) location.reload(); else if (G.UI && G.UI.render) G.UI.render(); } catch (e) {}
    });
  };

  bc.onmessage = (e) => {
    const m = e.data || {};
    if (!m.id || m.id === S1.id) return;
    if (m.t === 'hello' && !S1.sleeping) say({ t: 'here', to: m.id }); // I am the copy that is open
    else if (m.t === 'here' && m.to === S1.id) show('already');
    else if (m.t === 'takeover') show('moved');
  };

  // ask once the page exists (no answer within a moment = we are the only copy)
  const ask = () => say({ t: 'hello' });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ask); else ask();
})(window.G || (window.G = {}));
