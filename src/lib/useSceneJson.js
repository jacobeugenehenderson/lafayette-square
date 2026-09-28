import { useEffect, useMemo, useState } from 'react'
import { useTownShot } from '../components/townContext.js'
import { shotKeyForViewMode, resolveShotScene } from './shotScene.js'
import { slabFetch } from './slabUrl.js'

/**
 * useSceneJson — the production-side slab data adapter.
 *
 * Per `plans/kit_couplers_parametrize.md` §1 Cartograph coupler:
 * production consumers read `public/baked/<lookId>/scene.json` through
 * THIS hook, NOT through `src/cartograph/stores/useCartographStore.js`.
 * Deliberately thin — slab data adapter, not state container — so it
 * can't accrete the authoring-only concerns that drove the cartograph
 * store to ~1300 lines. Keeping it distinct from the cartograph store
 * is what makes the seam load-bearing in the right direction.
 *
 * Fetches once per (lookId, reread) pair via module-scope memo; a new
 * `reread` value (Stage passes its last bake time) reads the file again.
 * The URL is the resolver's (`src/lib/slabUrl.js`) — no version token.
 */

const _cache = new Map() // `${lookId}@${reread}` → Promise<scene>

// In dev a re-bake rewrites scene.json under the same URL; the browser's memory
// cache could serve the old one ("edited the slab but the app shows the old
// look"). Force a fresh read in dev; a published town's scene.json is named by
// its content, so production caches it forever and correctly.
const _fetchOpts = import.meta.env.DEV ? { cache: 'no-store' } : undefined

function fetchSceneOnce(lookId, reread) {
  const key = `${lookId}@${reread}`
  if (_cache.has(key)) return _cache.get(key)
  const p = slabFetch(lookId, 'scene.json', _fetchOpts)
    .then(r => (r.ok ? r.json() : null))
    .catch(e => {
      console.warn(`[useSceneJson] load failed for ${lookId}:`, e)
      return null
    })
  _cache.set(key, p)
  return p
}

/**
 * @param {string} lookId — which slab to read; today passed as the
 *   literal `'lafayette-square'` from production call sites pending the
 *   INSTANCE coupler (couplers plan §6). When INSTANCE lands, call
 *   sites flip to `INSTANCE.lookId`.
 * @param {string|number} [reread] — change it to read the file again
 *   (Stage passes its last bake time).
 * @returns {object|null} the parsed scene.json, or null until the
 *   first fetch resolves (and on fetch failure).
 */
export function useSceneJson(lookId, reread) {
  const bust = reread ?? 0
  const [scene, setScene] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchSceneOnce(lookId, bust).then(s => {
      if (!cancelled) setScene(s)
    })
    return () => { cancelled = true }
  }, [lookId, bust])
  // Channel-variant cascade (HANDOFF-channel-variant-cascade.md): resolve the
  // per-shot whole-look fork ONCE, here, off the shot the town is drawn in (<Town shot>, from Town's
  // context — the same in every app; outside a <Town>, the base look). resolveShotScene
  // returns the SAME object identity when the shot has no fork, so an unforked Look (no
  // scene.shotLooks) adds no render churn.
  const viewMode = useTownShot()
  return useMemo(
    () => resolveShotScene(scene, shotKeyForViewMode(viewMode)),
    [scene, viewMode]
  )
}
