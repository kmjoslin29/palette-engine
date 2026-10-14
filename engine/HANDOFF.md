> Repo copy as of pe-update51 (2026-10-13; delivered as pe-update51.zip; pe-update42 to 49 are committed and CI is green; pe-update50 was delivered and is applied when Kwade commits it). The repo is authoritative; this copy goes stale until refreshed after the next update. docs/07-decisions.md in the Project has D1 to D43: D1 to D41 match the repo file Kwade attached on 2026-10-13, and D42 and D43 (pe-update46 and 47) are committed.

# Engine notes

Current-state notes for anyone changing the engine. History is in [`docs/phase-log.md`](../docs/phase-log.md), decisions in
[`docs/07-decisions.md`](../docs/07-decisions.md), and everything unverified or known to be wrong in [`TO-CONFIRM.md`](../TO-CONFIRM.md).
Last reviewed 2026-10-13 (through pe-update44).

**Spelling:** American English (D36). The page, exports, tests, code, docs and code comments use it. What stays British on purpose: published titles and quotations; the `colours` key in `engine/fixtures/ou_luo_table1.json`; the humour, glamour and tranquillity entries in the matcher's `WORD_FORMS`; the lexicon and emotion-weights data files; `aria-labelledby`; the `colour-science` library (`import colour`) and the OSF data's `colour` column; Pantone's "Warm Grey" names; and the file name `docs/08-data-and-licences.md`. The full list, with reasons, is in the pe-update20 summary.

## Module map

| File | Module | Exports |
| --- | --- | --- |
| `color.js` | M1 | `parseColor`, `toBytes`, `oklch`, `labD50`, `inSrgbGamut`, `mapToSrgb`, `hexFromOklch`, `roundOklch`, `normalize` |
| `lut.js` | M2 | `decodeLut`, `lookup`, `roundCmyk`, `tac` |
| `gamut.js` | M3 | `screenGamut`, `printGamut` |
| `spot.js` | M4 | `parseEntries`, `score`, `band`, `BANDS` |
| `harmony.js` | M5 | `harmonyCandidates`, `allCandidates`, `LENSES`, `accessibilityOf`, `nearestPassingLightness`, `ouLuoModel`, `ouLuoHarmony`, `OU_LUO_K` |
| `palette.js` | M6 | `buildPalette(seed, supporting, {overrides})`, `nearestPassingTone`, `hctOf`, `referenceScheme`. Needs the bundle (rule 6). Material 2021 spec by default |
| `checks.js` | M7 | `contrastRatio`, `textContrast`, `nonTextContrast`, `contrastMatrix`, `apcaScore`, `simulateCvd`, `cvdDistinctPairs`, `printLegibility` |
| `matcher.js` | M8 | `indexLexicon`, `matchTerms`, `matchDescriptors`, `ouScores` (JS mirror of `build_lexicon.ou_scores`), `WORD_FORMS`, `baseForms`, `lowerTier`, `leanTestedRange` |
| `analyze.js` | glue | `analyze(input, luts)`: screen record, print per profile, gamut, P3 flag |
| `de.js` | shared | `de00` |
| `project.js` | state | default state, strict validate and parse of project files |
| `export/` | exports | `model.js` (one shared model), `forge.js` (Forge tokens and the W3C DTCG file), `css.js`, `markdown.js`, `ase.js`, `zip.js`, `sheet.js` (PDF), `files.js` (formats, names, `saveShape`), `index.js` |

Outside `engine/`: `web/` (page: `style.css`, `app.js`, `harness.mjs` and the Playwright suites), `build/` (Python LUT and lexicon builds, esbuild bundle, page
and example builders), `data/` (LUTs, lexicon, accuracy report), `examples/fernhill-bakery/` (fictional brand with committed outputs).

`color.js` is the hub every other module pulls OKLCH and Lab D50 numbers from, rather than re-instantiating culori converters.

## Rules every module follows

