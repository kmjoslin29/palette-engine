# 09 Open items and roadmap

## Unverified or unfinished

Moved to the repository's single list: [`TO-CONFIRM.md`](../TO-CONFIRM.md).

## Possible next steps (not planned, not promised)

- **Figma route.** A Tokens Studio import (done, see TO-CONFIRM X1) is the intended path; a small Figma plugin that reads the design-token file and builds variables and styles
  would follow from it. Direct writes into Figma were kept out of v1.
- **Design System Forge fold-in.** Merge the export layer with the existing Forge token formats. The bare `$extensions.cmyk` in Forge should be replaced by the
  namespaced extension once its calculation method is confirmed.
- **More print conditions.** The European pair and a FOGRA39 file were added 2026-10-06 (D38). Not covered: Japan, newsprint, SC and LWC papers, and the ASE groups for SWOP and the European conditions. Each needs its own profile, table, terms check and accuracy report.
- **A second color-role spec.** Material 3's 2025 spec as an option, alongside the 2021 tones used now.
- **Palettes from images**, gradients and more spot systems were left out of v1 on purpose.
- **A hosted copy.** A static host can serve `dist/site`. The page has no backend and stores work only in the browser or in a project file.

## How to add to this list

Add it to [`TO-CONFIRM.md`](../TO-CONFIRM.md).
