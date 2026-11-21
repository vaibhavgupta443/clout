// REAL browser (Edge, iPhone-sized): the Director's approval card is visible, readable, fits the screen and its buttons work.
const puppeteer = require('puppeteer-core');
const path = require('path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else fail++;
  if (!cond || process.env.VERBOSE) console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra ? ' — ' + String(extra).slice(0, 500) : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { makeServer } = require(path.join(root, 'serve.js'));
  const server = makeServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const errors = [];
  try {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await page.emulate({ viewport: { width: 390, height: 664, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction('window.G && window.G.Engine');
      await page.evaluate(() => {
        const E = G.Engine;
        E.createBlankWorld({ name: 'Sam', handle: '@sam', fame: 'rising', premise: 't' });
        ['Kai Storm', 'Mia Vale', 'Dex Rowan'].forEach((n, i) => E.makeNpc({ name: n, handle: '@' + n.split(' ')[0].toLowerCase(), age: 25, personality: 'x', followers: 1000 + i }));
        G.settings.theme = 'auto';
        G.UI.go('home');
        G.Store.saveSettings();
      });
      await sleep(400);
      // open the Director and ask for an approval, exactly like an Act does
      await page.evaluate(() => {
        G.UI.acts.dockOpen && G.UI.acts.dockOpen();
        const E = G.Engine;
        window.__decision = null;
        const kai = Object.values(G.S.npcs).find((n) => n.name === 'Kai Storm');
        const prop = { posts: [{ id: 't1', author: kai.id, text: 'honestly this whole thing is a lot, who leaked it?' }, { author: kai.id, text: 'and nobody is saying anything' }], dms: [{ from: kai.id, text: 'we need to talk' }], character_updates: [{ who: 'Kai Storm', mood: 'tense' }] };
        const items = E.Story.items(prop);
        E.Story.approver({ text: 'Kai reacts', cost: 0.004, lines: items.map((i) => i.label), items }).then((d) => (window.__decision = d));
      });
      await sleep(500);
      const info = await page.evaluate(() => {
        const card = document.querySelector('#stdock .d2-b.prop');
        if (!card) return { card: false, dock: !!document.querySelector('#stdock'), html: (document.querySelector('#stdock') || {}).innerHTML ? document.querySelector('#stdock').innerHTML.slice(0, 300) : '' };
        const r = card.getBoundingClientRect();
        const cs = getComputedStyle(card);
        const rows = Array.from(card.querySelectorAll('.d2-it'));
        const colorOf = (el) => { const c = getComputedStyle(el); return c.color + ' on ' + c.backgroundColor; };
        const btn = card.querySelector('[data-d="approve"]');
        const br = btn ? btn.getBoundingClientRect() : null;
        const dock = document.querySelector('#stdock').getBoundingClientRect();
        const log = document.querySelector('#stdock .stlog');
        return { card: true, w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, display: cs.display, vis: cs.visibility, op: cs.opacity, bg: cs.backgroundColor, color: cs.color, rows: rows.length, rowText: rows.map((x) => x.textContent.trim().slice(0, 40)), rowColor: rows[0] ? colorOf(rows[0].querySelector('span')) : '', boxes: card.querySelectorAll('input[type=checkbox]').length, btn: br ? { t: Math.round(br.top), b: Math.round(br.bottom), l: Math.round(br.left), r: Math.round(br.right) } : null, dockTop: Math.round(dock.top), dockBottom: Math.round(dock.bottom), vh: innerHeight, logH: log ? Math.round(log.getBoundingClientRect().height) : 0, text: card.textContent.replace(/\s+/g, ' ').slice(0, 220) };
      });
      console.log('INFO ' + scheme, JSON.stringify(info));
      check(`[${scheme}] the approval card exists in the Director`, info.card === true, JSON.stringify(info));
      if (info.card) {
        check(`[${scheme}] it is visible (not hidden, not transparent, has size)`, info.display !== 'none' && info.vis !== 'hidden' && Number(info.op) > 0.9 && info.w > 200 && info.h > 80, JSON.stringify(info));
        check(`[${scheme}] it fits the phone width`, info.left >= 0 && info.right <= info.vw, `${info.left}-${info.right} of ${info.vw}`);
        check(`[${scheme}] every item is listed with a tick box`, info.rows === 4 && info.boxes === 4, JSON.stringify(info.rowText));
        check(`[${scheme}] the words can be read (text colour differs from its background)`, !!info.rowColor && info.rowColor.split(' on ')[0] !== info.rowColor.split(' on ')[1] && /honestly|leaked/.test(info.text), info.rowColor + ' | ' + info.text);
        check(`[${scheme}] the Approve button is on screen`, !!info.btn && info.btn.t >= 0 && info.btn.b <= info.vh && info.btn.r <= info.vw, JSON.stringify(info.btn) + ' vh ' + info.vh);
        const g = await page.evaluate(() => {
          const card = document.querySelector('#stdock .d2-b.prop');
          const box = card.querySelector('input[type=checkbox]').getBoundingClientRect();
          const log = document.querySelector('#stdock .stlog').getBoundingClientRect();
          const ap = card.querySelector('[data-d="approve"]').getBoundingClientRect();
          const rj = card.querySelector('[data-d="reject"]').getBoundingClientRect();
          const inp = document.querySelector('#stdock .d2-input');
          return { boxW: Math.round(box.width), boxH: Math.round(box.height), apInLog: ap.top >= log.top - 1 && ap.bottom <= log.bottom + 1, rjInLog: rj.top >= log.top - 1 && rj.bottom <= log.bottom + 1, inputHidden: !inp || getComputedStyle(inp).display === 'none', head: Math.round(document.querySelector('#stdock .d2-head').getBoundingClientRect().top), panelTop: Math.round(document.querySelector('#stdock .stp').getBoundingClientRect().top) };
        });
        check(`[${scheme}] the tick boxes are normal size (the global input style used to stretch them)`, g.boxW <= 30 && g.boxH <= 30, JSON.stringify(g));
        check(`[${scheme}] Approve and Reject are inside the visible part of the card (no scrolling to find them)`, g.apInLog && g.rjInLog, JSON.stringify(g));
        check(`[${scheme}] the Director's top is on screen (title and close button are reachable)`, g.panelTop >= 0 && g.head >= 0, JSON.stringify(g));
        check(`[${scheme}] while you approve, the text box is out of the way`, g.inputHidden, JSON.stringify(g));
        // tap approve
        await page.evaluate(() => document.querySelector('#stdock [data-d="approve"]').scrollIntoView({ block: 'nearest' }));
        const b = await page.evaluate(() => { const r = document.querySelector('#stdock [data-d="approve"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.touchscreen.tap(b.x, b.y);
        await sleep(300);
        const dec = await page.evaluate(() => window.__decision);
        check(`[${scheme}] tapping Approve on a phone approves all four items`, Array.isArray(dec) && dec.length === 4, JSON.stringify(dec));
      }
      // every other kind of Director bubble: readable, inside the panel, no sideways scrolling
      await page.evaluate(() => {
        G.UI.acts.dockOpen();
        const S = G.S;
        S.stThread = [
          { role: 'you', kind: 'ask', text: 'what is the situation with Kai and Mia right now? give me the long version please', t: 1 },
          { role: 'ai', kind: 'ask', answer: '**Kai** is angry about the demo tape.\n\n- Mia is torn\n- Dex is staying out of it\n\nA very long line without spaces: ' + 'x'.repeat(60), sug: ['Kai apologised to Mia in a long post', 'Mia and Kai made up in the comments, 5 replies'], cost: 0.002, t: 2 },
          { role: 'ai', kind: 'do', summary: '2 new posts · Kai: mood tense', items: ['2 new posts', 'Kai: mood tense'], cost: 0.003, t: 3 },
          { role: 'ai', kind: 'later', summary: 'In 2 days (Day 7, 3:00 PM): Kai confesses to Mia. It costs nothing until then.', t: 4 },
          { role: 'ai', kind: 'err', text: 'The AI did not come up with a plan. Try again or describe the goal.', t: 5 },
        ];
        G.Store.save();
      });
      await page.evaluate(() => G.UI.render());
      await sleep(400);
      const bub = await page.evaluate(() => {
        const log = document.querySelector('#stdock .stlog');
        const lr = log.getBoundingClientRect();
        const items = Array.from(log.querySelectorAll('.d2-b, .stsug'));
        return { n: items.length, overflowX: log.scrollWidth > log.clientWidth + 1, empty: items.filter((e) => e.textContent.trim().length < 3).length, wide: items.filter((e) => e.getBoundingClientRect().right > lr.right + 1).length, undo: !!log.querySelector('[data-d="undo"]'), dosug: log.querySelectorAll('[data-d="dosug"]').length };
      });
      check(`[${scheme}] answers, results, scheduled and error bubbles all show with text`, bub.n >= 6 && bub.empty === 0, JSON.stringify(bub));
      check(`[${scheme}] nothing sticks out sideways on a phone (even a very long word)`, !bub.overflowX && bub.wide === 0, JSON.stringify(bub));
      check(`[${scheme}] suggestions have their Do it buttons and the result has its undo link`, bub.dosug === 2 && bub.undo, JSON.stringify(bub));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n== DIRECTOR APPROVAL ON A PHONE (real Edge, iPhone size): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
