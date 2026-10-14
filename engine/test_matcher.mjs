import fs from 'node:fs';
import { indexLexicon, matchTerms, matchDescriptors, ouScores, TIER_RANK, WORD_FORMS, lowerTier, leanTestedRange } from './matcher.js';
const lex = JSON.parse(fs.readFileSync(new URL('../data/lexicon.json', import.meta.url)));
const ix = indexLexicon(lex);
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fails++; };
const show = (r) => r.seeds.map((s) => `${s.hex}/${s.family}(${s.score})`).join(' ');

// Ou JS mirror = Python. culori and color-science use slightly different D65 constants: measured Lab difference is
// at most 0.004 in L and 0.02 in a/b, so scores agree to under 0.001; the test allows 0.002.
const v = JSON.parse(fs.readFileSync(new URL('./ou_vectors.json', import.meta.url)));
let max = 0; v.hex.forEach((h, i) => { const s = ouScores(h); for (const k of ['ou2004.WC', 'ou2004.HL', 'ou2004.AP', 'ou2004.HS']) max = Math.max(max, Math.abs(s[k] - v[k][i])); });
check(`Ou models: JS matches Python over ${v.hex.length} colors (max diff ${max.toExponential(1)}, limit 2e-3)`, max < 2e-3);

// Term matching
const m = matchTerms('Calm, trustworthy and up-to-date; sparkly', ix);
check('synonyms and multi-word terms match, unknown words are flagged', m.matched.map((x) => x.term).join() === 'calm,reliable,up-to-date' && m.unknown.join() === 'sparkly', JSON.stringify(m));
check('every synonym in the lexicon resolves to its own row', lex.rows.every((r) => [r.term, ...r.synonyms].every((w) => matchTerms(w, ix).matched[0]?.id === r.id)));
check('hyphen and space variants match ("upper class", "upper-class")', matchTerms('upper class', ix).matched[0]?.id === matchTerms('upper-class', ix).matched[0]?.id);
check('nothing matched: no seeds and a plain note', matchDescriptors('zzz qqq', ix).seeds.length === 0);

// M8 pass condition 1: deterministic
const a = JSON.stringify(matchDescriptors('trustworthy, calm, modern', ix)), b = JSON.stringify(matchDescriptors('trustworthy, calm, modern', ix));
check('same input gives the same output', a === b);

// Seeds: 3-5, each lists supporting/conflicting terms and lowest tier
const r1 = matchDescriptors('trustworthy, calm', ix);
console.log('INFO  trustworthy, calm ->', show(r1));
check('3-5 seeds', r1.seeds.length >= 3 && r1.seeds.length <= 5, String(r1.seeds.length));
check('each seed lists supporting, conflicting and lowest tier', r1.seeds.every((s) => Array.isArray(s.supporting) && Array.isArray(s.conflicting) && s.lowestTier in TIER_RANK));
check('lowest tier is the weakest supporting term', r1.seeds.every((s) => s.supporting.length === 0 || TIER_RANK[s.lowestTier] === Math.min(...s.supporting.map((x) => TIER_RANK[x.tier]))));
check('each seed carries an accessibility block; ranks follow evidence score only', r1.seeds.every((s) => s.accessibility && typeof s.accessibility.vsWhite === 'number') && r1.seeds.every((s, i, arr) => i === 0 || arr[i - 1].score >= s.score - 1e-9) );

