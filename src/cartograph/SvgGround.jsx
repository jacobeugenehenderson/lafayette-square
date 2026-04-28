/**
 * SvgGround — Stage's ground renderer driven by the baked artifact.
 *
 * Reads `public/cartograph-ground.svg` (the bake's only output, per
 * project_cartograph_bake_step) and renders its `<path>` rings through
 * MapLayers' canonical `makeFlatMat` so the material stack — terrain
 * displacement, radial fade, polygon-offset priority — is identical to
 * the rest of the GL pipeline.
 *
 * Designer keeps reading ribbons.json through StreetRibbons.
 * Stage neighborhood shots read the bake here. The two never run
 * together — see CartographApp gating.
 */
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import useCartographStore from './stores/useCartographStore.js'
import useCamera from '../hooks/useCamera'
import { terrainExag } from '../utils/terrainShader'
import { BAND_TO_LAYER } from './m3Colors.js'
// NOTE: makeFlatMat (MapLayers) was producing black-unlit output on PRI
// 2/6/8 — likely a shader-cache/key interaction that breaks the shared
// program for some draws. Using a plain MeshStandardMaterial here while
// we confirm the geometry+lighting baseline; we'll layer fade/terrain
// back in afterward.
// import { makeFlatMat } from './MapLayers.jsx'

// Map a parsed item to the layer-id used as the live color/visibility key
// in the store. Ribbon materials map via BAND_TO_LAYER (asphalt → street);
// land-use is keyed by the use-name (lu-residential → residential).
function liveKeyFor(item) {
  if (item.kind === 'face') return item.id.replace(/^lu-/, '')
  return BAND_TO_LAYER[item.id] || item.id
}
function liveColorFor(item, layerColors, luColors) {
  const k = liveKeyFor(item)
  if (item.kind === 'face') return luColors[k] || item.fill
  return layerColors[k] || layerColors[item.id] || item.fill
}
function liveVisibleFor(item, layerVis) {
  if (item.kind === 'face') return true            // no lu visibility namespace
  const k = liveKeyFor(item)
  if (k in layerVis) return layerVis[k] !== false  // unset = visible
  if (item.id in layerVis) return layerVis[item.id] !== false
  return true
}

// Stage's terrain-exaggeration driver. StreetRibbons owns this animation in
// Designer; when StreetRibbons isn't mounted (Stage shots), nobody else
// updates terrainExag.value and the ground stays flat. Run the same ramp
// here so SvgGround's terrain displacement actually shows elevation.
const HERO_EXAG = 5

// Match StreetRibbons priorities so the layer stack reads identically.
const FACE_FILL_PRIORITY = 1
const BAND_PRIORITY = {
  lawn:     2,
  treelawn: 3,
  median:   3,
  sidewalk: 5,
  curb:     6,
  asphalt:  8,
  highway:  8,
  footway:  5,
  cycleway: 5,
  steps:    5,
  path:     5,
}

// Parse the bake's strict SVG `d` strings: only M, L, Z; no curves.
// Multiple subpaths chain as M…ZM…Z.
function parsePathD(d) {
  const rings = []
  let cur = null
  const re = /([MLZ])([^MLZ]*)/g
  let m
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1]
    if (cmd === 'Z') { cur = null; continue }
    const [x, y] = m[2].split(',').map(Number)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (cmd === 'M') { cur = []; rings.push(cur) }
    cur.push([x, y])
  }
  return rings.filter(r => r.length >= 3)
}

// Signed area in the (x, z) plane. Positive = CCW (when +X is right and +Z
// is "down" on screen, which is Three.js's overhead convention).
function signedArea(ring) {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, z0] = ring[i]
    const [x1, z1] = ring[(i + 1) % n]
    a += x0 * z1 - x1 * z0
  }
  return a / 2
}

