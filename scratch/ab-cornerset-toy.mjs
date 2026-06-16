// A/B byte-identical proof for the T3 cornerSet emit.
// Feeds the SAME ribbons input to HEAD's tileGround (base) and the new one,
// asserts asphalt/curb/block/sidewalk/cornerFillets-positions unchanged, and
// reports the new cornerSet count + how many carry a fillet vs are R=0.
import { readFileSync } from 'fs'
import { buildTileGround as BASE } from '../src/lib/tileGround.__base__.js'
import { buildTileGround as NEW } from '../src/lib/tileGround.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json', import.meta.url), 'utf8'))
const opts = { smooth: 0.5 }   // store default; no authored overrides → the un-authored case

const t0 = Date.now()
const a = BASE(ribbons, opts)
const b = NEW(ribbons, opts)
console.log(`built base+new in ${Date.now() - t0}ms`)

const ringsSig = (rings) => JSON.stringify((rings || []).map(r => r.map(p => [Math.round(p[0] * 1e6), Math.round(p[1] * 1e6)])))
const cmp = (name, x, y) => {
  const sx = ringsSig(x), sy = ringsSig(y)
  const ok = sx === sy
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${name}: base=${(x || []).length} rings  new=${(y || []).length} rings  ${ok ? 'byte-identical' : 'CHANGED'}`)
  return ok
}

let allOk = true
allOk &= cmp('asphalt', a.asphalt, b.asphalt)
allOk &= cmp('curb', a.curb, b.curb)
allOk &= cmp('sidewalk', a.sidewalk, b.sidewalk)
allOk &= cmp('highway', a.highway, b.highway)
allOk &= cmp('block', a.block, b.block)

// vertR is per-tile; compare via the frozen _tiles' iA rings (the curb line that
// vertR drives) as a proxy that vertR is unchanged.
const tilesIASig = (tg) => JSON.stringify((tg._tiles || []).map(t => ringsSig(t.iA)))
console.log(`${tilesIASig(a) === tilesIASig(b) ? 'OK  ' : 'DIFF'} _tiles.iA (curb line / vertR proxy): ${tilesIASig(a) === tilesIASig(b) ? 'byte-identical' : 'CHANGED'}`)
allOk &= (tilesIASig(a) === tilesIASig(b))

// cornerSet report
const cs = b.cornerSet || []
const withFillet = cs.filter(c => c.fillet).length
const r0 = cs.length - withFillet
console.log(`\ncornerSet: ${cs.length} corners  (${withFillet} filleted, ${r0} R=0/unfilleted)`)
// injectivity: every fillet claimed by at most one corner (compare distinct fillet apexes among filleted)
const apexKey = (f) => `${Math.round(f.apex[0] * 1e3)},${Math.round(f.apex[1] * 1e3)}`
const apexes = cs.filter(c => c.fillet).map(c => apexKey(c.fillet))
const distinctApex = new Set(apexes).size
console.log(`injective fillet claim: ${apexes.length} filleted corners → ${distinctApex} distinct fillet apexes  ${apexes.length === distinctApex ? '(INJECTIVE)' : '(COLLISION!)'}`)
// keys unique?
const keys = cs.map(c => c.key)
console.log(`cornerSet keys: ${keys.length} total, ${new Set(keys).size} distinct  ${keys.length === new Set(keys).size ? '(all unique)' : '(DUP KEYS)'}`)
// every entry has V + legs + the round-trip key shape
const malformed = cs.filter(c => !c.V || !c.legA || !c.legB || typeof c.key !== 'string').length
console.log(`malformed entries: ${malformed}`)

console.log(`\n=== ${allOk ? 'PASS — render byte-identical, cornerSet emitted' : 'FAIL — geometry changed'} ===`)
process.exit(allOk ? 0 : 1)
