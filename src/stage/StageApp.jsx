/**
 * Stage — 3D environment preview for art direction.
 *
 * Same lighting rig and post-processing as production Scene.jsx,
 * but with no VectorStreets SVG, no user dots, no idle timeouts.
 * Ground = Terrain mesh + StreetRibbons + face fills.
 *
 * This is where we dial in the "look" before migrating to production.
 */

import { useRef, useEffect, useMemo, forwardRef, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, SoftShadows } from '@react-three/drei'
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing'
import { Effect, BlendFunction } from 'postprocessing'
import * as THREE from 'three'

import LafayetteScene from '../components/LafayetteScene'
import CelestialBodies from './StageSky'
import LafayettePark from '../components/LafayettePark'
import StreetLights from '../components/StreetLights'
import GatewayArch from './StageArch'
import CloudDome from '../components/CloudDome'
import StreetRibbons from '../components/StreetRibbons'
import Terrain from '../components/Terrain'
import R3FErrorBoundary from '../components/R3FErrorBoundary'

import { catmullRom, EASINGS } from '../preview/heroAnim'
import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS,
  FILL_FLAT_DEFAULTS,
  EXPOSURE_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS, MIST_DENSITY_SCALE,
  HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'
import useSkyState from '../hooks/useSkyState'
import DawnTimeline from '../components/DawnTimeline'

// ── Post-processing effects (copied from Scene.jsx) ─────────────────────────

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGrade', /* glsl */`
      uniform float uSunAlt;
      uniform float uContrast;
      uniform float uToe;
      uniform float uSat;
      uniform float uVignette;
      uniform float uExposure;
      uniform float uWarmth;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * uExposure;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 curved = c * c * (3.0 - 2.0 * c);
        c = mix(c, curved, uContrast);
        float toe = smoothstep(0.0, 0.25, lum);
        c *= mix(uToe, 1.0, toe);
        float shadowSat = 1.0 + (1.0 - toe) * 0.3;
        vec3 gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, shadowSat);
        float midBell = 4.0 * lum * (1.0 - lum);
        c *= 1.0 + midBell * 0.15;
        vec3 warmTint = vec3(1.04, 0.98, 0.92);
        vec3 coolTint = vec3(0.96, 0.98, 1.04);
        vec3 splitTone = mix(warmTint, coolTint, smoothstep(0.3, 0.7, lum));
        c *= splitTone;
        float goldenT = exp(-pow((uSunAlt - 0.08) / 0.12, 2.0));
        float nightT = smoothstep(0.05, -0.15, uSunAlt);
        c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.88), goldenT * 0.5);
        c *= mix(vec3(1.0), vec3(0.88, 0.92, 1.08), nightT * 0.4);
        // Operator Warmth — Photo Filter math: tint then re-normalize
        // luminosity so adding warmth doesn't change brightness. Density
        // 0.6 max (cool/warm tint at the extremes is overt but not
        // hue-rotating). Acts on every pixel — Photoshop "Photo Filter
        // adjustment layer" analog, not a Hue/Saturation hue shift.
        float warmthBias = (uWarmth - 0.5) * 2.0;
        vec3 photoTint = warmthBias >= 0.0
          ? vec3(1.10, 1.00, 0.84)   // warm reference (sodium)
          : vec3(0.86, 0.94, 1.12);  // cool reference (moonlight)
        float photoDensity = abs(warmthBias) * 0.6;
        vec3 tinted = c * mix(vec3(1.0), photoTint, photoDensity);
        float lumIn  = dot(c,      vec3(0.2126, 0.7152, 0.0722));
        float lumOut = dot(tinted, vec3(0.2126, 0.7152, 0.0722));
        c = tinted * (lumIn / max(lumOut, 1e-4));
        gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, uSat);
        c = mix(c, inputColor.rgb, smoothstep(0.7, 1.0, lum));
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * uVignette;
        vignette = smoothstep(0.0, 1.0, clamp(vignette, 0.0, 1.0));
        c *= vignette;
        outputColor = vec4(c, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uSunAlt', new THREE.Uniform(0.5)],
        ['uContrast', new THREE.Uniform(0.42)],
        ['uToe', new THREE.Uniform(0.28)],
        ['uSat', new THREE.Uniform(1.1)],
        ['uVignette', new THREE.Uniform(1.0)],
        ['uExposure', new THREE.Uniform(0.95)],
        ['uWarmth', new THREE.Uniform(0.5)],
      ])
    })
  }
  update() {
    const tod = useTimeOfDay.getState()
    this.uniforms.get('uSunAlt').value = tod.getLightingPhase().sunAltitude
    this.uniforms.get('uContrast').value = envState.gradeContrast
    this.uniforms.get('uSat').value = envState.gradeSaturation
    this.uniforms.get('uVignette').value = envState.gradeVignette
    // Operator-authored channels (Post card): exposure, warmth, fill.
    // Resolved at the current TOD minute from the cartograph store.
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const minute   = tod.getMinuteOfDay()
    const cs = useCartographStore.getState()
    const expVal    = resolveGroupAtMinute(cs.exposure, minute, slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    const warmthVal = resolveGroupAtMinute(cs.warmth,   minute, slotMins, ['value'], WARMTH_FLAT_DEFAULTS).value
    const fillVal   = resolveGroupAtMinute(cs.fill,     minute, slotMins, ['value'], FILL_FLAT_DEFAULTS).value
    // Fill → uToe piecewise: 0..1 maps 0→0.28 (current default),
    // 1..2 maps 0.28→1.0 (lifted shadows). Identity at fill = 1.
    const toeMapped = fillVal <= 1
      ? fillVal * 0.28
      : 0.28 + (fillVal - 1) * 0.72
    this.uniforms.get('uExposure').value = expVal
    this.uniforms.get('uWarmth').value   = warmthVal
    this.uniforms.get('uToe').value      = toeMapped
  }
}
export const FilmGrade = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGradeEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

class FilmGrainEffect extends Effect {
  constructor() {
    super('FilmGrain', /* glsl */`
      uniform float uSeed; uniform float uScale;
      float grainHash(vec2 p) { vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float darkSuppress=smoothstep(0.0,0.08,lum);
        float strength=mix(0.007,0.002,smoothstep(0.0,0.5,lum))*uScale*darkSuppress;
        float grain=(grainHash(uv*1000.0+uSeed)-0.5)*strength;
        outputColor=vec4(inputColor.rgb+grain,inputColor.a);
      }
    `, { uniforms: new Map([['uSeed', new THREE.Uniform(0)], ['uScale', new THREE.Uniform(1)]]) })
  }
  update() {
    this.uniforms.get('uSeed').value = Math.random() * 1000
    const alt = useTimeOfDay.getState().getLightingPhase().sunAltitude
    const day = alt > 0.1 ? 1 : alt < -0.15 ? 0 : (alt + 0.15) / 0.25
    this.uniforms.get('uScale').value = (0.4 + day * 0.6) * envState.grainScale
  }
}
export const FilmGrain = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGrainEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

