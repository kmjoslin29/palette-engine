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

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'engine', 'index.js');
const alias = { colorparsley: path.join(root, 'build', 'stubs', 'colorparsley-hex.js') };

await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm',
  outfile: path.join(root, 'dist', 'engine.mjs'), alias, logLevel: 'error' });
await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife', globalName: 'PE',
  minify: true, target: 'es2020', outfile: path.join(root, 'dist', 'engine.iife.js'), alias, logLevel: 'error' });
console.log('bundled dist/engine.mjs and dist/engine.iife.js');
