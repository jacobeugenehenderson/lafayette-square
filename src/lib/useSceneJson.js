import { useEffect, useState } from 'react'

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
 * Fetches once per (lookId, cacheBust) pair via module-scope memo;
 * subsequent calls with the same key return the cached promise. The
 * default cacheBust is the build's `import.meta.env.MODE` so dev
 * always refreshes, prod caches normally; pass a different value to
 * force-refresh (e.g., from `scene.bakedAt` once the first read
 * completes — see neon-uniforms pump for the pattern).
 *
 * Path routed through `import.meta.env.BASE_URL` per SLAB-CONTRACT
 * §10.6 + memory `project_kit_deploy_path_agnostic` — same call site
 * works on apex (lafayette-square.com, BASE_URL=`/`) and subpath
 * (jacobeugenehenderson.github.io/lafayette-square-staging/,
 * BASE_URL=`/lafayette-square-staging/`).
 */

const _cache = new Map() // `${lookId}@${cacheBust}` → Promise<scene>

function fetchSceneOnce(lookId, cacheBust) {
  const key = `${lookId}@${cacheBust}`
  if (_cache.has(key)) return _cache.get(key)
  const url = `${import.meta.env.BASE_URL}baked/${lookId}/scene.json?t=${cacheBust}`
  const p = fetch(url)
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
 * @param {string|number} [cacheBust] — optional cache-bust seed. If
 *   omitted, derives from `import.meta.env.MODE`. After the first read
 *   resolves, callers may re-invoke with the returned `scene.bakedAt`
 *   to ensure the browser HTTP cache is honored correctly per slab
 *   contract §1.
 * @returns {object|null} the parsed scene.json, or null until the
 *   first fetch resolves (and on fetch failure).
 */
export function useSceneJson(lookId, cacheBust) {
  const bust = cacheBust ?? (import.meta.env.MODE || 'prod')
  const [scene, setScene] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchSceneOnce(lookId, bust).then(s => {
      if (!cancelled) setScene(s)
    })
    return () => { cancelled = true }
  }, [lookId, bust])
  return scene
}
