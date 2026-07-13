/**
 * BezierPen — the editable Illustrator-style pen for the neighborhood boundary.
 *
 * The boundary is a LIVING, first-class, endlessly-editable bezier path the
 * operator authors and keeps fixing across sessions. The persisted artifact IS
 * this path; the closed membership polygon is only what we DERIVE from it (flatten
 * → point-in-polygon). This is NOT a draw-once shape — every anchor and handle
 * stays editable forever (`HANDOFF-extent-pen-boundary.md`).
 *
 * Built as an SVG overlay in the proven MarkerOverlay pattern: the SVG's viewBox
 * tracks the ortho camera frustum (world x/z), the SVG stays pointer-events:none
 * so wheel-zoom always reaches the Three canvas, and all interaction runs through
 * window-level pointer handlers doing world-space hit-testing. No pointer-events
 * conflict, no blocked map controls.
 *
 * Coordinates here are LIVE-FRAME local x/z (same space as the aerial / skeleton
 * junctions). ExtentApp owns the round-trip to frame-independent lon/lat for
 * persistence, and re-projects on load — so a re-centered commit never moves an
 * authored anchor.
 *
 * Path model (a prop, owned by ExtentApp):
 *   { closed: bool, anchors: [{ x, z, type:'corner'|'smooth', hIn?:{x,z}, hOut?:{x,z} }] }
 * Handles are stored as ABSOLUTE points (not offsets) — cleanest for the
 * lon/lat projection round-trip.
 *
 * Gestures:
 *   • click empty        → drop a corner anchor (snaps to a nearby junction, then
 *                          FROZEN as a plain coord — never a node reference)
 *   • click-drag empty   → pull bezier handles (a smooth anchor)
 *   • click near start    → close the path
 *   • drag an anchor      → move it (re-applies snap on drop; smooth carries its handles)
 *   • drag a handle       → bend the run (smooth mirrors, corner is independent)
 *   • click on a segment  → insert an anchor (de Casteljau split preserves the curve)
 *   • ⌥-click an anchor    → delete it (segment heals). ⌃-click is taken (revert) +
 *                            is OS right-click on macOS, so delete is Option-click.
 *   • double-click anchor → toggle corner ↔ smooth
 *   • select + Delete/Backspace → delete the selected anchor
 */
