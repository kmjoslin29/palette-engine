// Ou & Luo (2006) model: checks against the printed paper.
// Sources: equations (3)-(11), pp. 197-200 (read from the PDF page images and the text copy, which agree);
// Table I (54 colors, engine/fixtures/ou_luo_table1.json); the paper's statement that predicted values "range from -1.24 to 1.39"
// over its 1431 pairs; and values read off Figs. 4b, 8, 10a and 11 (read to about +-0.05).
import fs from 'node:fs';
import { ouLuoModel, OU_LUO_K } from './harmony.js';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) fails++; };
// The fixture file keeps its original key name, "colours".
const { colours: colors } = JSON.parse(fs.readFileSync(new URL('./fixtures/ou_luo_table1.json', import.meta.url)));
const lab = (c) => ({ l: c.L, a: c.a, b: c.b });

check('Table I has 54 colors: 49 chromatic and 5 achromatic', colors.length === 54 && colors.filter((c) => c.tone === 'achromatic').length === 5);
const hueOk = colors.filter((c) => c.tone !== 'achromatic').every((c) => { const h = ((Math.atan2(c.b, c.a) * 180) / Math.PI + 360) % 360; return Math.abs(h - c.h) < 1.5 && Math.abs(Math.hypot(c.a, c.b) - c.C) < 0.3; });
check('Table I transcription is self-consistent (a*, b* agree with C* and h)', hueOk);

function range(K) {
  let mn = Infinity, mx = -Infinity, n = 0;
  for (let i = 0; i < 54; i++) for (let j = i + 1; j < 54; j++) { const v = ouLuoModel(lab(colors[i]), lab(colors[j]), K).CH; mn = Math.min(mn, v); mx = Math.max(mx, v); n++; }
  return { mn, mx, n };
}
const r = range(OU_LUO_K);
check('all 1431 pairs of the 54 colors are scored', r.n === 1431);
const near = (R) => Math.abs(R.mn - -1.24) <= 0.10 && Math.abs(R.mx - 1.39) <= 0.05;
check('predicted range over the paper\'s pairs is about -1.24 to 1.39 (paper, p. 200)', near(r), `got ${r.mn.toFixed(3)} to ${r.mx.toFixed(3)}`);

// The range check must be able to fail. It catches the misreads below. It does NOT pin down EC's -2 (versus -2.5) or small shifts in the
// HS phase: those change the range by less than the check's tolerance. They rest on the transcription (text copy and PDF images agree).
// The check must be able to fail: each of the misreads that phase 0 could not settle, and other single-constant slips, must break it.
const alt = {
  'HC read as 0.53 + 0.04 tanh': { hc0: 0.53, hc1: 0.04 },
  'HLsum sign flipped (+3.88)': { ls2: 3.88 },
  'HLsum read as 0.28 - 0.54 tanh': { ls1: -0.54 },
  'chroma divisor 1.0': { chromaDiv: 1.0 },
};
for (const [name, patch] of Object.entries(alt)) { const R = range({ ...OU_LUO_K, ...patch }); check(`misread would be caught: ${name}`, !near(R), `range ${R.mn.toFixed(2)} to ${R.mx.toFixed(2)}`); }

// Points read off the paper's figures
const K = OU_LUO_K, tanh = Math.tanh, sin = (d) => Math.sin((d * Math.PI) / 180);
const HC = (dC) => K.hc0 + K.hc1 * tanh(K.hc2 - K.hc3 * dC);
check('Fig. 4b: HC at chromatic difference 0 is about 0.4', Math.abs(HC(0) - 0.4) < 0.05, HC(0).toFixed(3));
check('Fig. 4b: HC at chromatic difference 75 is about -0.5', Math.abs(HC(75) - -0.5) < 0.05, HC(75).toFixed(3));
const HdL = (d) => K.dl0 + K.dl1 * tanh(K.dl2 + K.dl3 * d);
check('Fig. 8: lightness-difference term is 0 at 0 and about 0.3 from 25 up', Math.abs(HdL(0)) < 0.05 && Math.abs(HdL(50) - 0.3) < 0.05);
const HS = (h) => K.hs0 + K.hs1 * sin(h + K.hs2) + K.hs3 * sin(2 * h + K.hs4);
check('Fig. 10a: hue curve is about -0.26 at 0 degrees and about +0.09 at 270', Math.abs(HS(0) - -0.26) < 0.05 && Math.abs(HS(270) - 0.09) < 0.05, `${HS(0).toFixed(3)}, ${HS(270).toFixed(3)}`);
const EY = (L, h) => { const a = (90 - h) / K.ey2; return ((K.ey0 * L - K.ey1) / K.ey2) * Math.exp(a - Math.exp(a)); };
check('Fig. 11: yellow effect peaks at 90 degrees, about +0.18 for a light yellow (L 80) and -0.19 for a dark one (L 34)', Math.abs(EY(80, 90) - 0.18) < 0.03 && Math.abs(EY(34, 90) - -0.19) < 0.03, `${EY(80, 90).toFixed(3)}, ${EY(34, 90).toFixed(3)}`);
const HLs = (x) => K.ls0 + K.ls1 * tanh(K.ls2 + K.ls3 * x);
check('Fig. 6b: lightness-sum term crosses zero near Lsum 115 and reaches about +0.8 at 190', Math.abs(HLs(115)) < 0.05 && Math.abs(HLs(190) - 0.8) < 0.08, `${HLs(115).toFixed(3)}, ${HLs(190).toFixed(3)}`);

