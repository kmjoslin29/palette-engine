// Palette Engine — nearest fix for color-blind views (D49).
//
// For one existing supporting color, find the closest color (CIEDE2000 to the original) that keeps every pair it is part
// of at least ΔE00 10 apart under protan, deutan and tritan simulation (Machado et al. 2009, full severity; the D10 line):
//   - brand colors: the candidate against the primary and the other supporting colors in use;
//   - key roles: the candidate's key role (light and dark) against the other key roles (primary, secondary, tertiary,
//     the extended colors and error), built exactly as the palette builds them, without overrides.
// The hue may move at most 15° in HCT, the same limit Material's harmonize uses (D47 discussion: hue carries recognition,
// so the total distance is not capped). Lightness (HCT tone) and chroma move freely, but chroma stays at or above the
// near-neutral line (D47), so a fix never turns an accent into a gray. Only one color moves; the others stay as they are.

import { Hct, argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import { buildPalette, keyRoleOf, NEAR_NEUTRAL_CHROMA, nearNeutral } from './palette.js';
import { simulateCvd } from './checks.js';
import { de00 } from './de.js';
import { labD50 } from './color.js';
import { supportSlots } from './project.js';

export const FIX_HUE_LIMIT = 15;
const LINE = 10;
const TYPES = ['protan', 'deutan', 'tritan'];
const r1 = (x) => Math.round(x * 10) / 10;
const hueDiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

/** Lab of each color's simulation per type, so each candidate only simulates itself. */
const simLabs = (hexes) => Object.fromEntries(TYPES.map((t) => [t, hexes.map((x) => ({ id: x.id, lab: labD50(simulateCvd(x.hex, t)) }))]));

function pairsUnder(candHex, sims) {
  const out = [];
  for (const t of TYPES) {
    const me = labD50(simulateCvd(candHex, t));
    for (const o of sims[t]) { const d = de00(me, o.lab); if (d < LINE) out.push({ other: o.id, type: t, dE00: r1(d) }); }
  }
  return out;
}

/**
 * Search. Returns:
 *   { status: 'fixed', hex, dE00, hueShift, before, after }   every pair clears the line;
 *   { status: 'partial', hex, dE00, hueShift, before, after } nothing within the limit clears all; this one clears the most
 *                                                             (fewest brand-color pairs, then fewest role pairs, then closest);
 *   { status: 'none', before }                                no color within the limit does better than the original;
 *   { status: 'clear', before }                               nothing to fix: no pair involving this color is under the line;
 *   { status: 'neutral' }                                     the color is a gray; offer Treat as neutral instead;
 *   { status: 'unavailable', reason }                         no such existing color.
 * before / after: { brand: [{other, type, dE00}], roles: { light: [...], dark: [...] } } for pairs under the line.
 */
export function nearestFix(state, tier, i, { hueLimit = FIX_HUE_LIMIT } = {}) {
  const slots = supportSlots(state);
  const me = slots.find((x) => x.tier === tier && x.index === i);
  if (!me || me.stored.origin !== 'manual') return { status: 'unavailable', reason: 'Only an existing color you entered can be fixed.' };
  const orig = me.stored.hex.toLowerCase();
  if (nearNeutral(orig).near) return { status: 'neutral' };
  const seed = state.seed.hex.toLowerCase();
  const harmonize = me.index > 0 && !!me.stored.harmonize;
  // Everything else stays as it is in use now.
  const others = [{ id: 'primary', hex: seed }, ...slots.filter((x) => x !== me).map((x) => ({ id: x.id, hex: x.rec.hex }))];
  const sup = slots.map((x) => ({ role: x.id, hex: x === me ? orig : x.rec.hex, ...(x.index > 0 && x.stored.harmonize ? { harmonize: true } : {}) }));
  const pal = buildPalette(seed, sup);
  const keyIds = ['primary', 'secondary', 'tertiary', ...pal.extended.map((e) => e.id), 'error'].filter((r) => r !== me.id);
  const brandSims = simLabs(others);
  const roleSims = { light: simLabs(keyIds.map((r) => ({ id: r, hex: pal.schemes.light[r] }))), dark: simLabs(keyIds.map((r) => ({ id: r, hex: pal.schemes.dark[r] }))) };
  const roleCache = new Map();
  const rolesUnder = (hex) => {
    if (roleCache.has(hex)) return roleCache.get(hex);
    const kr = keyRoleOf(hex, me.id, seed, { harmonize });
    const v = { light: pairsUnder(kr.light, roleSims.light), dark: pairsUnder(kr.dark, roleSims.dark) };
    roleCache.set(hex, v); return v;
  };
  const report = (hex) => ({ brand: pairsUnder(hex, brandSims), roles: rolesUnder(hex) });
  const count = (r) => r.brand.length + r.roles.light.length + r.roles.dark.length;
  const before = report(orig);
  if (count(before) === 0) return { status: 'clear', before };

  const o = Hct.fromInt(argbFromHex(orig)); const oLab = labD50(orig);
  const seen = new Map();
  const consider = (h, c, t) => {
    const hex = hexFromArgb(Hct.from(((h % 360) + 360) % 360, c, t).toInt());
    if (seen.has(hex)) return;
    const a = Hct.fromInt(argbFromHex(hex));
    if (a.chroma < NEAR_NEUTRAL_CHROMA || Math.abs(hueDiff(a.hue, o.hue)) > hueLimit + 0.05) { seen.set(hex, null); return; }
    seen.set(hex, { hex, dE: de00(oLab, labD50(hex)), brand: pairsUnder(hex, brandSims), hue: a.hue, chroma: a.chroma, tone: a.tone });
  };
  // Coarse pass: hue every 3°, chroma every 4, tone every 2.
  for (let dh = -hueLimit; dh <= hueLimit; dh += 3) for (let c = NEAR_NEUTRAL_CHROMA; c <= 150; c += 4) for (let t = 4; t <= 98; t += 2) consider(o.hue + dh, c, t);
  const pick = (cands, maxRoleChecks) => {
    const ok = cands.filter((x) => x.brand.length === 0).sort((a, b) => a.dE - b.dE);
    let n = 0;
    for (const x of ok) { if (n++ >= maxRoleChecks) break; const r = rolesUnder(x.hex); if (!r.light.length && !r.dark.length) return x; }
    return null;
  };
  const live = () => [...seen.values()].filter(Boolean);
  let best = pick(live(), 600);
  // Fine pass around the best coarse result (or around the original when none passed).
  const ctr = best || { hue: o.hue, chroma: Math.max(o.chroma, NEAR_NEUTRAL_CHROMA), tone: o.tone };
  for (let dh = -3; dh <= 3; dh += 1) for (let dc = -4; dc <= 4; dc += 1) for (let dt = -2; dt <= 2; dt += 0.5) {
    const h = ctr.hue + dh; if (Math.abs(hueDiff(h, o.hue)) > hueLimit) continue;
    consider(h, Math.max(NEAR_NEUTRAL_CHROMA, ctr.chroma + dc), Math.min(99, Math.max(1, ctr.tone + dt)));
  }
  best = pick(live(), 1200) || best;
  const pack = (x, status) => {
    const after = report(x.hex);
    return { status, hex: x.hex, dE00: r1(x.dE), hueShift: r1(hueDiff(x.hue, o.hue)), before, after };
  };
  if (best) return pack(best, 'fixed');
  // Nothing clears every pair. Rank: fewer brand-color pairs first (the color as printed and in the logo), then fewer
  // role pairs, then the closest. Offered only if it beats the original on that order.
  const key = (b, r, d) => [b, r, d];
  const better = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const ranked = live().sort((a, b) => a.brand.length - b.brand.length || a.dE - b.dE).slice(0, 400);
  let top = null; let topK = null;
  for (const x of ranked) { const r = rolesUnder(x.hex); const k = key(x.brand.length, r.light.length + r.dark.length, x.dE); if (!topK || better(k, topK) < 0) { top = x; topK = k; } }
  const origK = key(before.brand.length, before.roles.light.length + before.roles.dark.length, 0);
  if (!top || better([topK[0], topK[1], 0], origK) >= 0) return { status: 'none', before };
  return pack(top, 'partial');
}
