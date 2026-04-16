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
  const spaceDown = useCartographStore(s => s.spaceDown)
  const markerStrokes = useCartographStore(s => s.markerStrokes)
  const addMarkerStroke = useCartographStore(s => s.addMarkerStroke)

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
  }, [addMarkerStroke])

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
