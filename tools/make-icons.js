// Draws the app icons (home-screen icon for iPhone/Android + manifest icons) with sharp:  node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const out = path.resolve(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".25" stop-color="#fa7e1e"/><stop offset=".5" stop-color="#d62976"/><stop offset=".75" stop-color="#962fbf"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".28"/></filter></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})" filter="url(#s)">
<path fill="#fff" d="M178 352c-45 0-82-33-82-74 0-34 25-63 59-71 5-48 47-86 98-86 42 0 78 26 92 62 4-1 9-1 13-1 41 0 74 31 74 70s-33 70-74 70z"/>
</g></svg>`;

(async () => {
  const targets = { 'apple-touch-icon.png': [180, 0], 'icon-192.png': [192, 0], 'icon-512.png': [512, 0], 'icon-maskable-512.png': [512, 70] };
  for (const [name, [size, pad]] of Object.entries(targets)) {
    await sharp(Buffer.from(svg(pad))).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, name));
    console.log('icons/' + name, size + 'px');
  }
  fs.writeFileSync(path.resolve(__dirname, '..', 'manifest.webmanifest'), JSON.stringify({
    name: 'Clout', short_name: 'Clout', description: 'A private social-media life sim', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#fafafa', theme_color: '#ffffff',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
  }, null, 2) + '\n');
  console.log('manifest.webmanifest written');
})().catch((e) => { console.error(e.message); process.exit(1); });
