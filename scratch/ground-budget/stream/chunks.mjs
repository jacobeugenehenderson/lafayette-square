// What a spatially chunked ground would load (Brace, 2026-10-14; Boz, for Jacob's size decision; ROADMAP H5 / BACKLOG
// Front-B). Read-only, from existing slabs. Nothing here is a design; it prices one.
//   node --max-old-space-size=3000 scratch/ground-budget/stream/chunks.mjs <slab dir> <served slab dir>
// <slab dir> is cut; <served slab dir> supplies the town's scene.json, terrain, shape.json and the 10-11 ped groups
// (the "far detail" ped). Every byte count: per chunk, each group's UNIQUE vertices × (12 + the slab's terrain bytes per
// vertex) + its triangles × 12 — a vertex on a chunk border is counted in each chunk it serves.
// Granularities, from the town: the tile partition (shape.json tiles; a triangle whose centroid lies in no ring goes to
// the tile with the nearest ring centroid — the share is printed) and square grids of side = the disc's diameter / N.
// Visibility is the camera FRUSTUM against each chunk's box (x/z from its triangles, y from the terrain under its
// vertices × the scene's terrainExag): no occlusion, so it over-counts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { heroPoseAtTime, heroCycleSec } from '../../../src/preview/heroAnim.js'
import { makeElevationSampler } from '../../../src/lib/terrainCommon.js'

const [slabDir, servedDir] = process.argv.slice(2)
const J = (p) => JSON.parse(readFileSync(p, 'utf8'))
const man = J(join(slabDir, 'ground.json')), bin = readFileSync(join(slabDir, man.bin))
const sman = J(join(servedDir, 'ground.json')), sbin = readFileSync(join(servedDir, sman.bin))
const scene = J(join(servedDir, 'scene.json')), shape = J(join(servedDir, 'shape.json'))
if (man.look !== sman.look) throw new Error(`looks differ: ${man.look} vs ${sman.look}`)
const tj = J(join(servedDir, 'terrain.json')), tb = readFileSync(join(servedDir, 'terrain.bin'))
if (tb.length !== tj.width * tj.height * 4) throw new Error('terrain.bin is not width × height float32')
const exag = scene.terrainExag
if (!Number.isFinite(exag)) throw new Error('scene.json has no terrainExag')
const elev = makeElevationSampler({ ...tj, data: new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4) }, exag)
const PED = /^(sidewalk|curb|treelawn)/
// terrain bytes per vertex, per GROUP: raw 4 + grad 16 where the group carries them (a deformer slab carries them on some)
const terrB = (g) => g.rawByteOffset != null && g.gradByteOffset != null ? 20 : 0

// ── load a slab's groups as triangles with centroids
function load(m, b) {
  const tB = Math.max(...m.groups.filter(g => PED.test(g.id)).map(terrB))   // what a ped vertex carries in this slab
  return { tB, groups: m.groups.map(g => {
    const pos = new Float32Array(b.buffer, b.byteOffset + g.vertexByteOffset, g.vertexCount * 3)
    const idx = new Uint32Array(b.buffer, b.byteOffset + g.indexByteOffset, g.indexCount)
    return { id: g.id, ped: PED.test(g.id), pos, idx, nT: g.indexCount / 3, nV: g.vertexCount, tB: terrB(g) }
  }) }
}
const S = load(man, bin), SV = load(sman, sbin)

// ── granularities
const st = man.stencil, R = st.radius, C = st.center
const tiles = shape.tiles.map(t => { const r = t.ring; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, cx = 0, cz = 0
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z }
  return { r, x0, x1, z0, z1, cx: cx / r.length, cz: cz / r.length } })
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
  const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
