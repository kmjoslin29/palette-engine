"""Palette Engine — phase 1 build step.

Builds CMYK lookup tables (LUTs) on an N x N x N sRGB grid for each print
profile, then validates tetrahedral interpolation against direct LittleCMS.

Per grid node the LUT stores 10 values:
  cmyk[4]      sRGB -> CMYK, relative colorimetric + black point compensation (brand values)
  printLab[3]  Lab D50 the press produces for that CMYK (preview swatch)
  rtLab[3]     Lab D50 after sRGB -> Lab -> CMYK -> Lab without BPC (gamut check:
               deltaE00(sourceLab, rtLab) > threshold = out of gamut; rtLab is the printable neighbor)

Usage:  python build_luts.py [--grid 33] [--profiles DIR] [--out DIR]
"""
import argparse, base64, hashlib, json, os, time
import numpy as np
import colour
import lcms

PROFILES = [  # id, file, label, TAC limit (from the ICC registry pages)
    ("gracol2013_crpc6", "GRACoL2013_CRPC6.icc", "GRACoL 2013 coated (CRPC6)", 320),
    ("swop2013c3_crpc5", "SWOP2013C3_CRPC5.icc", "SWOP 2013 (CRPC5)", 300),
    ("gracol2013_unc_crpc3", "GRACoL2013UNC_CRPC3.icc", "GRACoL 2013 uncoated (CRPC3)", 280),
    ("pso_coated_v3", "PSOcoated_v3.icc", "PSO Coated v3 (FOGRA51)", 300),
    ("pso_uncoated_v3", "PSOuncoated_v3_FOGRA52.icc", "PSO Uncoated v3 (FOGRA52)", 300),
    ("fogra39_vigc260", "Coated_Fogra39L_VIGC_260.icc", "Coated FOGRA39L (VIGC 260)", 260),  # ICC registry page (C23); the file states none (C31, D43)
]
# Quantization for storage (uint16): CMYK 0..100, L 0..100, a/b -128..128
SCALE = {"cmyk": 65535 / 100.0, "L": 65535 / 100.0, "ab": 65535 / 256.0}


def node_values(T, rgb):
    cmyk = T["rgb_to_cmyk"](rgb)
    print_lab = T["cmyk_to_lab"](cmyk)
    src_lab = T["rgb_to_lab"](rgb)
    rt_lab = T["cmyk_to_lab"](T["lab_to_cmyk_nobpc"](src_lab))
    return cmyk, print_lab, rt_lab, src_lab


def quantize(values):
    """values: (n,10) -> uint16 using per-channel scales; returns array + dequantized copy."""
    q = np.empty_like(values)
    q[:, 0:4] = np.round(values[:, 0:4] * SCALE["cmyk"])
    for base in (4, 7):
        q[:, base] = np.round(values[:, base] * SCALE["L"])
        q[:, base + 1:base + 3] = np.round((values[:, base + 1:base + 3] + 128) * SCALE["ab"])
    q = np.clip(q, 0, 65535).astype(np.uint16)
    d = q.astype(np.float64)
    deq = np.empty_like(values)
    deq[:, 0:4] = d[:, 0:4] / SCALE["cmyk"]
    for base in (4, 7):
        deq[:, base] = d[:, base] / SCALE["L"]
        deq[:, base + 1:base + 3] = d[:, base + 1:base + 3] / SCALE["ab"] - 128
    return q, deq


def tetra(lut, n, rgb):
    """Tetrahedral interpolation. lut: (n,n,n,C) indexed [r,g,b]; rgb: (m,3) in 0..1."""
    p = np.clip(rgb, 0, 1) * (n - 1)
    i0 = np.minimum(np.floor(p).astype(int), n - 2)
    f = p - i0
    r0, g0, b0 = i0[:, 0], i0[:, 1], i0[:, 2]
    fr, fg, fb = f[:, 0:1], f[:, 1:2], f[:, 2:3]
    V = lambda dr, dg, db: lut[r0 + dr, g0 + dg, b0 + db]
    c000, c111 = V(0, 0, 0), V(1, 1, 1)
    out = np.empty((rgb.shape[0], lut.shape[-1]))
    # six tetrahedra, chosen by ordering of fractional parts
    cases = [
        ((fr >= fg) & (fg >= fb), lambda: c000 + fr * (V(1,0,0) - c000) + fg * (V(1,1,0) - V(1,0,0)) + fb * (c111 - V(1,1,0))),
        ((fr >= fb) & (fb > fg),  lambda: c000 + fr * (V(1,0,0) - c000) + fb * (V(1,0,1) - V(1,0,0)) + fg * (c111 - V(1,0,1))),
        ((fb > fr) & (fr >= fg),  lambda: c000 + fb * (V(0,0,1) - c000) + fr * (V(1,0,1) - V(0,0,1)) + fg * (c111 - V(1,0,1))),
        ((fg > fr) & (fr >= fb),  lambda: c000 + fg * (V(0,1,0) - c000) + fr * (V(1,1,0) - V(0,1,0)) + fb * (c111 - V(1,1,0))),
        ((fg >= fb) & (fb > fr),  lambda: c000 + fg * (V(0,1,0) - c000) + fb * (V(0,1,1) - V(0,1,0)) + fr * (c111 - V(0,1,1))),
        ((fb > fg) & (fg > fr),   lambda: c000 + fb * (V(0,0,1) - c000) + fg * (V(0,1,1) - V(0,0,1)) + fr * (c111 - V(0,1,1))),
    ]
    assigned = np.zeros(rgb.shape[0], bool)
    for mask, fn in cases:
        m = mask[:, 0] & ~assigned
        out[m] = fn()[m]
        assigned |= m
    assert assigned.all(), "tetrahedral case coverage gap"
    return out


