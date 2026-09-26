/**
 * townOrigin — THE ONE PLACE A PUBLIC URL FOR THIS TOWN GETS ITS DOMAIN.
 *
 * ⭐⭐ THE PRODUCTION ADDRESS BELONGS TO THE TOWN, AND ITS ONE HOME IS OPERATIONS (Jacob,
 * 2026-09-26). The Worker serving the page — staging's or the town's own — asks Operations and
 * writes the answer into `<meta name="ward-domain">`. So every URL a visitor can carry away (the
 * check-in QR, the Guardian claim QR printed on a physical card, a place or bulletin share)
 * names the town's production domain wherever the page is being viewed: a claim card printed
 * while testing on STAGING still carries `provincetown.online`, never the staging address.
 *
 * ⛔ NEVER `https://null`, NEVER A GUESS, NEVER `location.origin`. No domain ⇒ `null` and a
 * console.error, and the caller draws no QR and puts no URL in the share.
 * ⚠️ ONE LEGACY SOURCE, READ FROM DATA: a town whose instance module still declares `domain`
 * (Lafayette Square, until its own cutover step deletes the line) keeps it, ahead of the tag,
 * because that is the address its printed cards already carry and the one that serves today.
 *
 * ▶ node checks/claims-public-urls-come-from-the-town-domain.mjs
 */
import { INSTANCE, TOWN_PATH_PREFIX } from '../instance.js'

function readDomain() {
  if (INSTANCE.domain) return String(INSTANCE.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const tag = typeof document !== 'undefined'
    ? document.querySelector('meta[name="ward-domain"]')?.getAttribute('content')
    : null
  return tag || null
}

let _warned = false
/** `https://<domain>` for this town, or null (and one console.error) when none is known. */
export function townOrigin() {
  const d = readDomain()
  if (!d && !_warned) {
    _warned = true
    console.error(`[townOrigin] "${INSTANCE.mapId}" has no production domain on this page (no `
      + '<meta name="ward-domain">, and Operations names none) — QR codes and share links are withheld '
      + 'rather than pointing somewhere that is not this town.')
  }
  return d ? `https://${d}` : null
}

/**
 * ⭐ THE ONE DELIBERATE EXCEPTION: a URL on the site this person is using RIGHT NOW (Jacob,
 * 2026-09-26). The device-link QR hands one person's session to their own other device, so it
 * must land where they are — `staging.theward.online/<map>/link/<token>` on staging,
 * `<domain>/link/<token>` in production, the plain path in dev. ⛔ Never for anything a visitor
 * carries away or prints: those are `townOrigin()`. ⛔ Never `BASE_URL`: on a published player that
 * is `/_player/`, where the Workers serve files, not pages.
 */
export function currentSiteUrl(path) {
  return `${window.location.origin}${TOWN_PATH_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
}

/** The bare domain, for display (e.g. a back link's label), or null. */
export function townHost() {
  return readDomain()
}
