// Palette Engine — Adobe Swatch Exchange (.ase), community-documented format (no Adobe SDK).
// Layout: "ASEF", version 1.0 (two uint16), block count (uint32), then blocks. Each block: type uint16, length uint32, body.
//   0xC001 group start: name length (UTF-16 units incl. terminator, uint16), name UTF-16BE + 0x0000
//   0x0001 color entry: name length + name (as above), model 4 chars ("RGB ", "CMYK", "LAB "), float32 BE values, color type uint16 (0 global, 1 spot, 2 normal)
//   0xC002 group end: length 0
// RGB 0..1; CMYK 0..1 (whole percent / 100); Lab is L/100, a, b as-is (CIELAB D50). ASE carries no ICC profile: CMYK numbers
// mean what the named profile says, so the Illustrator/InDesign CMYK working space must be set to match.
// Groups follow build spec §7: Screen RGB; Print GRACoL coated CMYK; Print uncoated CMYK; Spot approximations.

import { assertExportable } from './model.js';

export const ASE_GROUPS = { screen: 'Screen RGB', coated: 'Print GRACoL coated CMYK', uncoated: 'Print uncoated CMYK', spot: 'Spot approximations' };
const T_GROUP_START = 0xC001, T_GROUP_END = 0xC002, T_COLOR = 0x0001;
const TYPE = { global: 0, spot: 1, normal: 2 };
const MAX_SPOT_DE = 5; // beyond "Loose" the match is not offered as a swatch

class Out {
  constructor() { this.parts = []; this.len = 0; }
  push(u8) { this.parts.push(u8); this.len += u8.length; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); this.push(b); }
  f32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v); this.push(b); }
  ascii(s) { this.push(Uint8Array.from([...s].map((c) => c.charCodeAt(0)))); }
  bytes() { const o = new Uint8Array(this.len); let i = 0; for (const p of this.parts) { o.set(p, i); i += p.length; } return o; }
}
function nameBytes(name) { // uint16 length (units incl. terminator) + UTF-16BE + terminator
  const units = []; for (let i = 0; i < name.length; i++) units.push(name.charCodeAt(i));
  const b = new Uint8Array(2 + (units.length + 1) * 2); const dv = new DataView(b.buffer);
  dv.setUint16(0, units.length + 1); units.forEach((u, i) => dv.setUint16(2 + i * 2, u)); return b;
}
const block = (type, body) => { const o = new Out(); o.u16(type); o.u32(body.length); o.push(body); return o; };
const cleanName = (n) => String(n).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || 'Untitled';

function colorBlock(name, modelTag, values, type) {
  const body = new Out(); body.push(nameBytes(cleanName(name))); body.ascii(modelTag); values.forEach((v) => body.f32(v)); body.u16(type);
  return block(T_COLOR, body.bytes());
}
const groupStart = (name) => block(T_GROUP_START, nameBytes(name));
const groupEnd = () => block(T_GROUP_END, new Uint8Array(0));

/** The list of swatches per group, as plain data (also what the tests compare the parsed file to). */
export function aseContents(model, { includeTones = false } = {}) {
  assertExportable(model);
  const items = model.colors.map((c) => ({ name: c.name, hex: c.hex, print: c.print, spot: c.spot }));
  if (includeTones) for (const [key, label] of [['primary', 'Primary'], ['secondary', 'Secondary'], ['tertiary', 'Tertiary'], ['neutral', 'Neutral'], ['neutralVariant', 'Neutral variant'], ['error', 'Error']])
    for (const t of model.tones) { const hex = model.palette.tones[key][t]; items.push({ name: `${label} ${t}`, hex, print: model.printOf(hex), spot: null }); }
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const groups = [{ name: ASE_GROUPS.screen, colors: items.map((i) => ({ name: i.name, model: 'RGB ', values: rgb(i.hex), type: 'global' })) }];
  const pid = { coated: model.conditions.profiles[0].id, uncoated: model.conditions.profiles[2].id };
  for (const k of ['coated', 'uncoated']) if (model.conditions.printAvailable)
    groups.push({ name: ASE_GROUPS[k], colors: items.map((i) => ({ name: i.name, model: 'CMYK', values: i.print[pid[k]].cmyk.map((v) => v / 100), type: 'global' })) });
  const spot = [], seen = new Set();
  for (const c of model.colors) for (const b of ['coated', 'uncoated']) for (const m of c.spot[b]) {
    if (m.dE00 > MAX_SPOT_DE || seen.has(m.name)) continue; seen.add(m.name);
    spot.push({ name: m.name, model: 'LAB ', values: [m.lab.l / 100, m.lab.a, m.lab.b], type: 'spot' });
  }
  if (spot.length) groups.push({ name: ASE_GROUPS.spot, colors: spot });
  return groups;
}

