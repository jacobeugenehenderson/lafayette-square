import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { INSTANCE } from '../instance.js'
import { IS_MOBILE } from '../lib/isMobile.js'
import CelestialBodies from './CelestialBodies'
import CloudDome from './CloudDome'
import WeatherEffects from './WeatherEffects'
import WeatherPoller from './WeatherPoller'
import AtmosphereDirectiveDriver from './AtmosphereDirectiveDriver'
import { ExposureTicker } from './PostProcessing'
import { TimeTicker, SkyStateTicker } from './Scene'
import { SwayDriver } from './InstancedTrees.jsx'
import { useTreeAtlas, stampTreeVertexAttrs } from './treeAtlasMaterial'
import { useCanaryTree } from '../lib/canaryTree.js'

/**
 * TREE DIORAMA — one specimen, fully dressed, under the neighbourhood's real
 * sky, in ONE Canvas.
 *
 * ⭐ WHY ONE CANVAS AND NOT TWO FRAMES. The sky is not a backdrop behind the
 * tree, it is the tree's LIGHT. `CelestialBodies` carries the scene's ambient,
 * hemisphere and directional lights and drives them off the same sky state that
 * paints the dome — so a tree mounted beside it is lit by the sun that is
 * actually in the picture, at the hour `ward-time` says it is. Stack two frames
 * instead and you get a tree lit by nothing, in front of a sky it has no
 * relationship to. ⛔ Do not split this.
 *
 * ⭐ EVERYTHING HERE IS THE PRODUCTION COMPONENT. The sky pieces are the ones
 * `Scene` mounts; the sway is `InstancedTrees#SwayDriver`, driven off the live
 * atmosphere directive; the material is the shared per-Look tree atlas the map's
 * trees use. Nothing below is a diorama-only copy — that is the whole claim this
 * surface makes about how the product is built, so it had better be true.
 *
 * ⛔ THE BAKED PATH, NOT THE SOURCE POOL. `public/trees/` is the Arborist's
 * authoring pool and is gitignored on purpose (`.gitignore:230` — "never read by
 * runtime"); a specimen loaded from there can never deploy. The bake at
 * `public/baked/<look>/trees/<species>/` is what ships, and its material is
 * literally named `TreeAtlas` and carries no textures of its own — the runtime
 * binds the shared atlas to it. That is why this mounts `atlas.treeMaterial`
 * rather than dressing anything by hand.
 *
 * Two mounts, one component: `?embed=tree` (framed, chrome-only) and the
 * Arborist's full-monte view. Until this existed there was no view anywhere in
 * the product that showed a FINISHED tree, which is how a publish contract that
 * paints leaves with bark got shipped without anyone noticing.
 */

// The specimen is a knob, not a constant — Jacob asked that swapping it stay
// easy. URL wins (so a page can frame a different tree without a rebuild), then
// props, then these.
const DEFAULT_SPECIES = 'linden_american'
const DEFAULT_LOD = '0'          // one hero specimen can afford the full mesh
const DEFAULT_VARIANT = '1'

function readParam(name) {
  try { return new URLSearchParams(window.location.search).get(name) } catch { return null }
}

/**
 * Specimen — the baked GLB, merged and stamped exactly the way the runtime
 * merges it, wearing the shared atlas material.
 *
 * ⚠ The per-vertex attributes are NOT optional decoration: `aBark` gates the
 * fragment shader's bark retint, `aWindTier` drives the multi-scale sway damping
 * (trunk barely moves, leaf tips rustle), `aTreeHeightNorm` ramps the deformer.
 * Without them the shared shader still compiles and the tree renders WRONG —
 * a silent substitution, so `stampTreeVertexAttrs` (the same helper the Salon
 * preview uses) does the stamping rather than a local copy that could drift.
 */
