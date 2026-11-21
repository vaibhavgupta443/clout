// Talking to a character from the Director bar (in character, kept in the world).
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  /* ---------- the bar ---------- */
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = true;
  w.document.body.classList.add('ingame');
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const prompts = [];
  const posted = [];
  G.AI.json = async (o) => { prompts.push(o); return { cost: 0.002, data: { reply: 'I missed you, you know. *looks away*' } }; };
  const posts0 = Object.keys(S.posts).length;

  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  check('no Say button until you start a chat (from a profile)', !$('#stdock [data-d="say"]'));
  G.UI.acts.talkTo({ id: mia.id });
  check('choosing a character shows 💬 Say and a personal placeholder', !!$('#stdock [data-d="say"]') && /Say something to Mia/.test($('#stdock textarea').placeholder));
  $('#stdock textarea').value = 'did you miss me?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="say"]'));
  for (let i = 0; i < 80 && !/missed you/.test(($('#stdock .d2-b.chat') || {}).textContent || ''); i++) await H.wait(25);
  const bubble = $('#stdock .d2-b.chat');
  check('she answers in character, in the thread', !!bubble && /Mia Vale/.test(bubble.textContent) && /missed you/.test(bubble.textContent), bubble && bubble.textContent);
  const p = prompts[prompts.length - 1];
  check('the prompt makes the AI speak only as her, and carries what the player said', /Reply ONLY as Mia Vale/.test(p.user) && /did you miss me\?/.test(p.user) && /Never speak or act for/.test(p.user) && p.task === 'scene');
  check('talking is not an action: no approval card, no new posts, no world change', !$('#stdock [data-d="approve"]') && Object.keys(S.posts).length === posts0);
  check('the exchange is kept in this world and she remembers it', (S.dirChat[mia.id] || []).length === 2 && (mia.mem || []).some((m) => /told me/.test(m.text)));

  // a second turn carries the conversation so far
  $('#stdock textarea').value = 'where were you?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('#stdock textarea').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 40 && prompts.length < 2; i++) await H.wait(25);
  await H.wait(100);
  check('Enter says it while you are talking to someone, and the history is carried', prompts.length === 2 && /THIS CONVERSATION SO FAR/.test(prompts[1].user) && /did you miss me\?/.test(prompts[1].user) && (S.dirChat[mia.id] || []).length === 4);

  // Ask and Act still work while a chat is open
  G.AI.json = async (o) => { prompts.push(o); return { cost: 0, data: { answer: 'fine', suggestions: [] } }; };
  $('#stdock textarea').value = 'what does Mia think of me?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="ask"]'));
  for (let i = 0; i < 40 && !/THE OWNER ASKS/.test(prompts[prompts.length - 1].user); i++) await H.wait(25);
  check('❓ Ask still answers as the Director (not as Mia) while a chat is open', /THE OWNER ASKS/.test(prompts[prompts.length - 1].user) && !/Reply ONLY as/.test(prompts[prompts.length - 1].user));

  // errors
  G.AI.json = async () => { throw new Error('model down'); };
  $('#stdock textarea').value = 'hello?';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="say"]'));
  await H.wait(200);
  check('a failing model shows the error and keeps what you typed', /model down/.test($('#stdock').textContent) && $('#stdock textarea').value === 'hello?');

  // stop talking
  click($('#stdock [data-d="stopchat"]'));
  check('the ✕ button in the bar ends the chat', !$('#stdock [data-d="say"]'));
  G.UI.acts.talkTo({ id: mia.id });
  check('the profile button starts a chat too', !!$('#stdock [data-d="say"]'));

  H.summary('DIRECTOR CHAT');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
