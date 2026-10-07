// CPU PROOF (Argon; Boz's condition for the TERRAIN_DISPLACE_INSTANCED_BAKED swap): for every lamp and tree instance the
// kit draws through patchTerrainInstancedBaked, the NEW lift (inverse(basis)·up) moves the instance exactly as the OLD
// one (L / |c1| along local Y), to float32 precision. Matrices are composed as each component composes them
// (StreetLights: T·Ry·S × nodeMatrix · InstancedTrees: T·Ry·S · HeroImpostorTrees: T·S). Read-only.
//   node scratch/shore-jag/lift-proof.mjs [--towns=huron,provincetown,lafayette-square]
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
const f = Math.fround
const towns = (process.argv.find((a) => a.startsWith('--towns='))?.slice(8) || 'huron,provincetown,lafayette-square').split(',')
// the shader, in float32. L = 1: the error is relative to the lift.
const cols = (m) => { const e = m.elements; return [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]].map((c) => c.map(f)) }
const apply = (C, v) => [0, 1, 2].map((r) => f(f(f(C[0][r] * v[0]) + f(C[1][r] * v[1])) + f(C[2][r] * v[2])))
const oldLift = (C) => apply(C, [0, f(1 / Math.max(f(Math.hypot(...C[1])), 1e-4)), 0])
const newLift = (C) => apply(C, C.map((c) => f(c[1] / Math.max(f(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), 1e-8))))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
// LS's Victorian GLB: the mesh node's world matrix, from the GLB's own JSON chunk (as lampModels takes child.matrixWorld)
function glbMeshNodeMatrix(path) {
  const b = readFileSync(path); const len = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'))
  const local = (n) => n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))
  const parent = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)))
  const mi = j.nodes.findIndex((n) => n.mesh != null); let M = local(j.nodes[mi]), p = parent.get(mi)
  while (p != null) { M = local(j.nodes[p]).multiply(M); p = parent.get(p) }
  return M
}
const MODELS = { standard: { node: new THREE.Matrix4(), scale: 1 }, victorian: { node: glbMeshNodeMatrix('public/models/lamp-posts/victorian-lamp.glb'), scale: 3.66 / 2.65 } }
let worst = 0, worstOldTilt = 0, n = 0
for (const town of towns) {
  const sc = JSON.parse(readFileSync(`public/baked/${town}/scene.json`, 'utf8'))
  const lamps = JSON.parse(readFileSync(`public/baked/${town}/lamps.json`, 'utf8')).lamps
  const model = MODELS[sc.lampModel || 'standard'] || MODELS.victorian
  const tally = (C) => { const o = oldLift(C), nw = newLift(C); worst = Math.max(worst, dist(o, nw)); worstOldTilt = Math.max(worstOldTilt, dist(o, [0, 1, 0])); n++ }
  const d = new THREE.Object3D(), M = new THREE.Matrix4()
  for (const l of lamps) { d.position.set(l.x, -0.08, l.z); d.rotation.set(0, Math.random() * Math.PI * 2, 0); d.scale.setScalar(model.scale); d.updateMatrix(); tally(cols(M.copy(d.matrix).multiply(model.node))) }
  const trees = JSON.parse(readFileSync(`public/baked/${town}/trees.json`, 'utf8')).instances
  const T = new THREE.Matrix4(), R = new THREE.Matrix4(), S = new THREE.Matrix4()
  for (const t of trees) { const s = Number(t.scale) > 0 ? Number(t.scale) : 1
    tally(cols(M.identity().multiply(T.makeTranslation(t.x, t.y || 0, t.z)).multiply(R.makeRotationY(t.rotY || 0)).multiply(S.makeScale(s, s, s))))   // InstancedTrees
    tally(cols(new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)))) }             // HeroImpostorTrees
  console.log(`${town}: ${lamps.length} lamps (${sc.lampModel || 'standard'}) · ${trees.length} trees × 2 matrices`)
}
console.log(`${n} instance matrices · max |new − old| = ${worst.toExponential(2)} of the lift · max |old − world-up| = ${worstOldTilt.toExponential(2)}`)
// MUTATION: a tumbled instance must separate them, or this proof cannot see a difference at all
const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 1.1, 0.3)), Ct = cols(new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(1.3, 0.8, 1.1)))
const o = oldLift(Ct), nw = newLift(Ct)
console.log(`mutation (tumbled, axis-scaled): |new − old| = ${dist(o, nw).toFixed(3)} · |new − world-up| = ${dist(nw, [0, 1, 0]).toExponential(2)} · |old − world-up| = ${dist(o, [0, 1, 0]).toFixed(3)}`)
const pass = worst < 1e-6 && dist(o, nw) > 0.1 && dist(nw, [0, 1, 0]) < 1e-6
console.log(pass ? '✅ identical for every current instance; the new form is world-up where the old is not' : '❌ FAIL'); process.exit(pass ? 0 : 1)
