/**
 * derive-ls-render-ledger.js — project Lafayette Square's authored building doc
 * down to its RENDER fields, writing the per-scene render ledger the bake reads.
 *
 * WHY: LS is the one legacy install whose buildings are hand-authored in
 * `src/data/buildings.json`. That file is DUAL-consumed — the slab bake reads
 * render fields (footprint/materials/stories) and the townie app reads CONTENT
 * fields (name/historic/listings). To make LS "just a look at the render level"
 * (so `loadBuildings` reads a per-scene render ledger uniformly and the
 * `scene === 'lafayette-square'` hardwire at bake-buildings.js:62 retires), we
 * emit ONLY the render fields to `cartograph/data/lafayette-square/buildings.json`.
 *
 * The CONTENT stays in `src/data/buildings.json` untouched — the ~10 townie
 * imports keep reading it (the render/content split; content decoupling is the
 * NEXT program, not this one). This ledger is a regenerable SEED — never
 * hand-edit it; per-building operator overrides live in a separate sidecar
 * (feedback_effective_payload_layering), so re-deriving never clobbers edits.
 *
 * RENDER_FIELDS = exactly what bake-buildings.js reads off a building object
 * (audited 2026-07-04): footprint · size · stories · wall_material ·
 * roof_material · color · id (override/palette key) · zoning · year_built.
 * `zoning`/`year_built` read content-ish but the bake bakes them, so they are
 * render inputs by the byte-identity gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src', 'data', 'buildings.json')
const OUT = join(ROOT, 'cartograph', 'data', 'lafayette-square', 'buildings.json')

const RENDER_FIELDS = [
  'id', 'footprint', 'size', 'color', 'stories',
  'wall_material', 'roof_material', 'zoning', 'year_built',
]

const raw = JSON.parse(readFileSync(SRC, 'utf-8'))
const src = Array.isArray(raw) ? raw : (raw.buildings || [])

const buildings = src.map((b) => {
  const out = {}
  for (const k of RENDER_FIELDS) if (k in b) out[k] = b[k]
  return out
})

const doc = {
  _generated: 'RENDER ledger — projected from src/data/buildings.json render fields. Regenerable; do NOT hand-edit. Overrides live in a sidecar.',
  scene: 'lafayette-square',
  buildings,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(doc))
console.log(`[derive-ls-render-ledger] ${buildings.length} buildings → ${OUT}`)
