import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { MapControls, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

// Map geometry (rendered in every shot)
import MapLayers from './MapLayers.jsx'
import BakedGround from '../components/BakedGround.jsx'

// Designer-only (aerial + authoring overlays)
import AerialBase, { AerialFocus } from './AerialTiles.jsx'
import SurveyorOverlay from './SurveyorOverlay.jsx'
import MeasureOverlay from './MeasureOverlay.jsx'
import CornerEditHandles from './CornerEditHandles.jsx'
import BlockGeometryV2Debug from './BlockGeometryV2Debug.jsx'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import { DesignerArch } from './DesignerArch.jsx'

// Shot-only (environment paint-in)
import LafayetteScene from '../components/LafayetteScene'
import LafayettePark from '../components/LafayettePark'
import InstancedTrees from '../components/InstancedTrees'
import StreetLights from '../components/StreetLights'
import BakedLamps from '../components/BakedLamps'
import GatewayArch from '../components/GatewayArch'
import CelestialBodies from '../components/CelestialBodies'
import Atmosphere from '../components/Atmosphere'
import CloudDome from '../components/CloudDome'
import { SKY_IS_VOLUMETRIC } from '../lib/skyMode'
import WeatherPoller from '../components/WeatherPoller'
import AtmosphereDirectiveDriver from '../components/AtmosphereDirectiveDriver'
import WeatherEffects from '../components/WeatherEffects'
import Terrain from '../components/Terrain'
import { V_EXAG } from '../utils/terrainShader'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import { SHOTS, computeBrowseAltitude, HeroPreview, resolveHeroSubject, useHeroAuthoring } from '../stage/StageApp.jsx'
import { PostProcessing, StageFog, StageShadows } from '../components/PostProcessing.jsx'
import { createCameraTween } from '../preview/cameraTween.js'
import { transitionMs } from '../camera/transitions.js'
import { buildings as _allBuildings } from '../data/buildings'

// Toy scene fixtures (single 4-way corner for shader/shadow R&D)
import toyRibbons from '../data/toy/toy-ribbons.json'
import ribbonsRaw from '../data/ribbons.json'
import lsNeighborhoodBoundary from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'
import toyLamps from '../data/toy/toy-lamps.json'
import ToyBuildings from '../toy/ToyBuildings.jsx'
import ToyTrees from '../toy/ToyTrees.jsx'
import ToyTerrain from '../toy/ToyTerrain.jsx'

// UI
import Toolbar from './Toolbar.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal, { defaultKeyframes } from './StagePanel.jsx'
import CartographSkyLight from './CartographSkyLight.jsx'
import CartographPost from './CartographPost.jsx'
import { lampGlow as _lampGlowUniforms } from '../preview/lampGlowState.js'
import { neon as _neonUniforms } from '../preview/neonState.js'
import { resolveLampGlowAtMinute, resolveGroupAtMinute, getTodSlotMinutes } from './animatedParam.js'
import {
  NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS,
} from './skyLightChannels.js'
import BakeModal from './BakeModal.jsx'
import CartographSurfaces from './CartographSurfaces.jsx'

// Hooks + store
import useCartographStore, { activeChannel } from './stores/useCartographStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import useCamera from '../hooks/useCamera'

const CAM_KEY = 'cartograph-camera'

// Pre-set time to noon so sky starts with daylight
useTimeOfDay.getState().setHour(12)

// ── LampGlow pump ──────────────────────────────────────────────────────────
// Reads the active Look's lampGlow envelope + todSlots from the store and
// pushes the resolved per-channel value into the shared lampGlowState
// uniforms each frame. Each channel is either flat ({value}) — pumped
// directly — or animated ({animated:'tod', values, transitionIn/Out}) —
// resolved against the current TOD minute.
// Neon pump — same shape as LampGlowPump. Resolves the per-Look neon
// channel (group of 3: core/tube/bleed) at the current TOD minute and
// writes into the module-scoped uniforms NeonBands' shader holds.
// Sky / lighting / celestial channels flow into CelestialBodies via
// `<channel>Override` props (threaded from the store below). The
// consumer resolves per-frame internally — no module-scope pump
// intermediary needed. LampGlow + Neon still pump because their
// consumers (NeonBands + grass/lamp shaders) read from module-scoped
// uniforms — different surface, intentionally unchanged.

function NeonPump() {
  useFrame(() => {
    const neon = activeChannel(useCartographStore.getState(), 'neon')
    if (!neon) return
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = neon.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveGroupAtMinute(neon, minute, slotMinutes, NEON_FIELD_KEYS, NEON_FLAT_DEFAULTS)
    _neonUniforms.coreUniform.value       = triple.core       ?? 0
    _neonUniforms.tubeUniform.value       = triple.tube       ?? 0
    _neonUniforms.bleedUniform.value      = triple.bleed      ?? 0
    _neonUniforms.emissiveUniform.value   = triple.emissive   ?? 4
    _neonUniforms.tubeRadiusUniform.value = triple.tubeRadius ?? 1.0
  })
  return null
}

function LampGlowPump() {
  useFrame(() => {
    // Resolve the active shot's lampGlow (channel-variant cascade) so a forked
    // shot's lamp wash pumps live in the Stage; unforked → base.
    const lampGlow = activeChannel(useCartographStore.getState(), 'lampGlow')
    if (!lampGlow) return
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = lampGlow.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveLampGlowAtMinute(lampGlow, minute, slotMinutes)
    _lampGlowUniforms.grassUniform.value = triple.grass
    _lampGlowUniforms.treesUniform.value = triple.trees
    // poolUniform is driven by StreetLights (pool follows the lantern's output).
  })
  return null
}

// ── Per-shot look override banner (channel-variant cascade, Phase 2) ─────────
// Implicit fork: editing any LOOK channel while a browse/street shot is active
// records that change as the shot's override (activeChannel/channelPatch in the
// store). Hero IS the base look. This banner appears ONLY once the active shot
// has recorded overrides, offering "Reset to Hero" (drop all of this shot's
// overrides → follow base again). Per-channel revert lives on each channel's
// header. Renders nothing otherwise → the panel stays clean until you diverge.
function ShotLookFork({ shot }) {
  const overrideCount = useCartographStore(s => {
    const blk = (shot === 'browse' || shot === 'street') ? s.shotLooks?.[shot] : null
    return blk ? Object.keys(blk).length : 0
  })
  const resetShotToBase = useCartographStore(s => s.resetShotToBase)
  if (!overrideCount) return null
  const label = shot[0].toUpperCase() + shot.slice(1)
  return (
    <div className="glass-panel rounded-xl p-3 pointer-events-auto flex items-center justify-between gap-2">
      <div className="text-xs" style={{ color: 'var(--on-surface-subtle)', lineHeight: 1.3 }}>
        <span style={{ fontWeight: 600, color: 'var(--on-surface)' }}>{label}</span> has its own look
        {' '}({overrideCount} change{overrideCount === 1 ? '' : 's'} off Hero).
      </div>
      <button
        onClick={() => resetShotToBase(shot)}
        title={`Drop ${label}'s overrides; follow the Hero (base) look again.`}
        style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap',
          border: '1px solid var(--outline-variant)', background: 'transparent',
          color: 'var(--on-surface)', cursor: 'pointer',
        }}>
        Reset to Hero
      </button>
    </div>
  )
}

