// Phase 6 end-to-end tests: a designer's whole session in the real page (headless Chromium), both entry paths, every step,
// light and dark, phone width, keyboard focus, reload. Gate: zero page errors, console errors or failed requests.
// Run after: node build/bundle.mjs && node build/make_page.mjs
import fs from 'node:fs';
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
  check('the header frames the tool as a reference and support tool, not a brand generator, and says what is calculated and what is approximate (decision 222)', await page.$eval('header.top .scope', (e) => { const t = e.textContent; return /reference and support tool, not a brand generator/.test(t) && /Screen and contrast values are calculated/.test(t) && /research averages/.test(t) && /print and spot values are approximations/.test(t); }));
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
  check('picks go to Secondary 1 by default', /A pick fills Secondary 1/.test(await panelText(page)));
  await page.click('button:has-text("Use for Secondary 1")');
  check('a harmony candidate becomes the secondary, with its lens as origin', (await st(page)).supporting.secondary[0].origin.startsWith('harmony:'));
  await page.fill('#manual-tertiary', '#2E7D32'); await page.press('#manual-tertiary', 'Enter');
  check('a manual color becomes the tertiary', (await st(page)).supporting.tertiary[0]?.hex === '#2e7d32');
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
  const apcaVer = JSON.parse(fs.readFileSync('node_modules/apca-w3/package.json', 'utf8')).version;
  check('the APCA section says which apca-w3 computed it, and that it is used for web content only', tc.includes(`apca-w3 ${apcaVer}`) && tc.includes('for web-content contrast only'), tc.slice(tc.indexOf('APCA (advisory)'), tc.indexOf('APCA (advisory)') + 400));
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
  await goto(page, 'support'); await page.click('button:has-text("Use for Secondary 1")');
  const rem = await resolveFailures(page);
  check('path A reaches an exportable palette', rem === 0);
  await goto(page, 'export');
  check('path A: export buttons are enabled', await page.$$eval('#panel button[id^="exp-"]', (b) => b.every((x) => !x.disabled)));
  const pdf = await download(page, '#exp-pdf');
  check('path A: the PDF downloads', pdf.bytes.slice(0, 5).toString() === '%PDF-');
  check('path A: zero console errors, page errors or failed requests', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- Path C: I have a palette (D44): enter an existing seven-color palette, review it, change it --------------------------------
{
  const { ctx, page, errors } = await openApp(browser, site.url);
  await page.click('button:has-text("I have a palette")');
  await page.fill('#pal-primary', 'Kiln Terracotta #B5532A');
  await page.fill('#pal-secondary-0', 'Harbour Teal #0083A8');
  for (const [tier, vals] of [['secondary', ['#F2C14E', 'Oat, #E8DCC4']], ['tertiary', ['Plum oklch(0.45 0.12 330)', 'not a color']]]) {
    for (const v of vals) { await page.click(`button:has-text("Add a ${tier} color")`); const n = await page.$$eval(`input[id^="pal-${tier}-"]`, (l) => l.length); await page.fill(`#pal-${tier}-${n - 1}`, v); }
  }
  await page.fill('#pal-tertiary-0', 'Fern Green #5B7F3A');
  check('palette entry: no fourth field can be added to a tier', (await page.$$('button:has-text("Add a secondary color")')).length === 0 && (await page.$$eval('input[id^="pal-secondary-"]', (l) => l.length)) === 3);
  await page.click('button:has-text("Use this palette")');
  check('palette entry: an unreadable color is flagged on its own field and nothing is set', (await page.$eval('#pal-tertiary-2', (e) => e.closest('.field').classList.contains('err'))) && (await st(page)).seed === null);
  await page.fill('#pal-tertiary-2', '#C2185B'); await page.click('button:has-text("Use this palette")');
  await page.waitForSelector('text=Your seed');
  let s = await st(page);
  check('palette entry: the primary becomes the seed with its name', s.seed.hex === '#b5532a' && s.seed.name === 'Kiln Terracotta' && s.seed.origin === 'manual');
  check('palette entry: three secondary and three tertiary colors, in order, with names split from colors', s.supporting.secondary.map((x) => x.hex).join() === '#0083a8,#f2c14e,#e8dcc4' && s.supporting.tertiary.map((x) => x.hex).join() === '#5b7f3a,#793974,#c2185b' && s.supporting.secondary[2].name === 'Oat' && s.supporting.tertiary[1].name === 'Plum' && !('name' in s.supporting.secondary[1]));
  check('palette entry: a typed hex is never flagged as beyond sRGB', !s.supporting.secondary[0].mappedFrom && !s.seed.mappedFrom);
  await page.fill('#pal-primary', '#1F5FA8'); await page.click('button:has-text("Use this palette")');
  check('palette entry: replacing existing colors asks first', /This replaces your current colors/.test(await panelText(page)) && (await st(page)).seed.hex === '#b5532a');
  await page.click('button:has-text("Cancel")'); await page.fill('#pal-primary', 'Kiln Terracotta #B5532A');

  await page.click('button:has-text("Continue to analysis")'); await page.waitForSelector('text=Analyze the palette');
  let t = await panelText(page);
  check('Analyze: every color at a glance, seven rows, with CMYK, gamut, contrast and a color-blind verdict', /Every color at a glance \(7\)/.test(t) && (await page.$eval('#panel table', (tb) => tb.querySelectorAll('tbody tr').length)) === 7);
  check('Analyze: colors that collapse under color-blind views are named', /Close under color-blind simulation/.test(t) && /Close to/.test(t));
  await page.click('#panel button[aria-label="Show details for Tertiary 2"]');
  t = await panelText(page);
  check('Analyze: Details moves the detail view to that color and focuses its heading', (await st(page)).focus === 'tertiary2' && /Details: Tertiary 2 · Plum/.test(t) && (await page.evaluate(() => document.activeElement.id)) === 'detail-title' && t.includes('#793974'));
  check('Analyze: the spot scorer names the color it scores against', /scored against Tertiary 2/.test(t));
  await page.click('#panel [aria-label="Color to analyze"] button:has-text("Secondary 3")');
  check('Analyze: the switcher shows one pressed color', (await st(page)).focus === 'secondary3' && (await page.$$eval('#panel [aria-label="Color to analyze"] button[aria-pressed="true"]', (b) => b.length)) === 1);

  await goto(page, 'support');
  t = await panelText(page);
  check('Supporting: both tiers are full (3 of 3) and say which colors set the core roles', (t.match(/3 of 3/g) || []).length === 2 && /Sets Material's secondary role palette/.test(t) && /Extended color: its own tertiary3/.test(t));
  check('Supporting: no Beyond-sRGB warning for colors typed as hex', !/Beyond sRGB\./.test(t));
  await page.check('#target-tertiary2');
  check('Supporting: a candidate goes to the slot chosen under Send picks to', /A pick replaces Tertiary 2 \(#793974\)/.test(await panelText(page)) && (await page.$$('button:has-text("Use for Tertiary 2")')).length > 0);
  await page.click('article.card >> nth=0 >> button:has-text("Use for Tertiary 2")');
  s = await st(page);
  check('Supporting: the pick replaces that slot and keeps its name', s.supporting.tertiary[1].origin.startsWith('harmony:') && s.supporting.tertiary[1].name === 'Plum' && s.supporting.tertiary.length === 3);
  const harm = page.locator('.slot:has(h3:text-is("Secondary 2")) [role="switch"]:has-text("Harmonize")');
  await harm.click();
  t = await panelText(page);
  check('Supporting: harmonize is per color, says what it moves and keeps the brand token', (await st(page)).supporting.secondary[1].harmonize === true && /Roles are built from #[0-9A-F]{6}: hue [-+]?\d/.test(t) && /The brand token keeps #F2C14E/.test(t));
  check('Supporting: Secondary 1 and Tertiary 1 have no harmonize switch', (await page.$$('.slot:has(h3:text-is("Secondary 1")) [role="switch"]:has-text("armoniz")')).length === 0);
  await page.click('.slot:has(h3:text-is("Secondary 2")) button:has-text("Move up to Secondary 1")');
  s = await st(page);
  check('Supporting: Move up swaps the two colors', s.supporting.secondary[0].hex === '#f2c14e' && s.supporting.secondary[1].hex === '#0083a8');
  await page.click('.slot:has(h3:text-is("Secondary 1")) button:has-text("Remove")');
  s = await st(page);
  check('Supporting: removing Secondary 1 moves the next color up and announces it', s.supporting.secondary.map((x) => x.hex).join() === '#0083a8,#e8dcc4' && /moved up to Secondary 1/.test(await page.textContent('#live')));
  await page.click('button:has-text("Add a secondary color")');
  await page.fill('#manual-secondary3', '#F2C14E'); await page.press('#manual-secondary3', 'Enter');
  check('Supporting: Add a secondary color fills the next slot', (await st(page)).supporting.secondary.length === 3 && (await st(page)).supporting.secondary[2].hex === '#f2c14e');
  await page.click('.slot:has(h3:text-is("Tertiary 3")) [role="switch"]:has-text("Lock")');
  check('Supporting: a locked color cannot be removed, moved or harmonized', await page.$eval('.slot:has(h3:text-is("Tertiary 3"))', (el) => [...el.querySelectorAll('button')].filter((b) => /Remove|Move up|Set/.test(b.textContent) || /armoniz/.test(b.textContent)).every((b) => b.disabled)));

  await goto(page, 'palette');
  t = await panelText(page);
  check('Palette: extended colors have their own role groups and tonal palettes', /Secondary 2 \(extended\)/.test(t) && /Tertiary 3 \(extended\)/.test(t) && (await page.$$('.role:has(span:text-is("onSecondary3Container"))')).length === 1 && (await page.$$('[aria-label="tertiary3 tonal palette"]')).length === 1);
  // on-color set to the role color itself (1:1), so the pair must fail
  const sec2 = (await page.$eval('.role:has(span:text-is("secondary2")) .mono.muted', (e) => e.textContent)).slice(0, 7).toLowerCase();
  await page.click('.role:has(span:text-is("onSecondary2")) button:has-text("Override")'); await page.fill('#ov-hex', sec2); await page.click('button:has-text("Apply")');
  check('Palette: an extended role can be overridden, and a failure there blocks export', (await st(page)).overrides.light.onSecondary2 === sec2 && /Export blocked/.test(await panelText(page)), sec2);
  const rem = await resolveFailures(page);
  check('Palette: the extended failure can be accepted with a note', rem === 0 && Object.keys((await st(page)).accepted).some((k) => k.includes('onSecondary2')));
  await goto(page, 'checks');
  t = await panelText(page);
  check('Checks: color-blind views list the extended roles and the brand colors as entered', /secondary3/.test(t) && /Brand colors as entered/.test(t) && /Harmonized/.test(t));
  await goto(page, 'export');
  const files = await download(page, '#exp-all'); const z = readZip(files.bytes); const names = Object.keys(z);
  const tok = JSON.parse(z[names.find((n) => n.endsWith('-design-tokens.json'))].toString());
  const css = z[names.find((n) => n.endsWith('-colors.css'))].toString();
  check('Export: tokens and CSS carry the extended roles and brand colors', tok.color.role.onTertiary3Container && tok.color.brand.secondary3 && /--color-role-on-secondary2-container/.test(css) && /--color-brand-tertiary3/.test(css));
  const proj = PE.parseProject(z[names.find((n) => n.endsWith('.palette-project.json'))].toString());
  check('Export: the project file reloads with all seven colors, the override and the accepted note', proj.ok && proj.state.supporting.secondary.length === 3 && proj.state.supporting.tertiary.length === 3 && proj.state.overrides.light.onSecondary2 === sec2 && Object.keys(proj.state.accepted).some((k) => k.includes('onSecondary2')));
  check('path C: zero console errors, page errors or failed requests', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- review fixes for pe-update62: notes and overrides follow the color; locks are respected ------------------------------
{
  const base = PE.defaultState();
  const m = (hex, extra) => ({ hex, origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null, ...(extra || {}) });
  base.seed = { hex: '#1f5fa8', origin: 'manual', tier: null, rationale: '', locked: false };
  base.supporting.secondary = [m('#d9822b'), m('#0083a8'), m('#f2c14e')];
  base.overrides.light.onSecondary2 = '#0083a8';
  base.accepted['light|onSecondary2|secondary2|text'] = 'Note written about the teal.';
  base.accepted['light|onSecondary3|secondary3|text'] = 'Note written about the gold.';
  base.focus = 'secondary3'; base.target = 'secondary3';
  const { ctx, page, errors } = await openApp(browser, site.url, { state: base, step: 'support' });
  await page.click('.slot:has(h3:text-is("Secondary 1")) button:has-text("Remove")');
  let s = await st(page);
  check('review: after Remove, an override moves with its color (teal is now Secondary 1)', s.overrides.light.onSecondary === '#0083a8' && !('onSecondary2' in s.overrides.light), JSON.stringify(s.overrides));
  check('review: after Remove, accepted notes move with their colors', s.accepted['light|onSecondary|secondary|text'] === 'Note written about the teal.' && s.accepted['light|onSecondary2|secondary2|text'] === 'Note written about the gold.' && !('light|onSecondary3|secondary3|text' in s.accepted), JSON.stringify(s.accepted));
  check('review: the Analyze focus and the pick target follow the color', s.focus === 'secondary2' && s.target === 'secondary2', `${s.focus} ${s.target}`);
  await page.click('button:has-text("Add a secondary color")'); await page.fill('#manual-secondary3', '#7a4fa0'); await page.press('#manual-secondary3', 'Enter');
  s = await st(page);
  check('review: a newly added color inherits no override or note from a removed one', !Object.keys(s.overrides.light).some((r) => /3/.test(r)) && !Object.keys(s.accepted).some((k) => /3/.test(k)));
  await page.click('.slot:has(h3:text-is("Secondary 2")) button:has-text("Move up")');
  s = await st(page);
  check('review: Move up carries notes with the colors', s.accepted['light|onSecondary|secondary|text'] === 'Note written about the gold.' && s.accepted['light|onSecondary2|secondary2|text'] === 'Note written about the teal.');
  await page.click('.slot:has(h3:text-is("Secondary 3")) [role="switch"]:has-text("Lock")');
  check('review: a color cannot be removed while a locked color below it would move up', await page.$eval('.slot:has(h3:text-is("Secondary 1")) button:text-is("Remove")', (b) => b.disabled) && await page.$eval('.slot:has(h3:text-is("Secondary 2")) button:text-is("Remove")', (b) => b.disabled) && !(await page.$eval('.slot:has(h3:text-is("Secondary 3")) button:text-is("Remove")', (b) => b.disabled === false)));
  // a seed locked while the replace question is open cannot be replaced
  await goto(page, 'seed'); await page.click('button:has-text("I have a palette")');
  await page.fill('#pal-primary', '#B5532A');
  check('review: Use this palette is refused while any color is locked', (await page.$eval('button:has-text("Use this palette")', (b) => b.disabled)) && /A color is locked/.test(await panelText(page)) && (await st(page)).seed.hex === '#1f5fa8');
  check('review: palette-entry fields cap their length', (await page.getAttribute('#pal-primary', 'maxlength')) === '120');
  check('review fixes: zero console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  // a seed that gets locked after the replace question opened is still protected
  const base = PE.defaultState();
  base.seed = { hex: '#1f5fa8', origin: 'manual', tier: null, rationale: '', locked: false }; base.path = 'palette';
  base.paletteInput = { primary: '#B5532A', secondary: ['#0083A8', 'bad', 'bad too'], tertiary: [''] };
  const { ctx, page } = await openApp(browser, site.url, { state: base, step: 'seed' });
  await page.click('button:has-text("Use this palette")');
  check('review: errors show on the rows that hold them (a word like "bad" is not read as the hex #BBAADD)', await page.$eval('#pal-secondary-1', (e) => e.closest('.field').classList.contains('err')) && await page.$eval('#pal-secondary-2', (e) => e.closest('.field').classList.contains('err')));
  await page.click('button[aria-label="Remove Secondary 2 (extended)"]');
  check('review: removing a row clears that tier\'s stale errors instead of shifting them', !(await page.$eval('#pal-secondary-1', (e) => e.closest('.field').classList.contains('err'))));
  await page.fill('#pal-secondary-1', '#F2C14E'); await page.click('button:has-text("Use this palette")');
  check('review: replacing existing work asks first', /Replace them/.test(await panelText(page)));
  await page.click('.slot.filled [role="switch"]');
  check('review: locking the seed while the question is open hides Replace them', (await st(page)).seed.locked === true && !/Replace them/.test(await panelText(page)));
  await ctx.close();
}

// ---- version 1 work kept in browser storage opens in the new format --------------------------------------------------------
{
  const v1 = JSON.parse(fs.readFileSync('engine/fixtures/project_v1_fernhill.json', 'utf8')).state;
  const { ctx, page, errors } = await openApp(browser, site.url, { state: v1 });
  await page.waitForSelector('#panel-title');
  const s = await st(page);
  check('a version 1 state in browser storage is restored, migrated to lists', s.v === 2 && s.seed.hex === v1.seed.hex && s.supporting.secondary.length === 1 && s.supporting.secondary[0].hex === v1.supporting.secondary.hex && /Restored/.test(await page.textContent('#savestate')));
  check('version 1 restore: zero console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- every step, light and dark, phone and desktop ---------------------------------------------------------------------------
const sample = PE.defaultState();
sample.name = 'Sweep test'; sample.seed = { hex: '#1f5fa8', origin: 'manual', tier: null, rationale: 'Sweep.', locked: false, mappedFrom: null };
sample.supporting.secondary = [{ hex: '#d9822b', origin: 'harmony:complementary', tier: 'low confidence', lens: 'complementary', offset: 180, rationale: '', locked: false },
  { hex: '#0083a8', origin: 'manual', tier: null, lens: null, offset: null, rationale: '', locked: false, name: 'Harbour Teal', harmonize: true }];
sample.supporting.tertiary = [{ hex: '#2e7d32', origin: 'manual', tier: null, lens: null, offset: null, rationale: '', locked: false },
  { hex: '#7a4fa0', origin: 'manual', tier: null, lens: null, offset: null, rationale: '', locked: true }];
sample.paletteInput = { primary: 'Harbor Blue #1F5FA8', secondary: ['#D9822B', 'Harbour Teal #0083A8'], tertiary: ['#2E7D32', '#7A4FA0'] };
sample.spot = { text: SPOT, illum: 'D50' };
sample.words = 'calm, bold'; sample.searched = true;
for (const scheme of ['light', 'dark']) for (const width of [375, 1100]) {
  const { ctx, page, errors } = await openApp(browser, site.url, { state: sample, step: 'seed', scheme, width });
  let worst = 0, audited = 0, badNames = [], fails = [];
  for (const id of STEPS) {
    await goto(page, id);
    if (id === 'seed') { // audit the palette-entry view too, then leave the words view open for the main audit
      await page.click('button:has-text("I have a palette")');
      worst = Math.max(worst, await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
      const ap = await contrastAudit(page); audited += ap.count; fails.push(...ap.fail.map((f) => `seed/palette: ${f.t}`));
      badNames.push(...(await page.$$eval('#panel button, #panel input, #panel textarea', (els) => els.filter((e) => e.type !== 'file' && !(e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.textContent.trim() || e.getAttribute('title'))).map((e) => `${e.tagName}#${e.id}`))));
      await page.click('button:has-text("I have words")');
    }
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
  // pe-update63: Lens and Send picks to are stacked radio lists (Material 3 radio buttons); the page's only chip set is Show only (multi-select)
  check('Supporting: Lens and Send picks to are radio lists, and the only chips left are the Show only filters', (await page.$$('fieldset.radios input[name="lens"]')).length === 6 && (await page.$$('fieldset.radios input[name="target"]')).length >= 2 && (await page.$$eval('#panel .chip', (c) => c.every((x) => x.closest('.stack-s').querySelector('h4')?.textContent === 'Show only'))));
  const lensBefore = (await st(page)).lens;
  await page.focus('fieldset.radios input[name="lens"]:checked'); await page.keyboard.press('ArrowDown');
  const afterKey = await page.evaluate(() => ({ id: document.activeElement.id, checked: document.activeElement.checked }));
  check('Supporting: an arrow key moves the lens, and focus stays on the chosen radio after the page redraws', (await st(page)).lens !== lensBefore && afterKey.checked && afterKey.id === `lens-${(await st(page)).lens}`, JSON.stringify(afterKey));
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineWidth + ' ' + c.outlineStyle; });
  check('Supporting: a focused radio draws the 3px focus ring', ring === '3px solid', ring);
  const box = await page.$eval('label[for="lens-analogous"]', (l) => l.getBoundingClientRect().height);
  check('Supporting: each radio row is at least 48px tall (Material 3 target size)', box >= 48, String(box));
  await goto(page, 'analyze');
  check('Analyze: the color switcher is a single-select chip set (more than five options), the only chip set on the step', (await page.$$('#panel [aria-label="Color to analyze"] .chip')).length === 5 && (await page.$$('#panel .seg[aria-label="Color to analyze"]')).length === 0 && (await page.$$('#panel .chip')).length === 5);
  await page.click('#focus-tertiary2');
  check('Analyze: a chip keeps keyboard focus after the page redraws', (await page.evaluate(() => document.activeElement.id)) === 'focus-tertiary2' && (await st(page)).focus === 'tertiary2');
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
