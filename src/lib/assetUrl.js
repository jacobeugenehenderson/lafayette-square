import { INSTANCE } from '../instance.js'

const BASE = import.meta.env.BASE_URL

/**
 * Resolve an installation content asset (logo, photo) to a URL — one place, so
 * consumers stay installation-blind.
 *
 * NEIGHBORHOOD-INPUTS §5.1.2 — each installation's assets live under its OWN
 * content root:
 *   · `http(s)://…`  → external, pass through.
 *   · `/foo.jpg`     → absolute WEB-ROOT: town data outside the town (LS's and Huron's photos under
 *                      public/photos, until their move) → resolve against BASE_URL only. ⛔ Refused by
 *                      ▶ node checks/claims-a-listing-names-only-its-own-assets.mjs; this branch dies with the move.
 *   · `logos/x.jpg`  → INSTANCE-RELATIVE → resolve against this installation's
 *                      `contentRoot` ('content/<town>/', served from the town's own content/).
 */
export function assetUrl(url) {
  if (!url) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${BASE}${url.replace(/^\//, '')}`   // absolute web-root (outside the town; see above)
  return `${BASE}${INSTANCE.contentRoot || ''}${url}`                  // instance-relative (§5.1.2)
}
