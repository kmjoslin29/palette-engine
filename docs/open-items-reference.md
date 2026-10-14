> Repo copy as of pe-update57 (2026-10-14; delivered as pe-update57.zip; pe-update52 to 56 are committed, CI is green and the page is live). The repo is authoritative; this copy goes stale until refreshed after the next update. docs/07-decisions.md in the Project has D1 to D43: D1 to D41 match the repo file Kwade attached on 2026-10-13, and D42 and D43 (pe-update46 and 47) are committed.

# Open items: a working reference

A plain-language guide to every open item in [`TO-CONFIRM.md`](../TO-CONFIRM.md): what it is, why it matters, what you need, the steps, and how to
record the result. Items are ordered by how soon you can act on them. None of them stops the tool from working; each one limits what the
project can honestly claim.

How results get recorded: change the item's row in `TO-CONFIRM.md` (move it to the Done table with the date), update any file named in the item,
run `npm test`, and commit.

## At a glance

| ID | What | Needs | Effort | Blocks |
| --- | --- | --- | --- | --- |
| C24 | Send PRINTING United Alliance the repository and the live page (public since 2026-10-14) | Nothing | A short email | Nothing |
| C10 | Review the matcher's constants | Real use | Ongoing | Nothing |
| C15 | Look at the "near-synonym, tier lowered" chips on the live page (the 27 strong synonyms were reviewed and agreed 2026-10-01) | The live page | 10 minutes | Nothing |
| C13 | Screen-reader session | A screen reader (NVDA is free) | 1–2 hours | Nothing |
| C1 | Which version of the lightness-sum equation is right | A later paper or the authors | Unknown | Nothing (score is advisory) |
| C2 | EC constant (−2) in the Ou & Luo model | A second implementation or the authors | Unknown | Nothing |
| C3 | Ou & Luo independent test (r = 0.75) | The authors' raw scores | Unknown | Nothing |
| C6 | Pantone spot-check | A Pantone guide, daylight or a booth | Half a day | Nothing |
| C7 | `.ase` in Adobe apps | A device with Illustrator or InDesign | 30 minutes | `ASE_TESTED_IN_ADOBE` stays false |
| C8 | Adobe's color engine against LittleCMS | An Adobe app | 1 hour | Nothing |

---

## C5 (closed 2026-10-06). IDEAlliance and the derived tables

PRINTING United Alliance answered on 2026-10-01: yes, with their notice included. See `TO-CONFIRM.md` (Done) and `NOTICE.md`.

## C22 (closed 2026-10-13). May the tables derived from the ECI profiles be published?

Yes. ECI's chairman answered on 2026-10-13: as long as ECI's ICC profiles are not distributed as such, no license or other permission is needed, and attribution would be highly appreciated. The reply is kept privately by the maintainer; see `TO-CONFIRM.md` (Done). The profiles themselves still must not be distributed (no `.icc` file in the repo), and the attribution is part of C30.

## C23 (closed 2026-10-13). The FOGRA39 file

It is the ICC Profile Registry's `Coated_Fogra39L_VIGC_260.icc` (provider VIGC, copyright X-Rite). Its terms allow use, embedding, exchange and sharing without restriction and forbid alteration or sale without VIGC's written permission; you decided the registry notice is enough. See `TO-CONFIRM.md` (Done), with the removal steps kept there in case they are ever needed.

## C30 (closed 2026-10-13). The FOGRA39 file's registry notice and the ECI credit

The footer's "Print profile notices" carries the registry notice, a "Credit." paragraph names ECI for the PSO tables, `NOTICE.md` and `docs/08` say the same. Tested and committed; see `TO-CONFIRM.md` (Done).

## C31 (closed 2026-10-13). Ink limit for the FOGRA39 file (D43)

The page uses the 260% from the file's ICC registry page and says so on the card. A few very dark blues (7 of 35,937 grid points, about 0.01% of random colors) come out of the profile above 260% and show as over the limit. Tested, committed and green in CI; see `TO-CONFIRM.md` (Done).

## C24. Send PRINTING United Alliance the repository

They asked for it once it is ready, to share with members. The repository is public (D2 closed 2026-10-14) and the page is live at https://kmjoslin29.github.io/palette-engine/; Kwade is sending both. A short reply is drafted (the drafts are kept privately, outside the public repository).

## C25 (closed 2026-10-13). Does hue matter for warm-cool?

All the primary papers were read (Gao & Xin 2006; Gao et al. 2007; Cheng 2002 in part; Xin et al. 2004, three regions). The 2006 paper's "no hue effect" cannot see a cosine-shaped effect, and the same team's seven-region study finds hue affecting warm-cool in every region. The direction of the "cool" lean holds. All four sources rate grays and low-chroma colors cool, and Kwade decided grays may rank as cool (D40, reversing the "cool" part of D19). Record: "Warm-cool and hue" in `docs/03-method-and-evidence.md`; the change itself is C33.

## C33 (closed 2026-10-13). Grays allowed in "cool"

Option C: `neutral: 0.38` on the "cool" row and true-gray seeds in the matcher (D40, D41). Tested and committed; see `TO-CONFIRM.md` (Done).

