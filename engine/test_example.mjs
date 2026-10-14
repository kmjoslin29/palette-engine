// The example outputs in examples/fernhill-bakery/output must be exactly what the code produces now (so they cannot go stale),
// and each one must load back with the parser for its format.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import * as PE from '../dist/engine.mjs';
import { luts, lex } from './export_fixtures.mjs';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const dir = fileURLToPath(new URL('../examples/fernhill-bakery/', import.meta.url));
const parsed = PE.parseProject(fs.readFileSync(dir + 'fernhill-bakery.palette-project.json', 'utf8'));
check('the example project file is valid', parsed.ok, parsed.errors);
const state = parsed.state, DATE = '2026-09-28';
const model = PE.buildExportModel(state, luts, { lex, date: DATE });
check('the example is exportable (its one failure is accepted with a note)', model.unresolved.length === 0 && model.accepted.length === 1, JSON.stringify(model.unresolved));
const files = await PE.buildAll(model, state, { now: `${DATE}T12:00:00.000Z` });
for (const f of files) {
  const disk = fs.readFileSync(dir + 'output/' + f.name);
  const mine = typeof f.data === 'string' ? Buffer.from(f.data) : Buffer.from(f.data);
  check(`committed ${f.name} matches a fresh build`, Buffer.compare(disk, mine) === 0, 'run: node build/make_example.mjs');
}
const z = PE.zipAll(files, model);
check('committed zip matches a fresh build', Buffer.compare(fs.readFileSync(dir + 'output/' + z.name), Buffer.from(z.data)) === 0);
check('the example uses no Pantone names: every spot name is a labeled sample', !/pantone \d|\b\d{3,4} [CU]\b/i.test(fs.readFileSync(dir + 'fernhill-bakery.palette-project.json', 'utf8')));
const ase = PE.parseAse(new Uint8Array(fs.readFileSync(dir + 'output/fernhill-bakery.ase')));
check('the example ASE reads back with its four groups', ['Screen RGB', 'Print GRACoL coated CMYK', 'Print uncoated CMYK', 'Spot approximations'].every((g) => JSON.stringify(ase).includes(g)));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
