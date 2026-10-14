/* Palette Engine — web tool. Uses the bundled engine (window.PE) and the approved lexicon.
   Everything a designer types is placed with textContent, never as HTML. */
(function () {
'use strict';
const PE = window.PE;
const LEX = JSON.parse(document.getElementById('lexicon-data').textContent);
const IX = PE.indexLexicon(LEX);
const PROFILES = PE.PRINT_PROFILES;
const REGIONS = PE.PRINT_REGIONS;
const regionName = (id) => (REGIONS.find((r) => r.id === id) || {}).name || '';
const TIERS = PE.TIERS;
// Set to true only after the .ase file has been opened in Illustrator or InDesign and checked. It has not been.
const ASE_TESTED_IN_ADOBE = false;
const STEPS = [
  { id: 'seed', label: 'Seed' }, { id: 'analyze', label: 'Analyze' }, { id: 'support', label: 'Supporting colors' },
  { id: 'palette', label: 'Palette and roles' }, { id: 'checks', label: 'Checks' }, { id: 'export', label: 'Export' },
];
const STORE_KEY = 'pe.state.v1';

// --- tiny DOM helper --------------------------------------------------------------------------------------------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const ratioText = (r) => `${r.toFixed(2)}:1`;
const inkOn = (hex) => (PE.contrastRatio('#000000', hex) >= PE.contrastRatio('#ffffff', hex) ? '#000000' : '#ffffff');
const okText = (o) => `L ${o.l.toFixed(2)}  C ${o.c.toFixed(3)}  h ${Math.round(o.h)}°`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const srcLabel = (id) => {
  const s = LEX.sources[id]; if (!s) return id;
  const m = s.cite.match(/^(.*?)\s*\((\d{4})\)/);
  if (!m) return s.cite.split(/[,.]/)[0];
  const lead = m[1].includes(',') ? `${m[1].split(',')[0]} et al.` : m[1];
  return `${lead} (${m[2]})`;
};

// --- state ------------------------------------------------------------------------------------------------------
const defaults = () => PE.defaultState();
let S = defaults();
let saveNote = 'Not saved yet';
function loadState() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const r = PE.validateState(JSON.parse(raw)); if (r.ok) { S = r.state; saveNote = 'Restored from this browser'; } else saveNote = 'Saved work in this browser could not be read and was ignored'; } }
  catch (e) { saveNote = 'Browser storage unavailable: work is not saved'; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); saveNote = 'Saved in this browser'; }
    catch (e) { saveNote = 'Browser storage unavailable: work is not saved'; }
    const el = $('#savestate'); if (el) el.textContent = saveNote;
  }, 400);
}
// Write right away when the page is being closed or hidden, so a change made in the last 400 ms is not lost.
function flushSave() { if (!saveTimer) return; clearTimeout(saveTimer); saveTimer = null; try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: nothing to flush */ } }
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function commit(opts) { save(); if (!opts || !opts.quiet) render(); }
function say(msg) { const l = $('#live'); if (l) l.textContent = msg; }

// --- print data (fetched next to the page) --------------------------------------------------------------------------
const luts = {}; let lutStatus = 'loading';
async function loadLuts() {
  try {
    await Promise.all(PROFILES.map(async (p) => {
      const r = await fetch(`data/lut_${p.id}.json`); if (!r.ok) throw new Error(p.id);
      luts[p.id] = PE.decodeLut(await r.json());
    }));
    lutStatus = 'ready';
  } catch (e) { lutStatus = 'failed'; }
  render();
}

// --- shared building blocks ---------------------------------------------------------------------------------------
function tierPill(tier) {
  const r = TIERS.indexOf(tier);
  return h('span', { class: 'pill tier', title: 'Evidence tier' }, h('span', { class: 'bars', 'aria-hidden': 'true' }, [0, 1, 2, 3].map((i) => h('i', { class: i <= r ? 'on' : '' }))), cap(tier));
}
const pill = (text, kind) => h('span', { class: `pill ${kind || ''}` }, text);
function contrastPill(r) {
  if (r >= 7) return pill('✓ AAA', 'pass');
  if (r >= 4.5) return pill('✓ AA text', 'pass');
  if (r >= 3) return pill('! Large text and UI only', 'warn');
  return pill('✕ Below 3:1', 'fail');
}
function contrastRow(label, r) { return h('div', { class: 'row' }, h('span', { class: 'small muted' }, label), h('span', { class: 'mono' }, ratioText(r)), contrastPill(r)); }
function swatchBand(hex, sub, extra) {
  const ink = inkOn(hex);
  return h('div', { class: 'sw', style: `background:${hex};color:${ink}` }, h('span', { class: 'hex' }, hex.toUpperCase()), sub && h('span', { class: 'ok' }, sub), extra);
}
function sourceLinks(ids) {
  const out = [];
  (ids || []).forEach((id, i) => { const s = LEX.sources[id]; if (!s) return; if (i) out.push(', '); out.push(h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, srcLabel(id))); });
  return out;
}
function a11yColumn(acc, extra) {
  const nodes = [
    h('h4', null, 'Accessibility (WCAG 2.2)'),
    contrastRow('On white', acc.vsWhite), contrastRow('On black', acc.vsBlack),
    h('div', { class: 'small muted' }, `Roles: text on white ${acc.textOnWhite ? '✓' : '✕'} · text on black ${acc.textOnBlack ? '✓' : '✕'} · UI on white ${acc.uiOnWhite ? '✓' : '✕'} · UI on black ${acc.uiOnBlack ? '✓' : '✕'}`),
    h('div', { class: 'small muted' }, `APCA Lc ${acc.apca.onWhite} on white, ${acc.apca.onBlack} on black (advisory, web only)`),
  ];
  return h('div', null, nodes, extra);
}
function fixLine(acc) {
  if (acc.textOnWhite || !acc.textFix) return null;
  return h('div', { class: 'row small' }, h('span', { class: 'swatch', style: `width:20px;height:20px;border-radius:4px;border:1px solid var(--line);background:${acc.textFix.hex};display:inline-block` }),
    h('span', null, `Nearest text-safe lightness: `), h('span', { class: 'mono' }, acc.textFix.hex.toUpperCase()), h('span', { class: 'muted' }, `(${ratioText(PE.contrastRatio(acc.textFix.hex, '#ffffff'))} on white)`));
}
function segmented(options, current, onPick, label, cls) {
  return h('div', { class: cls ? `seg ${cls}` : 'seg', role: 'group', 'aria-label': label }, options.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.id === current), onclick: () => onPick(o.id) }, o.label)));
}
function chip(label, pressed, onclick, extra) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), onclick }, h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'), label, extra);
}
function toggleSwitch(label, on, onchange) {
  return h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!on), onclick: () => onchange(!on) }, h('span', { class: 'track' }, h('span', { class: 'handle' })), label);
}
function field(id, label, value, opts) {
  opts = opts || {};
  const input = h(opts.textarea ? 'textarea' : 'input', { id, value: opts.textarea ? null : value, type: opts.textarea ? null : 'text', class: opts.mono ? 'mono' : '', spellcheck: opts.mono ? 'false' : null, autocomplete: 'off', placeholder: opts.placeholder, rows: opts.rows });
  if (opts.textarea) input.textContent = value || '';
  if (opts.oninput) input.addEventListener('input', () => opts.oninput(input.value));
  if (opts.onchange) input.addEventListener('change', () => opts.onchange(input.value));
  if (opts.onenter) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !opts.textarea) { e.preventDefault(); opts.onenter(input.value); } });
  return h('div', { class: `field ${opts.error ? 'err' : ''} ${opts.compact ? 'compact' : ''}` }, h('label', { for: id }, label), input, opts.error ? h('div', { class: 'errtext', role: 'alert' }, opts.error) : opts.support && h('div', { class: 'support' }, opts.support));
}
function notice(kind, ...kids) { return h('div', { class: `notice ${kind || ''}`, role: kind === 'fail' ? 'alert' : null }, h('div', null, kids)); }

