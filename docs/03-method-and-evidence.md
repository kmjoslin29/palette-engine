# 03 Method and evidence

The full research write-up is in the project's research foundation; this page is the working summary. Each row says what the engine does, how strong
the basis is, and where it stops.

## The four tiers

| Tier | Meaning | How the tool uses it |
| --- | --- | --- |
| Well-established | Standards, measurement science, replicated findings | Deterministic calculations and hard checks |
| Supported but contested | Peer-reviewed effects that depend on context | Ranked suggestions with a stated rationale |
| Low confidence | Weak, small or poorly replicated evidence, or an engineering choice | Optional, labeled |
| Speculative | Convention and folk theory | Shown as convention, never scored |

## Color spaces and the pipeline

| Space | Role | Tier |
| --- | --- | --- |
| sRGB / hex | Screen input and output | Well-established |
| CIELAB D50 | Hub for print, spot color and ΔE (ICC profiles and Pantone reference values use it) | Well-established |
| OKLCH (Ottosson 2020) | Palette generation, hue offsets, gamut mapping | Supported but contested: perceptually even, but young and not a CIE standard |
| HCT (CAM16 hue and chroma with L* tone) | Material 3 tonal palettes and role tones | Supported but contested |

Per color: normalize to Lab D50 and OKLCH; screen outputs (hex, sRGB, OKLCH, HCT) with a P3-only flag; print outputs by lookup table for each profile
under relative colorimetric intent with black point compensation; a gamut check by round trip (screen Lab → CMYK → Lab; flagged when ΔE2000 exceeds 2.0,
a convention); and spot scoring against values the designer supplies.

## Print

There are six print conditions, in two regions (D38). North America: GRACoL 2013 coated (CRPC6, 320% total ink), SWOP 2013 (CRPC5, 300%) and GRACoL 2013 uncoated
(CRPC3, 280%), issued by PRINTING United Alliance. Europe: PSO Coated v3 (FOGRA51, 300%) and PSO Uncoated v3 (FOGRA52, 300%), issued by ECI under ISO 12647-2:2013, and a
FOGRA39 coated file from the ICC Profile Registry (provider VIGC) that states no ink limit inside the file; its registry page lists 260%, which the page uses as the limit (D43); the tables reach 265.4% in seven very dark blue grid points, the profile's own conversion (C23, C31). The region of a condition is where its issuer and standard sit; the three US
registry pages state no region, and the region note on the page is background, not advice for a given job. A browser cannot apply ICC profiles accurately, so a Python step
evaluates each profile with LittleCMS and stores a 33×33×33 grid per profile; the page interpolates (tetrahedral). Measured against LittleCMS on 10,000 random, 500 near-gray
and 500 gamut-edge colors (fixed seed), printed-color ΔE2000 was no higher than 0.15 at the 95th percentile and 0.99 at worst across all six (worst case: PSO Coated v3 on
gamut-edge colors; the first three were 0.14–0.15 and 0.71–0.73), inside the limits set for the build (1.0 and 2.0; both are engineering choices, low confidence). The
JavaScript lookup was also compared with an independent Python implementation on 11,000 colors per profile (`build/make_py_vectors.py`): identical for all six. The share of
colors with identical rounded CMYK is 82–85% for the first three (81.94 to 84.81%) and 81.25% (PSO Coated v3), 77.05% (PSO Uncoated v3) and 83.18% (FOGRA39 file) for the new three, all within 3 points of direct conversion (C32). The same screen color gets different CMYK on different conditions (for
a terracotta: GRACoL coated 3/71/83/26, PSO Coated v3 12/70/80/21, FOGRA39 file 1/69/81/30), mostly in cyan and black, which is why the page shows them side by side. Adobe's color
engine may differ from LittleCMS by about a point (untested).

## Spot color

No openly licensed Pantone Lab dataset exists, and every complete set derives from Pantone's proprietary data, so **none is bundled**. The designer pastes names
and Lab values from a source they are licensed to use; the tool scores Coated and Uncoated separately by ΔE2000 and returns the top three. Match bands (industry
practice, not a standard; supported but contested): under 1 near-identical, 1–2 close, 2–3 acceptable, 3–5 loose, over 5 no good match. Guides drift, so the tool
tells the designer to check against a current physical guide under D50 light. Every name is marked "(approx.)".