1. **Never call culori's `differenceCiede2000()` directly.** It converts inputs to D65 Lab first, which shifted results by up to 26 ΔE00 in testing. Always use
   `de00()` from `de.js`, passing two `{l, a, b}` objects in the same frame (D50 everywhere in this engine).
2. **Lab frame is D50** (culori mode `'lab'`). culori's sRGB to Lab D50 agrees with LittleCMS within ΔE00 0.004 over 11,000 colors. The one place D65 is used is
   Ou's color-emotion models and the Ou & Luo harmony model, because that is how they were measured (`build_lexicon.ou_scores`, `harmony.js`).
3. **Gamut flag (M3):** `de00(screenLabD50, lookup(lut, rgb).rtLab) > 2.0` means out of gamut. `gamut.js#printGamut()` shows `rtLab` (converted to hex) as the printable
   neighbor. Pure black always flags, with a note (ink black is lighter than screen black).
4. **P3 flag:** `gamut.js#screenGamut()` uses culori `inGamut('rgb')` on the OKLCH color; if false it maps with `toGamut('rgb', 'oklch')` (CSS Color 4 chroma
   reduction, exposed as `color.js#mapToSrgb`) and keeps the original in `screen.mappedFrom`.
5. **CMYK display:** `roundCmyk()` (half up), and show TAC against the profile's limit (320 / 300 / 280 for the three US conditions, 300 / 300 for the two PSO conditions). The FOGRA39 file states no limit itself; its ICC registry page lists 260%, which the page uses (D43, C31). 7 of 35,937 grid points in its table exceed that (the profile's own conversion of very dark blues), so a few such colors show as over the limit.
6. **Material color utilities** must be bundled (esbuild) where M6 needs them; their files use extensionless imports. M1, M2, M3, M4 and M7 run unbundled on culori
   and apca-w3 alone. Run `npm run bundle` before tests that import `dist/engine.mjs`.
7. **WCAG vs APCA:** WCAG 2.2 (`checks.js#textContrast`) is the pass/fail floor. APCA (`checks.js#apcaScore`) is advisory only, never a gate, never applied to print
   (its license restricts it to web content).
8. **CVD simulation is Machado et al. 2009** via culori's `filterDeficiencyProt/Deuter/Trit` at full severity. `checks.js#cvdDistinctPairs` flags role pairs whose
   simulated ΔE00 is under 10.
9. **Evidence shown beside accessibility.** Every suggestion shows its evidence tier and its accessibility side by side, in the same card treatment. Rank by
   evidence fit. Accessibility never silently re-ranks or hides a candidate; offer filters instead. Report each accessibility problem with its fix where one exists
   (the nearest passing tone in the same hue).
10. **Export gate.** Unresolved WCAG AA role-pair failures (no fix, no accepted note) block every export except the project file (`ExportBlockedError`).
11. **The page declares only the `downloads` capability.** Never declare `db`; it makes the page organization-only.

## Tests

`npm test` builds the bundle and page, then runs every engine test (`test_lut`, `lab`, `spot`, `color`, `gamut`, `checks`, `harmony`, `ouluo`, `matcher`,
`palette`, `analyze`, `export`, `ase`, `project`, `sheet`, `files`, `example`), `web/test_tokens.mjs`, and the Playwright suites (`test_export_ui`, `test_e2e`) in
headless Chromium. The Python lexicon test runs separately (`python build/test_lexicon.py`). CI runs both. Details and what each test can and cannot catch:
[`docs/06-testing.md`](../docs/06-testing.md).

The PDF and zip tests need `poppler-utils` (pdftotext, pdftoppm), `qpdf` and `unzip` installed. Vectors: `py_vectors.json`, `de_vectors.json`. Fixtures:
`engine/fixtures/` (a third-party ASE sample, and Ou & Luo Table I).

