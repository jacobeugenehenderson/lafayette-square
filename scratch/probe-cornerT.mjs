import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const cw = CURB_WIDTH
globalThis.__SPUR_PROBE = (d) => {
  console.log('--- cornerT keys ---')
  for (const c of d.cornerT) console.log(`  ${c.k}  p=${c.p.map(x=>+x.toFixed(2))} T=${c.T?.toFixed(2)} trim=${c.trim?.toFixed(2)} legs=${c.legs}`)
  console.log('--- rr (runs in fill) ---')
  for (const e of d.rr) console.log(`  ${e.skelId}/${e.side} a=${e.a?.toFixed(2)} aBase=${e.aBase?.toFixed(2)} total=${e.total?.toFixed(2)}`)
  console.log(`--- fillets: ${d.fillets.length} ---`)
}
const st = JSON.parse(JSON.stringify(shape.tiles[53]))
sectionPassTile(st, cw, { outer:'LU', inner:'SW' }, null)
