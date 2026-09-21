/**
 * claims-ground-textures-are-anisotropic
 *
 * ⭐ THE CLASS: a texture sampled on a GRAZING-ANGLE surface, left at three.js'
 * default anisotropy of 1. The ground is the one surface in this kit that is
 * always seen almost edge-on — the hero camera is low and it moves — so at
 * anisotropy 1 trilinear filtering picks its mip from the worst-case axis, the
 * mip level walks as the camera moves, and the painted markings CRAWL.
 *
 * ⛔ Why a check and not a comment: `antialias: true` is MSAA. It antialiases
 * GEOMETRY EDGES and does nothing for texture interiors, so the canvas looks
 * correctly configured while the ground shimmers. Nothing throws, nothing logs,
 * and it is worst where there are fewest pixels per metre of ground — i.e. it
 * reads as a "small viewport" or "phone" defect and is neither.
 *
 * ⛔ NO FALLBACK: this reads the source rather than restating it. Add a fourth
 * ground texture and the check finds it and demands a ruling.
 *
 * The rule, per texture loaded into the ground: EITHER it carries an explicit
 * `.anisotropy = ` assignment, OR it has explicitly opted out of mipmaps
 * (`generateMipmaps = false`) — anisotropic filtering samples the mip chain, so
 * with no chain there is nothing to ask for and the opt-out is the ruling.
 * Silence — neither line — is the defect this exists to catch.
 */
import fs from 'node:fs'

const FILE = 'src/components/BakedGround.jsx'
const src = fs.readFileSync(FILE, 'utf8')

// Find every texture the ground loads, by reading the source — never a list.
const loaded = [...src.matchAll(/const\s+(\w+)\s*=\s*\w+\s*\?\s*useLoader\(\s*THREE\.TextureLoader/g)]
  .map((m) => m[1])

const fails = []
if (loaded.length === 0) {
  fails.push(`⛔ found NO ground textures in ${FILE}. The check cannot see its subject — ` +
             `either the load path was rewritten or this pattern went stale. Fix the check, do not delete it.`)
}

for (const name of loaded) {
  const hasAniso = new RegExp(`\\b${name}\\.anisotropy\\s*=`).test(src)
  const optedOut = new RegExp(`\\b${name}\\.generateMipmaps\\s*=\\s*false`).test(src)
  if (!hasAniso && !optedOut) {
    fails.push(
      `⛔ '${name}' is sampled on the ground at three.js' DEFAULT anisotropy (1), and has not ` +
      `opted out of mipmaps. On a grazing-angle surface that crawls under camera motion. ` +
      `▶ set ${name}.anisotropy from gl.capabilities.getMaxAnisotropy() (never a bare constant), ` +
      `or set ${name}.generateMipmaps = false and say in a comment why this map has no edges to crawl.`)
  }
}

// The value must be DERIVED. A constant that happens to suit one GPU is Class D.
if (/\.anisotropy\s*=\s*\d+/.test(src)) {
  fails.push(`⛔ a ground texture sets anisotropy to a LITERAL. Ask the GPU: ` +
             `gl.capabilities.getMaxAnisotropy(). A hardcoded 16 is silently clamped on hardware ` +
             `that cannot do it, and a hardcoded 4 leaves quality on the table on hardware that can.`)
}

if (fails.length) {
  console.error(`FAIL claims-ground-textures-are-anisotropic (${loaded.length} ground textures read from source)`)
  for (const f of fails) console.error('  ' + f)
  process.exit(1)
}
console.log(`PASS claims-ground-textures-are-anisotropic — ${loaded.length} ground textures, each either anisotropic or explicitly mipless: ${loaded.join(', ')}`)
