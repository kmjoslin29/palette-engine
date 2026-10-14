// Palette Engine — the files an export produces: names, build order, and how each one is handed to the viewer's save dialog.
// The viewer's downloads capability only saves an allow-listed set of extensions (gif png jpg jpeg webp mp4 webm txt json md docx pptx
// epub csv ttf html svg pdf xlsx zip). .css and .ase are not on it, so those two are saved inside a small .zip when that route is used.
import { forgeTokensJson, dtcgTokensJson } from './forge.js';
import { cssVariables } from './css.js';
import { markdownSpec } from './markdown.js';
import { buildAse } from './ase.js';
import { buildSpecSheetPdf } from './sheet.js';
import { zipStore } from './zip.js';
import { assertExportable } from './model.js';
import { serializeProject } from '../project.js';

export const SAVEABLE = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip']);
export const FORMATS = [
  { id: 'forge', label: 'Design tokens (JSON)', plain: 'Default. For design-system-forge and most token tools.', suffix: '-design-tokens.json', mime: 'application/json', gated: true, blurb: 'Token file: color.<palette>.<tone>, light roles, a color-dark group and $themes. Print and spot data sit under $extensions.com.kwadejoslin.palette.' },
  { id: 'dtcg', label: 'Design tokens (W3C standard)', plain: 'Same colors in the open standard format (DTCG 2025.10), for tools that follow it.', suffix: '.w3c.tokens.json', mime: 'application/design-tokens+json', gated: true, blurb: 'The same tokens in the W3C Design Tokens format: color values as { colorSpace, components, hex }. No $themes (the format leaves modes to its resolver module).' },
  { id: 'css', label: 'Website colors (CSS)', plain: 'Variables you paste into a site or app.', suffix: '-colors.css', mime: 'text/css', gated: true, blurb: 'Variables on :root, dark roles under prefers-color-scheme and [data-theme="dark"], OKLCH in comments.' },
  { id: 'md', label: 'Color specification (text)', plain: 'Readable record of every color, check and decision (Markdown).', suffix: '-color-spec.md', mime: 'text/markdown', gated: true, blurb: 'Per-color values, CMYK for all six print conditions with gamut flags, Pantone C/U, contrast, evidence, rationale, locks and accepted failures.' },
  { id: 'ase', label: 'Adobe swatches (.ase)', plain: 'For Illustrator, InDesign and Photoshop.', suffix: '.ase', mime: 'application/octet-stream', gated: true, blurb: 'Groups: Screen RGB, Print GRACoL coated CMYK, Print uncoated CMYK, Spot approximations. SWOP and the three European conditions are not in the file; the spec text and token file carry them.' },
  { id: 'pdf', label: 'Brand color sheet (PDF)', plain: 'Printable US Letter reference.', suffix: '-color-spec-sheet.pdf', mime: 'application/pdf', gated: true, blurb: 'US Letter: a summary, one page per color, roles and role-pair checks.' },
  { id: 'project', label: 'Save or open project', plain: 'Keeps your work so you can resume it later.', suffix: '.palette-project.json', mime: 'application/json', gated: false, blurb: 'Everything you have chosen, so the work is not tied to this browser. Open it again from this page.' },
];
const enc = new TextEncoder();
export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();

/** Build one file. Returns { id, label, name, mime, data (string | Uint8Array), bytes, warnings }. */
export async function buildFile(id, model, state, opts = {}) {
  const f = FORMATS.find((x) => x.id === id); if (!f) throw new Error(`Unknown export ${id}`);
  if (f.gated) assertExportable(model);
  const name = `${model.slug}${f.suffix}`; let data, warnings = [];
  if (id === 'forge') data = forgeTokensJson(model);
  else if (id === 'dtcg') data = dtcgTokensJson(model);
  else if (id === 'css') data = cssVariables(model);
  else if (id === 'md') data = markdownSpec(model);
  else if (id === 'ase') data = buildAse(model, { includeTones: !!opts.aseTones });
  else if (id === 'pdf') { const r = await buildSpecSheetPdf(model); data = r.bytes; warnings = r.warnings; }
  else if (id === 'project') data = serializeProject(state, { now: opts.now });
  return { id, label: f.label, name, mime: f.mime, data, bytes: typeof data === 'string' ? enc.encode(data).length : data.length, warnings };
}
/** Every file, in listing order. Requires an exportable model. */
export async function buildAll(model, state, opts = {}) {
  const out = []; for (const f of FORMATS) out.push(await buildFile(f.id, model, state, opts)); return out;
}
/** One .zip holding all the files, with a plain-text list of what each one is. */
export function zipAll(files, model, date = new Date(`${model.date}T12:00:00Z`)) {
  const readme = [`${model.name}: color files made by Palette Engine on ${model.date}`, '', ...files.map((f) => `${f.name}  ${FORMATS.find((x) => x.id === f.id).blurb}`), '',
    'Print swatches are lookup-table approximations, not proofs. Spot names are approximate and come from values the designer pasted.',
    'The .ase file carries no color profile: set the CMYK working space to the profile named in each group.', ''].join('\n');
  return { name: `${model.slug}-color-files.zip`, mime: 'application/zip', data: zipStore([...files.map((f) => ({ name: f.name, data: f.data })), { name: 'README.txt', data: readme }], date) };
}
/** What to pass to downloads.save: the file itself when its extension is allowed, else the same file inside a zip. */
export function saveShape(file) {
  if (SAVEABLE.has(extOf(file.name))) return { filename: file.name, data: file.data, wrapped: false };
  return { filename: `${file.name}.zip`, data: zipStore([{ name: file.name, data: file.data }]), wrapped: true };
}
