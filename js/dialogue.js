/* Clout — dialogue brain for the free (no AI key) DM path: G.Dialogue.
   Before this a reply was 10 regex intents (first match wins) x a tone bucket -> a random canned line. Nothing read the chat history,
   the memory, the clock, the plans or the personality. This module is the missing middle, rule-based, free and deterministic (inject `rnd`):
   - classify(text, ctx)  what DID they just say? dialogue acts (question, invite, compliment, insult, ...), slots (time, place, topic, person),
                          tone, short, repeat. Uses vendored Chrono (dates/times) and compromise (questions, negation, people, places) when loaded.
   - plan(npc, text, ctx) decide what THIS person does with it: act, stance, the reply text, effects on the relationship, the memory to keep,
                          an appointment, and whether they leave it on read. Reads the thread, memory, plans, clock, relationship, traits, G.Mind.
   - apply(npc, plan)     writes the effects / memory / appointment (so a caller can preview a plan without side effects).
   Research: dialogue-act taxonomies (DAMSL / ISO 24617-2: question, inform, offer, accept, decline, apologise, thank), Gricean cooperation
   (answer the question that was asked, do not repeat yourself), politeness theory (Brown & Levinson: decline softly when distant),
   attachment style -> withdrawal vs protest, Big Five -> verbosity (E), warmth (A), directness (1-A). */
