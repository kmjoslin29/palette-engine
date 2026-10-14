# C10: matcher check against published brands

Written **before** the matcher was run on this set (2026-09-30). The rules below are fixed for this run; they are not adjusted to fit the results.

## What this is and is not

A plausibility check of `engine/matcher.js` against six brands' own published self-descriptions and colors (`brand-set.json`). A brand's color is
not the right answer: brands choose colors for history, competitors, category convention and print, and guideline copy is marketing language. A miss is a
prompt to look, not proof that a constant is wrong. Six brands cannot show accuracy. Tier for anything concluded here: **low confidence**.

Sources: only published material (brand guidelines, about pages, official design-system packages). No internal or leaked documents. Guideline documents are
not stored in the repo; only short word lists, hex values and URLs. Where a hex value came from a secondary listing, `brand-set.json` says so.

## Two runs per brand

1. **Verbatim:** the brand's own words, fed to `matchDescriptors` as written. This also measures lexicon coverage (how many brand words the 48 terms know).
2. **Synthesized:** Claude's mapping of those words to lexicon terms (`synthesized_terms`). This is a judgment, labeled **speculative**, and Kwade should
   review the mapping before any conclusion leans on it.

## Rules (fixed in advance)

- **R1 coverage (descriptive, no pass/fail):** words matched / words given, and the unknown words.
- **R2 hue family (pass/fail):** pass if at least one of the top 5 seeds is in the same hue family (`hue_families.json`) as the brand primary. For
  Mozilla, any listed color except black and white. For Starbucks, both listed hex values are reported. A run that matches no word is "no signal", not a miss.
- **R3 closeness (descriptive, no threshold):** for each brand color, the nearest of the top 5 seeds by ΔE00 (`engine/de.js`, D50), with OKLCH L, C and
  hue differences.
- No constant is changed during this run. Changes, if any, come after Kwade reviews the results, one at a time, with `npm test` after each.

## Results of the first run (2026-09-30, added after the run)

Full output: [`results.md`](results.md), regenerated with `node docs/c10/run.mjs > docs/c10/results.md`. `npm test` passed on the same tree (no engine
or lexicon file was changed).

**R2 (hue family):** verbatim words, 1 pass, 3 fail, 2 no signal; synthesized terms, 4 pass, 2 fail. Read with the notes below; six brands support no rate.

What was observed:

1. **Coverage is the largest gap, and it is a vocabulary problem, not a constant.** Of 43 verbatim brand words, 6 matched a lexicon term (genuine,
   smart, joy, vibrant, contemporary, bold). Dropbox and Mozilla matched nothing. Some misses are inflections of words the lexicon already has as
   synonyms: "empathy" (has "empathetic"), "humor" (has "humorous"), "interesting" (has "interest"), "confidently" (has "confident"). Others are common
   brand words with no row: helpful, human, simple, open, optimistic, practical, clear, fresh, passionate. Hyphenated phrases are split ("day-making"
   became "day" and "making"; "straight-faced" became two words).
2. **A light neutral (`#eeeeee`) tops several synthesized runs.** The rows sincere, honest, down-to-earth, wholesome and cheerful all carry the same
   color-word weights (white 0.435, pink 0.379), so any mix of them pulls toward white. Those weights come from the Labrecque & Milne mapping that C14
   says was never checked against the printed tables.
3. **Where the hue family was found, the nearest seed sat 6 to 10° from the brand hue for the blues and 26 to 27° for the Starbucks green, at ΔE00 13 to
   18.** The differences are mostly lightness and chroma (for example IBM `#0F62FE` at L 0.56 against the seed `#2735a6` at L 0.40). The 15° hue step is
   not what separates them. None of the six brand primaries sits below L 0.35, so this set says nothing about the 0.25 lightness floor.
4. **R2 is weak when the words carry no hue.** Atlassian's verbatim run matched only "bold", which sets chroma and lightness; the matcher then spreads
   seeds across hues (all scored 0), so the pass is automatic. The rule did not anticipate this; the result is reported as it came out and should be
   discounted.
5. **The synthesized runs depend on Claude's word mapping**, which is speculative and had not been reviewed by Kwade when this run was written (reviewed 2026-10-03: all 36 mappings kept; the label stays speculative).

What this does **not** show: that any matcher constant should change. No constant is implicated by this set. The actionable items are lexicon
coverage (new item C15) and the sincerity-row weights (C14).

