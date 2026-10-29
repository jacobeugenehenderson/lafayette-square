/**
 * BakedLamps — fetches `public/baked/<lookId>/lamps.json` and renders the
 * existing StreetLights component with that data. Shared by Stage and
 * Preview so both surfaces consume the canonical pipeline artifact (see
 * memory entry `feedback_preview_uses_production_pipeline`).
 *
 * Look resolution: the `lookId` it is GIVEN (lookOf throws without one — no URL fallback, no default town).
 *
 * Cache-bust resolution mirrors BakedGround per couplers plan §1:
 *   Stage's `bakeLastMs` prop wins (live ↻ refresh); production falls back
 *   to `scene.bakedAt` baked into scene.json (CC.7).
 */
import { useEffect, useState } from 'react'
import StreetLights from './StreetLights'
import { useSceneJson } from '../lib/useSceneJson.js'
import { slabFetch } from '../lib/slabUrl.js'
import { currentTerrainIdentity } from '../utils/terrainShader'
import { lampAnchorsVerdict } from '../lib/anchorGate.js'
import { lookOf } from '../lib/lookOf.js'


/**
 * @param {object} props
 * @param {string} [props.lookId]     — explicit Look id; falls back to URL param.
 * @param {number} [props.bakeLastMs] — Stage-authoring cache-bust override;
 *                                      production omits and uses scene.bakedAt.
 */
export default function BakedLamps({ lookId, bakeLastMs, lanternOverride, lampsOnOverride } = {}) {
  const resolvedLookId = lookOf(lookId, 'BakedLamps')
  const scene = useSceneJson(resolvedLookId, bakeLastMs)
  const reread = bakeLastMs ?? scene?.bakedAt ?? null

  const [data, setData] = useState(null)

  useEffect(() => {
    if (reread == null) return
    let cancelled = false
    slabFetch(resolvedLookId, 'lamps.json', undefined, reread)
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        // ⛔ THE LAMP ANCHORS BELONG TO THIS HEIGHTFIELD, EVERY LAMP CARRIES ONE, OR THE TOWN'S LAMPS ARE REFUSED (Boz ruled
        // (b), 2026-10-29): the verdict Publish refuses a slab by (src/lib/anchorGate.js), so this is the backstop. No field
        // fallback (it seated a lamp on the smooth field, not the drawn ground).
        if (j?.lamps?.length) {
          const v = lampAnchorsVerdict({ doc: j, terrainId: currentTerrainIdentity() })
          if (!v.ok) {
            console.error(`[BakedLamps] ⛔ "${resolvedLookId}": its lamp anchors are REFUSED — ${v.why}. No lamps are drawn. `
              + `▶ re-bake lamps (node cartograph/bake-lamps.js --scene=<scene> --look=${resolvedLookId}) and publish the slab`)
            j = null
          }
        }
        setData(j)
      })
      .catch(e => console.warn('[BakedLamps] load failed:', e))
    return () => { cancelled = true }
  }, [resolvedLookId, reread])

  if (!data?.lamps?.length) return null
  // Lamps on/off (Designer › Furniture › Lamps): Stage passes the LIVE switch; production reads it baked.
  if ((lampsOnOverride ?? scene?.layerVis?.lamp) === false) return null
  // Lantern channel (brightness, glow, colour): Stage live override > baked scene > the kit's day.
  const lantern = lanternOverride ?? scene?.lantern ?? null
  // The lamp model is the town's authored choice (design.json#lamps.model → scene.json#lampModel); absent ⇒ the
  // kit's standard post, which lampModels.js says aloud.
  return <StreetLights lamps={data.lamps} reach={data.reach} lantern={lantern} model={scene?.lampModel} town={resolvedLookId} />
}
