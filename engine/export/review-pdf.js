// Palette Engine — Palette review PDF (D48): the brand as entered beside its proposals, for a client meeting. It is a
// decision aid, so it is never blocked by accessibility failures (it shows them) and every page says it is a review draft.
// The final brand color sheet stays the record of the chosen colors.

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Sheet, PAGE, M, CW, INK, MUTED, RULE, SOFT, PASS, FAIL, WARN, hexRgb, inkOn, cmykText, pdfSafe } from './sheet.js';
import { CVD_TYPES, CVD_NAMES, CVD_LINE } from '../review.js';

const VISION = [['normal', 'Typical color vision'], ['protan', 'Protanopia (red-blind) simulation'], ['deutan', 'Deuteranopia (green-blind) simulation'], ['tritan', 'Tritanopia (blue-blind) simulation']];
const DRAFT = 'Review draft, not final colors';

/** One strip of swatches with short labels; returns nothing, advances the cursor. */
function strip(S, items, x0, width, title) {
  const h = 34; const n = items.length; const gap = 3; const w = (width - (n - 1) * gap) / n;
  S.ensure(h + 22);
  S.label(title, M.l, S.y + 12, { size: 7.5, k: 'bold', color: MUTED, maxWidth: x0 - M.l - 6 });
  items.forEach((it, i) => {
    const x = x0 + i * (w + gap);
    S.rect(x, S.y, w, h, it.hex, { border: RULE });
    if (it.changed) S.rect(x, S.y + h + 1, w, 2, INK);
    S.label(it.short, x + 2, S.y + h + 4, { size: 7, k: it.changed ? 'bold' : 'regular', color: it.changed ? INK : MUTED, maxWidth: w - 2 });
  });
  S.y += h + 16;
}

function colorBlock(S, c, title, sub, x, width, labelOf) {
  const y0 = S.y; let y = y0;
  S.rect(x, y, width, 58, c.hex, { border: RULE });
  const ink = inkOn(c.hex);
  S.label(title, x + 8, y + 8, { size: 10, k: 'bold', color: ink, maxWidth: width - 16 });
  S.label(c.hex.toUpperCase(), x + 8, y + 40, { size: 9, k: 'mono', color: ink });
  y += 64;
  S.label(sub, x, y, { size: 7.5, color: MUTED, maxWidth: width }); y += 12;
  const line = (k, v, color) => { S.label(k, x, y, { size: 7.5, k: 'bold', color: MUTED }); for (const ln of S.wrap(v, 7.5, 'regular', width - 78)) { S.label(ln, x + 78, y, { size: 7.5, color: color || INK }); y += 10; } };
  line('OKLCH', c.oklch);
  if (c.print) line(`CMYK`, `${cmykText(c.print.cmyk)} (${c.print.profile})${c.print.inGamut ? '' : `, outside print gamut; nearest printable ${c.print.printableNeighbor.toUpperCase()}`}`, c.print.inGamut ? INK : WARN);
  line('On white', `${c.vsWhite.toFixed(2)}:1${c.vsWhite >= 4.5 ? ' (passes AA for text)' : c.vsWhite >= 3 ? ' (large text and graphics only)' : ' (fails AA)'}`);
  line('On black', `${c.vsBlack.toFixed(2)}:1${c.vsBlack >= 4.5 ? ' (passes AA for text)' : c.vsBlack >= 3 ? ' (large text and graphics only)' : ' (fails AA)'}`);
  for (const t of CVD_TYPES) { const b = c.closest.byType[t]; if (b) line(`${t[0].toUpperCase()}${t.slice(1)}`, `closest to ${labelOf[b.other] || b.other}, dE00 ${b.dE00.toFixed(1)}`, b.dE00 < CVD_LINE ? WARN : INK); }
  // role preview: color with on-color, container with on-container, light then dark
  for (const mode of ['light', 'dark']) {
    y += 3; S.label(`Roles, ${mode}`, x, y, { size: 7.5, k: 'bold', color: MUTED }); y += 11;
    const [col, on, cont, onCont] = c.roles[mode]; const bw = (width - 6) / 2;
    S.rect(x, y, bw, 22, col.hex, { border: RULE }); S.label(`Aa ${col.role}`, x + 5, y + 7, { size: 7.5, k: 'bold', color: on.hex, maxWidth: bw - 8 });
    S.rect(x + bw + 6, y, bw, 22, cont.hex, { border: RULE }); S.label(`Aa ${cont.role}`, x + bw + 11, y + 7, { size: 7.5, k: 'bold', color: onCont.hex, maxWidth: bw - 8 });
    y += 26;
    const n = c.roleCollapse[mode].length;
    S.label(n ? `Collapses with ${n} key role${n === 1 ? '' : 's'} under color-blind views` : 'Stays distinct from the other key roles', x, y, { size: 7, color: n ? WARN : PASS, maxWidth: width }); y += 10;
  }
  return y - y0;
}

