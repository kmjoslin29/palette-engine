import fs from 'node:fs';
import { decodeLut, lookup } from './lut.js';
const vec = JSON.parse(fs.readFileSync(new URL('./py_vectors.json', import.meta.url)));
for (const [pid, exp] of Object.entries(vec.profiles)) {
  const lut = decodeLut(JSON.parse(fs.readFileSync(new URL(`../data/lut_${pid}.json`, import.meta.url))));
  let maxDiff = 0;
  vec.rgb8.forEach((c, i) => {
    const r = lookup(lut, c.map((x) => x / 255));
    const got = [...r.cmyk, ...r.printLab, ...r.rtLab];
    got.forEach((g, k) => { maxDiff = Math.max(maxDiff, Math.abs(g - exp.lut[i][k])); });
  });
  console.log(pid, 'colors', vec.rgb8.length, 'max |JS - Python|', maxDiff.toExponential(2), maxDiff < 1e-9 ? 'PASS' : 'FAIL');
}
