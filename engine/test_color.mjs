import { oklch, hexFromOklch, labD50, inSrgbGamut, mapToSrgb, normalize } from './color.js';

// M1 pass condition: hex -> OKLCH -> hex exact for 10,000 random colors.
let mismatches = [];
for (let i = 0; i < 10000; i++) {
  const bytes = [0, 0, 0].map(() => Math.floor(Math.random() * 256));
  const hex = '#' + bytes.map((v) => v.toString(16).padStart(2, '0')).join('');
  const back = hexFromOklch(oklch(hex));
  if (back.toLowerCase() !== hex.toLowerCase()) mismatches.push([hex, back]);
}
console.log(
  `hex->OKLCH->hex, 10000 random colors: ${10000 - mismatches.length}/10000 exact`,
  mismatches.length === 0 ? 'PASS' : 'FAIL'
);
if (mismatches.length) console.log('  first mismatches:', mismatches.slice(0, 5));

// Corners and achromatic colors (h can be undefined/0 at c=0) round-trip too.
const corners = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#010101', '#fefefe'];
const cornerFails = corners.filter((hex) => hexFromOklch(oklch(hex)).toLowerCase() !== hex.toLowerCase());
console.log('corner/gray round trips:', cornerFails.length === 0 ? 'PASS' : `FAIL ${cornerFails}`);

// inSrgbGamut: sRGB colors in, a clearly-outside-P3-too color out.
console.log('sRGB color inSrgbGamut:', inSrgbGamut('#1f5fa8') === true ? 'PASS' : 'FAIL');
const wild = { mode: 'oklch', l: 0.7, c: 0.5, h: 30 }; // far beyond any real gamut
console.log('wild OKLCH is NOT inSrgbGamut:', inSrgbGamut(wild) === false ? 'PASS' : 'FAIL');
const mapped = mapToSrgb(wild);
console.log('mapToSrgb brings it into gamut:', inSrgbGamut({ mode: 'oklch', ...mapped }) ? 'PASS' : 'FAIL');
// Regression (found in phase 4): mapToSrgb once returned black for every out-of-gamut color, because
// culori's toGamut returns an RGB-mode color. In gamut is not enough: L and hue must survive, chroma must shrink.
const dh = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
let mapBad = [], edgeBad = [];
for (let i = 0; i < 2000; i++) {
  const c = { mode: 'oklch', l: 0.05 + Math.random() * 0.9, c: 0.2 + Math.random() * 0.3, h: Math.random() * 360 };
  if (inSrgbGamut(c)) continue;
  const m = mapToSrgb(c);
  const hex = hexFromOklch(m);
  const mid = c.l >= 0.3 && c.l <= 0.8;
  // Measured over 20,000 colors: lightness holds everywhere (p95 drift 0.017); hue holds within 12 degrees for
  // L 0.3-0.8 and drifts up to ~40 degrees near black and white, where sRGB has almost no chroma to carry a hue.
  if (!(Math.abs(m.l - c.l) < 0.03 && m.c < c.c && inSrgbGamut(hex))) edgeBad.push([c, m, hex]);
  if (mid && !(dh(m.h, c.h) < 13)) mapBad.push([c, m, hex]);
}
console.log('mapToSrgb keeps lightness (all L) and reduces chroma (2000 random wild colors):', edgeBad.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(edgeBad.slice(0, 2)));
console.log('mapToSrgb keeps hue within 13 degrees for L 0.3-0.8:', mapBad.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(mapBad.slice(0, 2)));
console.log('mapToSrgb never returns black for a bright wild color:', hexFromOklch(mapToSrgb({ mode: 'oklch', l: 0.7, c: 0.5, h: 30 })) !== '#000000' ? 'PASS' : 'FAIL');

// labD50 sanity: white ~ L*100, a*~0, b*~0.
const w = labD50('#ffffff');
console.log('white labD50 ~ (100,0,0):', Math.abs(w.l - 100) < 0.1 && Math.abs(w.a) < 0.5 && Math.abs(w.b) < 1
  ? 'PASS' : `FAIL ${JSON.stringify(w)}`);

// normalize() shape check
const n = normalize('#1F5FA8');
console.log('normalize() shape:', n.hex === '#1f5fa8' && n.srgb.length === 3 && 'l' in n.oklch && 'l' in n.labD50
  ? 'PASS' : `FAIL ${JSON.stringify(n)}`);
