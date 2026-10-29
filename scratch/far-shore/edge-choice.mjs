// edge-choice.mjs — Boz's question C on BRIEF-the-drape-sizes-one-nested-lattice: what each edge treatment costs, before he rules.
//   (ii) ramp only the edges that face a far chunk: the cost of rebuilding one edge strip (one far step of near stations), and
//        how often a selection change asks for one, on the movie's path (heroPoseAtTime at 60 fps over heroMotion.length) and
//        on a planted Browse zoom (overheadResolves, straight down from browseFrame.altitude to 30 m over 3 s).
//   (iii) no ramp: the boundary row is the far row (shared u's copied, in-between u's lerped). The normal-angle jump between
//        the far triangle and the near triangle on each boundary segment, against the same measure across an interior near
//        row and an interior far row (the rock's own facet-to-facet angle).
// ⚠️ APPROXIMATIONS, stated: the nested lattice is G3 with nAlong/nAcross rounded up to 4m+1/4p+1 and G1 = every 4th of it
// (hMax/toeMax still today's 201 samples); chunks cut on far stations, round(CHUNK_M / far step); a chunk "has stone" if any of
// its near stations is ≥ MIN_ARMOUR_D50_M; the Browse box is the chunk's spine midpoint at y = 0 with radius half its arc + run.
// (i) is not measured: it needs per-octave weights in fieldAt, which is a build.
// ▶ node scratch/far-shore/edge-choice.mjs --look=huron --slab=../integration/public/baked [--edges=200]
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { prepareFaces } from '../../cartograph/bake-revetment-far.js'
import { drapeGlobals } from '../../src/lib/revetmentDrape.js'
import { revetmentDrape } from './revetmentDrape.grid.mjs'
import { CHUNK_M } from '../../src/lib/shoreChunks.js'
import { MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG, d50For } from '../../cartograph/shore-armour.mjs'
import { heroPoseAtTime } from '../../src/preview/heroAnim.js'
import { overheadResolves } from '../../src/lib/cameraRegimes.js'
const arg = (n, d) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const look = arg('look'), dir = `${arg('slab', 'public/baked')}/${look}`, NE = +arg('edges', '200')
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const scene = JSON.parse(readFileSync(`${dir}/scene.json`, 'utf8'))
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
const NEAR_RADIUS_M = 90, RESELECT_M = 6, RESELECT_RAD = 0.05, TAN = Math.tan(RIPRAP_REPOSE_DEG * Math.PI / 180)
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const f2 = (x) => Number.isFinite(x) ? x.toFixed(2) : '—'

// ── the nested lattice and chunks on far stations, per face ──
const all = []   // { f, k, A, B (far range), a, b (near range), at, stone, d50, rad }
for (const f of faces) {
  const G3 = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, octaves: 3 })
  const m = Math.ceil((G3.nAlong - 1) / 4), p = Math.ceil((G3.nAcross - 1) / 4)
  f.G3n = { ...G3, nAlong: 4 * m + 1, nAcross: 4 * p + 1 }; f.G1n = { ...G3, nAlong: m + 1, nAcross: p + 1 }
  const sN = (i) => G3.s0 + (G3.s1 - G3.s0) * i / (4 * m)
  const pf = Math.max(1, Math.round(CHUNK_M / (4 * (G3.s1 - G3.s0) / (4 * m))))
  f.chunks = []
  for (let A = 0, k = 0; A < m; A += pf, k++) {
    const B = Math.min(m, A + pf), a = 4 * A, b = 4 * B
    let hMax = 0; for (let i = a; i <= b; i++) hMax = Math.max(hMax, f.crestAt(sN(i) / G3.total))
    const pi = Math.min(f.poly.length - 1, Math.round(((a + b) / 2 / (4 * m)) * (f.poly.length - 1)))   // SlabRevetment's `at`
    const c = { f, k, A, B, a, b, at: f.poly[pi], stone: hMax >= MIN_ARMOUR_D50_M, d50: d50For(hMax), rad: (sN(b) - sN(a)) / 2 + hMax / TAN }
    f.chunks.push(c); all.push(c)
  }
}
const stoneChunks = all.filter(c => c.stone)
console.log(`${look}: ${faces.length} faces · ${all.length} chunks on far stations (${stoneChunks.length} with stone)`)

