// Palette Engine — analysis record for one color (build spec §4: screen, Lab D50, print per profile).
// Glue over M1 (color), M2 (lut), M3 (gamut). Colors beyond sRGB are flagged "P3 only" and mapped
// (CSS Color 4); everything downstream, print included, uses the mapped sRGB color.

import { parse } from 'culori';
import { oklch, labD50, roundOklch, parseColor, toBytes } from './color.js';
import { screenGamut, printGamut } from './gamut.js';
import { lookup, roundCmyk, tac } from './lut.js';
import { hctOf } from './palette.js';

export const INTENT = 'relative colorimetric + black point compensation';

/** input: hex, rgb(), oklch() or any CSS color string. luts: { profileId: decodeLut(json) }. Returns null if unparseable. */
export function analyze(input, luts = {}) {
  const c = typeof input === 'string' ? parse(input.trim()) : input;
  if (!c) return null;
  const ok = oklch(c);
  const scr = screenGamut(ok);
  const rgb = parseColor(scr.hex);
  const rgb01 = [rgb.r, rgb.g, rgb.b].map((v) => Math.min(1, Math.max(0, v)));
  const lab = labD50(scr.hex);
  const print = {};
  for (const [id, lut] of Object.entries(luts)) {
    const r = lookup(lut, rgb01);
    const g = printGamut(lut, rgb01, lab);
    const cmyk = roundCmyk(r.cmyk);
    print[id] = {
      label: lut.label, intent: INTENT, cmyk, tac: Math.round(tac(r.cmyk)), tacLimit: lut.tacLimit,
      printLab: { l: r.printLab[0], a: r.printLab[1], b: r.printLab[2] },
      gamutDE00: g.gamutDE00, inGamut: g.inGamut, printableNeighbor: g.printableNeighbor, note: g.note,
    };
  }
  return {
    screen: { hex: scr.hex, srgb: scr.srgb, oklch: roundOklch(scr.oklch), p3Only: scr.p3Only,
              mappedFrom: scr.mappedFrom ? roundOklch(scr.mappedFrom) : null, hct: hctOf(scr.hex) },
    labD50: lab, print,
  };
}
