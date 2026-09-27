/**
 * structures.mjs — the STRUCTURES OVER WATER a town maps, read the same way by every consumer.
 *
 * Jacob, 2026-09-27: "it is universal and it answers many questions regarding how the land meets the water."
 * Ruled: every mapped pier · quay · wharf · jetty · platform is a DECK above the water at the height of the land
 * where it meets the shore (so it joins with no step); what stands on it stands on the deck; a line with no width
 * takes OSM's `width`, else a sourced typical width (references f-ufc-main-walkway-width). Breakwaters and groynes
 * are stone — the revetment's, not this module's.
 *
 * ⛔ EVERY BUCKET, READ BY TAG. The fetch files a feature under ONE bucket, so 78 of provincetown's 90 deck
 * structures sit under `highway` (MacMillan Wharf is highway=service + man_made=pier). A structure is what its
 * tags say, wherever it was filed.
 */
import fs from 'fs'
import { join } from 'path'
import { CARTOGRAPH_DIR } from './config.js'

export const DECK_KINDS = ['pier', 'quay', 'wharf', 'jetty', 'platform']
/** Rock structures — built as the revetment's stone; the terrain keeps the lidar's rock under them (bake-terrain). */
export const STONE_KINDS = ['breakwater', 'groyne']

const kindOf = (f) => (DECK_KINDS.includes(f?.tags?.man_made) ? f.tags.man_made : null)
const pts = (f) => (f.coords || []).map(c => [c.x, c.z]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))

/** A mapped width in metres, or null. OSM `width` is metres unless it says otherwise; anything unparsed is null. */
function widthM(tags) {
  const w = tags?.width
  if (w == null) return null
  const m = String(w).trim().match(/^([\d.]+)\s*(m|ft|')?$/i)
  if (!m) return null
  const v = +m[1]
  return m[2] && /ft|'/i.test(m[2]) ? v * 0.3048 : v
}

/** The kit's width for a line with none mapped — read from the references, never typed here. */
export function defaultDeckWidthM() {
  const reg = JSON.parse(fs.readFileSync(join(CARTOGRAPH_DIR, '..', 'references', 'registry.json'), 'utf8'))
  const f = reg.findings.find(x => x.id === 'f-ufc-main-walkway-width')
  if (!f) throw new Error('⛔ structures: references has no f-ufc-main-walkway-width — a pier line has no width to take')
  return f.value.width_m
}

/**
 * The deck structures in a raw fetch's `ground`: AREAS (closed ways — drawn as mapped) and LINES (open ways — a
 * walkway of their width). Each once, by identity, whichever bucket it sat in.
 */
export function deckStructures(ground) {
  const areas = [], lines = [], seen = new Set()
  for (const bucket of Object.values(ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const kind = kindOf(f)
      if (!kind || seen.has(f)) continue
      seen.add(f)
      const p = pts(f)
      const base = { id: f.osmId ?? null, kind, name: f.tags?.name || null, floating: f.tags?.floating === 'yes', tags: f.tags }
      if (f.isClosed && p.length >= 4) areas.push({ ...base, ring: p.slice(0, -1) })
      else if (p.length >= 2) lines.push({ ...base, line: p, widthM: widthM(f.tags) })
    }
  }
  return { areas, lines }
}

/** Breakwaters and groynes: AREAS (closed) and LINES (open), each once, whatever bucket it sat in. */
export function stoneStructures(ground) {
  const areas = [], lines = [], seen = new Set()
  for (const bucket of Object.values(ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const kind = STONE_KINDS.includes(f?.tags?.man_made) ? f.tags.man_made : null
      if (!kind || seen.has(f)) continue
      seen.add(f)
      const p = pts(f), base = { id: f.osmId ?? null, kind, name: f.tags?.name || null, tags: f.tags }
      if (f.isClosed && p.length >= 4) areas.push({ ...base, ring: p.slice(0, -1) })
      else if (p.length >= 2) lines.push({ ...base, line: p })
    }
  }
  return { areas, lines }
}
