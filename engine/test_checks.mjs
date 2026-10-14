import {
  contrastRatio, textContrast, nonTextContrast, contrastMatrix,
  apcaScore, simulateCvd, cvdDistinctPairs, printLegibility,
} from './checks.js';
import { labD50 } from './color.js';

// --- WCAG (M7 pass condition) -----------------------------------------------

const r1 = contrastRatio('#767676', '#FFFFFF');
const r2 = contrastRatio('#777777', '#FFFFFF');
console.log('#767676 on #FFFFFF = 4.54:1:', r1 === 4.54 ? 'PASS' : `FAIL ${r1}`);
console.log('#777777 on #FFFFFF = 4.48:1:', r2 === 4.48 ? 'PASS' : `FAIL ${r2}`);

const pass = textContrast('#767676', '#FFFFFF');
const fail = textContrast('#777777', '#FFFFFF');
console.log('#767676/#FFFFFF passes AA normal text:', pass.aa === true ? 'PASS' : 'FAIL');
console.log('#777777/#FFFFFF fails AA normal text:', fail.aa === false ? 'PASS' : 'FAIL');
console.log('large-text bar is lower (3:1):', textContrast('#949494', '#FFFFFF', { large: true }).aa === true ? 'PASS' : 'FAIL');

const nt = nonTextContrast('#767676', '#FFFFFF');
console.log('non-text 3:1 check:', nt.pass === true ? 'PASS' : 'FAIL');

const matrix = contrastMatrix(
  { primary: '#1F5FA8', onPrimary: '#FFFFFF', surface: '#F5F5F5' },
  [['onPrimary', 'primary'], ['primary', 'surface', { large: true }]]
);
console.log('contrastMatrix shape:', matrix.length === 2 && 'ratio' in matrix[0] && 'aa' in matrix[0] ? 'PASS' : `FAIL ${JSON.stringify(matrix)}`);

// --- APCA (advisory) ---------------------------------------------------------

const apca = apcaScore('#767676', '#FFFFFF');
console.log('APCA score is a plausible Lc (nonzero, sane range):', Math.abs(apca) > 0 && Math.abs(apca) < 110 ? `PASS (${apca})` : `FAIL ${apca}`);

// --- CVD (Machado 2009) ------------------------------------------------------

const simRed = simulateCvd('#ff0000', 'protan');
console.log('simulateCvd returns a hex, different from the input under protan:',
  /^#[0-9a-f]{6}$/.test(simRed) && simRed !== '#ff0000' ? 'PASS' : `FAIL ${simRed}`);
try {
  simulateCvd('#ff0000', 'bogus');
  console.log('unknown CVD type throws: FAIL (did not throw)');
} catch {
  console.log('unknown CVD type throws: PASS');
}

// Red/green role pair should collapse under protan/deutan simulation.
const rgFlags = cvdDistinctPairs({ good: '#2e7d32', bad: '#c62828' }); // green vs red, similar lightness
console.log('red/green pair flags under protan or deutan:',
  rgFlags.some((f) => f.type === 'protan' || f.type === 'deutan') ? 'PASS' : `FAIL ${JSON.stringify(rgFlags)}`);

// Black/white should never collapse under any CVD type.
const bwFlags = cvdDistinctPairs({ ink: '#000000', paper: '#ffffff' });
console.log('black/white pair never flags:', bwFlags.length === 0 ? 'PASS' : `FAIL ${JSON.stringify(bwFlags)}`);

// --- Print legibility ---------------------------------------------------------

const leg = printLegibility(labD50('#000000'), labD50('#ffffff'));
console.log('print ΔL* black/white ~100:', Math.abs(leg.deltaL - 100) < 0.5 ? 'PASS' : `FAIL ${JSON.stringify(leg)}`);