(function (G) {
  const D = (G.Dialogue = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lc = (s) => String(s || '').toLowerCase();
  const norm = (s) => lc(s).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const letters = (s) => norm(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const toks = (s) => new Set(letters(s).split(' ').filter((w) => w.length > 2));
  const jac = (a, b) => {
    if (!a.size || !b.size) return 0;
    let i = 0;
    a.forEach((x) => { if (b.has(x)) i++; });
    return i / (a.size + b.size - i);
  };
  const firstName = (n) => (G.U && G.U.first ? G.U.first((n && n.name) || '') : String((n && n.name) || '').split(' ')[0]);
  const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const win = () => (typeof window !== 'undefined' ? window : {});

  /* ---------- optional libraries (vendor/chrono.min.js, vendor/compromise.min.js): the module still works without them ---------- */
  const chrono = () => { const c = win().Chrono; return c && typeof c.parse === 'function' ? c : null; };
  const nlpLib = (s) => {
    const f = win().nlp;
    if (typeof f !== 'function') return null;
    try { return f(String(s || '')); } catch (e) { return null; }
  };

  /* ---------- the game clock <-> real dates. Game minute 0 = Monday 00:00 UTC of a fixed week, so weekday words ("saturday") mean something ---------- */
  const BASE = Date.UTC(2026, 0, 5);
  const DAYRX = /\b(today|tonight|tomorrow(?: (?:morning|night|evening|afternoon))?|this (?:morning|afternoon|evening|weekend)|next (?:week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b/i;
  const hm12 = (at) => {
    const m = ((Math.round(at) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mi = m % 60;
    return `${((h + 11) % 12) + 1}${mi ? ':' + String(mi).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
  };
  D.hm12 = hm12;

  function parseTime(raw, now) {
    const out = { time: '', when: '', whenFull: '', at: null, vague: '' };
    const s = String(raw || '');
    const ls = lc(s);
    const dayWord = (DAYRX.exec(ls) || [])[1] || '';
    let at = null, rel = '';
    const C = chrono();
    if (C) {
      try {
        const res = C.parse(s, { instant: new Date(BASE + now * 60000), timezone: 0 }, { forwardDate: true });
        const r = res[0];
        if (r) {
          const certainH = r.start.isCertain('hour');
          if (certainH) {
            at = Math.round((r.start.date().getTime() - BASE) / 60000);
            if (!r.start.isCertain('meridiem')) { // "at 7" means the evening, unless they said morning
              const h = Math.floor((((at % 1440) + 1440) % 1440) / 60);
              if (h >= 1 && h <= 11 && !/\b(am|morning|breakfast)\b/.test(ls)) {
                at += 720;
                if (at - 1440 > now && !/\b(tomorrow|next)\b/.test(ls)) at -= 1440;
              }
            }
            if (/^in\s/i.test(r.text)) rel = r.text.toLowerCase();
          } else if (!dayWord) out.vague = r.text.toLowerCase();
        }
      } catch (e) { at = null; }
    } else {
      const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(ls) || /\bat\s+(\d{1,2})(?::(\d{2}))?\b/.exec(ls);
      if (m) {
        let h = Number(m[1]);
        const mi = Number(m[2] || 0);
        if (m[3]) h = (h % 12) + (m[3] === 'pm' ? 12 : 0); else if (h >= 1 && h <= 11) h += 12;
        if (h < 24 && mi < 60) {
          const day = Math.floor(now / 1440);
          at = day * 1440 + h * 60 + mi + (/\btomorrow\b/.test(ls) ? 1440 : 0);
          if (at <= now && !/\btomorrow\b/.test(ls)) at += 1440;
        }
      }
      const rm = /\bin (\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hours?|hrs?)\b/.exec(ls);
      if (rm) { at = now + Math.round(Number(rm[1]) * (/^m/.test(rm[2]) ? 1 : 60)); rel = rm[0]; }
    }
    if (at !== null && (at < now - 5 || at - now > 7 * 1440)) at = null;
    if (at !== null) {
      out.at = at;
      out.time = hm12(at);
      out.when = rel || dayWord.toLowerCase() || (Math.floor(at / 1440) === Math.floor(now / 1440) ? 'today' : Math.floor(at / 1440) === Math.floor(now / 1440) + 1 ? 'tomorrow' : '');
      out.whenFull = rel ? rel : out.when && out.when !== 'today' ? `${out.when} at ${out.time}` : out.time;
    } else if (dayWord) {
      out.when = dayWord.toLowerCase();
      out.whenFull = out.when;
    } else if (out.vague) {
      out.when = out.vague;
      out.whenFull = out.vague;
    }
    return out;
  }
  D.parseTime = parseTime;

  const VENUE = '(?:cafe|café|coffee shop|restaurant|park|beach|gym|bar|club|library|mall|cinema|movies|theat(?:er|re)|office|campus|station|museum|pizzeria|diner|bakery|rooftop|school|market|studio|lake|pub|bookstore|arcade|garden|pool|stadium|airport|hotel)';
  const PLACERX = new RegExp('\\b(?:at|in|to|by|near|from|outside)\\s+((?:the|a|our)\\s+' + VENUE + '|' + VENUE + ')\\b|\\b((?:my|your|our)\\s+(?:place|house|apartment|flat|room|home))\\b|\\b(?:at|to)\\s+(home)\\b', 'i');
  const swapPerson = (s) => String(s || '').replace(/\b(my|your)\b/gi, (m) => (m.toLowerCase() === 'my' ? 'your' : 'my'));

  const STOP = new Set(['you', 'your', 'the', 'and', 'that', 'this', 'what', 'did', 'does', 'remember', 'told', 'tell', 'said', 'say', 'know', 'recall', 'forgot', 'forget', 'have', 'about', 'with', 'there', 'when', 'where', 'which', 'would', 'could', 'should', 'something', 'anything', 'everything', 'yesterday', 'earlier', 'before', 'still', 'really', 'just', 'again', 'time']);

  function extractSlots(raw, ctx) {
    ctx = ctx || {};
    const now = ctx.now != null ? ctx.now : (G.S && G.S.clock) || 0;
    const slots = {};
    const tm = parseTime(raw, now);
    ['time', 'when', 'whenFull', 'at'].forEach((k) => { if (tm[k] !== '' && tm[k] != null) slots[k] = tm[k]; });
    const pm = PLACERX.exec(String(raw || ''));
    if (pm) slots.place = (pm[1] || pm[2] || pm[3]).toLowerCase();
    else {
      const d = ctx.doc !== undefined ? ctx.doc : nlpLib(raw);
      if (d) { try { const pl = d.places().out('array')[0]; if (pl) slots.place = String(pl).replace(/[?.!,]+$/, ''); } catch (e) {} }
    }
    const d2 = ctx.doc !== undefined ? ctx.doc : nlpLib(raw);
    if (d2) {
      try {
        const me = lc(firstName(ctx.npc));
        const pe = d2.people().out('array').map((x) => String(x).replace(/[?.!,]+$/, '')).find((x) => x && lc(x) !== me && !/^(i|me|you|u)$/i.test(x));
        if (pe) slots.person = pe;
      } catch (e) {}
    }
    const L = G.Lex;
    if (L && L.TOPICS) {
      const low = ' ' + lc(raw) + ' ';
      const tp = (L.TOPIC_LIST || Object.keys(L.TOPICS)).find((k) => L.TOPICS[k].some((w) => low.includes(' ' + w.trim()) && w.trim().length > 2));
      if (tp) slots.topic = tp;
    }
    return slots;
  }

  /* ================= classify ================= */
  const RX = {
    greeting: /^(hi+|hey+|heya|hello+|hiya|yo+|sup|howdy|hola|gm|good (?:morning|evening|afternoon|night)|what'?s up|whats up|wassup)\b/,
    howru: /\b(how are (?:you|u)|how r (?:you|u)|how'?s it going|how have you been|how was your (?:day|night|weekend)|how'?s your (?:day|week)|what'?s new|how you doing|how are things)\b/,
    status: /\b(what (?:are|r) (?:you|u) (?:up to|doing|planning)|what (?:do|did) you (?:do|get up to)|any plans|got plans|have plans|do you have plans|what did you do|what'?s up with you|what have you been up to)\b/,
    farewell: /\b(bye+|goodnight|good night|gn|ttyl|talk (?:to you )?later|see (?:you|ya) (?:later|soon)|cya|gtg|got to go|i have to go|i gotta go|heading (?:off|out)|sleep well|catch you later)\b/,
    thanks: /\b(thanks|thank you|thx|tysm|ty|appreciate (?:it|you|that)|cheers)\b/,
    apology: /\b(sorry|apologi[sz]e|apology|my bad|i was wrong|forgive me|didn'?t mean (?:to|it)|i shouldn'?t have|i feel bad about)\b/,
    apologyNot: /sorry (?:to hear|for your|about your|about the news)/,
    insult: /\b(stupid|idiot|dumb|ugly|hate you|shut up|loser|pathetic|worthless|annoying|f+u+c+k (?:you|off)|screw you|you suck|useless|trash|moron|bitch|asshole|jerk|boring|fake|disgusting|go away|nobody likes you|can'?t stand you|are a joke|waste of|clown)\b/,
    insultNeg: /(?:\bnot|n't|\bnever|\bno)\W+(?:\w+\W+){0,2}$/,
    addressed: /\b(you|u|ur|your|you're|youre)\b/,
    compliment: /\b(?:you|u)(?:'re|'ve been| are| look| looked| seem| sound| r|re)?\s+(?:so |really |very |such a |such an |absolutely |incredibly |just |totally |kinda )?(amazing|awesome|beautiful|pretty|handsome|gorgeous|hot|cute|funny|smart|sweet|kind|talented|great|wonderful|incredible|the best|perfect|brilliant|cool|lovely|stunning|adorable|special|fun|a gem|an angel|so good|a star|inspiring)\b|\bi (?:really |just |absolutely )?(?:love|adore|admire) (?:you|your|how you|that you)\b|\bproud of you\b|\bi like you\b|\blooking (?:good|great|amazing|fine)\b|\byour [a-z ]{2,18} (?:is|are|looks?|looked) (?:so |really |very )?(?:amazing|great|beautiful|gorgeous|cute|awesome|lovely|good|nice|perfect)\b|\byou rock\b|\bbest (?:friend|person)\b/,
    news: /\b(guess what|i got (?:a|the|into|accepted)|i passed|i'?m (?:so )?(?:happy|excited|thrilled)|great news|good news|i finally|i just (?:got|won|finished|bought|signed|booked|landed)|i did it|got promoted|got the job|i'?m engaged)\b/,
    bad: /\b(i (?:had|have|am having) a (?:really |very )?(?:bad|rough|terrible|awful|hard|tough|horrible) (?:day|week|time|night|month)|i'?m (?:so |really |very )?(?:sad|upset|stressed|exhausted|depressed|lonely|miserable|burnt out|burned out)|feeling (?:down|low|awful|terrible|empty|lonely)|my (?:day|week|life) (?:was|has been|is) (?:awful|terrible|bad|rough|a mess)|i feel (?:so )?(?:alone|empty|useless|lost))\b/,
    wantTalk: /\b(can we talk|need to talk|can i talk to you|got a minute|can i vent|wanna talk|want to talk|have a minute|free to talk)\b/,
    recall: /\b(do you (?:still )?remember|don'?t you remember|remember (?:what|when|that|how|my|the|who|where|me telling)|did i (?:tell|say|mention)|what did i (?:tell|say|mention)|have i (?:told|mentioned)|you forgot|did you forget|do you know what i|what i (?:told|said to|mentioned to) you|what i just told|do you recall|i told you)\b/,
    planQ: /\b(?:what time|when|where)\b.*\b(?:did we|we said|we agreed|we decided|we planned|were we|are we|we set|we arranged)\b|\bwhat time (?:is|was) (?:it|that|the|our)\b|\bremind me (?:what|when|where|of the|about the)\b|\bwhere (?:are we|were we) (?:meeting|going|supposed)\b|\bwhat (?:was|is) the plan\b|\bwhen (?:are we|were we) (?:meeting|supposed)\b|\bare we still (?:on|meeting)\b|\bwhat did we (?:say|agree|decide|plan)\b/,
    advice: /\b(what should i|should i|any advice|need (?:your )?(?:advice|opinion)|what do you think (?:i should|about)|what would you do|do you think i should|help me (?:decide|choose)|what do you suggest|your opinion|which (?:one )?should i)\b/,
    invite: /\b(wanna|want to|would you like to|do you want to|are you free|you free|free (?:tonight|tomorrow|this|on|later|today|for)|let'?s (?:meet|go|get|grab|hang|do|catch|have|try|plan|see|watch|walk|eat|cook|party|head)|how about (?:we|dinner|lunch|coffee|a|the)|shall we|can we (?:meet|hang|go|get|grab|catch|do|see)|could we (?:meet|hang|go|get|grab|catch)|come (?:over|with|to|by|along)|join me|meet(?: me| up)?|grab (?:a|some|dinner|lunch|coffee|drinks)|hang out|go (?:out|to|for)|swing by|stop by|pick you up|take you out)\b/,
    inviteNot: /nice to meet you|pleasure to meet|how about you|what about you|did you meet|when we met|\bhave you met/,
    accept: /^(yes+|yeah|yep|yup|sure|ok+(?:ay)?|k+|sounds (?:good|great|fun|perfect)|deal|works for me|perfect|i'?d love to|definitely|absolutely|let'?s do it|that works|i'?m in|count me in|see you(?: then| there)?|can'?t wait|on my way|great|awesome|alright)\b/,
    decline: /^(no+|nope|nah|not really|not now|not tonight|can'?t|i can'?t|sorry,? i can'?t|i'?m busy|i am busy|rain ?check|maybe (?:another|some other) time|pass|not this time|i'?ll pass)\b|\bcan'?t make it\b|\bi (?:can'?t|won'?t be able to) (?:come|make|go|join)\b/,
    topicChange: /^(anyway|anyways|by the way|btw|random but|unrelated|speaking of|changing the subject|on another note|so,? about|oh and|also,)\b|\b(?:changing|change) the subject\b/,
    shareFact: /^(?:oh,? |so,? |well,? )?(?:my [a-z ]{2,20}|i'?m|i am|i have|i work|i live|i like|i love|i hate|i used to|i'?ve|i grew up|i study|i play)\b/,
    joke: /(\bhaha+|\blol\b|\blmao\b|\brofl\b|knock knock|why did the|\u{1F602}|\u{1F923})/u,
    ynStart: /^(do|does|did|are|is|am|was|were|can|could|will|would|have|has|should|shall|isn'?t|aren'?t|don'?t|wouldn'?t)\b/,
    whStart: /^(what|why|how|who|where|when|which)\b/,
    timeNow: /\bwhat time is it\b|\bwhat'?s the time\b|\bgot the time\b|\bdo you have the time\b/,
    oneWord: /^(ok+|okay|k+|kk|hmm+|mhm|oh|ah|yeah|yep|lol|haha|idk|nothing|nvm|cool|nice|fine|sure|alright|right|true|same|wow|oof)$/,
  };
  const mind = () => (G.Mind && G.Mind.read ? G.Mind : null);

  function toneOf(s, acts, sens) {
    if (acts.includes('insult') || sens >= 0.5) return 'neg';
    if (sens >= 0.9) return 'urgent';
    if (acts.some((a) => ['compliment', 'thanks', 'share_news', 'greeting', 'joke'].includes(a))) return 'pos';
    try {
      const v = win().vader;
      if (v && v.SentimentIntensityAnalyzer) {
        const c = v.SentimentIntensityAnalyzer.polarity_scores(s).compound;
        if (c > 0.4) return 'pos';
        if (c < -0.4) return 'neg';
      }
    } catch (e) {}
    return 'neutral';
  }

  // thread: [{from,text,t}] messages BEFORE this one. A message from the player has from === 'me'.
  const mine = (m) => m && (m.from === 'me' || m.from === 'player');
  D.classify = function (text, ctx) {
    ctx = ctx || {};
    const raw = String(text || '');
    const s = norm(raw);
    const L = letters(raw);
    const words = L ? L.split(' ') : [];
    const thread = ctx.thread || [];
    const acts = [];
    const add = (a) => { if (!acts.includes(a)) acts.push(a); };
    const doc = nlpLib(s);
    const slots = extractSlots(raw, Object.assign({}, ctx, { doc }));
    const read = mind() ? mind().read(raw) : { sens: 0, good: false, joke: false, kinds: [] };
    let sens = read.sens || 0;
    const hasQ = /\?/.test(raw) || (doc && (() => { try { return doc.questions().length > 0; } catch (e) { return false; } })()) || ((RX.ynStart.test(s) || RX.whStart.test(s)) && words.length >= 2);
    const negated = doc ? (() => { try { return doc.has('#Negative'); } catch (e) { return false; } })() : /\b(not|n't|never)\b/.test(s);

    // apology / insult
    const am = RX.apology.exec(s);
    const apology = !!am && !RX.apologyNot.test(s);
    let insult = false;
    const im = RX.insult.exec(s);
    if (im && !RX.insultNeg.test(s.slice(0, im.index)) && (RX.addressed.test(s) || /^(shut up|go away|f+u+c+k|screw)/.test(s))) insult = true;
    if (apology) add('apology');
    if (insult) add('insult');
    if (RX.compliment.test(s) && !(negated && /\bnot\b|n't/.test(s) && !/\bi\b/.test(s) && !insult)) add('compliment');
    if (RX.thanks.test(s)) add('thanks');
    // sharing (good / bad) and what they mean by it
    if (sens >= 0.5) add('share_bad');
    else if (RX.bad.test(s)) { add('share_bad'); sens = Math.max(sens, 0.4); }
    if ((read.good || RX.news.test(s)) && sens < 0.5) add('share_news');
    // questions
    const planQ = RX.planQ.test(s) && !RX.timeNow.test(s);
    if (planQ) add('question_plan');
    if (RX.recall.test(s) && (hasQ || /^(remember|do you)/.test(s) || /what i (told|said)/.test(s))) add('question_recall');
    if (RX.advice.test(s)) add('advice_request');
    const statusQ = RX.status.test(s);
    const startsAccept = RX.accept.test(s);
    const timeAndPlan = slots.at != null && /\b(meet|dinner|lunch|brunch|coffee|drinks?|movie|party|hang|call|date|walk|come|see you|pick)\b/.test(s);
    if (!planQ && !statusQ && !RX.inviteNot.test(s) && !(startsAccept && !hasQ) && (RX.invite.test(s) || timeAndPlan)) add('invite');
    if (RX.wantTalk.test(s)) add('want_talk');
    if (startsAccept && words.length <= 10 && !hasQ) add('accept');
    if (RX.decline.test(s) && !hasQ) add('decline');
    if (RX.howru.test(s)) add('question_howru');
    if (statusQ) { add('question_status'); add('smalltalk'); }
    if (RX.farewell.test(s) && slots.at == null) add('farewell');
    if (RX.joke.test(s) || read.joke) add('joke');
    if (RX.topicChange.test(s)) add('topic_change');
    if (hasQ) {
      if (RX.whStart.test(s) || /\b(what|why|how|who|where|when|which)\b/.test(s)) add('question_wh');
      if (RX.ynStart.test(s) || !acts.includes('question_wh')) add('question_yn');
    }
    if (!hasQ && !acts.length && RX.shareFact.test(s) && words.length >= 4) add('share_fact');
    if (RX.greeting.test(s) && words.length <= 6 && !acts.some((a) => ['invite', 'question_plan', 'share_bad', 'share_news', 'insult'].includes(a))) add('greeting');
    if (words.length <= 2 && (RX.oneWord.test(L) || !acts.length)) add('one_word');
    if (!acts.length || (acts.length === 1 && acts[0] === 'one_word' && words.length > 2)) add('smalltalk');

    // repeats: the same thing as one of the last few things THEY wrote
    let repeatCount = 0;
    if (L.length > 3) {
      const mineMsgs = thread.filter(mine).slice(-4).reverse();
      const mt = toks(raw);
      for (const m of mineMsgs) {
        const ml = letters(m.text);
        if (ml === L || (mt.size >= 2 && jac(mt, toks(m.text)) >= 0.8)) repeatCount++; else break;
      }
      if (!repeatCount && thread.length) { // an exact repeat is still a repeat even with a reply in between
        const lastMine = thread.filter(mine).slice(-1)[0];
        if (lastMine && letters(lastMine.text) === L) repeatCount = 1;
      }
    }
    return { acts, slots, tone: toneOf(raw, acts, sens), short: words.length <= 3, repeat: repeatCount > 0, repeatCount, sens, question: !!hasQ, negated: !!negated, playful: RX.joke.test(s) || /[\u{1F602}\u{1F923}\u{1F60F}]/u.test(raw) };
  };

  /* ================= style, plans, helpers ================= */
  D.styleOf = function (npc, rel) {
    const p = G.Persona.ensure(npc);
    const t = p.t;
    rel = rel || { c: 0.3, h: 0, r: 0 };
    const text = lc(`${npc.personality || ''} ${npc.bio || ''} ${(npc.tags || []).join(' ')}`);
    if (rel.h > 0.5 || (/\b(cold|ruthless|aloof|icy)\b/.test(text) && rel.c < 0.45) || (rel.c < 0.15 && t.A < 45)) return 'cold';
    const romantic = ['crush', 'dating', 'partner', 'admirer', 'situationship'].includes(npc.status);
    if (rel.r > 0.38 && t.E >= 40 && (romantic || /flirt/.test(text))) return 'flirty';
    if (p.style.formal || /\b(formal|polite|proper|well-spoken)\b/.test(text)) return 'formal';
    if (/\b(sarcas|snark|witty|smug|petty|savage|cocky|arrogant|dry)\w*/.test(text) || t.A < 40) return 'snarky';
    if (/\b(blunt|direct|no-?nonsense|straightforward|brutally honest)\b/.test(text) || (t.A < 52 && t.E >= 45)) return 'blunt';
    if (t.E >= 55) return 'bubbly';
    return 'shy';
  };

  const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;
  const recentThread = (npc, S) => {
    const l = (S && S.dms && S.dms[npc.id]) || [];
    return l.slice(-6).map((m) => ({ from: m.from, text: m.text, t: m.t }));
  };
  const asSecond = (s) => String(s || '')
    .replace(/\bi'm\b|\bim\b/gi, "you're").replace(/\bi am\b/gi, 'you are').replace(/\bi've\b/gi, "you've").replace(/\bi'll\b/gi, "you'll").replace(/\bi'd\b/gi, "you'd")
    .replace(/\bmyself\b/gi, 'yourself').replace(/\bmine\b/gi, 'yours').replace(/\bmy\b/gi, 'your').replace(/\bme\b/gi, 'you').replace(/\bi\b/gi, 'you')
    .replace(/\byou was\b/gi, 'you were').replace(/\byou have\b/gi, 'you have');
  const unquote = (t) => { const m = /(?:texted me|told me|said)[:,]?\s*["“]([^"”]+)["”]/i.exec(String(t || '')); return m ? m[1] : String(t || ''); };

  // a plan the two of them made: stored plans first, then Clock appointments, then the thread itself
  D.findPlan = function (npc, ctx) {
    const S = ctx.S || G.S;
    const now = ctx.now != null ? ctx.now : S.clock;
    const p = G.Persona.ensure(npc);
    const fresh = (p.plans || []).filter((x) => x.at > now - 180).sort((a, b) => b.made - a.made)[0];
    if (fresh) return { at: fresh.at, when: fresh.whenFull, where: fresh.place || '', time: fresh.time, text: fresh.text };
    const ap = ((S.appts || []).filter((a) => a.npc === npc.id && (a.status === 'pending' || a.status === 'confirmed') && a.at > now - 180).slice(-1))[0];
    if (ap) {
      const tm = parseTime(ap.text || '', ap.made != null ? ap.made : now);
      const pl = PLACERX.exec(ap.text || '');
      return { at: ap.at, when: (tm.whenFull && tm.at != null ? tm.whenFull : hm12(ap.at)), where: pl ? (pl[1] || pl[2] || pl[3]).toLowerCase() : '', time: hm12(ap.at), text: ap.text };
    }
    const th = (ctx.thread || []).slice().reverse();
    for (const m of th) {
      if (mine(m)) continue; // a plan is only a plan once THEY agreed to it
      const tm = parseTime(m.text, m.t != null ? m.t : now);
      if (tm.at != null || (tm.when && /\b(meet|dinner|lunch|coffee|see you|drinks|movie|hang)\b/i.test(m.text))) {
        const pl = PLACERX.exec(m.text || '');
        const wh = pl ? (pl[1] || pl[2] || pl[3]).toLowerCase() : '';
        return { at: tm.at, when: tm.whenFull, where: mine(m) ? swapPerson(wh) : wh, time: tm.time, text: m.text, fromThread: true };
      }
    }
    return null;
  };

  // is the character unavailable at this game minute? (asleep, another appointment, or simply busy)
  function busyAt(npc, at, S) {
    const p = G.Persona.ensure(npc);
    if (G.Persona.awake(npc, hourOf(at)) < 0.5) return 'asleep';
    if ((S.appts || []).some((a) => a.npc === npc.id && (a.status === 'pending' || a.status === 'confirmed') && Math.abs(a.at - at) < 60)) return 'booked';
    const h = G.U.hash(`${npc.id}|${Math.floor(at / 60)}`) % 100;
    const chance = 8 + (p.t.C > 60 ? 6 : 0);
    return h < chance ? 'busy' : '';
  }
  function altTime(npc, at, S) {
    for (const dh of [1, 2, -1, 3, -2, 4, 5, -3, 6, 7, 8, 9, 10]) {
      const cand = at + dh * 60;
      if (!busyAt(npc, cand, S) && hourOf(cand) >= 8 && hourOf(cand) <= 22) return cand;
    }
    return null;
  }

  /* ================= phrase banks =================
     BANK[act][style] = lines. Tokens: {n} their first name, {when} "tomorrow at 7pm", {time} "7pm", {where} a place, {alt} another time,
     {fact} something they told this person, {mood}, {doing}, {topic}. A line is only used when every token in it can be filled. */
  const STYLES = ['shy', 'bubbly', 'formal', 'blunt', 'cold', 'snarky', 'flirty'];
  const BANK = {};
  const def = (act, shy, bubbly, formal, blunt, cold, snarky, flirty) => { BANK[act] = { shy, bubbly, formal, blunt, cold, snarky, flirty }; };

  def('greeting',
    ['hi {n}...', 'oh, hey. hi', 'hey, you. how are you?'],
    ['heyyy {n}!', 'hi hi! how are you?', 'hello you! what is new?'],
    ['Good to hear from you, {n}.', 'Hello {n}. I hope your day is going well.', 'Hello. How have you been?'],
    ["hey. what's up?", 'yo. what do you need?', 'hey {n}. say it'],
    ['hi.', 'hello.', 'oh. hey.'],
    ['look who texts', 'oh, hello stranger', 'well, well. hi'],
    ["hey you. i was hoping you'd text", 'well hello, {n}', 'hi trouble']);
  def('howru',
    ["i'm {mood} today, i think. you?", "{mood}, mostly. how about you?", "i'm {mood}. thanks for asking", "a little {mood}, but okay. how are you?"],
    ["i'm {mood}!! how are you??", "{mood} today! what about you?", "honestly {mood}, tell me about you!", "pretty {mood} right now! how about you?"],
    ['I am {mood}, thank you for asking. And you?', 'Doing {mood}, thank you. How are you?', 'I am {mood} today. How about yourself?', 'Quite {mood}, thank you. How have you been?'],
    ["{mood}. you?", "i'm {mood}. what's going on with you?", "{mood}, can't complain. you?", "doing {mood}. what about you?"],
    ['{mood}.', 'fine. {mood}.', '{mood}. why?', 'i am {mood}.'] ,
    ["{mood}, since you ask. shocking, i know", "i'm {mood}. are we doing small talk now?", "{mood}. and you? try to be interesting", "doing {mood}. you still need something?"],
    ["{mood} now that you're here", "i'm {mood}, and better with you texting", "{mood}. you?", "actually {mood}. what about you?"]);
  def('status',
    ['not much... probably {doing}. you?', "just {doing}, i think. what about you?", "{doing}, mostly. nothing exciting"],
    ["{doing}!! what about you?", "ooh just {doing}, wanna do something??", "{doing}, honestly. you??"],
    ['I expect to be {doing}. And you?', 'Nothing fixed yet; likely {doing}. What are your plans?', 'Mostly {doing}. Why do you ask?'],
    ["{doing}. why, what's up?", "nothing big. {doing}. you?", "{doing}. got something in mind?"],
    ['{doing}.', 'nothing much. {doing}.', "{doing}. why?"],
    ["{doing}. riveting, i know", "living the dream: {doing}", "{doing}, obviously. what, are you inviting me?"],
    ["{doing}, unless you have a better idea", "{doing}... or something with you?", "{doing}. why, are you asking me out?"]);
  def('yn_yes',
    ['yeah, i think so', 'i think so, yes', 'yes... i think'],
    ['yes!! totally', 'yeah for sure!', 'omg yes'],
    ['Yes, I believe so.', 'Yes, that is right.', 'I would say so, yes.'],
    ['yes.', 'yeah, obviously', 'yep. next question'],
    ['yes.', 'sure.', 'yeah.'],
    ['yes, shockingly', 'yeah, what gave it away', 'sure, why not'],
    ['for you? yes', 'yes. you know me', 'yeah, babe, yes']);
  def('yn_no',
    ["no... not really", "i don't think so, sorry", "hm, no"],
    ['nope!', 'ahh no, sorry!', 'not really, no!'],
    ['No, I do not think so.', 'I am afraid not.', 'No, I would not say so.'],
    ['no.', 'nope. not at all', "no. don't think so"],
    ['no.', 'nope.', 'no. why would it be'],
    ['no, but nice try', 'absolutely not', 'no. were you expecting a yes'],
    ["no, sorry. don't pout", "hmm, no. sorry", "nope, but ask me again"]);
  def('yn_maybe',
    ["i'm not sure... maybe?", "i don't know, honestly", 'maybe. i have to think'],
    ['hmm maybe?? i am not sure!', 'ooh good question, maybe!', 'idk!! maybe?'],
    ['I am not certain. Perhaps.', 'It depends, I think.', 'I would need to think about that.'],
    ['depends.', "not sure. maybe", "can't say. probably"],
    ['maybe.', 'unsure.', 'depends.'],
    ['define "sure"', 'maybe. maybe not. who knows', 'ask me when i care'],
    ["maybe. convince me", "hmm, depends what's in it for me", "not sure yet, tell me more"]);
  def('wh',
    ["hm, i'm not sure how to say it. what do you think?", "that's a hard one... what do you think?", "i'd have to think. you first?"],
    ['ooh good question!! what do you think?', 'hmm honestly no idea!! you?', 'wait, tell me what you think first!'],
    ['That is a good question. What is your own view?', 'I would have to consider that carefully. What do you think?', 'Hard to say. Tell me more about what you mean.'],
    ["no idea. what do you think?", "depends on what you mean. spell it out", "honest answer: not sure. you?"],
    ['no idea.', "why do you ask", 'figure it out.'],
    ["that's the question, isn't it", "wow, deep. no idea", "ask someone who cares. kidding. kind of"],
    ["mm, tell me what you think first", "good question. what do you think?", "you ask the best questions"]);
  def('recall_found',
    ["i remember. you told me {fact}", "of course. you told me {fact}", "i do... {fact}, right?"],
    ["yes of course!! you told me {fact}", "i remember!! {fact}, right??", "obviously i remember, {fact}!"],
    ['I do remember. You told me {fact}.', 'Yes. You mentioned {fact}.', 'I recall it well: {fact}.'],
    ["yeah. {fact}. i remember", "you told me {fact}. i don't forget that stuff", "{fact}. yes. what about it"],
    ['yes. {fact}.', 'you said {fact}.', '{fact}. i remember.'],
    ["yes, i remember: {fact}. i do listen sometimes", "{fact}. see, i pay attention", "{fact}. happy now?"],
    ["i remember everything you tell me. {fact}", "{fact}, right? i listen to you", "of course. {fact}"]);
  def('recall_none',
    ["i'm sorry, i don't remember. can you tell me again?", "oh no, i think i forgot. what was it?", "i'm sorry... it's slipped my mind"],
    ["ahh i'm so sorry, i blanked!! tell me again?", "noo i forgot!! remind me?", "my brain!! what did you tell me?"],
    ['I am sorry, I do not recall that. Could you remind me?', 'Forgive me, it has slipped my mind. Would you remind me?', 'I am afraid I do not remember. Please tell me again.'],
    ["no, i don't remember. tell me again", "honestly? i forgot. what was it", "nothing comes to mind. remind me"],
    ["no.", "don't remember.", 'not really. what was it'],
    ["apparently not. remind me?", "i would love to say yes. i would be lying", "my memory is not a diary. remind me"],
    ["i'm sorry, i don't remember. tell me again?", "ugh, i forgot. say it again?", "don't be mad, remind me?"]);
  def('plan_found',
    ["we said {when}, i think", "{when}, i think? i hope that still works", "we said {when}"],
    ["we said {when}!! can't wait", "{when}!! see you there", "it's {when}, don't forget!"],
    ['We agreed on {when}.', 'I believe we said {when}.', 'Our arrangement was {when}.'],
    ["{when}. that's what we said", "{when}. don't be late", "we said {when}"],
    ['{when}.', 'we said {when}.', '{when}. as agreed.'],
    ["{when}. i wrote it down for you", "{when}. try to remember this time", "{when}, genius"],
    ["{when}. i'll be there", "{when}, it's a date", "we said {when}. can't wait"]);
  def('plan_place',
    ["{when}, at {where}, i think", "we said {when}, at {where}", "{where}, {when}, i think"],
    ["{when} at {where}!!", "{where} at {when}, see you!!", "it's {when} at {where}!"],
    ['We agreed on {when}, at {where}.', 'I believe we said {when} at {where}.', 'It was {when}, at {where}.'],
    ["{when}, {where}.", "{where}, {when}. don't be late", "we said {when} at {where}"],
    ['{when}, {where}.', '{where}. {when}.', 'we said {where}, {when}.'],
    ["{when} at {where}. wrote it down for you", "{where}, {when}. try to remember", "{when} at {where}, genius"],
    ["{when} at {where}. it's a date", "{where}, {when}. can't wait", "{when}, {where}. don't forget"]);
  def('plan_none',
    ["i don't think we picked a time yet... when works for you?", "we haven't really decided, have we? what works for you?", "hmm, we didn't set one. what suits you?"],
    ["we didn't pick one yet!! when works for you??", "ooh we haven't decided! what time?", "nothing set yet! you pick!"],
    ['I do not believe we have agreed on a time. What suits you?', 'We have not settled on one yet. When would be convenient?', 'No time has been set. What would you propose?'],
    ["we didn't set one. pick a time", "nothing set. when works?", "we never decided. you pick"],
    ['we did not set one.', "nothing's set.", 'no plan yet.'],
    ["we didn't. that's the problem. pick a time", "there is no plan. shocking", "we never decided. your move"],
    ["we haven't picked one yet. when are you free for me?", "nothing set. what works for you?", "no time yet. you choose"]);
  def('clocktime',
    ["it's about {time}, i think", '{time}, i think...', 'um, around {time}'],
    ["it's {time}!!", '{time} right now!', "ooh it's {time}!"],
    ['It is {time}.', 'The time is {time}.', 'It is currently {time}.'],
    ['{time}.', "it's {time}", '{time}. check your phone'],
    ['{time}.', 'it is {time}.', '{time}. look at a clock.'],
    ['{time}. there are clocks, you know', "it's {time}. you're welcome", '{time}, your phone knows too'],
    ['{time}. time flies with you', "it's {time}, why, got plans?", '{time}... why do you ask?']);
  def('advice',
    ["i'm not sure i'm the best person to ask... but i'd go with what feels right", "hmm, maybe sleep on it? i'd trust your gut", "i think... go with what scares you least?"],
    ["ooh okay! i say go for it, but what does your gut say??", "honestly? trust yourself, you know what you want!", "i'd do it!! what's the worst that happens?"],
    ['I would weigh the consequences carefully, then follow your principles.', 'My advice would be to take a little time and decide calmly.', 'I would list the pros and cons, and then choose what you can stand behind.'],
    ["do what you can live with. that's it", "my honest take: stop overthinking, decide", "pick the option you'd regret less. done"],
    ["do what you want.", 'your call.', "i'd decide and move on."],
    ["oh sure, ask me. i'd go with whichever is less dramatic", "my advice? don't ask me. but fine: trust your gut", "do the thing you'll complain about less"],
    ["if you want my opinion: go for it. what does your heart say?", "i'd trust you. what are you leaning towards?", "do it. i'm on your side"]);
  def('accept',
    ["yeah, i'd like that... {when} works for me", "okay, {when} works. see you at {where}", "i'd love to. {when} sounds good"],
    ["yes!! {when} works, see you at {where}!!", "omg yes, {when} it is!", "{when}!! count me in"],
    ['{when} suits me well. I will see you at {where}.', 'That sounds lovely. {when} works for me.', 'Certainly. {when} is fine; I will see you then.'],
    ["{when} works for me. see you at {where}", "ok, {when}. see you there", "fine by me. {when}"],
    ['fine. {when}.', 'ok. {when}. see you.', "{when}. don't be late."],
    ["{when}? fine, i'll allow it. see you at {where}", "okay, {when}. try to be on time for once", "sure, {when} works. you're buying"],
    ["{when} works for me. see you at {where}", "for you? {when}. see you then", "it's a date, then. {when}"]);
  def('accept_where',
    ["yes, i'd like that. {where} sounds good, when?", "okay, {where} works for me. what time?", "i'd love to. {where}... when?"],
    ["yes!! {where} sounds great, when??", "omg yes, {where}! what time?", "{where}!! count me in, when?"],
    ['That sounds lovely. {where} is fine. What time suits you?', 'Certainly, {where} will do. When would you like to meet?', 'I would be glad to. {where} works. At what time?'],
    ["fine. {where}. when?", "ok, {where}. what time", "{where} works. pick a time"],
    ["fine. {where}. when.", "ok. {where}. what time.", "{where}. when?"],
    ["{where}? fine. when?", "sure, {where}. you're buying. when?", "okay {where}. name a time"],
    ["{where} with you? yes. when?", "for you? {where}. what time?", "okay, {where}. when are you free for me?"]);
  def('accept_open',
    ["yeah, i'd like that... when and where?", "i'd love to. when works for you?", "okay, yes. just tell me when"],
    ["yes!! when and where??", "omg yes please, when?", "i'm in!! tell me when!"],
    ['I would be glad to. When and where would suit you?', 'That sounds lovely. What time did you have in mind?', 'Certainly. Please let me know when and where.'],
    ["sure. when and where?", "ok. pick a time and place", "fine. when?"],
    ["fine. when.", 'ok. when and where.', "alright. details?"],
    ["fine, i'll allow it. when and where?", "sure. name a time and try not to flake", "okay. where, when, and who's paying"],
    ["for you? always. when and where?", "yes. just tell me when", "i'm in. you pick the place"]);
  def('counter',
    ["can we do {alt} instead? i'm not free then", "i'm busy at that time... would {alt} work?", "{alt} would be better for me, if that's okay"],
    ["ahh i can't then!! can we do {alt}??", "so sorry, busy then! {alt} instead?", "how about {alt}? i'm stuck before that!"],
    ['I am afraid I am unavailable then. Would {alt} suit you instead?', 'That time is difficult for me. Could we make it {alt}?', 'Unfortunately I cannot at that hour. How about {alt}?'],
    ["can't do that time. {alt}?", "no, that's bad for me. {alt} works", "not then. {alt} instead"],
    ["can't. {alt} maybe.", 'not then. {alt}.', "no. {alt}, if at all."],
    ["that time? no. {alt} works if you can manage", "i'm busy being asleep then. {alt}?", "{alt} or nothing"],
    ["i can't then... {alt} instead? i'd really like to", "so close! {alt} works for me", "how about {alt}? for you i'll make room"]);
  def('suggest',
    ["maybe {alt}? if that works for you", "i'm free around {alt}, if that's okay", "how about {alt}?"],
    ["ooh how about {alt}??", "{alt} works for me!! you?", "{alt}!! does that work?"],
    ['Would {alt} suit you? That works for me.', 'I am free around {alt}. Would that do?', 'May I suggest {alt}?'],
    ["{alt}. works?", "i'm free at {alt}", "{alt}. take it or leave it"],
    ['{alt}.', "{alt} maybe.", "i'm free at {alt}."],
    ["{alt}, if you can manage being on time", "{alt}. i'll pencil you in", "how about {alt}? try not to flake"],
    ["{alt}? i'll clear my schedule for you", "how about {alt}? it's yours", "{alt}. i'll save it for you"]);
  def('decline',
    ["i'm sorry... i can't. maybe another time?", "oh, i don't think i can. sorry", "thank you for asking, but i'd better not"],
    ["ahh i can't!! so sorry, another time?", "noo i can't, sorry!! next time?", "aw thanks for asking but i can't!"],
    ['Thank you for asking, but I am afraid I must decline.', 'I appreciate the invitation, but I am unable to join.', 'That is kind of you, but I will have to pass this time.'],
    ["can't. not this time", "no, i'll pass", "not for me. maybe another time"],
    ['no.', 'pass.', 'not this time.'],
    ["pass. have fun without me", "i'd rather watch paint dry, but thanks", "no. but the invite is cute"],
    ["i can't this time. but ask me again", "not this time, sorry. rain check?", "no, sorry. don't take it personally"]);
  def('ack_yes',
    ["okay... great, see you {when}", "great. {when}, then", "good. see you {when}, i'm looking forward to it"],
    ["yay!! see you {when}!!", "perfect, {when}!! can't wait", "see you {when}!!"],
    ['Wonderful. I will see you {when}.', 'Excellent. {when} it is.', 'Splendid. Until {when}.'],
    ["good. see you {when}", "ok, {when}. be on time", "done. {when}"],
    ['fine. {when}.', "ok. {when}.", "see you {when}."],
    ["good. {when}. don't flake on me", "fine. {when}. i'll bring my patience", "see you {when}. try to show up"],
    ["see you {when}. i'll be thinking about it", "{when}, then. it's a date", "great. {when}. can't wait"]);
  def('ack_yes_open',
    ["okay... great, i'm glad", "great. thank you", "good. i'm looking forward to it"],
    ["yay!! can't wait!!", "perfect!! so excited", "yesss!!"],
    ['Wonderful. I look forward to it.', 'Excellent. Thank you.', 'Splendid.'],
    ["good.", "ok. good", "done."],
    ['fine.', "ok.", 'good.'],
    ["good. don't flake on me", "fine. i'll bring my patience", "great. try to show up"],
    ["great. i'll be thinking about it", "it's a date, then", "good. can't wait"]);
  def('ack_no',
    ["oh... okay, that's fine. another time?", "okay, no worries. maybe next time", "that's alright, I understand"],
    ["aww okay, next time then!", "no worries!! another time!", "okay!! rain check?"],
    ['I understand. Perhaps another time.', 'That is quite all right. Another occasion, then.', 'Of course. Let us arrange something later.'],
    ["ok. fine. another time", "alright. your loss", "ok. later then"],
    ['ok.', 'fine.', 'noted.'],
    ["ouch. okay. my feelings will survive", "fine, i'll find someone more fun", "noted. i'm fine. really"],
    ["aw, okay. you owe me one", "fine, but you're making it up to me", "okay. another time, then"]);
  def('compliment',
    ["oh... thank you, that's really kind", "you're making me blush... thank you", "that's so sweet. thank you"],
    ["aww stop it, you're the sweetest!!", "omg thank you!! you made my day", "stoppp, you're too kind!!"],
    ['That is very kind of you. Thank you.', 'Thank you, I appreciate that.', 'You are generous. Thank you.'],
    ["thanks. appreciate it", "ok, that's nice. thanks", "thanks. you too, i guess"],
    ['thanks.', 'ok. thanks.', 'noted. thanks.'],
    ["flattery will get you everywhere. slightly", "i know, but thanks for saying it", "oh stop, you'll make me insufferable"],
    ["careful, i could get used to that", "keep talking, i like this", "you're sweet. say more"]);
  def('compliment_spam',
    ["um... thank you, but that's a lot of compliments", "you've said that a few times... it's making me shy", "thanks, really. maybe let's talk about something else?"],
    ["haha okay, thank you!! maybe let's talk about something else?", "aww ok, that's enough, i'm blushing!!", "you keep saying it!! thanks, but chill"],
    ['Thank you, but I think you have said that quite a few times now.', 'I appreciate it, though perhaps we might move on.', 'That is kind, but enough for now, truly.'],
    ["ok, you've said it. thanks. enough now", "thanks, i heard you the first time", "got it. can we talk about something else"],
    ['ok. enough.', 'you said that already.', 'thanks. stop.'],
    ["okay, i get it, i'm great. next topic", "you're going to run out of adjectives", "wow, again? ok"],
    ["mm, again? okay, but say something new", "you're laying it on thick", "sweet, but give me something new"]);
  def('insult_hurt',
    ["that really hurt... i thought we were better than that", "why would you say that? that hurt", "oh. okay. that hurts, {n}"],
    ["wow. that really hurt my feelings", "why are you being so mean?? that hurt", "ouch. i thought we were friends"],
    ['That was unkind, and it hurt. I expected better from you.', 'I find that hurtful. Please do not speak to me that way.', 'I am disappointed by those words.'],
    ["that was uncalled for. it hurt", "wow. that was low", "that was out of line, {n}"],
    ['wow.', 'noted.', "that's hurtful. whatever."],
    ["wow. that's the best you've got? it still stung", "ouch. okay. that was unnecessary", "harsh. even for you"],
    ["ouch. that stung. what did i do?", "that hurt, you know. are we okay?", "mean. i didn't deserve that"]);
  def('insult_firm',
    ["i don't want to be spoken to like that. please stop", "that's not okay. i'm going to step away", "please don't talk to me like that"],
    ["not cool. i'm not okay with that, please stop", "nope. i'm not doing this, don't talk to me like that", "that's really not okay. cool off"],
    ['I will not be spoken to in that manner. Please stop.', 'That language is unacceptable. This conversation is over until you reconsider.', 'I do not accept that. Please keep it civil.'],
    ["say that again and we're done. stop", "that's not ok. knock it off", "watch it. i won't take that"],
    ['bye.', "we're done here.", 'do not text me like that.'],
    ["wow, bold. try that again with a brain", "oh, an insult. how original. bye", "that's all you've got? pathetic"],
    ["don't talk to me like that. not cool", "that was uncalled for. think before you text", "no. not like that. cool off first"]);
  def('apology_accept',
    ["thank you for saying that... it's okay. we're good", "it's okay, really. thank you for apologising", "thanks for saying sorry. i forgive you"],
    ["aww it's okay!! thank you for saying that, we're good", "thank you!! all forgiven, come here", "it's okay!! i forgive you"],
    ['Thank you for apologising. I accept, and we can move on.', 'I appreciate that. All is forgiven.', 'Apology accepted. Thank you.'],
    ["ok. thanks for saying that. we're good", "alright. appreciated. moving on", "fine. it's forgotten"],
    ["fine. forgiven.", "ok. thanks.", "it's done."],
    ["fine, i forgive you. try not to make it a habit", "apology accepted. grudgingly", "okay. don't do it again"],
    ["you're forgiven... but you owe me", "okay, come here. i forgive you", "thank you. i couldn't stay mad at you"]);
  def('apology_wary',
    ["thank you for saying that... but i need some time", "i hear you, i'm just still hurting", "it's hard to forget so fast. give me time"],
    ["i appreciate it, but i'm still upset. give me time", "thanks for saying sorry, but it still hurts", "okay... i need a bit before i'm fine"],
    ['I appreciate the apology, but I need time before I can move past this.', 'Thank you. I am still upset and need some distance.', 'I hear you. It will take me a while.'],
    ["sorry doesn't fix it right away. give me time", "ok. i heard you. still mad", "noted. not fixed yet"],
    ['too little too late.', "we'll see.", 'sorry does not fix it.'],
    ["a sorry. wow. a start, i guess", "okay, noted. earn the rest", "sorry's cheap. show me"],
    ["i want to forgive you... give me a minute", "thank you. i'm still hurt though", "not yet. but thank you"]);
  def('apology_nothing',
    ["oh, it's okay, really. no need", "no, it's fine, don't worry about it", "that's okay. thank you though"],
    ["aww no need, it's all good!!", "it's totally fine!! don't worry", "stop, it's okay!"],
    ['There is no need to apologise, truly.', 'It is quite all right. No harm done.', 'Please do not worry about it.'],
    ["it's fine. forget it", "no worries", "all good"],
    ["fine.", "ok.", 'noted.'],
    ["sorry for what? but fine, accepted", "i wasn't even upset. accepted anyway", "apology received. for something"],
    ["it's okay. you're cute when you're sorry", "no need to be sorry. come here", "it's alright, stop worrying"]);
  def('thanks',
    ["of course... anytime", "you're welcome, really", "no problem. i'm glad to help"],
    ["anytime!! always happy to help", "of course!! you're so welcome", "aww you're welcome!!"],
    ['You are most welcome.', 'It was my pleasure.', 'Not at all. Glad to help.'],
    ["np.", "sure. anytime", "yeah, no problem"],
    ['sure.', 'fine.', 'ok.'],
    ["you're welcome. i'll send the bill", "finally some gratitude", "anytime. no really, anytime"],
    ["anything for you", "you're welcome. you can repay me later", "of course. for you, always"]);
  def('news',
    ["wait, really? that's wonderful, {n}. i'm so happy for you", "oh {n}, congratulations. you deserve it", "that's amazing... i'm really happy for you"],
    ["WAIT. congratulations!! i'm so happy for you!!", "omg {n}!! that's amazing, tell me everything!", "yay!! congrats, you deserve it!!"],
    ['Congratulations, {n}. That is wonderful news.', 'That is excellent news. Well done.', 'I am delighted for you. Congratulations.'],
    ["nice. congrats, {n}. you earned it", "good for you. proud of you", "congrats. that's big"],
    ['congrats.', 'good for you.', 'nice. congratulations.'],
    ["well, look at you. congrats", "okay, impressive. congratulations", "fine, i'm happy for you. ugh. congrats"],
    ["look at you! congratulations, i knew it", "congrats! i'm so proud of you", "you did it. celebrate with me?"]);
  def('care',
    ["oh no, {n}. i'm so sorry. i'm here if you want to talk", "that sounds really hard... i'm here, okay?", "i'm so sorry. let me know if you need anything, even just company"],
    ["oh no {n}, i'm so sorry! i'm here for whatever you need", "sending you the biggest hug. i'm here, call me anytime", "that sounds so hard. i'm here, tell me everything"],
    ['I am so sorry to hear that, {n}. Please let me know if you need anything.', 'That sounds very difficult. I am thinking of you, and I am here if you want to talk.', 'I am sorry you are going through this. Do call me if I can help.'],
    ["that's rough. i'm sorry. call me if you need anything", "damn, i'm sorry. what do you need from me?", "that sounds awful. i'm here, say the word"],
    ['that sounds rough. let me know if you need anything.', 'sorry to hear that. take care.', "i'm sorry. hope things get better. take care of yourself"],
    ["ugh, i'm sorry. that's genuinely awful. i'm here if you want to talk", "okay, no jokes. i'm so sorry. i'm here", "that sounds really rough. i'm here, let me know what you need"],
    ["come here, sending you a big hug. i'm here for you", "oh {n}, i'm so sorry. i'm here, whatever you need", "that sounds so hard. i'm here for you, call me anytime"]);
  def('joke',
    ['haha... that was funny', 'ha, okay, that got me', 'hehe, you caught me off guard'],
    ['hahaha stop!! you got me', 'LOL okay that was good', 'omg hahaha you are too funny'],
    ['Ha, that was rather amusing.', 'That made me smile, I admit.', 'Very good. You have a sense of humour.'],
    ['ha. ok, that was funny', 'lol. fine, you got me', 'ha. not bad'],
    ['ha.', 'cute.', 'funny, i guess.'],
    ['ha. i laughed, but quietly', 'wow, a joke. growth', 'okay, that was almost funny'],
    ['haha, you really are trouble', 'ha! keep them coming', 'okay that was cute']);
  def('topic_change',
    ["sure... what's on your mind?", "okay, what did you want to talk about?", "of course. go ahead"],
    ["sure!! what's up?", "ooh okay, tell me!", "go on, I'm listening!!"],
    ['Certainly. What would you like to discuss?', 'Of course. Please go ahead.', 'By all means. What is on your mind?'],
    ["ok. what is it?", "fine. go ahead", "shoot"],
    ['ok. what.', 'go on.', 'fine.'],
    ["subtle. go on", "wow, smooth pivot. go ahead", "sure, change the subject, see if i mind"],
    ["okay, i'm listening. what is it?", "go on, i'm all yours", "sure, what's on your mind?"]);
  def('smalltalk',
    ["hm, yeah... tell me more?", "i see. what made you think of that?", "oh, interesting. go on"],
    ["ooh tell me more!!", "wait really? go on!!", "haha okay and then what??"],
    ['I see. Please tell me more.', 'That is interesting. What prompted it?', 'Understood. Do go on.'],
    ["ok. and?", "yeah. so what's your point?", "huh. go on"],
    ['ok.', 'and?', 'i see.'],
    ["fascinating. truly. go on", "wow. tell me more, i'm riveted", "mm-hm. and then?"],
    ["mm, tell me more", "i like hearing you talk. go on", "keep going, i'm listening"]);
  def('share_fact',
    ["oh, i didn't know that about you... thank you for telling me", "okay, i'll remember that", "that's nice to know about you"],
    ["ooh i love knowing that about you!!", "noted!! i'm going to remember that", "aww, tell me more about that!"],
    ['Thank you for telling me. I will keep that in mind.', 'Good to know. I appreciate you sharing it.', 'I see. That is useful to know about you.'],
    ["ok. good to know", "noted. i'll remember", "right. got it"],
    ['noted.', 'ok.', 'i see.'],
    ["noted. i'll file it under 'things you mentioned'", "good to know. i guess", "wow, a fact. i'll remember it"],
    ["i like learning things about you", "noted. i'll remember that", "mm, tell me more about you"]);
  def('interest',
    ["oh, i like {topic} too... what about it?", "{topic}? i really like that, actually", "that's one of my favourite things, {topic}"],
    ["ooh {topic}!! i love that, tell me everything!", "wait {topic}?? yes, go on!", "{topic} is my thing!! what about it?"],
    ['I am quite fond of {topic}, as it happens. What about it?', 'Ah, {topic}. I take an interest in that. Please continue.', 'I enjoy {topic}. What would you like to discuss?'],
    ["{topic}. ok, i know about that. what's up with it?", "{topic}? now we're talking", "i'm into {topic}. go on"],
    ['{topic}. ok.', "i know {topic}. so?", 'fine. {topic}.'],
    ["{topic}? finally, a topic", "ah, {topic}. my one weakness", "oh, {topic}. you have my attention"],
    ["{topic}? you know my weakness. tell me more", "mm, {topic}. you remembered", "{topic}... go on, you have my attention"]);
  def('farewell',
    ['okay... bye, {n}. talk soon', 'bye. sleep well', 'see you. take care'],
    ['byeee!! talk soon', 'bye {n}!! sleep well', 'later!! text me tomorrow!'],
    ['Goodbye, {n}. Take care.', 'Goodnight. Speak soon.', 'Until next time.'],
    ['bye.', 'later.', 'ok. bye {n}'],
    ['bye.', 'k.', 'later.'],
    ['finally some peace. kidding. bye', 'bye. try to miss me', 'later, {n}'],
    ['bye... already missing you', 'goodnight, {n}. dream of me', 'talk soon. i mean it']);
  def('one_word',
    ['mm.', 'okay...', 'right'],
    ['hehe okay!!', 'okayyy', 'mhm!'],
    ['Quite so.', 'I see.', 'Very well.'],
    ['ok.', 'yep.', 'right.'],
    ['hm.', 'k.', 'ok.'],
    ['riveting', 'wow. so chatty', 'okay then'],
    ['mm?', 'hey, say more', 'cat got your tongue?']);
  def('repeat',
    ["you've already said that... is everything okay?", "um, you sent that already", "i got that the first time, I think"],
    ["haha you already said that!!", "wait, you just sent that!", "you're repeating yourself!! everything okay?"],
    ['You have already said that. Is there something else on your mind?', 'I believe you mentioned that a moment ago.', 'You have repeated yourself. Is anything the matter?'],
    ["you already said that.", "i read it the first time. stop repeating", "same message again. what do you want?"],
    ['you already said that.', 'stop repeating yourself.', 'i saw it.'],
    ["did the first one not satisfy you? same message again", "wow, a rerun", "i read it. the first time. and the second"],
    ["you already told me that, silly", "sending it again won't change my answer", "mm, same message. what are you after?"]);
  def('repeat_more',
    ["please stop sending the same thing... it's making me uncomfortable", "I'd rather you stopped repeating yourself", "that's the third time. please stop"],
    ["okay now it's a lot!! please stop sending the same thing", "this is getting annoying, please stop", "you've sent it three times, enough!!"],
    ['I must ask you to stop repeating yourself.', 'This is the third time; please desist.', 'Kindly stop sending the same message.'],
    ["stop spamming me.", "third time. knock it off", "enough. stop repeating it"],
    ['stop.', 'spam.', 'enough.'],
    ["a fourth rerun? no", "stop. just stop", "i'm muting this soon"],
    ["okay, stop now, that's enough", "babe, enough. stop repeating", "stop sending it. i got it"]);
  def('want_talk',
    ["of course... what's going on?", "yes, i'm here. what's wrong?", "sure, i'm listening"],
    ["of course!! what's up??", "yes, tell me everything!", "i'm here!! what's going on?"],
    ['Of course. I am listening.', 'Certainly. What is on your mind?', 'Yes, please. Go ahead.'],
    ["sure. what's going on?", "yeah. say it", "ok. talk to me"],
    ['ok. what.', 'fine. go on.', 'what is it.'],
    ["oh no. 'we need to talk'. go on", "sure. brace me", "fine, i'm listening. shock me"],
    ["of course. i'm all yours. what's up?", "sure, come here. tell me", "yes. i'm listening"]);
  def('woke',
    ["sorry, just woke up. ", "sorry for the late reply, i was asleep. ", "just saw this, sorry. "],
    ["sorry, just woke up!! ", "ahh was asleep!! ", "good morning!! just saw this. "],
    ['Apologies, I was asleep. ', 'Sorry for the delay; I only just woke. ', 'Good morning. '],
    ['was asleep. ', 'just woke up. ', 'morning. '],
    ['was asleep. ', 'just woke. ', 'late reply. '],
    ['i was sleeping, you know. ', 'some of us sleep. ', 'just woke up. '],
    ['just woke up, and you were my first thought. ', 'sorry, was asleep. ', 'good morning, you. ']);
  const ASK = {
    shy: ['and you?', 'how about you?'], bubbly: ['what about you??', 'and you, tell me!!'], formal: ['And yourself?', 'How are you?'],
    blunt: ['you?', 'and you?'], cold: ['and you?', 'you?'], snarky: ['and you?', 'your turn?'], flirty: ['what about you?', 'and you, trouble?'],
  };
  const OPEN = {
    shy: ['um, ', 'well... ', 'sorry, '], bubbly: ['okay so ', 'ooh ', 'wait, '], formal: ['Well, ', 'Indeed, ', 'Quite, '],
    blunt: ['look, ', 'honestly, ', 'okay, '], cold: ['well. ', 'right. ', 'hm. '], snarky: ['sure, ', 'oh, ', 'well, '], flirty: ['mm, ', 'well, ', 'hey, '],
  };
  D.BANK = BANK;
  D.STYLES = STYLES;

  /* ---------- realiser ---------- */
  const tokensOf = (tpl) => (tpl.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1));
  const fillTpl = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : ''));
  const tidy = (s) => s.replace(/\s+([,!?.])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*([!?.])/g, '$1').trim();

  // last ~20 things THIS character said to the player (thread + saved DMs), as token sets, to never repeat themselves
  function recentOwn(npc, S, thread) {
    const out = [];
    const seen = new Set();
    const push = (m) => { if (m && m.from === npc.id && m.text && !seen.has(m.text)) { seen.add(m.text); out.push(toks(m.text)); } };
    ((S && S.dms && S.dms[npc.id]) || []).slice(-30).forEach(push);
    (thread || []).forEach(push);
    return out.slice(-20);
  }
  function used(npc, own, base) {
    if (G.Persona.dupText(npc, 'dlg:' + base)) return true;
    const t = toks(base);
    return t.size > 0 && own.some((o) => jac(o, t) >= 0.75);
  }

  function realise(npc, act, style, vars, o) {
    const rnd = o.rnd;
    const bank = (BANK[act] || BANK.smalltalk)[style] || BANK.smalltalk.shy;
    const ok = (tpl) => tokensOf(tpl).every((k) => vars[k] != null && vars[k] !== '');
    let pool = bank.filter(ok);
    if (!pool.length) pool = (BANK.smalltalk[style] || BANK.smalltalk.shy).filter(ok);
    const E = G.Persona.ensure(npc).t.E;
    // verbosity from extraversion: chatty people pick the longer line, reserved people the shorter one
    const order = pool.map((x) => [x, rnd()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    const sorted = order.slice().sort((a, b) => a.length - b.length);
    const cand = [];
    const prefer = E >= 62 ? sorted.slice().reverse() : E <= 38 ? sorted : order;
    prefer.forEach((x) => cand.push(x));
    let base = null;
    for (const tpl of cand) {
      const t = tidy(fillTpl(tpl, vars));
      if (!used(o.npc, o.own, t)) { base = t; break; }
    }
    if (base === null) { // every variant was used lately: combine an opener with a variant until one is new
      const op = OPEN[style];
      outer: for (const pre of op) {
        for (const tpl of cand) {
          const body = tidy(fillTpl(tpl, vars));
          const t = tidy(pre + (/^[A-Z][a-z]/.test(body) && !/^I\b/.test(body) ? body[0].toLowerCase() + body.slice(1) : body));
          if (!used(o.npc, o.own, t)) { base = t; break outer; }
        }
      }
      if (base === null) { // two openers in a row, then give up and repeat
        outer2: for (const p1 of op) for (const p2 of op) for (const tpl of cand) {
          const body = tidy(fillTpl(tpl, vars));
          const t = tidy(p1 + p2.toLowerCase() + (/^[A-Z][a-z]/.test(body) && !/^I\b/.test(body) ? body[0].toLowerCase() + body.slice(1) : body));
          if (p1 !== p2 && !used(o.npc, o.own, t)) { base = t; break outer2; }
        }
      }
      if (base === null) base = tidy(fillTpl(cand[0], vars));
    }
    // chatty extraverts hand the conversation back
    if (o.ask && E >= 62 && rnd() < 0.6 && !/\?\s*$/.test(base)) {
      const a = ASK[style];
      base = base.replace(/\s+$/, '');
      if (!/[.!?…]$/.test(base)) base += '.';
      base += ' ' + a[Math.floor(rnd() * a.length)];
    }
    return base;
  }

  function moodWord(npc, style) {
    const v = G.Persona.ensure(npc).mood.v;
    const w = v > 0.3 ? 'really good' : v > 0.0 ? 'good' : v > -0.25 ? 'okay' : 'a bit low';
    return style === 'formal' ? (v > 0.3 ? 'very well' : v > 0 ? 'well' : v > -0.25 ? 'fine' : 'somewhat low') : w;
  }
  const ACTIVITY = { food: 'cooking something', fitness: 'at the gym', music: 'listening to music', gaming: 'gaming', books: 'reading', art: 'working on something creative', nature: 'out for a walk', fashion: 'shopping', party: 'seeing friends', tech: 'tinkering with tech', pets: 'with my pet', movies: 'watching a movie', tv: 'watching a show', work: 'catching up on work', travel: 'planning a trip', beauty: 'a self-care day', memes: 'scrolling memes', money: 'sorting out money stuff', mental: 'taking it easy', love: 'a quiet one', friends: 'seeing friends', drama: 'keeping up with the gossip' };
  function doingNow(npc, now) {
    const p = G.Persona.ensure(npc);
    const h = hourOf(now);
    if (h < 8) return 'getting ready for the day';
    if (h >= 22) return 'winding down for bed';
    const it = (p.interests || []).find((k) => ACTIVITY[k]);
    return it ? ACTIVITY[it] : 'just taking it easy';
  }

  // emoji only on warm lines, and only from the ones this person uses that also fit a warm line (never a skull on "see you tomorrow")
  const WARM_EMOJI = ['\u{1F979}', '✨', '\u{1FAF6}', '\u{1F90D}', '\u{1F970}', '\u{1F60E}', '\u{1F4AF}', '\u{1F90C}', '\u{1F643}', '\u{1F60A}', '\u{1F44B}'];
  const FLIRT_EMOJI = ['\u{1F60F}', '\u{1F525}', '\u{1F970}', '\u{1F485}', '\u{1F440}', '\u{1F60E}', '✨'];
  function addEmoji(text, npc, style, rnd) {
    const p = G.Persona.ensure(npc);
    const lvl = p.style.emoji || 0;
    if (!lvl || style === 'cold' || style === 'formal' && lvl < 3) return text;
    const ok = (style === 'flirty' ? FLIRT_EMOJI : WARM_EMOJI);
    const bag = (p.quirks.emoji || []).filter((x) => ok.includes(x));
    if (!bag.length) return text;
    const k = lvl >= 3 ? 1 + (rnd() < 0.4 ? 1 : 0) : lvl === 2 ? (rnd() < 0.7 ? 1 : 0) : rnd() < 0.3 ? 1 : 0;
    let out = text;
    for (let i = 0; i < Math.min(k, bag.length); i++) out += ' ' + bag.splice(Math.floor(rnd() * bag.length), 1)[0];
    return out;
  }

  /* ================= plan ================= */
  const FOLLOW = ['question_plan', 'question_recall', 'advice_request'];

  D.plan = function (npc, text, ctx) {
    ctx = ctx || {};
    const S = ctx.S || G.S;
    const now = ctx.now != null ? ctx.now : S.clock;
    const rnd = ctx.rnd || Math.random;
    const p = G.Persona.ensure(npc);
    const rel = ctx.rel || G.React.relation(S, npc, 'me');
    const thread = (ctx.thread || recentThread(npc, S)).slice(-6);
    const style = D.styleOf(npc, rel);
    const t = p.t;
    const cl = D.classify(text, { thread, now, npc, S });
    const slots = cl.slots;
    const read = mind() ? mind().read(text) : { sens: 0, kinds: [], good: false };
    const sens = Math.max(read.sens || 0, cl.sens || 0);
    const playerName = firstName({ name: S.player && S.player.name });
    const hour = hourOf(now);
    const wasAsleep = G.Persona.awake(npc, hour) === 0;
    const lastNpc = thread.slice().reverse().find((m) => m.from === npc.id);
    const proposalOpen = !!lastNpc && ((RX.invite.test(norm(lastNpc.text)) && /\?|let'?s|how about/.test(lastNpc.text)) || (/\b(meet|dinner|lunch|coffee|drinks|hang|free|come|join|movie)\b/i.test(lastNpc.text) && /\?/.test(lastNpc.text)));
    const has = (a) => cl.acts.includes(a);
    const own = recentOwn(npc, S, thread);
    const sameRecent = (name) => thread.filter(mine).slice(-6).filter((m) => D.classify(m.text, { now, npc, S }).acts.includes(name)).length;
    const c = rel.c || 0, h = rel.h || 0, r = rel.r || 0;
    const grudge = (p.grudges && p.grudges.me) || 0;
    const A = t.A / 100, N = t.N / 100, E = t.E / 100;
    const e = { aff: 0, rom: 0, riv: 0, trust: 0, mood: 0, grudge: 0 };
    let act = 'smalltalk', bankKey = 'smalltalk', stance = 'answer', mem = null, appt = null, leave = false;
    let valence = 0.1;
    const vars = { n: playerName, mood: moodWord(npc, style), doing: doingNow(npc, now) };
    let emoji = true;
    let fixedText = null;
    let baseText = '';

    /* --- choose the act the character answers --- */
    const serious = sens >= 0.5;
    if (cl.repeat && !serious && cl.repeatCount >= 1) act = cl.repeatCount >= 2 ? 'repeat_more' : 'repeat';
    else if (has('apology') && !(has('insult') && !/\b(sorry|my bad)\b/.test(norm(text).slice(0, 14)))) act = 'apology';
    else if (has('insult')) act = 'insult';
    else if (serious) act = 'share_bad';
    else if (has('question_plan')) act = 'question_plan';
    else if (has('question_recall')) act = 'question_recall';
    else if (has('advice_request')) act = 'advice_request';
    else if (has('share_bad')) act = 'share_bad';
    else if (has('invite')) act = 'invite';
    else if (has('accept') && proposalOpen) act = 'ack_yes';
    else if (has('decline') && proposalOpen) act = 'ack_no';
    else if (has('want_talk')) act = 'want_talk';
    else if (has('share_news')) act = 'share_news';
    else if (has('compliment')) act = 'compliment';
    else if (has('thanks')) act = 'thanks';
    else if (has('farewell')) act = 'farewell';
    else if (has('question_howru')) act = 'question_howru';
    else if (has('question_status')) act = 'question_status';
    else if (has('joke') && !cl.question) act = 'joke';
    else if (has('topic_change')) act = 'topic_change';
    else if (has('question_yn') && !has('question_wh')) act = 'question_yn';
    else if (has('question_wh')) act = 'question_wh';
    else if (has('question_yn')) act = 'question_yn';
    else if (has('greeting')) act = 'greeting';
    else if (has('share_fact')) act = 'share_fact';
    else if (has('one_word') || has('accept') || has('decline')) act = 'one_word';

    /* --- act by act --- */
    if (act === 'repeat' || act === 'repeat_more') {
      bankKey = act; stance = 'annoyed'; valence = -0.2; emoji = false;
      e.aff = act === 'repeat_more' ? -1 : 0; e.mood = act === 'repeat_more' ? -0.05 : -0.02;
    } else if (act === 'greeting') {
      bankKey = 'greeting'; valence = 0.3;
    } else if (act === 'question_howru') {
      bankKey = 'howru'; valence = 0.3;
    } else if (act === 'question_status') {
      bankKey = 'status'; valence = 0.3;
    } else if (act === 'question_yn') {
      // a yes/no answer comes from the character, not a dice roll: stable per question and person, nudged by warmth and mood
      const hsh = G.U.hash(`${npc.id}|${letters(text)}`) % 100;
      const lean = 50 + (A - 0.5) * 30 + p.mood.v * 15 + c * 10 - h * 25;
      stance = hsh < 12 ? 'maybe' : hsh < lean + 6 ? 'yes' : 'no';
      bankKey = stance === 'yes' ? 'yn_yes' : stance === 'no' ? 'yn_no' : 'yn_maybe';
      if (stance === 'no') emoji = false;
    } else if (act === 'question_wh') {
      bankKey = 'wh'; stance = 'deflect';
      // "what time works for you?" is a request to propose a time
      if (RX.timeNow.test(norm(text))) {
        vars.time = hm12(now); bankKey = 'clocktime'; stance = 'answer';
      } else if (/\b(what time|when)\b.*\b(works|good|free|suits|can you|are you)\b/.test(norm(text)) || /\bwhat time\b/.test(norm(text))) {
        const base = slots.at != null ? slots.at : now + 120;
        const alt = altTime(npc, Math.max(base, now + 60), S) || base + 60;
        vars.alt = hm12(alt); bankKey = 'suggest'; stance = 'suggest';
      }
    } else if (act === 'question_plan') {
      const pl = D.findPlan(npc, { S, now, thread });
      if (pl && (pl.when || pl.time)) {
        vars.when = pl.when || pl.time; if (pl.where) vars.where = pl.where;
        bankKey = pl.where ? 'plan_place' : 'plan_found'; stance = 'recall'; valence = 0.3;
      } else { bankKey = 'plan_none'; stance = 'ask'; }
    } else if (act === 'question_recall') {
      const f = recallFact(npc, text, thread, S, now);
      if (f) {
        vars.fact = asSecond(f.text).replace(/[.!\s]+$/, '');
        bankKey = 'recall_found'; stance = 'recall'; valence = 0.3;
        if (f.delicate) vars.__care = true;
      } else { bankKey = 'recall_none'; stance = 'forgot'; emoji = false; valence = 0; }
    } else if (act === 'advice_request') {
      bankKey = 'advice'; stance = 'advise'; e.trust = c > 0.3 ? 1 : 0;
    } else if (act === 'invite') {
      const slotTime = slots.at != null;
      const place = slots.place ? swapPerson(slots.place) : '';
      if (place) vars.where = place;
      if (slotTime) vars.when = slots.whenFull || slots.time;
      else if (slots.when) vars.when = slots.when;
      // will they come? closeness and warmth, hostility and grudges, interests, mood
      const likes = slots.topic && (p.interests || []).includes(slots.topic) ? 0.1 : 0;
      const score = 0.2 + 0.9 * c + 0.25 * r - 1.0 * h + 0.18 * (E - 0.5) + 0.12 * (A - 0.5) + 0.15 * p.mood.v + likes - 0.5 * grudge + (npc.status === 'dating' || npc.status === 'partner' ? 0.25 : 0);
      const busy = slotTime ? busyAt(npc, slots.at, S) : '';
      if (score < 0.32) { act = 'invite_decline'; bankKey = 'decline'; stance = 'decline'; emoji = false; valence = -0.05; }
      else if (busy) {
        const alt = altTime(npc, slots.at, S);
        if (alt) { vars.alt = hm12(alt) + (slots.when && !/^in /.test(slots.when) && slots.when !== 'today' ? ' ' + slots.when : ''); act = 'invite_counter'; bankKey = 'counter'; stance = 'counter'; valence = 0.1; emoji = false; }
        else { act = 'invite_decline'; bankKey = 'decline'; stance = 'decline'; emoji = false; valence = 0; }
      } else if (score < 0.5 && !slotTime && !place) {
        act = 'invite_decline'; bankKey = 'decline'; stance = 'decline'; emoji = false; valence = 0;
      } else {
        act = 'invite_accept'; stance = 'accept'; valence = 0.5;
        bankKey = slotTime ? 'accept' : place ? 'accept_where' : 'accept_open';
        if (slotTime) {
          vars.when = slots.whenFull || slots.time;
          appt = { at: slots.at, text: tidy(`see you ${vars.when}${place ? ' at ' + swapPerson(place) : ''}`), when: slots.time, whenFull: vars.when, time: slots.time, place: slots.place || '' };
          e.trust = 1;
        }
        e.aff = 1; e.rom = r > 0.3 ? 1 : 0; e.mood = 0.04;
      }
      if (act === 'invite_decline') { e.aff = 0; }
    } else if (act === 'ack_yes') {
      const pl = D.findPlan(npc, { S, now, thread });
      if (pl && pl.when) { vars.when = pl.when; bankKey = 'ack_yes'; } else bankKey = 'ack_yes_open';
      stance = 'accept'; valence = 0.4; e.aff = 1; e.mood = 0.03;
    } else if (act === 'ack_no') {
      bankKey = 'ack_no'; stance = 'accept_no'; valence = 0; emoji = false; e.mood = -0.02;
    } else if (act === 'want_talk') {
      bankKey = 'want_talk'; stance = 'listen'; e.trust = c > 0.3 ? 1 : 0; emoji = false;
    } else if (act === 'share_news') {
      bankKey = 'news'; stance = 'congratulate'; valence = 0.45;
      const envy = h > 0.5 ? -1 : 0;
      e.aff = h > 0.5 ? 0 : 1; e.riv = envy < 0 ? 1 : 0; e.mood = h > 0.5 ? -0.03 : 0.06;
      if (h > 0.5 && style !== 'cold') bankKey = 'news';
    } else if (act === 'share_bad') {
      bankKey = 'care'; stance = 'care'; emoji = false; valence = 0.2;
      const feel = mind() && mind().feel ? mind().feel(npc, read, rel) : { dv: 0 };
      e.trust = A > 0.55 ? (sens >= 0.7 ? 3 : 2) : A > 0.35 ? 1 : 0;
      if (h > 0.5) e.trust = 0;
      e.aff = h > 0.5 ? 0 : 1; e.mood = feel.dv || 0;
      // grief / crisis: the vetted care line of G.Mind is the floor; enemies do not make it worse (they say nothing)
      if (mind() && mind().respond && (sens >= 0.9 || (h > 0.4 && sens >= 0.5))) {
        fixedText = mind().respond(npc, { about: text, rel, to: playerName, rnd });
        if (!fixedText && h > 0.4) stance = 'silent';
      }
    } else if (act === 'compliment') {
      const n = sameRecent('compliment');
      if (n >= 3) { act = 'compliment_spam'; bankKey = 'compliment_spam'; stance = 'annoyed'; e.aff = -1; e.mood = -0.03; valence = -0.1; emoji = false; }
      else {
        bankKey = 'compliment'; stance = 'flattered'; valence = 0.5;
        const k = Math.pow(0.5, n) * (0.4 + c + 0.2 * r);
        e.aff = Math.round(3 * k); e.rom = r > 0.3 && n === 0 ? 1 : 0; e.mood = 0.06 * Math.pow(0.5, n);
        if (h > 0.5) { e.aff = 0; e.mood = 0; }
      }
    } else if (act === 'thanks') {
      const n = sameRecent('thanks');
      bankKey = 'thanks'; stance = 'welcome'; valence = 0.3;
      e.aff = n >= 2 ? 0 : 1; e.mood = 0.02 * Math.pow(0.5, n);
    } else if (act === 'insult') {
      const playful = cl.playful && c > 0.5 && h < 0.3;
      if (playful) { act = 'insult_playful'; bankKey = 'joke'; stance = 'tease'; valence = 0.1; e.aff = 0; e.mood = 0; }
      else {
        const sens2 = 0.55 + 0.4 * N + 0.25 * A;
        const closeAmp = 0.6 + 0.8 * c;
        const hit = sens2 * closeAmp;
        e.aff = -Math.round(clamp(8 * hit, 2, 12));
        e.trust = c > 0.3 ? -Math.round(clamp(3 * hit, 1, 4)) : 0;
        e.mood = -clamp(0.2 * hit + 0.05, 0.05, 0.3);
        e.grudge = clamp(0.2 * hit, 0.05, 0.4);
        stance = (style === 'cold' || style === 'snarky') ? (p.attach === 'avoidant' ? 'withdraw' : 'retaliate') : style === 'blunt' || style === 'formal' ? 'boundary' : p.attach === 'avoidant' ? 'withdraw' : 'hurt';
        if (p.attach === 'anxious' && stance !== 'retaliate') stance = 'hurt';
        bankKey = stance === 'hurt' ? 'insult_hurt' : 'insult_firm';
        if (stance === 'retaliate') e.riv = 2;
        if (stance === 'withdraw') { e.aff -= 1; }
        valence = -0.6; emoji = false;
      }
    } else if (act === 'apology') {
      const forgive = clamp(0.3 + 0.55 * A + 0.15 * c + (p.attach === 'secure' ? 0.1 : 0) - 0.5 * grudge - 0.2 * h, 0, 1);
      if (grudge < 0.06 && !recentInsult(thread, npc)) {
        bankKey = 'apology_nothing'; stance = 'no_need'; e.aff = 1; e.mood = 0.02; valence = 0.2;
      } else if (forgive >= 0.45) {
        bankKey = 'apology_accept'; stance = 'forgive';
        e.aff = Math.round(2 + 8 * grudge * forgive + 2 * forgive); e.grudge = -grudge * (0.4 + 0.4 * forgive); e.trust = 1; e.mood = 0.1; valence = 0.35;
      } else {
        bankKey = 'apology_wary'; stance = 'wary'; emoji = false;
        e.aff = Math.round(1 + 3 * forgive); e.grudge = -grudge * 0.2; e.mood = 0.02; valence = 0.1;
      }
    } else if (act === 'share_fact') {
      bankKey = 'share_fact'; stance = 'noted'; valence = 0.15;
    } else if (act === 'joke') {
      const hm = p.humor;
      bankKey = 'joke'; stance = 'laugh'; valence = 0.3; e.mood = 0.03;
    } else if (act === 'topic_change') {
      bankKey = 'topic_change'; stance = 'follow';
    } else if (act === 'farewell') {
      bankKey = 'farewell'; stance = 'bye'; valence = 0.15;
    } else if (act === 'one_word') {
      bankKey = 'one_word'; stance = 'brief'; valence = 0.05; emoji = false;
    } else {
      bankKey = 'smalltalk';
      if (slots.topic && (p.interests || []).includes(slots.topic)) { bankKey = 'interest'; vars.topic = slots.topic; stance = 'interested'; e.aff = c > 0.2 && h < 0.3 ? 0 : 0; }
    }
    if (G.Mind && !has('insult') && h < 0.3 && c > 0.5 && (act === 'smalltalk')) e.aff = 0;

    /* --- realise --- */
    let outText = '';
    let retryKey = bankKey, retryStyle = style;
    if (stance === 'silent') outText = '';
    else if (fixedText) outText = fixedText;
    else {
      let key = bankKey;
      let styleUsed = style;
      if (act === 'joke' || act === 'insult_playful') { // the way they joke follows their humor
        const hm = p.humor;
        styleUsed = hm === 'dry' ? 'snarky' : hm === 'silly' ? 'bubbly' : hm === 'wholesome' ? 'shy' : hm === 'dark' ? 'blunt' : style === 'cold' ? 'cold' : 'formal';
        if (style === 'flirty') styleUsed = 'flirty';
        if (style === 'cold') styleUsed = 'cold';
      }
      retryKey = key;
      retryStyle = styleUsed;
      outText = realise(npc, key, styleUsed, vars, { rnd, own, npc, ask: ['greeting', 'smalltalk', 'question_howru', 'question_status', 'share_news', 'compliment', 'share_fact'].includes(act) });
      if (vars.__care && outText) { const tail = { shy: 'how are things now?', bubbly: 'how is everything now??', formal: 'How are things now?', blunt: 'how is it going now?', cold: 'how is it now?', snarky: 'how is it going, really?', flirty: 'how are you doing now?' }[style]; outText = outText.replace(/[.!]+$/, '') + (/\?$/.test(outText) ? ' ' : '. ') + tail; }
      if (wasAsleep && ['greeting', 'question_howru', 'smalltalk', 'question_status'].includes(act) && rnd() < 0.4) {
        const wk = BANK.woke[style];
        outText = wk[Math.floor(rnd() * wk.length)] + outText;
      }
    }

    // personal typing style (voice.js), emoji only when the line's feeling fits and they use them
    if (outText && style === 'formal') { // formal people do not text "u" and "ur": proper case and punctuation, nothing else
      baseText = outText;
      outText = cap1(outText.trim());
      if (!/[.!?…]$/.test(outText)) outText += '.';
      if (emoji && !serious && valence >= 0.25 && h <= 0.5) outText = addEmoji(outText, npc, style, rnd);
    } else if (outText && G.Voice && G.Voice.stylize) {
      const careful = serious || stance === 'care' || stance === 'silent';
      baseText = outText;
      outText = G.Voice.stylize(outText, npc, rnd, { short: cl.short || careful || !emoji || style === 'formal' || style === 'cold' || valence < 0.25, noEmoji: true });
      if (!outText.trim()) outText = baseText;
      if (emoji && !careful && valence >= 0.25 && h <= 0.5) outText = addEmoji(outText, npc, style, rnd);
    }

    // Voice stylization can collapse distinct templates to the same casual line.
    // Recheck the rendered wording, then try another fitting template before sending.
    if (outText && !fixedText) {
      const finalOwn = own.slice();
      const formatAlt = (line) => {
        if (style === 'formal') {
          let x = cap1(line.trim());
          if (!/[.!?â€¦]$/.test(x)) x += '.';
          if (emoji && !serious && valence >= 0.25 && h <= 0.5) x = addEmoji(x, npc, style, rnd);
          return x;
        }
        if (G.Voice && G.Voice.stylize) {
          const careful = serious || stance === 'care' || stance === 'silent';
          let x = G.Voice.stylize(line, npc, rnd, { short: cl.short || careful || !emoji || style === 'formal' || style === 'cold' || valence < 0.25, noEmoji: true });
          if (!x.trim()) x = line;
          if (emoji && !careful && valence >= 0.25 && h <= 0.5) x = addEmoji(x, npc, style, rnd);
          return x;
        }
        return line;
      };
      for (let i = 0; i < 6 && used(npc, finalOwn, outText); i++) {
        finalOwn.push(toks(outText));
        const alt = realise(npc, retryKey, retryStyle, vars, { rnd, own: finalOwn, npc, ask: ['greeting', 'smalltalk', 'question_howru', 'question_status', 'share_news', 'compliment', 'share_fact'].includes(act) });
        if (!alt) break;
        baseText = alt;
        outText = formatAlt(alt);
      }
      if (used(npc, finalOwn, outText)) {
        const tails = {
          shy: ['what is on your mind?', 'how has your day been?', 'tell me what is new.'],
          bubbly: ['what is happening with you??', 'tell me what you have been up to!!', 'anything fun today??'],
          formal: ['What would you like to talk about?', 'How has your day been?', 'What is new with you?'],
          blunt: ['what is going on with you?', 'what have you been up to?', 'anything else?'],
          cold: ['what do you want to talk about?', 'anything else?', 'what is new?'],
          snarky: ['what is the latest?', 'got anything else?', 'what have you been up to?'],
          flirty: ['what is on your mind, then?', 'what have you been up to?', 'tell me something good.'],
        }[style] || ['what is new with you?'];
        const tail = tails[Math.floor(rnd() * tails.length) % tails.length];
        outText = tidy(outText.replace(/[.!?]+$/, '') + '. ' + tail);
        baseText = outText;
      }
    }

    // common sense gate: nothing flippant under distress, nothing in the third person
    if (outText && mind() && mind().vet) {
      const vr = mind().vet(npc, outText, { kind: 'dm', about: text, rel });
      if (!vr.ok) {
        let alt = null;
        if (mind().respond) alt = mind().respond(npc, { about: text, rel, to: playerName, rnd });
        if (!alt && serious && h < 0.4) alt = tidy(`i'm so sorry, ${playerName}. i'm here if you want to talk`);
        outText = alt && mind().vet(npc, alt, { kind: 'dm', about: text, rel }).ok ? alt : '';
        if (!outText) stance = 'silent';
      }
    }
    // never their own full name
    if (outText && npc.name) { // a speaker never says their own name
      const esc1 = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      [npc.name, firstName(npc)].filter((x) => x && x.length > 2).forEach((nm) => { outText = outText.replace(new RegExp('(^|[^@\\w])' + esc1(nm) + '\\b', 'ig'), '$1'); });
      outText = tidy(outText);
    }

    /* --- leave on read: personality-driven, never for something serious from someone they care about --- */
    const cares = c >= 0.3 && h < 0.4;
    let pLeave = 0.03;
    if (p.attach === 'avoidant') pLeave += 0.12;
    if (c < 0.3) pLeave += (0.3 - c) * 0.6;
    if (style === 'cold') pLeave += 0.1;
    pLeave += (0.5 - A) * 0.15 + (0.5 - E) * 0.06;
    if (['one_word', 'farewell', 'thanks', 'compliment_spam', 'repeat_more', 'repeat'].includes(act)) pLeave += 0.12;
    if (stance === 'withdraw') pLeave += 0.45;
    if (stance === 'retaliate' && style === 'cold') pLeave += 0.25;
    if (['question_plan', 'question_recall', 'advice_request', 'invite_accept', 'invite_counter', 'ack_yes', 'apology', 'share_news'].includes(act) && cares) pLeave = 0;
    if (sens >= 0.75 && cares) pLeave = 0;
    if (sens >= 0.5 && c >= 0.5) pLeave = 0;
    if (cl.question && c > 0.5) pLeave *= 0.3;
    pLeave = clamp(pLeave, 0, 0.7);
    if (outText && rnd() < pLeave) leave = true;
    if (stance === 'silent') leave = false;
    const finalText = leave ? '' : outText;
    /* --- memory: valence from the ACT, never from the tone bucket --- */
    const q = String(text).slice(0, 80);
    const sal = mind() ? mind().salience(text, 'dm') : 3;
    const MEM = {
      insult: ['shade', `${S.player.name} insulted me: "${q}"`, -0.6, 6],
      apology: ['apology', `${S.player.name} apologised: "${q}"`, 0.35, 5],
      compliment: ['compliment', `${S.player.name} complimented me: "${q}"`, 0.5, 4],
      thanks: ['dm', `${S.player.name} thanked me: "${q}"`, 0.3, 3],
      share_bad: ['said', `${S.player.name} told me: "${q}"`, 0.2, Math.max(sal, 6)],
      share_news: ['said', `${S.player.name} told me: "${q}"`, 0.45, Math.max(sal, 6)],
      share_fact: ['said', `${S.player.name} told me: "${q}"`, 0.15, 5],
      invite_accept: ['event', `${S.player.name} and I made a plan: "${q}"`, 0.5, 6],
      invite_counter: ['dm', `${S.player.name} invited me: "${q}"`, 0.2, 5],
      invite_decline: ['dm', `${S.player.name} invited me and I said no: "${q}"`, -0.05, 4],
      compliment_spam: ['dm', `${S.player.name} kept repeating compliments`, -0.2, 3],
      repeat_more: ['dm', `${S.player.name} kept sending me the same message`, -0.3, 3],
      greeting: ['dm', `${S.player.name} said hi: "${q}"`, 0.1, 2],
    };
    const mm = MEM[act];
    if (mm && !(act === 'greeting')) mem = { kind: mm[0], text: mm[1], valence: mm[2], imp: mm[3] };
    else if (!['repeat', 'one_word', 'farewell'].includes(act)) mem = { kind: 'dm', text: `${S.player.name} texted me: "${q}"`, valence: Math.max(-0.1, Math.min(0.25, valence)), imp: Math.max(2, sal >= 7 ? sal : 3) };

    if (e.mood) e.mood = Math.round(e.mood * 1000) / 1000;
    e.grudge = Math.round(e.grudge * 1000) / 1000;
    return { act, acts: cl.acts, slots, tone: cl.tone, style, stance, text: finalText, draft: outText, effects: e, memory: mem, appointment: appt || undefined, leave_on_read: leave, replyTo: ctx.msgId != null ? ctx.msgId : undefined, bank: bankKey };
  };

  function recentInsult(thread, npc) {
    return thread.filter(mine).slice(-6).some((m) => D.classify(m.text, { now: 0, npc }).acts.includes('insult'));
  }

  // what did the player tell this person that the question points at? -> { text, delicate } | null
  function recallFact(npc, qtext, thread, S, now) {
    const M = G.Mem;
    const qt = [...toks(qtext)].filter((w) => !STOP.has(w));
    const cands = [];
    const add = (txt, tt, imp, delicate) => {
      txt = String(txt || '').trim();
      if (txt.length < 6) return;
      if (RX.recall.test(norm(txt)) || RX.greeting.test(norm(txt)) && txt.length < 14) return;
      if (D.classify(txt, { now, npc, S }).acts.some((a) => ['question_plan', 'question_recall', 'insult', 'farewell'].includes(a)) ) return;
      if (norm(txt) === norm(qtext)) return;
      cands.push({ text: txt, t: tt != null ? tt : 0, imp: imp || 4, delicate: !!delicate });
    };
    if (M) {
      (M.told ? M.told(npc) : []).forEach((m) => add(unquote(m.text), m.t, m.imp, M.isDelicate && M.isDelicate(m)));
      (npc.mem || []).filter((m) => (m.who || []).includes('me') && /(texted me|told me|said): "/.test(m.text || '') && !/ (insulted|apologised|complimented|thanked|invited|and I made)/.test(m.text)).forEach((m) => add(unquote(m.text), m.t, m.imp, M.isDelicate && M.isDelicate(m)));
      try { (M.retrieve(npc, { who: ['me'], text: qtext }, 6) || []).forEach((m) => { if (/(told me|texted me): "/.test(m.text || '')) add(unquote(m.text), m.t, m.imp, false); }); } catch (e) {}
    }
    ((S.dms && S.dms[npc.id]) || []).slice(-40).concat(thread).forEach((m) => { if (mine(m)) add(m.text, m.t, mind() ? mind().salience(m.text, 'dm') : 3, mind() ? mind().read(m.text).sens >= 0.5 : false); });
    if (!cands.length) return null;
    const seen = new Set();
    const uniq = cands.filter((x) => { const k = letters(x.text); if (seen.has(k)) return false; seen.add(k); return true; });
    let best = null, bs = -1;
    uniq.forEach((x) => {
      const xt = toks(x.text);
      const ov = qt.length ? qt.filter((w) => xt.has(w)).length : 0;
      const sc = ov * 3 + x.imp / 10 + (x.delicate ? 1.2 : 0) + Math.pow(0.9995, Math.max(0, now - x.t) / 60) * 0.5;
      if (sc > bs) { bs = sc; best = x; }
    });
    if (!best) return null;
    const bt = toks(best.text);
    const ov = qt.length ? qt.filter((w) => bt.has(w)).length : 0;
    if (qt.length && !ov) { // they asked about a specific thing and nothing matches it: honestly forgotten (unless the question was just generic)
      return null;
    }
    if (!qt.length && best.imp < 5 && !best.delicate && best.text.length < 20) return null;
    return best;
  }

  D.recallFact = recallFact; // what did the player tell this person that a question points at? (also used to ground the AI path)

  /* ================= apply ================= */
  D.apply = function (npc, plan, ctx) {
    ctx = ctx || {};
    const S = ctx.S || G.S;
    const p = G.Persona.ensure(npc);
    const e = plan.effects || {};
    const cl = clamp;
    if (e.aff) npc.aff = cl(npc.aff + e.aff, -100, 100);
    if (e.rom) npc.rom = cl(npc.rom + e.rom, 0, 100);
    if (e.riv) npc.riv = cl(npc.riv + e.riv, 0, 100);
    if (e.trust) npc.trust = cl(npc.trust + e.trust, 0, 100);
    if (e.mood && G.Persona.nudge) G.Persona.nudge(npc, e.mood);
    if (e.grudge) {
      const g = cl((p.grudges.me || 0) + e.grudge, 0, 1);
      if (g > 0.03) p.grudges.me = g; else delete p.grudges.me;
    }
    if (plan.memory && G.Mem) {
      G.Mem.add(npc, { kind: plan.memory.kind, text: plan.memory.text, who: ['me'], valence: plan.memory.valence, imp: plan.memory.imp });
    }
    if (plan.appointment) {
      const ap = plan.appointment;
      if (G.Clock && G.Clock.add) { try { G.Clock.add(npc.id, ap.at, ap.text, S.clock); } catch (er) {} }
      p.plans = (p.plans || []).filter((x) => x.at > S.clock - 180).slice(-4);
      p.plans.push({ at: ap.at, time: ap.time, whenFull: ap.whenFull, place: ap.place ? swapPerson(ap.place) : '', text: ap.text, made: S.clock });
    }
    if (plan.text) G.Persona.noteText(npc, 'dlg:' + (plan.draft || plan.text));
    return plan;
  };
})(window.G);
