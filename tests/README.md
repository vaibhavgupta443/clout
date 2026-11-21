# Clout tests

```
cd tests
npm install            # jsdom + fake-indexeddb + puppeteer-core (the real-browser suites drive Microsoft Edge)
npm run test:quick     # every suite except the slow crawl + real-browser ones (~10 min)
npm test               # everything
npm run test:live      # + a live run against a FREE OpenRouter model (zero cost, ~15 min; reads ../.env)
```

| Suite | What it checks |
|---|---|
| flows.js | the whole game end to end with a scripted fake AI |
| features.js | scenarios, 1M-person town, swipe, post types |
| fuzz.js | malformed AI output, retries, rollbacks (a failed turn leaves NO trace), storage errors, invariants |
| injection.js | hostile text in every modal and screen |
| stress.js | huge worlds: speed, prompt size, save size, 1M town |
| database.js | IndexedDB: reload persistence, migration, corruption, backups, big worlds, fallback |
| providers.js | OpenRouter + Ollama / LM Studio / KoboldCpp / custom servers |
| people.js | do different people react differently? personalities, herding, jealousy, grudges, rumours |
| alive.js | the free living world: activity, determinism, speed, DMs, gossip, memory, circles |
| instagram-ui.js | post cards, stories (tray, viewer, posting), DM presence / typing / seen, heartbeat, recap |
| back-button.js | the phone/browser Back button closes the top layer (thread, profile, story, tab) instead of leaving the app; in-app Back; pause + speed buttons |
| mobile-bar.js | real Edge at iPhone size: the bottom bar stays glued to the bottom while scrolling, after redraws and with the More sheet; no blur, own compositing layer |
| burner.js | burner accounts do everything as the account (post, comment, reply, story, like, follow, own chats), the world never plays them, @ and # suggestions, edit post, delete account |
| admin.js | the activity dial, admin mode (act as ANY character: post / reply / story / like / follow / chat), 25 slash commands, character dossiers + Author's Note + lore reaching the AI, the world-building brief in the wizard |
| memory-tokens.js | a character recalls things from long ago (whole memory, old messages, public events), bounded + cache-friendly prompts, smart story slice for the Director |
| director-power.js | /global directives for everyone, per-item approval (tick what you want), free-fallback approval |
| vectors.js | hybrid retrieval: BM25 + local vectors + optional real embeddings, merged by rank fusion |
| streaming.js | Server-Sent-Event streaming of a character's reply, fallback, cost counting |
| clock-close.js | the clock, appointments, wait-for-my-reply, close friends, Director post picker + comment builder, goals and reflections |
| phone-db.js | the database on a phone: a dropped connection is repaired, a refused write is retried and kept as an emergency copy, a slow first open is retried, big worlds are trimmed |
| reasons.js | a DM only for a real reason (and quotes it), suspicion that updates from evidence weighted by trust in the accuser, finger-pointing in DMs and in #theories, case threads opened and closed |
| trends-events.js | trends from real activity with a page each, event continue/decline, the NPC health check |
| pitches.js | suggestions you approve, the floating ✨ button, your own rumours, the Around-town strip, a clock that keeps moving |
| vault-loyalty.js | family never gossips about you, the memory vault (nothing forgotten), Obsidian import/links/export, only-my-main-characters |
| leads-tier.js | strangers reach out for a real reason and join the cast only if you answer; the 💞 Lover tier (a label only) |
| fame.js | organic growth, viral waves, daily payout, milestones, 💼 offers (brand, collab, appearance, interview, merch, giveaway) |
| memplus.js | learns from what you say, newer replaces older, rehearsal, the Memories editor |
| mind-memory.js | memory by meaning: delicate disclosures imp 8+ and never evicted, duplicates merge, chatter folds into gists, belief lines with a count, recall surfaces what the player told them |
| recall-reactions.js | memories are brought up in their own voice, specific to each person, once a day, never someone else's |
| memory-gaps.js | trimming files memories instead of deleting, vault overflow layer, public words known by close people, facts travel between friends, a year of noise |
| memory-timeline.js | a timeline of milestones per person; changing facts (place, job, relationship status, mood, favourites, birthday) retire older ones |
| pwa-site.js | the installable phone app (site/): boots with no game server, installs its service worker, works offline, picks up a new build (real Edge at iPhone size) |
| refs-feed.js | messages about a post carry a card that opens it (DMs, channels, AI); new posts always land on top (Latest by arrival, For you pins fresh ones) |
| director-apply.js | an approved item really happens, the summary counts DMs/feelings/events and explains anything the world could not use |
| mind-ai.js | AI-written NPC lines (comment, DM, group) pass G.Mind.vet in E.apply: jokes at distress are replaced or dropped and reported in ctx.dropped, third-person lines are dropped; AI rel swings are clamped, partner/dating need prior feelings, the COMMON SENSE prompt block is stable |
| ai-dm.js | DMs on the AI path (mocked model): the free brain is a floor under the AI words (insult -> aff down, grudge, memory; apology repairs), a reply that ignores an insult or heavy news is replaced, the DM prompt carries RECALL (what the player told them, their posts, plans) and a trimmed schema, replies are anchored to the player message and sit before unrelated messages |
| dialogue.js | the free DM brain (js/dialogue.js): dialogue acts + slots (Chrono/compromise), plans from the thread and clock, 5 personas over a 12-message script, insult/apology numbers, recall vs honest forgetting, repeats, leave-on-read, no flippant line under distress |
| mind.js | common-sense classifier, careful line vetting, fitting responses, emotional appraisal, and meaning-based memory salience |
| mind-comments.js | sensitive posts, relevant comments, care DMs, sleeping characters, and no flippant or third-person reactions |
| recap.js | the "Previously on" beats after 30+ minutes away: 1-4, player-related first, no housekeeping lines, no new state key |
| single.js | a second tab/window of the same browser waits on one calm screen and never writes the save; "Use this tab" hands over; no BroadcastChannel = no change |
| rhythm.js | morning choice card and evening wrap: one beat a day, bounded bond nudge, quiet expiry, no key without a write, save round-trip |
| bonds.js | relationship stage changes with hysteresis, NPC pair edges, breakups and repair, grudges, follow choices, and neglect |
| plans.js | outings with real times: a clique proposes (at most 1 per 3 days, real reason), RSVP chips, the clock holds, one shared memory for all attendees, bounded dip + "you missed it" when skipped, cap 12, round-trip |
| moments.js | milestone moments: one 3-card moment per stage change / confession / makeup / breakup / betrayal, dedupe, queue cap 3, choices clamped by vetRel, replay list, history cap 30 |
| rep.js | Reputation and PR: four standings, hostile post lowers Press and filters offers, lay low, public apology via the approval queue, no keys without a write |
| demo-world.js | the free demo start: 14 people, populated feed, adults only, no model call, the world ticks for free |
| chapters.js | weekly chapters (title, up to 4 beats, who changed; no meta lines), cap 12, album of ids cap 40 evicting oldest, titles awarded once with a read-only perk bonus, no keys before a write, round-trip |
| seasons.js | town arcs: at most one active, one choice applied once, NPC reactions through DMs and channels, no NPC top-level posts, save round-trip |
| economy.js | follower growth has diminishing returns, saturates at the population ceiling, and replies do not grow or count as standalone posts |
| goals.js | expired daily goals create capped actions in existing NPC relationships and storylines without creating feed posts or cast members |
| mind-channels.js | common sense in the social layer over a 3-day sim with a delicate player post: no channel line quotes/jokes about it or speaks of itself in the third person, filler is refused, replies attach to the topic, channel memory is rolling and only stored for listeners the line names, no contradictory pair claims, reasons/checkin care, strangers never use distress as a hook, rumours are not offered to their own subject |
| around.js | the Around town tab of Explore: communities, what is happening, rumours, a box to answer |
| memory-wiring.js | every way you speak (DM, reply, post, group chat, channel, story) is heard by the right people, and what they remember reaches the AI, comments and DMs |
| dm-links.js | a message that talks about a post carries a card that opens it, from any source (quote, "your last post", "Kai's post") |
| minimal-ui.js / home-calm.js / phone-polish.js | no emoji in the interface, posts-and-stories-only Home, the bottom bar that never moves (real Edge) |
| soak.js | 30 game days with every system used, invariants and bounds checked each day (also prints time per day) |
| cost-soak.js | counts every AI call over 30 days and prices it for DeepSeek V4.1 Flash 1017 (not in run-all) |
| alerts.js | every kind of alert takes you somewhere when tapped (post, chat, group, page, clock, channel, Director) |
| faces.js | drawn portraits for everyone, optional photos from the faces folder, server routes, the prepare tool |
| channels.js | public channels (town-talk, love-lives, the-drama, fans, news) grounded in real story facts, curious/gossip/defend, replies, story-aware comments, AI spark with approval |
| world-brain.js | retrieval (BM25 + importance + recency), Director standing instructions (/rules), more messages and no phantom "your post" texts, free world events, personality + trend charts |
| director-chat.js | talk to a character from the Director bar (in character, kept in the world) |
| approve.js | the Director proposes, nothing changes until you press Approve |
| director-extras.js | scheduled directions ("in 2 days: …", free until due, due cards), /plan, timeline, hotkeys, admin /later |
| storyteller.js | plain-English directives ("Matt commented X on Mia's latest post, 6 replies, 3 hype 2 shade 1 confused") become exactly that in one AI call; credit saver; 🎬 Direct in roleplay scenes; free fallback |
| family.js | family relationship types (mother, father, son, daughter, brother, sister, grandparents, aunt, uncle, cousin, niece, nephew): pickers, labels, groups, permanent + platonic, no romantic/adult actions or DMs |
| layouts.js | the mockup layouts: phone header + bottom bar, Reels, profile (stats, highlights, tabs, grid), explore mosaic, saved posts |
| ui-diff.js | smooth in-place updates: unchanged cards never touched, typing / revealed photos / unfolded captions survive, indexes exact |
| server-speed.js | thumbnails + disk cache + ETag over real HTTP, thumb-route safety, the minified bundle |
| phone-mode.js | iPhone mode: PIN gate, lockout, cookie safety, home-network-only, manifest + icons, install tip |
| spend-cap.js | the in-game spending cap: stops paid calls, local models free, bad values safe |
| studio.js | character studio (create / edit / export / import, 18+ enforced, hostile files, avatars) |
| hybrid-ai.js | the local-helper + OpenRouter router: per-job routing, presets, take-over when either side fails/refuses/runs out, circuit breaker, cap hand-over, savings stats, 160 random outages |
| crawl.js | clicks every button on every page and modal (add `hostile` for injection data) |
| browser.js / browser-live.js / browser-local.js | a real Edge browser: layout at 3 widths, the heartbeat + stories, a real local model server with CORS |
| perf-browser.js | real-Edge speed budget: page load, redraw, simulation (starts its own server) |

Free models come and go (and some go down) — if one fails, try another from https://openrouter.ai/models?q=free.
