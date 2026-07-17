// DesignerTrees.jsx — the 2D Designer's tree layer, for EVERY scene.
//
// Reads the baked slab (baked/<scene>/trees.json) — the SAME source of truth the
// 3D InstancedTrees renders — so the flat map matches the shot and the bake by
// construction (no Designer-reads-X / bake-reads-Y split; the old LS-only path
// imported a stale park census). Each tree is a flat dot:
//   • RADIUS from `dbh`   — trunk-width proxy for size/age (measured where the
//                            municipal inventory has it, empirically sampled for
//                            OSM/derived at bake time).
//   • COLOR  from `source` — provenance: measured inventory vs OSM vs synthetic.
// One instanced mesh, so thousands of dots are cheap.
//
// DATA-GATED like every other layer: when the panel's Trees toggle is off, the
// slab isn't fetched and nothing is built (not a render-skip). Designer-only —
// in Stage the 3D InstancedTrees owns the trees.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const BASE_URL = import.meta.env.BASE_URL || '/'

// Source → interface-color TOKEN. The color VALUES live in the master CSS
// (src/cartograph/cartograph.css `--carto-tree-*`) — one place to re-theme
// provenance. This map is only the source→token wiring, not the colors.
const SOURCE_VARS = {
  'city-inventory': '--carto-tree-real',
  'forest-park':    '--carto-tree-real',
  'park':           '--carto-tree-park',
  'osm':            '--carto-tree-osm',
  'derived':        '--carto-tree-derived',
}
const DEFAULT_VAR = '--carto-tree-unknown'
const FALLBACK_HEX = '#7aa0c0'   // only if the CSS token can't be read

// Resolve the provenance palette from the CSS tokens (once per build).
function makePaletteResolver() {
  const el = (typeof document !== 'undefined' && document.querySelector('.cartograph')) || null
  const cs = el ? getComputedStyle(el) : null
  const cache = new Map()
  return (source) => {
    const v = SOURCE_VARS[source] || DEFAULT_VAR
    let col = cache.get(v)
    if (!col) {
      const hex = (cs && cs.getPropertyValue(v) || '').trim()
      col = new THREE.Color(hex || FALLBACK_HEX)
      cache.set(v, col)
    }
    return col
  }
}

// Dot radius (world m) from DBH — a trunk-width proxy scaled UP for legibility
// (a real ~0.3 m trunk is sub-pixel on a 2 km map). Small enough not to fill the
// map into a sea of circles; big trees read bigger.
const DOT_R_MIN = 0.7     // world m near DBH 0
const DOT_R_SPAN = 2.6    // added by the time DBH reaches DBH_REF
const DBH_REF = 40        // DBH (in) at which the dot reaches full size
const DBH_DEFAULT = 8     // assumed when a tree carries no DBH
const TREE_DOT_Y = 1.0    // above the flat LU/building fills; drawn on top
const dotRadius = (dbh) => {
  const d = Number.isFinite(dbh) ? dbh : DBH_DEFAULT
  return DOT_R_MIN + (Math.min(d, DBH_REF) / DBH_REF) * DOT_R_SPAN
}

// Flat unit disc in the XZ plane — instances only translate + scale.
const DISC = new THREE.CircleGeometry(1, 12)
DISC.rotateX(-Math.PI / 2)

export default function DesignerTrees({ scene, hiddenLayers, bakeLastMs }) {
  const hidden = !!(hiddenLayers && hiddenLayers.tree)
  const [instances, setInstances] = useState(null)
  const meshRef = useRef()

  // Fetch the baked slab (cache-busted on re-bake). The DATA gate: while hidden we
  // neither fetch nor build — the layer is simply absent, like the water layer.
  useEffect(() => {
    if (hidden || !scene) { setInstances(null); return }
    let cancelled = false
    const bust = bakeLastMs ? `?t=${bakeLastMs}` : ''
    fetch(`${BASE_URL}baked/${scene}/trees.json${bust}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setInstances(Array.isArray(j?.instances) ? j.instances : null) })
      .catch(() => { if (!cancelled) setInstances(null) })
    return () => { cancelled = true }
  }, [scene, bakeLastMs, hidden])

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false,
  }), [])
  useEffect(() => () => mat.dispose(), [mat])

  // Per-instance matrix (world position + DBH scale) and color (source token).
  // Layout effect so the buffer is filled BEFORE paint — no one-frame flash of
  // every dot stacked at the origin.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !instances) return
    const colorFor = makePaletteResolver()
    const m = new THREE.Matrix4()
    for (let i = 0; i < instances.length; i++) {
      const t = instances[i]
      const r = dotRadius(t.dbh)
      m.makeScale(r, 1, r)
      m.setPosition(t.x, TREE_DOT_Y, t.z)
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, colorFor(t.source))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  if (hidden || !instances || !instances.length) return null
  return (
    <instancedMesh
      ref={meshRef}
      key={instances.length}   // rebuild the buffer when the placement set changes
      args={[DISC, mat, instances.length]}
      renderOrder={20}
      frustumCulled={false}
    />
  )
}
