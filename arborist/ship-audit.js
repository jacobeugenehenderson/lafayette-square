#!/usr/bin/env node
/**
 * ship-audit.js — does every roster species actually SHIP in all three forms?
 *
 * A tree reaches the player three ways, and each can fail independently and
 * SILENTLY:
 *   1. MESH      — the published GLB ladder (lod0/1/2) under baked/<look>/trees/
 *   2. HERO      — the side-on azimuthal canopy bands (`heroImpostorBySpecies`)
 *   3. OVERHEAD  — the top-down 3-slice snapshot (`overheadBySpecies`)
 *
 * The failure this exists to catch: a capture that renders NOTHING still writes a
 * perfectly valid transparent PNG. The manifest looks complete, the bake reports
 * success, and the species simply stops existing in that view — while its ground
 * shadow keeps printing. `platanus_acerifolia` shipped all 18 hero layers blank
 * that way (442 placements, LS's 2nd most common tree). Byte-presence is not
 * proof; only pixel coverage is. Same class as the shipped blank overhead bands.
 *
 * Reports per species per form: PRESENT / BLANK / MISSING, with the measurement
 * that decided it. Exits non-zero if anything is BLANK or MISSING, so this can
 * gate a ship.
 *
 * Usage: node arborist/ship-audit.js [--look lafayette-square] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// A layer/band below this opaque fraction is a failed capture, not a thin canopy.
// Real captures measure 1–33%; the failures measure exactly 0.00%.
const BLANK_COVERAGE = 0.002

function parseArgs() {
  const out = { look: 'lafayette-square', json: false }
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a === '--look') out.look = process.argv[++i]
    else if (a === '--json') out.json = true
  }
  return out
}

function alphaCoverage(file) {
  const png = PNG.sync.read(fs.readFileSync(file))
  let opaque = 0
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 12) opaque++
  return opaque / (png.data.length / 4)
}

// Measure a set of layer records that each name an `albedo` path. Returns the
// worst coverage seen plus how many were blank/absent — one bad layer is enough
// to hole the parallax, so the MINIMUM is the verdict, never the average.
function measureLayers(layers, lookDir) {
  let blank = 0, missing = 0, min = 1
  for (const l of layers) {
    const f = path.join(lookDir, l.albedo.replace(/^\//, ''))
    if (!fs.existsSync(f)) { missing++; continue }
    const c = alphaCoverage(f)
    if (c < min) min = c
    if (c < BLANK_COVERAGE) blank++
  }
  return { total: layers.length, blank, missing, min }
}

const verdict = (m) => (m.missing ? 'MISSING' : m.blank ? 'BLANK' : 'ok')

async function main() {
  const { look, json } = parseArgs()
  const lookDir = path.join(REPO_ROOT, 'public', 'baked', look)
  const atlasPath = path.join(lookDir, 'trees-atlas.json')
  if (!fs.existsSync(atlasPath)) {
    console.error(`[ship-audit] no trees-atlas.json for look '${look}' — bake it first.`)
    process.exit(2)
  }
  const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'))
  const hero = atlas.heroImpostorBySpecies || {}
  const overhead = atlas.overheadBySpecies || {}

  // The roster is what the look claims to ship. Union every species named by any
  // of the three forms so a species present in one and absent from another shows
  // up as a GAP rather than quietly vanishing from the report.
  const species = [...new Set([
    ...Object.keys(hero),
    ...Object.keys(overhead),
    ...Object.keys(atlas.canopyByVariant || {}),
  ])].sort()

  // Placement counts give each gap its weight — a blank species with 442
  // placements is a different problem from one with 2.
  const treesPath = path.join(lookDir, 'trees.json')
  const counts = {}
  if (fs.existsSync(treesPath)) {
    for (const i of JSON.parse(fs.readFileSync(treesPath, 'utf8')).instances) {
      counts[i.species] = (counts[i.species] || 0) + 1
    }
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const rows = []
  for (const sp of species) {
    // MESH — the ladder must exist AND carry geometry. A 0-triangle GLB is the
    // mesh-side equivalent of a blank capture.
    const spDir = path.join(lookDir, 'trees', sp)
    let mesh = { verdict: 'MISSING', note: 'no directory under baked/<look>/trees/' }
    if (fs.existsSync(spDir)) {
      const lods = ['lod0', 'lod1', 'lod2']
      const found = {}
      for (const lod of lods) {
        const f = fs.readdirSync(spDir).find(n => n.endsWith(`-${lod}.glb`))
        if (f) found[lod] = path.join(spDir, f)
      }
      const absent = lods.filter(l => !found[l])
      if (absent.length) {
        mesh = { verdict: 'MISSING', note: `no ${absent.join('/')}` }
      } else {
        let tris = 0
        try {
          const doc = await io.read(found.lod1)
          for (const m of doc.getRoot().listMeshes())
            for (const p of m.listPrimitives())
              tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
        } catch (e) { mesh = { verdict: 'BLANK', note: `lod1 unreadable: ${e.message.slice(0, 40)}` } }
        if (mesh.verdict !== 'BLANK') {
          mesh = tris > 0
            ? { verdict: 'ok', note: `lod1 ${Math.round(tris).toLocaleString()} tris` }
            : { verdict: 'BLANK', note: 'lod1 has 0 triangles' }
        }
      }
    }

    // HERO + OVERHEAD — pixel coverage, not byte presence.
    let heroRow = { verdict: 'MISSING', note: 'no heroImpostorBySpecies record' }
    if (hero[sp]?.layers?.length) {
      const m = measureLayers(hero[sp].layers, lookDir)
      heroRow = {
        verdict: verdict(m),
        note: `${m.total} layers` + (m.blank ? `, ${m.blank} BLANK` : '') +
              (m.missing ? `, ${m.missing} absent` : '') + `, min ${(m.min * 100).toFixed(2)}%`,
      }
    }
    let overRow = { verdict: 'MISSING', note: 'no overheadBySpecies record' }
    if (overhead[sp]?.bands?.length) {
      const m = measureLayers(overhead[sp].bands, lookDir)
      overRow = {
        verdict: verdict(m),
        note: `${m.total} bands` + (m.blank ? `, ${m.blank} BLANK` : '') +
              (m.missing ? `, ${m.missing} absent` : '') + `, min ${(m.min * 100).toFixed(2)}%`,
      }
    }

    rows.push({ species: sp, placements: counts[sp] || 0, mesh, hero: heroRow, overhead: overRow })
  }

  if (json) {
    console.log(JSON.stringify({ look, rows }, null, 2))
  } else {
    const mark = (v) => (v === 'ok' ? '✅' : v === 'BLANK' ? '⛔' : '❌')
    console.log(`\n[ship-audit] look='${look}' — ${rows.length} species × 3 forms\n`)
    console.log('  ' + 'species'.padEnd(24) + 'plc'.padStart(6) + '  MESH'.padEnd(10) + 'HERO'.padEnd(9) + 'OVERHEAD')
    for (const r of rows) {
      console.log('  ' + r.species.padEnd(24) + String(r.placements).padStart(6) +
        '   ' + mark(r.mesh.verdict).padEnd(6) + mark(r.hero.verdict).padEnd(6) + mark(r.overhead.verdict))
    }
    console.log('\n  Detail on anything not ✅:')
    let clean = true
    for (const r of rows) {
      for (const [form, cell] of [['MESH', r.mesh], ['HERO', r.hero], ['OVERHEAD', r.overhead]]) {
        if (cell.verdict === 'ok') continue
        clean = false
        console.log(`   ${mark(cell.verdict)} ${r.species} · ${form} · ${cell.verdict} — ${cell.note}` +
          (r.placements ? `  (${r.placements} placements affected)` : ''))
      }
    }
    if (clean) console.log('   — none. All species ship in all three forms.')
    console.log()
  }

  const bad = rows.filter(r => [r.mesh, r.hero, r.overhead].some(c => c.verdict !== 'ok'))
  process.exit(bad.length ? 1 : 0)
}

main().catch(e => { console.error('[ship-audit] fatal:', e); process.exit(2) })
