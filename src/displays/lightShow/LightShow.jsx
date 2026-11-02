/**
 * LightShow: the Light Show plugin's renderer, mounted by <Displays> in a set-piece's base frame (origin at the base
 * centre at grade, +Z the front face). It knows no town: where the strands hang and what the pinnacle is come from the
 * set-piece's declared `extent` (`ridge`, `pinnacle`); everything else is the display's authored record and its town's
 * drawer of looks. (BRIEF-the-monument-lights-up; the engine is ./engine.js, pure.)
 *
 *   · ONE set of `strands.show` strands on the cone. Every strand is a dark gray CORD with CLEAR glass bulbs, each in its
 *     dark Edison socket (Jacob, 2026-10-31); a bulb's light is inside its glass, so an unlit bulb is clear, never black.
 *   · the GLOW hangs every (show ÷ glow)-th strand, the real ones, lit warm white; a SHOW hangs them all and lights them
 *     with the run (looks separated by transitions). Out of season nothing hangs; in season by day the glow strands
 *     hang unlit.
 *   · the PINNACLE: a strip light at the foot of each face, washing up it in a gradient (never a screen)
 * Sizes and strengths are derived (./geometry.js), never one tower's. The drawer is the TOWN's content, read from where the
 * app names (../drawerUrl.js: Stage's authoring drawer, or the copy the bake published for Preview and the player).
 *   · one AVERAGE GLOW: a light tinted by the tree's mean colour, washing everything round it
 *   · HOW BRIGHT, WHAT COLOUR: the display's own Look channel (../showChannel.js, from <Displays>): the show's colours ×
 *     its `show`, the glow at its `kelvin` × its `glow`. No gain of our own (r-a-display-is-authored-on-its-own-look-channel).
 * The strands end at a ring `strands.footHeightM` above the set-piece's base (the display's authored value: on the
 * Pilgrim Monument, about 20 ft up, Jacob 2026-10-31), never on the terrain.
 * The clock: LIVE reads the town's one clock (useTimeOfDay.currentTime) and the display's own schedule (../showSchedule.js:
 * the nights of the day before and of today, worked out once a town day; the state at the instant, displayStateAt; the
 * year judged once per schedule, refuseScheduleSense, the player's last line); Stage's preview
 * (./preview.js) plays the glow or the show from the moment it is pressed, on the page's own time, Stage only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTownFrame } from '../../lib/useTownFrame.js'
import * as THREE from 'three'
import useTimeOfDay from '../../hooks/useTimeOfDay'
import { townClockOf } from '../../lib/townClock.js'
import { validateDrawer, compileRun, showAt, showSeconds, glowColour, inSeason, uplightTarget, OPEN_SECONDS, backDimFactor } from './engine.js'
import { kelvinToRgb, validateDisplayChannel } from '../showChannel.js'
import { nightsOn, displayStateAt, refuseScheduleSense, prevDate } from '../showSchedule.js'
import { getTodSlotRow, getTodSlotDaysAhead } from '../../cartograph/animatedParam.js'
import { checkFaces, strandEnds, pinnacleFace, pinnacleWash, bulbRadius, cordRadius, SOCKET_OF_BULB, avgGlow, strandOrder, CARD_SIDE, bulbAsCard } from './geometry.js'
import useDisplayPreview from '../preview.js'
import { drawerUrls } from '../drawerUrl.js'
import { readDrawerJson, rasterFrame } from './drawerRead.js'
import { Refusal, Transient } from '../../lib/refusal.js'

const CORD = '#3a3a3c'                                          // the cords: dark gray (Jacob, 2026-10-31)
const CORE_OF_BULB = 0.7                                        // the light inside each clear glass bulb, as a fraction of it
// DEV-ONLY instrument (?displayDebug=noWash): hide the pinnacle's wash, to tell its colour from the stone's own lighting
// (Jacob, 2026-10-31: a cyan band across the pinnacle; cause not established). Never in a build.
const NO_WASH = import.meta.env.DEV && typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('displayDebug') || '').split(',').includes('noWash')

/** Loads the town's drawer, from where the app names (../drawerUrl.js): looks.json, then every layer frame rasterized at
 *  the frame's size to RGBA. `on` false (no preview, no calendar) loads nothing. */
