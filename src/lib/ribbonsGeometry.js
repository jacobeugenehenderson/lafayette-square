/**
 * ribbonsGeometry.js — bake-time stencil clipping + canonical land-use
 * palette.
 *
 * Once a multi-purpose helper that backed both the V1 live ribbon
 * emitter (StreetRibbons.jsx) and the offline ground bake. After the
 * V2 migration the live path went away and the bake consumes V2's
 * named outputs directly via `cartograph/bake-ground.js#buildV2BakeShape`.
 * What remains here is the stencil clipper that the bake calls AFTER
 * injecting non-V2 overlays (parking_lot, leisure subtypes, barriers,
 * stripes), plus the LU color palette `byFaceUse` falls back to when
 * design.luColors doesn't override.
 *
 * Coord space: [x,z] meters, origin at neighborhood center.
 */

import clipperLib from 'clipper-lib'

const CLIP_SCALE = 1000

// Land-use face fills. Authoring lives in CartographSurfaces; this is
// the fallback for uses the active Look hasn't customized.
export const LAND_USE_COLORS = {
  residential:        '#5A8A3A',
  commercial:         '#A87D3E',
  vacant:             '#7A6E5C',
  'vacant-commercial':'#9A7E54',
  parking:            '#7E7A72',
  institutional:      '#7A6E96',
  recreation:         '#5E9E5E',
  industrial:         '#7E6648',
  park:               '#5E8A3A',
  island:             '#5E8A3A',
  unknown:            '#666666',
}

// Clip every byMaterial ring + byFaceUse face against the neighborhood
// stencil polygon. Mutates the maps in place. Polymorphic on byMaterial
// entries — bare rings (paths, OSM overlays) and {outer, holes} polygons
// (V2 Clipper output via the bake adapter) both supported. Stencil
// intersection preserves outer/hole topology via Clipper's PolyTree.
export function clipAllToStencil(byMaterial, byFaceUse, stencilPolygon) {
  if (!stencilPolygon || stencilPolygon.length < 3) return
  const { Clipper, PolyType, ClipType, PolyFillType, Paths, PolyTree } = clipperLib
  const toClipper = (p) => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) })
  const toWorld   = (path) => path.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE])
  const stencilC  = stencilPolygon.map(toClipper)

  for (const [mat, rings] of byMaterial) {
    const out = []
    for (const item of rings) {
      if (!item) continue
      if (Array.isArray(item)) {
        if (item.length < 3) continue
        const c = new Clipper()
        c.AddPath(item.map(toClipper), PolyType.ptSubject, true)
        c.AddPath(stencilC,            PolyType.ptClip,    true)
        const sol = new Paths()
        c.Execute(ClipType.ctIntersection, sol, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
        for (const path of sol) {
          const w = toWorld(path)
          if (w.length >= 3) out.push(w)
        }
      } else if (item.outer && item.outer.length >= 3) {
        const subj = new Paths()
        subj.push(item.outer.map(toClipper))
        for (const h of (item.holes || [])) {
          if (h.length >= 3) subj.push(h.map(toClipper))
        }
        const c = new Clipper()
        c.AddPaths(subj,    PolyType.ptSubject, true)
        c.AddPath(stencilC, PolyType.ptClip,    true)
        const tree = new PolyTree()
        c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftEvenOdd, PolyFillType.pftNonZero)
        const stack = tree.Childs().slice()
        while (stack.length) {
          const node = stack.shift()
          if (!node.IsHole()) {
            const outer = toWorld(node.Contour())
            if (outer.length < 3) { for (const c2 of node.Childs()) stack.push(c2); continue }
            const holes = []
            for (const child of node.Childs()) {
              if (child.IsHole()) {
                const h = toWorld(child.Contour())
                if (h.length >= 3) holes.push(h)
                for (const gc of child.Childs()) stack.push(gc)
              }
            }
            out.push({ outer, holes })
          } else {
            for (const c2 of node.Childs()) stack.push(c2)
          }
        }
      }
    }
    byMaterial.set(mat, out)
  }

  for (const [use, faces] of byFaceUse) {
    const out = []
    for (const f of faces) {
      if (!f.outer || f.outer.length < 3) continue
      const subj = new Paths()
      subj.push(f.outer.map(toClipper))
      for (const h of (f.holes || [])) {
        if (h.length >= 3) subj.push(h.map(toClipper))
      }
      const c = new Clipper()
      c.AddPaths(subj,    PolyType.ptSubject, true)
      c.AddPath(stencilC, PolyType.ptClip,    true)
      const tree = new PolyTree()
      c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftEvenOdd, PolyFillType.pftNonZero)
      const stack = tree.Childs().slice()
      while (stack.length) {
        const node = stack.shift()
        if (!node.IsHole()) {
          const outer = toWorld(node.Contour())
          if (outer.length < 3) {
            for (const c2 of node.Childs()) stack.push(c2)
            continue
          }
          const holes = []
          for (const child of node.Childs()) {
            if (child.IsHole()) {
              const h = toWorld(child.Contour())
              if (h.length >= 3) holes.push(h)
              for (const gc of child.Childs()) stack.push(gc)
            }
          }
          out.push({ outer, holes })
        } else {
          for (const c2 of node.Childs()) stack.push(c2)
        }
      }
    }
    byFaceUse.set(use, out)
  }
}
