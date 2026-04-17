import { useRef, useEffect, useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'

export default function MarkerOverlay({ cameraRef }) {
  const drawingRef = useRef(false)
  const currentStroke = useRef([])
  const svgRef = useRef(null)
  const livePathRef = useRef(null)
  const [viewBox, setViewBox] = useState('0 0 1 1')
  const [strokeW, setStrokeW] = useState('1')

  const markerActive = useCartographStore(s => s.markerActive)
  const eraserActive = useCartographStore(s => s.markerEraserActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const markerStrokes = useCartographStore(s => s.markerStrokes)
  const addMarkerStroke = useCartographStore(s => s.addMarkerStroke)
  const deleteMarkerStroke = useCartographStore(s => s.deleteMarkerStroke)

  const active = markerActive

  // Compute camera frustum → SVG viewBox
  function computeViewBox() {
    const cam = cameraRef.current
    if (!cam || !svgRef.current) return null
    const halfW = (cam.right - cam.left) / (2 * cam.zoom)
    const halfH = (cam.top - cam.bottom) / (2 * cam.zoom)
    const cx = cam.position.x
    const cz = cam.position.z
    return { x: cx - halfW, z: cz - halfH, w: halfW * 2, h: halfH * 2 }
  }

  // Track camera movement — update viewBox via RAF polling
  useEffect(() => {
    let rafId
    let lastX = 0, lastZ = 0, lastZoom = 0
    const sync = () => {
      const cam = cameraRef.current
      if (cam && (cam.position.x !== lastX || cam.position.z !== lastZ || cam.zoom !== lastZoom)) {
        lastX = cam.position.x; lastZ = cam.position.z; lastZoom = cam.zoom
        const vb = computeViewBox()
        if (vb) {
          setViewBox(`${vb.x} ${vb.z} ${vb.w} ${vb.h}`)
          setStrokeW((vb.w / 300).toFixed(2))
        }
      }
      rafId = requestAnimationFrame(sync)
    }
    rafId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(rafId)
  }, [cameraRef])

  function screenToWorld(clientX, clientY) {
    const vb = computeViewBox()
    if (!vb || !svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width < 1) return null
    const fracX = (clientX - rect.left) / rect.width
    const fracY = (clientY - rect.top) / rect.height
    return {
      x: Math.round((vb.x + fracX * vb.w) * 100) / 100,
      z: Math.round((vb.z + fracY * vb.h) * 100) / 100,
    }
  }

  function strokeToD(pts) {
    if (pts.length < 2) return ''
    return 'M' + pts.map(p => p.x.toFixed(1) + ',' + p.z.toFixed(1)).join('L')
  }

  function pointSegDist2(p, a, b) {
    const abx = b.x - a.x, abz = b.z - a.z
    const len2 = abx * abx + abz * abz
    if (len2 < 1e-6) {
      const dx = p.x - a.x, dz = p.z - a.z
      return dx * dx + dz * dz
    }
    let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2
    t = Math.max(0, Math.min(1, t))
    const cx = a.x + t * abx, cz = a.z + t * abz
    const dx = p.x - cx, dz = p.z - cz
    return dx * dx + dz * dz
  }

  function hitTestStroke(worldP) {
    // Find the stroke whose nearest segment is within tolerance of worldP.
    // Tolerance scales with view: current stroke width (world units) × a fudge.
    const vb = computeViewBox()
    if (!vb) return -1
    const tol = Math.max(parseFloat(strokeW) * 2.5, vb.w / 120)
    const tol2 = tol * tol
    const strokes = useCartographStore.getState().markerStrokes
    let bestIdx = -1, bestD2 = Infinity
    for (let i = 0; i < strokes.length; i++) {
      const pts = strokes[i]
      for (let j = 0; j < pts.length - 1; j++) {
        const d2 = pointSegDist2(worldP, pts[j], pts[j + 1])
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i }
      }
      if (pts.length === 1) {
        const d2 = (worldP.x - pts[0].x) ** 2 + (worldP.z - pts[0].z) ** 2
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i }
      }
    }
    return bestD2 <= tol2 ? bestIdx : -1
  }

  // Window-level pointer handlers — SVG stays pointer-events:none so
  // wheel events always reach the Three.js canvas for zoom
  useEffect(() => {
    function onDown(e) {
      if (!useCartographStore.getState().markerActive) return
      if (useCartographStore.getState().spaceDown) return
      if (e.button !== 0) return
      // Only capture clicks on the canvas area, not the panel
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) return

      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return

      // Eraser mode: click a stroke to delete it
      if (useCartographStore.getState().markerEraserActive) {
        const idx = hitTestStroke(p)
        if (idx >= 0) {
          e.preventDefault()
          deleteMarkerStroke(idx)
        }
        return
      }

      e.preventDefault()
      drawingRef.current = true
      currentStroke.current = [p]
      if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    }

    function onMove(e) {
      if (!drawingRef.current) return
      const p = screenToWorld(e.clientX, e.clientY)
      if (!p) return
      currentStroke.current.push(p)
      if (livePathRef.current) {
        livePathRef.current.setAttribute('d', strokeToD(currentStroke.current))
      }
    }

    function onUp() {
      if (!drawingRef.current) return
      drawingRef.current = false
      if (currentStroke.current.length > 1) {
        addMarkerStroke(currentStroke.current)
      }
      currentStroke.current = []
      if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [addMarkerStroke, deleteMarkerStroke])

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="none"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
        cursor: active ? 'crosshair' : 'default',
        zIndex: 5,
      }}
    >
      {active && markerStrokes.map((stroke, i) => (
        <path
          key={i}
          d={strokeToD(stroke)}
          fill="none"
          stroke="rgba(255,60,60,0.6)"
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <path
        ref={livePathRef}
        d=""
        fill="none"
        stroke="rgba(255,60,60,0.6)"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
