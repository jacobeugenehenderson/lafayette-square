/**
 * CircleHandle — the boundary CIRCLE as an in-scene draggable handle.
 *
 * The circle IS the slab disc; the operator must SEE it and pull it out for
 * comfortable padding around the hood (`HANDOFF-extent-pen-boundary.md` — required,
 * not incidental; standing preference `feedback_illustrator_handles_for_spatial_
 * authoring`). Auto-radius is only the starting fit; this knob is how you enlarge it.
 *
 * An SVG overlay in the MarkerOverlay pattern (viewBox = camera frustum, pointer-
 * events:none, window-level handlers) — so it never blocks wheel-zoom or the pen.
 * A knob sits on the east rim; dragging it sets radius = |world - center|. Disabled
 * while the pen or building-curation owns the click, so overlays never conflict.
 */
import { useRef, useEffect, useState } from 'react'

export default function CircleHandle({ cameraRef, center, radiusM, onChange, disabled }) {
  const svgRef = useRef(null)
  const [viewBox, setViewBox] = useState('0 0 1 1')
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const centerRef = useRef(center)
  centerRef.current = center

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
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.w,
      z: vb.z + ((clientY - rect.top) / rect.height) * vb.h,
    }
  }

  // ── The drag lives on the KNOB, not on the window ───────────────────────────
  //
  // It used to be a window-level pointerdown that grabbed whenever the press landed
  // within a ring-shaped tolerance of the rim. That could never work: MapControls is
  // bound to the CANVAS, which is inside window, so its handler runs during the
  // target/bubble phase and starts panning before a window listener is even called.
  // Pressing the handle dragged the whole map.
  //
  // Now the knob is a real hit target — the only part of this overlay that takes
  // pointer events — and it stops propagation and captures the pointer. The event
  // never reaches MapControls, so panning keeps working everywhere else, including
  // immediately beside the circle. No modes, no dead zone around the rim, and the
  // cursor can live on the element itself where CSS can actually apply it.
  function onKnobDown(e) {
    if (disabled || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older engines */ }
    setDragging(true)
  }
  function onKnobMove(e) {
    if (!dragging) return
    e.stopPropagation()
    const c = centerRef.current
    const p = screenToWorld(e.clientX, e.clientY)
    if (!c || !p) return
    const r = Math.round(Math.hypot(p.x - c.x, p.z - c.z))
    if (r > 20) onChange(r)
  }
  function onKnobUp(e) {
    if (!dragging) return
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    setDragging(false)
  }

  if (!center || !(radiusM > 0)) return null
  const knobR = Math.max(scale * 6, 4)
  const sw = Math.max(scale * 1.6, 0.6)
  // knob on the east rim
  const kx = center.x + radiusM, kz = center.z
  return (
    <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
      {!disabled && (
        <g pointerEvents="auto" style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onKnobDown} onPointerMove={onKnobMove}
          onPointerUp={onKnobUp} onLostPointerCapture={onKnobUp}>
          {/* Invisible, generously-sized hit target — the visible dot stays small so
              it doesn't obscure the map, but a 4 px dot is not a grabbable thing. */}
          <circle cx={kx} cy={kz} r={knobR * 2.6} fill="transparent" />
          <circle cx={kx} cy={kz} r={knobR} fill="#ffd23f" stroke="#08110d" strokeWidth={sw}
            style={{ pointerEvents: 'none' }}>
            <title>Drag to set the boundary circle radius (padding around the hood)</title>
          </circle>
        </g>
      )}
    </svg>
  )
}