**Running the tests on Windows (found 2026-10-13).** Use `npm.cmd` in PowerShell (also for `npm.cmd run page`) (the `npm` script is blocked by the execution policy). Windows PowerShell 5.1 has no `&&`, and `test:engine` uses a bash loop, so run `npm.cmd test --script-shell "C:\Program Files\Git\bin\bash.exe"` (or use Git Bash); this also puts `unzip` on the path. Plain PowerShell has no `unzip`, so `test_ase` and `test_files` fail there (and `test_files` then crashes); run those two under Git Bash: `& "C:\Program Files\Git\bin\bash.exe" -c "node engine/test_ase.mjs; node engine/test_files.mjs"`. After a change to the print limits or the export text, regenerate the committed example with `node build/make_example.mjs` and commit the files (it wrote into `examples/fernhill-bakery/` without trouble on 2026-10-13). To see every failure at once, run the suites one by one: `foreach ($t in 'export','ase','project','files','example') { "== $t"; node engine/test_$t.mjs }; "== tokens"; node web/test_tokens.mjs`. Keep the repo outside Documents, or allow `node.exe` through Controlled folder access, or `npm install` hangs. The project uses `playwright-core`, so install the browser once with `npx.cmd playwright-core install chromium`. The lexicon test needs `pip install colour-science numpy`. For `build/build_luts.py` and `build/measure_cmyk_rounding.py` (they need LittleCMS 2): in a Miniforge Prompt run `conda create -n lcms -c conda-forge python=3.12 numpy colour-science lcms2`, then `conda activate lcms` and run the script from the repo root. While the environment is active its `Library\bin` is on PATH, which is how `build/lcms.py` finds the library, so no `lcms2.dll` needs copying (checked 2026-10-13: it printed `LittleCMS 2190`); plain PowerShell outside the environment prints "LittleCMS 2 library not found". The six `.icc` files must be in `profiles/` under the names in `build/build_luts.py`; a missing one is skipped with a message. `test_sheet.mjs` needs poppler-utils and qpdf, which a Windows machine may not have; CI runs it on Linux. The test and build scripts build paths with `fileURLToPath`, not `URL.pathname`, so they also run on Windows. `engine/test_sheet.mjs` cannot run on that machine (no poppler-utils or qpdf), so it runs only in CI; a change to the PDF text can pass every local suite and still fail there (found with C31, pe-update49). To see it locally, use WSL or install poppler and qpdf.

## Things to know

- **Lexicon input for M8:** `data/lexicon.json` from `build/build_lexicon.py` (approved rows only). Targets carry `L`, `C`, `hueWeights`, `colorTerms`, `nudges`
  and `models`.
- **Ou & Luo (2006):** equations match the printed paper and `test_ouluo.mjs` checks them against the paper's own range and figures. The paper's Fig. 6b disagrees
  with its Eq. (4) at low lightness sums, and the code follows the equation (TO-CONFIRM C1). The score is advisory and labeled "lab-patch model".
- **`mapToSrgb` history:** it once returned black for every out-of-sRGB color (culori's `toGamut('rgb')` returns an RGB-mode color and the code read `.l/.c/.h`
  off it). The original test only checked "valid hex". Fixed, with regression tests. Measured behavior over 20,000 colors: lightness holds (p95 drift 0.017); hue
  holds within 12° for OKLCH L 0.3 to 0.8 and drifts up to about 40° near black and white.
- **Word matching (D33):** term or approved synonym, then study words (`studyWords`, Aaker's items), then word forms (suffix rules in `baseForms` plus the
  irregular `WORD_FORMS` table, with a small block list such as "really"), then `strongSynonyms`, which lower the row's tier one step through
  `lowerTier`. A direct match of a row replaces an earlier strong-synonym match of the same row. Hyphenated words match whole or are flagged whole.
  `test_matcher.mjs` checks that no inflection of a lexicon word lands on a different row.
- **Tie-break and dark colors (D34):** equal scores go first to the direction of the terms' net lightness lean, then to the color nearest the
  study's measured patch (`opts.tieBreak: 'anchor'` restores the old rule for comparison). Color-word band floors for red, green, turquoise, blue and
  purple are L 0.25. The lean is followed only inside the lightness the source study tested (`leanTestedRange`, D35); a seed outside it carries
  `beyondTested` ({ side, range, terms }) and the page says so on the card.