class AerialPerspectiveEffect extends Effect {
  constructor() {
    super('AerialPerspective', /* glsl */`
      uniform float uHazeStrength; uniform vec3 uHazeColor;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float horizonBand=smoothstep(0.15,0.55,uv.y)*smoothstep(0.85,0.55,uv.y);
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float contrastLoss=smoothstep(0.05,0.4,lum)*smoothstep(0.9,0.4,lum);
        float haze=horizonBand*contrastLoss*uHazeStrength;
        outputColor=vec4(mix(inputColor.rgb,uHazeColor,haze),inputColor.a);
      }
    `, { uniforms: new Map([['uHazeStrength', new THREE.Uniform(0)], ['uHazeColor', new THREE.Uniform(new THREE.Vector3(0.7, 0.75, 0.82))]]) })
  }
}
class AerialPerspectiveWithEnv extends AerialPerspectiveEffect {
  update() {
    // Halo channel (Sky & Light) → AerialPerspective uniforms. Strength
    // resolved from the operator-authored channel; sun-altitude
    // dayFactor still rides on top so halo doesn't fire at night
    // (physics modifier per project_celestial_physics_not_authored).
    const tod = useTimeOfDay.getState()
    const alt = tod.getLightingPhase().sunAltitude
    const dayFactor = alt > 0.1 ? 1 : alt < -0.05 ? 0 : (alt + 0.05) / 0.15
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const halo = resolveGroupAtMinute(
      useCartographStore.getState().halo,
      tod.getMinuteOfDay(), slotMins,
      HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
    )
    this.uniforms.get('uHazeStrength').value = dayFactor * halo.strength
    _haloC.set(halo.color)
    this.uniforms.get('uHazeColor').value.set(_haloC.r, _haloC.g, _haloC.b)
  }
}
const _haloC = new THREE.Color()
export const AerialPerspective = forwardRef((_, ref) => {
  const effect = useMemo(() => new AerialPerspectiveWithEnv(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// (bloom is driven directly in PostProcessing's useFrame)

// ── Tickers ─────────────────────────────────────────────────────────────────

function TimeTicker() {
  const tick = useTimeOfDay((s) => s.tick)
  const last = useRef(Date.now())
  useFrame(() => { const n = Date.now(); tick(n - last.current); last.current = n })
  return null
}
function SkyStateTicker() {
  useFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))
  return null
}
function FrameLimiter() {
  const inv = useThree((s) => s.invalidate)
  useEffect(() => { let id; const l = () => { inv(); id = requestAnimationFrame(l) }; id = requestAnimationFrame(l); return () => cancelAnimationFrame(id) }, [inv])
  return null
}

// ── Environment state (DOM ↔ R3F bridge) ────────────────────────────────────

export const ENV_DEFAULTS = {
  // Exposure, AO, and Bloom moved to the cartograph store as TOD-
  // authored channels (Post card). FilmGrade resolves them per frame
  // from the store; the legacy envState fields are gone.
  // Haze
  // hazeStrength moved to the cartograph store as a TOD-authored Halo
  // channel (Sky & Light card).
  // Film Grade
  gradeContrast: 0.42,
  gradeToe: 0.28,
  gradeSaturation: 1.1,
  gradeVignette: 1.0,
  // Film Grain
  grainScale: 1.0,           // multiplier on base grain
  // Shadows
  shadowSize: 52,
  shadowSamples: 16,
}

export const envState = { ...ENV_DEFAULTS }
let envListeners = new Set()
function subscribeEnv(fn) { envListeners.add(fn); return () => envListeners.delete(fn) }
function notifyEnv() { for (const fn of envListeners) fn() }

function useEnvState() {
  const [env, _setEnv] = useState({ ...envState })
  useEffect(() => subscribeEnv(() => _setEnv({ ...envState })), [])
  return env
}

export function setEnv(updates) {
  Object.assign(envState, updates)
  console.log('[env]', Object.keys(updates).join(','), '→', JSON.stringify(updates))
  notifyEnv()
}

// ── Arch & Horizon authoring state ─────────────────────────────────────────
// The gateway arch is a landmark, not literal geography. Its distance,
// scale, bearing and the round ground disc under it are all authored here.
// Bearing is the unit vector [bx, bz] from origin; position = distance × bearing.
export const ARCH_DEFAULTS = {
  archDistance: 1050,
  archBearingX: 0.9487,
  archBearingZ: -0.3163,
  archScale: 1.3,
  archRotation: 1.36,
  archYOffset: 0,
  // Foot fade: meters below world y=0 at which the arch alpha reaches zero.
  // Lets feet penetrate the ground plane (BakedGround at y=0) without a
  // hard edge — alpha is full at the ground line and falls off smoothly
  // beneath. See StageArch shader's foot-fade block.
  archFootFade: 30,
  horizonRadius: 3750,
  horizonFadeInner: 900,
  horizonFadeOuter: 3750,
}
export const archState = { ...ARCH_DEFAULTS }
let archListeners = new Set()
function subscribeArch(fn) { archListeners.add(fn); return () => archListeners.delete(fn) }
function notifyArch() { for (const fn of archListeners) fn() }

export function useArchState() {
  const [a, _setA] = useState({ ...archState })
  useEffect(() => subscribeArch(() => _setA({ ...archState })), [])
  return a
}

export function setArch(updates) {
  Object.assign(archState, updates)
  notifyArch()
}

// ── Post-processing ─────────────────────────────────────────────────────────
// EffectComposer children are static — never re-render.
// All env-driven params are set imperatively per-frame via refs.

export function PostProcessing() {
  const bloomRef = useRef()
  const aoRef = useRef()
  const { gl, invalidate } = useThree()

  // Stage uses frameloop="demand". Slider edits mutate envState but don't
  // change any Three prop, so R3F never re-renders and the per-frame
  // driver below stops running. Subscribe to env changes and force one
  // frame so the new values land.
  useEffect(() => subscribeEnv(invalidate), [invalidate])

  useFrame(() => {
    // Exposure (applied via FilmGrade uExposure uniform, not gl.toneMappingExposure)
    // gl.toneMappingExposure is overridden by EffectComposer

    // AO — N8AOPostPass params resolved from the Post card's `ao`
    // channel (group of 3: radius/intensity/distanceFalloff).
    const ao = aoRef.current
    if (ao?.configuration) {
      const tod = useTimeOfDay.getState()
      const slotMins = getTodSlotMinutes(tod.currentTime)
      const aoTriple = resolveGroupAtMinute(
        useCartographStore.getState().ao,
        tod.getMinuteOfDay(), slotMins,
        AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
      )
      ao.configuration.aoRadius = aoTriple.radius
      ao.configuration.intensity = aoTriple.intensity
      ao.configuration.distanceFalloff = aoTriple.distanceFalloff
    }

    // Bloom — base values now resolved from the cartograph store's
    // `bloom` TOD channel; sun-altitude `dk` adaptive bump rides on top.
    // `intensity` is a real setter on BloomEffect; threshold/smoothing
    // must be set on `luminanceMaterial`, not on the effect (the latter
    // are constructor-only options that silently no-op if mutated).
    const bloom = bloomRef.current
    if (bloom) {
      const tod = useTimeOfDay.getState()
      const alt = tod.getLightingPhase().sunAltitude
      const dk = alt > 0.1 ? 0 : alt < -0.15 ? 1 : 1 - (alt + 0.15) / 0.25
      const bch = useCartographStore.getState().bloom
      const slotMins = getTodSlotMinutes(tod.currentTime)
      const base = resolveGroupAtMinute(
        bch, tod.getMinuteOfDay(), slotMins,
        BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
      )
      bloom.intensity = base.intensity + dk * 0.5
      const lm = bloom.luminanceMaterial
      if (lm) {
        lm.threshold = base.threshold - dk * 0.5
        lm.smoothing = base.smoothing + dk * 0.4
      }
    }

    // Haze, Grade, Grain driven by their own update() methods reading envState
  })

  return (
    <EffectComposer>
      <N8AO ref={aoRef} halfRes={false} aoRadius={15} intensity={2.5}
        distanceFalloff={0.3} quality="medium" />
      <Bloom ref={bloomRef} intensity={0.5} luminanceThreshold={0.85}
        luminanceSmoothing={0.4}
        blendFunction={BlendFunction.SCREEN} />
      <AerialPerspective />
      <FilmGrade />
      <FilmGrain />
    </EffectComposer>
  )
}

// ── Atmospheric fog (blends ground into sky at horizon) ─────────────────────

export function StageFog() {
  const { scene } = useThree()
  const fogRef = useRef()

  useEffect(() => {
    scene.fog = new THREE.FogExp2(MIST_FLAT_DEFAULTS.color, MIST_FLAT_DEFAULTS.density * MIST_DENSITY_SCALE)
    fogRef.current = scene.fog
    return () => { scene.fog = null }
  }, [scene])

  // Mist channel (Sky & Light) → scene.fog. Density slider is normalized
  // 0–1; runtime maps to FogExp2 density via MIST_DENSITY_SCALE. Color
  // pushes directly. Replaces the previous "fog tracks horizonColor"
  // behavior — operator now owns mist color authoring.
  useFrame(() => {
    if (!fogRef.current) return
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const m = resolveGroupAtMinute(
      useCartographStore.getState().mist,
      tod.getMinuteOfDay(), slotMins,
      MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS,
    )
    fogRef.current.density = m.density * MIST_DENSITY_SCALE
    fogRef.current.color.set(m.color)
  })

  return null
}

// ── Scene diagnostic (temporary) ────────────────────────────────────────────

function SceneDiag() {
  const { scene } = useThree()
  const count = useRef(0)
  useFrame(() => {
    if (++count.current % 300 !== 0) return  // every 5 sec at 60fps
    scene.traverse(o => {
      if (o.isLight && o.isDirectionalLight && o.castShadow) {
        console.log('[sun]', 'int:', o.intensity?.toFixed(2), 'pos:', o.position?.toArray().map(v => Math.round(v)))
      }
    })
  })
  return null
}

// ── Reactive soft shadows ───────────────────────────────────────────────────

export function StageShadows() {
  const env = useEnvState()
  return <SoftShadows size={env.shadowSize} samples={env.shadowSamples} focus={0.35} />
}

// ── Environment controls ────────────────────────────────────────────────────

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="w-8 h-4 rounded-full cursor-pointer transition-colors relative"
        style={{ background: value ? 'var(--success)' : 'var(--surface-container-high)' }}
      >
        <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
          style={{ left: value ? 16 : 2 }} />
      </button>
    </div>
  )
}

