// Phase 5: Adobe ASE writer, zip writer. The ASE is re-read by (1) the engine's own parser, (2) the third-party ase-utils package
// and (3) an independent Python reader (build/test_ase.py). It has NOT been opened in Illustrator or InDesign (see HANDOFF).
// Run after: node build/bundle.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as PE from '../dist/engine.mjs';
import { luts, lex, model, stateA, stateB, stateC, stateD, SPOT } from './export_fixtures.mjs';
const aseUtil = createRequire(import.meta.url)('ase-util');

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const f32 = (x) => Math.fround(x);
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
const rgb01 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const MA = model(stateA()), MC = model(stateC());
const bytesA = PE.buildAse(MA);

// 1. structure
const dv = new DataView(bytesA.buffer, bytesA.byteOffset, bytesA.byteLength);
check('header: ASEF, version 1.0', String.fromCharCode(...bytesA.slice(0, 4)) === 'ASEF' && dv.getUint16(4) === 1 && dv.getUint16(6) === 0);
const groups = PE.parseAse(bytesA);
const blocks = groups.reduce((n, g) => n + 2 + g.colors.length, 0);
check('header block count equals the blocks present, and the file ends exactly at the last block', dv.getUint32(8) === blocks, `${dv.getUint32(8)} vs ${blocks}`);
check('exactly the four spec groups, in order', JSON.stringify(groups.map((g) => g.name)) === JSON.stringify(['Screen RGB', 'Print GRACoL coated CMYK', 'Print uncoated CMYK', 'Spot approximations']), groups.map((g) => g.name).join('|'));

// 2. values against the state, recomputed independently
const cols = MA.colors;
const sg = groups[0], cg = groups[1], ug = groups[2], pg = groups[3];
check('Screen RGB: one global RGB swatch per color, values = hex / 255', sg.colors.length === cols.length && sg.colors.every((c, i) => c.model === 'RGB ' && c.type === 'global' && near(c.values, rgb01(cols[i].hex).map(f32))));
const lutCmyk = (hex, id) => PE.roundCmyk(PE.lookup(luts[id], rgb01(hex)).cmyk).map((v) => f32(v / 100));
check('GRACoL coated CMYK swatches = direct LUT lookup / 100', cg.colors.every((c, i) => c.model === 'CMYK' && c.type === 'global' && near(c.values, lutCmyk(cols[i].hex, 'gracol2013_crpc6'))));
check('GRACoL uncoated CMYK swatches = direct LUT lookup / 100', ug.colors.every((c, i) => c.model === 'CMYK' && near(c.values, lutCmyk(cols[i].hex, 'gracol2013_unc_crpc3'))));
check('CMYK values are whole percents (no invented precision)', [...cg.colors, ...ug.colors].every((c) => c.values.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-4)));
check('color names are the palette names, and duplicates were made unique', sg.colors.map((c) => c.name).join('|') === cols.map((c) => c.name).join('|') && new Set(sg.colors.map((c) => c.name)).size === cols.length);
const entries = SPOT.split('\n').map((l) => l.split(',').map((s) => s.trim())).filter((p) => p.length === 4).map(([n, L, a, b]) => ({ n, lab: [L / 100, +a, +b] }));
check('spot swatches are Lab, type spot, named "… (approx.)", Lab equals the pasted values', pg.colors.length > 0 && pg.colors.every((c) => { const e = entries.find((x) => `${x.n} (approx.)` === c.name); return c.model === 'LAB ' && c.type === 'spot' && e && near(c.values, e.lab.map(f32)); }), pg.colors.map((c) => c.name).join('|'));
const best = (name) => Math.min(...cols.flatMap((c) => [...c.spot.coated, ...c.spot.uncoated]).filter((m) => m.name === name).map((m) => m.dE00));
check('spot swatches are unique, and each is within "Loose" (ΔE00 5) for at least one color', new Set(pg.colors.map((c) => c.name)).size === pg.colors.length && pg.colors.every((c) => best(c.name) <= 5));
const offered = new Set(pg.colors.map((c) => c.name));
check('a match worse than ΔE00 5 for every color is not offered as a swatch', cols.flatMap((c) => [...c.spot.coated, ...c.spot.uncoated]).filter((m) => best(m.name) > 5).every((m) => !offered.has(m.name)) && cols.flatMap((c) => [...c.spot.coated, ...c.spot.uncoated]).some((m) => best(m.name) > 5), 'fixture needs one far match');