## Harmony

| Lens | Basis | Tier |
| --- | --- | --- |
| Tonal structure (Material 3 tonal palettes) | Method tied to contrast maths | Well-established as a method |
| Hue similarity with lightness contrast (empirical) | Ou & Luo 2006 (1,431 pairs); Schloss & Palmer 2011; Deng et al. 2010 (shoe self-design, converging, one product) | Supported but contested; lab patches, not brand contexts |
| Classical wheel geometry (analogous, complementary, split, triadic, square) | Designer vocabulary; Schloss & Palmer report no evidence for hue-contrast harmony; in Deng et al. a minority added one contrasting accent, which fits emphasis roles | Low confidence as a harmony predictor |
| Proportion rules such as 60-30-10 | Convention | Speculative (not offered as a score) |

Hue offsets are computed on the OKLCH wheel and the interface says so, because an artist's RYB wheel gives different complements. An Ou & Luo two-color
score is shown as advisory and labeled "lab-patch model". The equations were checked against the printed paper on 2026-09-29 (see `engine/test_ouluo.mjs`); the paper's own Fig. 6b disagrees with its Eq. (4) at low lightness sums, and the code follows the equation.

## Descriptor words to color

The weakest evidence in the tool, so it narrows a search and does not choose a color.

| Class | Terms | Basis |
| --- | --- | --- |
| Perceptual (18) | warm, cool, heavy, airy, energetic, calm, hard, soft, vivid, muted, light, dark, neutral, pastel, bright, rich, bold, grounded | Ou et al. 2004 color-emotion models where they exist; CIE definitions of chroma and lightness; thresholds are engineering choices |
| Brand personality (20) | Five Aaker dimensions and their 15 facets | Labrecque & Milne 2012 color weights, keeping only results significant at p < .05 and read identically twice; facets inherit the dimension (an inference) |
| Emotion (10) | admiration, amusement, compassion, contentment, interest, joy, love, pleasure, pride, relief | Jonauskaite et al. 2024, rebuilt from the study's raw data with one stated rule; tier depends on the top share |

Color words in the studies reach real colors through a bridge table anchored on the measured patches of Jonauskaite et al. 2020 (i-Perception); the bands
around each patch are low confidence. The shared blue region is anchored on the Jonauskaite patch, a sky blue (hue 233°); the "competent" words use their own
`royal blue` region, anchored on the blue of Labrecque & Milne (2012) Study 1 (OKLCH L 0.44, hue 265; hue 240 in HSL is assumed because the paper gives none), decision D37.

The matcher intersects hard ranges and the Ou models in input order (a term that empties an interval is dropped and reported), scores a grid of real sRGB
colors on soft evidence, and returns 3–5 seeds ranked by evidence only, never padded on a lightness lean alone. Words reach a term directly, through an approved synonym, through a word the source study used, or as a word form ("calming" for "calm"); a near-synonym the studies did not use ("peaceful") also reaches it but lowers the tier one step (D33). Unknown words are flagged, not guessed.

## Accessibility

| Check | Threshold | Role |
| --- | --- | --- |
| Text contrast (WCAG 2.2 SC 1.4.3) | 4.5:1 normal, 3:1 large | Hard gate on role pairs |
| Non-text contrast (SC 1.4.11) | 3:1 for component boundaries and meaningful graphics | Hard gate on UI pairs |
| Use of color (SC 1.4.1) | Not the only signal | Warning when key roles collapse under color-blind views |
| Color-blind simulation | Machado et al. 2009 at full severity, protan, deutan, tritan; roles closer than ΔE2000 10 are flagged | Warning (the threshold is a convention, low confidence) |
| APCA Lc | Advisory readability score | Web content only, never used in print, never a gate (its license limits use, and WCAG 3 is a draft) |
| Print legibility | ΔL* between text and background under the chosen profile | Guide only; WCAG does not apply to print |

