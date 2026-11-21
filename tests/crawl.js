// UI crawl: build a rich world, then click EVERY [data-act] on EVERY page and modal, and drive every input,
// verifying nothing throws, nothing renders broken, and (with hostile data) nothing injectable reaches the DOM.
const { boot, invariants } = require('./harness');
const root = process.argv[2];
const H = boot(root);
const { w, G, E, U, check, state, errors, $, $$ } = H;
const HOSTILE = process.argv[3] === 'hostile';
const BAD_TOAST = /Cannot read|is not a function|is not defined|undefined|NaN|\[object|TypeError|ReferenceError|Unexpected token|null \(reading/;
const toastsBad = [];
const realToast = () => {};

const PX = 'data:image/png;base64,iVBORw0KGgo=';
const hs = (s) => (HOSTILE ? `<img src=x onerror="window.__pwned=1">"'\`\${1+1}</script>${s}` : s);

async function build() {
  H.freshWorld();
  const S = G.S;
  const names = ['stranger', 'acquaintance', 'friend', 'close_friend', 'best_friend', 'admirer', 'crush', 'dating', 'partner', 'situationship', 'ex', 'frenemy', 'rival', 'enemy', 'nemesis', 'stan', 'hater', 'ally', 'mentor', 'mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'];
  names.forEach((st, i) => {
    const n = E.makeNpc({ name: hs('Person ' + st), handle: hs('@p' + i), role: hs('role'), age: 20 + i, bio: hs('bio ' + st), personality: hs('pers'), followers: 100 * (i + 1), secret: hs('secret ' + i), emoji: hs('🙂'), aff: i * 5 - 40, rom: i * 4, riv: i * 3, trust: i * 2, status: st });
    n.mood = hs(['joy', 'furious', 'flirty', 'weird'][i % 4]);
    n.memories = [hs('m1'), hs('m2')];
    n.history = hs('long term memory');
    n.card = hs('card text ') + 'x'.repeat(200);
    n.tags = [hs('tag')];
    if (i % 3 === 0) n.sprites = { neutral: PX, joy: PX, anger: PX };
    if (i % 4 === 0) n.avatar = PX;
    if (i === 5) n.secretRevealed = true;
    if (i === 6) n.muted = true;
  });
  const n1 = S.npcs.n1;
  n1.name = hs('Mia Vale');
  S.player.name = hs('Sam');
  S.player.bio = hs('my bio');
  S.world.name = hs('World');
  S.world.setting = hs('setting text');
  S.saga = hs('the saga so far');
  S.lore.push({ id: 'l1', keys: ['k'], content: hs('lore'), constant: true, source: hs('book') });
  S.trending = [{ tag: '#hot', heat: 90 }, { tag: '#' + (HOSTILE ? 'x"onclick="1' : 'tag2').replace(/[^\p{L}\p{N}_#]/gu, ''), heat: 50 }];
  S.storylines.push({ id: 's2', title: hs('Boiling story'), summary: hs('sum'), heat: 90, status: 'boiling', participants: ['n1', 'n2', 'n3'], updated: S.clock, log: [{ t: 1, text: hs('log a') }, { t: 2, text: hs('log b') }] }, { id: 's3', title: 'Done story', summary: 's', heat: 10, status: 'resolved', participants: [], updated: 0, log: [] });
  S.counters.story = 4;
  S.chronicle.push({ id: S.counters.chron++, t: 5, text: hs('chronicle line') });
  S.events.push({ id: 'ev1', t: 1, resolved: false, title: hs('Brand deal'), text: hs('text'), options: [hs('Accept'), hs('Decline')] });
  S.events.push({ id: 'ev0', t: 0, resolved: true, title: 'old', text: 't', options: ['a', 'b'], choice: 'a' });
  S.welcome = hs('welcome text');
  S.dmSum.n1 = hs('chat summary');
  S.lastLive = { t: 1, peak: 100, total: 50, donations: [{ name: hs('d'), amount: 5, msg: hs('m') }], moment: hs('moment'), chat: [{ name: hs('v'), text: hs('pog'), stance: 'fan' }] };
  for (const t of ['reply', 'mention', 'follow', 'viral', 'rel', 'dm', 'drama', 'event', 'level', 'cash']) E.addNotif(t, hs(t + ' notification'), t === 'dm' || t === 'rel' ? { npcId: 'n1' } : {});

  state.mode = 'normal';
  await E.speak({ mode: 'post', text: hs('hello world #tag @miav'), tone: 'funny' });
  await E.speak({ mode: 'post', text: hs('poll time'), extra: { type: 'poll', poll: [hs('a'), 'b', 'c'] } });
  await E.speak({ mode: 'post', text: hs('photo time'), extra: { type: 'photo', attach: hs('a photo') } });
  await E.speak({ mode: 'post', text: hs('confession'), extra: { type: 'confession' } });
  await E.goLive(hs('stream'), 30);
  await E.dm('n1', hs('hi mia'));
  await E.dm('n2', hs('hi kai'));
  const g = E.createGroup(hs('Crew'), ['n1', 'n2', 'n3']);
  await E.groupSend(g.id, hs('hello crew'));
  E.startScene('n1', hs('a cafe'));
  await E.sceneTurn('n1', hs('hello'), false);
  const myPost = Object.values(S.posts).find((p) => p.author === 'me' && !p.replyTo);
  G.S.player.cash = 5e6;
  E.promote(myPost.id, 1);
  E.pinPost(myPost.id);
  G.Pop.meet(321);
  G.Pop.meet(654);
  E.createCustomNpc({ name: hs('Custom One'), age: 30, rel: 'crush' });
  await E.advance('refresh');
  E.checkAch();
  const bad = invariants(G);
  check('rich world built and valid', bad.length === 0, bad.join('; '));
  return S;
}

const PAGE_LIST = ['home', 'explore', 'town', 'notifs', 'messages', 'people', 'drama', 'director', 'shop', 'me', 'settings', 'scene'];

function scanDom(label) {
  const probs = [];
  const root = w.document.getElementById('app').parentNode;
  root.querySelectorAll('script, iframe, object, embed, link[rel=stylesheet][href*="javascript"], meta[http-equiv]').forEach((e) => probs.push(label + ': forbidden element <' + e.tagName + '>'));
  root.querySelectorAll('*').forEach((el) => {
    for (const a of el.attributes) {
      if (/^on/i.test(a.name)) probs.push(`${label}: <${el.tagName}> has ${a.name}`);
      if (/javascript:/i.test(a.value)) probs.push(`${label}: <${el.tagName}> ${a.name}=${a.value.slice(0, 40)}`);
    }
  });
  if (w.__pwned) probs.push(label + ': payload executed');
  return probs;
}

const snapshotAll = () => ({ S: JSON.stringify(G.S), settings: JSON.stringify(G.settings), ui: { page: G.UI.page, thread: G.UI.thread, dmWith: G.UI.dmWith, groupWith: G.UI.groupWith, sceneWith: G.UI.sceneWith, feedTab: G.UI.feedTab, search: G.UI.search, townTab: G.UI.townTab, townPage: G.UI.townPage, peopleView: G.UI.peopleView } });
const restoreAll = (s) => {
  G.S = JSON.parse(s.S);
  Object.keys(G.settings).forEach((k) => delete G.settings[k]);
  Object.assign(G.settings, JSON.parse(s.settings));
  Object.assign(G.UI, s.ui, { suggestions: null, draft: '', replyDraft: '', dmDraft: '', cand: null, scenRoll: null, sceneDraft: '' });
  G.busy = false;
  G.UI.closeModal();
  G.Store.save = G.Store.save; // keep
};

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.confirm = () => false; // decline destructive prompts during the crawl
  w.prompt = () => 'edited';
  const origToast = G.UI.toast;
  G.UI.toast = (m, k) => {
    if (BAD_TOAST.test(String(m))) toastsBad.push(String(m));
    return origToast(m, k);
  };
  await build();
  G.UI.go('scene', { sceneWith: 'n1' });
  const base = snapshotAll();
  state.mode = 'normal';

  let clicks = 0, uniq = 0;
  const seenDom = [];
  for (const page of PAGE_LIST) {
    restoreAll(base);
    G.UI.go(page, page === 'scene' ? { sceneWith: 'n1' } : {});
    const html = $('#page').innerHTML;
    check(`${page}: renders`, html.length > 30 && !/Something broke while drawing/.test(html), (html.match(/Something broke[^<]*<[^>]*>[^<]*/) || [''])[0]);
    scanDom(page + ' initial').forEach((p) => seenDom.push(p));
    const descs = [];
    const seen = new Set();
    $$('#app [data-act], #modal-root [data-act]').forEach((el) => {
      const d = Object.assign({}, el.dataset);
      const key = JSON.stringify(d);
      if (!seen.has(key)) { seen.add(key); descs.push({ d, text: (el.textContent || '').trim().slice(0, 30) }); }
    });
    uniq += descs.length;
    for (const { d, text } of descs) {
      restoreAll(base);
      G.UI.go(page, page === 'scene' ? { sceneWith: 'n1' } : {});
      const el = $$('#app [data-act]').find((e) => JSON.stringify(Object.assign({}, e.dataset)) === JSON.stringify(d));
      if (!el) continue;
      const e0 = errors.length, t0 = toastsBad.length;
      try { H.click(el); } catch (e) { errors.push('click threw: ' + e.message); }
      clicks++;
      await H.wait(15);
      // let any async flow settle
      for (let i = 0; i < 40 && G.busy; i++) await H.wait(10);
      if (errors.length > e0) check(`${page}: click ${d.act} (${text})`, false, errors[errors.length - 1]);
      if (toastsBad.length > t0) check(`${page}: click ${d.act} (${text}) shows no JS-error toast`, false, toastsBad[toastsBad.length - 1]);
      // anything it opened (a modal) gets crawled one level deep
      if ($('#modal-root .modal')) {
        const inner = [];
        const seen2 = new Set();
        $$('#modal-root [data-act]').forEach((x) => {
          const k = JSON.stringify(Object.assign({}, x.dataset));
          if (!seen2.has(k) && x.dataset.act !== 'closeModal') { seen2.add(k); inner.push(Object.assign({}, x.dataset)); }
        });
        scanDom(`${page}>${d.act} modal`).forEach((p) => seenDom.push(p));
        const mHtml = $('#modal-root').innerHTML;
        if (/undefined|NaN|\[object/.test(mHtml.replace(/data-[a-z-]+="[^"]*"/g, ''))) check(`${page}>${d.act}: modal has no undefined/NaN text`, false, (mHtml.match(/.{40}(undefined|NaN|\[object).{40}/) || [''])[0]);
        const modalSnap = snapshotAll();
        const modalHtml = $('#modal-root').innerHTML;
        for (const dd of inner.slice(0, 40)) {
          restoreAll(base);
          G.UI.go(page, page === 'scene' ? { sceneWith: 'n1' } : {});
          const el0 = $$('#app [data-act]').find((e) => JSON.stringify(Object.assign({}, e.dataset)) === JSON.stringify(d));
          if (!el0) break;
          H.click(el0);
          await H.wait(10);
          for (let i = 0; i < 40 && G.busy; i++) await H.wait(10);
          const el2 = $$('#modal-root [data-act]').find((e) => JSON.stringify(Object.assign({}, e.dataset)) === JSON.stringify(dd));
          if (!el2) continue;
          const e1 = errors.length, t1 = toastsBad.length;
          try { H.click(el2); } catch (e) { errors.push('modal click threw: ' + e.message); }
          clicks++;
          await H.wait(15);
          for (let i = 0; i < 40 && G.busy; i++) await H.wait(10);
          if (errors.length > e1) check(`${page}>${d.act}>${dd.act}`, false, errors[errors.length - 1]);
          if (toastsBad.length > t1) check(`${page}>${d.act}>${dd.act} no JS-error toast`, false, toastsBad[toastsBad.length - 1]);
        }
      }
      if (!G.S) { check(`${page}: ${d.act} leaves the app on the start screen safely`, /New world|Your worlds|Clout/.test($('#app').textContent)); continue; }
      const bad = invariants(G);
      if (bad.length) check(`${page}: invariants after ${d.act}`, false, bad.slice(0, 3).join('; '));
      // page must still render
      try { G.UI.render(); } catch (e) { check(`${page}: re-render after ${d.act}`, false, e.message); }
      const h2 = $('#page') ? $('#page').innerHTML : '';
      if (/Something broke while drawing/.test(h2)) check(`${page}: still renders after ${d.act}`, false, h2.match(/Something broke[^<]*<[^>]*>[^<]*/)[0]);
    }
  }
  check(`crawl clicked ${clicks} controls (${uniq} unique on pages)`, clicks > 300);

  /* inputs: drive every control with edge values */
  restoreAll(base);
  let inputs = 0;
  for (const page of PAGE_LIST) {
    G.UI.go(page, page === 'scene' ? { sceneWith: 'n1' } : {});
    const els = $$('#page input, #page textarea, #page select, #side input');
    for (const el of els) {
      const e0 = errors.length;
      const vals = el.tagName === 'SELECT' ? [...el.options].map((o) => o.value) : el.type === 'checkbox' ? [true, false] : el.type === 'range' ? [el.min, el.max, '999', '-5', 'abc'] : ['', ' ', 'x'.repeat(3000), '<b>"\'`${}</b>', '😀', '0', '-1', '1e999', 'NaN'];
      for (const v of vals) {
        try {
          if (el.type === 'checkbox') { el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); }
          else { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
        } catch (e) { errors.push('input threw: ' + e.message); }
        inputs++;
        await H.wait(1);
      }
      if (errors.length > e0) check(`${page}: input ${el.id || el.dataset.bind || el.dataset.setting || el.tagName}`, false, errors[errors.length - 1]);
    }
    restoreAll(base);
    G.UI.go(page, page === 'scene' ? { sceneWith: 'n1' } : {});
    if (/Something broke while drawing/.test($('#page').innerHTML)) check(`${page}: renders after input fuzz`, false);
  }
  check(`drove ${inputs} input events`, inputs > 100);

  if (HOSTILE) {
    check('hostile data: no injectable markup reached the DOM', seenDom.length === 0, seenDom.slice(0, 5).join(' | '));
  } else {
    check('no injectable markup on normal data either', seenDom.length === 0, seenDom.slice(0, 5).join(' | '));
  }
  check('no JS-error toasts anywhere', toastsBad.length === 0, toastsBad.slice(0, 5).join(' | '));
  H.summary(HOSTILE ? 'UI CRAWL (hostile data)' : 'UI CRAWL (normal data)');
})().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
