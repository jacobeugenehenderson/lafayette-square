// Splice probe: around each point, how ① block rings moved between two mints: within R m, the largest distance of an
// AFTER vertex from the BEFORE rings (and back), and vertex counts. One line per point.
//   node scratch/splice/moved.mjs <before.json> <after.json> <points file: "x,z ..." per line> [R=20]
import { readFileSync } from 'node:fs'
const [fa, fb, fp, Rs] = process.argv.slice(2), R = +(Rs || 20)
const rings = (f) => { const P = JSON.parse(readFileSync(f, 'utf8')).protopolygon; return [...P.blocks, ...(P.blockHoles || []).flat()] }
const A = rings(fa), B = rings(fb)
const dSeg = (q, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(a[0] + t * dx - q[0], a[1] + t * dz - q[1]) }
const near = (S, q) => { const out = []; for (const r of S) { if (!r.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < R * 3)) continue; out.push(r) } return out }
const maxOff = (from, to, q) => { let m = 0, n = 0; for (const r of from) for (const p of r) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) > R) continue; n++; let d = Infinity; for (const s of to) for (let i = 0; i < s.length; i++) d = Math.min(d, dSeg(p, s[i], s[(i + 1) % s.length])); m = Math.max(m, d) } return [m, n] }
for (const line of readFileSync(fp, 'utf8').split('\n').filter(Boolean)) { const q = line.split(' ')[0].split(',').map(Number)
  const a = near(A, q), b = near(B, q), [m1, n1] = maxOff(b, a, q), [m2, n2] = maxOff(a, b, q)
  console.log(`${line.padEnd(42)} ① within ${R} m: ${n2} → ${n1} vertices · after-from-before max ${(m1 * 1000).toFixed(2)} mm · before-from-after max ${(m2 * 1000).toFixed(2)} mm`) }
