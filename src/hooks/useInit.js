import { getInit } from '../lib/api'
import { getDeviceHash } from '../lib/device'
import useListings from './useListings'
import useHandle from './useHandle'
import useEvents from './useEvents'
import staticData from '../data/landmarks.json'

let _ran = false

/**
 * Single init call on app boot — fetches listings + events + handle
 * from the batch GAS endpoint. Hydrates all three stores.
 * Safe to call multiple times (no-ops after first).
 */
export async function runInit() {
  if (_ran) return
  _ran = true

  try {
    const dh = await getDeviceHash()
    const res = await getInit(dh)
    const data = res.data || {}

    // Hydrate listings store
    const apiListings = Array.isArray(data.listings) ? data.listings : []
    if (apiListings.length > 0) {
      const staticLookup = new Map()
      staticData.landmarks.forEach(lm => staticLookup.set(lm.id, lm))

      const merged = apiListings.map(api => {
        const lm = staticLookup.get(api.id)
        if (!lm) return api
        const out = { ...lm }
        for (const [k, v] of Object.entries(api)) {
          if (v != null && !(Array.isArray(v) && v.length === 0)) {
            if (k === 'photos' && Array.isArray(v) && Array.isArray(lm.photos)) {
              const apiHasCredits = v.some(p => typeof p === 'object' && p?.credit)
              const staticHasCredits = lm.photos.some(p => typeof p === 'object' && p?.credit)
              if (staticHasCredits && !apiHasCredits) continue
              if (staticHasCredits && apiHasCredits) {
                out[k] = v.length >= lm.photos.length ? v : lm.photos
                continue
              }
            }
            out[k] = v
          }
        }
        return out
      })

      const apiIds = new Set(apiListings.map(l => l.id))
      staticData.landmarks.forEach(lm => {
        if (!apiIds.has(lm.id)) merged.push(lm)
      })

      useListings.setState({ listings: merged, fetched: true, loading: false })
    } else {
      useListings.setState({ fetched: true, loading: false })
    }

    // Hydrate events store
    const events = Array.isArray(data.events) ? data.events : []
    useEvents.getState().setEvents(events)

    // Hydrate handle store
    const h = data.handle || {}
    const STORAGE_KEY = 'lsq_handle'
    const AVATAR_KEY = 'lsq_avatar'
    const VIGNETTE_KEY = 'lsq_vignette'
    if (h.handle) localStorage.setItem(STORAGE_KEY, h.handle)
    if (h.avatar) localStorage.setItem(AVATAR_KEY, h.avatar)
    else localStorage.removeItem(AVATAR_KEY)
    if (h.vignette) localStorage.setItem(VIGNETTE_KEY, h.vignette)
    else localStorage.removeItem(VIGNETTE_KEY)
    useHandle.setState({ handle: h.handle || null, avatar: h.avatar || null, vignette: h.vignette || null, loading: false })
  } catch (err) {
    // Init failed — stores keep their static/localStorage fallbacks
    console.warn('[init] batch fetch failed, using fallbacks:', err?.message)
    useListings.setState({ loading: false })
    useHandle.setState({ loading: false })
  }
}

// Fire on import (non-blocking)
runInit()
