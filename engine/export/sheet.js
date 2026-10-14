// Palette Engine — printable brand color spec sheet, US Letter PDF (build spec §7): summary, one page per color, roles and checks.
// Drawn directly with pdf-lib and the standard PDF fonts (no font files bundled), so the layout is exact and the file is small.
// The standard fonts cover Latin text (WinAnsi). A character outside it is shown as "?" and reported in `warnings`; the Markdown and
// token files always hold the exact text. Every drawn box is recorded so the tests can prove nothing runs past the margins.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ROLES } from '../palette.js';
import { contrastRatio } from '../checks.js';
import { assertExportable, pairLabel, shortCite, oklchText, tacText, byRegion } from './model.js';

export const PAGE = { w: 612, h: 792 }; // US Letter, points
const M = { l: 48, r: 48, top: 54, bottom: 76 };
const CW = PAGE.w - M.l - M.r;
const INK = '#1b1b1f', MUTED = '#55555c', RULE = '#c9c9d0', SOFT = '#f3f3f6', PASS = '#1b6b2f', FAIL = '#a01c1c', WARN = '#8a5a00';

// --- text safety -----------------------------------------------------------------------------------------------------
const WIN = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const MAP = { '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≈': '~', 'Δ': 'Delta ', '✓': 'ok', '✕': 'x', '−': '-', '‑': '-', '′': "'", '″': '"', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '\t': ' ' };
export function pdfSafe(str, replaced = null) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff) || WIN.has(ch)) out += ch;
    else if (ch in MAP) out += MAP[ch];
    else if (ch === '\n') out += '\n';
    else { out += '?'; if (replaced) replaced.add(ch); }
  }
  return out;
}
const hexRgb = (hex) => { const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return rgb(n[0], n[1], n[2]); };
const inkOn = (hex) => (contrastRatio('#000000', hex) >= contrastRatio('#ffffff', hex) ? '#000000' : '#ffffff');
const cmykText = (c) => `${c[0]} / ${c[1]} / ${c[2]} / ${c[3]}`;

class Sheet {
  constructor(pdf, fonts, model) {
    this.pdf = pdf; this.f = fonts; this.model = model; this.replaced = new Set(); this.boxes = []; this.pages = [];
    this.newPage();
  }
  newPage() { this.page = this.pdf.addPage([PAGE.w, PAGE.h]); this.pages.push(this.page); this.boxes.push([]); this.pageIndex = this.pages.length - 1; this.y = M.top; return this.page; }
  get limit() { return PAGE.h - M.bottom; }
  ensure(h) { if (this.y + h > this.limit) this.newPage(); }
  mark(x, y, w, h, what) { this.boxes[this.pageIndex].push({ x, y, w, h, what }); }
  fontOf(k) { return this.f[k || 'regular']; }
  width(str, size, k) { return this.fontOf(k).widthOfTextAtSize(str, size); }

