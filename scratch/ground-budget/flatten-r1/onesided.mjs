// onesided.mjs — the measure (A) is judged by, shared by the live capture and the frozen (pre-move) shape: per tile, every
// evidence-part vertex 0 < d ≤ 5 mm off an iA edge that is neither an iA vertex nor a raw evidence vertex (made by a cut, on
// one side), split by whether that iA edge lies on the RIM (both ends within 1 mm of the boundary ring's line).
const sd = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
export function makeRim(boundary) {
  const B = boundary || []
  const near = p => { for (let k = 0; k < B.length; k++) if (sd(p, B[k], B[(k + 1) % B.length]) <= 0.001) return true; return false }
  return (a, b) => near(a) && near(b)
}
export function oneSided(iA, parts, rawKeys, onRim) {
  const keys = new Set(iA.flat().map(v => v.join(','))); const out = { rim: 0, interior: 0, poured: 0, at: [] }
  for (const e of (parts || []).flatMap(l => l || [])) for (const r of e.rings) for (const p of r) { const kk = p.join(','); if (keys.has(kk)) continue
    let d = Infinity, ea = null, eb = null
    for (const ring of iA) for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], dd = sd(p, a, b); if (dd < d) { d = dd; ea = a; eb = b } }
    if (!(d > 0 && d <= 0.005)) continue
    if (rawKeys.has(kk)) { out.poured++; continue }
    const rim = onRim(ea, eb); out[rim ? 'rim' : 'interior']++; if (out.at.length < 6) out.at.push([p, rim ? 'rim' : 'int', +(d * 1000).toFixed(2)]) }
  return out
}
