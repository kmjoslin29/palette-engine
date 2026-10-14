# 05 Exports

Every output is built from one export model (`engine/export/model.js`), so a value, a rationale or an accepted-failure note is identical wherever it appears.
Each format is parsed back by a reader that shares no code with the writer, in the tests.

| Output (label in the page) | File | What it is |
| --- | --- | --- |
| Design tokens (JSON) | `<name>-design-tokens.json` | Default. `color.<palette>.<tone>` with hex-string `$value` and `$type: color`; light roles under `color.role`; a `color-dark` group; `$themes`. Print and spot data under `$extensions.com.kwadejoslin.palette` |
| Design tokens (W3C standard) | `<name>.w3c.tokens.json` | The same tree in DTCG 2025.10: `$value` is `{ colorSpace, components, hex }`. No `$version` or `$themes` (the format leaves modes to its resolver module) |
| Website colors (CSS) | `<name>-colors.css` | `--color-<palette>-<tone>`, `--color-brand-<slot>`, `--color-role-<name>`. Light on `:root`; dark under `prefers-color-scheme` and `[data-theme="dark"]`; OKLCH in a comment after each value |
| Color specification (text) | `<name>-color-spec.md` | Per-color values, CMYK for all six print conditions (with their regions) and gamut flags, spot matches, contrast, evidence tier, rationale, locks and accepted failures |
| Adobe swatches (.ase) | `<name>.ase` | Groups: Screen RGB; Print GRACoL coated CMYK; Print uncoated CMYK; Spot approximations (Lab, named e.g. "185 C (approx.)"). Optional: the 84 tonal-palette colors |
| Brand color sheet (PDF) | `<name>-color-spec-sheet.pdf` | US Letter: summary, one page per color, roles, role-pair checks. Footer states profile, intent and that swatches are not proofs |
| Save or open project | `<name>.palette-project.json` | Everything chosen, so work is not tied to one browser. Loading validates strictly and refuses a bad file with reasons |

"Download all" gives one `<name>-color-files.zip` with the seven files and a `README.txt`. `<name>` comes from the project name, reduced to `a–z 0–9 -`.

## Rules

- **Blocked by accessibility.** All outputs except the project file are blocked while any WCAG AA role-pair failure has neither a fix nor an accepted note.
- **Notes travel.** Every rationale, lock and accepted-failure note appears in the Markdown spec and the PDF, and in the token files' extension data.
- **Nothing hidden.** A note that no longer matches a failing pair (because a color changed) is kept and marked stale rather than deleted.
- **Duplicate color names** are disambiguated in the outputs.
- Forge's old bare `$extensions.cmyk` key is deliberately not written; print data sits under the namespaced extension.

## Known limits

| Limit | Detail |
| --- | --- |
| **ASE untested in Adobe apps** | Written to the community-documented format (big-endian blocks, models RGB, CMYK, LAB, Gray). Checked by three independent readers and a third-party sample, never opened in Illustrator or InDesign. The page says so, and a flag in `web/app.js` (`ASE_TESTED_IN_ADOBE`) drives that notice |
| No ICC profile in the ASE | The file stores plain values. Set the CMYK working space to the profile named in each group |
| SWOP and the European conditions not in the ASE | The spec lists two print groups (GRACoL coated and uncoated). The spec text, spec sheet and token files carry all six, with their regions. Adding the two PSO groups would be an option (D38) |
| Spot group is conditional | Present only when the designer pasted spot values, and only entries within ΔE00 5 |
| Viewer saves allow-listed types | In the claude.ai viewer `.css` and `.ase` are saved inside a `.zip`. Local use and the browser fallback keep native names |
| PDF uses standard fonts | Characters outside WinAnsi become "?" and are reported; Δ, arrows, ≥, ≤ and ✓ are transliterated. Print swatches are drawn as the printable neighbor's RGB |
| Tokens Studio import | The DTCG file follows the 2025.10 specification. Kwade imported it into Tokens Studio in Figma on 2026-09-29 without problems (only that was observed) |
