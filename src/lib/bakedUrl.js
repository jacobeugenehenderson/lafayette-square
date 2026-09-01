/**
 * ASSET_BASE — the origin the BAKED SLAB is fetched from.
 *
 * Everything under `baked/<look>/…` is poured output: geometry, ground, trees,
 * buildings, terrain, the atlas, the impostor pages. It is large (516 MiB
 * tracked at the time of writing, growing 100–400 MB per town poured) and it is
 * the only part of `public/` that scales with the number of neighborhoods. It
 * is served from object storage rather than from the site itself.
 *
 * ⛔ THIS IS NOT `BASE_URL`, AND THE DIFFERENCE IS THE POINT.
 *   · `BASE_URL` is where the SITE is deployed (`/`, or `/lafayette-square-
 *     staging/`). It still resolves the app's own assets — textures, models,
 *     clouds JSON, basis/, `looks/<look>/design.json`, codedesk, routes.
 *   · `ASSET_BASE` is where the SLAB lives. In dev and in any build that does
 *     not set VITE_ASSET_BASE it IS BASE_URL, byte-for-byte the old behavior,
 *     so `npm run dev` and `npm run preview` read straight off disk.
 *
 * ⛔ NO FALLBACK. If VITE_ASSET_BASE is set and an object is missing, the fetch
 * 404s and the consumer throws. It must never quietly resolve to another look:
 * a town that fails to load and shows Lafayette Square is not a bug the
 * operator can see — it is a map they will trust (`CLAUDE.md` Layer 0, q2).
 * The default below is the ONLY substitution in this module, it is the
 * identity, and it exists so a machine with no env var behaves exactly as it
 * did before this file existed.
 *
 * ⛔ Kit-level, not LS-level. One prefix per look under one bucket, mirroring
 * `public/baked/<look>/…` exactly, so pouring town #2 needs no code change and
 * no entry in any table.
 *
 * ⚠️ Cache versioning is NOT uniform across the slab, and a reader who assumes
 * it is will set the wrong Cache-Control. Measured on LS: the tree GLBs carry
 * `?v=<atlas generatedAt>` and most JSON carries `?t=<scene.bakedAt>`, but
 * 38.3 MB carries NO version token in a production build — the two atlas PNGs,
 * all 360 KTX2 impostor pages, and the terrain/ground maps — because
 * `bakeLastMs` is an authoring prop and is undefined in prod. Until those carry
 * a token, `immutable` would pin a stale canopy with no URL to change.
 * See `plans/r2-asset-offload.md §3.5`.
 */
const RAW = import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL

/** Always trailing-slashed, so `${ASSET_BASE}baked/…` joins the same way BASE_URL did. */
export const ASSET_BASE = RAW.endsWith('/') ? RAW : `${RAW}/`

/**
 * True when the slab is served from somewhere other than the site itself.
 * Consumers that need to know (e.g. to skip a same-origin-only optimisation)
 * can ask; nothing should branch on it to choose a different asset.
 */
export const ASSET_BASE_IS_REMOTE = /^https?:\/\//i.test(ASSET_BASE)
