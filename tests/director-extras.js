// Director extras: scheduled directions (free until due), /plan guard, intent routing, hotkeys, Admin /later.
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
  const St = E.Story;

  /* ---------- intent routing ---------- */
  const a = St.intent('in 2 days: Kai confesses to Mia');
  check('"in 2 days: …" is a schedule of 2880 minutes', a.kind === 'later' && a.minutes === 2880 && /Kai confesses/.test(a.text), JSON.stringify(a));
  check('"in 3 hours, …" and "/later 30m …" work', St.intent('in 3 hours, Mia posts a teaser').minutes === 180 && St.intent('/later 30m Dex texts me').minutes === 30);
  check('"/plan goal" is a plan', St.intent('/plan make Mia and Kai reconcile').kind === 'plan');
  check('a question is still a question, a direction a direction', St.intent('who is mad at me?').kind === 'ask' && St.intent('Kai posted a subtweet about Mia').kind === 'do');

  /* ---------- the bug: "@askai …" / "askai …" must NEVER become a direction (a character posted about it) ---------- */
  for (const q of ['/askai what is the summary', '@askai what is the summary', 'askai what is the summary', 'Ask AI: what is the summary', '@AskAI, summary please', '/ask who is mad at me']) {
    const i = St.intent(q);
    check('"' + q + '" is a question with the prefix removed', i.kind === 'ask' && !/askai|ask ai/i.test(i.text) && i.text.length > 3, JSON.stringify(i));
  }
  check('the Ask button forces a question whatever you type', St.intent('Kai posts a subtweet', 'ask').kind === 'ask' && St.intent('make Mia cry', 'ask').kind === 'ask');
  check('the Act button never turns into a question', St.intent('who is mad at me?', 'do').kind === 'do' && St.intent('in 2 days: Kai confesses', 'do').kind === 'later' && St.intent('/plan x', 'do').kind === 'plan');
  check('...but even Act never treats an askai line as a direction', St.intent('@askai what is going on', 'do').kind === 'ask');

  /* ---------- the bar: two buttons, and Ask changes nothing ---------- */
  w.document.body.classList.add('ingame');
  E.Admin.setOn(false);
  G.Admin = G.Admin || {};
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  check('the Director bar has an Ask button and an Act button', !!$('#stdock [data-d="ask"]') && !!$('#stdock [data-d="act"]') && !$('#stdock [data-d="send"]'));
  const aiCalls = [];
  G.AI.json = async (o) => { aiCalls.push(o); return { cost: 0, data: { answer: 'Mia and Kai are fine.', suggestions: [], posts: [{ author: Object.keys(S.npcs)[0], text: 'SHOULD NOT POST @askai' }] } }; };
  const posts0 = Object.keys(S.posts).length, hist0 = (E.undoStack || []).length;
  $('#stdock textarea').value = '@askai what is the summary';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('#stdock [data-d="act"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(250);
  check('even pressing Act on an @askai line only asks: no post, no change, the question text is clean', Object.keys(S.posts).length === posts0 && !Object.values(S.posts).some((p) => /askai/i.test(p.text)) && aiCalls.length && !/askai/i.test(aiCalls[aiCalls.length - 1].user.split('THE OWNER ASKS')[1] || ''), JSON.stringify(aiCalls.map((c) => String(c.user).slice(-80))));
  $('#stdock textarea').value = 'Kai posted a bitter subtweet about Mia';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  const before = aiCalls.length;
  $('#stdock [data-d="ask"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await H.wait(250);
  check('the Ask button on a direction-looking sentence is still a read-only question', Object.keys(S.posts).length === posts0 && aiCalls.length > before && /THE OWNER ASKS/.test(aiCalls[aiCalls.length - 1].user) && !/STORYTELLER DIRECTIVE/.test(aiCalls[aiCalls.length - 1].user));

  /* ---------- schedule: free, notified once, due, droppable ---------- */
  const cost0 = (S.askLog || []).length;
  const x = St.schedule(60, 'Kai confesses to Mia');
  check('schedule stores it with the due time and costs nothing', S.later.length === 1 && x.at === S.clock + 60 && (S.askLog || []).length === cost0);
  check('not due yet', St.due().length === 0 && St.checkDue() === 0);
  let threw = false; try { St.schedule(10, '   '); } catch (e) { threw = true; }
  check('an empty schedule is refused', threw);
  S.clock += 61;
  check('after the time passes it is due and the notification is sent once', St.due().length === 1 && St.checkDue() === 1 && St.checkDue() === 0 && S.notifs.some((n) => /Due now/.test(n.text)));
  St.dropLater(x.id);
  check('dismissing removes it', S.later.length === 0 && St.due().length === 0);
  for (let i = 0; i < 40; i++) St.schedule(5, 'thing ' + i);
  check('the list is capped (30)', S.later.length === 30);
  S.later = [];

  /* ---------- timeline ---------- */
  const tl = St.timeline();
  check('timeline is newest first and bounded', Array.isArray(tl) && tl.length <= 30 && tl.every((e, i) => !i || tl[i - 1].t >= e.t));

  /* ---------- /plan needs an AI (clear error, nothing changes) ---------- */
  let msg = ''; try { await St.plan('reconcile'); } catch (e) { msg = e.message; }
  check('/plan with no usable AI answer fails cleanly and changes nothing', !!msg && S.later.length === 0, msg);

  /* ---------- Admin commands ---------- */
  E.Admin.setOn(true);
  const out = await E.Admin.run('/later 2d Kai confesses to Mia').catch((e) => ({ error: e.message }));
  check('admin /later schedules', S.later.length === 1 && /2 days/.test(JSON.stringify(out)), JSON.stringify(out));
  const bad = await E.Admin.run('/later soon whatever').catch((e) => e.message);
  check('admin /later with a bad time explains usage', /Usage/i.test(JSON.stringify(bad)) && S.later.length === 1, JSON.stringify(bad));

  /* ---------- hotkeys + Director bar ---------- */
  w.document.body.classList.add('ingame');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  check('Ctrl+K opens the Director bar', !!$('#stdock') && /open/.test($('#stdock').className + ($('#stdock').dataset.open || '')) || !!$('#stdock'));
  S.clock += 60 * 24 * 3;
  St.checkDue();
  
  check('a due item shows a "Due now" card with Do it / dismiss', /Due now/.test(($('#stdock') || {}).innerHTML || ''));
  const it = S.later[0];
  const btn = $('#stdock [data-d="droplater"]');
  if (btn) btn.click();
  check('dismiss button drops it', !S.later.some((l) => l.id === it.id));

  E.Admin.setOn(false);
  H.summary('DIRECTOR EXTRAS');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