// ── (ii) the cost of one edge strip, and of one whole chunk for context ──
const pick = (arr, n) => { const out = []; const st = Math.max(1, Math.floor(arr.length / n)); for (let i = 0; i < arr.length && out.length < n; i += st) out.push(arr[i]); return out }
const time = (fn) => { const t = performance.now(); fn(); return performance.now() - t }
const build = (f, G, oct, stations) => revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: oct, globals: G, stations })
const stripMs = [], chunkMs = []
for (const c of pick(stoneChunks, NE)) stripMs.push(time(() => build(c.f, c.f.G3n, 3, [c.a, Math.min(c.b, c.a + 4)])))
for (const c of pick(stoneChunks, Math.max(10, NE / 4))) chunkMs.push(time(() => build(c.f, c.f.G3n, 3, [c.a, c.b])))
console.log(`  (ii) one edge strip (4 near stations + margin): median ${f2(q(stripMs, .5))} ms, p95 ${f2(q(stripMs, .95))}, max ${f2(Math.max(...stripMs))} (${stripMs.length} sampled)`)
console.log(`       one whole near chunk, for context: median ${f2(q(chunkMs, .5))} ms, p95 ${f2(q(chunkMs, .95))}, max ${f2(Math.max(...chunkMs))} (${chunkMs.length})`)

// ── (ii) how often: replay a selection and count the edges whose neighbour flips ──
function replay(name, frames, chooseAt) {
  let last = null, prev = new Set(), reselects = 0
  const ev = [], first = [], fresh = [], built = new Set(), seenVariant = new Set()
  for (const fr of frames) {
    if (last && Math.hypot(fr.p[0] - last.p[0], fr.p[1] - last.p[1], fr.p[2] - last.p[2]) < RESELECT_M && fr.dir.angleTo(last.dir) < RESELECT_RAD) continue
    last = fr; reselects++
    const now = chooseAt(fr)
    let e = 0, u = 0, n = 0
    for (const c of now) {
      if (!built.has(c)) { built.add(c); n++ }
      for (const side of [-1, 1]) {
        const nb = c.f.chunks[c.k + side]; if (!nb) continue
        const facesFar = !now.has(nb)
        if (prev.has(c) && prev.has(nb) !== now.has(nb)) e++
        const key = `${c.f.key}#${c.k}:${side}:${facesFar}`
        if (!seenVariant.has(key)) { seenVariant.add(key); if (prev.has(c)) u++ }
      }
    }
    ev.push(e); first.push(u); fresh.push(n); prev = now
  }
  const mx = (a) => a.length ? Math.max(...a) : 0, mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1)
  console.log(`  (ii) ${name}: ${frames.length} frames, ${reselects} reselects (every ${f2(frames.length / reselects)} frames)`)
  console.log(`       edge rebuilds per reselect, uncached: max ${mx(ev)}, p99 ${q(ev, .99)}, mean ${f2(mean(ev))} · both variants cached, first builds: max ${mx(first)}, total ${first.reduce((s, x) => s + x, 0)}`)
  console.log(`       whole new chunks per reselect, today's cost for context: max ${mx(fresh)}, mean ${f2(mean(fresh))}`)
  const m = mx(ev)
  console.log(`       ⇒ worst reselect, uncached: ${m} × ${f2(q(stripMs, .5))} ms = ${f2(m * q(stripMs, .5))} ms (at p95 strip ${f2(m * q(stripMs, .95))} ms) · cached: ${mx(first)} × = ${f2(mx(first) * q(stripMs, .5))} ms`)
}
{ // the movie
  const K = scene.heroKeyframes, M = scene.heroMotion, L = M?.length
  if (!(L > 0)) throw new Error('edge-choice: scene.json heroMotion has no length')
  const frames = [], p = [0, 0, 0], t = [0, 0, 0]
  for (let i = 0; i <= L * 60; i++) { heroPoseAtTime(K, M, i / 60, p, t); frames.push({ p: p.slice(), dir: new THREE.Vector3(t[0] - p[0], t[1] - p[1], t[2] - p[2]).normalize() }) }
  replay(`the movie (${L} s, ${M.mode})`, frames, (fr) => new Set(stoneChunks.filter(c => Math.hypot(c.at.x - fr.p[0], c.at.z - fr.p[2]) <= NEAR_RADIUS_M)))
}
{ // a planted Browse zoom, onto the middle of the longest face
  const fov = scene.shots?.values?.browse?.fov, alt0 = scene.browseFrame?.altitude
  if (!(fov > 0) || !(alt0 > 0)) throw new Error('edge-choice: scene.json has no shots.values.browse.fov / browseFrame.altitude')
  const face = faces.reduce((a, b) => (b.lengthM > a.lengthM ? b : a)), tc = face.chunks.filter(c => c.stone)[Math.floor(face.chunks.filter(c => c.stone).length / 2)]
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 1, 1e6), fr = new THREE.Frustum(), mtx = new THREE.Matrix4(), ctr = new THREE.Vector3()
  const frames = []
  for (let i = 0; i <= 180; i++) { const alt = alt0 * Math.pow(30 / alt0, i / 180); frames.push({ p: [tc.at.x, alt, tc.at.z], dir: new THREE.Vector3(0, -1, 0) }) }
  replay(`a Browse zoom onto ${face.key} (${f2(alt0)} m → 30 m in 3 s)`, frames, (f) => {
    cam.position.set(...f.p); cam.up.set(0, 0, -1); cam.lookAt(f.p[0], 0, f.p[2]); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
    fr.setFromProjectionMatrix(mtx.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    return new Set(stoneChunks.filter(c => overheadResolves(cam, 1080, fr, ctr.set(c.at.x, 0, c.at.z), c.rad, c.d50, 3)))
  })
}