function Specimen({ url, material, onMeasured }) {
  const { scene } = useGLTF(url)

  // ⚠ Returns a LIST, never a single geometry. The baked GLB is several
  // primitives (branches / caps / leaves), and merging them is an optimisation,
  // not a requirement — the runtime merges to collapse 616 draws down to one,
  // which a single specimen does not care about. ⛔ An earlier cut of this
  // returned `null` when the merge was rejected, so a tree whose primitives
  // carry divergent attribute sets rendered as NOTHING against a working sky:
  // a plausible-looking success, which is the one outcome worth failing loudly
  // to avoid. Merge if we can, draw the primitives if we cannot, draw nothing
  // only when there is genuinely nothing.
  const geometries = useMemo(() => {
    scene.updateMatrixWorld(true)
    const collected = []
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      // Bake the primitive's world transform in, so everything lands in the
      // tree's own frame — matches InstancedTrees#meshes.
      const g = o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      stampTreeVertexAttrs(g, {}, o)
      collected.push(g)
    })
    if (!collected.length) return []

    // Same guards the runtime merge uses: divergent attribute sets or an
    // interleaved attribute make mergeGeometries fail, noisily and per-vertex.
    const keys = Object.keys(collected[0].attributes).sort().join('|')
    const sameKeys = collected.every(g => Object.keys(g.attributes).sort().join('|') === keys)
    const noInterleaved = collected.every(g =>
      Object.values(g.attributes).every(a => !a.isInterleavedBufferAttribute)
    )
    if (sameKeys && noInterleaved) {
      const merged = mergeGeometries(collected, false)
      if (merged) return [merged]
    }
    return collected
  }, [scene])

  // Report the real height up so the camera frames THIS tree rather than a
  // guessed one — a 31 m linden and a 6 m ornamental want different framings.
  useEffect(() => {
    if (!geometries.length) return
    const box = new THREE.Box3()
    let tris = 0
    for (const g of geometries) {
      g.computeBoundingBox()
      if (g.boundingBox) box.union(g.boundingBox)
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    }
    // One line, same shape as InstancedTrees' roster log: what actually mounted.
    // A specimen that loads but draws nothing is the exact failure this surface
    // exists to catch, so it has to be legible without a debugger.
    console.log(
      `[TreeDiorama] ${url.split('/').slice(-2).join('/')} ` +
      `parts=${geometries.length}${geometries.length === 1 ? ' (merged)' : ' (unmerged — divergent attrs)'} ` +
      `tris=${Math.round(tris).toLocaleString()} height=${(box.max.y - box.min.y).toFixed(1)}m ` +
      `attrs=${Object.keys(geometries[0].attributes).join(',')}`
    )
    if (onMeasured) onMeasured({ height: box.max.y - box.min.y, minY: box.min.y })
  }, [geometries, onMeasured, url])

  if (!geometries.length || !material) return null
  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} frustumCulled={false} />
      ))}
    </group>
  )
}

/**
 * DioramaCamera — frames the measured specimen head-to-foot.
 *
 * The sky components draw at a radius of hundreds of metres, so `far` stays
 * wide; only the camera's placement is tree-scaled. The eye sits a little below
 * mid-canopy, so the tree is seen slightly from beneath and reads as STANDING
 * rather than as a specimen on a turntable.
 */
function DioramaCamera({ height }) {
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  useEffect(() => {
    if (!height) return
    // Fit the WHOLE tree, head to foot, with real headroom. ⚠ The fit is taken
    // against whichever axis is tighter: `fov` is VERTICAL, so a wide short
    // frame (an embed strip is exactly that) runs out of HORIZONTAL room first
    // and a vertical-only fit silently crops the canopy — which it did.
    const aimY = height * 0.5
    const vFov = (camera.fov * Math.PI) / 180
    const aspect = size.width && size.height ? size.width / size.height : 1
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const halfSpan = height * 0.62                    // ~12% air above and below
    const distance = Math.max(
      halfSpan / Math.tan(vFov / 2),
      (height * 0.55) / Math.tan(hFov / 2),           // canopy spread ≈ its height
    )
    // Eye a little below mid-canopy: a tree looked at slightly from beneath
    // reads as standing, where a level view reads as a specimen on a turntable.
    camera.position.set(distance * 0.34, height * 0.42, distance * 0.94)
    camera.lookAt(0, aimY, 0)
    camera.updateProjectionMatrix()
  }, [camera, height, size.width, size.height])
  return null
}

/**
 * @param followCanary — take the specimen from THE CANARY, the one tree the
 *   operator has pointed at (`lib/canaryTree.js`). ⭐ On for the Arborist's full
 *   monte, so picking a tree in the Grove and looking at it finished is ONE
 *   gesture rather than two pickers that can disagree. ⛔ OFF for `?embed=tree`:
 *   the canary is per-operator browser state, and a published page that quietly
 *   changed because someone clicked something in this browser would be a
 *   per-viewer surprise with no way to explain itself. An explicit `?species=`
 *   outranks the canary either way.
 */
