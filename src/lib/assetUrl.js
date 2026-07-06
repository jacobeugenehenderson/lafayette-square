import { INSTANCE } from '../instance.js'

const BASE = import.meta.env.BASE_URL

/**
 * Resolve an installation content asset (logo, photo) to a URL — one place, so
 * consumers stay installation-blind.
 *
 * NEIGHBORHOOD-INPUTS §5.1.2 — each installation's assets live under its OWN
 * content root:
 *   · `http(s)://…`  → external, pass through.
 *   · `/foo.jpg`     → absolute WEB-ROOT (LS-legacy: assets under public/) →
 *                      resolve against BASE_URL only.
 *   · `logos/x.jpg`  → INSTANCE-RELATIVE → resolve against this installation's
 *                      `contentRoot` (LS = '' i.e. the web root, byte-identical;
 *                      HPDM = 'content/hipointe-demun/', served from its payload).
 */
export function assetUrl(url) {
  if (!url) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `${BASE}${url.replace(/^\//, '')}`   // absolute web-root (LS legacy)
  return `${BASE}${INSTANCE.contentRoot || ''}${url}`                  // instance-relative (§5.1.2)
}
