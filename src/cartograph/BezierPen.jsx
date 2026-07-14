/**
 * BezierPen — the editable Illustrator-style pen for the neighborhood EXCLUSION loops.
 *
 * Membership model (inverted, `HANDOFF-extent-pen-boundary.md` + the excluder pivot):
 * every fetched building is IN by default; each CLOSED loop the operator draws is an
 * EXCLUSION zone — the stray buildings inside it drop out. You lasso the junk, not the
 * neighborhood. There can be MANY loops (junk comes in clumps: top-left, lower-right…);
 * the persisted artifact is the LIST of editable loops, and membership is "inside any
 * loop → out". The extent circle just auto-fits whatever's left.
 *
 * Built as an SVG overlay in the proven MarkerOverlay pattern: the SVG's viewBox tracks
 * the ortho camera frustum (world x/z), stays pointer-events:none so wheel-zoom always
 * reaches the Three canvas, and all interaction runs through window-level pointer handlers
 * doing world-space hit-testing. Coordinates are LIVE-FRAME local x/z; ExtentApp owns the
 * round-trip to frame-independent lon/lat and re-projects on load.
 *
 * Paths model (a prop, owned by ExtentApp): an ARRAY of loops
 *   [{ closed, anchors: [{ x, z, type:'corner'|'smooth', hIn?:{x,z}, hOut?:{x,z} }] }, …]
 * Handles are ABSOLUTE points. `selected` is { p, a } — path index + anchor index.
 *
 * Gestures (per point, across every loop):
 *   • click empty        → drop a point on the loop you're drawing (or start a new loop)
 *   • click-drag empty   → drop a smooth (curved) point
 *   • click a loop's 1st point → close that loop; the next empty click starts a new loop
 *   • ⌘-drag a point      → move it (re-applies junction snap on drop)
 *   • ⌥-drag a point      → smooth it (pull symmetric handles) · ⌥-click → sharpen (corner)
 *   • ⌥-drag a handle     → break the pair into an independent cusp
 *   • plain click a point → delete it (segment heals; loop <3 pts reopens/removes)
 *   • click a segment     → insert a point (de Casteljau split preserves the curve)
 *   • select + Delete/Backspace → delete the selected point
 */
import { useRef, useEffect, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'

const r2 = (v) => Math.round(v * 100) / 100
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// A segment's four control points: p0 = anchor a, c0 = a.hOut (or a for a straight
// run), c1 = b.hIn (or b), p3 = anchor b. Absent handles collapse the cubic to a line.
function segControls(a, b) { return [a, a.hOut || a, b.hIn || b, b] }
function isCurved(a, b) { return !!(a.hOut || b.hIn) }
function cubicAt(p0, c0, c1, p3, t) {
  const u = 1 - t
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
  return {
    x: w0 * p0.x + w1 * c0.x + w2 * c1.x + w3 * p3.x,
    z: w0 * p0.z + w1 * c0.z + w2 * c1.z + w3 * p3.z,
  }
}
function flattenSeg(a, b, steps = 18) {
  if (!isCurved(a, b)) return [a, b]
  const [p0, c0, c1, p3] = segControls(a, b)
  const out = []
  for (let i = 0; i <= steps; i++) out.push(cubicAt(p0, c0, c1, p3, i / steps))
  return out
}

// Flatten ONE loop {closed, anchors} → its polyline points. Used for membership +
// hit-testing. Exported (ExtentApp flattens each loop for point-in-polygon).
export function flattenPath(path) {
  const A = path?.anchors
  if (!A || A.length < 2) return A ? A.map(a => ({ x: a.x, z: a.z })) : []
  const pts = []
  const segCount = path.closed ? A.length : A.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = A[i], b = A[(i + 1) % A.length]
    const seg = flattenSeg(a, b)
    for (let k = (i === 0 ? 0 : 1); k < seg.length; k++) pts.push({ x: seg[k].x, z: seg[k].z })
  }
  return pts
}

