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
import { kitUrl } from '../lib/kitUrl.js'

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
    .setTranscoderPath(kitUrl('basis/'))
    .detectSupport(gl)
  return _ktx2
}

const _cache = new Map()   // url → THREE.Texture

export function loadImpostorTexture(url, { srgb = true, gl = null, channels = null } = {}) {
  const key = channels ? `${url}#${channels}` : url
  if (_cache.has(key)) return _cache.get(key)
  // ⭐ The hero card's AO+DEPTH page (heroDepthPage.js): an uncompressed PNG uploaded as RG8 — R = AO, G = depth.
  // ⛔ Never as RGBA: a 4-channel upload of a 2-channel page doubles its GPU memory (BRIEF-hero-card-depth).
  if (channels === 'rg') {
    if (/\.ktx2($|\?)/i.test(url)) throw new Error(`[impostorTexture] an RG page is uncompressed PNG by construction — ${url}`)
    const tex = new THREE.DataTexture(new Uint8Array([255, 128]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType)
    tex.colorSpace = THREE.NoColorSpace
    tex.needsUpdate = true
    _cache.set(key, tex)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, img.width, img.height).data, W = img.width, H = img.height
      const rg = new Uint8Array(W * H * 2)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // image rows are top-down; a DataTexture's are bottom-up
        const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 2
        rg[o] = px[i]; rg[o + 1] = px[i + 1]
      }
      tex.image = { data: rg, width: W, height: H }
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      tex.onUpdate?.()
    }
    img.onerror = (err) => console.error(`[impostorTexture] ⛔ AO+depth page failed to load — ${url}. This layer will be blank.`, err)
    img.src = url
    return tex
  }
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