WCAG 2.2 is the floor; both the tone-gap logic and the contrast maths run, and WCAG decides. Print gets ΔL* because WCAG does not apply to it.

## Sources (primary, peer-reviewed or standards first)

- W3C, WCAG 2.2 (Recommendation, Oct 2023).
- ICC Profile Registry, GRACoL2013_CRPC6 and companions; PRINTING United Alliance, GRACoL and SWOP.
- Ou, Luo, Woodcock & Wright (2004), Color Research & Application 29(3): colour emotions for single colours.
- Ou & Luo (2006), Color Research & Application 31(3): two-color harmony.
- Schloss & Palmer (2011): preference, harmony and similarity.
- Deng, Hui & Hutchinson (2010), J. Consumer Psychology 20(4), 476-484: color combinations in shoe self-design. See below.
- Valdez & Mehrabian (1994), J. Experimental Psychology: General 123(4), 394-409: effects of saturation, brightness and hue on felt emotion. Corroboration only; see below.
- Suk & Irtel (2010), Color Research & Application 35(1), 64-77, DOI 10.1002/col.20554: emotional response to color on paper and on screen. Corroboration only; the full text was read 2026-10-13 (C28). See below.
- Gao & Xin (2006), Color Research & Application 31(5), 411-417; Gao et al. (2007), Color Research & Application 32(3), 223-229, DOI 10.1002/col.20321; Xin, Cheng, Taylor, Sato & Hansuebsai (2004), Color Research & Application 29(6), 451-457, DOI 10.1002/col.20062; Cheng (2002), PhD thesis, Hong Kong Polytechnic University (read in part): warm-cool and hue. Read 2026-10-13. See "Warm-cool and hue" below.
- Labrecque & Milne (2012), J. Academy of Marketing Science 40: color and brand personality. Aaker (1997), J. Marketing Research 34(3).
- Jonauskaite et al. (2020), Psychological Science 31(10); (2020) i-Perception 11(1); (2024) British J. Psychology 115.
- Machado, Oliveira & Fernandes (2009): color-vision-deficiency simulation (via culori).
- Context only (secondary): Sanad (2017), "A study of the factors affecting colour meaning and emotional response", New Trends and Issues Proceedings on Humanities and Social Sciences 4(11), 11–22 (6th World Conference on Design and Arts, Zagreb, 2017). A literature review; see below.
- Context only (secondary): Elliot (2015), Frontiers in Psychology 6:368 (open access), and Elliot & Maier (2014), Annual Review of Psychology 65, 95-120: reviews of color and psychological functioning. Reviewed; no number used. See below.
- Ottosson (2020), Oklab. CIE S 017:2020, International Lighting Vocabulary.
- Material Design 3: color system and the science of color.
- Lower weight: practitioner notes on Pantone drift and Adobe's license change (Adobe help, TidBITS, insights4print, PrintPlanet), and commentary on WCAG 3
  contrast status (Adrian Roselli, April 2026).

Machado et al. (2009) is cited from library documentation and general knowledge and was not re-derived here. The Aaker facet names were checked against a
secondary summary because the article is paywalled.

### Context reference: Sanad (2017)

Sanad (2017) is a literature review, not new data, and it is used only as context. Nothing in the lexicon, the matcher or any score takes a number from it. What it
is used for:

- **The page's context note.** The footer says the findings are averages across the people studied, and that age, culture, design training and the setting a
  color appears in can shift how it is rated. The review lists those moderators (its sections 2.3 to 2.14). Supported but contested: it summarizes studies
  whose effects vary by scale (gender differences, for example, are small for most scales).
- **Consistency with checked sources.** Its summary of Ou et al. (2004) Part I (warm-cool from hue and chroma, heavy-light from lightness, active-passive from
  distance from a mid-grey, hard-soft from lightness and chroma; poor British-Chinese agreement on tense-relaxed and like-dislike) agrees with what was checked
  against the paper itself (X11, C17).
