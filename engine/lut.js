// Palette Engine — M2 print lookup (port of build_luts.py `tetra`).
// Loads a LUT file from the build step and returns CMYK, printed Lab and
// round-trip Lab for any sRGB color by tetrahedral interpolation.

const CHANNELS = 10; // C M Y K | pL pa pb | rL ra rb

function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64')); // Node (tests)
}

/** Decode a lut_<profile>.json object into Float64 values in real units. */
export function decodeLut(json) {
  const n = json.grid;
  const bytes = base64ToBytes(json.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = n * n * n * CHANNELS;
  if (bytes.byteLength !== count * 2) throw new Error(`LUT ${json.id}: unexpected size`);
  const v = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const q = view.getUint16(i * 2, true);
    const ch = i % CHANNELS;
    // CMYK and L: q / 655.35 (i.e. q * 100 / 65535); a, b: q / 256 - 128
    v[i] = ch < 4 || ch === 4 || ch === 7 ? q / (65535 / 100) : q / (65535 / 256) - 128;
  }
  return { id: json.id, label: json.label, n, tacLimit: json.tac_limit ?? null, profileSha256: json.profile_sha256 || null, v };
}

/**
 * Tetrahedral interpolation. rgb = [r, g, b] in 0..1.
 * Returns { cmyk:[4] (0..100), printLab:[3], rtLab:[3] } in Lab D50.
 */
export function lookup(lut, rgb) {
  const { n, v } = lut;
  const p = rgb.map((c) => Math.min(Math.max(c, 0), 1) * (n - 1));
  const i0 = p.map((x) => Math.min(Math.floor(x), n - 2));
  const [fr, fg, fb] = p.map((x, k) => x - i0[k]);
  const [r0, g0, b0] = i0;
  const node = (dr, dg, db) => ((r0 + dr) * n * n + (g0 + dg) * n + (b0 + db)) * CHANNELS;
  const c000 = node(0, 0, 0), c111 = node(1, 1, 1);
  let a, b, w1, w2, w3; // path c000 -> a -> b -> c111 with weights
  // Same six-way split and tie-breaking as the Python reference.
  if (fr >= fg && fg >= fb)      { a = node(1, 0, 0); b = node(1, 1, 0); w1 = fr; w2 = fg; w3 = fb; }
  else if (fr >= fb && fb > fg)  { a = node(1, 0, 0); b = node(1, 0, 1); w1 = fr; w2 = fb; w3 = fg; }
  else if (fb > fr && fr >= fg)  { a = node(0, 0, 1); b = node(1, 0, 1); w1 = fb; w2 = fr; w3 = fg; }
  else if (fg > fr && fr >= fb)  { a = node(0, 1, 0); b = node(1, 1, 0); w1 = fg; w2 = fr; w3 = fb; }
  else if (fg >= fb && fb > fr)  { a = node(0, 1, 0); b = node(0, 1, 1); w1 = fg; w2 = fb; w3 = fr; }
  else                           { a = node(0, 0, 1); b = node(0, 1, 1); w1 = fb; w2 = fg; w3 = fr; }
  const out = new Array(CHANNELS);
  for (let k = 0; k < CHANNELS; k++) {
    out[k] = v[c000 + k] + w1 * (v[a + k] - v[c000 + k]) + w2 * (v[b + k] - v[a + k]) + w3 * (v[c111 + k] - v[b + k]);
  }
  return { cmyk: out.slice(0, 4), printLab: out.slice(4, 7), rtLab: out.slice(7, 10) };
}

/** Whole-percent CMYK, rounding half up (the convention shown to users). */
export const roundCmyk = (cmyk) => cmyk.map((c) => Math.floor(c + 0.5));
export const tac = (cmyk) => cmyk.reduce((s, c) => s + c, 0);
