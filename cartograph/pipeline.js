#!/usr/bin/env node
/**
 * Cartograph — Main pipeline
 *
 * Centerline-out: load raw → snap → derive layers from standards → write
 *
 * Usage:    node pipeline.js [--skip-elevation]
 * Prereq:  node fetch.js (to populate data/raw/osm.json)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { RAW_DIR, CLEAN_DIR, SCENE, DEFAULT_SCENE, requireExplicitScene} from './config.js'
import { writeIfChanged } from './io.js'
import { snapAll } from './snap.js'
import { deriveLayers, deriveBuildings, _lotPaths } from './derive.js'
import { fetchElevationGrid, interpolateElevation } from './elevation.js'
import { createMembershipFilter, buildingIdOf } from './membership.mjs'

// ⛔ No silent default on a WRITE path (BRIEF-ls-bleed-excision site 11).
requireExplicitScene('pipeline.js (writes data/<scene>/clean/map.json)')

const skipElevation = process.argv.includes('--skip-elevation')

async function main() {
  console.log('='.repeat(60))
  console.log('cartograph/pipeline.js — Centerline-out pipeline')
  console.log('='.repeat(60))

  // ── Load ────────────────────────────────────────────────────────────
  console.log('\n[1/4] Loading raw data...')
  const raw = JSON.parse(readFileSync(join(RAW_DIR, 'osm.json'), 'utf-8'))
  const hwCount = (raw.ground.highway || []).length
  console.log(`  ${hwCount} highway features, ${raw.buildings.length} OSM buildings`)

  // Building source priority:
  //   1. src/data/buildings.json — curated project data (detailed footprints
  //      with materials, stories, sqft, addresses). Built for the 3D app.
  //   2. data/raw/msbf.json       — Microsoft Building Footprints (fallback)
  //   3. osm.buildings            — OSM (lowest quality, historical fallback)
  // The curated src/data/buildings.json is the DEFAULT scene's (Lafayette
  // Square) hand-enriched building set — it must NOT be pulled into another
  // scene. A non-default scene uses its own msbf.json / OSM buildings.
  const PROJECT_ROOT = join(RAW_DIR, '..', '..', '..', '..')
  const projectBldgPath = join(PROJECT_ROOT, 'src', 'data', 'buildings.json')
  const msbfPath = join(RAW_DIR, 'msbf.json')
  if (SCENE === DEFAULT_SCENE && existsSync(projectBldgPath)) {
    const proj = JSON.parse(readFileSync(projectBldgPath, 'utf-8'))
    const list = proj.buildings || []
    raw.buildings = list
      .filter(b => b.footprint && b.footprint.length >= 3)
      .map(b => ({
        projectId: b.id,
        tags: {
          building: 'yes',
          source: 'project',
          ...(b.address && { address: b.address.trim() }),
          ...(b.stories && { stories: b.stories }),
          ...(b.building_sqft && { sqft: b.building_sqft }),
          ...(b.wall_material && { wall_material: b.wall_material }),
          ...(b.roof_material && { roof_material: b.roof_material }),
          ...(b.historic_status && { historic_status: b.historic_status }),
          ...(b.zoning && { zoning: b.zoning }),
        },
        isClosed: true,
        coords: b.footprint.map(([x, z]) => ({ x, z })),
      }))
    console.log(`  Using src/data/buildings.json: ${raw.buildings.length} curated buildings`)
    raw.buildingSource = 'project'
  } else if (existsSync(msbfPath)) {
    const msbf = JSON.parse(readFileSync(msbfPath, 'utf-8'))
    console.log(`  Using Microsoft Building Footprints: ${msbf.buildings.length} buildings`)
    raw.buildings = msbf.buildings
    raw.buildingSource = 'microsoft'
  } else {
    raw.buildingSource = 'osm'
  }

  // ── Pre-clip the building INPUT to membership (KIT, perf) ────────────
  // A big fetch (a CDP is ~33k buildings) must NOT be snapped + derived whole — that
  // is the pour's OOM/hang. Drop every building that isn't in the neighborhood HERE,
  // on the raw input, so snap/derive/elevation only process the ~kept set. Uses the
  // SAME membership as the post-derive clip below (circle − exclusions + overrides),
  // so the result is identical, just far cheaper. No boundary (uncommitted) = no clip.
  if (Array.isArray(raw.buildings) && raw.buildings.length) {
    const nbP = join(RAW_DIR, '..', 'neighborhood_boundary.json')
    if (existsSync(nbP)) {
      try {
        const nb = JSON.parse(readFileSync(nbP, 'utf-8'))
        const ovP = join(RAW_DIR, '..', 'building-overrides.json')
        let activate = new Set(), hide = new Set()
        if (existsSync(ovP)) { try { const ov = JSON.parse(readFileSync(ovP, 'utf8')); activate = new Set(ov.activate || []); hide = new Set(ov.hide || []) } catch { /* ignore */ } }
        const membership = createMembershipFilter({ nb, activate, hide, label: 'pipeline/pre-clip' })
        const before = raw.buildings.length
        raw.buildings = raw.buildings.filter((b) => membership.decide(
          buildingIdOf(b),
          b.coords || b.ring || (b.rings && b.rings[0]) || null,
        ))
        membership.report()

      } catch (e) { console.warn(`  building pre-clip skipped: ${e.message}`) }
    }
  }

  // ── Snap ────────────────────────────────────────────────────────────
  console.log('\n[2/4] Snapping coordinates to grid...')
  const snapped = snapAll(raw)

  // ── Derive ──────────────────────────────────────────────────────────
  console.log('\n[3/5] Deriving layers from centerlines + standards...')
  const layers = deriveLayers(snapped.ground.highway || [])
  let buildings = deriveBuildings(snapped.buildings, raw.buildingSource)

  // ── Elevation ───────────────────────────────────────────────────────
  console.log('\n[4/4] Elevation...')
  let elevationGrid = null
  const elevCachePath = join(RAW_DIR, 'elevation.json')

  if (skipElevation) {
    console.log('  Skipped (--skip-elevation)')
  } else if (existsSync(elevCachePath)) {
    console.log('  Loading cached elevation grid...')
    elevationGrid = JSON.parse(readFileSync(elevCachePath, 'utf-8'))
    console.log(`  ${elevationGrid.points.length} cached samples, ${elevationGrid.minElev.toFixed(1)}–${elevationGrid.maxElev.toFixed(1)}m`)
  } else {
    console.log('  Fetching from USGS...')
    elevationGrid = await fetchElevationGrid()
    writeFileSync(elevCachePath, JSON.stringify(elevationGrid, null, 2))
  }

  if (elevationGrid) {
    for (const b of buildings) {
      const cx = b.ring.reduce((s, p) => s + p.x, 0) / b.ring.length
      const cz = b.ring.reduce((s, p) => s + p.z, 0) / b.ring.length
      b.elev = Math.round(interpolateElevation(cx, cz, elevationGrid) * 100) / 100
    }
  }

  // ── Building membership (KIT) ───────────────────────────────────────
  // ⛔⛔ THE GEOMETRIC CLIP WAS EXCISED HERE — 2026-09-05, ruled by Jacob: "let's
  // remove the clip and recover the full bb chains." What stood here trimmed every
  // street/alley/path polyline to a circle and dropped features outside it.
  //
  // WHY, and it is a CONTRACT breach rather than a perf question (`EXTENT-DESIGN
  // §3.3`): the bb is a SQUARE holding the disc, frozen at hard fetch at roughly
  // radius + 20–25% — the "forever safety zone" — sized so the data reaches the first
  // junction PAST the boundary streets so corners still close, and so R15's live edits
  // (change the radius, move the disc centroid, hide/reveal) need NO re-pour "because
  // the frozen square holds every point in the zone". The clip cut at
  // `max(streetFade.outer, radius) + 30`, INSIDE that zone on every kit-built scene
  // (Altadena by 642–850 m) — so growing the radius revealed nothing, the data having
  // already been destroyed. The forever zone was not forever.
  // ⭐ And the VERB was wrong: EXTENT says the disc HIDES what is outside it. This was
  // the one step in the chain that DELETED instead. The disc hides; the bb holds.
  //
  // ⭐ ROOT of why it had to invent an extent: the boundary record carries NO bb field
  // (`radius`, `fade`, `streetFade`, `boundary`, `polygon`, `exclusions` — no forever
  // zone). With nothing principled to clip to it reached for `streetFade` — A RENDER
  // KNOB deciding what exists. Jacob: "the edge gets faded but AFTER it's drawn."
  // Measured live on all three kit scenes, `fadeOuter` dominating `radius`: it alone
  // decided the fate of 43 / 80 / 28 chains. ▶ `node checks/claims-rim-census.mjs`
  //
  // ⛔ WHAT THIS DOES NOT DO: it does not bound the DRAWING — nothing here ever did.
  // The disc still hides and `streetFade` still fades. Per Jacob the whole bb is built
  // and only the stamped circle is shown. A bake-time crop is a SEPARATE, still-unbuilt
  // concern: chop at the BAKE, never at the chain. This block fused "what is the
  // neighborhood" with "what do we ship"; they are two questions and it owned neither.
  //
  // ⛔ EXPECT map.json / ribbons.json TO GROW on the next pour, most on a scene whose
  // bb is large relative to its hood (HPDM was keeping 16.9% of chain length). That is
  // recovered data, not bloat.
  //
  // ⭐ WHAT DIES WITH IT — measured, not hoped: the manufactured rim tips at exactly
  // keepR (31/77/44, of which 22/12/26 got ROUND CAPS, so a chopped street rendered as
  // a cul-de-sac — Jacob: "artificially cut off streets in this whole area"); the
  // nodeless-endpoint class this block used to print, a blocker on substrateWalk
  // becoming the producer (`PREBAKE §2.5a`); and the stranded frozen nodes.
  // ⛔ NOT the 51 INTERIOR dead-end tips — 51 pre-clip and 51 post, so they are real
  // and this changes nothing about them. Do not expect A0 to close.
  //
  // Membership SURVIVES, unchanged: the polygon decides which BUILDINGS are in the
  // hood. That is a different question from where the GEOMETRY stops.
  const nbPath = join(RAW_DIR, '..', 'neighborhood_boundary.json')
  if (existsSync(nbPath)) {
    const nb = JSON.parse(readFileSync(nbPath, 'utf-8'))
    // Building MEMBERSHIP (KIT): the neighborhood is the area inside the
    // boundary-street POLYGON; the roster editor's overrides layer on top
    // (activate = force-in an outside building, hide = force-out an inside one).
    // Applied HERE (map.json) so it's the single source the 2D Designer AND the
    // bake both inherit. Falls back to the boundary circle if no polygon persisted.
    const ovPath = join(RAW_DIR, '..', 'building-overrides.json')
    let activate = new Set(), hide = new Set()
    if (existsSync(ovPath)) {
      try { const ov = JSON.parse(readFileSync(ovPath, 'utf8')); activate = new Set(ov.activate || []); hide = new Set(ov.hide || []) }
      catch (e) { console.warn(`  building-overrides unreadable: ${e.message}`) }
    }
    const membership = createMembershipFilter({ nb, activate, hide, label: 'pipeline/map.json' })
    buildings = buildings.filter((b) => membership.decide(buildingIdOf(b), b.ring || null))
    membership.report()
  }

  // ── World-coord bbox (derived from projected layers + buildings) ────
  // raw.bbox is geographic (lat/lon) and unsuitable for runtime consumers
  // that work in world coords. Walk the projected outputs to compute the
  // actual world extent.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const visit = (x, z) => {
    if (Number.isFinite(x) && Number.isFinite(z)) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
  for (const b of buildings) for (const p of (b.ring || [])) visit(p.x, p.z)
  for (const cat of Object.keys(layers || {})) {
    const arr = layers[cat]
    if (!Array.isArray(arr)) continue  // skip nested-object layers like 'ribbons'
    for (const item of arr) {
      // Point features: streetlamp etc. carry x/z directly
      if (typeof item.x === 'number' && typeof item.z === 'number') {
        visit(item.x, item.z)
        continue
      }
      // Polyline/polygon features: ring | coords | points
      const pts = item.ring || item.coords || item.points || []
      for (const p of pts) {
        if (Array.isArray(p)) visit(p[0], p[1]); else visit(p.x, p.z)
      }
    }
  }
  const worldBbox = Number.isFinite(minX)
    ? { minX, maxX, minZ, maxZ }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }

  // ── Write ───────────────────────────────────────────────────────────
  mkdirSync(CLEAN_DIR, { recursive: true })

  const output = {
    bbox: worldBbox,
    geoBbox: raw.bbox,
    elevation: elevationGrid ? {
      minElev: elevationGrid.minElev,
      maxElev: elevationGrid.maxElev,
      sampleCount: elevationGrid.points.length,
    } : null,
    layers,
    buildings,
  }

  // Content-aware so a no-op pipeline run doesn't cascade-invalidate
  // ground / buildings / lamps / scene / ground-ao downstream. MINIFIED — map.json
  // is a derived artifact (never hand-edited) that the Designer fetches whole; the
  // pretty-print whitespace ~doubled it (Altadena 97→~50 MB), for nothing.
  const mapJson = JSON.stringify(output)
  const wrote = writeIfChanged(join(CLEAN_DIR, 'map.json'), mapJson)
  const sizeKb = Math.round(mapJson.length / 1024)
  console.log(`\n  Output: ${join(CLEAN_DIR, 'map.json')} (${sizeKb} KB)${wrote ? '' : ' [unchanged]'}`)
  console.log(`  Buildings: ${buildings.length}`)

  if (elevationGrid) {
    writeIfChanged(join(CLEAN_DIR, 'elevation.json'), JSON.stringify(elevationGrid, null, 2))
  }

  console.log('='.repeat(60))
}

main()
