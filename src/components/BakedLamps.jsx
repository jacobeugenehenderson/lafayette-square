/**
 * BakedLamps — fetches `public/baked/<look>/lamps.json` and renders the
 * existing StreetLights component with that data. Shared by Stage and
 * Preview so both surfaces consume the canonical pipeline artifact (see
 * memory entry `feedback_preview_uses_production_pipeline`).
 *
 * Look resolution mirrors InstancedTrees:
 *   1. explicit `look` prop (Preview reads URL ?look=, Stage passes
 *      activeLookId)
 *   2. cartograph store `activeLookId` fallback
 *   3. 'lafayette-square' final fallback
 *
 * Re-fetches on `look` change AND on store `bakeLastMs` change, so a
 * fresh bake from Stage's "↻" button propagates without a hard reload.
 */
import { useEffect, useState } from 'react'
import StreetLights from './StreetLights'
import useCartographStore from '../cartograph/stores/useCartographStore.js'

function getUrlLook() {
  if (typeof window === 'undefined') return null
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function BakedLamps({ look: lookProp } = {}) {
  const storeLook = useCartographStore(s => s.activeLookId)
  const bakeLastMs = useCartographStore(s => s.bakeLastMs)
  const look = lookProp || storeLook || getUrlLook() || 'lafayette-square'

  const [data, setData] = useState(null)
  const [scene, setScene] = useState(null)

  useEffect(() => {
    let cancelled = false
    const t = bakeLastMs || Date.now()
    fetch(`${import.meta.env.BASE_URL}baked/${look}/lamps.json?t=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setData(j) })
      .catch(e => console.warn('[BakedLamps] load failed:', e))
    fetch(`${import.meta.env.BASE_URL}baked/${look}/scene.json?t=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setScene(j) })
      .catch(() => { /* scene.json optional */ })
    return () => { cancelled = true }
  }, [look, bakeLastMs])

  if (!data?.lamps?.length) return null
  if (scene?.layerVis?.lamp === false) return null
  return <StreetLights lamps={data.lamps} />
}
