/**
 * BakedBuildings — loads the buildings bake + applies textures from the
 * Look's manifest. Per material group (wall + roof + foundation), one
 * mesh + one MeshStandardMaterial. Each material gets its texture map
 * (slate.jpg, brick_red.jpg, etc.) and an onBeforeCompile shader patch
 * that:
 *   - computes UVs from world position (walls: XY plane; roofs: XZ plane)
 *   - overlay-blends the per-vertex color (palette tint) with the texture
 *   - mixes by the manifest's textureStrength
 *
 * Mirrors LafayetteScene's per-building shader, but operates on merged
 * geometry per material → ~9 draw calls vs 1056. Mobile-friendly.
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { terrainExag } from '../utils/terrainShader'

function getLookId() {
  if (typeof window === 'undefined') return 'lafayette-square'
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : 'lafayette-square'
}
const LOOK_ID = getLookId()
const MANIFEST_URL = `/baked/${LOOK_ID}/buildings.json`
const TEXTURE_BASE = '/textures/buildings/'

// Cache textures across renders — they're heavy (~4MB each) and shared
// across all instances of a material.
const _texCache = new Map()
function loadTexture(id) {
  if (id === 'none' || !id) return null
  if (_texCache.has(id)) return _texCache.get(id)
  const tex = new THREE.TextureLoader().load(`${TEXTURE_BASE}${id}.jpg`)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  _texCache.set(id, tex)
  return tex
}

// Resolve which texture each group should use. Wall groups: their id
// (brick_red → brick_red.jpg). Roof groups: their id maps to slate /
// metal / 'none' for flat. Foundation: typically 'none'.
function textureIdFor(group, scene) {
  const physicsKey = group.kind === 'roof' ? `roof_${group.id}` : group.id
  const texFromPhysics = scene?.materialPhysics?.[physicsKey]?.texture
  if (texFromPhysics && texFromPhysics !== 'none') return texFromPhysics
  if (group.kind === 'wall') return group.id
  if (group.kind === 'roof') {
    if (group.id === 'slate') return 'slate'
    if (group.id === 'metal') return 'metal'
    return 'none' // flat
  }
  return 'none'
}

export default function BakedBuildings() {
  const [data, setData] = useState(null)
  const [scene, setScene] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = Date.now()
        const m = await fetch(MANIFEST_URL + '?t=' + t).then(r => r.json())
        const bin = await fetch('/baked/' + m.look + '/' + m.bin + '?t=' + t)
          .then(r => r.arrayBuffer())
        // scene.json is optional; failing fetch is fine (no overrides applied).
        const sc = await fetch('/baked/' + m.look + '/scene.json?t=' + t)
          .then(r => r.ok ? r.json() : null).catch(() => null)
        if (!cancelled) { setData({ manifest: m, bin }); setScene(sc) }
      } catch (e) {
        console.warn('[BakedBuildings] load failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const meshes = useMemo(() => {
    if (!data) return null
    const { manifest, bin } = data
    return manifest.groups.map(g => {
      const positions = new Float32Array(bin, g.vertexByteOffset, g.vertexCount * 3)
      const colors    = new Float32Array(bin, g.colorByteOffset,  g.vertexCount * 3)
      const uvs       = g.uvByteOffset != null
        ? new Float32Array(bin, g.uvByteOffset, g.vertexCount * 2)
        : null
      const indices   = new Uint32Array(bin,  g.indexByteOffset,  g.indexCount)
      // Per-vertex centroid elevation (raw, no exag). Each vertex of a
      // building shares the same value so the building rises rigidly with
      // terrain via `aCentroidY * uExag`. Bake schemas before this field
      // existed get a zero-fallback so old bundles still load (flat).
      const centroidYs = g.centroidYByteOffset != null
        ? new Float32Array(bin, g.centroidYByteOffset, g.vertexCount)
        : new Float32Array(g.vertexCount)
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3))
      geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors.slice(), 3))
      geom.setAttribute('aCentroidY', new THREE.Float32BufferAttribute(centroidYs.slice(), 1))
      if (uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.slice(), 2))
      geom.setIndex(new THREE.Uint32BufferAttribute(indices.slice(), 1))
      geom.computeVertexNormals()
      const texId = textureIdFor(g, scene)
      return { group: g, geometry: geom, texId }
    })
  }, [data, scene])

  if (!meshes) return null
  // Honor the Look's per-layer visibility (Designer toggles propagate here).
  if (scene?.layerVis?.building === false) return null

  return (
    <group>
      {meshes.map(({ group, geometry, texId }) => (
        <BuildingMesh
          key={group.kind + ':' + group.id}
          group={group}
          geometry={geometry}
          texId={texId}
        />
      ))}
    </group>
  )
}

function BuildingMesh({ group, geometry, texId }) {
  const tex = useMemo(() => loadTexture(texId), [texId])
  const isRoof = group.kind === 'roof'
  const texStrength = group.textureStrength ?? 0.4
  const texScale = group.textureScale ?? 1

  // Mirror LafayetteScene's exact composite formula:
  //   final = mix(roofTint, overlay(roofTint, slate), uTexStrength)
  // We do NOT set mat.map — that would let Three.js's <map_fragment>
  // pre-multiply the texture into diffuseColor before our custom code
  // runs, double-applying. Instead we sample uMap directly with a
  // world-position UV (matches cartograph), then overlay-blend with
  // base = vColor (which already encodes the per-building roofTint).
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: group.roughness ?? 0.9,
      metalness: group.metalness ?? 0,
      side: isRoof ? THREE.DoubleSide : THREE.FrontSide,
    })

    // Terrain displacement is unconditional (with or without a wall texture):
    // every building gets lifted by its baked centroid elevation × the shared
    // exag uniform, mirroring Stage's runtime patchTerrain on each Building.
    // Builds the same `vBldgWorldPos` varying the textured fragment path
    // also wants, so it's safe to layer the texture path on top.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uExag = terrainExag
      if (tex) {
        shader.uniforms.uMap         = { value: tex }
        shader.uniforms.uTexStrength = { value: texStrength }
        shader.uniforms.uTexScale    = { value: texScale }
        shader.uniforms.uIsRoof      = { value: isRoof ? 1.0 : 0.0 }
      }

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCentroidY;
         uniform float uExag;
         varying vec3 vBldgWorldPos;`
      )
      // Lift the WHOLE building rigidly: every vertex of a given building
      // carries the same aCentroidY (set at bake time = avg footprint
      // elevation, raw heightmap units), and uExag matches the ground.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y += aCentroidY * uExag;
         vBldgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )
      if (!tex) return

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uMap;
         uniform float uTexStrength;
         uniform float uTexScale;
         uniform float uIsRoof;
         varying vec3 vBldgWorldPos;`
      )
      // Replace color_fragment ENTIRELY (no #include re-expansion) so the
      // standard `diffuseColor *= vColor` doesn't run after our code and
      // wipe out the result. We multiply by vColor ourselves to mirror
      // cartograph's "base = roofTint" semantics.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
         vec3 vc = vec3(1.0);
         #ifdef USE_COLOR
           vc = vColor;
         #endif
         vec2 sampleUV;
         if (uIsRoof > 0.5) {
           sampleUV = vBldgWorldPos.xz * 0.2 / uTexScale;
         } else {
           sampleUV = vec2(vBldgWorldPos.x, vBldgWorldPos.y) * 0.25 / uTexScale;
         }
         vec3 texSample = texture2D(uMap, sampleUV).rgb;
         vec3 base = vc;
         vec3 overlay = mix(
           2.0 * base * texSample,
           1.0 - 2.0 * (1.0 - base) * (1.0 - texSample),
           step(0.5, base)
         );
         diffuseColor.rgb = mix(base, overlay, uTexStrength);`
      )
    }
    return mat
  }, [tex, isRoof, texStrength, texScale, group.roughness, group.metalness])

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={group.renderOrder}
      castShadow
      receiveShadow
    />
  )
}
