/**
 * glLedger — what the page actually hands the GPU, and what it costs the main thread to hand it over. Preview only.
 *
 * Owns: a ledger of every WebGL2 texture, buffer and renderbuffer this page allocates (bytes, by artifact class,
 * net of deletes), the main-thread time of every upload call (an image's decode happens inside its upload, so that
 * time is decode + upload), and the parse time of every `Response.json()`. Installed on import, before three creates
 * its context (src/preview/main.jsx imports it first). Read by StartupPanel and ResidencyPanel.
 * Must never: run in an app a visitor opens — it wraps WebGL2RenderingContext.prototype, an inspection bolt-on.
 *
 * ⭐ Bytes are COMPUTED FROM THE CALLS, not estimated from file size: a texture's bytes are its allocated levels ×
 * its internal format's size; a buffer's are the length handed to bufferData. A format with no known size is
 * counted under `unknownFormats`, never given a default.
 * ⚠️ What it cannot see: work off the main thread (KTX2 transcoding runs in a worker; its upload is counted, its
 * transcode is not), and the driver's own copies (a GPU may pad or keep a second copy; this is what was asked for).
 */
import { artifactClass } from './artifactClass.js'
import { isMarked } from '../lib/startupMarks.js'

const GL = typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null

// Bytes per texel of the internal formats three asks for. Anything else is reported, not guessed.
const BPP = GL ? {
  [GL.RGBA8]: 4, [GL.SRGB8_ALPHA8]: 4, [GL.RGB8]: 3, [GL.SRGB8]: 3, [GL.RG8]: 2, [GL.R8]: 1,
  [GL.RGBA16F]: 8, [GL.RGB16F]: 6, [GL.RG16F]: 4, [GL.R16F]: 2,
  [GL.RGBA32F]: 16, [GL.RGB32F]: 12, [GL.RG32F]: 8, [GL.R32F]: 4,
  [GL.R11F_G11F_B10F]: 4, [GL.RGB10_A2]: 4, [GL.RGBA4]: 2, [GL.RGB565]: 2, [GL.RGB5_A1]: 2,
  [GL.DEPTH_COMPONENT16]: 2, [GL.DEPTH_COMPONENT24]: 4, [GL.DEPTH_COMPONENT32F]: 4,
  [GL.DEPTH24_STENCIL8]: 4, [GL.DEPTH32F_STENCIL8]: 8, [GL.STENCIL_INDEX8]: 1,
  [GL.RGBA]: 4, [GL.RGB]: 3, [GL.LUMINANCE_ALPHA]: 2, [GL.LUMINANCE]: 1, [GL.ALPHA]: 1,
  [GL.R8UI]: 1, [GL.RGBA8UI]: 4, [GL.R32UI]: 4, [GL.R16UI]: 2, [GL.RG32F]: 8,
} : {}

const ledger = {
  textures: new Map(),       // WebGLTexture → { bytes, cls, url, rt }
  buffers: new Map(),        // WebGLBuffer → { bytes }
  renderbuffers: new Map(),  // WebGLRenderbuffer → { bytes }
  uploads: [],               // { cls, url, ms, bytes, after } — `after`: after FIRST TRUTHFUL FRAME
  parses: [],                // { cls, url, ms, chars, after }
  unknownFormats: new Set(),
}
export function getLedger() { return ledger }
if (typeof window !== 'undefined') window.__glLedger = getLedger

const now = () => performance.now()
const after = () => isMarked('first-truthful-frame')
const srcUrl = (s) => (s && (s.currentSrc || s.src)) || null

