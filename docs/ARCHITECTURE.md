# Architecture

Clout is a social-media life simulation. You play one person with a feed, DMs and followers, surrounded by a cast of NPCs who have their own personalities, memories, goals and grudges. There is no framework: plain JavaScript modules on a shared `window.G`, state saved in IndexedDB, and a small Node server for the PC and phone.

The central design question was: **how do you get believable, consistent characters from an LLM without paying for a model call on every event?**

The answer is a split.

```
                         cheap, deterministic, free                    paid / slow / creative
   ┌────────────────────────────────────────────────────────┐   ┌─────────────────────────────┐
   │ SIMULATION (rules + memory + graph)                    │   │ LLM LAYER                   │
   │ heartbeat → who acts → what they feel → what they say  │◄──┤ line bank · Director ·      │
   │ persona · mind · mem · rag · social · reasons · bonds  │   │ scenes · story reader       │
   └───────────────▲────────────────────────────────────────┘   └──────────────▲──────────────┘
                   │ proposals are vetted and applied by code                    │
                   └──────────────  E.apply  ·  Mind.vet  ·  E.guarded (undo)  ──┘
```

## 1. The simulation runs for free

`js/live.js` is a heartbeat: every few seconds a slice of game time passes. `js/world.js` decides who acts, and the decision comes from state, not from a model.

| Module | What it does |
|---|---|
| `persona.js` | Every NPC gets a stable psychology: Big Five traits, typing style, chronotype, attachment style, interests, opinions, and a mood that decays. |
| `mind.js` | The "common sense" core. `read` understands what a post is about and how delicate it is; `vet` is the gate every NPC line passes ("is this OK for this person to say here?"); `feel` is an appraisal step (empathy, joy, envy); `salience` scores how memorable something is. Before it existed, people joked under posts about hospitals. |
| `mem.js` | A memory stream after the Generative Agents paper: each memory is scored by recency, importance and relevance, and periodic *reflection* turns piles of memories into beliefs about specific people. |
| `memplus.js` | Learning from what the player says (promises, secrets, likes), *newer replaces older* ("we broke up" retires "we are together"), and rehearsal (memories that get used decay more slowly). |
| `vault.js` | Nothing is deleted. A memory pushed out of the short-term stream is archived into a per-person note, like an Obsidian vault. |
| `rag.js` | Retrieval for the Director: BM25 over word stems plus importance and recency, free and offline. |
| `social.js` | The relationship graph, analysed with graphology: PageRank gives social status, Louvain gives friend circles, shortest paths decide how gossip travels. |
| `reasons.js` | A message only exists when something real is behind it: a reaction to your post, a rumour, a goal, a shared memory. No more generic "u up?" |
| `goals.js` | Daily goals and reflection, drawn from relationships and storylines. |
| `bonds.js` | Relationship change as an explicit state machine (no DOM, no AI, injectable randomness, so it is fully testable). |
| `channels.js`, `leads.js` | Public chat channels grounded in real world facts; strangers can only *reach* you for a real reason and only join the cast if you answer. |

Most NPC text comes from templates (`voice.js`). Rumours follow a protocol rather than teleporting: the holder records an intention, waits, has a private one-to-one discussion, and the recipient gets a cooling-off period before passing it on.

## 2. The model is used where it adds the most

`js/ai.js` builds prompts and routes calls. Calls fall into task classes: `bg` (background jobs), `world`, `story` (your own turns) and `scene`. Each class can go to a **local helper model** (Ollama, LM Studio, KoboldCpp) or to **OpenRouter**, with automatic failover in both directions, a spend cap, and counters for what was free versus paid.

- **Line bank** (`bank.js`): one cheap call writes a batch of in-voice posts, comments and DMs for a few characters. The free simulator then spends those lines over the next hours, so wording stays varied while nearly all activity costs nothing.
- **Structured output**: model replies are JSON with a schema in the prompt. Replies are cleaned and validated before use.
- **Hybrid presets**: *Best quality*, *Balanced*, *Save the most*, *All local*.

## 3. Model proposes, code decides

Every path that lets a model change the world goes through the same gate:

- `E.apply` applies model output after `Mind.vet` and `E.vetRel` (relationship deltas are clamped) check it.
- `E.guarded` snapshots state first, which gives **undo** (12 deep) for every owner action.
- The **Director** (`admin.js`) has two buttons: *Ask* (read-only) and *Act*. *Act* makes one model call that only **proposes**. The sheet shows an "Approve this?" card, and nothing changes until you approve. Directions can also be scheduled ("in 2 days: ..."), and history supports rollback and pins.
- Rule: NPCs never create top-level posts or stories on their own. A post exists only because the story or the player's direction said so.

## 4. Delivery

- `tools/build.js` bundles the scripts with esbuild into one hashed file, and `serve.js` swaps it in when it is newer than every source file.
- `serve.js` compresses text assets (brotli/gzip), caches them in memory, and in phone mode only answers devices on the home network, behind a PIN with lockout after repeated wrong tries.
- The phone app is a PWA built by `tools/make-site.js`.
- Measured in headless Edge on a busy world: redrawing an unchanged feed about 2 ms, 200 posts about 8 ms, one game hour for 80 people about 16 ms. These come from `tests/perf-browser.js`, not from a real phone.

## 5. Tests

`tests/harness.js` boots the whole app in jsdom with a fake `fetch`, so tests are fast and offline. There are 100+ test files: unit tests for pure modules like `bonds.js`, scenario tests, a 30-day soak simulation, fuzz and stress tests, prototype-pollution checks on imports, and perf budgets. See `tests/README.md` and `docs/DEVELOPMENT.md` for how they are run in practice.

## Known limits

- Phone layout was checked in headless Edge, not on a real iPhone.
- The real-browser suites need Microsoft Edge and are skipped by default.
- Model output varies between runs; the vetting and replay steps reduce but do not remove that.
- No authentication or multi-user support. It is a single-player local app.
