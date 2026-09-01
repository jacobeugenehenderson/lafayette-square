// DesignerLamps.jsx — the 2D Designer's lamp-placement layer, for EVERY scene.
//
// Reads the baked slab (baked/<scene>/lamps.json) — the SAME source of truth the
// 3D BakedLamps renders — so the flat map matches the shot and the bake by
// construction. It replaces MapLayers' OLD hardwired path, which imported
// `src/data/street_lamps.json` (production Lafayette Square's 80 park lamps) by
// literal name with an empty-dep useMemo, so it drew PROD's lamps in PROD's frame
// for every scene: a poured scene's own lamps never appeared, and against a
// re-derived frame the prod dots landed wrong / off-view (the "toggle lamps in
// staging → nothing" bug). This is the lamp twin of DesignerTrees; both retire a
// src/data name-import in favour of the per-scene served slab (EXTENT-DESIGN §2.1).
//
// Each lamp is a flat dot at its world (x, z). DATA-GATED like every other layer:
// when the panel's Lamps toggle is off, the slab isn't fetched and nothing is
// built. Designer-only — in Stage the 3D BakedLamps owns the real lamp props.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { ASSET_BASE } from '../lib/bakedUrl.js'

const FALLBACK_HEX = '#F2D67A'   // only if the CSS token can't be read
// Resolve the lamp dot colour from the master CSS token (--carto-lamp), the same
// way DesignerTrees resolves provenance colours — one place to re-theme.
function resolveLampColor() {
  const el = (typeof document !== 'undefined' && document.querySelector('.cartograph')) || null
  const hex = el ? getComputedStyle(el).getPropertyValue('--carto-lamp').trim() : ''
  return new THREE.Color(hex || FALLBACK_HEX)
}

const LAMP_DOT_R = 1.2    // world m — matches the old MapLayers lamp marker
const LAMP_DOT_Y = 2.0    // above the LU/building fills; drawn on top

// Flat unit disc in the XZ plane — instances only translate.
const DISC = new THREE.CircleGeometry(LAMP_DOT_R, 16)
DISC.rotateX(-Math.PI / 2)

export default function DesignerLamps({ scene, hiddenLayers, bakeLastMs }) {
  const hidden = !!(hiddenLayers && hiddenLayers.lamp)
  const [lamps, setLamps] = useState(null)
  const meshRef = useRef()

  // Fetch the baked slab (cache-busted on re-bake). DATA gate: while hidden we
  // neither fetch nor build — the layer is simply absent.
  useEffect(() => {
    if (hidden || !scene) { setLamps(null); return }
    let cancelled = false
    const bust = bakeLastMs ? `?t=${bakeLastMs}` : ''
    fetch(`${ASSET_BASE}baked/${scene}/lamps.json${bust}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setLamps(Array.isArray(j?.lamps) ? j.lamps : null) })
      .catch(() => { if (!cancelled) setLamps(null) })
    return () => { cancelled = true }
  }, [scene, bakeLastMs, hidden])

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: resolveLampColor(), toneMapped: false, depthTest: false, depthWrite: false,
  }), [])
  useEffect(() => () => mat.dispose(), [mat])

  // Per-instance position. Layout effect so the buffer is filled BEFORE paint —
  // no one-frame flash of every dot stacked at the origin.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !lamps) return
    const m = new THREE.Matrix4()
    for (let i = 0; i < lamps.length; i++) {
      m.makeTranslation(lamps[i].x, LAMP_DOT_Y, lamps[i].z)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [lamps])

  if (hidden || !lamps || !lamps.length) return null
  return (
    <instancedMesh
      ref={meshRef}
      key={lamps.length}   // rebuild the buffer when the placement set changes
      args={[DISC, mat, lamps.length]}
      renderOrder={11.5}   // matches the old MapLayers lamp renderOrder
      frustumCulled={false}
    />
  )
}
