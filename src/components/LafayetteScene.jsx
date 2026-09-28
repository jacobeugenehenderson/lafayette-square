import { useState, useEffect } from 'react'
import { useStreetLabels } from '../lib/streetLabels.js'
import { useLabelPlacements } from '../lib/useLabelPlacements.js'
import StreetLabels from './StreetLabels.jsx'
import { ParkTitle } from './LafayettePark'

import { periodPedestalFor } from '../lib/foundationGeometry.js'
import SceneNeon from './SceneNeon.jsx'

import { useQuality } from '../lib/qualityProfile.js'
let _pdx = 0, _pdy = 0
const _onPointerDown = (e) => { _pdx = e.clientX; _pdy = e.clientY }
function isDrag(e) {
  const ce = e.nativeEvent || e
  const dx = ce.clientX - _pdx, dy = ce.clientY - _pdy
  return dx * dx + dy * dy > 36
}
import { lookOf } from '../lib/lookOf.js'

// Per-building overrides (roof shape, foundation height, colour) are applied by the BAKE
// (cartograph/bake-buildings.js) and reach the player through the slab. This live path used to
// re-apply them from one town's src/data/buildingOverrides.json, which bundled that file into
// every town (docs/briefs/BRIEF-slab-loading.md ③). It no longer reads them.

// ============ FOUNDATION & ROOF HELPERS ============


// Thin alias preserving local call sites; canonical definition lives in
// src/lib/foundationGeometry.js (shared with cartograph/bake-buildings.js).
export function getFoundationHeight(building) {
  return periodPedestalFor(building, null)
}


function classifyRoof(building) {
  const year = building.year_built
  const stories = building.stories || 1
  if (!year) return 'flat'
  if (stories >= 4) return 'flat'
  // 1-story with large footprint = commercial → flat
  if (stories === 1 && building.size[0] * building.size[2] > 500) return 'flat'
  if (year < 1900 && stories >= 2 && stories <= 3) return 'mansard'
  if (year < 1920 && stories >= 1 && stories <= 3) return 'hip'
  return 'flat'
}

function getLocalPts(building) {
  const fp = building.footprint
  if (!fp || fp.length < 3) return null
  return fp.map(([x, z]) => [x - building.position[0], z - building.position[2]])
}

function isConvex(pts) {
  const n = pts.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-10) continue
    if (sign === 0) sign = cross > 0 ? 1 : -1
    else if ((cross > 0 ? 1 : -1) !== sign) return false
  }
  return true
}

function signedArea2D(pts) {
  let area = 0
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return area / 2
}







export function getRoofPeakHeight(building) {
  const roofType = classifyRoof(building)
  if (roofType === 'flat') return 0
  if (roofType === 'mansard') {
    const localPts = getLocalPts(building)
    if (!localPts || !isConvex(localPts)) return 0
    return building.stories >= 3 ? 2.5 : 2.0
  }
  if (roofType === 'hip') {
    const localPts = getLocalPts(building)
    if (!localPts || localPts.length > 8) return 0
    return building.stories === 1 ? 1.8 : 1.5
  }
  return 0
}

// ============ FOUNDATIONS (single merged mesh) ============

export function useBrowseContentReady(shot, forceContentReady, delayMs) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (forceContentReady) { setReady(true); return }
    if (shot === 'hero') { setReady(false); return }
    if (!delayMs) { setReady(true); return }
    const t = setTimeout(() => setReady(true), delayMs)
    return () => clearTimeout(t)
  }, [shot, forceContentReady, delayMs])
  return ready
}

// The town's neon, street labels and park title. Its buildings are SlabBuildings' (the live per-building path was
// deleted with BRIEF-live-building-palette: the palette recolours the slab live, in every town).
function LafayetteScene({ town, lookId, bakeLastMs, materialColorsOverride, forceNeonOn, neonDensity, litIds, hiddenLayers, labelViewMode, forceContentReady } = {}) {
  // Layer toggles: { neon, labels, parkTitle } → hidden when true.
  const hide = hiddenLayers || {}

  // The browse-only street labels follow the shot the town is drawn in (<Town shot>), which
  // <Town> passes as labelViewMode. Authoring surfaces pass forceContentReady instead.
  if (!labelViewMode && !forceContentReady) throw new Error('[LafayetteScene] ⛔ needs labelViewMode (the shot) or forceContentReady')
  const labelGateMode = labelViewMode
  const quality = useQuality()

  // Register drag-guard listener with cleanup (avoids stacking on HMR)
  useEffect(() => {
    document.addEventListener('pointerdown', _onPointerDown)
    return () => document.removeEventListener('pointerdown', _onPointerDown)
  }, [])

  // Street labels are browse-only content. The phone profile staggers them in so the GPU compiles
  // in batches (the markers, the player's overlay, stagger the same way in LandmarkMarkers.jsx).
  const labelsReady = useBrowseContentReady(labelGateMode, forceContentReady, quality.staggerLabels ? 2000 : 0)

  // Street labels — shared with Cartograph's MapLayers via the same pipeline
  // (streetLabels.js polylines → useLabelPlacements layout → StreetLabels
  // renderer + zoom-LOD) so Designer / Preview / LS never drift. Doctrine
  // [[project_preview_equals_ls_literally]]. The old LS-local
  // getStreetLabelPlacements, its SAME_NAME_MIN_DIST / ANY_LABEL_MIN_DIST
  // collision skip, and the EAST_OF_TRUMAN_ALLOWED whitelist are retired — the
  // collision de-dup now lives in labelLayout.js, the hood gate in the bake.
  // ⭐ THE STYLE COMES WITH THEM. The player does not hydrate the Cartograph
  // store, so the layout style has to arrive from the slab or the labels lay
  // out at defaults — which is exactly what they were doing. See
  // useLabelPlacements.js.
  const { labels: streetLabels, style: labelStyle } = useStreetLabels(lookOf(lookId, 'LafayetteScene'), bakeLastMs)
  const labelPlacements = useLabelPlacements(streetLabels, labelStyle)

  return (
    <group>
      {/* Neon — single Path B mesh over all currently-open places, with
          scene.json.neon driving the uCore/uTube/uBleed uniforms. Gated by
          hide.neon so Preview's per-layer toggle can isolate it; production
          and Stage pass no `neon` key, so it stays visible. Visibility-gated
          (not unmounted) so the Preview toggle is a clean per-frame on/off
          with no rebuild — it's one merged mesh, resident as in production
          (Vernier Phase 1b). */}
      <group visible={!hide.neon}>
        <SceneNeon forceNeonOn={forceNeonOn} density={neonDensity} materialColors={materialColorsOverride} lookId={lookOf(lookId, 'LafayetteScene')} litIds={litIds} />
      </group>

      {/* Street labels — the shared StreetLabels group (same component the
          Designer mounts, so they never drift): repeat + size k × widthM +
          fit/abbrev from labelLayout.js, thinned by the runtime zoom-LOD
          (labelLod.js) as the camera pulls out / in. */}
      {labelsReady && !hide.labels && <StreetLabels placements={labelPlacements} y={0.08} />}

      {/* Park title — the "LAFAYETTE PARK" landmark label. Has its OWN
          `parkTitle` toggle in the Labels panel (separate from `labels` =
          street labels), so the operator shows/hides it independently. NOT
          gated by labelsReady: it's a landmark establishing label shown in
          every shot (incl. Hero), unlike the browse-only street labels. */}
      {!hide.parkTitle && <ParkTitle town={town} lookId={lookOf(lookId, 'LafayetteScene')} />}
    </group>
  )
}

export default LafayetteScene
export { isDrag }
