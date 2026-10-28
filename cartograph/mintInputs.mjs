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
import { isOffGradeWay, structureOverWater } from '../src/cartograph/streetClass.js'
import { readCoast } from './coastFile.mjs'
import { streetDecks, waterWithoutDecks } from './structures.mjs'
import { splitBoundary, discOf } from './boundaryRecords.mjs'
import { localBB, geographyFor, projectorOf } from './geography.mjs'
import { mapCleanDir, mapRawDir, mapDir } from './scene.js'
import { joinChainEnds, reportJoins } from './chainJoins.mjs'
import { readLookDesign } from './lookDesign.mjs'

// ribbonStreets: the ribbons' streets · skeletonStreets: clean/skeleton.json's · osm: raw/osm.json · bb: localBB of it ·
// disc: splitBoundary's `disc` (its `boundary` ring) with `discOf`'s { cx, cz, R } · cleanDir: the scene's clean/ (its coast.json)
// ⭐ THE COAST IS THE LIDAR'S (BRIEF-the-shore-is-one-line §1): clean/coast.json, traced by bake-coast.mjs; no coast.json refuses
// (coastFile.mjs#readCoast, which also refuses a wrongly wound body or island, at the one door). A deck a mint street crosses is
// taken OUT of the water (structures.mjs), and a street deck standing clear of every shore refuses by name.
export function mintInputs({ ribbonStreets, skeletonStreets, osm, bb, disc, discAt, cleanDir, blockCustoms, who = 'mintInputs' }) {
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
  // a way's raw vertices (raw/osm.json, local x/z), for a run whose ways DISAGREE on grade (Zob, 2026-10-27): the off-grade way's
  // own extent along that run is where its vertices project onto it — a wet piece counts as off grade only within it
  const rawById = new Map((osm.ground?.highway || []).map(f => [f.osmId, (f.coords || []).map(c => [c.x, c.z])]))
  const extentOf = (pts, from, to, raw) => { const S = [0]; for (let k = 1; k < pts.length; k++) S.push(S[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]))
    const sOf = (q) => { let best = null; for (let k = from; k < to; k++) { const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) continue
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)), d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz)
        if (!best || d < best.d) best = { d, s: S[k] + t * Math.sqrt(L2) } } return best?.s }
    const ss = raw.map(sOf).filter(Number.isFinite); return ss.length ? [Math.min(...ss), Math.max(...ss)] : null }
  const gradeRunsOf = (id, pts) => { const sk = skelById.get(id); if (!sk) return null
    const n = (sk.points || []).length, R = [...(sk.segmentWays || [])].sort((a, b) => a.from - b.from)
    if (!R.length || R[0].from !== 0 || R[R.length - 1].to !== n - 1 || R.some((r, k) => k && r.from !== R[k - 1].to))
      throw new Error(`[mintInputs] ⛔ ${id}: its segmentWays do not cover its ${n - 1} segment(s) with no gap (${R.map(r => `${r.from}→${r.to}`).join(' · ') || 'none'}) — the grade of a span cannot be read. Re-skeleton.`)
    const at = pts.anchorAt || pts.map((_, i) => i)   // no curve: the output IS the anchors, by construction
    if (at.length !== n) throw new Error(`[mintInputs] ⛔ ${id}: ${at.length} anchor index(es) for ${n} skeleton point(s) — the tessellation lost the anchors' identity. Refusing.`)
    return R.map(r => { const off = r.ways.filter(w => isOffGradeWay((sk.ways || {})[w])), from = at[r.from], to = at[r.to]
      // `structure`: each way's verdict in the over-water vocabulary (streetClass.js#structureOverWater), parallel to `ways`;
      // splitOverWater judges a wet piece by it, before the coast decides (r-a-way-tag-decides-before-byCoast)
      const run = { from, to, ways: r.ways, structure: r.ways.map(w => structureOverWater((sk.ways || {})[w])), offGrade: off.length === r.ways.length, exact: !r.by, by: r.by || 'exact' }
      if (off.length && off.length < r.ways.length) { run.mixed = true
        run.offExtents = off.map(w => { const raw = rawById.get(w); if (!raw?.length) throw new Error(`[mintInputs] ⛔ ${id}: off-grade way ${w} on a mixed-grade run has no raw geometry in raw/osm.json — its extent cannot be read. Refusing.`)
          const extent = extentOf(pts, from, to, raw)
          if (!extent) throw new Error(`[mintInputs] ⛔ ${id}: off-grade way ${w} on a mixed-grade run projects onto none of the run's segments — its extent cannot be read. Refusing.`)
          return extent }) }
      // ⭐ AND THE STRUCTURE WITHIN EACH WAY'S OWN EXTENT, as the grade is (Zob, 2026-10-27): a run spanning a way joint whose ways
      // disagree carries each STRUCTURAL way's verdict and extent along it; splitOverWater judges a wet piece by the ways whose
      // extent holds it, and refuses one straddling a boundary
      const key = (v) => (v && typeof v === 'object' ? `?${v.unknown}` : String(v))
      if (new Set(run.structure.map(key)).size > 1) { run.structureMixed = true
        run.structureExtents = r.ways.map((w, i) => ({ way: w, v: run.structure[i] })).filter(x => x.v != null).map(x => { const raw = rawById.get(x.way)
          if (!raw?.length) throw new Error(`[mintInputs] ⛔ ${id}: structural way ${x.way} on a run whose ways disagree has no raw geometry in raw/osm.json — its extent cannot be read. Refusing.`)
          const extent = extentOf(pts, from, to, raw)
          if (!extent) throw new Error(`[mintInputs] ⛔ ${id}: structural way ${x.way} (${x.v?.unknown ?? x.v}) on a run whose ways disagree projects onto none of the run's segments — its extent cannot be read, and its piece would be judged as untagged. Refusing.`)
          return { ...x, extent } }) }
      return run }) }
  // `hard` travels with the points: the mint stamps it onto every owner
  const simplify = (s) => { const id = s.skelId ?? s.name, pts = simplified.get(id); return pts?.length >= 2 ? { ...s, points: pts, hard: pts.hard || null, gradeRuns: gradeRunsOf(id, pts) } : null }
  const all = ribbonStreets.filter(s => s?.points?.length >= 2)
  const mapped = all.map(s => ({ s, sim: simplify(s) }))
  const unjoined = mapped.filter(m => !m.sim).map(m => m.s.skelId ?? m.s.name)
  if (!cleanDir) throw new Error('[mintInputs] ⛔ no clean/ directory — the coast is read off its coast.json')
  const gradeSep = mapped.filter(m => m.sim && m.s.gradeSeparated).map(m => m.sim)
  // ⭐ A CHAIN END IN ANOTHER STREET'S ROADWAY IS A T (r-a-chain-end-in-a-roadway-is-a-T): joined here, before anything reads
  // the streets, by the pour's half-widths; the town's authoring is read only to REFUSE a join that would re-key it
  // (chainJoins.mjs). The record is returned for ① to freeze (protopolygon.chainJoins) and printed by name.
  if (blockCustoms === undefined) throw new Error(`[mintInputs] ⛔ ${who}: no blockCustoms passed ({} when the town authors none; townBlockCustoms(homeLook)) — a chain join that would re-key an authored slot must refuse, and only the authoring can say whether one is there`)
  const J = joinChainEnds({ streets: mapped.filter(m => m.sim && !m.s.gradeSeparated).map(m => m.sim), gradeSep, discAt, blockCustoms })
  const streets = J.streets
  const coast = readCoast(cleanDir, bb, who)
  // the decks are closed at the step the coast was traced at (coast.json fineM), so the mint takes out the footprints the trace saw
  const decks = coast.coast ? streetDecks(osm.ground || {}, streets, coast.doc.fineM) : { rings: [], decks: [] }
  const water = coast.coast ? waterWithoutDecks(coast.rings, coast.arcs, decks.rings, coast.doc.fineM) : { rings: [], arcs: [], decks: [], slivers: [] }
  // the deck as ① takes it out, the water beside it narrower than one trace cell included: what streetDecks' record freezes
  decks.decks.forEach((d, k) => { d.ring = water.decks[k] })
  // ⛔ a deck's edge is known by the rings' own tag (`ring.deck`, an array property JSON would drop silently): with decks taken
  // out and a ring carrying none, the mint would stroke the deck's edge as a beach (Zob, 2026-10-27)
  if (decks.decks.length && water.rings.some(r => !Array.isArray(r.deck))) throw new Error(`[mintInputs] ⛔ ${who}: ${decks.decks.length} street deck(s) taken out of the water, and a water ring carries no per-edge deck tag. Refusing.`)
  const holes = water.rings.filter(r => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) < 0).length
  // ⭐ ISLANDS go through the mint as HOLES in the water (Jacob 2026-10-26). ⛔ A STREET DECK standing clear of every shore is a
  // hole the coast did not draw: it has no land root to take a height from (shoreStamp.mjs#deckHeights), so it refuses, by name
  const coastHoles = coast.coast ? coast.holes : 0
  if (holes > coastHoles) throw new Error(`[①] ⛔ ${who}: ${holes - coastHoles} street deck(s) stand clear of every shore (holes in the water the coast did not draw), so none has a land root to take its height from: ${decks.decks.map(d => d.streets.filter(Boolean).slice(0, 3).join('/')).join(' · ')}`)
  const coastReport = [coast.coast ? `    [①] coast: ${water.rings.length} water ring(s), ${water.arcs.length} shoreline arc(s) — ${coast.doc.from}${holes ? ` · ${holes} island(s)` : ''}${decks.decks.length ? ` · ${decks.decks.length} street deck(s) taken out of the water: ${decks.decks.map(d => d.streets.filter(Boolean).slice(0, 3).join('/')).join(' · ')}` : ''}${water.slivers.length ? ` · ${water.slivers.length} sliver(s) of water beside them narrower than one trace cell taken with them (${water.slivers.reduce((t, x) => t + x.m2, 0).toFixed(2)} m²): ${water.slivers.slice(0, 6).map(x => `${x.m2} m² @(${x.at.map(Math.round).join(', ')})`).join(' · ')}` : ''}` : `    [①] no coast: ${coast.why}`]
  return {
    unjoined, total: all.length, coastReport, decks: decks.decks, deckSlivers: water.slivers,
    chainJoins: J.joins, joinReport: reportJoins(J.joins, who),
    streets, gradeSep,
    boundary: disc.boundary, coast: water.rings, coastArcs: water.arcs, bb,
  }
}