function EnvironmentControls() {
  const env = useEnvState()

  return (
    <div className="space-y-2">
      {/* Exposure, AO, Bloom moved to the Post card (TOD-authored).
          Aerial Haze moved to the Sky & Light card as "Halo". */}

<Collapsible label="Film Grade">
        <div className="space-y-1">
          <SliderRow label="Contrast" value={env.gradeContrast} min={0} max={1} step={0.02}
            onChange={(v) => setEnv({ gradeContrast: v })} />
          <SliderRow label="Toe (blacks)" value={env.gradeToe} min={0} max={0.6} step={0.02}
            onChange={(v) => setEnv({ gradeToe: v })} />
          <SliderRow label="Saturation" value={env.gradeSaturation} min={0.5} max={1.5} step={0.05}
            onChange={(v) => setEnv({ gradeSaturation: v })} />
          <SliderRow label="Vignette" value={env.gradeVignette} min={0} max={2} step={0.1}
            onChange={(v) => setEnv({ gradeVignette: v })} />
        </div>
      </Collapsible>

      <Collapsible label="Film Grain">
        <div className="space-y-1">
          <SliderRow label="Scale" value={env.grainScale} min={0} max={3} step={0.1}
            onChange={(v) => setEnv({ grainScale: v })} />
        </div>
      </Collapsible>

      <Collapsible label="Shadows">
        <div className="space-y-1">
          <SliderRow label="Size" value={env.shadowSize} min={10} max={100}
            onChange={(v) => setEnv({ shadowSize: v })} />
          <SliderRow label="Samples" value={env.shadowSamples} min={4} max={32} step={1}
            onChange={(v) => setEnv({ shadowSamples: v })} />
        </div>
      </Collapsible>

      <ArchHorizonControls />

      <button
        className="w-full py-1 rounded-lg text-caption font-medium cursor-pointer transition-colors"
        style={{ background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)',
          border: '1px solid var(--outline-variant)' }}
        onClick={() => setEnv({ ...ENV_DEFAULTS })}
      >Reset to defaults</button>
    </div>
  )
}

function ArchHorizonControls() {
  const a = useArchState()
  return (
    <Collapsible label="Arch & Horizon">
      <div className="space-y-1">
        <SliderRow label="Arch Distance" value={a.archDistance} min={400} max={2000} step={10}
          onChange={(v) => setArch({ archDistance: v })} />
        <SliderRow label="Arch Scale" value={a.archScale} min={0.5} max={5.0} step={0.05}
          onChange={(v) => setArch({ archScale: v })} />
        <SliderRow label="Arch Rotation" value={a.archRotation} min={0} max={Math.PI * 2} step={0.01}
          onChange={(v) => setArch({ archRotation: v })} />
        <SliderRow label="Arch Y Offset" value={a.archYOffset} min={-200} max={200} step={1}
          onChange={(v) => setArch({ archYOffset: v })} />
        <SliderRow label="Foot Fade" value={a.archFootFade} min={0} max={120} step={1}
          onChange={(v) => setArch({ archFootFade: v })} />
        <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
        <SliderRow label="Horizon Radius" value={a.horizonRadius} min={400} max={8000} step={10}
          onChange={(v) => setArch({ horizonRadius: v })} />
        <SliderRow label="Fade Inner" value={a.horizonFadeInner} min={100} max={8000} step={10}
          onChange={(v) => setArch({ horizonFadeInner: v })} />
        <SliderRow label="Fade Outer" value={a.horizonFadeOuter} min={100} max={8000} step={10}
          onChange={(v) => setArch({ horizonFadeOuter: v })} />
      </div>
    </Collapsible>
  )
}

// ── Camera ──────────────────────────────────────────────────────────────────

export const SHOTS = {
  hero:   { position: [-400, 55, 230], target: [400, 45, -100], fov: 22, label: 'Hero' },
  // Browse = pure overhead (90°) centered on the neighborhood's building
  // centroid. `bounds` is the axis-aligned footprint of every building in
  // src/data/buildings.json — computeBrowseAltitude() fits altitude to the
  // viewport aspect so all buildings stay in frame (map gets cropped on
  // the binding axis).
  browse: {
    position: [95, 1300, -158], target: [95, 0, -158], up: [0, 0, -1], fov: 45, label: 'Browse',
    bounds: { cx: 95, cz: -158, w: 1292, h: 1025 }, padding: 1.05,
  },
  street: { position: [0, 1.73, -50], target: [0, 1.73, -50.5], fov: 75, label: 'Street' },
}

// Fit Browse altitude to viewport aspect so SHOTS.browse.bounds always frames
// in. Returns the altitude (camera Y) for a 90° overhead camera with the
// given fov and viewport aspect (width / height).
export function computeBrowseAltitude(aspect, fov = SHOTS.browse.fov) {
  const { w, h } = SHOTS.browse.bounds
  const pad = SHOTS.browse.padding ?? 1.05
  const tan = Math.tan((fov * Math.PI) / 360)
  const altForH = (h * pad) / (2 * tan)
  const altForW = (w * pad) / (2 * tan * Math.max(aspect, 1e-6))
  return Math.max(altForH, altForW)
}

// Live camera state bridge (R3F ↔ React DOM)
const cameraState = { position: [0, 0, 0], target: [0, 0, 0], fov: 22 }
const cameraPush = { pending: null } // DOM → R3F: set .pending to apply next frame
let cameraListeners = new Set()
function subscribeCameraState(fn) { cameraListeners.add(fn); return () => cameraListeners.delete(fn) }
function notifyCameraListeners() { for (const fn of cameraListeners) fn() }