- **Matcher constants are engineering choices** (low confidence), in `matcher.js`: OKLCH L grid 0.25 to 0.95, 15° hue steps, two-level lightness and chroma leans
  (half the study's beta), 0.05 OKLab minimum gap between variants (TO-CONFIRM C10).
- **Material 3 mechanics used:** 48px touch targets, 40px buttons (24px side padding), 32px chips, 48px tabs with a 3px indicator, 52 by 32px switch, state layers
  8% hover, 10% focus, 10% pressed (12% on chips, switches and tabs), 3px focus ring with 2px offset, disabled 38%. Source: Material Web 2.5.0 tokens (Apache-2.0);
  m3.material.io itself could not be read by the tools used. Intentional deviations: field labels sit above the field instead of floating inside the outline; the tab
  bar is used as a wizard stepper with a done mark; the visual design is not Material's.
- **State** is saved in browser storage (flushed on `pagehide` and when the page is hidden) and in a project file (saved from the Export step; opened from the Seed or Export step).
- **ASE:** structure checked by three independent readers (engine `parseAse`, the `ase-util` package, a Python struct reader) plus a third-party sample, but never in
  Adobe (TO-CONFIRM C7). `ASE_TESTED_IN_ADOBE` in `web/app.js` drives the on-page notice; flip it only after that check. No ICC profile is carried; SWOP and the three European conditions are not in
  the ASE (six print conditions since D38; the first three keep positions 0 to 2 because the ASE and summary tables read them by position); the spot group appears only with pasted values.
- **Downloads:** the claude.ai viewer's allow-list has no `.css` or `.ase`, so those two are saved inside a `.zip` on that route (`saveShape` in `files.js`). The
  browser fallback keeps native names.
- **PDF** uses pdf-lib standard fonts (WinAnsi). Characters outside it become "?" and are reported as warnings. Δ, arrows, ≥, ≤ and ✓ are transliterated. Print
  swatches are drawn as the printable-neighbor RGB.
- **DTCG file** omits `$version` and `$themes` (the format leaves modes to its resolver module); the Forge file keeps both. Forge's old bare `$extensions.cmyk` is
  replaced by the namespaced `com.kwadejoslin.palette` extension. Kwade imported the DTCG file into Tokens Studio without problems (2026-09-29).
- **Step bar (C18):** follows the WAI-ARIA tabs pattern with manual activation. The selected tab is the one Tab stop (roving `tabindex`); arrow keys, Home and End move focus between the open tabs; Enter or Space opens the focused one. Activation is manual because opening a step moves focus into its panel. Disabled tabs are skipped. Tested in `web/test_e2e.mjs`; not yet re-tested with a screen reader.
- **Render guard:** `app.js` has a re-entrancy guard, because a focused field removed mid-render fired its change handler.

## Next session: goals and options (set 2026-10-13)

Start a new session for this; the previous one was compacted once. No separate write-up is needed beyond this section, `TO-CONFIRM.md` and the Project's `claude/project-file-index.md`. Commit pe-update50 and 51 first (both docs only). Read in the order given under "Read in this order" below.

**Kwade's three goals, in the order I suggest**
1. **Make the tool usable online without GitHub, scripts or a terminal (C36, C37).** Check first that the page saves files with a normal browser download outside claude.ai (C37), then pick a host. The claude.ai artifact link is not a dependable public route: Anthropic's pages disagree on whether viewers need an account, and view-only viewers cannot use `downloads` buttons. Options, none chosen: (1) GitHub Pages from a separate small public repo holding only the built `dist/site` (D2 stays open); (2) Netlify or Cloudflare Pages by dragging in `dist/site`; (3) Pages from the engine repo, which forces D2. The page is one `index.html` plus six LUT files (about 5.7 MB in all), so any static host works. Do not declare `db` (rule 11).
2. **UI/UX pass: title shifts, folding away extra text (C38, with C19 and C21).** Scope it with Kwade before editing (which titles, which text goes behind a disclosure). Back each change against `rules-pack.zip` (checklist, tool profile `tools/palette-engine.json`) and Material 3 mechanics; cite the guidance and flag any deviation (see "Material 3 mechanics used" above). Do not change the matcher tie-break or the color-word bands (D34, D35). After any change to `web/app.js` the CI run is part of the check, and the page must be rebuilt and redeployed.
3. **A short, conversational explainer of what the tool does and gives you**, for explaining it to people without the data explorations. Write in Kwade's voice per `Kwade_Joslin_Voice_Reference.md` (personal writing: flowing paragraphs, no headers, bold or bullets; check the file for the professional version). Facts to draw on: six print conditions in two regions (D38); seed from words or a color, then evidence-ranked suggestions with accessibility beside each; palette and roles with Material tones; WCAG checks as the export gate; print preview with CMYK and ink totals per condition; exports (project file, Forge and W3C tokens, CSS, Markdown, ASE, PDF sheet). Every claim must stay inside what the tool states about its own evidence tiers; the ASE is not yet tested in Adobe (C7) and spot matching is not verified against a Pantone guide (C6).

**Do not redo:** the print-limit and "cool" weight work (C31, C34 closed, CI green); the Build Spec Doc update (done 2026-10-13); the Project cleanup (zip duplicates removed by Kwade).

**Small leftovers (not goals):** C39 (decisions-log header), C40 (`Palette Engine.zip` in the Project), optional C10 brand reruns for "cool", "cold" or "crisp", and an optional cross-document consistency audit of the Build Spec and Phase 0 to 5 results against D38 to D43 (best on Opus). For model routing: Sonnet for file work and the explainer draft; Opus for any color or engine math and for the audit.

## Starting a new session

**State on 2026-10-13 (pe-update51; the paragraph below is older and records how it got here).** Everything through pe-update49 is committed and the GitHub Actions run ("engine-and-browser") is green. The FOGRA39 file's ink limit is 260% (D43) and the "cool" weights are cyan 0.83, blue 0.80, purple 0.55, neutral 0.38, green 0.35 (D40 to D42). The live page is version 14. `engine/test_sheet.mjs` runs only in CI, so after any change to the PDF text, read the CI run too. The Build Spec Doc in the claude.ai Project carries dated notes for these changes. **Older state (pe-update44).** The tool has six print conditions in two regions (D38). North America: GRACoL 2013 coated (default), SWOP 2013, GRACoL 2013 uncoated. Europe: PSO Coated v3 (FOGRA51), PSO Uncoated v3 (FOGRA52) and a FOGRA39 file ("Coated FOGRA39L (VIGC 260)", from the ICC Profile Registry, provider VIGC; C23 closed 2026-10-13). pe-update38 added one script (`build/measure_cmyk_rounding.py`) and pe-update39 and 40 are docs only (C25: Xin et al. 2004 read; C22: ECI answered that derived tables need no permission while its profiles are not distributed). pe-update41 changes the page footer text (the FOGRA39 file's registry notice and a credit to ECI, C30) and adds one end-to-end check, so the end-to-end suite should now report 72 checks; the test state below describes the tree before pe-update41 and 42; see the sentences after this one for what was observed after them. It also records the C25 decision (D40: grays may rank as cool). pe-update42 makes that change (C33): the "cool" row gains a neutral weight of 0.38 in both lexicon files, `engine/matcher.js` treats neutral points as true grays (D41) and compares the minimum seed gap with a tolerance, and `engine/test_matcher.mjs` has four more checks. Kwade ran `test_matcher.mjs` and `build/test_lexicon.py` (ALL PASS) and reported that the rest of the suites passed too; he committed and pushed pe-update42 (C30 and C33 closed in pe-update43). `test_sheet.mjs` still cannot run on his machine (no qpdf), and the end-to-end count (72 expected) was not reported in numbers. The script measured the share of rounded CMYK identical to direct conversion for all six tables (C32, done): 84.81 / 83.91 / 81.94% for the US three (as in Phase 1) and 81.25 / 77.05 / 83.18% for PSO Coated v3, PSO Uncoated v3 and the FOGRA39 file. On 2026-10-13, on Windows after the C27 footer change, every engine suite passed except `test_sheet.mjs` (it needs poppler-utils and qpdf, which that machine lacks), the export UI suite passed 43 checks, the end-to-end suite 71 (it was 69 before the footer change), and `python build/test_lexicon.py` passed. CI then showed a green check (Kwade, 2026-10-13; the commit and log were not looked at). The earlier record of 595 checks, 70 of them in the browser (pe-update33), does not describe the repo: its source had no pe-update33 footer sentence or check until commit 6ecc425. The overall total has not been recomputed. Work is delivered as `pe-updateNN.zip` packages (changed files only) with a summary file and a commit message; Kwade applies and commits them from his own tree, and the working copy here never pushes.

