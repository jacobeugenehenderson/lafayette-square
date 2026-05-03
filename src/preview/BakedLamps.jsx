/**
 * BakedLamps — fetches `public/baked/<look>/lamps.json` and renders the
 * existing StreetLights component with that data. Keeps Preview on the
 * bake-only path (no raw `street_lamps.json` import at runtime).
 */
import { useEffect, useState } from 'react'
import StreetLights from '../components/StreetLights'

function getLookId() {
  if (typeof window === 'undefined') return 'lafayette-square'
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : 'lafayette-square'
}

export default function BakedLamps() {
  const [data, setData] = useState(null)
  const [scene, setScene] = useState(null)
  useEffect(() => {
    let cancelled = false
    const t = Date.now()
    const look = getLookId()
    fetch(`/baked/${look}/lamps.json?t=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setData(j) })
      .catch(e => console.warn('[BakedLamps] load failed:', e))
    fetch(`/baked/${look}/scene.json?t=${t}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setScene(j) })
      .catch(() => { /* scene.json optional */ })
    return () => { cancelled = true }
  }, [])
  if (!data?.lamps?.length) return null
  // Honor the Look's per-layer visibility (Designer toggles propagate here).
  if (scene?.layerVis?.lamp === false) return null
  return <StreetLights lamps={data.lamps} />
}
