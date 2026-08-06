// spike-punchout-zoom.mjs — the two substrates, ZOOMED, at a dead end.
// Plus a numeric check that the punched road gap equals 2×pavementHW.
//   node scratch/spike-punchout-zoom.mjs [cx] [cz] [halfWidthMeters]
import fs from 'fs'
import sharp from 'sharp'

const CX = +(process.argv[2] ?? 600), CZ = +(process.argv[3] ?? 180), W = +(process.argv[4] ?? 260)

const scene = 'lafayette-square'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`, 'utf8'))
const nb = JSON.parse(fs.readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8'))
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx0, cz0] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])

const { buildBlockGeometryV2 } = await import('../src/lib/buildBlockGeometryV2.js')
const q = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: design.blockCustoms || null,
  curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse, __debugRings: true,
})
console.log = q
const punch = v2.__blockRings || []
const tiles = (ribbons.tiles || []).map(t => t.ring)

const px = 1100, minx = CX - W / 2, miny = CZ - W / 2, scl = px / W
const X = x => ((x - minx) * scl).toFixed(1), Y = y => ((y - miny) * scl).toFixed(1)
const draw = async (rings, tag, title, drawChains) => {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#2f2f2f">`
  let d = ''
  for (const r of rings) { if (!r || r.length < 3) continue; d += r.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' }
  s += `<path d="${d}" fill="#6aa84f" stroke="#123" stroke-width="1" stroke-opacity="0.7"/>`
  if (drawChains) for (const st of ribbons.streets || []) {
    if (st.gradeSeparated) continue
    const pts = st.points.filter(p => p[0] > minx - 200 && p[0] < minx + W + 200 && p[1] > miny - 200 && p[1] < miny + W + 200)
    if (pts.length < 2) continue
    s += `<polyline points="${st.points.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="#39f" stroke-width="1.5" stroke-dasharray="5 4"/>`
  }
  s += `<text x="14" y="30" fill="#ffd" font-family="monospace" font-size="20">${title}</text></svg>`
  fs.writeFileSync(`scratch/${tag}.svg`, s)
  await sharp(Buffer.from(s)).png().toFile(`scratch/${tag}.png`)
  console.log('wrote scratch/' + tag + '.png')
}

await draw(punch, 'zoom-punchout', `PUNCH-OUT — blocks green, ROAD = the dark gap (blue dash = centreline, for reference only)`, true)
await draw(tiles, 'zoom-facewalk', `FACE WALK — tiles green, road has NO WIDTH (blue dash = centreline)`, true)

// ── numeric: is the punched gap actually 2×pavementHW? ──
console.log('\n── does the punched road gap equal the authored width? ──')
const seg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1]; const L = vx * vx + vy * vy; let t = L ? (wx * vx + wy * vy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)) }
const nearestBlockDist = (p) => { let m = Infinity; for (const r of punch) { if (!r || r.length < 3) continue; if (Math.abs(r.reduce((a, q) => a + q[0], 0) / r.length - p[0]) > 400) continue; for (let i = 0; i < r.length; i++) m = Math.min(m, seg(p, r[i], r[(i + 1) % r.length])) } return m }
for (const id of ['carroll-street-1', 'dolman-street-1', 'mississippi-avenue', 'south-18th-street-3']) {
  const st = ribbons.streets.find(s => s.skelId === id); if (!st) continue
  const mid = st.points[Math.floor(st.points.length / 2)]
  const hwL = st.measure?.left?.pavementHW, hwR = st.measure?.right?.pavementHW
  console.log(`  ${id.padEnd(22)} authored hw L=${(hwL ?? 0).toFixed(2)} R=${(hwR ?? 0).toFixed(2)}   nearest block edge from centreline = ${nearestBlockDist(mid).toFixed(2)} m`)
}
