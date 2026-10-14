// Palette Engine — M4 spot scorer ("bring your own values").
// The designer pastes candidate Pantone names with Lab values from a licensed
// source; this scores them against a target by CIEDE2000, per book (C / U).

import { converter, parse } from 'culori';
import { de00 } from './de.js';

const toLab = converter('lab'); // CIELAB D50

// Match-quality bands from the research foundation (industry practice, not a standard).
export const BANDS = [
  { max: 1, label: 'Near-identical' },
  { max: 2, label: 'Close' },
  { max: 3, label: 'Acceptable' },
  { max: 5, label: 'Loose' },
  { max: Infinity, label: 'No good match' },
];

/** Band from the value as displayed (1 decimal), so label and number always agree. */
export function band(dE) {
  const shown = Math.round(dE * 10) / 10;
  return BANDS.find((b, i) => (i < 3 ? shown < b.max : shown <= b.max)).label;
}

function bookOf(name, explicit) {
  const e = (explicit || '').trim().toUpperCase();
  if (e === 'C' || e === 'COATED') return 'C';
  if (e === 'U' || e === 'UNCOATED') return 'U';
  const m = name.trim().match(/\s(C|U|CP|UP)$/i);
  if (!m) return null;
  return m[1].toUpperCase().startsWith('C') ? 'C' : 'U';
}

/**
 * Parse pasted lines. Accepted per line (comma, tab or semicolon separated):
 *   name, L, a, b [, C|U]      Lab values (D50 unless opts.illuminant === 'D65')
 *   name, #RRGGBB [, C|U]      screen hex: accepted but marked weaker
 * Returns { entries, errors }.
 */
export function parseEntries(text, opts = {}) {
  const entries = [], errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#!') || /^name\b/i.test(line)) return;
    const parts = line.split(/\s*[,;\t]\s*/).filter(Boolean);
    const name = parts[0];
    let lab = null, source = 'lab';
    const nums = parts.slice(1, 4).map(Number);
    if (parts.length >= 4 && nums.every(Number.isFinite)) {
      const [l, a, b] = nums;
      if (l < 0 || l > 100 || Math.abs(a) > 160 || Math.abs(b) > 160) {
        errors.push({ line: i + 1, text: line, reason: 'Lab values out of range' });
        return;
      }
      lab = opts.illuminant === 'D65'
        ? toLab({ mode: 'lab65', l, a, b }) // Bradford-adapted to D50
        : { mode: 'lab', l, a, b };
    } else if (parts[1] && parse(parts[1])) {
      lab = toLab(parse(parts[1]));
      source = 'hex';
    } else {
      errors.push({ line: i + 1, text: line, reason: 'Expected name, L, a, b or name, #hex' });
      return;
    }
    const explicit = parts.length >= 5 ? parts[4] : source === 'hex' ? parts[2] : undefined;
    const book = bookOf(name, explicit);
    if (!book) {
      errors.push({ line: i + 1, text: line, reason: 'Add " C" or " U" to the name, or a C/U column' });
      return;
    }
    entries.push({ name, book, lab, source, check: 'none' });
  });
  return { entries, errors };
}

/**
 * Score entries against a target Lab D50 ({l, a, b}). Returns top `k` per book,
 * each with dE00 (1 decimal), band, and notes.
 */
export function score(targetLab, entries, k = 3) {
  const target = { mode: 'lab', ...targetLab };
  const result = { C: [], U: [] };
  for (const e of entries) {
    const d = de00(target, e.lab);
    result[e.book].push({
      name: e.name, dE00: Math.round(d * 10) / 10, dE00Raw: d, band: band(d), source: e.source,
      check: e.check, lab: { l: e.lab.l, a: e.lab.a, b: e.lab.b },
      note: e.source === 'hex' ? 'Scored from a screen hex, not measured Lab: weaker' : undefined,
    });
  }
  for (const b of ['C', 'U']) result[b] = result[b].sort((x, y) => x.dE00Raw - y.dE00Raw).slice(0, k);
  return result;
}
