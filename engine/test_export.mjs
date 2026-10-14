// Phase 5 export tests: Forge Tokens JSON, DTCG 2025.10, CSS, Markdown. Every output is parsed back with a separate parser
// (JSON.parse, postcss, markdown-it) and compared with the project state and with values recomputed straight from the LUTs.
// Each checker is also run on a deliberately broken copy to prove it can fail. Run after: node build/bundle.mjs
import postcss from 'postcss';
import MarkdownIt from 'markdown-it';
import { converter } from 'culori';
import * as PE from '../dist/engine.mjs';
import { luts, lex, model, stateA, stateB, stateC, stateD } from './export_fixtures.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const HEX = /^#[0-9a-f]{6}$/;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const squash = (s) => String(s).replace(/\s+/g, '');
const toOk = converter('oklch');
const okText = (hex) => { const o = toOk(hex); return `oklch(${o.l.toFixed(2)} ${(o.c || 0).toFixed(3)} ${Math.round(o.h || 0)})`; };

const SA = stateA(), SB = stateB(), SC = stateC(), SD = stateD();
const MA = model(SA), MB = model(SB), MC = model(SC), MD = model(SD);

// ---- helpers: walk a token tree -------------------------------------------------------------------------------
function tokens(node, path = [], out = []) {
  if (node && typeof node === 'object' && '$value' in node) { out.push({ path: path.join('.'), node }); return out; }
  for (const [k, v] of Object.entries(node)) if (!k.startsWith('$') && v && typeof v === 'object') tokens(v, [...path, k], out);
  return out;
}
function nameProblems(node, path = '') { // DTCG: names must not start with $ (except properties), contain { } .
  const bad = [];
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (/[{}.]/.test(k)) bad.push(`${path}/${k}`);
    if (v && typeof v === 'object') bad.push(...nameProblems(v, `${path}/${k}`));
  }
  return bad;
}
const rgb01 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const cmykFromLut = (hex, id) => PE.roundCmyk(PE.lookup(luts[id], rgb01(hex)).cmyk);
const noBareCmyk = (node) => { let bad = false; (function w(n) { if (!n || typeof n !== 'object') return; if (n.$extensions && ('cmyk' in n.$extensions || 'rgb' in n.$extensions)) bad = true; Object.values(n).forEach(w); })(node); return !bad; };

