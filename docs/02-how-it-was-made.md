# 02 How it was made

This project was designed and directed by Kwade Joslin and built with Claude (Anthropic) in a single project workspace, over seven phases. This page
records the working method plainly, including what went wrong, because that is the useful part for anyone judging the result or repeating the approach.

## Who did what

| Kwade | Claude |
| --- | --- |
| Set the goals and constraints (US print, no Pantone license, evidence shown on every suggestion, Material Design 3 for interface mechanics) | Researched the evidence base and wrote the research foundation and build spec |
| Decided the open questions the spec listed, and reviewed every lexicon term (approve, edit, drop) | Drafted the lexicon (48 terms) with sources and tiers; wrote the code and tests for each phase |
| Approved thresholds and defaults, or changed them | Proposed defaults and labeled each one with its evidence tier and basis |
| Reviewed and approved the export formats, the extension namespace and the plain-language names of the outputs | Built the exports and checked each with an independent reader |
| Does the physical checks (Pantone guide, Adobe import) that a cloud workspace cannot | Said which claims were untested rather than implying they were checked |

Claude's work was checked by tests it wrote, by independent tools, and by Kwade's review. It was not checked by a second human developer.

## Models and phases

The build spec assigned each phase to a model according to how much rested on it (the table shows the assignment in the spec). Precision-critical numeric work went to the larger model; interface
and export work to the smaller.

| Phase | Work | Model | Gate |
| --- | --- | --- | --- |
| 0 Verify | Libraries, licenses, profiles, Pantone data, model coefficients | Opus | Every "verify" item resolved or dropped |
| 1 Python build step | Print lookup tables, accuracy report | Opus | LUT accuracy thresholds met for all three profiles |
| 2 Core engine | Color math, LUT lookup, gamut flags, spot scorer, checks | Opus for LUT and spot scorer, Sonnet for the rest | Spec pass conditions |
| 3 Lexicon | Hue families, 48 terms, review | Opus drafts, Kwade approves | Every shipped row sourced and tiered |
| 4 Palette logic and UI | Harmony lenses, tonal palettes and roles, descriptor matcher, interface | Sonnet | Both entry paths work end to end |
| 5 Exports | Seven outputs | Sonnet | Export checks pass; ASE opens in Adobe apps (**not yet met**) |
| 6 Validation | End-to-end suite, sample brand, spot-check | Sonnet; Kwade runs the spot-check | Zero console errors; spot-check logged (**spot-check not yet done**) |
| 7 Repo | Structure and documentation | Sonnet | This repository |

## Working rules that shaped the code

- **Every claim has a tier.** Research findings and design choices are labeled well-established, supported but contested, low confidence or speculative,
  and the interface shows the label.
- **Verify, do not assume.** Library behavior, licenses and standards were checked in the phase that used them (Phase 0 was only verification).
- **Tests must be able to fail.** Several checks were mutation-tested (break the code, confirm the test notices), and assertions that could not fail were removed.
- **Say what was not tested.** The ASE file and the real viewer save prompt are named as untested wherever they are mentioned.
- **The designer decides.** Generated colors are proposals. The tool records locks, overrides and reasons.

## What went wrong, and how it was caught

| Finding | Phase | How it was found | Outcome |
| --- | --- | --- | --- |
| culori's `differenceCiede2000` converts inputs to D65 first, giving up to 26 ΔE00 error on D50 input | 2 | Comparison against reference implementations | All ΔE goes through one wrapper (`engine/de.js`) that keeps D50 |
| Pillow's ImageCms is 8-bit only, too coarse to validate the tables | 1 | Accuracy report | The build calls LittleCMS directly in double precision |
| The gamut-mapping helper returned black for every out-of-sRGB color | 4 | An end-to-end look at P3 input; the earlier test only checked "is a valid hex" | Fixed with tests on lightness and hue drift |
| Two early descriptor-matcher drafts passed their tests while returning near-black seeds and unrelated-hue padding | 4 | Reading the actual seeds, not just the assertions | Tests now check the seeds themselves |
| Automated extraction of regression coefficients from one paper gave two different reads | 3 | Two independent extractions disagreed | Only results significant at p < .05 and read identically twice were kept |
| Reconstructed harmony-model constants disagreed between two reads of the paper | 4 | Second read | Shipped as "Advisory · constants unverified"; resolved 2026-09-29 when Kwade supplied the paper (all equations matched) |
| A text-contrast check found the "outline" role sample at 4.27:1 | 4 | Automated contrast audit of every text element | UI pairs drawn as bordered boxes |
| Saved-project loading would have trusted untrusted JSON | 5 | Design review, then hostile-file tests | Loading rebuilds state from allowed keys and refuses with reasons |
| The viewer's download allow-list excludes `.css` and `.ase` | 5 | Reading the capability's contract | Those two are saved inside a `.zip` in the viewer |
| A focused field removed during a redraw re-entered the renderer and threw | 5 | Browser tests | Re-entrancy guard added |
| A change made within 400 ms of closing the page was not saved | 6 | End-to-end reload test | Save is flushed when the page hides |

## What this method is and is not evidence of

It shows a design and verification process that a designer can direct without writing the code. It does not show independent expert review of the
color science, and the deterministic parts (color maths, LUT accuracy, contrast) are far better tested than the advisory parts (descriptor
matching, harmony scoring), which is why the interface labels them differently.
