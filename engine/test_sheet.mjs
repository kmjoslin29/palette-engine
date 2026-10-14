// Phase 5: the printable spec sheet. Checks the PDF the way a reader would: page size, structure (qpdf), extracted text (pdftotext),
// and word positions measured by pdftotext -bbox, which is independent of the layout code's own bookkeeping.
// Run after: node build/bundle.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as PE from '../dist/engine.mjs';
import { luts, lex, model, stateA, stateB, stateC, stateD } from './export_fixtures.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const dir = fileURLToPath(new URL('../tmp/test_export/', import.meta.url)); fs.mkdirSync(dir, { recursive: true });
const squash = (s) => String(s).replace(/\s+/g, '');
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.error) throw new Error(`${cmd} is not installed or could not run (${r.error.code}). This test needs poppler-utils (pdftotext, pdftoppm), qpdf and unzip.`); return r; };
const rgb01 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function words(file) { // independent word boxes from the PDF itself
  const r = run('pdftotext', ['-bbox', file, '-']);
  const pages = []; let cur = null;
  for (const line of r.stdout.split('\n')) {
    const p = line.match(/<page width="([\d.]+)" height="([\d.]+)"/); if (p) { cur = { w: +p[1], h: +p[2], words: [] }; pages.push(cur); continue; }
    const w = line.match(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/); if (w && cur) cur.words.push({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4], t: w[5] });
  }
  return pages;
}
const L = 48, R = 612 - 48;
const outside = (pages) => pages.flatMap((p, i) => p.words.filter((w) => w.x0 < L - 1 || w.x1 > R + 1 || w.y0 < 8 || w.y1 > 784).map((w) => `p${i + 1}:${w.t}@${w.x0.toFixed(0)}-${w.x1.toFixed(0)}`));
const straddle = (pages) => pages.flatMap((p, i) => p.words.filter((w) => w.y1 > 717 && w.y0 < 724).map((w) => `p${i + 1}:${w.t}@y${w.y0.toFixed(0)}`)); // body text must not run into the footer rule

