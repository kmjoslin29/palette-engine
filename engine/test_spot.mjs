import fs from 'node:fs';
import { de00 as de } from './de.js';
import { parseEntries, score, band } from './spot.js';
const v = JSON.parse(fs.readFileSync(new URL('./de_vectors.json', import.meta.url)));
const L = ([l, a, b]) => ({ mode: 'lab', l, a, b });
let max = 0; v.A.forEach((x, i) => { max = Math.max(max, Math.abs(de(L(x), L(v.B[i])) - v.ref[i])); });
console.log('dE00 vs color-science,', v.A.length, 'pairs: max diff', max.toExponential(2), max < 1e-6 ? 'PASS' : 'FAIL');
let smax = 0; v.sharma.forEach(([x, y, r]) => { smax = Math.max(smax, Math.abs(de(L(x), L(y)) - r)); });
console.log('Sharma 2005 published pairs:', v.sharma.length, 'max diff', smax.toFixed(5), smax < 1e-4 ? 'PASS' : 'FAIL');
// Band edges follow the displayed value
console.log('bands', [0.94, 0.96, 1.96, 2.94, 3.0, 5.0, 5.04, 5.06].map((d) => `${d}->${band(d)}`).join(' | '));
// Parser + ranking on made-up entries (not real Pantone data)
const txt = `name, L, a, b\nTest Blue C, 40, 0, -45\nTest Navy C, 30, 5, -40\nTest Sky C; 60; -10; -40\nTest Blue U\t48\t-2\t-33\nTest Hex C, #1F5FA8\nNo Book, 40, 0, -45\nBad C, 140, 0, 0`;
const { entries, errors } = parseEntries(txt);
console.log('parsed', entries.map((e) => `${e.name}/${e.book}/${e.source}`).join(', '));
console.log('errors', errors.map((e) => `line ${e.line}: ${e.reason}`).join(' | '));
console.log(JSON.stringify(score({ l: 39.4, a: 0.9, b: -45.8 }, entries), (k, x) => (k === 'dE00Raw' ? undefined : x)));
const d65 = parseEntries('D65 test C, 50, 20, -30', { illuminant: 'D65' }).entries[0].lab;
console.log('D65 input adapted to D50:', [d65.l, d65.a, d65.b].map((x) => x.toFixed(2)).join(', '));