**Read in this order:** `TO-CONFIRM.md` (the one open list), `docs/07-decisions.md` (D33 to D40 are the recent ones), `docs/phase-log.md`, then this file. In the claude.ai Project, `claude/project-file-index.md` says which copy of each document is canonical.

**What is waiting, and on whom**

| Waiting on | Items |
| --- | --- |
| Kwade, hosting choice (C36) | Which host, and whether the engine repo goes public (D2). |
| Kwade, when the repo is ready | C24: send the repository and usage notes to PRINTING United Alliance, after D2 (public or not) is decided. |
| The Ou & Luo authors | C1, C2 (asked 2026-10-01; no reply yet). |
| A screen-reader session | C18, C20 (re-test), then C19 (step navigation), then C21 (reading load). |
| Equipment Kwade does not have | C6 (Pantone guide), C7 and C8 (Adobe). |
| Kwade's judgment, deferred on purpose | C10 (seed quality on the live page), C15 (the near-synonym chip, not yet seen by him), C13 (stays open). |
| Kwade, to do next | Apply and commit pe-update50 and pe-update51 (both docs only). Then start the new session with the goals in "Next session: goals and options" (C36 to C38). Nothing else is waiting on a test. |

**Decisions that need Kwade before anything changes:** the matcher tie-break and the color-word bands (D34, D35) are not changed without asking. Brand data comes from published sources only. No researcher or contact email addresses go in the repo.

