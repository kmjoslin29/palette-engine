// Palette Engine — M8 descriptor matcher.
// Descriptor words -> approved lexicon rows -> 3-5 seed candidates.
//   * Unknown words are flagged, never guessed.
//   * Hard constraints (OKLCH L and C ranges, Ou 2004 models) are intersected in input
//     order; a term that would empty the intersection is dropped and reported as a conflict.
//   * Soft evidence (color words through the bridge regions, hue-family weights,
//     lightness/chroma nudges) scores a fixed grid of real sRGB colors.
//   * Seeds come from the top-weighted hue families. Fully deterministic: same input,
//     same output.
// Seeds are ranked by evidence fit ONLY. Accessibility (WCAG, APCA advisory, color-blind)
// is reported beside each seed and never re-ranks or hides one (Kwade, phase 4 rule).
// Every scoring constant is an engineering choice (low confidence), not a finding.

import { converter } from 'culori';
import { hexFromOklch, inSrgbGamut } from './color.js';
import { accessibilityOf } from './harmony.js';

const toLab65 = converter('lab65');
export const TIER_RANK = { speculative: 0, 'low confidence': 1, 'supported but contested': 2, 'well-established': 3 };
const round = (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n;

// --- Ou, Luo, Woodcock & Wright (2004) single-color models, CIELAB D65 -----------------
// Mirror of build/build_lexicon.py#ou_scores (parity tested against Python vectors).
export function ouScores(hex) {
  const { l: L, a, b } = toLab65(hex);
  const C = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const rad = (d) => (d * Math.PI) / 180;
  return {
    'ou2004.WC': -0.5 + 0.02 * C ** 1.07 * Math.cos(rad(h - 50)),
    'ou2004.HL': -2.1 + 0.05 * (100 - L),
    'ou2004.AP': -1.1 + 0.03 * Math.sqrt(C ** 2 + ((L - 50) / 1.5) ** 2),
    'ou2004.HS': 11.1 + 0.03 * (100 - L) - 11.4 * C ** 0.02,
  };
}

// --- Lexicon index ------------------------------------------------------------------------
// How a word can reach a row, strongest first:
//   term / synonym      the row's own term or an approved synonym            row tier
//   study word          a word the source study itself used (Aaker's items)  row tier
//   word form           an inflection of any of the above ("calming")        row tier (same word)
//   strong synonym      a near-identical word the studies did not use        row tier lowered one step
// Weak synonyms and merely related words are not matched; they are flagged as unknown.

/** Irregular word forms the suffix rules cannot reach. Each maps to a word already in the lexicon. Same tier: it is the same word. */
export const WORD_FORMS = {
  empathy: 'empathetic', humor: 'humorous', humour: 'humorous', curiosity: 'curious', luxury: 'luxurious', adventure: 'adventurous',
  elegance: 'elegant', energy: 'energetic', creativity: 'creative', innovation: 'innovative', imagination: 'imaginative',
  intelligence: 'intelligent', confidence: 'confident', reliability: 'reliable', honesty: 'honest', joyous: 'joyful',
  affection: 'affectionate', romance: 'romantic', trust: 'trustworthy', modernity: 'modern', dependability: 'dependable',
  durability: 'durable', vibrancy: 'vibrant', intensity: 'intense', saturation: 'saturated', serenity: 'serene',
  tranquility: 'tranquil', tranquillity: 'tranquil', youth: 'youthful', glamour: 'glamorous', glamor: 'glamorous',
  sophistication: 'sophisticated', competency: 'competent', security: 'secure', excitement: 'exciting', grace: 'graceful',
  independence: 'independent', leadership: 'leader',
};
/** Words the suffix rules would wrongly fold into a lexicon word. */
const FORM_BLOCK = new Set(['really', 'lighting', 'contents', 'lightly', 'darling']);
const LOWER = { 'well-established': 'supported but contested', 'supported but contested': 'low confidence', 'low confidence': 'speculative', speculative: 'speculative' };
export const lowerTier = (t) => LOWER[t] ?? 'speculative';

// --- Lightness range the lightness leans were measured on ---------------------------------
// The L nudges come from Labrecque & Milne (2012) Study 2: red, green, blue and purple at HSV saturation 100% / 42% and value 100% / 58%.
// The lean is a two-level contrast, so it is only followed inside the lightness those stimuli covered (D35). Per hue family where the study had
// that color (its four stimuli; a light, desaturated stimulus can sit in a neighboring OKLCH family but still counts for its own color);
// the pooled range of all sixteen stimuli otherwise.
const toOk = converter('oklch');
const LM2012_HUES = { red: 0, green: 120, blue: 240, purple: 270 }; // the study's four colors, as HSV hues
const testedCache = new WeakMap();
/** Tested OKLCH L range per study color, filed under the hue family its full-strength stimulus falls in; plus the pooled range. */
export function leanTestedRange(fam) {
  if (testedCache.has(fam)) return testedCache.get(fam);
  const byFamily = {}; let lo = 1, hi = 0;
  for (const h of Object.values(LM2012_HUES)) {
    const ls = [1, 0.42].flatMap((s) => [1, 0.58].map((v) => toOk({ mode: 'hsv', h, s, v }).l));
    const full = toOk({ mode: 'hsv', h, s: 1, v: 1 });
    byFamily[familyOf(full.h ?? 0, full.c ?? 0, fam)] = [round(Math.min(...ls), 2), round(Math.max(...ls), 2)];
    lo = Math.min(lo, ...ls); hi = Math.max(hi, ...ls);
  }
  const r = { byFamily, pooled: [round(lo, 2), round(hi, 2)] };
  testedCache.set(fam, r); return r;
}
const testedFor = (family, fam) => { const t = leanTestedRange(fam); return t.byFamily[family] || t.pooled; };

/** lex = data/lexicon.json contents. Returns a phrase index (lowercase, hyphen/space-insensitive). */
export function indexLexicon(lex) {
  const norm = (s) => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = new Map();
  const add = (w, r, via, strong = false) => { const k = norm(w); if (k && !phrases.has(k)) phrases.set(k, { row: r, via, strong }); };
  for (const r of lex.rows) add(r.term, r, 'term');
  for (const r of lex.rows) for (const s of r.synonyms || []) add(s, r, `synonym of "${r.term}"`);
  for (const r of lex.rows) for (const s of r.studyWords || []) add(s, r, `study word for "${r.term}"`);
  for (const r of lex.rows) for (const s of r.strongSynonyms || []) add(s, r, `strong synonym of "${r.term}"`, true);
  const maxWords = Math.max(...[...phrases.keys()].map((k) => k.split(' ').length));
  return { lex, phrases, maxWords, norm, vocabulary: [...new Set(lex.rows.map((r) => r.term))].sort() };
}

/** Candidate base words for one input word (suffix rules, most specific first). */
export function baseForms(w) {
  const out = [];
  const undouble = (x) => (/([b-df-hj-np-tv-z])\1$/.test(x) ? x.slice(0, -1) : null);
  const push = (...xs) => { for (const x of xs) if (x && x.length >= 3) out.push(x); };
  if (w.endsWith('iness')) push(w.slice(0, -5) + 'y');
  if (w.endsWith('ness')) push(w.slice(0, -4));
  if (w.endsWith('ily')) push(w.slice(0, -3) + 'y');
  if (w.endsWith('ly')) push(w.slice(0, -2));
  if (w.endsWith('ing')) { const b = w.slice(0, -3); push(b, b + 'e', undouble(b)); }
  if (w.endsWith('ed')) { const b = w.slice(0, -2); push(b, w.slice(0, -1), undouble(b)); }
  if (w.endsWith('est')) { const b = w.slice(0, -3); push(b, b + 'e', undouble(b)); }
  if (w.endsWith('er')) { const b = w.slice(0, -2); push(b, b + 'e', undouble(b)); }
  if (w.endsWith('ies')) push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) push(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) push(w.slice(0, -1));
  return out;
}

