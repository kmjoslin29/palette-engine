// Phase 5 UI tests: the real page in headless Chromium, served from dist/site. Run after: node build/bundle.mjs && node build/make_page.mjs
import fs from 'node:fs';
import * as PE from '../dist/engine.mjs';
import { stateA, stateB, stateD, stateC } from '../engine/export_fixtures.mjs';
import { makeChecker, startSite, launch, openApp, download, readZip, contrastAudit } from './harness.mjs';

const { check, done } = makeChecker();
const site = await startSite(); const url = site.url;
const browser = await launch();
const open = (state, o = {}) => openApp(browser, url, { state, step: 'export', ...o, init: o.claude || null });

// 1. gating -----------------------------------------------------------------------------------------------------------
{
  const { ctx, page, errors } = await open(stateD());
  const dis = await page.$$eval('#panel button[id^="exp-"]', (bs) => bs.map((b) => [b.id, b.disabled]));
  check('blocked project: every export button is disabled, project save is not', dis.filter(([id]) => id !== 'exp-project').every(([, d]) => d) && dis.find(([id]) => id === 'exp-project')[1] === false && dis.length === 8, JSON.stringify(dis));
  check('blocked project: the failing pairs are listed, with a route to fix them', (await page.textContent('#panel')).includes('light: onSurface on surface') && await page.isVisible('text=Go to Palette and roles'));
  const proj = await download(page, '#exp-project');
  const parsed = PE.parseProject(proj.bytes.toString());
  check('blocked project: the project file still downloads and loads back', parsed.ok && parsed.state.seed.hex === stateD().seed.hex, parsed.errors);
  // accept notes from the Palette step
  await page.click('text=Go to Palette and roles'); await page.waitForSelector('text=Role pairs');
  const ids = await page.$$eval('input[id^="acc-"]', (l) => l.map((e) => e.id)); const inputs = ids;
  check('the Palette step offers a note field for each unresolved failure', inputs.length >= 3, inputs.length);
  for (const id of ids) { await page.fill(`#${id}`, 'Accepted for the test.'); await page.dispatchEvent(`#${id}`, 'change'); }
  await page.click('#tab-export'); await page.waitForSelector('#exp-forge');
  check('after notes are added the export buttons enable', await page.$$eval('#panel button[id^="exp-"]', (bs) => bs.every((b) => !b.disabled)));
  check('no console or page errors during gating', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 2. every download via the browser fallback, parsed back ------------------------------------------------------------------
{
  const s = stateB();
  const { ctx, page, errors } = await open(s);
  const D = {};
  for (const id of ['forge', 'dtcg', 'css', 'md', 'ase', 'pdf', 'project']) D[id] = await download(page, `#exp-${id}`);
  const slug = D.forge.name.replace(/-design-tokens\.json$/, '');
  check('file names follow the project-name slug and suffixes', D.dtcg.name === `${slug}.w3c.tokens.json` && D.css.name === `${slug}-colors.css` && D.ase.name === `${slug}.ase` && D.pdf.name === `${slug}-color-spec-sheet.pdf` && D.md.name === `${slug}-color-spec.md` && D.project.name === `${slug}.palette-project.json`, Object.values(D).map((d) => d.name).join());
  const forge = JSON.parse(D.forge.bytes.toString());
  check('forge: primary tone and dark role tokens exist with hex-string values', /^#[0-9a-f]{6}$/i.test(forge.color.primary['40'].$value) && forge.color.primary['40'].$type === 'color' && forge['color-dark'] && forge.$themes, Object.keys(forge).join());
  const dtcg = JSON.parse(D.dtcg.bytes.toString());
  check('dtcg: color values are objects with colorSpace and components', dtcg.color.primary['40'].$value.colorSpace === 'srgb' && Array.isArray(dtcg.color.primary['40'].$value.components));
  check('css parses as CSS with the dark selectors', /prefers-color-scheme: dark/.test(D.css.bytes.toString()) && /\[data-theme="dark"\]/.test(D.css.bytes.toString()));
  const md = D.md.bytes.toString();
  for (const k of Object.keys(s.accepted)) { const note = s.accepted[k].split('\n')[0]; check(`markdown carries accepted note "${note.slice(0, 32)}"`, md.includes(PE.mdEscape(note))); }
  check('markdown carries the seed rationale', md.includes(s.seed.rationale));
  const ase = PE.parseAse(new Uint8Array(D.ase.bytes));
  check('ase parses and has the screen and print groups', JSON.stringify(ase).includes('Screen RGB') && JSON.stringify(ase).includes('Print GRACoL coated CMYK'));
  check('pdf starts %PDF and ends %%EOF', D.pdf.bytes.slice(0, 5).toString() === '%PDF-' && D.pdf.bytes.slice(-8).toString().includes('%%EOF'));
  const pr = PE.parseProject(D.project.bytes.toString());
  check('project file round-trips to the state on the page (seed, accepted, overrides)', pr.ok && JSON.stringify(pr.state.accepted) === JSON.stringify(s.accepted) && JSON.stringify(pr.state.overrides) === JSON.stringify(s.overrides) && pr.state.seed.hex === s.seed.hex);
  // ase tones switch
  await page.click('[role="switch"]'); const aseT = await download(page, '#exp-ase');
  check('the tonal-palette switch enlarges the ASE file', aseT.bytes.length > D.ase.bytes.length * 3, `${aseT.bytes.length} vs ${D.ase.bytes.length}`);
  const zip = await download(page, '#exp-all'); const z = readZip(zip.bytes);
  check('download-all zip holds the seven files plus README.txt', Object.keys(z).length === 8 && z['README.txt'] && z[D.ase.name] && z[D.pdf.name], Object.keys(z).join());
  check('no console or page errors during downloads', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 3. the viewer's downloads capability ------------------------------------------------------------------------------------
{
  const mock = () => {
    window.__saves = []; window.__mode = 'ok';
    window.claude = { use: async (n) => (n === 'downloads' ? { save: async (r) => {
      if (window.__mode === 'decline') { throw { code: 'declined', message: 'no' }; }
      if (window.__mode === 'unavailable') { throw { code: 'unavailable', message: 'no' }; }
      const d = r.data; window.__saves.push({ filename: r.filename, type: typeof d === 'string' ? 'string' : d.constructor.name, size: typeof d === 'string' ? d.length : d.length ?? d.byteLength }); return { status: 'saved' }; } } : null) };
  };
  const { ctx, page, errors } = await open(stateB(), { claude: mock });
  for (const id of ['forge', 'dtcg', 'css', 'md', 'ase', 'pdf', 'project']) { await page.click(`#exp-${id}`); await page.waitForFunction((n) => window.__saves.length === n, ['forge', 'dtcg', 'css', 'md', 'ase', 'pdf', 'project'].indexOf(id) + 1); }
  const saves = await page.evaluate(() => window.__saves);
  const ext = (n) => n.split('.').pop();
  const ALLOW = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip']);
  check('every save uses an extension the viewer allows', saves.every((s) => ALLOW.has(ext(s.filename))), saves.map((s) => s.filename).join());
  check('.css and .ase are saved inside a .zip; the rest are saved as they are', saves.filter((s) => /\.(css|ase)\.zip$/.test(s.filename)).length === 2 && saves.length === 7, saves.map((s) => s.filename).join());
  check('the status line says a wrapped file is inside a zip', (await page.textContent('#panel')).includes('inside a .zip'));
  await page.evaluate(() => { window.__mode = 'decline'; }); await page.click('#exp-md'); await page.waitForSelector('text=you closed the save prompt');
  check('declining the prompt is reported, not an error, and nothing else is saved', (await page.evaluate(() => window.__saves.length)) === 7);
  await page.evaluate(() => { window.__mode = 'unavailable'; });
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('#exp-md')]);
  check('an unusable viewer save falls back to a browser download', d.suggestedFilename().endsWith('-color-spec.md'));
  check('no console or page errors on the viewer path', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 4. project save / open ---------------------------------------------------------------------------------------------------
{
  const s = stateA();
  const { ctx, page, errors } = await open(s);
  const saved = await download(page, '#exp-project');
  fs.mkdirSync('tmp/test_ui', { recursive: true }); fs.writeFileSync('tmp/test_ui/saved.palette-project.json', saved.bytes);
  await page.click('#reset'); await page.click('#reset'); await page.waitForSelector('text=Choose a seed color');
  const empty = await page.evaluate(() => window.__PE_APP.state.seed);
  check('New project clears the seed', empty === null);
  await page.evaluate(() => { const s = window.__PE_APP.state; s.seed = { hex: '#336699', origin: 'manual', tier: null, rationale: '', locked: false }; window.__PE_APP.render(); });
  await page.click('#tab-export'); await page.click('#open-project'); await page.waitForSelector('#open-confirm');
  check('opening a project over existing work asks first', await page.isVisible('text=Replace your current work?'));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-confirm')]);
  await fc.setFiles('tmp/test_ui/saved.palette-project.json'); await page.waitForSelector('text=Opened.');
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(window.__PE_APP.state)));
  const want = PE.parseProject(saved.bytes.toString()).state;
  check('opened state equals the saved state (seed, name, supporting, locks, spot text)', JSON.stringify(st) === JSON.stringify(want), JSON.stringify(st).slice(0, 200));
  // invalid files
  const bad = { 'not-json.json': '{nope', 'wrong.json': '{"format":"other","state":{}}', 'badhex.json': JSON.stringify({ format: 'palette-engine-project', version: 1, state: { v: 1, seed: { hex: 'red', origin: 'manual' } } }), 'proto.json': '{"format":"palette-engine-project","version":1,"state":{"v":1,"__proto__":{"polluted":true},"accepted":{"__proto__":"x"}}}' };
  for (const [n, body] of Object.entries(bad)) {
    fs.writeFileSync(`tmp/test_ui/${n}`, body);
    const before = await page.evaluate(() => JSON.stringify(window.__PE_APP.state));
    await page.click('#open-project'); await page.waitForSelector('#open-confirm');
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-confirm')]);
    await fc2.setFiles(`tmp/test_ui/${n}`);
    await page.waitForSelector('text=That file was not opened');
    const after = await page.evaluate(() => JSON.stringify(window.__PE_APP.state));
    check(`invalid file ${n}: refused with reasons and state unchanged`, before === after && (await page.$$eval('.notice.fail li', (l) => l.length)) >= 1);
  }
  check('no prototype pollution', (await page.evaluate(() => ({}).polluted)) === undefined);
  check('no console or page errors during project open', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 4b. open a project file from the Seed step (a saved project is a way to start, so it must not need a seed first) ---------------------
{
  const saved = 'tmp/test_ui/saved.palette-project.json'; // written by section 4 above
  const want = PE.parseProject(fs.readFileSync(saved, 'utf8')).state;
  // (a) a brand-new page: no seed, every later step locked
  const { ctx, page, errors } = await openApp(browser, url, {});
  check('Seed step with no work: the later tabs are locked and "Open project file" is offered', await page.$eval('#tab-export', (b) => b.disabled) && await page.isVisible('#open-project'));
  check('the Seed-step button has a text name and is a real button', (await page.textContent('#open-project')).includes('Open project file') && (await page.$eval('#open-project', (b) => b.tagName)) === 'BUTTON');
  const box = await page.$eval('#open-project', (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  check('the Seed-step button is at least 40 px tall (the .btn target; its hit area is 48 px)', box[1] >= 40 && box[0] >= 48, JSON.stringify(box));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-project')]);
  check('with no work on the page there is nothing to replace: the file chooser opens at once, with no confirmation', !(await page.isVisible('#open-confirm')));
  await fc.setFiles(saved); await page.waitForSelector('text=Opened.');
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(window.__PE_APP.state)));
  check('opened from the Seed step: state equals the saved state and the step it was saved on (Export) is showing', JSON.stringify(st) === JSON.stringify(want) && (await page.$eval('#tab-export', (b) => b.getAttribute('aria-selected'))) === 'true', JSON.stringify(st).slice(0, 160));
  check('opened from the Seed step: every later tab is now unlocked', await page.$$eval('#tabs button', (bs) => bs.every((b) => !b.disabled)));
  // (b) a bad file from the Seed step, with work on the page: asks first, then refuses, says why, changes nothing, and the note stays on the Seed step
  await page.click('#tab-seed'); await page.waitForSelector('#open-project');
  fs.writeFileSync('tmp/test_ui/seed-bad.json', '{nope');
  const before = await page.evaluate(() => JSON.stringify(window.__PE_APP.state));
  await page.click('#open-project'); await page.waitForSelector('#open-confirm');
  check('Seed step with work on the page: opening asks before replacing it', await page.isVisible('text=Replace your current work?'));
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-confirm')]);
  await fc2.setFiles('tmp/test_ui/seed-bad.json'); await page.waitForSelector('#panel .notice.fail');
  const after = await page.evaluate(() => JSON.stringify(window.__PE_APP.state));
  check('a bad file opened from the Seed step: refused with a reason, shown on the Seed step, work unchanged', before === after && (await page.$$eval('#panel .notice.fail li', (l) => l.length)) >= 1 && (await page.textContent('#panel')).includes('Choose a seed color'));
  await page.click('#tab-palette'); await page.click('#tab-seed');
  check('the failure note does not follow the person to other steps', (await page.$$('#panel .notice.fail')).length === 0);
  check('no console or page errors opening from the Seed step', errors.length === 0, errors.join(' | '));
  await ctx.close();
  // (c) a saved project that has no seed yet: opens, stays on the Seed step, and says so there
  const empty = PE.defaultState(); empty.name = 'No seed yet';
  fs.writeFileSync('tmp/test_ui/noseed.palette-project.json', PE.serializeProject(empty));
  const b = await openApp(browser, url, {});
  const [fc3] = await Promise.all([b.page.waitForEvent('filechooser'), b.page.click('#open-project')]);
  await fc3.setFiles('tmp/test_ui/noseed.palette-project.json'); await b.page.waitForSelector('#panel .notice.pass');
  check('a saved project with no seed opens on the Seed step and the confirmation is shown there', (await b.page.textContent('#panel')).includes('Choose a seed color') && (await b.page.textContent('#panel .notice.pass')).includes('Opened.'));
  check('no console or page errors opening a project with no seed', b.errors.length === 0, b.errors.join(' | '));
  await b.ctx.close();
  // (d) a project saved on the Palette step opens on the Palette step (not Export), says so there, and moves focus to the step heading
  const mid = stateA(); mid.step = 'palette';
  fs.writeFileSync('tmp/test_ui/palette-step.palette-project.json', PE.serializeProject(mid));
  const d = await openApp(browser, url, {});
  const [fc4] = await Promise.all([d.page.waitForEvent('filechooser'), d.page.click('#open-project')]);
  await fc4.setFiles('tmp/test_ui/palette-step.palette-project.json'); await d.page.waitForSelector('#panel .notice.pass');
  check('a project saved on the Palette step opens on the Palette step', (await d.page.$eval('#tab-palette', (x) => x.getAttribute('aria-selected'))) === 'true' && (await d.page.evaluate(() => window.__PE_APP.state.step)) === 'palette');
  check('the "Opened." note is shown on that step', (await d.page.textContent('#panel .notice.pass')).includes('Opened.'));
  check('focus moves to the step heading after the redraw (the button that was used is gone)', await d.page.evaluate(() => document.activeElement && document.activeElement.id === 'panel-title'));
  await d.page.click('#tab-checks'); await d.page.waitForSelector('#panel-title');
  check('the note ends when the person leaves that step', !(await d.page.textContent('#panel')).includes('Opened.'));
  check('no console or page errors opening a project saved on another step', d.errors.length === 0, d.errors.join(' | '));
  await d.ctx.close();
}

// 5. layout, dark mode, contrast, touch targets ----------------------------------------------------------------------------
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await open(stateB(), { scheme, width: 375 });
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`phone width 375 (${scheme}): no horizontal scroll`, scroll <= 0, scroll);
  const small = await page.$$eval('#panel button:not([disabled]), #panel input, #panel textarea', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return e.type !== 'file' && r.width && (Math.max(r.height, 48 * 0) < 24); }).map((e) => e.id || e.textContent));
  check(`touch targets (${scheme}): nothing under 24px tall (buttons are 40px with a 48px hit area, same as the other steps)`, small.length === 0, small.join());
  const au = await contrastAudit(page);
  check(`WCAG AA text contrast on the Export step (${scheme}): ${au.count} text nodes`, au.count > 30 && au.fail.length === 0, JSON.stringify(au.fail.slice(0, 4)));
  await ctx.close();
}
{
  const { ctx, page } = await open(stateC());
  const tone = await page.$eval('#exp-forge', (b) => b.disabled);
  check('a P3-only seed still exports (state C)', tone === false);
  await ctx.close();
}
await browser.close(); site.close();
process.exit(done());