// Digitized curves (engine/fixtures/ou_luo_figs.json, read from the figure pixels, about +-0.03).
const figs = JSON.parse(fs.readFileSync(new URL('./fixtures/ou_luo_figs.json', import.meta.url)));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const errHS = (KK) => figs.fig10a.map(([h, v]) => Math.abs(KK.hs0 + KK.hs1 * sin(h + KK.hs2) + KK.hs3 * sin(2 * h + KK.hs4) - v));
check('Fig. 10a digitized curve: median gap to Eq. (7) under 0.02', med(errHS(K)) < 0.02, `median ${med(errHS(K)).toFixed(3)}`);
check('Fig. 10a would catch: HS phase 50 misread as 80', med(errHS({ ...K, hs2: 80 })) >= 0.02, `median ${med(errHS({ ...K, hs2: 80 })).toFixed(3)}`);
check('Fig. 10a would catch: second-harmonic amplitude -0.07 misread as +0.07', med(errHS({ ...K, hs3: 0.07 })) >= 0.02, `median ${med(errHS({ ...K, hs3: 0.07 })).toFixed(3)}`);
// C1, documented on purpose: Fig. 6b does not agree with printed Eq. (4). This check records the size of the gap so the
// TO-CONFIRM note and the code cannot drift apart silently. It is not a claim that the equation is right.
const gap6b = Math.sqrt(figs.fig6b.reduce((s, [x, v]) => s + (HLs(x) - v) ** 2, 0) / figs.fig6b.length);
check('C1 (documented): Fig. 6b curve sits about 0.11 rms from printed Eq. (4)', gap6b > 0.07 && gap6b < 0.16, `rms ${gap6b.toFixed(3)}`);

// C3, partial and weaker than the paper's r = 0.75. Gurura et al. (2004, AIC Interim Meeting, pp. 239-242) publish which of the 30 pairs rated
// harmonious (22) and disharmonious (8) but not the scores, and their grouping is across all backgrounds, not the gray of the 2006 test.
// Colors are Table IV of Ou & Luo (2006). The 22nd harmonious pair (gray/brown) is inferred: the AIC footnote lists yellow/gray twice, and its text
// calls gray & brown a formerly harmonious pair. This only asks whether the model ranks the harmonious group above the other (AUC), nothing more.
const GT = { black:[32.4,1.5,85], blue:[51.1,40,272], brown:[49.5,23.7,59], cream:[99.5,17,87], green:[66.3,44.7,157], gray:[66.4,5.3,97], lime:[78.5,61.2,123], orange:[70.4,71.2,44], pink:[84.5,37.6,6], plum:[41.5,27,9], purple:[42,27.7,297], red:[53.4,62,30], white:[96.2,2.1,23], yellow:[90.8,79.5,85] };
const gl = ([L, C, h]) => ({ l: L, a: C * Math.cos((h * Math.PI) / 180), b: C * Math.sin((h * Math.PI) / 180) });
const gs = (p, KK = K) => { const [a, b] = p.split('/'); return ouLuoModel(gl(GT[a]), gl(GT[b]), KK).CH; };
const gHar = ['pink/gray','red/yellow','cream/plum','gray/black','blue/white','brown/cream','blue/cream','pink/plum','gray/purple','pink/purple','yellow/white','lime/white','yellow/gray','cream/yellow','orange/cream','white/orange','white/pink','black/lime','green/white','white/red','plum/gray','gray/brown'];
const gDis = ['plum/blue','brown/blue','white/cream','pink/green','orange/green','green/plum','blue/red','plum/red'];
const auc = (KK) => { let w = 0; for (const a of gHar) for (const b of gDis) { const x = gs(a, KK), y = gs(b, KK); w += x > y ? 1 : x === y ? 0.5 : 0; } return w / (gHar.length * gDis.length); };
check('C3 (partial): model ranks the AIC harmonious pairs above the disharmonious ones (AUC over 22 x 8 pairs above 0.75)', auc(K) > 0.75, `AUC ${auc(K).toFixed(3)}`);
check('C3 (partial): a reversed model would fail that check', auc({ ...K, hc0: -0.04, hc1: -0.53, ls1: -0.54, dl1: -0.15, ec1: -0.5 }) < 0.5);

// Symmetry and identity: properties any implementation must have
const p = ouLuoModel(lab(colors[0]), lab(colors[20])).CH, q = ouLuoModel(lab(colors[20]), lab(colors[0])).CH;
check('score does not depend on the order of the two colors', Math.abs(p - q) < 1e-12);
console.log(fails ? `${fails} FAILED` : `ALL PASS`); process.exit(fails ? 1 : 0);
