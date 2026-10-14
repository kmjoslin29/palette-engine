// Palette Engine — M6 tonal palettes and roles.
// material-color-utilities (bundled, see build/bundle.mjs) builds tonal palettes
// from the seed and the chosen supporting colors, then light and dark schemes.
// The brand hex stays a separate token; the gap to the nearest role tone is shown.
// Every role pair goes through M7 (checks.js) and each failure carries its fix:
// the nearest tone of the same palette that passes.
//
// Spec version: 2021 by default. Primary is tone 40 (light) / 80 (dark) in both
// the 2021 and 2025 specs (phase 0), but 2025 produces near-white "on" colors
// that muddy contrast reporting. `spec: '2025'` is available.

import {
  Hct, DynamicScheme, TonalPalette, MaterialDynamicColors, Variant,
  argbFromHex, hexFromArgb, SchemeTonalSpot,
} from '@material/material-color-utilities';
import { textContrast, nonTextContrast, cvdDistinctPairs } from './checks.js';

export const TONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100];
const md = new MaterialDynamicColors();

export const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh',
  'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'background', 'onBackground', 'inverseSurface', 'inverseOnSurface',
];

// Which palette each role is drawn from (for the "nearest passing tone" fix).
const PALETTE_OF = (role) => {
  const r = role.replace(/^on(?=[A-Z])/, '');
  const base = r.charAt(0).toLowerCase() + r.slice(1);
  if (/^primary/.test(base)) return 'primary';
  if (/^secondary/.test(base)) return 'secondary';
  if (/^tertiary/.test(base)) return 'tertiary';
  if (/^error/.test(base)) return 'error';
  if (/Variant$|^outline/.test(base) || /variant/i.test(base)) return 'neutralVariant';
  return 'neutral';
};

// Text pairs (fg, bg, large?) — WCAG 1.4.3. Non-text pairs — WCAG 1.4.11.
export const TEXT_PAIRS = [
  ['onPrimary', 'primary'], ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'], ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'], ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'], ['onErrorContainer', 'errorContainer'],
  ['onSurface', 'surface'], ['onSurface', 'surfaceContainer'], ['onSurface', 'surfaceContainerHigh'],
  ['onSurfaceVariant', 'surface'], ['onSurfaceVariant', 'surfaceVariant'],
  ['onBackground', 'background'], ['inverseOnSurface', 'inverseSurface'],
  ['primary', 'surface'], // brand color used as link / text color on the surface
];
export const NONTEXT_PAIRS = [
  ['outline', 'surface'], // component boundaries (form fields, buttons)
  ['primary', 'surface'], // filled controls / focus ring in the primary color
];

const clamp = (v) => Math.min(100, Math.max(0, v));

function palettes(seedHct, supporting, primaryFrom) {
  const hue = seedHct.hue;
  const byRole = Object.fromEntries((supporting || []).map((s) => [s.role, Hct.fromInt(argbFromHex(s.hex))]));
  const fromColor = (h) => TonalPalette.fromHueAndChroma(h.hue, h.chroma);
  const ref = new SchemeTonalSpot(seedHct, false, 0);
  return {
    primary: primaryFrom === 'tonalSpot' ? ref.primaryPalette : TonalPalette.fromHueAndChroma(hue, seedHct.chroma),
    secondary: byRole.secondary ? fromColor(byRole.secondary) : ref.secondaryPalette,
    tertiary: byRole.tertiary ? fromColor(byRole.tertiary) : ref.tertiaryPalette,
    neutral: ref.neutralPalette,
    neutralVariant: ref.neutralVariantPalette,
    error: ref.errorPalette,
  };
}

function schemeOf(p, seedHct, isDark, spec, contrast) {
  const s = new DynamicScheme({
    sourceColorHct: seedHct, variant: Variant.TONAL_SPOT, contrastLevel: contrast, isDark, specVersion: spec,
    primaryPalette: p.primary, secondaryPalette: p.secondary, tertiaryPalette: p.tertiary,
    neutralPalette: p.neutral, neutralVariantPalette: p.neutralVariant,
  });
  const out = {};
  for (const r of ROLES) out[r] = hexFromArgb(md[r]().getArgb(s));
  return out;
}

/** Nearest tone (by |Δtone|) of `palette` whose color passes `min` against `bgHex`. */
export function nearestPassingTone(palette, fgHex, bgHex, min) {
  const cur = Hct.fromInt(argbFromHex(fgHex)).tone;
  let best = null;
  for (let t = 0; t <= 100; t += 1) {
    const hex = hexFromArgb(palette.tone(t));
    if (textContrast(hex, bgHex).ratio < min) continue;
    const gap = Math.abs(t - cur);
    if (!best || gap < best.gap) best = { tone: t, hex, gap: Math.round(gap * 10) / 10 };
  }
  return best;
}

