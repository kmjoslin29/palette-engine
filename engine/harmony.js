// Palette Engine — M5 harmony lenses.
// Candidate supporting colors from OKLCH hue offsets (editable), each with its
// lens and evidence tier, mapped into sRGB (CSS Color 4, via color.js), and each
// with its accessibility beside it (HANDOFF phase 4 rule): contrast against white
// and black, roles it can fill, APCA (advisory), color-blind collapse against the
// seed, and the nearest lightness in the same hue that passes as text on white.
//
// Tiers (research §3): classical wheel harmonies are LOW CONFIDENCE as a harmony
// predictor (Schloss & Palmer); hue similarity + lightness contrast is SUPPORTED
// BUT CONTESTED (Ou & Luo 2006; Schloss & Palmer 2011). Hue offsets are computed in
// OKLCH and labeled as such: RYB, RGB and perceptual wheels give different
// "complements" for the same color.

import { converter } from 'culori';
import { oklch, mapToSrgb, hexFromOklch, inSrgbGamut } from './color.js';
import { contrastRatio, apcaScore, cvdDistinctPairs } from './checks.js';

const toLab65 = converter('lab65');

export const WHEEL = 'OKLCH hue wheel';
export const LENSES = {
  analogous:     { name: 'Analogous',           offsets: [-30, 30],       tier: 'low confidence', kind: 'wheel' },
  complementary: { name: 'Complementary',       offsets: [180],           tier: 'low confidence', kind: 'wheel' },
  split:         { name: 'Split-complementary', offsets: [150, -150],     tier: 'low confidence', kind: 'wheel' },
  triadic:       { name: 'Triadic',             offsets: [120, -120],     tier: 'low confidence', kind: 'wheel' },
  square:        { name: 'Square',              offsets: [90, 180, 270],  tier: 'low confidence', kind: 'wheel' },
  empirical:     { name: 'Same hue, different lightness', offsets: [0, 15, -15], tier: 'supported but contested', kind: 'empirical',
                   hueWithin: 15, lSpread: 0.25 }, // hue within ±15° and OKLCH L spread >= 0.25 (build spec §5, proposed defaults)
};
export const TIER_NOTE = {
  'low confidence': 'Classical color-wheel geometry does not predict harmony in lab studies (Schloss & Palmer); useful as designer vocabulary and for emphasis roles.',
  'supported but contested': 'Equal hue with unequal lightness best predicted harmony in 1,431 color pairs (Ou & Luo 2006); lab patches, not brand contexts.',
};

const L_MIN = 0.12, L_MAX = 0.96;
const round = (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n;

/** OKLCH L step search: nearest lightness (same hue and chroma, mapped to sRGB) that passes `min` against bg. */
export function nearestPassingLightness(ok, bgHex, min) {
  let best = null;
  for (let i = 0; i <= 200; i++) {
    const L = i / 200;
    const m = mapToSrgb({ mode: 'oklch', l: L, c: ok.c, h: ok.h });
    const hex = hexFromOklch(m);
    if (contrastRatio(hex, bgHex) < min) continue;
    const gap = Math.abs(L - ok.l);
    if (!best || gap < best.gap) best = { hex, l: round(m.l, 2), gap: round(gap, 3) };
  }
  return best;
}

/** What a color can do on its own: WCAG 2.2 roles against white and black (SC 1.4.3 and 1.4.11), APCA advisory. */
export function accessibilityOf(hex) {
  const w = contrastRatio(hex, '#ffffff'), k = contrastRatio(hex, '#000000');
  return {
    vsWhite: w, vsBlack: k,
    textOnWhite: w >= 4.5, largeTextOnWhite: w >= 3, uiOnWhite: w >= 3,
    textOnBlack: k >= 4.5, largeTextOnBlack: k >= 3, uiOnBlack: k >= 3,
    apca: { onWhite: apcaScore(hex, '#ffffff'), onBlack: apcaScore(hex, '#000000'), note: 'advisory, web only' },
  };
}

// --- Ou & Luo (2006) two-color harmony model, ADVISORY ------------------------------
// CH = HC + HL + HH in CIELAB (D65, as measured on a calibrated display).
// Constants verified 2026-09-29 against the printed paper (Eqs. 3-11, pp. 197-200) and by the
// paper's own reported prediction range over its 54 colors (see engine/test_ouluo.mjs).
const rad = (d) => (d * Math.PI) / 180;
const tanh = Math.tanh;
/** Constants of Eqs. (3) to (9), as printed in Ou & Luo (2006). Exported so tests can show that a misread constant fails. */
export const OU_LUO_K = {
  hc0: 0.04, hc1: 0.53, hc2: 0.8, hc3: 0.045, chromaDiv: 1.46,
  ls0: 0.28, ls1: 0.54, ls2: -3.88, ls3: 0.029,
  dl0: 0.14, dl1: 0.15, dl2: -2, dl3: 0.2,
  ec0: 0.5, ec1: 0.5, ec2: -2, ec3: 0.5,
  hs0: -0.08, hs1: -0.14, hs2: 50, hs3: -0.07, hs4: 90,
  ey0: 0.22, ey1: 12.8, ey2: 10,
};
function hueScore(L, C, h, K) {
  const EC = K.ec0 + K.ec1 * tanh(K.ec2 + K.ec3 * C);
  const HS = K.hs0 + K.hs1 * Math.sin(rad(h + K.hs2)) + K.hs3 * Math.sin(rad(2 * h + K.hs4));
  const a = (90 - h) / K.ey2;
  const EY = ((K.ey0 * L - K.ey1) / K.ey2) * Math.exp(a - Math.exp(a));
  return EC * (HS + EY);
}
/** The model itself, on two CIELAB colors {l, a, b}. Equations (3) to (11) of Ou & Luo (2006). */
export function ouLuoModel(A, B, K = OU_LUO_K) {
  const C = (l) => Math.hypot(l.a, l.b);
  const H = (l) => ((Math.atan2(l.b, l.a) * 180) / Math.PI + 360) % 360;
  const [C1, C2, h1, h2] = [C(A), C(B), H(A), H(B)];
  let dh = Math.abs(h1 - h2); if (dh > 180) dh = 360 - dh;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh) / 2);
  const dC = C1 - C2;
  const DC = Math.sqrt(dH ** 2 + (dC / K.chromaDiv) ** 2);
  const HC = K.hc0 + K.hc1 * tanh(K.hc2 - K.hc3 * DC);
  const Lsum = A.l + B.l, dL = Math.abs(A.l - B.l);
  const HL = K.ls0 + K.ls1 * tanh(K.ls2 + K.ls3 * Lsum) + (K.dl0 + K.dl1 * tanh(K.dl2 + K.dl3 * dL));
  const HH = hueScore(A.l, C1, h1, K) + hueScore(B.l, C2, h2, K);
  return { HC, HL, HH, CH: HC + HL + HH };
}
export function ouLuoHarmony(hexA, hexB) {
  const { CH } = ouLuoModel(toLab65(hexA), toLab65(hexB));
  return { score: round(CH, 2), verified: true,
           note: 'Advisory. Ou & Luo (2006) two-color model; equations checked against the printed paper. Fitted on lab color patches on a gray background (R² 0.71), not brand contexts. Not a pass or fail.' };
}

