/**
 * HeroImpostorBaker — captures every roster species' HERO canopy impostor (side-on,
 * all N azimuths × the leaf-shells + one rear woody layer) and POSTs it into the
 * look's slab, as a step of the Grove "Bake → Slab" button. The side-on twin of
 * OverheadBaker (HANDOFF-hero-impostor-foundation.md).
 *
 * WHY here: the capture is a browser-GPU RTT of the real tree (the Node slab-bake has
 * no GPU), and Bake→Slab is the canonical "ship the roster to the slab" action → the
 * capture rides that button. One capture per unique species at authoring time; the
 * runtime never captures.
 *
 * The N azimuths are the per-instance VARIETY pool (Jacob 2026-07-17), NOT a view-
 * dependent swap — the runtime assigns each of a species' instances one fixed azimuth
 * by hash so the 88 sugar maples aren't 88 identical cards.
 *
 * Runs AFTER the HTTP /grove/bake (which regenerates trees-atlas.json), so each POST
 * merges heroImpostorBySpecies into the FRESH manifest. Crash-safe: fresh GLB per
 * species, ONE shot (azimuth×layer) per frame.
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useTreeAtlas, applyBarkUniforms, applyDeformerUniforms } from '../components/treeAtlasMaterial.js'
import { prepareHeroBands, captureHeroBand } from '../components/captureImpostor.js'

// ⛔ MESHOPT DECODER REQUIRED. This baker reads the BAKED per-look GLBs, which
// bake-look now writes quantized + meshopt-compressed. drei's useGLTF wires this
// decoder for us everywhere else; this is a RAW GLTFLoader, so it must wire its
// own or every capture fails to load and the slab ships holes.
const _loader = new GLTFLoader()
_loader.setMeshoptDecoder(MeshoptDecoder)
function loadGltf(url) { return new Promise((res, rej) => _loader.load(url, res, undefined, rej)) }
function nextFrame() { return new Promise((r) => requestAnimationFrame(r)) }

// Canopy radius = max XZ extent (from the capture origin) over ALL geometry, WORLD
// space (each vertex through its node matrix). Identical to OverheadBaker's measure —
// a tree's foliage can live in a wildly scaled node (tilia 0.01, abies 30.48); raw
// local positions mis-size the frame (oaks clip, conifers go near-blank). Framing to
// ALL geometry (not leaf-only) means a mis-tagged outer leaf can't under-frame a side.
function measureCanopyRadius(scene) {
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  let xzAll = 0
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      const r = Math.hypot(v.x, v.z)
      if (r > xzAll) xzAll = r
    }
  })
  return Math.max(1, xzAll)
}

// Encode a capture's readback pixels → a right-sized PNG dataURL. WebGL readback is
// bottom-up, so flip Y into the (downsized) target canvas. Interim box downsize — the
// coverage-preserving mip + KTX2 fold in at slab-packing (the weight lever).
function readbackToPng(rb, target) {
  if (!rb?.data) return null
  const src = document.createElement('canvas'); src.width = rb.width; src.height = rb.height
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rb.data), rb.width, rb.height), 0, 0)
  const dst = document.createElement('canvas'); dst.width = target; dst.height = target
  const d = dst.getContext('2d')
  d.translate(0, target); d.scale(1, -1)
  d.drawImage(src, 0, 0, target, target)
  return dst.toDataURL('image/png')
}

// Fraction of a readback that is meaningfully opaque. A capture that renders to
// ~nothing is a FAILED bake, and it fails SILENTLY: the layer is a valid
// transparent PNG, the manifest looks complete, and the species simply stops
// existing in the hero shot. `platanus_acerifolia` shipped all 18 layers blank
// this way — 442 placements, LS's second most common tree, invisible on the pan
// with its ground shadow still printing. (Root cause: a species with no
// `barkDetailBySpecies` record renders with uBarkTileScale (0,0), so every layer
// samples an empty atlas region. Only Salon-composed species get that record.)
const BLANK_COVERAGE = 0.002
function alphaCoverage(rb) {
  if (!rb?.data) return 0
  const d = rb.data
  let opaque = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 12) opaque++
  return opaque / (d.length / 4)
}

async function postHeroImpostor(look, species, meta, layers) {
  const blanks = layers.filter((l) => alphaCoverage(l.albedoTex?.userData?.readback) < BLANK_COVERAGE)
  if (blanks.length) {
    throw new Error(
      `${blanks.length}/${layers.length} layers rendered blank — refusing to ship an invisible species. ` +
      `Check that '${species}' has a barkDetailBySpecies record (Salon-composed) and a sane canopy base.`)
  }
  const body = {
    heightM: meta.heightM, canopyRadiusM: meta.canopyRadiusM, canopyBaseNorm: meta.canopyBaseNorm,
    azimuths: meta.azimuths, shells: meta.shells,
    // Rides along for drain-on-bake — see src/arborist/captureKey.js.
    captureKey: meta.captureKey ?? null,
    layers: layers
      .map((l) => ({
        azIdx: l.azIdx, azimuthDeg: l.azimuthDeg, kind: l.kind, shellIdx: l.shellIdx, cardDepthFrac: l.cardDepthFrac,
        albedo: readbackToPng(l.albedoTex?.userData?.readback, meta.albedoSize),
        ao: readbackToPng(l.aoTex?.userData?.readback, meta.aoSize),
      }))
      .filter((l) => l.albedo && l.ao),
  }
  if (!body.layers.length) return
  const res = await fetch(`/api/arborist/hero-impostor/${encodeURIComponent(look)}/${encodeURIComponent(species)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`hero-impostor POST ${res.status}`)
}

/**
 * @param {object}   props
 * @param {number}   props.runTick    bump to trigger a bake pass (0 = idle)
 * @param {string}   props.lookId
 * @param {object[]} props.species    [{ species, glbUrl }] — one per unique roster species
 * @param {number}   props.azimuths   variety-pool size (default 4). Per-instance
 *   variety scales with a species' INSTANCE count (many instances → visible stamping
 *   → more azimuths worth the weight; few instances → 1–2 suffice). LS's current pool
 *   is all common render species (154–807 instances each — census species substitute
 *   ONTO them), so uniform N=4 fits; a per-species map keys here when a rare species
 *   gets its own pool. Morphology also matters (columnar/symmetric crown → fewer sides).
 * @param {number}   props.shells     leaf depth-shells (default 2)
 * @param {number}   props.albedoSize persisted albedo PNG size (default 1024, supersampled from the 2048² capture)
 * @param {number}   props.aoSize     persisted AO PNG size (default 256)
 * @param {function} props.onProgress (done, total)
 * @param {function} props.onDone     ({ ok, fail })
 */
