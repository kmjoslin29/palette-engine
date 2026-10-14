// Palette Engine — store-only ZIP writer, so "download everything" is one file and one confirmation.
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const enc = new TextEncoder();

/** files: [{ name, data: string | Uint8Array }]. Names are used as given (keep them plain ASCII or UTF-8 without slashes). */
export function zipStore(files, date = new Date(Date.UTC(2026, 0, 1))) {
  const d = date, dosTime = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const dosDate = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const chunks = [], central = []; let offset = 0;
  const push = (u8) => { chunks.push(u8); offset += u8.length; };
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    central.push({ name, crc, size: data.length, offset });
    push(new Uint8Array(h.buffer)); push(name); push(data);
  }
  const cdStart = offset;
  for (const c of central) {
    const h = new DataView(new ArrayBuffer(46)); h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true); h.setUint16(10, 0, true);
    h.setUint16(12, dosTime, true); h.setUint16(14, dosDate, true); h.setUint32(16, c.crc, true); h.setUint32(20, c.size, true); h.setUint32(24, c.size, true); h.setUint16(28, c.name.length, true); h.setUint32(42, c.offset, true);
    push(new Uint8Array(h.buffer)); push(c.name);
  }
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, central.length, true); e.setUint16(10, central.length, true); e.setUint32(12, offset - cdStart, true); e.setUint32(16, cdStart, true);
  push(new Uint8Array(e.buffer));
  const out = new Uint8Array(offset); let i = 0; for (const c of chunks) { out.set(c, i); i += c.length; } return out;
}
