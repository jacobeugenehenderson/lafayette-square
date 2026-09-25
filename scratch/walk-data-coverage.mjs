// How much of each town's curb frontage does the DATA answer "is there a sidewalk here?" — before any paint guesses.
// Read-only. Frontage = each ① tile's curb contour (iaFull) edge, owned by its run (skelId). Sources, each asked on its own:
//   TAG     — the street's OSM ways (matched by NAME) carry a sidewalk / sidewalk:* tag (any value: the data SAID something)
//   WAY     — a mapped footway=sidewalk way lies inside this frontage's ped band (block side of the curb, within the painter's
//             default band cw + STD_TREELAWN + ADA_SIDEWALK, read from tileGround.js — never restated)
//   EXPWY   — the side is an expressway (pedRealm:false): the kit already knows there is no walk
// UNANSWERED = none of the three: today's paint GUESSES the ADA sidewalk there. Broken down by the block's land use.
//   node scratch/walk-data-coverage.mjs [scene …]
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const src = fs.readFileSync('src/lib/tileGround.js', 'utf8')
const TL = +src.match(/^const STD_TREELAWN = ([\d.]+)/m)[1], SW = +src.match(/^const ADA_SIDEWALK = ([\d.]+)/m)[1]
for (const scene of (process.argv.slice(2).length ? process.argv.slice(2) : ['lafayette-square', 'huron', 'provincetown'])) {
  const f = feed(scene); if (!f) continue
  const cw = f.curbWidth ?? 0.381, band = cw + TL + SW
  const osm = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/raw/osm.json`, 'utf8'))
  const ways = Object.values(osm.ground || {}).flat()
  const tagged = new Set(ways.filter(w => w.tags?.highway && w.tags?.name && Object.keys(w.tags).some(k => k === 'sidewalk' || k.startsWith('sidewalk:'))).map(w => w.tags.name))
  const swSegs = []; for (const w of ways) if (w.tags?.footway === 'sidewalk' || (w.tags?.highway === 'footway' && w.tags?.footway === 'sidewalk'))
    for (let i = 0; i + 1 < (w.coords || []).length; i++) swSegs.push([[w.coords[i].x, w.coords[i].z], [w.coords[i + 1].x, w.coords[i + 1].z]])
  const G = new Map(), C = 20, key = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`
  for (const s of swSegs) { const k = key((s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2); (G.get(k) || G.set(k, []).get(k)).push(s) }
  const near = (p) => { const [gx, gz] = [Math.floor(p[0] / C), Math.floor(p[1] / C)], out = []; for (let x = gx - 2; x <= gx + 2; x++) for (let z = gz - 2; z <= gz + 2; z++) out.push(...(G.get(`${x},${z}`) || [])); return out }
  const dseg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
  const nameOf = new Map(f.ribbons.streets.map(s => [s.skelId, s.name]))
  const expwy = new Set(f.ribbons.streets.filter(s => s.measure?.left?.pedRealm === false || s.measure?.right?.pedRealm === false).map(s => s.skelId))
  const q = console.log; console.log = console.warn = () => {}
  const tg = buildProto(f, { emitArtifact: true, protoProducer: true, protoArtifact: true }); console.log = q
  const tot = { all: 0, TAG: 0, WAY: 0, EXPWY: 0, none: 0 }, byLu = {}
  // ⭐ split by WHERE (inside the town's disc vs the fetch margin beyond it) and by STREET CLASS — Jacob: inner-hood
  // streets are likelier to have walks and better mapped; a town-wide total is dominated by rural road and ramps
  const disc = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8')).boundary
  const inDisc = (p) => { let c = false; for (let i = 0, j = disc.length - 1; i < disc.length; j = i++) { const a = disc[i], b = disc[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
  const clsOf = new Map(f.ribbons.streets.map(s => [s.skelId, s.highway || 'unknown']))
  const cell = {}   // `${where}|${class}` → { all, ans }
  for (const t of tg.protoShapeTiles || []) for (const [ri, r] of (t.iaFull || []).entries()) {
    const st = t.iaStamp?.[ri] || [], n = r.length, inward = (() => { let a = 0; for (let i = 0; i < n; i++) { const p = r[i], w = r[(i + 1) % n]; a += p[0] * w[1] - w[0] * p[1] } return a > 0 ? 1 : -1 })()
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(L > 0)) continue
      const run = t.runs?.[st[i]]; if (!run || run.skelId === '__boundary__') continue
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nx = -(b[1] - a[1]) / L * inward, nz = (b[0] - a[0]) / L * inward
      const probe = [m[0] + nx * band / 2, m[1] + nz * band / 2]      // the middle of this frontage's ped band
      const e = expwy.has(run.skelId), tg_ = tagged.has(nameOf.get(run.skelId)), w = near(probe).some(s => dseg(probe, s[0], s[1]) <= band / 2)
      tot.all += L; if (tg_) tot.TAG += L; if (w) tot.WAY += L; if (e) tot.EXPWY += L
      const ck = `${inDisc(m) ? 'in' : 'out'}|${clsOf.get(run.skelId)}`, cc = (cell[ck] ||= { all: 0, ans: 0 }); cc.all += L; if (e || tg_ || w) cc.ans += L
      if (!e && !tg_ && !w) { tot.none += L; byLu[t.lu] = (byLu[t.lu] || 0) + L }
    }
  }
  const pct = (x) => `${(100 * x / tot.all).toFixed(1)}%`
  console.log(`── ${scene}: ${(tot.all / 1000).toFixed(1)} km of curb frontage · ped band ${band.toFixed(2)} m · ${swSegs.length} sidewalk-way segments · ${tagged.size} street name(s) with a sidewalk tag`)
  console.log(`   answered by TAG ${pct(tot.TAG)} · by a mapped sidewalk WAY ${pct(tot.WAY)} · by EXPWY ${pct(tot.EXPWY)} · UNANSWERED (paint guesses) ${pct(tot.none)}`)
  console.log(`   unanswered by block land use: ` + Object.entries(byLu).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${pct(v)}`).join(' · '))
  for (const where of ['in', 'out']) {
    const rows = Object.entries(cell).filter(([k]) => k.startsWith(where + '|')), all = rows.reduce((a, [, v]) => a + v.all, 0), ans = rows.reduce((a, [, v]) => a + v.ans, 0)
    console.log(`   ${where === 'in' ? 'INSIDE the disc ' : 'OUTSIDE the disc'}: ${(all / 1000).toFixed(1)} km · answered ${all ? (100 * ans / all).toFixed(1) : '—'}% · by class: ` +
      rows.sort((x, y) => y[1].all - x[1].all).slice(0, 7).map(([k, v]) => `${k.split('|')[1]} ${(v.all / 1000).toFixed(1)} km ${(100 * v.ans / v.all).toFixed(0)}%`).join(' · '))
  }
}
