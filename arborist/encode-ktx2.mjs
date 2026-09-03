/**
 * encode-ktx2.mjs — the ONE place a page becomes KTX2.
 *
 * ⛔ THE PAGES ARE BORN COMPRESSED. A capture handler encodes on write and
 * declares the .ktx2, so the manifest never carries a .png for the runtime to
 * load. This is the fix for the ordering trap that pack-impostor-ktx2.mjs
 * could not close on its own: that packer runs inside POST /grove/bake, but
 * the GPU capture passes (OverheadBaker / HeroImpostorBaker) run in the
 * BROWSER, after that request returns, and merge their own page paths into
 * trees-atlas.json. Nothing re-packed afterwards, so every bake that captured
 * anything silently reverted the compression — and it reverted MORE the better
 * the bake went. Measured 2026-09-03 on lafayette-square: 420 of 426 declared
 * pages had gone back to PNG, 77.9 MB where KTX2 is 22.3 MB, while every
 * .ktx2 sat un-referenced on disk. Nothing was on fire; the slab just shipped
 * 3.5x the impostor VRAM and looked like a clean bake, because PNG pages
 * render perfectly on the desktop doing the baking.
 *
 * ⛔ NO FALLBACK. A missing or failing encoder THROWS. Declaring the .png
 * "just this once" is precisely the plausible-looking success that hides the
 * regression, so the caller fails its request instead.
 */
import { execFileSync } from 'child_process'
import { existsSync, statSync } from 'fs'

let checked = false

/** Throws unless `basisu` is on PATH. Cached — the probe runs once per process. */
export function assertEncoder() {
  if (checked) return
  try { execFileSync('basisu', ['-version'], { stdio: 'ignore' }) }
  catch {
    throw new Error('`basisu` is not on PATH — install it (brew install basis_universal). '
      + 'Refusing to declare a page without encoding it.')
  }
  checked = true
}

/**
 * Encode one PNG to KTX2 beside itself. Returns { out, encoded }.
 * Skips when a .ktx2 already exists and is no older than its source, so a
 * re-bake that re-shot nothing pays nothing. `force` re-encodes regardless.
 *
 * ETC1S (basisu's default) + y_flip + mipmaps. -q 255 is the top ETC1S
 * quality level; the pool is authored once and served forever, so encode time
 * is irrelevant and quality is not.
 */
export function encodeToKtx2(srcPng, { force = false } = {}) {
  assertEncoder()
  if (!existsSync(srcPng)) throw new Error(`no such page to encode: ${srcPng}`)
  const out = srcPng.replace(/\.png$/i, '.ktx2')
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(srcPng).mtimeMs) {
    return { out, encoded: false }
  }
  execFileSync('basisu', ['-ktx2', '-y_flip', '-mipmap', '-q', '255', '-file', srcPng, '-output_file', out], { stdio: 'ignore' })
  // basisu can exit 0 having written nothing; an unverified success here would
  // point the manifest at a file that does not exist.
  if (!existsSync(out)) throw new Error(`basisu exited 0 but wrote no output for ${srcPng}`)
  return { out, encoded: true }
}
