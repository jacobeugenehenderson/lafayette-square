import { placedLook, onPlaceMoved } from '../lib/townPlace.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { installShadowMaskDebug } from '../utils/shadowMaskDebug.js'
installShadowMaskDebug()  // ?shadowmask=1 — must run before any material compiles
import { PerspectiveCamera } from '@react-three/drei'
import RegimeControls from '../components/RegimeControls.jsx'

// Map geometry (rendered in every shot)
import MapLayers from './MapLayers.jsx'
import DesignerTrees from './DesignerTrees.jsx'
import DesignerLamps from './DesignerLamps.jsx'
import OneWayArrows from './OneWayArrows.jsx'

// Designer-only (aerial + authoring overlays)
import AerialBase, { AerialFocus } from './AerialTiles.jsx'
import SurveyorOverlay from './SurveyorOverlay.jsx'
import ParkTitleHandle from './ParkTitleHandle.jsx'
import { PARK_TITLE_DEFAULT_CENTER } from '../components/LafayetteParkBody.jsx'
import MeasureOverlay from './MeasureOverlay.jsx'
import CornerEditHandles from './CornerEditHandles.jsx'
import BlockGeometryV2Debug from './BlockGeometryV2Debug.jsx'
import MarkerOverlay from './MarkerOverlay.jsx'
import MarkerFAB from './MarkerFAB.jsx'
import { DesignerArch } from './DesignerArch.jsx'
import Town from '../components/Town.jsx'
import { placeTown } from '../components/Town.jsx'
import { authoringQuality, townCanvasProps } from '../lib/qualityProfile.js'
import { shallow } from 'zustand/shallow'

// Shot-only (environment paint-in)
import { reloadTerrain, onTerrainReload } from '../utils/terrainShader'
import { streetEyeY } from '../utils/elevation'
import R3FErrorBoundary from '../components/R3FErrorBoundary'
import { HeroPreview, useStageMovie } from '../stage/StageApp.jsx'
import { SHOT_LABELS, streetStandOf } from '../camera/shots.js'
import { assertKeyframesAimed } from '../preview/heroAnim.js'
import { derivedOpeningKeyframe } from '../lib/cameraRegimes.js'
import { cameraPush, publishCameraState } from '../stage/cameraBridge.js'
import { createCameraTween } from '../camera/cameraTween.js'
import { transitionMs } from '../camera/transitions.js'

import ribbonsRaw from '../data/ribbons.json'
import lsNeighborhoodBoundary from '../../cartograph/data/lafayette-square/neighborhood_boundary.json'
import { slabFetch } from '../lib/slabUrl.js'
import { townForLook, INSTANCE, mapForLook } from '../instance.js'

// UI
import Toolbar from './Toolbar.jsx'
import ExtentApp from './ExtentApp.jsx'
import StatusBar from './StatusBar.jsx'
import Panel from './Panel.jsx'
import StagePanelReal from './StagePanel.jsx'
import { useDiagnostics } from '../stage/diagnostics.js'
import CartographSkyLight from './CartographSkyLight.jsx'
import CartographPost from './CartographPost.jsx'
import { authoredBrowseFrame, browseSquare, browseSquareAltitude } from '../camera/browseFrame.js'
import { setTodStill, todSlotAtMinute } from './animatedParam.js'
import { SHOTS_FLAT_DEFAULTS } from './skyLightChannels.js'
import BakeModal from './BakeModal.jsx'
import CartographSurfaces from './CartographSurfaces.jsx'

// Hooks + store
import useCartographStore, { activeChannel, isStageShot } from './stores/useCartographStore.js'
import { addressUrl } from '../lib/authoringAddress.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCamera from '../hooks/useCamera'
import useListings from '../hooks/useListings'
import useSelectedBuilding from '../hooks/useSelectedBuilding'

const CAM_KEY = 'cartograph-camera'

// ⭐ STAGE KEEPS THE OPERATOR'S PLACE ACROSS A RELOAD (Jacob, 2026-09-27: editing a Night key, a code change
// reloaded Stage, it came back at Noon, and the place was lost). The moment — date and time, so the season and
// the keyframe the playhead is parked on come back too — and whether time is live or paused ride sessionStorage:
// per tab, survives a reload, not a new tab. Session-only: never saved into a Look, never baked.
// A first open in a tab starts at noon, so the sky starts with daylight.
const TOD_PLACE_KEY = 'stage-tod-place'
;(() => {
  let saved = null
  try { saved = JSON.parse(sessionStorage.getItem(TOD_PLACE_KEY) || 'null') } catch { /* storage blocked */ }
  const tod = useTimeOfDay.getState()
  if (saved?.live) return                                    // it was following the clock: stay live
  if (Number.isFinite(saved?.t)) { tod.setTime(new Date(saved.t)); tod.setPaused(!!saved.paused); return }
  // Noon is the TOWN's noon (setHour reads its zone), so with no town placed yet (a cold Stage, a refused link) it waits
  // for one — it used to throw here, at module load, and take the page down before the Look picker could draw.
  if (placedLook()) { tod.setHour(12); return }
  const off = onPlaceMoved(() => { if (placedLook()) { off(); useTimeOfDay.getState().setHour(12) } })
})()
// A stopped clock is a still moment: channels keyed on the tile it stands on show their key, fades aside.
// No town placed yet (a cold Stage, the picker open): the tile depends on the town's sun, so there is none until one is.
const _syncStill = () => {
  const s = useTimeOfDay.getState()
  if (s.isLive || !placedLook()) return setTodStill(null)
  const m = s.getMinuteOfDay()
  setTodStill(m, todSlotAtMinute(m, s.currentTime))   // the tile the editor targets at this stopped minute
}
_syncStill()
useTimeOfDay.subscribe(_syncStill)
onPlaceMoved(_syncStill)
let _todPlaceTimer = null
useTimeOfDay.subscribe(() => {
  if (_todPlaceTimer) return                                 // at most twice a second, so playback is saved too
  _todPlaceTimer = setTimeout(() => {
    _todPlaceTimer = null
    const s = useTimeOfDay.getState()
    try { sessionStorage.setItem(TOD_PLACE_KEY, JSON.stringify({ t: s.currentTime.getTime(), live: s.isLive, paused: s.isPaused })) } catch { /* storage blocked */ }
  }, 500)
})

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