// 3. builder output equals the plain-data contents
const want = PE.aseContents(MA);
check('parsed file equals aseContents()', JSON.stringify(groups.map((g) => [g.name, g.colors.map((c) => [c.name, c.model, c.type, c.values.map(f32)])])) === JSON.stringify(want.map((g) => [g.name, g.colors.map((c) => [c.name, c.model, c.type, c.values.map(f32)])])));

// 4. optional groups
check('no spot values pasted: the Spot group is omitted (not written empty)', PE.parseAse(PE.buildAse(MC)).map((g) => g.name).join('|') === 'Screen RGB|Print GRACoL coated CMYK|Print uncoated CMYK');
check('no lookup tables: only Screen RGB is written', (() => { const m = PE.buildExportModel(stateC(), {}, { lex, date: '2026-09-28' }); return PE.parseAse(PE.buildAse(m)).map((g) => g.name).join('|') === 'Screen RGB'; })());
const tones = PE.parseAse(PE.buildAse(MA, { includeTones: true }));
check('includeTones adds 6 palettes x 14 tones to the screen and CMYK groups', tones[0].colors.length === cols.length + 84 && tones[1].colors.length === cols.length + 84 && tones[3].colors.length === pg.colors.length);
check('tone swatch values match the palette', near(tones[0].colors.find((c) => c.name === 'Primary 40').values, rgb01(MA.palette.tones.primary[40]).map(f32)));

// 5. Unicode names survive (UTF-16 surrogate pairs, CJK, accents)
{
  const s = stateA(); s.seed.name = 'Océan 蓝色 🌊'; s.supporting.secondary.name = 'A'.repeat(300);
  const m = model(s); const g = PE.parseAse(PE.buildAse(m));
  check('accents, CJK and emoji round-trip; a 300-character name is cut to 120', g[0].colors[0].name === 'Océan 蓝色 🌊' && g[0].colors[1].name.length === 120);
  fs.writeFileSync(new URL('../tmp/test_export/unicode.ase', import.meta.url), PE.buildAse(m));
  fs.writeFileSync(new URL('../tmp/test_export/unicode.json', import.meta.url), JSON.stringify(PE.aseContents(m).map((g) => ({ name: g.name, colors: g.colors.map((c) => ({ ...c, name: c.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120), type: { global: 0, spot: 1, normal: 2 }[c.type] })) }))));
}

// 6. a third-party reader (ase-utils) and an independent Python reader
{
  const d = aseUtil.read(Buffer.from(bytesA));
  const vals = (c) => (c.model === 'RGB' ? [c.r, c.g, c.b] : c.model === 'CMYK' ? [c.c, c.m, c.y, c.k] : [c.lightness, c.a, c.b]);
  const flat = d.map((g) => [g.type, g.name, g.entries.map((e) => [e.name, e.color.model, e.color.type, vals(e.color).map(f32)])]);
  const mine = groups.map((g) => ['group', g.name, g.colors.map((c) => [c.name, c.model.trim(), c.type, c.values.map(f32)])]);
  check('ase-util (third-party) reads the same groups, names, models, types and values', JSON.stringify(flat) === JSON.stringify(mine), JSON.stringify(flat).slice(0, 200));
  const dir = fileURLToPath(new URL('../tmp/test_export/', import.meta.url)).replace(/\\/g, '/');
  fs.writeFileSync(dir + 'palette.ase', bytesA);
  fs.writeFileSync(dir + 'palette.json', JSON.stringify(want.map((g) => ({ name: g.name, colors: g.colors.map((c) => ({ ...c, type: { global: 0, spot: 1, normal: 2 }[c.type] })) }))));
  for (const base of ['palette', 'unicode']) {
    const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [fileURLToPath(new URL('../build/test_ase.py', import.meta.url)), dir + base + '.ase', dir + base + '.json'], { encoding: 'utf8' });
    check(`independent Python reader agrees (${base}.ase)`, r.status === 0, r.stdout + r.stderr);
  }
}