- **The tension it raised (C25), now settled by reading the primary papers.** It says Gao & Xin (2006) found hue insignificant even for the warm-cool scale, while Ou et al. (2004) put a hue term in warm-cool
  (the cos(h − 50°) term behind the hue lean of "cool"), and cites Xin et al. (2004) for warm-cool being the exception where hue does matter. The review reports each paper correctly; see "Warm-cool and hue" below.

Limits: the review is secondary. Where its figures could be compared they were loose (it attributes "11 colours" to Ou et al.'s two-colour paper, while the
single-colour paper used 20 patches), so do not cite its numbers without the primary papers. The author's contact details are not recorded here.

### Converging source: Deng, Hui & Hutchinson (2010)

Deng et al. (J. Consumer Psychology 20(4), 476-484; the pages are from listings, since the copy read is an in-press proof) had 142 people design a Nike shoe in the NIKEiD configurator: seven parts and 16 colors in all, with 6 to 12 per part. The authors model how often two colors are chosen together as a function of their city-block distance in CIELAB, with a lightness weight estimated at w = .084 (lightness differences count little) and a term for identical colors.

- **Found:** identical or close colors were chosen far more than distant ones (the identical-match term was positive in 20 of 21 pairs of parts and significant in 13; the distance term was negative in all 21 and significant in 15). There was no support for a preference for moderately different colors. A large minority added one contrasting color to a single part, mostly the shox. The average design used 4.02 colors against 5.48 expected by chance. The model predicted liking of professional designs only weakly (mean Spearman .11).
- **Used for:** a converging source in the hue-similarity row (with Ou & Luo 2006 and Schloss & Palmer 2011), with the tier held at supported but contested; and as behavioral support in the classical-geometry row for emphasis roles. The small-palette finding is low confidence and changes nothing: the engine does not cap palette size.
- **Limits:** one product; choices from a fixed 16-color palette that includes several neutral and muted colors, so "close" often means both are muted (a reading of its Table 1, not stated by the authors); revealed choice, not harmony ratings; weak predictive validity. It tests CIELAB distance, not wheel geometry, so it neither tests nor supports complementary schemes.

### Corroboration only: Valdez & Mehrabian (1994)

Valdez & Mehrabian (J. Experimental Psychology: General 123(4), 394-409) showed Munsell chips on a mid-grey card under 5,000 K light and rated them on pleasure, arousal and dominance scales. Study 1 had 250 undergraduates rating 76 chips (about 25 raters per chip, with the regressions run on chip means); Study 2 had 121 rating 50 chips that varied in hue only; Study 3 had 25 rating five greys.

- **Found:** saturation and brightness had strong, consistent effects (arousal = -.31 brightness + .60 saturation, R = .73; pleasure rose with brightness more than with saturation). Hue effects were weak except for pleasure. The authors say red's reputation for arousal in earlier work comes from the high saturation of the red chips used, not from its hue.
- **Used for:** corroboration of direction only. It agrees with Ou's active-passive model behind `energetic` and `calm` (distance from mid-grey, no hue term), and in direction with the saturation and darkness nudges from Labrecque & Milne (2012). Those measure different things (felt arousal and dominance against brand personality), so the agreement is not validation. No row, tier or number changes. It did not rate warmth, so it does not settle C25.
- **Limits:** US undergraduates; Munsell values, not CIELAB; the PAD scales are not the engine's words.
- **Also pointing the same way:** Suk & Irtel (2010); see the next section.

### Corroboration only: Suk & Irtel (2010)

Suk & Irtel (Color Research & Application 35(1), 64-77, DOI 10.1002/col.20554; the pages are from listings, since the copy read is an in-press proof with no page numbers). Supplied by Kwade and read in full 2026-10-13 (the text, tables and figures; not its reference list). Two experiments used the same 36 stimuli, defined in CIELAB LCh from the RAL Design System: 25 chromatic (hue angles 30, 80, 160, 260 and 320 degrees, each in five tones the authors call dark, deep, vivid, brilliant and light, with L from 20 to 80 and C from 20 to 90) and 11 achromatic (black, white, three greys, and warm and cool greys). People rated each color on 5-point Self-Assessment Manikin scales for valence, arousal and dominance. Experiment I used printed A5 glossy sheets in daylight: 37 Mannheim students (28 women, mean age 23.6), 36 analysed. Experiment II used calibrated CRT monitors in a dimmed room: 48 recruited, 46 analysed (mean age 24.4), different people.