// window.__r3f — live R3F state (scene, gl, camera) for console forensics.
// Same convention as window.__bldgXray / window.__treeAlphaTest. READ-ONLY
// handle; the scene graph is the only reliable place to answer "is this light
// actually configured the way the source says." Added 2026-09-20 after three
// DOM-scanning probes failed: R3F v8 puts `__r3f` on THREE objects, never on
// DOM elements, so there is no way in from the page without a handle.
function SceneHandle() {
  const st = useThree()
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__r3f = st
    return () => { if (window.__r3f === st) delete window.__r3f }
  }, [st])
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

// ── Browse in Stage: the WORKING view, and the authored frame ──────────────
// Browse is a PLAN VIEW — pan and zoom, nothing else (2026-09-05): a centre on the ground and a height.
// ⭐ TWO THINGS, NOT ONE (Jacob, 2026-10-04). The FRAME is what the town opens on in playback — authored only by the
// Camera card's "Set as Browse frame" (src/camera/browseFrame.js). The WORKING view is where the operator left the
// camera: Designer ↔ Browse carries it across (the hand-off below), and leaving Browse for Hero or Street and coming
// back returns to it, so a placement checked in the Designer can be seen lit in Stage without re-navigating.
// Per town, per tab (sessionStorage, like the moment): survives a reload, never saved into a Look, never baked.
// ⛔ It used to be one thing: the frame was recorded implicitly on every settle, so checking a corner's light moved
// the town's runtime frame.
const BROWSE_VIEW_KEY = (mapKey) => `cartograph-browse-view:${mapKey}`
function readBrowseView(mapKey) {
  try { return authoredBrowseFrame(JSON.parse(sessionStorage.getItem(BROWSE_VIEW_KEY(mapKey)))) } catch { return null }
}
function writeBrowseView(mapKey, center, altitude) {
  try { sessionStorage.setItem(BROWSE_VIEW_KEY(mapKey), JSON.stringify({ center, altitude })) } catch { /* private window: the view is not kept */ }
}

