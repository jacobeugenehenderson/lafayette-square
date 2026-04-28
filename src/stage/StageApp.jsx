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
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import SunCalc from 'suncalc'

import LafayetteScene from '../components/LafayetteScene'
import CelestialBodies from './StageSky'
import LafayettePark from '../components/LafayettePark'
import StreetLights from '../components/StreetLights'
import GatewayArch from './StageArch'
import CloudDome from '../components/CloudDome'
import StreetRibbons from '../components/StreetRibbons'
import Terrain from '../components/Terrain'
import R3FErrorBoundary from '../components/R3FErrorBoundary'

import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import {
  getDawnWindow, dateToFraction, fractionToDate, getWaypoints,
} from '../lib/dawnTimeline'

const LATITUDE = 38.6160
const LONGITUDE = -90.2161

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
      ])
    })
  }
  update() {
    this.uniforms.get('uSunAlt').value = useTimeOfDay.getState().getLightingPhase().sunAltitude
    this.uniforms.get('uContrast').value = envState.gradeContrast
    this.uniforms.get('uToe').value = envState.gradeToe
    this.uniforms.get('uSat').value = envState.gradeSaturation
    this.uniforms.get('uVignette').value = envState.gradeVignette
    this.uniforms.get('uExposure').value = envState.exposure
  }
}
const FilmGrade = forwardRef((_, ref) => {
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
const FilmGrain = forwardRef((_, ref) => {
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
    const alt = useTimeOfDay.getState().getLightingPhase().sunAltitude
    const dayFactor = alt > 0.1 ? 1 : alt < -0.05 ? 0 : (alt + 0.05) / 0.15
    this.uniforms.get('uHazeStrength').value = dayFactor * envState.hazeStrength
    const hc = useSkyState.getState().horizonColor
    if (hc) {
      const avg = (hc.r + hc.g + hc.b) / 3
      this.uniforms.get('uHazeColor').value.set(
        hc.r * 0.7 + avg * 0.3, hc.g * 0.7 + avg * 0.3, hc.b * 0.7 + avg * 0.3
      )
    }
  }
}
const AerialPerspective = forwardRef((_, ref) => {
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
  exposure: 0.95,
  // AO
  aoRadius: 15,
  aoIntensity: 2.5,
  aoDistanceFalloff: 0.3,
  // Bloom
  bloomIntensity: 0.5,       // base (adaptive adds to this)
  bloomThreshold: 0.85,      // base (adaptive subtracts)
  bloomSmoothing: 0.4,       // base (adaptive adds)
  // Haze
  hazeStrength: 0.12,        // max haze (scaled by dayFactor)
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
  horizonRadius: 1000,
  horizonFadeInner: 800,
  horizonFadeOuter: 1000,
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
  const { gl } = useThree()

  useFrame(() => {
    // Exposure (applied via FilmGrade uExposure uniform, not gl.toneMappingExposure)
    // gl.toneMappingExposure is overridden by EffectComposer

    // AO — N8AOPostPass: params are direct properties on configuration
    const ao = aoRef.current
    if (ao?.configuration) {
      ao.configuration.aoRadius = envState.aoRadius
      ao.configuration.intensity = envState.aoIntensity
      ao.configuration.distanceFalloff = envState.aoDistanceFalloff
    }

    // Bloom — intensity, luminanceThreshold, luminanceSmoothing are direct properties
    const bloom = bloomRef.current
    if (bloom) {
      const alt = useTimeOfDay.getState().getLightingPhase().sunAltitude
      const dk = alt > 0.1 ? 0 : alt < -0.15 ? 1 : 1 - (alt + 0.15) / 0.25
      bloom.intensity = envState.bloomIntensity + dk * 0.5
      bloom.luminanceThreshold = envState.bloomThreshold - dk * 0.5
      bloom.luminanceSmoothing = envState.bloomSmoothing + dk * 0.4
    }

    // Haze, Grade, Grain driven by their own update() methods reading envState
  })

  return (
    <EffectComposer>
      <N8AO ref={aoRef} halfRes={false} aoRadius={15} intensity={2.5}
        distanceFalloff={0.3} quality="medium" />
      <Bloom ref={bloomRef} intensity={0.5} luminanceThreshold={0.85}
        luminanceSmoothing={0.4} mipmapBlur />
      <AerialPerspective />
      <FilmGrade />
      <FilmGrain />
    </EffectComposer>
  )
}

// ── GPU frame time meter ────────────────────────────────────────────────────

const gpuTiming = { frameMs: 0, targetFps: 60, costs: {} }
let gpuListeners = new Set()
function subscribeGpu(fn) { gpuListeners.add(fn); return () => gpuListeners.delete(fn) }
function notifyGpu() { for (const fn of gpuListeners) fn() }

function GpuMeter() {
  const times = useRef([])
  const frameCount = useRef(0)

  useFrame(() => {
    const now = performance.now()
    times.current.push(now)
    if (times.current.length > 60) times.current.shift()

    if (++frameCount.current % 20 === 0 && times.current.length > 1) {
      const dt = times.current[times.current.length - 1] - times.current[0]
      gpuTiming.frameMs = Math.round(dt / (times.current.length - 1) * 10) / 10
      notifyGpu()
    }
  })

  return null
}

function useGpuTiming() {
  const [data, setData] = useState({ frameMs: 0, targetFps: 60, costs: {} })
  useEffect(() => subscribeGpu(() => setData({ ...gpuTiming })), [])
  return data
}

// ── GPU budget bar (top-level panel) ────────────────────────────────────────

function GpuBudgetBar() {
  const { frameMs, targetFps, costs } = useGpuTiming()
  const budgetMs = 1000 / targetFps
  const fps = frameMs > 0 ? Math.round(1000 / frameMs) : 0
  const pct = Math.min(100, Math.round((frameMs / budgetMs) * 100))
  const barColor = frameMs > budgetMs ? 'var(--error)' : frameMs > budgetMs * 0.75 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="section-heading">GPU</span>
          <span className="text-caption font-mono" style={{ color: barColor }}>
            {frameMs}ms · {fps}fps
          </span>
        </div>
        <div className="flex gap-0.5">
          {[30, 60].map(t => (
            <button key={t}
              onClick={() => { gpuTiming.targetFps = t; notifyGpu() }}
              className="px-1.5 py-0.5 rounded text-caption cursor-pointer transition-colors"
              style={{
                background: targetFps === t ? 'var(--surface-container-highest)' : 'transparent',
                color: targetFps === t ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
              }}
            >{t}fps</button>
          ))}
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-container-high)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  )
}

// ── Atmospheric fog (blends ground into sky at horizon) ─────────────────────

function StageFog() {
  const { scene } = useThree()
  const fogRef = useRef()

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#9dc5e0', 0.00015)
    fogRef.current = scene.fog
    return () => { scene.fog = null }
  }, [scene])

  // Update fog color to match sky horizon each frame
  useFrame(() => {
    if (!fogRef.current) return
    const hc = useSkyState.getState().horizonColor
    if (hc) fogRef.current.color.copy(hc)
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
      <SliderRow label="Exposure" value={env.exposure} min={0.3} max={2.0} step={0.05}
        onChange={(v) => setEnv({ exposure: v })} />

      <div style={{ borderTop: '1px solid var(--outline-variant)' }} />

      <Collapsible label="Ambient Occlusion">
        <div className="space-y-1">
          <SliderRow label="Radius" value={env.aoRadius} min={1} max={30}
            onChange={(v) => setEnv({ aoRadius: v })} />
          <SliderRow label="Intensity" value={env.aoIntensity} min={0} max={5} step={0.1}
            onChange={(v) => setEnv({ aoIntensity: v })} />
          <SliderRow label="Distance Falloff" value={env.aoDistanceFalloff} min={0} max={1} step={0.05}
            onChange={(v) => setEnv({ aoDistanceFalloff: v })} />
        </div>
      </Collapsible>

      <Collapsible label="Bloom">
        <div className="space-y-1">
          <SliderRow label="Intensity" value={env.bloomIntensity} min={0} max={2} step={0.05}
            onChange={(v) => setEnv({ bloomIntensity: v })} />
          <SliderRow label="Threshold" value={env.bloomThreshold} min={0.1} max={1.0} step={0.05}
            onChange={(v) => setEnv({ bloomThreshold: v })} />
          <SliderRow label="Smoothing" value={env.bloomSmoothing} min={0} max={1} step={0.05}
            onChange={(v) => setEnv({ bloomSmoothing: v })} />
        </div>
      </Collapsible>

      <Collapsible label="Aerial Haze">
        <div className="space-y-1">
          <SliderRow label="Strength" value={env.hazeStrength} min={0} max={0.5} step={0.01}
            onChange={(v) => setEnv({ hazeStrength: v })} />
        </div>
      </Collapsible>

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
        <SliderRow label="Arch Scale" value={a.archScale} min={0.5} max={2.5} step={0.05}
          onChange={(v) => setArch({ archScale: v })} />
        <SliderRow label="Arch Rotation" value={a.archRotation} min={0} max={Math.PI * 2} step={0.01}
          onChange={(v) => setArch({ archRotation: v })} />
        <SliderRow label="Arch Y Offset" value={a.archYOffset} min={-50} max={50} step={1}
          onChange={(v) => setArch({ archYOffset: v })} />
        <div style={{ borderTop: '1px solid var(--outline-variant)', margin: '4px 0' }} />
        <SliderRow label="Horizon Radius" value={a.horizonRadius} min={400} max={2000} step={10}
          onChange={(v) => setArch({ horizonRadius: v })} />
        <SliderRow label="Fade Inner" value={a.horizonFadeInner} min={100} max={2000} step={10}
          onChange={(v) => setArch({ horizonFadeInner: v })} />
        <SliderRow label="Fade Outer" value={a.horizonFadeOuter} min={100} max={2000} step={10}
          onChange={(v) => setArch({ horizonFadeOuter: v })} />
      </div>
    </Collapsible>
  )
}

