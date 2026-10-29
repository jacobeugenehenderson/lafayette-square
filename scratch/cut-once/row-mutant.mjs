// one planted row, live and under one mutant hook: k against the definition end to end, and k's vertices within R of a point.
// node scratch/cut-once/row-mutant.mjs ROW HOOK X Y [R]   (X, Y in units). notchAtLimit setGapBeforeLimit 10000 17500
const { ROWS, STEP_M } = await import('./planted.mjs'), G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'), O = await import('./oracle.mjs')
const [row, hook] = process.argv.slice(2, 4), [X, Y, R = 3000] = process.argv.slice(4).map(Number)
for (const mut of [false, true]) { C3[hook](mut); const src = G.ip(ROWS[row].rings), j = O.judge(src, STEP_M, row), r = C3.openCloseProvenance(src, STEP_M, row)
  console.log(mut ? 'MUTANT' : 'LIVE  ', row, JSON.stringify(j.e2e), JSON.stringify(r.rings.map(q => q.filter(v => Math.hypot(v.X - X, v.Y - Y) <= R).map(v => [v.X, v.Y, C3.ORIGIN.get(v.X + ',' + v.Y) || '-'])).filter(x => x.length))) }
C3[hook](false)
