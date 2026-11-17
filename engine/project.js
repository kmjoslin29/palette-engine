// Palette Engine — project state: the one definition of its shape, plus strict save/load of a project file.
// A project file is plain JSON so work is not tied to one browser. Loading treats the file as untrusted:
// every field is checked and rebuilt from allowed keys; a bad file is refused with a list of reasons, never half-loaded.

import { LENSES } from './harmony.js';
import { ALL_ROLES, MAX_PER_TIER } from './palette.js';

/** Where each print condition is normally specified. Grouping only; it changes no number. */
export const PRINT_REGIONS = [
  { id: 'na', name: 'North America', label: 'United States and North America' },
  { id: 'eu', name: 'Europe', label: 'Europe' },
];
/**
 * Order matters: the first three keep their positions (the ASE and the summary tables read coated = 0, uncoated = 2).
 * `where` is what a designer needs in order to pick one; it is background, not a recommendation for a given job.
 * The registry pages for the three US profiles state no region; their region is where the issuing body and standard sit.
 */
export const PRINT_PROFILES = [
  { id: 'gracol2013_crpc6', short: 'GRACoL 2013 coated', region: 'na', ase: 'Print GRACoL coated CMYK',
    where: 'GRACoL is the US specification for general commercial offset on coated paper. A common starting point for US sheetfed work.' },
  { id: 'swop2013c3_crpc5', short: 'SWOP 2013', region: 'na', ase: null,
    where: 'SWOP is the US specification for web offset publication printing, such as magazines and inserts, with a lower ink limit (300%).' },
  { id: 'gracol2013_unc_crpc3', short: 'GRACoL 2013 uncoated', region: 'na', ase: 'Print uncoated CMYK',
    where: 'The GRACoL condition for offset on uncoated paper, with the lowest ink limit of the US set (280%).' },
  { id: 'pso_coated_v3', short: 'PSO Coated v3 (FOGRA51)', region: 'eu', ase: null,
    where: 'The current European condition for sheetfed and heat-set web offset on premium coated paper, under ISO 12647-2:2013. From the European Color Initiative (ECI).' },
  { id: 'pso_uncoated_v3', short: 'PSO Uncoated v3 (FOGRA52)', region: 'eu', ase: null,
    where: 'The current European condition for wood-free uncoated paper (printing condition 5 of ISO 12647-2:2013). From the European Color Initiative (ECI).' },
  { id: 'fogra39_vigc260', short: 'FOGRA39 (VIGC 260)', region: 'eu', ase: null,
    where: 'Built on the older FOGRA39 data (coated paper, ISO 12647-2:2004). FOGRA says FOGRA51 and FOGRA52 can replace it, but a printer may still ask for FOGRA39 by name. This file (named VIGC 260, copyright X-Rite) is not the ECI profile. Its ICC registry page lists a total ink limit of 260%; a few very dark blues come out of the profile slightly above that.' },
];
export const TIERS = ['speculative', 'low confidence', 'supported but contested', 'well-established'];
export const STEP_IDS = ['seed', 'analyze', 'support', 'palette', 'checks', 'export'];
export const FILTER_KEYS = ['textOnWhite', 'textOnBlack', 'uiOnWhite', 'noCvd'];
export const STATE_VERSION = 2;
/** Versions this tool can open. Version 1 held one secondary and one tertiary; it is migrated on load (D44). */
export const READABLE_VERSIONS = [1, 2];
export const SUPPORT_TIERS = ['secondary', 'tertiary'];
export const PATHS = ['known', 'words', 'palette'];
export const PROJECT_FORMAT = 'palette-engine-project';
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export function defaultState() {
  return {
    v: STATE_VERSION, step: 'seed', name: '', path: 'known', input: '', words: '', searched: false, seed: null,
    profile: PRINT_PROFILES[0].id, lens: 'complementary', offsets: {}, filters: {}, supporting: { secondary: [], tertiary: [] },
    paletteInput: { primary: '', secondary: [''], tertiary: [''] }, focus: 'primary', target: 'secondary',
    overrides: { light: {}, dark: {} }, accepted: {}, scheme: 'light', spot: { text: '', illum: 'D50' }, seedError: '',
  };
}

