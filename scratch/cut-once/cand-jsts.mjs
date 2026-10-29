// §3.1 candidate A: JSTS (2.12.1, packed into scratch/cut-once/candidates/, never the kit's). The cut-once open/close of
// structures.mjs#openCloseAtStep, in DOUBLES, in clipper units (1 mm), rounded to the lattice ONCE at the output.
// ⛔ JSTS's two silent fallbacks are bypassed and COUNTED, never trusted: BufferOp.computeGeometry retries at reduced precision
// on any exception, and Geometry#union/intersection/difference go through SnapIfNeededOverlayOp. Here the strict paths run
// (BufferBuilder at float precision; OverlayOp.overlayOp); a throw is counted in `fallbacks` and only then is the fallback used,
// so the measurement finishes and says how often the kit would have been handed a silently-snapped result.
// Parity with clipper's ClipperOffset: jtMiter, MiterLimit 2 (clipper's default; JSTS BEVELS past the limit where clipper
// SQUARES, a named difference) · the buffer's input simplifier off (simplifyFactor 0; its default is 0.01 × distance).
import { pathToFileURL } from 'url'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { NODE_BOUND } from '../../src/lib/latticeNode.js'
const J = join(dirname(fileURLToPath(import.meta.url)), 'candidates/lib/node_modules/jsts/org/locationtech/jts')
const im = async (p) => (await import(pathToFileURL(join(J, p)).href)).default
await import(pathToFileURL(join(J, 'monkey.js')).href)
const GeometryFactory = await im('geom/GeometryFactory.js'), Coordinate = await im('geom/Coordinate.js')
const BufferParameters = await im('operation/buffer/BufferParameters.js'), BufferBuilder = await im('operation/buffer/BufferBuilder.js')
const OverlayOp = await im('operation/overlay/OverlayOp.js')
export const JSTS_FILES = J

const gf = new GeometryFactory()
const params = new BufferParameters(); params.setJoinStyle(BufferParameters.JOIN_MITRE); params.setMitreLimit(2); params.setSimplifyFactor(0)

export function makeOps() {
  const fallbacks = { buffer: 0, overlay: 0 }
  const buf = (g, d) => { if (g.isEmpty()) return g
    try { return new BufferBuilder(params).buffer(g, d) } catch (e) { fallbacks.buffer++; return g.buffer(d, params) } }
  const ov = (a, b, code) => { if (a.isEmpty() && code !== OverlayOp.UNION) return gf.createPolygon()
    if (b.isEmpty()) return code === OverlayOp.INTERSECTION ? gf.createPolygon() : a
    if (a.isEmpty()) return b
    try { return OverlayOp.overlayOp(a, b, code) } catch (e) { fallbacks.overlay++
      return code === OverlayOp.UNION ? a.union(b) : code === OverlayOp.INTERSECTION ? a.intersection(b) : a.difference(b) } }
  return { fallbacks, buf, inter: (a, b) => ov(a, b, OverlayOp.INTERSECTION), uni: (a, b) => ov(a, b, OverlayOp.UNION), diff: (a, b) => ov(a, b, OverlayOp.DIFFERENCE) }
}
const ring = (p) => { const cs = p.map(q => new Coordinate(q.X, q.Y)); cs.push(new Coordinate(p[0].X, p[0].Y)); return gf.createLinearRing(cs) }
export const polyOf = (outer, holes) => gf.createPolygon(ring(outer), holes.map(ring))
export const polysOf = (g) => { const out = []; for (let i = 0; i < g.getNumGeometries(); i++) { const p = g.getGeometryN(i); if (p.getGeometryType() === 'Polygon' && !p.isEmpty()) out.push(p) } return out }
export const multi = (ps) => (ps.length ? gf.createMultiPolygon(ps) : gf.createPolygon())

// the one rounding: every vertex to the lattice, consecutive repeats collapse, a ring under 3 distinct points is dropped
export function toPaths(g) {
  const out = []
  const one = (ls, wantCCW) => { const cs = ls.getCoordinates(), p = []
    for (let i = 0; i < cs.length - 1; i++) { const q = { X: Math.round(cs[i].x), Y: Math.round(cs[i].y) }, l = p[p.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) p.push(q) }
    while (p.length > 1 && p[0].X === p[p.length - 1].X && p[0].Y === p[p.length - 1].Y) p.pop()
    if (new Set(p.map(q => q.X + ',' + q.Y)).size < 3) return
    let a = 0; for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u.X * v.Y - v.X * u.Y }
    if ((a > 0) !== wantCCW) p.reverse(); out.push(p) }
  for (const p of polysOf(g)) { one(p.getExteriorRing(), true); for (let k = 0; k < p.getNumInteriorRing(); k++) one(p.getInteriorRingN(k), false) }
  return out
}

/** The cut-once open/close of one part (clipper outer + holes), JSTS in doubles. → { geom, opened, closed, below, slivers } */
export function openCloseJSTS(outer, holes, stepM, SCALE, ops) {
  const { buf, inter, uni, diff } = ops, h = (stepM / 2) * SCALE
  const part = polyOf(outer, holes)
  const open = inter(buf(buf(part, -h), h), part)
  if (open.isEmpty() || open.getArea() <= 0) return { geom: gf.createPolygon(), below: 1, opened: 0, closed: 0, slivers: 0 }
  const closedK = uni(open, buf(buf(open, h), -h))
  const sliver = (p) => buf(p, -NODE_BOUND).isEmpty()
  const tf = polysOf(diff(part, open)).filter(p => !sliver(p)), ff = polysOf(diff(closedK, open)).filter(p => !sliver(p))
  let k = tf.length ? diff(part, multi(tf)) : part
  if (ff.length) k = uni(k, multi(ff))
  return { geom: k, below: 0, opened: tf.reduce((t, p) => t + p.getArea(), 0) / SCALE / SCALE, closed: ff.reduce((t, p) => t + p.getArea(), 0) / SCALE / SCALE, slivers: 0 }
}
