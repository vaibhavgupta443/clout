// The in-game spending cap: paid calls stop once the limit is spent; local models are never limited; bad values are safe.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, state, prompts } = H;
const $ = (s) => w.document.querySelector(s);
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const okReply = (cost) => H.reply(JSON.stringify({ ok: true }), { usage: { cost } });
const call = async () => { state.queue.push(okReply(0.4)); return G.AI.json({ user: 'x', maxTokens: 50, system: 'You output only JSON.', temperature: 0 }); };
const tryCall = async () => { try { await call(); return null; } catch (e) { return e; } };

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.settings;

  check('the default cap is $1', G.AI.capVal() === 1 || S.spendCap === 1);
  S.spendCap = 1; S.spendBase = null; S.totalSpend = 7.5; // a key that already spent $7.50: the window starts NOW
  check('past spending does not count: the window starts at the current total', G.AI.spent() === 0 && S.spendBase === 7.5 && G.AI.capLeft() === 1 && !G.AI.capReached());

  check('call 1 ($0.40) goes through', (await tryCall()) === null);
  check('call 2 ($0.40) goes through', (await tryCall()) === null);
  check('spend is tracked exactly', Math.abs(G.AI.spent() - 0.8) < 1e-9 && Math.abs(G.AI.capLeft() - 0.2) < 1e-9);
  check('call 3 still goes through (only $0.80 spent so far)', (await tryCall()) === null);
  check('now $1.20 is spent: the cap is reached', G.AI.capReached());
  const before = state.calls;
  const err = await tryCall();
  check('call 4 is BLOCKED with a friendly, user-facing error', err && err.user === true && /Spending limit reached/.test(err.message) && /\$1\.00/.test(err.message) && /Settings/.test(err.message), err && err.message);
  check('nothing at all was sent for the blocked call', state.calls === before);
  const over = G.AI.spent() - 1;
  check('overshoot is at most one call (here $0.20)', over > 0 && over <= 0.4 + 1e-9, over.toFixed(2));
  for (let i = 0; i < 20; i++) await tryCall();
  check('20 more attempts: still blocked, still nothing sent', state.calls === before);

  H.freshWorld();
  prompts.length = 0;
  const r = await E.speak({ mode: 'post', text: 'will be blocked' }).catch((e) => ({ threw: e }));
  check('a player turn while capped changes nothing in the world and does not crash', (r === null || (r && r.threw)) && invariants(G).length === 0 && G.busy === false);
  check('...no AI request was made and no stray post was left', prompts.length === 0 && !Object.values(G.S.posts).some((p) => p.text === 'will be blocked'));
  check('...and the player is told why', /limit/i.test(($('#toasts') || {}).textContent || ''));
  check('the free world keeps running while capped', (() => { const n = G.S.postOrder.length; for (let h = 0; h < 48; h++) E.tick(60); return G.S.postOrder.length > n && invariants(G).length === 0; })());
  G.settings.directorOnly = false; // this check is about the spending cap, not the credit-saver switch
  check('the AI content bank also stops (no background spend)', G.Bank.enabled() === false && G.Bank.tick() === null);

  G.UI.go('settings');
  check('Settings shows the limit, usage, and a reset button', /Spending limit/.test($('#page').textContent) && /limit reached/.test($('#page').textContent) && !!$('[data-act="capReset"]'));
  check('the sidebar shows used-of-limit', /limit/.test(($('#spend') || {}).textContent || ''));
  click('[data-act="capReset"]');
  check('"Start a new window" re-opens the cap', !G.AI.capReached() && G.AI.spent() === 0);
  const sel = $('select[data-setting="spendCap"]');
  sel.value = '5'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('choosing $5 sets the cap and starts a fresh window', S.spendCap === 5 && G.AI.spent() === 0 && G.AI.capLeft() === 5);
  const sel2 = $('select[data-setting="spendCap"]');
  sel2.value = '0'; sel2.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('"No limit" turns it off', S.spendCap === 0 && !G.AI.capOn() && G.AI.capLeft() === Infinity);
  for (let i = 0; i < 4; i++) await call();
  check('with no limit, calls keep going', !G.AI.capReached());
  S.spendCap = 1; G.AI.newWindow();

  for (const bad of [NaN, 'abc', -5, null, undefined, '', {}, [], Infinity, '1e999']) {
    S.spendCap = bad;
    check('spendCap=' + String(bad) + ' falls back to the safe $1 cap (never silently unlimited)', G.AI.capVal() === 1 && G.AI.capOn(), String(G.AI.capVal()));
  }
  S.spendCap = '2'; check('numeric strings are understood', G.AI.capVal() === 2);
  S.spendCap = 0; check('0 is the one explicit way to say no limit', G.AI.capVal() === 0 && !G.AI.capOn());
  S.spendCap = 1;
  S.totalSpend = NaN; S.spendBase = NaN;
  let threw = false; try { G.AI.spent(); G.AI.capReached(); G.AI.capLeft(); } catch (e) { threw = true; }
  check('NaN spend values never throw', !threw);
  S.totalSpend = 0; S.spendBase = null;

  S.provider = 'ollama'; S.baseUrl = 'http://localhost:11434/v1'; S.model = 'llama3'; S.totalSpend = 999; S.spendBase = 0;
  check('local models ignore the cap entirely', !G.AI.capOn() && !G.AI.capReached() && G.AI.capLeft() === Infinity);
  state.queue.push(okReply(0));
  check('and a local call works even with "$999 spent"', (await G.AI.json({ user: 'x', maxTokens: 20, system: 'You output only JSON.' })).data.ok === true);
  S.provider = 'openrouter'; S.baseUrl = ''; S.model = 'deepseek/deepseek-v4-flash'; S.totalSpend = 0; S.spendBase = null;

  S.spendCap = 1; S.totalSpend = 3; S.spendBase = 2.5; G.Store.saveSettings();
  const key = Object.keys(w.localStorage).find((k) => /settings/i.test(k));
  const saved = JSON.parse(w.localStorage.getItem(key) || '{}');
  check('cap + window are saved with the settings', saved.spendCap === 1 && saved.spendBase === 2.5, JSON.stringify(saved).slice(0, 100));

  H.summary('SPENDING CAP');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
