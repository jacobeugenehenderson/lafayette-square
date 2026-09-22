/**
 * Boulder harness — TWO WAYS TO MAKE A REVETMENT, SIDE BY SIDE, WITH THE BILL.
 * ▶ http://localhost:5173/boulders.html
 *
 * ⛔ HARNESS ONLY. Nothing here is wired into the bake, the slab or The Ward, and
 * it must not be — never eye-gate an unready construction in the operator's view.
 *
 * The modes:
 *   gallery   — the three procedural generators, same seeds, turntabled.
 *   instanced — N stones, `InstancedMesh`, one draw call per palette entry.
 *   drape ∥   — the CONTROL: cellular noise pushed along the shell NORMAL only.
 *               Cannot overhang, by construction. This is the thing to beat.
 *   gathered ▲ — Jacob's actual idea: the sheet is GATHERED toward each cell's
 *               centre, so it buckles, pleats and self-occludes.
 *   drape fbm — fractal noise instead of cellular, for the comparison.
 *   hybrid    — gathered drape + stone along the CREST LINE only (the fallback).
 *   compare   — instanced on one half, gathered drape on the other, one shoreline,
 *               one light, one camera. ⭐ This is the mode the decision is made in.
 *   necklace  — ⛔ the trap, built deliberately: identical rocks, evenly spaced.
 *
 * ⭐ THE LOW CAMERA STATIONS ARE THE TEST, not a convenience. "from the water",
 * "from the street" and "grazing" are where a drape's unbroken silhouette either
 * survives or does not; a plan view flatters everything and settles nothing.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import InstancedBoulders from '../../components/InstancedBoulders.jsx'
import { boulderPalette, GENERATORS, triCount } from '../../lib/boulderGeometry.js'
import { revetmentDrape, DRAPE_DEFAULT_GATHER } from '../../lib/revetmentDrape.js'
import { makeRevetmentMaterial } from '../../components/revetmentMaterial.js'
import { revetmentHeap, demoShoreline, huronLikeCrest, MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG } from './heap.js'
import { shoreContext, chunkStones, CHUNK_M } from './chunked.js'

const SHORE_LENGTH_M = 120

// ⛔⛔ ONE MATERIAL FOR THE BED **AND** THE STONES — not two that agree.
// In a hybrid the drape and the top course meet everywhere, and two materials that
// merely match will diverge the first time one of them is touched; `WaterSurface.jsx`
// documents exactly that costing an evening, with Jacob judging a lake against code
// that was not running in his window. ⭐ The same object is mounted on both, so a
// uniform that drives one drives both by construction and there is nothing to keep
// in sync. It is instancing-aware (see `revetmentMaterial`'s worldpos patch), which
// is what makes sharing possible at all.
const { material: stoneMaterial, uniforms: drapeUniforms } = makeRevetmentMaterial({ block: 0.75 })
const drapeMaterial = stoneMaterial
// huron's shoreline, for the slab-bytes projection. ⭐ MEASURED, not handed down:
// `shape.json`'s `__water__` runs are 14 unique arcs / 1,894 vertices / 26.22 km.
// ▶ node scratch/huron-shore-transect/seam-arc.mjs
const HURON_SHORE_M = 26220

function Stats({ onSample }) {
  const gl = useThree(s => s.gl)
  const acc = useRef({ t: performance.now(), n: 0 })
  useFrame(() => {
    const a = acc.current
    a.n++
    const now = performance.now()
    if (now - a.t > 500) {
      onSample({ fps: (a.n * 1000) / (now - a.t), calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0 })
      a.t = now; a.n = 0
    }
  })
  return null
}

function Gallery() {
  const g = useRef()
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.18 })
  const rows = useMemo(() => ['fractured', 'hull', 'noise'].map((kind, ri) => ({
    kind,
    geos: Array.from({ length: 7 }, (_, i) => {
      const seed = 1000 + i * 37
      return kind === 'noise' ? GENERATORS.noise({ seed, detail: 1 })
        : kind === 'hull' ? GENERATORS.hull({ seed, points: 20 })
          : GENERATORS.fractured({ seed, planes: 9 })
    }),
    z: (ri - 1) * 3.2,
  })), [])
  return (
    <group ref={g}>
      {rows.map(row => row.geos.map((geo, i) => (
        <mesh key={row.kind + i} geometry={geo} material={stoneMaterial}
              position={[(i - 3) * 2.4, 1.2, row.z]} scale={[1.6, 1.6, 1.6]} castShadow receiveShadow />
      )))}
    </group>
  )
}

// What each mode puts on which stretch of shore. ⭐ `compare` is the whole point:
// one shoreline, one light, one camera, two methods.
// ⭐ How far from the camera chunks are instantiated. ⛔ A budget: it sets both the
// draw-call count and how much generation a camera move can trigger.
const VIEW_RADIUS_M = 70

/**
 * ⭐⭐ THE STONES ARE GENERATED IN THE PLAYER, NOT STORED. Only chunks near the
 * camera exist; the slab carries the drape and a seed. ⛔ This is also what makes
 * `InstancedBoulders`' `frustumCulled={false}` survivable: the bounded thing is the
 * instance SET, not three's culling. With a stored list, 26.22 km of shore would
 * hand ~432,000 stones to the GPU every frame regardless of where the camera looks.
 */
