// Coincident chains: a at-grade chain whose vertices ALL lie ≤ 0.5 m from another at-grade chain (≥ 3 vertices, ≥ 10 m).
// Then: how many of the town's in-hood dark sides sit on a coincident chain.
import fs from 'fs'; import path from 'path'
const DATA = '/Users/jacobhenderson/Desktop/lafayette-square.nosync', CODE = DATA + '/.claude/worktrees/census-202'
const S = path.dirname(new URL(import.meta.url).pathname), scene = process.argv[2]
const r = JSON.parse(fs.readFileSync(scene === 'lafayette-square' ? CODE + '/src/data/ribbons.json' : `${DATA}/cartograph/data/${scene}/clean/ribbons.json`, 'utf8'))
const rows = JSON.parse(fs.readFileSync(`${S}/${scene}.frozen.json`, 'utf8'))
const hood = JSON.parse(fs.readFileSync(`${DATA}/cartograph/data/${scene}/neighborhood_boundary.json`, 'utf8')).boundary
const pip = (x, z, ring) => { let o = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o } return o }
const st = r.streets.filter(s => !s.gradeSeparated && !s.disabled && s.points?.length >= 3)
const len = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
const bb = (p) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of p) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a }
const B = st.map(s => bb(s.points))
const d2 = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], C = pts[i], dx = C[0] - A[0], dz = C[1] - A[1], l = dx * dx + dz * dz; let t = l ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dz)) } return m }
const dup = new Map()
for (let i = 0; i < st.length; i++) { if (len(st[i].points) < 10) continue
  for (let j = 0; j < st.length; j++) { if (i === j) continue; const a = B[i], b = B[j]; if (a[0] > b[2] + 1 || b[0] > a[2] + 1 || a[1] > b[3] + 1 || b[1] > a[3] + 1) continue
    if (st[i].points.every(p => d2(p, st[j].points) <= 0.5)) { dup.set(st[i].skelId, st[j].skelId); break } } }
const inH = [...dup.keys()].filter(k => { const s = st.find(x => x.skelId === k); return s.points.some(p => pip(p[0], p[1], hood)) })
const darkIn = rows.filter(x => x.dark && x.Lin > 0), onDup = darkIn.filter(x => dup.has(x.k.split('|')[0]))
console.log(`${scene.padEnd(17)} coincident chains: ${dup.size} (${inH.length} touching the hood) · in-hood dark sides on one: ${onDup.length} of ${darkIn.length} · ${inH.slice(0, 8).map(k => `${k}≡${dup.get(k)}`).join(' · ')}`)
