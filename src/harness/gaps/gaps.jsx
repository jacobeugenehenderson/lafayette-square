/**
 * THE SHORE GAP-FINDER — gaps.html (BRIEF-the-shore-is-closed step 2). ⛔ HARNESS ONLY.
 *
 * ⭐ WHAT A GAP IS, AND WHY IT IS MEASURED ON THE RENDER: a view ray that points DOWN and meets the town's water plane
 * inside the drawing must land on something drawn — ground, bed, sand, stone, a building. Where it lands on nothing the
 * screen shows whatever is behind the world: the sky dome. The shore checks that read the baked heightfield cannot see
 * this (it is a ray passing between separately generated geometry), so this reads the production <Town> itself.
 *
 * HOW: <Town> exactly as the apps mount it, with the sky, clouds, fog, post and the WATER switched off (Town's own
 * layers; the water is hidden by its program key, as the water measure does) and the background a colour nothing in a
 * town is drawn in. A pixel showing that colour exactly is a ray that hit nothing. Counted only where the ray points down
 * and meets y = 0 (the datum) inside the disc — a ray leaving the drawing at its rim is the edge of the map, not a gap —
 * and where the ground there is shallower than the town's visibility depth (deeper, the water is opaque: not a gap).
 *
 * THE WALK: stations along every drawn shoreline arc (the slab's `__water__` runs, clipped to the disc), one per
 * terrain grid step (×`every`, for a quick run). At each, three views across the shore — NEAR-from-water (eye height
 * over the water, looking at the land), NEAR-from-land (eye height on the land, looking at the water), FAR (out over the
 * water and up, looking back) — and each gap pixel's landing point is kept, so a gap has a coordinate.
 *
 * ?look=<town> · every=<n> (stations at n × the grid step; default 1) · w,h (default 240×135) ·
 * hide=<ground group ids> (the MUTATION: those ground groups are hidden, e.g. hide=shore,bed — a gap-finder that does not
 * go red then is not seeing anything)
 */
import '../../placeBootTown.js'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Town from '../../components/Town.jsx'
import { QUALITY, townCanvasProps } from '../../lib/qualityProfile.js'
import { slabFetch } from '../../lib/slabUrl.js'
import { INSTANCE, townForLook } from '../../instance.js'
import { reloadTerrain, terrainExag, sceneExag, currentTerrain, terrainBed } from '../../utils/terrainShader.js'
import { getElevationRaw } from '../../utils/elevation'
import { waterRuns, clipTraceToDisc } from '../../../cartograph/shoreRuns.mjs'
import { drawnWaterTest } from '../../../cartograph/shore-armour.mjs'

const params = new URLSearchParams(location.search)
const LOOK = INSTANCE.lookId
const W = +(params.get('w') || 240), H = +(params.get('h') || 135), FOV = 60
const EVERY = Math.max(1, +(params.get('every') || 1))
const HIDE = (params.get('hide') || '').split(',').filter(Boolean)
const QP = { ...QUALITY.desktop, dpr: 1 }
const KEY = [1, 0, 1]                     // the background: pure magenta, which no town material is drawn in
const LAYERS = { sky: false, clouds: false, fog: false, post: false, labels: false }
const isWater = (o) => o.isMesh && typeof o.material?.customProgramCacheKey === 'function' && /^kit-water/.test(o.material.customProgramCacheKey())

await reloadTerrain(LOOK)

/** Stations along every drawn shoreline arc in the disc, with the unit normal toward the drawn water. */
async function stations(stencil) {
  const shape = await (await slabFetch(LOOK, 'shape.json')).json()
  const map = await (await fetch(`/cartograph/data/${LOOK}/clean/map.json`)).json()
  const inWater = drawnWaterTest((map.layers?.water || []).filter(w => w.ring?.length >= 3).map(w => w.ring.map(p => [p.x ?? p[0], p.z ?? p[1]])))
  const t = currentTerrain(), gridM = Math.min((t.bounds.maxX - t.bounds.minX) / (t.width - 1), (t.bounds.maxZ - t.bounds.minZ) / (t.height - 1))
  const step = gridM * EVERY, out = []
  for (const run of waterRuns(shape)) for (const arc of clipTraceToDisc(run, stencil.center, stencil.radius).inside) {
    let carry = 0
    for (let i = 1; i < arc.length; i++) {
      const [ax, az] = arc[i - 1], [bx, bz] = arc[i], L = Math.hypot(bx - ax, bz - az)
      if (!L) continue
      const tx = (bx - ax) / L, tz = (bz - az) / L
      for (let s = carry; s < L; s += step) {
        const x = ax + tx * s, z = az + tz * s
        // the normal toward the drawn water, read off the drawing one grid step out (both sides wet: a breakwater — skip)
        const r = inWater(x - tz * gridM, z + tx * gridM), l = inWater(x + tz * gridM, z - tx * gridM)
        if (r === l) continue
        out.push({ x, z, nx: r ? -tz : tz, nz: r ? tx : -tx })
      }
      carry = (carry - L) % step; if (carry < 0) carry += step
    }
  }
  return { list: out, gridM }
}

const VIEWS = [
  { id: 'near-from-water', out: 20, up: 1.7, pitch: -12, look: -1, ground: false },
  { id: 'near-from-land', out: -20, up: 1.7, pitch: -12, look: 1, ground: true },
  { id: 'far', out: 150, up: 40, pitch: -14, look: -1, ground: false },
]
const rafs = (n) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })

