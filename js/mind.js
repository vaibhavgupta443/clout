/* Clout — the common-sense core (G.Mind). One place that UNDERSTANDS what was said and decides what is APPROPRIATE.
   Before this, every module reacted to words with its own templates, so people joked under a post about a hospital,
   gossiped by quoting somebody's worst night, and talked about themselves in the third person.
   Pieces (all rule-based, free, deterministic):
   - read(text)        what is this about? { kinds, sens, good, ask, joke, brag, family } (sens 0..1 = how delicate)
   - vet(npc, text, c) is this line OK for this person to say here? -> { ok, why, drop }  (the gate every NPC line passes)
   - respond(npc, c)   a fitting line when the situation is delicate or a celebration (distress -> care, news -> congrats)
   - feel(npc, r, rel) appraisal: what the person feels about it (OCC style: empathy / joy / envy) -> { emotion, dv }
   - salience(text)    how much a thing deserves to be remembered (1..10), so chatter never evicts real events
   Research: appraisal theory (Ortony-Clore-Collins; Scherer), Generative Agents (Park et al. 2023: importance scored
   by meaning, not by volume), social-norm / politeness gates from Sotopia and Concordia (speech must fit the scene),
   Mem0 (extract only salient facts instead of storing every utterance). */
(function (G) {
  const Mind = (G.Mind = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const RX = {
    crisis: /\b(suicid\w*|kill myself|end it all|want to die|self[- ]?harm|can'?t go on|no reason to live|hurt myself|abus(?:e|ed|ing)|assault(?:ed)?|panic attack)\b/i,
    grief: /\b(died|passed away|passed on|funeral|wake|grieving|grief|rip\b|lost (?:my|our|her|his|their) (?:mom|mother|dad|father|brother|sister|grandma|grandmother|grandpa|grandfather|friend|dog|cat|baby)|miss (?:him|her|them) so much|death of)\b/i,
    health: /\b(hospital|icu|er\b|emergency room|surgery|cancer|chemo|diagnos\w*|terminal|sick|ill(?:ness)?|injur\w*|accident|ambulance|doctor said|test results|biopsy|in pain|seizure|stroke|heart attack|covid|can'?t breathe)\b/i,
    loss: /\b(broke up|break ?up|dumped me|left me|cheated on me|cheating on me|got fired|fired me|laid off|lost my job|evicted|lost everything|got scammed|bankrupt|divorce\w*|no money|can'?t pay)\b/i,
    fear: /\b(scared|afraid|terrified|anxious|anxiety|panick?ing|alone tonight|so alone|lonely|crying|cried|can'?t sleep|depressed|depression|overwhelmed|not okay|not ok|falling apart|breaking down|hopeless|worried sick|struggling)\b/i,
    good: /\b(got the job|got promoted|promotion|engaged|got engaged|i'?m pregnant|we'?re pregnant|expecting|passed my|graduat\w*|got accepted|accepted into|i won|we won|new record|i did it|we did it|signed (?:a|my|the) (?:deal|contract)|just (?:bought|moved)|birthday|anniversary|married|big news|good news|made it)\b/i,
    brag: /\b(sold out|million|new car|new house|first class|award|nominated|featured|trending|record[- ]breaking)\b/i,
    family: /\b(mom|mum|mother|dad|father|sister|brother|grandma|grandpa|grandmother|grandfather|son|daughter|baby|husband|wife|partner|bestie|best friend)\b/i,
    joke: /(lol|lmao|lmfao|haha|😂|🤣|😆|😹|jk\b|kidding|\/s\b)/i,
    ask: /\?\s*$|\b(can someone|does anyone|anyone know|any advice|any tips|help me|need advice|should i)\b/i,
    help: /\b(help me|need help|need someone|need a friend|someone please|please help|talk to me|call me)\b/i,
  };

  // what a flippant / celebratory line looks like (wrong when somebody is hurting)
  const FLIPPANT = /(😂|🤣|💀|😆|😹|😏|😈|🔥|🥳|🎉|lol\b|lmao|lmfao|haha|touch grass|yikes|w post|\bthe audacity|ok but who asked|who asked|main character|bold of you|ratio\b|cope\b|skill issue|iconic|slay\b|obsessed|go off|love this for you|you did that|this is everything|screaming for you|legend behavior|serving looks|deserve this|so proud of you|yesss|let'?s gooo|banger|fire\b|\bate\b.{0,12}\b(?:that|it)\b)/i;
  const SUPPORT = /\b(sorry|so sorry|here for you|here if you|thinking of you|thoughts are with you|hugs?|sending (?:love|strength|hugs)|are you ok(?:ay)?|you ok(?:ay)?|you good|praying|hang in there|stay strong|i'?m here|you'?re not alone|you are not alone|let me know|need anything|call me|come over|check on|be gentle|take care|proud of you for|worried about you|that sounds (?:so |really )?(?:hard|heavy|rough|awful|terrible|scary)|can i help|want me to (?:come|call)|come by|i hope (?:everything|you)|good thoughts|sending (?:you )?(?:good|positive) (?:thoughts|vibes)|i hope (?:the|things|it)|hoping for|so frightening|to the hospital|i(?: am|'m) (?:here|around|on my way)|tell me how i can help|keep me posted|no right words|my heart is with you|my thoughts are with you|bring food|sit with you|carry this alone|you matter to me|stay with me|breathe|hang in there|sorry to hear|thinking of you|i can call|want to talk|do you want company|need anything|not your fault|you are going to be okay|come by whenever|sending you care|hope tonight)\b|❤|🫂|🤍|💙|🫶/i;
  const CONGRATS = /\b(congrat\w*|so happy for you|proud of you|well deserved|you deserve|amazing news|that'?s (?:amazing|great|huge)|celebrate|yay|finally|love that for you|happy birthday|so excited)\b|🎉|🥳|❤|🙌/i;

  Mind.FLIPPANT = FLIPPANT;
  Mind.SUPPORT = SUPPORT;

  Mind.read = function (text) {
    const s = String(text || '');
    const kinds = [];
    let sens = 0;
    const hit = (k, w) => {
      if (RX[k].test(s)) {
        kinds.push(k);
        sens = Math.max(sens, w);
        return true;
      }
      return false;
    };
    hit('crisis', 1);
    hit('grief', 0.9);
    hit('health', 0.75);
    hit('loss', 0.7);
    // fear/loneliness alone is only delicate when it is clearly about the speaker
    if (RX.fear.test(s)) {
      kinds.push('fear');
      sens = Math.max(sens, /\b(i|i'?m|im|my|me)\b/i.test(s) ? 0.55 : 0.3);
    }
    const family = RX.family.test(s);
    if (family && sens >= 0.55) sens = Math.min(1, sens + 0.1); // somebody they love is involved
    const good = RX.good.test(s) && sens < 0.5;
    return { kinds, sens: Math.round(sens * 100) / 100, good, brag: RX.brag.test(s), ask: RX.ask.test(s), help: RX.help.test(s), joke: RX.joke.test(s) && sens < 0.5, family };
  };
  Mind.sensitive = (text) => Mind.read(text).sens >= 0.5;
  Mind.supportive = (text) => SUPPORT.test(String(text || ''));
  Mind.flippant = (text) => FLIPPANT.test(String(text || ''));

  // the given name: skips articles/titles ("The Lobby Lurker" -> Lobby) and quoted nicknames ("Beatrice 'Bea' Okonkwo" -> Beatrice)
  const firstName = (n) => {
    const parts = String((n && n.name) || '').replace(/["'“”‘’][^"'“”‘’]+["'“”‘’]/g, ' ').split(/\s+/).filter(Boolean);
    return /^(the|a|an|la|le|el|los|las|dj|mc|dr|mr|mrs|ms|miss|lady|lord|sir)$/i.test(parts[0] || '') && parts[1] ? parts[1] : parts[0] || '';
  };
  Mind.firstName = firstName;
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- the gate: is this line OK for this person to say here? ----------
     c: { kind: 'comment'|'dm'|'channel'|'reply', about: text of what they answer / talk about, aboutAuthor: id,
          thread: [authorIds in the thread], rel: {c,h}, dup: true to refuse repeating themselves, allowGossip }  */
  Mind.vet = function (npc, text, c) {
    c = c || {};
    const S = G.S;
    const t = String(text || '').trim();
    if (!t) return { ok: false, why: 'empty', drop: true };
    const about = Mind.read(c.about || '');
    const rel = c.rel || {};
    const hostile = (rel.h || 0) > 0.55;

    // 1. a delicate moment: no jokes, no cheering, no skulls. Care (or silence), never a punchline
    if (about.sens >= 0.5) {
      if (FLIPPANT.test(t)) return { ok: false, why: 'flippant about something delicate', fix: true };
      if (about.sens >= 0.75 && !SUPPORT.test(t) && (rel.c || 0) >= 0.3 && c.kind !== 'channel') return { ok: false, why: 'cold about something serious', fix: true };
      if (hostile && c.kind !== 'channel') return { ok: false, why: 'piling on someone in a bad moment', drop: true };
    }
    // 2. good news from someone is not met with a put-down by a person who likes them
    if (about.good && (rel.c || 0) > 0.5 && (rel.h || 0) < 0.3 && /\b(yikes|cope|ratio|who asked|touch grass|L\b)/i.test(t)) return { ok: false, why: 'sours good news', fix: true };

    // 3. never talks about themselves in the third person ("Mia and Kai: are they together?" said by Mia)
    if (npc && npc.name) {
      const full = new RegExp('(^|[^@\\w])' + esc(npc.name) + '\\b', 'i');
      const first = firstName(npc);
      const third = first.length > 2 && new RegExp('(^|[^@\\w])' + esc(first) + '\\b\\s*(?:and\\s+\\w+\\s*[:,]|is\\b|was\\b|has\\b|had\\b|became\\b|seems\\b|keeps\\b|always\\b)', 'i');
      if (full.test(t) || (third && third.test(t))) return { ok: false, why: 'talks about themselves in the third person', drop: true };
    }

    // 4. does not quote somebody's worst moment as gossip or a punchline
    if (c.kind === 'channel' || c.kind === 'comment' || c.kind === 'reply') {
      const quotes = t.match(/["“]([^"”]{8,})["”]/g) || [];
      for (const q of quotes) if (Mind.read(q).sens >= 0.5) return { ok: false, why: 'quotes a delicate moment as gossip', drop: true };
    }

    // 5. a comment stays on the post: no unrelated people or rumours dropped under it
    if (c.kind === 'comment' && S && c.about) {
      const aboutLow = String(c.about).toLowerCase();
      const known = new Set([...(c.thread || []), c.aboutAuthor, npc && npc.id]);
      for (const o of Object.values(S.npcs)) {
        if (known.has(o.id) || o.id === (npc && npc.id)) continue;
        const f = firstName(o).toLowerCase();
        if (f.length < 3) continue;
        if (new RegExp('\\b' + esc(f) + '\\b', 'i').test(t) && !aboutLow.includes(f) && !new RegExp('@' + esc(String(o.handle || '').replace(/^@/, '')), 'i').test(c.about)) return { ok: false, why: 'brings an unrelated person into a comment', drop: true };
      }
      if (/\b(is it true that|everyone (?:in|around) (?:my|the) (?:part of )?town|are they together|did you hear)\b/i.test(t) && !(c.allowGossip || /\b(drama|rumou?r|heard|tea|spill)\b/i.test(c.about))) return { ok: false, why: 'rumour under an unrelated post', drop: true };
    }

    // 6. repeats nothing they said recently
    if (c.dup && npc && G.Persona && G.Persona.dupText && G.Persona.dupText(npc, t)) return { ok: false, why: 'repeats themselves', fix: true };
    return { ok: true };
  };

  /* ---------- a fitting line for delicate moments and celebrations ----------
     c: { about: text, rel: {c,h}, to: first name of the person, rnd } -> string | null (null = say nothing) */
  const LINES = {
    crisis: ['hey. i am really worried about you. please call me right now', 'i am here. you are not alone. can i call you?', 'please do not be alone tonight. i am coming over, or call me, anything', '{n}, i read that and i am scared for you. please pick up when i call', 'you matter to me. stay with me right now, i am calling you', 'i am on my way, or tell me where you are. please do not be alone'],
    grief: ['oh {n}, i am so sorry. i am here for whatever you need', 'i am so sorry for your loss. thinking of you', 'i am so sorry, {n}. do you want company?', '{n}, i am so sorry. you do not have to say anything, i will just be here', 'there are no right words. i am here, whenever you want company', 'my heart is with you today, {n}', 'i am so sorry. i can bring food or just sit with you'],
    health: ['oh no, {n}. i hope everything is okay. let me know if you need anything', 'thinking of you and your family. i am here if you want to talk', 'that sounds so scary. do you want me to come by?', 'sending you strength. call me if you need anything, any time', '{n}, i am thinking of you both. tell me how i can help', 'i hope the doctors have good news soon. i am here', 'that must be so frightening. i can come over if you want', 'keep me posted, {n}. i am around all night'],
    loss: ['i am so sorry, {n}. that is really hard. i am here', 'that is awful. do you want to talk about it?', 'ugh, {n}, i am sorry. you do not deserve that. need anything?', 'that is rough, {n}. it is not your fault. want to talk it through?', 'i am sorry. you are going to be okay, and i will help where i can', 'that is such a gut punch. i am here, {n}', 'i hate that this happened to you. come by whenever'],
    fear: ['hey, are you okay? i am here if you want to talk', 'sending hugs, {n}. you are not alone', 'that sounds heavy. want me to call?', 'be gentle with yourself tonight. i am here', 'you do not have to carry this alone, {n}. i am here', 'i am glad you said it out loud. want to talk or want a distraction?', 'breathe, {n}. i am around if you want company', 'sounds like a lot tonight. i can call if that helps'],
    good: ['congratulations {n}!! so happy for you', 'that is amazing news, you deserve it', 'so proud of you, {n}', 'yay!! congrats, this is huge', '{n}!! i knew it. celebrate tonight', 'i am so happy for you, you worked for this', 'this is huge, {n}. tell me everything', 'look at you!! so proud', 'yes!! you earned every bit of this'],
  };
  const LIGHT = {
    crisis: ['please talk to someone you trust tonight. i am thinking of you', 'i am thinking of you tonight. please reach out to someone close to you'],
    grief: ['so sorry for your loss, {n}', 'thinking of you', 'i am so sorry, {n}', 'my thoughts are with you', 'sending you care in a hard time'],
    health: ['i hope everything is okay. thinking of you', 'sending good thoughts', 'hoping for good news, {n}', 'thinking of you and yours', 'i hope things turn out okay'],
    loss: ['sorry you are going through that, {n}', 'that sounds hard, {n}. i am sorry', 'sorry to hear that, {n}', 'hang in there, {n}'],
    fear: ['hope you are okay, {n}. take care of yourself', 'hope tonight gets easier, {n}', 'take care of yourself, {n}', 'thinking of you'],
    good: ['congrats, {n}', 'that is great news', 'nice one, {n}', 'so happy for you, {n}', 'well done'],
  };
  Mind.respond = function (npc, c) {
    c = c || {};
    const r = Mind.read(c.about || '');
    const rel = c.rel || {};
    const rnd = c.rnd || Math.random;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const closeness = rel.c || 0;
    const kind = ['crisis', 'grief', 'health', 'loss', 'fear'].find((k) => r.kinds.includes(k)) || (r.good ? 'good' : null);
    if (!kind) return null;
    if ((rel.h || 0) > 0.5) return null; // enemies say nothing at a time like this; they do not make it worse
    const kindness = npc && G.Persona ? G.Persona.ensure(npc).t.A / 100 : 0.5;
    let pool;
    if (kind === 'crisis') pool = closeness >= 0.2 || kindness > 0.4 ? (closeness >= 0.45 ? LINES.crisis : LIGHT.crisis) : null;
    else if (closeness >= 0.45) pool = LINES[kind];
    else if (closeness >= 0.18 || kindness > 0.6) pool = LIGHT[kind];
    if (!pool) return null;
    const fmt = (t) => t.replace('{n}', c.to || '').replace(/\s+([,!?.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    const P = G.Persona;
    const fresh = P && P.dupText && npc ? pool.filter((t) => !P.dupText(npc, fmt(t))) : pool; // never the same words twice from the same person
    return fmt(pick(fresh.length ? fresh : pool));
  };

  /* ---------- appraisal: what do they feel about it? (OCC style, no AI) ---------- */
  Mind.feel = function (npc, r, rel) {
    rel = rel || {};
    const p = G.Persona && npc ? G.Persona.ensure(npc) : { t: { A: 50, N: 50 } };
    const A = p.t.A / 100;
    const N = p.t.N / 100;
    const c = rel.c || 0;
    const h = rel.h || 0;
    if (r.sens >= 0.5) {
      if (h > 0.55) return { emotion: 'indifferent', dv: 0 };
      return { emotion: r.kinds.includes('crisis') ? 'alarm' : 'sympathy', dv: -clamp(r.sens * (0.05 + 0.2 * c) * (0.6 + 0.8 * A) * (0.7 + 0.6 * N), 0, 0.25) };
    }
    if (r.good) return h > 0.5 ? { emotion: 'envy', dv: -0.03 * N } : { emotion: 'joy', dv: 0.04 + 0.1 * c };
    if (r.brag && h > 0.3) return { emotion: 'envy', dv: -0.02 };
    return { emotion: 'neutral', dv: 0 };
  };

  /* ---------- how much does this deserve to be remembered? 1..10 ---------- */
  Mind.salience = function (text, kind) {
    const r = Mind.read(text);
    let s = 3;
    if (r.sens >= 0.9) s = 10;
    else if (r.sens >= 0.7) s = 9;
    else if (r.sens >= 0.5) s = 8;
    else if (r.good) s = 7;
    else if (r.help) s = 8;
    else if (r.family) s = 5;
    if (/^(like|follow|post|story)$/.test(kind || '')) s = Math.min(s, 2);
    return clamp(s, 1, 10);
  };
})(window.G);