// ── (iii) the slope step at a boundary row that is the far row ──
const grid = (f, G, oct, stations) => { const g = { ...G, __grid: [] }; build(f, g, oct, stations); return g.__grid[0] }
const V = (g, i, j) => { const o = ((i - g.bld0) * g.nAcross + j) * 3; return [g.pos[o], g.pos[o + 1], g.pos[o + 2]] }
const K_ = (g, i, j) => g.keep[(i - g.bld0) * g.nAcross + j]
const nrm = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return n.map(x => x / l) }
const ang = (n, m) => Math.acos(Math.max(-1, Math.min(1, n[0] * m[0] + n[1] * m[1] + n[2] * m[2]))) * 180 / Math.PI
const drawn = (g, i, j) => K_(g, i - 1, j) + K_(g, i - 1, j + 1) + K_(g, i, j) + K_(g, i, j + 1) >= 3   // quad (i−1, i) × (j, j+1)
// across row r of grid g: tri (b,c,e) of quad (r−1, r) against tri (a,c,b) of quad (r, r+1), column j
const across = (g, r, j) => drawn(g, r, j) && drawn(g, r + 1, j) ? ang(nrm(V(g, r - 1, j + 1), V(g, r, j), V(g, r, j + 1)), nrm(V(g, r, j), V(g, r + 1, j), V(g, r, j + 1))) : null
const jump = [], baseNear = [], baseFar = []
for (const c of pick(stoneChunks.filter(c => c.A > 0 && c.f.chunks[c.k - 1]?.stone), NE)) {
  const f = c.f, I = c.A
  const F = grid(f, f.G1n, 1, [I - 1, I + 1]), N = grid(f, f.G3n, 3, [4 * I, 4 * I + 3])
  for (let J = 0; J < f.G1n.nAcross - 1; J++) {
    const fa = across(F, I, J); if (fa != null) baseFar.push(fa)
    if (!drawn(F, I, J)) continue
    const nF = nrm(V(F, I - 1, J + 1), V(F, I, J), V(F, I, J + 1))          // the far triangle on the far side of row I
    for (let s = 0; s < 4; s++) {
      const j = 4 * J + s
      const lerp = (jj) => { const J0 = Math.floor(jj / 4), w = (jj % 4) / 4, A = V(F, I, J0), B = V(F, I, Math.min(f.G1n.nAcross - 1, J0 + 1)); return A.map((x, k) => x + (B[k] - x) * w) }
      const a = lerp(j), b = lerp(j + 1), cc = V(N, 4 * I + 1, j)             // near quad (4I, 4I+1) × (j, j+1), row 4I conformed
      jump.push(ang(nF, nrm(a, cc, b)))
      const bn = across(N, 4 * I + 2, j); if (bn != null) baseNear.push(bn)
    }
  }
}
const row = (name, a) => console.log(`  (iii) ${name}: median ${f2(q(a, .5))}°, p95 ${f2(q(a, .95))}°, p99 ${f2(q(a, .99))}°, max ${f2(Math.max(...a))}° (${a.length} segments)`)
row('far → near at a conformed boundary row', jump)
row('baseline: across an interior near row (octaves 3 both sides)', baseNear)
row('baseline: across an interior far row (octave 1 both sides)', baseFar)
