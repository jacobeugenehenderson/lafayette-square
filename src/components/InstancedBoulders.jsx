/**
 * InstancedBoulders.jsx — ONE DRAW CALL PER BOULDER SHAPE, N STONES EACH.
 *
 * ⛔ NOT A THIRD INSTANCING PATH. This is the same shape as `StreetLights.jsx`
 * and `InstancedTrees.jsx#SubmeshInstances`: an `<instancedMesh>` whose matrices
 * are filled imperatively in an effect, `frustumCulled={false}`, and an
 * `invalidate()` after every fill because the production Canvas runs
 * `frameloop="demand"` and an imperative matrix fill does not wake it. (That is
 * the 2026-06-28 "trees don't load until something nudges the camera" bug; it
 * costs a day each time it is rediscovered, so it is copied deliberately.)
 *
 * ⚠️ NOT WIRED INTO THE MAP, ON PURPOSE. Placement along the shore is
 * `BRIEF-boulder-revetment §8`'s bake-time job and is explicitly out of this
 * probe's bounds. The only consumer today is the harness at
 * `/boulders.html`. Harness first — never eye-gate an unready construction in
 * the operator's view.
 *
 * ⭐ PER-INSTANCE COLOUR IS FREE AND IT IS THE CHEAPEST VARIANCE LEVER WE HAVE.
 * `setColorAt` rides an instanced attribute in the SAME draw call, so a hundred
 * stones can be a hundred slightly different greys at no cost. Weathering, wet
 * stone at the waterline and lichen higher up are all reachable from here
 * without a second material.
 */

import { useRef, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * @param palette    BufferGeometry[] — from `boulderPalette()`. One draw call each.
 * @param instances  [{ p:[x,y,z], q:[x,y,z,w], s:[sx,sy,sz], i:paletteIndex, c:[r,g,b] }]
 * @param material   a shared THREE.Material (the caller owns it)
 */
export default function InstancedBoulders({ palette, instances, material, castShadow = true, receiveShadow = true }) {
  // Bucket by palette index once. ⛔ Doing this per frame would be the whole
  // point of instancing thrown away.
  const buckets = useMemo(() => {
    const b = palette.map(() => [])
    for (const inst of instances) {
      const k = inst.i
      // ⛔ Loud, not clamped. A palette index out of range means the caller's
      // palette and its layout disagree, and silently drawing stone #0 instead
      // would hide that forever.
      if (!(k >= 0 && k < palette.length)) throw new Error(`InstancedBoulders: instance references palette #${k} of ${palette.length}`)
      b[k].push(inst)
    }
    return b
  }, [palette, instances])

  return palette.map((geo, k) => (
    <Bucket key={k} geometry={geo} material={material} items={buckets[k]} castShadow={castShadow} receiveShadow={receiveShadow} />
  ))
}

function Bucket({ geometry, material, items, castShadow, receiveShadow }) {
  const ref = useRef(null)
  const invalidate = useThree(s => s.invalidate)

  useEffect(() => {
    const im = ref.current
    if (!im || !items.length) return
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      p.set(it.p[0], it.p[1], it.p[2])
      q.set(it.q[0], it.q[1], it.q[2], it.q[3])
      s.set(it.s[0], it.s[1], it.s[2])
      im.setMatrixAt(i, m.compose(p, q, s))
      // Non-uniform instance scale is SAFE here and it was checked rather than
      // assumed: three's `defaultnormal_vertex` divides the instance basis by the
      // squared column lengths, which is the inverse-transpose for a
      // rotation×scale. Shear would break it; we never compose shear.
      if (it.c) im.setColorAt(i, c.setRGB(it.c[0], it.c[1], it.c[2]))
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
    invalidate()
  }, [items, geometry, invalidate])

  if (!items.length) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  )
}
