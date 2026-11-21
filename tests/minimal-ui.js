// Minimal interface: no emoji in the app's own labels, emoji people write are kept, five places in the bar, no Reels, everything else under Profile > More.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
const EMO = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)/u;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  w.document.body.classList.add('ingame');
  G.settings.minimalUI = true;
  const S = G.S;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  E.addPost({ author: mia.id, text: 'new song out now 🎶🔥', buzz: 4, stats: { likes: 3, reposts: 0, replies: 0, views: 30 } });
  G.UI.go('home'); G.UI.render();
  await H.wait(80); // (the floating menu and the Director sheet are cleaned a frame later)
  const chrome = $$('button, h3, h4, .tabs button, .btn').filter((el) => !el.closest('.post, .bubble, .avatar, .avwrap'));
  check('buttons, headings and tabs have no emoji', chrome.every((el) => !EMO.test(el.cloneNode(true).textContent.replace(/./gs, (c, i) => c)) || el.querySelector('.avatar,.avwrap') !== null), chrome.filter((el) => EMO.test(el.textContent) && !el.querySelector('.avatar,.avwrap')).slice(0, 3).map((e) => e.outerHTML.slice(0, 90)).join(' | '));
  check('what people write keeps its emoji', /🎶🔥/.test($('.post').textContent));
  G.UI.toast('Done ✨ nice 🎉', 'good');
  await H.wait(30);
  check('toast text has no emoji', G.Minimal.strip('Done ✨ nice 🎉').trim() === 'Done nice' && !EMO.test($('#toasts').textContent));
  check('a control that was only an emoji got a word (not empty)', $$('[data-act]').every((el) => el.textContent.trim() || el.querySelector('svg,img') || el.querySelector('.avatar') || el.matches('.avatar,.avwrap,.ring,.stry,.gtile,.post,.ptext,textarea,input,.mi')), $$('[data-act]').filter((el) => !el.textContent.trim() && !el.querySelector('svg,img,.avatar')).slice(0, 3).map((e) => e.outerHTML.slice(0, 90)).join(' | '));
  check('the nav lists the five daily places and no Reels', G.UI.NAV.every((n) => n[0] !== 'reels') && ['home', 'explore', 'messages', 'notifs', 'me'].every((p) => !!$('#nav .navb[data-page="' + p + '"]')) && !$('#nav .navb[data-page="reels"]'));
  G.UI.go('me'); G.UI.render();
  const more = $$('.morecard .morerow');
  check('Profile ends with a More list for everything else (Shop, Settings, People, Director...)', more.length >= 6 && /Settings/.test($('.morecard').textContent) && /Shop/.test($('.morecard').textContent));
  more.find((r) => /Shop/.test(r.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('a More row opens its page', G.UI.page === 'shop');
  G.settings.minimalUI = false;
  G.UI.go('home'); G.UI.render();
  check('switched off, the full labels come back', $$('button').some((b) => EMO.test(b.textContent)));
  G.settings.minimalUI = true;
  check('avatars and tiles are drawn in blues', /hsl\(2[0-3]\d/.test(G.U.gradient('@abc')));
  H.summary('MINIMAL INTERFACE');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
