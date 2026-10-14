// Palette Engine — M7 checks.
// WCAG 2.2 contrast is the pass/fail floor (research §5); APCA is advisory
// only — the WCAG3 draft's contrast math is still TBD and apca-w3's license
// restricts non-web use, so it's never applied to print. Color-blind
// distinctness uses culori's Machado et al. 2009 CVD simulation. Print gets
// its own ΔL* legibility check because WCAG doesn't apply to print (research
// §5 print note).

import { wcagContrast, filterDeficiencyProt, filterDeficiencyDeuter, filterDeficiencyTrit, formatHex } from 'culori';
import { calcAPCA } from 'apca-w3';
import { labD50 } from './color.js';
import { de00 } from './de.js';

// --- WCAG 2.2 contrast -------------------------------------------------------

/** Contrast ratio (1..21) between two colors, 2 decimal places. */
export function contrastRatio(fg, bg) {
  return Math.round(wcagContrast(fg, bg) * 100) / 100;
}

/**
 * Text contrast per SC 1.4.3 (AA) and SC 1.4.6 (AAA). `large` = 18pt+ or
 * 14pt+ bold, which lowers the AA/AAA bar. AAA is reported, not required.
 */
export function textContrast(fg, bg, { large = false } = {}) {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    aa: ratio >= (large ? 3 : 4.5),
    aaa: ratio >= (large ? 4.5 : 7),
  };
}

/** Non-text contrast per SC 1.4.11: UI component boundaries, states, and meaningful graphics need 3:1. */
export function nonTextContrast(fg, bg) {
  const ratio = contrastRatio(fg, bg);
  return { ratio, pass: ratio >= 3 };
}

/**
 * Runs textContrast over a list of role pairs against a {role: hex} map.
 * pairs: [[fgRole, bgRole, opts?], ...]. Only pairs that are actually meant
 * to sit as text-on-surface belong here — this doesn't invent the matrix.
 */
export function contrastMatrix(colors, pairs) {
  return pairs.map(([fgRole, bgRole, opts]) => ({
    fg: fgRole,
    bg: bgRole,
    ...textContrast(colors[fgRole], colors[bgRole], opts),
  }));
}

// --- APCA (advisory only, screen only) --------------------------------------

/** Which apca-w3 the page was built with and which APCA constants those are. Filled in by build/bundle.mjs; empty when the source is run unbundled. */
export const APCA_INFO = {
  version: typeof __APCA_VERSION__ === 'undefined' ? '' : __APCA_VERSION__,
  algorithm: typeof __APCA_ALGORITHM__ === 'undefined' ? '' : __APCA_ALGORITHM__,
};

/** APCA Lc score, 1 decimal. Advisory only — never used as a pass/fail gate, never applied to print. */
export function apcaScore(fg, bg) {
  return Math.round(calcAPCA(fg, bg) * 10) / 10;
}

// --- Color vision deficiency (Machado et al. 2009, via culori) -------------

const CVD_FILTERS = {
  protan: filterDeficiencyProt(1), // full severity
  deutan: filterDeficiencyDeuter(1),
  tritan: filterDeficiencyTrit(1),
};

/** Simulated hex for one color under one CVD type at full severity. */
export function simulateCvd(color, type) {
  const filter = CVD_FILTERS[type];
  if (!filter) throw new Error(`Unknown CVD type: ${type} (expected protan, deutan, or tritan)`);
  return formatHex(filter(color));
}

const CVD_DISTINCT_DE00 = 10; // build spec §10 default

/**
 * Flags role pairs that collapse toward each other under simulated CVD.
 * colors: {role: hex}. Returns one entry per (pair, CVD type) that falls
 * below the threshold — an empty array means every role stays distinct
 * under all three simulations.
 */
export function cvdDistinctPairs(colors) {
  const roles = Object.keys(colors);
  const flags = [];
  for (const type of Object.keys(CVD_FILTERS)) {
    const simLab = {};
    for (const role of roles) simLab[role] = labD50(simulateCvd(colors[role], type));
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        const a = roles[i];
        const b = roles[j];
        const dE = de00(simLab[a], simLab[b]);
        if (dE < CVD_DISTINCT_DE00) {
          flags.push({ a, b, type, dE00: Math.round(dE * 10) / 10 });
        }
      }
    }
  }
  return flags;
}

// --- Print legibility (no WCAG in print) ------------------------------------

/** ΔL* between text and background under the chosen CMYK profile — print's stand-in for contrast, since WCAG doesn't apply to print. */
export function printLegibility(textLab, bgLab) {
  return { deltaL: Math.round(Math.abs(textLab.l - bgLab.l) * 10) / 10 };
}
