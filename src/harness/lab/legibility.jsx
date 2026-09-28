/**
 * THE LEGIBILITY HARNESS — Society's map, measured (BRIEF-map-legibility-floor, the harness half).
 * ▶ http://localhost:5173/legibility.html?look=<town>&at=noon|dusk|midnight
 * ▶ node scripts/legibility-report.mjs — drives this page for every town × hour and writes the report.
 *
 * ⛔ HARNESS ONLY. Nothing here is wired into the bake, the slab or The Ward. It sets NO threshold: it measures,
 * and Jacob calibrates the floor by eye from the contact sheet.
 *
 * WHAT IT DRAWS: <Town shot="plan"> — the one assembly, unchanged — at phone half-height (Preview's PhoneFrame
 * screen, halved), weather forced clear, the phone quality profile, the town's own `compass` opt-in as the Ward
 * has it, and a straight-down camera fitted to the town's disc. ⚠️ The camera is the harness's: the product's
 * Society framing is the Ward's (its PlanCamera), so the two can differ.
 *
 * WHEN: the town's own solar noon, civil dusk (sun at −6°) and solar midnight, on the run date, at its own
 * latitude/longitude (SunCalc — the same library the clock uses). No hour is a constant.
 *
 * HOW IT MEASURES — ⛔ no second renderer, no hand-drawn mask. The same camera renders five frames, changing only
 * Town's OWN switches:
 *   full · full again · buildings off · labels off · the lit set on (litIds = the building_ids of the town's
 *   largest listing category, as the Ward's Society lights a category)
 * Masks are where two frames differ; pixels that differ between the two identical `full` frames are the scene's
 * own motion (water, wind) and are excluded from every mask.
 *   roof vs ground   roofs = full ≠ buildings-off; each roof pixel against the same pixel with the buildings gone
 *   lit vs unlit     lit roofs = lit ≠ full; the lit roofs against the other roofs, both in the lit frame
 *   label            labels = full ≠ labels-off; each label pixel against the same pixel with the labels gone
 * Contrast is WCAG's ratio of relative luminance ((L1 + 0.05) / (L2 + 0.05)), read from the pixels on screen —
 * after tone mapping and post, i.e. what an eye sees.
 * Results: window.__legibility = { done, town, at, time, renderer, lit, metrics, frames }.
 */
// ⛔ FIRST: places the boot town before any other module is evaluated (placeBootTown.js).
import '../../placeBootTown.js'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree, advance } from '@react-three/fiber'
import SunCalc from 'suncalc'
import Town from '../../components/Town.jsx'
import { QUALITY } from '../../lib/qualityProfile.js'
import { SCREEN_W, SCREEN_H } from '../../preview/PhoneFrame.jsx'
import { browseFitAltitude } from '../../lib/townRange.js'
import { ASSET_BASE } from '../../lib/bakedUrl.js'
import { INSTANCE, townForLook } from '../../instance.js'
import { reloadTerrain } from '../../utils/terrainShader.js'
import { BEZEL_DEFAULTS, colorPair, nightness } from '../../lib/compassBezel.js'

// Chrome pauses rAF in a hidden tab (a headless run is one): run the REAL frame anyway (the surface lab's cure).

// ⭐ THE SCENE'S OWN CLOCK IS FROZEN (harness only). Water, wind and cloud move on performance.now() — every Three
// clock reads it — so two frames a second apart differed on ~12% of pixels and swamped every mask (measured,
// 2026-09-28: labels-off and buildings-off each "differed" on 12%, overlapping 6%). Frozen, the only difference
// between two frames is the switch that was flipped. The town's CLOCK (sun, sky) is the `time` prop, not this.
const realNow = performance.now.bind(performance)
const FROZEN_AT = realNow()
performance.now = () => FROZEN_AT
clearInterval(window.__legTick)
window.__legTick = setInterval(() => { if (document.hidden) advance(realNow()) }, 100)

