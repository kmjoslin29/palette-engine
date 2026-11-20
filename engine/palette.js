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
  argbFromHex, hexFromArgb, SchemeTonalSpot, Blend,
} from '@material/material-color-utilities';
import { textContrast, nonTextContrast, cvdDistinctPairs } from './checks.js';
import { de00 } from './de.js';
import { labD50 } from './color.js';

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

// Extended colors (D44): Secondary 2–3 and Tertiary 2–3. Material 3 has one secondary and one tertiary role palette,
// so these follow Material Theme Builder's "extended colors": each gets color, on-color, container and on-container,
// light and dark. They are built through the same DynamicScheme path as Secondary 1 / Tertiary 1 (the extended palette
// is put in that tier's slot and the tier's four roles are read back), so their tones follow exactly the same rules.
export const MAX_PER_TIER = 3;
export const EXT_IDS = ['secondary2', 'secondary3', 'tertiary2', 'tertiary3'];
const capFirst = (x) => x.charAt(0).toUpperCase() + x.slice(1);
/** The four role names of an extended color, in the same order as a core tier: [x, onX, xContainer, onXContainer]. */
export const extRoles = (id) => [id, `on${capFirst(id)}`, `${id}Container`, `on${capFirst(id)}Container`];
export const EXT_ROLES = EXT_IDS.flatMap(extRoles);
/** Every role name a scheme can hold (core roles, then extended). Used to validate overrides and accepted notes. */
export const ALL_ROLES = [...ROLES, ...EXT_ROLES];
/** 'secondary2' -> { tier: 'secondary', n: 2 }. */
export const extTier = (id) => { const m = /^(secondary|tertiary)([23])$/.exec(id); return m ? { tier: m[1], n: Number(m[2]) } : null; };
const EXT_OF_ROLE = Object.fromEntries(EXT_IDS.flatMap((id) => extRoles(id).map((r) => [r, id])));