// Live camera ref — populated by HeroPreview while mounted.
// Set-from-view reads this synchronously to avoid stale broadcast values.
const liveCamera = { camera: null, controls: null }
export function captureCameraSnapshot() {
  const cam = liveCamera.camera
  if (!cam) return null
  const p = cam.position
  let tx, ty, tz
  if (liveCamera.controls) {
    const t = liveCamera.controls.target
    tx = t.x; ty = t.y; tz = t.z
  } else {
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir)
    tx = p.x + dir.x * 100; ty = p.y + dir.y * 100; tz = p.z + dir.z * 100
  }
  return {
    position: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
    target: [Math.round(tx), Math.round(ty), Math.round(tz)],
    fov: Math.round(cam.fov),
  }
}

export function StageCamera({ shot }) {
  const controlsRef = useRef()
  const { camera, size } = useThree()
  const applied = useRef(null)
  const frameCount = useRef(0)

  useEffect(() => {
    if (applied.current === shot) return
    applied.current = shot
    const s = SHOTS[shot]
    if (!s) return
    if (shot === 'browse') {
      // Overhead, centered on building centroid; altitude fits viewport
      // aspect so every building stays framed.
      const aspect = size.width / Math.max(size.height, 1)
      const y = computeBrowseAltitude(aspect, s.fov)
      camera.position.set(s.position[0], y, s.position[2])
      camera.up.set(...(s.up || [0, 1, 0]))
    } else {
      camera.position.set(...s.position)
      camera.up.set(...(s.up || [0, 1, 0]))
    }
    camera.fov = s.fov
    camera.lookAt(...s.target)
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.set(...s.target)
      controlsRef.current.update()
    }
    // Map 'street' to 'planetarium' for useCamera (controls terrain exag)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
  }, [shot, camera, size.width, size.height])

  // Apply pending camera changes from DOM inputs
  // + broadcast live camera state every 10 frames
  useFrame(() => {
    const ctl = controlsRef.current

    // Apply any pending push from the panel (even before controls mount,
    // we can still write camera + lookAt; controls catch up next frame).
    if (cameraPush.pending) {
      const u = cameraPush.pending
      cameraPush.pending = null
      if (u.position) camera.position.set(...u.position)
      if (u.fov != null) { camera.fov = u.fov; camera.updateProjectionMatrix() }
      if (u.target) {
        if (ctl) ctl.target.set(...u.target)
        camera.lookAt(u.target[0], u.target[1], u.target[2])
      }
      if (ctl) {
        const wasDamping = ctl.enableDamping
        ctl.enableDamping = false
        ctl.update()
        ctl.enableDamping = wasDamping
      }
    }

    if (++frameCount.current % 10 !== 0) return
    const p = camera.position
    // Broadcast: use OrbitControls target if available, else derive from camera direction
    let tx, ty, tz
    if (ctl) {
      tx = ctl.target.x; ty = ctl.target.y; tz = ctl.target.z
    } else {
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
      tx = p.x + dir.x * 100; ty = p.y + dir.y * 100; tz = p.z + dir.z * 100
    }
    cameraState.position = [Math.round(p.x), Math.round(p.y), Math.round(p.z)]
    cameraState.target = [Math.round(tx), Math.round(ty), Math.round(tz)]
    cameraState.fov = Math.round(camera.fov)
    notifyCameraListeners()
  })

  // Browse is a planar overhead by default — LEFT-drag pans, wheel zooms.
  // RIGHT-drag is a hidden 360° orbit "easter egg" for the curious.
  // Ctrl/Meta swaps LEFT→ROTATE so Mac trackpad users (no real right
  // button) can access orbit too.
  const isBrowse = shot === 'browse'
  useEffect(() => {
    if (!isBrowse) return
    const ctl = controlsRef.current
    if (!ctl) return
    const apply = (modDown) => {
      ctl.mouseButtons = {
        LEFT: modDown ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }
    }
    const onDown = (e) => { if (e.key === 'Control' || e.key === 'Meta') apply(true) }
    const onUp   = (e) => { if (e.key === 'Control' || e.key === 'Meta') apply(false) }
    apply(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [isBrowse])
  return (
    <OrbitControls
      key={isBrowse ? 'browse' : 'orbit'}
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.15}
      screenSpacePanning={isBrowse}
      minDistance={isBrowse ? 50 : 1}
      maxDistance={4000}
      mouseButtons={isBrowse
        ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
        : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={isBrowse
        ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
        : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  )
}

// ── Timeline (dawn-to-dawn with waypoint snaps + slider) ────────────────────
// Shared with Preview; see src/components/DawnTimeline.jsx.
const Timeline = DawnTimeline

// ── Reusable input components ────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--surface-container)',
  border: '1px solid var(--outline-variant)',
  color: 'var(--on-surface)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--type-caption)',
  fontFamily: 'var(--font-mono)',
  padding: '2px 6px',
  width: '100%',
  outline: 'none',
}

function NumInput({ value, onChange, step = 1, min, max }) {
  // Hybrid: click-to-edit + horizontal drag-to-scrub.
  // Drag only activates after >3px movement, leaving clicks free to focus the input.
  const dragRef = useRef(null)
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draftStr, setDraftStr] = useState(String(value))

  const onPointerDown = (e) => {
    if (editing) return  // let the focused input own pointer events
    dragRef.current = {
      startX: e.clientX, startValue: value, moved: false, pointerId: e.pointerId,
    }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) < 3) return
    if (!d.moved) {
      d.moved = true
      e.currentTarget.setPointerCapture(d.pointerId)
    }
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
    let next = d.startValue + dx * step * mult
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(step >= 1 ? Math.round(next) : Math.round(next * 1000) / 1000)
  }
  const onPointerUp = (e) => {
    const d = dragRef.current
    if (d?.moved && e.currentTarget.hasPointerCapture(d.pointerId))
      e.currentTarget.releasePointerCapture(d.pointerId)
    dragRef.current = null
  }
  const startEdit = () => {
    setDraftStr(String(value))
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }
  const commit = () => {
    const n = parseFloat(draftStr)
    if (!Number.isNaN(n)) {
      let next = n
      if (min != null) next = Math.max(min, next)
      if (max != null) next = Math.min(max, next)
      onChange(next)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text" inputMode="numeric" autoFocus
        value={draftStr}
        style={{ ...inputStyle, width: 64, textAlign: 'center' }}
        onChange={(e) => setDraftStr(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { setEditing(false) }
        }}
      />
    )
  }
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => { if (!dragRef.current?.moved) startEdit() }}
      style={{
        ...inputStyle, width: 64, textAlign: 'center',
        cursor: 'ew-resize', touchAction: 'none', userSelect: 'none',
      }}
    >{value}</div>
  )
}

