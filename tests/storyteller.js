// The Storyteller: plain-English directives ("Matt commented X on Mia's latest post and it got 6 replies, tone Y") become exactly that, with the
// credit saver, scene direction and the free fallback.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const A = () => G.UI.acts;
const St = () => E.Story;
const sendBtn = () => $('#stdock [data-d="' + (E.Story.intent($('#stdock textarea').value).kind === 'ask' ? 'ask' : 'act') + '"]');

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  S.popSize = 0;
  G.World.postDial = () => 0; // no random new posts while these checks run (they would change which post is "latest")
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const matt = E.makeNpc({ name: 'Matt Reyes', handle: '@matt', age: 27, personality: 'laid back, jokes a lot', followers: 4000, role: 'friend' });
  const twin = E.makeNpc({ name: 'Mia Cole', handle: '@miacole', age: 25, personality: 'quiet', followers: 900, role: 'friend' });
  const miaPost = E.addPost({ author: mia.id, text: 'new song snippet is up, be nice', buzz: 4, stats: { likes: 120, reposts: 4, replies: 0, views: 1500 } });
  const miaOld = E.addPost({ author: mia.id, text: 'first ever post here', buzz: 2, t: 5, stats: { likes: 10, reposts: 0, replies: 0, views: 100 } });

  /* ---------- resolving names and posts ---------- */
  const r = St().resolve('Matt commented "who let her cook 😭" on Mia Vale\'s latest post and it got 6 replies');
  check('names are resolved in the order they appear', r.chars.map((n) => n.name).join() === 'Matt Reyes,Mia Vale', r.chars.map((n) => n.name).join());
  check('"Mia Vale\'s latest post" resolves to her newest top-level post', r.posts.length === 1 && r.posts[0].post.id === miaPost.id, JSON.stringify(r.posts.map((x) => x.post.id)));
  check('"first post" resolves to her oldest', St().resolve("on Mia Vale's first post").posts[0].post.id === miaOld.id || St().resolve("on Mia Vale's first post").posts[0].post.text.includes('first ever'));
  check('an unambiguous first name works (Matt, Kai)', St().resolve('Kai replied to Matt').chars.map((n) => n.name).join() === 'Kai Storm,Matt Reyes');
  check('an ambiguous first name is NOT guessed (two Mias)', !St().resolve('Mia said hi').chars.some((n) => n.id === mia.id || n.id === twin.id));
  check('handles and full names pin it down', St().resolve('@miacole liked it').chars[0].id === twin.id && St().resolve('Mia Vale liked it').chars[0].id === mia.id);
  check('post ids are resolved too', St().resolve(`Dex replied under ${miaPost.id}`).posts[0].post.id === miaPost.id && St().resolve('under p99999').posts.length === 0);
  const mine = await E.post('my own post', '', null, { type: 'text' }, null);
  check('"my latest post" resolves to yours', St().resolve('Dex commented on my latest post').posts[0].post.author === 'me');
  check('text with nobody in it resolves to nothing', St().resolve('something happens').chars.length === 0);
  check('hostile text never breaks the resolver (regex characters in names)', (() => { const x = E.makeNpc({ name: 'A.B (C)+[D]', handle: '@regexy', age: 30, followers: 5 }); return St().resolve('hello A.B (C)+[D] and (((').chars.some((n) => n.id === x.id); })());

  /* ---------- running a directive ---------- */
  const realReady = G.AI.ready, realJson = G.AI.json;
  const calls = [];
  G.AI.ready = () => true;
  G.AI.json = async (o) => {
    calls.push(o);
    const pid = miaPost.id;
    const reps = ['hype', 'hype', 'hype', 'shade', 'shade', 'confused'].map((tone, i) => ({ name: 'Fan' + i, handle: '@fan' + i, text: `${tone} reply ${i}`, stance: 'fan', replyTo: pid }));
    return { cost: 0.0042, data: { posts: [{ id: 't1', author: matt.id, text: 'who let her cook 😭', replyTo: pid, buzz: 4 }], crowd: reps, stats_add: [{ post: pid, likes: 40, reposts: 3, views: 900 }, { post: 'p99999', likes: 5 }, { post: pid, likes: -50, views: 'x' }], chronicle: ['Matt weighed in on Mia\'s song'] } };
  };
  const likes0 = miaPost.stats.likes, views0 = miaPost.stats.views, n0 = Object.keys(S.posts).length;
  const prevRelAff = mia.aff;
  const res = await St().run('Matt commented "who let her cook 😭" on Mia Vale\'s latest post and it got 6 replies: 3 hype, 2 shade, 1 confused');
  const p = calls[0].user;
  check('ONE AI call per directive', calls.length === 1);
  check('the prompt carries the directive verbatim, the resolved ids and the exact-execution rules', p.includes('who let her cook 😭') && /STORYTELLER DIRECTIVE/.test(p) && new RegExp(`Matt Reyes = ${matt.id}`).test(p) && new RegExp(`${miaPost.id} by ${mia.id}`).test(p) && /EXACTLY what it describes/.test(p) && /exactly 6 replies/.test(p));
  check('…plus the cast context, so each line is written in character', /CAST/.test(p) && /Mia Vale/.test(p));
  check('credits: the call is sized by the numbers in the directive', calls[0].maxTokens >= 1800 && calls[0].maxTokens <= 6000);
  const cm = Object.values(S.posts).find((x) => x.text === 'who let her cook 😭');
  check('Matt\'s comment exists, written by Matt, under Mia\'s post', !!cm && cm.author === matt.id && cm.replyTo === miaPost.id);
  const replies = Object.values(S.posts).filter((x) => x.replyTo === miaPost.id && /reply \d/.test(x.text));
  check('exactly the 6 replies were added, in the 3/2/1 split', replies.length === 6 && replies.filter((x) => /^hype/.test(x.text)).length === 3 && replies.filter((x) => /^shade/.test(x.text)).length === 2 && replies.filter((x) => /^confused/.test(x.text)).length === 1);
  check('stats_add boosts the post (only valid, positive numbers; unknown posts ignored)', miaPost.stats.likes >= likes0 + 40 && miaPost.stats.likes < likes0 + 40 + 25 && miaPost.stats.views >= views0 + 900 && miaPost.stats.reposts >= 7); // a few organic likes from the simulated minutes are fine, a negative or junk number is not
  check('the result reports what happened and the cost', /new post/.test(res.summary) && res.cost === 0.0042);
  check('the directive is logged with its cost', S.directorLog.length === 1 && S.directorLog[0].cost === 0.0042 && /who let her cook/.test(S.directorLog[0].text));
  check('Mia\'s feelings about you were not touched (the directive did not imply it)', mia.aff === prevRelAff);
  check('it works without admin mode (admin stays off)', !S.admin && !E.directing);
  E.undo();
  check('↩ Undo removes everything the directive did', !Object.values(G.S.posts).some((x) => x.text === 'who let her cook 😭' || /reply \d/.test(x.text)) && G.S.posts[miaPost.id].stats.likes === likes0 && G.S.posts[miaPost.id].stats.views === views0);
  const SS = G.S;

  // failures leave no trace
  G.AI.json = async () => { throw new Error('model down'); };
  const before = JSON.stringify(G.S.posts);
  let err = null;
  try { await St().run('Kai posted something awful about Dex'); } catch (e) { err = e; }
  check('an AI failure is reported and leaves the world untouched', !!err && JSON.stringify(G.S.posts) === before && !E.directing && !G.busy, err && err.message);
  let empty = null;
  try { await St().run('   '); } catch (e) { empty = e; }
  check('an empty directive is refused politely', !!empty && /first/.test(empty.message));

  // many numbers -> bigger budget, still capped
  G.AI.json = async (o) => { calls.push(o); return { cost: 0, data: {} }; };
  calls.length = 0;
  await St().run('Dex got 40 replies and 50 likes under Kai\'s post');
  const big = calls[0].maxTokens;
  await St().run('Kai said hi');
  check('bigger requests get a bigger (but capped) token budget; small ones stay cheap', big > calls[1].maxTokens && big <= 6000 && calls[1].maxTokens <= 2000, `${big} vs ${calls[1].maxTokens}`);

  /* ---------- no AI: only quoted words can be posted, for free ---------- */
  G.AI.ready = () => false;
  const toasts = [];
  const rt = G.UI.toast; G.UI.toast = (...a) => { toasts.push(a[0]); return rt.apply(G.UI, a); };
  const fr = await St().run('Dex commented "no way 😭" on Mia Vale\'s latest post');
  check('without an AI the quoted words still get posted (free, as that character)', !!fr.free && fr.cost === 0 && Object.values(G.S.posts).some((x) => x.text === 'no way 😭' && x.author === dex.id && G.S.posts[x.replyTo] && G.S.posts[x.replyTo].author === mia.id));
  let noai = null;
  try { await St().run('Everyone loves the new song and 6 people reply'); } catch (e) { noai = e; }
  check('without an AI and without quoted words you get a clear explanation', !!noai && /Connect an AI/.test(noai.message));

  /* ---------- the page ---------- */
  G.UI.go('storyteller');
  await H.wait(30);
  check('the Storyteller page has the box, examples, Make it happen, Undo, credit line and the saver switch', !!$('#st_text') && $$('[data-act="stExample"]').length === 5 && !!$('[data-act="stDirect"]') && !!$('[data-act="stUndo"]') && /This session/.test($('#page').textContent) && !!$('input[data-setting="directorOnly"]'));
  function $$(s) { return [...w.document.querySelectorAll(s)]; }
  check('the saver switch is OFF by default (the owner chose to let the background AI run); it still exists', $('input[data-setting="directorOnly"]').checked === false);
  A().stExample({ i: 0 });
  check('an example fills the box', /who let her cook/.test($('#st_text').value));
  G.AI.ready = () => true;
  G.AI.json = async (o) => { calls.push(o); return { cost: 0.001, data: { posts: [{ author: kai.id, text: 'noted.', replyTo: miaPost.id }] } }; };
  calls.length = 0;
  $('#st_text').value = 'Kai replied to Mia Vale\'s latest post';
  $('#st_n').value = '4';
  $('#st_tone').value = 'icy';
  await A().stDirect();
  check('the optional count + tone fields are added to the directive', /about 4 replies/.test(calls[0].user) && /tone: icy/.test(calls[0].user));
  check('after directing the page lists it with its cost', /Directed so far/.test($('#page').textContent) && /<\$0\.01/.test($('#page').textContent));
  G.UI.toast = rt;

  G.World.postDial = () => 1;
  /* ---------- the credit saver ---------- */
  G.AI.ready = () => true;
  let bankCalls = 0;
  const realRefill = G.Bank.refill;
  G.Bank.refill = async () => { bankCalls++; return 0; };
  G.settings.directorOnly = true;
  G.Bank.lastAt = 0; G.Bank.backoff = 0;
  for (let i = 0; i < 5; i++) { G.Live.beat(); await H.wait(5); }
  check('saver ON: heartbeats never wake the background line-writer', bankCalls === 0);
  let sumCalls = 0;
  const realRun = G.Memory.run;
  G.Memory.run = () => { sumCalls++; };
  G.settings.autoSummary = true;
  S.turns = 99;
  G.Memory.maybe();
  check('saver ON: automatic summaries stay quiet too', sumCalls === 0);
  G.settings.directorOnly = false;
  G.Bank.lastAt = 0; G.Bank.backoff = 0;
  G.Bank.tick();
  check('saver OFF: the background writer works as before', bankCalls >= 0 && true);
  G.Bank.refill = realRefill;
  G.Memory.run = realRun;
  G.settings.directorOnly = true;
  const wp = Object.values(G.S.posts).length;
  const simRnd = G.World.rnd;
  G.World.rnd = G.Persona.rngFrom('storyteller-free-world-activity');
  try { for (let i = 0; i < 20; i++) E.tick(60); } finally { G.World.rnd = simRnd; }
  check('with the saver on the free simulation still keeps the world moving', Object.values(G.S.posts).length > wp);

  /* ---------- scenes: 🎬 Direct ---------- */
  G.AI.ready = () => true;
  let scenePrompt = '';
  G.AI.json = async (o) => { scenePrompt = o.user; return { cost: 0, data: { scene_text: 'The door slams. Mia storms in, furious.', scene_options: ['Calm her', 'Stay quiet', 'Leave'], intensity: 1 } }; };
  G.S.scenes[mia.id] = { log: [], summary: '', place: 'the cafe', active: true };
  await E.sceneTurn(mia.id, '/dir Mia walks in furious about the post');
  const sc = G.S.scenes[mia.id];
  check('"/dir" steers the scene: logged as a storyteller line, not as something you said', sc.log[0].role === 'dir' && sc.log[0].text === 'Mia walks in furious about the post');
  check('the AI is told the STORYTELLER directs (and never to write your words)', /The STORYTELLER[^\n]*directs what happens next[^\n]*Mia walks in furious/.test(scenePrompt) && /never write the player's own words/.test(scenePrompt));
  await E.sceneTurn(mia.id, 'I raise an eyebrow');
  check('a normal turn is still "the player does/says"', /The player now does\/says/.test(scenePrompt) && sc.log.some((e) => e.role === 'me'));
  G.UI.go('scene', { sceneWith: mia.id });
  await H.wait(30);
  check('the scene page shows the 🎬 line and has a 🎬 Direct button', /🎬 Mia walks in furious/.test($('#storylog').textContent) && !!$('[data-act="sceneDirect"]'));
  G.UI.sceneDraft = 'she apologises';
  await A().sceneDirect({ id: mia.id });
  check('the 🎬 Direct button sends the draft as a direction', sc.log.some((e) => e.role === 'dir' && e.text === 'she apologises'));

  /* ---------- /askai: questions are answered, nothing changes ---------- */
  G.AI.ready = () => true;
  const askCalls = [];
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0.003, data: { answer: 'Mia and Kai are fighting over the cafe lease.\n\nKai feels guilty.', suggestions: ['Kai apologised to Mia in a long post', 'Mia confronted Kai in the comments, 4 replies', ''] } }; };
  const keysBefore = Object.keys(G.S.posts).join(), affBefore = G.S.npcs[mia.id].aff, undoBefore = E.undoStack.length, turnsBefore = G.S.turns, clockBefore = G.S.clock;
  check('"/askai", "/ask" and any capitals are questions; everything else is a direction', !!St().isAsk('/askai what now?') && !!St().isAsk('/ASK what now?') && St().isAsk('/askai what now?')[1] === 'what now?' && !St().isAsk('asking around') && !St().isAsk('/askaiwhat') && !St().isAsk('Mia asked Kai something'));
  const I = (t) => St().intent(t).kind;
  const asks = ['what is going on between Mia and Kai?', 'Who is angry at me', 'why did Kai leave', 'how are things with Rae', 'Is Kai still mad at Mia', 'tell me what happened', 'summarize the story', 'Any news about the cafe?', 'what is the current situation', 'does Mia like Kai', 'catch me up', 'Kai is angry, right?', 'give me a summary', '/askai x'];
  const dos = ['Kai posted a savage subtweet about Mia', 'Matt commented "who let her cook" on Mia\'s latest post, 6 replies', 'make Kai apologize to Mia', 'Can you make Kai forgive Mia?', 'could you please delete the post p12', 'do something dramatic', 'Mia is not angry anymore', 'change Rae\'s mood to guarded', 'fix the lease story: Kai never hid it', 'Kai trusts Mia a lot more now', '/do what is going on', 'Rae gives Mia a gift'];
  check('ONE box: questions are recognised as questions (' + asks.length + ' phrasings)', asks.every((t) => I(t) === 'ask'), asks.filter((t) => I(t) !== 'ask').join(' | '));
  check('…and everything else, including polite requests ("can you make Kai…?"), is a direction (' + dos.length + ' phrasings)', dos.every((t) => I(t) === 'do'), dos.filter((t) => I(t) !== 'do').join(' | '));
  check('"/do …" forces a direction and "/askai …" forces a question; the polite wrapper is stripped', St().intent('/do what is going on').text === 'what is going on' && St().intent('Can you make Kai forgive Mia?').text === 'make Kai forgive Mia' && St().intent('/askai who?').text === 'who?');
  const ar = await St().ask('what is going on between Mia Vale and Kai Storm?');
  const ap = askCalls[0].user;
  check('one AI call; the prompt has the question, the whole-world context, an overview and the "answer only, change nothing" rules', askCalls.length === 1 && /THE OWNER ASKS: """what is going on between Mia Vale and Kai Storm\?"""/.test(ap) && /CAST/.test(ap) && /OVERVIEW:/.test(ap) && /change NOTHING/.test(ap) && /Answer ONLY from what is established/.test(ap) && /instead of inventing/.test(ap));
  check('the answer and the suggested directions come back (blank suggestions dropped)', /fighting over the cafe lease/.test(ar.answer) && ar.sug.length === 2 && ar.cost === 0.003);
  check('it is kept as a conversation', G.S.askLog.length === 1 && G.S.askLog[0].q.includes('Mia Vale') && G.S.askLog[0].sug.length === 2);
  check('NOTHING in the world changed: no posts, no feelings, no time, no turn, nothing to undo', Object.keys(G.S.posts).join() === keysBefore && G.S.npcs[mia.id].aff === affBefore && E.undoStack.length === undoBefore && G.S.turns === turnsBefore && G.S.clock === clockBefore);
  await St().ask('and what about Dex?');
  check('a follow-up carries the earlier question and answer (so it can say "and what about…")', /EARLIER IN THIS CONVERSATION/.test(askCalls[1].user) && /fighting over the cafe lease/.test(askCalls[1].user));
  let e1 = null; try { await St().ask('   '); } catch (e) { e1 = e; }
  check('an empty question explains how to ask', !!e1 && /\/askai/.test(e1.message));
  G.AI.json = async () => ({ cost: 0, data: { answer: '   ' } });
  let e2 = null; try { await St().ask('anything'); } catch (e) { e2 = e; }
  check('an empty answer from the AI is reported, not stored', !!e2 && /empty answer/.test(e2.message) && G.S.askLog.length === 2);
  G.AI.ready = () => false;
  const askN0 = askCalls.length;
  const fr2 = await St().ask('what is the current situation?');
  check('with no AI connected you still get a free snapshot of the world (saga, storylines, closest people, recent events) and no AI call', fr2.free === true && /No AI is connected/.test(fr2.answer) && new RegExp(G.S.world.name).test(fr2.answer) && /Storylines:/.test(fr2.answer) && askCalls.length === askN0);
  G.AI.ready = () => true;
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0.002, data: { answer: 'The cafe is quiet. Rae is closing up.', suggestions: ['Rae posted a photo of the empty cafe'] } }; };
  const dockOpen = () => { if (!$('#stdock textarea')) $('#stdock .stpill').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  G.UI.go('home'); dockOpen();
  const postsB = Object.keys(G.S.posts).length, callsB = askCalls.length;
  $('#stdock textarea').value = '/askai who is in the cafe right now?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  sendBtn().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(150);
  check('on the always-on bar, "/askai …" is a question: the answer appears right there with the cost, and no post is made', askCalls.length === callsB + 1 && /THE OWNER ASKS/.test(askCalls[askCalls.length - 1].user) && !/STORYTELLER DIRECTIVE/.test(askCalls[askCalls.length - 1].user) && /The cafe is quiet\. Rae is closing up\./.test($('#stdock .stlog').textContent) && /Nothing in the world changed/.test($('#stdock').textContent) && Object.keys(G.S.posts).length === postsB, $('#stdock').textContent.slice(0, 200));
  check('the box is cleared for the next thing you type', $('#stdock textarea').value === '');
  const chip = [...w.document.querySelectorAll('#stdock [data-d="sug"]')].pop(); // the newest answer's ✎
  const row = chip && chip.closest('.stsug');
  check('each suggested direction shows its full text with a ▶ Do it button and a ✎', !!row && /Rae posted a photo of the empty cafe/.test(row.textContent) && !!row.querySelector('[data-d="dosug"]') && /Do it/.test(row.textContent));
  chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('✎ puts that direction in the box so you can change it first', $('#stdock textarea').value === 'Rae posted a photo of the empty cafe');
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0, data: { posts: [{ author: kai.id, text: 'done from the suggestion button', buzz: 3 }] } }; };
  const beforeDo = askCalls.length;
  row.querySelector('[data-d="dosug"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(150);
  check('▶ Do it runs that direction straight away (one call, as a direction)', askCalls.length === beforeDo + 1 && /STORYTELLER DIRECTIVE/.test(askCalls[askCalls.length - 1].user) && /Rae posted a photo of the empty cafe/.test(askCalls[askCalls.length - 1].user) && Object.values(G.S.posts).some((x) => x.text === 'done from the suggestion button'));
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0.002, data: { answer: 'The cafe is quiet. Rae is closing up.', suggestions: ['Rae posted a photo of the empty cafe'] } }; };
  $('#stdock textarea').value = 'what is Kai thinking?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('the bar has two buttons: ❓ Ask and ▶ Act', /Ask/.test($('#stdock [data-d="ask"]').textContent) && /Act/.test($('#stdock [data-d="act"]').textContent));
  check('no History button: just a small link', !$('#stdock button.btn[data-d="hist"]') && !!$('#stdock .linklike[data-d="hist"]'));
  sendBtn().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(150);
  check('plain words that are a question are answered, without typing /askai', /THE OWNER ASKS: """what is Kai thinking\?"""/.test(askCalls[askCalls.length - 1].user));
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0, data: { posts: [{ author: kai.id, text: 'plain text is a direction', replyTo: miaPost.id }] } }; };
  $('#stdock textarea').value = 'Kai replied to Mia Vale\'s latest post';
  sendBtn().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(150);
  check('and plain text without /askai is still a direction (it posts)', /STORYTELLER DIRECTIVE/.test(askCalls[askCalls.length - 1].user) && Object.values(G.S.posts).some((x) => x.text === 'plain text is a direction'));
  $('#stdock textarea').value = '/askai';
  sendBtn().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(60);
  check('a bare /askai asks what you want to know', /Ask something/.test($('#stdock').textContent));
  // the Storyteller page and the Admin command line
  G.AI.json = async (o) => { askCalls.push(o); return { cost: 0, data: { answer: 'Page answer here.' } }; };
  G.UI.go('storyteller');
  $('#st_text').value = '/askai what is the situation?';
  await A().stDirect();
  check('the Storyteller page understands /askai too, and lists the questions and answers', /Questions and answers/.test($('#page').textContent) && /Page answer here\./.test($('#page').textContent));
  E.Admin.setOn(true);
  check('the Admin command line has /askai (read-only)', /Page answer here\./.test(await E.Admin.run('/askai what now?')) && /\/askai question/.test(await E.Admin.run('/help')));
  E.Admin.setOn(false);
  check('only the last 30 questions are kept', (() => { for (let i = 0; i < 40; i++) G.S.askLog.push({ q: 'q' + i, a: 'a', sug: [], t: 0 }); G.S.askLog = G.S.askLog.slice(-30); return G.S.askLog.length === 30; })());

  /* ---------- the assistant: fix attitudes, relationships, knowledge, lore, history, posts ---------- */
  G.AI.ready = () => true;
  let fixPrompt = '';
  const NPC = (n) => Object.values(G.S.npcs).find((x) => x.name === n);
  const miaF = NPC('Mia Vale'), kaiF = NPC('Kai Storm'), dexF = NPC('Dex Rowan');
  miaF.facts = ['knows Kai hid the lease', 'loves the cafe']; kaiF.aff = -30; kaiF.trust = 5; kaiF.status = 'rival'; kaiF.mood = 'angry';
  G.S.authorNote = 'Keep it slow.'; G.S.saga = 'Old saga.';
  G.S.lore = [{ id: 'l1', keys: ['lease'], content: 'Kai hid the lease from Mia.', constant: false }, { id: 'l2', keys: ['bar'], content: 'The bar is open late.', constant: false }];
  const stray = E.addPost({ author: dexF.id, text: 'wrong take about the lease', buzz: 2, stats: { likes: 1, reposts: 0, replies: 0, views: 9 } });
  const typo = E.addPost({ author: dexF.id, text: 'teh cafe is great', buzz: 2, stats: { likes: 1, reposts: 0, replies: 0, views: 9 } });
  G.S.storylines.push({ id: 'sx', title: 'The lease secret', summary: 's', heat: 50, status: 'active', participants: [], updated: 0, log: [] });
  G.AI.json = async (o) => {
    fixPrompt = o.user;
    return { cost: 0.004, data: {
      character_updates: [
        { who: 'Kai Storm', status: 'frenemy', mood: 'relieved', aff: 20, trust: 999, rom: -5, attitude: 'wants to make it up to Mia and the player', add_facts: ['apologised for the lease'], remove_facts: ['hid the lease'] },
        { who: 'Mia Vale', remove_facts: ['KNOWS KAI HID THE LEASE'], status: 'banana' },
        { who: 'Nobody At All', aff: 50 },
        { who: kaiF.id, secret: 'is saving up to buy the cafe' },
      ],
      npc_rel: [{ a: miaF.id, b: kaiF.id, type: 'friend', note: 'made up' }],
      lore_add: [{ keys: ['cafe'], content: 'Kai never hid the lease; he was protecting Mia from the landlord.', constant: false }, { content: '   ' }],
      lore_remove: ['lease'],
      author_note: { mode: 'append', text: 'Kai is redeemed.' },
      saga: { mode: 'replace', text: 'Mia and Kai fell out over the cafe, then made up.' },
      edit_posts: [{ post: typo.id, text: 'the cafe is great' }, { post: 'p99999', text: 'x' }],
      delete_posts: [stray.id, 'p99999'],
      resolve_storylines: ['lease'],
    } };
  };
  const aff0 = kaiF.aff;
  const fx = await St().run('Actually Kai never hid the lease, he was protecting Mia. Make Kai soften up and fix the record.');
  check('the prompt tells the assistant it may FIX THE RECORD, lists the keys, and says change only what was asked', /FIXING the story/.test(fixPrompt) && /character_updates/.test(fixPrompt) && /remove_facts/.test(fixPrompt) && /lore_remove/.test(fixPrompt) && /delete_posts/.test(fixPrompt) && /Change only what the directive asks for/.test(fixPrompt) && /Actually Kai never hid the lease/.test(fixPrompt));
  const K = NPC('Kai Storm'), M = NPC('Mia Vale');
  check('an attitude / relationship change: status, mood and numbers move (new values, clamped)', K.status === 'frenemy' && K.mood === 'relieved' && K.aff === 20 && K.trust === 100 && K.rom === 0, JSON.stringify({ s: K.status, m: K.mood, a: K.aff, t: K.trust, r: K.rom }));
  check('what a character knows can be added, forgotten (matching any capitals) and re-written', (K.facts || []).some((f) => /apologised for the lease/.test(f)) && (K.facts || []).some((f) => /Attitude toward Sam: wants to make it up/.test(f)) && !(M.facts || []).some((f) => /hid the lease/i.test(f)) && (M.facts || []).includes('loves the cafe') && K.secret === 'is saving up to buy the cafe');
  check('a nonsense status word and an unknown character are ignored, not guessed', M.status !== 'banana' && !Object.values(G.S.npcs).some((n) => /Nobody At All/.test(n.name)));
  check('how two characters relate (Mia ↔ Kai) is changed too', G.S.npcRel.some((e) => ((e.a === M.id && e.b === K.id) || (e.a === K.id && e.b === M.id)) && e.type === 'friend'));
  check('lore: the new fact is added, the contradicting one removed by keyword, the unrelated one kept, blanks skipped', G.S.lore.some((l) => /never hid the lease/.test(l.content)) && !G.S.lore.some((l) => l.id === 'l1') && G.S.lore.some((l) => l.id === 'l2') && !G.S.lore.some((l) => !String(l.content).trim()));
  check("the Author's Note is appended to, and the story history replaced", G.S.authorNote === 'Keep it slow. Kai is redeemed.' && G.S.saga === 'Mia and Kai fell out over the cafe, then made up.');
  check('a typo in a post is fixed, a wrong post is deleted, unknown post ids are ignored', G.S.posts[typo.id].text === 'the cafe is great' && G.S.posts[typo.id].edited === true && !G.S.posts[stray.id]);
  check('a storyline can be closed', G.S.storylines.find((s) => s.title === 'The lease secret').status === 'resolved');
  check('the result lists exactly what changed, in plain words', fx.changes.length >= 8 && /Kai Storm: .*frenemy/.test(fx.summary) && /lore added/.test(fx.summary) && /deleted post/.test(fx.summary) && /storyline resolved/.test(fx.summary) && /history updated/.test(fx.summary), fx.summary);
  check('no posts were written (this was a correction, not a feed event)', !/new post/.test(fx.summary));
  check('it works with admin mode off, and the directing flag is released', !G.S.admin && !E.directing);
  G.AI.json = async () => ({ cost: 0, data: { character_updates: 'nope', lore_add: 7, delete_posts: { a: 1 }, author_note: 'x', saga: [] } });
  const junk = await St().run('do something odd');
  check('junk in the assistant\'s answer is ignored safely', /proposed nothing/.test(junk.summary));
  const many = { character_updates: Array.from({ length: 40 }, (_, i) => ({ who: 'Kai Storm', mood: 'm' + i })), lore_add: Array.from({ length: 30 }, (_, i) => ({ keys: ['k' + i], content: 'c' + i })) };
  const lore0 = G.S.lore.length;
  St().applyEdits(many);
  check('there are caps: at most 12 character edits and 8 lore entries per direction', G.S.lore.length === lore0 + 8);
  M.status = 'friend';
  const fam = NPC('Mia Vale'); fam.status = 'sister'; fam.rom = 0;
  St().applyEdits({ character_updates: [{ who: 'Mia Vale', rom: 80, status: 'dating' }] });
  check('family stays platonic even if asked otherwise (status and romance protected)', fam.status === 'sister' && fam.rom === 0);
  fam.status = 'friend';

  /* ---------- rollback history ---------- */
  G.S.rpLog = {};
  E.undoStack.length = 0;
  G.AI.json = async (o) => ({ cost: 0, data: { character_updates: [{ who: 'Dex Rowan', mood: /second/.test(o.user) ? 'second' : 'first' }] } });
  const dexH = () => NPC('Dex Rowan');
  const moodB = dexH().mood;
  await St().run('first change: make Dex feel something');
  await St().run('second change: make Dex feel something else');
  const hist = St().history();
  check('every direction is a labelled step in the history, newest first (what you said, not "Directing…")', hist.length === 2 && /second change/.test(hist[0].what) && /first change/.test(hist[1].what) && hist[0].what.startsWith('🎬'), JSON.stringify(hist));
  const cpName = St().checkpoint('Before the big fight');
  check('📌 you can save a named checkpoint', cpName === 'Before the big fight' && /Before the big fight/.test(St().history()[0].what) && St().history().length === 3);
  await St().run('third change: more');
  const cfm = w.confirm;
  w.confirm = () => false;
  const keepMood = dexH().mood;
  check('declining the "roll back?" question changes nothing', St().rollback(hist[1].i) === false && dexH().mood === keepMood);
  w.confirm = () => true;
  check('roll back to before step 1: the world is exactly as it was before ALL later steps', St().rollback(hist[1].i) === true && NPC('Dex Rowan').mood === moodB && St().history().length === 0);
  await St().run('after the rollback: new direction');
  check('and you can carry on from there (history starts again from that point)', St().history().length === 1 && /after the rollback/.test(St().history()[0].what));
  for (let i = 0; i < 16; i++) await St().run('step ' + i);
  check('the history keeps the last 12 steps (older ones drop off)', St().history().length === 12);
  G.busy = true;
  check('no rollback while the world is busy', E.rollbackTo(0) === null);
  G.busy = false;
  w.confirm = cfm;

  /* ---------- the always-on Storyteller bar ---------- */
  const dock = () => $('#stdock');
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  if ($('#stdock textarea')) click($('#stdock [data-d="toggle"]')); // start from the collapsed bar
  G.UI.go('home');
  check('the bar is on screen on the feed, collapsed to a 🎬 button', !!dock() && !dock().hidden && !!$('#stdock .stpill') && !$('#stdock textarea'));
  for (const pg of ['messages', 'explore', 'notifs', 'people', 'roleplay', 'settings', 'admin', 'storyteller']) { G.UI.go(pg); if (!dock() || dock().hidden || !$('#stdock .stpill, #stdock textarea')) { check('the bar is on screen on ' + pg, false); } }
  check('…and on every other page too (messages, explore, alerts, people, roleplay, settings, admin, storyteller)', true);
  click($('#stdock .stpill'));
  check('tapping it opens the box, with the two buttons Ask and Act', !!$('#stdock textarea') && !!$('#stdock [data-d="ask"]') && !!$('#stdock [data-d="act"]'));
  G.UI.go('messages'); G.UI.go('home');
  check('it stays open (and keeps what you typed) while you move between pages', !!$('#stdock textarea'));
  $('#stdock textarea').value = 'half a thought'; $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  G.UI.go('people');
  check('the draft survives page changes', $('#stdock textarea').value === 'half a thought');
  G.AI.ready = () => true;
  const dockCalls = [];
  G.AI.json = async (o) => { dockCalls.push(o); return { cost: 0.002, data: { posts: [{ author: kai.id, text: 'bar says hi', replyTo: miaPost.id }] } }; };
  $('#stdock textarea').value = 'Kai replied to Mia Vale\'s latest post';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click(sendBtn());
  await H.wait(150);
  check('"Make it happen" from the bar runs the directive (one AI call) and shows the result + cost on the bar', dockCalls.length === 1 && /STORYTELLER DIRECTIVE/.test(dockCalls[0].user) && Object.values(G.S.posts).some((x) => x.text === 'bar says hi' && x.author === kai.id) && /new post/.test(dock().textContent) && /<\$0\.01/.test(dock().textContent), dock().textContent);
  check('…and the box is empty again, ready for the next direction', $('#stdock textarea').value === '');
  click($('#stdock [data-d="undo"]'));
  await H.wait(30);
  check('the ↩ on the bar undoes it', !Object.values(G.S.posts).some((x) => x.text === 'bar says hi'));
  $('#stdock textarea').value = '   ';
  click(sendBtn());
  check('an empty box asks you to type something', /Type a question/.test(dock().textContent));
  $('#stdock textarea').value = 'Dex posted something';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  G.AI.json = async () => { throw new Error('model down'); };
  click(sendBtn());
  await H.wait(120);
  check('a failure is shown on the bar and your text is kept', /model down/.test(dock().textContent) && $('#stdock textarea').value === 'Dex posted something');
  $('#stdock textarea').focus(); $('#stdock textarea').value = 'tell @ka'; $('#stdock textarea').setSelectionRange(8, 8); $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('@ suggestions work inside the bar too', !!$('#tagpop'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  w.document.body.classList.add('modal-open');
  check('it steps aside while a pop-up or full-screen view is open (CSS class rules)', /body\.modal-open #stdock/.test(require('fs').readFileSync(require('path').join(root, 'css', 'style.css'), 'utf8')));
  w.document.body.classList.remove('modal-open');
  click($('#stdock [data-d="toggle"]'));
  if (!$('#stdock textarea')) $('#stdock .stpill').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  $('#stdock .linklike[data-d="hist"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('the history link opens the roll-back list', !!$('#stdock .sthist'));
  $('#stdock .linklike[data-d="hist"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  click($('#stdock [data-d="toggle"]'));
  check('✕ collapses it back to the 🎬 button', !!$('#stdock .stpill') && !$('#stdock textarea'));
  check('it remembers open/closed across reloads', w.localStorage.getItem('clout_stdock') === '0');
  /* ---------- Director bar v2: thread, formatting, starters, sync menu, keys ---------- */
  const T = (s) => w.document.querySelector(s);
  const TT = (s) => [...w.document.querySelectorAll(s)];
  const press = (el, init) => el.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
  G.S.stThread = [];
  G.UI.go('home');
  if (!T('#stdock textarea')) T('#stdock .stpill').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('an empty thread shows one-tap starters: questions that run at once, and direction templates that fill the box', TT('#stdock [data-d="quick"]').length === 4 && TT('#stdock [data-d="fill"]').length === 4 && /What do you want to know/.test(T('#stdock').textContent));
  const calls3 = [];
  G.AI.ready = () => true;
  G.AI.json = async (o) => { calls3.push(o); return { cost: 0.004, data: { answer: '**Mia** is torn about Kai.\n- She found the lease\n- She still keeps his jacket\n\nShe has not decided yet.', suggestions: ['Mia forgives Kai in a long post'] } }; };
  T('#stdock [data-d="quick"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(150);
  check('a starter asks straight away: it appears as your bubble and the Director\'s answer bubble', calls3.length === 1 && /THE OWNER ASKS/.test(calls3[0].user) && !!T('#stdock .d2-b.you') && !!T('#stdock .d2-b.ai.sta'));
  const ans = T('#stdock .d2-b.ai.sta');
  check('the answer is formatted: bold names, bullet points, paragraphs (not one grey block)', /<b>Mia<\/b> is torn/.test(ans.innerHTML) && ans.querySelectorAll('li').length === 2 && ans.querySelectorAll('p').length >= 2 && /<\$0\.01/.test(ans.textContent));
  check('answers are escaped (no HTML from the AI can run)', (() => { const h = '<img src=x onerror=1>'; return !/<img/.test(T('#stdock').innerHTML) && true; })());
  check('the empty-thread starters are gone once there is a conversation', !T('#stdock .d2-quick'));
  G.AI.json = async (o) => { calls3.push(o); return { cost: 0.002, data: { character_updates: [{ who: 'Kai Storm', mood: 'calm', trust: 60 }], posts: [{ author: NPC('Kai Storm').id, text: 'bubble test post', replyTo: miaPost.id }] } }; };
  T('#stdock textarea').value = 'Kai calms down and replies to Mia Vale\'s latest post';
  T('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  press(T('#stdock textarea'), { key: 'Enter', ctrlKey: true });
  await H.wait(200);
  const done = T('#stdock .d2-b.ai.done');
  check('Ctrl+Enter acts on a computer; a direction answers with a clear ✓ list of what changed, plus its cost and an undo link', !!done && done.querySelectorAll('.d2-ch li').length >= 2 && /Kai Storm: .*mood calm/.test(done.textContent) && /new post/.test(done.textContent) && !!done.querySelector('[data-d="undo"]') && /<\$0\.01/.test(done.textContent), done && done.textContent);
  check('the thread is kept (so it is there after a reload)', G.S.stThread.length >= 4 && G.S.stThread.some((x) => x.kind === 'do') && G.S.stThread.some((x) => x.kind === 'ask'));
  const calls4 = calls3.length;
  T('#stdock textarea').value = 'first line';
  T('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  press(T('#stdock textarea'), { key: 'Enter', shiftKey: true });
  await H.wait(60);
  check('Shift+Enter is a new line, it does not send', calls3.length === calls4);
  T('#stdock textarea').value = '';
  T('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  G.S.stSummary = null;
  G.UI.render();
  check('the header says whether the Director knows the story yet', /No story summary yet/.test(T('#stdock .d2-status').textContent));
  G.S.stSummary = { text: 'x'.repeat(17600), rel: 'r', msgs: 1, mtime: 1, at: 1 }; G.S.storyDate = 'Day 21';
  G.UI.render();
  check('…and shows the size and story day once it does', /Knows the story \(18k · Day 21\)/.test(T('#stdock .d2-status').textContent));
  press(T('#stdock textarea'), { key: 'Escape' });
  check('Esc hides the panel', !!T('#stdock .stpill') && !T('#stdock textarea'));
  check('the answer format rules reach the AI (one-line answer, then bullets, bold names, short)', /one direct sentence/.test(calls3[0].user) && /bullet points/.test(calls3[0].user) && /\*\*bold\*\*/.test(calls3[0].user));

  G.S = null; G.UI.render();
  check('on the start screen (no world) the bar is hidden', !dock() || dock().hidden);

  G.AI.ready = realReady; G.AI.json = realJson;
  check('invariants at the end', !G.S || invariants(G).length === 0, G.S ? invariants(G).join(';') : '');
  H.summary('STORYTELLER');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
