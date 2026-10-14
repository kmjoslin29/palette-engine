// Phase 6 end-to-end tests: a designer's whole session in the real page (headless Chromium), both entry paths, every step,
// light and dark, phone width, keyboard focus, reload. Gate: zero page errors, console errors or failed requests.
// Run after: node build/bundle.mjs && node build/make_page.mjs
import * as PE from '../dist/engine.mjs';
import { makeChecker, startSite, launch, openApp, download, readZip, contrastAudit } from './harness.mjs';

const { check, done } = makeChecker();
const site = await startSite();
const browser = await launch();
const STEPS = ['seed', 'analyze', 'support', 'palette', 'checks', 'export'];
const SPOT = 'Sample Blue C, 40.1, 4.2, -45.3\nSample Blue U, 42, 3, -40\nSample Rust C, 45, 38, 40\nSample Rust U, 47, 35, 36\nbad line without numbers';

const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__PE_APP.state)));
const goto = async (page, id) => { await page.click(`#tab-${id}`); await page.waitForSelector('#panel-title'); };
const panelText = (page) => page.textContent('#panel');

/** Accept every unresolved role-pair failure with a note, via the Palette step's own fields. */
async function resolveFailures(page) {
  await goto(page, 'palette');
  for (const mode of ['Light', 'Dark']) {
    await page.click(`.seg button:has-text("${mode}")`);
    const ids = await page.$$eval('input[id^="acc-"]', (l) => l.map((e) => e.id));
    for (const id of ids) { await page.fill(`#${id}`, `Accepted in the ${mode.toLowerCase()} scheme for the test.`); await page.dispatchEvent(`#${id}`, 'change'); }
  }
  const remaining = await page.$$eval('#panel .notice.fail', (l) => l.length);
  return remaining;
}

