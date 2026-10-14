// The built page replaces the AGPL `colorparsley` package with build/stubs/colorparsley-hex.js (see build/bundle.mjs).
// This test is what makes that safe: it compares the stand-in with the real package, compares APCA scores from the
// built bundle with scores from the unmodified apca-w3 + colorparsley in node_modules, and checks that no AGPL text
// reaches the bundles. The real packages are used here only as the reference; they are never shipped.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcAPCA } from 'apca-w3';
import { colorParsley as real } from 'colorparsley';
import { colorParsley as stub } from '../build/stubs/colorparsley-hex.js';
import * as PE from '../dist/engine.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };

// Small seeded generator so a failure can be reproduced.
let s = 0x9e3779b9;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const hexDigits = (n, upper) => { let t = ''; for (let i = 0; i < n; i++) t += '0123456789abcdef'[Math.floor(rnd() * 16)]; return upper ? t.toUpperCase() : t; };

// 1. The stand-in returns exactly what the real parser returns, for every hex notation it accepts.
let n1 = 0, bad1 = null;
for (let i = 0; i < 200000 && !bad1; i++) {
  const len = [3, 4, 6, 6, 6, 8][Math.floor(rnd() * 6)];
  const prefix = ['#', '#', '#', '', '0x'][Math.floor(rnd() * 5)];
  const str = prefix + hexDigits(len, rnd() < 0.5) + (rnd() < 0.05 ? ' ' : '');
  const a = JSON.stringify(real(str)), b = JSON.stringify(stub(str));
  n1++; if (a !== b) bad1 = `${JSON.stringify(str)}: real ${a} stub ${b}`;
}
check(`stand-in matches the real parser on ${n1} random hex strings (3, 4, 6, 8 digits; # / 0x / none; either case)`, !bad1, bad1);
check('stand-in matches on the two constants the engine passes', ['#ffffff', '#000000'].every((c) => JSON.stringify(real(c)) === JSON.stringify(stub(c))));

// 2. Anything else fails loudly, so a future change cannot silently score the wrong colour.
for (const bad of ['rgb(1,2,3)', 'red', 'hsl(10 20% 30%)', '#12', '#12345', '#ggg000', '', 12345, null, [1, 2, 3], { r: 1, g: 2, b: 3 }]) {
  let threw = false; try { stub(bad); } catch { threw = true; }
  check(`stand-in rejects ${JSON.stringify(bad)}`, threw);
}

// 3. APCA scores from the built bundle equal the scores from the unmodified libraries.
let n3 = 0, bad3 = null;
const ref = (fg, bg) => Math.round(calcAPCA(fg, bg) * 10) / 10;
for (let i = 0; i < 100000 && !bad3; i++) {
  const upper = rnd() < 0.3;
  const fg = '#' + hexDigits(6, upper), bg = rnd() < 0.3 ? (rnd() < 0.5 ? '#ffffff' : '#000000') : '#' + hexDigits(6, upper);
  const a = ref(fg, bg), b = PE.apcaScore(fg, bg);
  n3++; if (!Object.is(a, b)) bad3 = `${fg} on ${bg}: libraries ${a}, bundle ${b}`;
}
check(`apcaScore equals the unmodified libraries on ${n3} random colour pairs`, !bad3, bad3);
// The exact pairs the page uses: each role colour on white and on black, over a sweep of the whole RGB cube.
let n4 = 0, bad4 = null;
for (let r = 0; r < 256 && !bad4; r += 5) for (let g = 0; g < 256 && !bad4; g += 5) for (let b = 0; b < 256; b += 5) {
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  for (const bg of ['#ffffff', '#000000']) {
    n4++; if (!Object.is(ref(hex, bg), PE.apcaScore(hex, bg))) { bad4 = `${hex} on ${bg}`; break; }
  }
}
check(`apcaScore equals the unmodified libraries over a ${n4}-pair sweep of the RGB cube on white and black`, !bad4, bad4);
check('the documented APCA anchor still holds (#767676 on white)', PE.apcaScore('#767676', '#FFFFFF') === ref('#767676', '#FFFFFF'));

// 4. The bundles carry no AGPL text and still carry apca-w3's own licence notice.
const root = fileURLToPath(new URL('../', import.meta.url));
for (const f of ['dist/engine.mjs', 'dist/engine.iife.js']) {
  const t = fs.readFileSync(root + f, 'utf8');
  check(`${f}: no AGPL text`, !/AGPL|GNU Affero|CoLoR PaRsLeY/i.test(t));
  check(`${f}: no copy of the colorparsley parser (its error strings are absent)`, !t.includes('colorParsley error'));
}
check('dist/engine.mjs keeps the apca-w3 licence banner (the APCA code is still shipped)', /LICENSE: W3 LICENSE/.test(fs.readFileSync(root + 'dist/engine.mjs', 'utf8')));

// 5. The page states which apca-w3 and which APCA constants it uses, and that statement is read from the installed package.
const pkg = JSON.parse(fs.readFileSync(root + 'node_modules/apca-w3/package.json', 'utf8'));
const banner = /SAPC-8, ([0-9.]+G)-series constant (\w+)/.exec(fs.readFileSync(root + 'node_modules/apca-w3/src/apca-w3.js', 'utf8'));
check(`the bundle reports the installed apca-w3 version (${pkg.version})`, PE.APCA_INFO.version === pkg.version, JSON.stringify(PE.APCA_INFO));
check(`the bundle reports the APCA constants named in the package's own banner (${banner && banner[1] + '-' + banner[2]})`, !!banner && PE.APCA_INFO.algorithm === `${banner[1]}-${banner[2]}`, JSON.stringify(PE.APCA_INFO));
check('the browser bundle carries the same statement', fs.readFileSync(root + 'dist/engine.iife.js', 'utf8').includes(JSON.stringify(pkg.version)));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
