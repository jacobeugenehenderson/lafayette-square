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
import { invalidateTreeAtlas } from '../components/treeAtlasMaterial'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import CelestialBodies from '../components/CelestialBodies'
import Atmosphere from '../components/Atmosphere'
import CloudDome from '../components/CloudDome'
import { SKY_IS_VOLUMETRIC } from '../lib/skyMode'
import WeatherPoller from '../components/WeatherPoller'
import AtmosphereDirectiveDriver from '../components/AtmosphereDirectiveDriver'
import WeatherEffects from '../components/WeatherEffects'
import Terrain from '../components/Terrain'
import BakedLamps from '../components/BakedLamps'
import GatewayArch from '../components/GatewayArch'
import LafayettePark from '../components/LafayettePark'
import { SHOTS, computeBrowseAltitude } from '../stage/StageApp.jsx'
import { resolveHeroSubject } from '../lib/heroSubject.js'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex'
import { useSceneJson } from '../lib/useSceneJson.js'
import useCamera from '../hooks/useCamera'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import BakedGround from '../components/BakedGround.jsx'
import { INSTANCE } from '../instance.js'
import DawnTimeline from '../components/DawnTimeline'
import { V_EXAG } from '../utils/terrainShader'
import LafayetteScene from '../components/LafayetteScene'
import CityModel from '../components/CityModel'
import SlabBuildings from '../components/SlabBuildings'
import { RENDER_TIERS } from '../lib/renderTiers.js'
import { setActiveProfileId } from './deviceProfiles'
// Preview mounts the SHARED PostProcessing consumer with `inspect` (the per-pass
// toggle matrix) — the retired PreviewPostFx forked its own composer + driver.
import { PostProcessing, ExposureTicker, StageFog, StageShadows, LampGlowDriver } from '../components/PostProcessing.jsx'
import PhoneFrame, { BODY_W as PHONE_FRAME_W, BODY_H as PHONE_FRAME_H } from './PhoneFrame'
import StripChart from './StripChart'
import TriggerBar from './TriggerBar'
import { createCameraTween } from './cameraTween'
import { transitionMs } from '../camera/transitions.js'
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
  const slabIndex = useSlabBuildingIndex((s) => s.index)
  const heroKeyframes = scene?.heroKeyframes?.length
    ? scene.heroKeyframes
    : [{ position: SHOTS.hero.position, fov: SHOTS.hero.fov }]
  const heroMotion = scene?.heroMotion || { period: 720, easing: 'sine' }
  // Hero look-at via the SHARED resolver — parity with production CameraRig.
  // Undesignated → the authored Gateway Arch (scene.arch.values); building/
  // landmark → the slab index. (project_camera_framing_slab_contract)
  const heroSubject = resolveHeroSubject(scene?.heroSubject, { slabIndex, archValues: scene?.arch?.values })
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

    // Tween from current pose to new pose — IDENTICAL to production now
    // (camera-SSOT, 2026-06-21): durations from transitions.js (Hero→Browse
    // 2400ms) and a SMOOTH up-vector tilt into overhead (the shared tween lerps
    // + normalizes `up`; no more snap).
    const ctl = controlsRef.current
    const fromUp = [camera.up.x, camera.up.y, camera.up.z]
    const fromTarget = ctl
      ? [ctl.target.x, ctl.target.y, ctl.target.z]
      : pose.target
    const duration = transitionMs(shot)
    if (ctl) ctl.enabled = false
    const spanId = `camera:${shot}:${performance.now()}`
    phoneBusStartSpan(spanId, 'camera', `→${shot}`, '#7dd3fc')
    tween.start({
      from: {
        pos: [camera.position.x, camera.position.y, camera.position.z],
        target: fromTarget,
        fov: camera.fov,
        up: fromUp,
      },
      to: { pos: pose.pos, target: pose.target, fov: pose.fov, up: pose.up },
      duration,
      ease: 'easeInOutCubic',
      label: `→${shot}`,
      onUpdate: (p, t, fov, _e, u) => {
        camera.position.copy(p)
        camera.fov = fov
        if (u) camera.up.copy(u)        // smooth up-tilt across the glide
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
        camera.up.set(...pose.up)        // settle exactly on target up
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
        style={{ fontSize: 13, background: 'rgba(255,255,255,0.04)' }}>{INSTANCE.name} ▼</span>
      <div style={{ flex: 1 }} />
      {btn('desktop',  'Desktop',  mode === 'desktop',  () => { setMode('desktop');  noteEvent('mode→desktop') })}
      {btn('phone-hi', 'Phone hi', mode === 'phone-hi', () => { setMode('phone-hi'); noteEvent('mode→phone-hi') })}
      {btn('phone-lo', 'Phone lo', mode === 'phone-lo', () => { setMode('phone-lo'); noteEvent('mode→phone-lo') })}
      {divider('d2')}
      {Object.entries(TOOLBAR_SHOTS).map(([k, s]) =>
        btn(k, s.label, shot === k, () => { setShot(k); noteEvent(`shot→${k}`) }, !shotReachable(shot, k))
      )}
    </div>
  )
}

// ── Preview layer-toggle convention (Vernier, 2026-05-26) ──────────────────
// Every Scene-layer toggle gates `.visible` (a <group visible={...}> wrapper,
// or an `enabled`-style prop for non-drawn drivers like fog), NEVER the mount.
// Rationale: Preview is production's render tree + inspection bolt-ons over the
// top (project_preview_equals_ls_literally) — "all on" must equal production's
// literal mount list, and a toggle must be a clean per-frame on/off, not a
// destructive unmount/dispose/re-upload that churns the GPU meter.
//   - A layer whose cost is a draw (geometry) → wrap in <group visible>.
//   - A layer that is a scene property (fog) → pass an `enabled` prop; the
//     component nulls the property instead of unmounting.
//   - The ONE sanctioned mount-gate is the live LafayetteScene buildings:
//     production unmounts them (the slab is the rendered path), so they stay
//     unmounted here too — visibility-gating ~1082 dead meshes would regress
//     production. The Buildings toggle gates the SLAB's .visible.
//   - PostFX is the exception: the composer can only add/remove passes, so FX
//     toggles mount/unmount their pass. Accepted (cheap, full-screen) — but
//     the same transient caveat applies to FX deltas.
// Migration A/B flags (e.g. a tree-impostor on/off during a cutover) are
// TEMPORARY: ship as one extra toggle, then collapse to a single .visible
// toggle once the new path is operator-confirmed. (This is the convention
// Azimuth's Phase-C tree-impostor flag adopts — the retired `slabBuildings`
// A/B is the worked example.)
const SCENE_LAYERS = [
  ['ground',     'Ground'],
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
  ['aerial', 'Halo'],   // label matches the Stage control (Sky & Light → Halo); key stays `aerial` (the AerialPerspective effect)
  ['grade',  'Film Grade'],
  ['grain',  'Film Grain'],
  ['smaa',   'SMAA (AA)'],
  ['dof',    'DoF (WIP)'],   // two-focal depth-of-field — verify via ?dofDebug=1
]

// TEMPORARY DEFAULTS — these belong in design.json#/postFx, not in
// Preview's source. Per `feedback_stage_is_source_preview_is_mirror.md`:
// Stage authors, Look serializes, Preview reads. When phone-profile.json
// lands, the field-of-truth moves there and this object goes away.
//   neon  — now mounts via <SceneNeon> (parity pass 2026-05-26); the
//           Preview toggle forces all tubes on, mirroring Stage's Force
//           Neon On QA bypass so cost is profiled worst-case.
//   fog   — <StageFog> reads scene.mist; on by default for parity.
//   bloom — SOUND (the "known-broken pending tree-atlas work" flag was stale —
//           cleared 2026-06-21, Jacob; the cited project_bloom_diagnosis_actual.md
//           never existed). Kept default-off here only so a reload doesn't burn
//           into a black scene; revisit defaulting it on for production parity.
//   AO + aerial + grade + grain — full-fidelity desktop targets, on
const DEFAULT_LAYERS = {
  // `buildings` gates the merged-mesh slab's visibility (production ships the
  // L1.3 slab; the live LafayetteScene buildings stay unmounted, as in
  // production). The old `slabBuildings` A/B toggle was retired in Phase 2 —
  // there is now one Buildings toggle, gating .visible.
  ground: true, buildings: true, trees: true,
  park: true, lights: true, arch: true, neon: true,
  celestial: true, clouds: true, fog: true,
  ao: true, bloom: false, aerial: true, grade: true, grain: true, smaa: true,
  dof: false,   // WIP two-focal DoF — off by default; toggle to verify/tune
}

// v3 (Vernier Phase 2): retired the `slabBuildings` A/B key — one `buildings`
// toggle now gates the slab's .visible. Old v2 state is dropped (defaults
// reapply) and its key cleaned up, since the buildings semantics changed.
const LAYERS_KEY = 'preview.layers.v3'
const LAYERS_KEY_PREV = 'preview.layers.v2'
function loadLayers() {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYERS
  try {
    if (localStorage.getItem(LAYERS_KEY_PREV)) localStorage.removeItem(LAYERS_KEY_PREV)
    const raw = localStorage.getItem(LAYERS_KEY)
    if (!raw) return DEFAULT_LAYERS
    // Drop any retired keys (e.g. slabBuildings) not in DEFAULT_LAYERS.
    const saved = JSON.parse(raw)
    const next = { ...DEFAULT_LAYERS }
    for (const k of Object.keys(DEFAULT_LAYERS)) if (k in saved) next[k] = saved[k]
    return next
  } catch { return DEFAULT_LAYERS }
}
function saveLayers(layers) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) }
  catch { /* ignore quota / disabled */ }
}

