// Static checks for the built site. Run by GitHub Actions; fails with a readable
// message if the site would ship broken (missing file, bad manifest, unlisted asset).
//   node scripts/check-site.mjs [folder]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'site');
const problems = [];
const fail = (message) => problems.push(message);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const listFiles = (dir) => fs.readdirSync(path.join(root, dir)).map((f) => `${dir}/${f}`);

/* Manifest */
let manifest = {};
try { manifest = JSON.parse(read('manifest.json')); } catch (e) { fail(`manifest.json is not valid JSON: ${e.message}`); }
for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
  if (!manifest[key]) fail(`manifest.json is missing "${key}"`);
}
const manifestFiles = [
  ...(manifest.icons || []).map((i) => i.src),
  ...(manifest.screenshots || []).map((i) => i.src),
  ...(manifest.shortcuts || []).flatMap((s) => (s.icons || []).map((i) => i.src)),
];
for (const src of manifestFiles) if (!exists(src)) fail(`manifest.json points at a missing file: ${src}`);
if (!(manifest.icons || []).some((i) => i.purpose === 'maskable')) fail('manifest.json has no maskable icon');
for (const s of manifest.shortcuts || []) {
  const q = (s.url || '').split('?')[1];
  if (!q) fail(`manifest shortcut "${s.name}" has no query`);
}

/* Service worker precache list */
const sw = read('service-worker.js');
const listMatch = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
if (!listMatch) fail('service-worker.js: could not find the ASSETS list');
const assets = listMatch ? [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, '')) : [];
const optional = new Set(['fonts/geist.woff2', 'fonts/geist-mono.woff2']);
for (const a of assets) {
  if (a === '' || a === './') continue;
  if (!exists(a) && !optional.has(a)) fail(`service-worker.js caches a file that does not exist: ${a}`);
}
for (const f of [...listFiles('js'), ...listFiles('css')]) {
  if (!assets.includes(f)) fail(`${f} is not in the service worker ASSETS list, so it would be missing offline`);
}
if (!sw.includes('__BUILD__')) fail('service-worker.js lost its __BUILD__ placeholder, so updates would never be detected');

/* HTML pages */
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const indexHtml = read('index.html');
const ids = new Set([...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const page of pages) {
  const html = read(page);
  if (!/Content-Security-Policy/.test(html)) fail(`${page}: no Content-Security-Policy meta tag`);
  if (/\sstyle\s*=/.test(html)) fail(`${page}: inline style attribute (blocked by the site's own CSP)`);
  if (/\son[a-z]+\s*=\s*["']/.test(html)) fail(`${page}: inline event handler (blocked by the site's own CSP)`);
  if (page === '404.html') continue; // uses absolute paths that the build rewrites
  for (const m of html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|data:|tel:)/.test(ref)) continue;
    if (!exists(ref.replace(/^\.\//, '')) && ref !== './') fail(`${page}: links to a missing file: ${ref}`);
  }
}
for (const m of indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { JSON.parse(m[1]); } catch (e) { fail(`index.html: JSON-LD is not valid JSON: ${e.message}`); }
}
for (const required of ['<title>', 'name="description"', 'rel="canonical"', 'rel="manifest"', 'name="viewport"', 'rel="apple-touch-icon"']) {
  if (!indexHtml.includes(required)) fail(`index.html is missing ${required}`);
}
const imgTags = [...indexHtml.matchAll(/<img\b[^>]*>/g)];
for (const [tag] of imgTags) if (!/\balt=/.test(tag)) fail(`index.html: image without alt text: ${tag}`);

/* JavaScript: every imported file exists and every getElementById target exists in index.html */
for (const f of listFiles('js')) {
  if (!f.endsWith('.js')) continue;
  const code = read(f);
  for (const m of code.matchAll(/from '(\.\/[^']+)'|import '(\.\/[^']+)'/g)) {
    const target = `js/${(m[1] || m[2]).replace(/^\.\//, '')}`;
    if (!exists(target)) fail(`${f} imports a missing module: ${target}`);
  }
  if (f.endsWith('theme-init.js')) continue;
  for (const m of code.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) {
    if (!ids.has(m[1])) fail(`${f} looks up #${m[1]}, which does not exist in index.html`);
  }
}

/* Site files */
for (const f of ['robots.txt', 'sitemap.xml', '404.html', 'offline.html']) if (!exists(f)) fail(`missing ${f}`);
if (exists('sitemap.xml') && !/<loc>https:\/\/[^<]+<\/loc>/.test(read('sitemap.xml'))) fail('sitemap.xml has no absolute <loc>');

if (problems.length) {
  console.error(`\nSite check found ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error(`  x ${p}`);
  console.error('');
  process.exit(1);
}
console.log(`Site check passed (${pages.length} pages, ${assets.length} cached files, ${manifestFiles.length} manifest files).`);
