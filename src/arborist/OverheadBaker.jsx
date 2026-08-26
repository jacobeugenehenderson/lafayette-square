/**
 * OverheadBaker — captures every roster species' 3-slice OVERHEAD snapshot and
 * POSTs it into the look's slab, as a step of the Grove "Bake → Slab" button.
 *
 * WHY here: the overhead snapshot is a photographic top-down RENDER of the tree, so
 * it needs a GPU — and the Node slab-bake (bake-look) has none. The Grove is a
 * browser Canvas (GPU), and Bake→Slab is the canonical "ship the roster to the
 * slab" action → so the capture rides that button (before Stage; Stage/Preview then
 * just READ the baked slab). One render per unique asset, at authoring time — never
 * at runtime.
 *
 * Runs AFTER the HTTP /grove/bake (which regenerates trees-atlas.json), so each
 * POST merges overheadBySpecies into the FRESH manifest — no bake-look preservation
 * needed. Crash-safe: fresh GLB per species (own geometry), one band per FRAME.
 */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useTreeAtlas, applyBarkUniforms, applyDeformerUniforms } from '../components/treeAtlasMaterial.js'
import { prepareOverheadBands, captureOverheadBand } from '../components/captureImpostor.js'

// ⛔ MESHOPT DECODER REQUIRED. This baker reads the BAKED per-look GLBs, which
// bake-look now writes quantized + meshopt-compressed. drei's useGLTF wires this
// decoder for us everywhere else; this is a RAW GLTFLoader, so it must wire its
// own or every capture fails to load and the slab ships holes.
const _loader = new GLTFLoader()
_loader.setMeshoptDecoder(MeshoptDecoder)
function loadGltf(url) { return new Promise((res, rej) => _loader.load(url, res, undefined, rej)) }
function nextFrame() { return new Promise((r) => requestAnimationFrame(r)) }

// Canopy radius = max XZ extent (from the capture origin) over leaf meshes
// (fallback: all meshes). ⭐ Measured in WORLD space — each vertex is pushed
// through its node's world matrix before the hypot. The capture RENDERS the scene
// with world transforms applied, so measuring raw LOCAL positions (the old bug)
// sized the ortho frame to the wrong number wherever a tree's foliage lives in a
// scaled node (the docs note wildly mixed node scales, e.g. tilia 0.01, abies
// 30.48): oaks under-measured → canopy clipped at the square frame edge; conifers
// over-measured → tree renders tiny in a huge frame (the near-blank "chips").
// World space fixes both, and because it's max-distance-from-origin it also
// contains an off-centre canopy. Same class as the atlasKind decimation local/
// world bug. (Sibling to check: SpecimenViewport's overheadRec measure.)
const LEAF_RE = /leaf|leaves|foliage|frond|needle/i
function measureCanopyRadius(scene) {
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  let xzLeaf = 0, xzAll = 0
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const pos = o.geometry.attributes.position
    const kind = o.geometry?.userData?.atlasKind ?? o.userData?.atlasKind
    const isLeaf = kind === 'leaf' || (kind !== 'bark' && LEAF_RE.test(o.name || ''))
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      const r = Math.hypot(v.x, v.z)
      if (r > xzAll) xzAll = r
      if (isLeaf && r > xzLeaf) xzLeaf = r
    }
  })
  // Frame to xzAll (ALL geometry), not xzLeaf: the frame must contain everything
  // that renders, and if outer foliage is mis-tagged bark, leaf-only under-frames
  // → a hard clip on that side. A larger frame only adds transparent margin.
  void xzLeaf
  return Math.max(1, xzAll)
}

// Encode a capture's readback pixels → a right-sized PNG dataURL. WebGL readback is
// bottom-up, so flip Y drawing into the (downsized) target canvas. Interim box
// downsize — the coverage-preserving mip + R8 AO + KTX2 fold in at slab-packing.
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

// Fraction of a readback's pixels that are meaningfully opaque. A band that
// renders to ~nothing is a FAILED capture, not a thin canopy — the species'
// disc comes out empty and that layer silently disappears in Browse. The two
// known ways to get here both produce a fully transparent PNG rather than an
// error: the bark sub-region collapsing to (0,0) when a species has no
// `barkDetailBySpecies` record (see the uniform-binding note below), and band
// cuts landing in empty space on a mis-scaled asset. Both shipped blanks into
// the slab undetected (platanus branch+canopy, linden canopy — 2026-07-22),
// which is exactly the class of defect that must never be silent again.
const BLANK_COVERAGE = 0.002
function alphaCoverage(rb) {
  if (!rb?.data) return 0
  const d = rb.data
  let opaque = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 12) opaque++
  return opaque / (d.length / 4)
}