Gaps in the set: four of six brands are blue-led tech companies; no dark or muted brand; Mailchimp, Dropbox and Starbucks hex values are from secondary
listings (Starbucks listings disagree, both tested); Atlassian's words are from a 2016 secondary report and its blue is the legacy palette.

## Addition: Kwade Joslin Studios (2026-09-30, added after the first run)

Added to `brand-set.json` after the six-brand run; the same rules apply. Words are Kwade's own description of what the colors were chosen to convey;
colors are from his Personal Branding Language sheet (not committed). Results are in `results.md`.

- **Coverage:** 3 of 6 words matched (creative, approachable, trustworthy). "Calming" missed although "calm" is a term (another inflection miss, C15);
  "responsible" and "exploration" have no row.
- **R2:** pass in both runs, but with four brand colors across three families against 3–5 seeds, the rule is easy to pass. Discount it.
- **R3:** no seed came close to any brand color in the verbatim run (nearest ΔE00 21.8 or more). In the synthesized run the nearest was ΔE00 22.9.
- **Two edge cases this brand exposes:** `#03BEDF` (2199 C) sits at OKLCH hue 216.2°, 1.2° inside the blue family, although it reads as cyan; and
  `#66596C` (2364 C) has OKLCH chroma 0.034, just above the 0.03 neutral cut-off, so it counts as magenta. Both are effects of band edges, which are
  engineering choices (D20).
- **Dark color:** `#41273B` (7449 C) is at OKLCH L 0.31, inside the seed grid (0.25 and up) but never offered: no run here produced a seed below L 0.40.
  This is the first data point on the lightness floor, and it suggests the floor is not what keeps dark colors out; the scoring is.

## Run 2: after widening word matching (2026-09-30)

What changed between runs (D33): word forms, Aaker's trait items as study words, 27 strong synonyms that lower the tier one step, hyphenated
words matched whole, and a plainer message when no color fits. The brand set gained a dark brand, The Guardian (navy `#052962`, OKLCH L 0.30; words
from a secondary source). Run 1 output is kept in [`results-run1.md`](results-run1.md); run 2 is [`results.md`](results.md). The irregular forms
"independence" and "leadership" were added to the word-form table after the Guardian words had been seen; they are ordinary word forms, but the order
is recorded here.

- **Coverage:** whole brand words recognized went from 9 to 18 of 49 (the seven brands of run 1). New matches: empathy, interesting, confidently,
  responsible, optimistic (twice), practical, calming and others. The words left unknown have no near-identical term (helpful, human, simple, open,
  clear, fresh, passionate and so on); that is intended (C15).
- **R2, verbatim words:** 4 pass, 2 fail, 2 no signal (run 1, six brands: 1 pass, 3 fail, 2 no signal). Starbucks and IBM now pass on their own
  words. Atlassian moved from an automatic pass to no signal: "bold" plus the two new matches (cheerful, down-to-earth) leave no color, because the
  sincerity rows point to white and pink and "bold" requires chroma 0.12 or more. The matcher now says so in plain words (X10).
- **Dark colors:** the Guardian navy, like Kwade's `#41273B`, was not approached by any seed (nearest ΔE00 37 or more; no seed below L 0.40). Two data
  points now say the matcher does not offer dark colors; C10 records it for tracing.
- Six or eight brands support no rate; the tier for anything here stays **low confidence**.

## Run 3 plan: brands from a color list (written 2026-10-01, before any word was gathered or the matcher run)

