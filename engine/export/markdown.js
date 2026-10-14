// Palette Engine — Markdown color specification (the portfolio record).
// Designer text (names, rationale, notes) is escaped so it renders exactly as typed and cannot inject HTML or table syntax.
// Long free text goes in paragraphs and block quotes, never table cells, so line breaks survive.

import { TONES, ROLES } from '../palette.js';
import { oklch, roundOklch } from '../color.js';
import { assertExportable, oklchText, pairLabel, shortCite, tacText, byRegion } from './model.js';

/** Escape text for inline Markdown. Line-start block markers are escaped too. */
export function mdEscape(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((line) => line
    .replace(/[\\`*_[\]<>|~&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || `\\${c}`))
    .replace(/^(\s*)([#+\-=]|\d+[.)])(\s|$)/, '$1\\$2$3')).join('\n');
}
const cell = (text) => mdEscape(String(text)).replace(/\n/g, ' ');
const quote = (text) => mdEscape(text).split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((c) => (c == null || c === '' ? '—' : c)).join(' | ')} |`)].join('\n');
const code = (s) => `\`${s}\``;
const ok = (hex) => oklchText(roundOklch(oklch(hex)));
const cmykText = (c) => `${c[0]} / ${c[1]} / ${c[2]} / ${c[3]}`;
const tierText = (t) => t || "Designer's choice (no evidence tier)";
const link = (s) => (s.url ? `[${mdEscape(shortCite(s))}](${s.url})` : mdEscape(shortCite(s)));

function colorSection(model, c) {
  const L = [];
  const label = c.slot[0].toUpperCase() + c.slot.slice(1);
  L.push(`### ${label}: ${mdEscape(c.name)} ${code(c.hex.toUpperCase())}`, '');
  L.push(`- **Origin:** ${c.origin === 'manual' ? "the designer's own color" : c.origin === 'descriptor' ? 'from descriptor words' : `from the ${mdEscape(c.origin.slice(8))} harmony lens`}`);
  L.push(`- **Evidence tier:** ${tierText(c.tier)}`);
  L.push(`- **Locked:** ${c.locked ? 'yes (kept when other choices change)' : 'no'}`, '');
  L.push('**Rationale**', '', c.rationale.trim() ? quote(c.rationale) : '_No rationale was written for this color._', '');
  L.push('**Screen**', '', table(['Value', 'Setting'], [
    ['Hex', code(c.hex.toUpperCase())], ['sRGB', c.screen.srgb.join(', ')], ['OKLCH', code(oklchText(c.screen.oklch))],
    ['HCT', `hue ${c.screen.hct[0]}, chroma ${c.screen.hct[1]}, tone ${c.screen.hct[2]}`], ['Lab D50', `${c.labD50.l}, ${c.labD50.a}, ${c.labD50.b}`],
    ['Beyond sRGB', c.screen.p3Only ? `P3 only. Mapped into sRGB by reducing chroma; original ${code(oklchText(c.screen.mappedFrom))}` : 'No'],
  ]), '');
  if (c.print) {
    L.push(`**Print** (${model.conditions.intent}; swatches are not proofs)`, '', table(['Profile', 'Usual region', 'C / M / Y / K (%)', 'Total ink', 'Print gamut', 'Press neighbor'], model.conditions.profiles.map((p) => {
      const r = c.print[p.id];
      return [mdEscape(p.label), mdEscape(p.region), cmykText(r.cmyk), tacText(r), r.inGamut ? `in gamut (ΔE00 ${r.gamutDE00.toFixed(1)})` : `**out of gamut** (ΔE00 ${r.gamutDE00.toFixed(1)}, flagged above 2.0)`, code(r.printableNeighbor.toUpperCase())];
    })), '');
    const notes = model.conditions.profiles.map((p) => c.print[p.id].note).filter(Boolean);
    if ([...new Set(notes)].length) L.push(...[...new Set(notes)].map((n) => `> ${mdEscape(n)}`), '');
  } else L.push('**Print**', '', '_Print data was not available when this file was made (the lookup tables did not load)._', '');
  L.push('**Spot color, approximate** (Pantone is a trademark of its owner)', '');
  if (!c.spot.coated.length && !c.spot.uncoated.length) L.push('_No spot values were supplied. Paste names and Lab values from a source you are licensed to use to get a shortlist._', '');
  else {
    const rows = [...c.spot.coated.map((m) => ['Coated', m]), ...c.spot.uncoated.map((m) => ['Uncoated', m])].map(([b, m]) => [b, mdEscape(m.name), m.dE00.toFixed(1), m.band, m.source, m.check === 'none' ? 'not spot-checked' : m.check]);
    L.push(table(['Book', 'Name', 'ΔE00', 'Match', 'Values from', 'Check'], rows), '', 'Bands: under 1 near-identical, 1–2 close, 2–3 acceptable, 3–5 loose, over 5 no good match (industry practice, not a standard). Verify against a current physical guide under D50 light before a client commits.', '');
  }
  const a = c.accessibility;
  L.push('**Accessibility** (WCAG 2.2; APCA is advisory and web only)', '', table(['Check', 'Result'], [
    ['On white', `${a.vsWhite.toFixed(2)}:1, ${a.textOnWhite ? 'passes AA for text' : a.uiOnWhite ? 'large text and UI only' : 'below 3:1'}`],
    ['On black', `${a.vsBlack.toFixed(2)}:1, ${a.textOnBlack ? 'passes AA for text' : a.uiOnBlack ? 'large text and UI only' : 'below 3:1'}`],
    ['APCA Lc (advisory)', `${a.apca.onWhite} on white, ${a.apca.onBlack} on black`],
    ['Color-blind views', c.slot === 'primary' ? 'compared with the other colors in the role checks below' : a.cvdVsSeed.length ? `collapses against the seed: ${a.cvdVsSeed.map((f) => `${f.type} (ΔE00 ${f.dE00.toFixed(1)})`).join(', ')}` : 'stays distinct from the seed under protan, deutan and tritan views'],
  ]), '');
  if (c.harmonyScore != null) L.push(`Harmony score against the seed: ${c.harmonyScore.toFixed(2)}. Advisory only: the model (Ou & Luo 2006) was fitted on color patches on gray (R² 0.71), not brand contexts.`, '');
  L.push('**Evidence**', '');
  for (const e of c.evidence) L.push(`- ${mdEscape(e.claim)} _${tierText(e.tier)}._${e.sources.length ? ` Sources: ${e.sources.map(link).join('; ')}.` : ''}`);
  L.push('');
  return L.join('\n');
}

export function markdownSpec(model) {
  assertExportable(model);
  const pal = model.palette; const c0 = model.conditions;
  const L = [];
  L.push(`# ${mdEscape(model.name)}: color specification`, '', `**Generated:** ${model.date} by Palette Engine`, `**Print conditions:** ${byRegion(c0.profiles, (p) => mdEscape(p.label))}; ${c0.intent}`, `**Roles:** ${c0.roleModel}, light and dark`, '', '---', '');

  L.push('## Summary', '');
  L.push(table(['Color', 'Name', 'Hex', 'CMYK, GRACoL coated', 'CMYK, GRACoL uncoated', 'Pantone coated (approx.)', 'Pantone uncoated (approx.)', 'On white', 'Tier'],
    model.colors.map((c) => [c.slot, cell(c.name), code(c.hex.toUpperCase()), c.print ? cmykText(c.print[c0.profiles[0].id].cmyk) : 'n/a', c.print ? cmykText(c.print[c0.profiles[2].id].cmyk) : 'n/a',
      c.spot.coated[0] ? `${cell(c.spot.coated[0].name)}, ΔE00 ${c.spot.coated[0].dE00.toFixed(1)}` : 'none supplied', c.spot.uncoated[0] ? `${cell(c.spot.uncoated[0].name)}, ΔE00 ${c.spot.uncoated[0].dE00.toFixed(1)}` : 'none supplied',
      `${c.accessibility.vsWhite.toFixed(2)}:1`, cell(tierText(c.tier))])), '');
  L.push(model.accepted.length ? `**Accessibility status:** ${model.accepted.length} WCAG 2.2 failure${model.accepted.length === 1 ? ' is' : 's are'} accepted with a note (see "Accessibility decisions").` : '**Accessibility status:** every role pair passes WCAG 2.2 AA.', '');

  L.push('## Colors', '');
  for (const c of model.colors) L.push(colorSection(model, c));

  L.push('## Roles', '', 'Roles come from Material 3 tonal palettes (HCT). The brand hex stays its own token; the gap to the nearest role tone is shown so nothing is silently changed.', '');
  const b = pal.brand;
  L.push(table(['Mode', 'Primary role', 'Tone gap from the brand color'], [['Light', code(b.lightPrimary.hex.toUpperCase()), b.lightPrimary.toneGap], ['Dark', code(b.darkPrimary.hex.toUpperCase()), b.darkPrimary.toneGap]]), '');
  L.push(table(['Role', 'Light', 'Light OKLCH', 'Dark', 'Dark OKLCH'], ROLES.map((r) => [code(r), code(pal.schemes.light[r].toUpperCase()), ok(pal.schemes.light[r]), code(pal.schemes.dark[r].toUpperCase()), ok(pal.schemes.dark[r])])), '');

  L.push('## Tonal palettes', '', table(['Tone', ...['primary', 'secondary', 'tertiary', 'neutral', 'neutralVariant', 'error'].map((k) => k)], TONES.map((t) => [String(t), ...['primary', 'secondary', 'tertiary', 'neutral', 'neutralVariant', 'error'].map((k) => code(pal.tones[k][t].toUpperCase()))])), '');

  L.push('## Role-pair checks', '', `${c0.wcag}. ${c0.apca}.`, '');
  for (const mode of ['light', 'dark']) {
    L.push(`### ${mode === 'light' ? 'Light' : 'Dark'}`, '', table(['Pair', 'Ratio', 'Needs', 'Result'], pal.checks[mode].rows.filter((r, i, a) => a.findIndex((x) => x.fg === r.fg && x.bg === r.bg && x.kind === r.kind) === i).map((r) => {
      const pass = r.kind === 'text' ? r.aa : r.pass;
      const acc = model.accepted.find((f) => f.mode === mode && f.fg === r.fg && f.bg === r.bg && f.kind === r.kind);
      return [code(pairLabel(r)), `${(Math.round(r.ratio * 100) / 100).toFixed(2)}:1`, r.kind === 'text' ? '4.5:1' : '3:1', pass ? 'pass' : acc ? 'accepted with a note' : 'FAIL'];
    })), '');
    const cvd = pal.checks[mode].cvd;
    L.push(cvd.length ? `Color-blind collapse (${mode}): ${cvd.map((f) => `${mdEscape(f.a)} and ${mdEscape(f.b)} under ${f.type} (ΔE00 ${f.dE00.toFixed(1)})`).join('; ')}. Do not rely on these roles differing by color alone (WCAG 1.4.1).` : `Color-blind views (${mode}): the primary, secondary, tertiary and error roles stay distinct under protan, deutan and tritan simulation.`, '');
  }

  L.push('## Accessibility decisions', '');
  if (!model.accepted.length && !model.overrides.length && !model.acceptedStale.length) L.push('No failures were accepted and no role was overridden.', '');
  if (model.accepted.length) {
    L.push('**Accepted WCAG 2.2 failures** (each carries the designer\'s note)', '');
    for (const f of model.accepted) L.push(`- ${f.mode === 'light' ? 'Light' : 'Dark'}, ${code(pairLabel(f))}: ${f.ratio.toFixed(2)}:1, needs ${f.required}:1.${f.fix ? ` Nearest passing tone: ${f.fix.tone} (${code(f.fix.hex.toUpperCase())}).` : ''}`, '', quote(f.note).split('\n').map((l) => `  ${l}`).join('\n'), '');
  }
  if (model.acceptedStale.length) {
    L.push('**Earlier accepted notes** (these pairs pass now; the notes are kept)', '');
    for (const f of model.acceptedStale) L.push(`- ${f.mode === 'light' ? 'Light' : 'Dark'}, ${code(pairLabel(f))}`, '', quote(f.note).split('\n').map((l) => `  ${l}`).join('\n'), '');
  }
  if (model.overrides.length) {
    L.push('**Role overrides** (colors the designer set, replacing the generated role)', '', table(['Mode', 'Role', 'Color'], model.overrides.map((o) => [o.mode, code(o.role), code(o.hex.toUpperCase())])), '');
  }

  L.push('## Method and limits', '');
  L.push(`- Screen: sRGB is canonical. A color beyond sRGB is flagged "P3 only" and mapped in by reducing OKLCH chroma; the original is kept.`);
  L.push(`- Print: values come from lookup tables built with LittleCMS from the ${c0.profiles.map((p) => mdEscape(p.label)).join(', ')} profiles (${c0.intent}). They agree with LittleCMS to ΔE00 0.15 (95th percentile) and 0.99 (worst case) across all six. Swatches are approximations, not proofs. ${c0.gamut}.`);
  L.push(`- Spot: ${mdEscape(model.spotDataset.source)}. ${model.spotDataset.entries} entr${model.spotDataset.entries === 1 ? 'y' : 'ies'} scored by ΔE2000 in Lab D50, Coated and Uncoated separately. Names carry "(approx.)" and none has been checked against a physical guide.`);
  L.push(`- Accessibility: ${c0.wcag}. ${c0.apca}. Color-blind views use ${c0.cvd}.`);
  L.push('- Evidence tiers: well-established (standards and measurement science), supported but contested (peer-reviewed effects that depend on context), low confidence (weak evidence or an engineering choice), speculative (convention).');
  L.push('- Pantone is a trademark of its owner. Palette Engine bundles no Pantone data.', '');
  return L.join('\n');
}
