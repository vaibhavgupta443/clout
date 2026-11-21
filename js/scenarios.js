/* Clout — procedural scenario engine.
   seed × twist × setting × complication × tone  (× who is involved)  => hundreds of millions of distinct scenarios,
   generated locally for free. Used by the Director's 🎲 button and by auto-events, which weave a random
   "wildcard" into normal turns without any extra API call.                                              */
(function (G) {
  const U = G.U;
  const Scen = (G.Scen = {});

  // {A} and {B} = other characters, {P} = the player
  const SEEDS = {
    romance: [
      '{A} secretly develops a crush on {P} while seeing someone else.',
      '{A} and {B} both ask {P} out on the same day.',
      '{P} receives a love letter signed only with a symbol.',
      '{A} confesses to {B} in front of everyone, and {P} is the only witness who matters.',
      '{A} tries to make {B} jealous by flirting with {P}.',
      "{P}'s first date with {A} is interrupted by {B}.",
      '{A} and {P} must fake-date for a brand deal.',
      "{A}'s ex returns and reignites an old spark with {B}.",
      '{B} asks {P} to help win back {A}.',
      '{P} and {A} get stuck together overnight.',
      '{A} writes a song about {P} that everyone assumes is about {B}.',
      '{A} discovers {P} has been secretly dating {B}.',
      '{P} gets matched with {A} on a dating app by mistake.',
      '{A} and {B} start a rivalry that is obviously flirting, and {P} has to pick a side.',
    ],
    drama: [
      '{A} accuses {B} of copying their content, and {P} is dragged in.',
      '{A} and {B} stop talking and force their friends to pick sides; {P} is the tiebreaker.',
      '{P} becomes the target of a callout thread started by {A}.',
      '{A} stages an intervention for {B} that goes badly wrong.',
      '{B} posts a cryptic vaguepost and everyone assumes it is about {P}.',
      '{A} quits the friend group live on stream.',
      '{A} and {B} fight over who deserves credit for a viral moment {P} started.',
      "A feud between {A} and {B} spills into {P}'s comment section.",
      '{A} secretly records {B} and threatens to leak it unless {P} intervenes.',
      '{P} is invited to a party {A} is hosting to humiliate {B}.',
      '{A} is accused of faking their story; {P} knows the truth.',
      '{B} starts a rival group chat, excluding {P} and {A}.',
      '{A} lies to {P} about what {B} said.',
      '{P} accidentally replies publicly to a private message from {A}.',
    ],
    scandal: [
      '{A} is exposed for lying about their background.',
      "{A}'s old posts resurface just as {B} announces a big deal with {P}.",
      '{A} is rumored to be secretly married to {P}.',
      '{A} is caught in a lie by a screenshot only {P} has.',
      "{B}'s alt account is exposed — and it has been talking about {P}.",
      "{A}'s sponsor drops them after a video about {P} goes viral.",
      "{P}'s private notes are published by {A}.",
      '{A} is outed as the anonymous gossip account that has been targeting {B}.',
      'A fake news site claims {P} is behind the scandal engulfing {A}.',
      "{B}'s secret is revealed and {P} is blamed for the leak.",
      '{A} is photographed somewhere they swore they were not, with {B}.',
      '{P} helped judge a contest that turns out to be rigged, and {A} is implicated.',
      '{A} is exposed for buying followers.',
      "{P} and {A}'s old group photo shows someone who was supposedly never there.",
    ],
    career: [
      '{A} offers {P} a job that would mean leaving {B} behind.',
      '{P} and {A} compete for the same sponsorship.',
      '{B} wants {P} to headline their event, but {A} is jealous.',
      '{A} pitches a reality show starring {P} and {B}.',
      '{P} is offered a brand deal with an awkward condition involving {A}.',
      "{P}'s video catches a producer's eye, and {A} tries to take credit.",
      '{A} and {B} propose a collab with {P} as the surprise guest.',
      '{P} is offered a book deal if they spill tea about {A}.',
      '{A} gets promoted above {B}, and {P} has to stay diplomatic.',
      '{P} starts a podcast and {A} is the first guest.',
      '{B} asks {P} to mentor {A}.',
      '{P} and {A} perform together in front of a talent scout.',
      "{P}'s merch line gets copied by {A}.",
      '{A} challenges {P} to a public skill-off judged by {B}.',
    ],
    wholesome: [
      '{A} secretly plans a surprise party for {P}, with {B} as the accomplice.',
      '{P} adopts a stray with {A}, and {B} keeps getting the name wrong.',
      '{A} sends {P} a handwritten letter that makes the whole timeline cry.',
      '{B} learns a new skill just to impress {P}.',
      '{A}, {B} and {P} take a spontaneous road trip.',
      '{P} helps {A} through a hard day and the internet notices.',
      "{A} and {B} bake something disastrous for {P}'s birthday.",
      '{P} organizes a fundraiser; {A} and {B} compete to donate more.',
      '{A} makes friendship bracelets for {P} and {B}.',
      '{B} finally apologizes to {A}, thanks to {P}.',
      '{P} writes a thread of gratitude for {A}, who is embarrassed but touched.',
      '{A} teaches {P} a dance for a viral challenge.',
      "{B} adopts {P}'s catchphrase unironically.",
      '{A} and {P} swap lives for a day.',
    ],
    weird: [
      "{A} swears they saw a ghost during {P}'s livestream.",
      '{P} finds out {A} is secretly something supernatural.',
      '{B} claims to be from the future and warns {P} about {A}.',
      '{A} and {B} swap personalities for a day because of a cursed filter.',
      '{P} wakes up with a strange new power that {A} noticed first.',
      '{P} and {A} are trapped in a time loop of the same bad day.',
      "{A} summons something at {P}'s party by accident.",
      '{P} is tagged by a mysterious account that predicts events before they happen.',
      '{B} is revealed to be a bot, and {A} is devastated.',
      '{P} receives a message from a version of themselves from another timeline.',
      '{A} and {B} accidentally swap bodies during a prank.',
      "A glitch changes everyone's memories of {P}.",
      '{A} opens a portal in the group chat and {B} walks through.',
      "{P}'s lucky charm is stolen by {A}, and bad luck follows.",
    ],
    crime: [
      "Someone steals {P}'s big announcement before it is posted, and {A} is the prime suspect.",
      '{A} blackmails {B} with something {P} gave them.',
      '{P} receives a mysterious package from {A}.',
      "{P} and {A} investigate who hacked {B}'s account.",
      "{B}'s expensive item goes missing at {P}'s party.",
      "{A} runs a scam in the comments that {P} accidentally promoted.",
      '{P} discovers {A} has been running a secret gossip page.',
      "{B} accidentally posts a heist plan publicly, tagging {P} and {A}.",
      '{A} is framed for something, and only {P} can prove otherwise.',
      "{P} catches {B} forging {A}'s signature.",
      '{A} and {B} bet {P} they can pull off an impossible prank.',
      "{P} receives anonymous tips about {A}'s hidden past.",
      '{A} is scammed by a fan impersonating {P}.',
      "{B} switches {P}'s and {A}'s identities for a plan that goes wrong.",
    ],
  };

  const TWISTS = [
    'a screenshot leaks', 'it was all a misunderstanding', 'someone is secretly recording', 'an ex shows up uninvited',
    'a rumor spreads that is only half true', 'a long-hidden secret surfaces', 'two separate stories turn out to be connected',
    'a surprise guest crashes it', 'the plan backfires spectacularly', 'someone confesses at the worst possible moment',
    'a fake account stirs the pot', 'it goes viral overnight', 'an old post resurfaces', 'a bet is revealed', 'a journalist is listening in',
    'an apology arrives too late', 'a gift arrives with a mysterious note', 'someone lies to protect a friend', 'two phones get switched by accident',
    'a message goes to the wrong person', 'a deepfake rumor circulates', 'an anonymous confessions page names names', 'someone switches sides mid-argument',
    'an old friend vouches for the wrong person', 'jealousy boils over in public', 'a surprise proposal is attempted', 'a power cut ruins the moment',
    'a stranger recognizes someone from their past', 'the truth comes out live on stream', 'a prank gets out of hand', 'a rival offers a secret deal',
    'someone fakes being ill for attention', 'a hidden diary is found', 'an AI chatbot impersonates someone', 'a drunk voice message gets sent',
    'a pregnancy rumor starts', 'a sponsor pulls out suddenly', 'an old time-capsule video is unearthed', 'a mutual friend plays matchmaker',
    'someone catches feelings against their will', 'old enemies form an alliance', 'a charity event turns into a feud', 'a viral challenge goes wrong',
    'someone is caught lying about their background', 'the platform goes down mid-crisis', 'a mysterious fan knows too much', 'a hacked account posts chaos',
    'a secret admirer finally reveals themselves', 'a double date goes sideways', 'a misread text changes everything', 'a flashback reveals the real story',
    'a lookalike causes confusion', 'a surprise reunion with an old rival', 'a wholesome gesture melts everyone', 'a ranking is announced',
    'a vow of silence is broken', 'a love letter is read aloud', 'an embarrassing voicemail plays on speaker', 'an old promise is called in',
    'the algorithm suddenly favors one person',
  ];

  const SETTINGS = [
    'a rooftop party', 'a crowded café', 'a livestream', 'the group chat', 'a music festival', 'a hotel lobby', 'a red-carpet event', 'the university library',
    'a beach bonfire', 'an after-hours club', 'a gym', 'a charity gala', 'a road trip', 'a private island', 'a wedding reception', 'a late-night diner',
    'a fan convention', 'a film set', 'a recording studio', 'a tiny apartment', 'an airport terminal', 'a ski lodge', 'a farmers market', 'a hackathon',
    'a fashion show', 'a haunted house', 'a speakeasy', 'a yacht', 'a rainy bus stop', 'a karaoke bar', 'the campus quad', 'a skate park', 'a rooftop pool',
    'a cabin in the woods', 'a night market', 'a rooftop cinema', 'a tour bus', 'a backstage corridor', 'a sold-out arena', 'a hotel elevator', 'a town hall meeting',
    'a cooking show', 'a gaming tournament', 'a podcast studio', 'a thrift store', 'a lake house', 'a book signing', 'a street food stall', 'a graduation party',
    'a stuck elevator',
  ];

  const COMPLICATIONS = [
    'there is a one-hour deadline', 'everyone is secretly watching', 'a storm cuts the power', 'someone has been drinking', 'two people share the same secret',
    'a camera is rolling', 'the wrong person finds out first', 'a big announcement is about to be made', 'a contract is at stake', 'the misunderstanding feeds on itself',
    'someone is pretending to be someone else', 'a promise was made long ago', 'the group is split on who to believe', 'an old grudge reignites', 'one person is hiding an injury',
    'the evidence is ambiguous', 'a rival is quietly gloating', 'a fan is filming', 'a surprise party is hidden nearby', 'a loyalty test is underway', 'the platform is glitching',
    'a price must be paid', 'someone is running late', 'a language barrier complicates things', 'a secret code is involved', 'everyone is in costume', 'the internet is down',
    'a lie has been told too many times', 'someone is in love with the wrong person', 'a ghostwriter is revealed', 'a hidden-camera show is filming', 'a house rule is broken',
    'a dare cannot be refused', 'a famous guest watches silently', 'a birthday was forgotten', 'money goes missing', 'a jealous partner appears', 'a childhood nickname slips out',
    "someone's phone battery is dying", "the timing couldn't be worse",
  ];

  const TONES = [
    'comedic', 'tense', 'bittersweet', 'chaotic', 'romantic', 'dark', 'wholesome', 'petty', 'dramatic', 'awkward', 'heartfelt', 'scandalous', 'absurd', 'suspenseful',
    'spicy', 'melancholic', 'triumphant', 'cringe', 'cozy', 'explosive',
  ];

  Scen.CATS = [
    { k: 'any', icon: '🎲', label: 'Surprise me' },
    { k: 'romance', icon: '💘', label: 'Romance' },
    { k: 'drama', icon: '🎭', label: 'Drama' },
    { k: 'scandal', icon: '📰', label: 'Scandal' },
    { k: 'career', icon: '💼', label: 'Career' },
    { k: 'wholesome', icon: '🥰', label: 'Wholesome' },
    { k: 'weird', icon: '👻', label: 'Weird' },
    { k: 'crime', icon: '🕵️', label: 'Crime' },
  ];


  // number of distinct scenarios (before multiplying by who is involved)
  const seedsFor = (cat) => SEEDS[cat] || Object.values(SEEDS).flat();
  Scen.count = (cat = 'any') => seedsFor(cat).length * TWISTS.length * SETTINGS.length * COMPLICATIONS.length * TONES.length;
  Scen.parts = () => ({ twists: TWISTS.length, settings: SETTINGS.length, complications: COMPLICATIONS.length, tones: TONES.length });

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

  // returns { text, cat, A, B }
  Scen.roll = function ({ cat = 'any', rnd = Math.random, S = G.S } = {}) {
    const pool = seedsFor(cat);
    const seed = pick(pool, rnd);
    const cast = S ? Object.values(S.npcs).filter((n) => !n.blocked) : [];
    const popOn = S && G.Pop && S.popSize > 0 && !(G.Engine && G.Engine.mainOnly());
    const personName = () => {
      const p = G.Pop.person(Math.floor(rnd() * G.Pop.size()));
      return `${p.name} (${p.handle}, a local)`;
    };
    const who = () => {
      if (cast.length && !(popOn && rnd() < 0.2)) {
        const c = pick(cast, rnd);
        return { name: `${c.name} (${c.id})`, id: c.id };
      }
      return popOn ? { name: personName() } : { name: 'someone new' };
    };
    const A = who();
    let B = who();
    for (let i = 0; i < 6 && B.name === A.name; i++) B = who();
    const P = S ? S.player.name : 'the player';
    const body = seed.replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name).replace(/\{P\}/g, P);
    const text = `${body} Twist: ${pick(TWISTS, rnd)}. Setting: ${pick(SETTINGS, rnd)}. Complication: ${pick(COMPLICATIONS, rnd)}. Tone: ${pick(TONES, rnd)}.`;
    return { text, cat, A, B };
  };

  // auto-event "wildcard" woven into a normal turn (no extra API call). kind: 'public' | 'dm' | 'time'
  const RATE = [0, 0.15, 0.35, 0.65];
  Scen.spice = function (S, kind = 'public', rnd = Math.random) {
    const lvl = G.settings.autoEvents | 0;
    if (!lvl || !S || rnd() > RATE[lvl]) return '';
    const pool = kind === 'dm' ? ['romance', 'drama'] : kind === 'time' ? ['any', 'any', 'drama', 'scandal', 'romance'] : ['any', 'drama', 'romance', 'scandal', 'weird'];
    const r = Scen.roll({ cat: pick(pool, rnd), rnd, S });
    return r.text;
  };
})(window.G);