// ==== Forge Tokens JSON ===========================================================================================
function checkForge(json, m, state, label) {
  const out = [];
  const t = JSON.parse(json);
  const pal = PE.buildPalette(state.seed.hex, ['secondary', 'tertiary'].filter((k) => state.supporting[k]).map((k) => ({ role: k, hex: state.supporting[k].hex })), { overrides: state.overrides });
  const toks = tokens(t.color).concat(tokens(t['color-dark']));
  out.push(['valid JSON with Forge root keys', typeof t.$description === 'string' && t.$version === '1.0.0' && t.color && t['color-dark']]);
  out.push(['every token is a lowercase six-digit hex with $type color', toks.length > 0 && toks.every((k) => HEX.test(k.node.$value) && k.node.$type === 'color'), toks.find((k) => !HEX.test(k.node.$value))?.path]);
  out.push(['token count: 6 palettes x 14 tones + brand + 29 roles light + 29 roles dark', toks.length === 6 * 14 + m.colors.length + 29 + 29, String(toks.length)]);
  out.push(['$themes: light -> color, dark -> color-dark, and both groups exist', t.$themes.length === 2 && t.$themes.every((x) => t[x.group] && typeof t[x.group] === 'object') && t.$themes[0].group === 'color' && t.$themes[1].group === 'color-dark']);
  out.push(['names are DTCG-legal (no { } . or leading $)', nameProblems(t).length === 0, nameProblems(t).join(',')]);
  const names = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', neutral: 'neutral', neutralVariant: 'neutral-variant', error: 'error' };
  const toneBad = [];
  for (const [k, n] of Object.entries(names)) for (const tone of PE.TONES) if (t.color[n][String(tone)].$value !== pal.tones[k][tone].toLowerCase()) toneBad.push(`${n}.${tone}`);
  out.push(['all 84 tone tokens equal a fresh buildPalette from the state', toneBad.length === 0, toneBad.join(',')]);
  const roleBad = [];
  for (const r of PE.ROLES) { if (t.color.role[r].$value !== pal.schemes.light[r].toLowerCase()) roleBad.push(`light.${r}`); if (t['color-dark'].role[r].$value !== pal.schemes.dark[r].toLowerCase()) roleBad.push(`dark.${r}`); }
  out.push(['all 58 role tokens (light and dark) equal a fresh buildPalette, overrides included', roleBad.length === 0, roleBad.join(',')]);
  out.push(['brand tokens equal the state colors', m.colors.every((c) => t.color.brand[c.slot].$value === (c.slot === 'primary' ? state.seed.hex : state.supporting[c.slot].hex).toLowerCase())]);
  out.push(['no bare $extensions.cmyk (Forge form) anywhere', noBareCmyk(t)]);
  const ext = t.color.brand.primary.$extensions['com.kwadejoslin.palette'];
  out.push(['brand extension carries rationale, lock, name and tier exactly as in the state', ext.rationale === (state.seed.rationale || '') && ext.locked === !!state.seed.locked && ext.name === m.colors[0].name && ext.tier === (state.seed.tier || null), JSON.stringify([ext.rationale, ext.locked, ext.name, ext.tier])]);
  const printBad = [];
  for (const c of m.colors) { const e = t.color.brand[c.slot].$extensions['com.kwadejoslin.palette']; for (const p of PE.PRINT_PROFILES) { const want = cmykFromLut(c.hex, p.id); if (JSON.stringify(e.print[p.id].cmyk) !== JSON.stringify(want)) printBad.push(`${c.slot}:${p.id}`); if (typeof e.print[p.id].inGamut !== 'boolean' || typeof e.print[p.id].gamutDE00 !== 'number') printBad.push(`${c.slot}:${p.id}:gamut`); } }
  out.push(['brand CMYK for all six profiles equals a direct LUT lookup, with gamut flags', printBad.length === 0, printBad.join(',')]);
  const toneCmyk = t.color.primary['40'].$extensions['com.kwadejoslin.palette'].print.gracol2013_crpc6.cmyk;
  out.push(['tone tokens carry compact print data equal to the LUT', JSON.stringify(toneCmyk) === JSON.stringify(cmykFromLut(pal.tones.primary[40], 'gracol2013_crpc6'))]);
  const root = t.$extensions['com.kwadejoslin.palette'];
  out.push(['root extension lists accepted failures with their notes, verbatim', m.accepted.every((f) => root.acceptedFailures.some((x) => x.note === f.note && x.mode === f.mode)) && root.acceptedFailures.length === m.accepted.length]);
  out.push(['root extension keeps earlier notes and role overrides', root.earlierAcceptedNotes.length === m.acceptedStale.length && root.roleOverrides.length === m.overrides.length]);
  const sp = t.color.brand.primary.$extensions['com.kwadejoslin.palette'].spot;
  out.push(['spot entries are labeled approx. with band and source', (sp.coated.length + sp.uncoated.length === 0) || [...sp.coated, ...sp.uncoated].every((x) => /\(approx\.\)$/.test(x.name) && x.band && typeof x.dE00 === 'number' && x.check === 'none')]);
  return out.map(([n, ok, d]) => [`${label}: ${n}`, ok, d]);
}
for (const [label, m, s] of [['A', MA, SA], ['B', MB, SB], ['C', MC, SC]]) for (const [n, ok, d] of checkForge(PE.forgeTokensJson(m), m, s, `Forge ${label}`)) check(n, !!ok, d);
{ // negative controls
  const t = JSON.parse(PE.forgeTokensJson(MA)); t.color.primary['40'].$value = '#12345';
  const bad = tokens(t.color).some((k) => !HEX.test(k.node.$value));
  check('control: a corrupted hex is detected by the token walker', bad);
  const u = JSON.parse(PE.forgeTokensJson(MA)); u.color.primary['40'].$extensions = { cmyk: [1, 2, 3, 4] };
  check('control: a bare $extensions.cmyk is detected', !noBareCmyk(u));
  const w = JSON.parse(PE.forgeTokensJson(MA)); w.color['bad.name'] = {};
  check('control: an illegal group name is detected', nameProblems(w).length > 0);
}
check('Forge JSON is deterministic', PE.forgeTokensJson(MA) === PE.forgeTokensJson(model(stateA())));
check('P3-only seed: brand extension records the original and the flag', (() => { const e = JSON.parse(PE.forgeTokensJson(MC)).color.brand.primary.$extensions['com.kwadejoslin.palette']; return e.screen.p3Only === true && e.screen.mappedFrom && e.screen.mappedFrom.c > 0.2; })());

