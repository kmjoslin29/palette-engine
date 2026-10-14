# 04 Architecture

## Shape

```
 build step (Python, run rarely)                      page (runs in the browser, no server)
 ───────────────────────────────                      ─────────────────────────────────────
 3 ICC profiles ──► build_luts.py ──► data/lut_*.json ─────────────┐
 (LittleCMS, double precision)                                      │
 lexicon/*.json ──► build_lexicon.py ──► data/lexicon.json ─────────┤
                                                                    ▼
 engine/*.js ──► esbuild ──► dist/engine.iife.js ──► make_page.mjs ──► dist/site/index.html + data/
 web/app.js, web/style.css ─────────────────────────────────────────────────┘
```

- The **build step** turns slow, exact things into data: the ICC transform becomes a 33×33×33 lookup table per print condition, and the reviewed lexicon becomes
  one JSON file. Rerun it only when a profile or the lexicon changes.
- The **engine** is plain ES modules with no browser dependencies, so the same code runs in Node (tests, the example build) and in the page (bundled with esbuild). The bundler replaces the `colorparsley` package, which `apca-w3` imports and which is AGPL-licensed, with `build/stubs/colorparsley-hex.js`; the engine only ever passes hex strings (see `docs/08-data-and-licences.md`).
  `@material/material-color-utilities` needs bundling because its files use extensionless imports.
- The **page** is one HTML file plus the three lookup tables fetched from `data/`. State lives in memory, is autosaved to browser storage, and can be saved
  to and reopened from a project file. There is no backend.

## Engine modules

| File | Module | Job |
| --- | --- | --- |
| `color.js` | M1 | Parse colors; OKLCH, Lab D50, hex; sRGB gamut test; CSS Color 4 gamut mapping (chroma reduced in OKLCH). The hub the others use |
| `lut.js` | M2 | Decode a lookup table; tetrahedral interpolation to CMYK and printed Lab; CMYK rounding and total ink |
| `gamut.js` | M3 | "P3 only" flag with the original kept; print-gamut flag (round-trip ΔE00 above 2.0) and the printable neighbor |
| `spot.js` | M4 | Parse pasted names and Lab values; score Coated and Uncoated by ΔE00; bands |
| `harmony.js` | M5 | Harmony lenses, candidates with contrast, CVD collapse and nearest text-safe lightness; advisory Ou & Luo score |
| `palette.js` | M6 | Tonal palettes (HCT), 29 light and dark roles (Material 3, 2021 tones), overrides, nearest passing tone fixes |
| `checks.js` | M7 | WCAG 2.2 contrast, role-pair matrix, APCA (advisory; names the `apca-w3` version it was built with), CVD simulation (Machado 2009), print ΔL* |
| `matcher.js` | M8 | Descriptor terms to ranked seed candidates |
| `de.js` | shared | The only ΔE2000 entry point; keeps Lab in D50 |
| `analyze.js` | glue | One call: screen record, print per profile, gamut flags |
| `project.js` | state | The single definition of project state; strict validation and save/load of project files |
| `export/*` | exports | One shared model feeds every exporter (see [05](05-exports.md)) |

## Rules every module follows

1. Never call culori's `differenceCiede2000` directly (it converts to D65 first, up to 26 ΔE00 error on D50 input). Use `de00` from `de.js`. The one place
   D65 appears is the Ou et al. 2004 color-emotion models, because that is how they were measured.
2. Lab is D50 everywhere else.
3. WCAG 2.2 is the pass/fail gate. APCA is advisory, web only, never in print.
4. Color-blind simulation is Machado et al. 2009 at full severity; pairs closer than ΔE2000 10 collapse.
5. Rounding at the boundary: CMYK to whole percent, ΔE00 to one decimal, OKLCH to L 2 / C 3 / h whole degrees, contrast to two decimals.
6. Accessibility never silently re-ranks or removes a suggestion. Filters are the designer's choice and list what they hide.
7. Everything a designer types is placed with `textContent`, never as HTML.

## The page

| Step | What it holds |
| --- | --- |
| Seed | Color entry, or descriptor words and seed candidates |
| Analyze | Screen values, print per profile with gamut flags, the spot scorer |
| Supporting colors | Harmony lenses, filters, secondary and tertiary slots |
| Palette and roles | Light and dark roles, overrides, role-pair table with fixes and accepted-failure notes |
| Checks | WCAG summary, color-blind views, APCA, print legibility, color origins |
| Export | Seven outputs, "download all", project file save and open |

Interface mechanics follow Material Design 3 (values taken from the Material Web 2.5.0 tokens): 48px touch targets, 40px buttons, 32px chips, 48px tabs with a 3px
indicator, a 52×32 switch, state layers 8% hover and 10% focus and pressed (12% on chips, switches and tabs), a 3px focus ring with a 2px offset, 38% for disabled.
Intentional deviations: field labels sit above the field instead of floating in the outline; the tab bar is used as a wizard stepper with a done mark; the visual
design is Kwade's, not Material's.

## Data flow for one color

hex or words → **M1/M8** normalize → Lab D50, OKLCH → **M2** CMYK and printed Lab per profile → **M3** gamut flags → **M4** spot scores → **M6** tonal palette and roles →
**M7** checks → export model → files.
