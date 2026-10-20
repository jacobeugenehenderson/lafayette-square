// rim-facts.mjs — per town: (1) is stencil.clipPolygon (neighborhood_boundary.json) the frozen ① boundaryRing (ribbons.protopolygon),
// vertex for vertex, as lattice integers? (2) on tiles whose iA has no edge on the boundary (interior), is the frozen iA the
// lattice-rounded iaFull (so the uncut iA can stand in offline)?
import { readFileSync, existsSync, readdirSync } from 'fs'
const M = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const q = v => Math.round(v * 1000)
for (const town of readdirSync(`${M}/cartograph/data`)) {
  const nb = `${M}/cartograph/data/${town}/neighborhood_boundary.json`, rb = `${M}/cartograph/data/${town}/clean/ribbons.json`, sh = `${M}/public/baked/${town}/shape.json`
  if (!existsSync(nb) || !existsSync(rb)) continue
  const S = JSON.parse(readFileSync(nb, 'utf8')).boundary || [], B = JSON.parse(readFileSync(rb, 'utf8')).protopolygon?.boundaryRing || []
  const k = r => r.map(p => `${q(p[0])},${q(p[1])}`), sk = k(S), bk = k(B), bset = new Set(bk)
  const same = sk.length === bk.length && sk.every((x, i) => x === bk[i])
  const shared = sk.filter(x => bset.has(x)).length
  let maxd = 0; for (const p of S) { let d = Infinity; for (const b of B) d = Math.min(d, Math.hypot(p[0] - b[0], p[1] - b[1])); maxd = Math.max(maxd, d) }
  let line = `${town.padEnd(18)} stencil ${S.length} v · boundaryRing ${B.length} v · identical ${same} · stencil vertices that are boundary vertices ${shared}/${S.length} · max stencil→nearest boundary vertex ${(maxd * 1000).toFixed(1)} mm`
  if (existsSync(sh)) { const T = JSON.parse(readFileSync(sh, 'utf8')).tiles; let n = 0, eq = 0
    for (const t of T) { if (!t?.iaFull?.length || !t.iA?.length) continue; n++
      const a = new Set(t.iA.flat().map(p => `${q(p[0])},${q(p[1])}`)), f = new Set(t.iaFull.flat().map(p => `${q(p[0])},${q(p[1])}`))
      if ([...a].every(x => f.has(x))) eq++ }
    line += ` · tiles whose every iA vertex is a rounded iaFull vertex: ${eq}/${n}` }
  console.log(line)
}