const fmtNum = (n) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
                    : n >= 1_000     ? `${(n/1_000).toFixed(1)}K`
                    : `${Math.round(n)}`

// The per-layer metric a row ranks on. Scene layers are geometry — ranked by
// DRAW CALLS (the mobile-critical number; tris shown for context). Post-FX are
// full-screen passes with ~0 geometry — their cost is MS, so showing them
// against a draw/tri budget read "post-fx · N triangles", nonsense. They rank
// on ms instead. (Vernier Phase 2 redraw — Jacob's eye, 2026-06-18.)
function layerMetricValue(cost, metric) {
  if (!cost) return 0
  return metric === 'ms' ? Math.max(0, cost.ms) : Math.max(0, cost.calls)
}

// A layer row = a RANKED HOG. The bar is this layer's share of the HEAVIEST
// layer in its group (heaviest = full bar), in absolute units — NOT a budget %.
// Dividing one layer's draws by the whole-DEVICE budget produced "Trees 1004%"
// (a single layer can dwarf the per-frame ceiling); that's a category error.
// Budget-% is a SCENE-TOTAL question and now lives in the verdict (GpuPanel).
// Heat is RELATIVE WEIGHT (which layers are the hogs), not a good/bad call.
function LayerRow({ layerKey, label, on, onToggle, disabled, metric, groupMax }) {
  const cost = getLayerCost(layerKey)
  const draws = cost ? Math.max(0, cost.calls) : 0
  const tris  = cost ? Math.max(0, cost.tris)  : 0
  const ms    = cost ? Math.max(0, cost.ms)    : 0

  const value = layerMetricValue(cost, metric)
  const share = groupMax > 0 ? value / groupMax : 0      // 0..1 of the heaviest
  const pct = share * 100
  const color =
    !cost ? 'rgba(255,255,255,0.18)'
    : share > 0.66 ? 'var(--warning, #f5a623)'   // the hogs
    : share > 0.33 ? '#fbbf24'
    : '#5eead4'                                   // light — teal, not "good/green"

  const readout = !cost ? '—'
    : metric === 'ms' ? `${ms.toFixed(1)} ms`
    : `${fmtNum(draws)}d · ${fmtNum(tris)}t`

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
            width: `${Math.min(100, pct)}%`, height: '100%',
            background: color, transition: 'width 200ms ease',
          }} />
        </div>
        <span className="font-mono glass-text-dim" style={{
          fontSize: 10, minWidth: 110, textAlign: 'right',
        }}>
          {readout}
        </span>
      </div>
    </div>
  )
}

