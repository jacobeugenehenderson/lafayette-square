// tg-hash.mjs — buildTileGround's outputs, hashed per key, for a before/after proof of a refactor (Lath, 2026-10-20).
//   node scratch/integration-board/tg-hash.mjs <module under src/lib> <scene>
// Options are the feed's (scratch/_proto-feed.mjs#buildProto: authoring loaded) plus the bake's producer flags.
import crypto from 'crypto'
import { feed } from '../_proto-feed.mjs'
const [mod, scene] = process.argv.slice(2)
const { buildTileGround } = await import(`../../src/lib/${mod}`)
const f = feed(scene)
const prev = console.log; console.log = () => {}
const R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
  blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
  cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1, grout: 'proto', protoProducer: true, emitArtifact: true })
console.log = prev
const up = new Set()   // ancestors only: a shared (non-cyclic) reference is hashed in full each time it appears
const norm = (v) => {
  if (v instanceof Map) return ['Map', [...v].map(([k, x]) => [norm(k), norm(x)])]
  if (v instanceof Set) return ['Set', [...v].map(norm)]
  if (ArrayBuffer.isView(v)) return ['TA', v.constructor.name, Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64')]
  if (typeof v === 'function') return 'fn'
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
  if (!v || typeof v !== 'object') return v
  if (up.has(v)) return '<cycle>'
  up.add(v); const r = Array.isArray(v) ? v.map(norm) : Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])); up.delete(v); return r
}
const h = (x) => crypto.createHash('sha256').update(JSON.stringify(norm(x)) ?? 'undefined').digest('hex').slice(0, 12)
const keys = Object.keys(R).sort(), all = crypto.createHash('sha256')
for (const k of keys) { const x = h(R[k]); all.update(k + x); console.log(`${k}\t${x}`) }
console.log(`ALL\t${all.digest('hex').slice(0, 12)}\t${keys.length} keys`)