  /** Wrap `str` to `width`. Long unbroken tokens are split by character. */
  wrap(str, size, k, width) {
    width -= 4; // slack: viewers that substitute the standard fonts measure a little wider than the AFM metrics
    const out = [];
    for (const para of pdfSafe(str, this.replaced).split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(/ +/)) {
        if (!word) continue;
        const trial = line ? `${line} ${word}` : word;
        if (this.width(trial, size, k) <= width) { line = trial; continue; }
        if (line) out.push(line);
        line = '';
        let rest = word;
        while (this.width(rest, size, k) > width) { let n = rest.length; while (n > 1 && this.width(rest.slice(0, n), size, k) > width) n--; out.push(rest.slice(0, n)); rest = rest.slice(n); }
        line = rest;
      }
      out.push(line);
    }
    return out;
  }
  /** Draw wrapped text at the cursor; advances y. Returns the height used. */
  text(str, { size = 9, k = 'regular', color = INK, x = M.l, width = CW - (x - M.l), lh = 1.35, gap = 0, align = 'left' } = {}) {
    const lines = this.wrap(str, size, k, width); const step = size * lh; const start = this.y;
    for (const ln of lines) {
      this.ensure(step);
      if (ln) {
        const w = this.width(ln, size, k); const dx = align === 'right' ? width - w : align === 'center' ? (width - w) / 2 : 0;
        this.page.drawText(ln, { x: x + dx, y: PAGE.h - (this.y + size * 1.02), size, font: this.fontOf(k), color: hexRgb(color) });
        this.mark(x + dx, this.y, w, step, 'text');
      }
      this.y += step;
    }
    this.y += gap; return this.y - start;
  }
  heading(str, size = 13, gap = 5, keep = 44) { this.ensure(size * 1.6 + gap + keep); this.y += 3; this.text(str, { size, k: 'bold', gap }); }
  rule(color = RULE) { this.ensure(6); this.page.drawLine({ start: { x: M.l, y: PAGE.h - this.y - 2 }, end: { x: PAGE.w - M.r, y: PAGE.h - this.y - 2 }, thickness: 0.6, color: hexRgb(color) }); this.mark(M.l, this.y, CW, 1, 'rule'); this.y += 6; }
  rect(x, y, w, h, fill, { border = null, radius = 0 } = {}) {
    const o = { x, y: PAGE.h - y - h, width: w, height: h, color: hexRgb(fill) };
    if (border) { o.borderColor = hexRgb(border); o.borderWidth = 0.6; }
    this.page.drawRectangle(o); this.mark(x, y, w, h, 'rect');
  }
  /** Text placed at an absolute position (no wrapping) inside a box; used on swatches. */
  label(str, x, y, { size = 8, k = 'regular', color = INK, maxWidth = null } = {}) {
    let s = pdfSafe(str, this.replaced);
    if (maxWidth) while (s.length > 1 && this.width(s, size, k) > maxWidth) s = s.slice(0, -1);
    this.page.drawText(s, { x, y: PAGE.h - (y + size * 1.02), size, font: this.fontOf(k), color: hexRgb(color) });
    this.mark(x, y, this.width(s, size, k), size * 1.3, 'label');
  }
  /** cols: [{w, k?}]; rows: array of arrays of string | {text, swatch, color, k}. Repeats the header after a page break. */
  table(cols, head, rows, { size = 8, pad = 2.3 } = {}) {
    const total = cols.reduce((s, c) => s + c.w, 0); const scale = CW / total; const ws = cols.map((c) => c.w * scale);
    const drawHead = () => {
      const lines = head.map((h, i) => this.wrap(h, size, 'bold', ws[i] - 2 * pad)); const hh = Math.max(...lines.map((l) => l.length)) * size * 1.3 + 2 * pad;
      this.ensure(hh + 20); let x = M.l;
      this.rect(M.l, this.y, CW, hh, SOFT);
      head.forEach((h, i) => { lines[i].forEach((ln, j) => this.label(ln, x + pad, this.y + pad + j * size * 1.3, { size, k: 'bold' })); x += ws[i]; });
      this.y += hh;
    };
    drawHead();
    for (const row of rows) {
      const cells = row.map((c, i) => { const o = typeof c === 'object' && c ? c : { text: c }; const inner = ws[i] - 2 * pad - (o.swatch ? 14 : 0); return { ...o, lines: this.wrap(o.text == null || o.text === '' ? '-' : String(o.text), size, o.k || cols[i].k || 'regular', inner) }; });
      const rh = Math.max(...cells.map((c) => Math.max(c.lines.length * size * 1.3, c.swatch ? 12 : 0))) + 2 * pad;
      if (this.y + rh > this.limit) { this.newPage(); drawHead(); }
      let x = M.l;
      cells.forEach((c, i) => {
        let tx = x + pad;
        if (c.swatch) { this.rect(tx, this.y + pad, 11, 11, c.swatch, { border: RULE }); tx += 14; }
        c.lines.forEach((ln, j) => this.label(ln, tx, this.y + pad + j * size * 1.3, { size, k: c.k || cols[i].k || 'regular', color: c.color || INK }));
        x += ws[i];
      });
      this.y += rh;
      this.page.drawLine({ start: { x: M.l, y: PAGE.h - this.y }, end: { x: PAGE.w - M.r, y: PAGE.h - this.y }, thickness: 0.4, color: hexRgb(RULE) });
    }
    this.y += 8;
  }
  kv(pairs, { size = 8.5, keyW = 110 } = {}) {
    for (const [k, v, color] of pairs) {
      const lines = this.wrap(v, size, 'regular', CW - keyW); const h = Math.max(lines.length, 1) * size * 1.35;
      this.ensure(h);
      this.label(k, M.l, this.y, { size, k: 'bold', color: MUTED });
      lines.forEach((ln, i) => this.label(ln, M.l + keyW, this.y + i * size * 1.35, { size, color: color || INK }));
      this.y += h + 1.5;
    }
    this.y += 4;
  }
  /** Two columns of key/value pairs (left half first). */
  kv2(pairs, { size = 8.5, keyW = 66 } = {}) {
    const half = Math.ceil(pairs.length / 2); const colW = (CW - 16) / 2; const valW = colW - keyW;
    const cols = [pairs.slice(0, half), pairs.slice(half)].map((list) => list.map(([k, v, color]) => ({ k, color, lines: this.wrap(v, size, 'regular', valW) })));
    const heights = cols.map((c) => c.reduce((h, r) => h + Math.max(r.lines.length, 1) * size * 1.35 + 1.5, 0)); const h = Math.max(...heights);
    this.ensure(h); const y0 = this.y;
    cols.forEach((list, ci) => { let y = y0; const x = M.l + ci * (colW + 16); for (const r of list) { this.label(r.k, x, y, { size, k: 'bold', color: MUTED }); r.lines.forEach((ln, i) => this.label(ln, x + keyW, y + i * size * 1.35, { size, color: r.color || INK })); y += Math.max(r.lines.length, 1) * size * 1.35 + 1.5; } });
    this.y = y0 + h + 4;
  }
}

