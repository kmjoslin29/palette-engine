// D49: the nearest fix for color-blind views. Every result is re-checked with an independent buildPalette, so the search's
// shortcut (keyRoleOf instead of a whole palette per candidate) cannot drift from what the palette really builds.
// Run after: node build/bundle.mjs
import * as PE from '../dist/engine.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const man = (hex) => ({ hex, origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null });
const make = (seed, sec, ter) => { const s = PE.defaultState(); s.seed = man(seed); s.supporting = { secondary: sec.map(man), tertiary: ter.map(man) }; return s; };
const hueOf = (hex) => PE.hctOf(hex)[0];
const hueDiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

// keyRoleOf must equal what buildPalette builds, for every slot, with and without harmonize
{
  let seedRng = 11; const rnd = () => { seedRng = (seedRng * 16807) % 2147483647; return seedRng / 2147483647; };
  const hx = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
  let bad = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    const seed = hx(); const sup = PE.EXT_IDS.concat(['secondary', 'tertiary']).map((role, i) => ({ role, hex: hx(), ...(i % 2 && k % 2 ? { harmonize: true } : {}) }));
    const pal = PE.buildPalette(seed, sup);
    for (const x of sup) { n++; const kr = PE.keyRoleOf(x.hex, x.role, seed, { harmonize: !!x.harmonize && x.role.match(/\d$/) }); if (kr.light !== pal.schemes.light[x.role] || kr.dark !== pal.schemes.dark[x.role]) bad++; }
  }
  check(`keyRoleOf equals buildPalette's key role in ${n} random slots, light and dark`, bad === 0, `${bad} differ`);
}

/** Independent re-check: pairs under ΔE00 10 that involve `id`, from a fresh buildPalette with `hex` in place. */
function recheck(s, tier, i, hex) {
  const id = PE.slotId(tier, i); const sup = PE.supportSlots(s).map((x) => ({ role: x.id, hex: x.id === id ? hex : x.rec.hex }));
  const pal = PE.buildPalette(s.seed.hex, sup);
  const mine = (f) => f.a === id || f.b === id;
  return { brand: pal.brandCvd.filter(mine).length, light: pal.checks.light.cvd.filter(mine).length, dark: pal.checks.dark.cvd.filter(mine).length };
}

// A palette where a full fix exists (found by a seeded random survey, 2026-11-20)
{
  const s = make('#137758', ['#0067c9', '#9de93a'], ['#3b3b79']);
  const r = PE.nearestFix(s, 'secondary', 1);
  check('fixable palette: status fixed', r.status === 'fixed', r.status);
  const rc = recheck(s, 'secondary', 1, r.hex);
  check('fixed: an independent buildPalette finds no pair under ΔE00 10 involving the color, brand or roles', rc.brand === 0 && rc.light === 0 && rc.dark === 0, JSON.stringify(rc));
  check('fixed: the before state had a pair under the line', r.before.brand.length + r.before.roles.light.length + r.before.roles.dark.length > 0);
  check('fixed: the reported distance is ΔE00 from the original', r.dE00 === Math.round(PE.de00(PE.labD50('#9de93a'), PE.labD50(r.hex)) * 10) / 10);
  check('fixed: hue moved at most 15° (HCT) and chroma stayed above the neutral line', Math.abs(hueDiff(hueOf(r.hex), hueOf('#9de93a'))) <= 15.05 && PE.hctOf(r.hex)[1] >= PE.NEAR_NEUTRAL_CHROMA - 0.5);
  // local check: no candidate closer to the original on a fine grid around it passes both targets
  const fineCloser = [];
  const o = PE.hctOf('#9de93a'); const f = PE.hctOf(r.hex);
  for (let dh = -2; dh <= 2; dh++) for (let dc = -2; dc <= 2; dc++) for (let dt = -1; dt <= 1; dt += 0.5) {
    const hex = PE.hexFromHct(f[0] + dh, f[1] + dc, f[2] + dt); if (!hex) continue;
    const d = PE.de00(PE.labD50('#9de93a'), PE.labD50(hex)); if (d >= r.dE00 - 0.05) continue;
    if (Math.abs(hueDiff(PE.hctOf(hex)[0], o[0])) > 15 || PE.hctOf(hex)[1] < PE.NEAR_NEUTRAL_CHROMA) continue;
    const c = recheck(s, 'secondary', 1, hex); if (!c.brand && !c.light && !c.dark) fineCloser.push(hex);
  }
  check('fixed: no closer color near it passes both targets (within the search grid\'s resolution)', fineCloser.length === 0, fineCloser.join(' ')); console.log('   closer passing colors found:', fineCloser.length, fineCloser.map((h) => h + ' ' + (Math.round(PE.de00(PE.labD50('#9de93a'), PE.labD50(h)) * 10) / 10)).join(', '), 'vs fix', r.dE00);
  check('fixed: other colors are not moved', s.supporting.secondary[0].hex === '#0067c9' && s.supporting.secondary[1].hex === '#9de93a' && !s.supporting.secondary[1].proposal);
}

// Kwade's screenshot palette (2026-11-20)
{
  const s = make('#e64123', ['#6cc0a6', '#e7d323', '#84bdc6'], ['#b8b8b8', '#333333']);
  check('screenshot: a gray is not fixed; Treat as neutral is the answer', PE.nearestFix(s, 'tertiary', 0).status === 'neutral' && PE.nearestFix(s, 'tertiary', 1).status === 'neutral');
  const r = PE.nearestFix(s, 'secondary', 0);
  const cnt = (x) => x.brand.length + x.roles.light.length + x.roles.dark.length;
  check('screenshot: Secondary 1 gets a partial fix with fewer pairs under the line', r.status === 'partial' && cnt(r.after) < cnt(r.before) && r.after.brand.length <= r.before.brand.length, `${r.status} ${cnt(r.before)}->${r.after && cnt(r.after)}`);
  const rc = recheck(s, 'secondary', 0, r.hex);
  check('screenshot: the partial fix\'s remaining pairs match an independent buildPalette', rc.brand === r.after.brand.length && rc.light === r.after.roles.light.length && rc.dark === r.after.roles.dark.length, JSON.stringify(rc));
  check('screenshot: Secondary 2 (yellow) has no better color within the limit, and says so', PE.nearestFix(s, 'secondary', 1).status === 'none');
}

// Nothing to fix, generated colors, locked and proposals
{
  const s = make('#ec54bf', ['#b041a0', '#a4cd13'], ['#93d2a1']);
  check('a color with no pair under the line: status clear', PE.nearestFix(s, 'secondary', 1).status === 'clear');
  const g = make('#137758', ['#0067c9', '#9de93a'], ['#3b3b79']); g.supporting.secondary[1].origin = 'harmony:triadic';
  check('a generated color cannot be fixed (nothing existing to stay close to)', PE.nearestFix(g, 'secondary', 1).status === 'unavailable');
  const p = make('#137758', ['#0067c9', '#9de93a'], ['#3b3b79']); const r = PE.nearestFix(p, 'secondary', 1);
  check('a fix becomes a proposal with origin "fix" and round-trips in a project file', PE.setProposal(p, 'secondary', 1, { hex: r.hex, origin: 'fix' }) === 0 && (() => { const t = PE.parseProject(PE.serializeProject(p, { now: '2026-11-20T00:00:00Z' })); return t.ok && t.state.supporting.secondary[1].proposal.origin === 'fix'; })());
  check('the review names a fix as the nearest fix for color-blind views', PE.reviewModel(p).rows[1].proposalSource === 'the nearest fix for color-blind views');
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