// ==== DTCG 2025.10 ===============================================================================================
{
  const forge = JSON.parse(PE.forgeTokensJson(MA)), d = JSON.parse(PE.dtcgTokensJson(MA));
  const ft = tokens(forge.color).concat(tokens(forge['color-dark'])), dt = tokens(d.color).concat(tokens(d['color-dark']));
  check('DTCG: same token paths as the Forge file', JSON.stringify(ft.map((x) => x.path)) === JSON.stringify(dt.map((x) => x.path)));
  const ok = dt.every(({ node }) => node.$type === 'color' && node.$value.colorSpace === 'srgb' && Array.isArray(node.$value.components) && node.$value.components.length === 3 && node.$value.components.every((c) => typeof c === 'number' && c >= 0 && c <= 1) && node.$value.alpha === 1 && HEX.test(node.$value.hex));
  check('DTCG: every $value is {colorSpace: srgb, components 0..1, alpha, hex}', ok);
  const hexBack = (v) => '#' + v.components.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  check('DTCG: components round-trip to the hex, and the hex equals the Forge file', dt.every(({ node }, i) => hexBack(node.$value) === node.$value.hex && node.$value.hex === ft[i].node.$value));
  check('DTCG: no $version and no $themes (neither is defined by the 2025.10 format module)', !('$version' in d) && !('$themes' in d));
  check('DTCG: names are legal', nameProblems(d).length === 0);
  check('DTCG: extensions use the reverse-domain key and no bare cmyk', noBareCmyk(d) && Object.keys(d.$extensions).join() === 'com.kwadejoslin.palette');
  const broken = JSON.parse(JSON.stringify(d)); broken.color.primary['40'].$value.components[0] = 1.2;
  check('control: an out-of-range component is detected', !tokens(broken.color).every(({ node }) => node.$value.components.every((c) => c >= 0 && c <= 1)));
}

