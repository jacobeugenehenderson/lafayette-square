// Aimer pre-build probe (Gimbal, 2026-10-29). Not a check; measures three things for Zob's read:
//  A. three-stdlib OrbitControls.update(): is polar measured about the CURRENT camera.up, or the up at construction?
//  B. the two-ray in-place solve: camera position after solve + controls.update(), per mount polar limits.
//  C. delta-based rotation vs the ray solve: pixel error of the grabbed direction, by screen position and depth.
import * as THREE from 'three'
import { OrbitControls } from 'three-stdlib'

const W = 1600, H = 900
const dom = { style: {}, addEventListener() {}, removeEventListener() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} }, getRootNode() { return this }, clientHeight: H, clientWidth: W }
const mkCam = () => { const c = new THREE.PerspectiveCamera(22, W / H, 1, 1e5); return c }

// ── A ──
{
  const cam = mkCam(); cam.up.set(0, 0, -1); cam.position.set(0, 1000, 0.01); cam.lookAt(0, 0, 0)
  const ctl = new OrbitControls(cam, dom)                      // built under Browse's up
  cam.up.set(0, 1, 0); cam.position.set(-800, 120, 600); ctl.target.set(0, 0, 0); cam.lookAt(0, 0, 0)
  const before = cam.position.clone()
  ctl.minPolarAngle = 0; ctl.maxPolarAngle = Math.PI * 0.45   // binds only if polar is about world-Y
  ctl.update()
  const off = cam.position.clone().sub(ctl.target)
  console.log('A  built with up (0,0,-1), switched to (0,1,0); polar about Y after update =',
    (Math.acos(off.y / off.length()) * 180 / Math.PI).toFixed(3), '° (limit 81°; pre-update',
    (Math.acos(before.y / before.length()) * 180 / Math.PI).toFixed(3), '°) → polar is about the',
    Math.abs(Math.acos(off.y / off.length()) - 0.45 * Math.PI) < 1e-6 ? 'CURRENT up' : 'BUILD-TIME up')
}

// ── the solve ──
const tanH = Math.tan(THREE.MathUtils.degToRad(22) / 2)
const localRay = (px, py) => new THREE.Vector3(((px / W) * 2 - 1) * tanH * (W / H), (-(py / H) * 2 + 1) * tanH, -1).normalize()
const worldRay = (cam, px, py) => localRay(px, py).applyQuaternion(cam.quaternion)
const pitchYaw = (cam) => { const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); return [e.x, e.y] }
function solve(cam, g, l, limits) {
  const A = l.y, B = -l.z, R = Math.hypot(A, B)
  const base = Math.atan2(B, A), s = Math.acos(THREE.MathUtils.clamp(g.y / R, -1, 1))
  const [p0] = pitchYaw(cam)
  let th = [base + s, base - s].map(t => Math.atan2(Math.sin(t), Math.cos(t))).sort((a, b) => Math.abs(a - p0) - Math.abs(b - p0))[0]
  const EPS = 1e-6   // OrbitControls' own Spherical.makeSafe margin
  th = THREE.MathUtils.clamp(th, Math.max(limits.min, EPS) - Math.PI / 2, Math.min(limits.max, Math.PI - EPS) - Math.PI / 2)
  const v = l.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), th)
  const psi = Math.atan2(g.x, g.z) - Math.atan2(v.x, v.z)
  return [th, psi]
}
const pxOf = (cam, dir) => { cam.updateMatrixWorld(); const p = cam.position.clone().add(dir.clone().multiplyScalar(1000)).project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] }

// ── B ──
for (const [name, limits, ask] of [['orbit (Stage)', { min: 0, max: Math.PI }, [800, 200]], ['lab (max 0.499π)', { min: 0, max: Math.PI * 0.499 }, [800, 200]], ['orbit, apex to bottom edge', { min: 0, max: Math.PI }, [800, 880]], ['lab, apex to bottom edge', { min: 0, max: Math.PI * 0.499 }, [800, 880]]]) {
  const cam = mkCam(); cam.position.set(-1500, 40, 1300); const ctl = new OrbitControls(cam, dom)
  ctl.minPolarAngle = limits.min; ctl.maxPolarAngle = limits.max
  ctl.target.set(-1200, 0, 1000); cam.lookAt(ctl.target); ctl.update()
  const P = cam.position.clone(), dist = P.distanceTo(ctl.target)
  const apex = new THREE.Vector3(0, 190, 0)                    // a 190 m apex ~2 km off
  const g = apex.clone().sub(P).normalize()
  const [th, psi] = solve(cam, g, localRay(...ask), limits)  // drag the apex to the upper middle
  cam.quaternion.setFromEuler(new THREE.Euler(th, psi, 0, 'YXZ'))
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
  ctl.target.copy(P).addScaledVector(fwd, dist); ctl.update()
  const [x, y] = pxOf(cam, g)
  console.log(`B  ${name}: |Δposition| after update = ${cam.position.distanceTo(P).toExponential(2)} m · roll ${(new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ').z).toExponential(1)} · apex lands at (${x.toFixed(2)}, ${y.toFixed(2)}) px, asked (${ask}) · pitch ${(th*180/Math.PI).toFixed(2)}°`)
}

// ── C ──
for (const [label, P, from, to, depth] of [
  ['near 50 m, centre→centre+200px', [0, 30, 0], [800, 450], [1000, 450], 50],
  ['far 2 km, centre→centre+200px', [0, 30, 0], [800, 450], [1000, 450], 2000],
  ['far 2 km, edge drag (1500,100)→(1300,150)', [0, 30, 0], [1500, 100], [1300, 150], 2000],
  ['near 50 m, edge drag (1500,100)→(1300,150)', [0, 30, 0], [1500, 100], [1300, 150], 50],
]) {
  const res = {}
  for (const mode of ['ray', 'delta']) {
    const cam = mkCam(); cam.position.set(...P); cam.lookAt(400, 0, -900)
    cam.updateMatrixWorld(); const g = worldRay(cam, ...from)                           // grabbed point at `depth` along it: depth is irrelevant to a direction
    if (mode === 'ray') { const [th, psi] = solve(cam, g, localRay(...to), { min: 0, max: Math.PI }); cam.quaternion.setFromEuler(new THREE.Euler(th, psi, 0, 'YXZ')) }
    else { const k = THREE.MathUtils.degToRad(22) / H; const [p, yw] = pitchYaw(cam); cam.quaternion.setFromEuler(new THREE.Euler(p + (to[1] - from[1]) * k, yw + (to[0] - from[0]) * k, 0, 'YXZ')) }
    const [x, y] = pxOf(cam, g); res[mode] = Math.hypot(x - to[0], y - to[1])
  }
  console.log(`C  ${label}: ray ${res.ray.toFixed(3)} px · delta ${res.delta.toFixed(2)} px`)
}