/** Role id of the n-th color (0-based) of a tier: secondary, secondary2, secondary3. */
export const slotId = (tier, i) => (i === 0 ? tier : `${tier}${i + 1}`);
/** Every filled supporting slot in display order: [{ id, tier, index, label, rec }]. */
export function supportSlots(state) {
  const out = [];
  for (const tier of SUPPORT_TIERS) (state.supporting[tier] || []).forEach((rec, i) => { if (rec) out.push({ id: slotId(tier, i), tier, index: i, label: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${i + 1}`, rec }); });
  return out;
}
/** What buildPalette needs from the state's supporting colors. Harmonize is never applied to Secondary 1 / Tertiary 1. */
export const supportingForPalette = (state) => supportSlots(state).map((s) => ({ role: s.id, hex: s.rec.hex, ...(s.index > 0 && s.rec.harmonize ? { harmonize: true } : {}) }));
/** Any supporting color at all. */
export const hasSupporting = (state) => SUPPORT_TIERS.some((t) => (state.supporting[t] || []).some(Boolean));

/** Key of an accepted-failure note: mode|foreground role|background role|kind. */
export const acceptKey = (mode, fg, bg, kind) => `${mode}|${fg}|${bg}|${kind}`;
const ACCEPT_KEY = /^(light|dark)\|[A-Za-z0-9]+\|[A-Za-z0-9]+\|(text|non-text)$/;
const HEX = /^#[0-9a-f]{6}$/i;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate and rebuild a state object from untrusted data.
 * Returns { ok, state, errors, warnings }. errors non-empty => ok false and nothing should be loaded.
 */
export function validateState(raw) {
  const errors = [], warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!isObj(raw)) return { ok: false, state: null, errors: ['The project is not an object.'], warnings };
  if (!READABLE_VERSIONS.includes(raw.v)) return { ok: false, state: null, errors: [`Unsupported project version ${JSON.stringify(raw.v)} (this tool reads versions ${READABLE_VERSIONS.join(' and ')}).`], warnings };
  const fromV1 = raw.v === 1;
  const d = defaultState();
  const known = new Set(Object.keys(d));
  for (const k of Object.keys(raw)) if (!known.has(k)) warnings.push(`Unknown field "${k}" was ignored.`);

  const str = (path, v, max, dflt = '') => {
    if (v === undefined) return dflt;
    if (typeof v !== 'string') { err(path, 'must be text'); return dflt; }
    if (v.length > max) { err(path, `is longer than ${max} characters`); return dflt; }
    return v;
  };
  const bool = (path, v, dflt = false) => { if (v === undefined) return dflt; if (typeof v !== 'boolean') { err(path, 'must be true or false'); return dflt; } return v; };
  const oneOf = (path, v, list, dflt) => { if (v === undefined) return dflt; if (!list.includes(v)) { err(path, `must be one of ${list.join(', ')}`); return dflt; } return v; };
  const hex = (path, v) => { if (typeof v !== 'string' || !HEX.test(v)) { err(path, 'must be a six-digit hex color like #1f5fa8'); return null; } return v.toLowerCase(); };
  const num = (path, v, lim) => { if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > lim) { err(path, `must be a number within ±${lim}`); return 0; } return v; };
  const oklchObj = (path, v) => (v == null ? null : isObj(v) ? { l: num(`${path}.l`, v.l, 2), c: num(`${path}.c`, v.c, 2), h: num(`${path}.h`, v.h, 720) } : (err(path, 'must be an object with l, c, h'), null));

  const s = { ...d };
  s.step = oneOf('step', raw.step, STEP_IDS, d.step);
  s.name = str('name', raw.name, 120);
  s.path = oneOf('path', raw.path, PATHS, d.path);
  s.input = str('input', raw.input, 500);
  s.words = str('words', raw.words, 500);
  s.searched = bool('searched', raw.searched);
  s.profile = oneOf('profile', raw.profile, PRINT_PROFILES.map((p) => p.id), d.profile);
  s.lens = oneOf('lens', raw.lens, Object.keys(LENSES), d.lens);
  s.scheme = oneOf('scheme', raw.scheme, ['light', 'dark'], d.scheme);

  const color = (path, r, slot) => {
    if (r == null) return null;
    if (!isObj(r)) { err(path, 'must be a color record or null'); return null; }
    const originOk = (o) => o === 'manual' || o === 'descriptor' || (typeof o === 'string' && o.startsWith('harmony:') && LENSES[o.slice(8)]);
    if (!originOk(r.origin)) err(`${path}.origin`, 'must be manual, descriptor or harmony:<lens>');
    if (slot === 'seed' && r.origin && r.origin !== 'manual' && r.origin !== 'descriptor') err(`${path}.origin`, 'a seed is manual or descriptor');
    if (slot !== 'seed' && r.origin === 'descriptor') err(`${path}.origin`, 'a supporting color is manual or harmony:<lens>');
    const out = { hex: hex(`${path}.hex`, r.hex), origin: r.origin, tier: null, rationale: str(`${path}.rationale`, r.rationale, 5000), locked: bool(`${path}.locked`, r.locked) };
    if (r.tier != null) out.tier = oneOf(`${path}.tier`, r.tier, TIERS, null);
    if (r.name !== undefined) out.name = str(`${path}.name`, r.name, 80);
    if (r.mappedFrom !== undefined) out.mappedFrom = oklchObj(`${path}.mappedFrom`, r.mappedFrom);
    if (slot === 'seed') {
      if (r.words !== undefined) out.words = str(`${path}.words`, r.words, 500);
    } else {
      out.lens = r.lens == null ? null : oneOf(`${path}.lens`, r.lens, Object.keys(LENSES), null);
      out.offset = r.offset == null ? null : num(`${path}.offset`, r.offset, 360);
      if (r.harmonize !== undefined) out.harmonize = bool(`${path}.harmonize`, r.harmonize);
    }
    return out;
  };
  s.seed = color('seed', raw.seed, 'seed');
  const sup = raw.supporting === undefined ? {} : raw.supporting;
  s.supporting = { secondary: [], tertiary: [] };
  if (!isObj(sup)) err('supporting', 'must be an object'); else {
    for (const tier of SUPPORT_TIERS) {
      const v = sup[tier];
      if (v === undefined || v === null) continue;
      if (fromV1) { // version 1: one record (or null) per tier
        if (Array.isArray(v)) { err(`supporting.${tier}`, 'must be a color record or null in a version 1 project'); continue; }
        const c = color(`supporting.${tier}`, v, tier); if (c) s.supporting[tier] = [c];
        continue;
      }
      if (!Array.isArray(v)) { err(`supporting.${tier}`, `must be a list of up to ${MAX_PER_TIER} colors`); continue; }
      if (v.length > MAX_PER_TIER) { err(`supporting.${tier}`, `holds ${v.length} colors; the most is ${MAX_PER_TIER}`); continue; }
      s.supporting[tier] = v.map((x, i) => (x == null ? (err(`supporting.${tier}[${i}]`, 'must be a color record (lists have no gaps)'), null) : color(`supporting.${tier}[${i}]`, x, tier))).filter(Boolean);
    }
    for (const k of Object.keys(sup)) if (!SUPPORT_TIERS.includes(k)) warnings.push(`Unknown supporting slot "${k}" was ignored.`);
  }
  s.paletteInput = d.paletteInput;
  if (raw.paletteInput !== undefined) {
    const pi = raw.paletteInput;
    if (!isObj(pi)) err('paletteInput', 'must be an object'); else {
      // Scratch text from the palette-entry fields: a value that is too long is cut with a warning, never a reason to refuse the project.
      const cut = (path, v) => { if (v === undefined) return ''; if (typeof v !== 'string') { err(path, 'must be text'); return ''; } if (v.length > 120) { warnings.push(`${path} was longer than 120 characters and was cut.`); return v.slice(0, 120); } return v; };
      const list = (path, v) => { if (v === undefined) return ['']; if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PER_TIER) { err(path, `must be a list of one to ${MAX_PER_TIER} entries`); return ['']; } return v.map((x, i) => cut(`${path}[${i}]`, x)); };
      s.paletteInput = { primary: cut('paletteInput.primary', pi.primary), secondary: list('paletteInput.secondary', pi.secondary), tertiary: list('paletteInput.tertiary', pi.tertiary) };
    }
  }
  const slotIds = ['primary', ...supportSlots(s).map((x) => x.id)];
  s.focus = slotIds.includes(raw.focus) ? raw.focus : 'primary';
  s.target = typeof raw.target === 'string' && /^(secondary|tertiary)[23]?$/.test(raw.target) ? raw.target : d.target;

  s.offsets = {};
  if (raw.offsets !== undefined) {
    if (!isObj(raw.offsets)) err('offsets', 'must be an object'); else for (const [k, v] of Object.entries(raw.offsets)) {
      if (!LENSES[k]) { warnings.push(`Offsets for unknown lens "${k}" were ignored.`); continue; }
      if (!Array.isArray(v) || v.length === 0 || v.length > 8) { err(`offsets.${k}`, 'must be a list of one to eight numbers'); continue; }
      s.offsets[k] = v.map((x, i) => num(`offsets.${k}[${i}]`, x, 360));
    }
  }
  s.filters = {};
  if (raw.filters !== undefined) {
    if (!isObj(raw.filters)) err('filters', 'must be an object'); else for (const [k, v] of Object.entries(raw.filters)) {
      if (!FILTER_KEYS.includes(k)) { warnings.push(`Unknown filter "${k}" was ignored.`); continue; }
      s.filters[k] = bool(`filters.${k}`, v);
    }
  }
  s.overrides = { light: {}, dark: {} };
  if (raw.overrides !== undefined) {
    if (!isObj(raw.overrides)) err('overrides', 'must be an object'); else for (const mode of ['light', 'dark']) {
      const o = raw.overrides[mode]; if (o === undefined) continue;
      if (!isObj(o)) { err(`overrides.${mode}`, 'must be an object'); continue; }
      for (const [role, v] of Object.entries(o)) {
        if (!ALL_ROLES.includes(role)) { err(`overrides.${mode}.${role}`, 'is not a known role'); continue; }
        const h = hex(`overrides.${mode}.${role}`, v); if (h) s.overrides[mode][role] = h;
      }
    }
  }
  s.accepted = {};
  if (raw.accepted !== undefined) {
    if (!isObj(raw.accepted)) err('accepted', 'must be an object'); else for (const [k, v] of Object.entries(raw.accepted)) {
      if (!ACCEPT_KEY.test(k)) { err(`accepted.${k}`, 'is not a valid accepted-failure key'); continue; }
      if (typeof v !== 'string' || v.length > 2000) { err(`accepted.${k}`, 'must be a note of up to 2000 characters'); continue; }
      if (v.trim()) s.accepted[k] = v;
    }
  }
  if (raw.spot !== undefined) {
    if (!isObj(raw.spot)) err('spot', 'must be an object'); else s.spot = { text: str('spot.text', raw.spot.text, 50000), illum: oneOf('spot.illum', raw.spot.illum, ['D50', 'D65'], 'D50') };
  }
  if (!s.seed && hasSupporting(s)) err('seed', 'supporting colors need a seed');
  if (fromV1) warnings.push('This project was saved by an earlier version (one secondary and one tertiary). It opens unchanged and is saved in the new format from now on.');
  s.v = STATE_VERSION;
  if (!s.seed && s.step !== 'seed') s.step = 'seed';
  s.seedError = '';
  return { ok: errors.length === 0, state: errors.length ? null : s, errors, warnings };
}

/** Project file text. `now` is an ISO timestamp (injected so output is reproducible in tests). */
export function serializeProject(state, { now = new Date().toISOString() } = {}) {
  const { seedError, ...rest } = state; // transient
  return JSON.stringify({ format: PROJECT_FORMAT, version: STATE_VERSION, app: 'Palette Engine', savedAt: now, state: rest }, null, 2) + '\n';
}

/** Parse a project file's text. Returns { ok, state, errors, warnings, savedAt }. */
export function parseProject(text) {
  const fail = (msg) => ({ ok: false, state: null, errors: [msg], warnings: [], savedAt: null });
  if (typeof text !== 'string') return fail('The file could not be read as text.');
  if (text.length > MAX_PROJECT_BYTES) return fail('The file is too large to be a Palette Engine project.');
  let obj;
  try { obj = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return fail('The file is not valid JSON.'); }
  if (!isObj(obj)) return fail('The file is not a Palette Engine project.');
  let stateRaw = obj, savedAt = null;
  if (obj.format !== undefined || obj.state !== undefined) {
    if (obj.format !== PROJECT_FORMAT) return fail(`The file is not a Palette Engine project (format ${JSON.stringify(obj.format)}).`);
    if (!READABLE_VERSIONS.includes(obj.version)) return fail(`Unsupported project file version ${JSON.stringify(obj.version)}.`);
    stateRaw = obj.state; savedAt = typeof obj.savedAt === 'string' ? obj.savedAt.slice(0, 40) : null;
  } else if (obj.v === undefined) return fail('The file is not a Palette Engine project.');
  const r = validateState(stateRaw);
  return { ...r, savedAt };
}
