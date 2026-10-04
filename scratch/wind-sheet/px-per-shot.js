// Paste into a Preview page (javascript_tool / devtools), in the shot to measure, with the tab in the FOREGROUND (a
// background tab runs no frames, so the camera never lands). How many screen pixels the card wind moves a crown top:
// per sampled on-screen tree, the shader's own formula (treeAtlasMaterial.js CARD_WIND_RIGID: amp = (0.12·floor +
// 0.035·felt)·heightNorm; lean 0.7·amp + hula amp ⇒ ≈1.7·amp at the top; flutter 0.05 m per m/s) is projected through
// the live camera at the tree's real top (instance matrix × geometry bbox top). ⚠️ COMPUTED from the live scene, not
// measured off frames. Gains are copied from the shader as of fc2c8145 — re-read them if the card wind changes.
window.__pxMeasure = async (maxTrees = 160) => {
  const threeUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js/.test(n)); const T = await import(threeUrl)
  const r = window.__renderer, cam = window.__camera, w = window.__windSheet, a = w.air; const size = r.getDrawingBufferSize(new T.Vector2())
  const g = window.__scene.getObjectByName('town:trees'); const meshes = []
  g.traverse((o) => { if (!o.isInstancedMesh) return; let v = true, p = o; while (p) { if (!p.visible) { v = false; break } p = p.parent } if (v && o.count) meshes.push(o) })
  const proj = (p) => { const v = p.clone().project(cam); return { x: (v.x * 0.5 + 0.5) * size.x, y: (v.y * 0.5 + 0.5) * size.y, z: v.z } }
  const dir = new T.Vector3(a.baseDirection[0], 0, a.baseDirection[1]).normalize()
  const M = new T.Matrix4(), W = new T.Matrix4(), out = [], cand = []
  for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); const floorU = r.properties.get(m.material)?.uniforms?.uWindFloor?.value ?? null; for (let i = 0; i < m.count; i++) cand.push([m, i, floorU, m.geometry.boundingBox.max.y]) }
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]] }
  for (const [m, i, floorU, top] of cand) {
    if (out.length >= maxTrees) break
    m.getMatrixAt(i, M); W.multiplyMatrices(m.matrixWorld, M)
    const P = new T.Vector3(0, top, 0).applyMatrix4(W); const s = proj(P)
    if (s.z < -1 || s.z > 1 || s.x < 0 || s.y < 0 || s.x > size.x || s.y > size.y) continue
    const px = (metres) => { const q = proj(P.clone().addScaledVector(dir, metres)); return Math.hypot(q.x - s.x, q.y - s.y) }
    const fl = floorU ?? 1
    out.push({ floor: fl, floorPx: px(1.7 * 0.12 * fl), gustLeanPx: px(1.7 * 0.035 * a.gustsScale), gustFlutterPx: px(0.05 * a.gustsScale), mPerPx: 1 / px(1) })
  }
  const q = (arr, k) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))] }
  const by = (f) => ({ p10: +q(out.map(f), 0.1).toFixed(2), med: +q(out.map(f), 0.5).toFixed(2), p90: +q(out.map(f), 0.9).toFixed(2) })
  return { n: out.length, buffer: [size.x, size.y], floors: [...new Set(out.map((o) => o.floor))], gustsScale: +a.gustsScale.toFixed(2), baseSpeed: +a.baseSpeedMps.toFixed(2),
    alwaysOnSwayPx: by((o) => o.floorPx), gustPeakLeanPx: by((o) => o.gustLeanPx), gustPeakFlutterPx: by((o) => o.gustFlutterPx), mPerPx: by((o) => o.mPerPx) }
}
