"""Writes engine/py_vectors.json: independent Python reference values that engine/test_lut.mjs and engine/test_lab.mjs compare
the JavaScript lookup against. For each profile and each of 11,000 sRGB colors it stores
  lut     the 10 values tetra() returns from the quantized table (CMYK, printed Lab, round-trip Lab), and
  srcLab  LittleCMS sRGB -> Lab D50.
The 11,000 colors are the ones already in the file (reused so old and new profiles are tested on the same colors).

Usage:  python3 build/make_py_vectors.py [--profiles DIR] [--data DIR] [--out FILE] [--check]
  --check  compare with the existing file for the profiles it already holds and exit 1 if they differ by more than 1e-9.
"""
import argparse, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import build_luts as B
import lcms

ap = argparse.ArgumentParser()
root = os.path.join(os.path.dirname(__file__), "..")
ap.add_argument("--profiles", default=os.path.join(root, "profiles"))
ap.add_argument("--data", default=os.path.join(root, "data"))
ap.add_argument("--out", default=os.path.join(root, "engine", "py_vectors.json"))
ap.add_argument("--check", action="store_true")
a = ap.parse_args()

old = json.load(open(a.out))
rgb8 = np.array(old["rgb8"], dtype=float)
rgb = rgb8 / 255.0
out = {"rgb8": old["rgb8"], "profiles": {}}
worst = 0.0
for pid, fname, label, tac in B.PROFILES:
    path = os.path.join(a.profiles, fname)
    T = lcms.transforms(path)
    # rebuild the quantized table exactly as build_luts.py does, rather than decoding the JSON: an independent route to the same numbers
    n = 33
    axis = np.linspace(0, 1, n)
    grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1).reshape(-1, 3)
    cmyk, plab, rtlab, _ = B.node_values(T, grid)
    _, deq = B.quantize(np.hstack([cmyk, plab, rtlab]))
    li = B.tetra(deq.reshape(n, n, n, 10), n, rgb)
    src = T["rgb_to_lab"](rgb)
    out["profiles"][pid] = {"lut": li.tolist(), "srcLab": src.tolist()}
    if a.check:
        if pid in old["profiles"]:
            d = np.abs(np.array(old["profiles"][pid]["lut"]) - li).max()
            d2 = np.abs(np.array(old["profiles"][pid]["srcLab"]) - src).max()
            worst = max(worst, d, d2)
            print(f"{pid}: max diff vs existing file lut {d:.2e} srcLab {d2:.2e}")
        else:
            print(f"{pid}: new (no existing vectors)")
if a.check:
    sys.exit(0 if worst < 1e-9 else 1)
json.dump(out, open(a.out, "w"))
print("wrote", a.out, list(out["profiles"]))
