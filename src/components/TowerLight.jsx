/**
 * TowerLight — a light over the map, for reading it at any hour (Jacob, 2026-10-14: "the user needs to be able to see
 * the map and if it's at night the map is inherently dark"; "the cast shadows be distinct and emanating from the center
 * of the screen"). The time, the sky and the weather stay real: this ADDS a light; it never replaces the sun or moon.
 *
 * ⭐ WHAT IT IS. One SpotLight standing over the ground under the middle of the screen (the plan controls' target), its
 * cone fitted to the ground the view shows (the four screen corners on that ground), so it follows a pan, a zoom and a
 * lean, and its shadow texels cover what is on screen at every zoom (~1.2 screen px per texel, measured: kit
 * scratch/bulb-cost/probe.mjs). Its shadows are CRISP: its shadow carries its own `radius` (three's own filter), so the
 * PCSS stamp that softens the sun's (pcssShadows.js) never reaches it — and the hard lookup is also the cheap one
 * (measured: PCSS on this light +15–19 ms a frame, hard ≈ the light alone). Its map is drawn when the view or the
 * terrain's exaggeration moves, and held while they rest, as PrimaryOrb holds the sun's.
 * ⭐ HOW BRIGHT: the town's own daylight key — the sun's full-day intensity in the kit's one ramp (celestialLights.js
 * #sunIntensity) times the Look's authored `dirSun` at the town's own noon slot. No number of its own.
 * ⭐ WHEN IT LOADS (Jacob: "the lamp is totally last place … only prompted manually with the lamp; and even then some
 * pause is justified"). Nothing of it exists until the first time it is asked for: <Town towerLight> mounts this then.
 * It compiles its programs with renderer.compileAsync while held invisible (RevealGate's pattern: shown for the
 * synchronous call, hidden before any frame draws it), reports 'warming', and turns on when they are linked; every
 * later toggle only moves its intensity. ▶ node checks/claims-the-tower-light-loads-on-its-first-tap.mjs
 * ⛔ ONE SHADOW MAP, NEVER TWO, AND THIS IS THE RULED EXCEPTION (Jacob, 2026-10-14, choosing option C: "C may be the
 * biggest cost but it's likely 50% or more of use cases"). Phones run shadows:false, so there it lights and casts nothing.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { DIRSUN_FIELD_KEYS, DIRSUN_FLAT_DEFAULTS, kitDayChannel } from '../cartograph/skyLightChannels.js'
import { sunIntensity } from './celestialLights.js'
import { terrainExag } from '../utils/terrainShader'

// The cone's half-angle: a choice of the light's shape, not of any town — the bulb stands as high above the ground as
// its pool is wide (45°: height = the view's ground radius), so its shadows lean out from the middle of the screen.
const CONE_HALF = Math.PI / 4
// The light at full day, before the Look's dirSun: the kit's own ramp at the sun overhead.
const FULL_DAY = sunIntensity(Math.PI / 2)

/** @param on  the reader wants it on (the Ward's control), in the plan shot. @param onState ('warming' | 'on' | 'off') */
export default function TowerLight({ on, lookId, onState }) {
  const { gl, scene, camera, controls, invalidate } = useThree()
  const sceneJson = useSceneJson(lookId)
  const spot = useMemo(() => {
    const s = new THREE.SpotLight(0xffffff, 0, 0, CONE_HALF, 0.15, 0)
    s.name = 'town:towerLight'
    s.castShadow = true
    // CRISP: its own radius, so the PCSS stamp on LightShadow.prototype's accessor is never read for this light.
    Object.defineProperty(s.shadow, 'radius', { value: 1, writable: true, configurable: true })
    s.shadow.autoUpdate = false
    return s
  }, [])
  const ready = useRef(false)
  const last = useRef({ m: null, exag: NaN })

  // Mounted (the first ask): add it, compile ahead while it is hidden, then say it is ready.
  useEffect(() => {
    let primary = null
    scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) primary = o })
    if (primary) spot.shadow.mapSize.copy(primary.shadow.mapSize)   // the kit's own shadow resolution, the sun's
    scene.add(spot); scene.add(spot.target)
    onState?.('warming')
    let gone = false
    let compiled
    try { spot.visible = true; compiled = gl.compileAsync(scene, camera) } finally { spot.visible = false }
    compiled.then(() => { if (gone) return; ready.current = true; invalidate() },
      (e) => { console.error('[TowerLight] ⛔ compiling the tower light failed:', e); onState?.('off') })
    return () => { gone = true; scene.remove(spot); scene.remove(spot.target); spot.shadow.map?.dispose(); spot.dispose?.() }
  }, [spot, scene, gl, camera])

  useFrame(() => {
    if (!ready.current) return
    const want = !!on
    if (spot.visible !== want) { spot.visible = want; onState?.(want ? 'on' : 'off'); if (want) spot.shadow.needsUpdate = true }
    if (!want) return
    // Brightness: the town's daylight key at its own noon slot.
    const dirSun = sceneJson?.dirSun ?? kitDayChannel('dirSun')
    const slots = getTodSlotMinutes(useTimeOfDay.getState().currentTime)
    const noonMul = resolveGroupAtMinute(dirSun, slots.noon, dirSun.animated ? slots : null, DIRSUN_FIELD_KEYS, DIRSUN_FLAT_DEFAULTS).value ?? 1
    spot.intensity = FULL_DAY * noonMul
    // Placement: over the ground under the middle of the screen, the cone fitted to the ground in view. Redrawn only
    // when the view or the exaggeration has moved.
    camera.updateMatrixWorld()
    const moved = !last.current.m || !last.current.m.equals(camera.matrixWorld) || last.current.exag !== terrainExag.value
    if (!moved) return
    last.current = { m: camera.matrixWorld.clone(), exag: terrainExag.value }
    const target = controls?.target ?? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(camera.position.y))
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y), ray = new THREE.Raycaster(), hit = new THREE.Vector3()
    let r = 0
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ray.setFromCamera(new THREE.Vector2(x, y), camera)
      if (ray.ray.intersectPlane(plane, hit)) r = Math.max(r, Math.hypot(hit.x - target.x, hit.z - target.z))
    }
    if (!(r > 0)) return
    const h = r / Math.tan(CONE_HALF)
    spot.position.set(target.x, target.y + h, target.z)
    spot.target.position.copy(target)
    // The shadow camera spans from well above the roofs to past the farthest lit ground: both from the cone, not a town.
    spot.shadow.camera.near = h / 4
    spot.shadow.camera.far = 2 * Math.hypot(h, r)
    spot.shadow.camera.updateProjectionMatrix()
    spot.updateMatrixWorld(); spot.target.updateMatrixWorld()
    spot.shadow.needsUpdate = true
  })
  return null
}