function CameraRig({ orthoRef, perspRef, controlsRef }) {
  const { camera, scene, size } = useThree()
  const shot = useCartographStore(s => s.shot)
  const mapKey = useCartographStore(s => s.scene)
  // Re-assert framing once the design (incl. heroKeyframes) finishes hydrating.
  // shot persists in localStorage, so a refresh can land directly in Hero
  // before the async design fetch resolves — without this the rig reads the
  // store-default keyframes and never re-applies (appliedShot guards re-entry).
  const designHydrated = useCartographStore(s => s._designHydrated)
  // Poured-scene shot framing scales to the boundary radius; subscribe so the
  // shot RE-APPLIES once the async boundary lands (else browse keeps LS's pose).
  const sceneBoundary = useCartographStore(s => s.sceneBoundary)
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
  // The controls are keyed on Designer/shot so they rebuild when the default
  // camera swaps. On rebuild its target defaults to (0,0,0), so we re-assert
  // target (and on Designer, also re-assert the ortho's orientation) here
  // after a frame delay — giving the new controls instance time to mount.
  useEffect(() => {
    const key = `${mapKey}:${shot}:${designHydrated}:${sceneBoundary?.radius || 0}`
    if (appliedShot.current === key) return
    appliedShot.current = key
    const applyTarget = () => {
      const ctl = controlsRef.current
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
        if (!cam || !SHOT_LABELS[shot]) return
        // fov is the town's authored `shots` channel; WHERE each shot puts the camera is below (Browse: hand-off,
        // working view, frame · Hero: the keyframes · Street: the stand point) — never a fixed pose.
        const storeShots = useCartographStore.getState().shots?.values
        // ⭐ THE TOWN'S OWN DISC frames whatever is neither handed off nor authored — Browse's first entry and Street's
        // stand point — in EVERY town, LS included. ⛔ It was gated on the town's NAME (`mapKey !== 'lafayette-square'`),
        // and LS, or any town whose boundary had not loaded, stood on LS's absolute poses (StageApp#SHOTS, removed). No disc ⇒
        // nothing to frame, said out loud (as Hero does), never another town's pose.
        const disc = sceneBoundary?.radius > 0 && Array.isArray(sceneBoundary.center) && sceneBoundary.center.every(Number.isFinite)
          ? { c: sceneBoundary.center, R: sceneBoundary.radius } : null
        let fov = storeShots?.[shot]?.fov ?? SHOTS_FLAT_DEFAULTS[shot].fov
        const workingView = shot === 'browse' ? readBrowseView(mapKey) : null
        const frameSquare = shot === 'browse' && !workingView
          ? browseSquare(useCartographStore.getState().browseFrame, disc && { center: disc.c, radius: disc.R }, fov, 'stage') : null
        let toPos
        let toTarget
        if (shot === 'browse') {
          // ⭐ THE HAND-OFF RUNS BOTH WAYS (2026-09-05): Designer → Browse is the exact inverse of the Browse →
          // Designer line above (there zoom = viewportH / visibleH; here altitude = visibleH / 2tan(fov/2)), so the
          // round trip is lossless, and the target is the point under the camera (Browse looks straight down).
          const ortho = orthoRef.current
          if (ortho && prevShot.current === 'designer' && ortho.zoom > 0) {
            const visibleH = size.height / ortho.zoom
            const y = visibleH / (2 * Math.tan((fov * Math.PI / 180) / 2))
            toPos = [ortho.position.x, y, ortho.position.z]
            toTarget = [ortho.position.x, 0, ortho.position.z]
          } else if (workingView) {
            // Back from Hero or Street, or a reload: where the operator left it (the working view, above).
            toPos = [workingView.center[0], workingView.altitude, workingView.center[1]]
            toTarget = [workingView.center[0], 0, workingView.center[1]]
          } else if (frameSquare) {
            // First entry this tab: the town's Browse frame, exactly as playback opens on it (src/camera/browseFrame.js).
            const sq = frameSquare
            toPos = [sq.x, browseSquareAltitude(sq.half, { fov, W: size.width, H: size.height }), sq.z]
            toTarget = [sq.x, 0, sq.z]
          } else {
            console.error('[stage] browse: no hand-off, no authored frame and no scene disc (neighborhood_boundary.json) — nothing to frame')
            toPos = [cam.position.x, cam.position.y, cam.position.z]
            toTarget = ctl ? [ctl.target.x, ctl.target.y, ctl.target.z] : toPos
          }
        } else if (shot === 'hero') {
          // Hero framing is the operator's KEYFRAMES, each with its own aim.
          // Enter at the path start — the first keyframe's position, target and
          // fov; HeroPreview plays from there. A town with none gets the opening
          // view derived from its own disc (cameraRegimes.js), the same one
          // Preview and production open on.
          // ⛔ No hero subject and no fixed pose (StageApp#SHOTS.hero was Lafayette Square's): the
          // camera is never aimed at a designation (BRIEF-camera-regimes, H-7).
          const kfs = useCartographStore.getState().heroKeyframes
          const open = kfs?.length
            ? assertKeyframesAimed(kfs, 'stage')[0]
            : derivedOpeningKeyframe(sceneBoundary, fov)
          if (open) {
            toPos = [...open.position]
            toTarget = [...open.target]
            fov = open.fov
          } else {
            console.error('[stage] hero: no keyframes and no scene disc (neighborhood_boundary.json) — nothing to frame')
            toPos = [cam.position.x, cam.position.y, cam.position.z]
            toTarget = ctl ? [ctl.target.x, ctl.target.y, ctl.target.z] : toPos
          }
        } else if (disc) {
          // Street: the one stand point with no tap (src/camera/shots.js#streetStandOf; its height is set below).
          const [sx, sz] = streetStandOf({ center: disc.c, radius: disc.R })
          toPos = [sx, 0, sz]
          toTarget = [sx, 0, sz - 0.5]
        } else {
          console.error('[stage] street: no scene disc (neighborhood_boundary.json) — nothing to stand on')
          toPos = [cam.position.x, cam.position.y, cam.position.z]
          toTarget = ctl ? [ctl.target.x, ctl.target.y, ctl.target.z] : toPos
        }
        // ⛔ STREET, EVERY TOWN (LS included): the eye stands 5′8″ above the
        // drawn ground at its own point — the one method (utils/elevation#streetEyeY).
        // No stand point carries a height, so nothing else can stand it anywhere.
        if (shot === 'street') {
          const eye = storeShots?.street?.eyeHeight ?? SHOTS_FLAT_DEFAULTS.street.eyeHeight
          const y = streetEyeY(toPos[0], toPos[2], eye)
          toPos = [toPos[0], y, toPos[2]]
          toTarget = [toTarget[0], y, toTarget[2]]
        }
        const toUp = shot === 'browse' ? [0, 0, -1] : [0, 1, 0]   // Browse: a true overhead, north up

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
    // The controls remount via their key change — wait one tick for the new
    // instance to be in controlsRef before we push the target.
    const id = requestAnimationFrame(applyTarget)
    useCamera.getState().setMode(shot === 'street' ? 'planetarium' : shot)
    return () => cancelAnimationFrame(id)
  }, [shot, mapKey, designHydrated, sceneBoundary, orthoRef, perspRef, controlsRef])

  // Drive the in-flight shot tween. Same vernacular as Preview's
  // ShotCamera + production CameraRig — easeInOutCubic position/target/
  // fov interpolation between Hero/Browse/Street perspective shots.
  useFrame(() => {
    if (tweenRef.current.isActive()) tweenRef.current.tick(performance.now())
  })

  // ── The Stage CAMERA card, live in Cartograph (2026-09-08) ────────────────
  // The panel Cartograph mounts is the Stage's own, and its CAMERA card talks
  // to the shared bridge (../stage/cameraBridge.js). Only `StageCamera` (excised 2026-09-26) — the
  // standalone /stage page — ever filled that bridge, so in THIS app the card
  // showed the bridge's initial constants (Center 0/0, Altitude 0 m, FOV 22°)
  // while the camera sat wherever it sat, and every number typed into it went
  // into a `pending` nobody drained. Three jobs per frame: drain, publish,
  // record.
  const bridgeFrames = useRef(0)
  const settle = useRef({ key: null, at: 0 })
  useFrame(() => {
    if (shot === 'designer' || shot === 'extent') return
    const cam = perspRef.current
    if (!cam) return
    const ctl = controlsRef.current
    // A tween owns the camera while it runs — do not fight it, and do not
    // record the poses it passes through.
    if (tweenRef.current.isActive()) return

    // 1) DRAIN — the panel's numbers win over the current pose.
    if (cameraPush.pending) {
      const u = cameraPush.pending
      cameraPush.pending = null
      if (u.position) cam.position.set(u.position[0], u.position[1], u.position[2])
      if (u.fov != null) { cam.fov = u.fov; cam.updateProjectionMatrix() }
      if (u.up) cam.up.set(u.up[0], u.up[1], u.up[2])
      const aim = u.target || (ctl ? [ctl.target.x, ctl.target.y, ctl.target.z] : null)
      if (aim) {
        // ⛔ BROWSE IS A PLAN VIEW (2026-09-05). The card's Center X/Z push
        // nudges the camera 1 m off the target so a generic lookAt is not
        // degenerate; here that nudge would be a tilt this view may not have.
        // Snap the camera over its own target instead — dead overhead.
        if (shot === 'browse') { cam.position.x = aim[0]; cam.position.z = aim[2] }
        cam.lookAt(aim[0], aim[1], aim[2])
        if (ctl) { ctl.target.set(aim[0], aim[1], aim[2]); ctl.update() }
      }
    }

    if (++bridgeFrames.current % 10 !== 0) return

    // 2) PUBLISH — what the card reads.
    const aim = ctl
      ? [ctl.target.x, ctl.target.y, ctl.target.z]
      : [cam.position.x, 0, cam.position.z]
    publishCameraState(cam, aim)

    // 3) KEEP — the working view, on SETTLE (not mid-pan). It is not the frame: that is authored by the card's button.
    if (shot !== 'browse') return
    const cx = Math.round(aim[0]), cz = Math.round(aim[2]), alt = Math.round(cam.position.y)
    const key = cx + ',' + cz + ',' + alt
    if (key !== settle.current.key) { settle.current = { key, at: performance.now() }; return }
    if (settle.current.at === 0) return                       // already committed
    if (performance.now() - settle.current.at < 400) return   // still moving
    settle.current.at = 0
    writeBrowseView(mapKey, [cx, cz], alt)
  })

  // Persist designer pan/zoom (ortho only). Browse ↔ Designer view sync is
  // handled by the cross-camera handoff in the shot-change useEffect above
  // (read ortho/persp directly), not via localStorage — and as of 2026-09-05
  // that handoff runs BOTH WAYS. It had only ever run Browse → Designer.
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
function Controls({ controlsRef, heroPlaying = false }) {
  // ⛔⛔ THE PLAY FLAG IS A PROP, NOT A STORE READ — and the first cut of this fix
  // read the store and was therefore INERT. In the Cartograph `heroMotion.preview`
  // is NOT persisted state: CartographApp composes it per render —
  //     const heroMotion = { ...storeMotion, preview: previewPlaying, speed: … }
  // — from a LOCAL useState (`previewPlaying`). The store's heroMotion carries
  // only the authored { length, mode }, so `st.heroMotion?.preview` is always
  // undefined and the gate never closed.
  const shot = useCartographStore(s => s.shot)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  // A keyframe-edit state once gated orbit in Hero and forbade the actual
  // workflow — fly first, THEN memorise (Jacob, 2026-09-20). It is gone; the
  // only gate is playback, below.

  const inDesigner = shot === 'designer'
  // Designer: pan enabled unless a tool owns the click.
  const panEnabled = !inDesigner || spaceDown
    || (!tool && !markerActive)
    || ((tool === 'surveyor' || tool === 'measure') && !hoverTarget && !markerActive)

  // ⭐ ONE CONTROLS DEFINITION PER REGIME (src/lib/cameraRegimes.js), the same
  // in every app — this app only CHOOSES:
  //   Designer → plan (ortho)  ·  Browse → plan  ·  Street → street
  //   Hero → orbit, handed to playback while it plays.
  // ⛔ Browse has no orbit (2026-09-05): it is the same view of the same ground
  // the Designer shows, which is why the two hand their framing to each other,
  // and a tilted Browse camera has no ortho equivalent.
  if (inDesigner) {
    return (
      <RegimeControls key="ortho" regime="plan" controlsRef={controlsRef} makeDefault={false}
        enablePan={panEnabled} limits={{ minZoom: 0.03, maxZoom: 40 }} />
    )
  }
  if (shot === 'browse') return <RegimeControls key="browse" regime="plan" controlsRef={controlsRef} />
  if (shot === 'street') return <RegimeControls key="street" regime="street" controlsRef={controlsRef} />
  // ⛔⛔ LOCKED WHILE PLAYBACK IS DRIVING, FREE OTHERWISE — and the gate is
  // PLAYING vs NOT, never SHOT vs SHOT.
  // History, because both halves were got wrong in one day (2026-09-20/21):
  // · Originally `enabled={shot !== 'hero' || heroAuthoring}` — orbit was locked
  //   in Hero unless the operator clicked a keyframe to author it. That forbade
  //   the actual workflow: Jacob flies to a pose FIRST and memorises it second
  //   ("you memorize keyframes arrived at using the controls"). Fixed in ea04dd0c
  //   by enabling always.
  // · ⛔ But the lock had a SECOND job that comment stated and I removed with it:
  //   "the bounce plays as it ships". OrbitControls with makeDefault writes the
  //   camera every frame, so with it always enabled the hero playback had nothing
  //   left to move — Jacob: "I programmed new keyframes into the camera but they
  //   don't playback when I push play."
  // ⇒ Both are satisfied by gating on the PLAYBACK flag (`heroMotion.preview`,
  //   the same one StageApp's HeroPreview reads). Fly freely whenever it is not
  //   playing; hand the camera over while it is.
  return <RegimeControls key="persp" regime={heroPlaying ? 'playback' : 'orbit'} controlsRef={controlsRef} />
}

// ── Environment tickers (shot-only) ────────────────────────────────────────
// ⭐ A SCRUBBED CLOCK STANDS STILL (Jacob, 2026-09-27: "When we're in a time slot, the time needs to stop. I have
// been editing against an hour in the future"). The ticker ran on after a chip click or a drag, so the scene drifted
// away from the key being edited. It advances only in live mode; the ◦ live button resumes it.
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

// LS stencil = the neighborhood boundary polygon, scaled outward to the
// fade.outer + buffer band. Mirrors the bake-side derivation in sceneStencil.js
// so V2's blockRounded comes out the same shape Designer-side as bake-side.
// Without this, V2's `blockRounded = stencil − asphaltRounded` is empty, which
// kills cornerSidewalkPads (clipped against blockRounded and lands at zero rings)
// and any other stencil-bound clip. ⚠️ It is a MASK for block fill — it is not the
// clip for barriers (clipPolylineToBoundary) or centerlines (clipPolylineToRadius).
// Shared by every center+radius scene so a new neighborhood is a one-line add.
//
// ⛔⛔ GEOMETRY DOES NOT READ THE FADE (Jacob, 2026-10-06, ruling (a)): the mask is the disc's own ring, at the radius
// exactly — the same as the bake (`cartograph/sceneStencil.js`). It reached `fade.outer + 50` when a band was set; the
// fade is now a Look's, ends at the radius and ruffles inward only, so nothing past the radius renders.
function stencilFromBoundary(nb) {
  const poly = nb?.boundary
  if (!poly?.length || !nb?.center || !nb?.radius) return null
  return poly.map(([x, z]) => [x, z])
}
const LS_STENCIL = stencilFromBoundary(lsNeighborhoodBoundary)

// Per-scene configuration. The single source of truth for "what's
// different about this scene" — components above this line should not
// branch on scene names. New scenes register here; capabilities default
// to false unless declared.
//
// `ribbons` is the static post-bake intersections + faces artifact
// (centerline geometry comes from the live store, scene-aware). Once
// promote-ribbons is scene-keyed (Phase 0e) this can shrink to a path.
const MAP_REGISTRY = {
  'lafayette-square': {
    ribbons: ribbonsRaw,
    stencil: LS_STENCIL,
    hasAerial: true,
  },
}
// MAP_REGISTRY holds only the DEFAULT installation ('lafayette-square', with
// its bundled ribbons — Designer's). Its 3D is <Town>, like every town's. Any
// OTHER installation is a generic "poured neighborhood": its config is built
// from data loaded BY ID (ribbons + boundary from the store), so no specific
// neighborhood is named here. `sceneBoundary` is the active installation's
// fetched neighborhood_boundary.json.
function genericSceneConfig(sceneBoundary) {
  return {
    ribbons: null,                                  // → store.sceneRibbons at render
    stencil: sceneBoundary ? stencilFromBoundary(sceneBoundary) : null,
    hasAerial: true,                                // AerialTiles reads the active installation's geography
    // Its 3D is <Town> (src/components/Town.jsx) — the assembly production and Preview mount.
  }
}
function sceneConfig(scene, sceneBoundary) {
  return MAP_REGISTRY[scene] || genericSceneConfig(sceneBoundary)
}

// ── Stage's live channels → <Town overrides> ─────────────────────────────────
// Every slider in the Look panel reaches the town through ONE object, so a channel added to <Town>
// (Town.jsx OVERRIDE_KEYS) is wired here once, not per piece. activeChannel resolves the active
// shot's fork (the channel-variant cascade). Doctrine: project_authoring_is_live_production_is_static.
const STAGE_CHANNELS = [
  'buildingPalette', 'wallPalettes', 'materialPhysics', 'materialColors', 'neon', 'lampGlow', 'lantern', 'canopy', 'treeWind', 'arch',
  'archLight', 'setPieceLight', 'landscape', 'shadow', 'mist', 'edgeRuffle', 'sky', 'ambient', 'hemi', 'dirSun', 'dirMoon',
  'constellations', 'milkyWay', 'skyGain', 'stars', 'bloom', 'ao', 'exposure', 'warmth', 'fill', 'halo',
  'grade', 'grain', 'dof', 'surfaces', 'labels',
]
function useStageOverrides(heroKeyframes, heroMotion) {
  const channels = useCartographStore(s => Object.fromEntries(STAGE_CHANNELS.map(k => [k, activeChannel(s, k)])), shallow)
  const neonForceOn = useCartographStore(s => s.neonForceOn)
  const neonDensity = useCartographStore(s => s.neonDensity)
  const lampsOn = useCartographStore(s => s.layerVis?.lamp !== false)
  // The Survey's hero, live: what a keyframe's 'hero' focus names (src/lib/focusObject.js).
  const heroSubject = useCartographStore(s => s.heroSubject)
  // The Identity panel's lit tint, live (the Look's identity.litTint; unchosen → the renderer's neutral).
  const litTint = useCartographStore(s => s.identity?.litTint)
  // Force Neon On OFF means "not forced" — neon follows each place's hours, as it ships. A literal `false`
  // told SceneNeon to switch every tube off, so Stage never showed the neon production draws.
  // The park title's live position (Designer's drag handle) — that set-piece's own entry, as labels.json bakes it.
  const parkTitlePos = useCartographStore(s => s.parkTitlePos)
  const setPieceTitles = useMemo(() => (parkTitlePos ? { 'lafayette-park': parkTitlePos } : undefined), [parkTitlePos])
  return useMemo(() => ({ ...channels, neonForceOn: neonForceOn || undefined, neonDensity, lampsOn, heroSubject, setPieceTitles, heroKeyframes, heroMotion, litTint }),
    [channels, neonForceOn, neonDensity, lampsOn, heroSubject, setPieceTitles, heroKeyframes, heroMotion, litTint])
}
// Stage's shots → the shot <Town> draws (Designer draws no <Town>).
const TOWN_SHOT = { hero: 'movie', browse: 'plan', street: 'street' }
// Stage authors creative intent, so it draws every pass; what each surface ships is Preview's deployment layer.
const QUALITY = authoringQuality()
// The Canvas the town is drawn through, from the same profile <Town> is given.
const townCanvas = townCanvasProps(QUALITY)

// ── App ─────────────────────────────────────────────────────────────────────
export default function CartographApp() {
  const orthoRef = useRef(null)
  const perspRef = useRef(null)
  const controlsRef = useRef(null)

  const shot = useCartographStore(s => s.shot)
  const scene = useCartographStore(s => s.scene)
  const weatherMode = useCartographStore(s => s.weatherMode)
  const tool = useCartographStore(s => s.tool)
  const markerActive = useCartographStore(s => s.markerActive)
  const markerEraserActive = useCartographStore(s => s.markerEraserActive)
  const spaceDown = useCartographStore(s => s.spaceDown)
  const hoverTarget = useCartographStore(s => s.hoverTarget)
  const bgColor = useCartographStore(s => s.bgColor)
  const layerVis = useCartographStore(s => s.layerVis)
  const parkTitlePos = useCartographStore(s => s.parkTitlePos)
  const setParkTitlePos = useCartographStore(s => s.setParkTitlePos)
  const luColors = useCartographStore(s => activeChannel(s, 'luColors'))
  const aerialVisible = useCartographStore(s => s.aerialVisible)
  const centerlineData = useCartographStore(s => s.centerlineData)
  const sceneRibbons = useCartographStore(s => s.sceneRibbons)
  const sceneBoundary = useCartographStore(s => s.sceneBoundary)
  const corridorByIdx = useCartographStore(s => s.corridorByIdx)
  const selectedStreet = useCartographStore(s => s.selectedStreet)
  const activeLookId = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const storeKeyframes = useCartographStore(s => s.heroKeyframes)
  const setStoreKeyframes = useCartographStore(s => s.setHeroKeyframes)
  const storeMotion = useCartographStore(s => s.heroMotion)
  const setStoreMotion = useCartographStore(s => s.setHeroMotion)

  // Live arch placement — gates the Designer's arch prop below.
  const archOverride     = useCartographStore(s => s.arch)

  // Hero keyframes + authored motion live in the store (persisted to design.json).
  // preview + speed are transient runtime UI only.
  const keyframes = storeKeyframes
  const setKeyframes = setStoreKeyframes
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewSpeed, setPreviewSpeed] = useState(1)
  const heroMotion = useMemo(() => ({ ...storeMotion, preview: previewPlaying, speed: previewSpeed }), [storeMotion, previewPlaying, previewSpeed])
  const setHeroMotion = (next) => {
    const f = typeof next === 'function' ? next(heroMotion) : next
    if (f.length !== heroMotion.length || f.mode !== heroMotion.mode) {
      setStoreMotion({ length: f.length, mode: f.mode })
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
    slabFetch(activeLookId, 'scene.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setBakedLayerVis(j?.layerVis || {}) })
      .catch(() => { if (!cancelled) setBakedLayerVis({}) })
    // Re-fetch on activeLookId change AND on bake completion (bakeLastMs
    // bumps when runBake succeeds).
  }, [activeLookId, bakeLastMs])

  // Re-point the terrain singleton at the active Look's baked terrain. Terrain
  // is a per-installation slab artifact now (not a bundled global), so a Stage
  // switch to another installation must swap the heightfield the same way
  // BakedGround swaps ground.bin. Force on a re-bake (bakeLastMs) so a Look's
  // FIRST bake — which fills in previously-404 (flat) terrain — takes effect.
  // ⛔ sceneExag() is read during render, and reloadTerrain re-points it ASYNC with no
  // re-render. So after a reload Stage kept the BOOT town's exaggeration (Lafayette
  // Square's 1.5, the page's default town) until some unrelated re-render (Stage's
  // Weather switch) dropped it to the active town's own value (Jacob, 2026-09-26:
  // "when I click clear the elevation goes down almost flat"). Re-render on reload.
  const [, setTerrainGen] = useState(0)
  useEffect(() => onTerrainReload(() => setTerrainGen(g => g + 1)), [])
  const _prevBakeMs = useRef(bakeLastMs)
  useEffect(() => {
    if (!activeLookId) return
    const bakeChanged = _prevBakeMs.current !== bakeLastMs
    _prevBakeMs.current = bakeLastMs
    reloadTerrain(activeLookId, { force: bakeChanged })
  }, [activeLookId, bakeLastMs])

  // Stage shots read visibility from the BAKE (a hidden layer is not poured). ⭐ Except the lamps: they draw from the
  // lamp file already baked, so their switch (Furniture › Lamps) is live in Stage as OPERATIONS says — it read the
  // baked value, so turning lamps on did nothing until a bake (Jacob's Dawn pass, 2026-09-27).
  const effectiveLayerVis = inDesigner ? layerVis : { ...(bakedLayerVis || {}), lamp: layerVis?.lamp }
  const hiddenLayers = {}
  const shoreMedian = useDiagnostics(s => s.shoreMedian)
  for (const k in effectiveLayerVis) {
    if (effectiveLayerVis[k] === false) hiddenLayers[k] = true
  }
  // Background view: aerialVisible swaps the painted background between
  // curated SVG and aerial photo. Curated rendering hides only when
  // aerial is on AND we're in pure Design — under tools, ribbons +
  // tool affordances stay over the aerial as reference, and the user
  // declutters via per-layer visibility toggles in the Designer Panel.
  const sceneCfg = useMemo(() => sceneConfig(scene, sceneBoundary), [scene, sceneBoundary])
  // The active Look's installation — <Town town>, never the page's boot one.
  // ⛔ No Look yet ⇒ no town (townForLook refuses a null Look).
  const activeTown = useMemo(() => (activeLookId ? townForLook(activeLookId, 'Stage') : null), [activeLookId])
  // ⭐ THE PAGE FOLLOWS ITS TOWN (BRIEF-no-default-town, 2026-09-28). Modules that read the town at load (INSTANCE —
  // the listings, the buildings, the page's content) are the page's; when the store's town is not INSTANCE's — by a pick,
  // a ?scene= link or the Looks alignment — the page reloads onto it (the store has persisted it; the URL is set to it).
  // It used to reload only on a pick, so ?scene=huron drew huron with Lafayette Square's listings. ⛔ Never over unsaved
  // edits: that blocks the switch, loudly. ⛔ Once per town: a reload that still disagrees says so and stops.
  // ⛔ Only on the RESOLVED Look: before _loadLooks the store holds the raw address, and following a refused link's
  // `?look=` reloaded the page onto the very town the refusal had declined.
  const looksHydrated = useCartographStore(s => s._looksHydrated)
  useEffect(() => {
    if (!activeLookId || !looksHydrated) return
    const map = mapForLook(activeLookId)
    if (!map || map === INSTANCE?.mapId) { try { sessionStorage.removeItem('stage-follow-town') } catch { /* ignore */ } ; return }
    const st = useCartographStore.getState()
    if (st._saveDesignDebounced.pending?.()) {
      console.error(`[stage] ⛔ "${activeLookId}" is open in the store but the page is still "${INSTANCE?.lookId ?? 'no town'}" — an edit is unsaved, so the page is NOT reloaded onto it. Save (or wait for the autosave), then reload.`)
      useCartographStore.setState({ status: `Switching to ${activeLookId} waits for an unsaved edit — reload once it has saved` })
      return
    }
    let tried = null; try { tried = sessionStorage.getItem('stage-follow-town') } catch { /* ignore */ }
    if (tried === activeLookId) { console.error(`[stage] ⛔ reloaded onto "${activeLookId}" but the page is still "${INSTANCE?.lookId ?? 'no town'}" — not reloading again`); return }
    try { sessionStorage.setItem('stage-follow-town', activeLookId) } catch { /* ignore */ }
    const s = useCartographStore.getState()
    window.location.replace(addressUrl(window.location.href, s.looks, { scene: map, lookId: activeLookId, shot: s.shot, stage: isStageShot(s.shot) }).toString())
  }, [activeLookId, looksHydrated])
  // ⭐ THE ADDRESS IS WHERE YOU ARE (Phase 2 A). `?scene=&look=&shot=` is written from the store's triple as it moves, so
  // a copied link reopens this town, this Look, this shot (the store reads all three back: `initialShot`, `_loadLooks`).
  // ⛔ Not before the Looks are known, and never over a REFUSED link — the bad address stays on screen with its alarm.
  // ▶ OPERATIONS.md §"Open Stage by URL"
  useEffect(() => {
    const write = (s) => {
      if (!s._looksHydrated || s.lookRefused) return
      // ⭐ A Stage shot is written as the clean `/stage/<town>/<shot>` (authoringAddress.js#addressUrl).
      const url = addressUrl(window.location.href, s.looks, { scene: s.scene, lookId: s.activeLookId, shot: s.shot, stage: isStageShot(s.shot) })
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
    }
    write(useCartographStore.getState())
    return useCartographStore.subscribe((s, prev) => {
      if (s.scene !== prev.scene || s.activeLookId !== prev.activeLookId || s.shot !== prev.shot
        || s._looksHydrated !== prev._looksHydrated || s.lookRefused !== prev.lookRefused) write(s)
    })
  }, [])
  // Stage places the town it is on, like every app's entry: in Designer no <Town> is mounted, and the sun, the
  // moon, the season and Stage's own panels still follow the active town. (Terrain is reloaded above.)
  useLayoutEffect(() => { if (activeTown) placeTown(activeTown, activeLookId) }, [activeTown, activeLookId])
  // Stage's selection and listings, handed to <Town>.
  const selectedId = useSelectedBuilding((s) => s.selectedId)
  const selectStore = useSelectedBuilding((s) => s.select)
  const deselectStore = useSelectedBuilding((s) => s.deselect)
  const onSelectBuilding = useCallback((id) => (id ? selectStore(id) : deselectStore()), [selectStore, deselectStore])
  const listings = useListings((s) => s.listings)
  // Stage's live path rides into <Town>'s movie driver as overrides (the keys, and the motion with Stage's speed);
  // the playhead and Play come through <Town movie>.
  const townOverrides = useStageOverrides(keyframes, heroMotion)
  const stageMovie = useStageMovie(keyframes, heroMotion)
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

  // Extent is a top-level DESTINATION (its own nav button, like Designer /
  // Stage), not a Designer tool-mode — so it renders as its own minimal
  // top-down Canvas instead of threading through the shot-branched scene
  // below. Placed after every hook above so hook order stays stable across
  // the designer⇄extent switch.
  if (shot === 'extent') return <ExtentApp />

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
          {...townCanvas}
          orthographic
          frameloop="always"
          // The Canvas-level camera is the Designer's orthographic one (Town is never drawn through it); the shots'
          // PerspectiveCamera below is Town's. Everything else is the quality profile's (townCanvasProps — the same
          // profile <Town> is given).
          camera={{ position: [0, 500, 0], zoom: 3, near: 0.1, far: 2000 }}
          onCreated={({ gl }) => { gl.setClearColor(0x2a2a26, 1) }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <PerspectiveCamera
            ref={perspRef}
            makeDefault={!inDesigner}
            fov={SHOTS_FLAT_DEFAULTS.browse.fov}
            near={1}
          />
          <CameraRig orthoRef={orthoRef} perspRef={perspRef} controlsRef={controlsRef} />


          {/* ── Ground:
              - Designer (any scene) → V2 live render via
                <BlockGeometryV2Debug/>. Reads centerlines + intersections
                + blockCustoms from the live store so authoring edits
                show without re-baking.
              - Any non-Designer shot (any scene) → <BakedGround/>. Same
                component Preview mounts, same per-Look slab Publish
                ships. ↻ / Stage→ refresh via cache-bust on bakeLastMs. ── */}
          <SceneHandle />
          {inDesigner && <ambientLight intensity={1} />}


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
                ribbons={sceneCfg.ribbons ?? sceneRibbons}
                stencil={sceneCfg.stencil}
                flat={inDesigner}
                scene={scene}
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
          {/* ⭐ Every town draws through <Town> — the assembly production and Preview mount, Lafayette Square
              included since SlabBuildings recolours the palette live (BRIEF-live-building-palette).
              ▶ node checks/claims-every-app-mounts-the-town.mjs */}
          {!inDesigner && activeTown && (
            <Town lookId={activeLookId} town={activeTown} quality={QUALITY} shot={TOWN_SHOT[shot]} flight={false} bakeLastMs={bakeLastMs} movie={stageMovie}
              selectedId={selectedId} onSelectBuilding={onSelectBuilding} listings={listings}
              overrides={townOverrides} weatherMode={weatherMode} holdScrubbedTime
              layers={{
                buildings: !hiddenLayers.building, neon: !hiddenLayers.building, trees: !hiddenLayers.tree,
                lamps: !hiddenLayers.lamp, park: !hiddenLayers.park, labels: !hiddenLayers.labels,
                shoreMedian,
              }} />
          )}
          {/* ── Map layers (flat ground geometry — neighborhood only).
              In shots, layers with 3D equivalents (park, buildings, trees,
              lamps, water) are suppressed so the 3D components own them.
              In Designer, any time aerial is on (tool focus OR pure design
              with aerial), hide entirely so the photo isn't covered by
              buildings/parcels/water/parking-lots/etc. */}
          {/* Map layers — ONE scene-generic renderer for LS + every pour
              (unified 2026-07-23). MapLayers now resolves its map/ribbons/
              boundary per-scene; the old `scene === 'lafayette-square'` gate +
              the thin SceneMapLayers substitute (buildings+LU only) are retired,
              so a poured scene gets the full Designer view — road paint, alleys,
              barriers, parking, labels — not just footprints. */}
          {/* Only once a Look is resolved: MapLayers draws the ACTIVE Look's labels, and a null Look is refused. */}
          {activeLookId && (!toolAerialFocus || surveyMode) && !designAerialOnly && (
            <MapLayers hiddenLayers={inDesigner ? decorationsHidden : hiddenLayers} inShot={!inDesigner}
              surveyActive={tool === 'surveyor' && inDesigner}
              measureActive={tool === 'measure' && inDesigner} />
          )}
          {/* Trees (2D flat dots) for EVERY poured scene — reads the baked slab,
              sized by DBH, tinted by source. One shared path (LS + non-LS),
              replacing MapLayers' old LS-only park-census discs. Designer-only;
              Stage's 3D InstancedTrees owns the trees in shots. */}
          {inDesigner && (!toolAerialFocus || surveyMode) && !designAerialOnly && (
            <DesignerTrees scene={scene} hiddenLayers={decorationsHidden} bakeLastMs={bakeLastMs} />
          )}

          {/* Lamps (2D flat dots) for EVERY poured scene — reads the baked slab
              (baked/<scene>/lamps.json), one shared path, replacing MapLayers'
              old hardwired src/data/street_lamps.json (prod LS only). The lamp
              twin of DesignerTrees. Designer-only; Stage's 3D BakedLamps owns
              the real lamp props in shots. */}
          {inDesigner && (!toolAerialFocus || surveyMode) && !designAerialOnly && (
            <DesignerLamps scene={scene} hiddenLayers={decorationsHidden} bakeLastMs={bakeLastMs} />
          )}

          {/* ── Designer-only UI overlays. Survey + Measure overlays mount
              in every scene. AerialTiles is gated by scene capabilities;
              DesignerArch follows the Look's
              set-piece opt-in (below). Mounting
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
            {/* The arch silhouette follows the Look's installed `arch` block, not
                a scene name — same gate the 3D component uses, so Designer and
                Stage can never disagree. */}
            {archOverride && !toolAerialFocus && !designAerialOnly && <DesignerArch />}
            {/* One-way direction chevrons — every scene, toggle via layerVis.oneway. */}
            <OneWayArrows />
            <SurveyorOverlay />
            {tool === 'measure' && <MeasureOverlay />}
          </>}

          {/* ── Shot-only (environment paint — must exactly mirror runtime) ── */}
          {/* SC.2 (2026-05-13): the duplicate `<PreviewPostFx>` mount that
              used to live here was a workaround for the StageApp-vs-Scene
              PostProcessing fork — Stage doubled up the chain so its
              Bloom panel sliders would drive a live effect. Now that the
              shared consumer above takes per-channel overrides, Stage
              gets live retint via the single mount and the doubled
              EffectComposer is gone. */}

          <Controls controlsRef={controlsRef} heroPlaying={previewPlaying} />
          {/* ⛔⛔ `sceneCfg.hasHero` GATED THIS AND WAS TRUE FOR LAFAYETTE SQUARE
              ONLY — removed 2026-09-21. HeroPreview is not a decoration, it IS the
              playback driver: StageApp.jsx#HeroPreview mounts MovieCamera, which plays
              the keyframes and writes the camera. Unmounted, the Play button
              toggled a flag nothing read.
              ⇒ Jacob, on huron: "I programmed new keyframes into the camera but
              they don't playback when I push play" … "the LS values are the
              defaults, and they are useless, but they don't drive the camera
              either." Correct on both counts — there was no driver in the scene.
              ⭐ The flag had exactly ONE consumer (this line) and read as "does this
              town have a hero OBJECT". It does not gate an object, and since
              BRIEF-camera-regimes the camera reads no hero object at all — each
              keyframe carries its own aim. A town with no landmark still needs a camera path —
              Jacob, earlier the same night: "the hero object … that is barely a
              thing". ⛔ Conflating "has a landmark" with "may move its camera" is
              the LS-gated-capability shape, seventh of the night. */}
          {shot === 'hero' && (
            <HeroPreview keyframes={keyframes} motion={heroMotion} />
          )}
        </Canvas>

        {inDesigner && <MarkerOverlay cameraRef={orthoRef} />}
        {/* Drag-to-move handle for the park title — Designer only, LS only, only
            when the title is shown and no tool owns the click. */}
        {inDesigner && scene === 'lafayette-square' && !tool && layerVis.parkTitle !== false && (
          <ParkTitleHandle cameraRef={orthoRef}
            pos={parkTitlePos || PARK_TITLE_DEFAULT_CENTER}
            onChange={setParkTitlePos} />
        )}
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
