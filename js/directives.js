/* Clout — Global directives ("/global act more curious").
   Instructions from the owner that apply to EVERYONE, everywhere, until removed: every AI call (posts, replies, DMs, channels, the Director)
   carries them as standing orders, and the free simulation (no AI) is nudged by the same words through "dials" (curious, dramatic, warm, edgy,
   chatty, quiet, flirty). They are saved with the world. This file only adds prompt text and mild weights; it does not touch the content
   level or hard limits, which stay exactly as the owner set them (a "flirty" dial is capped to what the content level already allows). */
(function (G) {
  'use strict';
  const D = (G.Directives = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

  D.list = () => ((G.S && G.S.globalRules) || []).filter((r) => r && r.on !== false);
  D.all = () => (G.S && G.S.globalRules) || [];

  D.add = function (text) {
    const S = G.S;
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 400);
    if (!text) throw Object.assign(new Error('Say what everyone should do differently, for example: /global act more curious'), { user: true });
    S.globalRules = (S.globalRules || []).filter((r) => r.text.toLowerCase() !== text.toLowerCase());
    const r = { id: 'gd' + ((S.counters.gdir = (S.counters.gdir || 0) + 1)), text, on: true, t: S.clock };
    S.globalRules.push(r);
    if (S.globalRules.length > 12) S.globalRules.shift();
    D._cache = null;
    G.Store.saveSoon();
    return r;
  };
  D.remove = function (ref) {
    const S = G.S;
    const all = S.globalRules || [];
    const i = /^\d+$/.test(String(ref)) ? Number(ref) - 1 : all.findIndex((r) => r.id === ref);
    if (!all[i]) throw Object.assign(new Error('No such global directive. /global list shows them.'), { user: true });
    const [gone] = all.splice(i, 1);
    D._cache = null;
    G.Store.saveSoon();
    return gone;
  };
  D.toggle = function (ref) {
    const all = (G.S && G.S.globalRules) || [];
    const r = all.find((x) => x.id === ref) || all[Number(ref) - 1];
    if (!r) throw Object.assign(new Error('No such global directive.'), { user: true });
    r.on = r.on === false;
    D._cache = null;
    G.Store.saveSoon();
    return r;
  };
  D.clear = function () {
    const n = D.all().length;
    G.S.globalRules = [];
    D._cache = null;
    G.Store.saveSoon();
    return n;
  };

  // "/global <text>", "/global list|clear|remove 2|off 2|on 2", or text that ends with /global or /globally
  D.parse = function (raw) {
    const t = String(raw || '').trim();
    const m = /^\/global(?:ly)?\b\s*([\s\S]*)$/i.exec(t) || /^([\s\S]*?\S)\s*\/global(?:ly)?\s*$/i.exec(t);
    if (!m) return null;
    return m[1].trim();
  };
  // runs a parsed command; returns a sentence for the owner
  D.run = function (arg) {
    const a = String(arg || '').trim();
    if (!a || /^list$/i.test(a)) {
      const l = D.all();
      return l.length ? 'Global directives:\n' + l.map((r, i) => `${i + 1}. ${r.on === false ? '(off) ' : ''}${r.text}`).join('\n') : 'No global directives yet. Example: /global act more curious';
    }
    if (/^clear$/i.test(a)) return `Removed ${D.clear()} global directive(s).`;
    let m = /^(?:remove|delete|rm)\s+(\d+)$/i.exec(a);
    if (m) return 'Removed: ' + D.remove(m[1]).text;
    m = /^(on|off)\s+(\d+)$/i.exec(a);
    if (m) {
      const r = D.all()[Number(m[2]) - 1];
      if (!r) throw Object.assign(new Error('No such global directive.'), { user: true });
      r.on = m[1].toLowerCase() === 'on';
      D._cache = null;
      G.Store.saveSoon();
      return `${r.on ? 'On' : 'Off'}: ${r.text}`;
    }
    const r = D.add(a);
    const d = D.dials();
    const eff = Object.keys(d).filter((k) => Math.abs(d[k] - 1) > 0.01).map((k) => `${k} ×${d[k].toFixed(1)}`);
    return `Applied to everyone: "${r.text}"${eff.length ? ` (free simulation: ${eff.join(', ')})` : ''}.`;
  };

  /* ---------- what the AI sees ---------- */
  D.promptBlock = function () {
    const l = D.list();
    if (!l.length) return '';
    return 'GLOBAL DIRECTIVES FROM THE OWNER (apply to every character and every line you write, on top of each character\'s own personality; the content level and hard limits above still decide what is allowed):\n' + l.map((r) => '- ' + clip(r.text, 300)).join('\n');
  };

  /* ---------- what the free simulation feels ---------- */
  const WORDS = {
    curious: /\b(curious|curiosity|nosy|inquisitive|ask(?:ing)? (?:more )?questions|wonder(?:ing)?|investigat\w*|interested)\b/gi,
    drama: /\b(dramat\w*|drama|gossip\w*|petty|messy|chaos|chaotic|stir(?:ring)?|shade|spicy gossip|tea)\b/gi,
    warm: /\b(warm\w*|kind\w*|support\w*|wholesome|nice|friendl\w*|caring|gentle|sweet)\b/gi,
    edgy: /\b(savage|mean|rude|roast\w*|toxic|hostile|edgy|sarcas\w*|blunt|harsh|cold)\b/gi,
    chatty: /\b(chatty|talkative|active|lively|outgoing|more (?:messages|comments|talking|replies)|engaged)\b/gi,
    quiet: /\b(quiet\w*|reserved|less (?:chatty|talkative|active)|fewer messages|shy|withdrawn)\b/gi,
    flirty: /\b(flirt\w*|romantic|seductive|sensual)\b/gi,
  };
  const negated = (text, idx) => /\b(?:less|not|no|never|stop|don'?t|do not|without|fewer)\s+(?:\w+\s+){0,2}$/i.test(text.slice(Math.max(0, idx - 24), idx));
  D.dials = function () {
    const text = D.list().map((r) => r.text).join(' | ');
    if (D._cache && D._cache.text === text) return D._cache.v;
    const v = { curious: 1, drama: 1, warm: 1, edgy: 1, chatty: 1, quiet: 1, flirty: 1 };
    Object.keys(WORDS).forEach((k) => {
      let m;
      WORDS[k].lastIndex = 0;
      while ((m = WORDS[k].exec(text))) {
        if (negated(text, m.index)) v[k] = Math.max(0.4, v[k] - 0.4);
        else v[k] = Math.min(2.2, v[k] + 0.6);
      }
    });
    // "quiet" and "chatty" are one axis
    v.chatty = Math.max(0.4, Math.min(2.2, v.chatty / v.quiet));
    delete v.quiet;
    D._cache = { text, v };
    return v;
  };
  D.dial = (k) => {
    if (!G.S) return 1;
    const x = D.dials()[k];
    if (k === 'flirty' && x > 1) return Math.min(x, 1.15); // flirting never goes past PG-13
    return x == null ? 1 : x;
  };
  D.PRESETS = [
    ['🧐 More curious', 'act more curious: ask questions, wonder about what is going on, notice details'],
    ['🔥 More dramatic', 'act more dramatic and gossipy: take sides, stir things up, react strongly'],
    ['🤗 Warmer', 'act warmer and more supportive towards each other and towards me'],
    ['🗡 Savage', 'act more savage and blunt: sarcastic, quick to roast'],
    ['💬 Chattier', 'be chattier and more engaged: reply more, message more'],
    ['🤫 Quieter', 'be quieter and more reserved: fewer messages, shorter replies'],
  ];
})(window.G);
