"""Tests for build_lexicon.py. Run: python test_lexicon.py"""
import copy, json, os, subprocess, sys, tempfile
import numpy as np
import colour
import build_lexicon as bl

HERE = os.path.dirname(os.path.abspath(__file__))
LEX = os.path.join(HERE, "..", "lexicon")
lex = json.load(open(os.path.join(LEX, "lexicon_draft.json"), encoding="utf-8"))
fam = json.load(open(os.path.join(LEX, "hue_families.json"), encoding="utf-8"))
fails = 0


def check(name, ok, detail=""):
    global fails
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  ' + detail if detail and not ok else ''}")
    fails += 0 if ok else 1


def errors_for(mutate):
    L = copy.deepcopy(lex)
    mutate(L["rows"][0], L)
    return next(x for x in bl.validate(L, fam) if x["id"] == L["rows"][0]["id"])["errors"]


# Draft is clean
res = bl.validate(lex, fam)
check("draft: all 48 rows valid", len(res) == 48 and not any(x["errors"] for x in res),
      str([x for x in res if x["errors"]]))

# Rejections the build spec requires
check("row without sources is rejected", "missing source" in errors_for(lambda r, L: r.update(sources=[])))
check("row without tier is rejected", "missing tier" in errors_for(lambda r, L: r.update(tier="")))
check("unknown tier is rejected", any("unknown tier" in e for e in errors_for(lambda r, L: r.update(tier="probably"))))
check("unknown source key is rejected", any("unknown source" in e for e in errors_for(lambda r, L: r.update(sources=["nope"]))))
check("unknown color term is rejected",
      any("color term" in e for e in errors_for(lambda r, L: r["targets"].update(colorTerms={"chartreuse": 0.5}))))
_dup = copy.deepcopy(lex)
_dup["rows"][0]["synonyms"].append(_dup["rows"][1]["term"])
check("duplicate synonym across rows is rejected",
      any("already used" in e for x in bl.validate(_dup, fam) for e in x["errors"]))
_dup2 = copy.deepcopy(lex)
_dup2["rows"][0].setdefault("strongSynonyms", []).append(_dup2["rows"][1]["term"])
_dup2["rows"][0]["strongSynonymsBasis"] = "test"
check("strong synonym that repeats another row's term is rejected",
      any("already used" in e for x in bl.validate(_dup2, fam) for e in x["errors"]))
_dup3 = copy.deepcopy(lex)
_dup3["rows"][0]["studyWords"] = ["down to earth"]
check("study word that repeats a hyphenated term with spaces is rejected",
      any("already used" in e for x in bl.validate(_dup3, fam) for e in x["errors"]))
check("study words need a stated basis",
      "studyWords without studyWordsBasis" in errors_for(lambda r, L: (r.update(studyWords=["zzz"]), r.pop("studyWordsBasis", None))))
check("strong synonyms need a stated basis",
      "strongSynonyms without strongSynonymsBasis" in errors_for(lambda r, L: (r.update(strongSynonyms=["zzz"]), r.pop("strongSynonymsBasis", None))))
check("impossible targets are rejected",
      any("no sRGB color" in e for e in errors_for(lambda r, L: r["targets"].update(L=[0.95, None], models=[{"eq": "ou2004.HL", "sign": 1, "min": 0}]))))
check("inverted range is rejected", any("min >= max" in e for e in errors_for(lambda r, L: r["targets"].update(C=[0.2, 0.1]))))

# Ou (2004) equations match the values seen from the JS side (culori) during drafting
def lab65(hexes):
    rgb = np.array([[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] for h in hexes])
    return colour.XYZ_to_Lab(colour.sRGB_to_XYZ(rgb), colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"])
s = bl.ou_scores(lab65(["#ff0000", "#ffffff", "#808080", "#000000"]))
check("Ou WC(#ff0000) = 2.4", abs(s["ou2004.WC"][0] - 2.4) < 0.1, str(s["ou2004.WC"][0]))
check("Ou HL(#ffffff) = -2.1", abs(s["ou2004.HL"][1] + 2.1) < 0.05, str(s["ou2004.HL"][1]))
check("Ou AP(#808080) = -1.0", abs(s["ou2004.AP"][2] + 1.0) < 0.1, str(s["ou2004.AP"][2]))
check("Ou HL(#000000) = 2.9", abs(s["ou2004.HL"][3] - 2.9) < 0.05, str(s["ou2004.HL"][3]))

# Color-term bridge: every region holds sRGB colors, and each measured anchor sits inside its own region
g = bl.srgb_grid(33)
okh = None
empty, outside = [], []
for term, reg in fam["colorTerms"]["regions"].items():
    m = bl.in_range(g["L"], reg["L"]) & bl.in_range(g["C"], reg["C"])
    if not m.any():
        empty.append(term)
    L_, C_, _ = reg["anchor"]
    if not (bl.in_range(np.array([L_]), reg["L"])[0] and bl.in_range(np.array([C_]), reg["C"])[0]):
        outside.append(term)
check("every color-term region contains sRGB colors", not empty, str(empty))
check("every measured anchor falls inside its own region", not outside, str(outside))

# Decision filtering through the CLI
with tempfile.TemporaryDirectory() as d:
    L = copy.deepcopy(lex)
    for r in L["rows"]:
        r["decision"] = None
    L["rows"][0]["decision"] = "approve"
    L["rows"][1]["decision"] = "drop"
    L["rows"][2]["decision"] = "edit"
    L["rows"][3]["sources"] = []
    lexdir = os.path.join(d, "lex")
    os.makedirs(lexdir)
    json.dump(L, open(os.path.join(lexdir, "lexicon_draft.json"), "w"))
    json.dump(fam, open(os.path.join(lexdir, "hue_families.json"), "w"))
    run = subprocess.run([sys.executable, os.path.join(HERE, "build_lexicon.py"), "--lexicon", lexdir, "--out", d, "--strict"],
                         capture_output=True, text=True)
    out = json.load(open(os.path.join(d, "lexicon.json")))
    ids = [r["id"] for r in out["rows"]]
    check("only approved and edited rows are emitted", ids == [L["rows"][0]["id"], L["rows"][2]["id"]], str(ids))
    check("--strict exits 1 when a row is rejected", run.returncode == 1, run.stdout)

# Emotion weights: raw data reproduces the paper, and the lexicon matches the derived table
ew = json.load(open(os.path.join(LEX, "emotion_weights.json"), encoding="utf-8"))
rows = {r["id"]: r for r in lex["rows"]}
check("every positive emotion row matches emotion_weights.json",
      all(rows[e]["targets"]["colorTerms"] == v["weights"] and rows[e]["tier"] == v["tier"] for e, v in ew["emotions"].items()))
data = os.path.join(LEX, "data", "jonauskaite2024_DATA.csv")
if os.path.exists(data):
    import pandas as pd, emotion_weights as ewm
    again = ewm.derive(pd.read_csv(data))  # raises if the 14 published figures don't reproduce
    check("raw data reproduces the paper's 14 figures and the same weights",
          {e: v["weights"] for e, v in again["emotions"].items()} == {e: v["weights"] for e, v in ew["emotions"].items()})
else:
    print("SKIP  raw data not present (lexicon/data/jonauskaite2024_DATA.csv)")

print("ALL PASS" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