// ── Camera rig ─────────────────────────────────────────────────────────────
// Canvas creates the default ortho camera (Designer). <PerspectiveCamera
// makeDefault /> takes over for shots; flipping makeDefault back to false
// returns control to the Canvas's ortho camera.
// Toy is a small fixture (~36 wide × 68 deep, centered on origin); the SHOTS
// camera positions are authored for the full neighborhood, so on toy we
// override with a fixed oblique framing that puts the cluster mid-screen.
const TOY_CAM = { position: [38, 32, 58], target: [0, 4, 0], fov: 35 }

function CameraRig({ orthoRef, perspRef, controlsRef }) {
  const { camera, scene, size } = useThree()
  const shot = useCartographStore(s => s.shot)
  const sceneKey = useCartographStore(s => s.scene)
  // Re-assert framing once the design (incl. heroKeyframes) finishes hydrating.
  // shot persists in localStorage, so a refresh can land directly in Hero
  // before the async design fetch resolves — without this the rig reads the
  // store-default keyframes and never re-applies (appliedShot guards re-entry).
  const designHydrated = useCartographStore(s => s._designHydrated)
  // Grab the Canvas's default ortho camera once.
  useEffect(() => {
    if (!orthoRef.current) {
      // The default camera in a Canvas with orthographic=true is the ortho.
      // If a PerspectiveCamera is already makeDefault, scan scene for OrthographicCamera.
      if (camera.isOrthographicCamera) orthoRef.current = camera
      else scene.traverse(obj => { if (obj.isOrthographicCamera) orthoRef.current = obj })
    }
  }, [camera, scene, orthoRef])
  const appliedShot = useRef(null)
  const prevShot = useRef(null)
  const didInitOrtho = useRef(false)
  // Shared camera-transition state machine — same vernacular as
  // production Scene.jsx's CameraRig (extracted into preview/cameraTween).
  // Hero/Browse/Street entries glide via easeInOutCubic instead of snapping.
  const tweenRef = useRef(null)
  if (!tweenRef.current) tweenRef.current = createCameraTween()

  // One-time: orient the ortho camera properly (top-down), using saved
  // position + zoom if we have them.
  useEffect(() => {
    if (didInitOrtho.current) return
    if (!camera.isOrthographicCamera) return
    didInitOrtho.current = true
    const { x, z, zoom } = readCamInit()
    camera.position.set(x, 500, z)
    camera.up.set(0, 0, -1)
    camera.lookAt(x, 0, z)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    const ctl = controlsRef.current
    if (ctl) { ctl.target.set(x, 0, z); ctl.update() }
  }, [camera, controlsRef])

  // Respond to shot changes.
  // MapControls is keyed on Designer/shot so it rebuilds when the default
  // camera swaps. On rebuild its target defaults to (0,0,0), so we re-assert
  // target (and on Designer, also re-assert the ortho's orientation) here
  // after a frame delay — giving the new MapControls instance time to mount.
  useEffect(() => {
    const key = `${sceneKey}:${shot}:${designHydrated}`
    if (appliedShot.current === key) return
    appliedShot.current = key
    const applyTarget = () => {
      const ctl = controlsRef.current
      // Toy scene runs on its own fixed oblique framing in any non-Designer
      // shot; the SHOTS table is authored for the full neighborhood and
      // would put the toy fixture hundreds of units off-camera.
      if (sceneKey === 'toy' && shot !== 'designer') {
        const cam = perspRef.current
        if (!cam) return
        cam.position.set(...TOY_CAM.position)
        cam.up.set(0, 1, 0)
        cam.fov = TOY_CAM.fov
        cam.lookAt(...TOY_CAM.target)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(...TOY_CAM.target); ctl.update() }
        prevShot.current = shot
        return
      }
      // Toy + Designer: reset ortho camera to origin so the toy fixture is
      // visible (otherwise localStorage-persisted LS-centered position
      // leaves toy hundreds of meters off-screen → user sees gray canvas).
      if (sceneKey === 'toy' && shot === 'designer') {
        const cam = orthoRef.current
        if (!cam) return
        cam.position.set(0, 500, 0)
        cam.zoom = Math.max(2, size.height / 200)  // fit ~200m vertical
        cam.up.set(0, 0, -1)
        cam.lookAt(0, 0, 0)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(0, 0, 0); ctl.update() }
        prevShot.current = shot
        return
      }
      if (shot === 'designer') {
        const cam = orthoRef.current
        if (!cam) return
        // Coming from Browse: copy x/z + back-compute zoom from altitude so
        // the visible patch matches what the user was looking at.
        const persp = perspRef.current
        if (persp && prevShot.current === 'browse') {
          const fovRad = (persp.fov * Math.PI) / 180
          const visibleH = 2 * Math.max(persp.position.y, 1) * Math.tan(fovRad / 2)
          cam.position.set(persp.position.x, 500, persp.position.z)
          cam.zoom = size.height / Math.max(visibleH, 1e-6)
        }
        cam.up.set(0, 0, -1)
        cam.lookAt(cam.position.x, 0, cam.position.z)
        cam.updateProjectionMatrix()
        if (ctl) { ctl.target.set(cam.position.x, 0, cam.position.z); ctl.update() }
      } else {
        const cam = perspRef.current
        const s = SHOTS[shot]
        if (!cam || !s) return
        // SC.5 — fov comes from the operator's authored `shots` channel
        // (live in Stage; frozen in production+preview). position/target/up
        // are runtime-input scaffolds — SHOTS const remains the canonical
        // Stage shot-switch framing until per-shot position authoring lands.
        const storeShots = useCartographStore.getState().shots?.values
        let fov = storeShots?.[shot]?.fov ?? s.fov
        let toPos
        let toTarget = [...s.target]
        if (shot === 'browse') {
          const aspect = size.width / Math.max(size.height, 1)
          const y = computeBrowseAltitude(aspect, fov)
          toPos = [s.position[0], y, s.position[2]]
        } else if (shot === 'hero') {
          // Hero framing is AUTHORED as keyframes + a designated subject, not
          // the static SHOTS.hero scaffold. Enter at the path start (first
          // keyframe) looking at the resolved subject, with the keyframe's fov;
          // HeroPreview then owns subsequent aim/animation. Without this the
          // camera dropped at the generic SHOTS.hero pose and ignored the
          // operator's authored keyframes on load (and on every shot switch).
          const kfs = useCartographStore.getState().heroKeyframes
          const subj = resolveHeroSubject(
            useCartographStore.getState().heroSubject,
            { buildings: _allBuildings, archValues: useCartographStore.getState().arch?.values },
          )
          if (subj) toTarget = [...subj]
          if (kfs && kfs.length >= 1) {
            toPos = [...kfs[0].position]
            if (kfs[0].fov != null) fov = kfs[0].fov
          } else {
            toPos = [...s.position]
          }
        } else {
          toPos = [...s.position]
        }
        const toUp = s.up || [0, 1, 0]

        // Snap (no tween) on first entry into a perspective shot from
        // Designer/null prev (the shot family hasn't been live — no "from"
        // pose to glide out of), OR when re-applying the SAME shot (a
        // post-hydration re-assert) — gliding a 2.5s tween between two hero
        // poses on load would read as an odd drift.
        const snapEntry = prevShot.current === 'designer' || prevShot.current == null
          || prevShot.current === shot
        if (snapEntry) {
          cam.position.set(toPos[0], toPos[1], toPos[2])
          cam.up.set(toUp[0], toUp[1], toUp[2])
          cam.fov = fov
          cam.lookAt(toTarget[0], toTarget[1], toTarget[2])
          cam.updateProjectionMatrix()
          if (ctl) { ctl.target.set(toTarget[0], toTarget[1], toTarget[2]); ctl.update() }
        } else {
          // Glide between perspective shots — IDENTICAL to production now
          // (camera-SSOT, 2026-06-21): durations from transitions.js (Hero→Browse
          // 2400ms, Browse→Hero 2500ms) and a SMOOTH up-vector tilt into overhead
          // (the shared tween lerps + normalizes `up`; no more mid-tween snap).
          const fromUp = [cam.up.x, cam.up.y, cam.up.z]
          const duration = transitionMs(shot)
          const fromTarget = ctl
            ? [ctl.target.x, ctl.target.y, ctl.target.z]
            : toTarget
          if (ctl) ctl.enabled = false
          tweenRef.current.start({
            from: {
              pos:    [cam.position.x, cam.position.y, cam.position.z],
              target: fromTarget,
              fov:    cam.fov,
              up:     fromUp,
            },
            to: { pos: toPos, target: toTarget, fov, up: toUp },
            duration,
            ease: 'easeInOutCubic',
            label: `→${shot}`,
            onUpdate: (p, t, f, _e, u) => {
              cam.position.copy(p)
              cam.fov = f
              if (u) cam.up.copy(u)        // smooth up-tilt across the glide
              cam.updateProjectionMatrix()
              if (ctl) { ctl.target.copy(t); ctl.update() }
              else     { cam.lookAt(t.x, t.y, t.z) }
            },
            onComplete: () => {
              if (ctl) ctl.enabled = true
              cam.up.set(toUp[0], toUp[1], toUp[2])   // settle exactly on target up
            },
          })
        }
      }
      prevShot.current = shot
    }
    // MapControls remounts via its key change — wait one tick for the new
    // instance to be in controlsRef before we push the target.
    const id = requestAnimationFrame(applyTarget)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
    return () => cancelAnimationFrame(id)
  }, [shot, sceneKey, designHydrated, orthoRef, perspRef, controlsRef])

  // Drive the in-flight shot tween. Same vernacular as Preview's
  // ShotCamera + production CameraRig — easeInOutCubic position/target/
  // fov interpolation between Hero/Browse/Street perspective shots.
  useFrame(() => {
    if (tweenRef.current.isActive()) tweenRef.current.tick(performance.now())
  })

  // Persist designer pan/zoom (ortho only). Browse-↔-Designer view sync
  // is handled by the cross-camera handoff in the shot-change useEffect
  // above (read ortho/persp directly), not via localStorage.
  useFrame(() => {
    if (useCartographStore.getState().shot !== 'designer') return
    if (!camera.isOrthographicCamera) return
    localStorage.setItem(CAM_KEY, JSON.stringify({
      x: camera.position.x, z: camera.position.z, zoom: camera.zoom,
    }))
  })

  return null
}

