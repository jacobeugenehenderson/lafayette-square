// girdle-split.mjs — the OWNER SEAMS left under a deformer (a make-why.mjs probe copy: --why), on the gate slab's FIXED
// mesh, and each surviving seam wall split by its two owners' own profile inputs (the owners with the highest and lowest
// height among its vertices). Per owner: the rise its ray needs to reach the terrain at its band's back edge (Araw), its
// band's capacity there (lawn + walk shares, the town's limits over the band's widths), and what it took (R):
//   PINNED          an owner took less than it needed AND less than its capacity (R held below what the band could take)
//   BEYOND LIMITS   neither is pinned, and the two owners' station heights differ by more than both bands can take together
//                   (|H_A − H_B| > cap_A + cap_B: back-to-back bands on a real slope)
//   within limits   neither is pinned, and the difference is within what both can take (cause not established)
//   on ② / road     an owner reads ② or the road side (no profile)
// Read-only. node --max-old-space-size=8000 girdle-split.mjs --slab=… --dump=… --why=<copy> [--tol=0.01]
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { readBakeDesign } from '../../../cartograph/lookDesign.mjs'
import { loadSceneTerrain } from '../../../cartograph/terrainLoad.js'
import { resolveWalkNorm, resolveLawnNorm } from '../../../cartograph/curb-cut-norm.mjs'
import { LATTICE_M } from '../../../src/lib/lattice.js'
import { lineHeights } from '../../../.claude/worktrees/hpdm-gate/cartograph/lineHeight.mjs'
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const TOL = +(arg('tol') || 0.01), dir = arg('slab'), gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8')), buf = readFileSync(join(dir, gj.bin)), AB = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const town = gj.look, design = readBakeDesign(town, town, 'girdle-split'), T = loadSceneTerrain(town), raw = T.getElevationRaw, E = T.exag
const walkN = resolveWalkNorm(town, null), lawnN = resolveLawnNorm(town, null), lawn = lawnN.slopeMax
const blend = design.groundBlendM > 0 ? design.groundBlendM : T.stepM, sigma = design.groundLineSigmaM > 0 ? design.groundLineSigmaM : T.stepM
const rib = JSON.parse(readFileSync(`cartograph/data/${town}/clean/ribbons.json`, 'utf8')).streets, LH = lineHeights({ streets: rib, raw, sigma })
const dump = JSON.parse(readFileSync(arg('dump'), 'utf8')), { buildDeformer } = await import(resolve(arg('why')))
const D = buildDeformer({ town, tiles: dump.tiles, bands: dump.bands, stencil: dump.stencil, raw, line: { step: LH.step, heightAt: LH.heightAt }, limits: { walkMax: walkN.crossSlopeMax ?? 0, lawnMax: lawnN.slopeMax ?? null, exag: E, blend, sigma } })
const b2b = new Map(), geo = new Map(), bz = new Map(), churn = new Map(); let walkOver = 0, bzN = 0
const cls = { 'reach edge': 0, unowned: 0, 'owner seam': 0, 'one owner': 0 }, split = new Map(), ex0 = new Map(); let walls = 0, worst = 0
const add = (k, ex) => { split.set(k, (split.get(k) || 0) + 1); ex0.set(k, Math.max(ex0.get(k) || 0, ex)) }
for (const g of gj.groups) { if (g.rawByteOffset == null) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  const h = new Float64Array(g.vertexCount), own = new Array(g.vertexCount), st = new Uint8Array(g.vertexCount), ter = new Float64Array(g.vertexCount)
  for (let v = 0; v < g.vertexCount; v++) { const x = P[v * 3], z = P[v * 3 + 2], d = D.heightAt(x, z); ter[v] = raw(x, z)
    if (d == null) { h[v] = ter[v]; st[v] = D.unownedIn(x, z) != null ? 2 : 1 } else { h[v] = d; own[v] = D.ownerAt(x, z) } }
  for (let k = 0; k < I.length; k += 3) { const a = I[k], b = I[k + 1], c = I[k + 2]
    const ex = (Math.max(h[a], h[b], h[c]) - Math.min(h[a], h[b], h[c])) * E - (Math.max(ter[a], ter[b], ter[c]) - Math.min(ter[a], ter[b], ter[c])) * E
    if (!(ex > LATTICE_M)) continue
    const span = Math.max(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]), Math.hypot(P[b * 3] - P[c * 3], P[b * 3 + 2] - P[c * 3 + 2]), Math.hypot(P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]))
    if (/^mat:(sidewalk|curb)/.test(`${g.kind}:${g.id}`) && ex > (walkN.crossSlopeMax ?? 0) * span && !(st[a] || st[b] || st[c]) && (own[a] !== own[b] || own[b] !== own[c])) walkOver++
    if (ex <= lawn * span) continue
    walls++; worst = Math.max(worst, ex)
    // --blendzone: is this wall inside the band blend (a vertex two or more owners hold), and at which limit does it fail
    if (arg('blendzone') && [a, b, c].some(v => (D._why(P[v * 3], P[v * 3 + 2]).why?.blended ?? 0) > 1)) { const hk = new Set([a, b, c].map(v => D._why(P[v * 3], P[v * 3 + 2]).why?.heldKeys ?? '—')); churn.set(hk.size > 1 ? 'CHURN (the held set differs across the triangle)' : 'one held set', (churn.get(hk.size > 1 ? 'CHURN (the held set differs across the triangle)' : 'one held set') || 0) + 1); const k = `${/^mat:(sidewalk|curb)/.test(`${g.kind}:${g.id}`) ? 'walk/curb' : /^mat:treelawn/.test(`${g.kind}:${g.id}`) ? 'lawn' : 'other group'} · ${ex > 1 ? '> 1 m' : ex > 0.1 ? '0.1–1 m' : '< 0.1 m'}`; bz.set(k, (bz.get(k) || 0) + 1); bzN++ }
    const c0 = st[a] === 1 || st[b] === 1 || st[c] === 1 ? 'reach edge' : st[a] === 2 || st[b] === 2 || st[c] === 2 ? 'unowned' : (own[a] !== own[b] || own[b] !== own[c]) ? 'owner seam' : 'one owner'
    cls[c0]++; if (c0 !== 'owner seam') continue
    const vs = [a, b, c].sort((p, q) => h[p] - h[q]), lo = vs[0], hi = vs[2], wl = D._why(P[lo * 3], P[lo * 3 + 2]).why, wh = D._why(P[hi * 3], P[hi * 3 + 2]).why
    if (wl?.R == null || wh?.R == null) { add('on ② / road side (no profile)', ex); continue }
    // BACK-TO-BACK: the two owners' bands meet with NO land use between them — a band ray from one owner's station toward
    // the other's finds only curb / lawn / walk (never a lot) over the distance between them
    { const dx = wh.st[0] - wl.st[0], dz = wh.st[1] - wl.st[1], L = Math.hypot(dx, dz)
      const B = L > 0 ? D._bandsAlong(wl.st[0], wl.st[1], dx / L, dz / L, L) : [], lot = B.some(b => b.cls === 'lot' && b.to - b.from > LATTICE_M && b.from < L)
      b2b.set(lot ? 'land use between them' : 'BACK-TO-BACK (no land use between)', (b2b.get(lot ? 'land use between them' : 'BACK-TO-BACK (no land use between)') || 0) + 1) }
    // the back-to-back seam's GEOMETRY: a highway owner · facing rays (two near-parallel streets across one strip) · one
    // tile's ring meeting itself (a block's inner corner) · other — with three sites each
    { const dx = wh.st[0] - wl.st[0], dz = wh.st[1] - wl.st[1], L = Math.hypot(dx, dz)
      const B = L > 0 ? D._bandsAlong(wl.st[0], wl.st[1], dx / L, dz / L, L) : []
      if (!B.some(b => b.cls === 'lot' && b.to - b.from > LATTICE_M && b.from < L)) {
        const nm = (w) => w.arc != null ? 'arc' : dump.tiles[w.t]?.runs?.[w.stamp]?.skelId ?? '?'
        const ray = (w, v) => { const x = P[v * 3] - w.st[0], z = P[v * 3 + 2] - w.st[1], l = Math.hypot(x, z) || 1; return [x / l, z / l] }
        const [ax, az] = ray(wl, lo), [bx, bz] = ray(wh, hi), ang = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz))) * 180 / Math.PI
        const k = [nm(wl), nm(wh)].includes('__highway__') ? '(c) a street against __highway__' : ang > 135 ? '(b) facing rays: near-parallel streets sharing one strip' : wl.t === wh.t && wl.k === wh.k ? "(a) one tile's ring meeting itself: a block's inner corner" : '(d) other'
        const e = geo.get(k) || { n: 0, ex: [] }; e.n++; if (e.ex.length < 3 && !e.ex.some(q => Math.hypot(q.x - P[lo * 3], q.z - P[lo * 3 + 2]) < 20)) e.ex.push({ x: P[lo * 3], z: P[lo * 3 + 2], a: nm(wl), b: nm(wh), ang, ex }); geo.set(k, e) } }
    const capOf = (w) => w.lawnCap * (w.lawnW > 0 ? 1 : 0) + w.walkCap, took = (w) => w.byLawn + w.byWalk
    const pinned = (w) => took(w) < Math.min(Math.abs(w.Araw), capOf(w)) - TOL
    if (pinned(wl) || pinned(wh)) { add('PINNED (an owner took less than it needed and less than its band can take)', ex); continue }
    add(Math.abs(wh.H - wl.H) > capOf(wl) + capOf(wh) + TOL ? 'BEYOND LIMITS (the two lines differ by more than both bands can take)' : 'within limits, neither pinned (cause not established)', ex) } }
console.log(`${arg('why').split('/').at(-1)}: ${walls} wall(s) · worst ${worst.toFixed(2)} m · ${Object.entries(cls).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
for (const [k, n] of [...split].sort((x, y) => y[1] - x[1])) console.log(`    ${String(n).padStart(6)}  ${k} · worst ${ex0.get(k).toFixed(2)} m`)
for (const [k, e] of [...geo].sort((x, y) => y[1].n - x[1].n)) console.log(`      ${String(e.n).padStart(6)}  ${k} · e.g. ${e.ex.map(q => `(${q.x.toFixed(1)}, ${q.z.toFixed(1)}) ${q.a} ↔ ${q.b} ${q.ang.toFixed(0)}° ${q.ex.toFixed(2)} m`).join(' · ')}`)
if (arg('blendzone')) console.log(`    walls INSIDE the band blend (a vertex held by ≥ 2 owners): ${bzN} · held set: ${[...churn].map(([k, n]) => `${k} ${n}`).join(' · ')} · ${[...bz].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
console.log(`    seam triangles in walk/curb over the WALK limit across them (not only walls): ${walkOver}`)
console.log(`    seams with a profile on both owners: ${[...b2b].map(([k, n]) => `${k} ${n}`).join(' · ')}`)