// ── Camera ──────────────────────────────────────────────────────────────────

export const SHOTS = {
  hero:   { position: [-400, 55, 230], target: [400, 45, -100], fov: 22, label: 'Hero' },
  browse: { position: [0, 600, 0.001], target: [0, 0, 0], up: [0, 0, -1], fov: 45, label: 'Browse' },
  street: { position: [0, 1.73, -50], target: [0, 1.73, -50.5], fov: 75, label: 'Street' },
}

// Live camera state bridge (R3F ↔ React DOM)
const cameraState = { position: [0, 0, 0], target: [0, 0, 0], fov: 22 }
const cameraPush = { pending: null } // DOM → R3F: set .pending to apply next frame
let cameraListeners = new Set()
function subscribeCameraState(fn) { cameraListeners.add(fn); return () => cameraListeners.delete(fn) }
function notifyCameraListeners() { for (const fn of cameraListeners) fn() }

export function StageCamera({ shot }) {
  const controlsRef = useRef()
  const { camera } = useThree()
  const applied = useRef(null)
  const frameCount = useRef(0)

  useEffect(() => {
    if (applied.current === shot) return
    applied.current = shot
    const s = SHOTS[shot]
    if (!s) return
    camera.position.set(...s.position)
    camera.fov = s.fov
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.set(...s.target)
      controlsRef.current.update()
    }
    // Map 'street' to 'planetarium' for useCamera (controls terrain exag)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
  }, [shot, camera])

  // Apply pending camera changes from DOM inputs
  // + broadcast live camera state every 10 frames
  useFrame(() => {
    const ctl = controlsRef.current
    if (!ctl) return

    // Apply any pending push from the panel
    if (cameraPush.pending) {
      const u = cameraPush.pending
      cameraPush.pending = null
      if (u.position) camera.position.set(...u.position)
      if (u.target) ctl.target.set(...u.target)
      if (u.fov != null) { camera.fov = u.fov; camera.updateProjectionMatrix() }
      ctl.update()
    }

    if (++frameCount.current % 10 !== 0) return
    const p = camera.position
    const t = ctl.target
    cameraState.position = [Math.round(p.x), Math.round(p.y), Math.round(p.z)]
    cameraState.target = [Math.round(t.x), Math.round(t.y), Math.round(t.z)]
    cameraState.fov = Math.round(camera.fov)
    notifyCameraListeners()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.15}
      minDistance={1}
      maxDistance={4000}
    />
  )
}