function useDrawer(on, source, { lookId, display, contentRoot, where }) {
  const [drawer, setDrawer] = useState(null), [err, setErr] = useState(null)
  useEffect(() => {
    if (!on) return
    let dead = false
    ;(async () => {
      const { drawer: url, frame } = await drawerUrls(source, { lookId, display, contentRoot, where })
      const env = { get: (u) => fetch(u), Image, URL }
      const d = await readDrawerJson(url, env)
      validateDrawer(d, where)
      const { w, h } = d.frame
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const raster = (rel) => rasterFrame(frame(rel), w, h, ctx, env)
      for (const L of d.looks) for (const layer of L.layers) layer.px = await Promise.all(layer.frames.map(raster))
      if (!dead) setDrawer({ ...d, byId: Object.fromEntries(d.looks.map(L => [L.id, L])) })
    })().catch(e => { if (!dead) setErr(e) })
    return () => { dead = true }
  }, [on, source, lookId, display.id, display.drawer, contentRoot, where])
  // The cause keeps its class: ./drawerRead.js builds each read's failure as the kind it is, and an untyped throw is a
  // Transient (src/lib/refusal.js). A display is never retried either way; Stage names it.
  if (err instanceof Refusal) throw new Refusal(`[LightShow] ⛔ ${where}: ${err.message}`)
  if (err) throw new Transient(`[LightShow] ⛔ ${where}: ${err.message}`)
  return drawer
}

