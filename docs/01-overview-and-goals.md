# 01 Overview and goals

## Why this exists

Choosing a brand palette mixes three kinds of question that usually get blurred together:

- **Calculation.** What hex is this in CMYK? Does this text pass contrast? Can a press print it? These have right answers.
- **Evidence.** Does blue read as competent? Do complementary colors look harmonious? The research is mixed, mostly lab-based, and often
  weaker than design folklore suggests.
- **Judgment.** What suits this brand, this category, this audience? That belongs to the designer.

Palette Engine keeps them apart. It computes what can be computed, shows how much weight a suggestion deserves when it is a matter of evidence,
and records the designer's decisions instead of making them.

It began inside a design-systems portfolio project (retrospective brand systems, Figma asset libraries, a token-export wizard). The engine is the part
that turns a brand color into a documented, exportable palette, and it was built to feed that wider toolchain, including the Design System Forge
token formats and, later, design tools such as Figma.

## Goals

1. Give a designer a **documented palette** from either entry point: a known color, or descriptor words.
2. Produce **screen, print and spot values** with the conditions stated (profile, rendering intent, illuminant).
3. Make **evidence visible**: every suggestion carries a tier and its sources.
4. Make **accessibility a gate, not a suggestion**: WCAG 2.2 AA on role pairs, with fixes offered and any exception recorded with a reason.
5. Keep **the designer in control**: every color can be locked, overridden and annotated, and the notes reach every export.
6. Export to **the files real work uses**: design tokens, CSS, Adobe swatches, a printable spec sheet, a readable Markdown record.
7. Be **honest about limits**, in the interface and in the files.

## Scope of v1

| Area | v1 |
| --- | --- |
| Runtime | One web page. A Python build step precomputes CMYK lookup tables (LittleCMS); the page needs no server |
| Print conditions | Six, grouped by region (D38). North America: GRACoL 2013 coated (default), SWOP 2013, GRACoL 2013 uncoated. Europe: PSO Coated v3 (FOGRA51), PSO Uncoated v3 (FOGRA52), FOGRA39 (VIGC 260). Relative colorimetric with black point compensation |
| Screen | sRGB is canonical. Colors beyond sRGB are flagged "P3 only" and mapped in |
| Spot color | Approximate Pantone matching from values the designer pastes; Coated and Uncoated scored separately, top 3 by ΔE2000 |
| Descriptors | 48 curated terms, each with sources and a tier, reached through their synonyms, the studies' own words (Aaker's trait items) and word forms. Near-synonyms the studies did not use lower the tier one step. Other words are flagged, never guessed |
| Color roles | Material 3 (2021 role tones), light and dark |
| Exports | Design tokens (two formats), CSS, Markdown, Adobe ASE, PDF spec sheet, project file |

## Deliberately out of scope

Official Pantone data; HKS, Toyo and RAL; print conditions outside the six (Japan, newsprint, paper grades such as SC and LWC); metallic, fluorescent or expanded-gamut printing; palettes from images;
gradients; direct writes into Figma (the token route through Tokens Studio is the intended path, still to be verified).

## Who it is for

A working designer who knows what a color profile is but does not want to run a color-management pipeline by hand, and who wants a record of
*why* a palette is what it is. It is also a portfolio piece: the method, the tests and the decision log are part of the point.
