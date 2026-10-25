// Where does PTown's mat:treelawn:underived refusal come from? (Zob, 2026-10-22, read-only, for Boz)
import { writeFileSync } from 'fs'
import { join } from 'path'
const [W, SCENE, OUT] = process.argv.slice(2)
process.chdir(join(W, 'cartograph'))
const B = await import(join(W, 'cartograph/bake-ground.js'))
const { CLIP_SCALE } = await import(join(W, 'src/lib/lattice.js'))
const s = await B.bakeGround({ look: SCENE, scene: SCENE, stackOnly: true, shorePending: true })
let err = null
try { B.flattenPaintStack(s.stackEntries, { keepOwnSlot: s.keepOwnSlot, doesNotCut: s.doesNotCut }) } catch (e) { err = e.message }
const D = globalThis.__zobDump
if (!D) { writeFileSync(OUT, JSON.stringify({ err }, null, 1)); console.error('no dump; err=', err); process.exit(0) }
const w = (q) => q.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])
const P = { X: D.x, Y: D.y }, R = 0.05 * CLIP_SCALE
const segDist = (p, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; const u = L2 ? Math.max(0, Math.min(1, ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / L2)) : 0; return Math.hypot(p.X - a.X - u * dx, p.Y - a.Y - u * dy) }
const near = (paths, pt, r) => { const hits = []; paths.forEach((q, qi) => { for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length], d = segDist(pt, a, b); if (d <= r) hits.push({ ring: qi, n: q.length, edge: [w([a])[0], w([b])[0]], mm: +(d / CLIP_SCALE * 1000).toFixed(3) }) } }); return hits }
// every region (this group and everything above it) with an edge within 50 mm of the probe, and of each hole/meets vertex
const regions = globalThis.__zobRegions
const own = regions[regions.length - 1]
const pts = [...D.h.q, ...D.meets.q]
const prov = regions.map(r => ({ key: r.key, hitsProbe: near(r.mine, P, R).slice(0, 6),
  vertsOn: pts.map(v => near(r.mine, v, 0.0015 * CLIP_SCALE).length > 0 ? 1 : 0).join('') })).filter(r => r.hitsProbe.length || r.vertsOn.includes('1'))
const res = { err, group: D.groupKey, probe: [D.x / CLIP_SCALE, D.y / CLIP_SCALE],
  hole: { n: D.h.q.length, m2: D.h.a / CLIP_SCALE ** 2, ring: w(D.h.q) },
  meets: { n: D.meets.q.length, m2: D.meets.a / CLIP_SCALE ** 2, sub: D.meets.sub, holes: D.meets.holes.length, dropped: !!D.meets.dropped, ring: w(D.meets.q) },
  stepPathsNear: near(D.paths, P, R),
  ownInputItemsNear: own.items.map((it, i) => ({ i, it })).filter(({ it }) => { const rs = Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]; return rs.some(r => r?.some(([x, z]) => Math.hypot(x - D.x / CLIP_SCALE, z - D.y / CLIP_SCALE) < 30)) }).map(({ i, it }) => ({ i, meta: Array.isArray(it) ? null : Object.fromEntries(Object.entries(it).filter(([k]) => !['outer', 'holes'].includes(k))), outerN: (Array.isArray(it) ? it : it.outer).length })),
  provenance: prov }
writeFileSync(OUT, JSON.stringify(res, null, 1))
console.error(`dump: hole ${res.hole.n}v ${res.hole.m2} m² · meets ${res.meets.n}v ${res.meets.m2} m² sub=${res.meets.sub} · regions touching: ${prov.map(p => p.key + '[' + p.vertsOn + ']').join(' ')} → ${OUT}`)
process.exit(0)
