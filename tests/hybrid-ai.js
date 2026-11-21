// Hybrid AI: a free LOCAL helper does the cheap jobs, OpenRouter does the rest; either side takes over when the other fails.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };

// a fake network with two sides, each with its own behaviour
const mode = { main: 'ok', helper: 'ok' };
const log = [];
const realFetch = w.fetch;
const reply = (content, cost, finish) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 50, cost } }) });
w.fetch = async (url, o) => {
  const u = String(url);
  if (!u.includes('/chat/completions')) return realFetch(url, o);
  const side = u.includes('11434') ? 'helper' : u.includes('openrouter.ai') ? 'main' : 'other';
  const body = JSON.parse(o.body);
  log.push({ side, body, auth: (o.headers || {}).Authorization });
  const m = mode[side];
  const cost = side === 'main' ? 0.01 : 0;
  if (m === 'down') throw new TypeError('fetch failed');
  if (m === '500') return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
  if (m === '402') return { ok: false, status: 402, json: async () => ({ error: { message: 'insufficient credits' } }) };
  if (m === '401') return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) };
  if (m === 'garbage') return reply('this is not json at all', cost);
  if (m === 'refuse') return reply("I'm sorry, but I can't help with that request.", cost);
  if (m === 'filter') return reply('', cost, 'content_filter');
  return reply(JSON.stringify({ ok: true, side }), cost);
};
const reset = (m = {}) => { Object.assign(mode, { main: 'ok', helper: 'ok' }, m); log.length = 0; G.AI.helperReset(); };
const call = (task, extra) => G.AI.json(Object.assign({ task, user: 'x', maxTokens: 50, system: 'You output only JSON.', temperature: 0 }, extra));
const toasts = []; // the harness collapses some toast timers, so record the messages instead of reading the DOM
const toastsText = () => toasts.join(' | ');
const sides = () => log.map((l) => l.side).join(',');
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const origToast = G.UI.toast;
  G.UI.toast = (m, k) => { toasts.push(String(m)); return origToast(m, k); };
  const S = G.settings;
  S.spendCap = 0; // routing tests are not about the cap

  /* ---------- helper off: nothing changes ---------- */
  reset();
  check('helper off: every task goes to OpenRouter', await (async () => { for (const t of ['bank', 'memory', 'tick', 'turn', 'scene', 'idea', 'nonsense', undefined]) await call(t); return sides() === 'main,main,main,main,main,main,main,main'; })(), sides());
  check('helper off: plan is just the main model', G.AI.plan('bank').length === 1 && !G.AI.plan('bank')[0].helper && !G.AI.helperReady() && !G.AI.routesLocal('bank'));
  check('helper off: ready/usable follow the key exactly as before', G.AI.ready() === true && G.AI.usable() === true && (() => { const k = S.apiKey; S.apiKey = ''; const r = G.AI.ready() || G.AI.usable(); S.apiKey = k; return !r; })());

  /* ---------- helper on: routing ---------- */
  Object.assign(S, { helperOn: true, helperProvider: 'ollama', helperBase: '', helperModel: 'llama3.1:8b', route: { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' } });
  check('helper is ready with the Ollama default address', G.AI.helperReady() && G.AI.helperBase() === 'http://localhost:11434/v1');
  reset();
  const spend0 = S.totalSpend;
  await call('bank'); await call('memory'); await call('summary'); await call('idea'); await call('npcgen');
  check('background jobs run on the local helper', sides() === 'helper,helper,helper,helper,helper', sides());
  check('...with the helper model, no OpenRouter-only fields, no auth header', log.every((l) => l.body.model === 'llama3.1:8b' && !('usage' in l.body) && !('reasoning' in l.body) && !l.auth));
  check('...and they cost nothing', S.totalSpend === spend0);
  reset();
  await call('turn'); await call('tick'); await call('crowd'); await call('group'); await call('event'); await call('live'); await call('world'); await call('scene');
  check('your turns, world ticks, events and scenes stay on the main model', sides() === 'main,main,main,main,main,main,main,main', sides());
  check('...with the main model + cost reporting', log.every((l) => l.body.model === S.model && l.body.usage && l.auth === 'Bearer sk-test'));
  check('...and they are paid for', Math.abs(S.totalSpend - spend0 - 0.08) < 1e-9, S.totalSpend - spend0);
  check('unknown / missing task behaves like a normal turn (main)', await (async () => { reset(); await call('whatever'); await call(undefined); return sides() === 'main,main'; })());
  reset();
  S.route = { bg: 'cloud', world: 'local', story: 'local', scene: 'local' };
  await call('bank'); await call('tick'); await call('turn'); await call('scene');
  check('routes are honoured both ways', sides() === 'main,helper,helper,helper', sides());
  for (const garbage of [null, 5, 'x', [], { bg: 'sideways', world: 7, story: null }, undefined]) {
    S.route = garbage; reset();
    await call('bank'); await call('turn');
    check('garbage route ' + JSON.stringify(garbage) + ' falls back to defaults (bg local, rest main)', sides() === 'helper,main', sides());
  }

  /* ---------- presets ---------- */
  G.UI.go('settings');
  for (const [p, want] of [['quality', 'main,main,main,main'], ['balanced', 'helper,main,main,main'], ['saver', 'helper,helper,main,main'], ['local', 'helper,helper,helper,helper']]) {
    click(`[data-act="routePreset"][data-p="${p}"]`);
    reset();
    await call('bank'); await call('tick'); await call('turn'); await call('scene');
    check('preset "' + p + '" routes ' + want, sides() === want, sides());
  }
  const nopeBtn = $('[data-act="routePreset"]'); nopeBtn.setAttribute('data-p', 'nope'); click(nopeBtn); nopeBtn.setAttribute('data-p', 'local'); click(nopeBtn);
  check('an unknown preset does nothing (the real one still works)', G.AI.routeFor('bg') === 'local' && G.AI.routeFor('scene') === 'local');
  S.route = { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' };

  /* ---------- helper fails: the main model takes over, invisibly ---------- */
  for (const bad of ['down', '500', 'garbage', 'refuse', 'filter', '401']) {
    reset({ helper: bad });
    const r = await call('bank');
    check('helper "' + bad + '": the call still succeeds, via the main model', r.data.side === 'main' && log[0].side === 'helper' && log[log.length - 1].side === 'main', sides());
  }
  reset({ helper: 'down' });
  await call('bank'); await call('bank');
  check('after two failures the helper is paused (circuit breaker)', G.AI.helper.until > Date.now() && !G.AI.helperUp());
  log.length = 0;
  await call('bank'); await call('memory');
  check('while paused, background jobs go straight to the main model (no wasted waiting)', sides() === 'main,main', sides());
  check('...and the player is told once', /not answering/i.test(toastsText()));
  G.AI.helperReset(); mode.helper = 'ok'; log.length = 0;
  await call('bank');
  check('un-pausing brings the helper back', sides() === 'helper');
  reset({ helper: 'refuse' });
  await call('bank'); await call('bank'); await call('bank');
  check('a helper that REFUSES is not treated as an outage (never paused)', G.AI.helperUp());
  reset({ helper: 'down' });
  await call('bank');
  mode.helper = 'ok';
  await call('bank');
  check('one failure then success resets the counter (no pause)', G.AI.helperUp() && G.AI.helper.fails === 0);
  check('the stats count the take-overs', G.AI.stats.failovers >= 6 && G.AI.stats.byTask.bank && G.AI.stats.byTask.bank.failovers >= 1);

  /* ---------- main fails: the helper takes over ---------- */
  for (const bad of ['down', '402', '401', 'refuse', 'filter']) {
    reset({ main: bad });
    const r = await call('turn');
    check('main "' + bad + '": your turn still works, via the helper', r.data.side === 'helper' && log[0].side === 'main' && log[log.length - 1].side === 'helper', sides());
  }
  reset({ main: '500' });
  const r500 = await threw(() => call('turn'));
  check('main server errors are retried, then reported (not silently handed over: it may recover)', !!r500 && r500.user === true && /boom|error/i.test(r500.message), r500 && r500.message);
  reset({ main: '402', helper: 'down' });
  const bothDown = await threw(() => call('turn'));
  check('both sides down: a friendly error, no crash, no hang', !!bothDown && bothDown.user === true, bothDown && bothDown.message);
  check('...and the world is still consistent', invariants(G).length === 0);

  /* ---------- the spending cap hands over to the free helper ---------- */
  S.spendCap = 1; S.spendBase = S.totalSpend - 5; // 5 dollars "already spent" in this window
  check('cap reached', G.AI.capReached());
  reset();
  const rc = await call('turn');
  check('cap reached: your turn runs on the helper (free) instead of failing', rc.data.side === 'helper' && sides() === 'helper', sides());
  check('cap reached: background jobs keep working too', (await call('bank')).data.side === 'helper');
  check('cap reached: the bank stays enabled because the helper can serve', G.Bank.enabled());
  Object.assign(S, { helperOn: false });
  check('cap reached, no helper: the same clear spending-limit error as before', (await threw(() => call('turn'))).message.includes('Spending limit reached') && !G.Bank.enabled());
  Object.assign(S, { helperOn: true, spendCap: 0 });

  /* ---------- no key at all: local-only play ---------- */
  const key = S.apiKey; S.apiKey = '';
  check('no OpenRouter key but a helper: the game is "ready" and everything runs locally', G.AI.ready() && G.AI.usable());
  reset();
  await call('turn'); await call('tick'); await call('bank');
  check('...all tasks go to the helper', sides() === 'helper,helper,helper', sides());
  Object.assign(S, { helperOn: false });
  check('no key and no helper: not ready, as before', !G.AI.ready() && /API key/.test(G.AI.notReadyMsg()));
  Object.assign(S, { helperOn: true }); S.apiKey = key;

  /* ---------- tests always hit the thing they test ---------- */
  reset({ helper: 'down' });
  const t1 = await threw(() => call('helpertest'));
  check('"Test helper" only talks to the helper and reports its failure honestly (no silent fallback)', !!t1 && sides() === 'helper' && t1.user === true, sides() + ' ' + (t1 && t1.message));
  reset({ main: '402' });
  const t2 = await threw(() => call('selftest'));
  check('the main-model self-test never falls back to the helper', !!t2 && sides() === 'main' && /credits/.test(t2.message), sides());
  reset({ helper: 'ok' });
  G.AI.helper.until = Date.now() + 1e6;
  await call('helpertest');
  check('"Test helper" works even while the helper is paused', sides() === 'helper');
  G.AI.helperReset();

  /* ---------- cheaper cloud model for background jobs ---------- */
  S.cheapModel = 'cheap/model';
  Object.assign(S, { helperOn: false });
  reset();
  await call('bank'); await call('turn'); await call('tick');
  check('cheap model: used for background jobs on OpenRouter only', log[0].body.model === 'cheap/model' && log[1].body.model === S.model && log[2].body.model === S.model, log.map((l) => l.body.model).join(','));
  Object.assign(S, { helperOn: true }); S.cheapModel = '   ';
  reset({ helper: 'down' });
  await call('bank');
  check('a blank cheap model is ignored', log[log.length - 1].body.model === S.model);
  S.cheapModel = '';

  /* ---------- real jobs: bank refill + a whole turn ---------- */
  reset();
  H.freshWorld();
  G.Bank.lastAt = 0; G.Bank.backoff = 0;
  const free = G.AI.routesLocal('bank');
  check('bank refills are routed to the helper, and tick faster when free', free && G.Bank.EVERY_FREE_MS < G.Bank.EVERY_MS);
  await G.Bank.refill();
  check('a real bank refill went to the helper', log.length >= 1 && log.every((l) => l.side === 'helper'), sides());
  reset({ helper: 'down' });
  await G.Bank.refill();
  check('a real bank refill survives a dead helper (main covers it)', log.some((l) => l.side === 'main'));
  reset();
  const before = Object.keys(G.S.posts).length;
  await E.speak({ mode: 'post', text: 'hello hybrid world' });
  check('a whole player turn works in hybrid mode (main model)', Object.keys(G.S.posts).length > before && sides().startsWith('main') && invariants(G).length === 0, sides());
  reset({ main: '402' });
  const before2 = Object.keys(G.S.posts).length;
  await E.speak({ mode: 'post', text: 'out of credits but the show goes on' });
  check('...and when OpenRouter is out of credits the turn still completes on the helper', Object.keys(G.S.posts).length > before2 && sides() === 'main,helper', sides());
  reset();

  /* ---------- savings + stats ---------- */
  const st = G.AI.stats;
  check('stats: local and cloud counts, per-task table', st.localCalls > 0 && st.cloudCalls > 0 && st.byTask.bank && st.byTask.bank.local > 0 && st.byTask.turn && st.byTask.turn.cost > 0);
  check('lifetime free calls/tokens are saved in settings', S.localCalls > 0 && S.localTokens > 0 && Number.isFinite(S.localCalls));
  check('the savings estimate is a finite non-negative number', Number.isFinite(G.AI.saved()) && G.AI.saved() >= 0);
  S.totalTokens = NaN; S.localTokens = 'x';
  check('...and survives corrupt counters', Number.isFinite(G.AI.saved()));
  S.totalTokens = 1000; S.localTokens = 100;

  /* ---------- settings screen ---------- */
  Object.assign(S, { helperOn: true, helperModel: 'llama3.1:8b', route: { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' } });
  G.UI.go('settings');
  check('Settings has the Hybrid AI card with toggle, address, model, 4 routes, 4 presets, cheap model', /Hybrid AI/.test($('#page').textContent) && !!$('input[data-setting="helperOn"]') && !!$('input[data-setting="helperBase"]') && !!$('input[data-setting="helperModel"]') && $$('select[data-route]').length === 4 && $$('[data-act="routePreset"]').length === 4 && !!$('input[data-setting="cheapModel"]'));
  check('...the selects show the current routes', $('select[data-route="bg"]').value === 'local' && $('select[data-route="world"]').value === 'cloud');
  change($('select[data-route="world"]'), 'local');
  check('changing a route in the UI takes effect and is saved', S.route.world === 'local' && S.route.bg === 'local' && G.AI.routesLocal('tick'));
  change($('select[data-route="world"]'), 'sideways');
  check('a forged route value is ignored', S.route.world === 'local');
  const forged = $('select[data-route="bg"]'); forged.setAttribute('data-route', '__proto__'); change(forged, 'local');
  check('a forged route name is ignored (no prototype pollution)', ({}).local === undefined && Object.keys(S.route).sort().join() === 'bg,scene,story,world');
  forged.setAttribute('data-route', 'bg');
  const hm = $('input[data-setting="helperModel"]');
  change(hm, '"><img src=x onerror=alert(1)><script>alert(2)</script>');
  G.UI.render();
  check('a hostile helper model name is escaped in the page', $$('#page img[onerror]').length === 0 && $$('#page script').length === 0 && $('input[data-setting="helperModel"]').value.includes('onerror'));
  change($('input[data-setting="helperModel"]'), 'llama3.1:8b');
  const info = $('#hybridinfo').textContent;
  check('the live panel shows helper status, free calls, estimated savings, per-job table', /Helper:/.test(info) && /free local calls/.test(info) && /saved/.test(info) && /bank/.test(info), info.slice(0, 200));
  G.AI.helper.until = Date.now() + 120000;
  G.UI.render();
  check('a paused helper is shown as paused', /paused/.test($('#hybridinfo').textContent));
  click('[data-act="helperReset"]');
  check('"Un-pause" works', G.AI.helperUp());
  reset();
  click('[data-act="testHelper"]');
  await H.wait(100);
  check('"Test helper" button hits the helper and says it works', sides() === 'helper' && /Helper works/.test(toastsText()), sides() + ' | ' + toastsText());
  Object.assign(S, { helperOn: false });
  G.UI.render();
  click('[data-act="testHelper"]');
  await H.wait(60);
  check('"Test helper" with the helper off explains what to do', /Tick/.test(toastsText()));
  Object.assign(S, { helperOn: true });

  /* ---------- fuzz: random outages never hang or crash ---------- */
  const modes = ['ok', 'ok', 'ok', 'down', '500', 'garbage', 'refuse', '402', 'filter'];
  const tasks = Object.keys(G.AI.TASKS).filter((t) => t !== 'helpertest' && t !== 'selftest');
  let rnd = 12345;
  const rand = (n) => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd % n; };
  let okN = 0, userErrN = 0, badErr = 0;
  for (let i = 0; i < 160; i++) {
    reset({ main: modes[rand(modes.length)], helper: modes[rand(modes.length)] });
    S.route = { bg: rand(2) ? 'local' : 'cloud', world: rand(2) ? 'local' : 'cloud', story: rand(2) ? 'local' : 'cloud', scene: rand(2) ? 'local' : 'cloud' };
    const e = await threw(() => call(tasks[rand(tasks.length)]));
    if (!e) okN++; else if (e.user === true || /empty|JSON|shape|parse/i.test(e.message)) userErrN++; else badErr++;
  }
  check('160 random outages: every call either succeeds or fails with a readable error, never crashes', okN + userErrN === 160 && badErr === 0 && okN > 60, `ok ${okN} / err ${userErrN} / bad ${badErr}`);
  check('...and counters stay sane', Number.isFinite(S.totalSpend) && Number.isFinite(S.localCalls) && Number.isFinite(G.AI.saved()) && invariants(G).length === 0);

  H.summary('HYBRID AI (local helper + OpenRouter)');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