function decisionBox(S) {
  S.ensure(64); const y = S.y;
  S.rect(M.l, y, CW, 56, '#ffffff', { border: RULE });
  S.label('Decision', M.l + 8, y + 8, { size: 8.5, k: 'bold' });
  let x = M.l + 70;
  for (const opt of ['Keep existing', 'Use proposal', 'Discuss']) { S.rect(x, y + 7, 9, 9, '#ffffff', { border: INK }); S.label(opt, x + 14, y + 8, { size: 8.5 }); x += S.width(opt, 8.5) + 40; }
  S.label('Notes', M.l + 8, y + 30, { size: 8.5, k: 'bold' });
  S.page.drawLine({ start: { x: M.l + 70, y: PAGE.h - (y + 40) }, end: { x: PAGE.w - M.r - 8, y: PAGE.h - (y + 40) }, thickness: 0.5, color: hexRgb(RULE) });
  S.page.drawLine({ start: { x: M.l + 8, y: PAGE.h - (y + 52) }, end: { x: PAGE.w - M.r - 8, y: PAGE.h - (y + 52) }, thickness: 0.5, color: hexRgb(RULE) });
  S.y += 64;
}

/** Build the review PDF from a reviewModel(). `date` is YYYY-MM-DD. Returns { bytes, warnings, pages, boxes }. */
export async function buildReviewPdf(review, { date } = {}) {
  if (!review.hasProposal) throw new Error('The palette review needs at least one proposal to compare.');
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), mono: await pdf.embedFont(StandardFonts.Courier) };
  const day = date || new Date().toISOString().slice(0, 10); const d = new Date(`${day}T12:00:00Z`);
  pdf.setCreationDate(d); pdf.setModificationDate(d); pdf.setProducer('Palette Engine'); pdf.setCreator('Palette Engine');
  const S = new Sheet(pdf, fonts, review);
  pdf.setTitle(pdfSafe(`${review.name} - palette review`, S.replaced)); pdf.setSubject('Existing brand colors compared with proposed replacements');
  const L = review.labelOf;

  // ---- Summary ----------------------------------------------------------------------------------------------------
  S.text(review.name, { size: 24, k: 'bold', gap: 2 });
  S.text(`Palette review  |  ${day}  |  ${DRAFT}`, { size: 10.5, color: MUTED, gap: 8 });
  S.text(`This review sets each existing brand color beside the replacement proposed for it, so the choice can be made before the final color files are produced. ${review.proposalCount} of ${review.rows.length} supporting colors have a proposal. Nothing here is final: the brand color sheet and the swatch files are made from the colors chosen afterwards.`, { size: 9, gap: 8 });
  S.heading('Colors compared', 12);
  S.table([{ w: 70 }, { w: 92 }, { w: 92 }, { w: 120 }, { w: 80 }], ['Slot', 'Existing', 'Proposal', 'Distance between them', 'In use in the tool'],
    review.rows.map((r) => [`${r.label}${r.name ? ` (${r.name})` : ''}`, { text: r.existing.hex.toUpperCase(), swatch: r.existing.hex, k: 'mono' },
      r.proposal ? { text: r.proposal.hex.toUpperCase(), swatch: r.proposal.hex, k: 'mono' } : (r.generated ? 'Generated, no existing color' : 'No proposal'),
      r.proposal ? `dE00 ${r.dE00.toFixed(1)}, ${r.distance.toLowerCase()}` : '-', r.choice === 'proposal' ? 'Proposal' : r.choice === 'generated' ? 'Generated' : 'Existing']));
  const te = review.totals.existing, tp = review.totals.proposed;
  const cmp = (a, b) => (a == null || b == null ? {} : b < a ? { color: PASS } : b > a ? { color: FAIL } : {});
  const rowsT = [
    ['Brand colors that look alike to someone color-blind (pairs under dE00 10)', te.brandCvd, tp.brandCvd],
    ['Key roles that collapse under color-blind views, light mode (pairs)', te.roleCvdLight, tp.roleCvdLight],
    ['Key roles that collapse under color-blind views, dark mode (pairs)', te.roleCvdDark, tp.roleCvdDark],
    ['Role pairs failing WCAG 2.2 AA contrast, light and dark', te.wcag, tp.wcag],
    ...(te.gamut == null ? [] : [[`Brand colors outside ${review.profile} print gamut`, te.gamut, tp.gamut]]),
  ];
  S.heading('What changes', 12);
  S.table([{ w: 300 }, { w: 100 }, { w: 100 }], ['Measure (fewer is better)', 'Brand as entered', 'With the proposals'], rowsT.map(([k, a, b]) => [k, String(a), { text: String(b), ...cmp(a, b) }]));
  for (const r of review.rows.filter((x) => x.proposal)) { S.text(r.label, { size: 9, k: 'bold', gap: 1 }); S.text(r.sentences.join(' ').replace(/ΔE00/g, 'dE00'), { size: 8.5, gap: 6 }); }

  // ---- Strips -----------------------------------------------------------------------------------------------------
  S.newPage();
  S.heading('Seeing the difference', 14);
  S.text('The whole palette as entered and with the proposals, in typical color vision and in three color-blind simulations. A bar under a swatch marks a proposal. P is the primary, S and T the secondary and tertiary colors, N a brand neutral.', { size: 8.5, color: MUTED, gap: 8 });
  const x0 = M.l + 86;
  for (const [key, title] of VISION) {
    S.ensure(120); S.text(title, { size: 9.5, k: 'bold', gap: 4 });
    strip(S, review.strips.existing[key], x0, CW - 86, 'As entered');
    strip(S, review.strips.proposed[key], x0, CW - 86, 'With proposals');
  }

  // ---- One section per proposal -------------------------------------------------------------------------------------
  for (const r of review.rows.filter((x) => x.proposal)) {
    S.newPage();
    S.heading(`${r.label}${r.name ? `: ${r.name}` : ''}`, 14, 2);
    S.text(`dE00 ${r.dE00.toFixed(1)} between them (${r.distance.toLowerCase()}). The proposal is ${r.proposalSource}.${r.locked ? ' This color is locked in the tool.' : ''}`, { size: 8.5, color: MUTED, gap: 8 });
    const colW = (CW - 16) / 2; const y0 = S.y;
    const hA = colorBlock(S, r.existing, 'Existing', 'The brand color as entered', M.l, colW, L);
    S.y = y0; const hB = colorBlock(S, r.proposal, 'Proposal', `Proposed, ${r.proposalSource}`, M.l + colW + 16, colW, L);
    S.y = y0 + Math.max(hA, hB) + 8;
    S.text(r.sentences.join(' ').replace(/ΔE00/g, 'dE00'), { size: 8.5, gap: 8 });
    decisionBox(S);
  }

  // ---- Notes ------------------------------------------------------------------------------------------------------
  S.newPage();
  S.heading('How to read this review', 13);
  for (const p of [
    'Distance between two colors is CIEDE2000 (dE00). Up to 3 is labelled "within print tolerance": print standards and brand-color studies treat differences of about that size as the same color (ISO 12647-2 allows 3.5 for CMY solids; Chung & Liu 2022 put brand-color acceptability near 3). From 3 to 10 is labelled "visible adjustment" and over 10 "new color". Those two labels are this tool\'s own wording, not a standard.',
    `Color-blind views use the Machado, Oliveira & Fernandes (2009) model at full severity, the strongest form of each type. Many people have milder forms, so real differences are often larger than shown. Two colors are flagged when their simulated colors are under dE00 ${CVD_LINE} apart; that line is a convention. Whatever the numbers, do not rely on color alone to carry meaning (WCAG 1.4.1).`,
    'Key roles are the primary, secondary, tertiary, extended and error colors that the Material 3 roles are built from. Material sets the lightness of every role itself and keeps only a color\'s hue and chroma, which is why two grays of different lightness can give the same roles.',
    'Both palettes are built without role overrides, because an override was made for one color and cannot be compared fairly. Brand neutrals are shown in the strips but not counted: they set no roles and are the same on both sides.',
    'Swatches on screen and on paper are approximations, not proofs. Check printed colors against a proof from the printer.',
  ]) S.text(p, { size: 8.5, gap: 6 });

  // ---- header and footer ------------------------------------------------------------------------------------------
  const total = S.pages.length;
  const footer = `${DRAFT}. Made with Palette Engine on ${day}. Swatches are approximations, not proofs; color-blind views are simulations (Machado et al. 2009, full severity). The final brand color sheet holds only the chosen colors.`;
  S.pages.forEach((page, i) => {
    S.page = page; S.pageIndex = i;
    S.label(`${review.name} | palette review | ${DRAFT}`, M.l, 24, { size: 7.5, color: MUTED, maxWidth: CW - 80 });
    const pn = `Page ${i + 1} of ${total}`; S.label(pn, PAGE.w - M.r - S.width(pn, 7.5), 24, { size: 7.5, color: MUTED });
    page.drawLine({ start: { x: M.l, y: PAGE.h - 38 }, end: { x: PAGE.w - M.r, y: PAGE.h - 38 }, thickness: 0.5, color: hexRgb(RULE) });
    page.drawLine({ start: { x: M.l, y: M.bottom - 12 }, end: { x: PAGE.w - M.r, y: M.bottom - 12 }, thickness: 0.5, color: hexRgb(RULE) });
    S.wrap(footer, 6.6, 'regular', CW).forEach((ln, j) => S.label(ln, M.l, PAGE.h - M.bottom + 16 + j * 8.6, { size: 6.6, color: MUTED }));
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  const warnings = S.replaced.size ? [`${S.replaced.size} character${S.replaced.size === 1 ? '' : 's'} (${[...S.replaced].slice(0, 8).join(' ')}) cannot be shown in the PDF's built-in font and appear as "?".`] : [];
  return { bytes, warnings, pages: total, boxes: S.boxes };
}