// 6b. a file this code did not write
{
  const sample = new Uint8Array(fs.readFileSync(new URL('./fixtures/third_party_sample.ase', import.meta.url))); // from the MIT-licensed adobe-swatch-exchange package (test sample)
  const g = PE.parseAse(sample);
  const r = aseUtil.read(Buffer.from(sample));
  check('the engine parser reads a third-party sample (loose colors, no groups) and agrees with ase-util on the count', g.length === 1 && g[0].name === null && g[0].colors.length === r.length && r.length > 100, `${g[0].colors.length} vs ${r.length}`);
}

// 7. controls: broken files are refused
{
  const trunc = bytesA.slice(0, bytesA.length - 5); const badSig = bytesA.slice(); badSig[0] = 0x58; const badLen = bytesA.slice(); new DataView(badLen.buffer).setUint32(14, 9999);
  const trailing = new Uint8Array([...bytesA, 0]); const badCount = bytesA.slice(); new DataView(badCount.buffer).setUint32(8, blocks + 1);
  for (const [n, b] of [['truncated', trunc], ['bad signature', badSig], ['bad block length', badLen], ['trailing byte', trailing], ['wrong block count', badCount]]) check(`control: parser refuses a ${n} file`, (() => { try { PE.parseAse(b); return false; } catch (e) { return /^ASE:|RangeError/.test(e.name === 'RangeError' ? 'RangeError' : e.message); } })());
}
check('a blocked project cannot be written as ASE', (() => { try { PE.buildAse(model(stateD())); return false; } catch (e) { return e instanceof PE.ExportBlockedError; } })());

// 8. zip
{
  const files = [{ name: 'a-tokens.json', data: PE.forgeTokensJson(MA) }, { name: 'a.ase', data: bytesA }, { name: 'ünï.md', data: PE.markdownSpec(MA) }];
  const z = PE.zipStore(files);
  const dir = fileURLToPath(new URL('../tmp/test_export/', import.meta.url)).replace(/\\/g, '/'); fs.writeFileSync(dir + 'all.zip', z);
  const t = spawnSync('unzip', ['-t', dir + 'all.zip'], { encoding: 'utf8' });
  check('unzip -t accepts the archive (CRC and structure)', t.status === 0 && /No errors detected/.test(t.stdout), t.stdout + t.stderr);
  // Write everything through the binary buffer as UTF-8, names first, so the result does not depend on the locale or on
  // print() and buffer writes being flushed in order (they are not on every runner).
  const pyCode = `import zipfile,sys,json; z=zipfile.ZipFile('${dir}all.zip'); assert z.testzip() is None; out=sys.stdout.buffer; out.write((json.dumps(sorted(z.namelist()), ensure_ascii=False)+'\\n').encode('utf-8')); out.write(z.read('a.ase')); out.flush()`;
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', pyCode], { encoding: 'buffer' });
  const nl = py.stdout ? py.stdout.indexOf(10) : -1;
  let names = null; try { names = JSON.parse(py.stdout.subarray(0, nl).toString('utf8')); } catch { /* reported below */ }
  const wantNames = ['a-tokens.json', 'a.ase', 'ünï.md'].sort();
  check('Python zipfile lists all three names and returns the ASE bytes unchanged',
    py.status === 0 && nl > 0 && JSON.stringify(names) === JSON.stringify(wantNames) && Buffer.compare(py.stdout.subarray(nl + 1), Buffer.from(bytesA)) === 0,
    `status ${py.status}, names ${JSON.stringify(names)}, stderr ${py.stderr.toString()}`);
  const bad = Buffer.from(z); bad[40] ^= 0xff; fs.writeFileSync(dir + 'bad.zip', bad);
  check('control: a corrupted archive fails unzip -t', spawnSync('unzip', ['-t', dir + 'bad.zip']).status !== 0);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
