# Spot-check protocol (Phase 6 gate: "spot-check logged")

**Status: not yet done.** This is the one Phase 6 item that needs a person, a physical guide and a calibrated display.
Results go in [`spot-check-log.md`](spot-check-log.md).

## What this checks, and what it does not

Palette Engine bundles no Pantone data. A designer pastes names and Lab values from a source they are licensed to use, and the tool scores
them against a color by ΔE2000, Coated and Uncoated separately. So the spot-check tests the **pasted values and the ranking**, not a
bundled dataset:

- It can catch: a mislabeled entry, a value pasted in the wrong illuminant (D50 vs D65), a book mix-up (C vs U), a large offset between
  the source's Lab and the printed swatch, and a ranking that puts an obviously worse chip first.
- It cannot catch fine differences. A visual check does not establish ΔE accuracy. Label results **"spot-checked (visual)"**, never "verified".
- Only a spectrophotometer reading makes a result **"measured"**, and then the reading and its ΔE00 go in the log.

## Before you start

1. Note the **guide edition and year** of the physical Formula Guide (Coated and Uncoated). Pantone advises replacing guides about every
   12–18 months; an old guide is a finding, not a failure.
2. Note where the pasted Lab values came from (source, version, illuminant). Set the tool's "Lab is D50 / D65" switch to match.
3. Use daylight-balanced light (D50 or D65 booth, or a window with indirect daylight) and view the guide next to a calibrated display.
   Record the lighting.

## Procedure

1. Choose **20 entries** across the range: reds, oranges, yellows, greens, cyans, blues, purples, neutrals; light and dark; vivid and muted.
2. Paste them (name, L, a, b, and " C" or " U" in the name) into **Analyze → Spot color scorer**.
3. For each, compare the printed chip in the guide with the source's name and, where the tool shows one, the screen swatch. Mark:
   **match**, **small offset**, **large offset** or **wrong chip**.
4. **Ranking test:** pick **5 target colors** (from the sample brand or your own). For each, the tool lists the top 3 by ΔE00. Lay the
   three chips beside the target and decide which is closest by eye. Record whether your order agrees with the tool's.
5. Optional: ask a print shop for a spectrophotometer reading of any chip and record L, a, b and the ΔE00 to the pasted value.

## Pass condition

- Every one of the 20 entries is **match** or **small offset**, or each **large offset / wrong chip** is explained in the log (bad source value,
  worn guide, wrong illuminant) and the cause is fixed or documented.
- In the ranking test, the tool's first choice is the chip you would choose, or is within one place of it, for at least 4 of the 5 targets.
- The log records the guide edition, lighting, display, and who checked.

If the gate is not met, do not change thresholds to fit. Record the finding and open an issue against the scorer or the source data.
