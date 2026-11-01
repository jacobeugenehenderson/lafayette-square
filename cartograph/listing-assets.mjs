/**
 * listing-assets.mjs — every file a listing names (its photos AND its logo), and the index the bake publishes them under.
 *
 * ⭐ THE INDEX IS `manifest.photos`, keyed by the listing's LITERAL string. The Ward resolves a logo only as
 * `manifest.photos[listing.logo]` (theward src/content/photos.js#placeLogo), a photo as `manifest.photos[url]`. A logo
 * indexed anywhere else, or under a rewritten key, is a card that falls back to initials (Zob, 2026-11-01).
 * ⛔ Until 2026-11-01 the bake walked `l.photos` only, so no town's logo was ever published (LS's 14, HPDM's 8).
 *
 * A url is resolved two ways: TOWN-RELATIVE ('logos/x.png', 'photos/<slug>/01.jpg') from the town's own content/, or
 * ROOT-ABSOLUTE ('/photos/…') from the kit's public/: town data outside the town's folder, counted so it is visible
 * (`outsideTown`) and refused by ▶ node checks/claims-a-listing-names-only-its-own-assets.mjs. A missing file is
 * indexed `null`, said, never skipped.
 */

/** The urls one listing names, in order: its photos, then its logo. */
export function listingAssetUrls(l) {
  const out = []
  for (const ph of (l && l.photos) || []) {
    const url = typeof ph === 'string' ? ph : ph && ph.url
    if (url) out.push(url)
  }
  if (l && typeof l.logo === 'string' && l.logo) out.push(l.logo)
  return out
}

/** The published path's tail for a url: '/photos/a/01.jpg' → 'photos/a/01.jpg' · 'logos/x.png' → 'logos/x.png'. */
export const assetTail = (url) => url.replace(/^\/+/, '')

/**
 * list → { index: { [url]: published | null }, outsideTown }.
 *   resolveSrc(url) → the source file's absolute path · exists(path) → boolean · publish(src, tail) → { path, bytes, sha256 }
 *   rootOf(url) → the directory the url's first segment names ('/photos/a/1.jpg' → <kit>/public/photos)
 * ⛔ A MISSING ROOT REFUSES. One absent file is a hole, said and indexed null; a whole root absent (an archive not linked
 * into this checkout) would index nearly every file null and still print a success line. Measured 2026-11-01: a worktree
 * without the public/photos link baked LS as "✅ … photos 14/263", exit 0.
 */
export function indexListingAssets(list, { resolveSrc, exists, publish, rootOf }) {
  const index = {}
  let outsideTown = 0
  const goneRoots = new Map()   // root → first url under it
  for (const l of list || []) {
    for (const url of listingAssetUrls(l)) {
      if (url in index) continue
      if (/^[a-z]+:/i.test(url)) { index[url] = null; continue }   // another host's: no bake publishes it
      const root = rootOf(url)
      if (!exists(root)) { if (!goneRoots.has(root)) goneRoots.set(root, url); index[url] = null; continue }
      const src = resolveSrc(url)
      if (!exists(src)) { index[url] = null; continue }
      if (url.startsWith('/')) outsideTown++
      index[url] = publish(src, assetTail(url))
    }
  }
  if (goneRoots.size) throw new Error(`⛔ listing assets: ${goneRoots.size} asset root(s) absent entirely, not a missing file: `
    + [...goneRoots].map(([r, u]) => `${r} (e.g. ${u})`).join(' · ') + ' — link or restore it, then bake again')
  return { index, outsideTown }
}