function ChunkedStone({ ctx, palette, onStats }) {
  const camera = useThree(s => s.camera)
  const cache = useRef(new Map())
  const [instances, setInstances] = useState([])
  const lastKey = useRef('')
  useFrame(() => {
    const want = []
    for (let ci = 0; ci < ctx.nChunks; ci++) {
      const st = ctx.at(Math.min(ctx.total - 0.001, (ci + 0.5) * CHUNK_M))
      if (Math.hypot(camera.position.x - st.x, camera.position.z - st.z) < VIEW_RADIUS_M) want.push(ci)
    }
    const key = want.join(',')
    if (key === lastKey.current) return
    lastKey.current = key
    let genMs = 0, generated = 0
    const out = []
    for (const ci of want) {
      if (!cache.current.has(ci)) {
        const t0 = performance.now()
        cache.current.set(ci, chunkStones(ctx, ci, 2))
        genMs += performance.now() - t0; generated++
      }
      out.push(...cache.current.get(ci))
    }
    setInstances(out)
    const used = new Set(out.map(o => o.i))
    onStats({ chunks: want.length, generated, genMs, stones: out.length, calls: used.size })
  })
  return instances.length ? <InstancedBoulders palette={palette} instances={instances} material={stoneMaterial} /> : null
}

const LAYOUT = {
  instanced: { stone: { mode: 'heap', tRange: [0, 1] } },
  'drape ∥': { drape: { noise: 'cellular', gather: 0, tRange: [0, 1] } },
  'gathered ▲': { drape: { noise: 'cellular', tRange: [0, 1] } },
  'drape fbm': { drape: { noise: 'fbm', gather: 0, tRange: [0, 1] } },
  hybrid: { drape: { noise: 'cellular', tRange: [0, 1] }, stone: { mode: 'crest', tRange: [0, 1] } },
  compare: { stone: { mode: 'heap', tRange: [0, 0.5] }, drape: { noise: 'cellular', tRange: [0.5, 1] } },
  necklace: { stone: { mode: 'necklace', tRange: [0, 1] } },
  'chunked ⭐': { drape: { noise: 'cellular', tRange: [0, 1] }, chunked: true },
}