// Block-compressed formats (KTX2 transcodes to one of these): bytes per 4×4 block. The constants are the extensions'
// (WEBGL_compressed_texture_s3tc / _s3tc_srgb / EXT_texture_compression_bptc / _rgtc / WEBGL_compressed_texture_etc /
// _astc 4×4), by number, so no extension object is needed to read them.
const BLOCK16 = { 0x83F0: 8, 0x83F1: 8, 0x83F2: 16, 0x83F3: 16, 0x8C4C: 8, 0x8C4D: 8, 0x8C4E: 16, 0x8C4F: 16,
  0x8E8C: 16, 0x8E8D: 16, 0x8E8E: 16, 0x8E8F: 16, 0x8DBB: 8, 0x8DBC: 8, 0x8DBD: 16, 0x8DBE: 16,
  0x9270: 8, 0x9271: 8, 0x9272: 16, 0x9273: 16, 0x9274: 8, 0x9275: 8, 0x9276: 8, 0x9277: 8, 0x9278: 16, 0x9279: 16,
  0x93B0: 16, 0x93D0: 16 }

function levelBytes(fmt, w, h, d, levels) {
  const bpp = BPP[fmt], block = BLOCK16[fmt]
  if (!bpp && !block) { ledger.unknownFormats.add('0x' + fmt.toString(16)); return 0 }
  let b = 0
  for (let i = 0; i < levels; i++) {
    const lw = Math.max(1, w >> i), lh = Math.max(1, h >> i), ld = Math.max(1, d >> i)
    b += block ? Math.ceil(lw / 4) * Math.ceil(lh / 4) * block * ld : lw * lh * ld * bpp
  }
  return b
}

