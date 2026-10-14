// Phase 5: file naming, build-all, the zip bundle and the viewer's save allow-list. Run after: node build/bundle.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as PE from '../dist/engine.mjs';
import { model, stateA, stateB, stateD } from './export_fixtures.mjs';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const dir = fileURLToPath(new URL('../tmp/test_export/', import.meta.url));
const NOW = '2026-09-28T12:00:00.000Z';
const sA = stateA(), mA = model(sA);
const files = await PE.buildAll(mA, sA, { now: NOW });

check('seven files, in listing order', files.map((f) => f.id).join() === 'forge,dtcg,css,md,ase,pdf,project');
check('names come from the project name: harbor-co-studio-…', files.every((f) => f.name.startsWith('harbor-co-studio')) && files.map((f) => f.name).join() === 'harbor-co-studio-design-tokens.json,harbor-co-studio.w3c.tokens.json,harbor-co-studio-colors.css,harbor-co-studio-color-spec.md,harbor-co-studio.ase,harbor-co-studio-color-spec-sheet.pdf,harbor-co-studio.palette-project.json', files.map((f) => f.name).join());
check('names are safe: only a-z 0-9 - . in the file name, whatever the project name', ['../../etc/passwd', 'a/b\\c:d*e?"f<g>h|i', '   ', '蓝色', 'Ünï'].every((n) => { const s = stateA(); s.name = n; const m = model(s); return PE.FORMATS.every((f) => /^[a-z0-9]+(-[a-z0-9]+)*[.a-z0-9-]*$/.test(`${m.slug}${f.suffix}`) && !/[\\/]/.test(`${m.slug}${f.suffix}`) && !`${m.slug}${f.suffix}`.startsWith('.')); }));
check('each file is what its extension says', files.every((f) => f.bytes > 0 && (typeof f.data === 'string' ? Buffer.byteLength(f.data) === f.bytes : f.data.length === f.bytes)) && String.fromCharCode(...files[4].data.slice(0, 4)) === 'ASEF' && String.fromCharCode(...files[5].data.slice(0, 5)) === '%PDF-');
check('the JSON files parse, and the project file loads back to the same state', (() => { try { JSON.parse(files[0].data); JSON.parse(files[1].data); const r = PE.parseProject(files[6].data); return r.ok && r.savedAt === NOW; } catch { return false; } })());
check('building twice gives identical bytes for every file', (await PE.buildAll(model(stateA()), stateA(), { now: NOW })).every((f, i) => Buffer.compare(Buffer.from(typeof f.data === 'string' ? f.data : f.data), Buffer.from(typeof files[i].data === 'string' ? files[i].data : files[i].data)) === 0));
check('the ASE option to include tonal palettes changes the file', (await PE.buildFile('ase', mA, sA, { aseTones: true })).bytes > files[4].bytes * 5);

// gating
for (const id of ['forge', 'dtcg', 'css', 'md', 'ase', 'pdf']) {
  let ok = false; try { await PE.buildFile(id, model(stateD()), stateD()); } catch (e) { ok = e instanceof PE.ExportBlockedError; }
  check(`blocked project: ${id} is refused`, ok);
}
check('blocked project: the project file is NOT gated (work in progress can always be saved)', (await PE.buildFile('project', model(stateD()), stateD(), { now: NOW })).bytes > 0 && PE.parseProject((await PE.buildFile('project', model(stateD()), stateD(), { now: NOW })).data).ok);
check('blocked project: buildAll refuses', await PE.buildAll(model(stateD()), stateD()).then(() => false, (e) => e instanceof PE.ExportBlockedError));

// allow-list
check('json, md, pdf, zip are saved as they are', ['a.json', 'a.md', 'a.pdf', 'a.zip', 'a.w3c.tokens.json'].every((n) => !PE.saveShape({ name: n, data: 'x' }).wrapped && PE.saveShape({ name: n, data: 'x' }).filename === n));
{
  const css = files[2], ase = files[4];
  const sc = PE.saveShape(css), sa = PE.saveShape(ase);
  check('.css and .ase are not on the viewer allow-list, so each is wrapped in <name>.zip', sc.wrapped && sc.filename === css.name + '.zip' && sa.wrapped && sa.filename === ase.name + '.zip' && PE.SAVEABLE.has('zip') && !PE.SAVEABLE.has('css') && !PE.SAVEABLE.has('ase'));
  check('every filename the tool would pass to downloads.save has an allowed extension', files.every((f) => PE.SAVEABLE.has(PE.extOf(PE.saveShape(f).filename))));
  fs.writeFileSync(dir + 'css.zip', sc.data); fs.writeFileSync(dir + 'ase.zip', sa.data);
  const t = spawnSync('unzip', ['-p', dir + 'ase.zip', ase.name]); check('the wrapped .ase comes out of its zip byte-identical', t.status === 0 && Buffer.compare(t.stdout, Buffer.from(ase.data)) === 0);
  const u = spawnSync('unzip', ['-p', dir + 'css.zip', css.name]); check('the wrapped .css comes out of its zip byte-identical', u.status === 0 && u.stdout.toString('utf8') === css.data);
}
// bundle
{
  const z = PE.zipAll(files, mA); fs.writeFileSync(dir + 'bundle.zip', z.data);
  check('bundle is a .zip with an allowed extension', PE.SAVEABLE.has(PE.extOf(z.name)) && z.name === 'harbor-co-studio-color-files.zip');
  const t = spawnSync('unzip', ['-t', dir + 'bundle.zip'], { encoding: 'utf8' }); check('unzip -t accepts the bundle', t.status === 0 && /No errors detected/.test(t.stdout), t.stdout);
  const list = spawnSync('unzip', ['-Z1', dir + 'bundle.zip'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  check('bundle holds all seven files plus README.txt', JSON.stringify(list) === JSON.stringify([...files.map((f) => f.name), 'README.txt']), list.join());
  const same = files.every((f) => { const p = spawnSync('unzip', ['-p', dir + 'bundle.zip', f.name]); return Buffer.compare(p.stdout, Buffer.from(f.data)) === 0; });
  check('every file in the bundle is byte-identical to the separate download', same);
  const readme = spawnSync('unzip', ['-p', dir + 'bundle.zip', 'README.txt'], { encoding: 'utf8' }).stdout;
  check('README says the ASE has no profile and swatches are not proofs', /no color profile/.test(readme) && /not proofs/.test(readme));
  check('the bundle is deterministic', Buffer.compare(Buffer.from(PE.zipAll(files, mA).data), Buffer.from(z.data)) === 0);
}
{ // PDF warnings pass through
  const s = stateA(); s.seed.rationale = 'wave 🌊'; const f = await PE.buildFile('pdf', model(s), s);
  check('PDF character warnings reach the caller', f.warnings.length === 1);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
