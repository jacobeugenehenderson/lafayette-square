#!/usr/bin/env node
/**
 * Cartograph — Step 1: Fetch OSM data
 *
 * Pulls all ground-plane features from OpenStreetMap via Overpass API:
 *   - highways (streets, alleys, paths, sidewalks)
 *   - landuse, leisure, natural (parks, grass, water)
 *   - buildings
 *   - amenity=parking
 *   - barriers (fences, walls)
 *   - MULTIPOLYGON RELATIONS, with their inner rings carried as holes — a lake,
 *     a river surface or a wood is a relation, and its member ways are untagged,
 *     so a ways-only fetch cannot see it at any tag set. Members are scoped to
 *     the envelope; a ring that closes outside it is marked `clipped` and said
 *     aloud, never closed here (the stencil is stamped last).
 *
 *   - TAGGED NODES, as point features in a top-level `pois[]` — a small business is
 *     usually a single OSM node, not a footprint. They are a SIBLING of `ground`, never
 *     a member of it: `ground.*` is polyline/ring material and its consumers say so.
 *
 * Outputs:  data/raw/osm.json   { bbox, ground{}, pois[], buildings[] }
 *
 * Usage:    node fetch.js
 */

import { writeFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { BBOX, RAW_DIR, SCENE, mapDir, wgs84ToLocal, overpassBbox } from './config.js'
import { requireExplicitMap } from './scene.js'
import { squareAroundDisc, containment, ZONE_PAD } from './discSquare.mjs'

// ⛔ This WRITES into data/<scene>/. Refuse an unnamed scene — defaulting would
// silently overwrite Lafayette Square's build with another town's run (scene.js).
requireExplicitMap('fetch')

// ⭐ THE TWO-PASS FETCH (`_archive/EXTENT-EXCAVATION-DIARY §0.1`, Jacob 2026-07-21).
//   --pass=light   the SOFT fetch: generous envelope, boundary vocabulary + painted
//                  footprints. Cheap, reversible, re-runnable.
//   --pass=heavy   the HARD fetch: pour material, scoped to THE SQUARE CONTAINING THE
//                  DISC + padding. Irreversible, because it locks its input (`§0.8`).
//   (omitted)      the pre-split behaviour — one envelope, everything. Still the
//                  default so no existing caller changes meaning under it.
//
// ⛔ The heavy pass does NOT take its bbox from geography.json. That is the whole
// point: derive the square from the disc and `bbox ⊇ disc` stops being a check that
// can fail (`§0.1`). Deriving it from the frame is how Altadena's disc came to run
// 981 m past its own data, silently.
const _passArg = (process.argv || []).map(a => /^--pass=(light|heavy|all)$/.exec(a)).find(Boolean)?.[1]
const pass = _passArg === 'all' ? null : (_passArg || null)

// ⭐ --dry-run: resolve the envelope, run the containment gate, print, and STOP before
// touching Overpass or disk. Two reasons, and the second is the one that matters:
//   1. the gate is the interesting part, and a gate you cannot exercise is a gate
//      nobody trusts — `MEMORY §C`: a passing check proves nothing until seen to FAIL;
//   2. without it, the only way to test this is to run a REAL fetch against a real
//      scene. Testing it on lafayette-square is one keystroke from overwriting
//      production's raw OSM, which is exactly the class `scene.js` exists to prevent.
const dryRun = (process.argv || []).includes('--dry-run')

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const TIMEOUT = 120

/**
 * Merge a heavy pass's ground features into a light pass's, BY CATEGORY.
 * `ground` is `{ highway: [...], natural: [...], … }` — never a flat array.
 * Exported as a pure function so it can be exercised without a network fetch;
 * the bug it replaces survived because the only way to reach it was a real pull.
 */
export function mergeGround(prior = {}, incoming = {}) {
  const out = {}
  let before = 0, after = 0, added = 0
  for (const cat of new Set([...Object.keys(prior || {}), ...Object.keys(incoming || {})])) {
    const byId = new Map()
    for (const f of (prior?.[cat] || [])) { before++; byId.set(f.id ?? `p${byId.size}`, f) }
    for (const f of (incoming?.[cat] || [])) {
      const k = f.id ?? `n${byId.size}`
      if (!byId.has(k)) added++
      byId.set(k, f)
    }
    out[cat] = [...byId.values()]
    after += out[cat].length
  }
  return { ground: out, before, after, added }
}

function overpassQuery(queryBody, attempt = 1) {
  const MAX_ATTEMPTS = 4
  const full = `[out:json][timeout:${TIMEOUT}];${queryBody}`
  console.log(`  Overpass query (${full.length} chars)${attempt > 1 ? ` [retry ${attempt}/${MAX_ATTEMPTS}]` : ''}...`)

  // Overpass now rejects requests without a User-Agent (HTTP 406); a
  // descriptive UA is also Overpass etiquette. Without this the public
  // instance returns an HTML 406 page that fails JSON.parse.
  //
  // ⭐ curl writes to a FILE, not through a pipe. This used to capture stdout with
  // `maxBuffer: 50 MB`, which is a ceiling on how big a neighborhood can be: a
  // 33 km² fetch of Centrum, Łódź returned 52.49 MB and execSync threw. The failure
  // is also invisible — the thrown error carries the whole 52 MB body, so serve.js's
  // lastLine() reports the Node version banner and the operator is told
  // "OSM fetch failed — Node.js v22.20.0". Writing to a file removes the ceiling
  // rather than moving it, and keeps the error surface small.
  const tmp = join(RAW_DIR, `.overpass-${process.pid}-${attempt}.json`)
  mkdirSync(RAW_DIR, { recursive: true })
  try {
    execSync(
      `curl -s -A "cartograph/1.0 (neighborhood pour; jacob@jacobhenderson.studio)" --max-time ${TIMEOUT + 30} --data-urlencode "data=${full}" -o ${JSON.stringify(tmp)} "${OVERPASS_URL}"`,
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
  } catch (e) {
    try { rmSync(tmp, { force: true }) } catch { /* best effort */ }
    throw new Error(`curl failed: ${String(e.stderr || e.message).slice(0, 200)}`)
  }
  const bytes = statSync(tmp).size
  console.log(`  → ${(bytes / 1048576).toFixed(1)} MB`)
  const result = readFileSync(tmp, 'utf8')
  rmSync(tmp, { force: true })

  // Back-to-back queries can be refused while a prior slot frees (Overpass
  // returns an HTML/XML error page, not JSON). Retry with backoff.
  if (!result.trimStart().startsWith('{')) {
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(`Overpass returned non-JSON after ${MAX_ATTEMPTS} attempts: ${result.slice(0, 160)}`)
    }
    const waitMs = 4000 * attempt
    console.log(`  ⚠ non-JSON response (likely rate-limit); waiting ${waitMs / 1000}s...`)
    execSync(`sleep ${waitMs / 1000}`)
    return overpassQuery(queryBody, attempt + 1)
  }

  const data = JSON.parse(result)
  console.log(`  → ${data.elements?.length ?? 0} elements`)
  return data
}

function main() {
  console.log('='.repeat(60))
  console.log('cartograph/fetch.js — Fetch OSM ground + buildings')
  console.log('='.repeat(60))

  mkdirSync(RAW_DIR, { recursive: true })

  // The LIGHT pass (and the undivided default) rides the frame's envelope. The HEAVY
  // pass squares around the authored disc instead — see the header.
  let bboxObj = BBOX
  if (pass === 'heavy') {
    const nbPath = join(mapDir(SCENE), 'neighborhood.json')
    let nb
    try { nb = JSON.parse(readFileSync(nbPath, 'utf-8')) } catch {
      console.error(`\n⛔ --pass=heavy needs the authored disc and ${nbPath} is unreadable.\n   The heavy fetch is scoped to the DISC, not the frame; without a radius there is nothing to scope to.\n   Author the extent first, then re-run.\n`)
      process.exit(2)
    }
    const centre = nb.center && Number.isFinite(nb.center.lon) ? nb.center
      : { lon: BBOX ? (BBOX.minLon + BBOX.maxLon) / 2 : NaN, lat: (BBOX.minLat + BBOX.maxLat) / 2 }
    let sq
    try { sq = squareAroundDisc(centre, nb.radius) } catch (err) {
      console.error(`\n⛔ --pass=heavy: ${err.message}\n   A scene always has a radius; this one does not, so the square cannot be derived.\n`)
      process.exit(2)
    }
    // ⛔ REFUSE rather than fetch a square the soft pass never acquired. Outside the
    // frozen envelope there is no data and never will be — quietly fetching a bigger
    // box would return the thin edge of nothing and look like a successful pour.
    const c = containment(BBOX, sq)
    if (!c.ok) {
      console.error(`\n⛔ the disc + ${Math.round(ZONE_PAD * 100)}% zone is NOT inside the frozen fetch envelope.`)
      for (const f of c.failing) console.error(`   ${f.side} short by ${f.shortM < 10 ? f.shortM.toFixed(1) : Math.round(f.shortM)} m`)
      console.error(`   Shrink the disc, or re-fetch light with a larger envelope. ⛔ Do not proceed:`)
      console.error(`   the shortfall is SILENT on screen — the streets just stop on that one side.\n`)
      process.exit(2)
    }
    bboxObj = { minLat: sq.minLat, maxLat: sq.maxLat, minLon: sq.minLon, maxLon: sq.maxLon }
    console.log(`HEAVY pass — square derived from the disc (r=${nb.radius} m + ${Math.round(ZONE_PAD * 100)}%), half-width ${Math.round(sq.halfM)} m`)
  }
  const bbox = overpassBbox(bboxObj)
  console.log(`BBOX: ${bbox}${pass ? `   [pass: ${pass}]` : ''}`)
  if (dryRun) {
    console.log(`\n✅ dry run — envelope resolved and the containment gate passed. Nothing fetched, nothing written.`)
    return
  }

  // ⭐ THE TWO PASSES (`_archive/EXTENT-EXCAVATION-DIARY §0.2`). The LIGHT pass keeps
  // only what a boundary can RUN ALONG — the named linear features — plus the painted
  // footprints you need to judge an edge. Everything else is POUR material and is
  // deferred, which is what makes a generous envelope free instead of expensive.
  //
  // ⭐ `railway` was in NEITHER set — `§0.7` item 4: "railway is not in the Overpass
  // query at all… Kolej Scheiblerowska was never fetched, so removing the filter alone
  // would not surface it. Two fixes, not one." This is the fetch half. It also answers
  // the operator's "there are no highways or natural features in the boundary list":
  // waterway and railway are now acquired, so they CAN become boundary-eligible.
  const LIGHT_WAYS = ['highway', 'waterway', 'railway', 'boundary']
  //
  // ⭐⭐ `shop` / `tourism` / `office` / `craft` added 2026-09-20 — the SAME SHAPE as
  // railway, one layer up. `bake-content.js#classifyPoi` has always read `tags.shop`,
  // `tags.tourism` and `tags.office` (its `shopping`, `hospitality`, `services/financial`
  // and `services/health` rows are written against them) and they were in NEITHER tag
  // set, so those rows were unreachable in every town ever poured. Huron's 36 listings
  // were the whole of its amenity+leisure pull. ⛔ `craft` has NO classifier row — it is
  // acquired here so the data exists, and reaches `shopping/retail` only via `shop`;
  // a craft-only feature is carried, named, and classified by nothing. Said aloud.
  //
  // ⛔ NODES MATTER MORE THAN WAYS HERE. A small business is usually a single OSM
  // node, not a footprint — `HEAVY_NODES` carried only natural/amenity/man_made, so a
  // shop node was invisible twice over.
  const HEAVY_WAYS = ['landuse', 'leisure', 'natural', 'amenity', 'barrier', 'surface', 'man_made', 'shop', 'tourism', 'office', 'craft']
  const LIGHT_NODES = ['highway']
  const HEAVY_NODES = ['natural', 'amenity', 'man_made', 'shop', 'tourism', 'office', 'craft']
  const ways = pass === 'heavy' ? HEAVY_WAYS : pass === 'light' ? LIGHT_WAYS : [...LIGHT_WAYS, ...HEAVY_WAYS]
  const nodeTags = pass === 'heavy' ? HEAVY_NODES : pass === 'light' ? LIGHT_NODES : [...LIGHT_NODES, ...HEAVY_NODES]

  // ⭐⭐⭐ RELATIONS ARE FETCHED, NOT JUST WAYS — and on a coastal town this is the whole
  // ballgame. Measured on Huron 2026-09-19: `way["natural"=water](bbox)` returns 54 ways
  // (golf hazards, ponds, Parker Lake) and `way["natural"=coastline]` returns 0 — the
  // Great Lakes are not coastline. **Lake Erie is relation 4039900**, a multipolygon, and
  // its member ways carry NO tags at all (`source: PGS`). ⛔ So no tag query of any kind
  // reaches them: this was never a missing entry in a tag set, it is that we never asked
  // for relations. The lake bounding the town was absent from `raw/osm.json` entirely,
  // and 35.5% of Huron's disc — 13.96 of 39.35 km² — is that lake.
  //
  // ⛔⛔ MEMBERS ARE SCOPED TO THE ENVELOPE (`way(r.rels)(bbox)`), AND THAT IS NOT AN
  // OPTIMISATION — IT IS WHAT MAKES THIS FETCHABLE AT ALL. Erie's relation has 1,223
  // members spanning the entire 400 km lake; the bare recursion `relation["natural"](bbox);>;`
  // pulls 94,124 nodes for one town, and a town on an ocean pulls a continent's coastline.
  // Scoped: 33 ways / 2,349 nodes / 342 KB. ⭐ The cost is that a big ring CANNOT CLOSE
  // inside our envelope — which is correct and is disclosed per relation below, never
  // papered over. Closing it is the STENCIL's job and the stencil is stamped LAST
  // (`RIBBONS §1`, "THE CIRCLE IS STAMPED LAST, ON FINISHED GEOMETRY"); intake acquires.
  const groundQuery = `(
${ways.map(t => `  way["${t}"](${bbox});`).join('\n')}
${nodeTags.map(t => `  node["${t}"](${bbox});`).join('\n')}
);
out body;>;out skel qt;
(
${ways.map(t => `  relation["${t}"](${bbox});`).join('\n')}
)->.rels;
.rels out body;
way(r.rels)(${bbox});
out body;>;out skel qt;`

  console.log('\n[1/2] Ground features...')
  const groundData = overpassQuery(groundQuery)

  // Fetch buildings
  const buildingQuery = `(
  way["building"](${bbox});
  relation["building"](${bbox});
);
out body;>;out skel qt;`

  // ⛔ Buildings stay in the LIGHT pass, deliberately. `§0.2`: "Buildings must be
  // PAINTED, at today's fidelity or better… the aerial alone is not legible enough to
  // judge an edge against." They are cheap and they are what the operator is looking at.
  let buildingData = { elements: [] }
  if (pass !== 'heavy') {
    console.log('\n[2/2] Buildings...')
    buildingData = overpassQuery(buildingQuery)
  } else {
    console.log('\n[2/2] Buildings — skipped (light-pass material).')
  }

  // Parse nodes and ways
  const nodes = {}
  const groundWays = []
  const buildingWays = []
  const relations = []
  // ⛔ MEMBER WAYS ARE KEPT WHETHER OR NOT THEY CARRY TAGS, and that is the entire point.
  // A multipolygon puts its tags on the RELATION; Erie's 1,223 members are bare geometry
  // (`source: PGS` and nothing else). The `el.tags` test below is right for a standalone
  // way — an untagged way with no relation is noise — and it is exactly wrong for a member.
  // So members are indexed by id here and resolved against the relation's tags later.
  const waysById = new Map()

  // ⭐⭐ A TAGGED NODE IS A FEATURE. `nodes[]` below is the GEOMETRY index — the
  // lon/lat a way's vertices are resolved against — and for years it was the only
  // thing a node could become, so `el.tags` was dropped on the floor here. A small
  // business is usually a single OSM node, not a footprint, and `HEAVY_NODES` has
  // carried `amenity` since forever: every one of them was discarded, in every town
  // ever poured. This is not a hole opened by the shop/tourism/office/craft tags
  // added earlier today — those only made it visible.
  const taggedNodes = []
  function ingestElements(elements, target) {
    for (const el of elements) {
      if (el.type === 'node') {
        nodes[el.id] = [el.lon, el.lat]
        // ⛔ Geometry nodes come back `out skel qt` — no tags — so this cannot
        // pick up a way's vertices. Only nodes matched by `nodeTags` carry a body.
        if (el.tags) taggedNodes.push(el)
      } else if (el.type === 'way') {
        waysById.set(el.id, el)
        if (el.tags) target.push(el)
      } else if (el.type === 'relation') {
        relations.push(el)
      }
    }
  }

  ingestElements(groundData.elements || [], groundWays)
  ingestElements(buildingData.elements || [], buildingWays)

  console.log(`\n  ${Object.keys(nodes).length} nodes`)
  console.log(`  ${groundWays.length} ground ways`)
  console.log(`  ${buildingWays.length} building ways`)
  console.log(`  ${relations.length} relations`)

  // Convert to features with local coords
  function wayToFeature(way) {
    const coords = []
    for (const nid of way.nodes || []) {
      const pt = nodes[nid]
      if (!pt) continue
      const [x, z] = wgs84ToLocal(pt[0], pt[1])
      coords.push({
        lon: Math.round(pt[0] * 1e7) / 1e7,
        lat: Math.round(pt[1] * 1e7) / 1e7,
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
      })
    }
    if (coords.length < 2) return null

    const isClosed = way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1]

    return {
      osmId: way.id,
      // Carry ALL OSM tags verbatim — no whitelist. Downstream relies on tags
      // that are not in `tagPriority` below, notably `layer`/`bridge`/`tunnel`
      // (grade separation, skeleton.js#gradeFields) and `lanes`/`surface`/
      // `maxspeed` (frame enrichment). Do NOT prune this to a tag subset.
      tags: way.tags,
      isClosed,
      coords,
    }
  }

  // Categorize ground features (which BUCKET a way lands in — this is NOT a tag
  // filter; every tag above is preserved regardless of category).
  // ⭐ `railway` was acquired by `7fae362f` and had NO entry here, so every railway way
  // fell through to `other` — 43 features on Huron, the NS Chicago Line among them.
  // `EXCAVATION-DIARY §0.7` item 4 called this two fixes; the fetch was one and this is
  // the other. ⛔ It is a BUCKET, not a filter: the tag was always carried either way,
  // but a consumer reading `ground.railway` got nothing and had no way to know why.
  // ⛔ The four new tags are APPENDED, not slotted next to `amenity`. Order decides the
  // bucket, so inserting them mid-list would move co-tagged ways OUT of `barrier`,
  // `waterway`, `railway` and `surface` — a silent re-bucketing of existing towns for
  // no gain. Appended, no existing feature changes category.
  const tagPriority = [
    'highway', 'landuse', 'leisure', 'natural',
    'amenity', 'barrier', 'waterway', 'railway', 'surface',
    'shop', 'tourism', 'office', 'craft',
  ]

  const ground = {}
  const bucket = (feat) => {
    let category = 'other'
    for (const tag of tagPriority) {
      if (feat.tags[tag]) { category = tag; break }
    }
    if (!ground[category]) ground[category] = []
    ground[category].push(feat)
  }

  for (const way of groundWays) {
    const feat = wayToFeature(way)
    if (!feat) continue
    bucket(feat)
  }

  // ⭐⭐⭐ MULTIPOLYGON RELATIONS → FEATURES. A relation's members are bare geometry and
  // often SPLIT — one ring arrives as several ways in arbitrary order and direction — so
  // they are stitched endpoint-to-endpoint, per role, before anything can use them.
  //
  // ⛔⛔ AN OPEN RING IS REPORTED AS OPEN. A ring whose members we scoped away at the
  // envelope cannot close, and stamping `isClosed: true` on it would be Layer 0's second
  // question committed at intake: a plausible-looking success the operator never learns
  // is wrong. It carries `isClosed: false` + `clipped: true` and the console says so per
  // relation. ⛔ It is NOT closed here against the bbox — the stencil is stamped LAST.
  //
  // ⛔ INNER RINGS ARE HOLES, NOT LAND, and they are carried on the feature rather than
  // emitted beside it. Erie has 3 inner members inside Huron's envelope (islands); emitted
  // as peers they would read as more water, and dropped they would read as lake. Either
  // way the map is wrong and silent about it.
  function stitch(memberWays) {
    // Each entry: array of node ids. Join on shared endpoints until nothing more joins.
    const open = memberWays.map(w => [...(w.nodes || [])]).filter(a => a.length >= 2)
    const rings = []
    while (open.length) {
      let cur = open.pop()
      let joined = true
      while (joined) {
        joined = false
        if (cur[0] === cur[cur.length - 1]) break      // closed
        for (let i = 0; i < open.length; i++) {
          const o = open[i]
          const head = cur[0], tail = cur[cur.length - 1]
          if (o[0] === tail) { cur = cur.concat(o.slice(1)) }
          else if (o[o.length - 1] === tail) { cur = cur.concat(o.slice(0, -1).reverse()) }
          else if (o[o.length - 1] === head) { cur = o.slice(0, -1).concat(cur) }
          else if (o[0] === head) { cur = o.slice(1).reverse().concat(cur) }
          else continue
          open.splice(i, 1); joined = true; break
        }
      }
      rings.push(cur)
    }
    return rings
  }
  const ringToCoords = (nodeIds) => {
    const coords = []
    for (const nid of nodeIds) {
      const pt = nodes[nid]
      if (!pt) continue
      const [x, z] = wgs84ToLocal(pt[0], pt[1])
      coords.push({
        lon: Math.round(pt[0] * 1e7) / 1e7,
        lat: Math.round(pt[1] * 1e7) / 1e7,
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
      })
    }
    return coords
  }

  let relFeatures = 0, relClipped = 0, relHoles = 0, relOpenHoles = 0
  const relLog = []
  for (const rel of relations) {
    const members = (rel.members || []).filter(m => m.type === 'way' && waysById.has(m.ref))
    if (!members.length) continue
    const outerWays = members.filter(m => m.role !== 'inner').map(m => waysById.get(m.ref))
    const innerWays = members.filter(m => m.role === 'inner').map(m => waysById.get(m.ref))
    const ringClosed = (r) => r.length >= 4 &&
      r[0].lon === r[r.length - 1].lon && r[0].lat === r[r.length - 1].lat
    const outerRings = stitch(outerWays).map(ringToCoords).filter(c => c.length >= 2)
    const innerRings = stitch(innerWays).map(ringToCoords).filter(c => c.length >= 3)
    if (!outerRings.length) continue
    // ⛔ AN OPEN HOLE IS AS MISLEADING AS AN OPEN OUTER and is counted separately. On
    // Huron, Erie's 3 inner members stitch to 2 island rings, one of which runs out of
    // the envelope. A half-island silently treated as whole is the same silent
    // substitution as a half-lake treated as land.
    const openHoles = innerRings.filter(r => !ringClosed(r)).length

    const total = (rel.members || []).filter(m => m.type === 'way').length
    for (const ring of outerRings) {
      const closed = ringClosed(ring)
      relFeatures++
      if (!closed) relClipped++
      bucket({
        osmId: rel.id,
        osmType: 'relation',
        tags: rel.tags || {},
        isClosed: closed,
        // ⛔ The reason an open ring is open, on the feature itself — a consumer must be
        // able to tell "this town has a ragged edge" from "we only fetched part of it".
        ...(closed ? {} : { clipped: true, clipReason: `${members.length} of ${total} member ways lie inside the fetch envelope; the ring closes outside it` }),
        coords: ring,
        // ⭐ Holes travel WITH the outer ring. Empty array, not absent, so a consumer
        // that reads `.holes` cannot mistake "no holes" for "this producer has none".
        holes: innerRings,
      })
    }
    relHoles += innerRings.length
    relOpenHoles += openHoles
    // ⭐ The kind label is read off `tagPriority`, the same order that buckets the feature,
    // so the line the operator reads names the bucket the thing actually landed in.
    const kind = tagPriority.map(t => rel.tags?.[t] && `${t}=${rel.tags[t]}`).find(Boolean) ||
                 (rel.tags?.boundary ? `boundary=${rel.tags.boundary}` : '(untyped)')
    relLog.push({ id: rel.id, name: rel.tags?.name || null, kind,
                  rings: outerRings.length, open: outerRings.filter(r => !ringClosed(r)).length,
                  holes: innerRings.length, openHoles, members: members.length, total })
  }

  if (relLog.length) {
    console.log(`\n  Relations assembled — ${relFeatures} feature(s), ${relHoles} inner ring(s) carried as holes:`)
    for (const r of relLog) {
      const tail = r.members < r.total ? `  ⚠️ ${r.members}/${r.total} members in envelope` : ''
      const holeTail = r.openHoles ? `, ${r.openHoles} OPEN` : ''
      console.log(`    r${r.id} ${r.name || `(${r.kind})`} — ${r.rings} ring(s), ${r.open} OPEN, ${r.holes} hole(s)${holeTail}${tail}`)
    }
    // ⛔ LOUD, not a footnote. An open water ring is the state H-4 has to meet, and a
    // pour that quietly treats it as land is the failure this whole acquisition exists
    // to prevent (`ROADMAP H-2`/`H-4`).
    if (relOpenHoles) console.log(`  ⛔ ${relOpenHoles} inner ring(s) also do not close inside this envelope.`)
    // ⛔⛔ NAME THE CONSUMER GAP HERE, BECAUSE NOTHING DOWNSTREAM WILL. Holes are NEW to
    // this artifact and no reader of `ground.*` knows about them: `classify.js` builds its
    // overlay from `f.coords` alone (so an island inside a water or grass relation is typed
    // as the surface around it) and `derive.js`'s `naturalOverlays`/`leisureOverlays` do the
    // same. ⭐ Those consumers are NOT wrong — they were written against a vocabulary with no
    // compound faces in it. The defect would be shipping a richer artifact into them quietly.
    // ⇒ Until a compound-face gate lands in `classify.js` (`ROADMAP H-2`, the vocabulary
    // half), a re-pour of a town with hole-carrying relations FILLS those holes.
    const holed = relLog.filter(r => r.holes)
    if (holed.length) {
      console.log(`  ⚠️ ${holed.length} relation(s) carry inner rings and EVERY current consumer of ground.* ignores \`holes\`:`)
      for (const r of holed) console.log(`       r${r.id} ${r.name || `(${r.kind})`} — ${r.holes} hole(s) will read as ${r.kind}`)
      console.log(`     ⛔ This is a POUR-TIME wrong, not a fetch-time one. classify.js#createVocabularyGate is where it belongs.`)
    }
    if (relClipped) console.log(`  ⛔ ${relClipped} of ${relFeatures} relation ring(s) DO NOT CLOSE inside this envelope. They are marked \`clipped\`; closing them is the stencil's job, not intake's.`)
  }

  const buildings = buildingWays.map(wayToFeature).filter(Boolean)

  // ⭐⭐⭐ POINT FEATURES GET THEIR OWN TOP-LEVEL BUCKET. ⛔ THEY MAY NOT ENTER `ground.*`,
  // and this is the deliberate decision the shape forces, not a filing preference:
  //
  //   · `wayToFeature` is a WAY function and `:304`'s `coords.length < 2` is CORRECT
  //     there — a one-vertex way is a broken way. A node is not a degenerate way, so
  //     it does not go through that door.
  //   · `snap.js#snapAll` drops any ground feature with `coords.length < 2` (snap.js:46).
  //     A node filed under `ground.*` would be discarded a SECOND time, silently, one
  //     stage later — the same defect wearing a different file's name.
  //   · `LIGHT_NODES = ['highway']`, so a `highway=traffic_signals` node buckets into
  //     `ground.highway` under `tagPriority` and reaches `skeleton.js:1587`,
  //     `seed-centerlines.js:38`, `survey.js:44`, `serve.js:184` and
  //     `extend-centerlines.js:41` — every one of them a POLYLINE consumer that reads
  //     `coords` as a run. Handing them a point is how you get a street of length zero.
  //
  // ⛔ `isClosed` IS ABSENT, NOT `false`. A point has no ring, so the question does not
  // apply to it; `false` would assert "this is an open path", which is a different and
  // untrue claim. `osmType: 'node'` is the field that says which shape you are holding,
  // and it is on every record so a reader never has to infer it from `coords.length`.
  // ⭐ `category` is stamped here by the SAME `tagPriority` order that buckets a way, so
  // a consumer can filter points by bucket without re-deriving the precedence rule.
  const pois = []
  for (const el of taggedNodes) {
    const pt = nodes[el.id]
    if (!pt) continue
    const [x, z] = wgs84ToLocal(pt[0], pt[1])
    let category = 'other'
    for (const tag of tagPriority) { if (el.tags[tag]) { category = tag; break } }
    pois.push({
      osmId: el.id,
      osmType: 'node',
      category,
      tags: el.tags,
      coords: [{
        lon: Math.round(pt[0] * 1e7) / 1e7,
        lat: Math.round(pt[1] * 1e7) / 1e7,
        x: Math.round(x * 100) / 100,
        z: Math.round(z * 100) / 100,
      }],
    })
  }

  // Summary
  console.log('\n  Ground features by category:')
  let total = 0
  for (const [cat, feats] of Object.entries(ground).sort()) {
    console.log(`    ${cat}: ${feats.length}`)
    total += feats.length
  }
  console.log(`  Total ground: ${total}`)
  console.log(`  Buildings: ${buildings.length}`)

  // ⭐ POINT FEATURES, BY BUCKET AND BY NAMED-NESS. Named ≫ unnamed is the universal,
  // language-independent prominence signal (`INTAKE-CATALOGUE §4.1`) and the named count
  // is what `bake-content#loadOsmPois` can actually use, so it is printed beside the
  // raw one — a bucket with points and no names is a real and different state.
  const poiNamed = pois.filter(f => f.tags?.name).length
  console.log(`  POI points: ${pois.length} (${poiNamed} named)`)
  if (pois.length) {
    const byCat = {}
    for (const f of pois) {
      const c = byCat[f.category] || (byCat[f.category] = { n: 0, named: 0 })
      c.n++; if (f.tags?.name) c.named++
    }
    for (const [cat, c] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n)) {
      console.log(`    ${cat}: ${c.n} (${c.named} named)`)
    }
  }

  // Write output
  const outPath = join(RAW_DIR, 'osm.json')

  // ⛔ THE HEAVY PASS AUGMENTS — it never clobbers. It fetched a DIFFERENT tag set over
  // a DIFFERENT (disc-derived) square, so writing it whole would silently discard the
  // boundary vocabulary and every painted footprint the light pass acquired — i.e. it
  // would delete the thing the operator authored against. Merge by element id; the
  // frame's `bbox` is the light envelope and stays, with the heavy square recorded
  // beside it so the pour can say what it actually covered.
  let output
  if (pass === 'heavy') {
    let prior = null
    try { prior = JSON.parse(readFileSync(outPath, 'utf-8')) } catch { prior = null }
    if (!prior) {
      console.error(`\n⛔ --pass=heavy with no prior ${outPath}. The heavy pass augments a light one; there is nothing to augment.\n`)
      process.exit(2)
    }
    // ⛔ `ground` IS KEYED BY CATEGORY, NOT AN ARRAY. The first cut of this merge
    // iterated it as a flat list — `for (const g of ground)` — which threw
    // `TypeError: ground is not iterable` and meant the heavy pass could never
    // complete. Found by agent STRAND, on the first attempt to actually run it.
    //
    // ⚠️ And the reason I did not find it: I only ever ran `--dry-run`, which returns
    // BEFORE this merge. The flag I added so the gate could be exercised safely is
    // the same flag that made the code it guards unreachable in testing. A safety
    // valve that also shortens the path under test is not a test.
    const merged = mergeGround(prior.ground, ground)
    // ⛔ POINTS AUGMENT TOO, and for the same reason the ground does: the light pass
    // fetched `highway` nodes over the SOFT envelope and the heavy pass fetches the POI
    // tags over the disc square, so writing either whole discards the other's nodes.
    // ⭐ Keyed on `osmId`, which is the field these records actually carry. ⚠️ Note that
    // `mergeGround` above keys on `f.id` — a field NO feature in this file emits
    // (`wayToFeature` writes `osmId`) — so its dedupe has never matched and every
    // merged ground category is prior-then-incoming with duplicates kept. Out of this
    // brief's bounds; said aloud rather than absorbed.
    const poiById = new Map()
    for (const f of (prior.pois || [])) poiById.set(f.osmId, f)
    const poisBefore = poiById.size
    let poisAdded = 0
    for (const f of pois) { if (!poiById.has(f.osmId)) poisAdded++; poiById.set(f.osmId, f) }
    const mergedPois = [...poiById.values()]
    output = {
      ...prior,
      bbox: prior.bbox,
      heavyBbox: { ...bboxObj },
      ground: merged.ground,
      pois: mergedPois,
      nodeCount: Math.max(prior.nodeCount || 0, Object.keys(nodes).length),
    }
    console.log(`  merged: ${merged.before} light + ${merged.added} new heavy = ${merged.after} ground features across ${Object.keys(merged.ground).length} categories; ${output.buildings?.length || 0} buildings preserved`)
    console.log(`  merged pois: ${poisBefore} light + ${poisAdded} new heavy = ${mergedPois.length} point features`)
  } else {
    output = {
      bbox: { ...bboxObj },
      ground,
      // ⭐ A SIBLING OF `ground`, NOT A MEMBER OF IT. See the producer above for why.
      pois,
      buildings,
      nodeCount: Object.keys(nodes).length,
    }
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2))
  const sizeKb = Math.round(JSON.stringify(output).length / 1024)
  console.log(`\n  Saved ${outPath} (${sizeKb} KB)`)
  console.log('='.repeat(60))
}

main()
