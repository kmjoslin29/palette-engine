// Rebuild the example outputs from the example project file, with the same code the web tool uses.
//   node build/bundle.mjs && node build/make_example.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import * as PE from '../dist/engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'examples/fernhill-bakery');
const rd = (p) => fs.readFileSync(path.join(root, p));
const luts = Object.fromEntries(PE.PRINT_PROFILES.map((p) => [p.id, PE.decodeLut(JSON.parse(rd(`data/lut_${p.id}.json`)))]));
const lex = JSON.parse(rd('data/lexicon.json'));
const parsed = PE.parseProject(fs.readFileSync(path.join(dir, 'fernhill-bakery.palette-project.json'), 'utf8'));
if (!parsed.ok) { console.error(parsed.errors.join('\n')); process.exit(1); }
const state = parsed.state;
const DATE = '2026-09-28'; // fixed so the example output is reproducible
const model = PE.buildExportModel(state, luts, { lex, date: DATE });
const out = path.join(dir, 'output'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const files = await PE.buildAll(model, state, { now: `${DATE}T12:00:00.000Z` });
for (const f of files) { fs.writeFileSync(path.join(out, f.name), f.data); console.log(`${f.name}  ${f.bytes} bytes${f.warnings.length ? '  warnings: ' + f.warnings.join(' ') : ''}`); }
const z = PE.zipAll(files, model); fs.writeFileSync(path.join(out, z.name), z.data); console.log(`${z.name}  ${z.data.length} bytes`);
