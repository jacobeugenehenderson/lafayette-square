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
    parkWater:        () => import('./lafayette-square/park_water.json'),
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

  // Installations #3/#4. Each town's listings carry a `building_id` that resolves in
  // ITS OWN slab (checked against public/baked/<scene>/buildings.json: huron 36/36,
  // altadena 23/23).
  //
  // ⭐⭐ WHAT A ROSTER MUST CARRY TO BE WORTH WIRING, and it is two fields, measured
  // per town before the entry is added (2026-09-21):
  //   · `address`  — `useListings._buildBareBuildingListings` DROPS a building without
  //                  one; it cannot be listed with nothing to call it.
  //   · `category` — how it files on the Society Pages. ⭐ The town's OWN category is
  //                  preferred and the St. Louis zoning letter is only the FALLBACK
  //                  (`category: b.category || (zoned && zoned.category) || null`).
  //                  LS is the town that ships zoning and no category; every other
  //                  town so far ships category and no zoning. ⛔ "Categorised by
  //                  zoning" describes Lafayette Square, not the kit.
  //
  // Measured 2026-09-21 — ▶ re-derive, never quote:
  //   huron           3,678 buildings · 3,573 address (97%) · 3,340 category (91%)  → WIRED
  //   hipointe-demun  1,281 buildings · 1,133 address (88%) · 1,281 category (100%) → wired above
  //   altadena       15,397 buildings ·     0 address  (0%) · 15,397 category       → ⛔ NOT WIRED
  //
  // ⛔ ALTADENA IS DELIBERATELY ABSENT AND THAT IS THE POINT OF THIS BLOCK. Its roster
  // has ZERO addresses, so every one of its 15,397 buildings would be dropped by the
  // address filter: the Society Pages would be exactly as empty as they are now, while
  // LOOKING wired to the next reader. An entry that reaches nothing is worse than no
  // entry, because it stops anyone looking. Wire it when its address well is declared.
  huron: {
    landmarks: () => import('../../cartograph/data/huron/content/listings.json'),
    buildings: () => import('../../cartograph/data/huron/content/roster.json'),
    // ⭐ THE SAME SEAM, A DIFFERENT HOME — and that is what MANIFESTS is for.
    // LS's seed set is reader-private (`src/data/lafayette-square/seedEvents.json`);
    // a POURED town's calendar lives with the rest of its content, beside
    // listings.json, so one town's content is in one place (Jacob, 2026-09-22).
    // ⛔ Validated at bake time by `bake-content.js#validateEvents` — every
    // `listing_id`/`links_to` must resolve or the scene refuses to bake.
    seedEvents: () => import('../../cartograph/data/huron/content/events.json'),
  },
  altadena: {
    landmarks: () => import('../../cartograph/data/altadena/content/listings.json'),
  },
}

// ⚠️ MANIFESTS IS A HARDCODED PER-LOOK REGISTRY, so town #5 needs a CODE EDIT
// before its own content is reachable — the same shape as A12's instance
// registry. Not fixed here: the failure is loud and correct (a missing entry
// warns and resolves to null, and consumers offer nothing rather than another
// town's data), so it is a portability limit, not a bleed. Filed, not patched.

// Different installations wrap their content differently (LS: `{landmarks}` / flat
// menus; HPDM §5.1.1: `{meta,listings}` / `{meta,menus}`). Unwrap to the reader's
// expected shape here — one place — so consumers stay installation-blind. LS
// objects pass through unchanged (identity preserved).
function normalizeEnvelope(name, raw) {
  if (!raw) return raw
  if (name === 'landmarks') return raw.landmarks ? raw : { landmarks: raw.listings ?? [] }
  if (name === 'menus') return raw.menus ?? raw
  // ⭐ TWO HOMES SHIP TWO SHAPES, AND THAT IS THE ENVELOPE'S JOB, NOT THE STORE'S.
  // LS's reader-private seed set is a bare array; a poured town's calendar lives in
  // the content dir and wears the `{ _comment, _schema, events }` envelope its
  // neighbours listings.json/roster.json wear. ⛔ Unwrapped HERE so `useEvents`
  // keeps one shape to reason about — a store that accepts two is a store that
  // silently accepts a third.
  if (name === 'seedEvents') return Array.isArray(raw) ? raw : (raw.events ?? [])
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