function pathToD(path) {
  const A = path?.anchors
  if (!A || A.length < 1) return ''
  let d = `M${A[0].x.toFixed(1)},${A[0].z.toFixed(1)}`
  const segCount = path.closed ? A.length : A.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = A[i], b = A[(i + 1) % A.length]
    if (isCurved(a, b)) {
      const c0 = a.hOut || a, c1 = b.hIn || b
      d += `C${c0.x.toFixed(1)},${c0.z.toFixed(1)} ${c1.x.toFixed(1)},${c1.z.toFixed(1)} ${b.x.toFixed(1)},${b.z.toFixed(1)}`
    } else {
      d += `L${b.x.toFixed(1)},${b.z.toFixed(1)}`
    }
  }
  if (path.closed) d += 'Z'
  return d
}

function nearestOnSeg(a, b, p) {
  const pts = flattenSeg(a, b)
  let bestD = Infinity, bestT = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1]
    const abx = e.x - s.x, abz = e.z - s.z
    const len2 = abx * abx + abz * abz || 1e-6
    let t = ((p.x - s.x) * abx + (p.z - s.z) * abz) / len2
    t = Math.max(0, Math.min(1, t))
    const cx = s.x + t * abx, cz = s.z + t * abz
    const d = Math.hypot(p.x - cx, p.z - cz)
    if (d < bestD) { bestD = d; bestT = (i + t) / (pts.length - 1) }
  }
  return { d: bestD, t: bestT }
}

function splitSeg(a, b, t) {
  const [p0, c0, c1, p3] = segControls(a, b)
  const m0 = lerp(p0, c0, t), m1 = lerp(c0, c1, t), m2 = lerp(c1, p3, t)
  const q0 = lerp(m0, m1, t), q1 = lerp(m1, m2, t)
  const s = lerp(q0, q1, t)
  return { aOut: m0, midIn: q0, mid: s, midOut: q1, bIn: m2 }
}
const mirror = (anchor, h) => ({ x: 2 * anchor.x - h.x, z: 2 * anchor.z - h.z })

