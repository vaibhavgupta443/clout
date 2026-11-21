/* Clout — lexicon: what a post is ABOUT (topics), how it FEELS (sentiment), which DEBATE it touches.
   Used by the reaction model so different people respond differently to the same post. */
(function (G) {
  const Lex = (G.Lex = {});

  // topic -> keywords (matched on word stems)
  Lex.TOPICS = {
    food: ['pizza', 'food', 'eat', 'lunch', 'dinner', 'breakfast', 'cook', 'recipe', 'ramen', 'taco', 'sushi', 'burger', 'coffee', 'dessert', 'snack', 'brunch', 'hungry', 'baking', 'pasta', 'cake'],
    fitness: ['gym', 'workout', 'lift', 'run', 'cardio', 'gains', 'leg day', 'protein', 'yoga', 'marathon', 'stretch', 'training', 'fit', 'pr '],
    music: ['song', 'album', 'playlist', 'concert', 'band', 'music', 'lyrics', 'singer', 'dj', 'beat', 'karaoke', 'vinyl', 'festival'],
    fashion: ['outfit', 'fit', 'dress', 'style', 'wear', 'shoes', 'jacket', 'drip', 'thrift', 'streetwear', 'makeup', 'hair', 'nails'],
    love: ['love', 'date', 'crush', 'kiss', 'boyfriend', 'girlfriend', 'partner', 'relationship', 'heart', 'romantic', 'miss you', 'flirt', 'single', 'ex ', 'breakup', 'taken', 'cuddle'],
    friends: ['friend', 'bestie', 'squad', 'crew', 'group chat', 'hang out', 'sleepover', 'shoutout', 'homies'],
    work: ['work', 'job', 'boss', 'meeting', 'deadline', 'career', 'promotion', 'client', 'office', 'hustle', 'grind', 'internship', 'project'],
    school: ['class', 'exam', 'study', 'homework', 'professor', 'campus', 'lecture', 'finals', 'grades', 'library', 'semester'],
    travel: ['travel', 'trip', 'flight', 'vacation', 'beach', 'hotel', 'passport', 'road trip', 'city', 'airport', 'hiking'],
    gaming: ['game', 'gaming', 'stream', 'ranked', 'console', 'controller', 'level up', 'esports', 'lobby', 'quest'],
    movies: ['movie', 'film', 'series', 'episode', 'netflix', 'show', 'trailer', 'cinema', 'binge', 'anime', 'season'],
    art: ['art', 'paint', 'sketch', 'draw', 'design', 'photo', 'poetry', 'write', 'creative', 'gallery', 'film photography'],
    tech: ['tech', 'app', 'code', 'ai', 'phone', 'laptop', 'startup', 'gadget', 'software', 'update', 'wifi'],
    money: ['money', 'broke', 'rent', 'bills', 'salary', 'invest', 'crypto', 'budget', 'paid', 'rich', 'expensive', 'afford'],
    mental: ['anxiety', 'therapy', 'burnout', 'stress', 'sleep', 'tired', 'overthinking', 'mental health', 'self care', 'healing', 'panic', 'lonely'],
    pets: ['dog', 'cat', 'puppy', 'kitten', 'pet', 'rescue', 'vet'],
    party: ['party', 'club', 'drinks', 'night out', 'dance', 'rooftop', 'afterparty', 'birthday', 'shots', 'rave'],
    drama: ['drama', 'tea', 'beef', 'exposed', 'receipts', 'cancel', 'callout', 'toxic', 'fake', 'snake', 'shade', 'ratio', 'messy'],
    memes: ['meme', 'lol', 'lmao', 'pov', 'toxic trait', 'unpopular opinion', 'no one:', 'me:', 'bro', 'real'],
    sports: ['game', 'match', 'team', 'score', 'goal', 'basketball', 'football', 'soccer', 'tournament', 'coach'],
    nature: ['sunset', 'sunrise', 'mountain', 'ocean', 'forest', 'rain', 'snow', 'flowers', 'garden', 'stars', 'moon'],
    books: ['book', 'read', 'novel', 'author', 'chapter', 'library', 'fantasy', 'poetry'],
    beauty: ['skincare', 'glow', 'beauty', 'lashes', 'perfume', 'selfie', 'filter'],
  };
  Lex.TOPIC_LIST = Object.keys(Lex.TOPICS);

  const POS = ['love', 'amazing', 'best', 'happy', 'proud', 'grateful', 'blessed', 'beautiful', 'perfect', 'excited', 'win', 'yay', 'obsessed', 'incredible', 'finally', 'thank', 'good', 'great', 'wonderful', 'fun', 'laugh', 'smile'];
  const NEG = ['hate', 'sad', 'tired', 'angry', 'worst', 'cry', 'hurt', 'broken', 'annoyed', 'sick', 'awful', 'terrible', 'lonely', 'ugh', 'done with', 'exhausted', 'miss', 'alone', 'anxious', 'stressed', 'fed up', 'toxic', 'fake', 'hospital', 'funeral', 'cancer', 'surgery', ' died', 'passed away', 'scared', 'crying', 'grief', 'terrified', 'devastated', 'heartbroken'];
  const BRAG = ['booked', 'promoted', 'signed', 'new car', 'new job', 'sold out', 'milestone', 'million', 'k followers', 'award', 'winning', 'upgrade', 'vip', 'first class', 'got the', 'just got', 'deal', 'trophy', 'accepted'];
  const VULN = ['honestly', 'struggling', 'not okay', 'anxious', 'scared', 'need a break', 'overwhelmed', 'lonely', 'cry', 'hard time', 'tired of', 'depressed', 'vent', 'sorry for', 'healing', 'fine (not fine)', 'pretending', 'hospital', ' icu', 'surgery', 'cancer', 'funeral', 'passed away', ' died', 'grieving', 'diagnos', 'ambulance', 'emergency room', 'miss him so much', 'miss her so much', 'terrified', 'crying', 'panic attack', 'breaking down', 'falling apart', 'lost my', 'broke up', "can't sleep", 'alone tonight'];
  const FLIRT = ['cute', 'hot', 'gorgeous', 'kiss', 'date', 'crush', 'flirt', 'handsome', 'beautiful', 'miss you', 'come over', 'tonight', 'sexy', 'babe', 'baby', 'text me', 'thinking about you', 'blushing', 'wink', '😏', '😘', '😍', '🔥'];
  const CTRL = ['unpopular opinion', 'hot take', 'overrated', 'underrated', 'cancel', 'toxic', 'should', 'never', 'always', 'worst', 'best', 'ban', 'stop', 'disagree', 'wrong', 'vs', 'debate', 'fight me'];
  const SHADE = ['some people', 'funny how', 'not naming names', 'you know who', 'fake', 'snake', 'two-faced', 'receipts', 'lol ok', 'imagine', 'wild how', 'noted'];

  // Non-political, safe debates people argue about. Each person gets a stable opinion on each.
  Lex.DEBATES = [
    { id: 'hustle', kw: ['hustle', 'grind', 'rise and grind', 'work hard', 'burnout'], q: 'is hustle culture motivating or toxic?', a: 'hustle culture', b: 'slow living' },
    { id: 'aiart', kw: ['ai art', 'ai generated', 'generative', 'ai music', 'chatgpt'], q: 'is AI-generated art real art?', a: 'AI art', b: 'human art' },
    { id: 'pineapple', kw: ['pineapple', 'pizza topping'], q: 'pineapple on pizza: yes or no?', a: 'pineapple pizza', b: 'normal pizza' },
    { id: 'cancel', kw: ['cancel culture', 'cancelled', 'canceled', 'callout culture'], q: 'is cancel culture accountability or a mob?', a: 'accountability', b: 'mob rule' },
    { id: 'phonefree', kw: ['detox', 'delete instagram', 'offline', 'screen time', 'quit social media', 'phone free'], q: 'should we all quit social media?', a: 'logging off', b: 'staying online' },
    { id: 'exfriends', kw: ['ex friends', 'friends with my ex', 'stay friends', 'text my ex'], q: 'can you really stay friends with an ex?', a: 'staying friends', b: 'full no contact' },
    { id: 'pda', kw: ['pda', 'public display', 'kissing in public'], q: 'is PDA cute or cringe?', a: 'PDA', b: 'keeping it private' },
    { id: 'ghosting', kw: ['ghosting', 'ghosted', 'left on read', 'seen zone'], q: 'is ghosting ever okay?', a: 'ghosting', b: 'honest closure' },
    { id: 'situationship', kw: ['situationship', 'talking stage', 'undefined', 'no labels'], q: 'situationships: fun or a trap?', a: 'no labels', b: 'real commitment' },
    { id: 'morning', kw: ['morning person', '5am', 'night owl', 'wake up early', 'early bird'], q: 'morning people or night owls?', a: 'mornings', b: 'late nights' },
    { id: 'tipping', kw: ['tipping', 'tip culture', 'gratuity'], q: 'is tipping culture out of control?', a: 'tip generously', b: 'tipping is too much' },
    { id: 'remote', kw: ['remote work', 'work from home', 'office life', 'return to office'], q: 'remote work or office?', a: 'working remotely', b: 'the office' },
    { id: 'realitytv', kw: ['reality tv', 'love island', 'bachelor', 'trash tv'], q: 'is reality TV a guilty pleasure or just good TV?', a: 'reality TV', b: 'prestige TV' },
    { id: 'gymbro', kw: ['gym bro', 'gym selfie', 'mirror selfie', 'protein shake'], q: 'gym selfies: inspiring or insufferable?', a: 'gym selfies', b: 'keeping workouts private' },
    { id: 'texting', kw: ['double text', 'text first', 'texting back', 'dry text'], q: 'is double-texting fine?', a: 'texting first', b: 'playing it cool' },
  ];

  const has = (low, list) => {
    let n = 0;
    for (const k of list) if (low.includes(k)) n++;
    return n;
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // text -> { topics:[], tags:[], mentions:[], sent:{pos,neg,brag,vuln,flirt,ctrl,shade,question}, debate }
  Lex.analyze = function (text) {
    const raw = String(text || '');
    const low = ' ' + raw.toLowerCase() + ' ';
    const topics = [];
    for (const [t, kws] of Object.entries(Lex.TOPICS)) {
      const hit = kws.filter((k) => (k.length <= 3 ? new RegExp('\\b' + k + '\\b').test(low) : low.includes(k.endsWith(' ') ? k : k))).length;
      if (hit) topics.push([t, hit]);
    }
    topics.sort((a, b) => b[1] - a[1]);
    const tags = (raw.match(/#[\p{L}\p{N}_]{2,30}/gu) || []).map((t) => t.toLowerCase());
    const mentions = (raw.match(/@[A-Za-z0-9_.]{2,30}/g) || []).map((m) => m.toLowerCase());
    const sent = {
      pos: clamp01(has(low, POS) / 2),
      neg: clamp01(has(low, NEG) / 2),
      brag: clamp01(has(low, BRAG) / 1.5),
      vuln: clamp01(has(low, VULN) / 1.5),
      flirt: clamp01(has(low, FLIRT) / 2),
      ctrl: clamp01(has(low, CTRL) / 1.5),
      shade: clamp01(has(low, SHADE) / 1.2),
      question: /\?/.test(raw) ? 1 : 0,
    };
    let debate = null;
    for (const d of Lex.DEBATES) {
      if (has(low, d.kw)) {
        debate = d.id;
        break;
      }
    }
    if (debate) sent.ctrl = Math.max(sent.ctrl, 0.8);
    // VADER (vendored, built for social-media text: emoji, slang, CAPS, negation, '!!!') refines the polarity
    try {
      if (window.vader) {
        const v = window.vader.SentimentIntensityAnalyzer.polarity_scores(raw);
        sent.compound = v.compound;
        sent.pos = Math.max(sent.pos, clamp01(v.compound > 0.05 ? v.compound * 1.1 : 0));
        sent.neg = Math.max(sent.neg, clamp01(v.compound < -0.05 ? -v.compound * 1.1 : 0));
      }
    } catch (e) {}
    return { topics: topics.slice(0, 3).map((t) => t[0]), tags, mentions, sent, debate };
  };

  /* ---------- visual "media" for posts: emoji + palette per topic (drawn as gradient tiles, no images needed) ---------- */
  Lex.SCENES = {
    food: { emoji: ['🍕', '🍜', '🌮', '🍣', '🥑', '🍔', '🧁', '🍝'], hue: 28 },
    fitness: { emoji: ['🏋️', '🏃', '🧘', '💪', '🚴'], hue: 205 },
    music: { emoji: ['🎧', '🎤', '🎸', '🎹', '🎶'], hue: 280 },
    fashion: { emoji: ['👗', '👟', '🧥', '👜', '💄'], hue: 320 },
    love: { emoji: ['💞', '🌹', '💌', '🥂', '💘'], hue: 345 },
    friends: { emoji: ['🫶', '🥳', '📸', '🍻', '🤝'], hue: 45 },
    work: { emoji: ['💼', '📈', '☕', '💻', '📝'], hue: 215 },
    school: { emoji: ['📚', '✏️', '🎓', '🧠'], hue: 190 },
    travel: { emoji: ['✈️', '🏝️', '🗺️', '🚆', '🌍'], hue: 175 },
    gaming: { emoji: ['🎮', '🕹️', '👾', '🏆'], hue: 262 },
    movies: { emoji: ['🎬', '🍿', '📺', '🎞️'], hue: 12 },
    art: { emoji: ['🎨', '🖼️', '✍️', '📷'], hue: 300 },
    tech: { emoji: ['💻', '🤖', '📱', '⚡'], hue: 200 },
    money: { emoji: ['💸', '💰', '📊', '🪙'], hue: 140 },
    mental: { emoji: ['🌙', '🕯️', '🌧️', '🫂'], hue: 235 },
    pets: { emoji: ['🐶', '🐱', '🐾', '🐰'], hue: 35 },
    party: { emoji: ['🪩', '🍾', '🎉', '🥂', '💃'], hue: 310 },
    drama: { emoji: ['🍵', '👀', '🔥', '🐍'], hue: 5 },
    memes: { emoji: ['😂', '💀', '🤡', '🫠'], hue: 55 },
    sports: { emoji: ['⚽', '🏀', '🏆', '🥇'], hue: 120 },
    nature: { emoji: ['🌅', '🌲', '🌊', '🌸', '🌙'], hue: 160 },
    books: { emoji: ['📖', '📚', '🕯️'], hue: 25 },
    beauty: { emoji: ['✨', '💅', '🪞', '🌷'], hue: 335 },
    selfie: { emoji: ['🤳', '😎', '✨', '📸'], hue: 20 },
    default: { emoji: ['✨', '📸', '🌈', '💫'], hue: 250 },
  };
  // deterministic "photo" for a post: { emoji, hue, hue2 }
  Lex.sceneFor = function (topics, seedText) {
    const t = (topics && topics[0]) || 'default';
    const sc = Lex.SCENES[t] || Lex.SCENES.default;
    const h = G.U.hash(String(seedText || t));
    return { key: Lex.SCENES[t] ? t : 'default', emoji: sc.emoji[h % sc.emoji.length], emoji2: sc.emoji[(h >> 4) % sc.emoji.length], hue: (sc.hue + (h % 40) - 20 + 360) % 360, hue2: (sc.hue + 40 + ((h >> 8) % 60) + 360) % 360 };
  };

  // what the player (or anyone) wrote -> intent, for fallback DM replies
  Lex.intent = function (text) {
    const low = String(text || '').toLowerCase();
    const t = (re) => re.test(low);
    if (t(/\b(sorry|apolog|my bad|forgive)\b/)) return 'apology';
    if (t(/\b(love you|miss you|kiss|cute|hot|gorgeous|beautiful|handsome|come over|date me|go out|babe|baby|crush|thinking about you|sexy|bed)\b|😘|😏|😍/)) return 'flirt';
    if (t(/\b(hate|stupid|idiot|shut up|ugly|loser|trash|cringe|fake|snake|ex-?pose|leak|screw you|f\*+k you)\b/)) return 'insult';
    if (t(/\b(wanna|want to|are you free|hang out|meet up|come to|let'?s go|tonight|this weekend|party|dinner|coffee)\b/)) return 'invite';
    if (t(/\b(sad|cry|crying|anxious|depress|lonely|bad day|rough|hurts|scared|stressed|tired of|hospital|funeral|died|passed away|surgery|cancer|diagnos\w*|grie\w+|heartbroken|devastated|panic\w*|terrified|lost my (?:job|mom|dad|dog|cat|friend)|broke up)\b/)) return 'sad';
    if (t(/\b(thanks|thank you|appreciate|ty\b)/)) return 'thanks';
    if (t(/\b(bye|goodnight|good night|gtg|talk later|ttyl)\b/)) return 'bye';
    if (t(/\b(hi|hey|hello|yo|sup|what'?s up|hiya)\b/) && low.length < 40) return 'greeting';
    if (t(/\?/)) return 'question';
    if (t(/\b(got|won|promoted|signed|booked|new job|engaged|guess what|big news|news)\b/)) return 'brag';
    return 'statement';
  };
})(window.G);