// Triangulate a ring on the y=0 plane. Bake (x, y) maps to world (x, 0, y).
// We force CCW winding so triangulated faces always present their geometric
// front upward — otherwise DoubleSide normal flipping (in MeshStandardMaterial)
// turns my forced (0,1,0) normal into (0,-1,0) on back-facing fragments and
// the surface reads as unlit black from the overhead sun.
// Stamps `aCentroidXZ` on every vertex so terrain-displacement materials with
// rigidCentroid=true can sample one terrain point per ring.
function triangulateRing(ring) {
  const ccw = signedArea(ring) >= 0 ? ring : ring.slice().reverse()
  const shape = new THREE.Shape(ccw.map(p => new THREE.Vector2(p[0], p[1])))
  const flat = new THREE.ShapeGeometry(shape)
  const src = flat.attributes.position.array
  const idx = flat.index
  const n = src.length / 3
  if (!idx || n < 3) { flat.dispose(); return null }
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const cen = new Float32Array(n * 2)
  let cx = 0, cz = 0
  for (const p of ring) { cx += p[0]; cz += p[1] }
  cx /= ring.length; cz /= ring.length
  for (let i = 0; i < n; i++) {
    pos[i * 3]     = src[i * 3]
    pos[i * 3 + 1] = 0
    pos[i * 3 + 2] = src[i * 3 + 1]
    nrm[i * 3 + 1] = 1
    cen[i * 2]     = cx
    cen[i * 2 + 1] = cz
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position',   new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal',     new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('aCentroidXZ', new THREE.BufferAttribute(cen, 2))
  out.setIndex(idx.clone())
  flat.dispose()
  return out
}

export default function SvgGround() {
  const [parsed, setParsed] = useState(null)
  const bakeLastMs   = useCartographStore(s => s.bakeLastMs)
  const activeLookId = useCartographStore(s => s.activeLookId)
  // Live styling — drives material colors and visibility without re-baking.
  // The bake captures a *snapshot* (so a fresh consumer of the SVG sees the
  // right colors out of the box); the runtime always reflects the current
  // working draft.
  const layerColors  = useCartographStore(s => s.layerColors)
  const luColors     = useCartographStore(s => s.luColors)
  const layerVis     = useCartographStore(s => s.layerVis)

  // Drive shared terrain exag toward a target based on view mode (hero/browse
  // get full elevation; planetarium reads flatter). Lifted from StreetRibbons.
  useFrame(() => {
    const vm = useCamera.getState().viewMode
    const target = vm === 'planetarium' ? 1 : HERO_EXAG
    const cur = terrainExag.value
    if (Math.abs(cur - target) < 0.01) { terrainExag.value = target; return }
    terrainExag.value += (target - cur) * 0.06
  })

  useEffect(() => {
    if (!activeLookId) return
    let alive = true
    const cacheBust = bakeLastMs ?? Date.now()
    // Each Look has its own ground.svg under public/looks/<id>/. SvgGround
    // re-fetches when the active Look changes or a new bake completes.
    const url = `${import.meta.env.BASE_URL}looks/${activeLookId}/ground.svg?v=${cacheBust}`
    fetch(url, { cache: 'reload' })
      .then(r => r.text())
      .then(text => {
        if (!alive) return
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
        if (doc.querySelector('parsererror')) {
          console.warn('[SvgGround] SVG parse error')
          return
        }
        const items = []
        const lu = doc.querySelector('#land-use')
        if (lu) {
          for (const p of lu.querySelectorAll('path')) {
            const d = p.getAttribute('d')
            const fill = p.getAttribute('fill') || '#888'
            if (!d) continue
            const rings = parsePathD(d)
            items.push({ kind: 'face', id: p.getAttribute('id') || 'lu', fill, pri: FACE_FILL_PRIORITY, rings })
          }
        }
        const rib = doc.querySelector('#ribbons')
        if (rib) {
          for (const p of rib.querySelectorAll('path')) {
            const id = p.getAttribute('id') || ''
            const d = p.getAttribute('d')
            const fill = p.getAttribute('fill') || '#888'
            if (!d) continue
            const rings = parsePathD(d)
            const pri = BAND_PRIORITY[id] ?? 5
            items.push({ kind: 'ribbon', id, fill, pri, rings })
          }
        }
        const totalRings = items.reduce((a, b) => a + b.rings.length, 0)
        console.log(`[SvgGround] parsed ${items.length} paths, ${totalRings} rings total`,
          items.map(i => `${i.id}:${i.rings.length}`).join(' '))
        setParsed(items)
      })
      .catch(err => console.warn('[SvgGround] fetch failed:', err))
    return () => { alive = false }
  }, [bakeLastMs, activeLookId])

  // Geometry — one merged BufferGeometry per source <path>, plus the source
  // metadata (kind/id/fill/pri) so the live-styling effect below can look
  // up colors and visibility from the store. Materials are NOT baked in
  // here — they're built in a separate useMemo so we can mutate
  // `material.color` on each Surfaces edit without rebuilding geometry.
  const meshes = useMemo(() => {
    if (!parsed) return []
    const out = []
    let mergedCount = 0, fallbackCount = 0, droppedRings = 0
    for (const item of parsed) {
      const geos = []
      for (const ring of item.rings) {
        const g = triangulateRing(ring)
        if (g) geos.push(g)
        else droppedRings++
      }
      if (!geos.length) continue
      let merged = null
      if (geos.length > 1) {
        try { merged = mergeGeometries(geos, false) } catch { merged = null }
      } else {
        merged = geos[0]
      }
      if (merged) {
        if (geos.length > 1) for (const g of geos) g.dispose()
        out.push({
          key: `${item.kind}-${item.id}`,
          geo: merged, kind: item.kind, id: item.id, fill: item.fill, pri: item.pri,
        })
        mergedCount++
      } else {
        for (let i = 0; i < geos.length; i++) {
          out.push({
            key: `${item.kind}-${item.id}-${i}`,
            geo: geos[i], kind: item.kind, id: item.id, fill: item.fill, pri: item.pri,
          })
        }
        fallbackCount++
      }
    }
    console.log(`[SvgGround] built ${out.length} meshes (merged=${mergedCount}, fallback=${fallbackCount}, dropped=${droppedRings})`)
    return out
  }, [parsed])

  // Materials — one per mesh, stable across color/visibility edits. Initial
  // color comes from the SVG fill (the bake snapshot); the effect below
  // updates `mat.color` whenever the active Look's live colors change so
  // edits in Surfaces show instantly without a re-bake.
  const materials = useMemo(() => {
    return meshes.map(m => {
      const mat = new THREE.MeshStandardMaterial({
        color: m.fill,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -m.pri,
        polygonOffsetUnits: -m.pri * 4,
      })
      // Flat-shader injection: same trick StreetRibbons uses in Designer.
      // Diffuse = base color, no lighting. Pass C will replace this with
      // real per-surface shaders driven from Surfaces.
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_maps>',
          [
            '#include <lights_fragment_maps>',
            'reflectedLight.directDiffuse = vec3(0.0);',
            'reflectedLight.directSpecular = vec3(0.0);',
            'reflectedLight.indirectSpecular = vec3(0.0);',
            'reflectedLight.indirectDiffuse = diffuseColor.rgb;',
          ].join('\n')
        )
      }
      mat.customProgramCacheKey = () => 'svgground-flat-v1'
      return mat
    })
  }, [meshes])

  // Dispose materials when meshes (and thus materials) get rebuilt — happens
  // on bake completion or active-Look switch. Without this, GPU programs
  // accumulate as the user iterates.
  useEffect(() => {
    return () => { for (const m of materials) m.dispose() }
  }, [materials])

  // Live color update — runs whenever the store's color maps change. Mutates
  // each material's `.color` in place; no geometry rebuild, no remount.
  useEffect(() => {
    for (let i = 0; i < meshes.length; i++) {
      const c = liveColorFor(meshes[i], layerColors, luColors)
      materials[i].color.set(c)
    }
  }, [meshes, materials, layerColors, luColors])

  if (!meshes.length) return null
  return (
    <group>
      {meshes.map((m, i) => (
        // Tiny y stacking per priority — polygonOffset alone wasn't reliably
        // resolving coplanar transparent layers. Visibility derived live
        // from the active Look's `layerVis`; toggling in Surfaces hides /
        // shows immediately without a re-bake.
        <mesh
          key={m.key}
          geometry={m.geo}
          material={materials[i]}
          visible={liveVisibleFor(m, layerVis)}
          position={[0, m.pri * 0.01, 0]}
          renderOrder={m.pri}
          receiveShadow
        />
      ))}
    </group>
  )
}
