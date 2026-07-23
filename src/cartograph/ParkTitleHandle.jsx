/**
 * ParkTitleHandle — an in-scene draggable dot to MOVE the park title on the 2D
 * Designer map. Same SVG-overlay pattern as CircleHandle: viewBox = the ortho
 * camera frustum, pointer-events only on the knob (so it never blocks pan/zoom),
 * window-tracked. Dragging sets the title's world position; the store persists +
 * bakes it, so the move ships (standing preference:
 * feedback_illustrator_handles_for_spatial_authoring).
 */
import { useRef, useEffect, useState } from 'react'

export default function ParkTitleHandle({ cameraRef, pos, onChange, disabled }) {
  const svgRef = useRef(null)
  const [viewBox, setViewBox] = useState('0 0 1 1')
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)

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

  function onDown(e) {
    if (disabled || e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older engines */ }
    setDragging(true)
  }
  function onMove(e) {
    if (!dragging) return
    e.stopPropagation()
    const p = screenToWorld(e.clientX, e.clientY)
    if (p) onChange([p.x, p.z])
  }
  function onUp(e) {
    if (!dragging) return
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    setDragging(false)
  }

  if (!pos) return null
  const knobR = Math.max(scale * 6, 4)
  const sw = Math.max(scale * 1.6, 0.6)
  return (
    <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
      {!disabled && (
        <g pointerEvents="auto" style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={onUp} onLostPointerCapture={onUp}>
          {/* Invisible generous hit target; small visible dot so it doesn't obscure the map. */}
          <circle cx={pos[0]} cy={pos[1]} r={knobR * 2.6} fill="transparent" />
          <circle cx={pos[0]} cy={pos[1]} r={knobR} fill="#ffd23f" stroke="#08110d" strokeWidth={sw}
            style={{ pointerEvents: 'none' }}>
            <title>Drag to move the park title</title>
          </circle>
        </g>
      )}
    </svg>
  )
}
