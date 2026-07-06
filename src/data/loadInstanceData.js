/**
 * loadInstanceData — the installation-data seam (Universal Reader Phase 2).
 *
 * The reader is a generic reader of an installation payload; LS is
 * installation #1 (`?look=lafayette-square`). Every LS-specific data
 * file the reader used to `import … from '../data/X'` now loads through
 * THIS seam, keyed by `INSTANCE.lookId`, so a different installation
 * swaps its data by pointing at a different look — no reader edit.
 *
 * Contract (identical for all files, one route — no drift,
 * `feedback_dual_hydration_paths_drift`):
 *
 *     const rec = loadInstanceData(lookId, name)   // → { value, ready }
 *     // rec.value: null until loaded, then the parsed JSON default export
 *     // rec.ready: Promise<value> (null on failure)
 *
 * Consumers that read at module scope await `rec.ready` (or check
 * `rec.value`) — the same async-ready discipline `buildings.js` already
 * uses (it is the reference caller of this seam). Cached per
 * (lookId, name) so every caller shares one record + one load.
 *
 * Mirrors the two existing load-by-lookId precedents:
 *   · `src/lib/useSceneJson.js` — the slab fetched by lookId
 *   · `src/data/buildings.js`   — dynamic import() + a `ready` promise
 * generalized to N files behind one contract.
 *
 * ── The manifest ────────────────────────────────────────────────────
 * `MANIFESTS[lookId][name]` is a lazy loader thunk (a dynamic import) at
 * the file's CURRENT location. Only the reader-private files (menus,
 * seedEvents) physically live under `./<lookId>/`; the rest load
 * IN-PLACE from their existing paths because they are SHARED source (the
 * authoring app `src/cartograph/*`, render libs, and the bake pipeline
 * import the same files). Physically relocating that shared set into the
 * look dir is explicitly the roster/render (producer-emit) arc's job —
 * NOT this reader phase. When those files move, only the thunk path here
 * changes; every consumer stays untouched. A new installation (e.g.
 * hipointe-demun) adds its own `MANIFESTS[<lookId>]` block.
 */

const MANIFESTS = {
  'lafayette-square': {
    // Relocated into the look dir (reader-private).
    menus:            () => import('./lafayette-square/menus.json'),
    seedEvents:       () => import('./lafayette-square/seedEvents.json'),
    // In-place: shared with authoring + bake pipeline; moves belong to the
    // producer-emit arc. Loaded by lookId here regardless of physical path.
    buildings:        () => import('./buildings.json'),
    buildingOverrides:() => import('./buildingOverrides.json'),
    streets:          () => import('./streets.json'),
    landmarks:        () => import('./landmarks.json'),
    ribbons:          () => import('./ribbons.json'),
    streetLamps:      () => import('./street_lamps.json'),
    parkWater:        () => import('./park_water.json'),
    parkFeatureElev:  () => import('./park-feature-elev.json'),
    facadeMapping:    () => import('./facade_mapping.json'),
    // Bucket-1 identity offender folded in here: the reader no longer
    // hardcodes the `cartograph/data/lafayette-square/` path (LafayettePark:9).
    parkPolygon:      () => import('../../cartograph/data/lafayette-square/clean/park-polygon.json'),
  },

  'hipointe-demun': {
    // Installation #2 — content in its OWN payload (cartograph/data/hipointe-demun/
    // content/), authored in §5.1.1 shape. The envelope normalizer (below) unwraps
    // {meta,listings}/{meta,menus} into the reader's {landmarks}/flat-menus shape.
    landmarks: () => import('../../cartograph/data/hipointe-demun/content/listings.json'),
    menus:     () => import('../../cartograph/data/hipointe-demun/content/menus.json'),
    buildings: () => import('../../cartograph/data/hipointe-demun/content/roster.json'),
    // seedEvents / streets / facadeMapping / render geometry: HPDM has none here —
    // loadInstanceData returns null and consumers guard (empty events, no facade
    // photo, streets stat 0). Park/labels/lamps are LS-guarded off for non-LS looks.
  },
}

// Different installations wrap their content differently (LS: `{landmarks}` / flat
// menus; HPDM §5.1.1: `{meta,listings}` / `{meta,menus}`). Unwrap to the reader's
// expected shape here — one place — so consumers stay installation-blind. LS
// objects pass through unchanged (identity preserved).
function normalizeEnvelope(name, raw) {
  if (!raw) return raw
  if (name === 'landmarks') return raw.landmarks ? raw : { landmarks: raw.listings ?? [] }
  if (name === 'menus') return raw.menus ?? raw
  return raw
}

const _cache = new Map() // `${lookId}/${name}` → { value, ready }

export function loadInstanceData(lookId, name) {
  const key = `${lookId}/${name}`
  const cached = _cache.get(key)
  if (cached) return cached

  const record = { value: null, ready: null }
  const thunk = MANIFESTS[lookId]?.[name]

  if (!thunk) {
    console.warn(`[loadInstanceData] no manifest entry for ${key}`)
    record.ready = Promise.resolve(null)
    _cache.set(key, record)
    return record
  }

  record.ready = thunk()
    .then(m => { record.value = normalizeEnvelope(name, m.default); return record.value })
    .catch(e => {
      console.warn(`[loadInstanceData] load failed for ${key}:`, e)
      return null
    })
  _cache.set(key, record)
  return record
}