export async function buildSpecSheetPdf(model) {
  assertExportable(model);
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), mono: await pdf.embedFont(StandardFonts.Courier) };
  const d = new Date(`${model.date}T12:00:00Z`);
  pdf.setCreationDate(d); pdf.setModificationDate(d); pdf.setProducer('Palette Engine'); pdf.setCreator('Palette Engine');
  const S = new Sheet(pdf, fonts, model);
  pdf.setTitle(pdfSafe(`${model.name} - brand color specification`, S.replaced)); pdf.setSubject('Brand color specification: screen, print and spot values');
  const c0 = model.conditions;

  // ---- Summary ----------------------------------------------------------------------------------------------------
  S.text(model.name, { size: 24, k: 'bold', gap: 2 });
  S.text(`Brand color specification  |  ${model.date}`, { size: 10.5, color: MUTED, gap: 10 });
  const n = model.colors.length, bw = (CW - (n - 1) * 10) / n; S.ensure(96); const top = S.y;
  model.colors.forEach((c, i) => { const x = M.l + i * (bw + 10); S.rect(x, top, bw, 88, c.hex, { border: RULE }); const ink = inkOn(c.hex); S.label(c.name, x + 8, top + 8, { size: 10, k: 'bold', color: ink, maxWidth: bw - 16 }); S.label(c.hex.toUpperCase(), x + 8, top + 70, { size: 10, k: 'mono', color: ink }); S.label(c.slot, x + 8, top + 22, { size: 8, color: ink }); });
  S.y = top + 98;

  S.heading('Colors at a glance');
  S.table([{ w: 96 }, { w: 68, k: 'mono' }, { w: 78 }, { w: 78 }, { w: 84 }, { w: 84 }, { w: 40 }], ['Color', 'Hex', 'CMYK, GRACoL coated', 'CMYK, GRACoL uncoated', 'Pantone coated (approx.)', 'Pantone uncoated (approx.)', 'On white'],
    model.colors.map((c) => [{ text: c.name.toLowerCase() === c.slot ? c.name : `${c.name} (${c.slot})`, swatch: c.hex }, c.hex.toUpperCase(), c.print ? cmykText(c.print[c0.profiles[0].id].cmyk) : 'n/a', c.print ? cmykText(c.print[c0.profiles[2].id].cmyk) : 'n/a',
      c.spot.coated[0] ? `${c.spot.coated[0].name}, dE00 ${c.spot.coated[0].dE00.toFixed(1)}` : 'none supplied', c.spot.uncoated[0] ? `${c.spot.uncoated[0].name}, dE00 ${c.spot.uncoated[0].dE00.toFixed(1)}` : 'none supplied', `${c.accessibility.vsWhite.toFixed(2)}:1`]));

  S.heading('Status');
  const flags = [];
  for (const c of model.colors) if (c.print) for (const p of c0.profiles) if (!c.print[p.id].inGamut) flags.push(`${c.name} is outside the ${p.label} gamut (dE00 ${c.print[p.id].gamutDE00.toFixed(1)}); the press neighbor differs visibly from the screen color.`);
  for (const c of model.colors) if (c.screen.p3Only) flags.push(`${c.name} was entered beyond sRGB (P3 only) and is mapped into sRGB by reducing chroma.`);
  S.kv([
    ['Accessibility', model.accepted.length ? `${model.accepted.length} WCAG 2.2 failure${model.accepted.length === 1 ? ' is' : 's are'} accepted with a note (listed below).` : 'Every role pair passes WCAG 2.2 AA in light and dark.', model.accepted.length ? WARN : PASS],
    ['Locked', model.colors.filter((c) => c.locked).map((c) => c.name).join(', ') || 'No color is locked.'],
    ['Print gamut', flags.length ? flags.join(' ') : c0.printAvailable ? `Every color is within print gamut on all ${c0.profiles.length} print conditions.` : 'Print data was not available when this sheet was made.', flags.length ? WARN : null],
    ['Print', `${byRegion(c0.profiles)}. ${c0.intent}. The swatches in the print columns are approximations, not proofs.`],
    ['Spot', model.spotDataset.entries ? `${model.spotDataset.entries} value${model.spotDataset.entries === 1 ? '' : 's'} pasted by the designer (Lab ${model.spotDataset.illuminant}); matches are approximate and not checked against a physical guide.` : 'No spot values were supplied.'],
  ]);

  S.heading('Decisions and exceptions');
  if (!model.accepted.length && !model.overrides.length && !model.acceptedStale.length) S.text('No failures were accepted and no role was overridden.', { size: 9, color: MUTED, gap: 6 });
  for (const f of model.accepted) {
    S.ensure(46); S.text(`${f.mode === 'light' ? 'Light' : 'Dark'} | ${pairLabel(f)} | ${f.ratio.toFixed(2)}:1, needs ${f.required}:1${f.fix ? ` | nearest passing tone ${f.fix.tone} (${f.fix.hex.toUpperCase()})` : ''}`, { size: 8.5, k: 'bold', gap: 1 });
    S.text(f.note, { size: 9, x: M.l + 12, color: INK, gap: 6 });
  }
  for (const f of model.acceptedStale) { S.text(`Earlier note, ${f.mode} | ${pairLabel(f)} (this pair passes now)`, { size: 8.5, k: 'bold', gap: 1 }); S.text(f.note, { size: 9, x: M.l + 12, gap: 6 }); }
  if (model.overrides.length) { S.text('Role overrides (colors the designer set)', { size: 8.5, k: 'bold', gap: 2 }); S.text(model.overrides.map((o) => `${o.mode} ${o.role} ${o.hex.toUpperCase()}`).join('; '), { size: 9, x: M.l + 12, gap: 6 }); }

  // ---- One page per color ----------------------------------------------------------------------------------------
  for (const c of model.colors) {
    S.newPage();
    S.text(c.slot.toUpperCase(), { size: 8.5, k: 'bold', color: MUTED, gap: 0 });
    S.text(c.name, { size: 20, k: 'bold', gap: 1 });
    S.text(`${c.hex.toUpperCase()}  |  ${c.origin === 'manual' ? "the designer's own color" : c.origin === 'descriptor' ? 'from descriptor words' : `from the ${c.origin.slice(8)} harmony lens`}  |  ${c.locked ? 'locked' : 'not locked'}`, { size: 9.5, color: MUTED, gap: 8 });
    S.ensure(76); const top2 = S.y; const half = (CW - 12) / 2; const sh = 50;
    S.rect(M.l, top2, half, sh, c.hex, { border: RULE }); S.label('Screen (sRGB)', M.l + 8, top2 + 6, { size: 8.5, k: 'bold', color: inkOn(c.hex) }); S.label(c.hex.toUpperCase(), M.l + 8, top2 + sh - 16, { size: 10, k: 'mono', color: inkOn(c.hex) });
    if (c.print) { const nb = c.print[c0.profiles[0].id].printableNeighbor; S.rect(M.l + half + 12, top2, half, sh, nb, { border: RULE }); S.label(`Press neighbor, ${c0.profiles[0].short}`, M.l + half + 20, top2 + 7, { size: 8.5, k: 'bold', color: inkOn(nb), maxWidth: half - 16 }); S.label(`${nb.toUpperCase()}  (an approximation, not a proof)`, M.l + half + 20, top2 + sh - 16, { size: 8, k: 'mono', color: inkOn(nb), maxWidth: half - 16 }); }
    S.y = top2 + sh + 8;

    const key = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary' }[c.slot];
    S.ensure(50); const ty = S.y; const tw = CW / model.tones.length;
    model.tones.forEach((t, i) => { const hx = model.palette.tones[key][t]; const x = M.l + i * tw; S.rect(x, ty, tw - 2, 20, hx, { border: RULE }); S.label(String(t), x + 2, ty + 23, { size: 6.5, k: 'bold' }); S.label(hx.toUpperCase().slice(1), x + 2, ty + 31, { size: 5.6, k: 'mono', maxWidth: tw - 3 }); });
    S.label(`Tonal palette (${c.slot})`, M.l, ty + 40, { size: 7, color: MUTED });
    S.y = ty + 54;

    S.heading('Rationale', 11, 3);
    if (c.rationale.trim()) { const y0 = S.y; S.text(c.rationale, { size: 9.5, x: M.l + 10, gap: 4 }); S.page.drawLine({ start: { x: M.l + 3, y: PAGE.h - y0 }, end: { x: M.l + 3, y: PAGE.h - (S.y - 4) }, thickness: 1.6, color: hexRgb(RULE) }); }
    else S.text('No rationale was written for this color.', { size: 9, color: MUTED, gap: 4 });

    S.heading('Screen values', 11, 3);
    S.kv2([['Hex', c.hex.toUpperCase()], ['sRGB', c.screen.srgb.join(', ')], ['OKLCH', oklchText(c.screen.oklch)], ['HCT', `hue ${c.screen.hct[0]}, chroma ${c.screen.hct[1]}, tone ${c.screen.hct[2]}`], ['Lab D50', `${c.labD50.l}, ${c.labD50.a}, ${c.labD50.b}`],
      ['Beyond sRGB', c.screen.p3Only ? `P3 only. Mapped into sRGB by reducing chroma; original ${oklchText(c.screen.mappedFrom)}` : 'No']]);

    S.heading('Print values', 11, 3);
    if (c.print) S.table([{ w: 116 }, { w: 84, k: 'mono' }, { w: 90 }, { w: 120 }, { w: 60, k: 'mono' }], ['Profile', 'C / M / Y / K (%)', 'Total ink', 'Print gamut', 'Press neighbor'],
      c0.profiles.map((p) => { const r = c.print[p.id]; return [p.label, cmykText(r.cmyk), tacText(r), r.inGamut ? { text: `in gamut (dE00 ${r.gamutDE00.toFixed(1)})`, color: PASS } : { text: `OUT of gamut (dE00 ${r.gamutDE00.toFixed(1)})`, color: FAIL, k: 'bold' }, { text: r.printableNeighbor.toUpperCase(), swatch: r.printableNeighbor }]; }));
    else S.text('Print data was not available when this sheet was made.', { size: 9, color: MUTED, gap: 6 });

    S.heading('Spot color, approximate', 11, 3);
    if (!c.spot.coated.length && !c.spot.uncoated.length) S.text('No spot values were supplied.', { size: 9, color: MUTED, gap: 6 });
    else S.table([{ w: 60 }, { w: 130 }, { w: 44 }, { w: 84 }, { w: 118 }, { w: 60 }], ['Book', 'Name', 'dE00', 'Match', 'Values from', 'Check'],
      [...c.spot.coated.map((m) => ['Coated', m]), ...c.spot.uncoated.map((m) => ['Uncoated', m])].map(([b, m]) => [b, m.name, m.dE00.toFixed(1), m.band, m.source, m.check === 'none' ? 'not checked' : m.check]));

    S.heading('Accessibility', 11, 3);
    const a = c.accessibility;
    S.kv2([['On white', `${a.vsWhite.toFixed(2)}:1, ${a.textOnWhite ? 'passes AA for text' : a.uiOnWhite ? 'large text and UI only' : 'below 3:1'}`, a.textOnWhite ? PASS : a.uiOnWhite ? WARN : FAIL],
      ['On black', `${a.vsBlack.toFixed(2)}:1, ${a.textOnBlack ? 'passes AA for text' : a.uiOnBlack ? 'large text and UI only' : 'below 3:1'}`, a.textOnBlack ? PASS : a.uiOnBlack ? WARN : FAIL],
      ['APCA (advisory)', `Lc ${a.apca.onWhite} on white, ${a.apca.onBlack} on black. Web only; never applied to print.`],
      ['Color-blind', c.slot === 'primary' ? 'Compared with the other colors in the role checks.' : a.cvdVsSeed.length ? `Collapses against the seed: ${a.cvdVsSeed.map((f) => `${f.type} (dE00 ${f.dE00.toFixed(1)})`).join(', ')}` : 'Stays distinct from the seed under protan, deutan and tritan views.', a.cvdVsSeed.length ? WARN : null]], { keyW: 84 });

    S.heading('Evidence', 11, 3);
    S.text(`Tier: ${c.tier || "designer's choice (no evidence tier)"}`, { size: 9, k: 'bold', gap: 3 });
    for (const e of c.evidence) {
      S.text(`${e.claim}${e.tier ? `  [${e.tier}]` : ''}`, { size: 9, x: M.l + 10, gap: 1 });
      if (e.sources.length) S.text(`Sources: ${e.sources.map((s) => shortCite(s) + (s.url ? ` ${s.url}` : '')).join('; ')}`, { size: 7.5, x: M.l + 10, color: MUTED, gap: 4 }); else S.y += 3;
    }
    if (c.harmonyScore != null) S.text(`Harmony score against the seed ${c.harmonyScore.toFixed(2)}: advisory only; the model (Ou & Luo 2006) was fitted on color patches on gray (R² 0.71), not brand contexts.`, { size: 8, color: MUTED, gap: 6 });

  }

  // ---- Roles and checks -------------------------------------------------------------------------------------------
  S.newPage();
  S.text('Roles, light and dark', { size: 16, k: 'bold', gap: 2 });
  S.text(`${c0.roleModel}. The brand color stays its own token; the primary role sits ${Math.abs(model.palette.brand.lightPrimary.toneGap)} tone steps ${model.palette.brand.lightPrimary.toneGap > 0 ? 'darker' : 'lighter'} in light mode (${model.palette.brand.lightPrimary.hex.toUpperCase()}).`, { size: 9, color: MUTED, gap: 8 });
  const col = (CW - 16) / 2; const y0 = S.y; const rowH = 16; S.ensure(rowH * (ROLES.length + 1));
  ['light', 'dark'].forEach((mode, mi) => {
    const x = M.l + mi * (col + 16); S.label(mode === 'light' ? 'Light' : 'Dark', x, y0, { size: 10, k: 'bold' });
    ROLES.forEach((r, i) => { const hx = model.palette.schemes[mode][r]; const yy = y0 + 16 + i * rowH; S.rect(x, yy, 22, 12, hx, { border: RULE }); S.label(r, x + 28, yy + 1, { size: 8 }); S.label(hx.toUpperCase(), x + col - 52, yy + 1, { size: 8, k: 'mono' }); });
  });
  S.y = y0 + 16 + ROLES.length * rowH + 6;

  S.newPage();
  S.text('Role-pair checks', { size: 16, k: 'bold', gap: 2 });
  S.text(`${c0.wcag}. ${c0.apca}. Color-blind views: ${c0.cvd}.`, { size: 9, color: MUTED, gap: 8 });
  for (const mode of ['light', 'dark']) {
    S.heading(mode === 'light' ? 'Light' : 'Dark', 11, 3);
    S.table([{ w: 200, k: 'mono' }, { w: 60 }, { w: 50 }, { w: 130 }], ['Pair', 'Ratio', 'Needs', 'Result'], model.palette.checks[mode].rows.filter((r, i, arr) => arr.findIndex((x) => x.fg === r.fg && x.bg === r.bg && x.kind === r.kind) === i).map((r) => {
      const pass = r.kind === 'text' ? r.aa : r.pass; const acc = model.accepted.some((f) => f.mode === mode && f.fg === r.fg && f.bg === r.bg && f.kind === r.kind);
      return [pairLabel(r), `${(Math.round(r.ratio * 100) / 100).toFixed(2)}:1`, r.kind === 'text' ? '4.5:1' : '3:1', pass ? { text: 'pass', color: PASS } : acc ? { text: 'accepted with a note', color: WARN, k: 'bold' } : { text: 'FAIL', color: FAIL, k: 'bold' }];
    }));
    const cvd = model.palette.checks[mode].cvd;
    S.text(cvd.length ? `Color-blind collapse (${mode}): ${cvd.map((f) => `${f.a} and ${f.b} under ${f.type} (dE00 ${f.dE00.toFixed(1)})`).join('; ')}. Do not rely on these roles differing by color alone (WCAG 1.4.1).` : `Color-blind views (${mode}): primary, secondary, tertiary and error stay distinct under protan, deutan and tritan simulation.`, { size: 8.5, color: MUTED, gap: 8 });
  }

  // ---- header and footer on every page ----------------------------------------------------------------------------
  const total = S.pages.length;
  const footer = `Print values: ${byRegion(c0.profiles)}; ${c0.intent}; lookup tables built with LittleCMS. Swatches on screen and on paper are approximations, not proofs. Spot names are approximate, from values pasted by the designer (${model.spotDataset.entries} entr${model.spotDataset.entries === 1 ? 'y' : 'ies'}, Lab ${model.spotDataset.illuminant}) and not checked against a physical guide; verify under D50 light before a client commits. Pantone is a trademark of its owner.`;
  S.pages.forEach((page, i) => {
    S.page = page; S.pageIndex = i;
    S.label(`${model.name} | brand color specification`, M.l, 24, { size: 7.5, color: MUTED, maxWidth: CW - 80 });
    const pn = `Page ${i + 1} of ${total}`; S.label(pn, PAGE.w - M.r - S.width(pn, 7.5), 24, { size: 7.5, color: MUTED });
    page.drawLine({ start: { x: M.l, y: PAGE.h - 38 }, end: { x: PAGE.w - M.r, y: PAGE.h - 38 }, thickness: 0.5, color: hexRgb(RULE) });
    page.drawLine({ start: { x: M.l, y: M.bottom - 12 }, end: { x: PAGE.w - M.r, y: M.bottom - 12 }, thickness: 0.5, color: hexRgb(RULE) });
    S.wrap(footer, 6.6, 'regular', CW).forEach((ln, j) => S.label(ln, M.l, PAGE.h - M.bottom + 16 + j * 8.6, { size: 6.6, color: MUTED }));
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  const warnings = S.replaced.size ? [`${S.replaced.size} character${S.replaced.size === 1 ? '' : 's'} (${[...S.replaced].slice(0, 8).join(' ')}) cannot be shown in the PDF's built-in font and appear as "?". The Markdown and token files hold the exact text.`] : [];
  return { bytes, warnings, pages: total, boxes: S.boxes };
}
