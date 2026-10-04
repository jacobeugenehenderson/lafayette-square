/**
 * slabUrl — THE ONE PLACE a slab file's URL is made. `slabUrl(look, rel)` / `slabFetch(look, rel)`.
 *
 * ⭐ WHY ONE (BRIEF-slab-loading §3 step 3, 2026-09-28). A published town serves its slab under
 * content names (`src/lib/slabNames.js`): `ground.json` is fetched as `ground.<sha16>.json`,
 * immutable. Only the town's `manifest.json` knows the sha, so every slab URL comes from here and
 * nowhere else (▶ `node checks/claims-every-slab-url-is-resolved.mjs`). No `?t=` token: a content
 * name cannot be stale, and on disk (Stage, dev) the server revalidates every read.
 *
 *   · LOCAL (`ASSET_BASE` is the site itself — Stage, dev, `vite preview`): the plain path on disk.
 *     No manifest is needed to name a file, and a fresh bake is read the moment it lands.
 *   · REMOTE (R2): the town's `manifest.json` is fetched first (no-cache — it is the switch). If it
 *     says `names: HASHED`, every file resolves to its content name; otherwise the town has not had
 *     a hashed upload yet and its objects are at their plain names.
 *
 * ⛔ Remote and not yet read: `slabUrl` THROWS. Await `slabReady(look)` (or use `slabFetch`, which
 * does) before asking for a URL synchronously. A guessed name is a 404 on one host and a stale file
 * on another.
 */
import { ASSET_BASE, ASSET_BASE_IS_REMOTE } from './bakedUrl.js'
import { HASHED, slabPath, manifestPath } from './slabNames.js'
import { markStartup } from './startupMarks.js'

const _towns = new Map()   // look → { ready: Promise, manifest, hashed, done }

function requireLook(look) {
  if (!look || typeof look !== 'string') throw new Error(`[slabUrl] no look — a slab file belongs to a town (got ${look})`)
}

/**
 * The town's manifest (null when it has none). Remote: the one no-cache read that also decides
 * the naming, once per page. On disk: read fresh every call, so a re-bake is seen (naming never
 * depends on it there).
 */
export function slabManifest(look) {
  requireLook(look)
  if (ASSET_BASE_IS_REMOTE) return townOf(look).ready.then(t => t.manifest)
  return fetch(ASSET_BASE + manifestPath(look), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null))
    .then((m) => { if (m) markStartup('manifest'); return m })
}

function settle(t, look, url, m) {
  t.manifest = m
  if (m) markStartup('manifest')
  t.hashed = ASSET_BASE_IS_REMOTE && m?.names === HASHED
  if (ASSET_BASE_IS_REMOTE && !m) {
    console.error(`[slabUrl] ⛔ "${look}" has no published manifest.json at ${url} — `
      + 'its files are read at their plain names. Publish the town to give it one.')
  }
  t.done = true
  return t
}

function townOf(look) {
  let t = _towns.get(look)
  if (t) return t
  t = { manifest: null, hashed: false, done: false }
  const url = ASSET_BASE + manifestPath(look)
  t.ready = fetch(url, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(m => settle(t, look, url, m))
  _towns.set(look, t)
  return t
}

/**
 * ⭐ ONE READ OF THE MANIFEST PER PAGE. An app that has already fetched the town's manifest (The Ward reads it
 * first, to boot) hands it here, and the slab resolver names files from that copy instead of fetching its own.
 * `url` is where the app fetched it. ⛔ THROWS if that is not the URL this resolver would read (two hosts would mean
 * two different slabs), or if this page has already read the town's manifest (that would be the second read).
 */
export function adoptSlabManifest(look, manifest, url) {
  requireLook(look)
  const own = ASSET_BASE + manifestPath(look)
  if (url !== own) throw new Error(`[slabUrl] ⛔ "${look}"'s manifest was read from ${url}, but its slab is at ${own} — one town, two hosts. Refusing.`)
  if (!manifest || typeof manifest !== 'object') throw new Error(`[slabUrl] ⛔ adoptSlabManifest("${look}") was handed no manifest`)
  if (_towns.has(look)) throw new Error(`[slabUrl] ⛔ "${look}"'s manifest was already read on this page — adopt it before anything draws the town`)
  const t = { manifest: null, hashed: false, done: false }
  settle(t, look, url, manifest)
  t.ready = Promise.resolve(t)
  _towns.set(look, t)
}

/** Resolves once `slabUrl(look, …)` can answer synchronously. Immediate on disk. */
export function slabReady(look) {
  requireLook(look)
  return ASSET_BASE_IS_REMOTE ? townOf(look).ready.then(() => undefined) : Promise.resolve()
}

/**
 * The URL of a slab file. `rel` is slab-relative, or a cross-reference read from the slab's JSON.
 * `reread` (optional) is the caller's re-read key — Stage's last bake time; it only reaches the
 * URL on disk (see slabNames.js#slabPath).
 */
export function slabUrl(look, rel, reread) {
  requireLook(look)
  if (!ASSET_BASE_IS_REMOTE) return ASSET_BASE + slabPath(look, rel, { remote: false, reread })
  const t = townOf(look)
  if (!t.done) throw new Error(`[slabUrl] "${look}"'s manifest has not been read — await slabReady("${look}") before slabUrl("${rel}")`)
  return ASSET_BASE + slabPath(look, rel, { remote: true, manifest: t.manifest, hashed: t.hashed })
}

/**
 * A slab JSON's own stamp (`look`) must name the town it was fetched under. Returns the JSON; THROWS on a
 * mismatch. A slab folder moved or copied to a new name keeps its old stamp — drawing it would address its
 * files by a town that isn't this one (HPDM, 2026-10-04: broke until re-baked, silently). Address every file by
 * the look you fetched from, never by the stamp. ▶ node checks/claims-the-slab-addresses-files-by-where-it-was-fetched.mjs
 */
export function slabStamped(look, json, file) {
  requireLook(look)
  if (json?.look !== look) {
    throw new Error(`[slab] ⛔ baked/${look}/${file} says it belongs to "${json?.look}" — this slab was baked for another `
      + `town (a moved or copied folder?). It is not drawn under "${look}". ▶ re-bake "${look}".`)
  }
  return json
}

/** fetch() a slab file by name, after the town's naming is known. */
export async function slabFetch(look, rel, init, reread) {
  await slabReady(look)
  return fetch(slabUrl(look, rel, reread), init)
}

/**
 * slabUrl for a component that builds its URL while rendering (useGLTF, useLoader): until the
 * town's naming is read it SUSPENDS (throws the read, as useGLTF itself does), so it must sit
 * under a <Suspense> — which every such caller already does, for the loader's own sake.
 */
export function suspendSlabUrl(look, rel, reread) {
  requireLook(look)
  if (ASSET_BASE_IS_REMOTE) { const t = townOf(look); if (!t.done) throw t.ready }
  return slabUrl(look, rel, reread)
}