function formHit(word, index) {
  if (FORM_BLOCK.has(word) || index.phrases.has(word)) return null;
  const irregular = WORD_FORMS[word];
  if (irregular && index.phrases.has(irregular)) return { base: irregular, ...index.phrases.get(irregular) };
  for (const b of baseForms(word)) {
    const target = index.phrases.get(b) ? b : WORD_FORMS[b];
    if (target && index.phrases.has(target)) return { base: target, ...index.phrases.get(target) };
  }
  return null;
}

/**
 * Longest-phrase-first match of comma/space separated input, then word forms. Returns { matched, unknown }.
 * A hyphenated word is one unit: it matches as a whole ("up-to-date", "hard-working") or is reported unknown as a whole
 * ("soft-hearted" is not read as "soft").
 */
export function matchTerms(text, index) {
  const raw = text.replace(/[,;/&]|\band\b/gi, ' ').split(/\s+/).map((u) => u.toLowerCase().replace(/^[-_]+|[-_]+$/g, '')).filter((u) => index.norm(u));
  const units = raw.map((u) => index.norm(u));
  const matched = [], unknown = [], at = new Map();
  for (let i = 0; i < units.length; ) {
    let hit = null;
    for (let n = Math.min(index.maxWords, units.length - i); n >= 1 && !hit; n--) {
      const phrase = units.slice(i, i + n).join(' ');
      if (index.phrases.has(phrase)) hit = { phrase, n, ...index.phrases.get(phrase) };
    }
    if (!hit && !units[i].includes(' ')) {
      const f = formHit(units[i], index);
      if (f) hit = { phrase: units[i], n: 1, row: f.row, strong: f.strong, via: `word form of "${f.base}" (${f.via === 'term' ? 'term' : f.via})` };
    }
    if (hit) {
      const rec = { input: hit.phrase, id: hit.row.id, term: hit.row.term, via: hit.via, strong: !!hit.strong, tier: hit.strong ? lowerTier(hit.row.tier) : hit.row.tier };
      const k = at.get(hit.row.id);
      if (k === undefined) { at.set(hit.row.id, matched.length); matched.push(rec); }
      else if (matched[k].strong && !rec.strong) matched[k] = rec; // a direct match outranks a strong-synonym match of the same row
      i += hit.n;
    } else { unknown.push(raw[i]); i += 1; }
  }
  return { matched, unknown };
}