// tile lookup through a coarse bucket grid of tile boxes
const TB = 64, tbx = (x) => Math.max(0, Math.min(TB - 1, Math.floor((x - (C[0] - R)) / (2 * R) * TB))), tbz = (z) => Math.max(0, Math.min(TB - 1, Math.floor((z - (C[1] - R)) / (2 * R) * TB)))
const buckets = Array.from({ length: TB * TB }, () => [])
tiles.forEach((t, k) => { for (let i = tbx(t.x0); i <= tbx(t.x1); i++) for (let j = tbz(t.z0); j <= tbz(t.z1); j++) buckets[j * TB + i].push(k) })
let byProx = 0, byProxT = 0
const tileOf = (x, z) => {
  for (const k of buckets[tbz(z) * TB + tbx(x)]) { const t = tiles[k]; if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1 && inRing(t.r, x, z)) return k }
  byProx++; let best = 0, bd = Infinity
  tiles.forEach((t, k) => { const d = (t.cx - x) ** 2 + (t.cz - z) ** 2; if (d < bd) { bd = d; best = k } }); return best }
const grid = (N) => { const s = 2 * R / N; return { name: `grid ${N}×${N} (${s.toFixed(0)} m)`, n: N * N,
  of: (x, z) => Math.max(0, Math.min(N - 1, Math.floor((z - C[1] + R) / s))) * N + Math.max(0, Math.min(N - 1, Math.floor((x - C[0] + R) / s))) } }
const SCHEMES = [{ name: `tiles (${tiles.length})`, n: tiles.length, of: tileOf, tiles: true }, grid(16), grid(8), grid(4)]

// ── per scheme, per slab: chunk of every triangle; bytes per chunk (ped / non-ped); boxes
function cut(slab, sc) {
  const n = sc.n, ped = new Float64Array(n), non = new Float64Array(n), tri = new Float64Array(n), triPed = new Float64Array(n)
  const box = Array.from({ length: n }, () => [1e9, 1e9, 1e9, -1e9, -1e9, -1e9])
  for (const g of slab.groups) {
    const seen = new Map()   // chunk → Set of vertex ids is too heavy; mark (vertex, chunk) pairs instead
    const keys = new Float64Array(g.nT * 3); let kn = 0
    for (let t = 0; t < g.nT; t++) {
      const a = g.idx[3 * t], b = g.idx[3 * t + 1], c = g.idx[3 * t + 2]
      const x = (g.pos[3 * a] + g.pos[3 * b] + g.pos[3 * c]) / 3, z = (g.pos[3 * a + 2] + g.pos[3 * b + 2] + g.pos[3 * c + 2]) / 3
      if (sc.tiles) byProxT++
      const k = sc.of(x, z)
      tri[k]++; if (g.ped) triPed[k]++
      ;(g.ped ? ped : non)[k] += 12
      for (const v of [a, b, c]) keys[kn++] = v * n + k
    }
    keys.sort()
    for (let i = 0; i < kn; i++) if (i === 0 || keys[i] !== keys[i - 1]) {
      const v = Math.floor(keys[i] / n), k = keys[i] - v * n
      ;(g.ped ? ped : non)[k] += 12 + g.tB
      const x = g.pos[3 * v], z = g.pos[3 * v + 2], y = elev.getElevation(x, z), bx = box[k]
      if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (z < bx[2]) bx[2] = z
      if (x > bx[3]) bx[3] = x; if (y > bx[4]) bx[4] = y; if (z > bx[5]) bx[5] = z
    }
  }
  return { ped, non, tri, triPed, box, all: Float64Array.from(ped, (p, k) => p + non[k]) }
}