function Vec3Input({ label, value, onChange }) {
  const labels = ['X', 'Y', 'Z']
  return (
    <div className="space-y-0.5">
      <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <div className="flex gap-1">
        {value.map((v, i) => (
          <div key={i} className="flex-1 flex items-center gap-1">
            <span className="text-caption" style={{ color: 'var(--on-surface-subtle)', fontSize: 9 }}>{labels[i]}</span>
            <NumInput value={v} onChange={(n) => {
              const next = [...value]
              next[i] = n
              onChange(next)
            }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = '' }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
        <span className="text-caption font-mono" style={{ color: 'var(--on-surface-medium)' }}>
          {value}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        className="w-full" style={{ accentColor: 'var(--vic-gold)' }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

// ── Camera push helper ──────────────────────────────────────────────────────

function pushCamera(update) {
  cameraPush.pending = update
}

// ── Default keyframes per shot ──────────────────────────────────────────────

export function defaultKeyframes(shotKey) {
  const s = SHOTS[shotKey]
  if (shotKey === 'hero') {
    // Hero keyframes carry only camera position + fov; target = subject centroid (runtime).
    // Two keyframes mark the swing extremes; the wave oscillates between them.
    return [
      { position: [-540, 55, 362], fov: 22 },
      { position: [-260, 55, 98], fov: 22 },
    ]
  }
  return [{ position: [...s.position], fov: s.fov }]
}

// Subject centroid resolver. The Hero shot frames around a single designated
// object; this turns the operator's designation (kind + id) into the 3D point
// the camera locks onto. Falls back to the legacy arch centroid when no
// subject is set, so a Look without designation still has a sensible shot.
export const FALLBACK_HERO_SUBJECT = [400, 45, -100]

export function resolveHeroSubject(subject, buildings) {
  if (!subject) return FALLBACK_HERO_SUBJECT
  if (subject.kind === 'arch') {
    // Cartograph/Stage arch lives at archDistance × archBearing (live archState),
    // not at the legacy GatewayArch.jsx constants. Mid-height ≈ archScale × 35
    // for the catenary geometry — close enough for "look at the arch."
    const x = archState.archDistance * archState.archBearingX
    const z = archState.archDistance * archState.archBearingZ
    const y = archState.archScale * 35
    return [x, y, z]
  }
  if (subject.kind === 'building' || subject.kind === 'landmark') {
    const b = buildings?.find(x => x.id === subject.id)
    if (!b || !b.position) return FALLBACK_HERO_SUBJECT
    const halfH = (b.size?.[1] ?? 10) / 2
    return [b.position[0], halfH, b.position[2]]
  }
  return FALLBACK_HERO_SUBJECT
}

// ── Shared hero scrub position (R3F ↔ DOM) ──────────────────────────────────

const heroScrub = { t: 0 }  // 0–1, written by preview or panel scrub
let heroScrubListeners = new Set()
function subscribeHeroScrub(fn) { heroScrubListeners.add(fn); return () => heroScrubListeners.delete(fn) }
function notifyHeroScrub() { for (const fn of heroScrubListeners) fn() }

function useHeroScrub() {
  const [t, setT] = useState(0)
  useEffect(() => subscribeHeroScrub(() => setT(heroScrub.t)), [])
  return t
}

// ── Keyframe name helper ────────────────────────────────────────────────────

function kfName(i, total) {
  if (i === 0) return 'Start'
  if (i === total - 1) return 'End'
  return `Mid ${i}`
}

// ── Shot-specific camera controls ───────────────────────────────────────────

function HeroCamera({ keyframes, setKeyframes, heroMotion, setHeroMotion }) {
  const scrubT = useHeroScrub()
  const trackRef = useRef(null)
  const [scrubDragging, setScrubDragging] = useState(false)

  const kfFractions = keyframes.length <= 1
    ? keyframes.map(() => 0)
    : keyframes.map((_, i) => i / (keyframes.length - 1))

  // Selection is derived: if the playhead is on (close to) a keyframe dot,
  // that's the selected keyframe. Otherwise no selection (button = Add).
  const SNAP_TOLERANCE = 0.02
  const selectedKf = (() => {
    let best = -1, bestDist = Infinity
    kfFractions.forEach((f, i) => {
      const d = Math.abs(f - scrubT)
      if (d < SNAP_TOLERANCE && d < bestDist) { best = i; bestDist = d }
    })
    return best >= 0 ? best : null
  })()
  const sel = selectedKf != null ? keyframes[selectedKf] : null

  const fracFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  // Scrub: move playhead and push interpolated camera (position + fov).
  // Target is supplied by the runtime (subject centroid), so we don't push it.
  const scrubTo = useCallback((t) => {
    // Snap to nearby keyframe dots so the playhead lands ON them, not next to.
    let snapped = t
    let bestD = Infinity
    kfFractions.forEach(f => {
      const d = Math.abs(f - t)
      if (d < SNAP_TOLERANCE && d < bestD) { snapped = f; bestD = d }
    })
    heroScrub.t = snapped
    notifyHeroScrub()
    if (keyframes.length < 1) return
    if (keyframes.length === 1) {
      pushCamera({ position: keyframes[0].position, fov: keyframes[0].fov })
      return
    }
    const pos = catmullRom(keyframes.map(k => k.position), snapped)
    const segment = snapped * (keyframes.length - 1)
    const idx = Math.min(Math.floor(segment), keyframes.length - 2)
    const local = segment - idx
    const fov = keyframes[idx].fov + local * (keyframes[idx + 1].fov - keyframes[idx].fov)
    pushCamera({ position: pos.map(Math.round), fov: Math.round(fov) })
  }, [keyframes, kfFractions])

  const selectKeyframe = useCallback((i) => {
    const kf = keyframes[i]
    if (!kf) return
    pushCamera({ position: [...kf.position], fov: kf.fov })
    heroScrub.t = kfFractions[i] ?? 0
    notifyHeroScrub()
  }, [keyframes, kfFractions])

  const addKeyframeFromView = () => {
    const snap = captureCameraSnapshot()
    if (!snap) return
    const newKf = { position: snap.position, fov: snap.fov }
    const insertAt = keyframes.length === 0
      ? 0
      : Math.min(keyframes.length, Math.round(scrubT * keyframes.length))
    const next = [...keyframes.slice(0, insertAt), newKf, ...keyframes.slice(insertAt)]
    setKeyframes(next)
    // Land the playhead on the new keyframe so the button toggles to "Set"
    requestAnimationFrame(() => {
      heroScrub.t = next.length <= 1 ? 0 : insertAt / (next.length - 1)
      notifyHeroScrub()
    })
  }
  const setSelectedFromView = () => {
    if (selectedKf == null) return
    const snap = captureCameraSnapshot()
    if (!snap) return
    const next = [...keyframes]
    next[selectedKf] = { position: snap.position, fov: snap.fov }
    setKeyframes(next)
  }
  const deleteSelected = () => {
    if (selectedKf == null || keyframes.length <= 1) return
    setKeyframes(keyframes.filter((_, j) => j !== selectedKf))
    // Move playhead off the (now-deleted) frame so button goes back to "Add"
    requestAnimationFrame(() => {
      heroScrub.t = Math.min(0.999, scrubT + SNAP_TOLERANCE * 1.5)
      notifyHeroScrub()
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Motion timeline ─────────────────────────────────────── */}
      <div className="space-y-1.5">
        {/* Controls row: play + speed */}
        <div className="flex items-center gap-1.5">
          <button className="px-2 py-1 rounded text-caption font-medium cursor-pointer transition-colors"
            style={{
              background: heroMotion.preview ? 'var(--success-dim)' : 'var(--surface-container-high)',
              color: heroMotion.preview ? 'var(--success)' : 'var(--on-surface-variant)',
              border: `1px solid ${heroMotion.preview ? 'var(--success)' : 'var(--outline-variant)'}`,
            }}
            onClick={() => setHeroMotion({ ...heroMotion, preview: !heroMotion.preview })}
          >{heroMotion.preview ? '■' : '▶'}</button>
          {[1, 10, 30].map(s => (
            <button key={s}
              onClick={() => setHeroMotion({ ...heroMotion, speed: s })}
              className="px-1.5 py-1 rounded text-caption cursor-pointer transition-colors"
              style={{
                background: (heroMotion.speed || 1) === s ? 'var(--surface-container-highest)' : 'transparent',
                color: (heroMotion.speed || 1) === s ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
              }}
            >{s}x</button>
          ))}
        </div>

        {/* Timeline rail — click to scrub + deselect; click a dot to select */}
        <div
          ref={trackRef}
          className="relative h-6 flex items-center cursor-pointer select-none touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setScrubDragging(true)
            setHeroMotion(m => ({ ...m, preview: false }))
            scrubTo(fracFromX(e.clientX))
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
            scrubTo(fracFromX(e.clientX))
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            setScrubDragging(false)
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            setScrubDragging(false)
          }}
        >
          {/* Rail */}
          <div className="absolute inset-x-0 h-[6px] rounded-full top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ background: 'var(--surface-container-high)' }} />

          {/* Keyframe dots — pointer-events disabled so the wrapper owns
              all gestures (drag-to-scrub crosses dots smoothly; clicking
              a dot still selects via SNAP_TOLERANCE in scrubTo). */}
          {kfFractions.map((frac, i) => {
            const active = selectedKf === i
            return (
              <div key={i}
                className="absolute w-[12px] h-[12px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 border pointer-events-none"
                style={{
                  left: `${frac * 100}%`,
                  backgroundColor: 'var(--vic-gold)',
                  borderColor: active ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderWidth: active ? 2 : 1,
                  boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none',
                  zIndex: 2,
                }}
              />
            )
          })}

          {/* Playhead */}
          <div
            className="absolute w-[14px] h-[14px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none border-2 shadow-sm"
            style={{
              left: `${scrubT * 100}%`,
              backgroundColor: scrubDragging ? '#60a5fa' : heroMotion.preview ? '#4ade80' : 'var(--on-surface-variant)',
              borderColor: 'rgba(255,255,255,0.6)',
              zIndex: 3,
            }}
          />
        </div>
      </div>

      {/* ── Add / Set / Delete — single primary action zone ─────── */}
      {sel == null ? (
        <button className="hero-btn w-full py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
          style={{ background: 'var(--surface-container-high)', color: 'var(--on-surface)', border: '1px solid var(--outline-variant)' }}
          onClick={addKeyframeFromView}
        >+ Add Keyframe</button>
      ) : (
        <div className="flex gap-1.5">
          <button className="hero-btn flex-1 py-2 rounded-lg text-body-sm font-medium cursor-pointer transition-all"
            style={{ background: 'var(--surface-container-highest)', color: 'var(--on-surface)', border: '1px solid var(--outline)' }}
            onClick={setSelectedFromView}
          >Edit Keyframe</button>
          {keyframes.length > 1 && (
            <button className="hero-btn px-3 py-2 rounded-lg text-body-sm cursor-pointer transition-all"
              style={{ background: 'transparent', color: 'var(--error)', border: '1px solid var(--outline-variant)' }}
              onClick={deleteSelected}
              title="Delete keyframe"
            >×</button>
          )}
        </div>
      )}

      {/* ── Per-keyframe FOV (selected only) ───────────────────── */}
      {sel != null && (
        <SliderRow label="FOV" value={sel.fov} min={5} max={120} suffix="°"
          onChange={(v) => {
            const next = [...keyframes]
            next[selectedKf] = { ...sel, fov: v }
            setKeyframes(next)
            pushCamera({ fov: v })
          }} />
      )}

      <div style={{ borderTop: '1px solid var(--outline-variant)' }} />

      {/* ── Motion parameters ───────────────────────────────────── */}
      <SliderRow label="Period" value={heroMotion.period} min={60} max={1800} step={10} suffix="s"
        onChange={(v) => setHeroMotion({ ...heroMotion, period: v })} />

      {/* Wave shape */}
      <div className="space-y-0.5">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Wave</span>
        <div className="flex gap-1">
          {[
            { key: 'sine', desc: 'Sine — smooth, slows at endpoints',
              path: 'M2 12 Q 9 2, 16 12 T 30 12' },
            { key: 'triangle', desc: 'Triangle — constant speed, sharp turn',
              path: 'M2 18 L 9 6 L 16 18 L 23 6 L 30 18' },
            { key: 'sawtooth', desc: 'Sawtooth — one-way sweep, snap reset',
              path: 'M2 18 L 16 6 L 16 18 L 30 6 L 30 18' },
          ].map(t => {
            const active = heroMotion.easing === t.key
            return (
              <button key={t.key}
                onClick={() => setHeroMotion({ ...heroMotion, easing: t.key })}
                title={t.desc}
                className="flex-1 py-2 rounded transition-colors cursor-pointer flex items-center justify-center"
                style={{
                  background: active ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                  border: `1px solid ${active ? 'var(--outline)' : 'var(--outline-variant)'}`,
                }}
              >
                <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                  <path d={t.path} stroke={active ? 'var(--on-surface)' : 'var(--on-surface-variant)'}
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BrowseCamera({ cam }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Center X</span>
          <NumInput value={cam.target[0]} onChange={(v) =>
            pushCamera({ target: [v, cam.target[1], cam.target[2]], position: [v, cam.position[1], cam.target[2] + 1] })} />
        </div>
        <div className="flex-1">
          <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Center Z</span>
          <NumInput value={cam.target[2]} onChange={(v) =>
            pushCamera({ target: [cam.target[0], cam.target[1], v], position: [cam.target[0], cam.position[1], v + 1] })} />
        </div>
      </div>
      <SliderRow label="Altitude" value={cam.position[1]} min={50} max={2000} suffix="m"
        onChange={(v) => pushCamera({ position: [cam.position[0], v, cam.position[2]] })} />
      <SliderRow label="FOV" value={cam.fov} min={10} max={90} suffix="°"
        onChange={(v) => pushCamera({ fov: v })} />
    </div>
  )
}

function StreetCamera({ cam }) {
  return (
    <div className="space-y-2">
      <SliderRow label="Eye Height" value={cam.position[1]} min={1} max={5} step={0.1} suffix="m"
        onChange={(v) => pushCamera({ position: [cam.position[0], v, cam.position[2]] })} />
      <SliderRow label="FOV" value={cam.fov} min={30} max={120} suffix="°"
        onChange={(v) => pushCamera({ fov: v })} />
    </div>
  )
}

// ── Hero preview animation (runs inside R3F) ────────────────────────────────

export function HeroPreview({ keyframes, motion, subject }) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls)
  const elapsed = useRef(0)
  const frameCount = useRef(0)

  useFrame((_, delta) => {
    // 0) Keep liveCamera fresh (Set-from-view reads this synchronously)
    liveCamera.camera = camera
    liveCamera.controls = controls

    // Subject centroid = camera target. Always look at it, every frame.
    const tgt = subject || FALLBACK_HERO_SUBJECT

    // 1) Drain panel pushes (position + fov from scrub, Add/Set Keyframe).
    // Target is owned by the subject; we ignore u.target if present.
    if (cameraPush.pending) {
      const u = cameraPush.pending
      cameraPush.pending = null
      if (u.position) camera.position.set(u.position[0], u.position[1], u.position[2])
      if (u.fov != null) { camera.fov = u.fov; camera.updateProjectionMatrix() }
    }

    // 2) Animate when playing — interpolate position + fov; target = subject.
    if (motion.preview && keyframes.length >= 1) {
      const speed = motion.speed || 1
      elapsed.current += delta * speed
      const wave = EASINGS[motion.easing] || EASINGS.sine
      const t01 = (elapsed.current % motion.period) / motion.period
      const t = wave(t01)

      heroScrub.t = t01
      notifyHeroScrub()

      let pos, fov
      if (keyframes.length === 1) {
        pos = keyframes[0].position
        fov = keyframes[0].fov
      } else {
        pos = catmullRom(keyframes.map(k => k.position), t)
        const segment = t * (keyframes.length - 1)
        const idx = Math.min(Math.floor(segment), keyframes.length - 2)
        const local = segment - idx
        fov = keyframes[idx].fov + local * (keyframes[idx + 1].fov - keyframes[idx].fov)
      }

      camera.position.set(pos[0], pos[1], pos[2])
      if (Math.abs(camera.fov - fov) > 0.1) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }

    // 3) Always aim at the subject (every frame, animating or not)
    camera.lookAt(tgt[0], tgt[1], tgt[2])
    if (controls) controls.target.set(tgt[0], tgt[1], tgt[2])

    // 4) Broadcast camera state to the panel (every 10 frames)
    if (++frameCount.current % 10 !== 0) return
    const p = camera.position
    cameraState.position = [Math.round(p.x), Math.round(p.y), Math.round(p.z)]
    cameraState.target = [Math.round(tgt[0]), Math.round(tgt[1]), Math.round(tgt[2])]
    cameraState.fov = Math.round(camera.fov)
    notifyCameraListeners()
  })

  return null
}

// ── 3D path line (rendered in the scene) ────────────────────────────────────

function PathLine({ keyframes, tension, visible }) {
  const geo = useMemo(() => {
    if (!visible || keyframes.length < 2) return null
    const pts = []
    const steps = 100
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = catmullRom(keyframes.map(k => k.position), t, tension)
      pts.push(new THREE.Vector3(...p))
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [keyframes, tension, visible])

  if (!geo) return null
  return (
    <line geometry={geo}>
      <lineBasicMaterial color="#fbbf24" transparent opacity={0.5} depthTest={false} />
    </line>
  )
}

// ── Hook: subscribe to live camera state from outside R3F ────────────────────

function useCameraState() {
  const [cam, setCam] = useState({ ...cameraState })
  useEffect(() => subscribeCameraState(() => setCam({ ...cameraState })), [])
  return cam
}

// ── Collapsible section ─────────────────────────────────────────────────────

function Collapsible({ label, costMs, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const maxBarMs = 6 // full bar = 6ms
  const barPct = costMs != null ? Math.min(100, (costMs / maxBarMs) * 100) : 0
  const barColor = costMs > 4 ? 'var(--error)' : costMs > 2 ? 'var(--warning)' : 'var(--success)'

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 cursor-pointer py-0.5"
        onClick={() => setOpen(!open)}
      >
        <div className="section-heading flex items-center gap-1 shrink-0" style={{ minWidth: 0 }}>
          <span style={{ fontSize: 8, color: 'var(--on-surface-subtle)' }}>{open ? '▾' : '▸'}</span>
          {label}
        </div>
        {costMs != null && (
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-container-high)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: barColor }} />
            </div>
            <span className="text-caption font-mono shrink-0" style={{ color: 'var(--on-surface-subtle)', fontSize: 9 }}>
              {costMs.toFixed(1)}ms
            </span>
          </div>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

// ── Surface catalog ─────────────────────────────────────────────────────────

const SURFACE_CATALOG = {
  streets: {
    label: 'Streets',
    items: [
      { id: 'asphalt', label: 'Asphalt', color: '#2e2e2c' },
      { id: 'curb', label: 'Curb', color: '#aa8866' },
      { id: 'sidewalk', label: 'Sidewalk', color: '#7a756a' },
      { id: 'treelawn', label: 'Treelawn', color: '#4a6a3a' },
    ],
  },
  landuse: {
    label: 'Land Use',
    items: [
      { id: 'residential', label: 'Residential', color: '#3a5a2a' },
      { id: 'commercial', label: 'Commercial', color: '#6a6258' },
      { id: 'institutional', label: 'Institutional', color: '#5a5a6a' },
      { id: 'vacant', label: 'Vacant', color: '#5a4a32' },
      { id: 'recreation', label: 'Recreation', color: '#2a4a1a' },
      { id: 'park', label: 'Park', color: '#2a4a1a' },
      { id: 'parking', label: 'Parking', color: '#3a3a38' },
      { id: 'industrial', label: 'Industrial', color: '#4a4a42' },
      { id: 'island', label: 'Island', color: '#3a5a2a' },
    ],
  },
  walls: {
    label: 'Walls',
    items: [
      { id: 'brick_red', label: 'Brick Red', color: '#8B4513' },
      { id: 'brick_weathered', label: 'Brick Weathered', color: '#A0522D' },
      { id: 'stone', label: 'Stone', color: '#808080' },
      { id: 'stucco', label: 'Stucco', color: '#D2B48C' },
      { id: 'wood_siding', label: 'Wood Siding', color: '#CD853F' },
    ],
  },
  roofs: {
    label: 'Roofs',
    items: [
      { id: 'roof_flat', label: 'Flat', color: '#2a2a2e' },
      { id: 'roof_metal', label: 'Metal', color: '#555560' },
      { id: 'roof_slate', label: 'Slate', color: '#3a3a42' },
    ],
  },
  building_other: {
    label: 'Building',
    items: [
      { id: 'foundation', label: 'Foundation', color: '#B8A88A' },
      { id: 'night_behavior', label: 'Night Shift', color: '#3d3530' },
    ],
  },
  neon: {
    label: 'Neon',
    items: [
      { id: 'neon_dining', label: 'Dining', color: '#C2185B' },
      { id: 'neon_historic', label: 'Historic', color: '#D4A337' },
      { id: 'neon_arts', label: 'Arts', color: '#8E4585' },
      { id: 'neon_parks', label: 'Parks', color: '#3DAF8A' },
      { id: 'neon_shopping', label: 'Shopping', color: '#C27F94' },
      { id: 'neon_services', label: 'Services', color: '#3674A5' },
      { id: 'neon_community', label: 'Community', color: '#B86B4A' },
      { id: 'neon_residential', label: 'Residential', color: '#7A8B6F' },
    ],
  },
  trees: {
    label: 'Trees',
    items: [
      { id: 'leaf_palmate', label: 'Palmate', color: '#2d6828' },
      { id: 'leaf_lobed', label: 'Lobed', color: '#2a5a22' },
      { id: 'leaf_compound', label: 'Compound', color: '#2e5e28' },
      { id: 'leaf_ovate_lg', label: 'Ovate Lg', color: '#2a5828' },
      { id: 'leaf_ovate_sm', label: 'Ovate Sm', color: '#3a7035' },
      { id: 'leaf_heart', label: 'Heart', color: '#358030' },
      { id: 'leaf_tulip', label: 'Tulip', color: '#2e6028' },
      { id: 'leaf_fan', label: 'Fan', color: '#4a8a30' },
      { id: 'leaf_palm_cmpd', label: 'Palm Cmpd', color: '#2a5825' },
      { id: 'leaf_long_ndl', label: 'Long Needle', color: '#1e4420' },
      { id: 'leaf_short_ndl', label: 'Short Needle', color: '#1a3e22' },
      { id: 'leaf_scale', label: 'Scale', color: '#2a5a32' },
      { id: 'leaf_narrow', label: 'Narrow', color: '#3a7a30' },
      { id: 'leaf_fine_cmpd', label: 'Fine Cmpd', color: '#3a7a2a' },
    ],
  },
  park: {
    label: 'Park',
    items: [
      { id: 'park_grass', label: 'Grass', color: '#2d5a2d' },
      { id: 'park_path', label: 'Paths', color: '#cccccc' },
    ],
  },
  infra: {
    label: 'Infra',
    items: [
      { id: 'streetlamp', label: 'Lamps', color: '#fff2e0' },
      { id: 'arch', label: 'Arch', color: '#c8c8d0' },
      { id: 'terrain', label: 'Ground', color: '#2a2a26' },
    ],
  },
}

const SURFACE_TABS = Object.keys(SURFACE_CATALOG)

function SurfaceSwatch({ item, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 cursor-pointer group"
      style={{ width: 52 }}
    >
      <div className="w-8 h-8 rounded-full border-2 transition-all shadow-sm"
        style={{
          backgroundColor: item.color,
          borderColor: selected ? 'var(--vic-gold)' : 'var(--outline-variant)',
          boxShadow: selected ? '0 0 0 2px var(--vic-gold)' : 'none',
        }}
      />
      <span className="text-caption leading-tight text-center transition-colors"
        style={{
          color: selected ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
          fontSize: 9,
        }}
      >{item.label}</span>
    </button>
  )
}

// ── New Surfaces panel — driven by surfaceState (real material registry) ──
import {
  surfaceState, useSurfaceState, setSurface, resetSurface,
  TEXTURE_OPTIONS,
} from './surfaceState.js'

const SURFACE_LABELS = {
  walls:       'Walls',
  roofs:       'Roofs',
  foundations: 'Foundations',
}
const SURFACE_MATERIAL_LABELS = {
  walls: {
    brick_red: 'Brick — Red',
    brick_weathered: 'Brick — Weathered',
    stone: 'Stone',
    stucco: 'Stucco',
    wood_siding: 'Wood Siding',
  },
  roofs: {
    flat: 'Flat',
    slate: 'Slate',
    metal: 'Metal',
  },
  foundations: {
    foundation: 'Foundation',
  },
}
const SURFACE_CATEGORIES = ['walls', 'roofs', 'foundations']

function MaterialCard({ category, materialId, mat }) {
  const [open, setOpen] = useState(false)
  const label = SURFACE_MATERIAL_LABELS[category]?.[materialId] || materialId
  return (
    <div style={{
      borderRadius: 'var(--radius-sm)',
      background: open ? 'var(--surface-container)' : 'transparent',
      padding: open ? '6px 8px' : '2px 8px',
    }}>
      <div className="flex items-center gap-2 cursor-pointer py-1"
        onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 8, color: 'var(--on-surface-subtle)' }}>{open ? '▾' : '▸'}</span>
        <div className="w-4 h-4 rounded" style={{
          backgroundColor: mat.color,
          border: '1px solid rgba(255,255,255,0.18)',
        }} />
        <span className="text-caption" style={{ color: 'var(--on-surface)', flex: 1 }}>{label}</span>
        {mat.texture !== 'none' && (
          <span className="text-caption font-mono" style={{ color: 'var(--on-surface-subtle)', fontSize: 9 }}>
            {mat.texture}
          </span>
        )}
        <button
          className="text-caption cursor-pointer"
          style={{ color: 'var(--on-surface-subtle)', fontSize: 10 }}
          onClick={(e) => { e.stopPropagation(); resetSurface(category, materialId) }}
          title="Reset to default"
        >↺</button>
      </div>
      {open && (
        <div className="space-y-1.5 mt-1">
          {/* Color */}
          <div className="flex items-center gap-2">
            <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 56 }}>Color</span>
            <input type="color" value={mat.color}
              style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer' }}
              onChange={(e) => setSurface(category, materialId, { color: e.target.value })}
            />
            <span className="text-caption font-mono" style={{ color: 'var(--on-surface-subtle)', flex: 1 }}>
              {mat.color}
            </span>
          </div>
          <SliderRow label="Roughness" value={mat.roughness} min={0} max={1} step={0.05}
            onChange={(v) => setSurface(category, materialId, { roughness: v })} />
          <SliderRow label="Metalness" value={mat.metalness} min={0} max={1} step={0.05}
            onChange={(v) => setSurface(category, materialId, { metalness: v })} />

          {/* Texture */}
          <div className="space-y-1">
            <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Texture</span>
            <select
              value={mat.texture}
              onChange={(e) => setSurface(category, materialId, { texture: e.target.value })}
              style={{
                background: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                color: 'var(--on-surface)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--type-caption)',
                padding: '3px 6px', width: '100%', outline: 'none',
              }}
            >
              {TEXTURE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {mat.texture !== 'none' && (
              <>
                <SliderRow label="Scale" value={mat.textureScale} min={0.1} max={8} step={0.1}
                  onChange={(v) => setSurface(category, materialId, { textureScale: v })} />
                <SliderRow label="Strength" value={mat.textureStrength} min={0} max={1} step={0.05}
                  onChange={(v) => setSurface(category, materialId, { textureStrength: v })} />
              </>
            )}
          </div>

          {/* Emissive (collapsed by default — most materials are non-emissive) */}
          <Collapsible label="Emissive">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 56 }}>Color</span>
                <input type="color" value={mat.emissive}
                  style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  onChange={(e) => setSurface(category, materialId, { emissive: e.target.value })}
                />
                <span className="text-caption font-mono" style={{ color: 'var(--on-surface-subtle)' }}>
                  {mat.emissive}
                </span>
              </div>
              <SliderRow label="Intensity" value={mat.emissiveIntensity} min={0} max={5} step={0.1}
                onChange={(v) => setSurface(category, materialId, { emissiveIntensity: v })} />
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  )
}

function SurfaceGallery() {
  const [activeTab, setActiveTab] = useState('walls')
  const surfaces = useSurfaceState()
  const cat = surfaces[activeTab] || {}

  return (
    <div className="space-y-2">
      <div className="section-heading">Surfaces</div>

      {/* Tab bar */}
      <div className="flex gap-0.5">
        {SURFACE_CATEGORIES.map(key => (
          <button key={key}
            onClick={() => setActiveTab(key)}
            className="px-2 py-0.5 rounded text-caption cursor-pointer transition-colors"
            style={{
              background: activeTab === key ? 'var(--surface-container-highest)' : 'transparent',
              color: activeTab === key ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
            }}
          >{SURFACE_LABELS[key]}</button>
        ))}
      </div>

      {/* Material cards */}
      <div className="space-y-0.5">
        {Object.entries(cat).map(([id, mat]) => (
          <MaterialCard key={id} category={activeTab} materialId={id} mat={mat} />
        ))}
      </div>
    </div>
  )
}

// ── Stage Panel ─────────────────────────────────────────────────────────────

export function StagePanel({ shot, setShot, keyframes, setKeyframes, heroMotion, setHeroMotion, surfacesSlot, skyLightSlot, postSlot }) {
  const cam = useCameraState()

  return (
    <div className="absolute top-4 right-4 bottom-4 w-[400px] flex flex-col gap-3 z-10 pointer-events-none overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--outline-variant) transparent' }}>

      {/* Time of Day — top slot for Preview parity */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <div className="section-heading mb-2">Time of Day</div>
        <Timeline />
      </div>

      {/* Sky & Light — TOD-animatable atmospheric + lighting channels.
          Unmounted in Browse: card geometry (sky, celestial bodies, haze)
          isn't visible looking straight down, and unmounting prevents the
          channels' useMemos from running and the renderers from drawing. */}
      {shot !== 'browse' && (
        <div className="glass-panel rounded-xl p-3 pointer-events-auto">
          <Collapsible label="Sky & Light">
            {skyLightSlot}
          </Collapsible>
        </div>
      )}

      {/* Environment — ambient/world */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Environment">
          <EnvironmentControls />
        </Collapsible>
      </div>

      {/* Surfaces — defaults to the standalone /stage mockup gallery; the
          cartograph passes its own store-bound material editor as
          `surfacesSlot` so per-Look styling lives here, not in a separate
          panel. Same visual home, real wiring. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Surfaces">
          {surfacesSlot || <SurfaceGallery />}
        </Collapsible>
      </div>

      {/* Camera — per-shot authoring */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Camera">
          {shot === 'hero' && (
            <HeroCamera cam={cam} keyframes={keyframes} setKeyframes={setKeyframes}
              heroMotion={heroMotion} setHeroMotion={setHeroMotion} />
          )}
          {shot === 'browse' && <BrowseCamera cam={cam} />}
          {shot === 'street' && <StreetCamera cam={cam} />}
        </Collapsible>
      </div>

      {/* Post — camera/grade-side TOD channels. Visible in all shots. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Post">
          {postSlot}
        </Collapsible>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

// Default export removed: Stage is cartograph-hosted, not a standalone
// route. The /stage entry has been deleted (vite.config.js + stage.html
// + src/stage/main.jsx). Real Stage is mounted via CartographApp's
// Canvas + StagePanel. See feedback_stage_standalone_should_die.md.