async function postOverhead(look, species, heightM, canopyRadiusM, bands, captureKey) {
  const blanks = []
  const encoded = bands.map((b) => {
    const coverage = alphaCoverage(b.albedoTex?.userData?.readback)
    if (coverage < BLANK_COVERAGE) {
      blanks.push(`${b.key} (${(coverage * 100).toFixed(2)}% opaque)`)
      return null
    }
    return {
      key: b.key, yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm,
      albedo: readbackToPng(b.albedoTex?.userData?.readback, 512),
      ao: readbackToPng(b.aoTex?.userData?.readback, 256),
    }
  }).filter((b) => b && b.albedo && b.ao)
  // Refuse the whole species rather than ship a partial stack — a missing band
  // is a hole in the parallax, and a silently-2-band tree reads as "fine" in the
  // manifest. Loud failure sends it back to the Salon where it can be fixed.
  if (blanks.length) {
    throw new Error(`blank band(s): ${blanks.join(', ')} — capture rendered nothing`)
  }
  // captureKey rides along so the NEXT bake can tell this species is already
  // current and skip it (drain-on-bake). See src/arborist/captureKey.js.
  const body = { heightM, canopyRadiusM, captureKey: captureKey ?? null, bands: encoded }
  if (!body.bands.length) return
  const res = await fetch(`/api/arborist/overhead/${encodeURIComponent(look)}/${encodeURIComponent(species)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`overhead POST ${res.status}`)
}

/**
 * @param {object}   props
 * @param {number}   props.runTick  bump to trigger a bake pass (0 = idle)
 * @param {string}   props.lookId
 * @param {object[]} props.species  [{ species, glbUrl }] — one per unique roster species
 * @param {function} props.onProgress (done, total)
 * @param {function} props.onDone   ({ ok, fail })
 */
export function OverheadBaker({ runTick, lookId, species, onProgress, onDone }) {
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
      const failedNames = []
      for (let i = 0; i < species.length; i++) {
        if (cancelled) break
        const sp = species[i]
        let gltf = null
        try {
          gltf = await loadGltf(sp.glbUrl)
          const rM = measureCanopyRadius(gltf.scene)
          const prep = prepareOverheadBands(gltf.scene, atlas.treeMaterial, { canopyRadiusM: rM })
          if (prep) {
            // Bind THIS species' atlas config to the shared material for its capture.
            // The mesh path does this per-draw (SubmeshInstances#onBeforeRender →
            // applyBarkUniforms); the baker's plain `o.material = treeMaterial` never
            // did, so uBarkTileScale stayed (0,0) → the bark sub-region collapsed and
            // every band sampled an empty atlas → a fully transparent (blank) PNG.
            const man = atlas.manifest
            const barkSettings = man?.barkBySpecies?.[sp.species] || null
            const detailSlot = man?.barkDetailBySpecies?.[sp.species] || null
            // No detail slot → applyBarkUniforms sets uBarkTileScale (0,0) and
            // ALL this species' bark samples an empty atlas region → the woody
            // bands render blank. Only Salon-composed species get a record
            // (patchManifestForSalon writes manifest#bark; bake-look surfaces
            // it), so a roster species adopted some other way — the merged
            // London plane, `platanus_acerifolia` — has none and cannot bake a
            // usable overhead. Say so; the blank guard below stops the ship.
            if (!detailSlot) {
              console.warn(`[overhead-bake] ${sp.species}: no barkDetailBySpecies record — bark will render blank (species has no Salon composition)`)
            }
            const posterizedSlot = man?.barkPosterizedBySpecies?.[sp.species] || null
            const deformerRange = man?.deformerBySpecies?.[sp.species]?.range || null
            prep.scene.traverse((o) => {
              if (!o.isMesh) return
              o.onBeforeRender = () => {
                applyBarkUniforms(atlas.treeMaterial, barkSettings, null, detailSlot, posterizedSlot)
                applyDeformerUniforms(atlas.treeMaterial, deformerRange)
              }
            })
            // RETRY on blank. The capture is FLAKY, not merely fragile: species
            // that measured 14%/10%/3.3% coverage on one bake came back fully
            // transparent on the next with no code change between them (maple_silver,
            // 2026-07-22) — the render is racing something (atlas upload / texture
            // decode / first-frame binding). Without a retry the guard turns a
            // transient flake into a permanently dropped species, which is why a
            // re-bake kept moving WHICH trees went missing. Give each species a few
            // fresh attempts, a frame apart, before refusing it.
            let lastErr = null
            for (let attempt = 1; attempt <= 3; attempt++) {
              const bands = []
              for (let b = 0; b < prep.cuts.length; b++) {
                bands.push(captureOverheadBand(gl, prep, b))
                await nextFrame()               // one band per frame → crash-safe
              }
              try {
                await postOverhead(lookId, sp.species, prep.heightM, rM, bands, sp.captureKey)
                lastErr = null
              } catch (e) {
                lastErr = e
                if (/blank band/.test(e.message) && attempt < 3) {
                  console.warn(`[overhead-bake] ${sp.species}: ${e.message} — retry ${attempt}/2`)
                }
              } finally {
                for (const bd of bands) { try { bd.albedoTex?.dispose() } catch {} try { bd.aoTex?.dispose() } catch {} }
              }
              if (!lastErr) break
              if (!/blank band/.test(lastErr.message)) break   // a real error — don't spin on it
              await nextFrame()
            }
            if (lastErr) throw lastErr
            ok++
          }
        } catch (e) {
          console.warn('[overhead-bake] failed', sp.species, e)
          fail++
          failedNames.push(sp.species)
        } finally {
          // Free the loaded GLB's GPU buffers so N species don't accumulate copies.
          try { gltf?.scene?.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.() }) } catch {}
        }
        onProgress?.(i + 1, species.length)
      }
      if (!cancelled) onDone?.({ ok, fail, failedNames })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTick, gl, atlas?.treeMaterial, lookId, species])

  return null
}
