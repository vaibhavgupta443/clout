# Clout

**A social-media life simulation where every character is an LLM-backed agent with memory, moods and grudges, built so the model is used where it helps and code makes the decisions that must be right.**

You play one person with a feed, DMs and followers. Around you is a cast of NPCs who post, reply, gossip, fall out, remember what you said last month, and change how they treat you. The world keeps running while you look at it, and almost all of it costs nothing to run.

Plain JavaScript (about 30k lines, no framework), IndexedDB saves, a small Node server, an installable phone app, and 100+ test files. This is the clean (PG-13) edition; every character is an adult.

> **What this repo shows, in one paragraph.** Agent design (memory, reflection, retrieval, goals), LLM routing and cost control, a human-approval step before model output changes anything, undo for every action, and a change-aware test runner that keeps a 100+ suite fast. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## The ideas worth reading about

**1. The simulation is free; the model is for the parts that need it.**
NPCs act from a heartbeat and state: personality (Big Five, attachment style, chronotype), mood, goals, a relationship graph, and a memory stream. A model is called for your own turns, for a cheap *line bank* that pre-writes in-voice posts the simulator then spends, and for scenes. Calls route between a local model and OpenRouter with failover and a spend cap. → [`js/ai.js`](js/ai.js), [`js/bank.js`](js/bank.js)

**2. Memory that behaves like memory.**
Recency × importance × relevance scoring (after *Generative Agents*), reflection that turns many small memories into beliefs about specific people, "newer replaces older" so *we broke up* retires *we are together*, rehearsal so used memories fade slower, and an Obsidian-style vault where nothing is ever deleted, only archived. → [`js/mem.js`](js/mem.js), [`js/memplus.js`](js/memplus.js), [`js/vault.js`](js/vault.js), [`js/rag.js`](js/rag.js)

**3. Model proposes, code decides.**
Model output is validated and vetted before it touches state (`Mind.vet` checks a line is appropriate for this person in this situation; relationship changes are clamped). The Director has *Ask* (read-only) and *Act*, and *Act* only **proposes**: nothing changes until you approve. Every action is undoable. → [`js/mind.js`](js/mind.js), [`js/admin.js`](js/admin.js)

**4. Every action is undoable, and the world stays bounded.**
Each owner action is wrapped in `E.guarded`, which snapshots state first (12 deep) so it can be undone. Saves are tested for identity (no lazily created keys, every list capped), and a 30-day soak simulation guards against drift. → [`js/engine.js`](js/engine.js), [`tests/soak.js`](tests/soak.js)

**5. Tests that act as the architecture.**
A jsdom harness boots the whole app with a fake `fetch`, so 100+ suites run offline: unit tests for pure modules, scenario tests, fuzz and stress tests, import-safety checks (prototype pollution, hostile files, age validation) and performance budgets. → [`tests/`](tests/)

**6. Social-graph realism.**
PageRank for status, Louvain for friend circles, shortest paths for how gossip travels. Rumours follow a protocol (intention → wait → private discussion → cooling-off) and reach people only through people. → [`js/social.js`](js/social.js), [`js/channels.js`](js/channels.js)

Full tour: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

Needs Node 20 or newer (developed on Node 24).

```bash
npm install            # root
cd tests && npm install && cd ..
node serve.js 8080     # then open http://127.0.0.1:8080
```

On Windows, `start.bat` does the same. Paste an [OpenRouter](https://openrouter.ai) key in the new-world wizard, or pick a local server (Ollama / LM Studio / KoboldCpp) under Settings → Provider. Your key stays in your browser. Without any model the simulation still runs; only the AI-written parts are unavailable.

Phone: `node serve.js 8080 --lan` prints an address and a PIN. It only answers devices on your home network and locks an address out after repeated wrong PINs. Open it in Safari and use *Add to Home Screen*.

Optional: drop everyday photos into a `media/` folder (not included) and Clout uses them for posts and profile faces. Files with adult-content words in their path or tags are never indexed.

## Test it

```bash
node tools/check.js          # only what you just edited (10-60 s)
node tools/check.js --all    # the full jsdom suite (about 6 min)
```

The suite boots the whole app in jsdom with a fake `fetch`, so it is offline and costs nothing. It includes unit tests for pure modules, a 30-day soak simulation, fuzz and stress tests, import-safety tests (prototype pollution, hostile files, age validation) and performance budgets.

**Current status:** 84 suites in the full jsdom run; 81 passed in one full run (about 9 minutes). The other three (`channels`, `pitches`, `people`) were investigated: `people` was a bug in my edit and is fixed, and `channels` and `pitches` pass when run on their own. They contain randomness-sensitive checks that occasionally fail under full-run load, which is why `check.js` runs suites in a fixed, serial-ish order.

## Honest limitations

- Phone layout was verified in headless Edge, not on a real iPhone.
- Model output varies from run to run. Vetting and replay make it steadier; they do not make it perfect.
- Single-player and local only: no authentication or multi-user support.
- This is the clean edition of a larger private build. Nothing beyond PG-13 is part of this repo.

## Layout

| Path | What |
|---|---|
| `js/` | 70 modules, one per feature; `minimal.js` must load last |
| `serve.js` | Node side: static server, thumbnails, phone mode with PIN |
| `tests/` | 100+ test files and the jsdom harness |
| `tools/` | build, change-aware checker, phone-site builder |
| `docs/` | architecture and development notes |

Third-party libraries are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
