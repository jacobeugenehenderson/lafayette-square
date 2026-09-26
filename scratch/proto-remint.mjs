// ⭐ RE-MINT ① EXACTLY AS THE POUR DOES — without pouring. derive.js's ① call (the tessellated skeleton, the coast,
// the boundary, the bb) replayed from the scene's own raw + clean inputs, with the CURRENT code. The harness earns
// trust one way: run on unchanged code it must reproduce the frozen `ribbons.protopolygon` EXACTLY (it prints the
// comparison first). `--out=path` writes a copy of the ribbons with the mint's own fields replaced (blockClass and
// flares are computed after the mint by other code and are KEPT from the frozen artifact — said on every run).
//   CARTOGRAPH_SCENE=<scene> node scratch/proto-remint.mjs [--data=<checkout root>] [--out=path]
import fs from 'fs'
import { join } from 'path'
const scene = process.env.CARTOGRAPH_SCENE
if (!scene) { console.error('⛔ set CARTOGRAPH_SCENE (config.js resolves the projection from it at import)'); process.exit(2) }
const root = process.argv.find(a => a.startsWith('--data='))?.slice(7) || '.', out = process.argv.find(a => a.startsWith('--out='))?.slice(6)
const D = (p) => join(root, 'cartograph/data', scene, p)
const { wgs84ToLocal, DEFAULT_MAP } = await import('../cartograph/config.js')
const { tessellateAdaptive } = await import('../cartograph/derive.js')
const { coastRings } = await import('../cartograph/coastline.mjs')
const { mintProtopolygon } = await import('../src/lib/tileGround.js')
const ribP = scene === DEFAULT_MAP ? join(root, 'src/data/ribbons.json') : D('clean/ribbons.json')
const rb = JSON.parse(fs.readFileSync(ribP, 'utf8')), F = rb.protopolygon
const sk = JSON.parse(fs.readFileSync(D('clean/skeleton.json'), 'utf8')), osm = JSON.parse(fs.readFileSync(D('raw/osm.json'), 'utf8'))
const bnd = JSON.parse(fs.readFileSync(D('neighborhood_boundary.json'), 'utf8'))
const simplified = new Map((sk.streets || []).map(st => [st.id, tessellateAdaptive((st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments)]))
const mapped = rb.streets.filter(s => s?.points?.length >= 2).map(s => { const p = simplified.get(s.skelId ?? s.name); return p?.length >= 2 ? { ...s, points: p, hard: p.hard || null } : null })
if (mapped.some(m => !m)) { console.error(`⛔ ${mapped.filter(m => !m).length} chain(s) have no skeleton geometry — refusing, as derive does`); process.exit(1) }
const bx = osm.bbox, a = bx && wgs84ToLocal(bx.minLon, bx.maxLat), b = bx && wgs84ToLocal(bx.maxLon, bx.minLat)
const bb = bx ? { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) } : null
const quiet = (f) => { const o = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f() } finally { console.log = o; console.warn = w } }
const coast = quiet(() => coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: bnd.center || null, discR: bnd.radius || 0, bb }))
const MP = quiet(() => mintProtopolygon({ streets: mapped.filter(m => !m.gradeSeparated), gradeSep: mapped.filter(m => m.gradeSeparated), boundary: bnd.boundary, coast: coast.rings, coastArcs: coast.arcs, bb }))
const r6 = (r) => r.map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])
const P = { eps: 0.005, rings: MP.rings.map(r6), labels: MP.labels, owners: MP.owners, waterRings: MP.waterRings ? MP.waterRings.map(r6) : null,
  ...(MP.blocks ? { blocks: MP.blocks.map(r6), blockLabels: MP.blockLabels, ...(MP.blockHoles ? { blockHoles: MP.blockHoles.map(hs => hs.map(r6)), blockHoleLabels: MP.blockHoleLabels } : {}) } : {}),
  ...(MP.nodes && Object.keys(MP.nodes).length ? { nodes: Object.fromEntries(Object.entries(MP.nodes).map(([k, v]) => [k, v ? [Math.round(v[0] * 1e6) / 1e6, Math.round(v[1] * 1e6) / 1e6] : null])) } : {}),
  ...(MP.boundaryRing ? { boundaryRing: r6(MP.boundaryRing) } : {}), ...(MP.crossings ? { crossings: MP.crossings } : {}), ...(MP.refused ? { refused: MP.refused } : {}) }