// ---- Path B: I already have a color ------------------------------------------------------------------------------------
{
  const { ctx, page, errors } = await openApp(browser, site.url);
  check('fresh start: only the Seed step is open', (await page.$$eval('.tab', (t) => t.map((x) => x.disabled))).join() === 'false,true,true,true,true,true');
  const foot = await page.textContent('#foot');
  check('the footer says the findings are averages across the people studied and can shift with age, culture, training and setting', /averages across the people studied/.test(foot) && /age, culture, design training and the setting/.test(foot));
  check('the footer says many studies used controlled stimuli and lighting, and that screen, print and full palettes can differ', /under controlled lighting/.test(foot) && /on your screen or in print can look different/i.test(foot) && /full palette in real use can behave differently/.test(foot));
  check('the footer credits ECI for the PSO tables and carries the registry notice for the FOGRA39 file (C30)', /computed from profiles published by ECI European Color Initiative/.test(foot) && /made available by VIGC, with permission of X-rite/.test(foot) && /may not be altered or sold without written permission of VIGC/.test(foot));
  await page.fill('#seed-input', 'not a color'); await page.click('button:has-text("Use this color")');
  check('a bad color gives a clear message and sets no seed', (await panelText(page)).includes('not a color this tool can read') && (await st(page)).seed === null);
  await page.fill('#seed-input', '#B5532A'); await page.click('button:has-text("Use this color")');
  await page.waitForSelector('text=Your seed');
  check('a good color becomes the seed, origin manual', (await st(page)).seed.hex === '#b5532a' && (await st(page)).seed.origin === 'manual');
  await page.fill('#seed-name', 'Terracotta'); await page.fill('#seed-note', 'Warm, baked, hand-made feel.');
  await page.click('[role="switch"]');
  check('name, rationale and lock are stored on the seed', await page.evaluate(() => { const s = window.__PE_APP.state.seed; return s.name === 'Terracotta' && s.rationale.startsWith('Warm') && s.locked === true; }));
  await page.click('button:has-text("Continue to analysis")'); await page.waitForSelector('text=Analyze the seed');
  const t = await panelText(page);
  check('Analyze shows screen values, CMYK, total ink and the gamut verdict', /sRGB/.test(t) && /Total ink/.test(t) && /Printable|Out of print gamut/.test(t));
  check('all six print profiles are tabulated, with their regions', ['GRACoL 2013 coated', 'SWOP 2013', 'GRACoL 2013 uncoated', 'PSO Coated v3 (FOGRA51)', 'PSO Uncoated v3 (FOGRA52)', 'FOGRA39 (VIGC 260)', 'North America', 'Europe'].every((n) => t.includes(n)));
  // Region groups and the FOGRA39 file's 260% limit from its registry page (D38, D43, C23, C31)
  const pick = async (label) => { await page.click(`button[aria-pressed]:has-text("${label}")`); await page.waitForTimeout(150); return panelText(page); };
  check('the print selector has one group per region, each button named and pressed state exposed', (await page.$$eval('#panel [role="group"][aria-label="Print condition"] [role="group"]', (g) => g.map((x) => x.getAttribute('aria-label') + ':' + x.querySelectorAll('button').length).join('|'))) === 'United States and North America:3|Europe:3');
  check('default is GRACoL coated, with a limit check', (await st(page)).profile === 'gracol2013_crpc6' && /Total ink \d+% of a 320% limit/.test(t) && /Within limit/.test(t));
  const tEu = await pick('PSO Coated v3 (FOGRA51)');
  check('choosing a European profile shows its region note, a 300% limit and keeps the choice in the project state', (await st(page)).profile === 'pso_coated_v3' && /Europe\./.test(tEu) && /ISO 12647-2:2013/.test(tEu) && /of a 300% limit/.test(tEu));
  const tFo = await pick('FOGRA39 (VIGC 260)');
  check('the FOGRA39 file is checked against the 260% its registry page lists: a limit line, a verdict, no null in the text', (await st(page)).profile === 'fogra39_vigc260' && /Total ink \d+% of a 260% limit/.test(tFo) && /ICC registry page lists a total ink limit of 260%/.test(tFo) && !/states no ink limit/.test(tFo) && /Within limit/.test(tFo.replace(/All 6 print conditions[\s\S]*/, '')) && !/null|undefined|NaN/.test(tFo));
  check('the table row for the FOGRA39 file shows its 260% limit', /\d+ \/ 260%/.test(tFo));
  check('exactly one print button is pressed', (await page.$$eval('#panel [aria-label="Print condition"] button[aria-pressed="true"]', (b) => b.length)) === 1);
  await pick('GRACoL 2013 coated');
  check('back on GRACoL coated the limit check returns', (await st(page)).profile === 'gracol2013_crpc6' && /of a 320% limit/.test(await panelText(page)));
  await page.fill('#spot-text', SPOT); await page.click('button:has-text("Score")'); await page.waitForSelector('text=Sample Blue C (approx.)').catch(() => {});
  const t2 = await panelText(page);
  check('the spot scorer lists pasted names as approximate and skips the bad line', /\(approx\.\)/.test(t2) && /line 5/.test(t2));
  await goto(page, 'support');
  await page.click('button:has-text("Use as secondary")');
  check('a harmony candidate becomes the secondary, with its lens as origin', (await st(page)).supporting.secondary.origin.startsWith('harmony:'));
  await page.fill('#manual-tertiary', '#2E7D32'); await page.press('#manual-tertiary', 'Enter');
  check('a manual color becomes the tertiary', (await st(page)).supporting.tertiary?.hex === '#2e7d32');
  await goto(page, 'palette');
  await page.click('.role:has(span:text-is("onSurface")) button:has-text("Override")'); await page.fill('#ov-hex', '#b0b0b0'); await page.click('button:has-text("Apply")');
  check('a role override is stored', (await st(page)).overrides.light.onSurface === '#b0b0b0');
  check('a low-contrast override blocks export and names the failing pairs', /Export blocked/.test(await panelText(page)));
  await goto(page, 'export');
  check('while blocked, every export button is disabled', await page.$$eval('#panel button[id^="exp-"]:not(#exp-project)', (b) => b.length === 7 && b.every((x) => x.disabled)));
  const rem = await resolveFailures(page);
  check('all role-pair failures can be resolved from the Palette step', rem === 0, rem);
  await goto(page, 'checks');
  const tc = await panelText(page);
  check('Checks shows WCAG, color-blind, APCA (advisory), print and origin sections', ['Text pairs at AA', 'Color-blind views', 'APCA (advisory)', 'Print', 'Where each color came from'].every((x) => tc.includes(x)) && tc.includes('Warm, baked'));
  await goto(page, 'export');
  const files = await download(page, '#exp-all'); const z = readZip(files.bytes);
  const names = Object.keys(z);
  check('Download all: seven files and a README', names.length === 8 && names.includes('README.txt'), names.join());
  const md = z[names.find((n) => n.endsWith('-color-spec.md'))].toString();
  check('the typed name, rationale and accepted-failure notes reach the Markdown spec', md.includes('Terracotta') && md.includes('Warm, baked') && md.includes('Accepted in the light scheme'));
  const proj = PE.parseProject(z[names.find((n) => n.endsWith('.palette-project.json'))].toString());
  check('the project file in the bundle reloads to the state on the page', proj.ok && proj.state.seed.hex === '#b5532a' && Object.keys(proj.state.accepted).length > 0);
  // reload keeps the work
  await page.reload(); await page.waitForSelector('#panel-title');
  check('after a reload the work is still there', (await st(page)).seed?.hex === '#b5532a' && (await st(page)).step === 'export');
  check('path B: zero console errors, page errors or failed requests', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- Path A: I have words -----------------------------------------------------------------------------------------------
{
  const { ctx, page, errors } = await openApp(browser, site.url);
  await page.click('button:has-text("I have words")');
  await page.fill('#words-input', 'trustworthy, calm, zorpy'); await page.click('button:has-text("Find seed candidates")');
  await page.waitForSelector('text=Seed candidates');
  const t = await panelText(page);
  check('an unknown word is flagged, not guessed', /Not in the lexicon:\s*zorpy/.test(t));
  await page.fill('#words-input', 'cheerful, peaceful'); await page.click('button:has-text("Find seed candidates")');
  await page.waitForSelector('[data-beyond-tested]');
  const bt = await page.$eval('[data-beyond-tested]', (e) => e.textContent);
  check('a seed lighter than the study tested says so on its card, with the range', /Lighter than the study tested/.test(bt) && /between L 0\.30 and 0\.91/.test(bt) && /Low confidence/.test(bt), bt);
  check('the seed list says color-word bands are design choices with low-confidence edges', /Color-word bands[^.]*design choices[^.]*centered on colors the studies measured[^.]*low confidence/.test(await page.$eval('[data-band-note]', (e) => e.textContent)));
  check('a strong-synonym match is labeled on the page', /peaceful → calm \(near-synonym, tier lowered\)/.test(await panelText(page)));
  await page.fill('#words-input', 'trustworthy, calm, zorpy'); await page.click('button:has-text("Find seed candidates")');
  await page.waitForSelector('text=Seed candidates');
  check('candidates show their evidence tier and accessibility side by side', (await page.$$('article.card')).length >= 3 && /Accessibility \(WCAG 2\.2\)/.test(t) && /Evidence/.test(t));
  const before = await page.$$eval('article.card .hex', (l) => l.map((e) => e.textContent));
  await page.click('.chip:has-text("Text on white")');
  const after = await page.$$eval('article.card .hex', (l) => l.map((e) => e.textContent));
  const hiddenNote = await page.$$eval('details summary', (l) => l.map((e) => e.textContent).join('|'));
  check('a filter hides nothing silently: the hidden candidates stay listed', after.length + (hiddenNote.match(/(\d+) hidden/) ? +hiddenNote.match(/(\d+) hidden/)[1] : 0) >= before.length || after.length === before.length, `${before.length} -> ${after.length}; ${hiddenNote}`);
  await page.click('.chip:has-text("Text on white")');
  await page.click('article.card >> nth=0 >> button:has-text("Use as seed")');
  await page.waitForSelector('text=From descriptor words');
  const s = (await st(page)).seed;
  check('the chosen candidate is a descriptor seed with a tier and the words kept', s.origin === 'descriptor' && !!s.tier && s.words.includes('trustworthy'), JSON.stringify(s));
  await goto(page, 'support'); await page.click('button:has-text("Use as secondary")');
  const rem = await resolveFailures(page);
  check('path A reaches an exportable palette', rem === 0);
  await goto(page, 'export');
  check('path A: export buttons are enabled', await page.$$eval('#panel button[id^="exp-"]', (b) => b.every((x) => !x.disabled)));
  const pdf = await download(page, '#exp-pdf');
  check('path A: the PDF downloads', pdf.bytes.slice(0, 5).toString() === '%PDF-');
  check('path A: zero console errors, page errors or failed requests', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- every step, light and dark, phone and desktop ---------------------------------------------------------------------------
const sample = PE.defaultState();
sample.name = 'Sweep test'; sample.seed = { hex: '#1f5fa8', origin: 'manual', tier: null, rationale: 'Sweep.', locked: false, mappedFrom: null };
sample.supporting.secondary = { hex: '#d9822b', origin: 'harmony:complementary', tier: 'low confidence', lens: 'complementary', offset: 180, rationale: '', locked: false };
sample.spot = { text: SPOT, illum: 'D50' };
sample.words = 'calm, bold'; sample.searched = true;
for (const scheme of ['light', 'dark']) for (const width of [375, 1100]) {
  const { ctx, page, errors } = await openApp(browser, site.url, { state: sample, step: 'seed', scheme, width });
  let worst = 0, audited = 0, badNames = [], fails = [];
  for (const id of STEPS) {
    await goto(page, id);
    if (id === 'seed') { await page.click('button:has-text("I have words")'); }
    worst = Math.max(worst, await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const au = await contrastAudit(page); audited += au.count; fails.push(...au.fail.map((f) => `${id}: ${f.t}`));
    badNames.push(...(await page.$$eval('#panel button, #panel input, #panel textarea, #panel select', (els) => els.filter((e) => e.type !== 'file' && !(e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.textContent.trim() || e.getAttribute('title'))).map((e) => `${e.tagName}#${e.id}`))));
  }
  check(`every step (${scheme}, ${width}px): no sideways scroll`, worst <= 0, worst);
  check(`every step (${scheme}, ${width}px): text passes WCAG AA (${audited} text nodes)`, audited > 200 && fails.length === 0, fails.slice(0, 5).join('; '));
  check(`every step (${scheme}, ${width}px): every control has an accessible name`, badNames.length === 0, badNames.join());
  check(`every step (${scheme}, ${width}px): zero console errors, page errors or failed requests`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- keyboard focus follows the M3 focus ring (3px, 2px offset) and the tab bar is reachable -----------------------------------
{
  const { ctx, page } = await openApp(browser, site.url, { state: sample, step: 'seed' });
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  let seen = null;
  for (let i = 0; i < 25 && !seen; i++) {
    await page.keyboard.press('Tab');
    seen = await page.evaluate(() => { const e = document.activeElement; if (!e || !e.matches('.btn,.chip,.switch,.tab')) return null; const c = getComputedStyle(e); return { w: c.outlineWidth, o: c.outlineOffset, s: c.outlineStyle, tag: e.className }; });
  }
  check('keyboard focus on a button, chip, switch or tab draws a 3px ring', !!seen && seen.w === '3px' && seen.s === 'solid', JSON.stringify(seen));
  await page.focus('#tab-support'); await page.keyboard.press('Enter');
  check('the Enter key opens a step from the tab bar', (await st(page)).step === 'support');
  await ctx.close();
}

// ---- C18: the step bar follows the tabs pattern (one Tab stop, arrow keys, Home and End, manual activation) -------------------------
{
  const { ctx, page } = await openApp(browser, site.url, { state: sample, step: 'seed' });
  const stops = await page.$$eval('.tab', (t) => t.filter((x) => x.tabIndex === 0).map((x) => x.id));
  check('tabs: only the selected tab is a Tab stop', stops.join() === 'tab-seed', stops.join());
  await page.focus('#tab-seed');
  await page.keyboard.press('Tab');
  check('tabs: Tab leaves the tab bar after one stop', await page.evaluate(() => !document.activeElement.matches('.tab')));
  await page.focus('#tab-seed');
  const act = () => page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('ArrowRight');
  check('tabs: ArrowRight moves focus to the next tab', (await act()) === 'tab-analyze');
  check('tabs: arrow keys move focus without opening the step', (await st(page)).step === 'seed');
  await page.keyboard.press('End');
  check('tabs: End moves focus to the last tab', (await act()) === 'tab-export');
  await page.keyboard.press('ArrowRight');
  check('tabs: ArrowRight wraps from the last tab to the first', (await act()) === 'tab-seed');
  await page.keyboard.press('ArrowLeft');
  check('tabs: ArrowLeft wraps from the first tab to the last', (await act()) === 'tab-export');
  await page.keyboard.press('Home');
  check('tabs: Home moves focus to the first tab', (await act()) === 'tab-seed');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForSelector('#panel-title');
  check('tabs: Space opens the focused tab', (await st(page)).step === 'support');
  const stops2 = await page.$$eval('.tab', (t) => t.filter((x) => x.tabIndex === 0).map((x) => x.id));
  check('tabs: the Tab stop follows the selected tab', stops2.join() === 'tab-support', stops2.join());
  await ctx.close();
}
{
  const { ctx, page } = await openApp(browser, site.url, { step: 'seed' });
  await page.focus('#tab-seed'); await page.keyboard.press('ArrowRight');
  check('tabs: arrow keys skip steps that are not open yet', await page.evaluate(() => document.activeElement.id) === 'tab-seed');
  await ctx.close();
}

// ---- persistence problems degrade, they do not break ------------------------------------------------------------------------------
{
  const { ctx, page, errors } = await openApp(browser, site.url, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
  check('with browser storage blocked the page says work is not saved', /not saved|unavailable/i.test(await page.textContent('#savestate')), await page.textContent('#savestate'));
  await page.fill('#seed-input', '#336699'); await page.click('button:has-text("Use this color")'); await page.waitForSelector('text=Your seed');
  check('with storage blocked a seed can still be chosen, with no page error', (await st(page)).seed?.hex === '#336699' && errors.filter((e) => !/blocked/.test(e)).length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page, errors } = await openApp(browser, site.url, { init: () => { try { localStorage.setItem('pe.state.v1', '{"v":1,"seed":{"hex":"javascript:alert(1)","origin":"manual"}}'); } catch (e) {} } });
  check('hostile saved data in browser storage is rejected, not rendered', (await st(page)).seed === null && errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close(); site.close();
process.exit(done());