Candidate pool: the 120 brands on Digital Synopsis, "Colors Used By Famous Brands (With Their Codes)" (published 2019-09-17, modified 2026-08-24,
https://digitalsynopsis.com/design/brand-colors/). It is a secondary listing and some values are out of date: it gives Dropbox `#007ee5` and IBM
`#006699`, where the brands' own current sources give `#0061FE` and `#0F62FE`. Where a brand's own source gives a value, that value is used.

Selection (fixed before gathering words): twelve brands, judged only on the first color listed. Six whose color is dark (OKLCH L below 0.40) or muted
(C 0.03 to 0.08), because runs 1 and 2 never produced a dark seed: UPS, Rolls-Royce, Yahoo, American Express, Tumblr, WhatsApp. Six to spread the hue
families not yet covered well: Home Depot (orange), Lamborghini (yellow), Heineken (green), T-Mobile (magenta-red), Delta (red), TripAdvisor (green-cyan).
Words: each brand's own about, mission or values page. Same rules R1 to R3 as runs 1 and 2. The National Park Service is added separately once colors
can be read from the arrowhead artwork.

## Run 3 results (2026-10-01)

Output: [`results-run3.md`](results-run3.md), from `node docs/c10/run.mjs docs/c10/brand-set-run3.json`. Words: [`brand-set-run3.json`](brand-set-run3.json),
taken from each brand's own about, values or careers page. Verbatim words only: no synthesized mapping was made for this run. Colors are the Digital
Synopsis values (secondary, possibly dated).

- **Coverage is much lower for values language:** 15 of 81 words recognized (8 of 81 before D33). Corporate values pages use words like respect,
  integrity, inclusion, excellence, together, committed and right, none of which the studies measured. American Express, Rolls-Royce and Tumblr
  matched nothing. This is the vocabulary of company values, not of brand personality or color, so most of it should stay unknown.
- **R2:** 4 pass (UPS, Home Depot, T-Mobile, Delta), 5 fail, 3 no signal. Home Depot's pass is automatic: its only match, "strong", is a synonym of
  "bold", which carries no hue, and in "strong relationships" it does not mean bold at all. Single-word matching cannot see that context.
- **Dark brands:** of the six chosen for being dark or muted, three gave no signal; for the other three the nearest seed was ΔE00 12.4 (Yahoo purple
  against a blue at L 0.40), 19.1 (WhatsApp) and 22.1 (UPS brown).

**Correction to runs 1 and 2 ("dark colors are never offered").** That holds for the brand runs, but not for the matcher in general: "sophisticated"
returns `#222222` (L 0.25) and "rugged" returns `#2d1f0a` (L 0.25), because their evidence points to black and brown. Traced for "competent": the
blue color-word region starts at L 0.35, the "darker adds competence" lean scores L 0.35 and L 0.40 the same, and the tie is broken toward the
study's measured blue patch (L 0.66), so L 0.40 wins. Dark blues, purples and greens therefore lose ties to lighter ones. Whether that is right is
a C10 question for Kwade: the tie-break is an engineering choice (prefer the measured patch), not a finding.

## After D34 (2026-10-01): dark colors, option C

Kwade compared three options for dark colors (A: unchanged; B: ties follow the lightness lean; C: B plus band floors lowered to L 0.25) on swatches
and chose C for red, green, turquoise, blue and purple. `results.md` and `results-run3.md` are regenerated; run 3 before D34 is not kept as a file,
so its numbers are summarized here.

- No hue-family result (R2) changed in any run.
- Nearest seed to the brand color (lowest ΔE00 over the brand's colors), before → after: closer for Yahoo 12.4 → 6.5, T-Mobile 19.4 → 6.8, UPS
  22.1 → 18.9, IBM (own words) 17.6 → 15.3, Delta 31.4 → 28.0, Mozilla (mapped) 16.6 → 14.5, Kwade 22.9 → 22.6, Atlassian (mapped) 60.7 → 55.6;
  further for Starbucks 12.7 → 17.0, IBM (mapped) 17.6 → 24.7, Mozilla (own words) 19.8 → 25.3, the Guardian (own words) 44.6 → 48.7,
  Tripadvisor 64.9 → 66.8.
- Mixed, then: dark colors are now reachable and come up where the words point to the right hue; mid-tone brands sometimes get a darker seed than
  their color. The Guardian and American Express are still not approached, because their words do not point to blue at all.

## After D35 (2026-10-01): the lean stays inside the tested range

Asked whether any decision broke with the research, Claude found that the D34 tie-break followed the lightness lean past the colors Labrecque &
Milne (2012) tested (darkest blue L 0.30, darkest red 0.42; lightest 0.91). Kwade chose to keep the tie-break inside that range and flag seeds that
still fall outside it. Changes against the D34 numbers above: Starbucks back to 12.7 (both runs), Mozilla (own words) back to 19.8, UPS 18.9 → 22.1,
T-Mobile 6.8 → 19.4 (its dark magenta-red is darker than any red the study tested, so the matcher no longer goes there). Yahoo stays at 6.5. The
results files now mark seeds beyond the tested range.

## Run 4 plan: the National Park Service (written 2026-10-01, before the matcher was run on it)

Added separately from run 3, as run 3's plan said. Set: [`brand-set-nps.json`](brand-set-nps.json); output will be [`results-nps.md`](results-nps.md), from
`node docs/c10/run.mjs docs/c10/brand-set-nps.json`. Same rules R1 to R3.

- **Words:** from the NPS's own mission and core-values page, https://www.nps.gov/aboutus/mission.htm (read twice through a page-summarizing tool;
  both reads agreed, but the page itself was not read by a person). Selection rule, fixed before the run: every content word of the mission
  statement plus every word of the ten core-value headings, each distinct word once; a few generic nouns left out (listed in the JSON). Verbatim
  only; no synthesized mapping. This is corporate-values language, so low coverage is expected (compare run 3).
- **Colors:** the National Park Service Arrowhead. The `arrowhead_use.pdf` supplied is a grayscale layout guide with no color data, so it was not
  used. Kwade eyedropped three colors from the Arrowhead image on nps.gov, because no official digital asset could be downloaded: green `#104334`
  (OKLCH L 0.345, C 0.060, h 169.4), brown `#77390A` (L 0.419, C 0.102, h 51.1), light brown `#B66611` (L 0.590, C 0.134, h 59.1). **Approximate**: they come from a
  web image, not a specification. The NPS's own page publishes Pantone numbers only (PMS 553C green, 1615C mountain, 1605C sky); no Pantone-to-hex
  conversion was used (D6). Which eyedropped color is which element was not confirmed.
- **Rule R2 for this set:** pass if at least one of the top 5 seeds is in the same hue family as any of the three colors (the rule used for
  Mozilla and Kwade's brand). With two families across three colors it is easy to pass; discount it as before.
- **Edge cases known before the run:** the green sits 5.6° inside the green family's edge (cyan starts at 175°); it is also darker (L 0.345) than
  the darkest green Labrecque & Milne tested (L 0.58, D35), so a green seed at the brand's lightness would be outside the tested range.
- No constant is changed during this run.

## Run 4 results: the National Park Service (2026-10-01)

Output: [`results-nps.md`](results-nps.md). Nothing in the matcher, lexicon or bands was changed. One brand supports no rate; the tier for anything here is **low confidence**.

- **Coverage (R1):** 2 of 25 words recognized: "natural" (an approved synonym of grounded, low confidence) and "enjoyment" (an approved synonym of pleasure, supported but contested). That is below run 3 (15 of 81). The other 23 are agency and values vocabulary (service, partnerships, heritage, management, excellent and so on), which the studies did not measure, so this is the expected result for this kind of language (C15).
- **Seeds:** four, not five. All four sit at OKLCH L 0.6, C 0.1 and none is flagged beyond the tested range. Three (orange `#b16c4c`, yellow `#977d30`, green `#668e4f`) come from "grounded" alone, and the cyan `#239382` from "pleasure" alone.
- **R2 (hue family):** pass (orange and green both found). Discount it: the seeds cover four of the eight hue families, and a random choice of four families would include one of the brand's two families about 79% of the time (1 − C(6,4)/C(8,4)).
- **R3 (closeness), nearest seed by ΔE00:** light brown `#B66611` to `#b16c4c` 10.6 (same lightness, hue 14° off, chroma 0.035 lower); brown `#77390A` to `#b16c4c` 19.6 (the seed is 0.18 lighter); green `#104334` to the cyan `#239382` 27.2 (0.25 lighter, hue 11° off). The green seed `#668e4f` was not the nearest.
- **Dark color:** this run does not test the dark-color changes (D34, D35). No word that matched carries a lightness lean, so no seed went darker than 0.6, and the green at L 0.345 was not approached. As noted before the run, it is also below the darkest green the study tested (L 0.58).
- **A reading problem single-word matching cannot see (speculative, one case):** in the mission statement "natural" means the natural world ("natural and cultural resources"), but the matcher reads it as the personality word "natural", which maps to grounded. Three of the four seeds, including the orange that came closest to a brand color, rest on that one word. The same limitation showed in run 3 with "strong" (Home Depot).
- **Color provenance, again:** the colors are eyedropped from a web image (approximate), and the NPS publishes Pantone numbers only. A closeness figure of ΔE00 10.6 is therefore a comparison against a screen sample, not against the specified color.

## Update 2026-10-06 (D37)

After Labrecque & Milne (2012) was checked against the printed tables (C14), two Study 2 nudges were added and the "competent" words got their own royal-blue region. Re-running `node docs/c10/run.mjs` gives the same R2 results (10 pass, 4 fail); R3 closeness changed for 2 of 14 measurements, both for synthesized (speculative) mappings: IBM closer (dE00 24.7 to 15.3) and Starbucks further (12.7 to 30.7). The earlier result files above are unchanged and describe the matcher as it was.
