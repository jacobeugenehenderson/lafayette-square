import { getInit } from '../lib/api'
import { orderListings } from '../lib/listingOrder.js'
import { getDeviceHash } from '../lib/device'
import { supabase } from '../lib/supabase'
import useListings, { bareBuildingListings, landmarksWithMenus, _landmarksReady, normalizeListingMenu } from './useListings'
import useHandle from './useHandle'
import useEvents from './useEvents'
import useResidence from './useResidence'
import useCommunityStats from './useCommunityStats'

// landmarksWithMenus + bareBuildingListings are live bindings from useListings
// (single source — no duplicate seam load). They fill post-ready; runInit awaits
// `_landmarksReady` below before the merge.

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

    // Hydrate listings store — the static fallback map (landmarksWithMenus) must
    // be filled before the merge, or rich static fields (history, photos, menus)
    // would be lost to a race with the async landmarks load.
    await _landmarksReady
    const apiListings = Array.isArray(data.listings) ? data.listings : []
    if (apiListings.length > 0) {
      const staticLookup = new Map()
      landmarksWithMenus.forEach(lm => staticLookup.set(lm.id, lm))

      const merged = apiListings.map(api => {
        const lm = staticLookup.get(api.id)
        if (!lm) return api
        const out = { ...lm }
        for (const [k, v] of Object.entries(api)) {
          if (v != null && !(Array.isArray(v) && v.length === 0)) {
            // Keep bundled menu unless API has real menu data
            if (k === 'menu' && lm.menu?.sections?.length && !v?.sections?.length) continue
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
        // ⛔ The line above can overwrite an already-normalized static menu with
        // the API's, so ids are ensured AFTER the merge, never before it. This is
        // the live ingest path — a menu that misses it has items the cart cannot
        // address, and the + button would silently do nothing.
        return normalizeListingMenu(out)
      })

      const apiIds = new Set(apiListings.map(l => l.id))
      landmarksWithMenus.forEach(lm => {
        if (!apiIds.has(lm.id)) merged.push(lm)
      })

      // ⛔ ORDERED HERE TOO, AND THIS IS THE PATH THAT MATTERS. The seed in
      // `useListings` is replaced by this merge the moment the API answers, so ordering
      // only the seed would have looked right in a cold dev reload and reverted to
      // Overture's file order in production — the failure would appear exactly where
      // nobody was testing. One order, every writer.
      useListings.setState({ listings: orderListings([...merged, ...bareBuildingListings]), fetched: true, loading: false })
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

    // Hydrate residence store
    const r = data.residence
    if (r && r.building_id) {
      useResidence.setState({ buildingId: r.building_id, status: r.status })
    }

    // Hydrate community stats
    const counts = data.counts
    if (counts) {
      // Fetch active courier count from Supabase in parallel
      let courierCount = 0
      try {
        const { count } = await supabase
          .from('courier_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
        courierCount = count || 0
      } catch {}

      useCommunityStats.setState({
        townies: counts.townies || 0,
        residents: counts.residents || 0,
        guardians: counts.guardians || 0,
        couriers: courierCount,
      })
    }
  } catch (err) {
    // Init failed — stores keep their static/localStorage fallbacks
    console.warn('[init] batch fetch failed, using fallbacks:', err?.message)
    useListings.setState({ loading: false })
    useHandle.setState({ loading: false })
  }
}

// Fire on import (non-blocking)
runInit()
