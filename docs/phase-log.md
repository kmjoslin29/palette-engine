# Phase log

A record of each phase: what it did, what passed, and what it found. The build spec's phase table is the plan; this is what happened. Numbers are from the test
runs at the time.

## Phase 0: Verify (Opus)

Resolved: culori 4.0.2 (MIT: CIEDE2000, gamut mapping, Machado CVD filters), material-color-utilities 0.4.0 (Apache-2.0; needs bundling), apca-w3 0.1.9 (Limited W3
License: web contrast only), LittleCMS available. Tested that Material's primary role is tone 40 (light) and 80 (dark) in both specs, so the brand hex must stay a
separate token. Tokens Studio object colors were still "in discussion", so hex strings stay the default token form. The Ou & Luo equations were found in an open-access
paper. **No openly licensed Pantone Lab dataset exists**, so none is bundled: the designer pastes their own values. The ICC profiles could not be fetched from the cloud
workspace and were downloaded by Kwade.

## Phase 1: Python build step (Opus)

Built 33³ lookup tables for the three profiles with LittleCMS called in double precision (Pillow's ImageCms is 8-bit only). Against LittleCMS on 10,000 random + 500
near-gray + 500 gamut-edge colors (seed 20260928), printed ΔE2000 p95 / max: GRACoL coated 0.14 / 0.73, SWOP 0.15 / 0.71, GRACoL uncoated 0.14 / 0.73 (limits 1.0 / 2.0).
Rounded CMYK identical for 82–85%, off by one for most of the rest. The 49-step alternative was ~91% identical but ~9.4 MB against ~2.9 MB, so 33 stays (Kwade).

## Phase 2: Core engine (Opus for LUT and spot scorer, Sonnet for the rest)

Part A: the JavaScript lookup equals Python on 3 × 11,000 colors; culori's Lab D50 agrees with LittleCMS to ΔE00 0.004; ΔE2000 matches colour-science (1,150 pairs) and
the Sharma, Wu & Dalal pairs. **Found:** culori's built-in ΔE2000 converts to D65 (up to 26 ΔE00 error on D50 input), so all ΔE goes through `de.js`.
Part B: hex → OKLCH → hex exact for 10,000 colors; `#00FF00` flags out of print gamut on GRACoL coated (ΔE00 16.0); neutral grays stay in; `#767676` on white is 4.54:1
(pass), `#777777` is 4.48:1 (fail).

## Phase 3: Lexicon (Opus drafts, Kwade approves)

48 terms (18 perceptual, 20 brand-personality, 10 emotion), each with sources and a tier; the build rejects any row without both. Kwade reviewed every row (approve, edit,
drop). Decisions: brand-personality weights keep only p < .05 results read identically twice; "cool" gains a hue lean from Ou's own term; "calm" uses Ou's passive pole;
emotion weights were rebuilt from the raw survey data with one stated rule and reproduce all 14 published figures; hue families and the color-word bridge approved, blue
band to revisit.

## Phase 4: Palette logic and interface (Sonnet)

Harmony lenses, Material 3 tonal palettes and 29 roles (equal to the library's reference scheme for three seeds, light and dark; four seeds pass AA in both), the descriptor
matcher, and the interface with locks, overrides, rationale notes, filters and gating. **Found and fixed:** the gamut-mapping helper returned black for out-of-sRGB
colors (the older test only checked "valid hex"); two matcher drafts passed tests while returning near-black seeds. Browser checks: both paths, dark theme, phone width, touch
targets, and an automated WCAG AA audit of every text element (found and fixed one 4.27:1 sample). New rule from Kwade: evidence and accessibility side by side on every
suggestion, ranked by evidence, never silently re-ranked.

## Phase 5: Exports (Sonnet)

Seven outputs from one model, each parsed back by an independent reader; the Export step; project save and open; the `downloads` capability. 135 export checks, 30 ASE, 50 project,
53 PDF sheet, 27 file-handling, 43 browser checks. **Found:** the viewer's download allow-list excludes `.css` and `.ase` (zipped there); PDF standard fonts limit characters;
a redraw re-entrancy bug. **Not met:** the ASE has not been opened in Adobe apps. After review the export labels were renamed to plain language (D30 in the decision log).

## Phase 6: Validation (Sonnet; Kwade runs the spot-check)

Shared browser-test harness; a 48-check end-to-end suite covering both entry paths and every step in light and dark at two widths (zero console errors, page errors or failed
requests; WCAG AA text contrast; accessible names; keyboard focus ring; reload; blocked and hostile storage). A fictional sample brand with all outputs, rebuilt by a script and
checked by a test so it cannot go stale. **Found and fixed:** work changed in the last 400 ms before closing the page was not saved. **Not yet done:** the Pantone spot-check
(see [the protocol](spot-check-protocol.md)).

## Phase 7: Repository

Repository structure, this documentation, a continuous-integration workflow, and a clean-clone check (install and run every test from a fresh copy).

## 2026-10-06: European print conditions (D38, pe-update29)

Added PSO Coated v3 (FOGRA51), PSO Uncoated v3 (FOGRA52) and a supplied FOGRA39 file as tables 4 to 6. All pass the D4 limits (printed ΔE00, 10,000 random + 500 near-gray + 500 gamut-edge, seed 20260928): PSO coated p95 0.15 / max 0.99, PSO uncoated 0.14 / 0.70, FOGRA39 file 0.14 / 0.74. The first three tables rebuilt byte-identical. JavaScript and Python lookups agree on 11,000 colors per profile.

## 2026-10-07: Sanad (2017) added as a context reference (D39, C25, pe-update33)

Kwade supplied Sanad (2017), a literature review on the factors that affect color meaning and emotional response. It is recorded as a secondary context source in `docs/03-method-and-evidence.md` and supplies no number to the lexicon or the matcher. The page footer gains one sentence saying the findings are averages across the people studied and that age, culture, design training and setting can shift how a color is rated. The review's one disagreement with a checked source (hue in warm-cool, Gao & Xin 2006 against Ou et al. 2004) is the new open item C25; Kwade is looking for the primary papers.

## 2026-10-13: Two papers reviewed and the Ou et al. (2004) source note widened (C26, pe-update34)

Karthikeyan & Joy (2018), supplied 2026-10-09, was read in full and recorded as reviewed, not used (`docs/03-method-and-evidence.md`). It pointed to two sources worth reading, which are the new open item C26 (Deng et al. 2010; Elliot 2015 with Elliot & Maier 2014). Ou et al. (2004) Part I was re-read against the project record on 2026-10-11: X11 stands, with no equation or code change. Two additions came out of it: the `ou2004` scope note in both lexicon files now records the observers' color-science training, the patch and scoring method, the five-region culture-independence claim for the four modeled scales, and the unstated CIELAB white point; and C25 gains the Tables VIII-X comparison of the Ou, Sato and Xin & Cheng warm-cool models. Note text and docs only. Nothing in code, tiers, weights or page behavior changed, so no republish is needed.

## 2026-10-13: Four papers read and recorded (C26 closed, C27 opened, pe-update35)

Kwade supplied open copies of Deng et al. (2010), Elliot (2015), Elliot & Maier (2014) and Valdez & Mehrabian (1994), and they were read. Deng et al. joins the hue-similarity row as a converging source with the tier held, and is cited in the classical-geometry row as support for emphasis roles. Elliot (2015) and Elliot & Maier (2014) are recorded as reviewed with no number used, beside Sanad (2017). Valdez & Mehrabian is recorded as corroboration only. C26 is closed; C25 gains the Valdez & Mehrabian outcome and two further candidates (Suk & Irtel 2010; Na & Suk 2014, which is not the Suk & Irtel paper); the new item C27 covers one footer sentence about controlled stimuli, which is decided; the edit to `web/app.js` and two checks in `web/test_e2e.mjs` were prepared the same day as a separate package, not yet run. Suk & Irtel (2010) is cited from its abstract only until the paper is obtained (C28). Docs only. Nothing in code, tiers, weights or page behavior changed.

## 2026-10-13: C27 closed and the tests run on Windows (pe-update36)

The footer edit for C27 (`web/app.js`) and its two checks (`web/test_e2e.mjs`) were applied and the suites run on Kwade's Windows machine. The engine suites passed except `test_sheet.mjs`, which could not run there (poppler-utils and qpdf are missing; new item C29). The export UI suite passed 43 checks and the end-to-end suite 71; `test_lexicon.py` passed. Running on Windows exposed paths in the test and build scripts that only worked on Linux (a file URL turned into a path with `.pathname`, and a Windows path inside a Python string); those were fixed in a separate commit and are not part of this package. `engine/HANDOFF.md` gains a short section on running the tests on Windows. Docs only in this package.

## 2026-10-13: CI green, C29 closed, Suk & Irtel read, test counts corrected (pe-update37)

Kwade reported a green CI check on GitHub, which closes C29 (the PDF sheet test could not run on his Windows machine; CI runs it on Linux). `git show 6ecc425 --stat` showed 4 insertions and no deletions, so the repo's `web/app.js` and `web/test_e2e.mjs` did not have the pe-update33 footer sentence or its check before the C27 commit. The pe-update33 record of 70 browser checks and 595 in all therefore did not describe the repo; its end-to-end suite had 69 checks before and has 71 now. `engine/HANDOFF.md` and the C27 row in `TO-CONFIRM.md` say so. Docs only.

Kwade also supplied Suk & Irtel (2010) and it was read in full, which closes C28. It is recorded in `docs/03-method-and-evidence.md` as corroboration only: chroma related positively to valence, arousal and dominance, hue effects were small, tone effects larger, and ratings did not differ significantly between paper and screen. The abstract's "r > 0.60" for chroma does not match the body (.54 and .45 for arousal and dominance), so the body is cited. No row, tier or number changed.

## 2026-10-13: FOGRA39 file identified, rounded CMYK measured for all six (C23, C32; pe-update38)

The FOGRA39 file is the ICC Profile Registry's `Coated_Fogra39L_VIGC_260.icc` (provider VIGC, copyright X-Rite, TAC 260% on the registry page while the tables reach 265.4%). Its terms allow use and sharing, not alteration or sale; the registry notice was judged enough (C23 closed; C30 and C31 opened). `build/measure_cmyk_rounding.py` was added and run on Windows with LittleCMS 2.19: rounded CMYK identical to direct conversion 84.81 / 83.91 / 81.94% for the US three (Phase 1 reproduced exactly), 81.25% for PSO Coated v3, 77.05% for PSO Uncoated v3 and 83.18% for the FOGRA39 file; off by 2 or more 0.04 / 0.25 / 0.22%, at most 3 points (C32 closed). Docs plus one script; no engine, page or data change.

## 2026-10-13: Primary papers on warm-cool and hue read (C25; pe-update38 and 39)

Gao & Xin (2006), Gao et al. (2007), part of Cheng's (2002) thesis and Xin et al. (2004) were read and recorded in `docs/03-method-and-evidence.md` ("Warm-cool and hue"). Hue matters for warm-cool, less than chroma, so the direction of the "cool" lean holds. Xin et al. (2004) covers three regions; pe-update38 had called it a four-region study and pe-update39 corrected that. Docs only.

## 2026-10-13: ECI answered, notices and credit added, grays allowed (C22, C30, D40; pe-update40 and 41)

ECI's chairman replied that tables derived from the PSO profiles need no permission while the profiles themselves are not distributed, and that attribution would be appreciated (C22 closed; the email is kept privately). `NOTICE.md`, `docs/08-data-and-licences.md` and the page footer now carry the FOGRA39 file's registry notice and a credit to ECI, and `web/test_e2e.mjs` has one more check; the tests had not been run when this was written (C30 stays open until they are). Kwade decided that grays may rank as cool (D40, which reverses the "cool" part of D19); the lexicon and matcher change is C33 (made in the next entry).

## 2026-10-13: Grays allowed in "cool" (C33, D40, D41; pe-update42)

Three options were run on Kwade's `matcher.js` and `lexicon.json` and he chose option C. The "cool" row gains `neutral: 0.38` in `hueWeights` (cyan 0.83, blue 0.80, purple 0.25 and green 0.13 unchanged), in both `lexicon/lexicon_draft.json` and `data/lexicon.json`; the row's rule, notes and Kwade note say so. In `engine/matcher.js`, neutral-family points are treated as true grays when seeds are chosen (the default distance target for chroma is 0 for the neutral family, and gray points count as chroma 0 when picking variants), and the 0.05 minimum gap is compared with a 1e-9 tolerance, because lightness steps of exactly 0.05 differ by 0.04999… in floating point and a gray-only range lost its third seed to that. Over all 1,176 single and paired queries of the 48 terms, 59 queries gave different seeds: 41 involve "cool" (a gray seed is added in the third place), 17 involve "neutral" (true grays instead of tinted ones; "cool, neutral" went from no seeds to three grays) and one is "hard, light" (a third gray). No query gave fewer seeds. `engine/test_matcher.mjs` replaces the "not gray" check with four checks (order of families, a true gray, "cold" and "crisp" equal "cool", range-only gray queries return three or more true grays). The comparison and the test file ran on a stand-in for `color.js` and `harmony.js`; the full suites are Kwade's to run (`npm test`, `python build/test_lexicon.py`). The page needs republishing for the new lexicon.

## 2026-10-13: Tests passed and pe-update41 and 42 committed; C30 and C33 closed (pe-update43)

Kwade ran the matcher suite and `build/test_lexicon.py` (ALL PASS) and the engine suites up to `sheet`, which cannot run on his machine (no qpdf); he then ran the rest (`files`, `example`, `tokens` and the browser suites), reported that everything passed, and committed and pushed pe-update42, which includes pe-update41. C30 (footer notice and ECI credit) and C33 (grays allowed in "cool") are closed. While adding D40 and D41 he found that D39 is missing from `docs/07-decisions.md` (C35). The page is still not republished; it waits on the built page from `npm run page`. Docs only.

## 2026-10-13: Page republished with six print conditions (pe-update44)

Kwade ran `npm run page` (dist/site: index.html 775 KB plus six LUT files) and supplied the folder zipped. The built page was checked for the ECI credit, the VIGC registry notice, the neutral 0.38 weight on "cool", the two footer sentences and all six table files, then published to the existing artifact (version 12), replacing the version that had three tables. The live page was not opened in a browser from that session. Docs only.

## 2026-10-13: Live page checked; decisions log complete (pe-update45)

Kwade opened the republished page: the footer notices (with the VIGC registry notice and the ECI credit) look right, and the "cool" seeds show as expected on the cards: #808080 neutral (score 0.38), #7A77BA purple (0.25) and #668E4F green (0.13), after the cyan and blue seeds. He replaced `Palette Engine.zip` in the Project with the zipped `dist/site`. He pasted the D39 row into `docs/07-decisions.md` (C35 closed) and attached the file; D1 to D41 are all present. He did not know how to read the end-to-end count (72 expected); it is the last line printed by `npm.cmd run test:web`.

## 2026-10-13: Purple and green weights of "cool" raised (C34, D42; pe-update46)

Ou's mean cool score per hue family was recomputed on two grids (L 0.30 to 0.85 and L 0.50 to 0.70, C at least 0.08, in-gamut sRGB, each family's OKLCH hue band). Purple (0.81 to 0.84), green (0.52 to 0.53), neutral (0.50) and magenta (0.21 to 0.24) reproduced the earlier figures; blue (1.19 to 1.24) and cyan (1.12 to 1.17) did not (earlier 1.05 and 0.97), so those weights were left alone. Three options were run over all 1,176 single and paired queries on the pe-update42 matcher: A (no change), B (purple 0.55, green 0.35: 46 queries changed, all with "cool", 11 changed their set of families, none lost a seed) and C (also cyan 0.78, neutral 0.34, magenta 0.15: 47 changed, 28 changed their family set, blue above cyan). Kwade chose B. `lexicon/lexicon_draft.json` and `data/lexicon.json` (regenerated with `build/build_lexicon.py`, which reproduces the pe-update42 file byte for byte before the edit) carry the new weights; `engine/test_matcher.mjs` expects the order cyan, blue, purple, neutral, green. In the sandbox (stand-in `color.js` and `harmony.js`) the matcher suite and `build/test_lexicon.py` both pass; neither has been run on Kwade's machine, and the live page still carries the old weights until it is rebuilt and republished. The `lime #5aa61b` example in D42's limits is the seed "cool, bold" offers for green.

## 2026-10-13: Page republished with the C34 weights; FOGRA39 limit set to 260% (C31, D43; pe-update47)

Kwade applied pe-update46 and sent the zipped `dist/site` from `npm.cmd run page` (the first try, `npm run page`, was blocked by the PowerShell execution policy). The built file carries the new "cool" weights (purple 0.55, green 0.35) and the six tables are byte-identical to those published before; it was published to the existing artifact as version 13. Kwade did not say whether he ran the pe-update46 tests. For C31 he chose option 2: `tac_limit` is 260 for the FOGRA39 file in `build/build_luts.py`, `data/lut_fogra39_vigc260.json` and `data/accuracy_report.json` (the table numbers are unchanged), and the card text in `engine/project.js` now says the file states no limit but its ICC registry page lists 260%. Before the change, 7 of 35,937 grid points were over 260% (all very dark saturated blues, worst 265.4% at #080040); about 0.01% of random sRGB colors. Checked in headless Chromium on a copy of the built page patched the same way: seed #B5532A shows "Total ink 181% of a 260% limit, Within limit" and the table row reads "/ 260%"; seed #080040 shows "265% of 260%, Over limit"; no "states no ink limit", no null or NaN, no page errors. `web/test_e2e.mjs` has two checks rewritten to match (still 72 in all). The repo's own suites were not run in the sandbox; the example outputs under `examples/fernhill-bakery/` and any other test that expects "no limit stated" for FOGRA39 have not been seen (see the C31 row).

## 2026-10-13: C31 test fixes and example regeneration; page version 14 (pe-update48)

Kwade applied pe-update47 and ran the suites. `test:web` passed 72 of 72. `npm.cmd test` stopped at `test_analyze` with two failures (the checks that the FOGRA39 file states no limit); run one by one, `test_export` had one failure (the Markdown check for "no limit stated"), `test_example` five (committed tokens, W3C tokens, color spec, spec-sheet PDF and zip held the old FOGRA39 text), and `test_ase` and `test_files` failed only because plain PowerShell has no `unzip` (they pass under Git Bash). The same `npm.cmd test` run showed the matcher suite passing with the new "cool" seeds (cyan, blue, purple, gray, green). pe-update48 rewrites the three stale checks: `test_analyze` (FOGRA39 limit 260; its total-ink text reads "N% of 260%"; a condition with no limit would still read "no limit stated"; the near-black check now needs a limit for every condition) and `test_export` (the FOGRA39 row reads "N% of 260%"). The analyze test was run in the sandbox against the engine bundled in the built page: the original fails the same two checks, the fixed file passes all 20. The export predicate was evaluated on the real Markdown output of that engine. Kwade regenerated the example with `node build/make_example.mjs` (it wrote into the repo folder without trouble) and `test_example` then passed; `test_ase` and `test_files` passed under Git Bash. The page built from the repo with all of this was published as version 14. Still to run on his machine: `test_analyze`, `test_export` (after pe-update48) and `build/test_lexicon.py`.

## 2026-10-13: CI failure in the PDF sheet test fixed (C31; pe-update49)

Kwade committed and pushed pe-update48 with the regenerated example. GitHub Actions ("engine-and-browser") failed in `engine/test_sheet.mjs`, with 3 failures of one check (line 55, run for cases A, B and C): the check required the PDF text to contain "no limit stated" for the FOGRA39 file, which D43 removed. That suite needs poppler-utils and qpdf, which the CI runner installs and Kwade's Windows machine lacks, so it could not fail locally; I had said so but had not thought of this expectation when I listed the stale tests in pe-update47. All other checks in the file passed in CI.

The PDF is correct. A PDF built with `buildSpecSheetPdf` from the engine inside the built page prints the FOGRA39 row as "151% of 260%", and plain `pdftotext` output contains no "no limit stated", "of null%" or "of undefined%". The check now computes the expected text for every color (`PE.tacText` on the FOGRA39 analysis, which must match `N% of 260%`) and requires it in the PDF text, keeps the Europe and PSO Coated v3 checks, and requires that "no limit stated" appears nowhere. Checked here on the one-color default project: every predicate is true on the real PDF text. Cases A, B and C use `export_fixtures.mjs`, which I do not have in the sandbox, so I could not run the whole suite; CI is the real test. CI stops at its first failing suite, so `files`, `example`, `tokens` and `test:web` have not yet run there on this change.

## 2026-10-13: pe-update49 passes CI; C31 and C34 closed (pe-update50)

Kwade committed and pushed pe-update49 and reported GitHub Actions green. With his earlier reports (`test_analyze`, `test_export` and `test_lexicon` ALL PASS, `test:web` 72 of 72), C31 (FOGRA39 limit 260%, D43) and C34 (purple 0.55 and green 0.35 for "cool", D42) are closed. The matcher change is not rerun against the C10 brand list; that stays optional under C10. The Build Spec Doc in the claude.ai Project (tab "Build spec v1", rev 25 since 2026-10-04) was brought up to date the same day: a status note under the byline, D38 and D43 notes in sections 1, 2, 4, 7 and 9, a note before section 11, a pointer in section 16 to the later "cool" weights, and the architecture diagram now reads "6 ICC profiles: 3 US, 2 PSO, 1 FOGRA39". Sections 11 to 18 are kept as written. Docs only; no code changed.

## 2026-10-13: Next-session goals recorded (pe-update51)

Kwade's next steps are a UI/UX pass (title shifts, folding away extra text), a short plain-language explainer of what the tool does, and a way to use the tool online without GitHub, scripts or a terminal. `engine/HANDOFF.md` now has a "Next session: goals and options" section, and `TO-CONFIRM.md` has five new rows: C36 (hosting), C37 (browser download fallback outside claude.ai), C38 (the UI/UX pass, with C19 and C21), C39 (decisions-log header at the source) and C40 (`Palette Engine.zip` in the Project). On hosting, Anthropic's help pages disagree on whether people without a Claude account can open a shared artifact, and view-only viewers cannot use `downloads` buttons, so the artifact link is not treated as a public route; a static host is the option to settle. Nothing was decided. Docs only; no code changed.
