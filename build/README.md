# Palette Engine — build step (phase 1)

Builds the CMYK lookup tables the web tool uses, and checks them against LittleCMS directly.
Rerun only when a print profile changes.

## Lexicon step (phase 3)

`python build_lexicon.py` validates `lexicon/lexicon_draft.json` against `lexicon/hue_families.json`
and writes `data/lexicon.json` with only the rows marked `"decision": "approve"` or `"edit"`, plus
`data/lexicon_report.json` (rejections, drops, pending rows, sRGB coverage per row). Rows missing a
source or tier, naming unknown families or color words, reusing a word from another row, or with
targets no sRGB color can meet are rejected. `--include-pending` also ships undecided rows (for
testing the tool); `--strict` exits 1 on any rejection. Tests: `python test_lexicon.py`.

## Folder layout

```
build/      build_luts.py, lcms.py, README.md, requirements.txt
profiles/   six .icc files (names and hashes in profiles/README.md)
data/       lut_<profile>.json (one per profile) + accuracy_report.json
```

## Run (Windows)

1. Python 3.10+ and `pip install -r requirements.txt`
2. LittleCMS 2 as a DLL: Pillow bundles LittleCMS internally but only exposes 8-bit
   transforms, which are too coarse for the accuracy check. Put `lcms2.dll` in `build/`
   (from `vcpkg install lcms`, or `conda install -c conda-forge lcms2`, which places it in
   the environment's `Library\bin`).
3. `python build_luts.py` (options: `--grid 33`, `--profiles DIR`, `--out DIR`, `--p95 1.0`, `--max 2.0`)

The run prints pass/fail per profile. `accuracy_report.json` holds the full statistics and
the 20 worst colors per profile.

## What each LUT node stores

| Values | Meaning |
| --- | --- |
| C, M, Y, K | sRGB → CMYK, relative colorimetric + black point compensation (the brand values) |
| pL, pa, pb | Lab D50 the press produces for that CMYK (preview swatch) |
| rL, ra, rb | Lab D50 after sRGB → Lab → CMYK → Lab without BPC. ΔE00(screen Lab, this) > 2 = out of gamut; this is also the printable neighbor |

Stored as little-endian uint16, base64. Decode: CMYK and L = v / 655.35; a and b = v / 256 − 128.
Grid order is r, g, b with b changing fastest; nodes sit at i / (grid − 1).
Interpolation must be tetrahedral (the same six-tetrahedron split as `tetra()` in build_luts.py).

## Test vectors

`python make_py_vectors.py` rewrites `engine/py_vectors.json` (11,000 colors per profile: the table lookup and LittleCMS sRGB to Lab) for the JavaScript tests to compare against. Run it after `build_luts.py` whenever a profile is added or changed. `--check` compares with the existing file for the profiles it already holds (it reproduced the original three exactly).