export default function BezierPen({ cameraRef, active, paths, onChange, snapTargets, snapDist = 40, selected, onSelect, suspended }) {
  const svgRef = useRef(null)
  const [viewBox, setViewBox] = useState('0 0 1 1')
  const [scale, setScale] = useState(1)
  const spaceDown = useCartographStore(s => s.spaceDown)

  const drag = useRef(null)   // { kind, p, a, side?, moved, downP }
  const pathsRef = useRef(paths)
  pathsRef.current = paths
  const activeRef = useRef(active)
  activeRef.current = active
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const spaceDownRef = useRef(spaceDown)
  spaceDownRef.current = spaceDown
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended
  // Every mutation updates the ref SYNCHRONOUSLY before bubbling to the parent — so a
  // drag firing immediately after add/insert reads the fresh paths, not a stale render.
  const commit = (next) => { pathsRef.current = next; onChange(next) }
  const replacePath = (P, pi, np) => { const N = P.slice(); N[pi] = np; return N }

  function computeVB() {
    const cam = cameraRef.current
    if (!cam || !svgRef.current) return null
    const halfW = (cam.right - cam.left) / (2 * cam.zoom)
    const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
    return { x: cam.position.x - halfW, z: cam.position.z - halfH, w: halfW * 2, h: halfH * 2 }
  }

  useEffect(() => {
    let raf, lx = NaN, lz = NaN, lzoom = NaN
    const sync = () => {
      const cam = cameraRef.current
      if (cam && (cam.position.x !== lx || cam.position.z !== lz || cam.zoom !== lzoom)) {
        lx = cam.position.x; lz = cam.position.z; lzoom = cam.zoom
        const vb = computeVB()
        if (vb) { setViewBox(`${vb.x} ${vb.z} ${vb.w} ${vb.h}`); setScale(vb.w / 900) }
      }
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [cameraRef])

  function screenToWorld(clientX, clientY) {
    const vb = computeVB()
    if (!vb || !svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width < 1) return null
    const fx = (clientX - rect.left) / rect.width
    const fy = (clientY - rect.top) / rect.height
    return { x: r2(vb.x + fx * vb.w), z: r2(vb.z + fy * vb.h) }
  }

  // Snap to nearest junction — placement assist only; result frozen as a plain coord.
  // Screen-relative + capped so it only grabs when the cursor is visually on a node.
  function snap(p) {
    if (!snapTargets?.length) return p
    const vb = computeVB()
    const radius = vb ? Math.min(snapDist, vb.w / 180) : snapDist
    let best = null, bd = radius
    for (const t of snapTargets) {
      const d = Math.hypot(t.x - p.x, t.z - p.z)
      if (d < bd) { bd = d; best = t }
    }
    return best ? { x: r2(best.x), z: r2(best.z) } : p
  }

  // hit-tests across ALL loops
  function hitAnchor(P, p, T) {
    let best = null, bd = T
    for (let pi = 0; pi < P.length; pi++) {
      const A = P[pi].anchors
      for (let ai = 0; ai < A.length; ai++) { const d = dist(A[ai], p); if (d <= bd) { bd = d; best = { p: pi, a: ai } } }
    }
    return best
  }
  function hitSegment(P, p, T) {
    let best = null, bd = T
    for (let pi = 0; pi < P.length; pi++) {
      const A = P[pi].anchors
      const segCount = P[pi].closed ? A.length : A.length - 1
      for (let si = 0; si < segCount; si++) {
        const { d, t } = nearestOnSeg(A[si], A[(si + 1) % A.length], p)
        if (d < bd) { bd = d; best = { p: pi, seg: si, t } }
      }
    }
    return best
  }

  useEffect(() => {
    if (!active) { drag.current = null; return }
    const inCanvas = (e) => {
      const rect = svgRef.current?.getBoundingClientRect()
      return rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    }
    const tol = () => { const vb = computeVB(); return vb ? Math.max(vb.w / 90, 6) : 12 }

    function onDown(e) {
      if (!activeRef.current || spaceDownRef.current || suspendedRef.current || e.button !== 0) return
      if (!inCanvas(e)) return
      if (e.target?.closest?.('.carto-panel, .carto-toolbar, .carto-fab, .carto-looks-popup, .carto-extent-combo, button, input, textarea, select, a')) return
      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return
      const P = pathsRef.current || []
      const T = tol()

      // 1) selected anchor's handle?
      const sel = selectedRef.current
      if (sel && P[sel.p] && P[sel.p].anchors[sel.a]) {
        const sa = P[sel.p].anchors[sel.a]
        for (const side of ['hOut', 'hIn']) {
          if (sa[side] && dist(sa[side], p) <= T) {
            e.preventDefault()
            drag.current = { kind: 'handle', p: sel.p, a: sel.a, side, moved: false }
            return
          }
        }
      }

      // 2) an anchor (any loop)? — ⌘ move · ⌥ convert · plain click delete / close
      const ah = hitAnchor(P, p, T)
      if (ah) {
        e.preventDefault()
        onSelect?.(ah)
        if (e.metaKey) { drag.current = { kind: 'anchor', ...ah, moved: false, downP: p }; return }
        if (e.altKey) { drag.current = { kind: 'convert', ...ah, moved: false, downP: p }; return }
        const path = P[ah.p]
        if (!path.closed && ah.a === 0 && path.anchors.length >= 3) { commit(replacePath(P, ah.p, { ...path, closed: true })); return }
        drag.current = { kind: 'delete', ...ah, moved: false, downP: p }
        return
      }

      // 3) on a segment → insert (split preserves the curve)
      const sh = hitSegment(P, p, T)
      if (sh) {
        e.preventDefault()
        const { np, idx } = insertInPath(P[sh.p], sh.seg, sh.t)
        commit(replacePath(P, sh.p, np))
        onSelect?.({ p: sh.p, a: idx })
        drag.current = { kind: 'anchor', p: sh.p, a: idx, moved: false, downP: p }
        return
      }

      // 4) empty → extend the open loop, or start a new loop
      e.preventDefault()
      const sp = snap(p)
      const openIdx = P.findIndex(pp => !pp.closed)
      if (openIdx >= 0) {
        const path = P[openIdx]
        const anchors = [...path.anchors, { x: sp.x, z: sp.z, type: 'corner' }]
        commit(replacePath(P, openIdx, { ...path, anchors }))
        onSelect?.({ p: openIdx, a: anchors.length - 1 })
        drag.current = { kind: 'new', p: openIdx, a: anchors.length - 1, moved: false, downP: sp }
      } else {
        const np = { closed: false, anchors: [{ x: sp.x, z: sp.z, type: 'corner' }] }
        const P2 = [...P, np]
        commit(P2)
        onSelect?.({ p: P2.length - 1, a: 0 })
        drag.current = { kind: 'new', p: P2.length - 1, a: 0, moved: false, downP: sp }
      }
    }

    function onMove(e) {
      const dr = drag.current
      if (!dr) return
      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return
      const P = pathsRef.current
      const path = P[dr.p]
      if (!path) return
      const A = [...path.anchors]
      dr.moved = dr.moved || dist(p, dr.downP || p) > tol() * 0.4

      if (dr.kind === 'anchor') {
        const a = A[dr.a]
        const dx = p.x - a.x, dz = p.z - a.z
        const na = { ...a, x: p.x, z: p.z }
        if (a.hIn) na.hIn = { x: a.hIn.x + dx, z: a.hIn.z + dz }
        if (a.hOut) na.hOut = { x: a.hOut.x + dx, z: a.hOut.z + dz }
        A[dr.a] = na
        commit(replacePath(P, dr.p, { ...path, anchors: A }))
      } else if (dr.kind === 'handle') {
        const a = A[dr.a]
        const na = { ...a, [dr.side]: { x: p.x, z: p.z } }
        // ⌥-drag breaks the pair → independent cusp (corner); else a smooth mirrors.
        if (e.altKey) na.type = 'corner'
        else if (a.type === 'smooth') { const other = dr.side === 'hOut' ? 'hIn' : 'hOut'; na[other] = mirror(a, { x: p.x, z: p.z }) }
        A[dr.a] = na
        commit(replacePath(P, dr.p, { ...path, anchors: A }))
      } else if (dr.kind === 'new' || dr.kind === 'convert') {
        if (!dr.moved) return
        const a = A[dr.a]
        const hOut = { x: p.x, z: p.z }
        A[dr.a] = { ...a, type: 'smooth', hOut, hIn: mirror(a, hOut) }
        commit(replacePath(P, dr.p, { ...path, anchors: A }))
      }
      // 'delete' — no live action
    }

    function onUp() {
      const dr = drag.current
      drag.current = null
      if (!dr) return
      const P = pathsRef.current
      const path = P[dr.p]
      if (!path) return
      // re-snap an anchor MOVE drop
      if (dr.kind === 'anchor' && dr.moved) {
        const A = [...path.anchors]
        const a = A[dr.a]
        const sp = snap({ x: a.x, z: a.z })
        if (sp.x !== a.x || sp.z !== a.z) {
          const dx = sp.x - a.x, dz = sp.z - a.z
          const na = { ...a, x: sp.x, z: sp.z }
          if (a.hIn) na.hIn = { x: a.hIn.x + dx, z: a.hIn.z + dz }
          if (a.hOut) na.hOut = { x: a.hOut.x + dx, z: a.hOut.z + dz }
          A[dr.a] = na
          commit(replacePath(P, dr.p, { ...path, anchors: A }))
        }
      }
      // ⌥-click a point (no drag) → sharpen to a hard corner
      if (dr.kind === 'convert' && !dr.moved) {
        const A = [...path.anchors]
        const a = A[dr.a]
        A[dr.a] = { x: a.x, z: a.z, type: 'corner' }
        commit(replacePath(P, dr.p, { ...path, anchors: A }))
      }
      // plain click a point (no drag) → delete
      if (dr.kind === 'delete' && !dr.moved) deleteAt(dr.p, dr.a)
    }

    function onKey(e) {
      if (!activeRef.current) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        deleteAt(selectedRef.current.p, selectedRef.current.a)
      }
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onChange, onSelect, snapTargets, snapDist])

  // ── mutations ──────────────────────────────────────────────────────────────
  function deleteAt(pi, ai) {
    const P = pathsRef.current
    const path = P[pi]
    if (!path) return
    const A = path.anchors.filter((_, k) => k !== ai)
    if (A.length === 0) { commit(P.filter((_, k) => k !== pi)); onSelect?.(null); return }
    const closed = A.length >= 3 ? path.closed : false
    commit(replacePath(P, pi, { ...path, anchors: A, closed }))
    onSelect?.({ p: pi, a: Math.max(0, ai - 1) })
  }
  function insertInPath(path, segIdx, t) {
    const A = [...path.anchors]
    const a = A[segIdx], b = A[(segIdx + 1) % A.length]
    if (isCurved(a, b)) {
      const { aOut, midIn, mid, midOut, bIn } = splitSeg(a, b, t)
      A[segIdx] = { ...a, hOut: { x: r2(aOut.x), z: r2(aOut.z) } }
      A[(segIdx + 1) % A.length] = { ...b, hIn: { x: r2(bIn.x), z: r2(bIn.z) } }
      A.splice(segIdx + 1, 0, {
        x: r2(mid.x), z: r2(mid.z), type: 'smooth',
        hIn: { x: r2(midIn.x), z: r2(midIn.z) }, hOut: { x: r2(midOut.x), z: r2(midOut.z) },
      })
    } else {
      const mid = lerp(a, b, t)
      A.splice(segIdx + 1, 0, { x: r2(mid.x), z: r2(mid.z), type: 'corner' })
    }
    return { np: { ...path, anchors: A }, idx: segIdx + 1 }
  }

  const P = paths || []
  // The loops are editing scaffolding — only shown while the pen is active. Pen OFF
  // → the loops vanish and (with the excluded buildings discarded) you see the clean
  // kept neighborhood. Click "Edit exclusion loops" to bring them back.
  if (!active) return null
  const aR = Math.max(scale * 3.8, 2.4)
  const hR = Math.max(scale * 2.8, 1.8)
  const sw = Math.max(scale * 1.05, 0.4)
  const sel = active && selected && P[selected.p] ? P[selected.p].anchors[selected.a] : null

  return (
    <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, cursor: active ? 'crosshair' : 'default' }}>
      {/* every loop — dark halo + turquoise stroke so it reads over the busy aerial */}
      {P.map((pp, pi) => {
        const d = pathToD(pp)
        if (!d) return null
        return (
          <g key={pi}>
            <path d={d} fill="none" stroke="#08110d" strokeWidth={sw * 3.2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#38e1ff" strokeWidth={sw * 1.7} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )
      })}

      {active && <>
        {/* selected anchor's handles */}
        {sel && ['hIn', 'hOut'].map(side => sel[side] && (
          <g key={side}>
            <line x1={sel.x} y1={sel.z} x2={sel[side].x} y2={sel[side].z} stroke="#7ad9ff" strokeWidth={sw} />
            <circle cx={sel[side].x} cy={sel[side].z} r={hR} fill="#7ad9ff" stroke="#08110d" strokeWidth={sw * 0.5} />
          </g>
        ))}
        {/* anchors of every loop — corner = square, smooth = circle; selected = cyan */}
        {P.map((pp, pi) => pp.anchors.map((a, ai) => {
          const isSel = selected && selected.p === pi && selected.a === ai
          const fill = isSel ? '#38e1ff' : '#ffffff'
          return a.type === 'smooth' ? (
            <circle key={`${pi}-${ai}`} cx={a.x} cy={a.z} r={aR} fill={fill} stroke="#08110d" strokeWidth={sw} />
          ) : (
            <rect key={`${pi}-${ai}`} x={a.x - aR} y={a.z - aR} width={aR * 2} height={aR * 2} fill={fill} stroke="#08110d" strokeWidth={sw} />
          )
        }))}
      </>}
    </svg>
  )
}