// ── frustum: six planes from position / target / vertical fov / aspect; near from the quality profile (desktop 1)
function frustum(p, t, fovDeg, aspect, near = 1, far = 1e6) {
  const f = norm(sub(t, p)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f)
  const tv = Math.tan(fovDeg * Math.PI / 360), th = tv * aspect
  const planes = [[f, dot(f, p) + near], [neg(f), -dot(f, p) - far]]   // n·x >= d inside
  for (const [s, ax, tt] of [[1, r, th], [-1, r, th], [1, u, tv], [-1, u, tv]]) {
    // side plane through p containing direction f + s·tt·ax and the other axis
    const other = ax === r ? u : r, dir = add(f, mul(ax, s * tt)), n = norm(cross(dir, other))
    const inward = dot(n, f) > 0 ? n : neg(n); planes.push([inward, dot(inward, p)])
  }
  return planes
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], neg = (a) => mul(a, -1), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => mul(a, 1 / Math.hypot(...a))
const boxIn = (planes, b) => planes.every(([n, d]) => n[0] * (n[0] > 0 ? b[3] : b[0]) + n[1] * (n[1] > 0 ? b[4] : b[1]) + n[2] * (n[2] > 0 ? b[5] : b[2]) >= d)
const boxDist = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[3]), Math.max(b[1] - p[1], 0, p[1] - b[4]), Math.max(b[2] - p[2], 0, p[2] - b[5]))

// the frustum test, seen to fail: a box ahead is in, the same box behind, far left, or above a 22° view is out
{ const pl = frustum([0, 0, 0], [0, 0, -10], 22, 16 / 9), at = (x, y, z) => [x - 1, y - 1, z - 1, x + 1, y + 1, z + 1]
  const ok = boxIn(pl, at(0, 0, -50)) && !boxIn(pl, at(0, 0, 50)) && !boxIn(pl, at(-60, 0, -50)) && !boxIn(pl, at(0, 30, -50)) && boxIn(pl, at(10, 0, -50)) && !boxIn(pl, at(0, 0, 0.5))
  if (!ok) throw new Error('frustum self-test failed') }
const MB = (x) => (x / 1e6).toFixed(2)
const sum = (a, set) => { let s = 0; for (const k of set) s += a[k]; return s }
const kf = scene.heroKeyframes, mo = scene.heroMotion, L = mo.length, DT = 0.5, AHEAD = 2
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
const total = (c) => c.all.reduce((s, x) => s + x, 0)

