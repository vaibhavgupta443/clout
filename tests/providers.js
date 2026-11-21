// Local-model support (Ollama / LM Studio / KoboldCpp / any OpenAI-compatible server) + OpenRouter unchanged.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, state, prompts } = H;
const isErr = (e) => !!e && typeof e.message === 'string';

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const seen = [];
  const realFetch = w.fetch;
  // record the URL + headers of every call, then answer with a normal reply
  w.fetch = async (url, o) => {
    seen.push({ url: String(url), headers: o && o.headers ? Object.assign({}, o.headers) : {}, body: o && o.body ? JSON.parse(o.body) : null });
    return realFetch(url, o);
  };
  const call = async () => { seen.length = 0; state.queue.length = 0; return G.AI.json({ user: 'u' }); };

  /* ---- OpenRouter is unchanged ---- */
  G.settings.provider = 'openrouter'; G.settings.baseUrl = ''; G.settings.apiKey = 'sk-or-xyz'; G.settings.model = 'deepseek/deepseek-v4-flash';
  await call();
  check('OpenRouter: default URL', seen[0].url === 'https://openrouter.ai/api/v1/chat/completions', seen[0].url);
  check('OpenRouter: Authorization + X-Title sent', seen[0].headers.Authorization === 'Bearer sk-or-xyz' && seen[0].headers['X-Title'] === 'Clout');
  check('OpenRouter: usage + reasoning options sent', seen[0].body.usage && seen[0].body.usage.include === true && seen[0].body.reasoning && seen[0].body.reasoning.enabled === false);
  check('OpenRouter: needs a key', (G.settings.apiKey = '', G.AI.ready() === false) && /OpenRouter API key/.test(G.AI.notReadyMsg()));
  G.settings.apiKey = 'sk-or-xyz';
  check('OpenRouter: ready with a key', G.AI.ready() && !G.AI.isLocal());

  /* ---- Ollama preset ---- */
  G.settings.provider = 'ollama'; G.settings.apiKey = ''; G.settings.model = 'llama3.1:8b';
  await call();
  check('Ollama: default URL', seen[0].url === 'http://localhost:11434/v1/chat/completions', seen[0].url);
  check('Ollama: NO Authorization header without a key', !('Authorization' in seen[0].headers));
  check('Ollama: no OpenRouter-only headers', !('X-Title' in seen[0].headers) && !('HTTP-Referer' in seen[0].headers));
  check('Ollama: no OpenRouter-only body fields (usage/reasoning)', !('usage' in seen[0].body) && !('reasoning' in seen[0].body));
  check('Ollama: sends the chosen model + json mode', seen[0].body.model === 'llama3.1:8b' && seen[0].body.response_format.type === 'json_object');
  check('local: ready without any key, but needs a model', G.AI.ready() && G.AI.isLocal() && (G.settings.model = '', G.AI.ready() === false) && /local server address and model/.test(G.AI.notReadyMsg()));
  G.settings.model = 'llama3.1:8b';
  G.settings.apiKey = 'optional-key';
  await call();
  check('local: an optional key IS sent when provided', seen[0].headers.Authorization === 'Bearer optional-key');
  G.settings.apiKey = '';

  /* ---- other presets + custom address ---- */
  for (const [prov, url] of [['lmstudio', 'http://localhost:1234/v1/chat/completions'], ['koboldcpp', 'http://localhost:5001/v1/chat/completions']]) {
    G.settings.provider = prov; G.settings.model = 'm';
    await call();
    check(`${prov}: preset URL`, seen[0].url === url, seen[0].url);
  }
  G.settings.provider = 'custom'; G.settings.baseUrl = 'http://192.168.1.50:8000/v1///'; G.settings.model = 'm';
  await call();
  check('custom: address used, trailing slashes trimmed', seen[0].url === 'http://192.168.1.50:8000/v1/chat/completions', seen[0].url);
  G.settings.baseUrl = '';
  check('custom with no address is not ready', G.AI.ready() === false);
  G.settings.provider = 'bogus-provider';
  check('unknown provider falls back to OpenRouter', G.AI.provider() === 'openrouter');
  G.settings.provider = 'ollama'; G.settings.baseUrl = 'http://localhost:11434/v1'; G.settings.model = 'llama3.1:8b';

  /* ---- errors a local user will really hit ---- */
  state.queue.length = 0;
  state.queue.push(H.fail(404, 'model "llama3.1:8b" not found'));
  let r = await G.AI.json({ user: 'u' }).catch((e) => e);
  check('404 -> tells you how to pull the model', isErr(r) && /does not know the model "llama3\.1:8b"/.test(r.message) && /ollama pull/.test(r.message), r.message);
  state.queue.length = 0;
  state.queue.push(() => { throw new TypeError('Failed to fetch'); }, () => { throw new TypeError('Failed to fetch'); }, () => { throw new TypeError('Failed to fetch'); });
  r = await G.AI.json({ user: 'u' }).catch((e) => e);
  check('server not running / CORS -> friendly hint (OLLAMA_ORIGINS)', isErr(r) && /Can't reach your local model server/.test(r.message) && /OLLAMA_ORIGINS/.test(r.message) && r.message.includes('http://localhost:11434/v1'), r.message);
  state.queue.length = 0;
  state.queue.push(H.fail(400, 'response_format not supported'), H.reply('{"ok":1}'));
  r = await G.AI.json({ user: 'u' });
  check('server rejects json mode -> retried without it', r.data.ok === 1 && prompts.at(-1).body.response_format === undefined);
  state.queue.length = 0;
  state.queue.push(H.fail(500, 'out of memory'), H.fail(500, 'out of memory'), H.fail(500, 'out of memory'), H.fail(500, 'out of memory'));
  r = await G.AI.json({ user: 'u' }).catch((e) => e);
  check('server errors are labelled as the model server, not OpenRouter', isErr(r) && /Model server error/.test(r.message) && !/OpenRouter/.test(r.message), r.message);
  state.queue.length = 0;
  state.queue.push(H.fail(401, 'bad key'));
  r = await G.AI.json({ user: 'u' }).catch((e) => e);
  check('local 401 message does not mention OpenRouter', isErr(r) && !/OpenRouter/.test(r.message));
  state.queue.length = 0;

  /* ---- cost ---- */
  const spend0 = G.settings.totalSpend;
  await call();
  check('local calls cost nothing', G.settings.totalSpend === spend0);

  /* ---- model discovery ---- */
  w.fetch = async (url) => {
    seen.push({ url: String(url) });
    if (String(url).endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5:14b' }, {}] }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  seen.length = 0;
  let list = await G.AI.models();
  check('model list from /v1/models (OpenAI format)', list.length === 2 && list[0].id === 'llama3.1:8b' && seen[0].url === 'http://localhost:11434/v1/models');
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models: [{ name: 'mistral:7b' }, { model: 'gemma2:9b' }] }) });
  list = await G.AI.models();
  check('model list also understands the {models:[{name}]} shape', list.map((m) => m.id).join() === 'mistral:7b,gemma2:9b');
  w.fetch = async () => { throw new TypeError('Failed to fetch'); };
  r = await G.AI.models().catch((e) => e);
  check('model list: unreachable server -> clear message', isErr(r) && /Can't reach http:\/\/localhost:11434\/v1/.test(r.message));
  w.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  r = await G.AI.models().catch((e) => e);
  check('model list: HTTP error -> clear message', isErr(r) && /HTTP 503/.test(r.message));
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: 'nope' }) });
  check('model list: garbage body -> empty list, no crash', (await G.AI.models()).length === 0);
  r = await G.AI.balance().catch((e) => e);
  check('balance check explains it is OpenRouter-only', isErr(r) && /only available for OpenRouter/.test(r.message));
  w.fetch = realFetch;

  /* ---- the whole game runs on a local provider (no key) ---- */
  H.freshWorld();
  G.settings.apiKey = '';
  state.mode = 'normal';
  const post = await E.speak({ mode: 'post', text: 'hello from a local model' });
  check('a full post turn works with a local provider and no key', !!post && post.placed.post.judge && invariants(G).length === 0);
  const wg = await E.suggest({ intent: 'x' });
  check('suggestions work locally', wg.length === 2);
  const live = await E.goLive('local stream', 15);
  check('live stream works locally', !!G.S.lastLive);

  /* ---- UI: wizard + settings ---- */
  G.S = null;
  G.UI.render();
  const wiz = () => { G.Pages.wiz.showWizard = true; G.UI.render(); };
  wiz();
  check('wizard shows the provider chooser with all 5 options', w.document.querySelectorAll('#provider option').length === 5);
  G.settings.provider = 'openrouter'; G.UI.render();
  check('OpenRouter UI: model dropdown + key box', !!w.document.querySelector('#modelsel') && !!w.document.querySelector('#apikey') && !/Detect models/.test(w.document.body.textContent));
  H.change('#provider', 'ollama');
  check('switching to Ollama sets the default model', G.settings.provider === 'ollama' && G.settings.model === 'llama3.1:8b' && G.settings.baseUrl === '');
  check('Ollama UI: free-text model box, detect button, setup help, no model dropdown', !!w.document.querySelector('#modelcustom') && !w.document.querySelector('#modelsel') && /Detect models/.test(w.document.body.textContent) && /OLLAMA_ORIGINS/.test(w.document.body.textContent));
  check('Ollama UI: address placeholder shows the default', w.document.querySelector('#baseurl').placeholder === 'http://localhost:11434/v1');
  H.type('#baseurl', 'http://localhost:9999/v1');
  H.type('#modelcustom', 'my-uncensored-model');
  check('typing a custom address + model saves them', G.settings.baseUrl === 'http://localhost:9999/v1' && G.settings.model === 'my-uncensored-model' && G.AI.base() === 'http://localhost:9999/v1');
  H.change('#provider', 'lmstudio');
  check('switching providers keeps a custom model name the user typed', G.settings.model === 'my-uncensored-model' && G.settings.baseUrl === '');
  H.change('#provider', 'openrouter');
  check('back to OpenRouter restores a cloud model', G.settings.provider === 'openrouter' && G.settings.model !== 'my-uncensored-model' || G.settings.model === 'my-uncensored-model');
  // start screen hint
  G.settings.provider = 'ollama'; G.settings.model = 'm'; G.Pages.wiz.showWizard = false;
  w.localStorage.setItem('clout_index_v1', JSON.stringify([{ id: 'x', name: 'W', player: 'P', followers: 1, day: 1, savedAt: 1 }]));
  G.Store._reset(); await G.Store.init(); G.UI.render();
  check('start screen needs no "set up your AI" hint once a local model is configured', !/Set up your AI/.test(w.document.body.textContent));
  // settings page
  H.freshWorld();
  G.settings.provider = 'ollama'; G.settings.model = 'llama3.1:8b';
  G.UI.go('settings');
  const st = w.document.querySelector('#page').textContent;
  check('Settings (local): no OpenRouter balance / browse buttons, says it is free', !/Check balance/.test(st) && !/sorted by price/.test(st) && /no cost/.test(st) && /free/.test(st));
  G.settings.provider = 'openrouter'; G.settings.apiKey = 'k'; G.UI.go('settings');
  check('Settings (OpenRouter): balance + browse buttons present', /Check balance/.test(w.document.querySelector('#page').textContent) && /sorted by price/.test(w.document.querySelector('#page').textContent));
  // detect models button
  G.settings.provider = 'ollama'; G.settings.model = 'nothing-yet'; G.UI.go('settings');
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'dolphin-llama3:8b' }, { id: 'llama3.1:8b' }] }) });
  H.click('[data-act="detectModels"]');
  await H.wait(60);
  check('Detect models fills the list and selects a real model', G.settings.model === 'dolphin-llama3:8b' && w.document.querySelectorAll('#modellist option').length === 2);
  w.fetch = realFetch;
  H.summary('LOCAL MODEL PROVIDERS');
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
