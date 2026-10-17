// pixel-bound.mjs — the close-camera derivation of the simplifier's bound, as a curve, read from the town (never restated):
// the street shot's fov and eye height (the look's design.json `shots`, else the kit's SHOTS_FLAT_DEFAULTS) and each
// device class's DPR cap (src/lib/qualityProfile.js). A vertical error δ on the ground at distance d, seen from eye
// height h, subtends δ·d/(d² + h²) — largest at d = h, δ/(2h). One pixel is 2·tan(fov/2)/H_px (vertical fov, H_px =
// canvas CSS height × DPR). ⇒ δ_px = 2h · 2·tan(fov/2) / H_px. The CSS height is the viewer's own; it is the curve's axis.
//   node scratch/ground-budget/simplify/pixel-bound.mjs <look>
import { readFileSync, existsSync } from 'fs'
import { SHOTS_FLAT_DEFAULTS } from '../../../src/cartograph/skyLightChannels.js'
import { QUALITY } from '../../../src/lib/qualityProfile.js'
const look = process.argv[2], p = `public/looks/${look}/design.json`
const authored = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).shots?.values?.street : null
const st = authored ?? SHOTS_FLAT_DEFAULTS.street
console.log(`${look}: street fov ${st.fov}° · eye ${st.eyeHeight} m (${authored ? 'design.json shots' : 'kit default'})`)
for (const [id, q] of Object.entries(QUALITY)) {
  const dprMax = Array.isArray(q.dpr) ? q.dpr[1] : q.dpr
  const row = [600, 800, 1000, 1200, 1400].map(css => { const H = css * dprMax; return `${css} css → ${(2 * st.eyeHeight * 2 * Math.tan(st.fov * Math.PI / 360) / H * 1000).toFixed(2)} mm` })
  console.log(`  ${id.padEnd(8)} dpr ≤ ${dprMax}: ${row.join(' · ')}`)
}
