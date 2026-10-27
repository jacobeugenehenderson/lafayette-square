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
import clipperLib from 'clipper-lib'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'          // clipper units per metre: 1 mm

const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const union = (paths) => { if (!paths.length) return new Paths(); const c = new Clipper(), out = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true)
  if (!c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: the deck union FAILED'); return out }

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

/**
 * THE DECK FOOTPRINTS (structures.mjs#deckStructures): an area as mapped, a line buffered to its width (OSM `width`,
 * else structures.mjs#defaultDeckWidthM: the sourced typical width), butt ends. One union, as clipper paths, with a
 * point test for the samplers. ⛔ From the data's tags, never a site list.
 */
export function deckFootprints(osmGround) {
  const { areas, lines } = deckStructures(osmGround)
  let typical = null
  const paths = new Paths()
  for (const a of areas) paths.push(toPath(a.ring))
  let unmapped = 0
  for (const l of lines) {
    const wM = l.widthM ?? (typical ??= defaultDeckWidthM())
    if (l.widthM == null) unmapped++
    const co = new ClipperOffset(), out = new Paths()
    co.AddPath(toPath(l.line), JoinType.jtMiter, EndType.etOpenButt)
    co.Execute(out, (wM / 2) * SCALE)
    for (const p of out) paths.push(p)
  }
  const u = union(paths)
  const rings = u.map(fromPath)
  const boxes = rings.map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return [x0, x1, z0, z1] })
  // nonzero over the union's rings: an outer counts +1, a hole −1, so a point in a deck's courtyard is not on the deck
  const on = (x, z) => { let wn = 0; for (let k = 0; k < rings.length; k++) { const b = boxes[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (inRing(x, z, rings[k])) wn += Math.sign(signedArea(rings[k])) } return wn !== 0 }
  // ⭐ WHERE A SEGMENT a→b LEAVES THE DECK (Zob, 2026-10-26): the exact crossing of the deck's own ring nearest a (the deck
  // end), so a coast traced against a deck lies ON the deck's edge, never a sample's guess at it; a itself when a lies on
  // the ring (within the clip grid); else null.
  const crossing = (a, b) => { let best = null, bt = Infinity
    const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sz0 = Math.min(a[1], b[1]), sz1 = Math.max(a[1], b[1])
    for (let k = 0; k < rings.length; k++) { const bx = boxes[k]; if (sx1 < bx[0] || sx0 > bx[1] || sz1 < bx[2] || sz0 > bx[3]) continue
      const r = rings[k]
      for (let m = 0; m < r.length; m++) { const p = r[m], q = r[(m + 1) % r.length]
        const dx = b[0] - a[0], dz = b[1] - a[1], ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex
        if (den === 0) continue
        const t = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den, u2 = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den
        if (t >= 0 && t <= 1 && u2 >= 0 && u2 <= 1 && t < bt) { bt = t; best = [a[0] + t * dx, a[1] + t * dz] } } }
    if (best) return best
    // ⭐ No proper crossing: a runs along a ring edge (collinear) or sits on the ring itself, so the deck end IS the crossing,
    // exact, but only if a lies on the ring within the clip grid. Otherwise null, and the caller refuses: never a guess.
    let dmin = Infinity
    for (let k = 0; k < rings.length; k++) { const bx = boxes[k]; if (a[0] < bx[0] - 1 || a[0] > bx[1] + 1 || a[1] < bx[2] - 1 || a[1] > bx[3] + 1) continue
      const r = rings[k]; for (let m = 0; m < r.length; m++) { const p = r[m], q = r[(m + 1) % r.length], ex = q[0] - p[0], ez = q[1] - p[1], L2 = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((a[0] - p[0]) * ex + (a[1] - p[1]) * ez) / L2)); dmin = Math.min(dmin, Math.hypot(a[0] - p[0] - u * ex, a[1] - p[1] - u * ez)) } }
    return dmin <= 1 / SCALE ? a : null }
  return { paths: u, rings, on, crossing, count: { areas: areas.length, lines: lines.length, unmappedWidth: unmapped, typicalWidthM: typical }, m2: u.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE) }
}

/**
 * ⭐ THE STREET RIDES THE DECK (Jacob, 2026-10-25: "a, the street rides the deck"). The deck footprints a mapped street
 * crosses, by CONSTRUCTION (Zob): each street polyline is clipped at the footprint, and a footprint any street's clipped
 * segment lies inside carries that street. No fraction, no threshold. The mint takes these footprints OUT of ①'s water,
 * so the deck is a land face and the street's walk and curb are built on it at the land's height; a deck that carries no
 * street stays water (the off-ground deck object, later).
 * @param streets [{ points: [[x, z], …], skelId? }] — the chains the mint is given
 * @returns { rings: [ring], decks: [{ ring, streets: [skelId] }] }
 */
export function streetDecks(ground, streets) {
  const fp = deckFootprints(ground)
  const outers = fp.rings.filter(r => signedArea(r) !== 0)
  const decks = []
  for (const ring of outers) {
    if (signedArea(ring) < 0 && outers.some(o => o !== ring && signedArea(o) > 0 && inRing(ring[0][0], ring[0][1], o))) continue   // a hole of another
    const rp = toPath(ring), on = []
    for (const st of streets) {
      const c = new Clipper(), tree = new PolyTree()
      const line = toPath(st.points || [])
      if (line.length < 2) continue
      c.AddPath(line, PolyType.ptSubject, false); c.AddPath(rp, PolyType.ptClip, true)
      c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      if (Clipper.OpenPathsFromPolyTree(tree).some(p => p.length >= 2)) on.push(st.skelId ?? st.name ?? null)
    }
    if (on.length) decks.push({ ring, streets: on })
  }
  return { rings: decks.map(d => d.ring), decks }
}

/** ①'s water rings and shoreline arcs with the street decks taken OUT: the rings minus the decks (outers positive, holes
 *  negative), the arcs clipped where they run under a deck. */
export function waterWithoutDecks(rings, arcs, deckRings) {
  if (!deckRings.length) return { rings, arcs }
  const c = new Clipper(), tree = new PolyTree()
  c.AddPaths(rings.map(toPath), PolyType.ptSubject, true); c.AddPaths(deckRings.map(toPath), PolyType.ptClip, true)
  if (!c.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: water minus decks FAILED')
  const out = []
  const walk = (node) => { for (const ch of node.Childs()) { const o = fromPath(ch.Contour()); out.push(signedArea(o) > 0 ? o : o.reverse())
    for (const h of ch.Childs()) { const r = fromPath(h.Contour()); out.push(signedArea(r) < 0 ? r : r.reverse()); walk(h) } } }
  walk(tree)
  const a2 = []
  for (const arc of arcs) {
    const k = new Clipper(), t2 = new PolyTree()
    k.AddPath(toPath(arc), PolyType.ptSubject, false); k.AddPaths(deckRings.map(toPath), PolyType.ptClip, true)
    k.Execute(ClipType.ctDifference, t2, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    for (const p of Clipper.OpenPathsFromPolyTree(t2)) if (p.length >= 2) a2.push(fromPath(p))
  }
  return { rings: out, arcs: a2 }
}
