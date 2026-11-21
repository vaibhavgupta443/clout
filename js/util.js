/* Clout — utilities */
window.G = window.G || {};
(function (G) {
  const U = (G.U = {});

  U.uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // the given name: skips articles/titles ("The Lobby Lurker" -> Lobby) and quoted nicknames ("Beatrice 'Bea' Okonkwo" -> Beatrice)
  U.first = (name) => {
    const parts = String(name || '').replace(/["'“”‘’][^"'“”‘’]+["'“”‘’]/g, ' ').split(/\s+/).filter(Boolean);
    return /^(the|a|an|la|le|el|los|las|dj|mc|dr|mr|mrs|ms|miss|lady|lord|sir)$/i.test(parts[0] || '') && parts[1] ? parts[1] : parts[0] || '';
  };
  U.int = (v, d = 0) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : d;
  };
  U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.hash = (str) => {
    let h = 2166136261;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  // 12.3K / 4.5M style numbers
  U.fmt = (n) => {
    n = Math.round(Number(n) || 0);
    if (!Number.isFinite(n)) n = 0;
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    const f = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
    if (a < 1000) return String(n);
    let k = f(a / 1e3);
    if (k < 1000) return sign + k + 'K';
    let m = f(a / 1e6);
    if (m < 1000) return sign + m + 'M';
    return sign + f(a / 1e9) + 'B';
  };

  U.money = (n) => '$' + (n < 0.01 ? n.toFixed(4) : n.toFixed(2));

  // game clock is minutes since day 1, 00:00
  U.dayOf = (clock) => Math.floor(clock / 1440) + 1;
  U.clockStr = (clock) => {
    const m = ((clock % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `Day ${U.dayOf(clock)} · ${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  };
  U.ago = (now, t) => {
    const d = Math.max(0, now - t);
    if (d < 2) return 'now';
    if (d < 60) return d + 'm';
    if (d < 1440) return Math.floor(d / 60) + 'h';
    return Math.floor(d / 1440) + 'd';
  };

  // deterministic avatar colours from a seed string
  U.gradient = (seed) => {
    const h = U.hash(seed);
    const a = h % 360;
    const b = (a + 40 + ((h >> 8) % 80)) % 360;
    return `linear-gradient(135deg,hsl(${a} 70% 55%),hsl(${b} 75% 45%))`;
  };

  // #tags and @mentions -> styled spans (input must be raw text)
  U.rich = (text) =>
    U.esc(text)
      .replace(/(^|[\s(])(#[\p{L}\p{N}_]{2,40})/gu, '$1<span class="tag" data-act="tag" data-tag="$2">$2</span>')
      .replace(/(^|[\s(])(@[A-Za-z0-9_.]{2,30})/g, '$1<span class="mention" data-act="mention" data-handle="$2">$2</span>')
      .replace(/\n/g, '<br>');

  U.normHandle = (h) => '@' + String(h || '').trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();

  U.debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  // Parse JSON out of an LLM reply: strips fences, extracts the object, repairs truncation.
  U.parseJSON = (txt) => {
    if (txt == null) throw new Error('Empty response');
    if (typeof txt === 'object') return txt;
    let s = String(txt).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try {
      return JSON.parse(s);
    } catch (e) {}
    const a = s.indexOf('{');
    if (a < 0) throw new Error('No JSON in response');
    s = s.slice(a);
    const b = s.lastIndexOf('}');
    if (b > 0) {
      try {
        return JSON.parse(s.slice(0, b + 1));
      } catch (e) {}
    }
    // truncated output: cut back to a boundary and close open brackets
    const close = (str) => {
      const stack = [];
      let inStr = false;
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (inStr) {
          if (c === '\\') i++;
          else if (c === '"') inStr = false;
        } else if (c === '"') inStr = true;
        else if (c === '{') stack.push('}');
        else if (c === '[') stack.push(']');
        else if (c === '}' || c === ']') stack.pop();
      }
      return inStr ? null : str.replace(/[,\s]+$/, '') + stack.reverse().join('');
    };
    let end = s.length;
    for (let tries = 0; tries < 250 && end > 1; tries++) {
      const cut = Math.max(s.lastIndexOf('}', end - 1), s.lastIndexOf(']', end - 1), s.lastIndexOf(',', end - 1));
      if (cut < 1) break;
      const cand = close(s.slice(0, s[cut] === ',' ? cut : cut + 1));
      if (cand) {
        try {
          return JSON.parse(cand);
        } catch (e) {}
      }
      end = cut;
    }
    throw new Error('Could not parse the AI response as JSON');
  };
})(window.G);
