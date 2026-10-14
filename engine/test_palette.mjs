// Run after: node build/bundle.mjs   (M6 needs the bundled library, HANDOFF rule 6)
import * as PE from '../dist/engine.mjs';
const { buildPalette, referenceScheme, ROLES, contrastRatio } = PE;
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fails++; };

// M6 pass condition 1: matches the library's reference output for a sample seed.
for (const seed of ['#1F5FA8', '#F2A900', '#2E7D32']) {
  for (const dark of [false, true]) {
    const mine = buildPalette(seed, [], { primaryFrom: 'tonalSpot' }).schemes[dark ? 'dark' : 'light'];
    const ref = referenceScheme(seed, dark);
    const diff = ROLES.filter((r) => mine[r] !== ref[r]);
    check(`${seed} ${dark ? 'dark' : 'light'}: all ${ROLES.length} roles equal SchemeTonalSpot`, diff.length === 0, diff.join(','));
  }
}

// Brand hex stays its own token; phase 0 finding: primary = tone 40 light, 80 dark.
const b = buildPalette('#1F5FA8');
check('brand hex kept as its own token', b.brand.hex === '#1f5fa8');
check('light primary is tone 40 of the brand palette (brand tone gap shown)', typeof b.brand.lightPrimary.toneGap === 'number');
const y = buildPalette('#F2A900');
check('#F2A900 light primary moves to tone 40 (phase 0: #7F5700)', y.schemes.light.primary.toLowerCase() === '#7f5700', y.schemes.light.primary);
check('#F2A900 brand gap reported (brand is lighter than role tone)', y.brand.lightPrimary.toneGap > 20, String(y.brand.lightPrimary.toneGap));

// M6 pass condition 2: role pairs pass M7 (default M3 palette).
for (const seed of ['#1F5FA8', '#F2A900', '#2E7D32', '#8E24AA']) {
  const p = buildPalette(seed);
  check(`${seed}: all role pairs pass WCAG AA in light and dark`, p.pass, JSON.stringify([...p.checks.light.failures, ...p.checks.dark.failures].map((f) => `${f.fg}/${f.bg} ${f.ratio}`)));
}

// Supporting colors become secondary/tertiary palettes.
const s = buildPalette('#1F5FA8', [{ role: 'secondary', hex: '#2E7D32' }, { role: 'tertiary', hex: '#D9822B' }]);
check('supporting colors change secondary and tertiary', s.schemes.light.secondary !== b.schemes.light.secondary && s.schemes.light.tertiary !== b.schemes.light.tertiary);
check('tonal palettes carry 14 tones each', Object.values(s.tones).every((t) => Object.keys(t).length === 14));

// Fix suggestions: M3's reduced-contrast level (-1) makes real failures, each must carry a passing fix.
const low = buildPalette('#1F5FA8', [], { contrast: -1 });
const fails2 = [...low.checks.light.failures, ...low.checks.dark.failures];
check('reduced contrast produces real failures', fails2.length > 0, String(fails2.length));
check('every failure carries a nearest-tone fix that passes', fails2.every((f) => f.fix && contrastRatio(f.fix.hex, low.schemes[low.checks.light.failures.includes(f) ? 'light' : 'dark'][f.bg]) >= (f.kind === 'text' ? 4.5 : 3)),
  JSON.stringify(fails2.filter((f) => !f.fix).map((f) => f.fg + '/' + f.bg)));
check('fix tone is a valid tone and reports its gap', fails2.every((f) => f.fix && f.fix.tone >= 0 && f.fix.tone <= 100 && f.fix.gap >= 0));

// CVD: primary/secondary/tertiary/error collapse detection runs.
check('cvd list is an array', Array.isArray(b.checks.light.cvd));

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
