// Assembles two copies of the page, plus the print tables they fetch at runtime:
//   dist/site/         index.html as a fragment (no doctype, charset, viewport or <body>): the claude.ai artifact host wraps it when it publishes.
//   dist/site-hosted/  the same page as a complete HTML document, for any plain static host (GitHub Pages, Netlify, Cloudflare Pages, a USB stick behind a local server).
//   Each folder also holds data/lut_*.json (fetched at runtime, so the page needs a server: opening index.html from disk blocks those fetches).
//   node build/make_page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const esc = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const lex = esc(JSON.stringify(JSON.parse(rd('data/lexicon.json'))));
const engine = rd('dist/engine.iife.js').replace(/<\/script/gi, '<\\/script');
const head = `<title>Palette Engine</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${rd('web/style.css')}
</style>
`;
const body = `<div class="wrap">
  <header class="top">
    <div class="brand"><h1>Palette Engine</h1><span class="muted">A brand palette with screen, print and spot values, and the evidence for each choice.</span>
      <p class="muted scope"><b>A reference and support tool, not a brand generator.</b> Screen and contrast values are calculated. Suggestions are research averages, and print and spot values are approximations, so check them before relying on them.</p></div>
    <div class="row"><span class="savestate" id="savestate"></span><button type="button" class="btn outlined small" id="reset">New project</button></div>
  </header>
  <div class="tabs" role="tablist" aria-label="Steps" id="tabs"></div>
  <main class="panel" id="panel" role="tabpanel" tabindex="-1"></main>
  <footer class="foot" id="foot"></footer>
</div>
<div class="sr" id="live" aria-live="polite" role="status"></div>
<script type="application/json" id="lexicon-data">${lex}</script>
<script>${engine}</script>
<script>
${rd('web/app.js')}
</script>
`;
// The fragment for the artifact host: head and body one after the other, exactly as before.
const html = head + body;
// The complete document. The charset line matters: the bundle holds non-ASCII characters (a regex over combining marks), and a server that sends
// no charset makes the browser misread them, which stops the page with a script error and leaves it blank.
const hosted = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}</head>
<body>
${body}</body>
</html>
`;

// Self-check, so a later edit cannot quietly drop what a plain host needs. Runs before anything is written and throws, which fails `npm run page` and therefore `npm test` without leaving a broken folder behind.
const written = hosted;
const need = [
  [/^<!doctype html>/i.test(written), 'starts with a doctype'],
  [/<html lang="[a-z-]+">/i.test(written), 'has an html lang attribute'],
  [/<meta charset="utf-8">/i.test(written.slice(0, 300)), 'declares UTF-8 within the first 300 characters'],
  [/<meta name="viewport"/i.test(written.slice(0, 400)), 'has a viewport meta'],
  [written.split('<title>').length === 2, 'has exactly one title'],
  [written.includes(body), 'carries the same body markup and scripts as the artifact copy'],
  [!/AGPL|GNU Affero|CoLoR PaRsLeY/i.test(html) && !/AGPL|GNU Affero|CoLoR PaRsLeY/i.test(hosted), 'contains no AGPL text (build/bundle.mjs must alias colorparsley to build/stubs/colorparsley-hex.js)'],
];
for (const [ok, what] of need) if (!ok) throw new Error(`the built page does not meet the check: ${what}`);


const luts = fs.readdirSync(path.join(root, 'data')).filter((f) => /^lut_.*\.json$/.test(f)).sort();
for (const [dir, text] of [['site', html], ['site-hosted', hosted]]) {
  const out = path.join(root, 'dist', dir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), text);
  for (const f of luts) fs.copyFileSync(path.join(root, 'data', f), path.join(out, 'data', f));
}

console.log(`dist/site/index.html ${(html.length / 1024).toFixed(0)} KB + ${luts.length} LUT files (claude.ai artifact)`);
console.log(`dist/site-hosted/index.html ${(hosted.length / 1024).toFixed(0)} KB + ${luts.length} LUT files (any static host)`);
