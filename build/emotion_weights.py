"""Palette Engine — emotion weights from the Jonauskaite et al. (2024) raw data.

Input: the OSF data file (osf.io/873df), one row per participant x color term,
0/1 per emotion. Kept on Kwade's machine / lexicon/data/, not shipped.
Output: lexicon/emotion_weights.json, the derived table the lexicon uses.

For each of the 10 positive Geneva Emotion Wheel emotions, a color term is
weighted when BOTH hold:
  1. Above baseline: its choice rate is >= LIFT x that emotion's mean rate
     across the 12 color terms (colors picked often for everything don't count).
  2. Cross-cultural: it is in the emotion's top 3 in >= COUNTRY_SHARE of the
     countries with >= MIN_N participants (the universality the paper reports).
Weight = the choice rate (share of all participants). Tier: "supported but
contested" when the top weighted rate is >= 0.30, else "low confidence".
LIFT, COUNTRY_SHARE, MIN_N and the 0.30 tier line are engineering choices.

Usage: python emotion_weights.py [--data PATH] [--out PATH]
"""
import argparse, json, os
import pandas as pd

POSITIVE = ["admiration", "amusement", "compassion", "contentment", "interest",
            "joy", "love", "pleasure", "pride", "relief"]
LIFT, COUNTRY_SHARE, MIN_N, TIER_LINE = 1.25, 0.5, 100, 0.30
# The 14 associations >= 40% published in the paper (Results) — used as a check.
PUBLISHED = {("red", "love"): .692, ("yellow", "joy"): .557, ("red", "anger"): .552,
             ("black", "sadness"): .537, ("pink", "love"): .532, ("black", "fear"): .487,
             ("grey", "sadness"): .477, ("orange", "joy"): .446, ("grey", "disappointment"): .439,
             ("white", "relief"): .435, ("pink", "pleasure"): .418, ("pink", "joy"): .418,
             ("black", "hate"): .416, ("orange", "amusement"): .410}


def derive(d):
    for (c, e), v in PUBLISHED.items():
        got = d.loc[d.colour == c, e].mean()
        if abs(got - v) > 0.0005:
            raise SystemExit(f"Data does not reproduce the paper: {c}-{e} {got:.3f} vs {v}")
    rate = d.groupby("colour")[POSITIVE].mean()
    n = d.groupby("residencecountry").user.nunique()
    big = n[n >= MIN_N].index
    by_country = d[d.residencecountry.isin(big)].groupby(["residencecountry", "colour"])[POSITIVE].mean()
    out = {}
    for e in POSITIVE:
        base = rate[e].mean()
        top3 = by_country[e].groupby(level=0).apply(lambda s: set(s.droplevel(0).nlargest(3).index))
        rows = []
        for c in rate.index:
            share = sum(c in t for t in top3) / len(big)
            rows.append({"colour": c, "rate": round(float(rate.loc[c, e]), 3),
                         "lift": round(float(rate.loc[c, e] / base), 2),
                         "countriesTop3": f"{sum(c in t for t in top3)}/{len(big)}",
                         "kept": bool(rate.loc[c, e] >= LIFT * base and share >= COUNTRY_SHARE)})
        rows.sort(key=lambda r: -r["rate"])
        kept = {r["colour"]: r["rate"] for r in rows if r["kept"]}
        out[e] = {"baseline": round(float(base), 3), "weights": kept,
                  "tier": "supported but contested" if kept and max(kept.values()) >= TIER_LINE else "low confidence",
                  "table": rows}
    return {"source": "jon2024_data", "participants": int(d.user.nunique()), "records": int(len(d)),
            "countries": int(len(big)), "rule": {"lift": LIFT, "countryShare": COUNTRY_SHARE,
            "minCountryN": MIN_N, "tierLine": TIER_LINE}, "emotions": out}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(here, "..", "lexicon", "data", "jonauskaite2024_DATA.csv"))
    ap.add_argument("--out", default=os.path.join(here, "..", "lexicon", "emotion_weights.json"))
    a = ap.parse_args()
    res = derive(pd.read_csv(a.data))
    json.dump(res, open(a.out, "w", encoding="utf-8"), indent=1)
    print(f"{res['participants']} participants, {res['countries']} countries; paper's 14 figures reproduced")
    for e, v in res["emotions"].items():
        print(f"  {e:12} {v['tier']:24} " + ", ".join(f"{c} {w:.3f}" for c, w in v["weights"].items()))


if __name__ == "__main__":
    main()