// ── Timeline (dawn-to-dawn with waypoint snaps + slider) ────────────────────

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function Timeline() {
  const currentTime = useTimeOfDay((s) => s.currentTime)
  const setTime = useTimeOfDay((s) => s.setTime)

  const dawnWindow = useMemo(() => getDawnWindow(currentTime), [
    currentTime.getFullYear(), currentTime.getMonth(),
    currentTime.getDate(), currentTime.getHours(),
  ])

  const waypoints = useMemo(() => {
    const mid = new Date((dawnWindow.start.getTime() + dawnWindow.end.getTime()) / 2)
    const times = SunCalc.getTimes(mid, LATITUDE, LONGITUDE)
    return [
      { label: 'Dawn', time: dawnWindow.start, color: 'var(--vic-coral)' },
      { label: 'Sunrise', time: times.sunrise, color: '#fb923c' },
      { label: 'Noon', time: times.solarNoon, color: 'var(--vic-gold)' },
      { label: 'Golden', time: times.goldenHour, color: '#fbbf24' },
      { label: 'Sunset', time: times.sunset, color: '#fb923c' },
      { label: 'Dusk', time: times.dusk, color: 'var(--vic-lavender)' },
      { label: 'Night', time: times.night, color: 'var(--vic-sky)' },
    ]
      .filter(w => w.time >= dawnWindow.start && w.time <= dawnWindow.end)
      .map(w => ({ ...w, fraction: dateToFraction(w.time, dawnWindow) }))
  }, [dawnWindow])

  const nowFrac = dateToFraction(currentTime, dawnWindow)

  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const fracFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const scrubTo = useCallback((frac) => {
    setTime(fractionToDate(frac, dawnWindow))
  }, [dawnWindow, setTime])

  return (
    <div className="space-y-1">
      {/* Waypoint buttons */}
      <div className="flex justify-between px-1">
        {waypoints.map(wp => (
          <button
            key={wp.label}
            onClick={() => setTime(wp.time)}
            className="text-caption leading-none transition-opacity hover:opacity-100 cursor-pointer"
            style={{ color: wp.color, opacity: 0.75 }}
          >
            {wp.label}
          </button>
        ))}
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          scrubTo(fracFromX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          scrubTo(fracFromX(e.clientX))
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
        }}
      >
        {/* Rail */}
        <div className="absolute inset-x-0 h-[4px] rounded-full top-1/2 -translate-y-1/2"
          style={{ background: 'var(--surface-container-high)' }} />

        {/* Waypoint tics */}
        {waypoints.map(wp => (
          <div key={wp.label}
            className="absolute w-[2px] h-[8px] top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{ left: `${wp.fraction * 100}%`, backgroundColor: wp.color, opacity: 0.5 }}
          />
        ))}

        {/* Thumb */}
        <div
          className="absolute w-[12px] h-[12px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none border-2 shadow-sm"
          style={{
            left: `${nowFrac * 100}%`,
            backgroundColor: dragging ? '#60a5fa' : '#4ade80',
            borderColor: dragging ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
          }}
        />
      </div>

      {/* Current time */}
      <div className="px-1">
        <span className="text-body-sm font-medium" style={{ color: 'var(--on-surface)' }}>
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  )
}

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
  return (
    <input
      type="number" value={value} step={step} min={min} max={max}
      style={{ ...inputStyle, width: 64 }}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
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

// ── Catmull-Rom interpolation ────────────────────────────────────────────────

function catmullRom(points, t, tension = 0.5) {
  const n = points.length
  if (n < 2) return points[0] || [0, 0, 0]
  const total = n - 1
  const segment = Math.min(Math.floor(t * total), total - 1)
  const local = t * total - segment

  const p0 = points[Math.max(0, segment - 1)]
  const p1 = points[segment]
  const p2 = points[Math.min(n - 1, segment + 1)]
  const p3 = points[Math.min(n - 1, segment + 2)]

  const alpha = tension
  const result = []
  for (let i = 0; i < 3; i++) {
    const t0 = local, t2 = t0 * t0, t3 = t2 * t0
    const m1 = alpha * (p2[i] - p0[i])
    const m2 = alpha * (p3[i] - p1[i])
    result.push(
      (2 * t3 - 3 * t2 + 1) * p1[i] +
      (t3 - 2 * t2 + t0) * m1 +
      (-2 * t3 + 3 * t2) * p2[i] +
      (t3 - t2) * m2
    )
  }
  return result
}

// ── Easing functions ────────────────────────────────────────────────────────

const EASINGS = {
  linear: (t) => t,
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  slowInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
}

// ── Default keyframes per shot ──────────────────────────────────────────────

export function defaultKeyframes(shotKey) {
  const s = SHOTS[shotKey]
  if (shotKey === 'hero') {
    return [
      { position: [-540, 55, 362], target: [260, 45, -32], fov: 22 },
      { position: [-400, 55, 230], target: [400, 45, -100], fov: 22 },
      { position: [-260, 55, 98], target: [540, 45, -168], fov: 22 },
    ]
  }
  return [{ position: [...s.position], target: [...s.target], fov: s.fov }]
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

function HeroCamera({ cam, keyframes, setKeyframes, heroMotion, setHeroMotion }) {
  const scrubT = useHeroScrub()
  const trackRef = useRef(null)
  const [scrubDragging, setScrubDragging] = useState(false)
  const [expandedKf, setExpandedKf] = useState(null)

  // Keyframe fractional positions along the path (evenly spaced)
  const kfFractions = keyframes.map((_, i) => i / (keyframes.length - 1))

  const fracFromX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  // When scrubbing manually, push camera to that position on the path
  const scrubTo = useCallback((t) => {
    heroScrub.t = t
    notifyHeroScrub()
    if (keyframes.length < 2) return
    const pos = catmullRom(keyframes.map(k => k.position), t, heroMotion.tension)
    const tgt = catmullRom(keyframes.map(k => k.target), t, heroMotion.tension)
    // Interpolate FOV across keyframes
    const segment = t * (keyframes.length - 1)
    const idx = Math.min(Math.floor(segment), keyframes.length - 2)
    const local = segment - idx
    const fov = keyframes[idx].fov + local * (keyframes[idx + 1].fov - keyframes[idx].fov)
    pushCamera({ position: pos.map(Math.round), target: tgt.map(Math.round), fov: Math.round(fov) })
  }, [keyframes, heroMotion.tension])

  // Jump to a keyframe
  const goToKeyframe = useCallback((i) => {
    const kf = keyframes[i]
    pushCamera({ position: [...kf.position], target: [...kf.target], fov: kf.fov })
    heroScrub.t = kfFractions[i]
    notifyHeroScrub()
  }, [keyframes, kfFractions])

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

        {/* Scrubber track with keyframe dots */}
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
          <div className="absolute inset-x-0 h-[4px] rounded-full top-1/2 -translate-y-1/2"
            style={{ background: 'var(--surface-container-high)' }} />

          {/* Keyframe dots (clickable) */}
          {kfFractions.map((frac, i) => (
            <div key={i}
              className="absolute w-[10px] h-[10px] rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 cursor-pointer border"
              style={{
                left: `${frac * 100}%`,
                backgroundColor: 'var(--vic-gold)',
                borderColor: 'rgba(255,255,255,0.5)',
                zIndex: 2,
              }}
              title={kfName(i, keyframes.length)}
              onClick={(e) => { e.stopPropagation(); goToKeyframe(i) }}
            />
          ))}

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

        {/* Keyframe labels under the scrubber */}
        <div className="relative h-3">
          {kfFractions.map((frac, i) => (
            <button key={i}
              className="absolute -translate-x-1/2 text-caption leading-none cursor-pointer transition-opacity hover:opacity-100"
              style={{ left: `${frac * 100}%`, color: 'var(--vic-gold)', opacity: 0.6, fontSize: 9 }}
              onClick={() => goToKeyframe(i)}
            >{kfName(i, keyframes.length)}</button>
          ))}
        </div>
      </div>

      {/* ── Motion parameters ───────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1">
          <SliderRow label="Period" value={heroMotion.period} min={60} max={1800} step={10} suffix="s"
            onChange={(v) => setHeroMotion({ ...heroMotion, period: v })} />
        </div>
        <div className="flex-1">
          <SliderRow label="Tension" value={heroMotion.tension} min={0} max={1} step={0.05}
            onChange={(v) => setHeroMotion({ ...heroMotion, tension: v })} />
        </div>
      </div>
      <div className="space-y-0.5">
        <span className="text-caption" style={{ color: 'var(--on-surface-variant)' }}>Easing</span>
        <select
          value={heroMotion.easing}
          onChange={(e) => setHeroMotion({ ...heroMotion, easing: e.target.value })}
          style={{
            background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
            color: 'var(--on-surface)', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--type-caption)', padding: '3px 6px', width: '100%', outline: 'none',
          }}
        >
          <option value="easeInOut">Ease In/Out</option>
          <option value="slowInOut">Slow In/Out</option>
          <option value="linear">Linear</option>
        </select>
      </div>

      {/* ── Keyframe cards (collapsible) ─────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--outline-variant)' }} />

      {keyframes.map((kf, i) => {
        const isOpen = expandedKf === i
        return (
          <div key={i} style={{
            borderRadius: 'var(--radius-sm)',
            background: isOpen ? 'var(--surface-container)' : 'transparent',
            padding: isOpen ? '6px 8px' : '0 8px',
          }}>
            <div className="flex items-center justify-between py-1 cursor-pointer"
              onClick={() => setExpandedKf(isOpen ? null : i)}>
              <span className="text-caption font-medium flex items-center gap-1.5" style={{ color: 'var(--on-surface)' }}>
                <span style={{ fontSize: 8, color: 'var(--on-surface-subtle)' }}>{isOpen ? '▾' : '▸'}</span>
                {kfName(i, keyframes.length)}
              </span>
              <div className="flex gap-1">
                <button className="text-caption px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  style={{ background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}
                  onClick={(e) => { e.stopPropagation(); goToKeyframe(i) }}
                >Go to</button>
                <button className="text-caption px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  style={{ background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    const next = [...keyframes]
                    next[i] = { position: [...cam.position], target: [...cam.target], fov: cam.fov }
                    setKeyframes(next)
                  }}
                >Set from view</button>
                {keyframes.length > 2 && i > 0 && i < keyframes.length - 1 && (
                  <button className="text-caption px-1 py-0.5 rounded cursor-pointer"
                    style={{ color: 'var(--error)' }}
                    onClick={(e) => { e.stopPropagation(); setKeyframes(keyframes.filter((_, j) => j !== i)) }}
                  >x</button>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="space-y-1.5 mt-1">
                <Vec3Input label="Position" value={kf.position}
                  onChange={(v) => { const next = [...keyframes]; next[i] = { ...kf, position: v }; setKeyframes(next) }} />
                <Vec3Input label="Target" value={kf.target}
                  onChange={(v) => { const next = [...keyframes]; next[i] = { ...kf, target: v }; setKeyframes(next) }} />
                <SliderRow label="FOV" value={kf.fov} min={5} max={120} suffix="°"
                  onChange={(v) => { const next = [...keyframes]; next[i] = { ...kf, fov: v }; setKeyframes(next) }} />
              </div>
            )}
          </div>
        )
      })}

      <button className="w-full py-1 rounded-lg text-caption font-medium cursor-pointer transition-colors"
        style={{ background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)', border: '1px solid var(--outline-variant)' }}
        onClick={() => {
          const last = keyframes[keyframes.length - 1]
          const prev = keyframes[keyframes.length - 2] || last
          setKeyframes([...keyframes.slice(0, -1), {
            position: last.position.map((v, j) => Math.round((v + prev.position[j]) / 2)),
            target: last.target.map((v, j) => Math.round((v + prev.target[j]) / 2)),
            fov: last.fov,
          }, last])
        }}
      >+ Add keyframe</button>
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

function HeroPreview({ keyframes, motion }) {
  const { camera } = useThree()
  const elapsed = useRef(0)

  useFrame(({ controls }, delta) => {
    if (!motion.preview || keyframes.length < 2) return
    const ctl = controls
    if (!ctl) return

    const speed = motion.speed || 1
    elapsed.current += delta * speed

    const easing = EASINGS[motion.easing] || EASINGS.easeInOut
    // Ping-pong: 0→1→0 over one period
    const raw = (elapsed.current % motion.period) / motion.period
    const pingPong = raw < 0.5 ? raw * 2 : 2 - raw * 2
    const t = easing(pingPong)

    // Broadcast scrub position to panel
    heroScrub.t = pingPong  // raw position before easing, so the playhead moves linearly
    notifyHeroScrub()

    const pos = catmullRom(keyframes.map(k => k.position), t, motion.tension)
    const tgt = catmullRom(keyframes.map(k => k.target), t, motion.tension)
    // Interpolate FOV per-segment
    const segment = t * (keyframes.length - 1)
    const idx = Math.min(Math.floor(segment), keyframes.length - 2)
    const local = segment - idx
    const fov = keyframes[idx].fov + local * (keyframes[idx + 1].fov - keyframes[idx].fov)

    camera.position.set(...pos)
    ctl.target.set(...tgt)
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    ctl.update()
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

function SurfaceGallery() {
  const [activeTab, setActiveTab] = useState('streets')
  const [selectedId, setSelectedId] = useState(null)

  const tab = SURFACE_CATALOG[activeTab]
  const selectedItem = selectedId ? tab.items.find(i => i.id === selectedId) : null

  return (
    <div className="space-y-2">
      <div className="section-heading">Surfaces</div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0.5">
        {SURFACE_TABS.map(key => (
          <button key={key}
            onClick={() => { setActiveTab(key); setSelectedId(null) }}
            className="px-1.5 py-0.5 rounded text-caption cursor-pointer transition-colors"
            style={{
              background: activeTab === key ? 'var(--surface-container-highest)' : 'transparent',
              color: activeTab === key ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
            }}
          >{SURFACE_CATALOG[key].label}</button>
        ))}
      </div>

      {/* Swatch grid */}
      <div className="flex flex-wrap gap-1.5 py-1">
        {tab.items.map(item => (
          <SurfaceSwatch key={item.id} item={item}
            selected={selectedId === item.id}
            onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
          />
        ))}
      </div>

      {/* Selected surface controls */}
      {selectedItem && (
        <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: selectedItem.color }} />
            <span className="text-body-sm font-medium" style={{ color: 'var(--on-surface)' }}>
              {selectedItem.label}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 60 }}>Color</span>
              <input type="color" value={selectedItem.color}
                style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onChange={() => {/* wired in 6B.3 */}}
              />
              <span className="text-caption font-mono" style={{ color: 'var(--on-surface-subtle)' }}>
                {selectedItem.color}
              </span>
            </div>
            <SliderRow label="Roughness" value={0.85} min={0} max={1} step={0.05}
              onChange={() => {/* wired in 6B.8 */}} />
            <Collapsible label="Emissive">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 60 }}>Color</span>
                  <input type="color" value="#000000"
                    style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    onChange={() => {}}
                  />
                </div>
                <SliderRow label="Night Intensity" value={0} min={0} max={1} step={0.05}
                  onChange={() => {}} />
              </div>
            </Collapsible>
            <Collapsible label="Texture">
              <div className="space-y-1">
                <select style={{
                  background: 'var(--surface-container)', border: '1px solid var(--outline-variant)',
                  color: 'var(--on-surface)', borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--type-caption)', padding: '3px 6px', width: '100%', outline: 'none',
                }}>
                  <option value="none">None</option>
                  <option value="gravel">Gravel</option>
                  <option value="asphalt">Asphalt</option>
                  <option value="concrete">Concrete</option>
                  <option value="grass">Grass</option>
                  <option value="brick">Brick</option>
                </select>
                <SliderRow label="Scale" value={1} min={0.1} max={5} step={0.1}
                  onChange={() => {}} />
              </div>
            </Collapsible>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stage Panel ─────────────────────────────────────────────────────────────

