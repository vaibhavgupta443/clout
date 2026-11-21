# Development notes

Clout is a clean (PG-13) social-media life simulation. Every character is an adult (18+). Plain JavaScript in the browser (`window.G`), IndexedDB saves, a small Node server (`serve.js`) for the PC and phone, and an installable phone app (PWA) built by `tools/make-site.js`.

## Commands (run from the repo root)

- `node tools/check.js` checks only what you just edited: syntax, build, the tests that guard those files, and the 30-day soak. One line per failure.
- `node tools/check.js --all` (about 6 minutes) before calling something done. `--ui` runs the real-browser phone tests (needs Microsoft Edge).
- `node tools/build.js` rebuilds `dist/`. It is needed after any `js/` or `css/` change before the phone sees it. `node tools/make-site.js` builds the phone app folder `site/`.
- Server: `node serve.js 8080` (add `--lan` for phone mode: PIN and home network only).
- Setup: `npm install` in the root and in `tests/`.

## Hard rules

- All characters are adults. No sexual content. No real people. Never create a character described as a minor.
- NPCs never create top-level posts or stories on their own (only when directed). Replies, likes and DMs still happen on their own.
- Tests use synthetic data only.
- Nothing new appears on its own: strangers reach out through `Leads` and join only if answered.

## Conventions that cost hours when forgotten

- Undoable owner actions go through `E.guarded(label, fn, redo)`. Never write `null` state keys lazily (use `delete`, and reads must not create the key) or the save/reload identity test fails. Cap every list.
- Patch scripts: a regex inside a plain JS string turns `\b` into a backspace and `$$` into `$`. Use an editor for anything with regexes or backslashes.
- Files may be CRLF; edit scripts must preserve it. Rebuild after `js/` or `css/` changes.
- Tests: `tests/harness.js` boots the app in jsdom with a fake `fetch`. Mock randomness on `w.Math`, not Node's `Math`. Register new test files in `tests/run-all.js` and `tests/README.md`. Register new modules in `index.html`, `tests/harness.js` and `tools/check.js`.
- Trust is 0..100. UI: one accent colour, no emoji in labels (emoji only in what people write), one floating button, five places in the bottom bar.

## Working style

- Build first, test once. Do not re-run suites that passed and were not affected.
- Small vertical slices: change, run `node tools/check.js`, fix, move on.
- Model calls only happen when the user acts. Keep prompts small (see `AI.context`).

## The change-aware checker

Running 100+ suites after every edit is slow, so `tools/check.js` maps changed files to the tests that guard them (`MAP`), runs only those plus a syntax check, the build and the soak, and prints one line per failure. Tests run three at a time, because more makes the timing-sensitive simulation tests flaky.

See also [`ARCHITECTURE.md`](ARCHITECTURE.md).
