// Builds a minified, single-file version of the app (esbuild, MIT) for a much faster start:
//   node tools/build.js
// index.html keeps listing every script (development + tests use that); serve.js swaps in dist/clout.<hash>.js
// automatically when the build is newer than every source file, and falls back to the plain files otherwise.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  console.log('esbuild is not installed (run "npm install" in this folder). Skipping the build: the game still works, just loads the plain files.');
  process.exit(0);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[a-z0-9/]+\.js)"><\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no app scripts found in index.html');
const mtimeOf = (f) => fs.statSync(path.join(root, f)).mtimeMs;
const sources = scripts.concat(['css/style.css', 'index.html']);
const stamp = Math.max(...sources.map(mtimeOf));

const t0 = Date.now();
const js = scripts
  .map((f) => esbuild.transformSync(fs.readFileSync(path.join(root, f), 'utf8'), { minify: true, target: 'es2020', loader: 'js', sourcefile: f }).code)
  .join('\n;');
const css = esbuild.transformSync(fs.readFileSync(path.join(root, 'css/style.css'), 'utf8'), { minify: true, loader: 'css' }).code;
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const jsName = `clout.${hash(js)}.js`;
const cssName = `clout.${hash(css)}.css`;
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.readdirSync(dist).forEach((f) => fs.unlinkSync(path.join(dist, f)));
fs.writeFileSync(path.join(dist, jsName), js);
fs.writeFileSync(path.join(dist, cssName), css);
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ js: jsName, css: cssName, stamp, scripts, builtAt: Date.now() }));
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
const srcJs = scripts.reduce((a, f) => a + fs.statSync(path.join(root, f)).size, 0);
console.log(`built dist/${jsName} ${kb(js)} KB (from ${(srcJs / 1024).toFixed(0)} KB in ${scripts.length} files) + dist/${cssName} ${kb(css)} KB in ${Date.now() - t0} ms`);
