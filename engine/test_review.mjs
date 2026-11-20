// D48: the brand as entered compared with its proposals. Checks the shared comparison model the Checks step and the
// Palette review PDF read, against independent recomputation with the engine's own building blocks.
// Run after: node build/bundle.mjs
import * as PE from '../dist/engine.mjs';
import { luts, model, stateE, stateF } from './export_fixtures.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const man = (hex, x = {}) => ({ hex, origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null, ...x });
// Kwade's screenshot palette (2026-11-20): two gray tertiaries, each given a proposal
const shot = () => { const s = PE.defaultState(); s.seed = man('#e64123'); s.name = 'Screenshot brand';
  s.supporting = { secondary: [man('#6cc0a6'), man('#e7d323'), man('#84bdc6')], tertiary: [man('#b8b8b8'), man('#333333')] }; return s; };
const s = shot();
PE.setProposal(s, 'tertiary', 0, { hex: '#b86f9e', origin: 'harmony:triadic', lens: 'triadic', offset: 120, tier: 'low confidence' });
PE.setProposal(s, 'tertiary', 1, { hex: '#3f5fb8', origin: 'manual' });
const r = PE.reviewModel(s);

check('the brand as entered has the four close pairs and 15 / 18 role collapses found on 2026-11-20', r.totals.existing.brandCvd === 4 && r.totals.existing.roleCvdLight === 15 && r.totals.existing.roleCvdDark === 18);
const palE = PE.buildPalette('#e64123', PE.existingForPalette(s));
check('the existing side equals an independent buildPalette of the entered colors', r.totals.existing.brandCvd === palE.brandCvd.length && r.totals.existing.roleCvdLight === palE.checks.light.cvd.length && r.totals.existing.wcag === palE.checks.light.failures.length + palE.checks.dark.failures.length);
const palP = PE.buildPalette('#e64123', [...PE.existingForPalette(s).slice(0, 3), { role: 'tertiary', hex: '#b86f9e' }, { role: 'tertiary2', hex: '#3f5fb8' }]);
check('the proposed side equals an independent buildPalette with the proposals swapped in', r.totals.proposed.brandCvd === palP.brandCvd.length && r.totals.proposed.roleCvdLight === palP.checks.light.cvd.length && r.totals.proposed.roleCvdDark === palP.checks.dark.cvd.length);
check('proposals are compared whichever side the switch is on (both still on Existing here)', r.rows.every((x) => x.choice === 'existing') && r.proposalCount === 2 && r.hasProposal);
const t1 = r.rows.find((x) => x.id === 'tertiary');
check('distance and label agree with ΔE00 and the D47 bands', t1.dE00 === Math.round(PE.de00(PE.labD50('#b8b8b8'), PE.labD50('#b86f9e')) * 10) / 10 && t1.distance === 'New color' && PE.distanceLabel(3) === 'Within print tolerance' && PE.distanceLabel(3.1) === 'Visible adjustment' && PE.distanceLabel(10.1) === 'New color');
const near = t1.existing.closest.byType.deutan; const ind = Math.round(PE.de00(PE.labD50(PE.simulateCvd('#b8b8b8', 'deutan')), PE.labD50(PE.simulateCvd('#6cc0a6', 'deutan'))) * 10) / 10;
check('closest-under-color-blindness matches a direct simulation (Tertiary 1 vs Secondary 1, deutan 4.8)', near.other === 'secondary' && near.dE00 === ind && ind === 4.8);
check('the existing gray tertiaries give practically the same roles (ΔE00 1.3); the proposals do not', (() => { const a = t1.existing.roles.light[0].hex, b = r.rows.find((x) => x.id === 'tertiary2').existing.roles.light[0].hex; return PE.deBetween(a, b) < 2 && PE.deBetween(t1.proposal.roles.light[0].hex, r.rows.find((x) => x.id === 'tertiary2').proposal.roles.light[0].hex) > 10; })());
check('the sentences say what changes, in plain words', /clears the ΔE00 10 line and is easier to tell apart/.test(t1.sentences.join(' ')) && /Kept as entered; there is no proposal/.test(r.rows[0].sentences.join(' ')));
check('strips: four visions, both sides, changed slots marked only on the proposed side', ['normal', 'protan', 'deutan', 'tritan'].every((k) => r.strips.existing[k].length === 6 && r.strips.proposed[k].length === 6) && r.strips.proposed.normal.filter((x) => x.changed).map((x) => x.short).join() === 'T1,T2' && !r.strips.existing.normal.some((x) => x.changed));
check('strips: a simulated swatch is the engine simulation of the color', r.strips.proposed.deutan[4].hex === PE.simulateCvd('#b86f9e', 'deutan'));
check('role overrides are left out of the comparison', (() => { const o = JSON.parse(JSON.stringify(s)); o.overrides.light.tertiary = '#000000'; return PE.reviewModel(o).rows[3].existing.roles.light[0].hex === t1.existing.roles.light[0].hex; })());
check('brand neutrals are in the strips but not counted', (() => { const o = JSON.parse(JSON.stringify(s)); o.neutrals = [{ hex: '#777777', rationale: '', fromTier: 'tertiary' }]; const m = PE.reviewModel(o); return m.strips.existing.normal.at(-1).short === 'N1' && m.totals.existing.brandCvd === r.totals.existing.brandCvd; })());
check('a generated slot says there is nothing to compare', (() => { const o = shot(); o.supporting.secondary[0].origin = 'harmony:triadic'; o.supporting.secondary[0].lens = 'triadic'; PE.setProposal(o, 'tertiary', 0, { hex: '#b86f9e', origin: 'manual' }); return /Generated by a lens/.test(PE.reviewModel(o).rows[0].sentences[0]); })());
check('with print tables, CMYK and gamut come from the default profile', (() => { const m = PE.reviewModel(s, { printOf: model(s).printOf }); const p = m.rows.find((x) => x.id === 'tertiary2').proposal.print; return p && p.profile === 'GRACoL 2013 coated' && p.inGamut === false && m.totals.proposed.gamut === 1 && m.totals.existing.gamut === 0; })());
const none = PE.reviewModel(shot()); let refused = false; try { await PE.buildReviewPdf(none); } catch (e) { refused = /needs at least one proposal/.test(e.message); }
check('no proposals: the review PDF is refused with a clear message', !none.hasProposal && refused);
// The review is a decision aid: never blocked by accessibility failures (D48)
const F = stateF(); F.overrides.light.onPrimary = F.overrides.light.primary = '#777777';
const mF = model(F);
check('fixture F has unresolved WCAG failures, so the final files are blocked', mF.unresolved.length > 0 && (await PE.buildFile('pdf', mF, F).then(() => false, (e) => e instanceof PE.ExportBlockedError)));
const fr = await PE.buildFile('review', mF, F);
check('the review PDF still builds, named -palette-review.pdf', fr.name.endsWith('-palette-review.pdf') && fr.bytes > 5000 && fr.mime === 'application/pdf');
check('the review is not one of the final files (not in FORMATS or Download all)', !PE.FORMATS.some((f) => f.id === 'review') && PE.REVIEW_FORMAT.gated === false);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
