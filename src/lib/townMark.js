/**
 * THE TOWN'S MARK — one authored glyph, every surface that needs a badge.
 *
 * ⛔⛔ WHAT THIS REPLACES. `index.html` hardcoded Lafayette Square's title, og:title and
 * favicon — served from `lafayette-square.com` — for every town; the splash rendered
 * `BASE_URL + favicon.svg`, one shared file; and `RoleBadge` drew the GATEWAY ARCH as the
 * badge for every anonymous visitor anywhere. So a Huron partner opened Huron's own
 * address and got St. Louis's name in the tab, St. Louis's mark on the load screen, and
 * St. Louis's monument as their avatar. The player is universal; its branding was not.
 *
 * ⭐ AN EMOJI IS AUTHORED, NOT PRODUCED (Jacob, 2026-09-21: "the rest of the software is
 * emoji based"). No asset to draw, no file to upload, no pipeline, no size variants —
 * town #10 pastes a glyph into its module and every badge in the app follows. It is the
 * same shape as the rest of the kit: the town supplies its own fact, the kit reads it.
 * `AvatarCircle` was already emoji-driven; the town marks were the odd ones out.
 *
 * ⛔ AND THERE IS NO FALLBACK TO ANOTHER TOWN'S MARK. A town that authors nothing gets its
 * own INITIAL, which is neutral and obviously a placeholder. Handing it Lafayette Square's
 * arch is the failure this file exists to end — it looks finished and is wrong, which is
 * worse than looking unfinished (`CLAUDE.md` Layer 0 q2).
 *
 * ⭐ LS KEEPS ITS ARCH, and that is the override working rather than an exception: it
 * authors `markSvg: 'arch'`, so production is byte-identical. The arch is Lafayette
 * Square's mark; it was never the kit's.
 */
import { INSTANCE } from '../instance.js'

/**
 * @returns {{kind:'emoji'|'svg'|'initial', value:string}} — never null; there is always
 * something honest to draw.
 */
export function townMark(instance = INSTANCE) {
  const b = instance?.branding || {}
  if (b.markSvg) return { kind: 'svg', value: b.markSvg }
  if (b.mark) return { kind: 'emoji', value: b.mark }
  const name = b.title || instance?.name || ''
  return { kind: 'initial', value: (name.trim()[0] || '·').toUpperCase() }
}

/** The tab/share name. ⛔ Never another town's. */
export function townTitle(instance = INSTANCE) {
  return instance?.branding?.title || instance?.name || 'The Ward'
}

/**
 * A favicon for an emoji, with no file: an inline SVG data URI. Browsers render it at any
 * size, so there are no icon variants to keep in step.
 */
function emojiFaviconHref(glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`
    + `<text y=".9em" font-size="90">${glyph}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Point the document at THIS town. Called once at boot.
 *
 * ⛔ IT MUST BE RUNTIME, NOT BUILD-TIME. There is ONE player build serving every town at
 * `staging.theward.online/<map>/`, so the static `index.html` cannot know which town it is
 * — only the running app does. ⚠️ That means the static title is visible for the first
 * instants of a cold load; a partner link is unlisted, so the trade is worth it. Fixing it
 * properly means per-town HTML, which reintroduces a per-town build.
 */
export function applyTownBranding(instance = INSTANCE) {
  if (typeof document === 'undefined') return
  const title = townTitle(instance)
  document.title = title
  for (const sel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    const el = document.querySelector(sel)
    if (el) el.setAttribute('content', title)
  }
  // ⛔ An explicit `faviconUrl` wins — that is LS's authored arch, already live.
  const b = instance?.branding || {}
  const mark = townMark(instance)
  const href = b.faviconUrl
    || (mark.kind === 'emoji' ? emojiFaviconHref(mark.value) : null)
  if (!href) return
  let link = document.querySelector('link[rel="icon"]')
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
  link.type = href.startsWith('data:') ? 'image/svg+xml' : link.type || 'image/svg+xml'
  link.href = href
}
