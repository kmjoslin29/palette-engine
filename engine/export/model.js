// Palette Engine — export model. One place that turns the working state into everything an exporter needs,
// so Forge JSON, DTCG, CSS, Markdown, ASE and the spec sheet cannot disagree with each other.
// Rounding follows build spec §4: CMYK whole %, ΔE00 1 decimal, OKLCH L 2 / C 3 / h whole, contrast 2 decimals.

import { buildPalette, TONES } from '../palette.js';
import { analyze, INTENT } from '../analyze.js';
import { parseEntries, score } from '../spot.js';
import { accessibilityOf, LENSES, TIER_NOTE, WHEEL, ouLuoHarmony } from '../harmony.js';
import { cvdDistinctPairs } from '../checks.js';
import { indexLexicon, matchDescriptors } from '../matcher.js';
import { PRINT_PROFILES, PRINT_REGIONS, acceptKey } from '../project.js';

export const NS = 'com.kwadejoslin.palette';
export const GENERATOR = { name: 'Palette Engine', phase: 5 };
export const SLOTS = [['primary', 'Primary'], ['secondary', 'Secondary'], ['tertiary', 'Tertiary']];
export const PALETTE_KEYS = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', neutral: 'neutral', neutralVariant: 'neutral-variant', error: 'error' };

export class ExportBlockedError extends Error {
  constructor(items) {
    super(`Export blocked: ${items.length} WCAG 2.2 failure${items.length === 1 ? '' : 's'} without a fix or an accepted note.`);
    this.name = 'ExportBlockedError'; this.items = items;
  }
}
/** Exports are gated: unresolved AA failures block them (build spec §3). Project files are not exports and are never gated. */
export function assertExportable(model) { if (model.unresolved.length) throw new ExportBlockedError(model.unresolved); }

