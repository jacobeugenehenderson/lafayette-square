// Aimer, Boz's Q2 (Gimbal, 2026-10-29): what target point an aimed key carries changes the in-between frames,
// because src/preview/heroAnim.js splines each key's TARGET POINT (and paces on target travel), not its look direction.
// Keys share position + look direction across variants; only the target's DISTANCE along the look differs.
import { heroPoseAtTime } from '../../src/preview/heroAnim.js'
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, k) => a.map(v => v * k)
const norm = (a) => mul(a, 1 / Math.hypot(...a))
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, norm(a).reduce((s, v, i) => s + v * norm(b)[i], 0)))) * 180 / Math.PI
const dirFrom = (pitchDeg, yawToward, P) => { const h = norm([yawToward[0] - P[0], 0, yawToward[2] - P[2]]), p = pitchDeg * Math.PI / 180; return norm([h[0] * Math.cos(p), Math.sin(p), h[2] * Math.cos(p)]) }
const apex = [0, 190, 0]
// Two LS-scale keys looking toward a 190 m apex. Pitches are the AIMED views; heights are camera heights above ground 0.
const shots = {
  'arch, both keys look down (−4°, −6°)': [{ P: [-900, 60, 700], pitch: -4 }, { P: [-400, 40, 900], pitch: -6 }],
  'arch, both keys look up at the apex (+3°, +9°)': [{ P: [-900, 60, 700], pitch: 3 }, { P: [-400, 40, 900], pitch: 9 }],
  'mixed: key 0 down −8°, key 1 up +9°': [{ P: [-900, 60, 700], pitch: -8 }, { P: [-400, 40, 900], pitch: 9 }],
}
const motion = { length: 8, mode: 'bounce' }
const LEN = 200
const play = (keys) => { const out = []; for (let i = 0; i <= LEN; i++) { const p = [0, 0, 0], q = [0, 0, 0]; heroPoseAtTime(keys, motion, motion.length * i / LEN, p, q); out.push({ p, d: sub(q, p) }) } return out }
for (const [name, ks] of Object.entries(shots)) {
  const dirs = ks.map(k => dirFrom(k.pitch, apex, k.P))
  const ground = ks.map((k, i) => dirs[i][1] < 0 ? k.P[1] / -dirs[i][1] : null)
  const apexD = ks.map(k => Math.hypot(...sub(apex, k.P)))
  const variants = {
    'α rotated, old dist 300 m': ks.map(() => 300),
    'α rotated, old dist 1500 m': ks.map(() => 1500),
    'β ground under centre': ground.map((g, i) => g ?? null),
    'γ grabbed point (apex depth)': apexD,
  }
  console.log(`\n${name}   (ground-under-centre: ${ground.map(g => g ? g.toFixed(0) + ' m' : 'NONE (above horizon)').join(', ')}; apex: ${apexD.map(d => d.toFixed(0)).join(', ')} m)`)
  const runs = {}
  for (const [v, ds] of Object.entries(variants)) {
    if (ds.some(d => d == null)) { console.log(`  ${v.padEnd(32)} — undefined: a key looks above the horizon`); continue }
    const keys = ks.map((k, i) => ({ position: k.P, target: add(k.P, mul(dirs[i], ds[i])), fov: 22, t: i }))
    runs[v] = play(keys)
  }
  const ref = runs['γ grabbed point (apex depth)']
  for (const [v, r] of Object.entries(runs)) {
    let maxA = 0, at = 0, maxP = 0
    r.forEach((f, i) => { const a = ang(f.d, ref[i].d); if (a > maxA) { maxA = a; at = i / LEN }; maxP = Math.max(maxP, Math.hypot(...sub(f.p, ref[i].p))) })
    const mid = r[LEN / 2]
    console.log(`  ${v.padEnd(32)} mid-frame pitch ${(Math.asin(norm(mid.d)[1]) * 180 / Math.PI).toFixed(2)}° · vs γ: max look Δ ${maxA.toFixed(2)}° at t=${at.toFixed(2)}, max position Δ ${maxP.toFixed(1)} m (pacing)`)
  }
}

// ── Only the RATIO of the keys' target distances matters? Sweep key 1's distance with key 0's fixed. ──
{
  const ks = shots['mixed: key 0 down −8°, key 1 up +9°'], dirs = ks.map(k => dirFrom(k.pitch, apex, k.P))
  const mk = (d0, d1) => play(ks.map((k, i) => ({ position: k.P, target: add(k.P, mul(dirs[i], i ? d1 : d0)), fov: 22, t: i })))
  const base = mk(1000, 1000)
  console.log('\nratio sweep (mixed shot), vs equal distances:')
  for (const [d0, d1] of [[300, 300], [5000, 5000], [1000, 100], [1000, 300], [1000, 3000], [1000, 10000], [431, 996]]) {
    const r = mk(d0, d1); let m = 0; r.forEach((f, i) => { m = Math.max(m, ang(f.d, base[i].d)) })
    console.log(`  d0 ${String(d0).padStart(5)} m, d1 ${String(d1).padStart(5)} m (ratio ${(d1 / d0).toFixed(2)}): max look Δ ${m.toFixed(2)}°`)
  }
}
// ── Three keys: does target depth change PACING (when the camera is where)? ──
{
  const P = [[-900, 60, 700], [-400, 40, 900], [200, 30, 800]], pitches = [-6, 4, -3]
  const dirs = P.map((p, i) => dirFrom(pitches[i], apex, p))
  const m3 = { length: 12, mode: 'bounce' }
  const run = (ds) => { const keys = P.map((p, i) => ({ position: p, target: add(p, mul(dirs[i], ds[i])), fov: 22, t: [0, 0.5, 1][i] })); const o = []; for (let i = 0; i <= LEN; i++) { const a = [0, 0, 0], b = [0, 0, 0]; heroPoseAtTime(keys, m3, m3.length * i / LEN, a, b); o.push({ p: a, d: sub(b, a) }) } return o }
  const g = run(P.map(p => Math.hypot(...sub(apex, p))))
  for (const [v, ds] of [['all 300 m', [300, 300, 300]], ['300 / 2000 / 300', [300, 2000, 300]], ['2000 / 300 / 2000', [2000, 300, 2000]]]) {
    const r = run(ds); let mA = 0, mP = 0
    r.forEach((f, i) => { mA = Math.max(mA, ang(f.d, g[i].d)); mP = Math.max(mP, Math.hypot(...sub(f.p, g[i].p))) })
    console.log(`  3 keys, ${v.padEnd(18)} vs γ: max look Δ ${mA.toFixed(2)}°, max position Δ ${mP.toFixed(1)} m (same path, different pacing)`)
  }
}