function Shore({ palette, mode, res, gather, uniform, packing, shadows }) {
  const poly = useMemo(() => demoShoreline({ length: SHORE_LENGTH_M }), [])
  const plan = LAYOUT[mode] || LAYOUT.instanced
  const ctx = useMemo(() => shoreContext({ poly, crestAt: huronLikeCrest, waterY: 0, packing, paletteSize: palette.length }), [poly, packing, palette.length])

  const instances = useMemo(
    () => plan.stone ? revetmentHeap({ poly, crestAt: huronLikeCrest, paletteSize: palette.length, waterY: 0, packing, ...plan.stone }) : [],
    [poly, palette.length, mode, packing],
  )
  const drape = useMemo(
    () => plan.drape ? revetmentDrape({ poly, crestAt: huronLikeCrest, waterY: 0, octaves: res, gather, uniform, ...plan.drape }) : null,
    [poly, mode, res, gather, uniform],
  )

  // The bank behind and the water in front, so the revetment is judged against
  // the things it sits between rather than in a void.
  const bank = useMemo(() => {
    const g = new THREE.PlaneGeometry(SHORE_LENGTH_M + 40, 60, 1, 1)
    g.rotateX(-Math.PI / 2); g.translate(0, -0.03, -34)
    return g
  }, [])

  // ⛔ The shader's block size must be the SAME number the geometry used, or the
  // painted blocks and the modelled ones are two different walls superimposed.
  // ⛔⛔ THE SHADER MUST START WHERE THE GEOMETRY STOPS, AND IT DID NOT — measured
  // 2026-09-21. `uBlock` was set to the STONE size, which is the same wavelength the
  // geometry already carries in its low octaves, so the normals re-stated relief the
  // silhouette was already showing and fought it. At a grazing angle the surface read
  // as a mess of bright shards; I twice mis-blamed the geometry (the tangential gather,
  // then the edge trim) and both were innocent — a node pass over the triangles found
  // NO long edges at all, max edge 0.56 m against a 0.28 m step. ⭐ The split is the
  // whole architecture: the shader carries the octaves ABOVE the mesh's shortest one,
  // so its cell size is half the geometry's shortest wavelength, never the block size.
  useEffect(() => {
    if (!drape) return
    drapeUniforms.uBlock.value = drape.stats.lamMin * 0.5
    // ⭐ The waterline band's height is DERIVED from the wall it is on, not chosen:
    // a tall revetment has a tall wetted zone. ⚠️ One value for the whole shore here
    // — the per-vertex form and its cost are documented at the uniform.
    drapeUniforms.uBandH.value = Math.max(0.5, drape.stats.amp0 / 0.85 * 1.9)
    drapeUniforms.uWaterY.value = 0
  }, [drape])

  return (
    <>
      {!!instances.length && <InstancedBoulders palette={palette} instances={instances} material={stoneMaterial} castShadow={shadows} receiveShadow={shadows} />}
      {plan.chunked && <ChunkedStone ctx={ctx} palette={palette} onStats={s => window.dispatchEvent(new CustomEvent('chunk-stats', { detail: s }))} />}
      {drape && <mesh geometry={drape.geometry} material={drapeMaterial} castShadow receiveShadow />}
      <mesh geometry={bank} receiveShadow><meshStandardMaterial color="#4b5744" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 50]} receiveShadow>
        <planeGeometry args={[SHORE_LENGTH_M + 200, 140]} />
        <meshStandardMaterial color="#20404e" roughness={0.25} metalness={0.15} />
      </mesh>
      <Readout instances={instances} palette={palette} poly={poly} drape={drape} plan={plan} />
    </>
  )
}

// Publishes the measured numbers to the HUD. ⛔ Every figure is COUNTED off the
// geometry actually in the scene — none of it is a formula about what the scene
// ought to contain.
function Readout({ instances, palette, poly, drape, plan }) {
  useEffect(() => {
    const perPalette = palette.map(triCount)
    let stoneTris = 0
    const used = new Set()
    for (const it of instances) { stoneTris += perPalette[it.i]; used.add(it.i) }
    const total = poly.reduce((s, p, i) => i ? s + Math.hypot(p.x - poly[i - 1].x, p.z - poly[i - 1].z) : 0, 0)
    const stoneSpan = plan.stone ? total * (plan.stone.tRange[1] - plan.stone.tRange[0]) : 0
    window.dispatchEvent(new CustomEvent('boulder-stats', {
      detail: {
        total,
        stone: plan.stone ? {
          n: instances.length, span: stoneSpan, tris: stoneTris,
          per100m: stoneSpan ? Math.round((stoneTris / stoneSpan) * 100) : 0,
          nPer100m: stoneSpan ? Math.round((instances.length / stoneSpan) * 100) : 0,
          calls: used.size,
          bytes: instances.length * (64 + 12),   // instance matrix + instance colour
          coverage: instances.coverage ?? 0,
          slab26km: stoneSpan ? (instances.length * (64 + 12) / stoneSpan) * HURON_SHORE_M : 0,
        } : null,
        drape: drape ? {
          tris: drape.stats.tris, span: drape.stats.length,
          per100m: drape.stats.trisPer100m, calls: 1,
          block: drape.stats.blockSize, step: drape.stats.step,
          noise: drape.stats.noise, gather: drape.stats.gather, uniform: drape.stats.uniform,
          sheetArea: drape.stats.sheetArea, downwardPct: drape.stats.downwardPct,
          octaves: drape.stats.octaves, lam0: drape.stats.lam0, amp0: drape.stats.amp0, lamMin: drape.stats.lamMin,
          bytes: drape.stats.bytes,
          slab26km: (drape.stats.bytes / Math.max(1e-6, drape.stats.length)) * HURON_SHORE_M,
        } : null,
      },
    }))
  }, [instances, palette, poly, drape, plan])
  return null
}

