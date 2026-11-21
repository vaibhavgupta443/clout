// Public channels + story-aware comments: the town talks about what is REALLY happening (curious, gossipy, defending), for free, never in the feed.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  const Ch = G.Channels;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');

  check('six public channels exist', Ch.ensure().length === 6 && Ch.ensure().map((c) => c.id).join() === 'town-talk,love-lives,theories,the-drama,fans,news');

  /* ---------- the story the town talks about ---------- */
  E.addChron('Kai Storm walked out of the studio after a fight with Mia Vale');
  S.storylines.push({ id: 'sl1', title: 'The missing demo tape', summary: 'Someone leaked it', heat: 70, status: 'active', participants: [mia.id, kai.id] });
  S.rumors.push({ id: 'r1', text: 'Mia Vale is secretly leaving the label', about: mia.id, belief: { [kai.id]: 0.6, [dex.id]: 0.5 }, t: S.clock - 30 });
  S.npcRel.push({ a: kai.id, b: mia.id, type: 'ex', note: 'they broke up in spring' });
  E.addPost({ author: 'me', text: 'some people only show up when it is convenient', buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 80 } });
  const kinds = new Set(Ch.topics().map((t) => t.kind));
  check('real facts become topics: events, storylines, rumours, feuds/romances, and your own posts', ['event', 'plot', 'rumor', 'pair', 'post'].every((k) => kinds.has(k)), [...kinds].join());

  /* ---------- the talk: grounded, curious, varied ---------- */
  const posts0 = Object.keys(S.posts).length;
  const said = [];
  for (let i = 0; i < 80; i++) { const chan = S.channels[i % 6]; const m = Ch.say(chan); if (m) said.push({ chan, m }); }
  check('the channels fill up', said.length > 50, said.length);
  check('nothing is empty or broken (no "undefined", no template leftovers)', said.every((x) => x.m.text.length > 8 && !/undefined|\[object|\{[a-z]+\}|NaN/.test(x.m.text)), said.filter((x) => /undefined|\[object|\{[a-z]+\}/.test(x.m.text)).map((x) => x.m.text).join(' | '));
  check('it is about the real story: names, the rumour, the storyline, your post', said.some((x) => /Mia/i.test(x.m.text)) && said.some((x) => /Kai/i.test(x.m.text)) && said.some((x) => /leaving the label/i.test(x.m.text)) && said.some((x) => /demo tape/i.test(x.m.text)) && said.some((x) => /convenient/i.test(x.m.text)));
  const q = said.filter((x) => /\?/.test(x.m.text)).length;
  check('people are curious (a good share are questions)', q >= said.length * 0.2, `${q}/${said.length}`);
  check('they react to each other (replies to earlier messages)', said.filter((x) => x.m.to).length >= 5, said.filter((x) => x.m.to).length);
  check('the love channel only talks about love, the drama channel about feuds', S.channels[1].msgs.every((m) => !m.topic || /^(pair|post):/.test(m.topic)) && S.channels[3].msgs.every((m) => !m.topic || /^(rumor|pair|event|mystery):/.test(m.topic)));
  check('the channels never create feed posts', Object.keys(S.posts).length === posts0);
  check('speakers are real, unblocked, non-burner characters', said.every((x) => S.npcs[x.m.from] && !S.npcs[x.m.from].userAlt));
  check('the log is capped', (() => { for (let i = 0; i < 300; i++) Ch.say(S.channels[0]); return S.channels[0].msgs.length <= 120; })());

  /* ---------- the people talked about hear about it; speakers remember ---------- */
  const heard = (mia.mem || []).some((m) => /talking about me in #/.test(m.text));
  const remembers = Object.values(S.npcs).some((n) => (n.mem || []).some((m) => /I said in #/.test(m.text)));
  check('the person being talked about hears it (it lands in their memory, so drama has consequences)', heard);
  check('and speakers remember what they said', remembers);

  /* ---------- the heartbeat ---------- */
  S.channels.forEach((c) => { c.msgs = []; });
  S.chanLast = S.clock;
  G.settings.feedRate = 1;
  for (let i = 0; i < 24; i++) E.tick(60);
  const total = () => S.channels.reduce((a, c) => a + c.msgs.length, 0);
  const t1 = total();
  check('as time passes the town talks (a few messages an hour at most)', t1 >= 4 && t1 <= 24 * 3 * 1.5, t1);
  G.settings.channels = false;
  for (let i = 0; i < 24; i++) E.tick(60);
  check('switched off: silent', total() === t1);
  G.settings.channels = true;
  G.settings.feedRate = 0;
  for (let i = 0; i < 24; i++) E.tick(60);
  check('a silent cast keeps the channels silent', total() === t1, total() + ' vs ' + t1 + ' ' + JSON.stringify(S.channels.map((c) => c.msgs.length)));
  G.settings.feedRate = 0.6;

  /* ---------- you join in ---------- */
  const chan = S.channels[0];
  const n0 = chan.msgs.length;
  Ch.send('town-talk', 'honestly I think the demo tape thing is overblown');
  const mine = chan.msgs.find((m) => m.from === 'me');
  const replies = chan.msgs.slice(n0 + 1);
  check('your message appears and 1-3 people answer it', !!mine && replies.length >= 1 && replies.length <= 3 && replies.every((r) => r.to === mine.id && /^@Sam/.test(r.text)), JSON.stringify(replies.map((r) => r.text)));
  check('they answer about what you said (the demo tape topic)', replies.some((r) => /demo tape/i.test(r.text)), JSON.stringify(replies.map((r) => r.text)));
  // A reply can discuss an unrelated town event without being mislabeled as gossip about its recipient.
  const savedTopics = Ch.topics;
  const savedStatus = mia.status;
  const savedBlocked = Object.values(S.npcs).map((n) => [n, n.blocked]);
  Object.values(S.npcs).forEach((n) => { n.blocked = n.id !== mia.id; });
  mia.status = 'son';
  Ch.topics = () => [{ kind: 'event', text: 'a city-wide power cut has everyone stuck at home and online', who: [], t: S.clock, w: 1 }];
  const beforeTownReply = chan.msgs.length;
  Ch.send('town-talk', 'what is everyone up to?');
  const townReplies = chan.msgs.slice(beforeTownReply + 1).filter((m) => m.from === mia.id);
  check('a family reply about an unrelated event is not recorded as being about the player', townReplies.length === 1 && !(townReplies[0].about || []).includes('me'), JSON.stringify(townReplies.map((m) => ({ text: m.text, about: m.about }))));
  Ch.topics = savedTopics;
  mia.status = savedStatus;
  savedBlocked.forEach(([n, was]) => { if (was == null) delete n.blocked; else n.blocked = was; });
  let refused = false;
  try { Ch.send('town-talk', '   '); } catch (e) { refused = true; }
  check('an empty message is refused', refused);

  /* ---------- comments under posts become in-story ---------- */
  const miaPost = E.addPost({ author: mia.id, text: 'long day, going to bed', buzz: 2, stats: { likes: 4, reposts: 0, replies: 0, views: 50 } });
  const curious = Object.values(S.npcs).find((n) => n.id !== mia.id && !n.userAlt);
  G.Persona.ensure(curious).t.O = 100;
  const outs = [];
  const commentRnd = G.Persona.rngFrom('channel-comment-variety');
  for (let i = 0; i < 200; i++) outs.push(G.Voice.comment(curious, 'curious', { rnd: commentRnd, post: miaPost, authorName: 'Mia Vale', authorHandle: mia.handle }));
  const storyish = outs.filter((t) => /leaving the label|ex|Kai|fight|demo tape|Mia/i.test(t) && /Mia|Kai|label|tape|fight/i.test(t));
  check('a comment can be about what is really going on with the person (not only generic)', storyish.length >= 20, storyish.length);
  check('comments still always return text (generic when there is nothing real to say)', outs.every((t) => typeof t === 'string' && t.length > 1));
  // what people write keeps their own voice: a lowercase person stays lowercase, an ALL-CAPS person shouts
  const lowP = Object.values(S.npcs).filter((n) => !n.userAlt && n.id !== mia.id)[0];
  const capsP = Object.values(S.npcs).filter((n) => !n.userAlt && n.id !== mia.id)[1];
  const stl = (n, o) => { const p = G.Persona.ensure(n); p.style = Object.assign({}, p.style, { lower: false, caps: false, formal: false }, o); p.t.O = 100; };
  stl(lowP, { lower: true });
  stl(capsP, { caps: true });
  const lowRnd = G.Persona.rngFrom('channel-lowercase-voice');
  const capsRnd = G.Persona.rngFrom('channel-caps-voice');
  const lowOut = [];
  const capsOut = [];
  for (let i = 0; i < 300; i++) {
    const a1 = Ch.storyComment(lowP, 'curious', { rnd: lowRnd, post: miaPost });
    const a2 = Ch.storyComment(capsP, 'curious', { rnd: capsRnd, post: miaPost });
    if (a1) lowOut.push(a1);
    if (a2) capsOut.push(a2);
  }
  const upperRatio = (t) => { const l = t.replace(/[^A-Za-z]/g, ''); return l ? l.replace(/[^A-Z]/g, '').length / l.length : 1; };
  check('story-aware comments keep a lowercase person lowercase', lowOut.length >= 10 && lowOut.every((t) => t === t.toLowerCase()), lowOut.length + ' e.g. ' + lowOut[0]);
  check('...and an ALL-CAPS person shouts', capsOut.length >= 10 && capsOut.every((t) => upperRatio(t) >= 0.9), capsOut.length + ' e.g. ' + capsOut[0]);
  const chLow = [];
  for (let i = 0; i < 200; i++) { const m = Ch.say(S.channels[i % 6], () => 0.5 + (i % 7) / 20); if (m && m.from === lowP.id) chLow.push(m.text); }
  check('channel messages are written in the speaker\'s own style too', chLow.every((t) => t === t.toLowerCase()), chLow.find((t) => t !== t.toLowerCase()));

  const nobody = E.addPost({ author: dex.id, text: 'nice weather', buzz: 1, stats: { likes: 1, reposts: 0, replies: 0, views: 10 } });
  S.rumors = []; S.npcRel = []; S.storylines = []; S.chronicle = [];
  const plain = [];
  for (let i = 0; i < 60; i++) plain.push(Ch.storyComment(curious, 'curious', { rnd: Math.random, post: nobody }));
  check('with nothing real to say about someone, there is no story comment', plain.every((t) => t === null));

  /* ---------- the page ---------- */
  G.UI.go('messages');
  check('Messages has a Channels button', !!$('[data-act="nav"][data-page="channels"]'));
  G.UI.go('channels');
  G.UI.render();
  check('the Channels page shows the tabs, the log and the box', $$('[data-act="chanOpen"]').length >= 6 && !!$('#ch_text') && /Public channels/.test(w.document.body.textContent));
  $('#ch_text').value = 'hello town';
  G.UI.acts.chanSend();
  check('sending from the page works', S.channels.find((c) => c.id === G.UI.chan || c.id === 'town-talk').msgs.some((m) => m.from === 'me' && m.text === 'hello town'));

  /* ---------- what the town said is part of what the world remembers ---------- */
  const hit = G.Rag.retrieve('hello town', { k: 5 });
  check('public chat is retrievable memory', hit.some((d) => d.src === 'channel'));

  /* ---------- optional AI drama, approved first ---------- */
  G.AI.ready = () => true;
  const prompts = [];
  G.AI.json = async (o) => { prompts.push(o.user); return { cost: 0.002, data: { channel_msgs: [{ from: kai.id, text: 'I never said I was leaving, who started this?', replyTo: null }, { from: dex.id, text: 'wait Kai, then who did?', replyTo: null }, { from: 'nobody', text: 'ghost', replyTo: null }] } }; };
  const before = S.channels[0].msgs.length;
  E.Story.approver = async (p) => { p.__seen = p; return false; };
  G.settings.approveActions = true;
  const rj = await Ch.spark('town-talk');
  check('✨ Spark drama asks for approval first, and Reject adds nothing', rj.rejected === true && S.channels[0].msgs.length === before);
  E.Story.approver = async () => true;
  const ok = await Ch.spark('town-talk');
  check('Approve adds the messages from real characters only', ok.made === 2 && S.channels[0].msgs.length === before + 2 && !S.channels[0].msgs.some((m) => m.from === 'nobody'));
  check('the AI prompt carries the story facts and the channel', /WHAT IS REALLY GOING ON/.test(prompts[0]) && /#town-talk/.test(prompts[0]));

  H.summary('CHANNELS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });

function $$(s) { return Array.from(w.document.querySelectorAll(s)); }