function Walker({ stencil, groups }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let dead = false
    ;(async () => {
      // settle: the ground drawn, the exaggeration arrived
      const t0 = performance.now()
      while (!dead && performance.now() - t0 < 120000) {
        await new Promise(r => setTimeout(r, 500))
        let n = 0; scene.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) n++ })
        if (n > 20 && Math.abs(terrainExag.value - sceneExag()) < 1e-3 && performance.now() - t0 > 6000) break
      }
      scene.background = new THREE.Color(...KEY)
      scene.traverse(o => { if (isWater(o)) o.visible = false })
      // the MUTATION: hide the named ground groups (BakedGround draws each at its group's renderOrder)
      const hideOrders = new Set(groups.filter(g => g.kind === 'mat' && HIDE.includes(g.id)).map(g => g.renderOrder))
      if (HIDE.length && !hideOrders.size) throw new Error(`hide=${HIDE.join(',')}: no such ground group`)
      let hidden = 0
      const ground = scene.getObjectByName('town:ground')
      ground?.traverse(o => { if (o.isMesh && hideOrders.has(o.renderOrder) && !isWater(o)) { o.visible = false; hidden++ } })
      const { list, gridM } = await stations(stencil)
      camera.fov = FOV; camera.near = 0.3; camera.far = 2e5; camera.aspect = W / H; camera.updateProjectionMatrix()
      const px = new Uint8Array(W * H * 4), ray = new THREE.Vector3(), glc = gl.getContext()
      const exag = terrainExag.value, R2 = stencil.radius ** 2
      // ⭐ DEEPER THAN THE BOTTOM SHOWS IS NOT A GAP: there the water is opaque (the town's own visibility depth, terrain.json
      // bed.visibleToM), so a ray landing on ground that deep sees water in the real render. Counted apart, never as a gap.
      const bed = terrainBed()
      if (!(bed?.visibleToM > 0)) throw new Error('terrain.json carries no bed.visibleToM — cannot tell shallow water from deep')
      let deep = 0
      const gaps = [], perView = Object.fromEntries(VIEWS.map(v => [v.id, { views: 0, withGap: 0, pixels: 0 }]))
      for (let k = 0; k < list.length && !dead; k++) {
        const s = list[k]
        for (const v of VIEWS) {
          const ex = s.x + s.nx * v.out, ez = s.z + s.nz * v.out
          const base = v.ground ? Math.max(0, getElevationRaw(ex, ez)) * exag : 0
          camera.position.set(ex, base + v.up, ez)
          const p = v.pitch * Math.PI / 180, dx = s.nx * v.look, dz = s.nz * v.look
          camera.lookAt(ex + dx * Math.cos(p), base + v.up + Math.sin(p), ez + dz * Math.cos(p))
          camera.updateMatrixWorld()
          await rafs(2)
          glc.readPixels(0, 0, W, H, glc.RGBA, glc.UNSIGNED_BYTE, px)
          let n = 0, first = null
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4
            if (px[i] !== 255 || px[i + 1] !== 0 || px[i + 2] !== 255) continue
            // readPixels' row 0 is the BOTTOM of the frame
            ray.set((x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize()
            if (ray.y >= 0) continue
            const t = -camera.position.y / ray.y, hx = camera.position.x + ray.x * t, hz = camera.position.z + ray.z * t
            if ((hx - stencil.center[0]) ** 2 + (hz - stencil.center[1]) ** 2 > R2) continue
            if (getElevationRaw(hx, hz) <= -bed.visibleToM) { deep++; continue }
            n++; if (!first) first = [+hx.toFixed(1), +hz.toFixed(1)]
          }
          const pv = perView[v.id]; pv.views++
          if (n) { pv.withGap++; pv.pixels += n; gaps.push({ view: v.id, station: [+s.x.toFixed(1), +s.z.toFixed(1)], pixels: n, at: first }) }
        }
        if (k % 50 === 0) window.__gapsProgress = `${k}/${list.length}`
      }
      window.__gaps = { done: true, look: LOOK, every: EVERY, gridM: +gridM.toFixed(3), stations: list.length, size: [W, H], fov: FOV,
        hide: HIDE, hiddenMeshes: hidden, perView, gaps, deepPixels: deep, visibleToM: bed.visibleToM }
      document.title = 'DONE'
    })().catch(e => { window.__gaps = { done: true, error: String(e?.stack || e) }; document.title = 'DONE' })
    return () => { dead = true }
  }, [])
  return null
}

function App() {
  const [ctx, setCtx] = useState(null), [err, setErr] = useState(null)
  useEffect(() => {
    slabFetch(LOOK, 'ground.json').then(r => r.json()).then(g => g.stencil ? setCtx({ stencil: g.stencil, groups: g.groups }) : setErr('no disc in ground.json'))
      .catch(e => setErr(String(e)))
  }, [])
  useEffect(() => { if (err) { window.__gaps = { done: true, error: err }; document.title = 'DONE' } }, [err])
  if (err) return <div>⛔ {err}</div>
  if (!ctx) return <div>loading {LOOK}…</div>
  const tcp = townCanvasProps(QP)
  return (
    <div style={{ width: W, height: H }}>
      <Canvas frameloop="always" {...tcp} dpr={1} camera={{ fov: FOV, near: 0.3, far: 2e5 }} gl={{ ...tcp.gl, preserveDrawingBuffer: true }}>
        <Town town={townForLook(LOOK, 'the shore gap-finder')} lookId={LOOK} quality={QP} shot="movie" flight={false} listings={[]}
          weatherMode="clear" interactive={false} layers={LAYERS} movie={{ hold: () => true, playing: false }}>
          <Walker stencil={ctx.stencil} groups={ctx.groups} />
        </Town>
      </Canvas>
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