function checkScheme(scheme, pal, colorblindRoles) {
  const failures = [], rows = [];
  for (const [fg, bg] of TEXT_PAIRS) {
    const large = false;
    const r = textContrast(scheme[fg], scheme[bg], { large });
    const row = { kind: 'text', fg, bg, ratio: r.ratio, aa: r.aa, aaa: r.aaa };
    if (!r.aa) row.fix = nearestPassingTone(pal[PALETTE_OF(fg)], scheme[fg], scheme[bg], 4.5);
    rows.push(row);
    if (!r.aa) failures.push(row);
  }
  for (const [fg, bg] of NONTEXT_PAIRS) {
    const r = nonTextContrast(scheme[fg], scheme[bg]);
    const row = { kind: 'non-text', fg, bg, ratio: r.ratio, pass: r.pass };
    if (!r.pass) row.fix = nearestPassingTone(pal[PALETTE_OF(fg)], scheme[fg], scheme[bg], 3);
    rows.push(row);
    if (!r.pass) failures.push(row);
  }
  const cvd = cvdDistinctPairs(Object.fromEntries(colorblindRoles.map((r) => [r, scheme[r]])));
  return { rows, failures, cvd, pass: failures.length === 0 };
}

/**
 * seed: brand primary hex. supporting: [{role: 'secondary'|'tertiary', hex}].
 * Returns tonal palettes, light + dark schemes, the brand token, and M7 checks.
 * opts.primaryFrom: 'seed' (default, brand hue + chroma) or 'tonalSpot' (library reference).
 */
export function buildPalette(seed, supporting = [], opts = {}) {
  const { spec = '2021', contrast = 0, primaryFrom = 'seed', overrides = {} } = opts;
  const seedHct = Hct.fromInt(argbFromHex(seed));
  const pal = palettes(seedHct, supporting, primaryFrom);
  const tones = {};
  for (const [name, p] of Object.entries(pal)) {
    tones[name] = Object.fromEntries(TONES.map((t) => [t, hexFromArgb(p.tone(t))]));
  }
  const schemes = { light: schemeOf(pal, seedHct, false, spec, contrast), dark: schemeOf(pal, seedHct, true, spec, contrast) };
  // Designer overrides ({light: {role: hex}, dark: {...}}) replace a role's color; M7 then re-checks the result.
  const applied = { light: [], dark: [] };
  for (const mode of ['light', 'dark']) for (const [role, hex] of Object.entries(overrides[mode] || {})) {
    if (ROLES.includes(role) && /^#[0-9a-f]{6}$/i.test(hex)) { schemes[mode][role] = hex.toLowerCase(); applied[mode].push(role); }
  }
  const cvdRoles = ['primary', 'secondary', 'tertiary', 'error'];
  const checks = {
    light: checkScheme(schemes.light, pal, cvdRoles),
    dark: checkScheme(schemes.dark, pal, cvdRoles),
  };
  const brandTone = seedHct.tone;
  const brand = {
    hex: seed.toLowerCase(),
    hct: { hue: Math.round(seedHct.hue), chroma: Math.round(seedHct.chroma), tone: Math.round(brandTone * 10) / 10 },
    lightPrimary: { hex: schemes.light.primary, toneGap: Math.round((brandTone - Hct.fromInt(argbFromHex(schemes.light.primary)).tone) * 10) / 10 },
    darkPrimary: { hex: schemes.dark.primary, toneGap: Math.round((brandTone - Hct.fromInt(argbFromHex(schemes.dark.primary)).tone) * 10) / 10 },
    exact: schemes.light.primary.toLowerCase() === seed.toLowerCase(),
  };
  return { spec, tones, schemes, brand, checks, overridden: applied, pass: checks.light.pass && checks.dark.pass };
}

/** HCT (CAM16 hue, chroma, L* tone) of a color, rounded for display: [hue, chroma, tone]. */
export function hctOf(hex) {
  const h = Hct.fromInt(argbFromHex(hex));
  return [Math.round(h.hue), Math.round(h.chroma), Math.round(h.tone * 10) / 10];
}

/** Library reference for the same seed (no customization), for the M6 pass condition. */
export function referenceScheme(seed, isDark = false) {
  const s = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), isDark, 0);
  const out = {};
  for (const r of ROLES) out[r] = hexFromArgb(md[r]().getArgb(s));
  return out;
}
