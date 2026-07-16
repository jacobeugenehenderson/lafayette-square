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
import { useTreeAtlas, applyBarkUniforms, applyDeformerUniforms } from '../components/treeAtlasMaterial.js'
import { prepareOverheadBands, captureOverheadBand } from '../components/captureImpostor.js'

const _loader = new GLTFLoader()
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

async function postOverhead(look, species, heightM, canopyRadiusM, bands) {
  const body = {
    heightM, canopyRadiusM,
    bands: bands.map((b) => ({
      key: b.key, yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm,
      albedo: readbackToPng(b.albedoTex?.userData?.readback, 512),
      ao: readbackToPng(b.aoTex?.userData?.readback, 256),
    })).filter((b) => b.albedo && b.ao),
  }
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
            const posterizedSlot = man?.barkPosterizedBySpecies?.[sp.species] || null
            const deformerRange = man?.deformerBySpecies?.[sp.species]?.range || null
            prep.scene.traverse((o) => {
              if (!o.isMesh) return
              o.onBeforeRender = () => {
                applyBarkUniforms(atlas.treeMaterial, barkSettings, null, detailSlot, posterizedSlot)
                applyDeformerUniforms(atlas.treeMaterial, deformerRange)
              }
            })
            const bands = []
            for (let b = 0; b < prep.cuts.length; b++) {
              bands.push(captureOverheadBand(gl, prep, b))
              await nextFrame()                 // one band per frame → crash-safe
            }
            await postOverhead(lookId, sp.species, prep.heightM, rM, bands)
            for (const bd of bands) { try { bd.albedoTex?.dispose() } catch {} try { bd.aoTex?.dispose() } catch {} }
            ok++
          }
        } catch (e) {
          console.warn('[overhead-bake] failed', sp.species, e)
          fail++
        } finally {
          // Free the loaded GLB's GPU buffers so N species don't accumulate copies.
          try { gltf?.scene?.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.() }) } catch {}
        }
        onProgress?.(i + 1, species.length)
      }
      if (!cancelled) onDone?.({ ok, fail })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTick, gl, atlas?.treeMaterial, lookId, species])

  return null
}
