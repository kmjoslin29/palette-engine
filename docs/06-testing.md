# 06 Testing

Run everything with `npm test` (engine and export tests, then a fresh page build and the browser tests). Python tests: `python build/test_lexicon.py`.

## What is covered

| Layer | Files | What it proves |
| --- | --- | --- |
| Print lookup | `test_lut`, `test_lab` | The JavaScript lookup equals the Python build on 11,000 colors per profile; culori's sRGB→Lab D50 agrees with LittleCMS to ΔE00 0.004 |
| Spot scorer | `test_spot` | ΔE2000 matches colour-science on 1,150 pairs (max difference 1e-13) and the published Sharma, Wu & Dalal (2005) test pairs (max 0.00004); parser and bands |
| Color maths | `test_color` | hex → OKLCH → hex exact for 10,000 random colors plus corners and grays; gamut-mapping behavior (lightness and hue drift measured) |
| Gamut | `test_gamut` | `#00FF00` flags out of print gamut on GRACoL coated; neutral grays do not; pure black flags with an explanatory note |
| Checks | `test_checks` | `#767676` on white is 4.54:1 (passes AA); `#777777` is 4.48:1 (fails); CVD collapses a red/green pair; APCA sanity; print ΔL* |
| APCA without the AGPL parser | `test_apcastub` | The hex-only stand-in for `colorparsley` returns exactly what the real package returns on 200,000 random hex strings; APCA scores from the built bundle equal those from the unmodified `apca-w3` + `colorparsley` on 100,000 random pairs and a 281,216-pair sweep of the RGB cube; the bundles contain no AGPL text. Does not test colors given as words or `rgb()` strings, which the engine never passes |
| Harmony, palette, matcher | `test_harmony`, `test_palette`, `test_matcher` | Every candidate is in sRGB after mapping; role tones equal the Material library's reference scheme for sample seeds; the matcher is deterministic and its seeds are inspected, not just counted; word forms, study words and strong synonyms reach the right row at the right tier, no inflection lands on a different row, and hyphenated words are not split (each of these was made to fail once by breaking the code) |
| Analysis glue | `test_analyze` | Screen and print records per profile, P3 flag |
| Exports (needs `poppler-utils` for pdftotext and pdftoppm, `qpdf` and `unzip` installed) | `test_export`, `test_ase`, `test_sheet`, `test_files`, `test_project` | Each format parsed back by an independent reader (JSON structure, postcss for CSS, markdown-it for Markdown, three ASE readers including Python, qpdf and pdftotext for the PDF); hostile and unusual input; blocked exports; project-file validation |
| Example | `test_example` | The committed example outputs equal a fresh build, so they cannot go stale |
| Design tokens | `web/test_tokens` | The page's own colors pass WCAG AA in both themes |
| Browser: exports | `web/test_export_ui` | Gating, every download parsed back, the viewer save path (mocked), project save and open, invalid and hostile project files |
| Browser: end to end | `web/test_e2e` | A whole session on both entry paths; every step in light and dark at 375px and 1100px: no sideways scroll, WCAG AA text contrast, an accessible name on every control; keyboard focus ring; reload; blocked storage; hostile saved data |

## The Phase 6 gate

"Zero console errors" is enforced by the browser tests: any page error, console error or failed request (Google Fonts excepted, blocked on purpose) fails the run.
The harness was itself checked to fail on a console error, a thrown error and a 404.

## How the tests were kept honest

- Mutation checks: break the code and confirm the relevant test fails (done for the export assertions).
- Independent readers: no exporter is tested only by its own reader.
- Inspect outputs, not only assertions: two matcher drafts passed their tests while returning bad seeds; the tests now check the seeds.
- Reference values from outside the codebase: LittleCMS, colour-science, published test pairs, published contrast examples.

## What the tests cannot show

- **The `.ase` file in Adobe applications.** No Adobe app was available.
- **The page inside the claude.ai viewer.** The automated tests mock the viewer's save prompt. Kwade exercised the real one on 2026-09-30 for two exports (a save and a cancel); the wording is recorded in TO-CONFIRM (C12). The zipped route (CSS, ASE) and the rate-limited message have not been seen in the real viewer.
- **Spot-color accuracy against a physical guide.** See [the protocol](spot-check-protocol.md); not yet run.
- **Tokens Studio importing the W3C token file.**
- **The color science itself.** Tests show the code does what the sources say. They do not show that harmony or descriptor research transfers to a given brand.
- **Browsers other than Chromium.** Only headless Chromium was run.
- **Real assistive-technology use.** Contrast, names and focus are checked automatically; no screen-reader session has been run.
