/**
 * <WindSheet extent="town" | {center:[x,z], radius}> — draws the town's wind field once per frame into the texture
 * every wind consumer reads (lib/windSheet.js holds the API, the uniforms and the why).
 *
 *   extent="town"          the scene's disc from the stencil (sceneStencilState). Until the ground publishes it the
 *                          sheet is UNALLOCATED and says so; ⛔ there is no default size (CLAUDE.md Layer 0, Class D).
 *   extent={center,radius} a NAMED specimen extent — the Grove / Salon / a diorama, which have no town.
 *   ⛔ No extent prop throws: a mount that does not say which world it covers is a bug, not a default.
 *   wind={speedMps, dirDeg, gustsMps}  a specimen's NAMED wind — required with a specimen extent (it has no weather),
 *                          and ⛔ refused with extent="town" (a town's wind is its weather, never a prop).
 *   wind="weather"         a specimen under the real weather (canary, diorama): the one cable, over its own extent.
 *
 * Each frame: the air (wind-field.js#windAt, in GLSL, driven by windStateOfWeather — the town's one weather) → a
 * damped spring per texel (the canopy's memory) → a half-float ping-pong pair. Consumers bind the read side.
 *
 * Debug: the tools column's Wind sheet card (WindSheetCard.jsx) shows the readout, and its "Show on map" lays the field
 * over the terrain (colour = strength, streaks travel with it). `window.__windSheet` reads texels back and evaluates the
 * CPU field at the same instant (the check uses it).
 * `__windSheet.probeAir(points)` draws the AIR alone (no spring) into a scratch target and reads it back, for the
 * authority check. `__windSheet.spring = false` switches the memory off live (BRIEF step 3's measurement).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { WIND_FIELD, WIND_FIELD_GLSL, windAtAdvect, gustLengths } from '../lib/wind-field.js'
import { WeatherRangeError } from '../lib/weatherAt.js'
import { windSheetLayout, windStateOfWeather, windStateOfSpecimen, windSheetUniforms, WIND_SPRING, WIND_DETAIL_DRIFT, _markWindSheetMounted, _publishWindSheetReadout, onWindSheetReadout, getWindSheetOverlay, setWindSheetOverlay, applyWindOverride } from '../lib/windSheet.js'
import { onSceneStencil } from './sceneStencilState.js'
import { UNIFORMS as TERRAIN_UNIFORMS, TERRAIN_DECL } from '../utils/terrainShader'
import { useQuality } from '../lib/qualityProfile.js'
import useSkyState from '../hooks/useSkyState.js'
import useTimeOfDay from '../hooks/useTimeOfDay.js'

/** The sheet's state (arrays) as wind-field.js reads it (Vector3s) — the same object both sides evaluate. */
function wsOf(a) {
  return { baseSpeedMps: a.baseSpeedMps, baseDirection: new THREE.Vector3(a.baseDirection[0], 0, a.baseDirection[1]),
    gustsScale: a.gustsScale, gustEnvelope: a.gustEnvelope, gustFrontVelocity: new THREE.Vector3(a.frontVel[0], 0, a.frontVel[1]), gustShape: a.gustShape }
}

const passVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const passFrag = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2  uOrigin;
  uniform float uSpan;
  uniform float uAdvect;   // cells the gust pattern has moved downwind (wrapped on the lattice period)
  uniform float uDt;
  uniform vec2  uBaseForce;
  uniform vec2  uFrontDir;
  uniform vec2  uLengths;  // the gust's length along / across the wind, metres (wind-field.js#gustLengths)
  uniform float uAmp;
  uniform float uOmega;
  uniform float uZeta;
  uniform float uSpring;   // 1 = the canopy's spring, 0 = the air as it is (measurement only)
  uniform float uReset;    // 1 on the first frame or a new extent: start at rest in the air
  ${WIND_FIELD_GLSL}
  void main() {
    vec2 xz = uOrigin + vUv * uSpan;
    vec2 air = windFieldAt(uAdvect, xz, uBaseForce, uFrontDir, uLengths, uAmp);
    if (uSpring < 0.5) { gl_FragColor = vec4(air, 0.0, 0.0); return; }
    vec4 prev = uReset > 0.5 ? vec4(air, 0.0, 0.0) : texture2D(uPrev, vUv);
    vec2 x = prev.xy, v = prev.zw;
    // Semi-implicit Euler: stable while ω·dt < 2 (dt is clamped to 0.1 s; ω ≈ 2.4 rad/s).
    v += (uOmega * uOmega * (air - x) - 2.0 * uZeta * uOmega * v) * uDt;
    x += v * uDt;
    gl_FragColor = vec4(x, v);
  }
