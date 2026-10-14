import fs from 'node:fs';
import { converter } from 'culori';
import { de00 } from './de.js';
const toLab = converter('lab'); // culori 'lab' = CIELAB D50 (CSS Color 4)
const de = de00;
const vec = JSON.parse(fs.readFileSync(new URL('./py_vectors.json', import.meta.url)));
const src = vec.profiles.gracol2013_crpc6.srcLab; // lcms sRGB -> Lab D50 (same for every profile)
let maxDE = 0, maxL = 0, maxAB = 0, worst = null;
vec.rgb8.forEach((c, i) => {
  const l = toLab({ mode: 'rgb', r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 });
  const e = de({ mode: 'lab', l: src[i][0], a: src[i][1], b: src[i][2] }, l);
  maxL = Math.max(maxL, Math.abs(l.l - src[i][0]));
  maxAB = Math.max(maxAB, Math.abs(l.a - src[i][1]), Math.abs(l.b - src[i][2]));
  if (e > maxDE) { maxDE = e; worst = { rgb: c, culori: [l.l, l.a, l.b].map((x) => +x.toFixed(3)), lcms: src[i].map((x) => +x.toFixed(3)) }; }
});
console.log('culori vs lcms sRGB->Lab D50: max dE00', maxDE.toFixed(4), 'max |dL|', maxL.toFixed(4), 'max |da|,|db|', maxAB.toFixed(4));
console.log('worst', JSON.stringify(worst));