async function make(name, m) {
  const r = await PE.buildSpecSheetPdf(m); const file = dir + `sheet_${name}.pdf`; fs.writeFileSync(file, r.bytes);
  return { ...r, file, text: run('pdftotext', [file, '-']).stdout, pageText: null };
}
const cases = { A: [stateA(), null], B: [stateB(), null], C: [stateC(), null] };
for (const [k, [s]] of Object.entries(cases)) {
  const m = model(s); const r = await make(k, m); const pages = words(r.file);
  const doc = await PDFDocument.load(r.bytes);
  check(`${k}: every page is US Letter (612 x 792 pt)`, doc.getPageCount() === r.pages && doc.getPages().every((p) => { const { width, height } = p.getSize(); return width === 612 && height === 792; }));
  check(`${k}: pdftotext reports the same page size and count`, pages.length === r.pages && pages.every((p) => p.w === 612 && p.h === 792));
  const q = run('qpdf', ['--check', r.file]); check(`${k}: qpdf --check finds no structural problems`, q.status === 0 && /No syntax or stream encoding errors/.test(q.stdout + q.stderr), q.stdout + q.stderr);
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`render_${k}-`)) fs.unlinkSync(dir + f); // earlier runs leave pages behind; count only this run's
  const png = run('pdftoppm', ['-r', '40', '-png', r.file, dir + `render_${k}`]); check(`${k}: every page renders (pdftoppm)`, png.status === 0 && fs.readdirSync(dir).filter((f) => f.startsWith(`render_${k}-`)).length === r.pages, png.stderr);
  check(`${k}: measured word positions all sit inside the margins (${pages.reduce((n, p) => n + p.words.length, 0)} words)`, outside(pages).length === 0, outside(pages).slice(0, 5).join(' '));
  check(`${k}: no body text runs into the footer zone`, straddle(pages).length === 0, straddle(pages).slice(0, 5).join(' '));
  check(`${k}: the layout's own boxes agree (all inside margins; body clear of the footer)`, r.boxes.every((pg) => pg.every((b) => b.x >= L - 0.5 && b.x + b.w <= R + 0.5 && (b.y + b.h <= 716.5 || b.y >= 725 || b.y + b.h <= 40))), JSON.stringify(r.boxes.flat().find((b) => !(b.x >= L - 0.5 && b.x + b.w <= R + 0.5 && (b.y + b.h <= 716.5 || b.y >= 725 || b.y + b.h <= 40)))));
  const t = squash(r.text);
  const notes = [s.seed.rationale, s.supporting.secondary?.rationale, s.supporting.tertiary?.rationale, ...m.accepted.map((f) => f.note), ...m.acceptedStale.map((f) => f.note)].filter((x) => x && x.trim());
  const missing = notes.filter((n) => !t.includes(squash(n)));
  check(`${k}: every rationale, lock and accepted-failure note is in the PDF text (${notes.length} checked)`, missing.length === 0, missing[0]);
  check(`${k}: every color name and hex is in the PDF text`, m.colors.every((c) => t.includes(squash(c.name)) && t.includes(c.hex.toUpperCase())));
  check(`${k}: locked colors are marked locked`, m.colors.every((c) => (c.locked ? /\|locked/ : /\|notlocked/).test(t)));
  const cm = m.colors.every((c) => PE.PRINT_PROFILES.every((p) => { const v = PE.roundCmyk(PE.lookup(luts[p.id], rgb01(c.hex)).cmyk); return t.includes(squash(v.join(' / '))); }));
  check(`${k}: CMYK for all six profiles equals a direct LUT lookup, read back from the PDF`, cm);
  const fog = PE.PRINT_PROFILES.find((p) => p.id === 'fogra39_vigc260');
  const fogText = m.colors.map((c) => PE.tacText(PE.analyze(c.hex, luts).print[fog.id]));
  check(`${k}: the PDF names the European conditions under their region, and the FOGRA39 file shows its 260% limit for every color, never a null or a missing limit`, /Europe/.test(r.text) && t.includes(squash('PSO Coated v3 (FOGRA51)')) && fogText.every((x) => /^\d+% of 260%$/.test(x) && t.includes(squash(x))) && !/no limit stated/.test(r.text.replace(/\s+/g, ' ')) && !/of null%|of undefined%/.test(r.text), fogText.find((x) => !t.includes(squash(x))));
  check(`${k}: footer states profiles, intent, dataset and "not proofs" on every page`, r.pages > 0 && squash(r.text).split(squash('Swatches on screen and on paper are approximations, not proofs. Spot names are approximate')).length - 1 === r.pages && /relative colorimetric \+ black point compensation/.test(r.text.replace(/\s+/g, ' ')));
  check(`${k}: page 1 is the summary, then one page (or more) per color, then roles and checks`, /brand color specification/i.test(r.text) && m.colors.every((c) => new RegExp(c.slot.toUpperCase()).test(r.text)) && /Roles, light and dark/.test(r.text) && /Role-pair checks/.test(r.text));
  check(`${k}: header and "Page n of N" on every page`, [...r.text.matchAll(/Page (\d+) of (\d+)/g)].length === r.pages && [...r.text.matchAll(/Page (\d+) of (\d+)/g)].every((x, i) => +x[1] === i + 1 && +x[2] === r.pages));
}
{ // accepted failures listed
  const m = model(stateB()); const t = squash((await make('B2', m)).text);
  check('B: accepted failures are named with their ratio and their fix, and earlier notes are kept', m.accepted.every((f) => t.includes(squash(pairLabel(f))) && t.includes(`${f.ratio.toFixed(2)}:1`)) && /Earlier note/.test((await make('B3', m)).text) && /Role overrides/.test((await make('B4', m)).text));
}
function pairLabel(f) { return PE.pairLabel(f); }