// --- filters (accessibility never hides a candidate silently) ---------------------------------------------------------
const FILTERS = [
  { k: 'textOnWhite', label: 'Text on white (4.5:1)', test: (c) => c.acc.textOnWhite },
  { k: 'textOnBlack', label: 'Text on black (4.5:1)', test: (c) => c.acc.textOnBlack },
  { k: 'uiOnWhite', label: 'UI on white (3:1)', test: (c) => c.acc.uiOnWhite },
  { k: 'noCvd', label: 'Distinct for color-blind viewers', harmonyOnly: true, test: (c) => !c.cvd || c.cvd.length === 0 },
];
function filterBar(isHarmony) {
  return h('div', { class: 'stack-s' }, h('h4', null, 'Show only'),
    h('div', { class: 'chips' }, FILTERS.filter((f) => isHarmony || !f.harmonyOnly).map((f) => chip(f.label, S.filters[f.k], () => { S.filters[f.k] = !S.filters[f.k]; commit(); }))));
}
function applyFilters(items, isHarmony) {
  const active = FILTERS.filter((f) => S.filters[f.k] && (isHarmony || !f.harmonyOnly));
  const shown = [], hidden = [];
  for (const it of items) { const failed = active.filter((f) => !f.test(it)); (failed.length ? hidden : shown).push({ it, failed }); }
  return { shown, hidden };
}
function filteredGrid(items, isHarmony, renderCard) {
  const { shown, hidden } = applyFilters(items, isHarmony);
  return h('div', { class: 'stack' },
    h('div', { class: 'grid cards' }, shown.map((s) => renderCard(s.it))),
    !shown.length && notice('warn', 'Your filters hide every candidate. Nothing has been removed: open the list below or switch a filter off.'),
    hidden.length > 0 && h('details', null, h('summary', null, `${hidden.length} hidden by your filters (${hidden.map((x) => x.failed.map((f) => f.label)).flat().filter((v, i, a) => a.indexOf(v) === i).join('; ')})`),
      h('div', { class: 'grid cards', style: 'margin-top:8px' }, hidden.map((s) => renderCard(s.it)))));
}

// --- record helpers -----------------------------------------------------------------------------------------------
function lockAndNote(rec, idPrefix, onchange) {
  return h('div', { class: 'stack-s' },
    field(`${idPrefix}-name`, 'Color name (optional, used in the exports)', rec.name || '', { compact: true, oninput: (v) => { if (v.trim()) rec.name = v.slice(0, 80); else delete rec.name; save(); } }),
    toggleSwitch(rec.locked ? 'Locked (kept when you change other choices)' : 'Lock this color', rec.locked, (v) => { rec.locked = v; onchange(); }),
    field(`${idPrefix}-note`, 'Rationale (travels into the exports)', rec.rationale || '', { textarea: true, rows: 3, oninput: (v) => { rec.rationale = v; save(); } }));
}
function hexOf(str) { const a = PE.analyze(str, {}); return a ? a : null; }