def test_set(seed=20260928):
    rng = np.random.default_rng(seed)
    rand = rng.integers(0, 256, (10000, 3))
    g = rng.integers(0, 256, (500, 1))
    near_gray = np.clip(g + rng.integers(-6, 7, (500, 3)), 0, 255)
    edge = rng.integers(0, 256, (500, 3))
    ch = rng.integers(0, 3, 500)
    edge[np.arange(500), ch] = rng.choice([0, 255], 500)
    return {"random": rand / 255.0, "near_gray": near_gray / 255.0, "gamut_edge": edge / 255.0}


def de00(a, b):
    return colour.delta_E(a, b, method="CIE 2000")


def stats(x):
    return {"median": round(float(np.median(x)), 3), "p95": round(float(np.percentile(x, 95)), 3),
            "max": round(float(np.max(x)), 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=int, default=33)
    ap.add_argument("--profiles", default=os.path.join(os.path.dirname(__file__), "..", "profiles"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    ap.add_argument("--p95", type=float, default=1.0)
    ap.add_argument("--max", type=float, default=2.0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    n = a.grid
    axis = np.linspace(0, 1, n)
    grid = np.stack(np.meshgrid(axis, axis, axis, indexing="ij"), -1).reshape(-1, 3)  # r slowest, b fastest
    tests = test_set()
    report = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "lcms_version": lcms.version(),
              "grid": n, "interpolation": "tetrahedral", "intent_cmyk": "relative colorimetric + BPC",
              "intent_gamut": "relative colorimetric, no BPC", "thresholds": {"p95": a.p95, "max": a.max},
              "profiles": {}}
    for pid, fname, label, tac_limit in PROFILES:
        path = os.path.join(a.profiles, fname)
        sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
        T = lcms.transforms(path)
        cmyk, plab, rtlab, _ = node_values(T, grid)
        vals = np.hstack([cmyk, plab, rtlab])
        q, deq = quantize(vals)
        lut = deq.reshape(n, n, n, 10)
        prof = {"label": label, "file": fname, "sha256": sha, "tac_limit": tac_limit,
                "grid_max_tac": round(float(cmyk.sum(1).max()), 1), "tests": {}}
        worst = []
        for tname, rgb in tests.items():
            d_cmyk, d_plab, d_rtlab, src = node_values(T, rgb)
            li = tetra(lut, n, rgb)
            printed_from_lut_cmyk = T["cmyk_to_lab"](li[:, 0:4])
            e_print = de00(printed_from_lut_cmyk, d_plab)      # CMYK accuracy, judged by what prints
            e_plab = de00(li[:, 4:7], d_plab)                  # stored preview Lab accuracy
            e_rt = de00(li[:, 7:10], d_rtlab)                  # gamut-neighbor accuracy
            gamut_true = de00(src, d_rtlab) > 2.0
            gamut_lut = de00(src, li[:, 7:10]) > 2.0
            prof["tests"][tname] = {
                "n": int(rgb.shape[0]),
                "printed_dE00_from_lut_cmyk": stats(e_print),
                "cmyk_abs_diff_points": stats(np.abs(li[:, 0:4] - d_cmyk).max(1)),
                "preview_lab_dE00": stats(e_plab),
                "roundtrip_lab_dE00": stats(e_rt),
                "gamut_flag_disagreements": int((gamut_true != gamut_lut).sum()),
                "share_out_of_gamut": round(float(gamut_true.mean()), 3),
            }
            for i in np.argsort(-e_print)[:7]:
                worst.append({"set": tname, "hex": "#%02X%02X%02X" % tuple(np.round(rgb[i] * 255).astype(int)),
                              "dE00": round(float(e_print[i]), 3),
                              "cmyk_direct": np.round(d_cmyk[i], 1).tolist(),
                              "cmyk_lut": np.round(li[i, 0:4], 1).tolist()})
        prof["worst"] = sorted(worst, key=lambda w: -w["dE00"])[:20]
        allp = [prof["tests"][t]["printed_dE00_from_lut_cmyk"] for t in tests]
        prof["pass"] = all(s["p95"] <= a.p95 and s["max"] <= a.max for s in allp)
        report["profiles"][pid] = prof
        with open(os.path.join(a.out, f"lut_{pid}.json"), "w") as fh:
            json.dump({"id": pid, "label": label, "grid": n, "order": "r,g,b (b fastest)",
                       "channels": ["C", "M", "Y", "K", "pL", "pa", "pb", "rL", "ra", "rb"],
                       "encoding": "uint16 little-endian, base64",
                       "scale": {"cmyk": "v/655.35", "L": "v/655.35", "ab": "v/256 - 128"},
                       "profile_sha256": sha, "tac_limit": tac_limit,
                       "data": base64.b64encode(q.astype("<u2").tobytes()).decode()}, fh)
        print(f"{pid}: pass={prof['pass']} " + " | ".join(
            f"{t}: p95 {prof['tests'][t]['printed_dE00_from_lut_cmyk']['p95']} max {prof['tests'][t]['printed_dE00_from_lut_cmyk']['max']}"
            for t in tests))
    with open(os.path.join(a.out, "accuracy_report.json"), "w") as fh:
        json.dump(report, fh, indent=2)


if __name__ == "__main__":
    main()
