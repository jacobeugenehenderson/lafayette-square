/**
 * VectorStreets — SVG ground map rendered via CSS3DRenderer
 *
 * ARCHITECTURE DECISION (documented after weeks of iteration):
 *
 * WebGL can only render triangles. There are three ways to display an SVG
 * in a WebGL/Three.js scene:
 *
 *  1. SVGLoader → ShapeGeometry/pointsToStroke  (tessellation)
 *     Converts Bezier curves to polylines, then to triangle meshes.
 *     Lossy: jagged strokes, corner gaps between adjacent polygons,
 *     earcut triangulation artifacts on complex shapes.
 *
 *  2. SVG → Canvas2D → CanvasTexture  (rasterization)
 *     Browser renders SVG to a bitmap, applied as a texture.
 *     Resolution-limited: pixelated at street-level zoom.
 *     8192px over 1309m = 6.25 px/m — blurry up close.
 *
 *  3. CSS3D: actual SVG element positioned via CSS 3D transforms  ✅
 *     Browser's native SVG renderer draws the SVG in the DOM.
 *     Resolution-independent: perfect Bezier curves, joins, caps,
 *     anti-aliasing, gradients, masks, and transparency at ANY zoom.
 *     The SVG is rendered behind the transparent WebGL canvas.
 *     3D objects (buildings, trees) appear on top via normal WebGL.
 *
 * We use approach 3 via Three.js's CSS3DRenderer. The SVG file is the
 * single source of truth — swap it in public/ to change the map artwork
 * (supports guest artists). Full SVG feature set is available: clipping
 * masks, rounded corners, gradients, blend modes, CSS animations, etc.
 *
 * IMPORTANT: The SVG is embedded as an inline <svg> element (not <img>).
 * <img> rasterizes the SVG at its CSS pixel dimensions, then CSS3D scales
 * that raster — pixelated on zoom. Inline <svg> re-renders vectors at
 * the actual display resolution on every paint — crisp at any zoom level.
 *
 * CSS3DRenderer maps 1 CSS pixel = 1 Three.js unit, so the SVG's viewBox
 * dimensions (1309 × 1152.7) correspond directly to meters in world space.
 *
 * Trade-off: CSS3D elements can't receive WebGL shadows. A separate
 * ShadowMaterial plane catches building/tree shadows on top of the SVG.
 */

import { useRef, useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import useCamera from '../hooks/useCamera'

// SVG served from public/ — swap the file to change the map artwork
const svgUrl = `${import.meta.env.BASE_URL}lafayette-square.svg`

// ── SVG coordinate mapping ──────────────────────────────────────────────────
// SVG viewBox: 0 0 1309 1152.7
// SVG origin (0,0) = world (-497.7, -732.5), 1 SVG unit ≈ 1 meter
const SVG_WORLD_X = -497.7
const SVG_WORLD_Z = -732.5
const SVG_WIDTH = 1309
const SVG_HEIGHT = 1152.7
const PLANE_CX = SVG_WORLD_X + SVG_WIDTH / 2   // ≈ 156.8
const PLANE_CZ = SVG_WORLD_Z + SVG_HEIGHT / 2  // ≈ -156.15

// Raster oversampling: CSS 3D transforms cause the browser to rasterize SVG
// elements at their CSS pixel dimensions before compositing on the GPU.
// Setting the SVG 4× larger gives 4× rasterization resolution (~4 px/m).
// The CSS3DObject scale compensates so it appears at the correct world size.
const RASTER_SCALE = 4

function VectorStreets({ svgPortal }) {
  const { camera, size } = useThree()
  const css3d = useRef({ renderer: null, scene: null })
  const alive = useRef(true)

  // ── Initialize CSS3DRenderer ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgPortal) return
    alive.current = true

    const renderer = new CSS3DRenderer({ element: svgPortal })
    renderer.setSize(size.width, size.height)
    const scene = new THREE.Scene()
    css3d.current = { renderer, scene }

    // Fetch SVG and embed as inline <svg> for resolution-independent rendering.
    // <img> rasterizes at CSS pixel dimensions and becomes pixelated on zoom.
    // Inline <svg> re-renders vectors at display resolution — crisp at any zoom.
    fetch(svgUrl, { cache: 'reload' })
      .then(r => r.text())
      .then(svgText => {
        if (!alive.current) return

        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
        const svg = doc.documentElement

        // Rasterize SVG at RASTER_SCALE× resolution, then scale the CSS3DObject
        // down to the correct world size. This gives crisp rendering at zoom.
        svg.setAttribute('width', SVG_WIDTH * RASTER_SCALE)
        svg.setAttribute('height', SVG_HEIGHT * RASTER_SCALE)
        svg.style.display = 'block'
        svg.style.overflow = 'visible'

        const obj = new CSS3DObject(svg)
        obj.position.set(PLANE_CX, 0, PLANE_CZ)
        obj.rotation.set(-Math.PI / 2, 0, 0)
        obj.scale.set(1 / RASTER_SCALE, 1 / RASTER_SCALE, 1)
        scene.add(obj)
      })

    return () => {
      alive.current = false
      while (svgPortal.firstChild) svgPortal.removeChild(svgPortal.firstChild)
      css3d.current = { renderer: null, scene: null }
    }
  }, [svgPortal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync CSS3D each frame ─────────────────────────────────────────────────
  useFrame(() => {
    const { renderer, scene } = css3d.current
    if (!renderer || !scene) return
    renderer.setSize(size.width, size.height)
    renderer.render(scene, camera)
  })

  // Opaque ground plane — renders in the opaque pass (before transparent materials),
  // writes to the depth buffer, and outputs (0,0,0,0). This prevents the sky dome /
  // stars from bleeding through the transparent canvas where the SVG ground should be.
  // Without this, the ShadowMaterial (transparent) blends on top of already-rendered
  // sky pixels and can't erase them — stars show through the ground.
  const clearMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); }`,
    depthWrite: true,
  }), [])

  return (
    <group>
      {/* Ground eraser — opaque pass, clears sky/star pixels to transparent */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={clearMat}>
        <circleGeometry args={[2000, 64]} />
      </mesh>

      {/* Shadow-catcher — transparent pass, darkens SVG where shadows fall */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        receiveShadow
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (useCamera.getState().viewMode === 'browse') {
            const p = e.point
            useCamera.getState().enterPlanetarium(p.x, p.z)
          }
        }}
      >
        <circleGeometry args={[2000, 64]} />
        <shadowMaterial opacity={0.4} />
      </mesh>
    </group>
  )
}

export default VectorStreets