// --- Step 1: seed ---------------------------------------------------------------------------------------------------
function chooseSeed(hex, origin, tier, extra) {
  if (S.seed && S.seed.locked) return;
  const keep = S.seed || {};
  S.seed = { hex, origin, tier: tier || null, rationale: keep.rationale || '', locked: false, ...(extra || {}) };
  S.seedError = ''; commit();
  say(`Seed set to ${hex}`);
}
function renderSeed() {
  const known = S.path === 'known';
  const opener = projectOpener('seed', 'outlined');
  const seedMsg = exportUi.projectMsg && exportUi.projectMsg.where === 'seed' ? exportUi.projectMsg : null;
  const box = h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Choose a seed color'),
      h('p', { class: 'lead' }, 'The seed is the brand primary. Start with a color you have, or with words that describe the brand.'),
      h('div', { class: 'row' }, opener.button, opener.input, h('span', { class: 'small muted' }, 'Have a project file from an earlier session? Open it to carry on.')),
      opener.confirm, seedMsg && projectResult(seedMsg)),
    segmented([{ id: 'known', label: 'I have a color' }, { id: 'words', label: 'I have words' }], S.path, (id) => { S.path = id; commit(); }, 'How to start'),
    S.seed && seedCard(),
    known ? renderKnown() : renderWords());
  return box;
}
function seedCard() {
  const s = S.seed; const a = PE.analyze(s.hex, {});
  return h('div', { class: 'slot filled' },
    h('div', { class: 'top' }, h('div', { class: 'dot', style: `background:${s.hex}` }),
      h('div', { class: 'stack-s', style: 'flex:1;min-width:0' }, h('div', { class: 'row' }, h('h3', null, 'Your seed'), h('span', { class: 'mono' }, s.hex.toUpperCase()),
        s.origin === 'descriptor' ? [pill('From descriptor words'), s.tier && tierPill(s.tier)] : pill('Your own color')),
        h('div', { class: 'small muted mono' }, okText(a.screen.oklch)))),
    s.mappedFrom && notice('warn', h('b', null, 'Beyond sRGB. '), `You entered a color outside sRGB (the range of ordinary screens). It is flagged "P3 only" and shown here mapped into sRGB by reducing chroma; the original is kept: ${okText(s.mappedFrom)}.`),
    lockAndNote(s, 'seed', () => commit()),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled', onclick: () => setStep('analyze') }, 'Continue to analysis')));
}
function renderKnown() {
  const input = field('seed-input', 'Color', S.input, { mono: true, error: S.seedError, placeholder: '#1F5FA8', support: 'Hex, rgb() or oklch(). Colors outside sRGB are flagged "P3 only" and mapped in.',
    oninput: (v) => { S.input = v; save(); }, onenter: (v) => useInput(v) });
  const picker = h('input', { type: 'color', id: 'seed-picker', value: /^#[0-9a-f]{6}$/i.test(S.input) ? S.input : (S.seed ? S.seed.hex : '#1f5fa8'), 'aria-label': 'Pick a color', style: 'width:56px;height:56px;padding:0;border:1px solid var(--line-strong);border-radius:4px;background:none;cursor:pointer;flex:none' });
  picker.addEventListener('input', () => { S.input = picker.value; const t = $('#seed-input'); if (t) t.value = picker.value; save(); });
  return h('div', { class: 'stack-s' }, h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap' }, h('div', { style: 'flex:1;min-width:0' }, input), h('div', { style: 'padding-top:20px' }, picker)),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled', disabled: S.seed && S.seed.locked, onclick: () => useInput($('#seed-input').value) }, 'Use this color'),
      S.seed && S.seed.locked && h('span', { class: 'small muted' }, 'The seed is locked. Unlock it to replace it.')));
}
function useInput(v) {
  S.input = v; const a = PE.analyze(v, {});
  if (!a) { S.seedError = 'That is not a color this tool can read. Try #1F5FA8, rgb(31 95 168) or oklch(0.49 0.13 255).'; commit(); return; }
  chooseSeed(a.screen.hex, 'manual', null, { mappedFrom: a.screen.mappedFrom });
}
// words path
function toggleTerm(row) {
  const on = PE.matchTerms(S.words, IX).matched.some((m) => m.id === row.id);
  if (on) {
    let w = S.words;
    const said = PE.matchTerms(S.words, IX).matched.filter((m) => m.id === row.id).map((m) => m.input);
    for (const p of [row.term, ...row.synonyms, ...(row.studyWords || []), ...(row.strongSynonyms || []), ...said]) w = w.replace(new RegExp(`(^|[\\s,;])${p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/[- ]/g, '[- ]')}(?=$|[\\s,;])`, 'ig'), '$1');
    S.words = w.replace(/\s*,\s*(,\s*)+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ');
  } else S.words = (S.words.trim() ? S.words.trim().replace(/,$/, '') + ', ' : '') + row.term;
  S.searched = false; commit();
}
function renderWords() {
  const res = S.searched ? PE.matchDescriptors(S.words, IX) : null;
  const matchedIds = new Set(PE.matchTerms(S.words, IX).matched.map((m) => m.id));
  const groups = [['perceptual', 'How it feels'], ['personality', 'Brand personality'], ['emotion', 'Emotions']];
  const node = h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, field('words-input', 'Descriptor words', S.words, { placeholder: 'calm, trustworthy, modern',
      support: 'Words match the lexicon, its synonyms, the studies\' own words and their forms (calming, calm). A near-synonym lowers the evidence tier one step; any other word is flagged, never guessed.', oninput: (v) => { S.words = v; S.searched = false; save(); }, onenter: () => findSeeds() }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled', onclick: () => findSeeds() }, 'Find seed candidates'))),
    h('details', { open: !S.searched }, h('summary', null, `Vocabulary (${LEX.rows.length} approved terms)`),
      h('div', { class: 'stack', style: 'margin-top:8px' }, groups.map(([cls, title]) => h('div', { class: 'stack-s' }, h('h4', null, title),
        h('div', { class: 'chips' }, LEX.rows.filter((r) => r.class === cls).map((r) => chip(r.term, matchedIds.has(r.id), () => toggleTerm(r)))))))),
    res && renderMatch(res));
  return node;
}
function findSeeds() { S.searched = true; commit(); const m = PE.matchDescriptors(S.words, IX); say(`${m.seeds.length} seed candidates`); }
function renderMatch(res) {
  return h('div', { class: 'stack', 'aria-live': 'polite' },
    h('h3', null, 'Seed candidates'),
    res.matched.length > 0 && h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Matched:'), res.matched.map((m) => pill(m.via === 'term' ? m.term : `${m.input} → ${m.term}${m.strong ? ' (near-synonym, tier lowered)' : ''}`, m.strong ? 'warn' : 'neutral'))),
    res.unknown.length > 0 && notice('warn', h('b', null, 'Not in the lexicon: '), res.unknown.join(', '), '. These words were left out rather than guessed.'),
    res.conflicts.map((c) => notice('warn', h('b', null, c.type === 'hue' ? 'Words pull against each other. ' : 'Words cannot be combined. '), c.detail)),
    res.note && notice('', res.note),
    res.seeds.length > 0 && [filterBar(false), filteredGrid(res.seeds.map((s) => ({ ...s, acc: s.accessibility })), false, seedCandidateCard)],
    h('p', { class: 'small muted' }, 'Ranked by how well the evidence supports each one. Accessibility is shown beside it and changes nothing unless you turn a filter on.'),
    res.seeds.length > 0 && h('p', { class: 'small muted', 'data-band-note': '' }, 'Color-word bands (blue, green and so on) are design choices, centered on colors the studies measured; their edges are low confidence.'));
}
function seedCandidateCard(s) {
  const acc = { ...s.accessibility, textFix: s.accessibility.textOnWhite ? null : PE.nearestPassingLightness({ l: s.oklch.l, c: s.oklch.c, h: s.oklch.h }, '#ffffff', 4.5) };
  const locked = S.seed && S.seed.locked;
  return h('article', { class: 'card', 'aria-label': `Seed candidate ${s.hex}` },
    swatchBand(s.hex, okText(s.oklch), h('span', { class: 'ok' }, `${cap(s.family)} family · score ${s.score.toFixed(2)}`)),
    h('div', { class: 'cols' },
      h('div', null, h('h4', null, 'Evidence'), h('div', null, tierPill(s.lowestTier)), h('div', { class: 'small muted' }, 'Weakest tier among the terms that support it.'),
        s.beyondTested && h('div', { class: 'small', 'data-beyond-tested': s.beyondTested.side }, h('b', null, `${cap(s.beyondTested.side)} than the study tested. `), `The lightness lean from ${s.beyondTested.terms.join(', ')} was measured on colors between L ${s.beyondTested.range[0].toFixed(2)} and ${s.beyondTested.range[1].toFixed(2)}; this one is at L ${s.oklch.l.toFixed(2)}, so the lean is extended here. Low confidence.`),
        s.supporting.length > 0 && h('ul', null, s.supporting.map((t) => h('li', null, h('b', null, t.term), t.contribution ? ` ${t.contribution > 0 ? '+' : ''}${t.contribution.toFixed(2)}` : ' (range met)', ' ', h('span', { class: 'muted small' }, `· ${t.tier}`)))),
        s.conflicting.length > 0 && [h('div', { class: 'small' }, h('b', null, 'Works against:')), h('ul', null, s.conflicting.map((t) => h('li', null, `${t.term} ${t.contribution.toFixed(2)}`)))],
        s.unaddressed.length > 0 && h('div', { class: 'small muted' }, `Not addressed: ${s.unaddressed.map((t) => t.term).join(', ')}`),
        s.sources.length > 0 && h('div', { class: 'small muted' }, 'Sources: ', sourceLinks(s.sources))),
      a11yColumn(acc, fixLine(acc))),
    h('div', { class: 'foot' }, h('button', { type: 'button', class: 'btn filled small', disabled: locked, title: locked ? 'The seed is locked' : null,
      onclick: () => chooseSeed(s.hex, 'descriptor', s.lowestTier, { words: S.words }) }, 'Use as seed')));
}

// --- Step 2: analyze -----------------------------------------------------------------------------------------------
function renderAnalyze() {
  const a = PE.analyze(S.seed.hex, luts);
  const p = a.print[S.profile];
  const prof = PROFILES.find((x) => x.id === S.profile) || PROFILES[0];
  const spotCard = renderSpot(a);
  return h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Analyze the seed'),
      h('p', { class: 'lead' }, 'Screen values, what a press can print, and a scorer for spot colors you already have values for.')),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'stack' },
        h('div', { class: 'big-sw', style: `background:${a.screen.hex};color:${inkOn(a.screen.hex)}` }, h('span', { class: 'hex' }, a.screen.hex.toUpperCase()), h('span', { class: 'mono small' }, okText(a.screen.oklch))),
        h('h4', null, 'Screen'),
        h('dl', { class: 'kv' }, h('dt', null, 'sRGB'), h('dd', null, a.screen.srgb.join(', ')), h('dt', null, 'OKLCH'), h('dd', null, okText(a.screen.oklch)),
          h('dt', null, 'HCT'), h('dd', null, `hue ${a.screen.hct[0]}  chroma ${a.screen.hct[1]}  tone ${a.screen.hct[2]}`),
          h('dt', null, 'Lab D50'), h('dd', null, `${a.labD50.l.toFixed(1)}, ${a.labD50.a.toFixed(1)}, ${a.labD50.b.toFixed(1)}`),
          h('dt', null, 'Beyond sRGB'), h('dd', null, S.seed.mappedFrom ? 'P3 only, mapped in (see Seed step)' : 'No')),
        h('p', { class: 'small muted' }, 'Lab D50 is the hub for print and spot color: ICC profiles and Pantone reference values use it.')),
      h('div', { class: 'stack' }, h('h4', null, 'Print'),
        h('div', { class: 'stack-s', role: 'group', 'aria-label': 'Print condition' }, REGIONS.map((r) => h('div', { class: 'stack-xs' }, h('span', { class: 'small muted' }, `${r.label}`),
          segmented(PROFILES.filter((x) => x.region === r.id).map((x) => ({ id: x.id, label: x.short })), S.profile, (id) => { S.profile = id; commit(); }, r.label, 'seg-wrap')))),
        h('p', { class: 'small' }, h('b', null, `${regionName(prof.region)}. `), prof.where),
        lutStatus === 'loading' ? h('p', { class: 'muted' }, 'Loading print data…') : lutStatus === 'failed' || !p ? notice('warn', 'The print lookup tables did not load, so print values are unavailable. Screen values above still work.') : printCard(a, p))),
    lutStatus === 'ready' && printTable(a),
    spotCard);
}
function printCard(a, p) {
  const bars = [['C', p.cmyk[0], '#00A0DC'], ['M', p.cmyk[1], '#D6006E'], ['Y', p.cmyk[2], '#F2C600'], ['K', p.cmyk[3], '#222']];
  const noLimit = p.tacLimit == null, over = !noLimit && p.tac > p.tacLimit;
  return h('div', { class: 'stack' },
    h('div', { class: 'cmyk', role: 'group', 'aria-label': 'CMYK values' }, bars.map(([n, v, c]) => h('div', { class: 'bar' }, h('b', null, n), h('div', { class: 't' }, h('i', { style: `width:${v}%;background:${c}` })), h('span', { class: 'mono' }, `${v}%`)))),
    noLimit ? h('div', { class: 'small' }, `Total ink ${p.tac}%. This profile states no ink limit, so there is nothing to check it against.`) : h('div', { class: 'row small' }, h('span', null, `Total ink ${p.tac}% of a ${p.tacLimit}% limit`), pill(over ? '✕ Over limit' : '✓ Within limit', over ? 'fail' : 'pass')),
    h('div', { class: 'small muted' }, `Rendering intent: ${p.intent}. Brand values, not proofs.`),
    h('h4', null, 'Screen color and what the press can hold'),
    h('div', { class: 'pair' }, h('div', { style: `background:${a.screen.hex};color:${inkOn(a.screen.hex)}` }, 'Screen', h('span', null, a.screen.hex.toUpperCase())),
      h('div', { style: `background:${p.printableNeighbor.hex};color:${inkOn(p.printableNeighbor.hex)}` }, 'Press neighbor', h('span', null, p.printableNeighbor.hex.toUpperCase()))),
    h('div', { class: 'row small' }, p.inGamut ? pill(`✓ Printable: ΔE00 ${p.gamutDE00.toFixed(1)}`, 'pass') : pill(`✕ Out of print gamut: ΔE00 ${p.gamutDE00.toFixed(1)} (flag above 2.0)`, 'fail'), tierPill('supported but contested')),
    p.note && notice('', p.note),
    !p.inGamut && !p.note && h('div', { class: 'small muted' }, 'Screen and print differ visibly. The press neighbor is the closest color this profile can print. The 2.0 threshold is a convention.'));
}
function printTable(a) {
  return h('div', { class: 'stack-s' }, h('h4', null, `All ${PROFILES.length} print conditions`), h('div', { class: 'tbl-wrap' }, h('table', null,
    h('thead', null, h('tr', null, ['Profile', 'Region', 'C', 'M', 'Y', 'K', 'Total ink', 'Print gamut'].map((t, i) => h('th', { class: i > 1 && i < 7 ? 'num' : '' }, t)))),
    h('tbody', null, PROFILES.map((x) => { const p = a.print[x.id]; return h('tr', null, h('td', null, x.short), h('td', null, regionName(x.region)), p.cmyk.map((v) => h('td', { class: 'num' }, v)), h('td', { class: 'num' }, p.tacLimit == null ? `${p.tac} / none stated` : `${p.tac} / ${p.tacLimit}%`),
      h('td', null, p.inGamut ? pill(`✓ ΔE00 ${p.gamutDE00.toFixed(1)}`, 'pass') : pill(`✕ ΔE00 ${p.gamutDE00.toFixed(1)}`, 'fail'))); })))),
    h('p', { class: 'small muted' }, 'CMYK is rounded to whole percent. The lookup tables agree with LittleCMS to ΔE00 0.15 (95th percentile) and 0.99 (worst case) on the printed color, across all six.'));
}
function renderSpot(a) {
  const parsed = PE.parseEntries(S.spot.text, { illuminant: S.spot.illum });
  const result = parsed.entries.length ? PE.score(a.labD50, parsed.entries, 3) : null;
  const book = (k, title) => result && h('div', { class: 'stack-s' }, h('h4', null, title), result[k].length === 0 ? h('div', { class: 'small muted' }, 'No entries for this book.') :
    h('div', { class: 'tbl-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Name (approx.)'), h('th', { class: 'num' }, 'ΔE00'), h('th', null, 'Match'), h('th', null, 'Source'))),
      h('tbody', null, result[k].map((r) => h('tr', null, h('td', null, `${r.name} (approx.)`), h('td', { class: 'num' }, r.dE00.toFixed(1)),
        h('td', null, pill(r.band, r.dE00 <= 2 ? 'pass' : r.dE00 <= 3 ? 'warn' : r.dE00 <= 5 ? 'warn' : 'fail')), h('td', { class: 'small' }, r.source === 'hex' ? 'Screen hex: weaker' : 'Lab you entered')))))));
  return h('div', { class: 'sect stack' },
    h('div', { class: 'stack-s' }, h('h3', null, 'Spot color scorer'),
      h('p', { class: 'lead' }, 'No Pantone data is bundled. Paste names and Lab values from a source you are licensed to use; they are scored against the seed by ΔE2000, Coated and Uncoated separately. The result is a shortlist, not a specification.')),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'stack-s' }, field('spot-text', 'Names and Lab values', S.spot.text, { textarea: true, mono: true, rows: 6, placeholder: 'name, L, a, b   (add " C" or " U" to the name)\nExample Blue C, 40.1, 4.2, -45.3', support: 'One per line: name, L, a, b. Comma, tab or semicolon. A hex value in place of Lab is accepted but weaker.',
        oninput: (v) => { S.spot.text = v; save(); } }),
        h('div', { class: 'row' }, segmented([{ id: 'D50', label: 'Lab is D50' }, { id: 'D65', label: 'Lab is D65' }], S.spot.illum, (id) => { S.spot.illum = id; commit(); }, 'Illuminant of the pasted Lab'),
          h('button', { type: 'button', class: 'btn outlined', onclick: () => commit() }, 'Score'))),
      h('div', { class: 'stack' }, parsed.errors.length > 0 && notice('warn', h('b', null, 'Skipped: '), parsed.errors.map((e) => `line ${e.line} (${e.reason})`).join('; ')),
        result ? [book('C', 'Coated'), book('U', 'Uncoated')] : h('p', { class: 'small muted' }, `Target: Lab D50 ${a.labD50.l.toFixed(1)}, ${a.labD50.a.toFixed(1)}, ${a.labD50.b.toFixed(1)}. Matches appear here. Bands: under 1 near-identical, 1–2 close, 2–3 acceptable, 3–5 loose, over 5 no good match (industry practice, not a standard).`),
        result && h('p', { class: 'small muted' }, 'Verify against a current physical guide under D50 light before a client commits. Guides drift; replace them every 12–18 months.'))));
}

