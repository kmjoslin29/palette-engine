// Phase 5: project file save/load. Round-trips real states, then feeds the loader hostile and broken files.
// Run after: node build/bundle.mjs
import * as PE from '../dist/engine.mjs';
import fs from 'node:fs';
import { stateA, stateB, stateC, stateD, stateE } from './export_fixtures.mjs';
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 300) : ''}`); if (!ok) fails++; };
const NOW = '2026-09-28T12:00:00.000Z';
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const deep = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

for (const [n, s] of [['A', stateA()], ['B', stateB()], ['C', stateC()], ['D', stateD()], ['E', stateE()], ['empty', PE.defaultState()]]) {
  const text = PE.serializeProject(s, { now: NOW });
  const r = PE.parseProject(text);
  const { seedError, ...want } = s;
  check(`${n}: save then load returns the identical state`, r.ok && deep(r.state, { ...want, seedError: '' }) && r.warnings.length === 0, r.errors.join('; ') + JSON.stringify(r.state).slice(0, 100));
  check(`${n}: the file is envelope + state, with the format name and a timestamp`, (() => { const o = JSON.parse(text); return o.format === 'palette-engine-project' && o.version === 3 && o.savedAt === NOW && o.state.v === 3; })());
}
check('saving is deterministic for the same state and time', PE.serializeProject(stateA(), { now: NOW }) === PE.serializeProject(stateA(), { now: NOW }));
check('a state saved twice through load stays byte-identical (no drift)', (() => { const t1 = PE.serializeProject(stateB(), { now: NOW }); const t2 = PE.serializeProject(PE.parseProject(t1).state, { now: NOW }); const t3 = PE.serializeProject(PE.parseProject(t2).state, { now: NOW }); return t2 === t3 && deep(JSON.parse(t1), JSON.parse(t2)); })());
check('the transient seedError is not written', !/seedError/.test(PE.serializeProject({ ...stateA(), seedError: 'oops' }, { now: NOW })));
check('a bare state object (as kept in browser storage) is accepted too', PE.parseProject(JSON.stringify(stateA())).ok);
check('notes with newlines, quotes and non-Latin text survive exactly', (() => { const s = stateA(); s.seed.rationale = 'Line1\n"quoted" \\ backslash\n蓝色 🌊\ttab'; return PE.parseProject(PE.serializeProject(s)).state.seed.rationale === s.seed.rationale; })());
check('hex is normalized to lowercase on load', PE.parseProject(JSON.stringify({ ...stateA(), seed: { ...stateA().seed, hex: '#1F5FA8' } })).state.seed.hex === '#1f5fa8');

// refusals: every one must say why and load nothing
const bad = (name, mutate, expect) => {
  const o = JSON.parse(PE.serializeProject(stateB(), { now: NOW })); mutate(o);
  const r = PE.parseProject(JSON.stringify(o));
  check(`refused: ${name}`, !r.ok && r.state === null && r.errors.length > 0 && (!expect || r.errors.join(' ').includes(expect)), r.errors.join('; '));
};
bad('unknown project version', (o) => { o.state.v = 4; }, 'Unsupported');
bad('unknown envelope version', (o) => { o.version = 9; }, 'Unsupported');
bad('another format', (o) => { o.format = 'something-else'; }, 'not a Palette Engine project');
bad('seed hex that is not a color', (o) => { o.state.seed.hex = 'javascript:alert(1)'; }, 'seed.hex');
bad('short hex', (o) => { o.state.seed.hex = '#fff'; }, 'seed.hex');
bad('unknown step', (o) => { o.state.step = 'admin'; }, 'step');
bad('unknown print profile', (o) => { o.state.profile = 'swop2006'; }, 'profile');
bad('unknown lens', (o) => { o.state.lens = 'rainbow'; }, 'lens');
bad('override for a role that does not exist', (o) => { o.state.overrides.light.notARole = '#123456'; }, 'notARole');
bad('override that is not a hex', (o) => { o.state.overrides.dark.onSurface = 'red'; }, 'onSurface');
bad('accepted-failure key with the wrong shape', (o) => { o.state.accepted['x|y'] = 'hi'; }, 'accepted');
bad('accepted-failure note that is not text', (o) => { o.state.accepted['light|onSurface|surface|text'] = { a: 1 }; }, 'note');
bad('a note over 2000 characters', (o) => { o.state.accepted['light|onSurface|surface|text'] = 'x'.repeat(2001); }, '2000');
bad('rationale over 5000 characters', (o) => { o.state.seed.rationale = 'x'.repeat(5001); }, 'rationale');
bad('a supporting color built from descriptors', (o) => { o.state.supporting.secondary = [{ hex: '#112233', origin: 'descriptor', tier: null, rationale: '', locked: false, lens: null, offset: null }]; }, 'supporting');
bad('tier that is not one of the four', (o) => { o.state.seed.tier = 'certain'; }, 'tier');
bad('offset list too long', (o) => { o.state.offsets.complementary = Array(9).fill(1); }, 'offsets');
bad('offsets that are not numbers', (o) => { o.state.offsets.complementary = ['a']; }, 'offsets');
bad('spot text that is not text', (o) => { o.state.spot.text = 12; }, 'spot.text');
bad('supporting colors with no seed', (o) => { o.state.seed = null; o.state.supporting.secondary = [{ hex: '#112233', origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null }]; }, 'seed');
bad('mappedFrom with a non-number', (o) => { o.state.seed.mappedFrom = { l: 'x', c: 1, h: 1 }; }, 'mappedFrom');
for (const [n, t] of [['not JSON', '{oops'], ['a JSON array', '[1,2]'], ['JSON null', 'null'], ['an empty file', ''], ['a huge file', ' '.repeat(2 * 1024 * 1024 + 1)], ['random text', 'hello']]) { const r = PE.parseProject(t); check(`refused: ${n}`, !r.ok && r.errors.length === 1, r.errors.join(';')); }
check('refused: not text at all', !PE.parseProject(undefined).ok && !PE.parseProject(new Uint8Array(4)).ok);
// tolerance and safety
{
  const o = JSON.parse(PE.serializeProject(stateA(), { now: NOW })); o.state.extraField = 'x'; o.state.supporting.other = 1; o.state.filters.bogus = true; o.state.offsets.nolens = [1];
  const r = PE.parseProject(JSON.stringify(o));
  check('unknown fields are ignored with a warning each, and the rest loads', r.ok && r.warnings.length === 4 && !('extraField' in r.state), r.warnings.join('; '));
  const proto = PE.parseProject('{"format":"palette-engine-project","version":1,"state":{"v":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}');
  check('__proto__ and constructor keys at the top level are ignored with warnings and pollute nothing', proto.ok && proto.warnings.length >= 1 && ({}).polluted === undefined && Object.prototype.polluted === undefined && !('polluted' in proto.state), JSON.stringify(proto.errors));
  const proto2 = PE.parseProject('{"format":"palette-engine-project","version":1,"state":{"v":1,"overrides":{"light":{"__proto__":{"x":1}}}}}');
  check('a __proto__ role in overrides is refused and pollutes nothing', !proto2.ok && /__proto__/.test(proto2.errors.join()) && ({}).x === undefined);
  check('a loaded state is rebuilt, not the parsed object (no aliasing of hostile input)', (() => { const raw = { v: 1, seed: { hex: '#112233', origin: 'manual', tier: null, rationale: '', locked: false, mappedFrom: null, evil: () => 1 } }; const r = PE.validateState(raw); return r.ok && r.state.seed !== raw.seed && !('evil' in r.state.seed); })());
  const r2 = PE.validateState({ v: 1, seed: { hex: '#112233', origin: 'manual' }, step: 'export' });
  check('a partial state loads with defaults filled in', r2.ok && r2.state.seed.rationale === '' && r2.state.seed.locked === false && r2.state.step === 'export' && r2.state.profile === 'gracol2013_crpc6', r2.errors.join(';'));
  check('a step other than seed with no seed falls back to seed', PE.validateState({ v: 1, step: 'palette' }).state.step === 'seed');
}
// ---- D44: up to three secondary and three tertiary colors, and version 1 files ------------------------------------------
const sup = (hex, extra) => ({ hex, origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null, ...(extra || {}) });
bad('four secondary colors', (o) => { o.state.supporting.secondary = ['#111111', '#222222', '#333333', '#444444'].map((x) => sup(x)); }, 'the most is 3');
bad('a gap in a tier list', (o) => { o.state.supporting.tertiary = [sup('#111111'), null, sup('#333333')]; }, 'no gaps');
bad('a tier that is one record, not a list, in a version 3 file', (o) => { o.state.supporting.secondary = sup('#111111'); }, 'list');
bad('harmonize that is not true or false', (o) => { o.state.supporting.secondary = [sup('#111111'), sup('#222222', { harmonize: 'yes' })]; }, 'harmonize');
bad('an override for a fourth secondary', (o) => { o.state.overrides.light.secondary4 = '#123456'; }, 'secondary4');
{
  const o = stateE(); o.paletteInput = { primary: 'x'.repeat(121), secondary: ['y'.repeat(500)], tertiary: [''] };
  const r = PE.parseProject(PE.serializeProject(o, { now: NOW }));
  check('an over-long palette-entry field is cut with a warning, never a reason to refuse the project (review finding 1)', r.ok && r.state.paletteInput.primary.length === 120 && r.state.paletteInput.secondary[0].length === 120 && r.warnings.length === 2, r.errors.join('; '));
}
bad('palette entry fields beyond three', (o) => { o.state.paletteInput = { primary: '', secondary: ['', '', '', ''], tertiary: [''] }; }, 'paletteInput.secondary');
bad('a palette entry field that is not text', (o) => { o.state.paletteInput = { primary: 5, secondary: [''], tertiary: [''] }; }, 'paletteInput.primary');
bad('palette path value that is unknown', (o) => { o.state.path = 'sheet'; }, 'path');
{
  const e = stateE(); e.overrides.dark.onTertiary3Container = '#ffffff'; e.accepted[PE.acceptKey('light', 'onSecondary2', 'secondary2', 'text')] = 'Teal kept for links only.';
  const r = PE.parseProject(PE.serializeProject(e, { now: NOW }));
  check('extended roles are accepted in overrides and accepted-failure notes', r.ok && r.state.overrides.dark.onTertiary3Container === '#ffffff' && r.state.accepted['light|onSecondary2|secondary2|text'] === 'Teal kept for links only.', r.errors.join('; '));
  check('E: three of each tier survive in order, with harmonize and names', r.ok && r.state.supporting.secondary.map((x) => x.hex).join() === '#d9822b,#0083a8,#f2c14e' && r.state.supporting.secondary[2].harmonize === true && r.state.supporting.tertiary[1].name === 'Harbour Teal');
  const slots = PE.supportSlots(r.state);
  check('slot ids follow the tier and position: secondary, secondary2, secondary3, tertiary, tertiary2, tertiary3', slots.map((x) => x.id).join() === 'secondary,secondary2,secondary3,tertiary,tertiary2,tertiary3');
  const s2 = stateE(); s2.supporting.secondary[0].harmonize = true;
  check('harmonize is never passed for Secondary 1 or Tertiary 1 (they set the core roles)', PE.supportingForPalette(s2).filter((x) => x.harmonize).map((x) => x.role).join() === 'secondary3');
  check('a focus that names no current color falls back to primary', PE.validateState({ ...stateA(), focus: 'tertiary3' }).state.focus === 'primary' && PE.validateState({ ...stateE(), focus: 'tertiary3' }).state.focus === 'tertiary3');
  check('a target that is not a slot falls back to Secondary 1', PE.validateState({ ...stateA(), target: 'quaternary' }).state.target === 'secondary' && PE.validateState({ ...stateA(), target: 'tertiary2' }).state.target === 'tertiary2');
}
{
  const v1 = fs.readFileSync(new URL('./fixtures/project_v1_fernhill.json', import.meta.url), 'utf8');
  const r = PE.parseProject(v1); const o = JSON.parse(v1);
  check('a version 1 project file (Fernhill, as committed before D44) still opens', r.ok, r.errors.join('; '));
  check('version 1: each supporting record becomes a one-color list, nothing else changes', r.ok && r.state.supporting.secondary.length === 1 && r.state.supporting.secondary[0].hex === o.state.supporting.secondary.hex && r.state.supporting.tertiary[0].rationale === o.state.supporting.tertiary.rationale && r.state.seed.hex === o.state.seed.hex && deep(r.state.accepted, o.state.accepted));
  check('version 1: one warning says the file is from an earlier version', r.warnings.length === 1 && /earlier version/.test(r.warnings[0]), r.warnings.join('; '));
  check('version 1: saving again writes version 3, and that reloads with no warning', (() => { const t = PE.serializeProject(r.state, { now: NOW }); const r2 = PE.parseProject(t); return JSON.parse(t).version === 3 && r2.ok && r2.warnings.length === 0 && deep(r2.state, r.state); })());
  check('version 1: a null tier stays empty', PE.validateState({ v: 1, seed: { hex: '#112233', origin: 'manual' }, supporting: { secondary: null, tertiary: null } }).state.supporting.secondary.length === 0);
  check('version 1: a list in a version 1 file is refused', !PE.validateState({ v: 1, seed: { hex: '#112233', origin: 'manual' }, supporting: { secondary: [] } }).ok);
  const mA = PE.buildExportModel(r.state, {}, { date: '2026-09-28' }), mB = PE.buildExportModel(PE.parseProject(fs.readFileSync(new URL('../examples/fernhill-bakery/fernhill-bakery.palette-project.json', import.meta.url), 'utf8')).state, {}, { date: '2026-09-28' });
  check('version 1 and its version 2 copy give the same Markdown spec', PE.markdownSpec(mA) === PE.markdownSpec(mB));
}

// ---- D47: existing colors, proposals, held notes and brand neutrals ---------------------------------------------------
{
  const man = (hex, extra = {}) => ({ hex, origin: 'manual', tier: null, rationale: '', locked: false, lens: null, offset: null, ...extra });
  const base = () => { const s = PE.defaultState(); s.seed = { hex: '#e64123', origin: 'manual', tier: null, rationale: '', locked: false }; s.step = 'support';
    s.supporting = { secondary: [man('#6cc0a6'), man('#e7d323'), man('#84bdc6')], tertiary: [man('#b8b8b8'), man('#333333')] }; return s; };
  const prop = { hex: '#7a5cc4', origin: 'harmony:triadic', tier: 'low confidence', lens: 'triadic', offset: 120 };
  let s = base();
  check('D47: an entered color is "existing"; a lens-filled one is "generated"', PE.choiceOf(s.supporting.secondary[0]) === 'existing' && PE.choiceOf({ ...man('#123456'), origin: 'harmony:triadic' }) === 'generated');
  check('D47: a proposal can be set on an existing color and nothing changes until it is chosen', PE.setProposal(s, 'tertiary', 1, prop) === 0 && PE.supportSlots(s).find((x) => x.id === 'tertiary2').rec.hex === '#333333' && PE.supportSlots(s).find((x) => x.id === 'tertiary2').choice === 'existing');
  check('D47: a generated slot cannot hold a proposal', (() => { const t = base(); t.supporting.secondary[0].origin = 'harmony:triadic'; return PE.setProposal(t, 'secondary', 0, prop) === -1; })());
  check('D47: a locked slot cannot take a proposal or switch', (() => { const t = base(); t.supporting.tertiary[1].locked = true; return PE.setProposal(t, 'tertiary', 1, prop) === -1; })());
  s.overrides.light.tertiary2 = '#111111'; s.accepted['light|onTertiary2|tertiary2|text'] = 'existing note'; s.overrides.dark.primary = '#222222';
  check('D47: choosing the proposal exports its color, with replaces naming the existing one', PE.setChoice(s, 'tertiary', 1, 'proposal') && (() => { const x = PE.supportSlots(s).find((y) => y.id === 'tertiary2'); return x.rec.hex === '#7a5cc4' && x.rec.replaces === '#333333' && x.choice === 'proposal' && x.rec.origin === 'harmony:triadic'; })());
  check('D47: notes written for the existing color are held, not applied to the proposal', !s.overrides.light.tertiary2 && !s.accepted['light|onTertiary2|tertiary2|text'] && s.supporting.tertiary[1].held.overrides.light['0'] === '#111111' && s.supporting.tertiary[1].held.accepted['light|1|0|text'] === 'existing note' && s.overrides.dark.primary === '#222222');
  s.overrides.light.onTertiary2 = '#fefefe';
  check('D47: switching back restores the existing notes and holds the proposal ones', PE.setChoice(s, 'tertiary', 1, 'existing') && s.overrides.light.tertiary2 === '#111111' && s.accepted['light|onTertiary2|tertiary2|text'] === 'existing note' && !s.overrides.light.onTertiary2 && s.supporting.tertiary[1].held.overrides.light['1'] === '#fefefe');
  check('D47: buildPalette gets the chosen color; existingForPalette always the entered one', (() => { PE.setChoice(s, 'tertiary', 1, 'proposal'); const a = PE.supportingForPalette(s).find((x) => x.role === 'tertiary2').hex, b = PE.existingForPalette(s).find((x) => x.role === 'tertiary2').hex; return a === '#7a5cc4' && b === '#333333'; })());
  check('D47: a v3 project with a chosen proposal and held notes round-trips exactly', (() => { const t = PE.serializeProject(s, { now: NOW }); const r = PE.parseProject(t); const { seedError, ...want } = s; return r.ok && r.warnings.length === 0 && deep(r.state, { ...want, seedError: '' }); })());
  check('D47: replacing an in-use proposal drops the notes written about it, and says how many', PE.setProposal(s, 'tertiary', 1, { ...prop, hex: '#5c7ac4' }) === 1 && !s.overrides.light.onTertiary2 && s.supporting.tertiary[1].held.overrides.light['0'] === '#111111');
  check('D47: clearing the proposal returns to the existing color with its notes', PE.clearProposal(s, 'tertiary', 1) === 0 && !s.supporting.tertiary[1].proposal && !s.supporting.tertiary[1].use && s.overrides.light.tertiary2 === '#111111');
  check('D47: held notes follow the color when a slot moves up', (() => { const t = base(); PE.setProposal(t, 'tertiary', 1, prop); t.overrides.light.tertiary2 = '#101010'; PE.setChoice(t, 'tertiary', 1, 'proposal'); const n = t.supporting.tertiary.length; t.supporting.tertiary.splice(0, 1); PE.remapTier(t, 'tertiary', [1], n); PE.setChoice(t, 'tertiary', 0, 'existing'); return t.overrides.light.tertiary === '#101010'; })());
  // neutrals
  const g = base();
  check('D47: grays are near-neutral (chroma under 10); the screenshot accents are not', PE.nearNeutral('#b8b8b8').near && PE.nearNeutral('#333333').near && !PE.nearNeutral('#6cc0a6').near && !PE.nearNeutral('#e7d323').near && PE.NEAR_NEUTRAL_CHROMA === 10);
  check('D47: nearNeutral reports the tone a gray keeps as a neutral (#B8B8B8 about 75, #333333 about 21)', Math.abs(PE.nearNeutral('#b8b8b8').tone - 75) <= 1 && Math.abs(PE.nearNeutral('#333333').tone - 21) <= 1);
  g.supporting.tertiary[1].name = 'Charcoal'; g.overrides.light.tertiary2 = '#000000';
  check('D47: Treat as neutral moves the color out of its tier and drops its role notes', PE.moveToNeutrals(g, 'tertiary', 1) && g.supporting.tertiary.length === 1 && g.neutrals.length === 1 && g.neutrals[0].hex === '#333333' && g.neutrals[0].name === 'Charcoal' && g.neutrals[0].fromTier === 'tertiary' && !g.overrides.light.tertiary2);
  check('D47: neutral slots are numbered and can be the Analyze focus', (() => { g.focus = 'neutral1'; const r = PE.validateState(JSON.parse(JSON.stringify(g))); return PE.neutralSlots(g)[0].id === 'neutral1' && r.ok && r.state.focus === 'neutral1'; })());
  check('D47: neutrals stay out of the role palettes', !PE.supportingForPalette(g).some((x) => x.hex === '#333333'));
  check('D47: a neutral can go back to the end of its tier', PE.restoreNeutral(g, 0) && g.neutrals.length === 0 && g.supporting.tertiary[1].hex === '#333333' && g.supporting.tertiary[1].origin === 'manual' && g.supporting.tertiary[1].name === 'Charcoal');
  check('D47: at most three neutrals', (() => { const t = base(); t.neutrals = [{ hex: '#111111', rationale: '', fromTier: 'tertiary' }, { hex: '#222222', rationale: '', fromTier: 'tertiary' }, { hex: '#444444', rationale: '', fromTier: 'tertiary' }]; return !PE.moveToNeutrals(t, 'tertiary', 0); })());
  check('D47: a generated color cannot be moved to neutrals', (() => { const t = base(); t.supporting.tertiary[0].origin = 'harmony:triadic'; return !PE.moveToNeutrals(t, 'tertiary', 0); })());
  // refusals
  const v3 = () => JSON.parse(PE.serializeProject(base(), { now: NOW }));
  const refused = (name, mutate, expect) => { const o = v3(); mutate(o); const r = PE.parseProject(JSON.stringify(o)); check(`D47 refused: ${name}`, !r.ok && r.errors.join(' ').includes(expect), r.errors.join('; ')); };
  refused('a proposal on a generated color', (o) => { o.state.supporting.secondary[0].origin = 'harmony:triadic'; o.state.supporting.secondary[0].lens = 'triadic'; o.state.supporting.secondary[0].proposal = prop; }, 'only an existing');
  refused('use "proposal" with no proposal', (o) => { o.state.supporting.secondary[0].use = 'proposal'; }, 'no proposal');
  refused('a bad proposal hex', (o) => { o.state.supporting.secondary[0].proposal = { ...prop, hex: 'red' }; }, 'proposal.hex');
  refused('a held note key that is not a role position', (o) => { o.state.supporting.secondary[0].proposal = prop; o.state.supporting.secondary[0].held = { overrides: { light: { tertiary: '#111111' } } }; }, 'role position');
  refused('four neutrals', (o) => { o.state.neutrals = [1, 2, 3, 4].map(() => ({ hex: '#111111', rationale: '', fromTier: 'tertiary' })); }, 'the most is 3');
  refused('neutrals in a version 2 file', (o) => { o.version = 2; o.state.v = 2; o.state.neutrals = [{ hex: '#111111', rationale: '', fromTier: 'tertiary' }]; }, 'version 3');
  check('D47: a version 2 file opens with no warning and every color existing', (() => { const o = v3(); o.version = 2; o.state.v = 2; delete o.state.neutrals; const r = PE.parseProject(JSON.stringify(o)); return r.ok && r.warnings.length === 0 && r.state.v === 3 && r.state.neutrals.length === 0 && PE.supportSlots(r.state).every((x) => x.choice === 'existing'); })());
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
