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
export default function BakedLamps({ lookId, bakeLastMs } = {}) {
  const resolvedLookId = resolveLookId(lookId)
  const scene = useSceneJson(resolvedLookId, bakeLastMs)
  const cacheBust = bakeLastMs ?? scene?.bakedAt ?? null

  const [data, setData] = useState(null)

  useEffect(() => {
    if (cacheBust == null) return
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}baked/${resolvedLookId}/lamps.json?t=${cacheBust}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setData(j) })
      .catch(e => console.warn('[BakedLamps] load failed:', e))
    return () => { cancelled = true }
  }, [resolvedLookId, cacheBust])

  if (!data?.lamps?.length) return null
  if (scene?.layerVis?.lamp === false) return null
  return <StreetLights lamps={data.lamps} lookId={resolvedLookId} bakeLastMs={bakeLastMs} />
}
