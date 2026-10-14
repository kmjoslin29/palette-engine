// Palette Engine: build-time stand-in for the `colorparsley` package.
//
// Why this exists: `apca-w3` imports `colorParsley` (AGPL-3.0) for one function, `calcAPCA`, which turns its two
// colour arguments into [r, g, b, a] arrays. Palette Engine calls `calcAPCA` only through `apcaScore` in
// engine/checks.js, and only ever with hex strings (the two constants '#ffffff' and '#000000', and colours that
// come out of culori's formatHex or from validated hex fields). Bundling the full package would put AGPL code in
// the shipped page for a feature the page does not use.
//
// build/bundle.mjs aliases `colorparsley` to this file for both bundles. apca-w3 itself is not edited.
// This file was written for this project: it parses hex notation and nothing else.
// Anything it does not recognise throws, so a future change that passes another format fails loudly instead of
// scoring wrong. engine/test_apcastub.mjs compares it with the real package.
//
// Return shape matches what apca-w3 reads: [r, g, b, alpha, isValid, colorSpace].

const HEX = /^(?:#|0x)?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\s*$/;

export function colorParsley(input) {
  if (typeof input !== 'string') throw new TypeError('colorparsley stub: expected a hex string');
  const m = HEX.exec(input.toLowerCase());
  if (!m) throw new Error(`colorparsley stub: unsupported colour "${input}" (hex only)`);
  const d = m[1];
  const short = d.length <= 4;
  const ch = (i) => (short ? parseInt(d[i] + d[i], 16) : parseInt(d.slice(i * 2, i * 2 + 2), 16));
  let alpha = 1;
  if (d.length === 4) alpha = parseInt(d[3], 16) / 15;
  else if (d.length === 8) alpha = parseInt(d.slice(6, 8), 16) / 255;
  return [ch(0), ch(1), ch(2), alpha, true, 'sRGB'];
}
