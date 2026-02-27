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
import useSkyState from '../hooks/useSkyState'
import lampData from '../data/street_lamps.json'

// SVG served from public/ — swap the file to change the map artwork
const svgUrl = `${import.meta.env.BASE_URL}lafayette-square.svg`

// ── SVG coordinate mapping ──────────────────────────────────────────────────
// SVG viewBox origin (0,0) maps to world (-843.2, -1156.1), 1 SVG unit ≈ 1 meter.
// Content bounds and center are computed dynamically after stripping the
// #horizon circle from the fetched SVG (see fetch callback).
const SVG_WORLD_X = -843.2
const SVG_WORLD_Z = -1156.1

// ── GPU compositing pixel budget ────────────────────────────────────────────
// CSS 3D transforms force the browser to rasterize the SVG element into a GPU
// texture at (CSS width × height × devicePixelRatio²) pixels. We want the
// highest RASTER_SCALE (up to 4) that fits within a safe pixel budget.
// Mobile gets a tighter budget (80M → scale=2 ≈ 60M device px) because
// SidePanel backdrop-blur creates additional compositing layers during
// category clicks that compete for the same GPU memory.
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const MAX_GPU_PIXELS = IS_MOBILE ? 80_000_000 : 200_000_000
const DPR = Math.min(window.devicePixelRatio || 1, 3)

