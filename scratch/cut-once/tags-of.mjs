// the output's per-edge tags on one planted row, as the candidate returns them: node scratch/cut-once/tags-of.mjs <row>
const { ROWS, STEP_M } = await import('./planted.mjs'), G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const r = C3.openCloseProvenance(G.ip(ROWS[process.argv[2] || 'square'].rings), STEP_M, 'row')
r.rings.forEach((q, k) => q.forEach((v, i) => console.log(`ring ${k} e${i} (${v.X},${v.Y}) tag ${JSON.stringify(r.tags?.[k]?.[i])}`)))
