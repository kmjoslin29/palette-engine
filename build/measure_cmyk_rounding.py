"""Palette Engine: share of rounded CMYK that the LUT gets exactly right.

Measures, per print condition, how often the CMYK the page shows (the LUT value,
tetrahedrally interpolated and rounded half up to whole percent, as roundCmyk() does)
equals the CMYK from a direct LittleCMS conversion rounded the same way.

This is the Phase 1 "Rounded CMYK identical / Off by 1 / Off by >= 2 (max)" table,
which was never computed for the three European conditions added in pe-update29.

It reuses build_luts.py (same grid, uint16 quantization, tetrahedral interpolation,
fixed test set: 10,000 random + 500 near-gray + 500 gamut-edge, seed 20260928),
so its results are directly comparable with the Phase 1 numbers.

It also reports, for each pair of conditions present, how often the two show the same
rounded CMYK for the same color (the page's values, from the tables), since
"identical rounded CMYK between conditions" can be read that way too.

Usage:  python build/measure_cmyk_rounding.py [--grid 33] [--profiles DIR] [--out FILE]
Profiles missing from DIR are skipped with a note, so it can run on any subset.
"""
import argparse, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lcms
from build_luts import PROFILES, node_values, quantize, tetra, test_set


def round_half_up(x):
    # roundCmyk() in engine/lut.js rounds half up; all CMYK values here are >= 0.
    return np.floor(x + 0.5)


def measure(path, n):
    T = lcms.transforms(path)
    axis = np.linspace(0, 1, n)
    grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1).reshape(-1, 3)
    cmyk, plab, rtlab, _ = node_values(T, grid)
    _, deq = quantize(np.hstack([cmyk, plab, rtlab]))
    lut = deq.reshape(n, n, n, 10)
    per_set, all_diff, shown = {}, [], []
    for name, rgb in test_set().items():
        direct = T["rgb_to_cmyk"](rgb)
        from_lut = tetra(lut, n, rgb)[:, 0:4]
        diff = np.abs(round_half_up(from_lut) - round_half_up(direct)).max(1)
        per_set[name] = summarize(diff)
        all_diff.append(diff)
        shown.append(round_half_up(from_lut))
    return summarize(np.concatenate(all_diff)), per_set, np.vstack(shown)


def summarize(diff):
    n = diff.size
    return {"n": int(n),
            "identical_pct": round(100 * float((diff == 0).sum()) / n, 2),
            "off_by_1_pct": round(100 * float((diff == 1).sum()) / n, 2),
            "off_by_2plus_pct": round(100 * float((diff >= 2).sum()) / n, 2),
            "max_points": int(diff.max())}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=int, default=33)
    ap.add_argument("--profiles", default=os.path.join(here, "..", "profiles"))
    ap.add_argument("--out", default=None, help="optional JSON file for the results")
    a = ap.parse_args()
    results = {"lcms_version": lcms.version(), "grid": a.grid, "rounding": "half up, whole percent",
               "comparison": "max over C, M, Y, K of |round(LUT) - round(direct)|", "profiles": {}}
    print(f"LittleCMS {lcms.version()}, grid {a.grid}")
    print("Table against direct LittleCMS, rounded CMYK (the Phase 1 measure):")
    print(f"{'condition':32} {'identical':>10} {'off by 1':>9} {'off by >=2':>11} {'max':>4}")
    shown = {}
    for pid, fname, label, _ in PROFILES:
        path = os.path.join(a.profiles, fname)
        if not os.path.exists(path):
            print(f"{label:32} skipped: {fname} not found")
            continue
        overall, per_set, shown[pid] = measure(path, a.grid)
        results["profiles"][pid] = {"label": label, "file": fname, "all": overall, "sets": per_set}
        print(f"{label:32} {overall['identical_pct']:>9}% {overall['off_by_1_pct']:>8}% "
              f"{overall['off_by_2plus_pct']:>10}% {overall['max_points']:>4}")
    ids = list(shown)
    if len(ids) > 1:
        print("\nBetween conditions: same color, same rounded CMYK shown by both (from the tables):")
        results["between_conditions"] = {}
        for i, p in enumerate(ids):
            for q in ids[i + 1:]:
                d = np.abs(shown[p] - shown[q]).max(1)
                s = summarize(d)
                results["between_conditions"][f"{p}|{q}"] = s
                print(f"  {p} vs {q}: identical {s['identical_pct']}%, within 1 point "
                      f"{round(s['identical_pct'] + s['off_by_1_pct'], 2)}%, max {s['max_points']} points")
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w") as fh:
            json.dump(results, fh, indent=2)
        print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
