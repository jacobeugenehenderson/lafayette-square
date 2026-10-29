// the notchAtLimit row, live and under setGapBeforeLimit: the candidate's k against the definition end to end, and k's vertices in the
// notch. node scratch/cut-once/notch-row.mjs
const { ROWS, STEP_M } = await import('./planted.mjs'), G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'), O = await import('./oracle.mjs')
for (const mut of [false, true]) { C3.setGapBeforeLimit(mut); const src = G.ip(ROWS.notchAtLimit.rings), j = O.judge(src, STEP_M, 'notchAtLimit')
  const r = C3.openCloseProvenance(src, STEP_M, 'notchAtLimit')
  console.log(mut ? 'MUTANT' : 'LIVE  ', JSON.stringify(j.e2e), JSON.stringify(r.rings.map(q => q.filter(v => v.Y > 16000 && v.Y < 20000 && v.X > 8000 && v.X < 12000).map(v => [v.X, v.Y])))) }