function readCamInit() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAM_KEY))
    if (saved) return { x: saved.x || 0, z: saved.z || 0, zoom: saved.zoom || 3 }
  } catch { /* ignore */ }
  return { x: 0, z: 0, zoom: 3 }
}

// ── Controls ────────────────────────────────────────────────────────────────
function Controls({ controlsRef }) {
  const shot = useCartographStore(s => s.shot)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  // Hero runtime/authoring: in the Hero shot the orbit controls are LOCKED
  // (the bounce plays as it ships) until the operator clicks a keyframe to
  // author it — then free orbit unlocks to reposition. Street stays free.
  const heroAuthoring = useHeroAuthoring()

  const inDesigner = shot === 'designer'
  // Designer: no rotate, pan enabled unless hovering an editable target.
  // Non-Designer shots: BrowseControls / OrbitControlsShot below own the
  // controls; their basic orbit is all we need for shot viewing.
  const panEnabled = !inDesigner || spaceDown
    || (!tool && !markerActive)
    || ((tool === 'surveyor' || tool === 'measure') && !hoverTarget && !markerActive)

  // Designer uses MapControls (plan view, ortho). Shots use OrbitControls so
  // the operator can freely inspect the 3D scene (full pan + orbit + zoom).
  if (inDesigner) {
    return (
      <MapControls
        key="ortho"
        ref={controlsRef}
        enableRotate={false}
        enablePan={panEnabled}
        enableZoom
        screenSpacePanning
        minZoom={0.5}
        maxZoom={40}
      />
    )
  }
  // Browse is a planar overhead by default — LEFT-drag pans, wheel zooms.
  // ⌥/Alt+LEFT-drag (and RIGHT-drag) is the hidden 360° orbit easter
  // egg. See feedback_browse_right_drag_orbit.md.
  if (shot === 'browse') {
    return (
      <BrowseControls controlsRef={controlsRef} />
    )
  }
  // Hero: locked during runtime playback, free only while authoring a
  // keyframe. Street: always free (no keyframes to lock to).
  return (
    <OrbitControlsShot controlsRef={controlsRef} enabled={shot !== 'hero' || heroAuthoring} />
  )
}

