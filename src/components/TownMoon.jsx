/**
 * THE TOWN'S MOON, AS A PICTURE — for a page that shows tonight's moon beside the town (the Ward's Almanac sheet,
 * BRIEF-ward-society-pass §B). Ruled by Boz, 2026-09-29 (option C).
 *
 *   const moon = useTownMoonImage(time)       // time: a Date, or null = now (refreshed each minute)
 *   moon === null                             → not drawn yet
 *   moon.error                                → "no moon picture: <why>" — the page says so; ⛔ never a blank disc
 *   moon.src, moon.phase, moon.fraction, moon.angle
 *        src       a 220 px square PNG data URL — the disc on a transparent sky (draw it at half size, for sharpness)
 *        phase     0 new · 0.25 first quarter · 0.5 full · 0.75 last quarter (SunCalc's)
 *        fraction  0..1, how much of the disc is lit
 *        angle     degrees, the lit side's direction on the picture (0 = right, 90 = up), as seen from the town
 *
 * ⭐ ONE MOON. The picture is the sky's own moon: the same material (`createMoonMaterial` — the photographed surface,
 *    kit `textures/moon.jpg`), the same sun and moon positions (`moonSky`), the same lighting step (`moonSunDir3D`).
 *    Its camera stands in the town and looks straight at the moon with the horizon level, so the crescent AND its
 *    tilt are the ones the town sees at `time`. It is drawn whether or not the moon is above the horizon.
 * ⭐⭐ NO SECOND WEBGL CONTEXT (Boz). `<Town>` mounts `TownMoonPainter` inside the canvas it already draws with; a
 *    picture is one imperative render of the moon alone into a small offscreen target on that context, read back into
 *    a 2D canvas — never the town, never the composer, and it needs no frame, so it works while `<Town paused>`.
 * ⭐ Re-drawn only when the picture would visibly change (lit fraction to 1%, angle to 2°), and at most every 250 ms, so
 *    a time slider being dragged does not render on every frame.
 * ⛔ Where and when come from the placed town (`townPlace()`, set by `<Town town>` / `placeTown`) and `time` — never the
 *    kit's boot town; no place is an error that says so. No `<Town>` on the page (an embed without one) is an error
 *    too, after a short wait: ⛔ never a blank image that reads as a new moon.
 * ▶ node checks/claims-the-town-moon-is-the-sky-moon.mjs
 */
import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { kitUrl } from '../lib/kitUrl.js'
import { townPlace } from '../lib/townPlace.js'
import { moonSky, moonSunDir3D } from './celestialLights.js'
import { createMoonMaterial } from './CelestialBodies'

const SIZE = 220
const WAIT_FOR_TOWN_MS = 8000
const THROTTLE_MS = 250

/** The picture's view of the moon: camera in the town, level, looking at it. Pure — the hook keys on its angle. */
function pictureView(sky, camera, sunDir3D) {
  camera.position.set(0, 0, 0)
  camera.up.set(0, 1, 0)
  camera.lookAt(sky.moonPosition)
  camera.updateMatrixWorld()
  moonSunDir3D(sky.sunVisual.clone().normalize(), camera, sunDir3D)
  return { angle: (Math.atan2(sunDir3D.y, sunDir3D.x) * 180) / Math.PI }
}

// ── The painter: one per mounted <Town>, registered here, used by the hook. ─────────────────────────────────────
let _painter = null
const _listeners = new Set()
const notify = () => _listeners.forEach((f) => { try { f() } catch { /* a listener's own */ } })

