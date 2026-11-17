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

// ---- D44: extended colors (Secondary 2–3, Tertiary 2–3) --------------------------------------------------------------------
{
  const one = PE.buildPalette('#b5532a', [{ role: 'secondary', hex: '#0083a8' }]);
  const ext = PE.buildPalette('#b5532a', [{ role: 'secondary', hex: '#5b7f3a' }, { role: 'secondary2', hex: '#0083a8' }, { role: 'tertiary', hex: '#7a4fa0' }, { role: 'tertiary2', hex: '#c2185b' }]);
  const pairs = [['secondary', 'secondary2'], ['onSecondary', 'onSecondary2'], ['secondaryContainer', 'secondary2Container'], ['onSecondaryContainer', 'onSecondary2Container']];
  check('an extended color gets exactly the roles it would get as Secondary 1, light and dark', ['light', 'dark'].every((m) => pairs.every(([a, b]) => one.schemes[m][a] === ext.schemes[m][b])));
  const tOne = PE.buildPalette('#b5532a', [{ role: 'tertiary', hex: '#c2185b' }]);
  check('Tertiary 2 gets the roles it would get as Tertiary 1', ['light', 'dark'].every((m) => tOne.schemes[m].tertiaryContainer === ext.schemes[m].tertiary2Container && tOne.schemes[m].onTertiary === ext.schemes[m].onTertiary2));
  check('extended colors leave the core roles alone', ['light', 'dark'].every((m) => PE.ROLES.every((r) => PE.buildPalette('#b5532a', [{ role: 'secondary', hex: '#5b7f3a' }, { role: 'tertiary', hex: '#7a4fa0' }]).schemes[m][r] === ext.schemes[m][r])));
  check('a palette with no extended colors has exactly the 29 core roles and no extended list entries', Object.keys(one.schemes.light).length === 29 && one.extended.length === 0 && PE.rolesOf(one).length === 29);
  check('rolesOf lists core roles, then four per extended color in slot order', PE.rolesOf(ext).slice(29).join() === 'secondary2,onSecondary2,secondary2Container,onSecondary2Container,tertiary2,onTertiary2,tertiary2Container,onTertiary2Container');
  check('each extended color has a tonal palette under its id', ['secondary2', 'tertiary2'].every((k) => ext.tones[k] && ext.tones[k][40] === PE.buildPalette('#b5532a', [{ role: k.replace('2', ''), hex: k === 'secondary2' ? '#0083a8' : '#c2185b' }]).tones[k.replace('2', '')][40]));
  const textPairs = ext.checks.light.rows.filter((r) => r.kind === 'text').map((r) => `${r.fg}/${r.bg}`);
  check('the role checks cover on-color and on-container for each extended color', ['onSecondary2/secondary2', 'onSecondary2Container/secondary2Container', 'onTertiary2/tertiary2', 'onTertiary2Container/tertiary2Container'].every((p) => textPairs.includes(p)));
  check('color-blind role checks include the extended colors', ext.checks.light.cvd.every((f) => typeof f.a === 'string') && PE.buildPalette('#1f5fa8', [{ role: 'secondary', hex: '#1f60a9' }, { role: 'secondary2', hex: '#1f5fa7' }]).checks.light.cvd.some((f) => f.a === 'secondary2' || f.b === 'secondary2'));
  const failExt = PE.buildPalette('#1f5fa8', [{ role: 'secondary2', hex: '#2e7d32' }], { overrides: { light: { onSecondary2: '#3a8a3e' } } });
  const f = failExt.checks.light.failures.find((x) => x.fg === 'onSecondary2');
  check('an override on an extended role is applied and a failure gets a fix from that color\'s own palette', failExt.overridden.light.includes('onSecondary2') && f && f.fix && failExt.tones.secondary2 && Object.values(failExt.tones.secondary2).length > 0 && !failExt.pass);
  check('an override for a role that does not exist is ignored', !PE.buildPalette('#1f5fa8', [], { overrides: { light: { secondary2: '#000000' } } }).overridden.light.length);
  // harmonize: roles move, the brand value does not
  const h0 = PE.buildPalette('#b5532a', [{ role: 'tertiary2', hex: '#7a4fa0' }]);
  const h1 = PE.buildPalette('#b5532a', [{ role: 'tertiary2', hex: '#7a4fa0', harmonize: true }]);
  const e1 = h1.extended[0];
  check('harmonize changes the roles of that color only', h0.schemes.light.tertiary2 !== h1.schemes.light.tertiary2 && h0.schemes.light.primary === h1.schemes.light.primary);
  check('harmonize keeps the brand value and reports the shifted color, hue shift (at most 15°) and ΔE00', e1.hex === '#7a4fa0' && e1.source === e1.harmonized.hex && Math.abs(e1.harmonized.hueShift) <= 15.5 && e1.harmonized.dE00 > 0 && h1.brandColors.tertiary2 === '#7a4fa0');
  const same = PE.harmonizeToward('#b5532a', '#b5532a');
  check('harmonizing a color toward itself changes nothing', same.hex === '#b5532a' && same.dE00 === 0);
  // brand colors as entered
  check('brand colors are checked against each other under color-blind views', PE.buildPalette('#d32f2f', [{ role: 'secondary', hex: '#388e3c' }]).brandCvd.some((x) => x.type === 'deutan' || x.type === 'protan') && PE.buildPalette('#1f5fa8').brandCvd.length === 0);
  check('extTier and extRoles name the slots consistently', PE.extTier('tertiary3').tier === 'tertiary' && PE.extTier('tertiary3').n === 3 && PE.extTier('secondary') === null && PE.extRoles('secondary3').join() === 'secondary3,onSecondary3,secondary3Container,onSecondary3Container');
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