// the same, off a scene's files: its skeleton, raw osm, boundary and geography (its own projection — never the process's)
export function mintInputsOf(scene, ribbonStreets, homeLook) {
  const skPath = join(mapCleanDir(scene), 'skeleton.json'), osmPath = join(mapRawDir(scene), 'osm.json'), bPath = join(mapDir(scene), 'neighborhood_boundary.json')
  for (const p of [skPath, osmPath, bPath]) if (!existsSync(p)) throw new Error(`[mintInputs] ⛔ ${scene}: no ${p}`)
  const osm = JSON.parse(readFileSync(osmPath, 'utf8'))
  const bb = localBB(osm, projectorOf(geographyFor(scene)))
  if (!bb) throw new Error(`[mintInputs] ⛔ ${scene}'s raw/osm.json carries no bbox`)
  const { disc } = splitBoundary(JSON.parse(readFileSync(bPath, 'utf8')), `mintInputs: ${scene}'s neighborhood_boundary.json`)
  return mintInputs({ ribbonStreets, skeletonStreets: JSON.parse(readFileSync(skPath, 'utf8')).streets || [], osm, bb, disc, discAt: discOf(disc, `mintInputs: ${scene}`), cleanDir: mapCleanDir(scene), blockCustoms: townBlockCustoms(homeLook, `mintInputs: ${scene}`), who: `mintInputs: ${scene}` })
}

// the town's authored slots, for the chain join's REFUSAL only (never to size anything: the Wall). Whether there is authoring is
// the town's own DECLARATION of its home Look: its town record's `lookId` (src/instances/<town>.js), handed in BY VALUE —
// ⛔ the pour never imports a town module (claims-the-bake-watches-its-code; the record is data, pourSteps.mjs#townRecordOf, and
// reaches the pour as pipeline.js's --home-look) (Boz's ruling, 2026-10-28). `homeLook`: undefined → no declaration was passed,
// refuses by name · null → the town declares none, {} is its truth · a Look id → its design.json's blockCustoms, and a missing
// design.json refuses by name (readLookDesign). A home Look authoring no blockCustoms has none.
export function townBlockCustoms(homeLook, who) {
  if (homeLook === undefined) throw new Error(`[${who}] ⛔ no home-Look declaration was passed (the town record's lookId, pipeline.js --home-look=<id>, or --home-look= for a town that declares none) — whether a chain join would re-key the town's authoring is unknowable. Refusing.`)
  return homeLook ? (readLookDesign(homeLook, `${who} (the town's home Look, ${homeLook})`).blockCustoms || {}) : {}
}
