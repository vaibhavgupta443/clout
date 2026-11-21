# Third-party notices

Clout stands on open-source work. Thank you to the authors.

| Component | Used for | License |
|---|---|---|
| [jigar-sable/instagram-mern](https://github.com/jigar-sable/instagram-mern) | Visual design reference for the Instagram-style layout, colours and icon set (re-implemented in plain CSS/JS) | MIT, (c) 2022 Jigar Sable |
| [vader-sentiment](https://github.com/vaderSentiment/vaderSentiment-js) 1.1.3 (`vendor/vader.js`) | Sentiment of social-media text | Apache-2.0 |
| [morphdom](https://github.com/patrick-steele-idem/morphdom) 2.7.8 (`vendor/morphdom.js`) | Smooth, minimal DOM updates (no flicker; keeps images, focus and scroll) | MIT |
| [@formkit/auto-animate](https://github.com/formkit/auto-animate) 0.10.0 (`vendor/auto-animate.min.js`, ESM bundled to a browser global with esbuild) | Messages and comments ease in, others slide aside | MIT |
| [sharp](https://github.com/lovell/sharp) 0.35 (npm, optional) | Photo thumbnails (WebP) with an on-disk cache | Apache-2.0 |
| [esbuild](https://github.com/evanw/esbuild) 0.28 (npm, build step only) | Bundling + minifying the app for a faster start | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) 1.5 (npm, optional) | The QR code shown by phone mode | MIT |
| [graphology](https://github.com/graphology/graphology) + graphology-library (`vendor/graphology*.js`) | Social graph: PageRank (status), Louvain communities (friend circles), shortest paths (gossip) | MIT |
| [chrono-node](https://github.com/wanasit/chrono) 2.10.3 (`vendor/chrono.min.js`, bundled with esbuild) | Understands times and dates in messages ("tomorrow at 7pm") | MIT |
| [compromise](https://github.com/spencermountain/compromise) 14.19.0 (`vendor/compromise.min.js`) | Grammar of messages: questions, negation, people, places | MIT |
| [markdown-it](https://github.com/markdown-it/markdown-it) (`vendor/markdown-it.min.js`) | Markdown rendering for Journal notes and chapter text (vendored; used when loaded) | MIT |
| [Sigma.js](https://github.com/jacomyal/sigma.js) with [graphology](https://github.com/graphology/graphology) (`vendor/sigma.min.js`, `vendor/graphology*.min.js`) | Evidence and relationship graphs (vendored; the Secrets graph currently draws plain SVG) | MIT |
| [Leaflet](https://github.com/Leaflet/Leaflet) 1.9.4 (`vendor/leaflet.js`, `vendor/leaflet/`) | Pan/zoom, image-backed story maps, and interactive location markers (CRS.Simple) | BSD-2-Clause |
| [Lucide](https://github.com/lucide-icons/lucide) (`js/icons.js`, `vendor/LICENSE-lucide.txt`) | The outline icons of the button system (only the ~35 shapes used, as one inline sprite) | ISC (parts MIT, Feather) |

Ideas (re-implemented, no code copied) from:
- [Generative Agents](https://github.com/joonspk-research/generative_agents) (Apache-2.0): memory stream scored by recency / importance / relevance, and reflection.
- [OASIS](https://github.com/camel-ai/oasis) (Apache-2.0): social-media action space and feed recommendation.
- [AI Town](https://github.com/a16z-infra/ai-town) (MIT): agent activity loop.

Local-model support targets the OpenAI-compatible APIs of [Ollama](https://github.com/ollama/ollama) (MIT), LM Studio and KoboldCpp.

## MIT License — instagram-mern

Copyright (c) 2022 Jigar Sable

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The full license texts for the vendored libraries are in `vendor/LICENSE-*.txt`.

## Photos downloaded by `tools/fetch-clean-photos.js`
Everyday photos are taken from Wikimedia Commons "Featured pictures" and kept only if their licence is Public domain, CC0, CC BY or CC BY-SA. Each file's title, author, licence and source link is recorded in `media/CREDITS.txt` (CC BY / CC BY-SA require that credit). Photos you add yourself are yours to manage.

## Unsplash Lite Dataset (photos imported by `tools/import-unsplash.js`)
Everyday, people-free photos are downloaded from the Unsplash Lite Dataset under its terms (https://github.com/unsplash/datasets/blob/master/TERMS.md): they may be downloaded, stored and used internally, and must NOT be redistributed. Keep your `media/` folder on your own computer. Photographer credits are in `media/CREDITS.txt`.
