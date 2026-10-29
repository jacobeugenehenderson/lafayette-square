// The Huron fixture is accepted only if it reproduces coast.json's open/close record (its features, bake-coast.mjs's own sum) (cutOnce: false, the call bake-coast makes)
// and, cut once, the touching/crossing rings at (-4820.8, -3834.5) the debt names. node scratch/cut-once/verify-huron-traced.mjs <coast.json>
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { openCloseAtStep } from '../../cartograph/structures.mjs'
const { IntPoint } = clipperLib
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/huron-traced.json', import.meta.url), 'utf8')), doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const paths = fx.traced.map(p => p.map(([X, Y]) => new IntPoint(X, Y)))
const sum = (xs) => +xs.reduce((t, c) => t + c.m2, 0).toFixed(3)
for (const cutOnce of [false, true]) {
  const t0 = Date.now(), oc = openCloseAtStep(paths, fx.fineM, 'the traced water', { cutOnce })
  // repeated vertices within a ring (a ring through one point more than once), and near the debt's place
  let rep = 0, near = []
  for (const p of oc.paths) { const seen = new Map(); for (const q of p) { const k = `${q.X},${q.Y}`; seen.set(k, (seen.get(k) || 0) + 1) }
    for (const [k, n] of seen) if (n > 1) { rep++; const [x, y] = k.split(',').map(v => v / fx.scale); if (Math.hypot(x + 4820.8, y + 3834.5) < 5) near.push({ at: [x, y], times: n }) } }
  console.log(JSON.stringify({ cutOnce, ms: Date.now() - t0, paths: oc.paths.length, openedM2: sum(oc.openedPieces.features), closedM2: sum(oc.closedPieces.features), openedN: oc.openedPieces.features.length, closedN: oc.closedPieces.features.length, slivers: [oc.openedPieces.slivers, oc.closedPieces.slivers], below: oc.belowResolution.length, repeatedVertices: rep, nearDebt: near.slice(0, 5) }))
}
console.log(JSON.stringify({ recorded: { openedM2: doc.waterOpened?.m2, closedM2: doc.waterClosed?.m2, openedN: doc.waterOpened?.features?.length, closedN: doc.waterClosed?.features?.length, slivers: [doc.waterOpened?.slivers, doc.waterClosed?.slivers], below: Array.isArray(doc.waterBelowResolution) ? doc.waterBelowResolution.length : doc.waterBelowResolution } }))
