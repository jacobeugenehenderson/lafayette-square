/**
 * CenterHandle — the disc CENTROID as an in-scene draggable dot.
 *
 * R10's two centers, made a handle: the bb / frame origin is frozen (it never
 * moves — that would reproject everything and re-order identity, the content
 * death). The disc centroid is a SEPARATE value the operator drags to re-migrate
 * the hood center within the fetched square, no re-pour. See EXTENT-DESIGN §3.3.
 *
 * Same SVG-overlay/window-tracked pattern as CircleHandle (viewBox = camera
 * frustum, pointer-events only on the knob) so it never blocks pan/zoom. The knob
 * sits AT the center; dragging sets center = world point, clamped to `bounds`
 * (the fetched square — you can't drag the hood off its own data).
 */
import { useRef, useEffect, useState } from 'react'

export default function CenterHandle({ cameraRef, center, bounds, onChange, disabled }) {
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

  function onKnobDown(e) {
    if (disabled || e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older engines */ }
    setDragging(true)
  }
  function onKnobMove(e) {
    if (!dragging) return
    e.stopPropagation()
    const p = screenToWorld(e.clientX, e.clientY)
    if (!p) return
    let { x, z } = p
    if (bounds) {
      x = Math.min(bounds.x1, Math.max(bounds.x0, x))
      z = Math.min(bounds.z1, Math.max(bounds.z0, z))
    }
    onChange(Math.round(x), Math.round(z))
  }
  function onKnobUp(e) {
    if (!dragging) return
    e.stopPropagation()
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    setDragging(false)
  }

  if (!center) return null
  const knobR = Math.max(scale * 6, 4)
  const sw = Math.max(scale * 1.6, 0.6)
  const kx = center.x, kz = center.z
  const cross = knobR * 2.2
  return (
    <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
      {!disabled && (
        <g pointerEvents="auto" style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onKnobDown} onPointerMove={onKnobMove}
          onPointerUp={onKnobUp} onLostPointerCapture={onKnobUp}>
          {/* generous invisible hit target */}
          <circle cx={kx} cy={kz} r={knobR * 2.8} fill="transparent" />
          {/* crosshair so the center reads as a MOVE handle, distinct from the rim knob */}
          <line x1={kx - cross} y1={kz} x2={kx + cross} y2={kz} stroke="#ff5da2" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          <line x1={kx} y1={kz - cross} x2={kx} y2={kz + cross} stroke="#ff5da2" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          <circle cx={kx} cy={kz} r={knobR} fill="#ff5da2" stroke="#08110d" strokeWidth={sw} style={{ pointerEvents: 'none' }}>
            <title>Drag to move the neighborhood center (within the fetched square — the frame never moves)</title>
          </circle>
        </g>
      )}
    </svg>
  )
}