// ⭐ THE EYE-GATE IS FROM THE WATER AND FROM THE STREET (`BRIEF-boulder-revetment §7`).
// A revetment seen only from above is a grey line and tests nothing.
const VIEWS = {
  // ⭐ The waterline station: low, close, square-on to the tallest stretch, which is
  // the only place the wet / splash / dry band can actually be judged.
  'waterline ⭐': { pos: [0, 0.8, 12], target: [0, 0.8, 3.5] },
  'close ⭐': { pos: [3, 1.1, 6.5], target: [1, 0.7, 1.2] },
  'from the water': { pos: [6, 1.5, 24], target: [2, 0.8, 0] },
  'from the street': { pos: [-2, 2.0, -15], target: [2, 0.5, 2] },
  'grazing ⭐': { pos: [-44, 0.55, 10], target: [26, 0.75, 2] },
  'raking': { pos: [-34, 5.5, 18], target: [12, 0.8, 2] },
  'plan': { pos: [0, 52, 14], target: [0, 0, 2] },
}
function ViewDriver({ view }) {
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls)
  useEffect(() => {
    const v = VIEWS[view]
    if (!v) return
    camera.position.set(...v.pos)
    if (controls?.target) { controls.target.set(...v.target); controls.update() }
    camera.updateProjectionMatrix()
  }, [view, camera, controls])
  return null
}