const params = new URLSearchParams(window.location.search)
const LOOK = INSTANCE.lookId
const AT = params.get('at') || 'noon'
const W = SCREEN_W, H = Math.round(SCREEN_H / 2)
const FOV = 40
const QUALITY_PROFILE = QUALITY.phone
await reloadTerrain(LOOK)

function whenFor(at) {
  const { lat, lon } = INSTANCE.geography
  const t = SunCalc.getTimes(new Date(), lat, lon)
  const d = { noon: t.solarNoon, midnight: t.nadir, dusk: t.dusk }[at]
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) throw new Error(`[legibility] ⛔ no ${at} at ${lat},${lon} today`)
  return d
}

let TIME = null, TIME_ERR = null
try { TIME = whenFor(AT) } catch (e) { TIME_ERR = e.message }

// ── pixels ──────────────────────────────────────────────────────────────────
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const LUT = Float32Array.from({ length: 256 }, (_, i) => lin(i))
const lum = (px, i) => 0.2126 * LUT[px[i]] + 0.7152 * LUT[px[i + 1]] + 0.0722 * LUT[px[i + 2]]
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const DIFF = 12   // a pixel "differs" when any channel moves by more than this (of 255)
const differs = (a, b, i) => Math.abs(a[i] - b[i]) > DIFF || Math.abs(a[i + 1] - b[i + 1]) > DIFF || Math.abs(a[i + 2] - b[i + 2]) > DIFF
const stats = (xs) => {
  if (!xs.length) return null
  const s = Float64Array.from(xs).sort()
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { n: s.length, p10: +q(0.1).toFixed(3), median: +q(0.5).toFixed(3), p90: +q(0.9).toFixed(3) }
}

function measure(f) {
  const n = W * H, cov = (k) => +(k / n * 100).toFixed(2)
  let noise = 0
  const roof = [], label = [], litL = [], unlitL = []
  let roofPx = 0, labelPx = 0, litPx = 0
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (differs(f.full, f.full2, i)) { noise++; continue }
    const isRoof = differs(f.full, f.noBuildings, i)
    if (isRoof) { roofPx++; roof.push(ratio(lum(f.full, i), lum(f.noBuildings, i))) }
    if (differs(f.full, f.noLabels, i)) { labelPx++; label.push(ratio(lum(f.full, i), lum(f.noLabels, i))) }
    if (isRoof) {
      if (differs(f.lit, f.full, i)) { litPx++; litL.push(lum(f.lit, i)) } else unlitL.push(lum(f.lit, i))
    }
  }
  const litS = stats(litL), unlitS = stats(unlitL)

  // ── the compass: its marks against the band beneath them, and nothing at all in the movie shot ──
  // The tick colour at this hour, from the model (the town's sun), never restated: day → night, lifted.
  const sunAlt = SunCalc.getPosition(TIME, INSTANCE.geography.lat, INSTANCE.geography.lon).altitude
  const k = nightness(sunAlt), cp = colorPair(f.compassStyle.color)
  const hex = (h) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16))
  const [d, nn] = [hex(cp.day), hex(cp.night)], gain = 1 + (f.compassStyle.nightGlow - 1) * k
  const want = d.map((v, c) => Math.min(255, (v + (nn[c] - v) * k) * gain))
  const tickL = [], markL = [], bandL = []
  let foot = 0, heroDiff = 0
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (differs(f.hero, f.heroNoCompass, i)) heroDiff++
    if (!differs(f.full, f.noCompass, i)) continue
    foot++
    const px = f.full, L = lum(px, i)
    const dist = Math.hypot(px[i] - want[0], px[i + 1] - want[1], px[i + 2] - want[2])
    if (px[i] > px[i + 1] + 60 && px[i] > px[i + 2] + 60) markL.push(L)
    else if (dist < 40) tickL.push(L)
    else bandL.push(L)
  }
  const band = stats(bandL), tickS = stats(tickL), markS = stats(markL)
  const q = (xs, pp) => { const s = Float64Array.from(xs).sort(); return s[Math.floor(pp * (s.length - 1))] }
  const vs = (S) => (S && bandL.length ? {
    againstDarkest: +ratio(S.median, q(bandL, 0.05)).toFixed(2), againstLightest: +ratio(S.median, q(bandL, 0.95)).toFixed(2),
  } : null)
  return {
    motionExcludedPct: cov(noise),
    roofVsGround: { coveragePct: cov(roofPx), contrast: stats(roof) },
    label: { coveragePct: cov(labelPx), contrast: stats(label) },
    compass: {
      nightness: +k.toFixed(2), expectedTickRGB: want.map(Math.round), footprintPct: cov(foot),
      band: band && { luminanceP5: +q(bandL, 0.05).toFixed(3), luminanceP95: +q(bandL, 0.95).toFixed(3), pixels: bandL.length },
      ticks: tickS && { pixels: tickS.n, medianLuminance: tickS.median, contrast: vs(tickS) },
      northMark: markS && { pixels: markS.n, medianLuminance: markS.median, contrast: vs(markS) },
      heroPixelsChangedByCompass: heroDiff,   // must be 0: the compass draws nothing in the movie shot
    },
    litVsUnlit: {
      litCoveragePct: cov(litPx), unlitCoveragePct: cov(roofPx - litPx),
      litLuminance: litS, unlitLuminance: unlitS,
      contrastOfMedians: litS && unlitS ? +ratio(litS.median, unlitS.median).toFixed(3) : null,
    },
  }
}