// --- Step 3: supporting colors -------------------------------------------------------------------------------------
const SLOTS = [['secondary', 'Secondary'], ['tertiary', 'Tertiary']];
function useSupporting(slot, cand, lens) {
  const cur = S.supporting[slot]; if (cur && cur.locked) return;
  S.supporting[slot] = { hex: cand.hex, origin: `harmony:${lens}`, tier: cand.tier, lens, offset: cand.offset, rationale: cur ? cur.rationale : '', locked: false };
  commit(); say(`${cap(slot)} set to ${cand.hex}`);
}
function renderSupport() {
  const seed = S.seed.hex;
  const lensKeys = Object.keys(PE.LENSES);
  const lens = PE.LENSES[S.lens] || PE.LENSES.complementary;
  const off = S.offsets[S.lens];
  const opts = off ? { offsets: off } : {};
  const cands = PE.harmonyCandidates(seed, S.lens, opts).map((c) => ({ ...c, acc: c.accessibility, cvd: c.accessibility.cvdVsSeed }));
  return h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Choose supporting colors'),
      h('p', { class: 'lead' }, 'Each lens proposes colors from a rule, with its evidence on the card; the evidence is weak for classical wheel geometry. Treat the lenses as a starting vocabulary.')),
    h('div', { class: 'grid cols-2' }, SLOTS.map(([k, label]) => supportSlot(k, label))),
    h('div', { class: 'stack-s' }, h('h4', null, 'Lens'),
      h('div', { class: 'chips' }, lensKeys.map((k) => chip(PE.LENSES[k].name, S.lens === k, () => { S.lens = k; commit(); }, h('span', { class: 'small muted' }, `· ${PE.LENSES[k].tier === 'low confidence' ? 'low confidence' : 'supported but contested'}`)))),
      notice('', h('b', null, `${lens.name}: `), PE.TIER_NOTE[lens.tier], ` Hue offsets are computed on the ${PE.WHEEL}; an artist's RYB wheel or an RGB wheel gives different complements for the same color.`),
      h('div', { class: 'row' }, h('div', { style: 'width:min(100%,320px)' }, field('offsets', 'Hue offsets in degrees (editable)', (off || lens.offsets).join(', '), { compact: true, mono: true,
        onchange: (v) => { const n = v.split(/[\s,;]+/).filter(Boolean).map(Number); if (n.length && n.every((x) => Number.isFinite(x) && Math.abs(x) <= 360)) { S.offsets[S.lens] = n; } commit(); } })),
        off && h('button', { type: 'button', class: 'btn text', onclick: () => { delete S.offsets[S.lens]; commit(); } }, 'Reset offsets'))),
    filterBar(true), filteredGrid(cands, true, (c) => harmonyCard(c)));
}
function harmonyCard(c) {
  const acc = c.accessibility;
  const cvd = c.cvd;
  const cvdNode = cvd.length ? h('div', null, pill(`✕ Collapses against the seed under ${[...new Set(cvd.map((f) => f.type))].join(', ')}`, 'fail'), h('div', { class: 'small muted' }, cvd.map((f) => `${f.type} ΔE00 ${f.dE00.toFixed(1)}`).join(' · ') + ' (flagged under 10)')) : pill('✓ Distinct from the seed under all three color-blind views', 'pass');
  return h('article', { class: 'card', 'aria-label': `${c.lensName} candidate ${c.hex}` },
    swatchBand(c.hex, okText(c.oklch), h('span', { class: 'ok' }, `${c.lensName} ${c.offset > 0 ? '+' : ''}${c.offset}°`)),
    h('div', { class: 'cols' },
      h('div', null, h('h4', null, 'Evidence'), h('div', null, tierPill(c.tier)), h('div', { class: 'small muted' }, c.tierNote),
        c.mappedFrom && h('div', { class: 'small' }, `Beyond sRGB: mapped in from ${okText(c.mappedFrom)}.`),
        h('div', { class: 'small' }, h('b', null, 'Harmony score '), h('span', { class: 'mono' }, c.harmony.score.toFixed(2)), ' ', pill('Advisory · lab-patch model', 'warn')),
        h('div', { class: 'small muted' }, 'Ou & Luo (2006) two-color model against the seed. Fitted on color patches on gray (R² 0.71), not brand contexts, so it is advisory, not a pass or fail.')),
      a11yColumn(acc, h('div', { class: 'stack-s' }, cvdNode, fixLine(acc)))),
    h('div', { class: 'foot' }, SLOTS.map(([k, label]) => { const locked = S.supporting[k] && S.supporting[k].locked;
      return h('button', { type: 'button', class: 'btn outlined small', disabled: locked, title: locked ? `${label} is locked` : null, onclick: () => useSupporting(k, c, c.lens) }, `Use as ${k}`); })));
}
function supportSlot(k, label) {
  const s = S.supporting[k];
  if (!s) return h('div', { class: 'slot' }, h('div', { class: 'top' }, h('div', { class: 'dot', style: 'background:transparent;border-style:dashed' }), h('div', null, h('h3', null, label), h('div', { class: 'small muted' }, 'Empty. Pick a candidate below, or enter your own color.'))),
    manualEntry(k));
  return h('div', { class: 'slot filled' },
    h('div', { class: 'top' }, h('div', { class: 'dot', style: `background:${s.hex}` }), h('div', { class: 'stack-s', style: 'flex:1;min-width:0' }, h('div', { class: 'row' }, h('h3', null, label), h('span', { class: 'mono' }, s.hex.toUpperCase())),
      h('div', { class: 'row' }, s.origin === 'manual' ? pill('Your own color') : [pill(`From ${(PE.LENSES[s.lens] || {}).name || 'lens'}`), s.tier && tierPill(s.tier)]))),
    manualEntry(k, true),
    lockAndNote(s, `sup-${k}`, () => commit()),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn text', disabled: s.locked, onclick: () => { S.supporting[k] = null; commit(); } }, 'Remove')));
}
function manualEntry(k, replace) {
  const id = `manual-${k}`;
  const wrap = h('div', { class: 'stack-s' }, field(id, replace ? 'Replace with your own color' : 'Enter your own color', '', { compact: true, mono: true, placeholder: '#D9822B', onenter: (v) => set(v) }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn outlined small', disabled: S.supporting[k] && S.supporting[k].locked, onclick: () => set($(`#${id}`).value) }, 'Set')));
  function set(v) {
    const a = PE.analyze(v, {}); if (!a) { const f = $(`#${id}`); if (f) { f.setAttribute('aria-invalid', 'true'); f.parentElement.classList.add('err'); } say('Not a color'); return; }
    const cur = S.supporting[k]; if (cur && cur.locked) return;
    S.supporting[k] = { hex: a.screen.hex, origin: 'manual', tier: null, lens: null, offset: null, rationale: cur ? cur.rationale : '', locked: false }; commit();
  }
  return wrap;
}

// --- Step 4: palette and roles ----------------------------------------------------------------------------------------
let palCache = { key: '', value: null };
function palette() {
  const sup = SLOTS.filter(([k]) => S.supporting[k]).map(([k]) => ({ role: k, hex: S.supporting[k].hex }));
  const key = JSON.stringify([S.seed.hex, sup, S.overrides]);
  if (palCache.key !== key) palCache = { key, value: PE.buildPalette(S.seed.hex, sup, { overrides: S.overrides }) };
  return palCache.value;
}
const GROUPS = [['Primary', ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer']], ['Secondary', ['secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer']],
  ['Tertiary', ['tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer']], ['Error', ['error', 'onError', 'errorContainer', 'onErrorContainer']],
  ['Surfaces', ['surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant', 'background', 'onBackground', 'inverseSurface', 'inverseOnSurface']]];
const PAIR_BG = { onPrimary: 'primary', onPrimaryContainer: 'primaryContainer', onSecondary: 'secondary', onSecondaryContainer: 'secondaryContainer', onTertiary: 'tertiary', onTertiaryContainer: 'tertiaryContainer', onError: 'error', onErrorContainer: 'errorContainer', onSurface: 'surface', onSurfaceVariant: 'surfaceVariant', onBackground: 'background', inverseOnSurface: 'inverseSurface' };
function renderPalette() {
  const pal = palette(); const mode = S.scheme; const sc = pal.schemes[mode]; const chk = pal.checks[mode];
  const b = pal.brand;
  const gap = mode === 'light' ? b.lightPrimary : b.darkPrimary;
  return h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Palette and roles'),
      h('p', { class: 'lead' }, 'Tonal palettes use Material 3 color science (HCT). Roles are assigned by tone, then every text and UI pair is checked against WCAG 2.2, with a fix for each failure.')),
    exportBanner(pal),
    h('div', { class: 'row-between' }, segmented([{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }], mode, (id) => { S.scheme = id; commit(); }, 'Scheme'),
      h('span', { class: 'small muted' }, 'Spec: Material 3 (2021 role tones)')),
    notice('', h('b', null, 'Brand token. '), `${b.hex.toUpperCase()} stays its own token (HCT hue ${b.hct.hue}, chroma ${b.hct.chroma}, tone ${b.hct.tone}). ` +
      (Math.abs(gap.toneGap) < 0.6 ? `In ${mode} mode it sits at the primary role's tone, so ${gap.hex.toUpperCase()} is the same color.` : `The ${mode} primary role is ${gap.hex.toUpperCase()}, ${Math.abs(gap.toneGap)} tone steps ${gap.toneGap > 0 ? 'darker' : 'lighter'} than your brand color, to keep text on it readable.`)),
    h('div', { id: 'override-host' }),
    GROUPS.map(([title, roles]) => h('div', { class: 'stack-s' }, h('h4', null, title), h('div', { class: 'role-grid' }, roles.map((r) => roleTile(r, sc, mode, pal))))),
    h('div', { class: 'stack-s' }, h('h4', null, 'Tonal palettes (tones 0–100)'), ['primary', 'secondary', 'tertiary', 'neutral'].map((n) => h('div', { class: 'stack-s' }, h('div', { class: 'small muted' }, cap(n)),
      h('div', { class: 'ramp', role: 'img', 'aria-label': `${n} tonal palette` }, Object.entries(pal.tones[n]).map(([t, hex]) => h('div', { style: `background:${hex};color:${inkOn(hex)}` }, t)))))),
    h('div', { class: 'stack-s' }, h('h4', null, `Role pairs (${mode})`), pairTable(chk, mode, pal)));
}
function roleTile(role, sc, mode, pal) {
  const hex = sc[role]; const bg = PAIR_BG[role] ? sc[PAIR_BG[role]] : null; const overridden = (S.overrides[mode] || {})[role];
  const isOn = !!PAIR_BG[role];
  const style = isOn ? `background:${bg};color:${hex}` : `background:${hex};color:${inkOn(hex)}`;
  return h('div', { class: 'role' }, h('div', { class: 'c', style }, isOn ? 'Aa' : ''),
    h('div', { class: 'm' }, h('span', { class: 'mono' }, role), h('span', { class: 'mono muted' }, hex.toUpperCase() + (overridden ? ' · yours' : '')),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn text small', onclick: () => overrideRole(role, mode) }, 'Override'), overridden && h('button', { type: 'button', class: 'btn text small', onclick: () => { delete S.overrides[mode][role]; commit(); } }, 'Reset'))));
}
function overrideRole(role, mode) {
  const dlg = h('div', { class: 'notice' }, h('div', { class: 'stack-s', style: 'width:100%' }, field('ov-hex', `Override ${role} (${mode}) with your own color`, '', { compact: true, mono: true, placeholder: '#123456' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled small', onclick: () => { const a = PE.analyze($('#ov-hex').value, {}); if (!a) { say('Not a color'); return; } S.overrides[mode][role] = a.screen.hex; commit(); } }, 'Apply'),
      h('button', { type: 'button', class: 'btn text small', onclick: () => commit() }, 'Cancel'))));
  const host = $('#override-host'); host.replaceChildren(dlg); host.scrollIntoView({ block: 'center' }); $('#ov-hex').focus();
}
const acceptKey = PE.acceptKey;
function pairTable(chk, mode, pal) {
  const rows = chk.rows.filter((r, i, a) => a.findIndex((x) => x.fg === r.fg && x.bg === r.bg && x.kind === r.kind) === i);
  return h('div', { class: 'stack-s' }, h('div', { class: 'tbl-wrap' }, h('table', null,
    h('thead', null, h('tr', null, ['Pair', 'Sample', 'Ratio', 'Result', 'Fix or note'].map((t) => h('th', { class: t === 'Ratio' ? 'num' : '' }, t)))),
    h('tbody', null, rows.map((r) => { const sc = pal.schemes[mode]; const pass = r.kind === 'text' ? r.aa : r.pass; const key = acceptKey(mode, r.fg, r.bg, r.kind); const accepted = S.accepted[key];
      return h('tr', null, h('td', { class: 'mono' }, `${r.fg} on ${r.bg}${r.kind === 'non-text' ? ' (UI)' : ''}`),
        h('td', null, r.kind === 'non-text' ? h('span', { 'aria-hidden': 'true', style: `display:inline-block;width:44px;height:28px;border-radius:4px;background:${sc[r.bg]};border:3px solid ${sc[r.fg]}` }) : h('span', { style: `display:inline-flex;align-items:center;justify-content:center;width:44px;height:28px;border-radius:4px;border:1px solid var(--line);background:${sc[r.bg]};color:${sc[r.fg]};font-weight:600` }, 'Aa')),
        h('td', { class: 'num' }, ratioText(r.ratio)),
        h('td', null, pass ? (r.kind === 'text' && r.aaa ? pill('✓ AAA', 'pass') : pill(r.kind === 'text' ? '✓ AA' : '✓ 3:1', 'pass')) : accepted ? pill('! Accepted with note', 'warn') : pill(`✕ ${r.kind === 'text' ? 'Below AA' : 'Below 3:1'}`, 'fail')),
        h('td', null, pass ? '' : h('div', { class: 'stack-s' }, r.fix && h('button', { type: 'button', class: 'btn outlined small', onclick: () => { S.overrides[mode][r.fg] = r.fix.hex; commit(); } }, `Use tone ${r.fix.tone} (${r.fix.hex.toUpperCase()}) for ${r.fg}`),
          field(`acc-${key.replace(/[^a-z0-9]/gi, '-')}`, 'Accept this failure with a note', accepted || '', { compact: true, oninput: (v) => { if (v.trim()) S.accepted[key] = v; else delete S.accepted[key]; save(); }, onchange: () => commit() }))));
    })))));
}
function exportStatus(pal) {
  const items = [];
  for (const mode of ['light', 'dark']) for (const f of pal.checks[mode].failures) if (!S.accepted[acceptKey(mode, f.fg, f.bg, f.kind)]) items.push({ mode, ...f });
  return items;
}
function exportBanner(pal) {
  const items = exportStatus(pal);
  return items.length ? notice('fail', h('b', null, `Export blocked: ${items.length} WCAG failure${items.length === 1 ? '' : 's'} without a fix or a note. `), 'Apply a fix, or accept a failure with a note. Accepted failures travel into the exports.')
    : notice('pass', h('b', null, 'Export ready. '), 'No unresolved WCAG 2.2 failures in the role pairs.');
}

// --- Step 5: checks ---------------------------------------------------------------------------------------------------
const swatchBox = (hex, w) => h('span', { style: `display:inline-block;width:${w || 64}px;height:28px;border-radius:4px;border:1px solid var(--line);background:${hex}`, title: hex });
function table(head, rows, numCols) {
  return h('div', { class: 'tbl-wrap' }, h('table', null,
    h('thead', null, h('tr', null, head.map((t, i) => h('th', { class: numCols && numCols.includes(i) ? 'num' : '' }, t)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h('td', { class: numCols && numCols.includes(i) ? 'num' : '' }, c)))))));
}
function summaryCards(pal) {
  return h('div', { class: 'grid cols-2' }, ['light', 'dark'].map((mode) => {
    const rows = pal.checks[mode].rows; const t = rows.filter((r) => r.kind === 'text'); const n = rows.filter((r) => r.kind === 'non-text');
    const open = pal.checks[mode].failures.filter((f) => !S.accepted[acceptKey(mode, f.fg, f.bg, f.kind)]).length;
    return h('div', { class: 'slot filled' }, h('h3', null, cap(mode)), h('dl', { class: 'kv' },
      h('dt', null, 'Text pairs at AA'), h('dd', null, `${t.filter((r) => r.aa).length} of ${t.length}`),
      h('dt', null, 'UI pairs at 3:1'), h('dd', null, `${n.filter((r) => r.pass).length} of ${n.length}`),
      h('dt', null, 'Unresolved'), h('dd', null, open)));
  }));
}
function cvdSection(pal) {
  const roles = ['primary', 'secondary', 'tertiary', 'error'];
  const modes = ['light', 'dark'].map((mode) => {
    const sim = (r, t) => (t ? PE.simulateCvd(pal.schemes[mode][r], t) : pal.schemes[mode][r]);
    const rows = roles.map((r) => [h('span', { class: 'mono' }, r), ...[null, 'protan', 'deutan', 'tritan'].map((t) => swatchBox(sim(r, t)))]);
    const flags = pal.checks[mode].cvd;
    const msg = flags.length
      ? notice('warn', h('b', null, 'Collapse: '), flags.map((f) => `${f.a} and ${f.b} under ${f.type} (ΔE00 ${f.dE00.toFixed(1)})`).join('; ') + '. Do not rely on these roles differing by color alone (WCAG 1.4.1).')
      : notice('pass', 'The four key roles stay distinct under all three color-blind views.');
    return h('div', { class: 'stack-s' }, h('h4', null, mode), table(['Role', 'Normal', 'Protan', 'Deutan', 'Tritan'], rows), msg);
  });
  return h('div', { class: 'sect stack' }, h('h3', null, 'Color-blind views (Machado et al. 2009, full severity)'),
    h('p', { class: 'small muted' }, 'Roles whose simulated colors fall within ΔE00 10 of each other are flagged. The threshold is a convention.'), modes);
}
function apcaSection(pal) {
  const light = pal.schemes.light;
  const rows = pal.checks.light.rows.filter((r) => r.kind === 'text').map((r) => [h('span', { class: 'mono' }, `${r.fg} on ${r.bg}`), String(PE.apcaScore(light[r.fg], light[r.bg])), ratioText(r.ratio)]);
  return h('div', { class: 'sect stack' }, h('h3', null, 'APCA (advisory)'),
    h('p', { class: 'small muted' }, 'A readability score from the WCAG 3 drafts: web only, never applied to print, and not a pass or fail.'),
    table(['Pair (light)', 'Lc', 'WCAG ratio'], rows, [1, 2]));
}
function printSection(pal) {
  const name = (PROFILES.find((x) => x.id === S.profile) || {}).short;
  let body = h('span', { class: 'muted' }, 'Print data not loaded.');
  if (lutStatus === 'ready') {
    const lab = (hex) => PE.analyze(hex, luts).print[S.profile].printLab;
    const d = PE.printLegibility(lab(pal.schemes.light.onSurface), lab(pal.schemes.light.surface)).deltaL;
    body = h('div', { class: 'row' }, h('span', null, `onSurface on surface under ${name}: ΔL* ${d}`), pill(d >= 50 ? '✓ Strong' : '! Check', d >= 50 ? 'pass' : 'warn'));
  }
  return h('div', { class: 'sect stack' }, h('h3', null, 'Print'),
    h('p', { class: 'small muted' }, 'WCAG does not apply to print. ΔL* between text and background under the selected profile is a legibility guide; the 50-point marker is a rule of thumb, not a standard.'), body);
}
function originSection() {
  const recs = [['Seed', S.seed], ...SLOTS.map(([k, l]) => [l, S.supporting[k]])].filter(([, v]) => v);
  const rows = recs.map(([label, v]) => [label, h('span', { class: 'mono' }, v.hex.toUpperCase()), v.origin, v.tier ? tierPill(v.tier) : 'Your choice', v.locked ? 'Yes' : 'No', v.rationale || '—']);
  return h('div', { class: 'sect stack' }, h('h3', null, 'Where each color came from'), table(['Role', 'Color', 'Origin', 'Evidence tier', 'Locked', 'Rationale'], rows));
}
function renderChecks() {
  const pal = palette();
  return h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Checks'),
      h('p', { class: 'lead' }, 'WCAG 2.2 decides pass or fail. Color-blind and APCA results are shown beside it so you can weigh them.')),
    exportBanner(pal), summaryCards(pal), cvdSection(pal), apcaSection(pal), printSection(pal), originSection());
}


// --- Step 6: export ---------------------------------------------------------------------------------------------------
const exportUi = { busy: '', results: {}, aseTones: false, projectMsg: null, confirmOpen: false };
const NOW_BLOCK = 'Export is blocked until every WCAG 2.2 role-pair failure has a fix or an accepted note.';
function triggerDownload(name, data, mime) {
  const blob = new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: 'display:none' }); document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
/** Hand a built file to the viewer's save dialog when the downloads capability exists, else to the browser. */
async function deliver(file) {
  let dl = null;
  try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl && dl.save) {
    const shape = PE.saveShape(file);
    try { await dl.save({ filename: shape.filename, data: shape.data }); return { ok: true, text: shape.wrapped ? `Saved as ${shape.filename} (the viewer only saves some file types, so this one is inside a .zip; unzip it to get ${file.name}).` : `Saved ${shape.filename}.` }; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return { ok: false, text: 'Not saved: you closed the save prompt.' };
      if (code === 'rate_limited') return { ok: false, text: 'A save prompt is already open. Answer it, then try again.' };
      if (code === 'too_large') return { ok: false, text: 'The viewer says this file is too large to save.' };
      // any other code: this view cannot save through the viewer, so fall through to a browser download
    }
  }
  try { triggerDownload(file.name, file.data, file.mime); return { ok: true, text: `Downloaded ${file.name}.` }; }
  catch (e) { return { ok: false, text: 'This browser refused the download.' }; }
}
function currentModel() { return PE.buildExportModel(S, luts, { lex: LEX }); }
async function runExport(id) {
  if (exportUi.busy) return;
  exportUi.busy = id; exportUi.results[id] = { ok: true, text: 'Building…' }; render();
  let res;
  try {
    const model = currentModel();
    const file = id === 'all' ? null : await PE.buildFile(id, model, S, { aseTones: exportUi.aseTones });
    if (id === 'all') {
      const files = await PE.buildAll(model, S, { aseTones: exportUi.aseTones });
      res = await deliver(PE.zipAll(files, model));
      res.warnings = files.flatMap((f) => f.warnings.map((w) => `${f.name}: ${w}`));
    } else { res = await deliver(file); res.warnings = file.warnings; }
  } catch (e) {
    res = { ok: false, text: e && e.name === 'ExportBlockedError' ? NOW_BLOCK : `Could not build this file: ${e && e.message ? e.message : e}` };
  }
  exportUi.busy = ''; exportUi.results[id] = res; render(); say(res.text);
  const b = document.getElementById(`exp-${id}`); if (b) b.focus();
}
async function openProject(file, where = 'export') {
  const fail = (errors, warnings) => { exportUi.projectMsg = { ok: false, where, errors, warnings: warnings || [] }; render(); say('The project file was not opened'); };
  if (!file) return;
  if (file.size > PE.MAX_PROJECT_BYTES) return fail(['The file is too large to be a Palette Engine project.']);
  let text; try { text = await file.text(); } catch (e) { return fail(['The file could not be read.']); }
  const r = PE.parseProject(text);
  if (!r.ok) return fail(r.errors, r.warnings);
  S = r.state; // the step it was saved on (a project with no seed is always on Seed: validateState)
  exportUi.results = {}; exportUi.projectMsg = { ok: true, where: S.step, errors: [], warnings: r.warnings, savedAt: r.savedAt, name: file.name };
  saveNote = 'Opened from a project file'; commit(); say('Project opened');
  requestAnimationFrame(() => { const t = $('#panel-title'); if (t) t.focus({ preventScroll: false }); }); // the control that was used is gone after the redraw
}
// One way to open a project file, used on the Seed step (so a saved project can be the starting point) and on the Export step.
// Opening over existing work asks first (rule S12.1); a failed open changes nothing (S11.2) and says why (S11.1).
function projectOpener(where, cls) {
  const hasWork = !!S.seed;
  const input = h('input', { type: 'file', id: 'project-file', accept: '.json,application/json', style: 'display:none', 'aria-label': 'Open a project file', tabindex: '-1' });
  input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) openProject(f, where); });
  const pick = () => { exportUi.confirmOpen = false; input.click(); };
  const button = h('button', { type: 'button', class: `btn ${cls}`, id: 'open-project', onclick: () => (hasWork ? (exportUi.confirmOpen = true, render(), (document.getElementById('open-confirm') || {}).focus?.()) : pick()) }, 'Open project file…');
  const confirm = exportUi.confirmOpen && notice('warn', h('div', { class: 'stack-s' }, h('div', null, h('b', null, 'Replace your current work? '), 'Opening a project file replaces what is on this page. Save it first if you want to keep it.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled small', id: 'open-confirm', onclick: pick }, 'Choose a file to open'), h('button', { type: 'button', class: 'btn text small', onclick: () => { exportUi.confirmOpen = false; render(); } }, 'Cancel'))));
  return { input, button, confirm };
}
function projectResult(m) {
  if (!m) return null;
  return m.ok
    ? notice('pass', h('b', null, 'Opened. '), `${m.name}${m.savedAt ? `, saved ${m.savedAt}` : ''}.`, m.warnings.length > 0 && ` Note: ${m.warnings.slice(0, 5).join(' ')}`)
    : notice('fail', h('div', { class: 'stack-s' }, h('div', null, h('b', null, 'That file was not opened, and your work is unchanged. ')), h('ul', null, m.errors.slice(0, 12).map((e) => h('li', null, e))), m.errors.length > 12 && h('div', null, `…and ${m.errors.length - 12} more.`)));
}
function projectSection() {
  const { input, button, confirm } = projectOpener('export', 'outlined');
  const m = exportUi.projectMsg;
  return h('div', { class: 'sect stack' }, h('h3', null, 'Save or open project'),
    h('p', { class: 'small muted' }, 'Save your choices (colors, locks, notes, overrides, accepted failures, pasted spot values) as a JSON file to open later or on another device. Saving is never blocked by accessibility failures.'),
    field('project-name', 'Project name (used in file names and the spec)', S.name, { compact: true, oninput: (v) => { S.name = v; save(); } }),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn outlined', id: 'exp-project', disabled: !!exportUi.busy, onclick: () => runExport('project') }, 'Save project file'),
      button,
      input),
    exportUi.results.project && h('div', { class: 'small', role: 'status' }, exportUi.results.project.text),
    confirm,
    projectResult(m));
}
function renderExport() {
  const pal = palette(); const items = exportStatus(pal);
  const blocked = items.length > 0; const noLut = lutStatus !== 'ready';
  const off = blocked || noLut || !!exportUi.busy;
  const model = !blocked && !noLut ? (() => { try { return currentModel(); } catch (e) { return null; } })() : null;
  const gated = PE.FORMATS.filter((f) => f.gated);
  const card = (f) => {
    const r = exportUi.results[f.id];
    return h('div', { class: 'slot filled' },
      h('div', { class: 'row-between' }, h('h3', null, f.label), h('span', { class: 'mono small muted' }, model ? `${model.slug}${f.suffix}` : `…${f.suffix}`)),
      h('p', null, f.plain), h('p', { class: 'small muted' }, f.blurb),
      f.id === 'ase' && h('div', { class: 'stack-s' }, toggleSwitch('Also include the 84 tonal-palette colors', exportUi.aseTones, (v) => { exportUi.aseTones = v; render(); }),
        notice('warn', h('div', null, h('b', null, 'What this file is. '), 'Colors are stored as plain RGB, CMYK and Lab values. No color profile is embedded, so set the CMYK working space to the profile named in each group. SWOP and the three European conditions are not included, and the spot group appears only when you pasted spot values. ',
          ASE_TESTED_IN_ADOBE ? 'Opened and checked in Adobe apps.' : h('b', null, 'It has not been opened in Illustrator or InDesign; its structure was checked with three independent readers.')))),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled', id: `exp-${f.id}`, disabled: off, onclick: () => runExport(f.id) }, exportUi.busy === f.id ? 'Building…' : 'Save'),
        r && h('span', { class: 'small', role: 'status' }, r.text)),
      r && r.warnings && r.warnings.length > 0 && notice('warn', h('div', null, h('b', null, 'Characters replaced: '), r.warnings.join(' '))));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'stack-s' }, h('h2', { id: 'panel-title', tabindex: '-1' }, 'Export'),
      h('p', { class: 'lead' }, 'Design tokens are named color values that design and code tools share. The text spec, Adobe swatches and printable sheet come from the same model, so every rationale, lock and accepted failure appears in each.')),
    exportBanner(pal),
    blocked && h('div', { class: 'stack-s' }, h('ul', null, items.slice(0, 12).map((f) => h('li', null, h('span', { class: 'mono' }, `${f.mode}: ${f.fg} on ${f.bg}${f.kind === 'non-text' ? ' (UI)' : ''}`)))), items.length > 12 && h('div', { class: 'small muted' }, `…and ${items.length - 12} more.`),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn outlined', onclick: () => setStep('palette') }, 'Go to Palette and roles'))),
    !blocked && noLut && (lutStatus === 'failed' ? notice('warn', 'The print lookup tables did not load, so print data cannot be included and exports are unavailable. The project file still works.') : h('p', { class: 'muted' }, 'Loading print data…')),
    h('div', { class: 'stack' }, gated.map(card)),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn filled', id: 'exp-all', disabled: off, onclick: () => runExport('all') }, 'Download all (.zip)'),
      exportUi.results.all && h('span', { class: 'small', role: 'status' }, exportUi.results.all.text)),
    exportUi.results.all && exportUi.results.all.warnings && exportUi.results.all.warnings.length > 0 && notice('warn', h('div', null, h('b', null, 'Characters replaced: '), exportUi.results.all.warnings.join(' '))),
    h('p', { class: 'small muted' }, 'Spot names are approximate and come only from values you pasted.'),
    projectSection());
}