- **Found (Experiment I unless noted):**
  - Cronbach's alpha was .77 for valence, .89 for arousal and .70 for dominance (Experiment II: .79, .88, .90), so the three scales hold together as a profile.
  - **Chroma:** the four chroma levels (achromatic, then the dark and light tones, the deep and brilliant tones, and the vivid tones) correlated positively with all three scales: r = .67 for valence, .54 for arousal, .45 for dominance (p < .01). How many data points the correlation used is not stated.
  - **Hue:** a small but significant effect on all three (valence F(2.93, 102.54) = 3.35, p = .02; arousal F(4, 140) = 3.41, p = .02; dominance F(4, 140) = 2.76, p = .04). Blue was rated more positive and more dominant than the other hues, and less arousing. Table IV prints the arousal and dominance degrees of freedom as (4, 14); Figure 5 gives 140.
  - **Tone (chroma and lightness together):** larger effects (valence F(2.25, 78.57) = 8.91, arousal F(3.08, 107.70) = 28.95, dominance F(2.43, 85.06) = 6.78, all p < .001). The authors say the spread of mean ratings across tones was larger than across hues on all three scales. Vivid colors were rated the most positive, most aroused and most dominant.
  - **Lightness:** analysed on the achromatic colors only, because lightness and chroma are confounded in the chromatic tones. Ratings followed a U-shape from black through three greys to white; a quadratic fit explained 14.9% of the variation in valence and 7.4% in dominance (arousal was not significant), and the authors call the evidence too weak to conclude.
  - **Greys:** cool greys (hue 260, chroma 10) were rated more positive and more dominant than warm greys (hue 80, chroma 10), with an interaction with lightness for valence (F(4, 140) = 2.86, p = .03).
  - **Paper against screen:** no significant difference between the two media on any scale (Table V, p = .93, .41, .32). Color by color, 7 of 36 differed in valence, 5 in arousal and 2 in dominance in the results text (5 to 6 of the 108 tests would be expected by chance); violet colors differed most, rated less positive, less excited and less dominant on screen.
- **Used for:** corroboration of direction only. Chroma raising arousal and the weak, uneven hue effects agree in direction with Valdez & Mehrabian (1994), and the small hue effect is consistent with Ou's active-passive model behind `energetic` and `calm` having no hue weight. The tier stays where it is; this adds a second study, from a different lab, with the limits below. No row, tier or number changes.
- **Not claimed:** it did not rate warmth, so the cool-grey result is about valence and dominance, not perceived warmth, and does not settle C25. Its dark tones are also low in chroma, so it cannot separate darkness from low chroma and says nothing about the engine's darkness nudges. The similar ratings on paper and screen are about emotional ratings of the same nominal LCh values, not about the colors looking the same; the footer's sentence that colors on screen or in print can look different stands.
- **Limits:** German-speaking university students, mostly women in Experiment I. Five hue angles and fixed tones the authors chose, so "tone matters more than hue" depends on how the stimuli were sampled (a reading, not stated by the authors). The two media used different people, rooms and viewing conditions, and a non-significant medium effect is not proof that the media are equivalent (no equivalence test was run). The paper is internally loose: its abstract says chroma correlated above .60 with each scale, but the body gives .54 and .45 for arousal and dominance (the discussion gives .55 and .46), so cite the body; the discussion gives alpha .70 for arousal where the results give .89; the results text counts 7, 5 and 2 colors that differ between media while the general discussion implies 6, 5 and 3. The text calls black and white "around 3.0" while Table VI gives valence 2.47 for black and 3.33 for white.
- **Related earlier paper:** Suk & Irtel (2008), Kansei Engineering International 7(2), 181-188, rates 36 colors with 46 people, the same counts as Experiment II here. It may report the same data; it was not read, and nothing depends on it.

### Context references: Elliot (2015) and Elliot & Maier (2014)