const J = (x) => JSON.stringify(x)
const fields = Object.keys(P)
const noCap = (k, v) => k === 'owners' && v ? v.map(({ cap, ...c }) => c) : v
const diff = fields.filter(k => J(noCap(k, P[k])) !== J(noCap(k, F?.[k])))
const ownerFieldDiff = (() => { if (!F?.owners || F.owners.length !== P.owners.length) return null; let n = 0; P.owners.forEach((o, i) => { const { cap, ...c } = o; if (J(c) !== J(F.owners[i])) n++ }); return n })()
const labDiff = (a, b) => { if (!a || !b || a.length !== b.length) return null; let n = 0, t = 0; a.forEach((r, i) => r.forEach((v, j) => { t++; if (v !== b[i]?.[j]) n++ })); return `${n}/${t}` }
if (!F) console.log(`${scene}: ⚠️ NO FROZEN ① to compare — this re-mint is NOT validated against the pour for this scene`)
else console.log(`${scene}: re-mint vs frozen ① — ${diff.length ? '⛔ differs in ' + diff.join(', ') : '✅ identical in every field the mint writes'}`)
if (F && diff.length) console.log(`   labels changed ${labDiff(P.labels, F.labels)} · blockLabels changed ${labDiff(P.blockLabels, F.blockLabels)} · blockHoleLabels changed ${labDiff(P.blockHoleLabels?.map(h => h.flat()), F.blockHoleLabels?.map(h => h.flat()))} · owner records changed ${ownerFieldDiff}`)
if (out) { fs.writeFileSync(out, JSON.stringify({ ...rb, protopolygon: { ...(F || {}), ...P, eps: F?.eps ?? P.eps } })); console.log(`   wrote ${out} (blockClass + flares KEPT from the frozen artifact)`) }

// ── --oracle=<ribbons.json>: judge an artifact's block-edge LABELS against the mint's own geometry (the gate is
// checks/claims-every-proto-edge-lies-on-its-owner.mjs; this is its scratch twin for artifacts not yet on disk) ──────────────────
// For every block edge owned by a chain: project its midpoint onto that chain's MINT polyline (the tessellated
// skeleton above) → the segment j it lies beside → the true span `segOrd` (IX vertices at-or-before j, exactly the
// mint's `segOrdAt`) and the true side (sign against measure-right (−dz, dx)). Edges off their chain (the owner
// check's failures), shorter than 3·eps (caps) or beside a zero-length segment are counted, not judged.
const oracleP = process.argv.find(a => a.startsWith('--oracle='))?.slice(9)
if (oracleP) {
  const { resolveChainSegmentation } = await import('../src/lib/chainSegmentation.js')
  const streets = mapped.filter(m => !m.gradeSeparated), segm = resolveChainSegmentation(streets)
  const info = new Map(streets.map(st => { const n = st.points.length
    const ix = [...(segm.get(st) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
    return [st.skelId ?? st.name, { P: st.points, so: (j) => ix.filter(k => k <= j).length }] }))
  const A = JSON.parse(fs.readFileSync(oracleP, 'utf8')).protopolygon
  let judged = 0, off = 0, short = 0, badSide = 0, badSpan = 0, mSide = 0, mSpan = 0, mJudged = 0; const ex = []
  A.blocks.forEach((b, k) => { const rs = [[b, A.blockLabels[k]], ...(A.blockHoles?.[k] || []).map((h, j) => [h, A.blockHoleLabels?.[k]?.[j]])]
    for (const [ring, labs] of rs) { if (!ring || !labs) continue
      for (let i = 0; i < ring.length; i++) { const o = A.owners[labs[i]], C = o && info.get(o.skelId); if (!C) continue
        const a = ring[i], c = ring[(i + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L <= 3 * A.eps) { short++; continue }
        const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], TOLo = A.eps + 0.01; let best = null; const cand = []
        for (let j = 0; j + 1 < C.P.length; j++) { const p = C.P[j], q = C.P[j + 1], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz; if (!L2) continue
          const t = Math.max(0, Math.min(1, ((m[0] - p[0]) * dx + (m[1] - p[1]) * dz) / L2)), d = Math.hypot(m[0] - p[0] - t * dx, m[1] - p[1] - t * dz)
          const e = { d, j, s: (m[0] - p[0]) * -dz + (m[1] - p[1]) * dx }; if (d <= TOLo) cand.push(e); if (!best || d < best.d) best = e }
        if (!best || best.d > TOLo) { off++; continue }
        judged++; mJudged += L
        // an edge beside SEVERAL segments of its chain (a chain that returns along itself) is ambiguous: any agreeing one passes
        const agree = cand.find(e => (e.s > 0 ? 'right' : 'left') === o.side && C.so(e.j) === o.segOrd) || cand.find(e => (e.s > 0 ? 'right' : 'left') === o.side) || best
        const side = agree.s > 0 ? 'right' : 'left', span = C.so(agree.j)
        if (side !== o.side) { badSide++; mSide += L }
        if (span !== o.segOrd) { badSpan++; mSpan += L; if (ex.length < 4) ex.push(`${o.skelId} ${o.side}/${o.segOrd} lies beside span ${span} ${L.toFixed(1)} m`) } } } })
  console.log(`   ORACLE ${oracleP.split('/').pop()}: ${judged} edges judged (${mJudged.toFixed(0)} m) · WRONG SIDE ${badSide} (${mSide.toFixed(0)} m) · WRONG SPAN ${badSpan} (${mSpan.toFixed(0)} m) · not judged: ${off} off their chain, ${short} ≤ 3·eps${ex.length ? '\n     e.g. ' + ex.join(' · ') : ''}`)
}