// ==== CSS ========================================================================================================
function checkCss(css, m, label) {
  const out = [];
  const root = postcss.parse(css);
  const decls = (rule) => Object.fromEntries(rule.nodes.filter((n) => n.type === 'decl' && n.prop.startsWith('--')).map((n) => [n.prop, n]));
  const rules = []; root.walkRules((r) => rules.push(r));
  const bySel = (sel) => rules.find((r) => r.selector === sel);
  const light = bySel(':root'), dark1 = bySel(':root:not([data-theme="light"])'), dark2 = bySel(':root[data-theme="dark"]');
  out.push(['rules exist: :root, prefers-color-scheme dark, [data-theme="dark"]', !!light && !!dark1 && !!dark2 && dark1.parent.type === 'atrule' && dark1.parent.params === '(prefers-color-scheme: dark)']);
  const L = decls(light), D1 = decls(dark1), D2 = decls(dark2);
  const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const pal = m.palette;
  const bad = [];
  for (const r of PE.ROLES) {
    const v = `--color-role-${kebab(r)}`;
    if (!L[v] || L[v].value !== pal.schemes.light[r]) bad.push(`light ${v}`);
    if (!D1[v] || D1[v].value !== pal.schemes.dark[r]) bad.push(`media ${v}`);
    if (!D2[v] || D2[v].value !== pal.schemes.dark[r]) bad.push(`attr ${v}`);
  }
  out.push(['all 29 roles: light on :root, dark in both dark blocks, values equal the palette', bad.length === 0, bad.join(',')]);
  out.push(['both dark blocks declare the same set of variables', JSON.stringify(Object.keys(D1)) === JSON.stringify(Object.keys(D2)) && Object.keys(D1).length === 29]);
  const toneBad = [];
  for (const [k, n] of Object.entries({ primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', neutral: 'neutral', neutralVariant: 'neutral-variant', error: 'error' })) for (const t of PE.TONES) { const v = `--color-${n}-${t}`; if (!L[v] || L[v].value !== pal.tones[k][t]) toneBad.push(v); }
  out.push(['all 84 tone variables equal the palette', toneBad.length === 0, toneBad.join(',')]);
  out.push(['brand variables equal the state colors', m.colors.every((c) => L[`--color-brand-${c.slot}`] && L[`--color-brand-${c.slot}`].value === c.hex)]);
  const all = [...Object.values(L), ...Object.values(D1), ...Object.values(D2)];
  out.push(['every value is a lowercase hex', all.every((n) => HEX.test(n.value)), all.find((n) => !HEX.test(n.value))?.prop]);
  const cbad = all.filter((n) => { const c = n.next(); return !(c && c.type === 'comment' && c.text.includes(okText(n.value))); });
  out.push(['every variable is followed by its OKLCH as a comment, recomputed with culori', cbad.length === 0, cbad[0] && `${cbad[0].prop} ${cbad[0].next()?.text}`]);
  out.push(['color-scheme is set for light and dark', light.nodes.some((n) => n.prop === 'color-scheme' && n.value === 'light') && dark1.nodes.some((n) => n.prop === 'color-scheme' && n.value === 'dark') && dark2.nodes.some((n) => n.prop === 'color-scheme' && n.value === 'dark')]);
  return out.map(([n, ok, d]) => [`CSS ${label}: ${n}`, ok, d]);
}
for (const [label, m] of [['A', MA], ['B', MB], ['C', MC]]) for (const [n, ok, d] of checkCss(PE.cssVariables(m), m, label)) check(n, !!ok, d);
{
  const css = PE.cssVariables(MA);
  check('control: a broken value is caught by the CSS checker', checkCss(css.replace(/(--color-role-primary: )#[0-9a-f]{6}/, '$1#000000'), MA, 'x').some(([, ok]) => !ok));
  const hostile = model((() => { const s = stateA(); s.name = 'x */ body{display:none} /*'; return s; })());
  check('a hostile project name cannot break out of the CSS header comment', (() => { const r = postcss.parse(PE.cssVariables(hostile)); let n = 0; r.walkRules(() => n++); return n === 3; })());
}

// ==== Markdown ===================================================================================================
const md = new MarkdownIt({ html: false });
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function checkMd(src, m, state, label) {
  const out = [];
  const html = md.render(src);
  const plain = norm(textOf(html));
  out.push(['renders with no raw HTML from designer text', !/<(script|b|img|iframe)\b/i.test(html.replace(/<blockquote>|<\/blockquote>/g, ''))]);
  const notes = [state.seed.rationale, state.supporting.secondary?.rationale, state.supporting.tertiary?.rationale, ...m.accepted.map((f) => f.note), ...m.acceptedStale.map((f) => f.note)].filter((x) => x && x.trim());
  const missing = notes.filter((n) => !squash(textOf(html)).includes(squash(n)));
  out.push([`every rationale and accepted-failure note is visible (${notes.length} checked)`, missing.length === 0, missing[0]]);
  out.push(['every color name is visible verbatim', m.colors.every((c) => squash(textOf(html)).includes(squash(c.name))), m.colors.map((c) => c.name).join('|')]);
  out.push(['each color hex is present', m.colors.every((c) => src.includes(c.hex.toUpperCase()))]);
  // tables: parse rendered <table>s back into rows
  const tables = [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)].map((t) => [...t[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => norm(textOf(c[1])))));
  const wide = tables.every((t) => t.every((r) => r.length === t[0].length));
  out.push(['every rendered table is rectangular (no cell was broken by a pipe or newline)', wide && tables.length >= 8, `${tables.length} tables`]);
  const printTables = tables.filter((t) => t[0][0] === 'Profile');
  const printBad = [];
  m.colors.forEach((c, i) => { const t = printTables[i]; if (!t) { printBad.push(`${c.slot}: none`); return; } PE.PRINT_PROFILES.forEach((p, j) => { const row = t[j + 1]; const want = cmykFromLut(c.hex, p.id).join(' / '); if (!row || row[2] !== want) printBad.push(`${c.slot}:${p.id}:${row && row[2]}!=${want}`); }); });
  out.push(['per-color print tables: CMYK for all six profiles equals a direct LUT lookup', printBad.length === 0, printBad.join(' ')]);
  const rolesT = tables.find((t) => t[0][0] === 'Role' && t[0][1] === 'Light');
  out.push(['roles table lists all 29 roles with the palette hex', !!rolesT && rolesT.length === 30 && PE.ROLES.every((r, i) => rolesT[i + 1][0] === r && rolesT[i + 1][1] === m.palette.schemes.light[r].toUpperCase() && rolesT[i + 1][3] === m.palette.schemes.dark[r].toUpperCase())]);
  const tonesT = tables.find((t) => t[0][0] === 'Tone');
  out.push(['tonal palette table has 14 tones x 6 palettes', !!tonesT && tonesT.length === 15 && tonesT[0].length === 7 && tonesT[5][1] === m.palette.tones.primary[40].toUpperCase()]);
  out.push(['evidence tier is stated for each color', m.colors.every((c) => src.includes(c.tier || "Designer's choice (no evidence tier)"))]);
  out.push(['contrast and color-blind results are stated per color', (src.match(/\*\*Accessibility\*\*/g) || []).length === m.colors.length && /On white/.test(src) && /Color-blind views/.test(src)]);
  out.push(['profile, intent and "not proofs" are stated', /GRACoL 2013 coated/.test(src) && /relative colorimetric \+ black point compensation/.test(src) && /not proofs/.test(src)]);
  out.push(['spot entries carry "(approx.)" and no Pantone data is claimed as bundled', /Pantone is a trademark/.test(src) && (!/Example .* C\b/.test(src) || /\(approx\.\)/.test(src))]);
  out.push(['accessibility decisions section names every accepted failure', m.accepted.every((f) => src.includes(`${f.mode === 'light' ? 'Light' : 'Dark'}, \`${PE.pairLabel(f)}\``))]);
  out.push(['locked colors are marked', m.colors.every((c) => src.includes(c.locked ? '**Locked:** yes' : '**Locked:** no'))]);
  return out.map(([n, ok, d]) => [`Markdown ${label}: ${n}`, ok, d]);
}
for (const [label, m, s] of [['A', MA, SA], ['B', MB, SB], ['C', MC, SC]]) for (const [n, ok, d] of checkMd(PE.markdownSpec(m), m, s, label)) check(n, !!ok, d);
{
  const src = PE.markdownSpec(MB);
  check('control: dropping a note from the Markdown is detected', checkMd(src.replace('Decorative footer text only.', 'x'), MB, SB, 'x').some(([n, ok]) => /note is visible/.test(n) && !ok));
  check('B: accepted failures show their fix and stale notes are kept', /Nearest passing tone/.test(src) && /Earlier accepted notes/.test(src) && /This pair passes now, but the note stays\./.test(src) && /Role overrides/.test(src));
  check('A: a name containing HTML and a pipe cannot add table columns or tags', !/<b>/.test(md.render(PE.markdownSpec(MA)).replace(/&lt;b&gt;/g, '')));
  check('C: the beyond-sRGB flag and the original color are stated', /P3 only/.test(PE.markdownSpec(MC)) && /oklch\(0\.70 0\.300 145\)/.test(PE.markdownSpec(MC)));
}
check('Markdown names each print condition with its usual region, and the FOGRA39 file is checked against its 260% limit', (() => { const s = PE.markdownSpec(MA); return /Usual region/.test(s) && /North America: .*GRACoL 2013 coated.*Europe: .*PSO Coated v3/.test(s) && /\| PSO Uncoated v3 \(FOGRA52\) \| Europe \|/.test(s) && /\| Coated FOGRA39L \(VIGC 260\) \| Europe \| [^|]+ \| \d+% of 260% \|/.test(s) && !/no limit stated/.test(s) && !/of null%/.test(s) && !/of undefined%/.test(s); })());
check('Markdown is deterministic', PE.markdownSpec(MA) === PE.markdownSpec(model(stateA())));

// ==== Gate =====================================================================================================
check('D: 3 unresolved failures are reported and block every exporter', MD.unresolved.length === 3 && [PE.forgeTokens, PE.dtcgTokens, PE.cssVariables, PE.markdownSpec, PE.buildAse].every((f) => { try { f(MD); return false; } catch (e) { return e instanceof PE.ExportBlockedError && e.items.length === 3; } }));
check('D: the model itself still builds (so the UI can show what is blocking)', MD.colors.length === 1 && MD.failures.length === 3);
check('B: accepting every failure with a note lifts the block', MB.unresolved.length === 0 && (() => { PE.forgeTokens(MB); return true; })());
check('a whitespace-only note does not count as accepted', (() => { const s = stateB(); s.accepted[PE.acceptKey('light', 'onSurface', 'surface', 'text')] = '   \n '; return model(s).unresolved.length === 1; })());
check('with no lookup tables the exports still build and say print is unavailable', (() => { const m = PE.buildExportModel(stateA(), {}, { lex, date: '2026-09-28' }); return m.colors[0].print === null && /lookup tables did not load/.test(PE.markdownSpec(m)) && JSON.parse(PE.forgeTokensJson(m)).color.brand.primary.$extensions['com.kwadejoslin.palette'].print === null; })());

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
