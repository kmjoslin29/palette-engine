// The tool must pass its own accessibility checks: design tokens in both themes, WCAG 2.2 via checks.js (M7).
import fs from 'node:fs';
import { contrastRatio } from '../engine/checks.js';
const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const grab = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = grab(css.match(/:root \{([\s\S]*?)\n\}/)[1]);
const dark = grab(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1]);
const dark2 = grab(css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/)[1]);
let fails = 0;
const same = Object.keys(dark).every((k) => dark[k] === dark2[k]) && Object.keys(dark).length === Object.keys(dark2).length;
console.log(`${same ? 'PASS' : 'FAIL'}  system-dark and explicit-dark palettes are identical`); if (!same) fails++;
const TEXT = [['ink', 'surface'], ['ink', 'bg'], ['ink', 'surface-2'], ['ink-2', 'surface'], ['ink-2', 'bg'], ['ink-2', 'surface-2'],
  ['on-accent', 'accent'], ['pass', 'pass-bg'], ['fail', 'fail-bg'], ['warn', 'warn-bg'], ['pass', 'surface'], ['fail', 'surface'], ['warn', 'surface'],
  ['ink', 'pass-bg'], ['ink', 'fail-bg'], ['ink', 'warn-bg']];
const UI = [['line-strong', 'surface'], ['line-strong', 'bg'], ['focus', 'surface'], ['focus', 'bg'], ['ink', 'surface']];
for (const [name, t] of [['light', light], ['dark', dark]]) {
  for (const [a, b] of TEXT) { const r = contrastRatio(t[a], t[b]); const ok = r >= 4.5; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} text ${a} on ${b}: ${r}:1`); if (!ok) fails++; }
  for (const [a, b] of UI) { const r = contrastRatio(t[a], t[b]); const ok = r >= 3; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} UI   ${a} on ${b}: ${r}:1`); if (!ok) fails++; }
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
