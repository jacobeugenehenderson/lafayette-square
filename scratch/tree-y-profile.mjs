// scratch/tree-y-profile.mjs — vertical distribution of a published tree's verts,
// split bark vs leaf, plus the band cuts prepareOverheadBands() would derive.
// Answers "why is this species' overhead band empty?": a stray vertex far above
// the crown stretches maxY, so the top third of the crown span holds nothing.
//
// Usage: node scratch/tree-y-profile.mjs <file.glb>...
// Written 2026-07-22 chasing the blank platanus/linden overhead bands.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

for (const f of process.argv.slice(2)) {
  const doc = await io.read(f)
  const ys = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      for (let i = 0; i < pos.getCount(); i++) ys.push(pos.getElement(i, [])[1])
    }
  }
  if (!ys.length) { console.log(f, 'no verts'); continue }
  ys.sort((a, b) => a - b)
  const q = (p) => ys[Math.min(ys.length - 1, Math.floor(p * ys.length))]
  const minY = ys[0], maxY = ys[ys.length - 1]
  const H = maxY - minY
  // Mirror measureCanopyBaseLocal's no-aBark fallback (the GLB carries no aBark;
  // it is stamped at runtime), so these cuts are the shape of the real ones.
  const Cb = minY + H * 0.35
  const s = Math.max(1e-3, maxY - Cb)
  const cuts = [
    ['branch', Math.max(minY, Cb - 0.12 * H), Cb + s / 3],
    ['mid', Cb + s / 3, Cb + (2 * s) / 3],
    ['canopy', Cb + (2 * s) / 3, maxY],
  ]
  console.log(f)
  console.log(`  verts=${ys.length} minY=${minY.toFixed(2)} maxY=${maxY.toFixed(2)} H=${H.toFixed(2)}`)
  console.log('  percentiles ' + [0.5, 0.9, 0.99, 0.999, 0.9999].map(p => `p${p * 100}=${q(p).toFixed(2)}`).join(' '))
  for (const [key, lo, hi] of cuts) {
    const n = ys.filter(y => y >= lo && y <= hi).length
    console.log(`  ${key.padEnd(7)} [${lo.toFixed(2)}, ${hi.toFixed(2)}] → ${n} verts (${(n / ys.length * 100).toFixed(2)}%)${n / ys.length < 0.002 ? '  ⛔ EMPTY BAND' : ''}`)
  }
}
