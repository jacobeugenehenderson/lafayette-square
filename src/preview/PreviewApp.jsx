/**
 * Preview — standalone runtime simulator at /preview.
 *
 * Reads only baked / flattened / reduced outputs. Per
 * `project_ls_parity_pipeline.md`: must reach LS parity, full fidelity.
 * The GPU monitor (right panel) governs additions — every layer toggle
 * notes a Δ-event so spikes are tagged with their cause.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import InstancedTrees from '../components/InstancedTrees'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import CelestialBodies from '../components/CelestialBodies'
import Atmosphere from '../components/Atmosphere'
import WeatherPoller from '../components/WeatherPoller'
import AtmosphereDirectiveDriver from '../components/AtmosphereDirectiveDriver'
import WeatherEffects from '../components/WeatherEffects'
import Terrain from '../components/Terrain'
import BakedLamps from '../components/BakedLamps'
import GatewayArch from '../components/GatewayArch'
import LafayettePark from '../components/LafayettePark'
import { SHOTS, computeBrowseAltitude, FALLBACK_HERO_SUBJECT } from '../stage/StageApp.jsx'
import { useSceneJson } from '../lib/useSceneJson.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import BakedGround from '../components/BakedGround.jsx'
import { INSTANCE } from '../instance.js'
import DawnTimeline from '../components/DawnTimeline'
import { V_EXAG } from '../utils/terrainShader'
import LafayetteScene from '../components/LafayetteScene'
import PreviewPostFx from './PreviewPostFx'
import { ExposureTicker, StageFog, StageShadows, LampGlowDriver } from '../components/PostProcessing.jsx'
import PhoneFrame, { BODY_W as PHONE_FRAME_W, BODY_H as PHONE_FRAME_H } from './PhoneFrame'
import StripChart from './StripChart'
import TriggerBar from './TriggerBar'
import { createCameraTween } from './cameraTween'
import { heroKeyframeAnim } from './heroAnim.js'
import { browseUpFromHeading } from '../lib/browseHeading.js'
import { stop as phoneBusStop, startSpan as phoneBusStartSpan, endSpan as phoneBusEndSpan } from './phoneBus'
import {
  GpuMonitorTicker, GpuPanel, noteEvent, measureToggle,
  getLayerCost, layerCostSubscribe,
} from './GpuMonitor'

function BasicLights() {
  return (
    <>
      <hemisphereLight args={['#bcd4ff', '#3a3a30', 0.6]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[120, 200, 80]} intensity={2.2} color="#fff5e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1} shadow-camera-far={1800}
        shadow-camera-left={-900} shadow-camera-right={900}
        shadow-camera-top={900} shadow-camera-bottom={-900}
        shadow-bias={-0.0001}
      />
    </>
  )
}

function ForceDaytimeOnMount() {
  const setTime = useTimeOfDay((s) => s.setTime)
  useEffect(() => {
    const d = new Date(); d.setHours(10, 30, 0, 0); setTime(d)
  }, [setTime])
  return null
}
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
// Preview targets a continuously-rendering runtime (mobile/desktop app).
// frameloop="always" is more honest about cost than demand+invalidate.
// FrameLimiter no longer needed — Canvas drives the loop.

// Resolve a shot's target pose (position/target/fov), accounting for
// browse's aspect-fit altitude. Pure — no side effects.
function resolveShotPose(shot, aspect) {
  const s = SHOTS[shot]
  if (!s) return null
  let pos = s.position
  if (shot === 'browse') {
    const y = computeBrowseAltitude(aspect, s.fov)
    pos = [s.position[0], y, s.position[2]]
  }
  return { pos, target: s.target, fov: s.fov, up: s.up || [0, 1, 0] }
}

// Reused temp for the hero keyframe pose (allocation-free hot path).
const _heroPos = new THREE.Vector3()

function ShotCamera({ shot, setShot }) {
  const { camera, size, gl } = useThree()
  const controlsRef = useRef()
  const tweenRef = useRef(null)
  const lastShotRef = useRef(null)

  // Hero is an auto-playing cinematic pan; a deliberate drag (>6px) or wheel
  // must interrupt it and pull back to Browse — mirrors production's Hero↔Browse
  // exit gesture (Scene.jsx CameraRig). The per-frame pan keeps overriding the
  // camera so OrbitControls can't visibly rotate; this just detects intent.
  useEffect(() => {
    if (shot !== 'hero') return
    const canvas = gl.domElement
    let downXY = null
    const onDown = (e) => { downXY = { x: e.clientX, y: e.clientY } }
    const onMove = (e) => {
      if (!downXY) return
      const dx = e.clientX - downXY.x, dy = e.clientY - downXY.y
      if (dx * dx + dy * dy > 36) { downXY = null; setShot('browse') }
    }
    const onUp = () => { downXY = null }
    const onWheel = () => setShot('browse')
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [shot, gl, setShot])

  if (!tweenRef.current) tweenRef.current = createCameraTween()
  const tween = tweenRef.current

  // Authored hero animation from the slab (same data Stage's HeroPreview
  // plays). Falls back to the static hero pose for an unauthored Look.
  const scene = useSceneJson(resolvePreviewLookId())
  const heroKeyframes = scene?.heroKeyframes?.length
    ? scene.heroKeyframes
    : [{ position: SHOTS.hero.position, fov: SHOTS.hero.fov }]
  const heroMotion = scene?.heroMotion || { period: 720, easing: 'sine' }
  const heroSubject = Array.isArray(scene?.heroSubject) ? scene.heroSubject : FALLBACK_HERO_SUBJECT
  const browseHeadingDeg = scene?.browseHeading?.values?.value ?? 0

  // Resolve the pose for a shot transition. Hero uses the keyframe path's
  // start (+ subject as target) so the tween lands on the authored path
  // instead of the legacy static center, avoiding a snap when the per-frame
  // animation below takes over. Browse up comes from the authored heading
  // (cosmetic screen orientation) — same scene.browseHeading production reads.
  function poseFor(shotKey, aspect) {
    if (shotKey === 'hero') {
      const { fov } = heroKeyframeAnim(0, heroKeyframes, heroMotion, _heroPos)
      return { pos: [_heroPos.x, _heroPos.y, _heroPos.z], target: heroSubject, fov, up: [0, 1, 0] }
    }
    const pose = resolveShotPose(shotKey, aspect)
    if (shotKey === 'browse' && pose) pose.up = browseUpFromHeading(browseHeadingDeg)
    return pose
  }

  // Fire a transition when shot changes. First mount = instant set
  // (no tween) so the initial Hero pose is honest from frame 0.
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const pose = poseFor(shot, aspect)
    if (!pose) return

    const isFirstMount = lastShotRef.current == null
    lastShotRef.current = shot

    if (isFirstMount) {
      camera.position.set(...pose.pos)
      camera.up.set(...pose.up)
      camera.fov = pose.fov
      camera.lookAt(...pose.target)
      camera.updateProjectionMatrix()
      if (controlsRef.current) {
        controlsRef.current.target.set(...pose.target)
        controlsRef.current.update()
      }
      return
    }

    // Tween from current pose to new pose. Up vector snaps because
    // mid-tween up flips look bad; we accept the snap on entry.
    camera.up.set(...pose.up)
    const ctl = controlsRef.current
    const fromTarget = ctl
      ? [ctl.target.x, ctl.target.y, ctl.target.z]
      : pose.target
    const duration = shot === 'hero' ? 2500 : 1500
    if (ctl) ctl.enabled = false
    const spanId = `camera:${shot}:${performance.now()}`
    phoneBusStartSpan(spanId, 'camera', `→${shot}`, '#7dd3fc')
    tween.start({
      from: {
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: fromTarget,
        fov: camera.fov,
      },
      to: { pos: pose.pos, target: pose.target, fov: pose.fov },
      duration,
      ease: 'easeInOutCubic',
      label: `→${shot}`,
      onUpdate: (p, t, fov) => {
        camera.position.copy(p)
        camera.fov = fov
        camera.updateProjectionMatrix()
        if (ctl) {
          ctl.target.copy(t)
          ctl.update()
        } else {
          camera.lookAt(t.x, t.y, t.z)
        }
      },
      onComplete: () => {
        if (ctl) ctl.enabled = true
        phoneBusEndSpan(spanId)
        phoneBusStop()
      },
    })
  }, [shot, camera, size.width, size.height])

  // Drive the tween every frame; when idle in Hero, play the AUTHORED
  // keyframe animation (slab heroKeyframes/heroMotion, look at heroSubject)
  // so Preview matches Stage and reflects what the operator tuned — not
  // production's legacy lateral pan.
  useFrame(({ clock }) => {
    if (tween.isActive()) { tween.tick(performance.now()); return }
    if (shot !== 'hero') return
    const { fov } = heroKeyframeAnim(clock.elapsedTime, heroKeyframes, heroMotion, _heroPos)
    camera.position.copy(_heroPos)
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix() }
    const ctl = controlsRef.current
    if (ctl) {
      ctl.target.set(heroSubject[0], heroSubject[1], heroSubject[2])
      // Direct position control — bypass damping so it doesn't fight the anim.
      ctl.enableDamping = false
      ctl.update()
      ctl.enableDamping = true
    } else {
      camera.lookAt(heroSubject[0], heroSubject[1], heroSubject[2])
    }
  })

  // Browse: LEFT-drag pans, wheel zooms; RIGHT-drag is the hidden 360° orbit.
  // Other shots: full orbit defaults.
  const isBrowse = shot === 'browse'
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

const TOOLBAR_SHOTS = SHOTS

const APP_BAR_H = 48

// Shot adjacency graph — mirrors LS production gestures: Hero ↔ Browse,
// Browse ↔ Street. No direct Hero ↔ Street edge.
const SHOT_ADJACENCY = {
  hero:   new Set(['browse']),
  browse: new Set(['hero', 'street']),
  street: new Set(['browse']),
}
function shotReachable(currentShot, candidateShot) {
  if (currentShot === candidateShot) return true
  const adj = SHOT_ADJACENCY[currentShot]
  return !adj || adj.has(candidateShot)
}

function TopAppBar({ shot, setShot, mode, setMode }) {
  const btn = (k, label, active, onClick, disabled = false) => (
    <button key={k} onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Not reachable from the current shot in production' : undefined}
      className={`rounded-lg px-3 py-1 ${disabled ? '' : 'cursor-pointer'} ${active ? 'glass-text' : 'glass-text-secondary'}`}
      style={{
        fontSize: 13,
        background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
        opacity: disabled ? 0.35 : 1,
      }}>{label}</button>
  )
  const divider = (key) => (
    <span key={key} style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 8px' }} />
  )
  return (
    <div className="absolute z-20 flex items-center pointer-events-auto"
      style={{
        top: 0, left: 0, right: 0, height: APP_BAR_H,
        padding: '0 12px', gap: 4,
        background: 'rgba(20,20,22,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
      }}>
      <a href="/cartograph" className="rounded-lg px-3 py-1 cursor-pointer glass-text-secondary"
        style={{ fontSize: 13, textDecoration: 'none' }}>← Stage</a>
      {divider('d1')}
      <span className="rounded-lg px-3 py-1 glass-text-dim"
        style={{ fontSize: 13, background: 'rgba(255,255,255,0.04)' }}>Lafayette Square ▼</span>
      <div style={{ flex: 1 }} />
      {btn('desktop', 'Desktop', mode === 'desktop', () => { setMode('desktop'); noteEvent('mode→desktop') })}
      {btn('phone', 'Phone', mode === 'phone', () => { setMode('phone'); noteEvent('mode→phone') })}
      {divider('d2')}
      {Object.entries(TOOLBAR_SHOTS).map(([k, s]) =>
        btn(k, s.label, shot === k, () => { setShot(k); noteEvent(`shot→${k}`) }, !shotReachable(shot, k))
      )}
    </div>
  )
}

const SCENE_LAYERS = [
  ['ground',     'Ground + AO'],
  ['buildings',  'Buildings'],
  ['trees',      'Trees'],
  ['park',       'Park (paths/water/canopy)'],
  ['lights',     'Streetlamps'],
  ['arch',       'Gateway Arch'],
  ['neon',       'Neon'],
  ['celestial',  'Sky + Sun'],
  ['clouds',     'Clouds'],
  ['fog',        'Atmospheric Fog'],
]
const FX_LAYERS = [
  ['ao',     'N8AO'],
  ['bloom',  'Bloom'],
  ['aerial', 'Aerial Perspective'],
  ['grade',  'Film Grade'],
  ['grain',  'Film Grain'],
]

// TEMPORARY DEFAULTS — these belong in design.json#/postFx, not in
// Preview's source. Per `feedback_stage_is_source_preview_is_mirror.md`:
// Stage authors, Look serializes, Preview reads. When phone-profile.json
// lands, the field-of-truth moves there and this object goes away.
//   neon  — now mounts via <SceneNeon> (parity pass 2026-05-26); the
//           Preview toggle forces all tubes on, mirroring Stage's Force
//           Neon On QA bypass so cost is profiled worst-case.
//   fog   — <StageFog> reads scene.mist; on by default for parity.
//   bloom — known-broken pending tree atlas work (project_bloom_diagnosis_actual.md);
//           default off so reloads don't burn into a black scene.
//   AO + aerial + grade + grain — full-fidelity desktop targets, on
const DEFAULT_LAYERS = {
  ground: true, buildings: true, trees: true,
  park: true, lights: true, arch: true, neon: true,
  celestial: true, clouds: true, fog: true,
  ao: true, bloom: false, aerial: true, grade: true, grain: true,
}

const LAYERS_KEY = 'preview.layers.v1'
function loadLayers() {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYERS
  try {
    const raw = localStorage.getItem(LAYERS_KEY)
    if (!raw) return DEFAULT_LAYERS
    return { ...DEFAULT_LAYERS, ...JSON.parse(raw) }
  } catch { return DEFAULT_LAYERS }
}
function saveLayers(layers) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) }
  catch { /* ignore quota / disabled */ }
}

