/* Clout — REASONS: a message only exists when there is something real behind it.
   Before, people texted from a bag of generic lines ("u up?", "thinking of you"). Now a character writes to you only when one of these is true, and the
   message names the real thing (your post, the rumour, the storyline, a memory you share, the plan with a time):
     reacted to your post · followed up on an unanswered message · heard a rumour about you (asks, confronts or defends) · suspects someone in a storyline
     (points the finger: at you, or tells you who they suspect) · wants something today (their goal) and remembers a real moment · is carrying a bad memory ·
     proposes a plan with a time · saw news that concerns them · a rival reacting to something you actually did.
   No reason, no message. Suspicion works like the Werewolf-agent papers: a belief per person that is updated from evidence (rumours, memories, grudges and
   what was said in public), weighted by how much the listener trusts the accuser, and smoothed over time instead of flipping. */
(function (G) {
  'use strict';
  const U = G.U;
  const R = (G.Reasons = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const first = (s) => String(s || '').split(' ')[0];
  const pick = (l, rnd) => l[Math.floor(rnd() * l.length) % l.length];
  const FRIENDLY = ['friend', 'close_friend', 'best_friend', 'dating', 'partner', 'crush', 'admirer', 'situationship', 'stan', 'ally', 'mentor'];
  const HOSTILE = ['rival', 'enemy', 'nemesis', 'frenemy'];
  const trustOf = (n) => (typeof n.trust === 'number' ? n.trust : 30); // (0 is a real trust level, not 'missing')
  const nameOf = (id) => (id === 'me' ? G.S.player.name : (G.S.npcs[id] || {}).name || 'someone');
  const style = (n, text, rnd) => { try { return G.Voice.stylize(text, n, rnd, { short: true }); } catch (e) { return text; } };
  // ---- common sense (js/mind.js) ----
  const sensOf = (t) => (G.Mind ? G.Mind.read(t).sens : 0);
  // memories that are really channel chatter or the owner's delicate moments are never quoted back as "evidence" or "what I know"
  const quotable = (m) => !/\bin #[\w-]+/.test(String(m)) && !/^I (said|reached out)/.test(String(m)) && !(G.Channels && G.Channels.isMeta({ text: m })) && sensOf(m) < 0.5;
  // the player's latest delicate top-level post from the last two game days (what a caring friend would notice)
  R.delicatePost = function (t) {
    const S = G.S;
    if (!G.Mind) return null;
    for (let i = S.postOrder.length - 1, seen = 0; i >= 0 && seen < 30; i--) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p.replyTo || p.author !== 'me' || p.deleted) continue;
      seen++;
      if (t - p.t > 2880) break;
      if (G.Mind.read(p.text).sens >= 0.5) return p;
    }
    return null;
  };
  // did this person already care (a supportive message since the post, or a care DM that is queued/done: post.care[id] & 2)?
  R.caredFor = function (n, post) {
    const S = G.S;
    if (post.care && post.care[n.id] & 2) return true;
    return (S.dms[n.id] || []).some((m) => m.from === n.id && m.t >= post.t && G.Mind && G.Mind.supportive(m.text));
  };
  R.markCared = (n, post) => { post.care = post.care || {}; post.care[n.id] = (post.care[n.id] || 0) | 2; };

  /* ---------- loyalty: who a character stands by ---------- */
  // 0..1. Family, partners and best friends stand by you: they never join a pile-on, never accuse you in public, they ask you in private and defend you out loud.
  R.loyal = function (n, id) {
    const S = G.S;
    if (!n || !id || id === n.id) return 0;
    if (id === 'me') {
      const st = n.status;
      if (G.Engine.isFamily(n) || n.tier === 'lover') return 1;
      if (['partner', 'dating'].includes(st)) return 0.95;
      if (st === 'best_friend') return 0.9;
      if (st === 'close_friend') return 0.75;
      let v = ['friend', 'ally', 'mentor', 'stan'].includes(st) ? 0.4 : 0.1;
      v += Math.max(0, (n.aff || 0) - 40) / 120 + Math.max(0, trustOf(n) - 50) / 200;
      return clamp(v, 0, 0.7);
    }
    const o = S.npcs[id];
    if (!o) return 0;
    const e = G.React && G.React.edge ? G.React.edge(S, n.id, id) : null;
    if (e) return { family: 1, partner: 0.95, dating: 0.9, best_friend: 0.9, friend: 0.55, ally: 0.5 }[e.type] || 0.1;
    return 0.1;
  };
  R.LOYAL = 0.6; // from here on they defend instead of gossiping

  /* ---------- suspicion (a belief per person, from evidence) ---------- */
  // 0..1: how much `n` suspects `id` of being behind trouble, from rumours they believe, what they have lived through, grudges, and accusations they heard in public
  R.suspect = function (n, id) {
    const S = G.S;
    let s = 0;
    (S.rumors || []).forEach((r) => { if (r.about === id && r.belief && r.belief[n.id] >= 0.3) s += 0.5 * r.belief[n.id]; });
    if (G.Mem && G.Mem.belief) { const b = G.Mem.belief(n, id); if (b < 0) s += Math.min(0.4, -b * 0.5); }
    const gr = n.psy && n.psy.grudges && n.psy.grudges[id];
    if (gr) s += 0.3 * clamp(gr, 0, 1);
    if (n.heard && n.heard[id]) s += Math.min(0.4, n.heard[id]);
    if (id !== 'me' && S.npcs[id] && S.npcs[n.id] && n.id === id) return 0;
    return clamp(s * (1 - 0.9 * R.loyal(n, id)), 0, 1); // the people who love someone do not easily suspect them
  };
  // an accusation made in public: listeners update, weighted by how much they trust the SPEAKER (not only by what was said), smoothed so one message never flips a mind
  R.hear = function (listener, accused, speakerId, strength) {
    const sp = G.S.npcs[speakerId];
    const cred = sp ? clamp((trustOf(listener) + (listener.aff || 0) + 60) / 200, 0.1, 1) : 0.3; // how believable this speaker is to this listener
    listener.heard = listener.heard || {};
    listener.heard[accused] = clamp((listener.heard[accused] || 0) * 0.92 + 0.22 * (strength || 0.6) * cred, 0, 1);
    return listener.heard[accused];
  };
  R.broadcast = function (speaker, accused, strength, rnd) {
    const S = G.S;
    const pool = Object.values(S.npcs).filter((x) => !x.userAlt && !x.blocked && x.id !== speaker.id && x.id !== accused);
    let n = 0;
    pool.forEach((x) => { if (rnd() < 0.4 && n < 14) { R.hear(x, accused, speaker.id, strength); n++; } });
    if (!n && pool.length) { R.hear(pool[Math.floor(rnd() * pool.length) % pool.length], accused, speaker.id, strength); n++; } // (a public accusation never falls on deaf ears)
    return n;
  };
  // the most suspected among the people in a storyline (and you, when you are in it)
  R.topSuspect = function (n, sl) {
    const S = G.S;
    const ids = (sl.participants || []).filter((id) => id !== n.id && S.npcs[id] && !S.npcs[id].userAlt);
    if (sl.involvesMe) ids.push('me');
    return ids.map((id) => [id, R.suspect(n, id)]).sort((a, b) => b[1] - a[1])[0] || null;
  };
  const tok = (x) => new Set(G.Rag ? G.Rag.tokens(x) : String(x).toLowerCase().match(/[a-z]{4,}/g) || []);
  R.involvesMe = (sl) => {
    if (!sl) return false;
    if ((sl.participants || []).includes('me') || String(sl.title + ' ' + sl.summary).toLowerCase().includes(first(G.S.player.name).toLowerCase())) return true;
    const t = tok(sl.title + ' ' + (sl.summary || ''));
    return (G.S.rumors || []).some((r) => r.about === 'me' && [...tok(r.text)].some((w) => t.has(w)));
  };
  const evidenceFor = (n, id, title, rnd) => {
    const S = G.S;
    const r = (S.rumors || []).find((x) => x.about === id && x.belief && x.belief[n.id] >= 0.35 && quotable(x.text));
    if (r) return `I heard "${clip(r.text, 70)}"`;
    const nm = first(nameOf(id)).toLowerCase();
    const mem = G.Rag ? G.Rag.recall(n, nameOf(id) + ' ' + title, 3).find((m) => String(m).toLowerCase().includes(nm) && quotable(m)) : null;
    if (mem) return `I remember: ${clip(mem, 80)}`;
    return pick(['the timing is too convenient', 'it adds up and I do not like it', 'nobody else had a reason'], rnd);
  };
  // what a character says in a public "who did it?" thread: points a finger when they really suspect someone, shares what they know, or asks
  R.theory = function (n, sl, rnd) {
    const S = G.S;
    const P = first(S.player.name);
    sl = Object.assign({ involvesMe: R.involvesMe(sl) }, sl);
    const top = R.topSuspect(n, sl);
    const title = clip(sl.title, 50);
    if (top && top[1] >= 0.3) {
      const [id, score] = top;
      const ev = evidenceFor(n, id, sl.title, rnd);
      if (id === 'me') return { text: `${P}, you were in the middle of "${title}". ${ev}. What really happened?`, accused: 'me', mode: 'accuse', score };
      return { text: pick([`I think ${first(nameOf(id))} is behind "${title}". ${ev}.`, `Not saying it is ${first(nameOf(id))}, but "${title}"... ${ev}.`, `Look at ${first(nameOf(id))}: ${ev}. That is all I am saying about "${title}".`], rnd), accused: id, mode: 'accuse', score };
    }
    const known = G.Rag ? G.Rag.recall(n, sl.title, 4).filter((m) => String(m).length > 12 && quotable(m))[0] : null;
    if (known && rnd() < 0.6) return { text: `What I know about "${title}": ${clip(known, 90)}`, accused: null, mode: 'share' };
    const others = (sl.participants || []).filter((id) => id !== n.id && S.npcs[id]);
    if (others.length) return { text: pick([`Has anyone talked to ${first(nameOf(pick(others, rnd)))} since "${title}"? Something feels off.`, `Who actually knows what happened with "${title}"? I keep hearing different versions.`, `Is there anything solid on "${title}", or is it all guesses?`, `What would settle "${title}"? Does anyone have a date or a name?`, `I keep going back and forth on "${title}". what is the strongest fact so far?`], rnd), accused: null, mode: 'ask' };
    return { text: `Can we put together what we know about "${title}"? Everyone share one fact.`, accused: null, mode: 'ask' };
  };

  /* ---------- the reasons to message you ---------- */
  // returns [{ kind, w, text, done }]: every item carries the REAL text it will send
  R.candidates = function (n, t, ctx) {
    const S = G.S;
    const { rel, rnd, st, waiting, last, myRecent, fam } = ctx;
    const p = G.Persona.ensure(n);
    const P = first(S.player.name);
    const out = [];
    // every candidate passes the Mind gate before it can be chosen: no jokes about a delicate moment, no third-person self, no quoting somebody's worst night.
    // care = a caring line (kept as written: no emoji flourish that could turn it into a joke)
    const add = (kind, w, text, done, ref, aboutText, care) => {
      if (!text || !(w > 0)) return;
      const line = care ? text : style(n, text, rnd);
      if (G.Mind) {
        if (!care && !['vent', 'rumor_ask'].includes(kind) && G.Mind.read(line).sens >= 0.5 && !G.Mind.supportive(line)) return; // a DM never quotes a delicate thing without care
        if (!G.Mind.vet(n, line, { kind: 'dm', about: aboutText || '', rel }).ok) return;
      }
      out.push({ kind, w, text: line, done, ref: ref || undefined });
    };
    const friendly = FRIENDLY.includes(st) || fam;
    n.asked = n.asked || {};
    n.told = n.told || {};
    n.pointed = n.pointed || {};

    // 1. they reacted to something you posted
    if (myRecent.length && (friendly || HOSTILE.includes(st) || rel.c > 0.25)) {
      const post = myRecent[myRecent.length - 1];
      const s = clip(post.text, 50);
      const hostile = HOSTILE.includes(st) || rel.h > 0.4;
      if (sensOf(post.text) >= 0.5) { // a delicate post is met with care (or silence), never a tease, a joke or a quote
        if (!R.caredFor(n, post)) {
          const care = G.Mind.respond(n, { about: post.text, rel, to: P, rnd });
          if (care) add('reactpost', 2 * (0.6 + rel.c), care, () => R.markCared(n, post), G.Refs ? G.Refs.post(post.id) : null, post.text, true);
        }
      } else {
        const text = hostile ? pick([`"${s}"? bold`, `cute post. "${s}"... sure`], rnd) : st === 'crush' || st === 'admirer' ? pick([`"${s}" 😭 okay that one got me`, `saw "${s}". you are impossible`], rnd) : rel.c > 0.5 ? pick([`saw "${s}". proud of you`, `"${s}": you really said that 😂`], rnd) : `"${s}": what was that about?`;
        add('reactpost', 1.4 * (0.6 + rel.c), text, undefined, G.Refs ? G.Refs.post(post.id) : null, post.text);
      }
    }
    // 1b. a check-in: you posted something heavy a while ago, they are close, nobody has cared yet (no queued care DM, no supportive message) and you have not
    //     talked to them since. Once per post, never spam. (World.planCare handles the first wave; this catches the close people it did not reach.)
    {
      const dp = R.delicatePost(t);
      if (dp && (rel.c >= 0.3 || R.loyal(n, 'me') >= 0.6) && rel.h <= 0.3 && t - dp.t >= 90 && !n.told['ck' + dp.id] && !R.caredFor(n, dp) && !(S.dms[n.id] || []).some((m) => m.from === 'me' && m.t >= dp.t)) {
        const care = G.Mind.respond(n, { about: dp.text, rel, to: P, rnd });
        if (care) add('checkin', 1.8 + rel.c, `hey, i saw your post and i have not heard from you. ${care}`, () => { n.told['ck' + dp.id] = 1; R.markCared(n, dp); }, G.Refs ? G.Refs.post(dp.id) : null, dp.text, true);
      }
    }
    // 2. you have not answered their last message: ONE nudge per unanswered chain (never a nudge about a nudge), and a quote never contains a quote
    if (waiting && last && t - last.t > 180 && !last.fu) {
      const dl = S.dms[n.id] || [];
      const prev = dl[dl.findIndex((m) => m.id === last.id) - 1]; // the message just before `last`: if that is the one we nudged about, `last` IS the nudge
      const isNag = /^\W*(did you see my message|hey, about)/i.test(String(last.text || '')) || last.kind === 'followup' || (prev && prev.from === n.id && n.told.nagId === prev.id);
      if (!isNag) {
        const q = clip(String(last.text).replace(/["“”]/g, "'"), 40);
        add('followup', 0.9 * (0.5 + p.t.E / 100), pick([`did you see my message? "${q}"`, `hey, about "${q}": no pressure, just checking you saw it`], rnd), () => { last.fu = true; n.told.nagId = last.id; });
      }
    }
    // 3. a rumour about you reached them
    (S.rumors || []).filter((r) => r.about === 'me' && r.belief && r.belief[n.id] >= 0.15 && !n.asked[r.id]).slice(-1).forEach((r) => {
      const b = r.belief[n.id];
      const q = clip(r.text, 70);
      let text;
      const loyal = R.loyal(n, 'me') >= R.LOYAL;
      if (loyal) text = pick(fam ? [`hey, I heard something about you: "${q}". I do not believe it, but tell me what is really going on`, `someone is saying "${q}" about you. are you okay? you can tell me anything`, `I heard "${q}". I am on your side, just tell me the truth so I know what to say to people`] : [`I heard "${q}". I do not believe it for a second, but tell me what is real so I can shut it down`, `people are saying "${q}". I do not believe it. I have got your back, just tell me the truth`], rnd);
      else if (b >= 0.7 && (rel.c < 0.5 || trustOf(n) < 45)) text = pick([`I keep hearing "${q}". you owe me an explanation`, `"${q}": tell me it is not true`], rnd);
      else if (b >= 0.4) text = pick([`is it true? "${q}"`, `people are saying "${q}". what is going on?`], rnd);
      else if ((n.aff || 0) > 40) text = pick([`ignore the talk about "${q}". I have got your back`, `heard "${q}". I do not believe it for a second`], rnd);
      add('rumor_ask', 1.6 + b + (loyal ? 1.2 : 0), text, () => { n.asked[r.id] = 1; });
    });
    // 4. they suspect someone in a storyline: they point at you, or tell you who they suspect
    const day = U.dayOf(t);
    (S.storylines || []).filter((x) => x.status !== 'resolved' && (x.heat || 0) >= 35 && (x.participants || []).includes(n.id) === true || (x.status !== 'resolved' && (x.heat || 0) >= 50 && R.involvesMe(x))).slice(-3).forEach((sl) => {
      if (n.pointed[sl.id] === day) return;
      const slx = Object.assign({}, sl, { involvesMe: R.involvesMe(sl) });
      const top = R.topSuspect(n, slx);
      if (!top || top[1] < 0.3) return;
      const [id, score] = top;
      const ev = evidenceFor(n, id, sl.title, rnd);
      const title = clip(sl.title, 50);
      if (id === 'me' && R.loyal(n, 'me') < R.LOYAL && !(friendly && (n.aff || 0) > 50)) add('accuse', 1.8 + score, pick([`"${title}": it was you, wasn't it? ${ev}`, `you were in the middle of "${title}". ${ev}. explain yourself`], rnd), () => { n.pointed[sl.id] = day; });
      else if (id !== 'me' && ((n.aff || 0) > 30 || rel.c > 0.45)) add('point', 1.5 + score, pick([`about "${title}": I think ${first(nameOf(id))} is behind it. ${ev}`, `do not repeat this, but "${title}"... I suspect ${first(nameOf(id))}. ${ev}`], rnd), () => { n.pointed[sl.id] = day; });
    });
    // 5. what they want today, tied to a moment you really shared
    if (n.goal && n.goal.kind === 'player' && (!last || t - last.t > 1440)) {
      const m = G.Mem ? G.Mem.retrieve(n, { who: ['me'], text: n.goal.text }, 4).find((x) => (x.who || []).includes('me') && x.kind !== 'reflection' && !/^I /.test(x.text) && !/\(x\d+\)/.test(x.text)) : null; // (their own first-person notes and merged gists are never quoted back)
      if (m) {
        const mt = clip(G.Mem2 && G.Mem2.phrase ? G.Mem2.phrase(m) : m.text.replace(new RegExp('^' + first(S.player.name) + ' ', 'i'), ''), 60);
        const g = n.goal.text;
        const text = /apology/.test(g) ? `about "${mt}": I still want an honest apology` : /closer|spend time/.test(g) && ['crush', 'admirer', 'situationship', 'dating', 'partner'].includes(st) ? pick([`I keep thinking about "${mt}"`, `"${mt}"... I have not stopped thinking about it`], rnd) : /catch up|spend time/.test(g) ? `remember "${mt}"? we should do that again` : '';
        add('goal', 1.1, text);
      }
    }
    // 5b. a goal that aims at a real move (settle things with an ex, confront or win back somebody): at most one message a day, and add() vets it with Mind
    if (n.goal && n.goal.t !== n.goalActed && (!last || t - last.t > 720)) {
      const g = String(n.goal.text || '');
      const who = S.npcs[(n.goal.who || [])[0]];
      const wn = who ? first(who.name) : '';
      let gt = '';
      if (n.goal.kind === 'player' && /where things really stand/.test(g)) gt = pick([`can we talk about where we actually stand?`, `I do not know what we are anymore. can we be honest?`], rnd);
      else if (n.goal.kind === 'player' && /get one over/.test(g) && rel.h > 0.3) gt = pick([`still think you just got lucky`, `enjoy it while it lasts`], rnd);
      else if (n.goal.kind === 'npc' && who && /^confront/.test(g)) gt = `I am about to have it out with ${wn}. you should hear it from me first`;
      else if (n.goal.kind === 'npc' && who && /win them back/.test(g) && rel.c > 0.4) gt = `be honest, is ${wn} seeing anyone? asking for a reason`;
      if (gt) add('goal', 1.2, gt, () => { n.goalActed = n.goal.t; });
    }
    // 6. a bad memory is weighing on them (and they trust you with it)
    if (p.mood.v < -0.25 && rel.c > 0.4) {
      const m = G.Mem ? (n.mem || []).filter((x) => x.v < -0.3 && x.imp >= 5).sort((a, b) => b.t - a.t)[0] : null;
      if (m) add('vent', 0.9, `rough day. "${clip(m.text, 70)}" is still stuck with me`);
    }
    // 7. a plan with a time (it becomes an appointment, so it is real and you cannot sleepwalk past it)
    if (friendly && !waiting && (!n.lastPlan || t - n.lastPlan > 2880)) {
      const acts = ['grab coffee', 'get dinner', 'take a walk', 'go see a movie'];
      const at = t + 180 + Math.floor(rnd() * 24) * 60;
      const hh = ((at % 1440) + 1440) % 1440;
      if (hh >= 8 * 60 && hh <= 22 * 60) {
        const day2 = Math.floor(at / 1440) === Math.floor(t / 1440) ? 'today' : 'tomorrow';
        const h12 = ((Math.floor(hh / 60) + 11) % 12) + 1;
        add('plan', (['dating', 'partner'].includes(st) ? 0.7 : 0.45), `want to ${pick(acts, rnd)} ${day2} at ${h12}${hh % 60 ? ':' + String(hh % 60).padStart(2, '0') : ''} ${hh < 720 ? 'am' : 'pm'}?`, () => { n.lastPlan = t; });
      }
    }
    // 8. news that concerns them
    if (rel.c > 0.35) {
      const ev = (S.chronicle || []).filter((c) => !(G.Channels && G.Channels.isMeta(c)) && t - c.t < 4320 && !n.told[c.id] && (!String(c.text).toLowerCase().includes(first(n.name).toLowerCase()) && String(c.text).toLowerCase().includes(first(S.player.name).toLowerCase()))).slice(-1)[0]; // (news about you, never about the speaker himself or herself)
      if (ev) add('news', 0.7, `did you hear? "${clip(ev.text, 80)}"`, () => { n.told[ev.id] = 1; });
    }
    // 9b. they bring up something specific they remember about you (a promise, a secret, what you said or did): a callback, never a generic line
    if (G.Mem2 && (friendly || HOSTILE.includes(st) || rel.c > 0.3)) {
      const cb = G.Mem2.callback(n, {});
      if (cb && cb.m.imp >= 6) add('callback', 0.7 + cb.m.imp / 12, G.Mem2.say(n, cb, 'dm', rnd, true), () => { cb.m.cb = t; G.Mem2.rehearse(cb.m); });
    }
    // 9a. the story gave them something to say: only what THEY know, and only what you were part of (storyworld.js)
    // 9. a rival reacts to something you really did
    if (HOSTILE.includes(st)) {
      const post = S.postOrder.slice(-40).map((id) => S.posts[id]).filter((x) => x && x.author === 'me' && !x.replyTo && t - x.t < 1440).slice(-1)[0];
      if (post && sensOf(post.text) < 0.5) add('provoke', 1.0 + rel.h,pick([`saw "${clip(post.text, 40)}". try harder.`, `"${clip(post.text, 40)}"? that is the best you have got?`], rnd), undefined, G.Refs ? G.Refs.post(post.id) : null);
    }
    return out;
  };
})(window.G);