function makePainter(gl, texture) {
  const material = createMoonMaterial(texture)
  material.uniforms.horizonFade.value = 0      // the Almanac shows the moon below the horizon too
  material.uniforms.dayFactor.value = 0        // the moon as the night shows it
  material.blending = THREE.NoBlending         // straight alpha into the picture, as a PNG expects
  const camera = new THREE.PerspectiveCamera(10, 1, 0.01, 10)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  const scene = new THREE.Scene()
  scene.add(mesh)
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE)
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const prevColor = new THREE.Color()
  const dir = new THREE.Vector3()

  function paint(sky) {
    if (gl.getContext().isContextLost()) throw new Error('the WebGL context is lost')
    const { angle } = pictureView(sky, camera, material.uniforms.sunDir3D.value)
    // The disc fills the frame: a plane one unit out, as tall as the view.
    dir.copy(sky.moonPosition).normalize()
    mesh.position.copy(dir)
    mesh.quaternion.copy(camera.quaternion)
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    mesh.scale.set(h, h, 1)
    material.uniforms.phase.value = sky.illum.phase

    const prevTarget = gl.getRenderTarget(), prevAuto = gl.autoClear, prevAlpha = gl.getClearAlpha()
    gl.getClearColor(prevColor)
    try {
      gl.setRenderTarget(target)
      gl.setClearColor(0x000000, 0)
      gl.clear(true, true, true)
      gl.render(scene, camera)
      gl.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels)
    } finally {
      gl.setRenderTarget(prevTarget)
      gl.setClearColor(prevColor, prevAlpha)
      gl.autoClear = prevAuto
    }
    if (gl.getContext().isContextLost()) throw new Error('the WebGL context was lost while drawing')
    // A GL read-back is bottom-up; the picture is top-down. A 2D canvas, never a second WebGL one.
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(SIZE, SIZE)
    for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
    ctx.putImageData(img, 0, 0)
    return { src: c.toDataURL('image/png'), angle }
  }
  function dispose() { target.dispose(); material.dispose(); mesh.geometry.dispose() }
  return { paint, dispose }
}

/** Mounted by <Town> inside its canvas. Draws nothing itself; lends its context to the hook. */
export function TownMoonPainter() {
  const gl = useThree((s) => s.gl)
  const texture = useTexture(kitUrl('textures/moon.jpg'))   // the sky moon's own texture (drei caches it by URL)
  useEffect(() => {
    const p = makePainter(gl, texture)
    _painter = p
    notify()
    return () => { if (_painter === p) { _painter = null; notify() } p.dispose() }
  }, [gl, texture])
  return null
}

/** The town's moon at `time` (a Date, or null = now), as a picture — see the header for what it returns. */
export function useTownMoonImage(time) {
  const [out, setOutRaw] = useState(null)
  // An error that has not changed must not re-render (every render re-asks the sky, so this would loop).
  const setOut = (next) => setOutRaw((prev) => (next.error && prev?.error === next.error ? prev : next))
  const [, bump] = useState(0)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const last = useRef({ key: null, at: 0, timer: null })

  // A live moon moves: re-ask each minute.
  useEffect(() => {
    if (time) return
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [time])
  // Hear a <Town> arrive or leave.
  useEffect(() => { const f = () => bump((n) => n + 1); _listeners.add(f); return () => _listeners.delete(f) }, [])
  // No <Town> at all: say so, after a wait long enough for one to mount.
  useEffect(() => {
    if (_painter) return
    const id = setTimeout(() => { if (!_painter) setOut({ error: 'no moon picture: no <Town> is drawing on this page' }) }, WAIT_FOR_TOWN_MS)
    return () => clearTimeout(id)
  })

  const at = time instanceof Date ? time : new Date(nowTick)
  let sky = null, error = null, key = null
  try {
    sky = moonSky(at, townPlace())
    const probe = new THREE.PerspectiveCamera(10, 1, 0.01, 10)
    const { angle } = pictureView(sky, probe, new THREE.Vector3())
    key = `${Math.round(sky.illum.fraction * 100)}:${Math.round(angle / 2)}`
  } catch (e) { error = `no moon picture: ${e.message}` }

  useEffect(() => {
    if (error) { setOut({ error }); return }
    if (!_painter || key === last.current.key) return
    const run = () => {
      last.current.timer = null
      last.current.at = Date.now()
      try {
        const { src, angle } = _painter.paint(sky)
        last.current.key = key
        setOut({ src, phase: sky.illum.phase, fraction: sky.illum.fraction, angle })
      } catch (e) {
        setOut({ error: `no moon picture: ${e.message}` })
      }
    }
    clearTimeout(last.current.timer)
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - last.current.at))
    last.current.timer = setTimeout(run, wait)
    return () => clearTimeout(last.current.timer)
  })

  return out
}