function install() {
  // The browser keeps 250 Resource Timing entries by default; Vite's dev modules alone are ~235, so the slab's files
  // fell off the end and read as never fetched. Keep them all (StartupPanel reads them).
  if (typeof performance !== 'undefined' && performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(20000)
  if (!GL || GL.prototype.__glLedger) return
  GL.prototype.__glLedger = true
  const P = GL.prototype
  const bound = new WeakMap()   // gl → { tex: {target → texture}, buf: {target → buffer}, rb }
  const state = (gl) => { let s = bound.get(gl); if (!s) bound.set(gl, s = { tex: {}, buf: {}, rb: null }); return s }
  const wrap = (name, fn) => { const orig = P[name]; P[name] = function (...a) { return fn.call(this, orig, a) } }
  const tex = (gl, target) => {
    const t = state(gl).tex[target === gl.TEXTURE_CUBE_MAP_POSITIVE_X || (target > gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z) ? gl.TEXTURE_CUBE_MAP : target]
    if (!t) return null
    let e = ledger.textures.get(t)
    if (!e) ledger.textures.set(t, e = { bytes: 0, cls: null, url: null, rt: false })
    return e
  }
  const timed = (orig, gl, a, entry, bytes) => {
    const t0 = now()
    const r = orig.apply(gl, a)
    ledger.uploads.push({ cls: entry?.cls || null, url: entry?.url || null, ms: now() - t0, bytes, after: after() })
    return r
  }

  wrap('bindTexture', function (orig, a) { state(this).tex[a[0]] = a[1]; return orig.apply(this, a) })
  wrap('bindBuffer', function (orig, a) { state(this).buf[a[0]] = a[1]; return orig.apply(this, a) })
  wrap('bindRenderbuffer', function (orig, a) { state(this).rb = a[1]; return orig.apply(this, a) })

  wrap('texStorage2D', function (orig, [target, levels, fmt, w, h]) {
    const e = tex(this, target); const faces = target === this.TEXTURE_CUBE_MAP ? 6 : 1
    if (e) e.bytes = levelBytes(fmt, w, h, 1, levels) * faces
    return orig.call(this, target, levels, fmt, w, h)
  })
  wrap('texStorage3D', function (orig, [target, levels, fmt, w, h, d]) {
    const e = tex(this, target)
    if (e) e.bytes = levelBytes(fmt, w, h, target === this.TEXTURE_3D ? d : 1, levels) * (target === this.TEXTURE_3D ? 1 : d)
    return orig.call(this, target, levels, fmt, w, h, d)
  })
  // texImage2D: (target, level, internalformat, w, h, border, format, type, src) or (target, level, internalformat, format, type, src)
  wrap('texImage2D', function (orig, a) {
    const e = tex(this, a[0])
    const src = a.length === 6 ? a[5] : a[8]
    const w = a.length === 6 ? (src?.naturalWidth || src?.videoWidth || src?.width || 0) : a[3]
    const h = a.length === 6 ? (src?.naturalHeight || src?.videoHeight || src?.height || 0) : a[4]
    const bytes = levelBytes(a[2], w, h, 1, 1)
    if (e && a[1] === 0) { e.bytes = Math.max(e.bytes, bytes); const u = srcUrl(src); if (u) { e.url = u; e.cls = artifactClass(u) } }
    return src ? timed(orig, this, a, e, bytes) : orig.apply(this, a)
  })
  wrap('texSubImage2D', function (orig, a) {
    const e = tex(this, a[0])
    const src = a[a.length - 1]
    const u = srcUrl(src); if (e && u) { e.url = u; e.cls = artifactClass(u) }
    return timed(orig, this, a, e, ArrayBuffer.isView(src) ? src.byteLength : 0)
  })
  wrap('texSubImage3D', function (orig, a) { return timed(orig, this, a, tex(this, a[0]), ArrayBuffer.isView(a[a.length - 1]) ? a[a.length - 1].byteLength : 0) })
  wrap('texImage3D', function (orig, a) {
    const e = tex(this, a[0]); const bytes = levelBytes(a[2], a[3], a[4], a[5], 1)
    if (e && a[1] === 0) e.bytes = Math.max(e.bytes, bytes)
    return timed(orig, this, a, e, bytes)
  })
  for (const name of ['compressedTexImage2D', 'compressedTexImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D']) {
    wrap(name, function (orig, a) {
      const e = tex(this, a[0]); const data = a.find((x) => ArrayBuffer.isView(x))
      const bytes = data?.byteLength || 0
      if (e && name.startsWith('compressedTexImage')) e.bytes += bytes
      return timed(orig, this, a, e, bytes)
    })
  }
  wrap('generateMipmap', function (orig, a) { const e = tex(this, a[0]); if (e && !e.mipped) { e.mipped = true; e.bytes = Math.round(e.bytes * 4 / 3) } return orig.apply(this, a) })
  wrap('framebufferTexture2D', function (orig, a) { const e = a[3] && ledger.textures.get(a[3]); if (e) e.rt = true; return orig.apply(this, a) })
  wrap('framebufferTextureLayer', function (orig, a) { const e = a[2] && ledger.textures.get(a[2]); if (e) e.rt = true; return orig.apply(this, a) })
  wrap('deleteTexture', function (orig, a) { ledger.textures.delete(a[0]); return orig.apply(this, a) })

  wrap('bufferData', function (orig, a) {
    const b = state(this).buf[a[0]]
    const bytes = typeof a[1] === 'number' ? a[1] : (a[1]?.byteLength || 0)
    if (b) ledger.buffers.set(b, { bytes })
    const t0 = now()
    const r = orig.apply(this, a)
    ledger.uploads.push({ cls: 'geometry', url: null, ms: now() - t0, bytes, after: after() })
    return r
  })
  wrap('deleteBuffer', function (orig, a) { ledger.buffers.delete(a[0]); return orig.apply(this, a) })

  const rbStore = function (orig, a) {
    const rb = state(this).rb
    const [samples, fmt, w, h] = a.length === 5 ? [a[1], a[2], a[3], a[4]] : [1, a[1], a[2], a[3]]
    if (rb) ledger.renderbuffers.set(rb, { bytes: levelBytes(fmt, w, h, 1, 1) * Math.max(1, samples) })
    return orig.apply(this, a)
  }
  wrap('renderbufferStorage', rbStore)
  wrap('renderbufferStorageMultisample', rbStore)
  wrap('deleteRenderbuffer', function (orig, a) { ledger.renderbuffers.delete(a[0]); return orig.apply(this, a) })

  // JSON parse time, apart from the body's arrival: read the text, then time the parse alone.
  if (typeof Response !== 'undefined') {
    Response.prototype.json = async function () {
      const text = await this.text()
      const t0 = now()
      const v = JSON.parse(text)
      ledger.parses.push({ cls: artifactClass(this.url), url: this.url, ms: now() - t0, chars: text.length, after: after() })
      return v
    }
  }
}

install()