// --- shell ------------------------------------------------------------------------------------------------------
function setStep(id) { if (exportUi.projectMsg && exportUi.projectMsg.where !== 'export') exportUi.projectMsg = null; // the Export step keeps its note, as before; any other step's note ends when the person leaves it
  S.step = id; commit(); requestAnimationFrame(() => { const t = $('#panel-title'); if (t) t.focus({ preventScroll: false }); }); }
function renderTabs() {
  const tabs = $('#tabs'); tabs.replaceChildren(...STEPS.map((s, i) => { const disabled = i > 0 && !S.seed; const done = (s.id === 'seed' && S.seed) || (s.id === 'support' && (S.supporting.secondary || S.supporting.tertiary));
    return h('button', { type: 'button', class: 'tab', role: 'tab', id: `tab-${s.id}`, 'aria-selected': String(S.step === s.id), 'aria-controls': 'panel', tabindex: S.step === s.id ? '0' : '-1', disabled: disabled, onclick: () => setStep(s.id) },
      h('span', { class: `n ${done ? 'done' : ''}`, 'aria-hidden': 'true' }, done ? '✓' : i + 1), s.label); }));
}
// Tabs pattern (WAI-ARIA APG, manual activation): the selected tab is the one Tab stop; the arrow keys, Home and End move focus between the
// open tabs (wrapping) and Enter or Space opens the one in focus. Activation is manual because opening a step moves focus into its panel,
// which would otherwise happen on every arrow press.
function onTabKeys(e) {
  const cur = e.target.closest && e.target.closest('.tab'); if (!cur) return;
  const open = Array.from($('#tabs').querySelectorAll('.tab:not([disabled])')); if (!open.length) return;
  const i = open.indexOf(cur); let to = null;
  if (e.key === 'ArrowRight') to = open[(i + 1) % open.length];
  else if (e.key === 'ArrowLeft') to = open[(i - 1 + open.length) % open.length];
  else if (e.key === 'Home') to = open[0];
  else if (e.key === 'End') to = open[open.length - 1];
  if (!to) return;
  e.preventDefault(); to.focus();
}
// Notices for the print profiles the tables are built from. The GRACoL and SWOP wording is the text PRINTING United Alliance asked for
// (their reply of 2026-10-01); the ECI line is copied from the copyright field inside the profiles; the VIGC line is the notice on the
// ICC Profile Registry page for the FOGRA39 file (read 2026-10-13, TO-CONFIRM C23 and C30).
const PROFILE_NOTICES = [
  ['GRACoL2013_CRPC6, GRACoL2013UNC_CRPC3', 'Copyright © PRINTING United Alliance 2013. This profile is based upon the GRACoL® trademark color specification, made available by PRINTING United Alliance (www.printing.org), and may be used, embedded, exchanged, and shared without restriction. It may not be altered or sold without the prior written permission of PRINTING United Alliance. GRACoL® is a registered trademark of the PRINTING United Alliance.'],
  ['SWOP2013C3_CRPC5', 'Copyright © PRINTING United Alliance 2013. This profile is based upon the SWOP® trademark color specification, made available by PRINTING United Alliance (www.printing.org), and may be used, embedded, exchanged, and shared without restriction. It may not be altered or sold without the prior written permission of PRINTING United Alliance. SWOP® is a registered trademark of the PRINTING United Alliance.'],
  ['PSOcoated_v3, PSOuncoated_v3_FOGRA52', 'This profile is made available by ECI European Color Initiative (www.eci.org), with permission of Heidelberger Druckmaschinen AG (www.heidelberg.com), and may be used, embedded and exchanged without restriction. It may not be distributed, sold or altered without written permission of ECI European Color Initiative. Color Toolbox 17.0.0 - (c) Copyright 2015 Heidelberger Druckmaschinen AG. All Rights Reserved.'],
  ['Coated_Fogra39L_VIGC_260', 'This profile is made available by VIGC, with permission of X-rite, and may be used, embedded, exchanged, and shared without restriction. It may not be altered or sold without written permission of VIGC. (Notice from the ICC Profile Registry page for this file; inside the file the only notice is "Copyright X-Rite, Inc.")'],
];
function renderFoot() {
  $('#foot').replaceChildren(
    h('div', { class: 'row' }, h('h4', null, 'Evidence tiers'), TIERS.slice().reverse().map((t) => tierPill(t))),
    h('p', null, 'Well-established: standards and measurement science. Supported but contested: peer-reviewed effects that depend on context. Low confidence: weak or poorly replicated evidence, or an engineering choice. Speculative: convention, shown but not scored.'),
    h('p', null, 'These findings are averages across the people studied. A review of the research notes that age, culture, design training and the setting a color appears in can shift how it is rated, so check a suggestion with your own audience. Many of the studies behind these suggestions showed people one color, or one pair, under controlled lighting. Colors on your screen or in print can look different, and a full palette in real use can behave differently.'),
    h('p', null, 'Print swatches are lookup-table approximations, not proofs. Spot names are approximate and unlicensed; verify against a physical guide. Pantone is a trademark of its owner.'),
    h('details', null, h('summary', null, 'Print profile notices'),
      h('p', { class: 'small muted' }, 'The print tables are computed from these profiles. The profile files themselves are not part of this tool.'),
      h('p', { class: 'small' }, h('b', null, 'Credit. '), 'The PSO Coated v3 and PSO Uncoated v3 tables are computed from profiles published by ECI European Color Initiative (www.eci.org).'),
      PROFILE_NOTICES.map(([names, text]) => h('p', { class: 'small' }, h('b', null, `${names}. `), text))),
    h('p', null, 'Palette Engine was designed and built by Kwade Joslin with Claude. More of his work is at ', h('a', { href: 'https://kwadejoslin.com', target: '_blank', rel: 'noopener noreferrer' }, 'kwadejoslin.com'), '.'));
}
let rendering = false, again = false;
function render() {
  // Removing a focused field can fire its change handler, which calls render() again mid-replace; run that one after this one.
  if (rendering) { again = true; return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  if (again) { again = false; render(); }
}
function renderNow() {
  if (!S.seed && S.step !== 'seed') S.step = 'seed';
  $('#savestate').textContent = saveNote;
  renderTabs();
  const panel = $('#panel'); panel.setAttribute('aria-labelledby', `tab-${S.step}`);
  const view = { seed: renderSeed, analyze: renderAnalyze, support: renderSupport, palette: renderPalette, checks: renderChecks, export: renderExport }[S.step]();
  // After opening a project that was saved on a step other than Seed or Export, say so on that step (those two show the note inside their own section).
  const m = exportUi.projectMsg;
  const note = m && m.ok && m.where === S.step && S.step !== 'seed' && S.step !== 'export' ? projectResult(m) : null;
  panel.replaceChildren(note ? h('div', { class: 'stack' }, note, view) : view);
}
let resetArmed = false;
function init() {
  loadState();
  $('#reset').addEventListener('click', () => { const b = $('#reset'); if (!resetArmed) { resetArmed = true; b.textContent = 'Click again to clear this project'; setTimeout(() => { resetArmed = false; b.textContent = 'New project'; }, 4000); return; }
    resetArmed = false; b.textContent = 'New project'; S = defaults(); exportUi.results = {}; exportUi.projectMsg = null; exportUi.confirmOpen = false; saveNote = 'Cleared'; try { localStorage.removeItem(STORE_KEY); } catch (e) {} render(); });
  $('#tabs').addEventListener('keydown', onTabKeys);
  renderFoot(); render(); loadLuts();
}
window.__PE_APP = { get state() { return S; }, render };
init();
})();