// Which palette each role is drawn from (for the "nearest passing tone" fix).
const PALETTE_OF = (role) => {
  if (EXT_OF_ROLE[role]) return EXT_OF_ROLE[role];
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
  const byRole = Object.fromEntries((supporting || []).filter((s) => s.role === 'secondary' || s.role === 'tertiary').map((s) => [s.role, Hct.fromInt(argbFromHex(s.hex))]));
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

/**
 * Harmonized version of `hex` toward the seed (Material's Blend.harmonize: hue moves toward the seed's hue by up to 15°,
 * chroma and tone kept). Returns the shifted hex with the hue shift and the ΔE00 from the original, so the cost is visible.
 */
export function harmonizeToward(hex, seedHex) {
  const out = hexFromArgb(Blend.harmonize(argbFromHex(hex), argbFromHex(seedHex)));
  const h0 = Hct.fromInt(argbFromHex(hex)).hue, h1 = Hct.fromInt(argbFromHex(out)).hue;
  let dh = h1 - h0; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return { hex: out, hueShift: Math.round(dh * 10) / 10, dE00: Math.round(de00(labD50(hex), labD50(out)) * 10) / 10 };
}

function extendedOf(item, pal, seedHct, spec, contrast) {
  const { tier, n } = extTier(item.role);
  const h = item.harmonize ? harmonizeToward(item.hex, hexFromArgb(seedHct.toInt())) : null;
  const source = h ? h.hex : item.hex.toLowerCase();
  const hct = Hct.fromInt(argbFromHex(source));
  const palette = TonalPalette.fromHueAndChroma(hct.hue, hct.chroma);
  const names = extRoles(item.role);
  const core = [tier, `on${capFirst(tier)}`, `${tier}Container`, `on${capFirst(tier)}Container`];
  const schemes = {};
  for (const isDark of [false, true]) {
    const sc = schemeOf({ ...pal, [tier]: palette }, seedHct, isDark, spec, contrast);
    schemes[isDark ? 'dark' : 'light'] = Object.fromEntries(names.map((r, i) => [r, sc[core[i]]]));
  }
  return { id: item.role, tier, n, label: `${capFirst(tier)} ${n}`, hex: item.hex.toLowerCase(), source, harmonize: !!item.harmonize,
    harmonized: h, roles: names, palette, schemes };
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

/** Text pairs for extended colors: the same two a core tier has (on-color on color, on-container on container). */
export const extTextPairs = (id) => { const [c, on, cont, onCont] = extRoles(id); return [[on, c], [onCont, cont]]; };

function checkScheme(scheme, pal, colorblindRoles, extIds = []) {
  const failures = [], rows = [];
  for (const [fg, bg] of [...TEXT_PAIRS, ...extIds.flatMap(extTextPairs)]) {
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
 * seed: brand primary hex. supporting: [{role, hex, harmonize?}] where role is 'secondary' or 'tertiary' (Secondary 1 /
 * Tertiary 1: they set Material's secondary and tertiary role palettes) or an extended id 'secondary2', 'secondary3',
 * 'tertiary2', 'tertiary3' (D44). Returns tonal palettes, light + dark schemes (extended roles included), the brand
 * token, the extended colors, M7 checks, and a color-blind check on the brand colors themselves.
 * opts.primaryFrom: 'seed' (default, brand hue + chroma) or 'tonalSpot' (library reference).
 */
export function buildPalette(seed, supporting = [], opts = {}) {
  const { spec = '2021', contrast = 0, primaryFrom = 'seed', overrides = {} } = opts;
  const seedHct = Hct.fromInt(argbFromHex(seed));
  const pal = palettes(seedHct, supporting, primaryFrom);
  const extended = EXT_IDS.map((id) => (supporting || []).find((x) => x.role === id)).filter(Boolean).map((x) => extendedOf(x, pal, seedHct, spec, contrast));
  const allPal = { ...pal, ...Object.fromEntries(extended.map((e) => [e.id, e.palette])) };
  const tones = {};
  for (const [name, p] of Object.entries(allPal)) {
    tones[name] = Object.fromEntries(TONES.map((t) => [t, hexFromArgb(p.tone(t))]));
  }
  const schemes = { light: schemeOf(pal, seedHct, false, spec, contrast), dark: schemeOf(pal, seedHct, true, spec, contrast) };
  for (const e of extended) for (const mode of ['light', 'dark']) Object.assign(schemes[mode], e.schemes[mode]);
  // Designer overrides ({light: {role: hex}, dark: {...}}) replace a role's color; M7 then re-checks the result.
  const applied = { light: [], dark: [] };
  for (const mode of ['light', 'dark']) for (const [role, hex] of Object.entries(overrides[mode] || {})) {
    if (role in schemes[mode] && /^#[0-9a-f]{6}$/i.test(hex)) { schemes[mode][role] = hex.toLowerCase(); applied[mode].push(role); }
  }
  const extIds = extended.map((e) => e.id);
  const cvdRoles = ['primary', 'secondary', 'tertiary', ...extIds, 'error'];
  const checks = {
    light: checkScheme(schemes.light, allPal, cvdRoles, extIds),
    dark: checkScheme(schemes.dark, allPal, cvdRoles, extIds),
  };
  // The brand colors as entered (not their role tones): do any two collapse under color-blind simulation?
  const brandColors = { primary: seed.toLowerCase() };
  for (const x of supporting || []) brandColors[x.role] = x.hex.toLowerCase();
  const brandCvd = Object.keys(brandColors).length > 1 ? cvdDistinctPairs(brandColors) : [];
  const brandTone = seedHct.tone;
  const brand = {
    hex: seed.toLowerCase(),
    hct: { hue: Math.round(seedHct.hue), chroma: Math.round(seedHct.chroma), tone: Math.round(brandTone * 10) / 10 },
    lightPrimary: { hex: schemes.light.primary, toneGap: Math.round((brandTone - Hct.fromInt(argbFromHex(schemes.light.primary)).tone) * 10) / 10 },
    darkPrimary: { hex: schemes.dark.primary, toneGap: Math.round((brandTone - Hct.fromInt(argbFromHex(schemes.dark.primary)).tone) * 10) / 10 },
    exact: schemes.light.primary.toLowerCase() === seed.toLowerCase(),
  };
  const ext = extended.map(({ palette, schemes: _s, ...e }) => e);
  return { spec, tones, schemes, brand, extended: ext, brandColors, brandCvd, checks, overridden: applied, pass: checks.light.pass && checks.dark.pass };
}

/** Every role in a built palette, core first, then each extended color's four roles in slot order. */
export const rolesOf = (pal) => [...ROLES, ...(pal.extended || []).flatMap((e) => e.roles)];

/**
 * Near-neutral supporting colors (D47). A supporting color's roles keep only its hue and chroma: Material sets every role's
 * tone itself, so the color's own lightness is dropped. A gray (chroma near 0) therefore gives roles that barely differ
 * from the neutral roles, and two grays of different lightness give practically the same roles. Below this chroma the tool
 * flags the color and offers to keep it as a brand neutral instead. 10 is a design choice, not a standard: Material builds
 * its neutral and neutral-variant palettes at chroma 4 and 8, so anything under about 10 lands among them.
 */
export const NEAR_NEUTRAL_CHROMA = 10;
/** { near, chroma, tone } for a hex: near is true when HCT chroma is under NEAR_NEUTRAL_CHROMA. */
export function nearNeutral(hex) {
  const h = Hct.fromInt(argbFromHex(hex));
  return { near: h.chroma < NEAR_NEUTRAL_CHROMA, chroma: Math.round(h.chroma * 10) / 10, tone: Math.round(h.tone) };
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
