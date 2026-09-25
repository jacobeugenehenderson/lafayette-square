/**
 * BakedLamps — fetches `public/baked/<lookId>/lamps.json` and renders the
 * existing StreetLights component with that data. Shared by Stage and
 * Preview so both surfaces consume the canonical pipeline artifact (see
 * memory entry `feedback_preview_uses_production_pipeline`).
 *
 * Look resolution mirrors BakedGround:
 *   1. explicit `lookId` prop (cartograph passes activeLookId)
 *   2. URL `?look=` param (preview standalone behavior)
 *   3. 'lafayette-square' final fallback
 *
 * Cache-bust resolution mirrors BakedGround per couplers plan §1:
 *   Stage's `bakeLastMs` prop wins (live ↻ refresh); production falls back
 *   to `scene.bakedAt` baked into scene.json (CC.7).
 */
import { useEffect, useState } from 'react'
import StreetLights from './StreetLights'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'
import { currentTerrainIdentity } from '../utils/terrainShader'

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

/**
 * @param {object} props
 * @param {string} [props.lookId]     — explicit Look id; falls back to URL param.
 * @param {number} [props.bakeLastMs] — Stage-authoring cache-bust override;
 *                                      production omits and uses scene.bakedAt.
 */
export default function BakedLamps({ lookId, bakeLastMs, lanternOverride } = {}) {
  const resolvedLookId = resolveLookId(lookId)
  const scene = useSceneJson(resolvedLookId, bakeLastMs)
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null

  const [data, setData] = useState(null)

  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    fetch(`${ASSET_BASE}baked/${resolvedLookId}/lamps.json?t=${cacheBust}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        // ⛔ Lamp anchors must have been sampled from THIS heightfield (same guard as the trees).
        if (j?.lamps?.some(l => typeof l.groundRaw === 'number')) {
          const live = currentTerrainIdentity()
          if (!j.terrain) {
            console.warn(`[BakedLamps] lamps.json for "${resolvedLookId}" carries no terrain identity (baked before the guard) — `
              + `cannot prove its anchors match this heightfield (${live}). Using them. ▶ re-bake lamps`)
          } else if (j.terrain.key !== live) {
            console.error(`[BakedLamps] ⛔ lamps.json for "${resolvedLookId}" was anchored on a DIFFERENT heightfield `
              + `(terrain ${j.terrain.key}, baseElev ${j.terrain.baseElev}) than this slab's (${live}). `
              + `Anchors REFUSED — lamps fall back to the smooth terrain field. ▶ re-bake lamps (node cartograph/bake-lamps.js --scene=<scene> --look=${resolvedLookId})`)
            j = { ...j, lamps: j.lamps.map(({ groundRaw, ...l }) => l) }
          }
        }
        setData(j)
      })
      .catch(e => console.warn('[BakedLamps] load failed:', e))
    return () => { cancelled = true }
  }, [resolvedLookId, cacheBust])

  if (!data?.lamps?.length) return null
  if (scene?.layerVis?.lamp === false) return null
  // Lantern channel: Stage live override > baked scene > flat default.
  const lantern = lanternOverride ?? scene?.lantern ?? null
  return <StreetLights lamps={data.lamps} lookId={resolvedLookId} bakeLastMs={bakeLastMs} lantern={lantern} />
}