export function StagePanel({ shot, setShot, keyframes, setKeyframes, heroMotion, setHeroMotion, surfacesSlot }) {
  const cam = useCameraState()

  return (
    <div className="absolute top-4 right-4 bottom-4 w-80 flex flex-col gap-3 z-10 pointer-events-none overflow-y-auto"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--outline-variant) transparent' }}>

      {/* GPU budget — always visible at top */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <GpuBudgetBar />
      </div>

      {/* Shot selector — always visible */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <div className="section-heading mb-2">Shot</div>
        <div className="flex gap-1">
          {Object.entries(SHOTS).map(([key, s]) => (
            <button key={key}
              onClick={() => setShot(key)}
              className="flex-1 py-1.5 rounded-lg text-body-sm font-medium transition-colors cursor-pointer"
              style={{
                background: shot === key ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: shot === key ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                border: `1px solid ${shot === key ? 'var(--outline)' : 'var(--outline-variant)'}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Camera — collapsible, shot-specific */}
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

      {/* Timeline — always visible */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <div className="section-heading mb-2">Time of Day</div>
        <Timeline />
      </div>

      {/* Environment */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto">
        <Collapsible label="Environment" defaultOpen>
          <EnvironmentControls />
        </Collapsible>
      </div>

      {/* Surfaces — defaults to the standalone /stage mockup gallery; the
          cartograph passes its own store-bound material editor as
          `surfacesSlot` so per-Look styling lives here, not in a separate
          panel. Same visual home, real wiring. */}
      <div className="glass-panel rounded-xl p-3 pointer-events-auto flex-1 overflow-y-auto"
        style={{ minHeight: 200 }}>
        {surfacesSlot || <SurfaceGallery />}
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function StageApp() {
  const [shot, setShot] = useState('hero')
  const [keyframes, setKeyframes] = useState(() => defaultKeyframes('hero'))
  const [heroMotion, setHeroMotion] = useState({
    period: 720, tension: 0.5, easing: 'easeInOut', preview: false,
  })

  useEffect(() => {
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
  }, [shot])

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        frameloop="demand"
        camera={{ position: SHOTS.hero.position, fov: SHOTS.hero.fov, near: 1, far: 60000 }}
        gl={{
          alpha: false, antialias: true, stencil: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95,
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(0x2a2a26, 1)  // match terrain ground color
          camera.lookAt(...SHOTS.hero.target)
        }}
        dpr={[1, 1.5]}
        shadows="soft"
      >
        <StageShadows />
        <FrameLimiter />
        <TimeTicker />
        <SkyStateTicker />

        <CelestialBodies />
        <CloudDome />

        <R3FErrorBoundary name="StreetRibbons"><StreetRibbons /></R3FErrorBoundary>

        <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
        <R3FErrorBoundary name="LafayetteScene"><LafayetteScene /></R3FErrorBoundary>
        <R3FErrorBoundary name="StreetLights"><StreetLights /></R3FErrorBoundary>
        <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>

        <StageCamera shot={shot} />
        <SceneDiag />
        <GpuMeter />
        {shot === 'hero' && <HeroPreview keyframes={keyframes} motion={heroMotion} />}
        <PathLine keyframes={keyframes} tension={heroMotion.tension}
          visible={shot === 'hero' && heroMotion.preview} />
        <PostProcessing />
      </Canvas>

      <StagePanel shot={shot} setShot={setShot}
        keyframes={keyframes} setKeyframes={setKeyframes}
        heroMotion={heroMotion} setHeroMotion={setHeroMotion} />
    </div>
  )
}