// A toggle group (Scene / Post-FX). Subscribes once to layer-cost changes,
// computes the group's heaviest cost (its metric), and feeds every row its
// share. Keeping a single subscription here (vs. per-row) is what lets the
// share-of-heaviest bar stay consistent across rows on the same render.
function LayerSection({ title, layerList, layers, setLayer, metric, footer, defaultExpanded = false }) {
  const [, force] = useState(0)
  useEffect(() => layerCostSubscribe(() => force(n => n + 1)), [])
  // Twirl-collapsible, collapsed by default — there's a lot of roster to look at
  // but only a little to see at any moment (Jacob, 2026-06-24). Open to toggle.
  const [expanded, setExpanded] = useState(defaultExpanded)
  let groupMax = 0
  for (const [key] of layerList) {
    const v = layerMetricValue(getLayerCost(key), metric)
    if (v > groupMax) groupMax = v
  }
  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center"
        style={{ gap: 6, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-block', width: 10, color: 'var(--on-surface-subtle)',
          transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▸</span>
        <span className="section-heading" style={{ marginBottom: 0 }}>{title}</span>
      </button>
      {expanded && (
        <>
          <div className="space-y-1">
            {layerList.map(([key, label]) => (
              <LayerRow key={key} layerKey={key} label={label}
                metric={metric} groupMax={groupMax}
                on={!!layers[key]} onToggle={(v) => setLayer(key, v)} />
            ))}
          </div>
          {footer}
        </>
      )}
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

// How to read the per-layer numbers — caveats that, unstated, would mislead
// (Vernier Phase 2). Bars rank by share of the heaviest layer (relative weight,
// not a budget call — that's the scene verdict); render cost, not memory;
// non-additive; neon forced on.
function SceneCaveats() {
  return (
    <div className="glass-text-dim" style={{
      fontSize: 9.5, lineHeight: 1.5, paddingTop: 6, marginTop: 2,
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div><b>ranked by share of heaviest</b> — bars show each layer's draws relative to the biggest hog, not a budget %. The budget call is the scene verdict (gpu tab).</div>
      <div><b>render cost, not memory</b> — toggles hide a layer (skip its draw); geometry stays GPU-resident.</div>
      <div><b>deltas don't sum</b> — overdraw is shared (hiding trees also cuts buildings' fill); trust the all-on total, not the sum of layers.</div>
      <div><b>neon forced on</b> — all tubes lit for worst-case profiling, unlike production's authored/TOD-gated neon.</div>
    </div>
  )
}

function FxCaveats() {
  return (
    <div className="glass-text-dim" style={{
      fontSize: 9.5, lineHeight: 1.5, paddingTop: 6, marginTop: 2,
      borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div><b>post-FX cost is ms</b> — full-screen passes draw no geometry; ranked by frame-time, not draws/tris.</div>
    </div>
  )
}

// Pyramid tuner — edits the ACTIVE environment's blur bracket (meta phase 2).
// The SAME panel for every env (the "same-but-different" surface); switching the
// env toggle swaps which env's degree these sliders bind to. Levels/radius/
// resolution update the live pyramid without a composer rebuild.
function PyramidTuner({ envId, degree, onChange }) {
  if (!degree) return null
  const row = (key, label, min, max, step, digits) => (
    <div className="space-y-0.5" key={key}>
      <div className="flex items-baseline justify-between">
        <span className="glass-text-secondary" style={{ fontSize: 12 }}>{label}</span>
        <span className="font-mono glass-text-dim" style={{ fontSize: 11 }}>
          {Number(degree[key]).toFixed(digits)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step}
        value={Number(degree[key])}
        onChange={(e) => onChange(key, parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: '#5eead4' }} />
    </div>
  )
  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      <div className="section-heading">Pyramid · {envId}</div>
      {row('levels', 'Levels', 1, 8, 1, 0)}
      {row('resolutionScale', 'Resolution', 0.1, 1, 0.05, 2)}
      {row('radius', 'Radius', 0, 1, 0.05, 2)}
      <div className="glass-text-dim" style={{ fontSize: 9, lineHeight: 1.4 }}>
        The blur bracket for this environment — fewer levels / lower resolution =
        cheaper, tighter bloom + DoF. Switch the env toggle to bracket another tier.
      </div>
    </div>
  )
}

function RightPanel({ layers, setLayer, top, bottom, envId, degree, onTuneDegree }) {
  return (
    <div className="absolute z-10 flex flex-col gap-3 pointer-events-auto overflow-y-auto"
      style={{ top, right: 24, bottom, width: RIGHT_PANEL_W }}>
      {/* Time of Day stays at the very top. */}
      <div className="glass-panel rounded-xl p-3">
        <TimeControl />
      </div>

      {/* Pyramid tuner leads the tools — the active tool; stays open. The roster
          cards below twirl-collapse (default closed) to cut the clutter. */}
      <PyramidTuner envId={envId} degree={degree} onChange={onTuneDegree} />

      <LayerSection title="Scene" layerList={SCENE_LAYERS} layers={layers}
        setLayer={setLayer} metric="draws" footer={<SceneCaveats />} />

      <LayerSection title="Post-FX" layerList={FX_LAYERS} layers={layers}
        setLayer={setLayer} metric="ms" footer={<FxCaveats />} />
    </div>
  )
}

const MODE_KEY = 'preview.mode.v1'
// Environments = device-regime tiers (same ids as deviceProfiles / renderTiers).
// Extended from the old binary desktop|phone — the mode toggle IS the env
// selector (the device-regime workflow, meta phase 1). phone-hi/phone-lo both
// render the phone frame; they differ in the render degree (pyramid bracket).
const ENV_IDS = ['desktop', 'phone-hi', 'phone-lo']
function loadMode() {
  if (typeof localStorage === 'undefined') return 'desktop'
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (raw === 'phone') return 'phone-hi'             // migrate the old binary value
    return ENV_IDS.includes(raw) ? raw : 'desktop'
  } catch { return 'desktop' }
}
function saveMode(m) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
}

// Editable per-environment pyramid degrees (the tuner edits these; meta phase 2).
// Seeded from RENDER_TIERS, persisted, merged over defaults so new envs/keys
// always resolve. Same load/save shape as the layer matrix.
const TIERS_KEY = 'preview.renderTiers.v1'
function loadTiers() {
  if (typeof localStorage === 'undefined') return RENDER_TIERS
  try {
    const raw = localStorage.getItem(TIERS_KEY)
    if (!raw) return RENDER_TIERS
    const saved = JSON.parse(raw)
    const next = {}
    for (const id of Object.keys(RENDER_TIERS)) {
      next[id] = { pyramid: { ...RENDER_TIERS[id].pyramid, ...(saved[id]?.pyramid || {}) } }
    }
    return next
  } catch { return RENDER_TIERS }
}
function saveTiers(t) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(TIERS_KEY, JSON.stringify(t)) } catch { /* ignore */ }
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

// The Preview canvas's WebGL renderer, captured at onCreated — so the Publish
// panel can grab the current SLAB frame (the 3D render only; the UI panels are
// separate DOM overlays, never on the canvas) for the link-preview image.
let _ogCaptureGL = null
// Center-crop the live slab frame to a square JPEG data URL (for og:image).
function captureOGImage(size = 1200) {
  const gl = _ogCaptureGL
  if (!gl?.domElement) throw new Error('scene not ready')
  const src = gl.domElement
  const s = Math.min(src.width, src.height)
  const off = document.createElement('canvas')
  off.width = size; off.height = size
  off.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size)
  return off.toDataURL('image/jpeg', 0.9)
}

// ── Publish panel — the gate (PREVIEW.md §0.2). Preview is the publish gate;
// this is the button that ships the verified slab the canon way: bake → commit
// the look's slab → push STAGING (its own URL, the dry-run) → verify there →
// PROMOTE to prod. Talks to the dev-only serve.js git endpoints via the vite
// proxy (`/api/cartograph/*`). In a DEPLOYED Preview there is no backend, so
// the status probe fails and the whole panel renders null — it can't touch the
// live app. (HANDOFF: gated two-step ceremony, 2026-06-30.)
function PublishPanel({ lookId }) {
  const [status, setStatus] = useState(null)   // object = backend up; false = none
  const [busy, setBusy] = useState(null)        // 'staging' | 'prod' | null
  const [msg, setMsg] = useState(null)          // { kind:'ok'|'err', text }
  const [deploys, setDeploys] = useState({ staging: null, prod: null }) // {status:'building'|'ready', bakedAt, url}
  const [capturing, setCapturing] = useState(false)
  const [smsStage, setSmsStage] = useState('capture') // capture → push → pushing → live (in-memory; a refresh just resets to capture, by design)
  const API = `/api/cartograph/looks/${encodeURIComponent(lookId)}`

  async function load() {
    try {
      const r = await fetch(`${API}/publish/status`)
      if (!r.ok) return setStatus(false)
      setStatus(await r.json())
    } catch { setStatus(false) }   // no dev backend (deployed Preview) → hide
  }
  useEffect(() => { load() }, [lookId])  // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the LIVE site (server-side via the backend → no browser CORS) until its
  // bakedAt matches what we pushed → the deploy has propagated. Flips the row to
  // "ready" + reveals Visit; never auto-opens (no stale tab, no 10-min ambush).
  useEffect(() => {
    const pending = Object.entries(deploys).filter(([, d]) => d && d.status === 'building')
    if (!pending.length) return
    let cancelled = false
    const tick = async () => {
      for (const [key, d] of pending) {
        try {
          const j = await (await fetch(`${API}/deployed?target=${key}`)).json()
          if (!cancelled && j.bakedAt != null && String(j.bakedAt) === String(d.bakedAt)) {
            setDeploys(prev => ({ ...prev, [key]: { ...prev[key], status: 'ready' } }))
          }
        } catch { /* keep polling */ }
      }
    }
    const iv = setInterval(tick, 15000); tick()
    return () => { cancelled = true; clearInterval(iv) }
  }, [deploys, API])  // eslint-disable-line react-hooks/exhaustive-deps

  async function publishStaging() {
    setBusy('staging'); setMsg(null)
    try {
      const bake = await fetch(`${API}/bake`, { method: 'POST' })
      if (!bake.ok) throw new Error(`bake failed: ${(await bake.text()).slice(0, 160)}`)
      const pub = await fetch(`${API}/publish`, { method: 'POST' })
      const data = await pub.json()
      if (!pub.ok || data.error) throw new Error(data.error || 'publish failed')
      const n = data.changed?.length || 0
      setMsg({ kind: 'ok', text: `Pushed to staging${data.committed ? ` · ${n} file${n === 1 ? '' : 's'}` : ' · no slab change'}` })
      setDeploys(prev => ({ ...prev, staging: { status: 'building', bakedAt: data.bakedAt, url: data.stagingUrl } }))
      await load()
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(null)
  }

  async function promoteProd() {
    if (!window.confirm(`Promote the current staging build to PRODUCTION (${INSTANCE.domain})?`)) return
    setBusy('prod'); setMsg(null)
    try {
      const r = await fetch(`${API}/promote`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'promote failed')
      setMsg({ kind: 'ok', text: `Promoted to prod · ${data.promoted} commit${data.promoted === 1 ? '' : 's'}` })
      setDeploys(prev => ({ ...prev, prod: { status: 'building', bakedAt: data.bakedAt, url: data.prodUrl } }))
      await load()
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setBusy(null)
  }

  // Stage 1: snapshot the current slab frame → center-square JPEG → save it.
  async function smsCapture() {
    setCapturing(true); setMsg(null)
    try {
      const dataUrl = captureOGImage()  // current slab frame (no UI) → center-square JPEG
      const r = await fetch('/api/cartograph/og-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'save failed')
      setSmsStage('push')
      setMsg({ kind: 'ok', text: `Captured · ${Math.round(data.bytes / 1024)} KB` })
    } catch (e) { setMsg({ kind: 'err', text: String(e.message || e) }) }
    setCapturing(false)
  }

  // Poll prod (server-side) until the live OG image == the captured one.
  function pollOgLive() {
    return new Promise(resolve => {
      let n = 0
      const iv = setInterval(async () => {
        n += 1
        try { const j = await (await fetch('/api/cartograph/og-deployed')).json(); if (j.live) { clearInterval(iv); resolve(true); return } } catch { /* keep polling */ }
        if (n >= 40) { clearInterval(iv); resolve(false) }   // ~10 min cap @ 15s
      }, 15000)
    })
  }

  // Stage 2: commit the captured image (+ any slab changes) and ship straight to
  // PROD. Staging adds nothing for a slab-data publish — Preview is the gate.
  async function smsPush() {
    setSmsStage('pushing'); setMsg(null)
    try {
      const pub = await (await fetch(`${API}/publish`, { method: 'POST' })).json()
      if (pub.error) throw new Error(pub.error)
      const prom = await (await fetch(`${API}/promote`, { method: 'POST' })).json()
      if (prom.error) throw new Error(prom.error)
      setMsg({ kind: 'ok', text: 'Going live…' })
      const live = await pollOgLive()
      setSmsStage('live')
      setMsg({ kind: 'ok', text: live ? 'Live ✓' : 'Still deploying…' })
      await load()
    } catch (e) { setSmsStage('push'); setMsg({ kind: 'err', text: String(e.message || e) }) }
  }

  if (!status) return null   // probing or no backend → render nothing
  const aheadStaging = status.vsStaging?.ahead || 0
  const aheadProd = status.vsProd?.ahead || 0
  const btn = (extra) => ({ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 6, ...extra })
  const deployRow = (key, label) => {
    const d = deploys[key]
    if (!d) return null
    const ready = d.status === 'ready'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11 }}>
        <span style={{ color: ready ? '#4ade80' : '#fbbf24' }}>{ready ? '✓' : '○'} {label} {ready ? 'live' : 'deploying…'}</span>
        {ready && <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', color: '#bfdbfe', textDecoration: 'underline' }}>Visit →</a>}
      </div>
    )
  }
  // The SMS-hero multistate button: Capture → Push (straight to prod) → Live.
  const sms = {
    capture: { label: capturing ? 'Capturing…' : '📷 Capture SMS Hero', onClick: smsCapture, bg: 'rgba(168,85,247,0.18)', color: '#e9d5ff' },
    push:    { label: '🚀 Push SMS Hero', onClick: smsPush, bg: 'rgba(74,222,128,0.20)', color: '#bbf7d0' },
    pushing: { label: 'Pushing…', onClick: null, bg: 'rgba(74,222,128,0.10)', color: '#bbf7d0' },
    live:    { label: '✓ SMS Hero live — recapture', onClick: () => { setSmsStage('capture'); setMsg(null) }, bg: 'rgba(96,165,250,0.16)', color: '#bfdbfe' },
  }[smsStage]

  return (
    <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 50, width: 236, background: 'rgba(16,14,12,0.72)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12, color: '#e9e6e2', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontWeight: 700 }}>Publish</span>
        <span style={{ opacity: 0.55, fontSize: 11 }}>{status.branch}</span>
      </div>
      {status.unbaked && <div style={{ color: '#fbbf24', marginBottom: 6 }}>⚠ Unbaked edits — Publish bakes first.</div>}
      <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
        {aheadStaging > 0 ? `${aheadStaging} ahead of staging` : 'staging up to date'}<br />
        {aheadProd > 0 ? `${aheadProd} ahead of prod` : 'prod up to date'}
      </div>
      <button disabled={!!busy || capturing || smsStage === 'pushing'} onClick={sms.onClick}
        style={btn({ background: sms.bg, color: sms.color, opacity: (busy || capturing || smsStage === 'pushing') ? 0.6 : 1 })}
        title="Snapshot the current slab view (center-square, no UI) as the SMS/link-preview image, then ship to prod">
        {sms.label}
      </button>
      <button disabled={!!busy} onClick={publishStaging}
        style={btn({ background: busy === 'staging' ? 'rgba(96,165,250,0.25)' : 'rgba(96,165,250,0.18)', color: '#bfdbfe', opacity: busy ? 0.6 : 1 })}>
        {busy === 'staging' ? 'Publishing…' : 'Publish to Staging'}
      </button>
      {deployRow('staging', 'Staging')}
      <button disabled={!!busy || aheadProd === 0} onClick={promoteProd}
        style={btn({ background: 'rgba(74,222,128,0.16)', color: '#bbf7d0', opacity: (busy || aheadProd === 0) ? 0.45 : 1 })}>
        {busy === 'prod' ? 'Promoting…' : 'Promote to Prod'}
      </button>
      {deployRow('prod', 'Prod')}
      {msg && <div style={{ marginTop: 8, color: msg.kind === 'err' ? '#f87171' : '#4ade80', wordBreak: 'break-word' }}>{msg.text}</div>}
    </div>
  )
}

export default function PreviewApp() {
  const [shot, setShot] = useState('hero')
  // Per-shot look resolve (channel-variant cascade): Preview drives a LOCAL
  // `shot`, but `useSceneJson` resolves shotLooks off the camera store. Production
  // drives `useCamera.viewMode`; Preview deliberately does NOT (it owns its own
  // camera), so without this the browse/street fork never applied in Preview —
  // every shot showed the base/Hero look. Publish a dedicated `shotOverride`
  // field that ONLY useSceneJson reads (no other viewMode consumer touches it),
  // so this can't perturb terrain-exag / clouds / frameloop. Cleared on unmount.
  useEffect(() => {
    useCamera.setState({ shotOverride: shot })
    return () => useCamera.setState({ shotOverride: null })
  }, [shot])
  const lookId = resolvePreviewLookId()
  const [mode, setModeRaw] = useState(loadMode)
  const setMode = (m) => { setModeRaw(m); saveMode(m) }
  // The active environment's editable pyramid degree (tuner-backed, persisted).
  const [tiers, setTiers] = useState(loadTiers)
  const activeDegree = (tiers[mode] || tiers.desktop).pyramid
  const setActiveDegree = (key, value) => setTiers(prev => {
    const cur = prev[mode] || prev.desktop
    const next = { ...prev, [mode]: { pyramid: { ...cur.pyramid, [key]: value } } }
    saveTiers(next)
    return next
  })
  // The env selector also drives which device the gauges judge against (the
  // active-profile re-aim — meta phase 3). Covers initial mount + every switch.
  useEffect(() => { setActiveProfileId(mode) }, [mode])
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
  const onReload = () => {
    // Drop the module-cached tree atlas for this Look so the remount RE-FETCHES
    // trees-atlas.json (fresh generatedAt → fresh ?v= on the GLB URLs). Without
    // this, the soft-reload reuses the stale _cache manifest and the trees show
    // the pre-rebake geometry until a full browser hard-reload — the recurring
    // "stale leaves in Preview after a rebake" trap (2026-06-24).
    invalidateTreeAtlas(resolvePreviewLookId())
    setReloadKey(n => n + 1)
  }

  const isPhone = mode !== 'desktop'
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
        // Lets "Capture hero → preview" read the current slab frame off the
        // canvas between renders. Preview-only (production Scene omits it).
        preserveDrawingBuffer: true,
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
      onCreated={({ camera, gl }) => { camera.lookAt(...SHOTS.hero.target); _ogCaptureGL = gl }}
    >
      <CanvasContents key={reloadKey} layers={layers} shot={shot} setShot={setShot} tier={mode} pyramidDegree={activeDegree} />
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
      <RightPanel layers={layers} setLayer={setLayer} top={panelTop} bottom={panelBottom}
        envId={mode} degree={activeDegree} onTuneDegree={setActiveDegree} />
      {!isPhone && <PublishPanel lookId={lookId} />}
    </div>
  )
}

function resolvePreviewLookId() {
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

function CanvasContents({ layers, shot, setShot, tier, pyramidDegree }) {
  const lookId = resolvePreviewLookId()
  // Baked layer visibility — the park title honors scene.json.layerVis, same as
  // every other layer (re-bake propagates the panel toggle to the slab).
  const scene = useSceneJson(lookId)
  // ?dofDebug=1 paints the DoF CoC zones (green = sharp, red = full blur) — the
  // shared dofDriver reads window.__dofDebug. (Formerly set by PreviewPostFx's
  // DofDriver; that fork is retired, so Preview sets it here.)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dofDebug') === '1') window.__dofDebug = 1
  }, [])
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
          was previously absent from Preview entirely. Always mounted now;
          the toggle nulls scene.fog via `enabled` (fog is a scene property,
          not a drawn layer) so there's no mount churn (Vernier Phase 1b). */}
      <StageFog lookId={lookId} enabled={layers.fog} />
      {/* Lamp-glow uniforms (grass pools / tree emissive / pool radial) from
          scene.lampGlow — the same driver production now mounts. Without it
          the uniforms stay at dead defaults and lamp pools never appear. */}
      <LampGlowDriver lookId={lookId} />

      {/* Celestial + clouds visibility-gated, both always mounted. When
          celestial is off, the always-mounted BasicLights takes over via its
          own visibility — no mount swap. group.visible=false skips the
          subtree's draws AND lights, so "all on" == production (CelestialBodies
          visible, BasicLights dark = zero contribution) (Vernier Phase 1b).
          BasicLights is a Preview-only inspection fallback (no production
          analog) — held resident-but-hidden, never drawn in the all-on path. */}
      <group visible={layers.celestial}>
        <R3FErrorBoundary name="CelestialBodies"><CelestialBodies /></R3FErrorBoundary>
      </group>
      <group visible={!layers.celestial}>
        <BasicLights />
      </group>
      <group visible={layers.clouds}>
        {/* Sky renderer stopgap (skyMode): cheap <CloudDome/> ships,
            <Atmosphere/> slab mounts under ?sky=volumetric. */}
        <R3FErrorBoundary name="Atmosphere">{SKY_IS_VOLUMETRIC ? <Atmosphere /> : <CloudDome />}</R3FErrorBoundary>
      </group>

      <Suspense fallback={null}>
        <group visible={layers.ground}>
          <R3FErrorBoundary name="BakedGround"><BakedGround lookId={lookId} targetExag={shot === 'street' ? 1 : shot === 'browse' ? 0 : V_EXAG} /></R3FErrorBoundary>
        </group>
        {/* Buildings (Phase 2 — collapsed to one toggle). LafayetteScene's
            live Building+Foundations stay unmounted always (`building: true`),
            exactly like production where the slab replaces them — it's kept
            mounted only for <SceneNeon> + street labels + landmark markers +
            click-catcher. The single "Buildings" toggle gates the rendered
            SlabBuildings' .visible below. `neon` gates .visible inside
            LafayetteScene (the toggle, not a mount). */}
        <R3FErrorBoundary name="LafayetteScene">
          <LafayetteScene
            lookId={lookId}
            hiddenLayers={{ building: true, neon: !layers.neon, parkTitle: scene?.layerVis?.parkTitle === false }}
            forceNeonOn={layers.neon || undefined}
            labelViewMode={shot}
          />
        </R3FErrorBoundary>
        {/* Slab buildings (L1.3) — the rendered buildings path, as in
            production. Always mounted, .visible-gated by the single Buildings
            toggle: a clean per-frame draws/tris on-off (Vernier Phase 2). */}
        <group visible={layers.buildings}>
          <R3FErrorBoundary name="SlabBuildings"><SlabBuildings lookId={lookId} interactive={false} /></R3FErrorBoundary>
          {/* Same consumer as Stage + production — Preview is the publish-confidence
              gate, so it must render production's exact tree. */}
          <R3FErrorBoundary name="CityModel"><CityModel lookId={lookId} interactive={false} /></R3FErrorBoundary>
        </group>
        {/* Trees / Park / Streetlamps / Arch — visibility-gated (always
            mounted, baked assets resident). Each toggle is a clean per-frame
            draws/tris on-off with no dispose/re-upload (Vernier Phase 1b). */}
        <group visible={layers.trees}>
          <R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={lookId} /></R3FErrorBoundary>
        </group>
        <group visible={layers.park}>
          <R3FErrorBoundary name="LafayettePark"><LafayettePark /></R3FErrorBoundary>
        </group>
        <group visible={layers.lights}>
          <R3FErrorBoundary name="StreetLights"><BakedLamps /></R3FErrorBoundary>
        </group>
        <group visible={layers.arch}>
          <R3FErrorBoundary name="GatewayArch"><GatewayArch /></R3FErrorBoundary>
        </group>
      </Suspense>

      <ShotCamera shot={shot} setShot={setShot} />

      {/* The SHARED post-FX consumer (no overrides → resolves the baked
          scene.json channels, exactly like production). `inspect.toggles` is the
          per-pass visibility matrix — Preview's sanctioned divergence: an FX
          toggle mounts/unmounts its pass to measure it. tier/pyramidDegree are
          vestigial for post-FX (DownsamplePyramid renders a fixed ladder,
          ignoring degree) — kept until the v0.2 measurement regime re-homes the
          per-platform inclusion here. */}
      <PostProcessing lookId={lookId} inspect={{ toggles: layers }} />
    </>
  )
}