function App() {
  const [mode, setMode] = useState('compare')
  const [view, setView] = useState('from the water')
  const [paletteSize, setPaletteSize] = useState(12)
  // ⭐ THE RESOLUTION SWEEP IS A FINDING, NOT A PREFERENCE: a gathered sheet needs
  // vertices to fold with, so this dial is where the drape's cost advantage is
  // won or lost. Sweep it at the grazing view and watch when it stops reading as
  // lumpy ground and starts reading as packed stone.
  const [res, setRes] = useState(3)      // OCTAVES carried by the geometry
  const [uniform, setUniform] = useState(false)
  // ⛔ A DIAGNOSTIC SWITCH, not a look control. 1,900 half-metre casters against a
  // 2048 map over a 180 m frustum gives ~0.09 m per shadow texel — a stone is ~5
  // texels across, which is where self-shadow acne turns a lit object black.
  const [shadows, setShadows] = useState(true)
  // ⛔ 0.6 MATCHES `revetmentDrape`'s own default, and the mismatch mattered: this
  // sat at 0.35 while the module defaulted to 0.6, so the gathered drape was being
  // JUDGED at half the tangential gain it was designed for. The 0.35 was chosen
  // when the gather still used 3D world cells and shredded the sheet at 0.6 — that
  // cause is gone (cells moved into the sheet's parameter space), so the reason
  // expired and the number should have followed it. ⭐ One default, in one place,
  // and the harness reads it rather than restating it.
  const [gather, setGather] = useState(DRAPE_DEFAULT_GATHER)
  const [packing, setPacking] = useState(0.62)
  // ⭐ THE CROSSOVER TEST: drop `res` until the drape stops reading as stone, with
  // this ON and with it OFF. The gap between those two resolutions is the value of
  // shader-carried detail, in triangles.
  const [detail, setDetail] = useState(true)
  const [live, setLive] = useState(null)
  const [bench, setBench] = useState(null)
  const [st, setSt] = useState(null)
  const [ck, setCk] = useState(null)
  const palette = useMemo(() => boulderPalette({ count: paletteSize, seed: 1337 }), [paletteSize])

  // ⛔ THE FRAME COST IS BENCHED, NOT READ OFF AN FPS COUNTER. rAF is throttled in
  // an unfocused tab, so a scripted fps readout measures the window manager, not
  // the scene — it reads 0 while the scene draws perfectly well.
  const runBench = () => {
    const b = window.__boulders
    if (!b) { setBench({ error: 'renderer handle missing — reload the page' }); return }
    setBench(b.bench(240))
  }
  useEffect(() => {
    const h = e => setSt(e.detail)
    const h2 = e => setCk(e.detail)
    window.addEventListener('boulder-stats', h)
    window.addEventListener('chunk-stats', h2)
    return () => { window.removeEventListener('boulder-stats', h); window.removeEventListener('chunk-stats', h2) }
  }, [])

  const paletteTris = palette.map(triCount)
  const meanPalette = (paletteTris.reduce((a, b) => a + b, 0) / palette.length).toFixed(1)

  return (
    <>
      <Canvas
        shadows
        camera={{ position: [6, 1.5, 24], fov: 45, near: 0.1, far: 700 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
          document.body.dataset.boulderReady = '1'
          // ⛔ HARNESS ONLY, and it exists because of a measured nuisance: Chrome
          // pauses requestAnimationFrame in an UNFOCUSED tab, so R3F's loop stops
          // and the canvas keeps whatever was last painted — a scene that looks
          // BLANK or stale while being perfectly correct. React still reconciles
          // (its scheduler is timer-based), so a slow interval render keeps the
          // picture honest for screenshots and automation. ⭐ Never do this in the
          // player: there, demand-mode + invalidate() is the contract.
          clearInterval(window.__boulderTick)
          window.__boulderTick = setInterval(() => { try { gl.render(scene, camera) } catch (e) { /* context gone */ } }, 120)
          window.__boulders = {
            gl, scene, camera,
            bench(n = 240) {
              // ⛔ THE FLUSH IS NOT OPTIONAL AND THE FIRST VERSION OF THIS WAS WRONG.
              // `gl.render()` returns as soon as the commands are QUEUED, so timing
              // the loop without a fence measures JS submit cost and reported ~7500
              // "fps" — a plausible-looking number that is not a frame time. A
              // `finish()` either side makes it CPU+GPU wall time for real frames.
              const ctx = gl.getContext()
              gl.render(scene, camera); ctx.finish()
              const t0 = performance.now()
              for (let i = 0; i < n; i++) gl.render(scene, camera)
              ctx.finish()
              const ms = (performance.now() - t0) / n
              const px = gl.domElement.width * gl.domElement.height
              // ⛔⛔ AND THE FENCE DOES NOT ALWAYS FENCE — MEASURED, 2026-09-21.
              // With `finish()` on both sides this still reported 0.023 ms/frame at
              // 5.06 Mpx, i.e. 43,000 fps, which is not a frame time on any hardware:
              // Chrome/ANGLE is free to treat `finish()` as advisory and defer the
              // work. ⭐ A number that cannot be true must SAY SO rather than be
              // printed — a plausible-looking wrong measurement is the worst thing an
              // instrument can produce. ▶ A real frame cost needs
              // EXT_disjoint_timer_query_webgl2, or a foreground tab and a wall-clock
              // rAF count. NOT BUILT HERE; the cost is unestablished, not fast.
              const fps = 1000 / ms
              if (fps > 5000) return { error: `⛔ NOT A FRAME TIME (${fps.toFixed(0)} fps at ${(px / 1e6).toFixed(2)} Mpx) — finish() did not fence. Frame cost NOT established.` }
              return { msPerFrame: +ms.toFixed(3), impliedFps: Math.round(fps), calls: gl.info.render.calls, tris: gl.info.render.triangles, px }
            },
          }
        }}
      >
        <color attach="background" args={['#0d1014']} />
        {/* Daylight, not a studio. ⛔ An over-lit rock is white plastic, and the
            eye-gate then tests the exposure rather than the geometry. */}
        <hemisphereLight args={['#9fc0da', '#3c4234', 0.55]} />
        {/* ⛔ `shadow-normalBias` IS NOT COSMETIC HERE AND IT COST ME AN HOUR. A
            heavily folded surface self-shadows into near-black acne at this map
            resolution: the drape rendered as a dark smear and looked like a
            geometry failure, with the geometry perfectly correct (bbox 120 × 1.9 m,
            normals up). ⭐ Anything that ships this surface needs the same bias. */}
        <directionalLight position={[38, 34, 18]} intensity={1.35} castShadow
          shadow-normalBias={0.06} shadow-bias={-0.0004}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-90} shadow-camera-right={90}
          shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={220} />
        {mode === 'gallery' ? <Gallery /> : <Shore palette={palette} mode={mode} res={res} gather={gather} uniform={uniform} packing={packing} shadows={shadows} />}
        <OrbitControls makeDefault target={[2, 0.8, 0]} maxPolarAngle={Math.PI * 0.499} />
        <ViewDriver view={view} />
        <Stats onSample={setLive} />
      </Canvas>

      <div style={{ position: 'fixed', top: 12, left: 12, background: 'rgba(8,11,14,.88)', border: '1px solid #2a3440', borderRadius: 8, padding: '10px 12px', width: 440 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {['gallery', 'instanced', 'chunked ⭐', 'drape ∥', 'gathered ▲', 'drape fbm', 'hybrid', 'compare', 'necklace'].map(m => (
            <Btn key={m} on={mode === m} onClick={() => setMode(m)} tint="#3d6b8f">{m}</Btn>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {Object.keys(VIEWS).map(v => <Btn key={v} on={view === v} onClick={() => setView(v)} tint="#4a5a45">{v}</Btn>)}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ opacity: .7 }}>palette (= stone draw calls)</span>
          <input type="range" min="1" max="32" value={paletteSize} style={{ flex: 1 }} onChange={e => setPaletteSize(+e.target.value)} />
          <b>{paletteSize}</b>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ opacity: .7 }}>⭐ packing (lower = denser)</span>
          <input type="range" min="35" max="120" value={Math.round(packing * 100)} style={{ flex: 1 }} onChange={e => setPacking(+e.target.value / 100)} />
          <b>{packing.toFixed(2)}</b>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ opacity: .7 }}>⭐ octaves in GEOMETRY</span>
          <input type="range" min="1" max="5" value={res} style={{ flex: 1 }} onChange={e => setRes(+e.target.value)} />
          <b>{res}</b>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <Btn on={detail} tint="#7a5a2f" onClick={() => { const v = !detail; setDetail(v); drapeUniforms.uDetail.value = v ? 1 : 0; window.__boulders?.gl && window.__boulders.gl.render(window.__boulders.scene, window.__boulders.camera) }}>
            shader detail {detail ? 'ON' : 'OFF'}
          </Btn>
          <span style={{ opacity: .55, fontSize: 11 }}>normals · block edges · gaps · per-block tone</span>
          <Btn on={uniform} tint="#6b3f3f" onClick={() => setUniform(!uniform)}>uniform {uniform ? 'ON' : 'off'}</Btn>
          <Btn on={false} tint="#7a3f6b" onClick={() => { const u = drapeUniforms.uDebug; u.value = (u.value + 1) % 4; window.__boulders?.gl.render(window.__boulders.scene, window.__boulders.camera) }}>
            debug N
          </Btn>
          <Btn on={!shadows} tint="#7a3f3f" onClick={() => setShadows(!shadows)}>shadows {shadows ? 'on' : 'OFF'}</Btn>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ opacity: .7 }}>tangential gain (0 = normal only)</span>
          <input type="range" min="0" max="120" value={Math.round(gather * 100)} style={{ flex: 1 }} onChange={e => setGather(+e.target.value / 100)} />
          <b>{gather.toFixed(2)}</b>
        </div>
        <Row k="tris / boulder (palette mean)" v={`${meanPalette}  [${Math.min(...paletteTris)}–${Math.max(...paletteTris)}]`} />
        {st && st.stone && <>
          <Head>INSTANCED STONE — {st.stone.span.toFixed(0)} m of shore</Head>
          <Row k="stones" v={st.stone.n.toLocaleString()} />
          <Row k="stones / 100 m" v={st.stone.nPer100m.toLocaleString()} />
          <Row k="⭐ areal coverage (with overlap)" v={`${(st.stone.coverage * 100).toFixed(0)}%`} />
          <Row k="triangles" v={st.stone.tris.toLocaleString()} />
          <Row k="⭐ triangles / 100 m" v={st.stone.per100m.toLocaleString()} />
          <Row k="draw calls" v={st.stone.calls} />
          <Row k="instance data" v={`${(st.stone.bytes / 1024).toFixed(1)} KB`} />
          <Row k="⭐ slab bytes @ 26 km" v={`${(st.stone.slab26km / 1e6).toFixed(1)} MB`} />
        </>}
        {ck && <>
          <Head>⭐ CHUNKED — GENERATED IN THE PLAYER, ZERO SLAB BYTES</Head>
          <Row k="chunks instantiated" v={`${ck.chunks} × ${CHUNK_M} m (radius ${VIEW_RADIUS_M} m)`} />
          <Row k="stones IN VIEW" v={ck.stones.toLocaleString()} />
          <Row k="⭐ triangles IN VIEW" v={Math.round(ck.stones * 49.8).toLocaleString()} />
          <Row k="⭐ stone draw calls" v={`${ck.calls} (palette, not chunks)`} />
          <Row k="last move: chunks generated" v={`${ck.generated} in ${ck.genMs.toFixed(1)} ms`} />
          <Row k="⭐ slab bytes for stone" v={'0 — the drape + a 4-byte seed'} />
        </>}
        {st && st.drape && <>
          <Head>DRAPE — {st.drape.span.toFixed(0)} m of shore</Head>
          <Row k="triangles" v={st.drape.tris.toLocaleString()} />
          <Row k="⭐ triangles / 100 m" v={st.drape.per100m.toLocaleString()} />
          <Row k="draw calls" v={st.drape.calls} />
          <Row k="block size / mesh step" v={`${st.drape.block.toFixed(2)} m / ${st.drape.step.toFixed(3)} m`} />
          <Row k="noise / tangential" v={`${st.drape.noise} / ${st.drape.gather.toFixed(2)}`} />
          <Row k="⭐ octaves in geometry" v={`${st.drape.octaves} → shortest λ ${st.drape.lamMin.toFixed(2)} m`} />
          <Row k="macro λ / amplitude" v={`${st.drape.lam0.toFixed(2)} m / ${st.drape.amp0.toFixed(2)} m`} />
          <Row k="⭐ sheet area" v={`${st.drape.sheetArea.toFixed(0)} m² — gathered foil would be ≫ its footprint`} />
          <Row k="⭐ downward-facing faces" v={`${st.drape.downwardPct.toFixed(1)}%  (overhangs ⇒ sky between stones)`} />
          <Row k="modulation" v={st.drape.uniform ? '⛔ UNIFORM (control)' : 'varied: sharp↔soft, chunky↔fine'} />
          <Row k="vertex data" v={`${(st.drape.bytes / 1024).toFixed(1)} KB`} />
          <Row k="⭐ slab bytes @ 26 km" v={`${(st.drape.slab26km / 1e6).toFixed(1)} MB`} />
        </>}

        <button onClick={runBench} id="bench-btn"
          style={{ width: '100%', marginTop: 8, padding: '6px 4px', cursor: 'pointer', background: '#2d3f4f', color: '#e8eef5', border: '1px solid #2a3440', borderRadius: 5, font: 'inherit' }}>
          bench 240 frames
        </button>
        {bench && <div id="bench-out" style={{ marginTop: 6 }}>
          {bench.error ? <Row k="bench" v={bench.error} /> : <>
            <Row k="⭐ ms / frame (CPU+GPU, flushed)" v={bench.msPerFrame} />
            <Row k="implied fps at this resolution" v={bench.impliedFps} />
            <Row k="benched at" v={`${(bench.px / 1e6).toFixed(2)} Mpx`} />
            <Row k="draw calls / triangles" v={`${bench.calls} / ${bench.tris.toLocaleString()}`} />
          </>}
        </div>}
        {live && <>
          <Head>LIVE</Head>
          <Row k="renderer draw calls (whole scene)" v={live.calls} />
          <Row k="renderer triangles (this frame)" v={live.triangles.toLocaleString()} />
          <Row k="shader programs" v={live.programs} />
        </>}
        <div style={{ marginTop: 8, opacity: .62, fontSize: 11 }}>
          slope = angle of repose {RIPRAP_REPOSE_DEG}° · min armour D50 {MIN_ARMOUR_D50_M} m · both from
          <code> cartograph/shore-armour.mjs</code> — properties of rock, not of a town.
          ⛔ No authored parameter anywhere in this probe.
        </div>
      </div>
    </>
  )
}

const Btn = ({ on, onClick, tint, children }) => (
  <button onClick={onClick} style={{ padding: '5px 7px', cursor: 'pointer', fontSize: 11, background: on ? tint : '#1a222b', color: '#e8eef5', border: '1px solid #2a3440', borderRadius: 5, font: 'inherit' }}>{children}</button>
)
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ opacity: .7 }}>{k}</span><b>{v}</b>
  </div>
)
const Head = ({ children }) => (
  <div style={{ marginTop: 7, paddingTop: 5, borderTop: '1px solid #2a3440', color: '#8fb4d0', fontSize: 11 }}>{children}</div>
)

createRoot(document.getElementById('root')).render(<App />)