// --- Geometry helpers ---------------------------------------------------------------------
function familyOf(h, c, fam) {
  if (c < fam.neutral.C_max) return 'neutral';
  for (const f of fam.families) {
    const [a, b] = f.h;
    if (a <= b ? h >= a && h < b : h >= a || h < b) return f.id;
  }
  return 'red';
}
const inRange = (x, r) => !r || ((r[0] == null || x >= r[0]) && (r[1] == null || x <= r[1]));
function intersect(a, b) {
  if (!a && !b) return null;
  if (!a) return b; if (!b) return a;
  const lo = a[0] == null ? b[0] : b[0] == null ? a[0] : Math.max(a[0], b[0]);
  const hi = a[1] == null ? b[1] : b[1] == null ? a[1] : Math.min(a[1], b[1]);
  return [lo, hi];
}
const empty = (r) => r && r[0] != null && r[1] != null && r[0] > r[1];

/** Soft contribution of one term at one color: color words via bridge regions + hue weights + nudges. */
function contribution(row, pt, fam) {
  const t = row.targets;
  let s = 0;
  const parts = [];
  for (const [word, w] of Object.entries(t.colorTerms || {})) {
    const reg = fam.colorTerms.regions[word];
    if (!reg) continue;
    const factor = inRange(pt.l, reg.L) && inRange(pt.c, reg.C) ? reg.families[pt.family] ?? 0 : 0;
    if (factor) { s += w * factor; parts.push({ word, weight: w, factor }); }
  }
  for (const [f, w] of Object.entries(t.hueWeights || {})) if (f === pt.family) { s += w; parts.push({ family: f, weight: w }); }
  for (const [axis, n] of Object.entries(t.nudges || {})) {
    if (n.beta == null) continue;
    // The studies compared two levels (high vs low), so this is a two-level lean, not a line to extrapolate:
    // high = L >= 0.6 (or C >= 0.18), low = L <= 0.4 (or C <= 0.12), nothing in between. Half the beta is the lean.
    const x = axis === 'L' ? pt.l : Math.min(pt.c / 0.3, 1);
    const side = x >= 0.6 ? 1 : x <= 0.4 ? -1 : 0;
    if (side) { s += 0.5 * n.beta * side; parts.push({ nudge: axis, beta: n.beta, side }); }
  }
  return { s, parts };
}
const hasSoft = (row) => { const t = row.targets; return Object.keys(t.colorTerms || {}).length || Object.keys(t.hueWeights || {}).length || Object.keys(t.nudges || {}).length; };
const hasHard = (row) => { const t = row.targets; return !!(t.L || t.C || (t.models && t.models.length)); };