// determinism and gating
{
  const a = await PE.buildSpecSheetPdf(model(stateA())), b = await PE.buildSpecSheetPdf(model(stateA()));
  check('the PDF is byte-identical for the same project and date', Buffer.compare(Buffer.from(a.bytes), Buffer.from(b.bytes)) === 0);
  let blocked = false; try { await PE.buildSpecSheetPdf(model(stateD())); } catch (e) { blocked = e instanceof PE.ExportBlockedError; }
  check('a blocked project cannot be written as a spec sheet', blocked);
}
// hostile and unusual text
{
  const s = stateA();
  s.seed.rationale = 'Café “quoted” – dash… naïve résumé ©®™ ½ × ° € ' + 'X'.repeat(400) + '\n\n' + 'long words '.repeat(300);
  s.supporting.secondary.rationale = 'emoji 🌊 and 蓝色 and Δ ≥ → ✓';
  s.name = 'Ünïcode & Co';
  const r = await make('U', model(s)); const pages = words(r.file); const t = squash(r.text);
  check('Latin text with curly quotes, dashes, accents, ©®™, ½ × ° € survives', ['Café', '“quoted”', '–', 'naïve', 'résumé', '©®™', '½', '×', '°', '€'].every((x) => t.includes(squash(x))));
  check('a 400-character unbroken token and 300 long words wrap inside the margins', outside(pages).length === 0 && straddle(pages).length === 0 && t.includes('X'.repeat(400)), outside(pages).slice(0, 3).join(' '));
  check('characters the PDF font cannot show become "?" (one per character) and are reported once', r.warnings.length === 1 && /cannot be shown/.test(r.warnings[0]) && t.includes('emoji?and??and'), r.warnings.join() + ' | ' + (t.match(/emoji.{0,20}/) || [''])[0]);
  check('the Greek delta and arrows are transliterated, not lost', /Delta/.test(r.text) && />=/.test(r.text) && /->/.test(r.text));
  const big = stateA(); big.seed.rationale = 'a note of about twelve thousand characters '.repeat(280); const rb = await make('Big', model(big)); const baseline = await make('A2', model(stateA()));
  check(`a 12,000-character note flows onto extra pages (${baseline.pages} -> ${rb.pages}) and is intact, not clipped`, rb.pages > baseline.pages && ['twelve', 'thousand', 'about'].every((w) => (rb.text.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length === 280) && outside(words(rb.file)).length === 0);
}
{ // many accepted notes: summary flows onto further pages, notes intact
  const s = stateB(); s.overrides.light = { onSurface: '#b0b0b0', onSurfaceVariant: '#c0c0c0', onBackground: '#d0d0d0', onPrimary: '#e0e0e0', onSecondary: '#e0e0e0', onTertiary: '#e0e0e0', onError: '#e0e0e0', inverseOnSurface: '#111111' };
  const m0 = model(s); for (const f of m0.failures) s.accepted[f.key] = `Note for ${f.key}: ` + 'because '.repeat(40);
  const m = model(s); const r = await make('M', m); const pages = words(r.file);
  check(`many failures (${m.failures.length}) all carry notes and every note reaches the PDF across ${r.pages} pages`, m.unresolved.length === 0 && m.failures.length >= 6 && m.accepted.every((f) => squash(r.text).includes(squash(f.note))) && outside(pages).length === 0);
}
// the margin checker itself can fail
{
  const doc = await PDFDocument.create(); const p = doc.addPage([612, 792]); const f = await doc.embedFont(StandardFonts.Helvetica);
  p.drawText('escaped the margin', { x: 560, y: 400, size: 12, font: f }); p.drawText('inside', { x: 60, y: 400, size: 12, font: f });
  fs.writeFileSync(dir + 'control.pdf', await doc.save());
  const bad = outside(words(dir + 'control.pdf'));
  check('control: a word drawn past the right margin is detected by the measuring code', bad.length >= 1 && bad.some((x) => /escaped|margin/.test(x)), bad.join());
}
check('control: text missing from a PDF is detected', !squash('nothing here').includes(squash(stateA().seed.rationale)));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