// Hue evidence steers seeds: "exciting" (red +), "competent" (blue +, yellow -)
const ex = matchDescriptors('exciting', ix); console.log('INFO  exciting ->', show(ex));
check('"exciting" puts a red family seed first (Labrecque & Milne)', ex.seeds[0].family === 'red', ex.seeds[0].family);
const co = matchDescriptors('competent', ix); console.log('INFO  competent ->', show(co));
check('"competent" puts a blue-side seed first and no yellow seed', ['blue', 'cyan'].includes(co.seeds[0].family) && co.seeds.every((s) => s.family !== 'yellow'), co.seeds.map((s) => s.family).join());
const lv = matchDescriptors('love', ix); console.log('INFO  love ->', show(lv));
check('"love" leads with red or pink-region seeds (Jonauskaite 2024)', ['red', 'magenta'].includes(lv.seeds[0].family), lv.seeds[0].family);
const co2 = matchDescriptors('cool', ix); console.log('INFO  cool ->', show(co2));
check('"cool" leads with cyan and blue; the other seeds are neutral, purple or green (D40: grays allowed)', ['cyan', 'blue'].includes(co2.seeds[0].family) && ['cyan', 'blue'].includes(co2.seeds[1].family) && co2.seeds.every((s) => ['cyan', 'blue', 'neutral', 'purple', 'green'].includes(s.family)), co2.seeds.map((s) => s.family).join());
const gr = co2.seeds.find((s) => s.family === 'neutral');
check('"cool" offers a gray, and it is a true gray (equal R, G, B), not a tinted one (D40, D41)', !!gr && /^#([0-9a-f]{2})\1\1$/.test(gr.hex), gr?.hex);
check('the gray comes after cyan, blue and purple and before green, as the weights place it (0.83, 0.80, 0.55, 0.38, 0.35; D41, D42)', co2.seeds.map((s) => s.family).join() === 'cyan,blue,purple,neutral,green', co2.seeds.map((s) => s.family).join());
check('"cold" and "crisp" give the same seeds as "cool"', ['cold', 'crisp'].every((w) => show(matchDescriptors(w, ix)) === show(co2)));
const gq = ['neutral', 'light, neutral', 'dark, neutral'];
check('range-only gray queries return three or more true grays ("neutral", "light, neutral", "dark, neutral")', gq.every((q) => { const r = matchDescriptors(q, ix); return r.seeds.length >= 3 && r.seeds.every((s) => /^#([0-9a-f]{2})\1\1$/.test(s.hex)); }), gq.map((q) => show(matchDescriptors(q, ix))).join(' | '));

// Hard ranges + Ou models are honored by every seed
const vd = matchDescriptors('vivid, dark', ix);
check('vivid + dark: every seed has C >= 0.15 and L <= 0.40', vd.seeds.length > 0 && vd.seeds.every((s) => s.oklch.c >= 0.15 - 1e-9 && s.oklch.l <= 0.40 + 1e-9), show(vd));
const hv = matchDescriptors('heavy', ix);
check('heavy: every seed is Ou HL > 0', hv.seeds.every((s) => ouScores(s.hex)['ou2004.HL'] > 0));

// Conflicts
const c1 = matchDescriptors('light, dark', ix);
check('light + dark is a reported range conflict; the later term is dropped', c1.conflicts.some((c) => c.type === 'range') && c1.dropped.includes('dark') && c1.seeds.every((s) => s.oklch.l >= 0.8 - 1e-9), JSON.stringify(c1.conflicts));
const c2 = matchDescriptors('rugged, sophisticated', ix);
check('rugged + sophisticated: hue conflict on purple is reported', c2.conflicts.some((c) => c.type === 'hue' && c.word === 'purple'), JSON.stringify(c2.conflicts.map((c) => c.detail)));
check('a seed in a conflicted family lists the conflicting term', (() => { const s = c2.seeds.find((x) => x.conflicting.length); return !s || s.conflicting.every((k) => k.contribution < 0); })());

// No hue evidence: spread, flagged
const nh = matchDescriptors('calm, light', ix);
check('range-only words: seeds are spread across hues and the note says hue is the designer\'s call', nh.noHueSignal && new Set(nh.seeds.map((s) => s.family)).size >= 3 && /hue is your call/i.test(nh.note), show(nh));


check('all seeds are valid sRGB hex', ['exciting', 'competent, calm', 'love, joy', 'vivid'].every((q) => matchDescriptors(q, ix).seeds.every((s) => /^#[0-9a-f]{6}$/.test(s.hex))));
// Seed sanity (a first draft passed every check above yet returned near-black seeds and padded the list)
const queries = ['trustworthy, calm', 'competent', 'exciting', 'love', 'cool', 'rugged', 'sincere, warm', 'joy', 'vivid, bold', 'muted, soft', 'reliable, modern'];
const res = Object.fromEntries(queries.map((q) => [q, matchDescriptors(q, ix)]));
for (const q of queries) console.log('INFO ', q.padEnd(20), '->', show(res[q]), res[q].note ? '| ' + res[q].note : '');
check('no seed is near-black or near-white (OKLCH L within 0.25-0.95)', queries.every((q) => res[q].seeds.every((s) => s.oklch.l >= 0.25 - 1e-9 && s.oklch.l <= 0.95 + 1e-9)));
check('seeds are never padded on a lightness lean alone: every seed has positive hue evidence, and variants score at least half the top',
  queries.every((q) => res[q].noHueSignal || res[q].seeds.every((s, i, arr) => s.supporting.some((t) => t.contribution > 0) && (arr.findIndex((x) => x.family === s.family) === i || s.score >= 0.5 * arr[0].score - 1e-9))));
check('evidence-led seeds all carry at least one supporting term', queries.every((q) => res[q].seeds.every((s) => s.supporting.length > 0)));
check('"competent" gives blue seeds with more than one lightness (variants, not one color)', new Set(res.competent.seeds.map((s) => s.oklch.l)).size >= 2 && res.competent.seeds.every((s) => s.family === 'blue'));
check('"trustworthy, calm": every seed is blue and honors Ou passive (AP < 0)', res['trustworthy, calm'].seeds.every((s) => s.family === 'blue' && ouScores(s.hex)['ou2004.AP'] < 0), show(res['trustworthy, calm']));
check('seeds are distinct colors', queries.every((q) => new Set(res[q].seeds.map((s) => s.hex)).size === res[q].seeds.length));
check('an evidence-poor query says so instead of padding', res.rugged.seeds.length >= 1 && (res.rugged.seeds.length >= 3 || /meet the evidence/.test(res.rugged.note || '')));

// Word forms, study words and strong synonyms (added 2026-09-30, C15)
const one = (w) => matchTerms(w, ix).matched[0];
const rowOf = (term) => lex.rows.find((r) => r.term === term);
const forms = { calming: 'calm', empathy: 'compassion', humor: 'amusement', interesting: 'interest', confidently: 'successful', happiness: 'joy', darker: 'dark', bolder: 'bold', trusted: 'reliable', kindness: 'compassion' };
const formMiss = Object.entries(forms).filter(([w, t]) => one(w)?.term !== t || one(w)?.tier !== rowOf(t).tier);
check('word forms reach their row at the row\'s own tier (calming, empathy, humor, interesting, ...)', !formMiss.length, JSON.stringify(formMiss));
check('blocked look-alikes stay unknown ("really" is not "real")', matchTerms('really', ix).unknown.join() === 'really');
check('every irregular word form points at a word in the lexicon', Object.values(WORD_FORMS).every((w) => ix.phrases.has(w)), Object.values(WORD_FORMS).filter((w) => !ix.phrases.has(w)).join());
const crossRow = [];
for (const [p, v] of ix.phrases) { if (p.includes(' ')) continue; for (const suf of ['s', 'es', 'ing', 'ed', 'ly', 'ness', 'er', 'est']) { const w = p + suf; if (ix.phrases.has(w)) continue; const m = one(w); if (m && m.id !== v.row.id) crossRow.push(`${w}: ${v.row.term} vs ${m.term}`); } }
check('no inflection of a lexicon word lands on a different row', !crossRow.length, crossRow.join('; '));
check('a hyphenated word is matched whole or flagged whole ("soft-hearted" is not "soft")', matchTerms('soft-hearted', ix).matched.length === 0 && matchTerms('soft-hearted', ix).unknown.length === 1);
check('hyphenated study word matches whole ("hard-working" -> reliable, row tier)', one('hard-working')?.term === 'reliable' && one('hard-working')?.tier === rowOf('reliable').tier && !one('hard-working').strong);
const pc = one('peaceful');
check('a strong synonym matches and lowers the tier one step ("peaceful" -> calm)', pc?.term === 'calm' && pc.strong && pc.tier === lowerTier(rowOf('calm').tier) && pc.tier !== rowOf('calm').tier, JSON.stringify(pc));
const pr = matchDescriptors('peaceful', ix);
check('the lowered tier reaches the seed cards', pr.seeds.length > 0 && pr.seeds.every((s) => [...s.supporting, ...s.conflicting, ...s.unaddressed].filter((t) => t.term === 'calm').every((t) => t.tier === pc.tier)));
check('a direct match outranks a strong-synonym match of the same row, in either order', ['peaceful, calm', 'calm, peaceful'].every((q) => { const m = matchTerms(q, ix).matched; return m.length === 1 && !m[0].strong && m[0].tier === rowOf('calm').tier; }));
check('weak and adjacent words stay unknown (helpful, human, simple)', matchTerms('helpful, human, simple', ix).unknown.join() === 'helpful,human,simple');
check('lowerTier steps down and stops at speculative', lowerTier('well-established') === 'supported but contested' && lowerTier('low confidence') === 'speculative' && lowerTier('speculative') === 'speculative');
const z = matchDescriptors('bold, cheerful, down-to-earth', ix);
check('when no color meets the words together, the note says so plainly and names the limiting term (no "Only 0")', z.seeds.length > 0 || (/No color meets/.test(z.note) && /"bold"/.test(z.note) && !/Only 0/.test(z.note)), z.note);
// Dark colors (D34, C10 option C): lowered band floors plus the lean tie-break
const comp = matchDescriptors('competent', ix).seeds;
check('"competent" offers a dark blue (a seed at OKLCH L 0.30 or below)', comp.some((x) => x.family === 'blue' && x.oklch.l <= 0.30 + 1e-9), show({ seeds: comp }));
const lean = matchDescriptors('reliable, calm', ix).seeds[0], anchor = matchDescriptors('reliable, calm', ix, { tieBreak: 'anchor' }).seeds[0];
check('a darker-leaning query breaks ties toward the darker color (default), not toward the lighter measured patch', lean.oklch.l < anchor.oklch.l, `${lean.hex} vs ${anchor.hex}`);
const cheer = matchDescriptors('cheerful', ix).seeds, cheerA = matchDescriptors('cheerful', ix, { tieBreak: 'anchor' }).seeds;
check('a lighter-leaning query breaks ties toward the lighter color', Math.max(...cheer.map((x) => x.oklch.l)) >= Math.max(...cheerA.map((x) => x.oklch.l)) && cheer.reduce((t, x) => t + x.oklch.l, 0) > cheerA.reduce((t, x) => t + x.oklch.l, 0));
// The lean is only followed inside the lightness Labrecque & Milne (2012) Study 2 tested (D35)
const tr = leanTestedRange(lex.families);
check('tested lightness ranges come from the study stimuli (blue 0.30-0.71, red 0.42-0.78, pooled 0.30-0.91)', tr.byFamily.blue.join() === '0.3,0.71' && tr.byFamily.red.join() === '0.42,0.78' && tr.pooled.join() === '0.3,0.91', JSON.stringify(tr));
check('the dark tie-break stops at the darkest tested lightness ("competent" top seed at L 0.30, not 0.25)', Math.abs(comp[0].oklch.l - 0.30) < 1e-9 && comp[0].beyondTested === null, JSON.stringify(comp[0].oklch));
const ch = matchDescriptors('cheerful', ix).seeds;
check('a seed beyond the tested range is flagged with side, range and the lean term ("cheerful" near-white)', ch.some((x) => x.beyondTested && x.beyondTested.side === 'lighter' && x.beyondTested.terms.includes('cheerful') && x.oklch.l > x.beyondTested.range[1]), JSON.stringify(ch.map((x) => [x.hex, x.beyondTested])));
check('seeds with no lightness lean are never flagged', matchDescriptors('vivid, bold', ix).seeds.every((x) => x.beyondTested === null) && matchDescriptors('joy', ix).seeds.every((x) => x.beyondTested === null));
// Labrecque & Milne (2012), checked against the printed Tables 1 and 2 (C14, 2026-10-06)
const lmRow = (id) => lex.rows.find((r) => r.id === id);
check('Study 2 nudges from the printed Table 2: saturation on competence +.275, value on sophistication +.243 (both p < .01)',
  lmRow('competent').targets.nudges.C.beta === 0.275 && lmRow('sophisticated').targets.nudges.L.beta === 0.243 && lmRow('reliable').targets.nudges.C.beta === 0.275 && lmRow('charming').targets.nudges.L.beta === 0.243);
check('"competent" words use their own royal-blue region (Study 1 blue, anchor L 0.44), not the shared sky-blue one',
  lmRow('competent').targets.colorTerms['royal blue'] === 0.522 && !('blue' in lmRow('competent').targets.colorTerms) && lex.families.colorTerms.regions['royal blue'].anchor[0] === 0.44 && lex.families.colorTerms.regions.blue.anchor[2] === 233);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