// ── the run: five frames, each settled, then the numbers ─────────────────────
// Every step is { layers, lit?, shot? }; masks are the difference between two steps.
const STEPS = [
  ['full', { layers: {} }], ['full2', { layers: {} }],
  ['noBuildings', { layers: { buildings: false } }], ['noLabels', { layers: { labels: false } }],
  ['lit', { layers: {}, lit: true }],
  // The compass's own footprint (band + ticks + mark) in plan, and the proof it draws nothing in the movie shot.
  ['noCompass', { layers: { compass: false } }],
  ['hero', { layers: {}, shot: 'movie' }], ['heroNoCompass', { layers: { compass: false }, shot: 'movie' }],
]
// Settled = loads done: the frame stops changing beyond the scene's own motion (water, cloud), which the masks
// exclude separately. Mean absolute change per sampled channel, of 255.
const SETTLE_MIN_MS = 6000, SETTLE_MAX_MS = 60000, STILL = 2

function Recorder({ step, onFrame }) {
  const { gl } = useThree()
  useEffect(() => {
    let dead = false
    const grab = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const x = c.getContext('2d', { willReadFrequently: true })
      x.drawImage(gl.domElement, 0, 0, W, H)
      return { data: x.getImageData(0, 0, W, H).data, url: c.toDataURL('image/png') }
    }
    const t0 = realNow()
    let prev = null, still = 0, tris = -1
    const tick = () => {
      if (dead) return
      const now = grab()
      // Settled needs BOTH: the scene has stopped growing (its triangle count holds — the slab's pieces load one by
      // one) and the frame has stopped changing beyond the scene's own motion. A still frame alone passed on the
      // SKY before the ground arrived (measured: the first `full` was one flat blue).
      const t = gl.info.render.triangles
      if (prev) {
        let d = 0
        for (let i = 0; i < now.data.length; i += 16) d += Math.abs(now.data[i] - prev.data[i])
        still = d / (now.data.length / 16) < STILL && t === tris && t > 0 ? still + 1 : 0
      }
      tris = t
      prev = now
      const age = realNow() - t0
      if ((age > SETTLE_MIN_MS && still >= 3) || age > SETTLE_MAX_MS) onFrame(step, now, age > SETTLE_MAX_MS)
      else setTimeout(tick, 400)
    }
    setTimeout(tick, 400)
    return () => { dead = true }
  }, [step])
  return null
}

function FitCamera({ stencil }) {
  const { camera, scene } = useThree()
  window.__legScene = scene   // inspection only: the harness's own scene, for the report's diagnostics
  useEffect(() => {
    const [cx, cz] = stencil.center
    camera.fov = FOV; camera.near = 1; camera.far = 1e6
    camera.position.set(cx, browseFitAltitude(stencil.radius, W / H, FOV), cz)
    camera.up.set(0, 0, -1)                    // north (−z) up
    camera.lookAt(cx, 0, cz)
    camera.updateProjectionMatrix()
  }, [stencil, camera])
  return null
}

