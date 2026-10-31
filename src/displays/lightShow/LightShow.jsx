/**
 * LightShow: the Light Show plugin's renderer, mounted by <Displays> in a set-piece's base frame (origin at the base
 * centre at grade, +Z the front face). It knows no town: where the strands hang and what the pinnacle is come from the
 * set-piece's declared `extent` (`ridge`, `pinnacle`); everything else is the display's authored record and its town's
 * drawer of looks. (BRIEF-the-monument-lights-up; the engine is ./engine.js, pure.)
 *
 *   · the GLOW: `strands.glow` warm-white strands, ridge to the foot ring
 *   · the SHOW: `strands.show` colour strands on the same cone, playing the run (looks separated by transitions)
 *   · the PINNACLE: a strip light at the foot of each face, washing up it in a gradient (never a screen)
 * Sizes and strengths are derived (./geometry.js), never one tower's. The drawer is the TOWN's content (its contentRoot).
 *   · one AVERAGE GLOW: a light tinted by the tree's mean colour, washing everything round it
 * The strands end at a ring `strands.footHeightM` above the set-piece's base (the display's authored value: on the
 * Pilgrim Monument, about 20 ft up, Jacob 2026-10-31), never on the terrain.
 * The clock: LIVE reads the town's one clock (useTimeOfDay.currentTime) and the display's schedule; Stage's preview
 * (./preview.js) plays the glow or the show from the moment it is pressed, on the page's own time, Stage only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useTimeOfDay from '../../hooks/useTimeOfDay'
import { townClockOf } from '../../lib/townClock.js'
import { validateDrawer, compileRun, showAt, showSeconds, glowColour, liveState, uplightTarget } from './engine.js'
import { checkFaces, strandEnds, pinnacleFace, bulbRadius, avgGlow } from './geometry.js'
import useDisplayPreview from '../preview.js'

const SHOW_GAIN = 2.4, GLOW_GAIN = 1.7                         // HDR, so the bulbs bloom like high-wattage lamps

/** Loads the town's drawer: looks.json, then every layer frame rasterized at the frame's size to RGBA. */
function useDrawer(url, where) {
  const [drawer, setDrawer] = useState(null), [err, setErr] = useState(null)
  useEffect(() => {
    if (!url) return
    let dead = false
    ;(async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`the drawer ${url} answered ${res.status}`)
      const d = await res.json()
      validateDrawer(d, where)
      const base = url.slice(0, url.lastIndexOf('/') + 1), { w, h } = d.frame
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const raster = (src) => new Promise((ok, no) => {
        const im = new Image(); im.onload = () => { ctx.clearRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h); ok(ctx.getImageData(0, 0, w, h).data) }
        im.onerror = () => no(new Error(`the look frame ${src} did not load`)); im.src = base + src
      })
      for (const L of d.looks) for (const layer of L.layers) layer.px = await Promise.all(layer.frames.map(raster))
      if (!dead) setDrawer({ ...d, byId: Object.fromEntries(d.looks.map(L => [L.id, L])) })
    })().catch(e => { if (!dead) setErr(e) })
    return () => { dead = true }
  }, [url, where])
  if (err) throw new Error(`[LightShow] ⛔ ${where}: ${err.message}`)
  return drawer
}

function Bulbs({ name, ends, rows, meshRef }) {
  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 4), [])   // unit: each bulb is scaled to its strand's spacing
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  const count = ends.length * rows
  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  return <instancedMesh name={name} ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />
}

