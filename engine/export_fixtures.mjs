// Shared fixtures for the phase 5 export tests: real LUTs, the approved lexicon, and four project states.
import fs from 'node:fs';
import * as PE from '../dist/engine.mjs';

fs.mkdirSync(new URL('../tmp/test_export/', import.meta.url), { recursive: true }); // scratch output of the tests (git-ignored)
const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));
export const luts = Object.fromEntries(PE.PRINT_PROFILES.map((p) => [p.id, PE.decodeLut(rd(`lut_${p.id}.json`))]));
export const lex = rd('lexicon.json');
export const DATE = '2026-09-28';
export const SPOT = 'Example Blue C, 40.1, 4.2, -45.3\nExample Blue U, 42, 3, -40\nExample Orange C, 62, 40, 68\nExample Orange U, 64, 38, 60\nExample Gray C, #888888';
const rec = (o) => ({ tier: null, rationale: '', locked: false, ...o });

/** A: manual seed, harmony secondary, manual tertiary; tricky characters in every free-text field; spot values; a lock. */
export function stateA() {
  const s = PE.defaultState();
  s.name = 'Harbor & Co | “Studio”';
  s.seed = rec({ hex: '#1f5fa8', origin: 'manual', mappedFrom: null, name: 'Harbor Blue <b>bold</b>', locked: true, rationale: 'Chosen for trust & calm.\n- a line that looks like a list\n# and one that looks like a heading\n| pipes | and `ticks` and *stars* and _under_ [brackets](x)' });
  s.supporting.secondary = [rec({ hex: '#d9822b', origin: 'harmony:complementary', tier: 'low confidence', lens: 'complementary', offset: 180, rationale: 'Complement, kept for the call-to-action.' })];
  s.supporting.tertiary = [rec({ hex: '#2e7d32', origin: 'manual', lens: null, offset: null, rationale: 'Success green.', locked: true, name: 'Harbor Blue <b>bold</b>' })]; // duplicate name on purpose
  s.spot = { text: SPOT, illum: 'D50' };
  return s;
}
/** B: seed from descriptor words, an override that breaks contrast, accepted with a note, plus a stale note. */
export function stateB() {
  const s = PE.defaultState();
  const ix = PE.indexLexicon(lex);
  const words = 'trustworthy, calm';
  const seed = PE.matchDescriptors(words, ix).seeds[0];
  s.words = words; s.searched = true; s.path = 'words';
  s.seed = rec({ hex: seed.hex, origin: 'descriptor', tier: seed.lowestTier, words, rationale: 'From the brand words.' });
  s.overrides.light.onSurface = '#b0b0b0';
  s.accepted[PE.acceptKey('light', 'onSurface', 'surface', 'text')] = 'Decorative footer text only.\nReviewed with the client.';
  s.accepted[PE.acceptKey('light', 'onSurface', 'surfaceContainer', 'text')] = 'Same footer, on the card surface.';
  s.accepted[PE.acceptKey('light', 'onSurface', 'surfaceContainerHigh', 'text')] = 'Same footer, on the raised surface (ratio < 4.5).';
  s.accepted[PE.acceptKey('dark', 'onSurface', 'surface', 'text')] = 'This pair passes now, but the note stays.';
  return s;
}
/** C: an oklch color beyond sRGB, mapped in. */
export function stateC() {
  const s = PE.defaultState();
  const a = PE.analyze('oklch(0.7 0.3 145)', {});
  s.seed = rec({ hex: a.screen.hex, origin: 'manual', mappedFrom: a.screen.mappedFrom, rationale: 'Wide-gamut brand green.' });
  return s;
}
/** D: like B but the failure has no note, so exports must be blocked. */
export function stateD() { const s = stateB(); s.accepted = {}; return s; }
/** E (D44): a full seven-color palette entered for review: three secondaries and three tertiaries, one extended color
 * harmonized, names on some, a duplicate name across tiers, and spot values. */
export function stateE() {
  const s = stateA();
  s.name = 'Full palette review';
  s.supporting.secondary.push(rec({ hex: '#0083a8', origin: 'manual', lens: null, offset: null, name: 'Harbour Teal', rationale: 'Links and focus.' }), rec({ hex: '#f2c14e', origin: 'manual', lens: null, offset: null, harmonize: true, rationale: 'Highlight yellow, harmonized.' }));
  s.supporting.tertiary.push(rec({ hex: '#7a4fa0', origin: 'harmony:triadic', tier: 'low confidence', lens: 'triadic', offset: 120, name: 'Harbour Teal' }), rec({ hex: '#c2185b', origin: 'manual', lens: null, offset: null, locked: true }));
  return s;
}
/** F (D47): E with Secondary 2 replaced by a chosen proposal, an unchosen proposal on Tertiary 3, and two brand neutrals. */
export function stateF() {
  const s = stateE();
  s.name = 'Brand refresh review';
  s.supporting.secondary[1].proposal = { hex: '#00739a', origin: 'manual', tier: null, lens: null, offset: null }; s.supporting.secondary[1].use = 'proposal';
  s.supporting.tertiary[2].proposal = { hex: '#3f7ab8', origin: 'harmony:triadic', tier: 'low confidence', lens: 'triadic', offset: 240 };
  s.neutrals = [{ hex: '#b8b8b8', rationale: 'Light gray for rules & borders.', fromTier: 'tertiary', name: 'Fog' }, { hex: '#333333', rationale: '', fromTier: 'tertiary', name: 'Charcoal' }];
  return s;
}
export const model = (s) => PE.buildExportModel(s, luts, { lex, date: DATE });
