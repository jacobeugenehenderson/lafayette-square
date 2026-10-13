// The accuracy pass's summary, pure so it can be mutation-tested (Brace, 2026-10-13): area-weighted percentiles, the max,
// and the area over a threshold, of a set of errors. ⛔ A NON-FINITE error is its own class — counted, located by the
// caller's label, and kept out of every number — because fed to the sort it scrambles every percentile and the max
// (seen on d63b43ea's tol ×4 point: max 270.97 mm printed beside a listed 1.757 m point).
//   summarize(errs, wts, labelOf?) → { n, nonFinite, firstBad, area, q(f), max, over(m) }
//   node scratch/ground-budget/accuracy-summary.mjs --self-test
export function summarize(errs, wts, labelOf = (i) => `#${i}`) {
  const keep = [], firstBad = []; let nonFinite = 0
  for (let i = 0; i < errs.length; i++) { if (Number.isFinite(errs[i]) && Number.isFinite(wts[i])) keep.push(i); else { nonFinite++; if (firstBad.length < 5) firstBad.push(labelOf(i)) } }
  const ord = Uint32Array.from(keep).sort((i, j) => errs[i] - errs[j])
  let area = 0; for (const i of ord) area += wts[i]
  const q = (f) => { let acc = 0; for (const i of ord) { acc += wts[i]; if (acc >= f * area) return errs[i] } return ord.length ? errs[ord[ord.length - 1]] : NaN }
  const over = (m) => { let a = 0; for (const i of ord) if (errs[i] > m) a += wts[i]; return area > 0 ? a / area : NaN }
  return { n: ord.length, nonFinite, firstBad, area, q, max: ord.length ? errs[ord[ord.length - 1]] : NaN, over }
}

if (process.argv.includes('--self-test')) {
  let bad = 0; const ok = (c, msg) => { if (!c) bad++; console.log(`  ${c ? '✓' : '✗'} ${msg}`) }
  const N = 10001, errs = Array.from({ length: N }, (_, i) => i / 1000), wts = new Array(N).fill(1)   // 0 … 10 m, max 10
  const clean = summarize(errs, wts)
  ok(clean.nonFinite === 0 && clean.max === 10 && Math.abs(clean.q(0.5) - 5) < 0.002, `clean: max 10, p50 5 (got ${clean.max}, ${clean.q(0.5)})`)
  for (const [where, at] of [['at the start', 0], ['in the middle', 5000], ['at the end', N - 1]]) {
    const e = errs.slice(); e[at] = NaN
    const s = summarize(e, wts, (i) => `point ${i}`)
    ok(s.nonFinite === 1 && s.firstBad[0] === `point ${at}`, `a NaN ${where} is counted once and located (${s.nonFinite}, ${s.firstBad})`)
    ok(s.n === N - 1 && s.max === (at === N - 1 ? 9.999 : 10), `… and excluded: n ${s.n}, max ${s.max}`)
    ok(Math.abs(s.q(0.5) - 5) < 0.002 && Math.abs(s.q(0.99) - clean.q(0.99)) < 0.002, `… percentiles unscrambled: p50 ${s.q(0.5)}, p99 ${s.q(0.99)}`)
  }
  const e2 = errs.slice(); e2[3] = Infinity; e2[7] = -Infinity
  ok(summarize(e2, wts).nonFinite === 2, 'Infinity and -Infinity are non-finite too')
  const w2 = wts.slice(); w2[4] = NaN
  ok(summarize(errs, w2).nonFinite === 1, 'a non-finite weight is non-finite too')
  ok(Math.abs(clean.over(5) - 0.5) < 0.001, `area over 5 m = half (${clean.over(5)})`)
  console.log(bad ? `⛔ ${bad} case(s) wrong` : 'self-test: all cases as expected'); process.exit(bad ? 1 : 0)
}