export function HeroImpostorBaker({ runTick, lookId, species, azimuths = 6, shells = 2, albedoSize = 1024, aoSize = 256, onProgress, onDone }) {
  const gl = useThree((s) => s.gl)
  const atlas = useTreeAtlas(lookId)
  const lastTick = useRef(0)

  useEffect(() => {
    if (!runTick || runTick === lastTick.current) return
    if (!gl || !atlas?.treeMaterial || !lookId || !species?.length) return
    lastTick.current = runTick
    let cancelled = false
    ;(async () => {
      let ok = 0, fail = 0
      for (let i = 0; i < species.length; i++) {
        if (cancelled) break
        const sp = species[i]
        let gltf = null
        try {
          gltf = await loadGltf(sp.glbUrl)
          const rM = measureCanopyRadius(gltf.scene)
          const prep = prepareHeroBands(gltf.scene, atlas.treeMaterial, { canopyRadiusM: rM, azimuths, shells })
          if (prep) {
            // Bind THIS species' atlas config to the shared material per draw (the
            // mesh path does this via SubmeshInstances#onBeforeRender; the plain
            // material assignment never did → uBarkTileScale (0,0) → blank bark).
            const man = atlas.manifest
            const barkSettings = man?.barkBySpecies?.[sp.species] || null
            const detailSlot = man?.barkDetailBySpecies?.[sp.species] || null
            const posterizedSlot = man?.barkPosterizedBySpecies?.[sp.species] || null
            const deformerRange = man?.deformerBySpecies?.[sp.species]?.range || null
            prep.scene.traverse((o) => {
              if (!o.isMesh) return
              o.onBeforeRender = () => {
                applyBarkUniforms(atlas.treeMaterial, barkSettings, null, detailSlot, posterizedSlot)
                applyDeformerUniforms(atlas.treeMaterial, deformerRange)
              }
            })
            const meta = {
              heightM: prep.heightM, canopyRadiusM: rM,
              canopyBaseNorm: prep.canopyBaseY / Math.max(1e-3, prep.maxY || prep.heightM),
              azimuths: prep.azimuths, shells: prep.shells,
              albedoSize, aoSize, captureKey: sp.captureKey,
            }
            // RETRY on blank — see the twin note in OverheadBaker. The capture is
            // flaky, so refusing on the first blank turns a transient race into a
            // permanently dropped species.
            let lastErr = null
            for (let attempt = 1; attempt <= 3; attempt++) {
              const layers = []
              for (let s = 0; s < prep.shots.length; s++) {
                layers.push(captureHeroBand(gl, prep, s))
                await nextFrame()               // one shot per frame → crash-safe
              }
              try {
                await postHeroImpostor(lookId, sp.species, meta, layers)
                lastErr = null
              } catch (e) {
                lastErr = e
                if (/rendered blank/.test(e.message) && attempt < 3) {
                  console.warn(`[hero-bake] ${sp.species}: ${e.message} — retry ${attempt}/2`)
                }
              } finally {
                for (const l of layers) { try { l.albedoTex?.dispose() } catch {} try { l.aoTex?.dispose() } catch {} }
              }
              if (!lastErr) break
              if (!/rendered blank/.test(lastErr.message)) break
              await nextFrame()
            }
            if (lastErr) throw lastErr
            ok++
          }
        } catch (e) {
          console.warn('[hero-impostor-bake] failed', sp.species, e)
          fail++
        } finally {
          try { gltf?.scene?.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.() }) } catch {}
        }
        onProgress?.(i + 1, species.length)
      }
      if (!cancelled) onDone?.({ ok, fail })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTick, gl, atlas?.treeMaterial, lookId, species, azimuths, shells, albedoSize, aoSize])

  return null
}
