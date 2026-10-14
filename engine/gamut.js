// Palette Engine — M3 gamut flags.
// Screen: is this OKLCH color inside sRGB? If not, flag "P3 only", map it
// down for display (CSS Color 4 method, via color.js), and keep the original
// under mappedFrom (HANDOFF rule 4).
// Print: round-trip the color through an M2 LUT and flag anything the press
// can't reproduce within ΔE00 2.0, showing the printable neighbor (HANDOFF
// rule 3). Always uses de00() from de.js, never culori's differenceCiede2000
// directly — see de.js for why.

import { converter, formatHex } from 'culori';
import { inSrgbGamut, mapToSrgb, toBytes } from './color.js';
import { lookup } from './lut.js';
import { de00 } from './de.js';

const toRgb = converter('rgb');

const PRINT_GAMUT_DE00 = 2.0; // build spec §10 default: round-trip ΔE00 > 2.0 = out of gamut

/**
 * Screen gamut flag for one color. oklch = {l, c, h} (culori 'oklch' mode,
 * any precision — pass color.js's oklch() output).
 * Returns the displayable hex/srgb/oklch (mapped into sRGB if needed), the
 * p3Only flag, and — only when flagged — the original OKLCH under mappedFrom.
 */
export function screenGamut({ l, c, h }) {
  const input = { mode: 'oklch', l, c: c ?? 0, h: h ?? 0 };
  const p3Only = !inSrgbGamut(input);
  const shown = p3Only ? mapToSrgb(input) : { l, c: c ?? 0, h: h ?? 0 };
  const rgb = toRgb({ mode: 'oklch', ...shown });
  return {
    hex: formatHex(rgb),
    srgb: toBytes(rgb),
    oklch: shown,
    p3Only,
    mappedFrom: p3Only ? { l, c: c ?? 0, h: h ?? 0 } : null,
  };
}

/**
 * Print gamut flag against one profile's decoded LUT (M2's decodeLut() output).
 * srgb01: [r,g,b] 0..1. screenLab: {l,a,b} D50 (this engine's hub frame, from
 * color.js's labD50()).
 * Pure black always flags (ink black sits well above screen L*0); `note`
 * explains that case so the UI isn't left showing an unexplained warning.
 */
export function printGamut(lut, srgb01, screenLab) {
  const { rtLab } = lookup(lut, srgb01);
  const rt = { l: rtLab[0], a: rtLab[1], b: rtLab[2] };
  const dE = de00(screenLab, rt);
  const outOfGamut = dE > PRINT_GAMUT_DE00;
  const isPureBlack = srgb01.every((v) => v <= 0);
  return {
    gamutDE00: Math.round(dE * 10) / 10,
    inGamut: !outOfGamut,
    printableNeighbor: {
      lab: rt,
      hex: formatHex(toRgb({ mode: 'lab', ...rt })),
    },
    note:
      isPureBlack && outOfGamut
        ? 'Ink black is lighter than screen black (L*0) — no press can lay down true black, so this flag is expected, not an error.'
        : undefined,
  };
}