/** The strands: the bulbs' clear glass, the light inside each, its socket, and the cords. Instanced; sizes come in the matrices. */
function Strands({ count, strands, glassRef, coreRef, socketRef, cordRef, cardRef }) {
  const bulb = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])                  // unit: scaled to the strand's spacing
  const tube = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1), [])           // unit: socket and cord alike
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }), [])
  const core = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: CORD, roughness: 0.8, metalness: 0 }), [])
  // The light as a CARD, when a bulb is under a pixel (geometry.js#bulbAsCard): a camera-facing square at the core's
  // place, of side core radius × CARD_SIDE (the disc's area), on the cores' OWN matrices and colours (shared buffers, so
  // nothing is copied per frame and it reads the same).
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const card = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
        vec4 cardAt = modelViewMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
        cardAt.xy += position.xy * length(instanceMatrix[0].xyz) * ${CARD_SIDE.toFixed(6)};
        vec4 mvPosition = cardAt;
        gl_Position = projectionMatrix * mvPosition;`)
    }
    return m
  }, [])
  useEffect(() => () => { bulb.dispose(); tube.dispose(); glass.dispose(); core.dispose(); dark.dispose(); plane.dispose(); card.dispose() }, [bulb, tube, glass, core, dark, plane, card])
  return (<>
    {/* Glass, sockets and cords add next to nothing to the image (clear glass at 0.22; small, dark): the hero's coverage
        mask leaves them out, and draws the light cores (focusObject.js#focusMeshes). */}
    <instancedMesh name="light-show:glass" ref={glassRef} args={[bulb, glass, count]} frustumCulled={false} userData={{ coverage: false }} />
    <instancedMesh name="light-show:light" ref={coreRef} args={[bulb, core, count]} frustumCulled={false} />
    <instancedMesh name="light-show:sockets" ref={socketRef} args={[tube, dark, count]} frustumCulled={false} userData={{ coverage: false }} />
    <instancedMesh name="light-show:cords" ref={cordRef} args={[tube, dark, strands]} frustumCulled={false} userData={{ coverage: false }} />
    <instancedMesh name="light-show:light-cards" ref={cardRef} args={[plane, card, count]} frustumCulled={false} visible={false} />
  </>)
}

export default function LightShow({ display, channel: given, extent, calendar, contentRoot, lookId, drawerSource, dim, where }) {
  // The display's own Look channel (../showChannel.js), from <Displays>: validated, and a published per-key cadence read
  // into the schedule's shape (a player update never breaks a published slab). Everything below uses what it returns.
  const channel = useMemo(() => validateDisplayChannel(given, where), [given, where])
  if (!extent?.ridge || !extent?.pinnacle) throw new Refusal(`[LightShow] ⛔ ${where}: the set-piece declares no ridge and pinnacle in its extent, so the strands have nowhere to hang`)
  const st = display.strands
  if (!(st?.glow > 0 && st?.show > 0 && st?.ringRadiusM > 0)) throw new Refusal(`[LightShow] ⛔ ${where}: strands needs glow, show and ringRadiusM`)
  if (st.show % st.glow || st.glow % extent.ridge.sides) throw new Refusal(`[LightShow] ⛔ ${where}: strands.show (${st.show}) must be a whole multiple of strands.glow (${st.glow}), and glow of the ridge's ${extent.ridge.sides} sides, so the glow strands are show strands`)
  const backDim = display.backDim ?? 0                          // the display's own; absent is the neutral default: no dim
  if (!(backDim >= 0 && backDim <= 1)) throw new Refusal(`[LightShow] ⛔ ${where}: backDim (${display.backDim}) is how far the bulbs facing away from the eye dim, 0 … 1`)
  if (!(st.footHeightM >= 0 && st.footHeightM < extent.ridge.yM)) throw new Refusal(`[LightShow] ⛔ ${where}: strands.footHeightM (${st.footHeightM}) must be authored, from the base up to below the ridge (${extent.ridge.yM.toFixed(1)} m)`)
  const preview = useDisplayPreview(s => s.modes[display.id])
  // Load the drawer only when the display can be on: Stage's preview, or a calendar to read the season from; from the
  // source the app names (Stage: its authoring drawer · Preview, the player: the published copy).
  const drawer = useDrawer(!!(preview || calendar), drawerSource, { lookId, display, contentRoot, where })
  const compiled = useMemo(() => (drawer ? compileRun(display.run, drawer.byId, where) : null), [drawer, display.run, where])
  const F = drawer?.frame, rows = F ? F.h - F.pinH : 0
  if (F) checkFaces(F.faces, extent, where)

  // The schedule over the year ahead at the town (the player's last line; Stage and the bake refuse first), judged in
  // render so a refusal reaches the boundary, and only when what it judges changes (the schedule, and where Show is 0).
  const judged = JSON.stringify([channel.schedule, Object.values(channel.values).map(k => k.show > 0)])
  useMemo(() => { if (compiled) refuseScheduleSense(channel, getTodSlotDaysAhead(useTimeOfDay.getState().currentTime, 366), showSeconds(compiled), where) }, [judged, compiled, where])   // eslint-disable-line react-hooks/exhaustive-deps
  const ends = useMemo(() => F ? strandEnds(st.show, extent.ridge.sides, extent.ridge.halfWidthM, st.ringRadiusM) : [], [F, st, extent])
  const every = st.show / st.glow, isGlow = (s) => s % every === Math.floor(every / 2)   // the real strands among the show's
  // ⭐ ONLY WHAT HANGS IS DRAWN (Boz's (3), 2026-11-02; Zob's 2a): the instances are ORDERED glow strands first, so a mesh's
  // draw count can stop at what hangs. At glow (most of every night) the GPU draws the glow's strands only, never the rest
  // as zero-scaled instances; out of season nothing is drawn at all. ▶ node checks/claims-a-display-draws-only-what-hangs.mjs
  const order = useMemo(() => strandOrder(ends.length, isGlow), [ends, every])   // eslint-disable-line react-hooks/exhaustive-deps

  const root = useRef(), glassRef = useRef(), coreRef = useRef(), socketRef = useRef(), cordRef = useRef(), pinRef = useRef(), lightRef = useRef()
  const hung = useRef(null)                                     // which strands hang now: 'none' | 'glow' | 'all'
  const unlit = useRef(false)                                   // the light cores cleared and hidden (off: nothing to colour)
  const asCards = useRef(false), cardRef = useRef()            // the bulbs under a pixel: their light drawn as cards
  const reach = useMemo(() => {                                // the bulbs' box (the set-piece's frame) and the largest bulb
    const box = new THREE.Box3(), footY = st.footHeightM; let r = 0
    for (const e of ends) {
      box.expandByPoint(new THREE.Vector3(e.tx, extent.ridge.yM, e.tz)); box.expandByPoint(new THREE.Vector3(e.bx, footY, e.bz))
      r = Math.max(r, bulbRadius(Math.hypot(e.bx - e.tx, footY - extent.ridge.yM, e.bz - e.tz), rows))
    }
    // each bulb's place in the set-piece's frame and its outward direction from the axis (for the back dim)
    const at = new Float32Array(ends.length * rows * 5)
    ends.forEach((e, s) => { for (let j = 0; j < rows; j++) {
      const t = (j + 0.5) / rows, x = e.tx + (e.bx - e.tx) * t, y = extent.ridge.yM + (footY - extent.ridge.yM) * t, z = e.tz + (e.bz - e.tz) * t, h = Math.hypot(x, z) || 1
      at.set([x, y, z, x / h, z / h], (s * rows + j) * 5)
    } })
    return { box, r, at, world: new THREE.Box3(), fb: new THREE.Vector2(), eye: new THREE.Vector3() }
  }, [ends, st, extent, rows])
  const day = useRef(null)                                      // the nights of the day before and of today, once a day

  const pinFaces = useMemo(() => {
    if (!F) return null
    return Array.from({ length: F.faces }, (_, k) => {
      const f = pinnacleFace(k, extent.pinnacle), g = new THREE.PlaneGeometry(f.width, f.height, 1, 6)
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3))
      return { g, position: f.position, rotation: f.rotation }
    })
  }, [F, extent])
  const pinMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), q: new THREE.Quaternion(), u: new THREE.Vector3(), p: new THREE.Vector3(), s: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0), w: [0, 0, 0] }), [])
  // While lit, the set-piece's uplights ease down to dimUplights; off, back to as authored. Gone when this unmounts.
  useEffect(() => () => { if (dim) delete dim.byDisplay[display.id] }, [dim, display.id])

  // A throw here is stopped and rethrown at render by useTownFrame (src/lib/useTownFrame.js): the display's own
  // DisplayBoundary names and contains it.
  // What draws the light: the full bulbs, or (under a pixel) the cards; and none while unlit. One place sets it.
  const showLight = () => {
    const lit = !unlit.current, cards = asCards.current
    coreRef.current.visible = lit && !cards; glassRef.current.visible = !cards; socketRef.current.visible = !cards
    if (cardRef.current) { cardRef.current.visible = lit && cards; cardRef.current.count = coreRef.current.count }
  }
  useTownFrame((three, delta) => {
    if (!F || !compiled || !root.current || !glassRef.current || !coreRef.current || !socketRef.current || !cordRef.current) return
    // ── when: live by the town's clock and schedule, or Stage's preview from the moment it was pressed ───────────────
    const instant = useTimeOfDay.getState().currentTime, clock = townClockOf(instant)
    if (day.current?.date !== clock.date || day.current.channel !== channel || day.current.compiled !== compiled) {
      const secs = showSeconds(compiled)
      day.current = { date: clock.date, channel, compiled, before: nightsOn(channel, prevDate(clock.date), getTodSlotRow, secs), today: nightsOn(channel, clock.date, getTodSlotRow, secs) }
    }
    const state = displayStateAt(channel, day.current.before, day.current.today, clock.date, clock.hours * 60 + clock.minutes + clock.seconds / 60, getTodSlotRow)
    let mode, t, now, up = true, dark = false                                           // Stage's preview hangs them
    if (preview) {
      const since = (performance.now() - preview.at) / 1000
      mode = preview.mode; now = instant.getTime() / 1000 + since; t = since % (showSeconds(compiled) + 4)
      if (mode === 'show' && t > showSeconds(compiled)) mode = 'glow'                   // a breath of glow between plays
    } else {
      // The season gates by the clock's date, as before; the schedule's nights by their first event's.
      up = inSeason(calendar, display.season, clock.date, where); now = instant.getTime() / 1000
      ;({ mode, t, dark } = up ? state : { mode: 'off', t: 0, dark: false })
    }
    // ── how bright, what colour: the display's own Look channel at the town's minute (levels HDR, so the bulbs bloom) ─
    const lit = state, warm = kelvinToRgb(lit.kelvin)
    // The night's last show, when Ambient ends after it, closes to BLACK: the same spiral, toward dark (every other close
    // stays white: Jacob, 2026-10-31).
    const toDark = dark && t > showSeconds(compiled) - OPEN_SECONDS
    const show = mode === 'show' ? showAt(F, compiled, drawer.byId, t, now) : null
    if (pinRef.current) pinRef.current.visible = !!show
    // ── where: hang the strands (ridge to foot ring): none out of season, the glow's by day and at glow, all in a show ─
    // ── how big: a bulb under a pixel draws its light as a card (geometry.js#bulbAsCard), from the camera this frame ────
    reach.world.copy(reach.box).applyMatrix4(root.current.matrixWorld)
    const cam = three.camera, focalPx = three.gl.getDrawingBufferSize(reach.fb).y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
    const cards = bulbAsCard(reach.r, reach.world.distanceToPoint(cam.position), focalPx)
    if (cards !== asCards.current) { asCards.current = cards; showLight() }
    if (cardRef.current && cardRef.current.instanceMatrix !== coreRef.current.instanceMatrix) cardRef.current.instanceMatrix = coreRef.current.instanceMatrix
    if (cardRef.current && coreRef.current.instanceColor && cardRef.current.instanceColor !== coreRef.current.instanceColor) cardRef.current.instanceColor = coreRef.current.instanceColor
    const hang = !up ? 'none' : show ? 'all' : 'glow'
    root.current.visible = hang !== 'none'                                              // out of season: nothing submitted
    if (hung.current !== hang) {
      const hangs = hang === 'all' ? order.all.length : hang === 'glow' ? order.glow.length : 0
      for (const m of [glassRef, coreRef, socketRef, cardRef]) if (m.current) m.current.count = hangs * rows     // draw only what hangs
      cordRef.current.count = hangs
      const footY = st.footHeightM, put = (mesh, i, x, y, z, sx, sy) => mesh.setMatrixAt(i, tmp.m.compose(tmp.p.set(x, y, z), tmp.q, tmp.s.set(sx, sy, sx)))
      ends.forEach((e, s) => {
        const on = hang === 'all' || (hang === 'glow' && isGlow(s))
        const len = Math.hypot(e.bx - e.tx, footY - extent.ridge.yM, e.bz - e.tz), k = on ? 1 : 0
        const r = bulbRadius(len, rows) * k, sr = r * SOCKET_OF_BULB.radius, sh = r * SOCKET_OF_BULB.height
        tmp.u.set(e.tx - e.bx, extent.ridge.yM - footY, e.tz - e.bz).normalize(); tmp.q.setFromUnitVectors(tmp.Y, tmp.u)   // up the strand
        put(cordRef.current, order.pos[s], (e.tx + e.bx) / 2, (extent.ridge.yM + footY) / 2, (e.tz + e.bz) / 2, cordRadius(len, rows) * k, len * k)
        for (let j = 0; j < rows; j++) {
          const t = (j + 0.5) / rows, x = e.tx + (e.bx - e.tx) * t, y = extent.ridge.yM + (footY - extent.ridge.yM) * t, z = e.tz + (e.bz - e.tz) * t
          const i = order.pos[s] * rows + j
          put(glassRef.current, i, x, y, z, r, r)
          put(coreRef.current, i, x, y, z, r * CORE_OF_BULB, r * CORE_OF_BULB)
          const o = r + sh / 2 - r * 0.15                                                 // the socket, on the bulb's cord side
          put(socketRef.current, i, x + tmp.u.x * o, y + tmp.u.y * o, z + tmp.u.z * o, sr, sh)
        }
      })
      for (const m of [glassRef, coreRef, socketRef, cordRef]) m.current.instanceMatrix.needsUpdate = true
      hung.current = hang
    }
    if (dim) { const cur = dim.byDisplay[display.id] ?? 1, to = uplightTarget(mode, display); dim.byDisplay[display.id] = cur + (to - cur) * Math.min(1, delta * 1.5) }
    // ── what: colour every bulb that hangs ─────────────────────────────────────────────────────────────────────────────
    // OFF (hung by day, or Stage's Off): the light cores add nothing, so they are hidden and not coloured, once, until lit.
    if (!show && (mode === 'off' || hang === 'none')) {
      if (!unlit.current) { unlit.current = true; showLight(); if (lightRef.current) lightRef.current.intensity = 0 }
      return
    }
    if (unlit.current) { unlit.current = false; showLight() }
    const avg = [0, 0, 0]; let n = 0
    const eye = backDim > 0 ? root.current.worldToLocal(reach.eye.copy(three.camera.position)) : null   // the eye, in the set-piece's frame
    // The show OVERTAKES the glow (Jacob, 2026-10-31): a glow strand's bulb stays lit white until the show's front reaches
    // it, then it takes the show's colour; at the close the white takes the strands back the same way. Never a fade-out.
    for (const s of hang === 'all' ? order.all : order.glow) {
      const c = Math.floor(s * F.w / st.show), real = isGlow(s)
      for (let j = 0; j < rows; j++) {
        const row = F.pinH + j, r = show ? (show.reveal ? show.reveal(c, row) : 'on') : 'off'
        const rgb = r === 'spark' ? [255, 246, 228] : r === 'on' ? show.colour(c, row).map(v => v * lit.show) : real && mode !== 'off' && !toDark ? glowColour(warm, lit.glow, c, j, now) : [0, 0, 0]
        let k = 1
        if (eye) { const b = (s * rows + j) * 5, A = reach.at; k = backDimFactor(backDim, A[b + 3], A[b + 4], eye.x - A[b], eye.y - A[b + 1], eye.z - A[b + 2]) }
        tmp.c.setRGB(rgb[0] / 255 * k, rgb[1] / 255 * k, rgb[2] / 255 * k)   // the light inside the glass (additive: unlit adds nothing), its far side dimmed
        coreRef.current.setColorAt(order.pos[s] * rows + j, tmp.c)
        if (rgb[0] + rgb[1] + rgb[2] > 0) { avg[0] += rgb[0]; avg[1] += rgb[1]; avg[2] += rgb[2]; n++ }
      }
    }
    coreRef.current.instanceColor.needsUpdate = true
    // ── the pinnacle: each face's strip, washing up it ──────────────────────────────────────────────────────────────
    if (show && pinRef.current && pinFaces) pinFaces.forEach((face, k) => {             // only in a show (it is hidden otherwise)
      const lo = [0, 0, 0], hi = [0, 0, 0]; let nl = 0, nh = 0
      if (show) for (let c = k * F.w / F.faces; c < (k + 1) * F.w / F.faces; c += 4) for (let row = 0; row < F.pinH; row += 3) {
        const v = show.colour(c, row), into = row >= F.pinH / 2 ? lo : hi
        into[0] += v[0]; into[1] += v[1]; into[2] += v[2]; row >= F.pinH / 2 ? nl++ : nh++
      }
      const kp = show ? show.pin : 0, L = lo.map(v => nl ? v / nl / 255 * kp : 0), Hc = hi.map(v => nh ? v / nh / 255 * kp : 0)
      const col = face.g.attributes.color, pos = face.g.attributes.position, H = extent.pinnacle.toM - extent.pinnacle.fromM
      for (let i = 0; i < pos.count; i++) {
        const w = pinnacleWash(L, Hc, pos.getY(i) / H + 0.5, tmp.w)                     // up: 0 at the strip, 1 at the top
        col.setXYZ(i, w[0], w[1], w[2])
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
  })

  if (!F) return null
  // ⭐ Its reach, for depth of field (r-the-focus-object-is-everything-hung-on-it): the strands hang out to the ring, well
  // past the set-piece's own extent, so the focus box must grow to them (focusObject.js#focusBox reads this).
  const bulbR = bulbRadius(Math.hypot(st.ringRadiusM, extent.ridge.yM - st.footHeightM), rows)
  return (
    <group ref={root} name="display:light-show" userData={{ focusReach: { radiusM: st.ringRadiusM + bulbR, fromM: Math.max(0, st.footHeightM - bulbR), toM: extent.pinnacle.toM } }}>
      <Strands count={ends.length * rows} strands={ends.length} glassRef={glassRef} coreRef={coreRef} socketRef={socketRef} cordRef={cordRef} cardRef={cardRef} />
      <group visible={!NO_WASH}>
        <group ref={pinRef} name="light-show:pinnacle">
          {pinFaces.map((f, k) => <mesh key={k} geometry={f.g} material={pinMat} position={f.position} rotation={f.rotation} />)}
        </group>
      </group>
      <pointLight ref={lightRef} position={[0, avgGlow(extent, 0).y, 0]} intensity={0} decay={2} distance={0} />
    </group>
  )
}