## C34 (closed 2026-10-13). Purple and green weights of "cool" (D42)

Purple 0.55 and green 0.35 (from 0.25 and 0.13); nothing else changed. Tested, committed and green in CI; see `TO-CONFIRM.md` (Done).

## C26 (closed 2026-10-13). Deng, Elliot and Valdez & Mehrabian

Read and recorded; see `TO-CONFIRM.md` (Done) and `docs/03-method-and-evidence.md`. No tier or number changed.

## C27 (closed 2026-10-13). The controlled-stimuli sentence on the page

Added to the footer in `web/app.js` with two checks in `web/test_e2e.mjs`; see `TO-CONFIRM.md` (Done). The live page was republished on 2026-10-13 (see `engine/HANDOFF.md`).

## C28 (closed 2026-10-13). Suk & Irtel (2010)

Read in full and recorded as corroboration only; see `TO-CONFIRM.md` (Done) and `docs/03-method-and-evidence.md`. No tier or number changed.

## C29 (closed 2026-10-13). The PDF sheet test and CI

`engine/test_sheet.mjs` needs poppler-utils and qpdf, which the Windows machine lacks, so it did not run there. Kwade reported a green CI check afterwards (CI runs it on Linux). See `TO-CONFIRM.md` (Done).

## D2 (closed 2026-10-14). Make the repo public?

Done as a fresh one-commit repository, `kmjoslin29/palette-engine`, so no old history is public (the old clone is the private `palette-engine-archive`). The commit email is the GitHub noreply address, no `.icc` file is committed, and the correspondence with ECI and PRINTING United Alliance is in a git-ignored `private/` folder. The live page is https://kmjoslin29.github.io/palette-engine/. See `TO-CONFIRM.md` (Done: D2, C36, C37, C42).

## C9. The blue band of the color-word bridge (closed 2026-09-30)

Reviewed and left unchanged; see `TO-CONFIRM.md` (Done) and decision D20. It was not judged against real brand seeds on the live page, so if a blue
ever looks wrong there, reopen it as a new item.

## C14. Labrecque & Milne (2012) coefficients (closed 2026-10-06)

Checked against the printed tables; two missing results added and a separate royal-blue region for the "competent" words (D37). See `TO-CONFIRM.md` (Done).

## C10. Matcher seed-scoring constants

**What it is.** `engine/matcher.js` scores candidate seed colors with settings I chose, not settings a study gave: OKLCH lightness range 0.25–0.95,
15° hue steps, half-strength leans, and a 0.05 minimum OKLab gap between seeds.

**Steps.** Use the tool on three or four real brands (including yours). Where a suggestion feels wrong, note the seed, what you expected, and what
you got. Then bring those notes to me and we change one constant at a time, re-running `npm test` after each. Record accepted changes in
`docs/07-decisions.md`.

**Progress (2026-10-01).** Four runs against 21 published brands are in [`c10/README.md`](c10/README.md): rules fixed before each run, results in `c10/results*.md`, re-run with `node docs/c10/run.mjs [brand-set.json]`. No constant was implicated by the first run; the main finding was vocabulary coverage (C15, widened by D33). Dark colors were then offered (D34), kept inside the lightness the source study tested (D35). Run 4 added the National Park Service (colors eyedropped from its Arrowhead, so approximate). Update 2026-10-03: the synthesized word mappings were reviewed and all 36 kept (they stay speculative). Still to do: judge the seeds by eye on the live page (the dark seeds, the near-synonym chips and the beyond-tested note). Kwade is deferring the seed judgment on purpose until the other items are polished, so that it can be challenged.

## C12. The wording of the claude.ai viewer's save prompt (closed 2026-09-30)

Recorded in `TO-CONFIRM.md` (Done). The page's messages matched the viewer's behavior for the two cases seen.

## C13. Screen-reader session

**What it is.** The automated tests check contrast, accessible names and keyboard focus in Chromium. They cannot tell you whether the page makes
sense when read aloud, or whether the order of announcements is usable.

**What you need.** NVDA (free, Windows) with Chrome or Firefox, or Windows Narrator. Note which you used and its version.

**Steps.**
1. Open the page and start the reader. Move through with Tab only, then with the reader's heading and landmark commands.
2. Walk the main path: choose a seed, look at the palette, read a contrast result, trigger the override, export.
3. Note anything unannounced, announced twice, announced in a confusing order, or unreachable by keyboard.
4. A ready-made script and log are in [`screen-reader-session.md`](screen-reader-session.md).
5. Log each finding as a line in `TO-CONFIRM.md` (or a new item) with the reader and browser used, then we fix them. Label the result
   "screen-reader session, NVDA + Chrome", not "accessible": one session is one data point.

**Progress (2026-10-01).** One session run: NVDA 2026.2 with Firefox 157.0 (not Chrome). It mostly worked; four problems are logged as C18 to C21 in `TO-CONFIRM.md`, and the session is written up in [`screen-reader-session.md`](screen-reader-session.md). C13 stays open: other browsers and readers are untried.

## C1. Which lightness-sum equation is right (Ou & Luo 2006, Eq. 4)

