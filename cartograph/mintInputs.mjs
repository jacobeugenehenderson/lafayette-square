// ⭐ ①'S INPUTS, BUILT ONCE — the one builder `derive.js` (the pour) and `checks/claims-proto-frozen-matches-live.mjs` (the
// freeze's witness) both call, so the witness mints from what the pour minted from and cannot drift from it (Zob's read,
// 2026-10-25: the check's own copy omitted boundary, coast, coastArcs and bb, so every coast town read STALE; it also minted
// the control polygon, never the tessellated curve, and dropped `hard`).
//
// `mintInputs` takes what the pour already holds in memory; `mintInputsOf(scene)` loads the same things off the scene's files
// for a reader that has no pour. ⛔ Neither falls back: a missing skeleton, bbox or disc refuses by name; a chain with no
// simplified geometry is returned as `unjoined` (derive declines to freeze ① on it, and the check refuses).
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tessellateAdaptive } from './derive.js'
import { isOffGradeWay } from '../src/cartograph/streetClass.js'
import { readCoast } from './coastFile.mjs'
import { streetDecks, waterWithoutDecks } from './structures.mjs'
import { splitBoundary, discOf } from './boundaryRecords.mjs'
import { localBB, geographyFor, projectorOf } from './geography.mjs'
import { mapCleanDir, mapRawDir, mapDir } from './scene.js'