console.log(`== ${man.look} · ${slabDir} · ${bin.length} B · terrain on ${S.groups.filter(g => g.tB).length}/${S.groups.length} groups (ped ${S.tB} B/V) · served ${sman.bin} ${sbin.length} B`)
console.log(`hero: ${kf.length} keys · ${mo.mode} ${L} s · fov ${kf.map(k => k.fov)} · start 'random' (Town.jsx) · cycle ${heroCycleSec(mo).toFixed(0)} s`)
const bf = scene.browseFrame, bfov = scene.shots?.values?.browse?.fov
const bsq = bf ? { x: bf.center[0], z: bf.center[1], half: bf.altitude * Math.tan(bfov * Math.PI / 360), from: 'authored' } : { x: C[0], z: C[1], half: R, from: 'disc' }
for (const sc of SCHEMES) {
  byProx = 0; byProxT = 0
  const c = cut(S, sc), cs = cut(SV, sc)
  const live = [...c.all.keys()].filter(k => c.all[k] > 0), sizes = live.map(k => c.all[k])
  console.log(`\n-- ${sc.name}: ${live.length} non-empty chunks · whole ${MB(total(c))} MB (vs bin ${MB(bin.length)}: border duplication ${(100 * (total(c) / bin.length - 1)).toFixed(1)}%)` +
    (sc.tiles ? ` · ${(100 * byProx / byProxT).toFixed(1)}% of triangles placed by nearest tile centroid (centroid in no ring)` : ''))
  console.log(`   chunk MB p50 ${MB(pct(sizes, .5))} · p90 ${MB(pct(sizes, .9))} · max ${MB(Math.max(...sizes))} · triangles max ${Math.max(...c.tri)}`)
  // far detail: this slab's non-ped + the served slab's ped, the latter at this slab's terrain bytes per vertex
  const farPed = Float64Array.from(cs.ped, (p, k) => p)   // served ped bytes (positions + indices)
  if (S.tB) { // add terrain bytes to the served ped vertices: (served ped bytes − 12·T) / 12 vertices × tB
    for (let k = 0; k < sc.n; k++) { const v = (cs.ped[k] - 12 * cs.triPed[k]) / 12; farPed[k] += v * S.tB } }
  const far = Float64Array.from(c.non, (x, k) => x + farPed[k])
  console.log(`   far detail (this slab's non-ped + served 10-11 ped): ${MB(far.reduce((s, x) => s + x, 0))} MB · this slab's ped alone ${MB(c.ped.reduce((s, x) => s + x, 0))} MB`)
  for (const aspect of [16 / 9, 9 / 16]) {
    const vis = [], cams = []
    for (let s = 0; s <= L + 1e-9; s += DT) { const p = [0, 0, 0], t = [0, 0, 0]; const { fov } = heroPoseAtTime(kf, mo, s, p, t)
      const pl = frustum(p, t, fov, aspect); vis.push(new Set(live.filter(k => boxIn(pl, c.box[k])))); cams.push({ p, fov }) }
    const open = vis.map(v => sum(c.all, v)), ever = new Set(vis.flatMap(v => [...v]))
    const win = vis.map((_, i) => { const w = new Set(); for (let j = i; j <= Math.min(vis.length - 1, i + AHEAD / DT); j++) for (const k of vis[j]) w.add(k); return w })
    const peak = Math.max(...win.map(w => sum(c.all, w)))
    console.log(`   hero ${aspect > 1 ? '16:9' : '9:16'}: first frame (random phase, over every ${DT} s) p50 ${MB(pct(open, .5))} · max ${MB(Math.max(...open))} MB` +
      ` (${pct(vis.map(v => v.size), .5)}–${Math.max(...vis.map(v => v.size))} chunks) · ever seen in the cycle ${MB(sum(c.all, ever))} MB (${ever.size}/${live.length})` +
      ` · peak resident, seen now + next ${AHEAD} s: ${MB(peak)} MB`)
    // near/far: ped at full detail only in chunks whose box is within D of the camera; D where one pixel (1080 px tall)
    // spans e: D = e·1080 / (2·tan(fov/2)). e = the refine tol 7.8 mm (Huron's, groundDeformer.mjs) and 276 mm (Huron's
    // ped p99 at 10-11 settings, options §4) — Huron's values both; HPDM's not measured.
    for (const e of [0.0078, 0.276]) {
      const res = vis.map((_, i) => { let b = 0; for (const k of win[i]) { const near = cams.slice(i, i + AHEAD / DT + 1).some(q => boxDist(q.p, c.box[k]) <= e * 1080 / (2 * Math.tan(q.fov * Math.PI / 360)))
        b += near ? c.all[k] : far[k] } return b })
      const nearOpen = vis.map((v, i) => { let b = 0; for (const k of v) b += boxDist(cams[i].p, c.box[k]) <= e * 1080 / (2 * Math.tan(cams[i].fov * Math.PI / 360)) ? c.all[k] : far[k]; return b })
      const D = kf.map(k => (e * 1080 / (2 * Math.tan(k.fov * Math.PI / 360))).toFixed(0))
      console.log(`     ped near-only, e ${e * 1000} mm (D ${D.join('/')} m at the keys' fov): first frame p50 ${MB(pct(nearOpen, .5))} · max ${MB(Math.max(...nearOpen))} MB · peak resident ${MB(Math.max(...res))} MB`)
    }
  }
  // Browse: every chunk whose box meets the square (whole town from above; no frustum, the square is what it frames)
  const bset = live.filter(k => c.box[k][3] >= bsq.x - bsq.half && c.box[k][0] <= bsq.x + bsq.half && c.box[k][5] >= bsq.z - bsq.half && c.box[k][2] <= bsq.z + bsq.half)
  console.log(`   browse (${bsq.from} square, half ${bsq.half.toFixed(0)} m): ${bset.length} chunks · full ${MB(sum(c.all, bset))} MB · far detail ${MB(sum(far, bset))} MB`)
}
