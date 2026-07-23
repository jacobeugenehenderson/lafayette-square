import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import SceneLabel from './SceneLabel.jsx'
import { prepareLabelLod, assignLabelLod, metersPerPixel, SCREEN_LABEL_SPACING_PX } from '../lib/labelLod.js'

// Shared street-label group. Mounts every placement from the shared layout ONCE
// (so Troika never rebuilds on zoom) and runs the runtime zoom-LOD each frame
// (labelLod.js), toggling `.visible` so density thins as the camera pulls out and
// fills in as it pulls closer, ≥1 per street in view. Used by BOTH MapLayers
// (Designer, ortho) and LafayetteScene (player, perspective) so they never drift
// ([[project_preview_equals_ls_literally]]). `.visible` is toggled imperatively
// on the wrapping group — no React re-render, no geometry churn.
export default function StreetLabels({ placements, y = 0 }) {
  const camera = useThree(s => s.camera)
  const heightPx = useThree(s => s.size.height)
  const refs = useRef([])

  // Only finite placements; indices here are the LOD's index space.
  const items = useMemo(
    () => (placements || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.angle)),
    [placements],
  )
  const groups = useMemo(() => prepareLabelLod(items), [items])

  useFrame(() => {
    const targetSpacing = SCREEN_LABEL_SPACING_PX * metersPerPixel(camera, heightPx)
    assignLabelLod(items, groups, targetSpacing, (i, vis) => {
      const g = refs.current[i]
      if (g && g.visible !== vis) g.visible = vis
    })
  })

  return items.map((p, i) => (
    <group key={i} ref={el => (refs.current[i] = el)}>
      <SceneLabel
        text={p.name}
        fontSize={p.fontSize}
        position={[p.x, y, p.z]}
        rotation={[-Math.PI / 2, 0, -p.angle]}
      />
    </group>
  ))
}
