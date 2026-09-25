/**
 * THE SURFACE LAB — one GL test environment for every procedural surface.
 * ▶ http://localhost:5173/lab.html?look=huron&at=class:agricultural
 * ▶ http://localhost:5173/lab.html?look=lafayette-square&at=class:park   ← the CONTROL
 * ▶ http://localhost:5173/lab.html?look=huron&at=revetment                ← the boulders, as the map draws them
 *
 * ⛔ HARNESS ONLY. Nothing here is wired into the bake, the slab or The Ward.
 *
 * ⛔⛔ THE ONE RULE: IMPORT, NEVER RE-IMPLEMENT (`BRIEF-surface-lab §1`). Every light,
 * every material, the sky, the weather and the ground below are the PRODUCTION
 * components, mounted the way Preview mounts them. This file owns controls and
 * cameras and nothing else. A lab with its own lighting is a second pipeline, and
 * what looks right in it will not match the map.
 * ▶ node checks/claims-lab-imports-never-reimplements.mjs — goes red on any light,
 *   shader or material defined under src/harness/lab/.
 *
 * ⭐ THE TOWN IS A PAGE LOAD, NOT A TOGGLE: the terrain module and the instance
 * (geography → the sun) resolve `?look=` once at import. Switching town reloads.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree, advance } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import R3FErrorBoundary from '../../components/R3FErrorBoundary'
import BakedGround from '../../components/BakedGround.jsx'
import BakedLamps from '../../components/BakedLamps'
import SlabRevetment from '../../components/SlabRevetment.jsx'
import SlabBuildings from '../../components/SlabBuildings'
import InstancedTrees from '../../components/InstancedTrees'
import CelestialBodies from '../../components/CelestialBodies'
import CloudDome from '../../components/CloudDome'
import AtmosphereDirectiveDriver from '../../components/AtmosphereDirectiveDriver'
import WeatherEffects from '../../components/WeatherEffects'
import { PostProcessing, ExposureTicker, StageFog, StageShadows, LampGlowDriver } from '../../components/PostProcessing.jsx'
import { TimeTicker, SkyStateTicker } from '../../components/Scene.jsx'
import { ShaderLinkGuard } from '../../lib/shaderLinkGuard.jsx'
import { useSceneJson } from '../../lib/useSceneJson.js'
import { WEATHER_UNIFORMS } from '../../lib/weather-uniforms.js'
import useTimeOfDay from '../../hooks/useTimeOfDay'
import useSkyState from '../../hooks/useSkyState'
import useAtmosphere from '../../hooks/useAtmosphere.js'
import { getElevationRaw } from '../../utils/elevation'
import { INSTANCE } from '../../instance.js'
import { listStages, resolveStage } from './stage.js'

const params = new URLSearchParams(window.location.search)
const LOOK = INSTANCE.lookId
const STAGE = params.get('at') || 'class:park'

// ── TIME: solar hour at the TOWN's longitude, not the browser's clock ────────
// ⭐ The hour on the slider is local SOLAR time where the town is (noon = sun due
// south), derived from its longitude. A browser-local hour would put Provincetown's
// noon wherever the operator's laptop happens to be.
function solarDate(month, hour) {
  const lon = INSTANCE.geography.lon
  const utcMs = Date.UTC(new Date().getFullYear(), month - 1, 15) + (hour - lon / 15) * 3600e3
  return new Date(utcMs)
}

// ── WEATHER: the lab writes the SAME inputs the live poller writes ───────────
// ⭐ Through `useSkyState.setWeatherTargets`, so the Almanac picks the directive and
// WeatherEffects drives uWetness / uSnowAccumulation exactly as production does.
// ⛔ The lab never sets a weather uniform itself. Codes are WMO (open-meteo's).
const WEATHER = {
  clear:    { cloudCover: 0.05, precipitationIntensity: 0, currentWeatherCode: 0,  temperatureF: 68 },
  overcast: { cloudCover: 0.95, precipitationIntensity: 0, currentWeatherCode: 3,  temperatureF: 60 },
  rain:     { cloudCover: 0.95, precipitationIntensity: 4, currentWeatherCode: 63, temperatureF: 55 },
  snow:     { cloudCover: 0.95, precipitationIntensity: 2, currentWeatherCode: 73, temperatureF: 25 },
}

// ── CAMERAS ─────────────────────────────────────────────────────────────────
// ⭐ Judge at the CLOSE camera (`feedback_build_for_close_inspection_not_for_distance`).
// `eye` is a standing adult's eye height (1.6 m); `mid` and `overhead` are stations
// for reading the same patch at two more scales. Heights are above the ground AT
// the stage point, read from the terrain the ground is drawn on.
const EYE_H_M = 1.6
const CAMS = {
  eye:      { back: 22, up: EYE_H_M, look: 0.4 },
  mid:      { back: 70, up: 35, look: 0 },
  overhead: { back: 1, up: 320, look: 0 },
}

function CameraDriver({ spot, cam }) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls)
  useEffect(() => {
    if (!spot) return
    const c = CAMS[cam]
    const g = getElevationRaw(spot.x, spot.z)
    const [nx, nz] = spot.normal
    camera.position.set(spot.x + nx * c.back, g + c.up, spot.z + nz * c.back)
    if (controls?.target) { controls.target.set(spot.x, g + c.look, spot.z); controls.update() }
    camera.updateProjectionMatrix()
  }, [spot, cam, camera, controls])
  return null
}

function App() {
  const scene = useSceneJson(LOOK)
  const bakeLastMs = scene?.bakedAt ?? null
  const [stages, setStages] = useState(null)
  const [spot, setSpot] = useState(null)
  const [err, setErr] = useState(null)
  const [cam, setCam] = useState('eye')
  const [month, setMonth] = useState(6)
  const [hour, setHour] = useState(15)
  const [wx, setWx] = useState('clear')
  const [layers, setLayers] = useState({ buildings: true, trees: true, revetment: true, lamps: true, post: true })
  const [probe, setProbe] = useState(null)

  useEffect(() => {
    listStages(LOOK, bakeLastMs).then(s => setStages(s.stages)).catch(e => setErr(String(e.message || e)))
  }, [bakeLastMs])
  useEffect(() => {
    resolveStage(LOOK, STAGE, bakeLastMs).then(setSpot).catch(e => { console.error(e); setErr(String(e.message || e)) })
  }, [bakeLastMs])

  useEffect(() => {
    useTimeOfDay.getState().setPaused(true)
    useTimeOfDay.getState().setTime(solarDate(month, hour))
  }, [month, hour])
  useEffect(() => { useSkyState.getState().setWeatherTargets(WEATHER[wx]) }, [wx])

  // What the environment is ACTUALLY doing — read back, never assumed.
  useEffect(() => {
    const id = setInterval(() => {
      const d = useAtmosphere.getState().tweenedDirective
      setProbe({
        sunAlt: useTimeOfDay.getState().getLightingPhase().sunAltitude * 180 / Math.PI,
        wet: WEATHER_UNIFORMS.uWetness.value, snow: WEATHER_UNIFORMS.uSnowAccumulation.value,
        precip: d?.precip?.kind ? `${d.precip.kind} ${(d.precip.intensity ?? 0).toFixed(2)}` : 'none',
        cloud: useSkyState.getState().cloudCover,
      })
    }, 500)
    return () => clearInterval(id)
  }, [])

  const go = (q) => { const p = new URLSearchParams(window.location.search); for (const [k, v] of Object.entries(q)) p.set(k, v); window.location.search = p.toString() }
  const toggle = k => setLayers(l => ({ ...l, [k]: !l[k] }))

  return (
    <>
      <Canvas
        frameloop="always"
        camera={{ position: [0, 50, 100], fov: 50, near: 0.1, far: 60000 }}
        gl={{ alpha: false, antialias: true, stencil: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        dpr={[1, 1.5]}
        shadows="soft"
        onCreated={({ gl, scene: s, camera }) => {
          document.body.dataset.labReady = '1'
          window.__lab = { gl, scene: s, camera }
          // ⛔ HARNESS ONLY — the boulder harness's measured nuisance, same cure in R3F's
          // own terms: Chrome pauses rAF in a HIDDEN tab, so the canvas holds a stale or
          // black frame while the scene is fine. `advance()` runs the REAL frame (every
          // useFrame, the post composer included) — a bare gl.render would skip the post
          // chain and show a picture production never draws. Only while hidden.
          clearInterval(window.__labTick)
          window.__labTick = setInterval(() => { if (document.hidden) advance(performance.now()) }, 150)
        }}
      >
        {/* ── the environment: Preview's own mounts, verbatim components ── */}
        <TimeTicker />
        <SkyStateTicker />
        <ExposureTicker lookId={LOOK} bakeLastMs={bakeLastMs} />
        <AtmosphereDirectiveDriver lookId={LOOK} />
        <WeatherEffects />
        <StageShadows lookId={LOOK} bakeLastMs={bakeLastMs} />
        <StageFog lookId={LOOK} bakeLastMs={bakeLastMs} />
        <LampGlowDriver lookId={LOOK} bakeLastMs={bakeLastMs} />
        <ShaderLinkGuard />
        <R3FErrorBoundary name="CelestialBodies"><CelestialBodies lookId={LOOK} bakeLastMs={bakeLastMs} /></R3FErrorBoundary>
        <R3FErrorBoundary name="CloudDome"><CloudDome /></R3FErrorBoundary>

        {/* ── the stage: the town's own slab ── */}
        <Suspense fallback={null}>
          {/* ⭐ targetExag 1: life-size ground, the only scale a surface can be judged at. */}
          <R3FErrorBoundary name="BakedGround"><BakedGround lookId={LOOK} bakeLastMs={bakeLastMs} targetExag={1} /></R3FErrorBoundary>
          <group visible={layers.revetment}><R3FErrorBoundary name="SlabRevetment"><SlabRevetment lookId={LOOK} bakeLastMs={bakeLastMs} /></R3FErrorBoundary></group>
          <group visible={layers.lamps}><R3FErrorBoundary name="BakedLamps"><BakedLamps lookId={LOOK} bakeLastMs={bakeLastMs} /></R3FErrorBoundary></group>
          <group visible={layers.buildings}><R3FErrorBoundary name="SlabBuildings"><SlabBuildings lookId={LOOK} interactive={false} /></R3FErrorBoundary></group>
          <group visible={layers.trees}><R3FErrorBoundary name="InstancedTrees"><InstancedTrees lookId={LOOK} bakeLastMs={bakeLastMs} /></R3FErrorBoundary></group>
        </Suspense>
        {layers.post && <PostProcessing lookId={LOOK} bakeLastMs={bakeLastMs} />}

        <OrbitControls makeDefault maxPolarAngle={Math.PI * 0.499} />
        <CameraDriver spot={spot} cam={cam} />
      </Canvas>

      <div style={{ position: 'fixed', top: 12, left: 12, background: 'rgba(8,11,14,.88)', border: '1px solid #2a3440', borderRadius: 8, padding: '10px 12px', width: 380 }}>
        <Head>SURFACE LAB — {LOOK}</Head>
        {err && <div style={{ color: '#ff8a7a', margin: '6px 0' }}>⛔ {err}</div>}
        <Row k="stage" v={STAGE} />
        {spot && <div style={{ opacity: .6, fontSize: 11, marginBottom: 6 }}>{spot.why}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {['huron', 'lafayette-square'].map(l => <Btn key={l} on={LOOK === l} tint="#3d6b8f" onClick={() => go({ look: l })}>{l}</Btn>)}
        </div>
        {stages && (
          <select value={STAGE} onChange={e => go({ at: e.target.value })} style={{ width: '100%', marginBottom: 8, background: '#1a222b', color: '#e8eef5', border: '1px solid #2a3440', font: 'inherit' }}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.id}{s.tris ? ` · ${s.tris.toLocaleString()} tris` : ''}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {Object.keys(CAMS).map(c => <Btn key={c} on={cam === c} tint="#4a5a45" onClick={() => setCam(c)}>{c}</Btn>)}
        </div>
        <Slider label="solar hour" min={0} max={24} step={0.25} v={hour} set={setHour} fmt={h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`} />
        <Slider label="season (month)" min={1} max={12} step={1} v={month} set={setMonth} fmt={m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} />
        <div style={{ display: 'flex', gap: 5, margin: '6px 0 8px' }}>
          {Object.keys(WEATHER).map(w => <Btn key={w} on={wx === w} tint="#6b5a3f" onClick={() => setWx(w)}>{w}</Btn>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {Object.keys(layers).map(k => <Btn key={k} on={layers[k]} tint="#3f4f6b" onClick={() => toggle(k)}>{k}</Btn>)}
        </div>
        {probe && <>
          <Head>WHAT THE ENVIRONMENT IS DOING (read back)</Head>
          <Row k="sun altitude" v={`${probe.sunAlt.toFixed(1)}°`} />
          <Row k="cloud cover" v={probe.cloud.toFixed(2)} />
          <Row k="directive precip" v={probe.precip} />
          <Row k="uWetness / uSnow" v={`${probe.wet.toFixed(2)} / ${probe.snow.toFixed(2)}`} />
        </>}
        <div style={{ marginTop: 8, opacity: .55, fontSize: 11 }}>
          Weather eases in on the production tween (~45 s) — the readout shows it arriving.
          ⛔ No light, shader or material in this page is the lab's own.
        </div>
      </div>
    </>
  )
}

const Slider = ({ label, min, max, step, v, set, fmt }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
    <span style={{ opacity: .7, width: 110 }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={v} style={{ flex: 1 }} onChange={e => set(+e.target.value)} />
    <b style={{ width: 44, textAlign: 'right' }}>{fmt(v)}</b>
  </div>
)
const Btn = ({ on, onClick, tint, children }) => (
  <button onClick={onClick} style={{ padding: '5px 7px', cursor: 'pointer', fontSize: 11, background: on ? tint : '#1a222b', color: '#e8eef5', border: '1px solid #2a3440', borderRadius: 5, font: 'inherit' }}>{children}</button>
)
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ opacity: .7 }}>{k}</span><b>{v}</b></div>
)
const Head = ({ children }) => (
  <div style={{ marginTop: 5, paddingTop: 4, color: '#8fb4d0', fontSize: 11 }}>{children}</div>
)

createRoot(document.getElementById('root')).render(<App />)