// Seeds are brand-usable colors: OKLCH L 0.25-0.95. Near-black is excluded because Ou's models were fitted on
// mid-lightness patches (they call any near-black "passive" and "hard") and no brand hue lives there.
function grid(fam) {
  const pts = [];
  for (let h = 0; h < 360; h += 15) for (let li = 5; li <= 19; li++) for (let ci = 0; ci <= 15; ci++) {
    const l = li * 0.05, c = ci * 0.02;
    const o = { mode: 'oklch', l, c, h };
    if (!inSrgbGamut(o)) continue;
    pts.push({ l: round(l, 2), c: round(c, 2), h, family: familyOf(h, c, fam), hex: hexFromOklch(o) });
  }
  // achromatic ramp (hue is meaningless at C=0; one hue only so it isn't counted 24 times)
  return pts.filter((p) => p.c > 0 || p.h === 0);
}

/**
 * index: from indexLexicon(). text: the designer's words. Returns
 * { matched, unknown, conflicts, dropped, noHueSignal, constraints, seeds, note }.
 */
export function matchDescriptors(text, index, opts = {}) {
  const { count = 5 } = opts;
  const fam = index.lex.families;
  const { matched, unknown } = matchTerms(text, index);
  // A row reached only through a strong synonym carries its tier lowered one step (the study did not use that word).
  const rows = matched.map((m) => { const r = index.lex.rows.find((x) => x.id === m.id); return m.strong ? { ...r, tier: m.tier, viaStrongSynonym: m.input } : r; });
  const out = { matched, unknown, conflicts: [], dropped: [], noHueSignal: false, constraints: { L: null, C: null, models: [] }, seeds: [], note: null };
  if (!rows.length) { out.note = unknown.length ? 'No word matched the lexicon. Unknown words are flagged, not guessed.' : 'Enter some descriptor words.'; return out; }

  // 1. Intersect hard ranges in input order; a term that would empty an interval is dropped.
  const kept = [];
  let L = null, C = null;
  for (const r of rows) {
    const nL = intersect(L, r.targets.L), nC = intersect(C, r.targets.C);
    if (empty(nL) || empty(nC)) {
      const axis = empty(nL) ? 'L' : 'C';
      const other = kept.find((k) => k.targets[axis] && empty(intersect(k.targets[axis], r.targets[axis])));
      out.conflicts.push({ type: 'range', axis: axis === 'L' ? 'lightness' : 'chroma', terms: [other?.term, r.term].filter(Boolean),
        detail: `"${r.term}" (${fmt(r.targets[axis])}) cannot be met together with "${other?.term}" (${fmt(other?.targets[axis])}), so "${r.term}" is left out.` });
      out.dropped.push(r.term);
      continue;
    }
    L = nL; C = nC; kept.push(r);
  }
  const models = kept.flatMap((r) => (r.targets.models || []).map((m) => ({ ...m, term: r.term })));

  // 2. Feasible real sRGB colors: ranges + Ou models. If none, drop the latest model-bearing terms until some exist.
  const all = grid(fam);
  const pass = (p, ms) => inRange(p.l, L) && inRange(p.c, C) && ms.every((m) => ouScores(p.hex)[m.eq] * m.sign > (m.min ?? 0));
  let active = models.slice(), feas = all.filter((p) => pass(p, active));
  while (!feas.length && active.length) {
    const last = active[active.length - 1];
    out.conflicts.push({ type: 'infeasible', terms: [last.term], detail: `No sRGB color meets "${last.term}" together with the other terms, so "${last.term}" is left out.` });
    out.dropped.push(last.term);
    active = active.filter((m) => m.term !== last.term);
    feas = all.filter((p) => pass(p, active));
  }
  const dropped = new Set(out.dropped);
  const live = kept.filter((r) => !dropped.has(r.term));
  out.constraints = { L, C, models: active.map((m) => ({ term: m.term, eq: m.eq, sign: m.sign, min: m.min ?? 0 })) };
  if (!feas.length) { out.note = 'No sRGB color satisfies these terms together.'; return out; }

  // 3. Hue conflicts: one term pulls toward a color word another term pushes against.
  for (let i = 0; i < live.length; i++) for (let j = 0; j < live.length; j++) {
    if (i === j) continue;
    for (const [w, a] of Object.entries(live[i].targets.colorTerms || {})) {
      const b = (live[j].targets.colorTerms || {})[w];
      if (a > 0 && b < 0) out.conflicts.push({ type: 'hue', terms: [live[i].term, live[j].term], word: w,
        detail: `"${live[i].term}" favors ${w} (+${a.toFixed(2)}); "${live[j].term}" works against it (${b.toFixed(2)}).` });
    }
  }

  // 4. Score every feasible color by the evidence of the live terms.
  const softRows = live.filter(hasSoft);
  out.noHueSignal = !live.some((r) => Object.keys(r.targets.colorTerms || {}).length || Object.keys(r.targets.hueWeights || {}).length);
  let scored = feas.map((p) => {
    let s = 0; const per = {};
    let hue = 0; // evidence about WHICH color (color words, hue weights), as opposed to lightness/chroma leans
    for (const r of live) {
      const c = contribution(r, p, fam); per[r.id] = c; s += c.s;
      for (const part of c.parts) if (part.word) hue += part.weight * part.factor; else if (part.family) hue += part.weight;
    }
    return { ...p, score: round(s, 3), hueScore: round(hue, 3), per, dist: anchorDistance(p, live, per, fam) };
  });
  // Tie-break among equal scores (D34). 'lean' (default): first follow the net lightness lean of the live terms (darker for competence and
  // ruggedness, lighter for sincerity), then the color nearest the study's measured patch. 'anchor': the patch only (the rule before D34).
  const lean = live.reduce((t, r) => t + (r.targets.nudges?.L?.beta ?? 0), 0);
  // Within the tested range, darker (or lighter) wins; a color outside it ranks after every in-range color of the same score.
  const leanKey = (opts.tieBreak ?? 'lean') === 'lean' && lean !== 0 ? (p) => {
    const [a, b] = testedFor(p.family, fam), inside = p.l >= a - 1e-9 && p.l <= b + 1e-9;
    return inside ? (lean < 0 ? p.l : -p.l) : 1 + (p.l < a ? a - p.l : p.l - b);
  } : () => 0;
  scored.sort((a, b) => b.score - a.score || leanKey(a) - leanKey(b) || a.dist - b.dist || a.h - b.h || a.l - b.l || a.c - b.c);

  // 5. Seeds: best color of each of the top-weighted families; then spread further if fewer than 3.
  const seeds = [];
  const byFam = new Map();
  for (const p of scored) if (!byFam.has(p.family)) byFam.set(p.family, p);
  let famOrder = [...byFam.values()];
  if (out.noHueSignal) {
    // No hue evidence: spread across the families that have feasible colors, in hue order, best of each.
    const order = fam.families.map((f) => f.id).concat('neutral');
    famOrder = order.filter((f) => byFam.has(f)).map((f) => byFam.get(f));
    famOrder = spread(famOrder, count);
  } else famOrder = famOrder.filter((p) => p.hueScore > 0); // a family needs hue evidence; a lightness lean alone is not a reason for a hue
  for (const p of famOrder.slice(0, count)) seeds.push(p);
  // Fewer than 3 hue families with evidence: add variants within the families that already have a seed. Each new
  // variant is the candidate farthest (OKLab distance) from the seeds so far, among those with real hue evidence and
  // at least half the top score. Never seeds from unrelated hues on a lightness lean alone; never padded past the evidence.
  const top = seeds.length ? seeds[0].score : 0;
  const famsWithSeed = new Set(seeds.map((p) => p.family));
  // Neutral-family points are treated as true grays (chroma 0) for distance, so a gray variant is chosen by lightness alone and, among equal
// scores, the true gray (first in the sort) wins over a faintly tinted point (D41).
const ab = (p) => (p.family === 'neutral' ? [p.l, 0, 0] : [p.l, p.c * Math.cos((p.h * Math.PI) / 180), p.c * Math.sin((p.h * Math.PI) / 180)]);
  const gap = (p, q) => Math.hypot(...ab(p).map((v, i) => v - ab(q)[i]));
  const MIN_GAP = 0.05; // OKLab distance for "a visibly different variant" (engineering choice)
  const pool = out.noHueSignal ? scored : scored.filter((p) => famsWithSeed.has(p.family) && p.hueScore > 0 && p.score >= 0.5 * top);
  while (seeds.length < 3) {
    let best = null, bestGap = 0;
    for (const p of pool) {
      if (seeds.includes(p)) continue;
      const g = Math.min(...seeds.map((q) => gap(p, q)));
      if (g > bestGap + 1e-9) { best = p; bestGap = g; }
    }
    if (!best || bestGap < MIN_GAP - 1e-9) break; // tolerance: lightness steps of exactly 0.05 differ by 0.04999… in floating point
    seeds.push(best);
  }
  if (seeds.length === 0 && !out.noHueSignal) {
    const hard = live.filter(hasHard).map((r) => `"${r.term}"`);
    out.note = `No color meets the evidence for these words together, so none is suggested.${hard.length ? ` ${hard.join(' and ')} limit${hard.length === 1 ? 's' : ''} lightness or chroma, and the colors the other words point to fall outside that.` : ''} Try leaving one word out.`;
  } else if (seeds.length < 3 && !out.noHueSignal) out.note = `Only ${seeds.length} candidate${seeds.length === 1 ? ' meets' : 's meet'} the evidence for these words; none are padded in.`;

  out.seeds = seeds.slice(0, count).map((p, i) => seedRecord(p, live, i, fam));
  out.note = out.noHueSignal ? 'These words set lightness and chroma only, so the seeds are spread across hues. Choosing the hue is your call.' : out.note;
  return out;
}

