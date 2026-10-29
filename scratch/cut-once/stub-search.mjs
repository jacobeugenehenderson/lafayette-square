// search a family of constructed corner strips for a planted row the ruling needs: the multi-tag neck token formed (live builds,
// orderedTokens > 0) and the set-order mutant REFUSES. A 20 m square; a strip w wide, L long, at angle a, its foot centre (fx, 20 m − dy).
// node scratch/cut-once/stub-search.mjs
const G = await import('./gate.mjs'), C3 = await import('./cand3.mjs')
const rect = (cx, cy, a, w, L) => { const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, h = w / 2
  return [[cx + nx * h, cy + ny * h], [cx - nx * h, cy - ny * h], [cx - nx * h + ux * L, cy - ny * h + uy * L], [cx + nx * h + ux * L, cy + ny * h + uy * L]].map(p => p.map(Math.round)) }
const sq = [[0, 0], [20000, 0], [20000, 20000], [0, 20000]], hits = []
for (const deg of [60, 70, 75, 80, 85, 95, 100, 105]) for (const w of [1800, 1900]) for (const fx of [19000, 19200, 19400, 19500, 19600]) for (const dy of [-300, -100, 0, 100, 300]) {
  const rings = [sq, rect(fx, 20000 - dy, deg * Math.PI / 180, w, 9000)]
  let live, mut; C3.setTagSetOrder(false); try { live = C3.openCloseProvenance(G.ip(rings), 0.9988, 's').stat.orderedTokens || 0 } catch (e) { live = 'REFUSED' }
  if (!(live > 0)) continue
  C3.setTagSetOrder(true); try { C3.openCloseProvenance(G.ip(rings), 0.9988, 's'); mut = 'built' } catch (e) { mut = 'REFUSED ' + String(e.message).slice(0, 70) }
  C3.setTagSetOrder(false); hits.push({ deg, w, fx, dy, live, mut, rings }) }
const red = hits.filter(h => h.mut.startsWith('REFUSED')); console.log(`${hits.length} with an ordered token; ${red.length} where the mutant refuses`)
for (const h of red.slice(0, 4)) console.log(JSON.stringify({ deg: h.deg, w: h.w, fx: h.fx, dy: h.dy, live: h.live, mut: h.mut, strip: h.rings[1] }))
