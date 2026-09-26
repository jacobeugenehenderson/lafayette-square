/**
 * RegimeControls — the ONE controls mount every runtime uses
 * (BRIEF-camera-regimes). What each regime does lives in
 * `src/lib/cameraRegimes.js#REGIMES`; this file only mounts it.
 *
 * Props
 *   regime       'plan' | 'orbit' | 'street' | 'playback'
 *   controlsRef  optional ref that receives the OrbitControls instance
 *   enabled      false while something else owns the camera (a tween, playback)
 *   enablePan    a transient GATE (e.g. the Designer's pan is off while a tool
 *                owns the click); it can only turn the regime's pan OFF
 *   target       the initial pivot, where a viewer needs one (tool viewers)
 *   limits       content-scale limits only (REGIME_LIMIT_KEYS) — a tree viewer
 *                is not a town. Gestures are never per-mount.
 *   makeDefault  default true
 *   managed      the caller drives ONE instance across regimes imperatively with
 *                `applyRegime` (production's CameraRig, whose manual transitions
 *                relax and restore the controls). Renders the bare instance; the
 *                definitions still come only from REGIMES.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { REGIMES, REGIME_LIMIT_KEYS } from '../lib/cameraRegimes.js'

export default function RegimeControls(props) {
  if (props.managed) return <ManagedControls {...props} />
  return <DeclaredControls {...props} />
}

function ManagedControls({ controlsRef, makeDefault = true }) {
  return <OrbitControls makeDefault={makeDefault} ref={controlsRef} />
}

function DeclaredControls({
  regime, controlsRef, enabled = true, enablePan = true, target, limits = {}, makeDefault = true,
}) {
  const r = REGIMES[regime]
  if (!r) throw new Error(`[camera] unknown controls regime '${regime}'`)
  for (const k of Object.keys(limits)) {
    if (!REGIME_LIMIT_KEYS.includes(k)) throw new Error(`[camera] '${k}' is not a per-mount limit — gestures are fixed per regime`)
  }
  const on = enabled && regime !== 'playback'
  const localRef = useRef(null)
  const invalidate = useThree(s => s.invalidate)
  const enabledRef = useRef(on)
  enabledRef.current = on
  const panRef = useRef(enablePan && r.enablePan)
  panRef.current = enablePan && r.enablePan

  // ⚠️ Buttons and touches are re-pushed IMPERATIVELY on every regime change:
  // drei renders OrbitControls as a <primitive> and R3F mutates `mouseButtons`
  // in place, so a referentially-equal prop does not re-push after the instance
  // is rebuilt on a camera swap (the failure BrowseControls documented).
  useEffect(() => {
    const c = localRef.current
    if (!c) return
    c.mouseButtons = { ...r.mouseButtons }
    c.touches = { ...r.touches }
  }, [r])

  // ⛔ RE-AIM ON HANDOVER. While playback (or a tween) drives, the controls are
  // disabled and their `target` stands still — but the CAMERA has moved. Enable
  // them again and the first drag would orbit around a point from before, and
  // OrbitControls.update() would haul the camera back to satisfy it: a snap.
  // ⇒ On every false→true transition, move `target` to the point the camera is
  // actually looking at, at the distance it was already holding.
  const wasEnabled = useRef(on)
  useEffect(() => {
    const c = localRef.current
    if (c && on && !wasEnabled.current && regime !== 'street') {
      const dist = c.target.distanceTo(c.object.position) || 1
      const fwd = new THREE.Vector3()
      c.object.getWorldDirection(fwd)
      c.target.copy(c.object.position).addScaledVector(fwd, dist)
      c.update()
    }
    wasEnabled.current = on
  }, [on, regime])

  // ── The orbit regime's modifiers ─────────────────────────────────────────
  // ⭐ ONE BUTTON AND TWO MODIFIERS, so a pen can do all three moves: drag
  // orbits · ⌥-drag grabs the ground · ⌃/⌘-drag pans. Middle-drag dollies and
  // the wheel zooms for a mouse.
  // ⭐ ⌥ GRABS THE GROUND. Jacob: "I just want to grab the scene and drag it to
  // the left or to the right." The ground point under the pen at pen-down stays
  // under the pen: the camera slides across the ground to keep it there, like
  // dragging a map. Height and look direction are untouched and `target` travels
  // with the camera, so orbiting afterwards turns about the same relative point.
  // "Ground" is the horizontal plane through `target` — no scene raycast, so it
  // costs nothing. ⛔ Not a camera-drive (tried first; the scene went the wrong
  // way), and not OrbitControls' DOLLY (closes on a fixed target and stalls).
  // ⚠️ ⌃ STAYS `ROTATE` ON PURPOSE. OrbitControls swaps ROTATE↔PAN itself when
  // Ctrl/Meta/Shift is down, so a `PAN` mapping would orbit under ⌃. macOS can
  // also deliver ⌃-click as a RIGHT click, so RIGHT has to be ROTATE under ⌃
  // too; the same swap turns both into a pan.
  // ⛔ THE PAN IS THE FRAMING GESTURE: ⌃-dragging moves the subject in the frame
  // — that IS the tilt, and "From view" reads where it landed. There is
  // deliberately no keyboard nudge: the framing is what you SEE.
  useEffect(() => {
    if (regime !== 'orbit' && regime !== 'playback') return
    const setButtons = (mod) => {
      const c = localRef.current
      if (!c) return
      c.mouseButtons = {
        ...r.mouseButtons,
        RIGHT: mod === 'ctrl' ? THREE.MOUSE.ROTATE : r.mouseButtons.RIGHT,
      }
    }
    // ⌥ is tracked from the KEYBOARD as well as read off the press: a tablet
    // driver can deliver the pen's pointer events without the modifier flags.
    let altHeld = false
    const read = (e) => ((e.ctrlKey || e.metaKey) ? 'ctrl' : null)
    const onKey  = (e) => { altHeld = e.altKey; setButtons(read(e)) }
    const onBlur = () => { altHeld = false; setButtons(null) }
    setButtons(null)
    // The ⌥ grab. ⛔ ⌥ IS A CLAMP: while it is held, the press is swallowed
    // before OrbitControls sees it, so nothing can orbit, dolly or pan under it
    // — only the grab moves the camera. (Jacob's stylus "spiralled" the scene
    // when OrbitControls still got the press: a pen can arrive as a touch,
    // which OrbitControls tumbles whatever the modifier, and the grab ran on
    // top of it.) A press above the horizon grabs nothing and moves nothing; a
    // move whose ray runs off toward the horizon is skipped rather than flung.
    let grab = null
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    const groundAt = (c, e) => {
      const rect = c.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      c.object.updateMatrixWorld()
      ray.setFromCamera(ndc, c.object)
      if (!ray.ray.intersectPlane(plane, hit)) return null
      const reach = 50 * Math.max(Math.abs(c.object.position.y + plane.constant), 1)   // 50× height
      return hit.distanceTo(c.object.position) > reach ? null : hit
    }
    const onDown = (e) => {
      const alt = e.altKey || altHeld
      setButtons(read(e))
      const c = localRef.current
      if (!c || !enabledRef.current || !panRef.current || !alt) return
      if (!c.domElement.contains(e.target)) return   // R3F's wrapper div, not the <canvas>
      e.stopPropagation()                            // the clamp: OrbitControls never hears it
      if (!e.isPrimary) return
      plane.constant = -c.target.y
      const g = groundAt(c, e)
      grab = g ? g.clone() : null
    }
    const onMove = (e) => {
      const c = localRef.current
      if (!grab || !c || !e.isPrimary) return
      const h = groundAt(c, e)
      if (!h) return
      const step = grab.clone().sub(h).setY(0)   // move so `grab` is back under the pen
      c.object.position.add(step)
      c.target.add(step)
      invalidate()
    }
    const onUp = () => { grab = null }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    // ⚠️ Capture phase on window, so the press is judged (and, under ⌥,
    // swallowed) before it reaches OrbitControls on the canvas's wrapper.
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [regime, r, invalidate])

  const { mouseButtons, touches, enablePan: regimePan, ...params } = r
  // Stable, so a re-render does not detach/re-attach the instance (and clobber
  // a held modifier's button map).
  const attach = useCallback((c) => {
    localRef.current = c
    if (controlsRef) controlsRef.current = c
    if (c) { c.mouseButtons = { ...mouseButtons }; c.touches = { ...touches } }
  }, [controlsRef, mouseButtons, touches])
  return (
    <OrbitControls
      makeDefault={makeDefault}
      ref={attach}
      {...params}
      {...limits}
      {...(target ? { target } : {})}
      enabled={on}
      enablePan={regimePan && enablePan}
    />
  )
}