const HARMONY_SOURCES = {
  'low confidence': [{ id: 'schloss2011', cite: 'Schloss & Palmer (2011). Aesthetic response to color combinations: preference, harmony, and similarity. Attention, Perception & Psychophysics.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3037488' }],
  'supported but contested': [{ id: 'ouluo2006', cite: 'Ou & Luo (2006). A colour harmony model for two-colour combinations. Color Research & Application 31(3).', url: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/col.20208' }],
};

export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'palette';
export const round = (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n;
export const ratio2 = (r) => round(r, 2);
export const oklchText = (o) => `oklch(${o.l.toFixed(2)} ${o.c.toFixed(3)} ${Math.round(o.h)})`;
/** "Author (year)" from a full citation, for compact source labels. */
export function shortCite(src) {
  const m = (src.cite || '').match(/^(.*?)\s*\((\d{4})\)/);
  if (!m) return (src.cite || src.id || '').split(/[,.]/)[0];
  const lead = m[1].includes(',') ? `${m[1].split(',')[0]} et al.` : m[1];
  return `${lead} (${m[2]})`;
}

function evidenceFor(slot, rec, seedHex, ctx) {
  const srcOf = (ids) => (ids || []).map((id) => ctx.lex && ctx.lex.sources[id] ? { id, cite: ctx.lex.sources[id].cite, url: ctx.lex.sources[id].url } : { id, cite: id, url: null });
  if (rec.origin === 'manual') return [{ claim: 'Color supplied by the designer. No research claim is attached to it.', tier: null, sources: [] }];
  if (rec.origin === 'descriptor') {
    const words = rec.words || '';
    if (ctx.lex && words) {
      const res = matchDescriptors(words, indexLexicon(ctx.lex));
      const cand = res.seeds.find((s) => s.hex.toLowerCase() === rec.hex.toLowerCase());
      if (cand) {
        const rowOf = (term) => ctx.lex.rows.find((r) => r.term === term);
        const out = [];
        for (const t of cand.supporting) out.push({ claim: `“${t.term}” supports this color${t.contribution ? ` (evidence score ${t.contribution > 0 ? '+' : ''}${t.contribution.toFixed(2)})` : ' (range met)'}.`, tier: t.tier, sources: srcOf((rowOf(t.term) || {}).sources) });
        for (const t of cand.conflicting) out.push({ claim: `“${t.term}” works against this color (${t.contribution.toFixed(2)}).`, tier: t.tier, sources: srcOf((rowOf(t.term) || {}).sources) });
        if (cand.unaddressed.length) out.push({ claim: `Not addressed by this color: ${cand.unaddressed.map((t) => t.term).join(', ')}.`, tier: null, sources: [] });
        if (out.length) return out;
      }
    }
    return [{ claim: `Chosen from the descriptor words “${words}”. This lexicon version no longer reproduces the candidate, so only its weakest tier is kept.`, tier: rec.tier, sources: [] }];
  }
  const lensId = rec.lens || (rec.origin.startsWith('harmony:') ? rec.origin.slice(8) : null);
  const lens = LENSES[lensId];
  if (!lens) return [];
  const off = rec.offset == null ? '' : `, offset ${rec.offset > 0 ? '+' : ''}${rec.offset}°`;
  return [{ claim: `${lens.name} lens on the ${WHEEL}${off}. ${TIER_NOTE[lens.tier]}`, tier: rec.tier || lens.tier, sources: HARMONY_SOURCES[lens.tier] }];
}

/**
 * state: validated project state. luts: { profileId: decodeLut(json) } (may be empty: print data is then null).
 * ctx: { lex (approved lexicon, optional), date (YYYY-MM-DD) }.
 */
export function buildExportModel(state, luts = {}, ctx = {}) {
  if (!state || !state.seed) throw new Error('A seed color is needed before anything can be exported.');
  const date = ctx.date || new Date().toISOString().slice(0, 10);
  const supporting = ['secondary', 'tertiary'].filter((k) => state.supporting[k]).map((k) => ({ role: k, hex: state.supporting[k].hex }));
  const palette = buildPalette(state.seed.hex, supporting, { overrides: state.overrides });
  const printReady = PRINT_PROFILES.every((p) => luts[p.id]);
  const printCache = new Map();
  const printOf = (hex) => {
    if (!printReady) return null;
    const k = hex.toLowerCase();
    if (!printCache.has(k)) {
      const a = analyze(k, luts);
      printCache.set(k, Object.fromEntries(PRINT_PROFILES.map((p) => { const r = a.print[p.id]; return [p.id, { cmyk: r.cmyk, tac: r.tac, tacLimit: r.tacLimit, gamutDE00: r.gamutDE00, inGamut: r.inGamut, printableNeighbor: r.printableNeighbor.hex, note: r.note || null }]; })));
    }
    return printCache.get(k);
  };

  const parsed = parseEntries(state.spot.text, { illuminant: state.spot.illum });
  const spotDataset = { source: 'Pasted by the designer; Palette Engine bundles no Pantone data', entries: parsed.entries.length, skippedLines: parsed.errors.length, illuminant: state.spot.illum, check: 'none' };
  const spotFor = (lab) => {
    if (!parsed.entries.length) return { coated: [], uncoated: [] };
    const r = score(lab, parsed.entries, 3);
    const m = (x) => ({ name: `${x.name} (approx.)`, sourceName: x.name, dE00: x.dE00, band: x.band, source: x.source === 'hex' ? 'screen hex (weaker)' : 'Lab entered by the designer', check: x.check, lab: x.lab });
    return { coated: r.C.map(m), uncoated: r.U.map(m) };
  };

  const colors = [];
  const slotRecs = [['primary', state.seed], ['secondary', state.supporting.secondary], ['tertiary', state.supporting.tertiary]];
  for (const [slot, rec] of slotRecs) {
    if (!rec) continue;
    const a = analyze(rec.hex, {});
    const acc = accessibilityOf(rec.hex);
    const cvd = slot === 'primary' ? [] : cvdDistinctPairs({ seed: state.seed.hex, candidate: rec.hex }).map((f) => ({ type: f.type, dE00: f.dE00 }));
    const label = SLOTS.find(([k]) => k === slot)[1];
    colors.push({
      id: slot, slot, role: slot, name: (rec.name || '').trim() || label, hex: rec.hex.toLowerCase(), origin: rec.origin, locked: !!rec.locked,
      tier: rec.tier || null, rationale: rec.rationale || '',
      screen: { hex: rec.hex.toLowerCase(), srgb: a.screen.srgb, oklch: a.screen.oklch, hct: a.screen.hct, p3Only: !!rec.mappedFrom, mappedFrom: rec.mappedFrom ? { l: round(rec.mappedFrom.l, 2), c: round(rec.mappedFrom.c, 3), h: round(rec.mappedFrom.h) } : null },
      labD50: { l: round(a.labD50.l, 1), a: round(a.labD50.a, 1), b: round(a.labD50.b, 1) },
      labD50Exact: a.labD50,
      print: printOf(rec.hex),
      spot: spotFor(a.labD50),
      accessibility: { vsWhite: ratio2(acc.vsWhite), vsBlack: ratio2(acc.vsBlack), textOnWhite: acc.textOnWhite, textOnBlack: acc.textOnBlack, uiOnWhite: acc.uiOnWhite, uiOnBlack: acc.uiOnBlack, apca: acc.apca, cvdVsSeed: cvd },
      harmonyScore: slot === 'primary' ? null : round(ouLuoHarmony(state.seed.hex, rec.hex).score, 2),
      evidence: evidenceFor(slot, rec, state.seed.hex, ctx),
    });
  }
  const uniq = new Set();
  for (const c of colors) {
    let n = c.name;
    if (uniq.has(n.toLowerCase())) n = `${c.name} (${c.slot})`;
    for (let i = 2; uniq.has(n.toLowerCase()); i++) n = `${c.name} (${c.slot}) ${i}`;
    uniq.add(n.toLowerCase()); c.name = n;
  }

  // Role-pair failures and what the designer said about them.
  const failures = [], liveKeys = new Set();
  for (const mode of ['light', 'dark']) for (const f of palette.checks[mode].failures) {
    const key = acceptKey(mode, f.fg, f.bg, f.kind); liveKeys.add(key);
    const note = (state.accepted[key] || '').trim();
    failures.push({ key, mode, fg: f.fg, bg: f.bg, kind: f.kind, ratio: ratio2(f.ratio), required: f.kind === 'text' ? 4.5 : 3, note: note || null, fix: f.fix ? { tone: f.fix.tone, hex: f.fix.hex } : null });
  }
  const acceptedStale = Object.entries(state.accepted).filter(([k, v]) => !liveKeys.has(k) && (v || '').trim()).map(([key, note]) => { const [mode, fg, bg, kind] = key.split('|'); return { key, mode, fg, bg, kind, note: note.trim() }; });
  const overrides = [];
  for (const mode of ['light', 'dark']) for (const role of palette.overridden[mode]) overrides.push({ mode, role, hex: palette.schemes[mode][role] });

  const profiles = PRINT_PROFILES.map((p) => ({ id: p.id, short: p.short, region: PRINT_REGIONS.find((r) => r.id === p.region).name, label: luts[p.id] ? luts[p.id].label : p.short, tacLimit: luts[p.id] ? luts[p.id].tacLimit : null, sha256: luts[p.id] ? luts[p.id].profileSha256 : null, ase: p.ase }));
  return {
    generator: GENERATOR, date, name: (state.name || '').trim() || 'Untitled palette', slug: slugify((state.name || '').trim() || 'palette'),
    conditions: {
      intent: INTENT, profiles, printAvailable: printReady, lutGrid: 33, wheel: WHEEL, roleModel: 'Material 3 (2021 role tones)',
      wcag: 'WCAG 2.2 AA is the pass/fail gate', apca: 'APCA is advisory, web only, never applied to print', cvd: 'Machado et al. 2009, full severity; roles collapse below ΔE00 10',
      gamut: 'Out of print gamut when the round-trip ΔE00 is above 2.0 (convention)',
    },
    spotDataset, spotSkipped: parsed.errors,
    colors, palette, printOf, tones: TONES,
    failures, unresolved: failures.filter((f) => !f.note), accepted: failures.filter((f) => f.note), acceptedStale, overrides,
    state,
  };
}

/** The color record of build spec §4, JSON-shaped, for $extensions and the project record. */
export function colorRecord(c, model) {
  const print = c.print ? { intent: model.conditions.intent, ...Object.fromEntries(model.conditions.profiles.map((p) => [p.id, { cmyk: c.print[p.id].cmyk, tac: c.print[p.id].tac, tacLimit: c.print[p.id].tacLimit, gamutDE00: c.print[p.id].gamutDE00, inGamut: c.print[p.id].inGamut, printableNeighbor: c.print[p.id].printableNeighbor }])) } : null;
  return {
    id: c.id, role: c.role, name: c.name, origin: c.origin, locked: c.locked, rationale: c.rationale, tier: c.tier,
    screen: { hex: c.hex, srgb: c.screen.srgb, oklch: c.screen.oklch, hct: c.screen.hct, p3Only: c.screen.p3Only, mappedFrom: c.screen.mappedFrom },
    labD50: [c.labD50.l, c.labD50.a, c.labD50.b],
    print,
    spot: { dataset: model.spotDataset, coated: c.spot.coated.map(({ lab, sourceName, ...r }) => r), uncoated: c.spot.uncoated.map(({ lab, sourceName, ...r }) => r) },
    accessibility: c.accessibility,
    evidence: c.evidence.map((e) => ({ claim: e.claim, tier: e.tier, source: e.sources.map((s) => (s.url ? `${shortCite(s)} ${s.url}` : shortCite(s))).join('; ') || null })),
  };
}

/** Human-readable role-pair label. */
export const pairLabel = (f) => `${f.fg} on ${f.bg}${f.kind === 'non-text' ? ' (UI)' : ''}`;

/** Total ink as text. A profile that states no limit (the FOGRA39 file) shows the ink alone, never a pass or fail. */
export const tacText = (r) => (r.tacLimit == null ? `${r.tac}% (no limit stated)` : `${r.tac}% of ${r.tacLimit}%`);

/** 'North America: A; B. Europe: C; D.' for the conditions lines. `text` picks the name of each profile. */
export const byRegion = (profiles, text = (p) => p.label) => {
  const order = [...new Set(profiles.map((p) => p.region))];
  return order.map((r) => `${r}: ${profiles.filter((p) => p.region === r).map(text).join('; ')}`).join('. ');
};