export default function LightShow({ display, extent, calendar, contentRoot, dim, where }) {
  if (!extent?.ridge || !extent?.pinnacle) throw new Error(`[LightShow] ⛔ ${where}: the set-piece declares no ridge and pinnacle in its extent, so the strands have nowhere to hang`)
  const st = display.strands
  if (!(st?.glow > 0 && st?.show > 0 && st?.ringRadiusM > 0)) throw new Error(`[LightShow] ⛔ ${where}: strands needs glow, show and ringRadiusM`)
  if (!(st.footHeightM >= 0 && st.footHeightM < extent.ridge.yM)) throw new Error(`[LightShow] ⛔ ${where}: strands.footHeightM (${st.footHeightM}) must be authored, from the base up to below the ridge (${extent.ridge.yM.toFixed(1)} m)`)
  const preview = useDisplayPreview(s => s.modes[display.id])
  // Load the drawer only when the display can be on: Stage's preview, or a calendar to read the season from.
  if (contentRoot == null) throw new Error(`[LightShow] ⛔ ${where}: the town declares no contentRoot, so its drawer has no home`)
  const drawer = useDrawer(preview || calendar ? `${import.meta.env.BASE_URL}${contentRoot}${display.drawer}` : null, where)
  const compiled = useMemo(() => (drawer ? compileRun(display.run, drawer.byId, where) : null), [drawer, display.run, where])
  const F = drawer?.frame, rows = F ? F.h - F.pinH : 0
  if (F) checkFaces(F.faces, extent, where)

  const glowEnds = useMemo(() => F ? strandEnds(st.glow, extent.ridge.sides, extent.ridge.halfWidthM, st.ringRadiusM) : [], [F, st, extent])
  const showEnds = useMemo(() => F ? strandEnds(st.show, extent.ridge.sides, extent.ridge.halfWidthM, st.ringRadiusM) : [], [F, st, extent])

  const root = useRef(), glowRef = useRef(), showRef = useRef(), pinRef = useRef(), lightRef = useRef()
  const placed = useRef(false)

  const pinFaces = useMemo(() => {
    if (!F) return null
    return Array.from({ length: F.faces }, (_, k) => {
      const f = pinnacleFace(k, extent.pinnacle), g = new THREE.PlaneGeometry(f.width, f.height, 1, 6)
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3))
      return { g, position: f.position, rotation: f.rotation }
    })
  }, [F, extent])
  const pinMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color() }), [])
  // While lit, the set-piece's uplights ease down to dimUplights; off, back to as authored. Gone when this unmounts.
  useEffect(() => () => { if (dim) delete dim.byDisplay[display.id] }, [dim, display.id])

  // ⭐ A throw in the frame loop never reaches React (R3F calls useFrame in a bare loop), so it would freeze the whole
  // town's canvas every frame (Zob, 2026-10-31). Catch it, stop the frame work, and rethrow it at render: the display's
  // own DisplayBoundary then names and contains it.
  const [frameErr, setFrameErr] = useState(null), frameDead = useRef(false)
  useFrame((_, delta) => {
    if (frameDead.current) return
    try {
    if (!F || !compiled || !root.current || !glowRef.current || !showRef.current) return
    // ── where: lay the bulbs along each strand, ridge to its foot (once: the set-piece's base frame carries them) ───────
    if (!placed.current) {
      const footY = st.footHeightM
      for (const [ref, ends] of [[glowRef, glowEnds], [showRef, showEnds]]) {
        ends.forEach((e, s) => {
          const r = bulbRadius(Math.hypot(e.bx - e.tx, footY - extent.ridge.yM, e.bz - e.tz), rows)
          for (let j = 0; j < rows; j++) {
            const t = (j + 0.5) / rows
            tmp.m.makeScale(r, r, r).setPosition(e.tx + (e.bx - e.tx) * t, extent.ridge.yM + (footY - extent.ridge.yM) * t, e.tz + (e.bz - e.tz) * t)
            ref.current.setMatrixAt(s * rows + j, tmp.m)
          }
        })
        ref.current.instanceMatrix.needsUpdate = true
      }
      placed.current = true
    }
    // ── when: live by the town's clock and schedule, or Stage's preview from the moment it was pressed ───────────────
    const instant = useTimeOfDay.getState().currentTime
    let mode, t, now, up = true                                                         // Stage's preview hangs them
    if (preview) {
      const since = (performance.now() - preview.at) / 1000
      mode = preview.mode; now = instant.getTime() / 1000 + since; t = since % (showSeconds(compiled) + 4)
      if (mode === 'show' && t > showSeconds(compiled)) mode = 'glow'                   // a breath of glow between plays
    } else {
      const sunDown = useTimeOfDay.getState().getLightingPhase().sunAltitude < 0
      ;({ mode, t, up } = liveState(display, compiled, townClockOf(instant), calendar, sunDown, where)); now = instant.getTime() / 1000
    }
    const show = mode === 'show' ? showAt(F, compiled, drawer.byId, t, now) : null
    // What hangs: the GLOW strands are the real ones, up in season (dark by day, gone out of it); the SHOW strands exist
    // only while a show plays (they are the show's resolution, not hardware), and so do the pinnacle's strips. Unlit
    // bulbs are never left in the scene: the show strands share the glow strands' places and would cover them.
    showRef.current.visible = !!show; if (pinRef.current) pinRef.current.visible = !!show
    if (dim) { const cur = dim.byDisplay[display.id] ?? 1, to = uplightTarget(mode, display); dim.byDisplay[display.id] = cur + (to - cur) * Math.min(1, delta * 1.5) }
    // ── what: colour every bulb ───────────────────────────────────────────────────────────────────────────────────
    const avg = [0, 0, 0]; let n = 0
    const glowK = mode === 'glow' ? 1 : show ? show.glow : 0
    // …and once the show owns the strands (the glow faded out), the glow strands go too: unlit, they would cover a third of it.
    glowRef.current.visible = up && !(show && glowK === 0)
    glowEnds.forEach((e, s) => {
      const c = Math.floor(s * F.w / st.glow)
      for (let j = 0; j < rows; j++) {
        const g = glowK > 0 ? glowColour(c, j, now) : [0, 0, 0]
        tmp.c.setRGB(g[0] / 255 * glowK * GLOW_GAIN, g[1] / 255 * glowK * GLOW_GAIN, g[2] / 255 * glowK * GLOW_GAIN)
        glowRef.current.setColorAt(s * rows + j, tmp.c)
        if (glowK > 0) { avg[0] += g[0] * glowK; avg[1] += g[1] * glowK; avg[2] += g[2] * glowK; n++ }
      }
    })
    showEnds.forEach((e, s) => {
      const c = Math.floor(s * F.w / st.show)
      for (let j = 0; j < rows; j++) {
        const row = F.pinH + j
        let rgb = [0, 0, 0]
        if (show) {
          const r = show.reveal ? show.reveal(c, row) : 'on'
          rgb = r === 'spark' ? [255, 246, 228] : r === 'on' ? show.colour(c, row) : rgb
        }
        tmp.c.setRGB(rgb[0] / 255 * SHOW_GAIN, rgb[1] / 255 * SHOW_GAIN, rgb[2] / 255 * SHOW_GAIN)
        showRef.current.setColorAt(s * rows + j, tmp.c)
        if (show) { avg[0] += rgb[0]; avg[1] += rgb[1]; avg[2] += rgb[2]; n++ }
      }
    })
    glowRef.current.instanceColor.needsUpdate = true; showRef.current.instanceColor.needsUpdate = true
    // ── the pinnacle: each face's strip, washing up it ──────────────────────────────────────────────────────────────
    if (pinRef.current && pinFaces) pinFaces.forEach((face, k) => {
      const lo = [0, 0, 0], hi = [0, 0, 0]; let nl = 0, nh = 0
      if (show) for (let c = k * F.w / F.faces; c < (k + 1) * F.w / F.faces; c += 4) for (let row = 0; row < F.pinH; row += 3) {
        const v = show.colour(c, row), into = row >= F.pinH / 2 ? lo : hi
        into[0] += v[0]; into[1] += v[1]; into[2] += v[2]; row >= F.pinH / 2 ? nl++ : nh++
      }
      const kp = show ? show.pin : 0, L = lo.map(v => nl ? v / nl / 255 * kp : 0), Hc = hi.map(v => nh ? v / nh / 255 * kp : 0)
      const col = face.g.attributes.color, pos = face.g.attributes.position, H = extent.pinnacle.toM - extent.pinnacle.fromM
      for (let i = 0; i < pos.count; i++) {
        const up = pos.getY(i) / H + 0.5                                                  // 0 at the strip, 1 at the top
        const m = up < 0.35 ? 0.95 + (0.55 - 0.95) * up / 0.35 : 0.55 + (0.18 - 0.55) * (up - 0.35) / 0.65
        const mix = Math.min(1, up / 0.35) * 0.5 + Math.max(0, up - 0.35) / 0.65 * 0.5
        col.setXYZ(i, (L[0] + (Hc[0] - L[0]) * mix) * m * 1.6, (L[1] + (Hc[1] - L[1]) * mix) * m * 1.6, (L[2] + (Hc[2] - L[2]) * mix) * m * 1.6)
      }
      col.needsUpdate = true
      avg[0] += L[0] * 255 * 40; avg[1] += L[1] * 255 * 40; avg[2] += L[2] * 255 * 40; n += show ? 40 : 0
    })
    // ── the one average glow ───────────────────────────────────────────────────────────────────────────────────────
    if (lightRef.current) {
      const mr = n ? avg[0] / n / 255 : 0, mg = n ? avg[1] / n / 255 : 0, mb = n ? avg[2] / n / 255 : 0, lum = Math.max(mr, mg, mb)
      lightRef.current.color.setRGB(lum ? mr / lum : 0, lum ? mg / lum : 0, lum ? mb / lum : 0)
      lightRef.current.intensity = avgGlow(extent, lum).intensity
    }
    } catch (e) { frameDead.current = true; setFrameErr(e) }
  })

  if (frameErr) throw new Error(`[LightShow] ⛔ ${where}: ${frameErr.message}`)
  if (!F) return null
  return (
    <group ref={root} name="display:light-show">
      <Bulbs name="light-show:glow" ends={glowEnds} rows={rows} meshRef={glowRef} />
      <Bulbs name="light-show:show" ends={showEnds} rows={rows} meshRef={showRef} />
      <group ref={pinRef} name="light-show:pinnacle">
        {pinFaces.map((f, k) => <mesh key={k} geometry={f.g} material={pinMat} position={f.position} rotation={f.rotation} />)}
      </group>
      <pointLight ref={lightRef} position={[0, avgGlow(extent, 0).y, 0]} intensity={0} decay={2} distance={0} />
    </group>
  )
}
