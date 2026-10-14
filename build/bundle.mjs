// Palette Engine — bundles the engine with esbuild.
// material-color-utilities ships extensionless imports, so Node and the browser
// can't load it directly (HANDOFF rule 6); everything that uses M6 goes through this.
//   node build/bundle.mjs        -> dist/engine.mjs (Node ESM, for tests)
//                                   dist/engine.iife.js (browser global `PE`)
// `colorparsley` (AGPL-3.0, pulled in by apca-w3 for one string-parsing function the engine never needs) is replaced
// by a hex-only module in both bundles; see build/stubs/colorparsley-hex.js and engine/test_apcastub.mjs.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'engine', 'index.js');
// The page says which apca-w3 it uses and which APCA constants those are, read from the installed package, so the text cannot go stale.
// The build fails if the package banner changes shape: that is the cue to re-read its license and notes before upgrading.
const apcaDir = path.join(root, 'node_modules', 'apca-w3');
const apcaVersion = JSON.parse(fs.readFileSync(path.join(apcaDir, 'package.json'), 'utf8')).version;
const apcaBanner = /SAPC-8, ([0-9.]+G)-series constant (\w+)/.exec(fs.readFileSync(path.join(apcaDir, 'src', 'apca-w3.js'), 'utf8'));
if (!apcaBanner) throw new Error('apca-w3: could not read the algorithm version from its source banner; re-read its license and release notes');
const define = { __APCA_VERSION__: JSON.stringify(apcaVersion), __APCA_ALGORITHM__: JSON.stringify(`${apcaBanner[1]}-${apcaBanner[2]}`) };
const alias = { colorparsley: path.join(root, 'build', 'stubs', 'colorparsley-hex.js') };

await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm',
  outfile: path.join(root, 'dist', 'engine.mjs'), alias, define, logLevel: 'error' });
await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife', globalName: 'PE',
  minify: true, target: 'es2020', outfile: path.join(root, 'dist', 'engine.iife.js'), alias, define, logLevel: 'error' });
console.log('bundled dist/engine.mjs and dist/engine.iife.js');
