#!/usr/bin/env node
/**
 * claims-browse-frame.mjs — the authored Browse frame (SC.5), checked by
 * READING the source, never by restating it.
 *
 *   node scratch/claims-browse-frame.mjs
 *
 * What it defends, and why each one is a defect that has actually happened:
 *
 *  1. THE BRIDGE IS SHARED. `cameraState`/`cameraPush` were module-private to
 *     StageApp.jsx, so the Stage panel's CAMERA card — the only numeric framing
 *     control in the product — was inert in Cartograph, the app the operator
 *     authors in. It read the module's initial constants and its writes went
 *     into a `pending` nobody drained. A future refactor that re-localises the
 *     bridge, or drops either host's import, reintroduces exactly that.
 *
 *  2. THE FRAME PERSISTS. It must be a DESIGN_FIELD (→ design.json) and be
 *     passed through by bake-scene (→ scene.json). Miss either and the frame is
 *     session-only again, which is the whole bug.
 *
 *  3. ⛔ THE FRAME DOES NOT TRAVEL. `browseFrame` is `{center:[x,z], altitude}`
 *     in the SEED SCENE'S OWN FRAME. Seeding a new town's Look from LS must
 *     strip it, or every poured town inherits LS's camera position and opens on
 *     a plausible-looking view of nowhere. serve.js's residue guard cannot
 *     catch this one — it walks object KEYS for street names, and this is a
 *     numeric VALUE — so the declaration is the only defence.
 *
 *  4. ⛔ THERE IS NO DEFAULT. Absent = the town is unframed and the camera
 *     derives as before. A kit default would be LS's coordinates handed to
 *     every town — the bleed this repo keeps paying for.
 *
 * NOT covered: the live half (drain / publish / record in CameraRig's useFrame,
 * and the apply precedence). That needs a running render loop and the
 * operator's eye — see the report this shipped with.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const FIELD = 'browseFrame'
const fails = []
const ok = []
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)

// ── 1. the bridge is shared ─────────────────────────────────────────────────
const bridge = read('src/stage/cameraBridge.js')
for (const sym of ['cameraState', 'cameraPush', 'pushCamera', 'publishCameraState', 'subscribeCameraState']) {
  check(`bridge exports ${sym}`, new RegExp(`export (const|function) ${sym}\\b`).test(bridge))
}
for (const host of ['src/stage/StageApp.jsx', 'src/cartograph/CartographApp.jsx']) {
  const src = read(host)
  check(`${host} imports the bridge`, /from '\.{1,2}\/(stage\/)?cameraBridge\.js'/.test(src))
  // The bridge must not be re-declared locally — that is how it went private.
  check(`${host} does not re-declare cameraState`,
    !/^\s*(const|let|var)\s+cameraState\s*=/m.test(src))
  check(`${host} does not re-declare cameraPush`,
    !/^\s*(const|let|var)\s+cameraPush\s*=/m.test(src))
}
// Cartograph must actually FILL it, not merely import it.
const carto = read('src/cartograph/CartographApp.jsx')
check('CartographApp publishes to the bridge', /publishCameraState\s*\(/.test(carto))
check('CartographApp drains cameraPush', /cameraPush\.pending/.test(carto))

// ── 2. the frame persists ───────────────────────────────────────────────────
const store = read('src/cartograph/stores/useCartographStore.js')
const designFieldKeys = [...store.matchAll(/\{\s*key:\s*'([^']+)'/g)].map(m => m[1])
check(`${FIELD} is a DESIGN_FIELD`, designFieldKeys.includes(FIELD),
  `design fields parsed: ${designFieldKeys.length}`)
check(`${FIELD} has a store setter`, /setBrowseFrame:\s*\(/.test(store))
const bake = read('cartograph/bake-scene.js')
check(`${FIELD} is baked into scene.json`, new RegExp(`\\b${FIELD}\\s*:`).test(bake))

// ── 3. the frame does not travel ────────────────────────────────────────────
const serve = read('cartograph/serve.js')
// ⚠️ Close on a `]` at the START of a line — the entries carry trailing
// comments like `// [skelId][side][segOrd]`, so a non-greedy `]` stops inside
// the first comment and silently parses one entry.
const stripBlock = serve.match(/const SCENE_KEYED_DESIGN_FIELDS = \[([\s\S]*?)\n\]/)
const stripped = stripBlock
  ? [...stripBlock[1].matchAll(/^\s*'([^']+)'/gm)].map(m => m[1])
  : []
check(`${FIELD} is declared scene-keyed (stripped when seeding another town)`,
  stripped.includes(FIELD), `strip list: ${stripped.join(', ') || '<unparsed>'}`)

// ── 4. no default ───────────────────────────────────────────────────────────
check(`${FIELD} defaults to null in the store`, /browseFrame:\s*null/.test(store))
check(`${FIELD} bakes as null when unauthored`,
  new RegExp(`${FIELD}\\s*:\\s*design\\.${FIELD}\\s*\\|\\|\\s*null`).test(bake))
check(`${FIELD} has no seeded coordinates anywhere`,
  ![store, bake, carto].some(s => new RegExp(`${FIELD}[^\\n]*center:\\s*\\[\\s*-?\\d`).test(s)))

// ── report ──────────────────────────────────────────────────────────────────
for (const o of ok) console.log('  ok   ' + o)
for (const f of fails) console.log('  FAIL ' + f)
console.log(`\n${ok.length} passed, ${fails.length} failed`)
process.exit(fails.length ? 1 : 0)
