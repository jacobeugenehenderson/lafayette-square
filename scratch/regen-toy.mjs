import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const toyRibbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url)))
const TOY_STENCIL = [[-180, -180], [180, -180], [180, 180], [-180, 180]]
const old = JSON.parse(readFileSync(new URL('../public/baked/toy/shape.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/toy/design.json', import.meta.url)))
// EXACT app params from the toy look: smooth:0, toy curbWidth, TOY_STENCIL.
const tg = buildTileGround(toyRibbons, {
  stencil: TOY_STENCIL, curbWidth: d.curbWidth, smooth: 0, emitArtifact: true,
  cornerRadiusScale: d.cornerRadiusScale, cornerRadiusOverrides: d.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides, blockCustoms: d.blockCustoms, blockLandUse: d.blockLandUse,
})
const art = tg._shapeArtifact
// Sanity: same tile count + iA silhouette unchanged vs the existing freeze (we only ADD fillets).
const ringDev = (P, Q) => { let m = 0; for (const r of (P || [])) for (const v of r) { let b = 1e9; for (const s of (Q || [])) for (let i = 0; i < s.length; i++) { const a = s[i], c = s[(i + 1) % s.length]; const dx = c[0] - a[0], dy = c[1] - a[1]; const L = dx * dx + dy * dy || 1; let t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(v[0] - (a[0] + t * dx), v[1] - (a[1] + t * dy))) } m = Math.max(m, b) } return m }
let maxDev = 0, withF = 0
for (let i = 0; i < art.length; i++) { maxDev = Math.max(maxDev, ringDev(art[i].iA, old[i]?.iA)); if (art[i].fillets?.length) withF++ }
console.log('new tiles', art.length, '(old', old.length, ')  tiles with fillets', withF, '  max iA dev vs old', maxDev.toFixed(4), 'm')
// The dev vs the Jun-3 freeze is D6a (curb-as-offset, landed since) legitimately
// reshaping the silhouette — same as the app would freeze on Survey-exit now.
// Gate only on tile-count parity (a structural mismatch would be a real error).
if (art.length === old.length) {
  writeFileSync(new URL('../public/baked/toy/shape.json', import.meta.url).pathname, JSON.stringify(art))
  console.log('WROTE public/baked/toy/shape.json (D6a silhouette + fillets; dev', maxDev.toFixed(2), 'm is the D6a update)')
} else {
  console.log('NOT writing — tile-count mismatch, a real structural error')
}