**What it is.** The printed equation and the paper's own Fig. 6b disagree by about 0.11 rms, worst at low lightness sums (curve about −0.44 vs
about −0.26 from the equation). Figs. 4b, 8 and 10a match their equations, so only this one is in doubt. The code follows the printed equation.
An earlier conference version of the model uses different forms and cannot settle it.

**What would settle it.**
- A later paper that restates the model with its constants (the group's follow-up papers, or the chapter on color emotion and color harmony in the
  Handbook of Color Psychology; I have not verified that chapter prints the equation).
- The authors. Search for their current institutions and publications; a short, specific question ("Fig. 6b appears to sit below Eq. 4 at low
  lightness sums; is there an erratum or a different constant set?") is easy to answer.
- A university library or an interlibrary loan for the published version and any erratum, since Wiley is paywalled for you.

**If Fig. 6b turns out to be right.** Change `ls0`–`ls3` in `OU_LUO_K` (`engine/harmony.js`) to the fitted values (about 0.2023, 0.6484, −3.1851,
0.0258, or the authors' numbers), update the documented-gap check in `engine/test_ouluo.mjs` (it currently expects the printed constants to sit
0.07–0.16 rms from the figure), and update the note in `TO-CONFIRM.md`. Until then the score stays labeled **advisory**.

**Progress (2026-10-01).** Asked the authors in one email covering C1 and C2 (sent by Kwade; no reply yet). Save any reply in full under `docs/correspondence/` and ask their permission before committing it if it contains personal details. If there is no reply in a few weeks, send one polite follow-up; silence is not an answer.

## C2. The EC constant (−2)

**What it is.** EC = 0.5 + 0.5·tanh(−2 + 0.5C*) weights how strongly a color's hue effect counts, by its chroma. The paper has no figure for it, and the
range test cannot tell −2 from −2.5. The hue-curve constants were pinned by digitizing Fig. 10a (done).

**What would close it.** A second, independent implementation of the model, or the authors' data. Not something you can do alone; ask in the same
message as C1.

## C3. The independent test (r = 0.75)

**What it is.** The 2006 paper says its model correlated at 0.75 with a separate 30-pair data set (Gurura et al.). I read the source (AIC 2004,
pp. 239–242): it gives no per-pair scores and used many backgrounds, so the number cannot be reproduced. What is checked: the model ranks the 22
"harmonious" pairs above the 8 "disharmonious" ones (AUC 0.86; gray/brown is an inference from a footnote typo).

**What would close it.** The raw ratings from Gurura's experiment on the gray background. Ask the authors of the AIC paper (the paper prints contact
addresses for all three authors on p. 242, from 2004, so they may be out of date; take them from your copy of the paper, not from this repo).

**Progress (2026-10-01).** Re-read in the full proceedings volume: no per-pair scores are printed, and the 22/8 labels come from the paper's first experiment. See `TO-CONFIRM.md` (C3) for the detail. Still open.

## C6. Pantone spot-check

The full procedure is in [`spot-check-protocol.md`](spot-check-protocol.md); results go in [`spot-check-log.md`](spot-check-log.md). In short:
you need a physical Pantone guide (note its edition and year), daylight or a D50/D65 booth, and a display you trust. Pick 20 entries and 5 target
colors, paste 20 licensed values into the spot scorer, and compare by eye. Pass means every entry matches or has an explained offset, and the
tool's first choice agrees with yours (within one place) for at least 4 of 5 targets. The result is labeled "spot-checked (visual)"; only a
spectrophotometer reading may be called "measured". Do not change thresholds to fit the result. Until it is done, do not call spot-match results verified.

## C7. `.ase` in Adobe Illustrator and InDesign

**What you need.** A device with Illustrator or InDesign (a friend, a library, a school lab, or a trial).

**Steps.**
1. Take `examples/fernhill-bakery/output/fernhill-bakery.ase` (or export a new one from the page; the viewer gives it inside a zip).
2. Import it as swatches in each app.
3. Check: group names, color modes (RGB vs CMYK vs Lab as intended), color names, and that the counts match the Markdown spec.
4. If everything is right, set `ASE_TESTED_IN_ADOBE = true` in `web/app.js`, run `npm test`, and record the app versions in `TO-CONFIRM.md`.
   If not, record exactly what differed and bring it to me.

**Meanwhile.** You use Affinity. Opening the `.ase` there is a partial check; if you do it, log it as "Affinity, partial" in `docs/spot-check-log.md`
or `TO-CONFIRM.md` and leave the Adobe flag false.

## C8. Adobe's color engine against LittleCMS

**What it is.** The print tables use LittleCMS with relative colorimetric intent and black-point compensation. Adobe apps use their own engine
and may land about a point of CMYK away.

**Steps.** In an Adobe app with the same profile loaded (GRACoL2013_CRPC6, for instance), set the same intent and black point compensation on, convert a
few known RGB values to CMYK, and compare them with the tool's numbers. Record the differences. If they stay within about a point, say so in the accuracy
notes; if not, the page's "print preview" copy should say the numbers are LittleCMS's, not Adobe's.
