import fs from 'node:fs';
import { decodeLut } from './lut.js';
import { screenGamut, printGamut } from './gamut.js';
import { oklch, labD50 } from './color.js';

// --- Screen gamut (P3 flag) -------------------------------------------------

const inGamutColor = screenGamut(oklch('#1f5fa8'));
console.log('in-gamut sRGB color: p3Only false, hex unchanged:',
  inGamutColor.p3Only === false && inGamutColor.hex === '#1f5fa8' && inGamutColor.mappedFrom === null
    ? 'PASS' : `FAIL ${JSON.stringify(inGamutColor)}`);

const wildColor = screenGamut({ l: 0.7, c: 0.5, h: 30 }); // far beyond sRGB
console.log('wild OKLCH color: p3Only true, mapped hex is displayable, mappedFrom kept:',
  wildColor.p3Only === true && /^#[0-9a-f]{6}$/.test(wildColor.hex) && wildColor.mappedFrom?.c === 0.5
    ? 'PASS' : `FAIL ${JSON.stringify(wildColor)}`);

// Regression (found in phase 4): mapped hex was black. It must keep the color's character.
const mappedOk = wildColor.hex !== '#000000' && wildColor.oklch.l > 0.5 && Math.abs(wildColor.oklch.h - 30) < 12 && wildColor.oklch.c < 0.5;
console.log('wild OKLCH maps to a color of the same lightness and hue, not black:', mappedOk ? 'PASS' : `FAIL ${JSON.stringify(wildColor)}`);

// --- Print gamut (M3 pass condition: #00FF00 flags on GRACoL coated; grays don't) ---

const lutPath = new URL('../data/lut_gracol2013_crpc6.json', import.meta.url);
if (fs.existsSync(lutPath)) {
  const lut = decodeLut(JSON.parse(fs.readFileSync(lutPath)));

  const check = (hex, rgb01) => {
    const screenLab = labD50(hex);
    return printGamut(lut, rgb01, screenLab);
  };

  const green = check('#00ff00', [0, 1, 0]);
  console.log('#00FF00 flags out of gamut on GRACoL coated:',
    green.inGamut === false ? 'PASS' : `FAIL dE00=${green.gamutDE00}`);
  console.log('  printable neighbor:', green.printableNeighbor.hex, `ΔE00=${green.gamutDE00}`);

  const grays = ['#808080', '#c0c0c0', '#404040'];
  const grayResults = grays.map((hex) => {
    const rgb01 = hex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
    return [hex, check(hex, rgb01)];
  });
  const grayFails = grayResults.filter(([, r]) => r.inGamut === false);
  console.log('neutral grays stay in gamut:',
    grayFails.length === 0 ? 'PASS' : `FAIL ${grayFails.map(([h, r]) => `${h}(${r.gamutDE00})`)}`);
  grayResults.forEach(([hex, r]) => console.log(`  ${hex}: ΔE00=${r.gamutDE00} inGamut=${r.inGamut}`));

  const black = check('#000000', [0, 0, 0]);
  console.log('pure black flags with an explanatory note:',
    black.inGamut === false && typeof black.note === 'string' ? 'PASS' : `FAIL ${JSON.stringify(black)}`);
} else {
  console.log('SKIP print gamut tests: no LUT found at', lutPath.pathname);
}