export function buildAse(model, opts = {}) {
  const groups = aseContents(model, opts);
  const blocks = [];
  for (const g of groups) { blocks.push(groupStart(g.name)); for (const c of g.colors) blocks.push(colorBlock(c.name, c.model, c.values, TYPE[c.type])); blocks.push(groupEnd()); }
  const out = new Out(); out.ascii('ASEF'); out.u16(1); out.u16(0); out.u32(blocks.length);
  for (const b of blocks) out.push(b.bytes());
  return out.bytes();
}

/** Minimal reader used by the tests (a second implementation lives in build/test_ase.py). Throws on any structural problem. */
export function parseAse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (m) => { throw new Error(`ASE: ${m}`); };
  if (bytes.length < 12) fail('too short');
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'ASEF') fail('bad signature');
  const major = dv.getUint16(4), minor = dv.getUint16(6); if (major !== 1 || minor !== 0) fail(`unexpected version ${major}.${minor}`);
  const count = dv.getUint32(8); let pos = 12; const groups = []; let cur = null;
  const readName = (p) => { const n = dv.getUint16(p); let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(dv.getUint16(p + 2 + i * 2)); if (dv.getUint16(p + 2 + (n - 1) * 2) !== 0) fail('name is not terminated'); return { s, end: p + 2 + n * 2 }; };
  for (let b = 0; b < count; b++) {
    if (pos + 6 > bytes.length) fail('truncated block header');
    const type = dv.getUint16(pos), len = dv.getUint32(pos + 2); const start = pos + 6, end = start + len;
    if (end > bytes.length) fail('block runs past the end of the file');
    if (type === T_GROUP_START) { if (cur) fail('nested group'); const n = readName(start); if (n.end !== end) fail('group block length mismatch'); cur = { name: n.s, colors: [] }; groups.push(cur); }
    else if (type === T_GROUP_END) { if (!cur || len !== 0) fail('bad group end'); cur = null; }
    else if (type === T_COLOR) {
      let target = cur; if (!target) { target = groups.find((g) => g.name === null); if (!target) { target = { name: null, colors: [] }; groups.push(target); } } // loose colors (outside any group) are legal in ASE
      const n = readName(start); const tag = String.fromCharCode(...bytes.slice(n.end, n.end + 4));
      const nv = { 'RGB ': 3, CMYK: 4, 'LAB ': 3, Gray: 1 }[tag]; if (!nv) fail(`unknown color model ${JSON.stringify(tag)}`);
      const values = Array.from({ length: nv }, (_, i) => dv.getFloat32(n.end + 4 + i * 4)); const t = dv.getUint16(n.end + 4 + nv * 4);
      if (n.end + 4 + nv * 4 + 2 !== end) fail('color block length mismatch');
      target.colors.push({ name: n.s, model: tag, values, type: Object.keys(TYPE).find((k) => TYPE[k] === t) });
    } else fail(`unknown block type 0x${type.toString(16)}`);
    pos = end;
  }
  if (pos !== bytes.length) fail('trailing bytes'); if (cur) fail('group not closed');
  return groups;
}