export default function TreeDiorama({ species, lod, variant, lookId, followCanary = false, transparent } = {}) {
  const canary = useCanaryTree()
  // ⭐ ALPHA MODE — the tree with the sky's LIGHT but not the sky's PIXELS.
  // A host page that already draws its own sky (the site's band, with its own
  // sun and moon on the same clock) must not receive a second one painted over
  // it. So the canvas clears to alpha 0 and `CelestialBodies` runs at
  // debugLevel 1 — "lights only, no sky/moon/orbs" — which keeps the ambient,
  // hemisphere and directional sun that make the leaves bright at noon and dark
  // at midnight, and drops every mesh that would paint a background.
  // ⛔ This is NOT a capture and NOT a cutout: the alpha is the frame buffer's
  // own, per pixel, through the leaf cards' cutouts, refreshed every frame.
  // ⭐ So the page shows through the canopy, and the canopy's luminance is the
  // scene's, at the hour the page asked for.
  const alpha = transparent ?? (readParam('alpha') === '1')
  const pick   = followCanary ? canary : null
  const look = lookId || pick?.lookId || INSTANCE.lookId
  const sp  = readParam('species') || species || pick?.species || DEFAULT_SPECIES
  const ld  = readParam('lod')     || lod     || DEFAULT_LOD
  const vr  = readParam('variant') || variant ||
              (pick?.variantId != null ? String(pick.variantId) : DEFAULT_VARIANT)

  const atlas = useTreeAtlas(look)
  const [measured, setMeasured] = useState(null)

  const url = `${import.meta.env.BASE_URL}baked/${look}/trees/${sp}/skeleton-${vr}-lod${ld}.glb`

  // ⛔ NO FALLBACK. If the atlas fails to build there is no second dressing to
  // fall back to — an undressed specimen paints its leaves with bark and looks
  // merely wrong rather than broken, which is the worst outcome. Say so, loudly,
  // and draw the sky alone.
  useEffect(() => {
    if (atlas.status === 'error') {
      console.error(
        `[TreeDiorama] tree atlas FAILED to build for look "${look}" — the specimen is NOT drawn. ` +
        `Without it the GLB's TreeAtlas material carries no textures at all.`, atlas.error
      )
    }
  }, [atlas.status, atlas.error, look])

  return (
    <Canvas
      frameloop="always"
      camera={{ position: [0, 12, 40], fov: 45, near: 0.5, far: 60000 }}
      gl={{
        alpha: alpha,
        antialias: !IS_MOBILE,
        logarithmicDepthBuffer: !IS_MOBILE,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, alpha ? 0 : 1)}
      dpr={IS_MOBILE ? 1 : [1, 1.5]}
      shadows={false}
    >
      {/* The clock, and the weather it drives — the same seam every other embed
          uses, so an embedding page's slider moves this sky, this light and
          this wind together. */}
      <TimeTicker />
      <SkyStateTicker />
      <WeatherPoller />
      <AtmosphereDirectiveDriver lookId={look} />
      {/* ⭐ THE LUMINANCE OF THE HOUR, and without it the tree is lit like noon
          at 3am. The per-Look EXPOSURE envelope is authored across the day and
          normally applied by the PostProcessing chain, which a bare Canvas like
          this one does not run — `ExposureTicker` exists for exactly that case.
          ⚠ Missing it does NOT look broken: the sky still goes dark (it paints
          its own night colours) while the tree stays daylit, so the scene reads
          as a lit object on a night backdrop and the eye blames the tree.
          Measured 2026-08-23: at 03:00 the canopy was full daylight green with
          stars behind it. */}
      <ExposureTicker lookId={look} />

      {/* The sky. CelestialBodies carries the lights, so this is also the
          diorama's entire lighting rig. */}
      {/* debugLevel 1 = lights only. In alpha mode the host page owns the sky;
          we still take our light from it. */}
      <CelestialBodies debugLevel={alpha ? 1 : 0} />
      {!alpha && <CloudDome />}
      <WeatherEffects />

      {/* The canopy moves off the same wind that moves the clouds. */}
      <SwayDriver />

      <DioramaCamera height={measured?.height} />
      {atlas.status === 'ready' && (
        <Suspense fallback={null}>
          <Specimen url={url} material={atlas.treeMaterial} onMeasured={setMeasured} />
        </Suspense>
      )}
    </Canvas>
  )
}
