// plot-label-polylines.mjs — eyeball Step 1 of the street-label overhaul.
// Renders the hood boundary polygon + the bake's clipped label polylines, over
// the FAINT raw (unclipped) ribbon chains, so the clip is visible: colored
// polylines must stop AT the boundary, grey stubs continue past it.
//   node scratch/plot-label-polylines.mjs [scene] [out.png]
import { readFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'

const scene = process.argv[2] || 'lafayette-square'
const out = process.argv[3] || `scratch/label-polylines-${scene}.png`

const labels = JSON.parse(readFileSync(`public/baked/${scene}/labels.json`, 'utf8')).labels
let ribbonsPath = `cartograph/data/${scene}/clean/ribbons.json`
if (!existsSync(ribbonsPath)) ribbonsPath = 'src/data/ribbons.json'
const ribbons = JSON.parse(readFileSync(ribbonsPath, 'utf8'))
const boundary = JSON.parse(readFileSync(`cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8'))
// Draw the ACTUAL gate makeMembership uses: the street polygon if persisted,
// else the radius disc from origin (the LS fallback — b.polygon absent).
const poly = (Array.isArray(boundary.polygon) && boundary.polygon.length >= 3)
  ? boundary.polygon.map(p => [p.x ?? p[0], p.z ?? p[1]])
  : null
const R = boundary.radius ?? Infinity
if (poly == null) console.log(`[gate] no polygon → radius disc R=${R} from origin`)

// bounds over everything
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
const bump = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z) }
if (poly) for (const p of poly) bump(p[0], p[1])
else if (Number.isFinite(R)) { bump(-R, -R); bump(R, R) }
for (const st of ribbons.streets || []) for (const p of (st.points || [])) bump(p[0], p[1])

const W = 1600, PAD = 40
const scale = (W - 2 * PAD) / (maxX - minX)
const H = Math.round((maxZ - minZ) * scale + 2 * PAD)
const X = x => PAD + (x - minX) * scale
const Y = z => PAD + (z - minZ) * scale
const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')

// deterministic hue per name
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0d0d14"/>`
// raw chains (grey) — show what gets clipped away
for (const st of ribbons.streets || []) {
  if (!st.name || !st.points || st.points.length < 2) continue
  svg += `<path d="${path(st.points)}" fill="none" stroke="#3a3a4a" stroke-width="1"/>`
}
// the gate — street polygon, else the radius disc from origin
if (poly) svg += `<path d="${path(poly)} Z" fill="none" stroke="#ffd36b" stroke-width="2.5" stroke-dasharray="8 6"/>`
else svg += `<circle cx="${X(0).toFixed(1)}" cy="${Y(0).toFixed(1)}" r="${(R * scale).toFixed(1)}" fill="none" stroke="#ffd36b" stroke-width="2.5" stroke-dasharray="8 6"/>`
// clipped label polylines (colored per name), with endpoint dots
for (const l of labels) {
  const h = hue(l.name)
  svg += `<path d="${path(l.points)}" fill="none" stroke="hsl(${h} 70% 60%)" stroke-width="2.5"/>`
  const a = l.points[0], b = l.points[l.points.length - 1]
  for (const p of [a, b]) svg += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="hsl(${h} 80% 70%)"/>`
}
svg += `</svg>`

await sharp(Buffer.from(svg)).png().toFile(out)
console.log(`wrote ${out} (${W}x${H}) — ${labels.length} polylines, gate ${poly ? poly.length + ' pts' : 'disc R=' + R}`)
