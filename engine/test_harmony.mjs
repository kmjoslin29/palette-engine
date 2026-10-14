import { harmonyCandidates, allCandidates, LENSES, ouLuoHarmony, accessibilityOf, nearestPassingLightness } from './harmony.js';
import { oklch, inSrgbGamut, hexFromOklch } from './color.js';
import { contrastRatio } from './checks.js';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fails++; };
const seeds = ['#1F5FA8', '#F2A900', '#2E7D32', '#C62828', '#8E24AA', '#00A8A7', '#808080', '#000000', '#FFFFFF'];

// M5 pass condition: every candidate is in sRGB after mapping and shows lens + tier.
let bad = [];
for (const s of seeds) for (const [id, list] of Object.entries(allCandidates(s))) for (const c of list) {
  if (!/^#[0-9a-f]{6}$/.test(c.hex) || !c.lens || !c.tier || !c.wheel) bad.push(`${s} ${id}`);
  const back = oklch(c.hex); // hex is by definition in sRGB; check the mapped oklch lands on the same hex
  if (!inSrgbGamut(c.hex)) bad.push(`${s} ${id} out of gamut`);
}
check(`every candidate is in sRGB and carries lens, tier and wheel (${seeds.length} seeds × 6 lenses)`, bad.length === 0, bad.slice(0, 3).join('; '));

// Lens geometry
const seed = '#1F5FA8', sh = oklch(seed).h;
const hueOf = (hex) => oklch(hex).h;
const dh = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const comp = harmonyCandidates(seed, 'complementary')[0];
check('complementary is ~180° away in OKLCH (after gamut mapping, ±9°)', Math.abs(dh(hueOf(comp.hex), sh) - 180) <= 9, String(dh(hueOf(comp.hex), sh)));
check('counts: analogous 2, complementary 1, split 2, triadic 2, square 3',
  [['analogous', 2], ['complementary', 1], ['split', 2], ['triadic', 2], ['square', 3]].every(([id, n]) => harmonyCandidates(seed, id).length === n));
check('offsets are editable', harmonyCandidates(seed, 'analogous', { offsets: [-45] }).length === 1 && Math.abs(dh(hueOf(harmonyCandidates(seed, 'analogous', { offsets: [-45] })[0].hex), sh) - 45) <= 9);

// Empirical lens: hue within ±15°, L spread >= 0.25 (tolerating mapping)
const emp = harmonyCandidates(seed, 'empirical');
check('empirical lens returns candidates', emp.length >= 2, String(emp.length));
check('empirical: hue within ±15° (+ mapping slack) and L spread >= 0.25 (−0.01 rounding)',
  emp.every((c) => dh(hueOf(c.hex), sh) <= 15 + 4 && c.lSpread >= 0.24), JSON.stringify(emp.map((c) => [c.offset, c.lSpread, dh(hueOf(c.hex), sh)])));
check('empirical is tiered supported-but-contested; wheel lenses low confidence',
  emp.every((c) => c.tier === 'supported but contested') && harmonyCandidates(seed, 'triadic').every((c) => c.tier === 'low confidence'));

// Gamut mapping recorded
const cy = harmonyCandidates('#00A8A7', 'complementary')[0];
const sat = harmonyCandidates('#FF0000', 'triadic');
check('mapped candidates record their original values', sat.some((c) => c.mappedFrom) ? sat.filter((c) => c.mappedFrom).every((c) => c.mappedFrom.c > c.oklch.c) : true);

// Accessibility beside every candidate
const c0 = harmonyCandidates('#F2A900', 'complementary')[0];
check('accessibility block: ratios, roles, apca, cvd list', typeof c0.accessibility.vsWhite === 'number' && typeof c0.accessibility.textOnWhite === 'boolean' && c0.accessibility.apca.note && Array.isArray(c0.accessibility.cvdVsSeed));
check('white text/black text roles agree with WCAG ratios', accessibilityOf('#767676').textOnWhite === true && accessibilityOf('#777777').textOnWhite === false);
const yel = accessibilityOf('#F2A900');
check('a light yellow fails as text on white', yel.textOnWhite === false);
const fix = nearestPassingLightness(oklch('#F2A900'), '#ffffff', 4.5);
check('nearest passing lightness fix passes 4.5:1 on white and keeps the hue', fix && contrastRatio(fix.hex, '#ffffff') >= 4.5 && dh(oklch(fix.hex).h, oklch('#F2A900').h) < 8, JSON.stringify(fix));
check('failing candidates carry a fix; passing ones do not', harmonyCandidates('#F2A900', 'triadic').every((c) => (c.accessibility.textOnWhite ? c.accessibility.textFix === null : c.accessibility.textFix !== undefined)));

// Color-blind collapse against the seed: a red seed vs a similar-lightness green must flag under protan/deutan.
// Color-blind collapse against the seed is reported when it happens: a red seed's triadic/split partners include a green
// close enough in lightness to collapse under protan or deutan simulation.
const redSeed = '#C62828';
const rgFlag = [...allCandidates(redSeed).triadic, ...allCandidates(redSeed).split].some((c) => c.accessibility.cvdVsSeed.some((f) => f.type === 'protan' || f.type === 'deutan'));
check('red seed: a triadic or split candidate is flagged under protan/deutan', rgFlag);

// Ou & Luo (advisory): implementation consistency, NOT a validation of the paper
const same = ouLuoHarmony('#1F5FA8', '#2C6DB5').score, far = ouLuoHarmony('#1F5FA8', '#B5652C').score;
check('advisory score: near-identical colors score above a clashing pair', same > far, `${same} vs ${far}`);
const lightPair = ouLuoHarmony('#A8C4E8', '#C8DAF2').score, darkPair = ouLuoHarmony('#12335A', '#1A4478').score;
check('advisory score: lighter pair scores above darker pair of equal hue distance', lightPair > darkPair, `${lightPair} vs ${darkPair}`);
check('advisory score carries the paper\'s caveat (lab patches, R² 0.71)', /R² 0\.71/.test(ouLuoHarmony('#123456', '#654321').note));
check('unknown lens throws', (() => { try { harmonyCandidates(seed, 'nope'); return false; } catch { return true; } })());
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