// --- Candidates -----------------------------------------------------------------------
function candidate(seedHex, seedOk, lensId, offset, ok) {
  const lens = LENSES[lensId];
  const input = { mode: 'oklch', l: ok.l, c: ok.c, h: ((ok.h % 360) + 360) % 360 };
  const wasOut = !inSrgbGamut(input);
  const m = wasOut ? mapToSrgb(input) : { l: input.l, c: input.c, h: input.h };
  const hex = hexFromOklch(m);
  const cvd = cvdDistinctPairs({ seed: seedHex, candidate: hex });
  const acc = accessibilityOf(hex);
  return {
    hex, lens: lensId, lensName: lens.name, wheel: WHEEL, offset, tier: lens.tier, tierNote: TIER_NOTE[lens.tier],
    oklch: { l: round(m.l, 2), c: round(m.c, 3), h: round(m.h) },
    mappedFrom: wasOut ? { l: round(input.l, 2), c: round(input.c, 3), h: round(input.h) } : null,
    lSpread: round(Math.abs(m.l - seedOk.l), 2),
    accessibility: {
      ...acc,
      textFix: acc.textOnWhite ? null : nearestPassingLightness({ l: m.l, c: m.c, h: m.h }, '#ffffff', 4.5),
      cvdVsSeed: cvd.map((f) => ({ type: f.type, dE00: f.dE00 })),
    },
    harmony: ouLuoHarmony(seedHex, hex),
  };
}

/**
 * seedHex: brand primary. lensId: key of LENSES. opts.offsets overrides the lens's
 * hue offsets (editable). Wheel lenses keep the seed's lightness and chroma; the
 * empirical lens keeps hue within ±15° and moves lightness by >= 0.25.
 */
export function harmonyCandidates(seedHex, lensId, opts = {}) {
  const lens = LENSES[lensId];
  if (!lens) throw new Error(`Unknown lens: ${lensId}`);
  const seed = oklch(seedHex);
  const offsets = opts.offsets ?? lens.offsets;
  const out = [];
  if (lens.kind === 'wheel') {
    for (const o of offsets) out.push(candidate(seedHex, seed, lensId, o, { l: seed.l, c: seed.c, h: seed.h + o }));
  } else {
    const spread = opts.lSpread ?? lens.lSpread;
    offsets.forEach((o, i) => {
      if (Math.abs(o) > lens.hueWithin && opts.offsets == null) return;
      const lighter = i % 2 === 0;
      let L = seed.l + (lighter ? spread : -spread);
      if (L > L_MAX || L < L_MIN) L = seed.l + (lighter ? -spread : spread); // flip when out of range
      if (L > L_MAX || L < L_MIN) return; // no room either way
      out.push(candidate(seedHex, seed, lensId, o, { l: L, c: seed.c, h: seed.h + o }));
    });
  }
  return out;
}

/** All lenses at once: { lensId: candidates[] }. */
export function allCandidates(seedHex, overrides = {}) {
  return Object.fromEntries(Object.keys(LENSES).map((id) => [id, harmonyCandidates(seedHex, id, overrides[id] || {})]));
}
