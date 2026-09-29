/**
 * kitUrl — where the RENDERER'S OWN files live: the KTX2 transcoder (`basis/`), the cloud
 * almanac (`clouds/`), the building and sky textures, the lamp model, the weather icons.
 *
 * ⭐ THE PAGE SAYS, IN `<meta name="ward-kit-base">`, AND NOTHING ELSE DOES (ruled 2026-09-28,
 * `BRIEF-ward-on-staging §4.3`). These files are the renderer's, not the hosting app's
 * (`BRIEF-slab-loading §⑥b`): inside The Ward the hosting app's `BASE_URL` is the Ward's build,
 * which carries none of them. So every host names the kit base explicitly —
 *   · the Ward on staging: the site Worker stamps `<SLAB_BASE>kit/<kit-sha>/`, the versioned
 *     bundle `scripts/publish-kit-bundle.mjs` put on the asset host;
 *   · the kit's own apps (player, Cartograph, Stage, Preview): `vite.config.js` declares the
 *     app's own base, where those same files ship out of `public/`.
 *
 * ⛔ NO FALLBACK TO `BASE_URL`. A page without exactly one tag throws at the first read: a
 * guessed base answers every one of these files with the host's `index.html` or a 404, and
 * the town draws with no textures and no clouds — a plausible-looking page that is wrong.
 *
 * ⛔ CALL IT WITH A LITERAL PATH (a template is fine, `textures/buildings/${id}.jpg`): the bundle
 * publish reads the literal prefix of every `kitUrl(` call site to decide what ships, so a path
 * built elsewhere and passed in is a file the bundle will not carry — and the publish refuses it.
 */
let _base = null

function kitBase() {
  if (_base) return _base
  const tags = typeof document !== 'undefined'
    ? document.querySelectorAll('meta[name="ward-kit-base"]')
    : []
  if (tags.length !== 1) {
    throw new Error(`[kitUrl] this page carries ${tags.length} <meta name="ward-kit-base"> tags; it must carry `
      + 'exactly one — the site serving it names where the renderer\'s own files live. Refusing to guess.')
  }
  const v = tags[0].getAttribute('content') || ''
  // An absolute path or an absolute URL, trailing-slashed. ⛔ An unreplaced placeholder
  // (`%BASE_URL%`) or a relative path fails here rather than at forty fetches.
  if (!/^(https?:\/\/[^/\s]+)?\/(\S*\/)?$/.test(v)) {
    throw new Error(`[kitUrl] <meta name="ward-kit-base" content="${v}"> is not an absolute, trailing-slashed base.`)
  }
  return (_base = v)
}

export function kitUrl(rel) {
  if (rel.startsWith('/')) throw new Error(`[kitUrl] "${rel}" must be relative to the kit base`)
  return kitBase() + rel
}