function BrowseControls({ controlsRef }) {
  // LEFT=PAN by default, ⌥/Alt+LEFT=ROTATE, RIGHT=ROTATE always.
  //
  // Two delivery paths because each alone has been observed to fail:
  //   (a) Declarative `mouseButtons` prop. drei renders OrbitControls as
  //       <primitive object={controls} ...restProps>, and R3F's applyProps
  //       *mutates* `controls.mouseButtons` keys in place. That works on
  //       initial mount, but if THREE.OrbitControls' constructor (or the
  //       running drag handler) ever resets the object, the React tree
  //       won't re-push it because the prop value is referentially equal.
  //   (b) Imperative assignment after every mouse/key event. Robust against
  //       any internal reset, and against the underlying controls instance
  //       being recreated by drei when the default camera swaps (entering
  //       Browse from Designer flips makeDefault on PerspectiveCamera, which
  //       changes drei's internal `useMemo(new OrbitControls(...), [camera])`
  //       dependency and creates a NEW controls instance — our previous
  //       useEffect-once imperative set was applied to the OLD instance and
  //       silently lost). Tying the ref to a state setter forces a re-apply
  //       on every controls-instance swap.
  const [controls, setControls] = useState(null)
  const [altDown, setAltDown] = useState(false)
  const buttons = useMemo(() => ({
    LEFT: altDown ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  }), [altDown])
  // Re-apply imperatively whenever the controls instance OR alt state
  // changes. Belt-and-suspenders against drei recreating the underlying
  // OrbitControls when explCamera changes.
  useEffect(() => {
    if (!controls) return
    controls.mouseButtons = buttons
  }, [controls, buttons])
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Alt') setAltDown(true) }
    const onKeyUp   = (e) => { if (e.key === 'Alt') setAltDown(false) }
    const onBlur    = () => setAltDown(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  const refCb = useCallback((r) => {
    setControls(r)
    if (controlsRef) controlsRef.current = r
  }, [controlsRef])
  return (
    <OrbitControls
      key="browse"
      makeDefault
      ref={refCb}
      mouseButtons={buttons}
      enablePan
      enableRotate
      enableZoom
      screenSpacePanning
      minDistance={50}
      maxDistance={4000}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  )
}

// Shot-mode controls. Left-drag rotates; Option/Alt+drag pans; wheel zooms.
// `enabled` locks them for the Hero runtime preview (see Controls).
function OrbitControlsShot({ controlsRef, enabled = true }) {
  const localRef = useRef(null)
  useEffect(() => {
    const setButtons = (altDown) => {
      const c = localRef.current
      if (!c) return
      c.mouseButtons = {
        LEFT: altDown ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }
    }
    const onKeyDown = (e) => { if (e.key === 'Alt') setButtons(true) }
    const onKeyUp   = (e) => { if (e.key === 'Alt') setButtons(false) }
    setButtons(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
  return (
    <OrbitControls
      key="persp"
      makeDefault
      ref={(r) => { localRef.current = r; if (controlsRef) controlsRef.current = r }}
      enabled={enabled}
      enablePan
      enableRotate
      enableZoom
      enableDamping={false}
      rotateSpeed={0.4}
      panSpeed={0.6}
      zoomSpeed={0.6}
      screenSpacePanning
      minDistance={0.5}
      maxDistance={5000}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
    />
  )
}

// ── Environment tickers (shot-only) ────────────────────────────────────────
function TimeTicker() {
  const tick = useTimeOfDay(s => s.tick)
  const last = useRef(Date.now())
  useFrame(() => { const n = Date.now(); tick(n - last.current); last.current = n })
  return null
}

function SkyStateTicker() {
  useFrame((_, d) => useSkyState.getState().tick(Math.min(d, 0.1)))
  return null
}

// ── Keyboard ────────────────────────────────────────────────────────────────
function useSpaceKey() {
  const setSpaceDown = useCartographStore(s => s.setSpaceDown)
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space') return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const st = useCartographStore.getState()
      if (st.shot !== 'designer') return
      if (!st.tool && !st.markerActive) return
      e.preventDefault()
      setSpaceDown(true)
    }
    const onUp = (e) => {
      if (e.code !== 'Space') return
      setSpaceDown(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [setSpaceDown])
}

function useLoadData() {
  useEffect(() => {
    useCartographStore.getState()._loadMarkers()
    useCartographStore.getState()._loadCenterlines()
    useCartographStore.getState()._loadMeasurements()
  }, [])
}

// Toy bounding rectangle — defines the residential substrate that V2's
// rounded asphalt is carved out of. Toy-only stencil; non-toy scenes
// don't pass one (V2 emits asphalt + bands without block-fill).
const TOY_STENCIL = [[-180, -180], [180, -180], [180, 180], [-180, 180]]

// LS stencil = the neighborhood boundary polygon, scaled outward to the
// streetFade.outer + buffer band. Mirrors bake-ground.js's STENCIL_POLYGON
// derivation so V2's blockRounded comes out the same shape Designer-side
// as bake-side. Without this, V2's `blockRounded = stencil − asphaltRounded`
// is empty, which kills cornerSidewalkPads (clipped against blockRounded
// and lands at zero rings) and any other stencil-bound clip.
const LS_STENCIL = (() => {
  const poly = lsNeighborhoodBoundary?.boundary
  const center = lsNeighborhoodBoundary?.center
  const radius = lsNeighborhoodBoundary?.radius
  if (!poly?.length || !center || !radius) return null
  const targetR = (lsNeighborhoodBoundary?.streetFade?.outer ?? radius) + 50
  const scale = targetR / radius
  const cx = center[0], cz = center[1]
  return poly.map(([x, z]) => [cx + (x - cx) * scale, cz + (z - cz) * scale])
})()

// Per-scene configuration. The single source of truth for "what's
// different about this scene" — components above this line should not
// branch on scene names. New scenes register here; capabilities default
// to false unless declared.
//
// `ribbons` is the static post-bake intersections + faces artifact
// (centerline geometry comes from the live store, scene-aware). Once
// promote-ribbons is scene-keyed (Phase 0e) this can shrink to a path.
const SCENE_REGISTRY = {
  'lafayette-square': {
    ribbons: ribbonsRaw,
    stencil: LS_STENCIL,
    useBoundary: true,
    hasAerial: true,
    hasHero: true,
    StageEnvironment: ({ hiddenLayers, lookId, bakeLastMs }) => {
      // Stage live-wire for every authored channel — drag a slider, see it
      // retint instantly. Production omits these overrides and reads
      // scene.json frozen-at-bake. Contained here in the cartograph chunk
      // so LafayetteScene itself never imports useCartographStore.
      // Doctrine: project_authoring_is_live_production_is_static.
      // activeChannel resolves the active shot's fork (channel-variant cascade)
      // so the Stage live-renders per-shot looks; non-forkable channels (palette/
      // material/arch/horizon) resolve to base unchanged.
      const paletteOverride         = useCartographStore(s => activeChannel(s, 'buildingPalette'))
      const materialPhysicsOverride = useCartographStore(s => activeChannel(s, 'materialPhysics'))
      const materialColorsOverride  = useCartographStore(s => activeChannel(s, 'materialColors'))
      const archOverride            = useCartographStore(s => activeChannel(s, 'arch'))
      const archLightOverride       = useCartographStore(s => activeChannel(s, 'archLight'))
      const lanternOverride         = useCartographStore(s => activeChannel(s, 'lantern'))
      const horizonOverride         = useCartographStore(s => activeChannel(s, 'horizon'))
      const forceNeonOn             = useCartographStore(s => s.neonForceOn)
      return <>
        {!hiddenLayers.park && (
          <R3FErrorBoundary name="LafayettePark"><LafayettePark lookId={lookId} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        )}
        {!hiddenLayers.tree && (
          <R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={lookId} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        )}
        <R3FErrorBoundary name="LafayetteScene"><LafayetteScene
          lookId={lookId}
          bakeLastMs={bakeLastMs}
          paletteOverride={paletteOverride}
          materialPhysicsOverride={materialPhysicsOverride}
          materialColorsOverride={materialColorsOverride}
          forceNeonOn={forceNeonOn}
          hiddenLayers={hiddenLayers}
          forceContentReady
        /></R3FErrorBoundary>
        {!hiddenLayers.lamp && (
          <R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={lookId} bakeLastMs={bakeLastMs} lanternOverride={lanternOverride} /></R3FErrorBoundary>
        )}
        <R3FErrorBoundary name="GatewayArch"><GatewayArch
          lookId={lookId}
          bakeLastMs={bakeLastMs}
          archOverride={archOverride}
          archLightOverride={archLightOverride}
          horizonOverride={horizonOverride}
        /></R3FErrorBoundary>
      </>
    },
  },
  'toy': {
    ribbons: toyRibbons,
    stencil: TOY_STENCIL,
    useBoundary: false,
    hasAerial: false,
    hasHero: false,
    StageEnvironment: () => <>
      <R3FErrorBoundary name="ToyTerrain"><ToyTerrain /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyBuildings"><ToyBuildings /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyTrees"><ToyTrees /></R3FErrorBoundary>
      <R3FErrorBoundary name="ToyStreetLights"><StreetLights lamps={toyLamps.lamps} /></R3FErrorBoundary>
    </>,
    // Designer-mode backdrop — a graph-paper grid that sits under the
    // V2 surface so the translucent/opaque story has something to read
    // against. LS uses real aerial tiles for this; toy is purely
    // diagnostic so a procedural grid signals "design mode" instead.
    // Backdrop color reads from `layerColors.ground` (Surfaces > Streets
    // > Ground); visibility from `layerVis.ground`. Defaults to a cool
    // navy if the operator hasn't customized.
    DesignerBackdrop: () => {
      const layerColors = useCartographStore(s => activeChannel(s, 'layerColors'))
      const layerVis    = useCartographStore(s => s.layerVis)
      if (layerVis?.ground === false) return null
      const groundCol = layerColors?.ground || '#1f2530'
      return (
        <group>
          <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
            <planeGeometry args={[400, 400]} />
            <meshBasicMaterial color={groundCol} transparent opacity={1.0} depthWrite={false} />
          </mesh>
          <gridHelper args={[400, 80, '#3a4658', '#2a3340']} position={[0, -0.05, 0]} />
          <gridHelper args={[400, 8,  '#56708a', '#56708a']} position={[0, -0.04, 0]} />
        </group>
      )
    },
  },
}
function sceneConfig(scene) {
  return SCENE_REGISTRY[scene] || SCENE_REGISTRY['lafayette-square']
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function CartographApp() {
  const orthoRef = useRef(null)
  const perspRef = useRef(null)
  const controlsRef = useRef(null)

  const shot = useCartographStore(s => s.shot)
  const scene = useCartographStore(s => s.scene)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const markerEraserActive = useCartographStore(s => s.markerEraserActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  const bgColor = useCartographStore(s => s.bgColor)
  const layerVis = useCartographStore(s => s.layerVis)
  const luColors = useCartographStore(s => activeChannel(s, 'luColors'))
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const corridorByIdx = useCartographStore(s => s.corridorByIdx)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const heroSubject = useCartographStore(s => s.heroSubject)
  const storeKeyframes = useCartographStore(s => s.heroKeyframes)
  const setStoreKeyframes = useCartographStore(s => s.setHeroKeyframes)
  const storeMotion = useCartographStore(s => s.heroMotion)
  const setStoreMotion = useCartographStore(s => s.setHeroMotion)

  // Stage live-wire for sky / lighting / celestial — threaded into the
  // single shared CelestialBodies consumer via `<channel>Override` props.
  // Drag a slider in Sky & Light → Stage retints instantly. Production
  // mounts the same consumer without these props and reads scene.json
  // frozen-at-bake. Store reach is contained here in the cartograph chunk;
  // CelestialBodies itself never imports useCartographStore.
  // Doctrine: project_stage_consumer_parity, project_authoring_is_live_production_is_static.
  // activeChannel resolves the active shot's fork (channel-variant cascade) so
  // the Stage live-renders per-shot looks; unforked shots resolve to base.
  const skyOverride            = useCartographStore(s => activeChannel(s, 'sky'))
  const ambientOverride        = useCartographStore(s => activeChannel(s, 'ambient'))
  const hemiOverride           = useCartographStore(s => activeChannel(s, 'hemi'))
  const dirSunOverride         = useCartographStore(s => activeChannel(s, 'dirSun'))
  const dirMoonOverride        = useCartographStore(s => activeChannel(s, 'dirMoon'))
  const constellationsOverride = useCartographStore(s => activeChannel(s, 'constellations'))
  const milkyWayOverride       = useCartographStore(s => activeChannel(s, 'milkyWay'))
  const skyGainOverride        = useCartographStore(s => activeChannel(s, 'skyGain'))
  const starsOverride          = useCartographStore(s => activeChannel(s, 'stars'))

  // SC.2 + SC.3 — post-FX channels threaded as overrides into the shared
  // PostProcessing + StageFog consumers. Production passes no overrides
  // and reads scene.json frozen-at-bake.
  const bloomOverride    = useCartographStore(s => activeChannel(s, 'bloom'))
  const aoOverride       = useCartographStore(s => activeChannel(s, 'ao'))
  const exposureOverride = useCartographStore(s => activeChannel(s, 'exposure'))
  const warmthOverride   = useCartographStore(s => activeChannel(s, 'warmth'))
  const fillOverride     = useCartographStore(s => activeChannel(s, 'fill'))
  const mistOverride     = useCartographStore(s => activeChannel(s, 'mist'))
  const haloOverride     = useCartographStore(s => activeChannel(s, 'halo'))
  const gradeOverride    = useCartographStore(s => activeChannel(s, 'grade'))
  const smaaOverride     = useCartographStore(s => activeChannel(s, 'smaa'))
  const dofOverride      = useCartographStore(s => activeChannel(s, 'dof'))
  const grainOverride    = useCartographStore(s => activeChannel(s, 'grain'))
  const shadowOverride   = useCartographStore(s => activeChannel(s, 'shadow'))
  // Live arch placement → the DoF hero pocket anchors to the SAME (store) arch
  // Stage renders, not the stale baked scene.json one (heroSubject already read
  // above at component scope).
  const archOverride     = useCartographStore(s => s.arch)

  // Hero keyframes + authored motion live in the store (persisted to design.json).
  // preview + speed are transient runtime UI only.
  const keyframes = storeKeyframes
  const setKeyframes = setStoreKeyframes
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewSpeed, setPreviewSpeed] = useState(1)
  const heroMotion = { ...storeMotion, preview: previewPlaying, speed: previewSpeed }
  const setHeroMotion = (next) => {
    const f = typeof next === 'function' ? next(heroMotion) : next
    if (f.period !== heroMotion.period || f.easing !== heroMotion.easing) {
      setStoreMotion({ period: f.period, easing: f.easing })
    }
    if (!!f.preview !== previewPlaying) setPreviewPlaying(!!f.preview)
    if ((f.speed || 1) !== previewSpeed) setPreviewSpeed(f.speed || 1)
  }

  useSpaceKey()
  useLoadData()

  const inDesigner = shot === 'designer'

  // Designer reads the LIVE store layerVis so toggles update instantly.
  // Stage / shots consume the BAKED layerVis from scene.json — visibility
  // gets locked in at bake time, same source Preview reads. Re-baking is
  // what propagates Designer changes through to Stage and Preview.
  const [bakedLayerVis, setBakedLayerVis] = useState(null)
  useEffect(() => {
    if (!activeLookId) return
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}baked/${activeLookId}/scene.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setBakedLayerVis(j?.layerVis || {}) })
      .catch(() => { if (!cancelled) setBakedLayerVis({}) })
    // Re-fetch on activeLookId change AND on bake completion (bakeLastMs
    // bumps when runBake succeeds).
  }, [activeLookId, bakeLastMs])

  const effectiveLayerVis = inDesigner ? layerVis : (bakedLayerVis || {})
  const hiddenLayers = {}
  for (const k in effectiveLayerVis) {
    if (effectiveLayerVis[k] === false) hiddenLayers[k] = true
  }
  // Background view: aerialVisible swaps the painted background between
  // curated SVG and aerial photo. Curated rendering hides only when
  // aerial is on AND we're in pure Design — under tools, ribbons +
  // tool affordances stay over the aerial as reference, and the user
  // declutters via per-layer visibility toggles in the Designer Panel.
  const sceneCfg = sceneConfig(scene)
  const designAerialOnly = inDesigner && !tool && aerialVisible
  // When a tool is active, hide the giant off-map ground plane so the
  // background (curated or aerial) shows through under the streets.
  const toolActive = inDesigner && !!tool
  const corridorSelected = toolActive && selectedStreet !== null
  const decorationsHidden = toolActive ? { ...hiddenLayers, ground: true } : hiddenLayers

  // Tool + Aerial = focus mode. Drops the visual noise that competes
  // with the aerial photo for align-to-photo authoring:
  //   - V2 keeps the ribbon bands (asphalt / curb / sidewalk / treelawn —
  //     the measurement targets) but takes `hideLandUse` so the colored
  //     block faces (residential / commercial / park) stop tinting the
  //     aerial.
  //   - MapLayers (buildings, landscape overlays, parking lots, lamps,
  //     trees, water, labels, barriers) hides entirely.
  //   - DesignerArch (decoration) hides.
  // Aerial photo + ribbon bands + tool's authoring overlay = clean
  // direct-align surface. Gated by `sceneCfg.hasAerial` because scenes
  // without an aerial photo can't enter focus mode.
  const toolAerialFocus = inDesigner && !!tool && aerialVisible && sceneCfg.hasAerial

  // Survey is a blue wireframe over the aerial: we draw the block polygons but
  // NOT the asphalt, so the aerial IS the road context — it's mandatory, not an
  // "Aerial" toggle. So Survey ignores `aerialVisible`: aerial always mounts
  // (the tool gate below), MapLayers always renders its centerline skeleton
  // (decoration suppressed in-component), and the block faces always show. The
  // toggle only governs the no-tool / Measure aerial-focus modes.
  const surveyMode = inDesigner && tool === 'surveyor' && sceneCfg.hasAerial

  let cursor = 'grab'
  if (markerActive && markerEraserActive && !spaceDown) cursor = 'pointer'
  else if (markerActive && !spaceDown) cursor = 'crosshair'
  else if ((tool || markerActive) && hoverTarget && !spaceDown) cursor = 'pointer'
  if (!inDesigner) cursor = 'default'

  return (
    <div className={`cartograph${inDesigner ? ' carto-flat' : ''}`}
      style={!inDesigner ? { background: '#000' }
        : bgColor !== '#1a1a18' ? { background: bgColor } : undefined}>
      <div className="carto-canvas-wrap" style={{ cursor }}>
        <Canvas
          orthographic
          frameloop="always"
          camera={{ position: [0, 500, 0], zoom: 3, near: 0.1, far: 2000 }}
          gl={{
            alpha: false, antialias: true, stencil: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            // toneMappingExposure now derives from scene.exposure (SC.3,
            // 2026-05-13) via the shared PostProcessing consumer reading
            // useCartographStore.exposure as the live override.
            // Logarithmic depth buffer — redistributes 24-bit precision
            // logarithmically so distance-dependent sort failures (water
            // sinking into ground, treelawn snapping at high altitude)
            // resolve cleanly across the scene's full near/far range. See
            // FEATURES.md §"Layering / coplanar stacking / depth precision".
            logarithmicDepthBuffer: true,
          }}
          onCreated={({ gl }) => { gl.setClearColor(0x2a2a26, 1) }}
          dpr={[1, 1.5]}
          shadows="soft"
          style={{ position: 'absolute', inset: 0 }}
        >
          <PerspectiveCamera
            ref={perspRef}
            makeDefault={!inDesigner}
            position={SHOTS.browse.position}
            fov={SHOTS.browse.fov}
            near={1}
            far={60000}
          />
          <CameraRig orthoRef={orthoRef} perspRef={perspRef} controlsRef={controlsRef} />
          {!inDesigner && <TimeTicker />}
          {!inDesigner && <SkyStateTicker />}


          {/* ── Ground:
              - Designer (any scene) → V2 live render via
                <BlockGeometryV2Debug/>. Reads centerlines + intersections
                + blockCustoms from the live store so authoring edits
                show without re-baking.
              - Any non-Designer shot (any scene) → <BakedGround/>. Same
                component Preview mounts, same per-Look slab Publish
                ships. ↻ / Stage→ refresh via cache-bust on bakeLastMs. ── */}
          {inDesigner && <ambientLight intensity={1} />}

          {/* Designer-mode backdrop. LS uses aerial tiles (gated lower);
              toy registers a procedural grid so the V2 translucent layers
              have something to read against in Designer. */}
          {inDesigner && sceneCfg.DesignerBackdrop && (
            <R3FErrorBoundary name="DesignerBackdrop">
              <sceneCfg.DesignerBackdrop />
            </R3FErrorBoundary>
          )}


          {/* ── Rounded-block-clip V2 ground render — Designer only.
              Live render driven by the store (centerlines, blockCustoms,
              corner overrides) so authoring edits show without a re-bake.
              Stage shots consume <BakedGround/> below — same V2 emitter
              that produces the slab, just frozen at bake time. Pure-
              aerial Designer mode (no tool, aerial on) skips V2 so the
              photo shows uncovered; tool-focus mode keeps V2 mounted
              with hideLandUse so ribbon bands stay as measurement
              targets over the photo. ── */}
          {inDesigner && !designAerialOnly && (
            <R3FErrorBoundary name="BlockGeometryV2Debug">
              <BlockGeometryV2Debug
                ribbons={sceneCfg.ribbons}
                stencil={sceneCfg.stencil}
                flat={inDesigner}
                scene={scene}
                useBoundary={sceneCfg.useBoundary}
                useRingBandEmitter={true /* C5: LS cutover — keeper for all scenes (legacy else-branch dead, removed in C5 commit 3) */}
                measureActive={tool === 'measure' && inDesigner}
                surveyActive={tool === 'surveyor' && inDesigner}
                hideLandUse={toolAerialFocus && !surveyMode} />
            </R3FErrorBoundary>
          )}

          {/* ── Corner-edit handles — surface only in Designer mode, in
              whichever scene is active. Toggle lives in Streets > Corners
              in Panel.jsx. Component bails out internally when
              cornerEditMode is off; mount is unconditional in Designer
              so the toggle takes effect without a re-mount. */}
          {inDesigner && (
            <R3FErrorBoundary name="CornerEditHandles">
              <CornerEditHandles />
            </R3FErrorBoundary>
          )}

          {/* ── Baked Three.js ground for Stage shots — every scene.
              Same component Preview mounts; cache-busts on bakeLastMs so
              ↻ / Stage→ refresh the artifact in place. The slab is the
              single rendered ground in shot mode (no V2 overlay). ── */}
          {!inDesigner && (
            <R3FErrorBoundary name="BakedGround">
              <BakedGround
                lookId={activeLookId}
                bakeLastMs={bakeLastMs}
                targetExag={shot === 'street' ? 1 : shot === 'browse' ? 0 : V_EXAG}
              />
            </R3FErrorBoundary>
          )}

          {/* ── Map layers (flat ground geometry — neighborhood only).
              In shots, layers with 3D equivalents (park, buildings, trees,
              lamps, water) are suppressed so the 3D components own them.
              In Designer, any time aerial is on (tool focus OR pure design
              with aerial), hide entirely so the photo isn't covered by
              buildings/parcels/water/parking-lots/etc. */}
          {scene === 'lafayette-square' && (!toolAerialFocus || surveyMode) && !designAerialOnly && (
            <MapLayers hiddenLayers={inDesigner ? decorationsHidden : hiddenLayers} inShot={!inDesigner}
              surveyActive={tool === 'surveyor' && inDesigner}
              measureActive={tool === 'measure' && inDesigner} />
          )}

          {/* ── Designer-only UI overlays. Survey + Measure overlays mount
              in every scene that supports authoring (toy and LS both).
              AerialTiles + DesignerArch are LS-specific visual surfaces:
              gated by scene capabilities so toy doesn't try to load the
              64 aerial tiles or the gateway-arch decoration. Mounting
              only in Designer keeps these out of Stage shots. */}
          {inDesigner && <>
            {/* Two-layer aerial. AerialBase = whole-disc low-res, a dozen
                tiles, near-instant. AerialFocus = hi-res only over the
                activated block, resolution driven by camera distance,
                released on deselect/zoom-out. Mounts only when a tool is
                active or Aerial is toggled, so Designer pays nothing for the
                photo unless it's being used. (Two-layer loader rework:
                HANDOFF-aerial-focus-brief.md.) */}
            {sceneCfg.hasAerial && (!!tool || aerialVisible) && <>
              <AerialBase />
              {corridorSelected && <AerialFocus />}
            </>}
            {scene === 'lafayette-square' && !toolAerialFocus && !designAerialOnly && <DesignerArch />}
            <SurveyorOverlay />
            {tool === 'measure' && <MeasureOverlay />}
          </>}

          {/* ── Shot-only (environment paint — must exactly mirror runtime) ── */}
          {!inDesigner && <StageShadows
            lookId={activeLookId}
            bakeLastMs={bakeLastMs}
            shadowOverride={shadowOverride}
          />}
          {!inDesigner && <StageFog
            lookId={activeLookId}
            bakeLastMs={bakeLastMs}
            mistOverride={mistOverride}
          />}
          {!inDesigner && <PostProcessing
            lookId={activeLookId}
            bakeLastMs={bakeLastMs}
            bloomOverride={bloomOverride}
            aoOverride={aoOverride}
            exposureOverride={exposureOverride}
            warmthOverride={warmthOverride}
            fillOverride={fillOverride}
            haloOverride={haloOverride}
            gradeOverride={gradeOverride}
            grainOverride={grainOverride}
            smaaOverride={smaaOverride}
            dofOverride={dofOverride}
            archOverride={archOverride}
            heroSubjectOverride={heroSubject}
          />}
          <group visible={!inDesigner}>
            <R3FErrorBoundary name="CelestialBodies"><CelestialBodies
              debugLevel={0}
              lookId={activeLookId}
              bakeLastMs={bakeLastMs}
              skyOverride={skyOverride}
              ambientOverride={ambientOverride}
              hemiOverride={hemiOverride}
              dirSunOverride={dirSunOverride}
              dirMoonOverride={dirMoonOverride}
              constellationsOverride={constellationsOverride}
              milkyWayOverride={milkyWayOverride}
              skyGainOverride={skyGainOverride}
              starsOverride={starsOverride}
            /></R3FErrorBoundary>
            {/* Atmosphere driver chain — production feeds <Atmosphere> via
                these; without them useAtmosphere.tweenedDirective stays empty
                and no clouds render. Same fix mirrored into Preview. */}
            <WeatherPoller />
            <AtmosphereDirectiveDriver lookId={activeLookId} />
            <WeatherEffects />
            {/* Sky renderer stopgap (skyMode): cheap <CloudDome/> ships,
                <Atmosphere/> slab mounts under ?sky=volumetric. */}
            <R3FErrorBoundary name="Atmosphere">{SKY_IS_VOLUMETRIC ? <Atmosphere /> : <CloudDome />}</R3FErrorBoundary>
            {/* Terrain mesh hidden — the ribbons + land-use fills ARE the
                visible ground. Terrain still mounts so its shader uniforms
                drive displacement for ribbons/buildings. */}
            <group visible={false}>
              <R3FErrorBoundary name="Terrain"><Terrain /></R3FErrorBoundary>
            </group>
            {/* Heavy 3D-only props — skip mounting entirely in Designer
                (flat top-down view doesn't render trees/arch/lamps/scene
                detail, and `visible={false}` doesn't prevent the children's
                expensive useMemos from running). They mount as soon as a
                shot is active. */}
            {!inDesigner && sceneCfg.StageEnvironment && (
              <sceneCfg.StageEnvironment
                hiddenLayers={hiddenLayers}
                lookId={activeLookId}
                bakeLastMs={bakeLastMs}
              />
            )}
          </group>
          {/* SC.2 (2026-05-13): the duplicate `<PreviewPostFx>` mount that
              used to live here was a workaround for the StageApp-vs-Scene
              PostProcessing fork — Stage doubled up the chain so its
              Bloom panel sliders would drive a live effect. Now that the
              shared consumer above takes per-channel overrides, Stage
              gets live retint via the single mount and the doubled
              EffectComposer is gone. */}

          {!inDesigner && <LampGlowPump />}
          {!inDesigner && <NeonPump />}
          <Controls controlsRef={controlsRef} />
          {shot === 'hero' && sceneCfg.hasHero && (
            <HeroPreview keyframes={keyframes} motion={heroMotion}
              subject={resolveHeroSubject(heroSubject, { buildings: _allBuildings, archValues: useCartographStore.getState().arch?.values })} />
          )}
        </Canvas>

        {inDesigner && <MarkerOverlay cameraRef={orthoRef} />}
        {inDesigner && <MarkerFAB />}
        <Toolbar />
        <StatusBar />

        {!inDesigner && (
          <StagePanelReal shot={shot}
            setShot={(s) => useCartographStore.getState().setShot(s)}
            keyframes={keyframes} setKeyframes={setKeyframes}
            heroMotion={heroMotion} setHeroMotion={setHeroMotion}
            surfacesSlot={<CartographSurfaces />}
            skyLightSlot={<CartographSkyLight />}
            postSlot={<CartographPost />}
            lookForkSlot={<ShotLookFork shot={shot} />} />
        )}
      </div>

      {/* Re-mount Panel when the active Look changes so its local state
          rehydrates from the new Look's design. Cheap (Panel is just a
          control surface) and avoids subscribing to every layer-color
          change inside the Panel. */}
      {inDesigner && <Panel key={activeLookId || 'default'} />}

      <BakeModal />
    </div>
  )
}