function App() {
  const [stencil, setStencil] = useState(null)
  const [lit, setLit] = useState(null)
  const [err, setErr] = useState(TIME_ERR)
  const [i, setI] = useState(0)
  const frames = useRef({})
  const time = TIME
  const glInfo = useRef(null)
  const sceneCompass = useRef(null)

  useEffect(() => {
    fetch(`${ASSET_BASE}baked/${LOOK}/ground.json`).then((r) => r.json()).then((g) => {
      if (!g.stencil) throw new Error(`${LOOK} has no disc (stencil null) — nothing to fit`)
      setStencil(g.stencil)
    }).catch((e) => setErr(String(e.message || e)))
    fetch(`${ASSET_BASE}baked/${LOOK}/scene.json`).then((r) => r.json()).then((j) => { sceneCompass.current = j.compass || null }).catch(() => {})
    fetch(`${ASSET_BASE}baked/${LOOK}/content/listings.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const rows = Array.isArray(j) ? j : (j?.listings || [])
      const by = new Map()
      for (const r of rows) if (r.category && r.building_id) (by.get(r.category) || by.set(r.category, new Set()).get(r.category)).add(r.building_id)
      const [category, ids] = [...by.entries()].sort((a, b) => b[1].size - a[1].size)[0] || [null, new Set()]
      setLit({ category, ids, buildings: ids.size, rows })
    }).catch((e) => setErr(String(e.message || e)))
  }, [])

  const step = STEPS[i]
  const onFrame = (key, f, timedOut) => {
    frames.current[key] = { ...f, timedOut }
    if (i + 1 < STEPS.length) { setI(i + 1); return }
    const fr = frames.current
    const data = Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, v.data]))
    data.compassStyle = { ...BEZEL_DEFAULTS, ...(sceneCompass.current || {}) }
    window.__legibility = {
      done: true, town: LOOK, at: AT, time: time.toISOString(), size: [W, H], quality: QUALITY_PROFILE.id,
      renderer: glInfo.current, weather: 'clear', camera: 'harness: straight down, fitted to the disc, north up — the Ward frames Society its own way',
      lit: lit.ids.size ? { category: lit.category, buildings: lit.buildings } : null,
      unsettled: Object.entries(fr).filter(([, v]) => v.timedOut).map(([k]) => k),
      metrics: measure(data),
      frames: Object.fromEntries(Object.entries(fr).filter(([k]) => k !== 'full2').map(([k, v]) => [k, v.url])),
    }
    document.title = 'DONE'
  }

  useEffect(() => { if (err) window.__legibility = { done: true, town: LOOK, at: AT, error: err } }, [err])
  if (err) return <div style={{ padding: 12, color: '#ff8a7a' }}>⛔ {err}</div>
  if (!stencil || !lit || !time) return <div style={{ padding: 12 }}>loading {LOOK}…</div>

  const layers = { compass: true, ...step[1].layers }
  return (
    <div style={{ width: W, height: H }}>
      <Canvas frameloop="always" dpr={1} camera={{ fov: FOV }}
        gl={{ antialias: QUALITY_PROFILE.antialias, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          const ctx = gl.getContext(), dbg = ctx.getExtension('WEBGL_debug_renderer_info')
          glInfo.current = dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)
        }}>
        <Town town={townForLook(LOOK)} lookId={LOOK} quality={QUALITY_PROFILE} shot={step[1].shot || 'plan'} time={time} listings={lit.rows}
          weatherMode="clear" interactive={false} layers={layers} litIds={step[1].lit ? lit.ids : undefined}>
          <FitCamera stencil={stencil} />
          <Recorder step={step[0]} onFrame={onFrame} />
        </Town>
      </Canvas>
      <div style={{ padding: 8, opacity: 0.8 }}>{LOOK} · {AT} {time.toISOString()} · step {i + 1}/{STEPS.length} {step[0]}</div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
