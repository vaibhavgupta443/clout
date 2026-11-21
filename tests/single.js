// One copy of Clout at a time (js/single.js): a second tab asks, the open one answers, the newcomer waits and never saves;
// "Use this tab" hands over; with no BroadcastChannel nothing changes. Two jsdom windows stand in for two tabs.
const fs = require('fs');
const path = require('path');
const { boot } = require('./harness');
const root = process.argv[2] || path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'js', 'single.js'), 'utf8');

(async () => {
  const A = boot(root);
  const B = boot(root);
  const C = boot(root); // a third window in a browser WITHOUT BroadcastChannel
  const { check } = A;
  // one in-memory hub = the browser's BroadcastChannel shared by tabs of the same profile
  const members = [];
  const hubFor = (w) => class BC {
    constructor() { members.push(this); this.w = w; }
    postMessage(m) { members.forEach((o) => { if (o !== this) setTimeout(() => o.onmessage && o.onmessage({ data: JSON.parse(JSON.stringify(m)) }), 0); }); }
  };
  const settle = () => new Promise((r) => setTimeout(r, 40));
  A.w.BroadcastChannel = hubFor(A.w);
  B.w.BroadcastChannel = hubFor(B.w);
  [A, B, C].forEach((h) => h.w.document.body.classList.add('ingame'));

  let savesB = 0;
  B.G.Store.save = () => { savesB++; return 'saved'; };
  B.G.Store.saveSoon = () => { savesB++; };

  A.w.eval(SRC); await settle();
  check('the first copy is awake and shows nothing', A.G.Single && !A.G.Single.sleeping && !A.w.document.getElementById('one-copy-cover'));
  B.w.eval(SRC); await settle();
  check('a second copy is told Clout is already open and waits', B.G.Single.sleeping === true && !!B.w.document.getElementById('one-copy-cover'));
  check('the first copy is still awake', A.G.Single.sleeping === false && !A.w.document.getElementById('one-copy-cover'));
  B.G.Store.save(); B.G.Store.saveSoon();
  check('a waiting copy never writes the save', savesB === 0, String(savesB));
  check('the screen explains it in one calm sentence and offers one button', /already open/i.test(B.w.document.getElementById('one-copy-cover').textContent) && B.w.document.querySelectorAll('#one-copy-cover button').length === 1);

  B.w.document.getElementById('one-copy-use').dispatchEvent(new B.w.MouseEvent('click', { bubbles: true }));
  await settle();
  check('"Use this tab" wakes this copy and puts the other to rest', B.G.Single.sleeping === false && !B.w.document.getElementById('one-copy-cover') && A.G.Single.sleeping === true && !!A.w.document.getElementById('one-copy-cover'));
  B.G.Store.save();
  check('the awake copy saves again', savesB === 1, String(savesB));

  C.w.eval(SRC); await settle();
  check('without BroadcastChannel nothing happens and nothing breaks', C.G.Single && C.G.Single.sleeping === false && !C.w.document.getElementById('one-copy-cover'));
  A.H = null;
  A.summary('SINGLE COPY');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
