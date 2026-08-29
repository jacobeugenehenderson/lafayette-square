/**
 * impostorTexture — the one place that turns an impostor page URL into a texture,
 * for both the hero cards and the overhead discs.
 *
 * ⭐ WHY IT EXISTS: the baked pages are KTX2/ETC1S as of 2026-08-28
 * (`arborist/pack-impostor-ktx2.mjs`). PNG is a FILE format the GPU cannot read, so
 * every page was decompressed to raw RGBA on upload — LS measured 107 MB on the wire
 * against ~1,319 MB of VRAM. ETC1S transcodes to the device's native block format and
 * stays compressed there (~1 byte/px), which is the only reason the embed can run on
 * a phone. PNG is still handled, because a look that has not been re-packed still
 * declares .png pages and must render.
 *
 * ⛔ THIS IS NOT A FALLBACK. The extension in the manifest decides the loader, and a
 * page that FAILS to load is reported loudly and left blank — it never quietly
 * retries as PNG. A silent substitution here is how a look ships half its canopy.
 *
 * ⚠️ KTX2Loader is promise-based; TextureLoader returns its texture synchronously and
 * fills it in later. Every caller here is built on the synchronous shape (a Map of
 * textures assembled once, no Suspense), so a KTX2 page returns a placeholder that is
 * populated in place on arrival — exactly what TextureLoader does internally. Do NOT
 * "simplify" this by forcing needsUpdate on every frame: that makes three upload an
 * imageless texture forever and nothing paints.
 */
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

let _ktx2 = null
/**
 * KTX2 needs the renderer to know which block formats the device supports, so the
 * loader cannot be built until a WebGLRenderer exists. Callers pass `gl` (they all
 * have it from useThree); the first call wins and the rest reuse it.
 */
function ktx2Loader(gl) {
  if (_ktx2) return _ktx2
  if (!gl) return null
  _ktx2 = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
    .detectSupport(gl)
  return _ktx2
}

const _cache = new Map()   // url → THREE.Texture

export function loadImpostorTexture(url, { srgb = true, gl = null } = {}) {
  if (_cache.has(url)) return _cache.get(url)
  const space = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace

  if (/\.ktx2($|\?)/i.test(url)) {
    const loader = ktx2Loader(gl)
    if (!loader) {
      console.error(`[impostorTexture] ⛔ a KTX2 page was requested before any renderer existed — ${url}. `
        + `The caller must pass gl. Nothing will paint for this page.`)
      return null
    }
    // The placeholder a caller can bind immediately; filled in place on arrival.
    const tex = new THREE.CompressedTexture([], 1, 1)
    tex.colorSpace = space
    tex.anisotropy = 4
    _cache.set(url, tex)
    loader.load(url, (loaded) => {
      tex.image = loaded.image
      tex.mipmaps = loaded.mipmaps
      tex.format = loaded.format
      tex.minFilter = loaded.mipmaps?.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.wrapS = loaded.wrapS; tex.wrapT = loaded.wrapT
      tex.needsUpdate = true
      loaded.dispose()
    }, undefined, (err) => {
      // ⛔ LOUD. A missing page is a hole in the canopy; it must never read as "thin".
      console.error(`[impostorTexture] ⛔ KTX2 page failed to load — ${url}. `
        + `This species' layer will be blank. Re-run arborist/pack-impostor-ktx2.mjs for this look.`, err)
    })
    return tex
  }

  const t = new THREE.TextureLoader().load(url, undefined, undefined, (err) => {
    console.error(`[impostorTexture] ⛔ PNG page failed to load — ${url}. This layer will be blank.`, err)
  })
  t.colorSpace = space
  t.anisotropy = 4
  _cache.set(url, t)
  return t
}

export function disposeImpostorTextures() {
  for (const t of _cache.values()) { try { t.dispose() } catch {} }
  _cache.clear()
}
