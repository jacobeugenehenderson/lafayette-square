// Export per-site comparison geometry (frame metres, +x=E, +z=S) from the FROZEN pour, read-only.
// Region = a shape.json tile whose ring passes within 1 m of an at-grade terminal — the same membership rule as
// scratch/h3-terminal-islands.mjs (frozen, not imported: it is a script, not a module). Regions are identified by
// their iA centroid, never by tile index (positional; a re-pour renumbers).
import fs from 'node:fs'
const t = 'lafayette-square'
const skP = `cartograph/data/${t}/clean/skeleton.json`, shP = `public/baked/${t}/shape.json`
const sk = JSON.parse(fs.readFileSync(skP)).streets, sh = JSON.parse(fs.readFileSync(shP))
const K = p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`, town = new Set()
for (const s of sk) if (!s.gradeSeparated) for (const p of s.points) town.add(K(p))
const term = []
for (const s of sk) if (s.gradeSeparated) for (const p of [s.points[0], s.points.at(-1)]) if (town.has(K(p))) term.push([p.x, p.z])
const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const msbf = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/msbf.json`)).buildings
const bc = msbf.map(b => [b.coords.reduce((s, q) => s + q.x, 0) / b.coords.length, b.coords.reduce((s, q) => s + q.z, 0) / b.coords.length])
const osm = JSON.parse(fs.readFileSync(`cartograph/data/${t}/raw/osm.json`))
const islandLines = osm.ground.highway.filter(w => w.tags?.footway === 'traffic_island').map(w => ({ osmId: w.osmId, surface: w.tags.surface, pts: w.coords.map(c => [c.x, c.z]) }))
const islandAreas = osm.ground.surface.filter(w => w.tags?.['area:highway'] === 'traffic_island').map(w => ({ osmId: w.osmId, pts: w.coords.map(c => [c.x, c.z]) }))
const SITES = JSON.parse(fs.readFileSync('scratch/naip-spike/sites.json'))
const out = { skeleton: fs.statSync(skP).mtime.toISOString(), shape: fs.statSync(shP).mtime.toISOString(), sites: {} }
for (const [name, S] of Object.entries(SITES)) {
  const [x0, z0, x1, z1] = S.bbox, inBox = p => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1
  const siteTerm = term.filter(inBox)
  const tiles = []
  sh.tiles.forEach((tl, i) => {
    const ring = Array.isArray(tl.ring?.[0]?.[0]) ? tl.ring[0] : tl.ring; if (!ring || !ring.some(inBox)) return
    const iA = tl.iA || []
    const terminal = siteTerm.some(q => ring.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1))
    const nb = terminal ? bc.filter(b => pip(b, ring)).length : null
    const c = (iA[0] || ring); const cen = [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length]
    tiles.push({ idx: i, lu: tl.lu, ring, iA, terminal, buildings: nb, centroid: cen.map(v => +v.toFixed(1)) })
  })
  const hw = (Array.isArray(sh.highway) ? sh.highway : Object.values(sh.highway)).filter(r => r.some(inBox))
  const bl = msbf.filter((b, k) => inBox(bc[k])).map(b => b.coords.map(c => [c.x, c.z]))
  const streets = sk.filter(s => s.points.some(p => inBox([p.x, p.z]))).map(s => ({ id: s.id, gs: !!s.gradeSeparated, pts: s.points.map(p => [p.x, p.z]) }))
  out.sites[name] = { bbox: S.bbox, terminals: siteTerm, tiles, highway: hw, buildings: bl, streets, osmIslandLines: islandLines.filter(l => l.pts.some(inBox)), osmIslandAreas: islandAreas.filter(l => l.pts.some(inBox)) }
  console.log(`${name}: terminals ${siteTerm.length} · tiles ${tiles.length} (terminal ${tiles.filter(t => t.terminal).length}, 0-bldg ${tiles.filter(t => t.terminal && t.buildings === 0).length}) · highway rings ${hw.length} · osm island lines ${out.sites[name].osmIslandLines.length} areas ${out.sites[name].osmIslandAreas.length}`)
}
console.log(`skeleton ${out.skeleton} · shape ${out.shape}`)
fs.writeFileSync('scratch/.naip-spike/geometry.json', JSON.stringify(out))