import { useRef, useEffect, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'

const r2 = (v) => Math.round(v * 100) / 100
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// A segment's four control points: p0 = anchor a, c0 = a.hOut (or a itself for a
// straight run), c1 = b.hIn (or b), p3 = anchor b. Absent handles collapse the
// cubic to a straight line, so every segment is treated uniformly as a cubic.
function segControls(a, b) {
  return [a, a.hOut || a, b.hIn || b, b]
}
function isCurved(a, b) {
  return !!(a.hOut || b.hIn)
}
function cubicAt(p0, c0, c1, p3, t) {
  const u = 1 - t
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
  return {
    x: w0 * p0.x + w1 * c0.x + w2 * c1.x + w3 * p3.x,
    z: w0 * p0.z + w1 * c0.z + w2 * c1.z + w3 * p3.z,
  }
}

// Flatten one segment to points (for hit-testing + membership). Straight → just
// the endpoints; curved → sampled.
function flattenSeg(a, b, steps = 18) {
  if (!isCurved(a, b)) return [a, b]
  const [p0, c0, c1, p3] = segControls(a, b)
  const out = []
  for (let i = 0; i <= steps; i++) out.push(cubicAt(p0, c0, c1, p3, i / steps))
  return out
}

// The full flattened polyline of the path (open or closed). Consecutive dups
// dropped at the seams.
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

// SVG path `d` for rendering — mirrors the cubic model exactly.
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

// Nearest point on segment i (its flattened polyline) to p → { d, t } where t is
// the approximate parameter along the segment [0,1]. Used for click-on-segment.
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

// De Casteljau split of segment (a,b) at t → { aOut, mid, bIn } absolute points.
// aOut replaces a.hOut, bIn replaces b.hIn, mid is the new smooth anchor's
// position with handles hIn/hOut. Preserves the curve shape exactly.
function splitSeg(a, b, t) {
  const [p0, c0, c1, p3] = segControls(a, b)
  const m0 = lerp(p0, c0, t)
  const m1 = lerp(c0, c1, t)
  const m2 = lerp(c1, p3, t)
  const q0 = lerp(m0, m1, t)
  const q1 = lerp(m1, m2, t)
  const s = lerp(q0, q1, t)
  return { aOut: m0, midIn: q0, mid: s, midOut: q1, bIn: m2 }
}

// Mirror a handle across its anchor (for smooth anchors: hIn = 2*anchor - hOut).
const mirror = (anchor, h) => ({ x: 2 * anchor.x - h.x, z: 2 * anchor.z - h.z })

export default function BezierPen({ cameraRef, active, path, onChange, snapTargets, snapDist = 40, selected, onSelect }) {
  const svgRef = useRef(null)
  const [viewBox, setViewBox] = useState('0 0 1 1')
  const [scale, setScale] = useState(1)          // world units per pixel-ish → sizes handles
  const spaceDown = useCartographStore(s => s.spaceDown)

  // Drag state (refs so window handlers see live values without re-subscribing).
  const drag = useRef(null)   // { kind:'anchor'|'handle'|'new', index, side?, moved, downP }
  const lastClick = useRef({ time: 0, index: -1 })
  const pathRef = useRef(path)
  pathRef.current = path
  const activeRef = useRef(active)
  activeRef.current = active
  // Latest selected/spaceDown, readable inside the stable window handlers by ref.
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const spaceDownRef = useRef(spaceDown)
  spaceDownRef.current = spaceDown
  // Every mutation updates the ref SYNCHRONOUSLY before bubbling to the parent —
  // so a drag that fires immediately after an add/insert (handle-pull, drag-after-
  // insert) reads the fresh path, not the pre-render stale one. The parent's state
  // flows back via props and re-syncs pathRef on the next render (idempotent).
  const commit = (next) => { pathRef.current = next; onChange(next) }

  function computeVB() {
    const cam = cameraRef.current
    if (!cam || !svgRef.current) return null
    const halfW = (cam.right - cam.left) / (2 * cam.zoom)
    const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
    return { x: cam.position.x - halfW, z: cam.position.z - halfH, w: halfW * 2, h: halfH * 2 }
  }

  // Follow the camera — RAF poll (matches MarkerOverlay).
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

  // Snap a point to the nearest junction within snapDist — placement assist only;
  // caller freezes the RESULT as a plain coord (never a node reference).
  function snap(p) {
    if (!snapTargets?.length) return p
    let best = null, bd = snapDist
    for (const t of snapTargets) {
      const d = Math.hypot(t.x - p.x, t.z - p.z)
      if (d < bd) { bd = d; best = t }
    }
    return best ? { x: r2(best.x), z: r2(best.z) } : p
  }

  useEffect(() => {
    if (!active) { drag.current = null; return }

    const inCanvas = (e) => {
      const rect = svgRef.current?.getBoundingClientRect()
      return rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    }
    // World-unit hit tolerance ~ a comfortable finger, zoom-independent.
    const tol = () => { const vb = computeVB(); return vb ? Math.max(vb.w / 90, 6) : 12 }

    function onDown(e) {
      if (!activeRef.current || spaceDownRef.current || e.button !== 0) return
      if (!inCanvas(e)) return
      // The SVG spans the whole canvas-wrap (incl. behind the side panel / toolbar),
      // and this is a window listener — so a click on any UI chrome would otherwise
      // drop a stray anchor. Bail when the click lands on interactive UI.
      if (e.target?.closest?.('.carto-panel, .carto-toolbar, .carto-fab, .carto-looks-popup, .carto-extent-combo, button, input, textarea, select, a')) return
      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return
      const P = pathRef.current || { closed: false, anchors: [] }
      const A = P.anchors
      const T = tol()

      // 1) A selected anchor's handle? (highest priority — handles sit on top)
      if (selectedRef.current != null && A[selectedRef.current]) {
        const sa = A[selectedRef.current]
        for (const side of ['hOut', 'hIn']) {
          if (sa[side] && dist(sa[side], p) <= T) {
            e.preventDefault()
            drag.current = { kind: 'handle', index: selectedRef.current, side, moved: false }
            return
          }
        }
      }

      // 2) An anchor?
      let hit = -1, hd = T
      for (let i = 0; i < A.length; i++) { const d = dist(A[i], p); if (d <= hd) { hd = d; hit = i } }
      if (hit >= 0) {
        e.preventDefault()
        // ⌥-click → delete (⌃ is taken + is OS right-click on mac).
        if (e.altKey) { deleteAnchor(hit); return }
        // Double-click → toggle corner/smooth.
        const now = e.timeStamp || Date.now()
        if (lastClick.current.index === hit && now - lastClick.current.time < 320) {
          toggleType(hit); lastClick.current = { time: 0, index: -1 }; onSelect?.(hit); return
        }
        lastClick.current = { time: now, index: hit }
        // Click near the FIRST anchor of an open path (≥3 anchors) → close it.
        if (!P.closed && hit === 0 && A.length >= 3) { commit({ ...P, closed: true }); onSelect?.(0); return }
        onSelect?.(hit)
        drag.current = { kind: 'anchor', index: hit, moved: false, downP: p }
        return
      }

      // 3) On a segment? → insert an anchor (split preserves the curve).
      if (A.length >= 2) {
        const segCount = P.closed ? A.length : A.length - 1
        let bestSeg = -1, bestT = 0, bestD = T
        for (let i = 0; i < segCount; i++) {
          const { d, t } = nearestOnSeg(A[i], A[(i + 1) % A.length], p)
          if (d < bestD) { bestD = d; bestSeg = i; bestT = t }
        }
        if (bestSeg >= 0) {
          e.preventDefault()
          const idx = insertAnchor(bestSeg, bestT)
          onSelect?.(idx)
          drag.current = { kind: 'anchor', index: idx, moved: false, downP: p }
          return
        }
      }

      // 4) Empty space → drop a new corner anchor (snap-on-placement, frozen).
      if (P.closed) return   // a closed path is edited, not extended
      e.preventDefault()
      const sp = snap(p)
      const anchors = [...A, { x: sp.x, z: sp.z, type: 'corner' }]
      const newIdx = anchors.length - 1
      commit({ ...P, anchors })
      onSelect?.(newIdx)
      // Arm handle-pull: dragging now bends this fresh anchor into a smooth one.
      drag.current = { kind: 'new', index: newIdx, moved: false, downP: sp }
    }

    function onMove(e) {
      const dr = drag.current
      if (!dr) return
      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return
      const P = pathRef.current
      const A = [...P.anchors]
      dr.moved = dr.moved || dist(p, dr.downP || p) > tol() * 0.4

      if (dr.kind === 'anchor') {
        const a = A[dr.index]
        const dx = p.x - a.x, dz = p.z - a.z
        const na = { ...a, x: p.x, z: p.z }
        if (a.hIn) na.hIn = { x: a.hIn.x + dx, z: a.hIn.z + dz }
        if (a.hOut) na.hOut = { x: a.hOut.x + dx, z: a.hOut.z + dz }
        A[dr.index] = na
        commit({ ...P, anchors: A })
      } else if (dr.kind === 'handle') {
        const a = A[dr.index]
        const na = { ...a, [dr.side]: { x: p.x, z: p.z } }
        if (a.type === 'smooth') {
          const other = dr.side === 'hOut' ? 'hIn' : 'hOut'
          na[other] = mirror(a, { x: p.x, z: p.z })
        }
        A[dr.index] = na
        commit({ ...P, anchors: A })
      } else if (dr.kind === 'new') {
        // Pull handles out of the fresh anchor → smooth. hOut follows the cursor,
        // hIn mirrors. Only once dragged past the click threshold.
        if (!dr.moved) return
        const a = A[dr.index]
        const hOut = { x: p.x, z: p.z }
        A[dr.index] = { ...a, type: 'smooth', hOut, hIn: mirror(a, hOut) }
        commit({ ...P, anchors: A })
      }
    }

    function onUp() {
      const dr = drag.current
      drag.current = null
      if (!dr) return
      // Re-apply snap on an anchor MOVE drop (crisp near a junction, else free),
      // re-freezing to a plain coord. A fresh 'new' anchor already snapped on place.
      if (dr.kind === 'anchor' && dr.moved) {
        const P = pathRef.current
        const A = [...P.anchors]
        const a = A[dr.index]
        const sp = snap({ x: a.x, z: a.z })
        if (sp.x !== a.x || sp.z !== a.z) {
          const dx = sp.x - a.x, dz = sp.z - a.z
          const na = { ...a, x: sp.x, z: sp.z }
          if (a.hIn) na.hIn = { x: a.hIn.x + dx, z: a.hIn.z + dz }
          if (a.hOut) na.hOut = { x: a.hOut.x + dx, z: a.hOut.z + dz }
          A[dr.index] = na
          commit({ ...P, anchors: A })
        }
      }
    }

    function onKey(e) {
      if (!activeRef.current) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current != null) {
        // Don't steal the key from a focused input (name/blurb fields).
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        deleteAnchor(selectedRef.current)
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

  // ── path mutations (called from handlers) ─────────────────────────────────
  function deleteAnchor(i) {
    const P = pathRef.current
    const A = P.anchors.filter((_, k) => k !== i)
    // <3 anchors can't stay closed.
    const closed = A.length >= 3 ? P.closed : false
    commit({ ...P, anchors: A, closed })
    onSelect?.(A.length ? Math.max(0, i - 1) : null)
  }
  function toggleType(i) {
    const P = pathRef.current
    const A = [...P.anchors]
    const a = A[i]
    if (a.type === 'smooth') {
      A[i] = { x: a.x, z: a.z, type: 'corner' }   // drop handles
    } else {
      // Synthesize mirrored handles from the neighbor direction (¼ of the span).
      const n = A.length
      const prev = A[(i - 1 + n) % n], next = A[(i + 1) % n]
      const tx = (next.x - prev.x), tz = (next.z - prev.z)
      const L = Math.hypot(tx, tz) || 1
      const s = Math.min(L * 0.25, dist(prev, a), dist(next, a)) || 30
      const hOut = { x: r2(a.x + (tx / L) * s), z: r2(a.z + (tz / L) * s) }
      A[i] = { x: a.x, z: a.z, type: 'smooth', hOut, hIn: mirror(a, hOut) }
    }
    commit({ ...P, anchors: A })
  }
  function insertAnchor(segIdx, t) {
    const P = pathRef.current
    const A = [...P.anchors]
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
    commit({ ...P, anchors: A })
    return segIdx + 1
  }

  const A = path?.anchors || []
  // The path stroke is ALWAYS drawn when a path exists (so a reopened / committed
  // hood shows its boundary); the editing affordances (anchors + handles) only show
  // while the pen is active. Nothing at all to show → don't mount the SVG.
  if (!active && A.length === 0) return null
  const d = pathToD(path)
  // Handle/anchor sizes in world units, ~constant on screen via `scale`.
  const aR = Math.max(scale * 5, 3)
  const hR = Math.max(scale * 3.5, 2)
  const sw = Math.max(scale * 1.6, 0.6)
  const sel = active && selected != null ? A[selected] : null

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6, cursor: active ? 'crosshair' : 'default' }}
    >
      {/* the path — dark halo + cyan stroke so it reads over the busy aerial */}
      {d && <path d={d} fill="none" stroke="#08110d" strokeWidth={sw * 3.2} strokeLinejoin="round" strokeLinecap="round" />}
      {d && <path d={d} fill="none" stroke="#38e1ff" strokeWidth={sw * 1.7} strokeLinejoin="round" strokeLinecap="round" />}

      {active && <>
        {/* selected anchor's handles */}
        {sel && ['hIn', 'hOut'].map(side => sel[side] && (
          <g key={side}>
            <line x1={sel.x} y1={sel.z} x2={sel[side].x} y2={sel[side].z} stroke="#7ad9ff" strokeWidth={sw} />
            <circle cx={sel[side].x} cy={sel[side].z} r={hR} fill="#7ad9ff" stroke="#08110d" strokeWidth={sw * 0.5} />
          </g>
        ))}

        {/* anchors — corner = square, smooth = circle; selected = filled cyan */}
        {A.map((a, i) => {
          const isSel = i === selected
          const fill = isSel ? '#38e1ff' : '#ffffff'
          return a.type === 'smooth' ? (
            <circle key={i} cx={a.x} cy={a.z} r={aR} fill={fill} stroke="#08110d" strokeWidth={sw} />
          ) : (
            <rect key={i} x={a.x - aR} y={a.z - aR} width={aR * 2} height={aR * 2} fill={fill} stroke="#08110d" strokeWidth={sw} />
          )
        })}
      </>}
    </svg>
  )
}
