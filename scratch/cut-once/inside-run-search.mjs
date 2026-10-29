// search for a planted row for Zob's inside-one-run ruling: a 20 m square whose bottom edge is broken by a SHORT edge (s, t) at
// x1, nearly collinear with its neighbours, so a segment inside the next edge's run is also claimed by its neighbour's line.
// Wanted: live builds with stat.insideRun > 0, and setInsideRunForward REFUSES. node scratch/cut-once/inside-run-search.mjs
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs'), hits = []
for (const x1 of [6000, 10000]) for (const s of [2, 3, 4, 6, 10, 20, 40]) for (const t of [-4, -3, -2, -1, 1, 2, 3, 4]) for (const tail of [0, 1, -1, 2, -2]) {
  const rings = [[[0, 0], [x1, 0], [x1 + s, t], [20000, tail], [20000, 20000], [0, 20000]]]
  let live; C3.setInsideRunForward(false); try { live = C3.openCloseProvenance(G.ip(rings), 0.9988, 'r').stat.insideRun || 0 } catch (e) { live = 'REFUSED' }
  if (!(live > 0)) continue
  let mut; C3.setInsideRunForward(true); try { C3.openCloseProvenance(G.ip(rings), 0.9988, 'r'); mut = 'built' } catch (e) { mut = 'REFUSED ' + String(e.message).slice(0, 90) }
  C3.setInsideRunForward(false); hits.push({ x1, s, t, tail, live, mut }) }
const red = hits.filter(h => h.mut.startsWith('REFUSED')); console.log(`${hits.length} with an inside-run token; ${red.length} where the mutant refuses`)
for (const h of red.slice(0, 4)) console.log(JSON.stringify(h))