`

export default function WindSheet({ extent, wind }) {
  if (extent !== 'town' && !(extent && Number.isFinite(extent.radius))) {
    throw new Error('[WindSheet] ⛔ needs extent="town" or a named specimen extent {center:[x,z], radius} — there is no default world to cover')
  }
  if (extent === 'town' && wind !== undefined) throw new Error('[WindSheet] ⛔ a town\'s wind is its weather (weatherAt) — a wind prop is for a specimen extent only')
  // A specimen under the REAL weather (the Meteorologist's canary, the tree diorama) says wind="weather": its own extent,
  // the town's air through the one cable — so it never reads the weather itself.
  const specimenWind = extent === 'town' || wind === 'weather' ? null : windStateOfSpecimen(wind)
  const gl = useThree((s) => s.gl)
  const quality = useQuality()
  const overlay = useSyncExternalStore(onWindSheetReadout, getWindSheetOverlay)

  // The extent: the town's stencil (live — a pour or scene switch republishes it), or the named specimen's.
  const extentRef = useRef(extent === 'town' ? null : extent)
  const layoutRef = useRef(null)
  const targets = useRef(null)
  const reset = useRef(true)
  const status = useRef({ extent: 'awaiting', weather: 'no-weather', note: '' })

  const pass = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      name: 'windSheet:pass',
      vertexShader: passVert, fragmentShader: passFrag, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uPrev: { value: null }, uOrigin: { value: new THREE.Vector2() }, uSpan: { value: 1 }, uAdvect: { value: 0 }, uDt: { value: 0 },
        uBaseForce: { value: new THREE.Vector2() }, uFrontDir: { value: new THREE.Vector2(1, 0) }, uLengths: { value: new THREE.Vector2(100, 100) }, uAmp: { value: 0 },
        uOmega: { value: (2 * Math.PI) / WIND_SPRING.PERIOD_S }, uZeta: { value: WIND_SPRING.DAMPING },
        uSpring: { value: 1 }, uReset: { value: 1 },
      },
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const mesh = new THREE.Mesh(geo, material)
    mesh.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(mesh)
    return { material, scene, camera: new THREE.Camera(), geo }
  }, [])

  const allocate = () => {
    const ctx = gl.getContext()
    // ⛔ Rendering to half-float needs the extension; without it the sheet cannot exist on this device — said, never faked.
    if (!ctx.getExtension('EXT_color_buffer_half_float') && !ctx.getExtension('EXT_color_buffer_float')) {
      throw new Error('[WindSheet] ⛔ this device cannot render to a half-float target (EXT_color_buffer_half_float) — the wind sheet cannot be drawn here')
    }
    const L = windSheetLayout(extentRef.current, quality.windTexelsPerCorrelation, ctx.getParameter(ctx.MAX_TEXTURE_SIZE))
    targets.current?.forEach((t) => t.dispose())
    const mk = () => {
      const t = new THREE.WebGLRenderTarget(L.size, L.size, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      })
      t.texture.name = 'windSheet'
      return t
    }
    targets.current = [mk(), mk()]
    layoutRef.current = L
    windSheetUniforms.uWindSheetOrigin.value.set(L.origin[0], L.origin[1])
    windSheetUniforms.uWindSheetSpan.value = L.span
    pass.material.uniforms.uOrigin.value.set(L.origin[0], L.origin[1])
    pass.material.uniforms.uSpan.value = L.span
    reset.current = true
    status.current.extent = extent === 'town' ? 'town' : 'specimen'
    console.info(`[WindSheet] ${status.current.extent} extent: ${L.size}² at ${L.mPerTexel.toFixed(2)} m/texel over ${Math.round(L.span)} m (${quality.id})`)
  }

  useEffect(() => {
    _markWindSheetMounted(1)
    let unsub = null
    if (extent === 'town') {
      unsub = onSceneStencil((s) => {
        extentRef.current = s
        if (s) allocate()
        else { status.current.extent = 'awaiting'; console.warn('[WindSheet] ⏳ the town\'s stencil is unset — the sheet is unallocated until the ground publishes the disc (no default size)') }
      })
    } else allocate()
    return () => {
      unsub?.()
      _markWindSheetMounted(-1)
      targets.current?.forEach((t) => t.dispose())
      targets.current = null
      windSheetUniforms.uWindSheet.value = EMPTY
      pass.material.dispose(); pass.geo.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent === 'town' ? 'town' : `${extent.center?.[0]},${extent.center?.[1]},${extent.radius}`, quality.windTexelsPerCorrelation, pass])

  // The air's state. Held across a WeatherRangeError (as the sky holds its directive), and said once.
  const air = useRef({ status: 'no-weather', baseSpeedMps: 0, baseDirection: [1, 0], gustsScale: 0, gustEnvelope: 0, frontVel: [WIND_FIELD.GUST_FRONT_DEFAULT_MPS, 0], hasGusts: false, gustShape: 0, storminess: 0 })
  const lastMs = useRef(0)
  const clock = useRef({ adv: 0, detail: new THREE.Vector2(), ws: null, L: null })
  const said = useRef('')
  const enabled = useRef(true)

  const mainMs = useRef(0)
  const publishTick = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const dt = lastMs.current ? Math.min(0.1, (now - lastMs.current) / 1000) : 0
    lastMs.current = now
    try {
      air.current = specimenWind || applyWindOverride(windStateOfWeather(useSkyState.getState(), useTimeOfDay.getState()))
    } catch (e) {
      if (!(e instanceof WeatherRangeError)) throw e
      if (said.current !== e.message) { said.current = e.message; console.error(`[WindSheet] ⛔ no weather for this time — holding the last wind: ${e.message}`) }
    }
    if (air.current.status !== status.current.weather) {
      status.current.weather = air.current.status
      if (air.current.status === 'no-weather') console.warn('[WindSheet] ⏳ no weather reading yet and no preset standing — the sheet carries no wind until one arrives')
    }
    const a = air.current
    // Clocks, both wrapped on the noise lattice so they never lose float precision and never seam.
    const c = clock.current
    // The gust pattern advances by its own rate (cells/s) — so a change of shape or front speed never jumps it.
    const ws = wsOf(a)
    const L = gustLengths(ws)
    c.adv = (c.adv + L.advectRate * dt) % WIND_FIELD.LATTICE_PERIOD
    c.ws = ws
    c.L = L
    const drift = WIND_DETAIL_DRIFT * dt   // a fixed flutter rate, never ∝ wind speed (WIND_DETAIL_DRIFT)
    c.detail.x = (c.detail.x - a.baseDirection[0] * drift + WIND_FIELD.LATTICE_PERIOD) % WIND_FIELD.LATTICE_PERIOD
    c.detail.y = (c.detail.y - a.baseDirection[1] * drift + WIND_FIELD.LATTICE_PERIOD) % WIND_FIELD.LATTICE_PERIOD
    windSheetUniforms.windSheetTime.value += dt
    windSheetUniforms.uWindDetailOffset.value.copy(c.detail)
    windSheetUniforms.uWindBaseSpeed.value = a.baseSpeedMps
    windSheetUniforms.uWindGustAmp.value = a.gustsScale * a.gustEnvelope
    gl.getDrawingBufferSize(windSheetUniforms.uWindViewport.value)

    if (++publishTick.current % 15 === 1) _publishWindSheetReadout({ status: { ...status.current, sim: pass.material.uniforms.uSpring.value ? 'spring' : 'stateless' }, air: a, layout: layoutRef.current, gust: c.L })
    if (!targets.current || !enabled.current) return
    const u = pass.material.uniforms
    u.uAdvect.value = c.adv
    u.uDt.value = dt
    u.uBaseForce.value.set(a.baseDirection[0] * a.baseSpeedMps, a.baseDirection[1] * a.baseSpeedMps)
    const fl = Math.hypot(a.frontVel[0], a.frontVel[1])
    if (fl > 1e-3) u.uFrontDir.value.set(a.frontVel[0] / fl, a.frontVel[1] / fl)
    else u.uFrontDir.value.set(a.baseDirection[0], a.baseDirection[1])
    u.uLengths.value.set(L.along, L.across)
    u.uAmp.value = a.gustsScale * a.gustEnvelope
    u.uReset.value = reset.current ? 1 : 0
    const [read, write] = targets.current
    u.uPrev.value = read.texture
    const prev = gl.getRenderTarget()
    const autoClear = gl.autoClear
    gl.autoClear = false
    gl.setRenderTarget(write)
    gl.render(pass.scene, pass.camera)
    gl.setRenderTarget(prev)
    gl.autoClear = autoClear
    targets.current = [write, read]
    windSheetUniforms.uWindSheet.value = write.texture
    reset.current = false
    mainMs.current = performance.now() - now
  })

  // The console handle: what the sheet is, a texel read back, and the CPU field at the same instant.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const half = new Uint16Array(4)
    const handle = window.__windSheet = {
      get layout() { return layoutRef.current },
      get status() { return { ...status.current, sim: pass.material.uniforms.uSpring.value ? 'spring' : 'stateless' } },
      set spring(v) { pass.material.uniforms.uSpring.value = v ? 1 : 0; reset.current = true },
      get air() { return air.current },
      get advect() { return clock.current.adv },
      get gust() { return clock.current.L },
      /** The field laid over the terrain (colour = strength). A developer view; not in the card. */
      set showMap(v) { setWindSheetOverlay(v) },
      get showMap() { return getWindSheetOverlay() },
      /** What the pass last drew with — for a sheet that reads back zeros. */
      get pass() { const u = pass.material.uniforms; return { allocated: !!targets.current, enabled: enabled.current, baseForce: u.uBaseForce.value.toArray(), amp: u.uAmp.value, lengths: u.uLengths.value.toArray(), frontDir: u.uFrontDir.value.toArray(), advect: u.uAdvect.value } },
      /** The main thread's time in the sheet's frame callback, ms (the weather read, the uniforms, the draw's submission). */
      get mainMs() { return mainMs.current },
      set enabled(v) { enabled.current = !!v },
      get enabled() { return enabled.current },
      /** The texel at world (x, z): { felt:[x,z] m/s, rate:[x,z] }. */
      read(x, z) {
        const L = layoutRef.current
        if (!L || !targets.current) throw new Error('[windSheet] ⛔ unallocated')
        const px = Math.floor(((x - L.origin[0]) / L.span) * L.size), pz = Math.floor(((z - L.origin[1]) / L.span) * L.size)
        gl.readRenderTargetPixels(targets.current[0], px, pz, 1, 1, half)
        const f = Array.from(half, (h) => THREE.DataUtils.fromHalfFloat(h))
        return { felt: [f[0], f[1]], rate: [f[2], f[3]], texel: [px, pz] }
      },
      /**
       * The AIR (the sheet's pass with the spring off) at each world point, drawn now into a scratch target and read
       * back, beside the CPU field at the same instant and texel centre: [{ x, z, gpu:[x,z], cpu:[x,z] }].
       */
      probeAir(points) {
        const L = layoutRef.current
        if (!L) throw new Error('[windSheet] ⛔ unallocated')
        const u = pass.material.uniforms
        const tmp = new THREE.WebGLRenderTarget(L.size, L.size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false })
        const was = u.uSpring.value
        u.uSpring.value = 0
        const prev = gl.getRenderTarget()
        gl.setRenderTarget(tmp); gl.render(pass.scene, pass.camera); gl.setRenderTarget(prev)
        u.uSpring.value = was
        const out = points.map(([x, z]) => {
          const px = Math.floor(((x - L.origin[0]) / L.span) * L.size), pz = Math.floor(((z - L.origin[1]) / L.span) * L.size)
          gl.readRenderTargetPixels(tmp, px, pz, 1, 1, half)
          return { x, z, gpu: [THREE.DataUtils.fromHalfFloat(half[0]), THREE.DataUtils.fromHalfFloat(half[1])], cpu: this.airAt(x, z) }
        })
        tmp.dispose()
        return out
      },
      /**
       * The sheet's pass ALONE on the GPU: `n` draws into a scratch target, timed with EXT_disjoint_timer_query_webgl2
       * (the instrument frameCost uses). Resolves { msPerPass, spring, size } or { unsupported }. A disjoint read is
       * dropped, never averaged. ⚠️ ANGLE/Metal timings are a relative gauge (frameCost.js header).
       */
      async timePass(n = 50, springOn = true) {
        const ctx = gl.getContext(), ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
        if (!ext) return { unsupported: true }
        const L = layoutRef.current, u = pass.material.uniforms
        const tmp = new THREE.WebGLRenderTarget(L.size, L.size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false })
        const was = u.uSpring.value, prev = gl.getRenderTarget()
        u.uSpring.value = springOn ? 1 : 0
        gl.setRenderTarget(tmp); gl.render(pass.scene, pass.camera)   // warm
        const q = ctx.createQuery()
        ctx.beginQuery(ext.TIME_ELAPSED_EXT, q)
        for (let i = 0; i < n; i++) gl.render(pass.scene, pass.camera)
        ctx.endQuery(ext.TIME_ELAPSED_EXT)
        gl.setRenderTarget(prev)
        u.uSpring.value = was
        for (let i = 0; i < 200; i++) {
          await new Promise((r) => setTimeout(r, 16))
          if (ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) break
        }
        const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT)
        const ns = ctx.getQueryParameter(q, ctx.QUERY_RESULT)
        ctx.deleteQuery(q); tmp.dispose()
        if (disjoint) return { disjoint: true }
        return { msPerPass: ns / 1e6 / n, spring: springOn, size: L.size }
      },
      /** The air (CPU wind-field.js#windAt) at the texel centre nearest (x, z), at the sheet's last instant. */
      airAt(x, z) {
        const L = layoutRef.current
        const px = Math.floor(((x - L.origin[0]) / L.span) * L.size), pz = Math.floor(((z - L.origin[1]) / L.span) * L.size)
        const cx = L.origin[0] + ((px + 0.5) / L.size) * L.span, cz = L.origin[1] + ((pz + 0.5) / L.size) * L.span
        const r = windAtAdvect(clock.current.adv, { x: cx, z: cz }, clock.current.ws)
        return [r.force.x, r.force.z]
      },
    }
    // Only our own handle: under a remount the new sheet's effect runs before the old one's cleanup.
    return () => { if (window.__windSheet === handle) delete window.__windSheet }
  }, [gl, pass])

  return overlay ? <WindSheetDebug air={air} layoutRef={layoutRef} /> : null
}

const EMPTY = windSheetUniforms.uWindSheet.value

/** The card's "Show on map" — the field laid over the terrain. A debug view, not a look. */
function WindSheetDebug({ air, layoutRef }) {
  const meshRef = useRef()
  // ⭐ DRAPED and CLIPPED (Jacob, 2026-10-04: a flat plane floated against the terrain and its square ran past the
  // town). The overlay lifts each vertex by the ground's own terrain sample (terrainShader's shared uniforms — the same
  // field the ground is displaced by) plus a small lift, depth-tests so trees and buildings stand in front of it, and
  // discards outside the town's disc.
  const material = useMemo(() => new THREE.ShaderMaterial({
    name: 'windSheet:debug', transparent: true, depthTest: true, depthWrite: false,
    uniforms: { ...windSheetUniforms, ...TERRAIN_UNIFORMS, uMax: { value: 10 }, uDiscC: { value: new THREE.Vector2() }, uDiscR: { value: 1 }, uLift: { value: 1.0 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${TERRAIN_DECL}
      uniform float uLift;
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y = texture2D(uTerrainMap, _terrainUV(vec2((w.x - uBMinX) / uSpanX, (w.z - uBMinZ) / uSpanZ))).r * uExag + uLift;
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uWindSheet; uniform vec2 uWindSheetOrigin; uniform float uWindSheetSpan; uniform float windSheetTime; uniform float uMax;
      uniform vec2 uDiscC; uniform float uDiscR;
      varying vec2 vXZ;
      void main() {
        #include <logdepthbuf_fragment>
        if (distance(vXZ, uDiscC) > uDiscR) discard;
        vec4 s = texture2D(uWindSheet, (vXZ - uWindSheetOrigin) / uWindSheetSpan);
        float m = clamp(length(s.xy) / uMax, 0.0, 1.0);
        vec3 c = mix(vec3(0.05, 0.15, 0.6), vec3(1.0, 0.85, 0.1), m);
        c = mix(c, vec3(1.0, 0.2, 0.1), smoothstep(0.7, 1.0, m));
        vec2 d = length(s.xy) > 1e-3 ? normalize(s.xy) : vec2(1.0, 0.0);
        float streak = smoothstep(0.85, 1.0, fract(dot(vXZ, d) * 0.02 - windSheetTime * length(s.xy) * 0.02));
        float across = smoothstep(0.9, 1.0, fract(dot(vXZ, vec2(-d.y, d.x)) * 0.05));
        gl_FragColor = vec4(c + streak * across * 0.8, 0.55);
      }`,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    const L = layoutRef.current
    const m = meshRef.current
    if (m) {
      m.visible = !!L
      if (L) {
        m.position.set(L.center[0], 0, L.center[1]); m.scale.set(2 * L.radius, 2 * L.radius, 1)
        material.uniforms.uDiscC.value.set(L.center[0], L.center[1]); material.uniforms.uDiscR.value = L.radius
      }
    }
    const a = air.current
    material.uniforms.uMax.value = Math.max(4, (a.baseSpeedMps + a.gustsScale) * 1.2)
  })
  return (
    <mesh ref={meshRef} material={material} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10000} frustumCulled={false}>
      {/* Dense enough to follow the terrain: the ground's relief is sampled per vertex. */}
      <planeGeometry args={[1, 1, 256, 256]} />
    </mesh>
  )
}