Both review how color affects psychological functioning (performance, attraction, consumer behavior). Read 2026-10-13 (Elliot & Maier's text, not its reference list). Reviewed; no number from either is used anywhere in the engine.

- **Lead context reference for the caution:** both say the field is at an early stage and that findings depend on context. Most studies show one color on prepared stimuli in a lab. This is dated to 2014-2015; later work was not checked. Sanad (2017) stays for the list of moderators, including design training, which Elliot does not list.
- **Basis for the footer's controlled-stimuli sentence (C27):** uncalibrated software, screens and printers give unknown color differences, and everyday use of colors together is described as largely untested.
- **Corroboration:** Table 1 of Elliot (2015) lists blue on stores and logos raising quality and trust appraisals, the same direction as the `competent` words from Labrecque & Milne (2012). The table keeps only findings supported by five or more labs (the author's own rule) and lists the non-replications.
- **Not claimed:** Elliot & Maier report many studies and mostly null results for the idea that long-wavelength colors are more arousing, especially in rigorous studies. The lexicon makes no such claim: `energetic` and `calm` use Ou's active-passive model with no hue weight, and `warm` and `cool` measure perceived warmth. Do not add the red-performance or red-attraction findings.
- **Limits:** a large share of the cited studies are by the authors and their collaborators.

### Warm-cool and hue (C25, closed 2026-10-13)

The question: does hue matter for warm-cool? Sanad (2017) said Gao & Xin (2006) found hue insignificant even for warm-cool, while Ou et al. (2004) put a hue term (cos(h − 50°)) in warm-cool and Xin et al. (2004) is cited for warm-cool being the exception where hue does matter. The primary papers were read on 2026-10-13 (copies supplied by Kwade).

- **Gao & Xin (2006)**, Color Research & Application 31(5), 411-417: 70 Hong Kong students, 218 dyed-polyester samples (SCOTDIC, a textile Munsell system) behind a mid-gray mask in a D65 booth, forced choice between the two words of each pair. Warm-cool is driven mainly by chroma (r 0.80 with C*; a quadratic in C* gives R² 0.68), and the paper reports no significant hue influence. That conclusion rests on a linear correlation with hue angle (r −0.19, Table V) and on cluster plots. A linear correlation with a circular angle cannot detect an effect shaped like cos(h − 50°), so the test does not rule out the effect Ou's term encodes (a reading, not the paper's claim).
- **Gao et al. (2007)**, Color Research & Application 32(3), 223-229: the same team and 214 of the same samples, seven regions (Hong Kong 70, Japan 80, Thailand 60, Taiwan 56, Italy 56, Spain 56, Sweden 62 observers). Warm-cool loads on the hue factor (Factor 3) as well as on the chroma factor in every region: Factor 3 loadings 0.57 Hong Kong, 0.81 Japan, 0.70 Thailand, 0.80 Spain, 0.85 Taiwan, 0.45 Italy, 0.82 Sweden (Table III). Factor 3 is positive for Munsell R, YR, Y and RP, negative for G, BG, B, PB and the neutrals, and near zero for GY and P (Fig. 3c), yet its linear correlation with hue angle is only r −0.13 (Table IV): the same blind spot as the 2006 test. The authors conclude that warm-cool depends on both hue and chroma, with chroma more important in Hong Kong and Italy, hue decisive in Japan, Taiwan, Sweden and Spain, and the two about equal in Thailand.
- **Xin et al. (2004)**, "Cross-regional comparison of colour emotions. Part I: Quantitative analysis", Color Research & Application 29(6), 451-457: Hong Kong 70, Japan 80 and Thailand 60 observers (ages around 20), the same 218 samples, 12 word pairs scored as a percentage of choices. Three regions; there is no UK data in this paper. Its conclusion is that hue has much less effect than lightness and chroma on colour emotions in general, "except for warm–cool, which was more evidently influenced by hue". Table V lists chroma as the dominant parameter for warm-cool in all three regions, with a slight hue influence in each and no dominant lightness effect. The warm-cool models are in two halves of the hue angle (0-180° and 180-360°), each with a linear hue term (Table III). Computed from the coefficients, the hue term at h 180° against chroma from C* 0 to 60 is 0.30 and 0.21 (Hong Kong), 0.29 and 0.62 (Japan), 0.49 and 0.82 (Thailand), for the two halves. In the text: high-chroma colors were always assessed as warm; reddish and orange colors as warm and bluish colors as cool in all three regions, with deviations. Japanese subjects rated whiter and bluer colors cool (L* 75, C* 41, h 184: WC −36, against 8 for Hong Kong); Thai subjects also rated greenish colors cool (L* 75, C* 40, h 171: −26, against 1 and 3); Hong Kong subjects saw some high-chroma blues as relatively hot. The authors tie these to climate (blue with snow and water, green with Thai vegetation); that explanation is theirs and was not tested. One sentence says that "grayish colours are most likely to be cooler and not so much related to the hue of a colour"; it follows the Hong Kong passage and the text does not say whose result it reports.
- **Cheng (2002)**, PhD thesis, Hong Kong Polytechnic University, supervised by Xin, read in part (pp. 82-90, 139-151): the thesis behind Xin et al. (2004), with the same three regions plus a UK study that the paper does not report. Every regional warm-cool model includes a hue term, linear in hue angle on each half of the circle, warmest near h 0° and coolest near 180° (CIELAB): a placement the form of the model imposes, not a finding. The hue-to-chroma ratios from the thesis agree with those computed from the 2004 paper for the three shared regions (UK: 0.43 and 1.37). The thesis also prints a second warm-cool formula from the Japanese group built on cos(h − 55°), not checked further.
- **Ou et al. (2004) Part I, Tables VIII-X** (read 2026-10-11): Sato et al.'s warm-cool formula is also built on a cosine of hue distance from 50° and predicts Ou's data at R² .69 (agreement between the Ou and Sato models .74). Xin & Cheng (2000, JSPS Fund Meeting; piecewise in h) predicts it at R² .45 (agreement with Ou's model .26, with Sato's .54). Warm-cool is the scale where the three models agree least, although the paper's text calls the agreement good overall.
- **Did not settle it:** Valdez & Mehrabian (1994) and Suk & Irtel (2010) did not rate warmth. Na & Suk (2014), International Journal of Design 8(2), 61-70, on shades of white, was identified from its page only and not read in full; it uses other scales.

**What it says.** Sanad's sentences are reported correctly, but Gao & Xin's hue test is weak, and the same team's larger studies find a hue effect on warm-cool: bluish colors are cool in every region of Xin et al. (2004), greenish ones only in the Thai data, and Hong Kong subjects rated some high-chroma blues relatively hot. The direction of the "cool" hue lean (cyan 0.83, blue 0.80; purple 0.25 and green 0.13 until D42 raised them to 0.55 and 0.35) holds; how much hue counts next to chroma differs by region. Lightness is not a dominant parameter for warm-cool in any region of Xin et al. (2004), which agrees with the engine's warm-cool model having no lightness term; the second-hand claim (Mehrabian & Russell 1974, noted from Valdez & Mehrabian) that warmth falls with brightness is not supported there. Limits: textile or paper samples, small samples around age 20, forced-choice scoring, and mostly East Asian observers (Gao et al. 2007 adds Italy, Spain and Sweden). Tiers unchanged.

**Grays and decision D40.** All four sources rate grayish and low-chroma colors as cool: Gao & Xin (2006) (ratings from C* 0 to 20 run from extremely cool to neutral), Gao et al. (2007) (neutrals negative on Factor 3), Xin et al. (2004) (the sentence above), and Ou's own warm-cool model (grays about −0.5). The lean on "cool" was added in phase 3 (D19) so that grays no longer rank as cool; that was a design choice, not something these studies support. Kwade decided on 2026-10-13 to allow grays back in (D40). Made in pe-update42 (C33, option C of three shown to Kwade): the neutral family gets a hue weight of 0.38 on the "cool" row, so a true gray is offered after cyan and blue (cyan 0.83, blue 0.80, neutral 0.38, purple 0.25, green 0.13). 0.38 is 0.80 × (0.50 / 1.05): Ou's mean cool score (−WC) over the matcher's sRGB grid is 0.50 for the neutral family and 1.05 for blue, with the blue weight kept at 0.80; it is an engineering choice (low confidence). Two alternatives were rejected: dropping the lean (the row then has no hue evidence and the seeds spread over all hues, including pinkish browns), and re-deriving every weight from Ou's WC (which would also put blue above cyan and raise purple and green to 0.62 and 0.42; that is a larger change than D40 and was left as C34, decided in D42 below). The same grid means give cyan 0.97, blue 1.05, purple 0.82, green 0.55 and magenta 0.32, so the purple and green weights in use then were low next to Ou's model (D42 below). A matcher detail came with it (D41): neutral points are treated as true grays when seeds are chosen, so a gray seed is a true gray (for example #808080) and not the faintly pink point (#8b7b80, WC −0.40 against −0.50 for a true gray) that won on a tie before. This also makes the seeds for "neutral" and other range-only gray queries true grays.

**Purple and green, decision D42.** Kwade chose option B of three on 2026-10-13 (C34): purple goes from 0.25 to 0.55 and green from 0.13 to 0.35; cyan 0.83, blue 0.80 and neutral 0.38 stay. A second calculation the same day (Ou's mean cool score, −WC, over in-gamut sRGB colors in each family's OKLCH hue band, at L 0.30 to 0.85 and at L 0.50 to 0.70, C at least 0.08; CIELAB D65 assumed) gave purple 0.81 to 0.84, green 0.52 to 0.53, neutral 0.50 and magenta 0.21 to 0.24, against blue 1.19 to 1.24 and cyan 1.12 to 1.17. It reproduced the earlier figures for purple, green, neutral and magenta (0.82, 0.55, 0.50, 0.32) but not the earlier blue and cyan (1.05, 0.97), so the cyan, blue and neutral weights were not re-derived. Scaled so that blue stays 0.80, purple comes to 0.54 to 0.62 and green to 0.35 to 0.42 depending on the grid; the lower values, from the second calculation, were used. Rejected: option C (also cyan 0.78, neutral 0.34 and a magenta weight of 0.15), which puts blue above cyan for plain "cool" and brings in magenta seeds, on numbers the two grids disagree about. Option A (leave as is) would have kept the gray, whose weight came from this same calculation, above purple and green for no stated reason. Effect over the 1,176 single and paired queries: 46 changed, all of them containing "cool", none lost a seed, 11 changed their set of families; "cool" alone now offers cyan, blue, purple, gray, green. Limits: a family weight is an average, and inside a family the score varies with hue (the lime #5aa61b that "cool, bold" offers scores about 0.09 on Ou's scale, against 0.52 for the green family mean); Ou et al. (2004) is a model fitted on color patches; and Xin et al. (2004) puts hue behind chroma for warm-cool. An engineering choice, low confidence.

### Reviewed, not used

**Karthikeyan & Joy (2018), "An Exploratory study on Colour Psychology in Marketing: A technoleadership Perspective", International Journal of Research in Social Sciences 8(9), 65-92.** Supplied by Kwade 2026-10-09. Read in full; nothing from it is used in the lexicon, the matcher, the tiers or the page copy.

Reasons:

- It adds no primary data. Its figures are credited to Wikipedia and a marketing blog, and two statistics ("up to 90%" of snap judgments from color, "93%" of shoppers) have no source given.
- The extracted text has page headers from other works inside running paragraphs and inside the reference list (a color-psychology overview chapter and a paper on red and performance). That may mean material was reused; it was not checked against those works.
- Several in-text citations (for example Rutchick et al. 2010, Hagemann et al. 2008, Elliot & Maier 2014) are missing from its reference list.
- Its Aaker (1997) diagram repeats what C16 checked against the primary paper, and its brand-color associations repeat Labrecque & Milne (2012), which the lexicon already uses.
- The journal's standing was not checked (low confidence). An impact factor is printed in the header with no source given.

It was useful only for pointing to the sources in C26. The author's contact details are not recorded here.
