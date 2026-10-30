/**
 * slab-wire.mjs — the bytes a slab file is STORED as (node side of `src/lib/slabWire.js`, which holds the rule and stays
 * free of zlib so the Workers can import it). Read by the uploader (what it puts and what its dirty check compares),
 * verify, and the prod-slab backup. ⭐ Brotli at one quality is deterministic for one zlib build, so the same file encodes
 * to the same bytes and an unchanged file stays skipped; a Node upgrade that changes zlib re-uploads every stored-br file
 * once (safe: the content names do not change). ▶ node checks/claims-the-slab-ships-compressed.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { brotliCompress, brotliCompressSync, constants } from 'node:zlib'
import { promisify } from 'node:util'
import { storedEncodingFor, BR_QUALITY } from '../src/lib/slabWire.js'

const brotli = promisify(brotliCompress)
const md5 = (b) => createHash('md5').update(b).digest('hex')

const params = (raw) => ({ params: { [constants.BROTLI_PARAM_QUALITY]: BR_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
/** The bytes a stored-br file is stored as. (Sync form for a report inside a synchronous bake.) */
export const encodeBytes = (raw) => brotli(raw, params(raw))
export const encodeBytesSync = (raw) => brotliCompressSync(raw, params(raw))

let _dir = null
const _wire = new Map()   // abs → Promise<wire>

/**
 * What `abs` (published under `path`) is stored as: { abs, bytes, md5, encoding }. Stored raw → the file itself,
 * encoding null; stored br → its brotli bytes, written once to a temp file (a file published under two keys — its
 * content name and its plain key — is encoded once).
 */
export function wireOf(abs, path) {
  const enc = storedEncodingFor(path)
  const k = `${enc}\0${abs}`
  if (!_wire.has(k)) {
    _wire.set(k, (async () => {
      const raw = readFileSync(abs)
      if (!enc) return { abs, bytes: raw.length, md5: md5(raw), encoding: null }
      const body = await encodeBytes(raw)
      _dir ??= mkdtempSync(join(tmpdir(), 'slab-wire-'))
      const out = join(_dir, `${_wire.size}-${basename(abs)}.br`)
      writeFileSync(out, body)
      return { abs: out, bytes: body.length, md5: md5(body), encoding: enc }
    })())
  }
  return _wire.get(k)
}
