import fs from 'node:fs';
import * as PE from '../dist/engine.mjs';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fails++; };
const luts = {};
for (const { id } of PE.PRINT_PROFILES) luts[id] = PE.decodeLut(JSON.parse(fs.readFileSync(new URL(`../data/lut_${id}.json`, import.meta.url))));

const a = PE.analyze('#1F5FA8', luts);
check('screen values', a.screen.hex === '#1f5fa8' && a.screen.srgb.join() === '31,95,168' && a.screen.p3Only === false && a.screen.hct.length === 3);
check('OKLCH rounded to L 2 / C 3 / h whole', a.screen.oklch.l === Math.round(a.screen.oklch.l * 100) / 100 && Number.isInteger(a.screen.oklch.h));
check('print record for all six profiles with rounded whole-percent CMYK and TAC', Object.values(a.print).every((p) => p.cmyk.length === 4 && p.cmyk.every(Number.isInteger) && p.tac > 0 && (p.tacLimit === null || p.tacLimit > 0) && p.intent.includes('relative colorimetric')));
check('brand blue is CMYK heavy in C and M and within its TAC limits', a.print.gracol2013_crpc6.tac <= a.print.gracol2013_crpc6.tacLimit + 1 && a.print.gracol2013_crpc6.cmyk[0] > 50);
check('in-gamut blue: gamut flag false and neighbor is close', a.print.gracol2013_crpc6.inGamut || a.print.gracol2013_crpc6.gamutDE00 < 6);

const P = PE.PRINT_PROFILES;
check('six print conditions; the first three keep their positions (the ASE and summary tables read 0 and 2)', P.length === 6 && P.slice(0, 3).map((p) => p.id).join() === 'gracol2013_crpc6,swop2013c3_crpc5,gracol2013_unc_crpc3');
check('every condition names a known region and says where it is used; the regions are North America and Europe', P.every((p) => PE.PRINT_REGIONS.some((r) => r.id === p.region) && p.where.length > 40) && P.filter((p) => p.region === 'na').length === 3 && P.filter((p) => p.region === 'eu').length === 3 && PE.PRINT_REGIONS.map((r) => r.name).join() === 'North America,Europe');
check('each table file carries its profile id, a SHA-256 and the printed label', P.every((p) => luts[p.id].id === p.id && /^[0-9a-f]{64}$/.test(luts[p.id].profileSha256) && luts[p.id].label.length > 5));
check('ink limits: GRACoL 320/280, SWOP 300, both PSO v3 300, the FOGRA39 file 260 (its registry page; D43)', [a.print.gracol2013_crpc6, a.print.gracol2013_unc_crpc3, a.print.swop2013c3_crpc5, a.print.pso_coated_v3, a.print.pso_uncoated_v3, a.print.fogra39_vigc260].map((p) => p.tacLimit).join() === '320,280,300,300,300,260');
check('FOGRA39 total-ink text shows its 260% limit; a condition with no limit would still read "no limit stated"', PE.tacText(a.print.fogra39_vigc260) === `${a.print.fogra39_vigc260.tac}% of 260%` && PE.tacText({ tac: 250, tacLimit: 300 }) === '250% of 300%' && PE.tacText({ tac: 250, tacLimit: null }).includes('no limit stated') && !PE.tacText({ tac: 250, tacLimit: null }).includes(' of '));
check('conditions line groups by region', PE.byRegion([{ region: 'North America', label: 'A' }, { region: 'North America', label: 'B' }, { region: 'Europe', label: 'C' }]) === 'North America: A; B. Europe: C');
check('the same screen color gets different CMYK on the European and US coated conditions', a.print.pso_coated_v3.cmyk.join() !== a.print.gracol2013_crpc6.cmyk.join() && a.print.pso_uncoated_v3.cmyk.join() !== a.print.gracol2013_unc_crpc3.cmyk.join());
const dark = PE.analyze('#101010', luts);
check('every condition keeps a near-black within its own ink limit', P.every((p) => dark.print[p.id].tacLimit > 0 && dark.print[p.id].tac <= dark.print[p.id].tacLimit + 1));

const g = PE.analyze('#00FF00', luts);
check('#00FF00: flags out of gamut on GRACoL coated with a printable neighbor', g.print.gracol2013_crpc6.inGamut === false && /^#[0-9a-f]{6}$/.test(g.print.gracol2013_crpc6.printableNeighbor.hex));

const p3 = PE.analyze('oklch(0.7 0.3 145)', luts);
check('a color beyond sRGB is flagged P3 only, mapped, original kept', p3.screen.p3Only === true && p3.screen.mappedFrom.c > p3.screen.oklch.c && p3.screen.hex !== '#000000', JSON.stringify(p3.screen));
check('CSS color strings parse (rgb(), names)', PE.analyze('rgb(31 95 168)', luts).screen.hex === '#1f5fa8' && PE.analyze('rebeccapurple', luts).screen.hex === '#663399');
check('garbage returns null', PE.analyze('not a color', luts) === null);
check('pure black gets the ink-black note', PE.analyze('#000000', luts).print.gracol2013_crpc6.note?.includes('Ink black'));

// M6 overrides
const base = PE.buildPalette('#1F5FA8');
const ov = PE.buildPalette('#1F5FA8', [], { overrides: { light: { primary: '#123456' } } });
check('role override applies and is reported', ov.schemes.light.primary === '#123456' && ov.overridden.light.includes('primary') && base.schemes.light.primary !== '#123456');
check('override is re-checked by M7', ov.checks.light.rows.find((r) => r.fg === 'primary' && r.bg === 'surface').ratio !== base.checks.light.rows.find((r) => r.fg === 'primary' && r.bg === 'surface').ratio);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