// ribbonStreets: the ribbons' streets · skeletonStreets: clean/skeleton.json's · osm: raw/osm.json · bb: localBB of it ·
// disc: splitBoundary's `disc` (its `boundary` ring) with `discOf`'s { cx, cz, R } · cleanDir: the scene's clean/ (its coast.json)
// ⭐ THE COAST IS THE LIDAR'S (BRIEF-the-shore-is-one-line §1): clean/coast.json, traced by bake-coast.mjs; no coast.json refuses
// (coastFile.mjs#readCoast, which also refuses a wrongly wound body or island, at the one door). A deck a mint street crosses is
// taken OUT of the water (structures.mjs), and a street deck standing clear of every shore refuses by name.
export function mintInputs({ ribbonStreets, skeletonStreets, osm, bb, disc, discAt, cleanDir, who = 'mintInputs' }) {
  if (!skeletonStreets) throw new Error('[mintInputs] ⛔ no skeleton streets — ① is minted from the SIMPLIFIED skeleton, never the derived chains')
  if (!bb) throw new Error('[mintInputs] ⛔ no bb — the coast and the mint close against the fetched envelope')
  if (!disc?.boundary || !discAt) throw new Error('[mintInputs] ⛔ no disc — ① is stencilled by the boundary ring')
  // ⭐ the CURVE PRIMITIVE, tessellated: `points` is the control polygon, the smoothness lives in `segments` (derive's header)
  const simplified = new Map(skeletonStreets.map(st => [st.id,
    tessellateAdaptive((st.points || []).map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments)]))
  // ⭐ THE GRADE OF EACH RUN, off the skeleton's own `segmentWays` and `ways` (Boz's ruling B, Zob's read, 2026-10-27): a run is
  // OFF GRADE when every way on it is (streetClass.js#isOffGradeWay, the skeleton's one predicate), and EXACT unless the skeleton
  // attributed it by order or by one end. Mapped onto the tessellated points by IDENTITY (`anchorAt`, tessellateAdaptive's own
  // record); the runs must cover the chain with no gap, else this refuses by name. The mint reads them to leave an off-grade span
  // over ①'s water out of the ink; over land nothing reads them.
  const skelById = new Map(skeletonStreets.map(st => [st.id, st]))
  const gradeRunsOf = (id, pts) => { const sk = skelById.get(id); if (!sk) return null
    const n = (sk.points || []).length, R = [...(sk.segmentWays || [])].sort((a, b) => a.from - b.from)
    if (!R.length || R[0].from !== 0 || R[R.length - 1].to !== n - 1 || R.some((r, k) => k && r.from !== R[k - 1].to))
      throw new Error(`[mintInputs] ⛔ ${id}: its segmentWays do not cover its ${n - 1} segment(s) with no gap (${R.map(r => `${r.from}→${r.to}`).join(' · ') || 'none'}) — the grade of a span cannot be read. Re-skeleton.`)
    const at = pts.anchorAt || pts.map((_, i) => i)   // no curve: the output IS the anchors, by construction
    if (at.length !== n) throw new Error(`[mintInputs] ⛔ ${id}: ${at.length} anchor index(es) for ${n} skeleton point(s) — the tessellation lost the anchors' identity. Refusing.`)
    return R.map(r => ({ from: at[r.from], to: at[r.to], ways: r.ways, offGrade: r.ways.every(w => isOffGradeWay((sk.ways || {})[w])), exact: !r.by, by: r.by || 'exact' })) }
  // `hard` travels with the points: the mint stamps it onto every owner
  const simplify = (s) => { const id = s.skelId ?? s.name, pts = simplified.get(id); return pts?.length >= 2 ? { ...s, points: pts, hard: pts.hard || null, gradeRuns: gradeRunsOf(id, pts) } : null }
  const all = ribbonStreets.filter(s => s?.points?.length >= 2)
  const mapped = all.map(s => ({ s, sim: simplify(s) }))
  const unjoined = mapped.filter(m => !m.sim).map(m => m.s.skelId ?? m.s.name)
  if (!cleanDir) throw new Error('[mintInputs] ⛔ no clean/ directory — the coast is read off its coast.json')
  const streets = mapped.filter(m => m.sim && !m.s.gradeSeparated).map(m => m.sim)
  const coast = readCoast(cleanDir, bb, who)
  const decks = coast.coast ? streetDecks(osm.ground || {}, streets) : { rings: [], decks: [] }
  const water = coast.coast ? waterWithoutDecks(coast.rings, coast.arcs, decks.rings) : { rings: [], arcs: [] }
  const holes = water.rings.filter(r => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) < 0).length
  // ⭐ ISLANDS go through the mint as HOLES in the water (Jacob 2026-10-26). ⛔ A STREET DECK standing clear of every shore is a
  // hole the coast did not draw: it has no land root to take a height from (shoreStamp.mjs#deckHeights), so it refuses, by name
  const coastHoles = coast.coast ? coast.holes : 0
  if (holes > coastHoles) throw new Error(`[①] ⛔ ${who}: ${holes - coastHoles} street deck(s) stand clear of every shore (holes in the water the coast did not draw), so none has a land root to take its height from: ${decks.decks.map(d => d.streets.filter(Boolean).slice(0, 3).join('/')).join(' · ')}`)
  const coastReport = [coast.coast ? `    [①] coast: ${water.rings.length} water ring(s), ${water.arcs.length} shoreline arc(s) — ${coast.doc.from}${holes ? ` · ${holes} island(s)` : ''}${decks.decks.length ? ` · ${decks.decks.length} street deck(s) taken out of the water: ${decks.decks.map(d => d.streets.filter(Boolean).slice(0, 3).join('/')).join(' · ')}` : ''}` : `    [①] no coast: ${coast.why}`]
  return {
    unjoined, total: all.length, coastReport, decks: decks.decks,
    streets, gradeSep: mapped.filter(m => m.sim && m.s.gradeSeparated).map(m => m.sim),
    boundary: disc.boundary, coast: water.rings, coastArcs: water.arcs, bb,
  }
}

// the same, off a scene's files: its skeleton, raw osm, boundary and geography (its own projection — never the process's)
export function mintInputsOf(scene, ribbonStreets) {
  const skPath = join(mapCleanDir(scene), 'skeleton.json'), osmPath = join(mapRawDir(scene), 'osm.json'), bPath = join(mapDir(scene), 'neighborhood_boundary.json')
  for (const p of [skPath, osmPath, bPath]) if (!existsSync(p)) throw new Error(`[mintInputs] ⛔ ${scene}: no ${p}`)
  const osm = JSON.parse(readFileSync(osmPath, 'utf8'))
  const bb = localBB(osm, projectorOf(geographyFor(scene)))
  if (!bb) throw new Error(`[mintInputs] ⛔ ${scene}'s raw/osm.json carries no bbox`)
  const { disc } = splitBoundary(JSON.parse(readFileSync(bPath, 'utf8')), `mintInputs: ${scene}'s neighborhood_boundary.json`)
  return mintInputs({ ribbonStreets, skeletonStreets: JSON.parse(readFileSync(skPath, 'utf8')).streets || [], osm, bb, disc, discAt: discOf(disc, `mintInputs: ${scene}`), cleanDir: mapCleanDir(scene), who: `mintInputs: ${scene}` })
}
