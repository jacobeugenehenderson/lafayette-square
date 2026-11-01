import { useEffect, useMemo, useState } from 'react'
import { useTownShot } from '../components/townContext.js'
import { shotKeyForViewMode, resolveShotScene } from './shotScene.js'
import { slabFetch } from './slabUrl.js'
import { sceneFor } from './sceneFor.js'
import { Refusal, Transient, httpFailure } from './refusal.js'

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
const _failed = new Map() // `${lookId}@${reread}` → the Refusal | Transient a failed read ended in

// In dev a re-bake rewrites scene.json under the same URL; the browser's memory
// cache could serve the old one ("edited the slab but the app shows the old
// look"). Force a fresh read in dev; a published town's scene.json is named by
// its content, so production caches it forever and correctly.
const _fetchOpts = import.meta.env.DEV ? { cache: 'no-store' } : undefined

function fetchSceneOnce(lookId, reread) {
  const key = `${lookId}@${reread}`
  if (_cache.has(key)) return _cache.get(key)
  const p = slabFetch(lookId, 'scene.json', _fetchOpts)
    .then(async (r) => {
      if (!r.ok) throw httpFailure(r, `${lookId}'s scene.json answered ${r.status}`)
      try { return await r.json() } catch (e) { throw new Refusal(`${lookId}'s scene.json is not JSON: ${e.message}`) }
    })
    .catch(e => {
      _failed.set(key, e instanceof Refusal || e instanceof Transient ? e : new Transient(`${lookId}'s scene.json could not be read: ${e.message}`))
      console.warn(`[useSceneJson] load failed for ${lookId}:`, e)
      return null
    })
  _cache.set(key, p)
  return p
}

/**
 * Why this Look's scene.json read FAILED (a Refusal, or a Transient for the network / a 5xx), or null: not read yet, or
 * read. useSceneJson returns null for both "not yet" and "failed"; a reader that must not go silent on a failure (a
 * display: <Displays>) asks here, and refuses by name.
 */
export function sceneReadFailure(lookId, reread) { return _failed.get(`${lookId}@${reread ?? 0}`) || null }

/**
 * @param {string} lookId — which slab to read: the Look the caller is drawing (never a default town's).
 * @param {string|number} [reread] — change it to read the file again
 *   (Stage passes its last bake time).
 * @returns {object|null} the parsed scene.json OF THIS LOOK, or null until it is read (and on fetch failure) — never
 *   another Look's while this one loads. A re-read of the SAME Look (`reread`) keeps its previous scene meanwhile.
 */
export function useSceneJson(lookId, reread) {
  const bust = reread ?? 0
  // ⛔ The state names the Look it holds, and the hook returns it ONLY for that Look (sceneFor). It held a bare scene,
  // so on a Look switch it returned the PREVIOUS Look's scene until the new read resolved: Stage drew Provincetown's
  // mark under Hi-Pointe–DeMun's name, and every consumer drew a frame of the old town (Sigil, 2026-10-31).
  const [held, setHeld] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchSceneOnce(lookId, bust).then(s => {
      if (!cancelled) setHeld({ lookId, scene: s })
    })
    return () => { cancelled = true }
  }, [lookId, bust])
  const scene = sceneFor(held, lookId)
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