// Mobile frame budget — bars are anchored to ms (the only thing that
// directly determines smoothness). Draws + tris are shown numerically
// for context, but they don't drive the bar color: a layer that takes
// 1ms but uploads a million tris is fine on modern GPUs.
const BUDGET_MS = 16

function LayerRow({ layerKey, label, on, onToggle, disabled }) {
  const [, force] = useState(0)
  useEffect(() => layerCostSubscribe(() => force(n => n + 1)), [])
  const cost = getLayerCost(layerKey)

  const absMs    = cost ? Math.max(0, cost.ms)    : 0
  const absCalls = cost ? Math.max(0, cost.calls) : 0
  const absTris  = cost ? Math.max(0, cost.tris)  : 0

  const msPct = (absMs / BUDGET_MS) * 100
  const color =
    !cost ? 'rgba(255,255,255,0.18)'
    : msPct > 100 ? 'var(--error, #ff5566)'
    : msPct > 66  ? 'var(--warning, #f5a623)'
    : msPct > 33  ? '#fbbf24'
    : 'var(--success, #4ade80)'

  const fmt = (n) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
                  : n >= 1_000     ? `${(n/1_000).toFixed(1)}K`
                  : `${Math.round(n)}`

  return (
    <div style={{ opacity: disabled ? 0.4 : 1 }}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          onChange={(e) => {
            measureToggle(layerKey, e.target.checked)
            onToggle(e.target.checked)
            noteEvent(`${layerKey}=${e.target.checked ? 'on' : 'off'}`)
          }}
        />
        <span className="glass-text-secondary" style={{ flex: 1, fontSize: 12 }}>{label}</span>
      </label>
      <div className="flex items-center gap-2" style={{ paddingLeft: 22, marginTop: 2 }}>
        <div style={{
          flex: 1, height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(100, msPct)}%`, height: '100%',
            background: color, transition: 'width 200ms ease',
          }} />
        </div>
        <span className="font-mono glass-text-dim" style={{
          fontSize: 10, minWidth: 110, textAlign: 'right',
        }}>
          {cost
            ? `${absMs.toFixed(1)}ms · ${fmt(absCalls)}d · ${fmt(absTris)}t`
            : '—'}
        </span>
      </div>
    </div>
  )
}

function TimeControl() {
  return (
    <div className="space-y-2">
      <div className="section-heading">Time of Day</div>
      <DawnTimeline />
    </div>
  )
}

function ProfilerTab({ tab, setTab }) {
  const btn = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className="glass-panel rounded-md"
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        opacity: tab === id ? 1 : 0.5,
        cursor: 'pointer',
      }}
    >{label}</button>
  )
  return (
    <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
      {btn('strip', 'strip')}
      {btn('gpu', 'gpu')}
    </div>
  )
}

function RightPanel({ layers, setLayer, top, bottom }) {
  return (
    <div className="absolute z-10 flex flex-col gap-3 pointer-events-auto overflow-y-auto"
      style={{ top, right: 24, bottom, width: RIGHT_PANEL_W }}>
      <div className="glass-panel rounded-xl p-3">
        <TimeControl />
      </div>

      <div className="glass-panel rounded-xl p-3 space-y-2">
        <div className="section-heading">Scene</div>
        <div className="space-y-1">
          {SCENE_LAYERS.map(([key, label]) => (
            <LayerRow key={key} layerKey={key} label={label}
              on={!!layers[key]}
              onToggle={(v) => setLayer(key, v)} />
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-xl p-3 space-y-2">
        <div className="section-heading">Post-FX</div>
        <div className="space-y-1">
          {FX_LAYERS.map(([key, label]) => (
            <LayerRow key={key} layerKey={key} label={label}
              on={!!layers[key]} onToggle={(v) => setLayer(key, v)} />
          ))}
        </div>
      </div>
    </div>
  )
}

const MODE_KEY = 'preview.mode.v1'
function loadMode() {
  if (typeof localStorage === 'undefined') return 'desktop'
  try { return localStorage.getItem(MODE_KEY) || 'desktop' } catch { return 'desktop' }
}
function saveMode(m) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
}

const RIGHT_PANEL_W = 400
const RIGHT_PANEL_GUTTER = 24
const STAGE_PADDING = 24
// Default phone display scale — 0.65 keeps a Pro Max reading as a phone, not a billboard,
// and leaves room beneath for the strip-chart band.
const PHONE_TARGET_SCALE = 0.65

function usePhoneScale(active) {
  const [scale, setScale] = useState(PHONE_TARGET_SCALE)
  useEffect(() => {
    if (!active) return
    const compute = () => {
      const sw = window.innerWidth - RIGHT_PANEL_W - RIGHT_PANEL_GUTTER * 2 - STAGE_PADDING * 2
      // Reserve vertical room for the strip-chart band: 220 chart + 32 trigger row + ~24 gap.
      const sh = window.innerHeight - APP_BAR_H - STAGE_PADDING * 2 - 280
      const fit = Math.min(sw / PHONE_FRAME_W, sh / PHONE_FRAME_H)
      // Use target scale unless the window is too small, then shrink to fit.
      setScale(Math.max(0.3, Math.min(PHONE_TARGET_SCALE, fit)))
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [active])
  return scale
}

export default function PreviewApp() {
  const [shot, setShot] = useState('hero')
  const [mode, setModeRaw] = useState(loadMode)
  const setMode = (m) => { setModeRaw(m); saveMode(m) }
  const [layers, setLayers] = useState(loadLayers)
  const [profilerTab, setProfilerTab] = useState('strip')
  const setLayer = (k, v) => setLayers(prev => {
    const next = { ...prev, [k]: v }
    saveLayers(next)
    return next
  })
  // Soft-reload counter: bumping this remounts CanvasContents (forces
  // BakedGround/Buildings/Trees to re-fetch + re-mount). True cold
  // reload comes later via sessionStorage handoff.
  const [reloadKey, setReloadKey] = useState(0)
  const onReload = () => setReloadKey(n => n + 1)

  const isPhone = mode === 'phone'
  const phoneScale = usePhoneScale(isPhone)

  // Stage spans from below the app bar to the bottom of the window, leaving
  // room for the right panel. In Phone mode it draws the dark backdrop and
  // centers the phone horizontally within the available area; the future
  // strip-chart band will sit below the phone.
  const STAGE_RIGHT = RIGHT_PANEL_W + RIGHT_PANEL_GUTTER * 2  // 448
  const stageStyle = isPhone
    ? {
        position: 'absolute',
        top: APP_BAR_H, left: 0, bottom: 0, right: STAGE_RIGHT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        background: '#141416',
        padding: STAGE_PADDING,
        gap: STAGE_PADDING,
      }
    : { position: 'absolute', top: APP_BAR_H, left: 0, right: 0, bottom: 0 }

  const canvas = (
    <Canvas
      frameloop="always"
      camera={{ position: SHOTS.hero.position, fov: SHOTS.hero.fov, near: 1, far: 60000 }}
      gl={{
        alpha: false, antialias: true, stencil: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // toneMappingExposure now derives from scene.exposure (SC.3,
        // 2026-05-13) via the shared PostProcessing consumer.
        // Logarithmic depth buffer — parity with Cartograph Stage. See
        // cartograph/FEATURES.md §"Layering / coplanar stacking".
        logarithmicDepthBuffer: true,
      }}
      dpr={[1, 1.5]}
      shadows="soft"
      onCreated={({ camera }) => camera.lookAt(...SHOTS.hero.target)}
    >
      <CanvasContents key={reloadKey} layers={layers} shot={shot} setShot={setShot} />
    </Canvas>
  )

  const panelTop = APP_BAR_H + STAGE_PADDING
  const panelBottom = STAGE_PADDING

  return (
    <div className="fixed inset-0" style={{ background: isPhone ? '#141416' : '#a8c8e8' }}>
      <div style={stageStyle}>
        {isPhone ? (
          <>
            <div style={{
              flex: 1, minHeight: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PhoneFrame scale={phoneScale}>{canvas}</PhoneFrame>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TriggerBar shot={shot} setShot={setShot} onReload={onReload} />
                </div>
                <ProfilerTab tab={profilerTab} setTab={setProfilerTab} />
              </div>
              {profilerTab === 'strip'
                ? <StripChart height={220} />
                : <div className="glass-panel rounded-xl p-3"><GpuPanel /></div>}
            </div>
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0 }}>{canvas}</div>
        )}
      </div>

      <TopAppBar shot={shot} setShot={setShot} mode={mode} setMode={setMode} />
      <RightPanel layers={layers} setLayer={setLayer} top={panelTop} bottom={panelBottom} />
    </div>
  )
}

function resolvePreviewLookId() {
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

function CanvasContents({ layers, shot, setShot }) {
  const lookId = resolvePreviewLookId()
  return (
    <>
      <TimeTicker />
      <SkyStateTicker />
      <ForceDaytimeOnMount />
      <GpuMonitorTicker />
      <ExposureTicker lookId={lookId} />

      {/* Atmosphere driver chain — same as production. Without these,
          useAtmosphere.tweenedDirective is never populated and <Atmosphere>
          renders no clouds. WeatherPoller fetches live conditions,
          AtmosphereDirectiveDriver blends the per-Look cloud directive,
          WeatherEffects renders precipitation. */}
      <WeatherPoller />
      <AtmosphereDirectiveDriver lookId={lookId} />
      <WeatherEffects />

      {/* Hidden Terrain — keeps the shared terrainExag uniform live (drives
          ribbon/building Y displacement). Mesh itself stays invisible, as in
          production. */}
      <group visible={false}>
        <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
      </group>

      {/* Channel-driven soft shadows (size/samples from scene.shadow) —
          matches Stage + production. Canvas already runs shadows="soft". */}
      <StageShadows lookId={lookId} />
      {/* Atmospheric fog (FogExp2 from scene.mist) — Stage mounts this; it
          was previously absent from Preview entirely. */}
      {layers.fog && <StageFog lookId={lookId} />}
      {/* Lamp-glow uniforms (grass pools / tree emissive / pool radial) from
          scene.lampGlow — the same driver production now mounts. Without it
          the uniforms stay at dead defaults and lamp pools never appear. */}
      <LampGlowDriver lookId={lookId} />

      {layers.celestial
        ? <R3FErrorBoundary name="CelestialBodies"><CelestialBodies /></R3FErrorBoundary>
        : <BasicLights />}
      {layers.clouds && <R3FErrorBoundary name="Atmosphere"><Atmosphere /></R3FErrorBoundary>}

      <Suspense fallback={null}>
        {layers.ground    && <R3FErrorBoundary name="BakedGround"><BakedGround lookId={lookId} targetExag={shot === 'street' ? 1 : shot === 'browse' ? 0 : V_EXAG} /></R3FErrorBoundary>}
        {/* Buildings — the SAME live LafayetteScene production renders (not a
            baked merged-mesh proxy). hiddenLayers gates buildings + neon per
            the Preview toggles; neon forced on for inspection. This component
            also owns Foundations + <SceneNeon> + street labels, matching the
            production render tree exactly. */}
        <R3FErrorBoundary name="LafayetteScene">
          <LafayetteScene
            lookId={lookId}
            hiddenLayers={{ building: !layers.buildings, neon: !layers.neon }}
            forceNeonOn={layers.neon || undefined}
          />
        </R3FErrorBoundary>
        {layers.trees && <R3FErrorBoundary name="InstancedTrees">
          <InstancedTrees lookId={lookId} />
        </R3FErrorBoundary>}
        {layers.park   && <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>}
        {layers.lights && <R3FErrorBoundary name="StreetLights"><BakedLamps /></R3FErrorBoundary>}
        {layers.arch   && <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>}
      </Suspense>

      <ShotCamera shot={shot} setShot={setShot} />

      <PreviewPostFx
        lookId={lookId}
        ao={layers.ao} bloom={layers.bloom} aerial={layers.aerial}
        grade={layers.grade} grain={layers.grain}
      />
    </>
  )
}
