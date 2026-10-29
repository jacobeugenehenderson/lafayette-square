// Aimer (Gimbal, 2026-10-29): every key at ONE depth along its own look. Does the look then tween depth-free on real
// key lists, and does PACING still depend on that depth? Live keys from integration's public/looks/<town>/design.json.
import { readFileSync } from 'node:fs'
import { heroPoseAtTime } from '../../src/preview/heroAnim.js'
const INT = new URL('../../../integration/', import.meta.url)
const json = (p) => JSON.parse(readFileSync(new URL(p, INT), 'utf8'))
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, k) => a.map(v => v * k)
const len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / len(a))
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, norm(a).reduce((s, v, i) => s + v * norm(b)[i], 0)))) * 180 / Math.PI
const LEN = 400
for (const town of ['lafayettesquare', 'provincetown', 'huron', 'hipointedemun']) {
  const d = json(`public/looks/${town}/design.json`), keys = d.heroKeyframes, m = d.heroMotion
  const r = json(`cartograph/data/${town}/neighborhood_boundary.json`).radius
  const at = (D) => keys.map(k => ({ ...k, target: D == null ? k.target : add(k.position, mul(norm(sub(k.target, k.position)), D)) }))
  const play = (ks) => { const o = []; for (let i = 0; i <= LEN; i++) { const p = [0, 0, 0], q = [0, 0, 0]; heroPoseAtTime(ks, m, m.length * i / LEN, p, q); o.push({ p, d: sub(q, p) }) } return o }
  const cmp = (a, b) => { let A = 0, P = 0; a.forEach((f, i) => { A = Math.max(A, ang(f.d, b[i].d)); P = Math.max(P, len(sub(f.p, b[i].p))) }); return `look Δ ${A.toFixed(2)}°, position Δ ${P.toFixed(1)} m` }
  const stored = play(at(null)), eqR = play(at(r)), eq2R = play(at(2 * r)), eqHalf = play(at(r / 2))
  console.log(`${town} (disc radius ${r} m): stored vs equal@radius: ${cmp(stored, eqR)} · equal@radius vs equal@2×radius: ${cmp(eqR, eq2R)} · vs equal@½radius: ${cmp(eqR, eqHalf)}`)
}