// Apply the same ACES filmic tone mapping + sRGB gamma that the WebGL canvas
// uses, so the portal background color matches the rendered sky exactly.
const EXPOSURE = 0.95
function acesToneMap(x) {
  x *= EXPOSURE
  return Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))
}
function linearToSRGB(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
function toHex(v) { return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0') }
function horizonToCSS(color) {
  const r = linearToSRGB(acesToneMap(color.r))
  const g = linearToSRGB(acesToneMap(color.g))
  const b = linearToSRGB(acesToneMap(color.b))
  return '#' + toHex(r) + toHex(g) + toHex(b)
}

// ── Bake neighborhood lamp lightmap for night overlay ─────────────────────
// Same Gaussian approach as park lightmap but covers ±500m for the full
// neighborhood. Lazy singleton — computed on first use, not at import.
let _neighborhoodLampMapCache = null
function getNeighborhoodLampMap() {
  if (_neighborhoodLampMapCache) return _neighborhoodLampMapCache
  const SIZE = 512
  const EXTENT = 500
  const SIGMA = 15
  const SIGMA2 = 2 * SIGMA * SIGMA
  const CUTOFF2 = (4 * SIGMA) * (4 * SIGMA)
  const data = new Float32Array(SIZE * SIZE)
  const lamps = lampData.lamps
  for (let j = 0; j < SIZE; j++) {
    const wz = (j / (SIZE - 1)) * 2 * EXTENT - EXTENT
    for (let i = 0; i < SIZE; i++) {
      const wx = (i / (SIZE - 1)) * 2 * EXTENT - EXTENT
      let acc = 0
      for (let l = 0; l < lamps.length; l++) {
        const dx = wx - lamps[l].x
        const dz = wz - lamps[l].z
        const dist2 = dx * dx + dz * dz
        if (dist2 > CUTOFF2) continue
        acc += Math.exp(-dist2 / SIGMA2)
      }
      data[j * SIZE + i] = Math.min(acc, 1.5)
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  _neighborhoodLampMapCache = tex
  return tex
}

function VectorStreets({ svgPortal }) {
  const { camera, size } = useThree()
  const css3d = useRef({ renderer: null, scene: null })
  const svgRef = useRef(null)
  const earthRef = useRef(null)
  const alive = useRef(true)
  // Store crop/scale info for progressive upgrade
  const svgMeta = useRef(null)
  const svgObjRef = useRef(null)

  // ── Initialize CSS3DRenderer ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgPortal) return
    alive.current = true

    const renderer = new CSS3DRenderer({ element: svgPortal })
    renderer.setSize(size.width, size.height)
    const scene = new THREE.Scene()
    css3d.current = { renderer, scene }

    // Fetch SVG and embed as inline <svg> for resolution-independent rendering.
    // The #horizon circle is stripped and replaced with a CSS radial-gradient
    // background — this shrinks the compositing layer so RASTER_SCALE=4 fits
    // within the mobile GPU's pixel budget.
    fetch(svgUrl, { cache: 'reload' })
      .then(r => r.text())
      .then(svgText => {
        if (!alive.current) return

        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
        const svg = doc.documentElement

        // ── Strip #horizon circle to shrink compositing layer ──────────────
        // The earth-horizon circle expanded the viewBox to 2000×2000. At
        // RASTER_SCALE=4 on a 3× DPR phone that's 576M device pixels — enough
        // to crash the GPU. Remove it and recreate the gradient as a CSS
        // background, which doesn't inflate the rasterization layer.
        const horizon = svg.querySelector('#horizon')
        if (horizon) horizon.remove()

        // ── Compute tight content bounds ───────────────────────────────────
        // getBBox() requires the SVG to be in the DOM.
        const probe = document.createElement('div')
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:2000px;height:2000px;overflow:hidden'
        document.body.appendChild(probe)
        probe.appendChild(svg)
        const bbox = svg.getBBox()
        svg.remove()
        probe.remove()

        // Pad to avoid clipping anti-aliased stroke edges
        const PAD = 20
        const cropX = Math.max(0, Math.floor(bbox.x - PAD))
        const cropY = Math.max(0, Math.floor(bbox.y - PAD))
        const cropW = Math.ceil(bbox.width + PAD * 2)
        const cropH = Math.ceil(bbox.height + PAD * 2)
        svg.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`)

        // ── Compute optimal RASTER_SCALE within GPU pixel budget ───────────
        const maxScale = Math.floor(Math.sqrt(MAX_GPU_PIXELS / (cropW * cropH * DPR * DPR)))
        const fullScale = Math.max(1, Math.min(4, maxScale))

        // On mobile, start at scale=1 (low GPU cost) and upgrade later
        // when the scene is stable. Desktop gets full scale immediately.
        const initialScale = IS_MOBILE ? 1 : fullScale

        svg.setAttribute('width', cropW * initialScale)
        svg.setAttribute('height', cropH * initialScale)
        svg.style.display = 'block'
        svg.style.overflow = 'visible'

        svgRef.current = svg
        svgMeta.current = { cropW, cropH, fullScale, currentScale: initialScale }

        // Position SVG CSS3DObject at the center of the cropped content area
        const centerX = SVG_WORLD_X + cropX + cropW / 2
        const centerZ = SVG_WORLD_Z + cropY + cropH / 2
        const obj = new CSS3DObject(svg)
        obj.position.set(centerX, 0, centerZ)
        obj.rotation.set(-Math.PI / 2, 0, 0)
        obj.scale.set(1 / initialScale, 1 / initialScale, 1)
        scene.add(obj)
        svgObjRef.current = obj

        // ── Earth gradient as a small CSS3DObject ────────────────────────
        // Recreate the removed #horizon disc as a CSS div, sized to tightly
        // surround the SVG content. Uses a small CSS element (low compositing
        // cost ~2.25M device px on 3× DPR) with CSS3D scale to reach the
        // target visual size. The disc must not extend far beyond the SVG
        // content bounds or it will poke above the horizon in hero view.
        const earthRadius = Math.max(cropW, cropH) * 0.75
        const earthCSS = 500 // CSS px — small for low compositing cost
        const earthScale = (earthRadius * 2) / earthCSS
        const earthDiv = document.createElement('div')
        earthDiv.style.width = earthCSS + 'px'
        earthDiv.style.height = earthCSS + 'px'
        earthDiv.style.borderRadius = '50%'
        earthDiv.style.background = 'radial-gradient(circle closest-side at center, ' +
          '#3a3226 30%, rgba(58,50,38,0.9) 70%, rgba(82,70,52,0.5) 90%, rgba(82,70,52,0) 100%)'
        earthRef.current = earthDiv
        const earthObj = new CSS3DObject(earthDiv)
        // Center on SVG content, slightly below ground plane
        earthObj.position.set(centerX, -0.1, centerZ)
        earthObj.rotation.set(-Math.PI / 2, 0, 0)
        earthObj.scale.set(earthScale, earthScale, 1)
        scene.add(earthObj)
      })
      .catch(err => {
        console.warn('[VectorStreets] SVG fetch failed:', err)
      })

    return () => {
      alive.current = false
      svgRef.current = null
      svgObjRef.current = null
      earthRef.current = null
      // Clear CSS3D scene objects so Three.js releases internal references
      while (scene.children.length) scene.remove(scene.children[0])
      while (svgPortal.firstChild) svgPortal.removeChild(svgPortal.firstChild)
      css3d.current = { renderer: null, scene: null }
    }
  }, [svgPortal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progressive SVG upgrade (mobile only) ─────────────────────────────────
  // Start at scale=1 (low GPU cost) in hero mode, then upgrade to full
  // resolution when the user enters browse/map/society for close-up sharpness.
  // A 300ms delay lets the camera transition settle before the GPU spike.
  useEffect(() => {
    if (!IS_MOBILE) return
    const unsub = useCamera.subscribe((state) => {
      const meta = svgMeta.current
      const svg = svgRef.current
      const obj = svgObjRef.current
      if (!meta || !svg || !obj) return
      if (meta.currentScale >= meta.fullScale) return
      if (state.viewMode !== 'hero') {
        // Wait until after the 1500ms camera transition settles before the
        // GPU-heavy SVG re-rasterization (can be 16× more pixels on 3× DPR).
        setTimeout(() => {
          if (!svgRef.current || !svgObjRef.current) return
          svg.setAttribute('width', meta.cropW * meta.fullScale)
          svg.setAttribute('height', meta.cropH * meta.fullScale)
          obj.scale.set(1 / meta.fullScale, 1 / meta.fullScale, 1)
          meta.currentScale = meta.fullScale
        }, 2000)
      }
    })
    return unsub
  }, [])

  // ── Sync CSS3D each frame ─────────────────────────────────────────────────
  useFrame(() => {
    const { renderer, scene } = css3d.current
    if (!renderer || !scene) return
    renderer.setSize(size.width, size.height)
    renderer.render(scene, camera)

    // Match portal background to the sky horizon color, tone-mapped to match
    // the WebGL rendering pipeline (ACES filmic + sRGB gamma).
    if (svgPortal) {
      svgPortal.style.backgroundColor = horizonToCSS(useSkyState.getState().horizonColor)
    }

    // ── Time-of-day CSS filter on SVG ground map ──────────────────────────
    if (svgRef.current) {
      const sky = useSkyState.getState()
      const sunElev = sky.sunElevation
      // Day factor: 0 = deep night (sun < -0.3), 1 = full day (sun > 0.15)
      const raw = Math.max(0, Math.min(1, (sunElev + 0.3) / 0.45))
      const day = raw * raw * (3 - 2 * raw)
      const night = 1 - day

      const brightness = 0.12 + 0.88 * day
      const saturate = 0.30 + 0.70 * day

      // Night blue tint: sepia strips color → hue-rotate shifts to blue
      const nightBlue = Math.max(0, night - 0.2) * 1.25
      const nightSepia = nightBlue * 0.5
      const nightHue = nightBlue * 200

      // Golden hour warmth
      const goldenRaw = Math.max(0, 1 - Math.abs(sunElev - 0.05) / 0.12)
      const golden = goldenRaw * Math.max(0, Math.min(1, (sunElev + 0.1) * 5))
      const goldenSepia = golden * 0.25

      const sepia = Math.max(nightSepia, goldenSepia)
      const hue = nightSepia > goldenSepia ? nightHue : 0

      // Contrast reduction at night crushes the bright sidewalks/strokes
      // (#ccc, #d8d3c7) without darkening the overall scene further.
      const contrast = 0.65 + 0.35 * day

      svgRef.current.style.filter =
        `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg)`

      // ── Earth disc: time-aware gradient ──────────────────────────────────
      // Darkish warm gray during day → near-black at night.
      // Direct color control (not CSS filter) for predictable appearance.
      if (earthRef.current) {
        const mix = (a, b, t) => Math.round(a + (b - a) * t)
        // Center (30% stop): warm brown-gray
        const cr = mix(8, 58, day), cg = mix(7, 50, day), cb = mix(2, 38, day)
        // Edge (90–100% stops): slightly warmer before fading to transparent
        const er = mix(14, 82, day), eg = mix(12, 70, day), eb = mix(4, 52, day)
        earthRef.current.style.background =
          `radial-gradient(circle closest-side at center, ` +
          `rgb(${cr},${cg},${cb}) 30%, rgba(${cr},${cg},${cb},0.9) 70%, ` +
          `rgba(${er},${eg},${eb},0.5) 90%, rgba(${er},${eg},${eb},0) 100%)`
      }
    }
  })

  // Opaque ground plane — renders in the opaque pass (before transparent materials),
  // writes to the depth buffer, and outputs (0,0,0,0). This prevents the sky dome /
  // stars from bleeding through the transparent canvas where the SVG ground should be.
  // Without this, the ShadowMaterial (transparent) blends on top of already-rendered
  // sky pixels and can't erase them — stars show through the ground.
  // Stencil-based ground mask: marks the ground area in the stencil buffer so
  // sky/stars don't render there (canvas stays transparent → SVG shows through).
  // Does NOT write depth — this lets the Gateway Arch legs render freely without
  // being blocked by the ground plane's depth.
  // ── Night lamp glow overlay ────────────────────────────────────────────────
  // WebGL mesh on top of the shadow catcher that adds warm glow pools near
  // park lamps at night. CSS filter darkens the SVG overall; this adds back
  // warm light where lamps are. Invisible during the day.
  const nightOverlayMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uLampMap: { value: getNeighborhoodLampMap() },
      uLampOn: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uLampMap;
      uniform float uLampOn;
      varying vec3 vWorldPos;
      void main() {
        vec2 uv = (vWorldPos.xz + 500.0) / 1000.0;
        float lampI = texture2D(uLampMap, uv).r;
        float glow = lampI * uLampOn;
        // Warm amber — matches StreetLights LAMP_COLOR_ON (#ffd9b0)
        vec3 warmColor = vec3(0.35, 0.25, 0.10);
        gl_FragColor = vec4(warmColor * glow, glow * 0.5);
      }
    `,
  }), [])

  // Drive the overlay's lampOn uniform from the same ramp as StreetLights
  useFrame(() => {
    const sunElev = useSkyState.getState().sunElevation
    const lampOn = Math.max(0, Math.min(1, (0.15 - sunElev) / 0.45))
    nightOverlayMat.uniforms.uLampOn.value = lampOn
  })

  const clearMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); }`,
      depthWrite: false,
    })
    mat.stencilWrite = true
    mat.stencilRef = 1
    mat.stencilFunc = THREE.AlwaysStencilFunc
    mat.stencilZPass = THREE.ReplaceStencilOp
    mat.stencilFail = THREE.KeepStencilOp
    mat.stencilZFail = THREE.KeepStencilOp
    return mat
  }, [])

  return (
    <group>
      {/* Ground eraser — opaque pass, clears sky/star pixels to transparent */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={clearMat}>
        <circleGeometry args={[8000, 64]} />
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
        <circleGeometry args={[8000, 64]} />
        <shadowMaterial opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Night lamp glow overlay — warm pools near park lamps on the ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        material={nightOverlayMat}
        renderOrder={2}
      >
        <circleGeometry args={[500, 64]} />
      </mesh>
    </group>
  )
}

export default VectorStreets