**Not done, and why**
- The live page (https://claude.ai/artifact/UU1bGD978nRCUUiFcbfnhN) was republished on 2026-10-13 (version 12) from Kwade's `npm run page` output (dist/site: index.html 775 KB and six LUT files, zipped by Kwade). The built file was checked for the ECI credit, the VIGC notice, the neutral 0.38 weight on "cool", the footer sentences and all six table files; the live page itself was not opened in a browser from the session that published it. Republish again after any change to `web/app.js`, the lexicon or the tables. The live page was republished again (version 13) with the pe-update46 weights (purple 0.55, green 0.35); it was republished once more (version 14) with the 260% FOGRA39 limit from pe-update47.
- The ASE has no groups for SWOP or the European conditions (two GRACoL groups, spec section 7).
- `Palette Engine.zip` in the Project was replaced on 2026-10-13 with a zipped `dist/site` with six print conditions; whether it includes the 260% FOGRA39 limit from version 14 is not confirmed (C40).

**Housekeeping each update.** Zip of changed files (`git diff --name-only HEAD~1 HEAD | zip -q tmp/pe-updateNN.zip -@`), a summary file, a commit message ending with the attribution lines the session gives, refreshed `palette-engine-repo/` copies in the Project with the "Repo copy as of" header, an `update-log.md` entry, and the file index "as of" notes.

## Open items

See [`TO-CONFIRM.md`](../TO-CONFIRM.md). Not repeated here so there is one list.
