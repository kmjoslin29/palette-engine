"""Palette Engine — phase 3 build step: descriptor lexicon.

Validates lexicon/lexicon_draft.json against lexicon/hue_families.json and
writes data/lexicon.json with only the rows Kwade approved (decision
"approve" or "edit"). Rows missing a source or tier, or with broken targets,
are rejected and listed; they never reach the web tool.

Also checks that every row can actually be satisfied: its hard constraints
(L and C ranges, Ou 2004 models) must leave some sRGB colors, or the row is
rejected as empty.

Usage:  python build_lexicon.py [--lexicon DIR] [--out DIR] [--include-pending] [--strict]
  --include-pending  also emit rows with no decision yet (for testing the tool)
  --strict           exit 1 if any row is rejected
"""
import argparse, json, math, os, sys
import numpy as np
import colour

TIERS = {"well-established", "supported but contested", "low confidence", "speculative"}
CLASSES = {"perceptual", "personality", "emotion"}
DECISIONS = {None, "approve", "edit", "drop"}
MODELS = {"ou2004.WC", "ou2004.HL", "ou2004.AP", "ou2004.HS"}


# --- Ou, Luo, Woodcock & Wright (2004), CIELAB under D65 ---------------------
def ou_scores(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a))
    return {
        "ou2004.WC": -0.5 + 0.02 * C ** 1.07 * np.cos(np.radians(h - 50)),
        "ou2004.HL": -2.1 + 0.05 * (100 - L),
        "ou2004.AP": -1.1 + 0.03 * np.sqrt(C ** 2 + ((L - 50) / 1.5) ** 2),
        "ou2004.HS": 11.1 + 0.03 * (100 - L) - 11.4 * C ** 0.02,
    }


