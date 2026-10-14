// CIEDE2000 on Lab numbers as given.
// culori's differenceCiede2000() converts every input to its 'lab65' mode first,
// so D50 Lab passed as mode 'lab' gets chromatically adapted before comparison
// (errors up to tens of ΔE00 were measured). The formula itself is
// illuminant-agnostic: label both colors 'lab65' so culori leaves the numbers alone.
import { differenceCiede2000 } from 'culori';

const raw = differenceCiede2000();

/** a, b: {l, a, b} in the SAME Lab frame (here always D50). */
export const de00 = (a, b) =>
  raw({ mode: 'lab65', l: a.l, a: a.a, b: a.b }, { mode: 'lab65', l: b.l, a: b.a, b: b.b });
