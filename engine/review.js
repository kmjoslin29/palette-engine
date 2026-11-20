// Palette Engine — the brand as entered compared with its proposals (D48). One model, read by the Checks step and by the
// Palette review PDF, so the page and the paper always give the same numbers.
//
// "Existing" is every supporting slot on the color the designer entered. "With proposals" is every slot that holds a
// proposal on that proposal, whichever side its switch is on, and every other slot unchanged. Both palettes are built the
// same way as the main palette, without role overrides (an override was written for one color, so it cannot be compared
// fairly). Brand neutrals are shown but not counted: they set no roles and are the same on both sides.

import { buildPalette } from './palette.js';
import { cvdDistinctPairs, simulateCvd, contrastRatio } from './checks.js';
import { de00 } from './de.js';
import { labD50, oklch } from './color.js';
import { supportSlots, neutralSlots, slotRoleNames, PRINT_PROFILES } from './project.js';

export const CVD_TYPES = ['protan', 'deutan', 'tritan'];
export const CVD_NAMES = { protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia' };
/** The color-blind closeness line used everywhere in the tool (D10): pairs under ΔE00 10 are flagged. */
export const CVD_LINE = 10;

/**
 * Distance labels for a proposal against the existing color (D47). "Within print tolerance" follows reproduction practice
 * (ISO 12647-2 allows 3.5 ΔE00 for CMY solids; Chung & Liu 2022 put brand-color acceptability near 3). The 10 boundary is
 * this tool's own label, not a standard (C51).
 */
export const distanceLabel = (d) => (d <= 3 ? 'Within print tolerance' : d <= 10 ? 'Visible adjustment' : 'New color');
export const deBetween = (a, b) => Math.round(de00(labD50(a), labD50(b)) * 10) / 10;

/** For one color in a set, its nearest other color under each color-blind type, and the nearest overall. */
function closestOf(id, set) {
  const out = {};
  for (const type of CVD_TYPES) {
    const me = labD50(simulateCvd(set[id], type)); let best = null;
    for (const [k, hex] of Object.entries(set)) {
      if (k === id) continue;
      const d = Math.round(de00(me, labD50(simulateCvd(hex, type))) * 10) / 10;
      if (!best || d < best.dE00) best = { other: k, dE00: d };
    }
    out[type] = best;
  }
  const worst = CVD_TYPES.map((t) => out[t] && { type: t, ...out[t] }).filter(Boolean).sort((a, b) => a.dE00 - b.dE00)[0] || null;
  return { byType: out, worst };
}

const okText = (hex) => { const o = oklch(hex); return `oklch(${o.l.toFixed(2)} ${(o.c || 0).toFixed(3)} ${Math.round(o.h || 0)})`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Build the comparison. `printOf(hex)` is optional: given, it returns the print records keyed by profile id (as the export
 * model's printOf does), and the default profile's CMYK and gamut are included.
 */
export function reviewModel(state, { printOf = null } = {}) {
  const slots = supportSlots(state);
  const labelOf = { primary: 'Primary', ...Object.fromEntries(slots.map((s) => [s.id, s.label])) };
  const harm = (s) => (s.index > 0 && s.stored.harmonize ? { harmonize: true } : {});
  const existingSup = slots.map((s) => ({ role: s.id, hex: s.stored.hex, ...harm(s) }));
  const proposedSup = slots.map((s) => ({ role: s.id, hex: s.stored.proposal ? s.stored.proposal.hex : s.stored.hex, ...harm(s) }));
  const seed = state.seed.hex.toLowerCase();
  const sides = {};
  for (const [key, sup] of [['existing', existingSup], ['proposed', proposedSup]]) {
    const pal = buildPalette(seed, sup);
    const set = { primary: seed, ...Object.fromEntries(sup.map((x) => [x.role, x.hex.toLowerCase()])) };
    sides[key] = { pal, set, brandCvd: pal.brandCvd, roleCvd: { light: pal.checks.light.cvd, dark: pal.checks.dark.cvd }, wcag: { light: pal.checks.light.failures.length, dark: pal.checks.dark.failures.length } };
  }
  const profile = PRINT_PROFILES[0];
  const printRec = (hex) => (printOf ? (printOf(hex) || {})[profile.id] || null : null);
  const gamutCount = (set) => (printOf ? Object.values(set).filter((hex) => { const p = printRec(hex); return p && !p.inGamut; }).length : null);
  sides.existing.gamut = gamutCount(sides.existing.set); sides.proposed.gamut = gamutCount(sides.proposed.set);

  const colorStats = (hex, id, side) => {
    const s = sides[side]; const p = printRec(hex);
    const collapse = (mode) => s.roleCvd[mode].filter((f) => f.a === id || f.b === id);
    return {
      hex, oklch: okText(hex), vsWhite: Math.round(contrastRatio(hex, '#ffffff') * 100) / 100, vsBlack: Math.round(contrastRatio(hex, '#000000') * 100) / 100,
      print: p ? { profile: profile.short, cmyk: p.cmyk, inGamut: p.inGamut, printableNeighbor: p.printableNeighbor } : null,
      closest: closestOf(id, s.set),
      roleCollapse: { light: collapse('light'), dark: collapse('dark') },
      roles: Object.fromEntries(['light', 'dark'].map((mode) => [mode, slotRoleNames(...tierIndexOf(id)).map((r) => ({ role: r, hex: s.pal.schemes[mode][r] }))])),
    };
  };
  const rows = slots.map((s) => {
    const prop = s.stored.proposal || null; const generated = s.choice === 'generated';
    const row = { id: s.id, label: s.label, name: s.stored.name || '', tier: s.tier, generated, choice: s.choice, locked: !!s.stored.locked,
      existing: colorStats(s.stored.hex, s.id, 'existing'), proposal: prop ? colorStats(prop.hex, s.id, 'proposed') : null,
      proposalSource: prop ? (prop.origin === 'manual' ? 'typed as an alternative' : `from the ${prop.lens} lens`) : null };
    if (prop) { row.dE00 = deBetween(s.stored.hex, prop.hex); row.distance = distanceLabel(row.dE00); }
    row.sentences = sentencesFor(row, labelOf);
    return row;
  });
  const neutrals = neutralSlots(state).map((x) => ({ id: x.id, label: x.label, name: x.rec.name || '', hex: x.rec.hex }));
  const totals = (k) => { const s = sides[k]; return { brandCvd: s.brandCvd.length, roleCvdLight: s.roleCvd.light.length, roleCvdDark: s.roleCvd.dark.length, wcag: s.wcag.light + s.wcag.dark, gamut: s.gamut }; };
  const strips = Object.fromEntries(['existing', 'proposed'].map((k) => {
    const items = [{ id: 'primary', label: 'Primary', short: 'P', hex: seed }, ...slots.map((s) => ({ id: s.id, label: s.label, short: shortOf(s.id), hex: sides[k].set[s.id], changed: k === 'proposed' && !!s.stored.proposal })),
      ...neutrals.map((n) => ({ id: n.id, label: n.label, short: `N${n.id.slice(7)}`, hex: n.hex, neutral: true }))];
    return [k, Object.fromEntries([['normal', items], ...CVD_TYPES.map((t) => [t, items.map((it) => ({ ...it, hex: simulateCvd(it.hex, t) }))])])];
  }));
  return {
    name: state.name || 'Untitled palette', seed, profile: profile.short, labelOf,
    hasProposal: rows.some((r) => r.proposal), proposalCount: rows.filter((r) => r.proposal).length,
    rows, neutrals, totals: { existing: totals('existing'), proposed: totals('proposed') },
    pairs: { existing: { brand: sides.existing.brandCvd, roles: sides.existing.roleCvd }, proposed: { brand: sides.proposed.brandCvd, roles: sides.proposed.roleCvd } },
    strips,
  };
}

const tierIndexOf = (id) => { const m = id.match(/^(secondary|tertiary)(\d?)$/); return [m[1], m[2] ? Number(m[2]) - 1 : 0]; };
const shortOf = (id) => { const [t, i] = tierIndexOf(id); return `${t === 'secondary' ? 'S' : 'T'}${i + 1}`; };

/** Plain sentences for one slot, written to be read to a client. */
function sentencesFor(row, labelOf) {
  const out = []; const nm = (k) => labelOf[k] || k;
  const near = (c) => `${nm(c.other)} under ${CVD_NAMES[c.type]} (ΔE00 ${c.dE00.toFixed(1)})`;
  const e = row.existing.closest.worst;
  if (!row.proposal) {
    out.push(row.generated ? 'Generated by a lens; there is no existing color to compare.' : 'Kept as entered; there is no proposal to compare.');
    if (e && e.dE00 < CVD_LINE) out.push(`It is closest to ${near(e)}, under the ΔE00 ${CVD_LINE} line.`);
    return out;
  }
  const p = row.proposal.closest.worst;
  out.push(`The proposal is ΔE00 ${row.dE00.toFixed(1)} from the existing color (${row.distance.toLowerCase()}).`);
  if (e && p) {
    const verdict = p.dE00 >= CVD_LINE && e.dE00 < CVD_LINE ? 'so it clears the ΔE00 10 line and is easier to tell apart'
      : p.dE00 < CVD_LINE && e.dE00 >= CVD_LINE ? 'so it falls under the ΔE00 10 line and is harder to tell apart'
        : p.dE00 > e.dE00 + 1 ? 'so it is easier to tell apart, though both are ' + (p.dE00 < CVD_LINE ? 'under' : 'over') + ' the ΔE00 10 line'
          : p.dE00 < e.dE00 - 1 ? 'so it is harder to tell apart, though both are ' + (p.dE00 < CVD_LINE ? 'under' : 'over') + ' the ΔE00 10 line' : 'about the same';
    out.push(`Under color-blind views the existing color is closest to ${near(e)}; the proposal is closest to ${near(p)}, ${verdict}.`);
  }
  const rc = (s) => s.roleCollapse.light.length + s.roleCollapse.dark.length;
  const re = rc(row.existing), rp = rc(row.proposal);
  if (re || rp) out.push(`Its key role collapses into another key role in ${plural(re, 'pair')} across light and dark as entered, and in ${plural(rp, 'pair')} with the proposal.`);
  if (row.proposal.print && !row.proposal.print.inGamut) out.push(`The proposal is outside ${row.proposal.print.profile} print gamut; the nearest printable color is ${row.proposal.print.printableNeighbor.toUpperCase()}.`);
  if (row.existing.print && !row.existing.print.inGamut && row.proposal.print && row.proposal.print.inGamut) out.push(`The existing color is outside ${row.existing.print.profile} print gamut; the proposal is inside it.`);
  return out;
}