def srgb_grid(n=17):
    v = np.linspace(0, 1, n)
    rgb = np.stack(np.meshgrid(v, v, v, indexing="ij"), -1).reshape(-1, 3)
    xyz = colour.sRGB_to_XYZ(rgb)
    lab65 = colour.XYZ_to_Lab(xyz, colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"])
    oklab = colour.XYZ_to_Oklab(xyz)
    okL = oklab[:, 0]
    okC = np.hypot(oklab[:, 1], oklab[:, 2])
    return {"L": okL, "C": okC, "ou": ou_scores(lab65)}


def in_range(x, rng):
    lo, hi = rng
    m = np.ones_like(x, dtype=bool)
    if lo is not None:
        m &= x >= lo
    if hi is not None:
        m &= x <= hi
    return m


def check_range(name, rng, lo, hi, errs):
    if rng is None:
        return
    if not (isinstance(rng, list) and len(rng) == 2):
        errs.append(f"{name} must be [min, max]")
        return
    for v in rng:
        if v is not None and not (lo <= v <= hi):
            errs.append(f"{name} value {v} outside {lo}..{hi}")
    if None not in rng and rng[0] >= rng[1]:
        errs.append(f"{name} min >= max")


def validate(lex, fam):
    families = {f["id"] for f in fam["families"]} | {"neutral"}
    regions = fam["colorTerms"]["regions"]
    sources = lex.get("sources", {})
    grid = srgb_grid()
    ids = {r.get("id") for r in lex["rows"]}
    words, results = {}, []

    for r in lex["rows"]:
        errs = []
        rid = r.get("id") or "<no id>"
        if not r.get("tier"):
            errs.append("missing tier")
        elif r["tier"] not in TIERS:
            errs.append(f"unknown tier '{r['tier']}'")
        if not r.get("sources"):
            errs.append("missing source")
        for s in r.get("sources") or []:
            src = sources.get(s)
            if not src:
                errs.append(f"unknown source '{s}'")
            elif not (src.get("cite") and src.get("url")):
                errs.append(f"source '{s}' lacks cite or url")
        if r.get("class") not in CLASSES:
            errs.append(f"unknown class '{r.get('class')}'")
        if r.get("decision") not in DECISIONS:
            errs.append(f"decision must be approve, edit, drop or empty (got '{r.get('decision')}')")
        if r.get("studyWords") and not r.get("studyWordsBasis"):
            errs.append("studyWords without studyWordsBasis")
        if r.get("strongSynonyms") and not r.get("strongSynonymsBasis"):
            errs.append("strongSynonyms without strongSynonymsBasis")
        if r.get("inherits") and r["inherits"] not in ids:
            errs.append(f"inherits unknown row '{r['inherits']}'")
        for w in [r.get("term", "")] + (r.get("synonyms") or []) + (r.get("studyWords") or []) + (r.get("strongSynonyms") or []):
            k = w.strip().lower().replace("-", " ")
            if not k:
                errs.append("empty term or synonym")
            elif k in words and words[k] != rid:
                errs.append(f"'{w}' already used by row '{words[k]}'")
            else:
                words[k] = rid

        t = r.get("targets") or {}
        check_range("L", t.get("L"), 0, 1, errs)
        check_range("C", t.get("C"), 0, 0.4, errs)
        for f, w in (t.get("hueWeights") or {}).items():
            if f not in families:
                errs.append(f"unknown hue family '{f}'")
            if not isinstance(w, (int, float)):
                errs.append(f"hue weight for '{f}' is not a number")
        for term, w in (t.get("colorTerms") or {}).items():
            if term not in regions:
                errs.append(f"unknown color term '{term}'")
            if not isinstance(w, (int, float)) or not -1 <= w <= 1:
                errs.append(f"color-term weight for '{term}' must be a number in -1..1")
        for m in t.get("models") or []:
            if m.get("eq") not in MODELS:
                errs.append(f"unknown model '{m.get('eq')}'")
            if m.get("sign") not in (1, -1):
                errs.append("model sign must be 1 or -1")
        has_target = any([t.get("L"), t.get("C"), t.get("hueWeights"), t.get("colorTerms"), t.get("nudges"), t.get("models")])
        if not has_target:
            errs.append("no targets")

        # Satisfiability: hard constraints must leave some sRGB colors
        coverage = None
        if not errs:
            m = np.ones_like(grid["L"], dtype=bool)
            if t.get("L"):
                m &= in_range(grid["L"], t["L"])
            if t.get("C"):
                m &= in_range(grid["C"], t["C"])
            for mod in t.get("models") or []:
                m &= grid["ou"][mod["eq"]] * mod["sign"] > mod.get("min", 0)
            coverage = float(m.mean())
            if coverage == 0:
                errs.append("no sRGB color satisfies the L/C ranges and models together")
        results.append({"id": rid, "errors": errs, "coverage": coverage, "decision": r.get("decision")})
    return results


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", default=os.path.join(here, "..", "lexicon"))
    ap.add_argument("--out", default=os.path.join(here, "..", "data"))
    ap.add_argument("--include-pending", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()

    lex = json.load(open(os.path.join(a.lexicon, "lexicon_draft.json"), encoding="utf-8"))
    fam = json.load(open(os.path.join(a.lexicon, "hue_families.json"), encoding="utf-8"))
    results = validate(lex, fam)

    rejected = [x for x in results if x["errors"]]
    keep = {"approve", "edit"} | ({None} if a.include_pending else set())
    good = {x["id"] for x in results if not x["errors"] and x["decision"] in keep}
    rows = [r for r in lex["rows"] if r["id"] in good]
    for r in rows:
        r["coverage"] = next(x["coverage"] for x in results if x["id"] == r["id"])

    os.makedirs(a.out, exist_ok=True)
    out = {"version": lex["version"], "families": fam, "sources": lex["sources"], "rows": rows}
    with open(os.path.join(a.out, "lexicon.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    report = {"total": len(results), "emitted": len(rows), "rejected": rejected,
              "dropped": [x["id"] for x in results if x["decision"] == "drop"],
              "pending": [x["id"] for x in results if x["decision"] is None and not x["errors"]],
              "coverage": {x["id"]: round(x["coverage"], 3) for x in results if x["coverage"] is not None}}
    with open(os.path.join(a.out, "lexicon_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    print(f"{len(results)} rows: {len(rows)} emitted, {len(rejected)} rejected, "
          f"{len(report['dropped'])} dropped, {len(report['pending'])} awaiting a decision")
    for x in rejected:
        print(f"  REJECTED {x['id']}: {'; '.join(x['errors'])}")
    thin = [k for k, v in report["coverage"].items() if v < 0.01]
    if thin:
        print("  note: under 1% of sRGB satisfies", ", ".join(thin))
    sys.exit(1 if (a.strict and rejected) else 0)


if __name__ == "__main__":
    main()
