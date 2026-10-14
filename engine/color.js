// Palette Engine — M1 color math.
// Single hub for color conversion: sRGB <-> OKLCH <-> CIELAB D50, all via culori.
// Every other module gets its Lab and OKLCH numbers from here so the D50 frame
// (see de.js / HANDOFF rule 2) and the CSS Color 4 gamut-mapping method stay
// in one place instead of being reimplemented per module.

import { converter, formatHex, parse, inGamut, toGamut } from 'culori';

const toRgb = converter('rgb');
const toOklch = converter('oklch');
const toLabD50 = converter('lab'); // culori 'lab' mode = D50 (HANDOFF rule 2)

const inSrgb = inGamut('rgb');
// CSS Color 4 gamut mapping: binary-search chroma reduction in OKLCH against
// ΔEOK, clipping L/C as a last resort. This *is* "reduce OKLCH chroma" from
// the build spec's M1 row.
const mapToSrgbOklch = toGamut('rgb', 'oklch');

function coerce(input) {
  return typeof input === 'string' ? parse(input) : input;
}

/** Parse any culori-recognized input (hex string, css color, or a mode object) to an rgb color, or null. */
export function parseColor(input) {
  const c = coerce(input);
  return c ? toRgb(c) : null;
}

/** sRGB 0..1 rgb object -> [r,g,b] bytes 0..255, rounded and clamped. */
export function toBytes(rgb) {
  const clamp = (v) => Math.min(255, Math.max(0, Math.round((v ?? 0) * 255)));
  return [clamp(rgb.r), clamp(rgb.g), clamp(rgb.b)];
}

/** Raw (unrounded) OKLCH {l, c, h} for any input. h is 0 for achromatic colors (culori leaves it undefined). */
export function oklch(input) {
  const c = coerce(input);
  if (!c) return null;
  const ok = toOklch(c);
  return { l: ok.l, c: ok.c ?? 0, h: ok.h ?? 0 };
}

/** Raw (unrounded) CIELAB D50 {l, a, b} for any input. */
export function labD50(input) {
  const c = coerce(input);
  if (!c) return null;
  const lab = toLabD50(c);
  return { l: lab.l, a: lab.a, b: lab.b };
}

/** True if the color (any culori mode, e.g. an oklch object) sits inside the sRGB cube. */
export function inSrgbGamut(input) {
  const c = coerce(input);
  return c ? inSrgb(c) : false;
}

/**
 * CSS Color 4 gamut mapping: reduce OKLCH chroma toward the sRGB surface.
 * Returns OKLCH already inside sRGB; a no-op (same numbers) if already in gamut.
 * M3 (gamut.js) decides *when* to call this and records the original under
 * screen.mappedFrom — this is the mapping primitive only.
 */
export function mapToSrgb(input) {
  const c = coerce(input);
  if (!c) return null;
  // toGamut('rgb', ...) returns an RGB-mode color, not OKLCH: convert back before reading l/c/h.
  const mapped = toOklch(mapToSrgbOklch(c));
  return { l: mapped.l, c: mapped.c ?? 0, h: mapped.h ?? 0 };
}

/** OKLCH object -> hex. Not gamut-mapped; callers pass through mapToSrgb first if the color may be out of sRGB. */
export function hexFromOklch(ok) {
  return formatHex({ mode: 'oklch', l: ok.l, c: ok.c, h: ok.h });
}

/** Display rounding for OKLCH (build spec §4): L to 2dp, C to 3dp, h to the nearest whole degree. */
export function roundOklch({ l, c, h }) {
  return {
    l: Math.round(l * 100) / 100,
    c: Math.round(c * 1000) / 1000,
    h: Number.isFinite(h) ? Math.round(h) : 0,
  };
}

/**
 * Raw math normalization of any input to hex/srgb/oklch/labD50, all at full
 * precision. hex/srgb are byte-clamped for safety but NOT gamut-mapped —
 * an out-of-sRGB oklch input will clamp to the nearest cube face rather than
 * following the CSS Color 4 chroma-reduction path. Use gamut.js's
 * screenGamut() when you need the properly mapped, flagged screen record.
 */
export function normalize(input) {
  const rgb = parseColor(input);
  if (!rgb) return null;
  const c = coerce(input);
  return {
    hex: formatHex(rgb),
    srgb: toBytes(rgb),
    oklch: oklch(c),
    labD50: labD50(c),
  };
}
