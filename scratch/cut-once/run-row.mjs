// one planted row through the candidate, full stack on failure: node scratch/cut-once/run-row.mjs <row>
const { ROWS, STEP_M } = await import('./planted.mjs'), G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
C3.openCloseProvenance(G.ip(ROWS[process.argv[2]].rings), STEP_M, process.argv[2]); console.log('ok')