// Among equal scores prefer the color nearest the study's measured patch for the color word that supports it
// (the bridge bands are engineering choices; the anchor is the measurement). No word: nearest a mid-lightness, moderate-chroma color,
// except in the neutral family, where the target chroma is 0: a "gray" seed is a true gray, not the faintly tinted point that
// happens to sit nearest C 0.10 and lowest in hue angle (D41, 2026-10-13; a pinkish gray is warmer than a true one on Ou's WC model).
function anchorDistance(p, live, per, fam) {
  let best = Infinity;
  for (const r of live) for (const part of per[r.id].parts) {
    if (!part.word || part.weight <= 0) continue;
    const a = fam.colorTerms.regions[part.word].anchor;
    best = Math.min(best, Math.hypot(p.l - a[0], (p.c - a[1]) * 2));
  }
  return best === Infinity ? Math.hypot(p.l - 0.6, (p.c - (p.family === 'neutral' ? 0 : 0.1)) * 2) : best;
}
const fmt = (r) => (r ? `${r[0] ?? '…'} to ${r[1] ?? '…'}` : 'no range');
function spread(list, n) { // pick n items spread evenly through the list
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

function seedRecord(p, live, rank, fam) {
  const supporting = [], conflicting = [], unaddressed = [];
  for (const r of live) {
    const c = p.per[r.id];
    if (c.s < 0) conflicting.push({ term: r.term, contribution: round(c.s, 2), tier: r.tier });
    else if (c.s > 0 || (hasHard(r) && !hasSoft(r))) supporting.push({ term: r.term, contribution: round(c.s, 2), tier: r.tier, sources: r.sources });
    else unaddressed.push({ term: r.term, tier: r.tier });
  }
  const lowest = supporting.length ? supporting.map((s) => s.tier).sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0] : 'speculative';
  return {
    rank: rank + 1, hex: p.hex, family: p.family,
    oklch: { l: round(p.l, 2), c: round(p.c, 3), h: p.family === 'neutral' ? 0 : p.h },
    score: round(p.score, 2), supporting, conflicting, unaddressed, lowestTier: lowest,
    sources: [...new Set(supporting.flatMap((s) => s.sources || []))],
    accessibility: accessibilityOf(p.hex),
    beyondTested: beyondTested(p, live, fam),
  };
}
// A seed whose lightness a supporting lean term pushed past what the study tested: { side, range, terms } or null.
function beyondTested(p, live, fam) {
  const terms = live.filter((r) => r.targets.nudges?.L?.beta != null && p.per[r.id]?.parts.some((x) => x.nudge === 'L')).map((r) => r.term);
  if (!terms.length) return null;
  const [a, b] = testedFor(p.family, fam);
  if (p.l < a - 1e-9) return { side: 'darker', range: [a, b], terms };
  if (p.l > b + 1e-9) return { side: 'lighter', range: [a, b], terms };
  return null;
}
