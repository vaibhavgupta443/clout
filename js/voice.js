/* Clout — voice: writes posts, comments, stories and DMs in each NPC's own style, for free (no API).
   Templates have {slots}; every NPC then "types" it their way (lowercase / CAPS / emoji / slang / elongation /
   catchphrases) and avoids repeating what they said recently, so the same template never sounds the same twice. */
(function (G) {
  const U = G.U;
  const Voice = (G.Voice = {});

  const SLOTS = {
    food: ['pizza', 'ramen', 'tacos', 'pancakes', 'sushi', 'a burrito the size of my head', 'iced coffee', 'pasta', 'dumplings', 'avocado toast', 'fried rice', 'a questionable sandwich', 'waffles', 'curry', 'dessert first'],
    place: ['the gym', 'the café', 'the rooftop', 'the beach', 'campus', 'the studio', 'the park', 'the mall', 'downtown', 'the diner', 'the library', 'a random bookstore', 'the train', 'my balcony'],
    activity: ['lifting', 'running', 'journaling', 'studying', 'editing', 'cooking', 'cleaning my room', 'doomscrolling', 'sketching', 'gaming', 'walking', 'stretching', 'meal prepping', 'reorganising my life'],
    thing: ['my phone', 'my sleep schedule', 'this week', 'my brain', 'my wifi', 'monday', 'my bank account', 'my inbox', 'the group chat', 'my motivation', 'adulting'],
    time: ['this morning', 'tonight', 'rn', 'lately', 'all week', 'today', 'this weekend'],
    pos: ['amazing', 'perfect', 'so good', 'unreal', 'elite', 'immaculate', 'a lot of fun', 'exactly what i needed'],
    neg: ['exhausting', 'chaotic', 'rough', 'a lot', 'brutal', 'not it', 'way too long', 'a mess'],
    toxic: ['replying "omw" while still in bed', 'saving posts i never read', 'starting 5 hobbies at once', 'saying "last one" and having 3 more', 'liking old posts by accident', 'overthinking one text for 2 hours', 'buying notebooks i never use'],
    outfit: ['an oversized jacket', 'all black', 'thrifted everything', 'my favourite jeans', 'a suit (why not)', 'something sparkly', 'comfy hoodie energy'],
    song: ['a banger', 'an old playlist', 'that one song', 'a throwback album', 'sad girl music', 'lo-fi', 'something with a lot of bass'],
    feeling: ['grateful', 'a little overwhelmed', 'nostalgic', 'unstoppable', 'soft', 'restless', 'weirdly calm'],
    n: ['2', '3', '5', '10', 'like 7', 'too many'],
  };

  const T = {};

  /* ---------- POSTS ---------- */
  T.post = {
    selfie: ['new me who dis', '{pos} day, {pos} fit', 'feeling myself {time}', 'no filter needed (ok maybe a little)', 'golden hour hits different', 'outfit check ✅', 'just a casual mirror pic', 'dressed up with nowhere to go', 'main character energy {time}', 'wearing {outfit} and feeling it', 'photo dump incoming'],
    food: ['{food} {time}. no regrets.', "today's special: {food}", 'rate this {food} 1-10', 'meal prep sunday: {food} x6', 'i will never stop thinking about that {food}', '{food} fixes everything, change my mind', 'trying {food} for the first time', 'brunch with the best people 🥞'],
    fitness: ['{activity} done ✅ {time}', 'leg day was {neg}', '5am gang rise up', 'stretching like it is my job', 'new personal best today!!', 'the gym was empty and it felt illegal', 'sore in places i forgot existed', 'one more rep. that is all.'],
    motivation: ['small steps still count', "you don't have to be ready, just start", 'discipline > motivation', 'rest is productive too', 'be patient with yourself {time}', 'comparison is the thief of joy (and sleep)', "future you is watching. don't embarrass them.", 'progress, not perfection'],
    vent: ['idk why {thing} is so {neg} lately', 'tired of pretending i am fine', 'can everything calm down for one day', 'not me crying over {thing}', 'need a break from everything tbh', "some days it's just {neg}", 'i am so done with {thing}'],
    subtweet: ['funny how people change when it matters', 'some of y\'all are exhausting', 'imagine acting like that and still posting', 'noted. remembering everything.', '{time} showed me who is real', 'wild how quiet it got after that', 'not naming names but you know who you are', 'be careful who you call a friend'],
    win: ['so i got some news…', 'years of work, finally paying off', 'cannot believe this actually happened!!', 'booked and busy', 'feeling {feeling} (and a little shocked)', 'update: it worked 🙌', 'we did it. thank you for believing in me.'],
    meme: ['me: i will sleep early. also me at 3am:', 'my toxic trait is {toxic}', 'pov: you said "one episode"', '{thing} is a personality test', 'the group chat when someone says "we should hang out"', 'tell me you are tired without telling me you are tired', 'no thoughts, just {food}', 'my roman empire is {thing}'],
    romance: ['{pos} date night', 'cannot stop smiling lately', 'being loved is {pos}', 'missing someone who is just a text away', 'who else believes in second chances', 'my person 💞', 'butterflies and bad decisions'],
    poll: ['serious question: {debate_q}', 'settle this for me: {debate_q}', 'which one: {debate_a} or {debate_b}?', 'need recs: {song} or {food}?', 'unpopular opinion thread: go'],
    throwback: ['throwback to when life was simpler', 'found this old pic… we were so young', 'remember this? {time} feels like forever ago', 'a memory popped up and i am not okay'],
    night: ["can't sleep. again.", '3am thoughts hit different', 'up late for no reason at all', 'night drives and bad decisions', 'the quiet hours are the honest ones', 'insomnia gang where you at'],
    morning: ['good morning to everyone except {thing}', 'rise and shine… or at least rise', 'coffee first, personality later', 'new day, same me, better coffee', 'woke up and chose peace (kind of)'],
    shoutout: ['shoutout to {friend}, a real one', 'love my people: {friend} you are the best', '{friend} carried me this week fr', 'say thank you to {friend} in the comments', '{friend} gets me like nobody else'],
    callout: ['we need to talk about what {rival} did', 'since people keep asking: no, i will not apologise', 'i said what i said', 'receipts coming soon', 'tired of being the bigger person with {rival}', 'let the record show {rival} started it'],
    status: ['officially taken 💍', 'we are so back', 'it has been a minute, but it is over', 'single and thriving', 'happy anniversary to my favourite person'],
    travel: ['airport at 5am. send help.', 'new city, who dis', 'this view >>>', 'the best trips are the unplanned ones', 'passport stamped, heart full'],
    pet: ['my pet is judging me again', 'new roommate just dropped 🐾', 'the most important member of the household', 'someone is demanding snacks'],
    art: ['made something {time}. be kind.', 'work in progress ✨', 'creative block is real', 'sketchbook dump 🖤'],
  };
  const ATTACH = {
    selfie: ['a selfie in {place} with soft light', 'a mirror selfie in {outfit}', 'a close-up selfie, slightly squinting at the sun'],
    food: ['an overhead shot of {food}', 'a close-up of {food}', '{food}, steam still rising'],
    fitness: ['a gym mirror selfie, sweaty and smiling', 'a sunrise run, legs mid-stride', 'a stack of weights next to a water bottle'],
    nature: ['a sunset over the water', 'a quiet street after the rain', 'city lights from a rooftop'],
    travel: ['a window seat view of the clouds', 'a postcard-perfect street in a new city', 'a suitcase on a hotel bed'],
    pet: ['a pet making a ridiculous face', 'a sleepy pet curled up on the sofa'],
    art: ['a half-finished painting on an easel', 'a sketchbook page, pencil shavings everywhere'],
    party: ['a blurry dance floor with neon lights', 'friends clinking glasses'],
    romance: ['two coffee cups on a small table', 'a candlelit dinner for two'],
  };

  /* ---------- COMMENTS (by stance) ---------- */
  T.comment = {
    cheer: ['yesss!!', 'so proud of you', 'you deserve this', 'love this for you', 'go off!', 'obsessed 🔥', 'this is everything', 'legend behavior', 'W post', 'screaming for you', 'you did that!!'],
    compliment: ['gorgeous', 'that look 😍', 'you look amazing', 'okay we see you!', 'stunning honestly', 'the lighting?? the pose?? yes', 'serving looks', 'unfairly good-looking'],
    flirt: ['well hello 😏', 'you cannot just post this and expect me to function', 'okay that is unfair', 'stop being this cute', 'you are trouble and i like it', 'rude of you to look this good', 'text me. now.', 'my heart. my poor heart.', 'save some charm for the rest of us'],
    tease: ['lol not you posting this', 'the audacity', 'ok but who asked 😂', 'bold of you to assume…', 'this is so you', 'main character syndrome is real', 'i am telling everyone', 'iconic nonsense', 'we need to talk about this'],
    relate: ['same.', 'felt this', 'literally me', 'why is this so accurate', 'me too, honestly', 'i am in this picture and i do not like it', 'called out in my own comments'],
    empathize: ['sending love ❤️', 'here if you need to talk', 'you are not alone in this', 'proud of you for saying it', 'hugs', 'dm me if you want', 'it gets better, i promise', 'be gentle with yourself'],
    concern: ['are you okay?', 'hey, you good?', 'this sounds heavy. call me.', 'worried about you tbh', 'want me to come over?', 'check your dms please'],
    jealous: ['who took this?', 'who is the "friend" 👀', 'so we are just posting this now…', 'interesting.', 'cool. good for you i guess', 'must be nice', 'did not know you two were close', 'oh. okay.'],
    shade: ['must be nice 🙄', 'good for you!! (really)', 'some people have all the luck', 'wow. just wow.', 'no one asked but ok', 'love that for you (not really)', 'the humblebrag is crazy', 'we get it'],
    critique: ['respectfully, no', 'hard disagree', 'this take is… a choice', 'i cannot agree with that', 'this is the opposite of true', 'nope. not even close', 'let us not pretend that is reasonable', 'i see it differently'],
    agree: ['finally someone said it', 'facts', 'thank you!! this', '100% agree', 'exactly what i have been saying', 'preach', 'this. so much this.'],
    hostile: ['cringe', 'nobody asked', 'delete this', 'embarrassing', 'get a life', 'ratio', 'yikes', 'touch grass', 'this ain\'t it', 'who let them post'],
    defend: ['leave them alone', 'y\'all are being weird', 'they are allowed to post, relax', 'not the pile-on again', 'do better, all of you', 'ok but they did not do anything wrong', 'ignore the haters'],
    curious: ['wait where is this?', 'how did you do that?', 'ok tell me everything', 'story time??', 'what happened??', 'details please', 'wait what is the context'],
    indifferent: ['lol', 'ok', 'k', 'nice', 'cool', '👍', 'mm', 'fair', 'sure'],
    bandwagon: ['same as everyone here', 'the comments are right', 'can confirm', 'came here for this', 'top comment energy', 'everyone is saying it for a reason'],
    question: ['is this a vibe or a cry for help', 'wait… is this about us?', 'why does this feel like a subtweet?', 'hold on, who is this about?'],
    gossip: ['wait what?? tell me more', 'i KNEW it', 'not the tea!', 'spill', 'this timeline is wild today', 'hold on i need a snack for this'],
    // replying to comments on their own post
    thanks: ['thank you!!', 'aw thanks 🥹', 'you are too kind', 'appreciate you', 'love you for this', 'haha thanks', 'means a lot'],
    flirt_back: ['careful, i might believe you 😏', 'you are making me blush', 'okay now you are just spoiling me', 'mm, say that to my face', 'stop it 🙈 (do not)', 'you are trouble'],
    clapback: ['sure, whatever you say', 'and yet here you are, commenting', 'ok? and?', 'interesting how much you care', 'not everything is about you', 'cute opinion, not asking for it'],
    soften: ['i hear you, we can disagree', 'fair, let us leave it there', 'ok, thanks for the honesty', 'let us agree to disagree', 'noted, thanks'],
    // debates: the NPC takes a side
    debate_for: ['team {side} all the way', '{side}, no contest', 'correct. {side} wins.', 'i will die on this hill: {side}'],
    debate_against: ['nah, {other} for me', 'absolutely not, {other}', 'hard pass. {other} forever', 'this is why i say {other}'],
  };

  /* ---------- STORIES ---------- */
  T.story = {
    mood: ['{feeling} {time}', 'mood: {feeling}', 'today is {pos}', 'low battery, still here', 'running on {food} and spite'],
    food: ['{food} {time} 😋', 'staying fed: {food}', 'lunch break: {food}', 'dessert before dinner, always'],
    gym: ['{activity} {time} 💪', 'gym ✅', 'leg day, send help', 'morning run done'],
    commute: ['stuck on the train again', 'traffic is a personality test', 'on my way ✨', 'late as usual'],
    music: ['on repeat: {song}', '{song}, though', 'headphones on, world off'],
    selfie: ['quick selfie {time}', 'outfit of the day ✨', 'pic dump later', 'new haircut who dis'],
    poll: ['help me decide', 'vote!', 'settle this', 'choose wisely'],
    ask: ['ask me anything', 'questions? i have time', 'drop your questions 👇', 'be nice, ask me stuff'],
    night: ['can\'t sleep', 'late night thoughts', 'good night world 🌙', '3am again'],
    bored: ['so bored i reorganised my shelf', 'bored. entertain me.', 'nothing to do and all day to do it'],
    couple: ['with my favourite person 💞', 'date night ✨', 'us again'],
    drama: ['…', 'no comment.', 'some people need to hear this', 'moving in silence'],
    nature: ['golden hour 🌇', 'look at that sky', 'touching grass (finally)'],
  };
  const POLLS = [['pizza', 'tacos'], ['beach', 'mountains'], ['stay in', 'go out'], ['coffee', 'tea'], ['early', 'late'], ['cats', 'dogs'], ['text', 'call'], ['sweet', 'salty'], ['summer', 'winter']];

  /* ---------- DMs ---------- */
  T.dm = {
    checkin: ['hey, you alive?', 'been a minute, how are you?', 'random but i thought of you', 'what are you up to {time}?', 'you disappeared 👀', 'how is your week going?', 'hi stranger'],
    share: ['omg look at this 😭', 'this reminded me of you', 'you need to see this thread', 'found this {food} place, we are going', 'this song is so you', 'tell me this is not the funniest thing ever'],
    plan: ['wanna hang this weekend?', 'are you free tonight?', 'we should get {food}', 'come out with us tonight!', 'movie night? you pick', 'let us do something, i am bored'],
    flirt: ['you have been on my mind', 'cannot stop thinking about your last post', 'so… when are you taking me out?', 'you are dangerous for my focus', 'i am awake and thinking about you', 'you looked so good today it is annoying'],
    gossip: ['okay you will NOT believe what {x} did', 'did you see {x}\'s post?? it is about you', 'i heard something, are you free to talk?', 'tea. now. call me.', 'psst, {x} is being weird about you'],
    reactpost: ['saw your post lol 😂', 'that post tho 🔥', 'okay your last post was a lot', 'you good after that post?', 'i cannot believe you posted that', 'your post made my day', 'bold post, i respect it'],
    reactstory: ['your story 😭', 'wait where was that?', 'love the look in your story', 'who is that in your story??', 'story views: me, 5 times'],
    vent: ['can i vent to you?', 'rough day. need a friend.', 'i do not know who else to tell…', 'everything is falling apart lol', 'are you around? i need to talk'],
    apology: ['hey. i am sorry about before.', 'i have been thinking… i was wrong.', 'can we talk? i miss us', 'i overreacted, i am sorry', 'i hate fighting with you'],
    provoke_np: ['stay in your lane', 'cute that you think that is a flex', 'we both know how this ends', 'enjoy it while it lasts', 'you are not as untouchable as you think'],
    eventreact: ['did you see this?? {x}', 'ok this is wild: {x}', '{x}... are you seeing this', 'tell me you saw this: {x}', 'cannot believe it. {x}'],
    provoke: ['saw your post. try harder.', 'cute that you think that is a flex', 'we both know how this ends', 'stay in your lane', 'enjoy it while it lasts'],
    latenight: ['u up?', 'cannot sleep, thinking about you', 'this is probably a mistake but hi', 'miss you. there, i said it', 'you awake?'],
    hype: ['you are killing it lately!!', 'saw the numbers, so proud', 'teach me your ways', 'you are my favourite creator fr', 'everyone is talking about you'],
    ghost: ['sorry i have been quiet', 'life got crazy, you free to talk?', 'i am bad at texting, do not take it personally', 'hi, i am alive'],
    welcome: ['hey! just followed you 👋', 'hi!! love your content', 'we have mutuals, wanted to say hi'],
  };

  // fallback replies to what the player wrote (used when there is no API key / the model fails)
  T.reply = {
    greeting: { warm: ['hey you!', 'hiii 😊', 'hey! was just thinking about you', 'hi!! what are you up to?'], neutral: ['hey', 'hi', 'sup', 'hello'], cold: ['hi.', 'hey.', '…hi'], flirty: ['well hello there 😏', 'hey you… miss me?', 'well hi there'], hostile: ['what do you want', 'oh. it is you.', 'ugh. hi.'] },
    question: { warm: ['good question, honestly?', 'let me think about that 🤔', 'hmm, i would say yes', 'ask me later, i am curious too'], neutral: ['not sure', 'depends', 'maybe?', 'probably'], cold: ['why do you ask', 'does it matter', 'figure it out'], flirty: ['for you? anything 😏', 'depends… what is in it for me?'], hostile: ['why would i tell you', 'mind your business'] },
    flirt: { warm: ['stop, you are making me blush 🥰', 'you are sweet', 'okay that made my day', 'you always know what to say'], neutral: ['haha thanks', 'um, thanks?', 'ok, that was unexpected'], cold: ['let us keep it casual', 'not feeling it', 'awkward.'], flirty: ['mm, keep talking 😏', 'you are making this hard', 'say that again but closer', 'careful, i might say yes'], hostile: ['no.', 'seriously?', 'gross, no'] },
    insult: { warm: ['wow. that hurt.', 'why would you say that?', 'i thought we were better than this'], neutral: ['rude', 'okay then', 'wow'], cold: ['noted.', 'bye.', 'blocked energy'], flirty: ['mean. i kind of like it though', 'ouch. make it up to me?'], hostile: ['say it to my face', 'you are really something', 'oh we are doing this?', 'try me'] },
    invite: { warm: ['yes!! when?', 'i am in, tell me where', 'omg yes please', 'sounds fun, count me in'], neutral: ['maybe, let me check', 'could work', 'ask me later'], cold: ['busy', 'pass', 'not this time'], flirty: ['only if it is just us 😏', 'for you? always', 'pick me up at eight'], hostile: ['absolutely not', 'lol no'] },
    sad: { warm: ['hey, i am here. talk to me', 'oh no 😢 what happened?', 'come here, virtual hug', 'you matter, ok? tell me everything'], neutral: ['sorry to hear that', 'that sounds rough', 'hope it gets better'], cold: ['that is life', 'sorry.'], flirty: ['aw come here, let me make it better', 'i have got you, always'], hostile: ['not my problem', 'cry about it'] },
    thanks: { warm: ['anytime!', 'of course 🥰', 'always here for you'], neutral: ['np', 'sure', 'you are welcome'], cold: ['whatever', 'fine'], flirty: ['you can repay me later 😏', 'anything for you'], hostile: ['sure, whatever'] },
    bye: { warm: ['bye!! talk soon 💕', 'sleep well!', 'talk later, ok?'], neutral: ['bye', 'later', 'cya'], cold: ['k.', 'bye.'], flirty: ['dream of me 😏', 'bye… already missing you'], hostile: ['finally'] },
    apology: { warm: ['it is okay, really', 'thanks for saying that. i forgive you', 'we are good, come here'], neutral: ['okay. thanks.', 'i will think about it', 'fine'], cold: ['too little too late', 'we will see'], flirty: ['you are forgiven… if you make it up to me', 'okay but you owe me'], hostile: ['no.', 'sorry does not fix it'] },
    brag: { warm: ['omg that is amazing!!', 'so proud of you!!', 'tell me everything!', 'you deserve it'], neutral: ['nice', 'cool, congrats', 'good for you'], cold: ['good for you i guess', 'ok'], flirty: ['look at you 😏 impressive', 'celebrate with me?'], hostile: ['great. anyone asked?', 'wow, humble much'] },
    statement: { warm: ['i get that', 'tell me more', 'honestly, i feel you', 'that makes sense'], neutral: ['ok', 'i see', 'interesting', 'right'], cold: ['ok.', 'and?', 'sure'], flirty: ['mm, i like how you think 😏', 'keep going'], hostile: ['and why do i care', 'cool story'] },
  };

  /* ---------- helpers ---------- */
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const OPEN = ['ok but', 'honestly', 'no because', 'wait,', 'literally', 'not gonna lie,', 'bro,', 'okay', 'omg', 'lowkey', 'tbh', 'ngl', 'hear me out:', 'fine,'];
  const TOPIC_TAILS = ['that {topic} content though', '{topic} supremacy', 'the {topic} vibes are immaculate', 'more {topic} please', '{topic} is the move', 'this is why i love {topic}', 'peak {topic}'];
  const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  // memo: when given, a slot keeps ONE value across several fills (so a post's text and its photo caption agree)
  Voice.fill = function (tpl, ctx, rnd, memo) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => {
      if (ctx && ctx[k] != null) return ctx[k];
      if (SLOTS[k]) {
        if (memo && memo[k] != null) return memo[k];
        const v = pick(SLOTS[k], rnd);
        if (memo) memo[k] = v;
        return v;
      }
      return m;
    });
  };

  // make `text` sound like this NPC typed it
  Voice.stylize = function (text, n, rnd, o = {}) {
    const p = G.Persona.ensure(n);
    const st = p.style;
    let s = text;
    if (st.slang >= 2) {
      s = s.replace(/\byou\b/gi, (m) => (rnd() < 0.7 ? 'u' : m)).replace(/\byour\b/gi, (m) => (rnd() < 0.7 ? 'ur' : m)).replace(/\bbecause\b/gi, 'bc').replace(/\bgoing to\b/gi, 'gonna').replace(/\boh my god\b/gi, 'omg').replace(/\bi am\b/gi, "i'm").replace(/\bto be honest\b/gi, 'tbh');
    }
    if (st.slang >= 3 && rnd() < 0.4) s = s.replace(/\bvery\b/gi, 'so').replace(/\bwhat\b/i, 'wat');
    if (st.stretch && rnd() < 0.35) s = s.replace(/\b(so|yes|no|omg|hey|hi|love|please)\b/i, (m) => m + m[m.length - 1].repeat(1 + Math.floor(rnd() * 3)));
    if (p.catch !== undefined || p.quirks.catch.length) {
      if (p.quirks.catch.length && rnd() < 0.16 && !o.short) {
        const c = p.quirks.catch[0];
        s = rnd() < 0.5 ? `${c} ${s}` : `${s} ${c}`;
      }
    }
    if (st.noPunct && !st.formal) s = s.replace(/[.]+$/g, '');
    if (st.formal) {
      s = cap1(s);
      if (!/[.!?…]$/.test(s) && !/[\u{1F300}-\u{1FAFF}]/u.test(s)) s += '.';
    } else if (st.caps) s = s.toUpperCase() + (rnd() < 0.6 ? '!!' : '');
    else if (st.lower) s = s.toLowerCase();
    // emoji
    if (st.emoji && !o.noEmoji) {
      let k = st.emoji === 3 ? 1 + Math.floor(rnd() * 3) : st.emoji === 2 ? (rnd() < 0.7 ? 1 : 0) : rnd() < 0.3 ? 1 : 0;
      const bag = p.quirks.emoji.slice();
      k = Math.min(k, bag.length);
      for (let i = 0; i < k; i++) s += ' ' + bag.splice(Math.floor(rnd() * bag.length), 1)[0]; // distinct emoji, no 💀 🤍 💀
    }
    return s.trim();
  };

  // choose a template that this NPC has not used recently
  const fresh = (list, n, rnd, key) => {
    let best = list[Math.floor(rnd() * list.length)];
    for (let i = 0; i < 6; i++) {
      const c = list[Math.floor(rnd() * list.length)];
      if (!G.Persona.recently(n, key + ':' + c)) {
        best = c;
        break;
      }
    }
    G.Persona.remember(n, key + ':' + best);
    return best;
  };

  const base = (n, ctx) => Object.assign({ author: ctx.authorName || '', first: U.first(ctx.authorName || '') }, ctx.slots || {});

  /* ---------- generators ---------- */

  // an NPC's own post. kind chosen by caller; returns { kind, text, attach, topics, ptype }
  Voice.post = function (n, kind, ctx) {
    const rnd = ctx.rnd;
    const p = G.Persona.ensure(n);
    const list = T.post[kind] || T.post.selfie;
    const c = Object.assign(base(n, ctx), ctx.slots || {});
    if (kind === 'poll' && ctx.debate) {
      c.debate_q = ctx.debate.q;
      c.debate_a = ctx.debate.a;
      c.debate_b = ctx.debate.b;
    }
    const memo = {};
    let text = G.Bank && rnd() < 0.85 ? G.Bank.take(n, 'post', kind) : null; // an AI-written line in their own voice, if one is banked
    if (!text) {
      const tpl = fresh(list, n, rnd, 'post-' + kind);
      text = Voice.stylize(Voice.fill(tpl, c, rnd, memo), n, rnd);
    }
    let attach = '';
    const photoKinds = ['selfie', 'food', 'fitness', 'travel', 'pet', 'art', 'romance', 'throwback'];
    const a = ATTACH[kind] || (kind === 'throwback' ? ATTACH.selfie : null);
    const wantsPhoto = photoKinds.includes(kind) && (rnd() < 0.55 + p.t.A / 400 + (kind === 'selfie' ? 0.35 : 0));
    if (a && wantsPhoto) attach = Voice.fill(pick(a, rnd), c, rnd, memo);
    return { kind, text, attach, ptype: attach ? 'photo' : kind === 'poll' ? 'poll' : '', poll: kind === 'poll' && ctx.debate ? [ctx.debate.a, ctx.debate.b] : null };
  };

  /* ---------- common sense: lines that FIT what was said (G.Mind decides what is appropriate) ---------- */
  const CARE_EMOJI = ['🫂', '🤍', '💙'];
  const HAPPY_EMOJI = ['🎉', '🥳', '🙌', '❤️'];
  // care / congratulations in this person's own typing style, never a joke. Returns '' (say nothing), a line, or null (nothing delicate here).
  // ctx: { post | about, rel, rnd, authorName }   stance (optional): good news is only answered warmly by warm stances
  Voice.care = function (n, ctx, stance) {
    const M = G.Mind;
    if (!M || !ctx) return null;
    const about = ctx.about != null ? ctx.about : ctx.post ? (ctx.post.text || '') + ' ' + (ctx.post.attach || '') : '';
    if (!about) return null;
    const r = M.read(about);
    if (r.sens < 0.5 && !r.good) return null;
    const rel = ctx.rel || (ctx.post && G.React && G.S ? G.React.relation(G.S, n, ctx.post.author) : { c: 0.2, h: 0 });
    if (r.good && (rel.h > 0.5 || (stance && !['cheer', 'compliment', 'agree', 'relate', 'bandwagon', 'empathize', 'concern', 'curious', 'indifferent'].includes(stance)))) return null;
    const rnd = ctx.rnd || Math.random;
    let line = M.respond(n, { about, rel, to: U.first(ctx.authorName || ''), rnd });
    if (!line) {
      if (!(ctx.dm || ctx.anon) || (rel.h || 0) > 0.5 || r.sens < 0.5) return ''; // in public, or an enemy: say nothing. Answering a private message, even a stranger is polite
      line = 'i am sorry you are going through that. take care of yourself';
    }
    const happy = r.good && r.sens < 0.5;
    const p = G.Persona.ensure(n);
    let s = p.style.caps ? line.toUpperCase() : Voice.stylize(line, n, rnd, { short: true, noEmoji: true });
    if (p.style.emoji >= 2 && !p.style.caps && rnd() < 0.5) s += ' ' + pick(happy ? HAPPY_EMOJI : CARE_EMOJI, rnd);
    if (!happy && M.flippant(s)) s = line; // typing style must never turn care into a joke
    return s;
  };

  // answers to questions, indexed by what is being asked
  const ASKS = [
    [/\bwho(?:'s| is)? (?:else )?(?:is )?(?:up|awake|here|online|watching|going)\b|\banyone (?:else )?(?:up|awake|here|online|watching)\b/i, ['me!', 'i am up', 'here, wide awake', 'present', 'same, cannot sleep', 'right here']],
    [/\bplans\b/i, ['no plans yet, you?', 'nothing yet. ideas?', 'probably staying in tbh', 'open to ideas', 'thinking about going out, you in?']],
    [/\b(?:how are (?:you|we|y'all)|how is everyone|how'?s everyone|what'?s up)\b/i, ['doing good, you?', 'surviving, you?', 'pretty good today, thanks for asking', 'could be worse, you?']],
    [/\b(?:advice|tips|should i|help me|need help|recs?|recommend\w*)\b/i, ['hmm, tell me more and i will help think it through', 'honestly i would go with your gut', 'what are you leaning towards?', 'happy to help, what do you need?']],
  ];
  const ASK_GENERIC = ['good question, honestly not sure', 'depends on the day tbh', 'honestly? yes', 'hmm, can i get back to you?', 'no idea but now i want to know too', 'i say yes'];
  const ORQ = /([a-z][a-z' ]{1,22}?)\s+or\s+([a-z][a-z' ]{1,22}?)\s*\?+\s*$/i;
  const SITU = [
    [/\bgood ?morning\b|\brise and shine\b/i, ['morning!', 'good morning, hope it is a good one', 'morning, coffee first', 'morning to you too']],
    [/\bgood ?night\b|\bsleep well\b|\bheading to bed\b/i, ['good night, sleep well', 'night!', 'sleep well, see you tomorrow', 'sweet dreams']],
    [/\b(?:can'?t|cannot) sleep\b|\b3 ?am\b|\binsomnia\b|\bup late\b/i, ['same, my brain will not switch off', 'try some tea? and put the phone down', 'me too honestly', 'go to bed soon, you need it']],
    [/\b(?:rough|tough|long|bad|hard) (?:day|week|night|morning)\b|\bnot my day\b/i, ['hope tomorrow is kinder to you', 'sorry, hope it gets easier', 'rough days pass. proud of you for getting through it', 'want to talk about it?']],
    [/\b(?:big|huge|major) news\b|\bannouncement\b/i, ['ok now i need to know', 'you cannot just say that and leave', 'tell us!!', 'the suspense is awful']],
    [/\bi quit\b|\bquit(?:ting)?\b/i, ['wait, quit what?? tell me everything', 'ok now i need the story', 'are you okay? that is a big step']],
  ];
  // topic -> [warm, curious, playful]
  const TOPICAL = {
    food: [['that looks so good', 'now i am hungry', 'save me some', 'good choice honestly'], ['wait where is this from?', 'recipe please', 'how was it?', 'is it worth it?'], ['you are not sharing, are you', 'dangerous to post this before lunch', 'i hope you ordered two']],
    fitness: [['look at you go', 'consistency looks good on you', 'love the discipline'], ['what is your routine?', 'how long did that take?', 'what are you training for?'], ['my couch and i are impressed', 'sore just reading this', 'please do not tell me what time you woke up']],
    music: [['need to hear this', 'this sounds so good', 'put it on repeat'], ['what is it called?', 'send the link', 'drop it already', 'who is it by?'], ['volume up, neighbours be damned', 'my playlist needed this', 'okay but is it a banger or just loud']],
    fashion: [['that is a great fit', 'love the style', 'so good on you'], ['where is it from?', 'link please', 'what size is that?'], ['my closet just got jealous', 'okay stylist, share your secrets']],
    love: [['aww this is sweet', 'love that for you', 'cute honestly'], ['wait, who is this about?', 'tell us more'], ['okay romantic', 'somebody is smitten']],
    friends: [['love this crew', 'you have good people'], ['when is the next one?', 'can i join next time?'], ['invite me next time', 'the group chat is going to hear about this']],
    work: [['you got this', 'hang in there, it pays off', 'proud of the effort'], ['how is it going?', 'what is the project?'], ['monday behaviour', 'please log off at some point']],
    school: [['you got this, good luck', 'almost there'], ['when is the exam?', 'how many chapters left?'], ['library gang represent', 'the real exam is the sleep schedule']],
    travel: [['what a view', 'looks amazing', 'enjoy every minute'], ['where is this?', 'how long are you staying?', 'worth the trip?'], ['pack me in your suitcase', 'wish you were not having this much fun']],
    gaming: [['nice one', 'let us play later'], ['what rank are you?', 'which game is this?'], ['one more round, famous last words', 'touching the controller counts as cardio']],
    movies: [['great pick', 'that one is so good'], ['is it worth watching?', 'no spoilers but how was it?', 'what is it called?'], ['see you in three hours, one more episode', 'popcorn is mandatory']],
    art: [['so talented', 'love this', 'the colours are great'], ['how long did it take?', 'what did you use?'], ['okay picasso', 'my doodles are crying']],
    tech: [['nice setup', 'that is clever'], ['does it actually work?', 'which one is it?'], ['have you tried turning it off and on again', 'my wifi could never']],
    money: [['good move', 'smart choice'], ['how did you plan that?', 'is it worth it?'], ['my bank account felt that']],
    mental: [['be gentle with yourself', 'take it easy today'], ['do you want to talk about it?', 'are you getting enough rest?'], ['sleep is not optional, you know']],
    pets: [['so cute', 'what a face', 'look at that face'], ['what is their name?', 'how old are they?'], ['they run the house, clearly', 'give them a treat from me']],
    party: [['looks like fun', 'have a great time'], ['where is this?', 'was it worth it?'], ['invite me next time', 'see you at the afterparty']],
    drama: [['hope it gets sorted out', 'take care of yourself in all this'], ['wait, what happened?', 'context please?'], ['popcorn time']],
    memes: [['this is accurate', 'ha, good one'], ['source?', 'wait is this real?'], ['screenshotted', 'sending this to the group chat']],
    sports: [['what a game', 'great result'], ['what was the score?', 'who won?'], ['my team will never recover', 'coach would be proud']],
    nature: [['what a view', 'so peaceful', 'beautiful'], ['where is this?', 'when was this taken?'], ['okay now i want to go outside']],
    books: [['good choice', 'love that book'], ['is it worth reading?', 'what is it about?'], ['my to-read pile is crying']],
    beauty: [['that glow', 'love the look'], ['what products?', 'routine please'], ['my skincare routine is a joke next to this']],
    _: [['love this', 'ha, good one', 'nice one', 'aw, nice', 'this made me smile'], ['wait, tell me more', 'what is the story?', 'ok and then?'], ['ha, you again', 'okay, noted', 'look who is posting']],
  };
  const WARM_ST = ['cheer', 'agree', 'compliment', 'relate'];
  // a line about WHAT THE POST IS ABOUT, for ordinary posts. null = nothing topical to say (use the stance templates)
  Voice.topical = function (n, stance, ctx) {
    const post = ctx && ctx.post;
    if (!post || !G.Mind || !G.Lex) return null;
    const rnd = ctx.rnd;
    if (!['cheer', 'agree', 'compliment', 'curious', 'tease', 'gossip'].includes(stance)) return null; // relate / bandwagon / indifferent lines are generic by nature
    const text = String(post.text || '');
    const all = text + ' ' + (post.attach || '');
    const r = G.Mind.read(all);
    const fx = post.fx || {};
    const out = (list, key) => Voice.stylize(fresh(list, n, rnd, key), n, rnd, { short: true });
    // 1. situations with an obvious fitting reply
    for (const [rx, lines] of SITU) if (rx.test(text)) return out(lines, 'ct-situ');
    // 2. questions get answers
    if (r.ask || /\?/.test(text)) {
      for (const [rx, lines] of ASKS) if (rx.test(text)) return out(lines, 'ct-ask');
      const m = text.match(ORQ);
      if (m) {
        const a = m[1].trim().replace(/^(?:which one|serious question|settle this for me|need recs)\s*:?\s*/i, '');
        const b = m[2].trim();
        if (a && b && a.toLowerCase() !== b.toLowerCase()) {
          const x = rnd() < 0.5 ? a : b;
          return Voice.stylize(pick(['{x}, easy', '{x} all day', 'team {x}', '{x}. no contest', 'honestly {x}'], rnd).replace('{x}', x.toLowerCase()), n, rnd, { short: true });
        }
      }
      return out(ASK_GENERIC, 'ct-askg');
    }
    if (rnd() > 0.88 && !(stance === 'cheer' || stance === 'agree' || stance === 'compliment')) return null; // a little variety: sometimes the plain stance line is fine (the warm templates are NOT: they only fit celebrations)
    // 3. celebratory and photo posts keep their stance templates (they already fit)
    const celebratory = r.good || r.brag || (fx.pos || 0) >= 0.5;
    const photoish = fx.photo || !!post.attach || /\b(selfie|outfit|fit|look|pic|photo|mirror)\b/i.test(text);
    if (stance === 'cheer' && celebratory) return null;
    if (stance === 'compliment' && photoish) return null;
    if (stance === 'agree' && (fx.debate || (fx.ctrl || 0) >= 0.3)) return null;
    // 4. what is it about?
    let topic = (fx.topics && fx.topics[0]) || (G.Lex.analyze(all).topics || [])[0];
    if (!TOPICAL[topic]) topic = '_';
    const bank = TOPICAL[topic];
    if (stance === 'curious' || stance === 'gossip') return out(bank[1], 'ct-' + topic + '-q');
    if (stance === 'tease') return out(bank[2], 'ct-' + topic + '-p');
    return out(bank[0], 'ct-' + topic + '-w');
  };

  // a comment from n on a post, given a stance chosen by the reaction model
  Voice.comment = function (n, stance, ctx) {
    const rnd = ctx.rnd;
    if (ctx.post && G.Mind) {
      const care = Voice.care(n, ctx, stance); // delicate post or good news: care / congratulations ('' = say nothing)
      if (care != null) return care;
      const fit = Voice.topical(n, stance, ctx); // ordinary post: a line about what it is about
      if (fit) return fit;
    }
    const c = Object.assign(base(n, ctx), { side: ctx.side || '', other: ctx.other || '' });
    let key = stance;
    if (stance === 'debate') key = ctx.agree ? 'debate_for' : 'debate_against';
    const banked = G.Bank && rnd() < 0.75 ? G.Bank.take(n, 'comment', key) : null;
    if (banked) return banked;
    const list = T.comment[key] || T.comment.indifferent;
    const tpl = fresh(list, n, rnd, 'c-' + key);
    let text = Voice.fill(tpl, c, rnd);
    // garnish: openers, addressing the author by name, and a nod to what the post was about
    const casual = !['hostile', 'indifferent', 'critique', 'concern', 'empathize', 'debate_for', 'debate_against'].includes(key);
    if (casual && rnd() < 0.3) text = pick(OPEN, rnd) + ' ' + text;
    const first = U.first(ctx.authorName || '');
    if (first && casual && rnd() < 0.2) text = text.replace(/[.!]*$/, '') + ', ' + first;
    if (ctx.topic && ['cheer', 'compliment', 'relate', 'curious', 'tease', 'agree', 'flirt'].includes(key) && rnd() < 0.22) text += ' — ' + Voice.fill(pick(TOPIC_TAILS, rnd), { topic: ctx.topic }, rnd);
    // sometimes address the author by name / mention
    if (ctx.authorHandle && rnd() < 0.18 && !['indifferent', 'hostile'].includes(stance)) text = ctx.authorHandle + ' ' + text;
    return Voice.stylize(text, n, rnd, { short: true, noEmoji: stance === 'hostile' && rnd() < 0.5 });
  };

  Voice.plainComment = Voice.comment; // the version without the memory / story callbacks other modules wrap around it (the safe fallback)

  // a short, neutral thank-you for a reply under the NPC's own post, when the smart line was refused
  Voice.safeReply = function (n, rnd) {
    return Voice.stylize(pick(['thank you', 'means a lot', 'appreciate you', 'thanks, really'], rnd), n, rnd, { short: true, noEmoji: true });
  };

  Voice.story = function (n, kind, ctx) {
    const rnd = ctx.rnd;
    const list = T.story[kind] || T.story.mood;
    const c = base(n, ctx);
    const banked = G.Bank && kind !== 'poll' && kind !== 'ask' && rnd() < 0.8 ? G.Bank.take(n, 'story') : null;
    const tpl = banked ? null : fresh(list, n, rnd, 'story-' + kind);
    const text = banked || Voice.stylize(Voice.fill(tpl, c, rnd), n, rnd, { short: true });
    const out = { kind, text, emoji: '', poll: null };
    if (kind === 'poll') out.poll = pick(POLLS, rnd).slice();
    return out;
  };

  Voice.dm = function (n, kind, ctx) {
    const rnd = ctx.rnd;
    let key = kind;
    const bankedDm = G.Bank && rnd() < 0.8 ? G.Bank.take(n, 'dm', key) : null;
    if (bankedDm) return bankedDm;
    const list = T.dm[key] || T.dm.checkin;
    const c = Object.assign(base(n, ctx), { x: ctx.x || 'someone' });
    const tpl = fresh(list, n, rnd, 'dm-' + key);
    return Voice.stylize(Voice.fill(tpl, c, rnd), n, rnd, { short: true });
  };

  // fallback reply to the player's DM (no API needed)
  Voice.dmReply = function (n, playerText, tone, ctx) {
    const rnd = ctx.rnd;
    const care = Voice.care(n, { about: String(playerText || ''), rel: ctx.rel, rnd, authorName: ctx.authorName || '', dm: true, anon: ctx.anon }); // they just told you something heavy (or wonderful)
    if (care != null) return { intent: G.Lex.intent(playerText), text: care };
    const intent = G.Lex.intent(playerText);
    const set = T.reply[intent] || T.reply.statement;
    const list = set[tone] || set.neutral;
    const tpl = fresh(list, n, rnd, 'reply-' + intent + '-' + tone);
    return { intent, text: Voice.stylize(Voice.fill(tpl, base(n, ctx), rnd), n, rnd, { short: true }) };
  };

  Voice.SLOTS = SLOTS;
  Voice.T = T;
  Voice.KINDS = Object.keys(T.post);
})(window.G);
