/**
 * DrawnAnchor — an invisible anchor that marks a startup boundary (src/lib/startupMarks.js) on the first draw of its group.
 */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { hasPerf, isMarked, markStartup } from '../lib/startupMarks.js'

/**
 * Marks `id` on the first draw of any mesh in the group it sits in. Put it as a child of the piece's group.
 * Until then, each frame it hooks every mesh with geometry it has not hooked yet (a piece's meshes arrive over several
 * frames, and a culled one never draws); the first hooked draw marks, and every hook is taken off again.
 */
export default function DrawnAnchor({ id }) {
  const ref = useRef(null)
  const hooked = useRef(new Map())   // mesh → the onAfterRender it had (own property, or undefined for three's default)
  const release = () => {
    for (const [mesh, own] of hooked.current) {
      if (own) mesh.onAfterRender = own
      else delete mesh.onAfterRender
    }
    hooked.current.clear()
  }
  useEffect(() => release, [])
  useFrame(() => {
    if (!hasPerf || isMarked(id)) { if (hooked.current.size) release(); return }
    const root = ref.current?.parent
    if (!root) return
    root.traverse((o) => {
      if (o === ref.current || !o.isMesh || hooked.current.has(o) || !o.geometry?.attributes?.position?.count) return
      if (o.isInstancedMesh && !o.count) return
      const own = Object.prototype.hasOwnProperty.call(o, 'onAfterRender') ? o.onAfterRender : undefined
      const base = o.onAfterRender
      hooked.current.set(o, own)
      o.onAfterRender = function (...a) {
        base.apply(this, a)
        markStartup(id)
      }
    })
  })
  return <group ref={ref} />
}
