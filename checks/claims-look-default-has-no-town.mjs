#!/usr/bin/env node
/**
 * "IS THE KIT'S 0-STATE A KIT, OR IS IT A TOWN?" — A11 / A00, the root gate.
 *
 * WHY THIS EXISTS (2026-09-19). `public/looks/index.json`'s `default` is the
 * Look every new pour seeds from and the id the client falls back to when it
 * cannot resolve one. It was `lafayette-square` — so the kit's zero state WAS a
 * real, heavily-authored town, and four towns shipped carrying its channels.
 * A00's standing ruling: "falling back to a generic is fine; falling back to
 * Lafayette Square is the thing that must never happen."
 *
 * ⭐ THE SIBLING CHECK (`claims-look-seed-scene-clean`) ASKS A DIFFERENT
 * QUESTION and passing it is not enough. It asks "does the SEED STRIP the
 * seed's scene-keyed fields?" — a question about the copier. This asks "is the
 * thing being copied a town at all?" A seed that strips perfectly still hands
 * every new town LS's sky, labels and camera, because those are not scene-keyed
 * and the strip is not supposed to catch them. ⛔ A check comparing a new Look
 * to LS passes trivially for a town whose street names don't collide, which is
 * exactly how this survived four pours — so this asserts a PROPERTY OF THE
 * DEFAULT ITSELF and never compares two towns.
 *
 * ⭐ READS THE SOURCE, DOES NOT RESTATE IT: the scene-keyed field list is
 * lifted out of `cartograph/serve.js` at run time, and the hydrator shapes out
 * of the store. Rename or delete either and this fails loudly.
 *
 * ⛔ READ-ONLY. Reads public/looks/**, cartograph/serve.js, src/cartograph/**.
 *
 * MUTATION TEST (run it; a check only ever seen to pass is not evidence):
 *   node -e "const f='public/looks/index.json',j=require('./'+f);j.default='lafayette-square';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
 *   node checks/claims-look-default-has-no-town.mjs   # ⇒ must FAIL
 *   git checkout public/looks/index.json
 *
 * THE KIT'S DAY (2026-09-27, BRIEF-tod-kit-default). The default's time-of-day channels are a designed day in the
 * CODE (skyLightChannels.js#kitDayChannel), not in the empty 0-state file. The same rule — a property of the default,
 * never a comparison that passes for a town nobody looked at — applies: every day channel is keyed at every sun
 * moment (a blank tile only where a light is marked ▲/▼ off), no day channel is any town's Look copied in, and an
 * unauthored channel reaches the day on all three paths (Stage hydrate, the bake, production first paint).
 * MUTATION: ▶ node checks/claims-look-default-has-no-town.mjs --mutate  (each must FAIL; the run reports it)
 *
 * Usage: node checks/claims-look-default-has-no-town.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { KIT_DAY_CHANNELS, kitDayChannel } from '../src/cartograph/skyLightChannels.js'
import { NAMED_TOD_SLOTS, todEdge } from '../src/cartograph/animatedParam.js'

const ROOT       = new URL('..', import.meta.url).pathname
const PUBLIC_DIR = join(ROOT, 'public')
const SERVE      = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8')
const STORE      = readFileSync(join(ROOT, 'src/cartograph/stores/useCartographStore.js'), 'utf8')

const readJsonOrNull = (p) => { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }

// ── lift SCENE_KEYED_DESIGN_FIELDS out of serve.js rather than copying it ────
function constArray(src, name) {
  const start = src.search(new RegExp(`^const ${name}\\s*=\\s*\\[`, 'm'))
  if (start < 0) return null
  let i = src.indexOf('[', start)
  for (let depth = 0; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']' && --depth === 0) {
      return new Function(`return ${src.slice(src.indexOf('[', start), i + 1)}`)()
    }
  }
  return null
}
const SCENE_KEYED = constArray(SERVE, 'SCENE_KEYED_DESIGN_FIELDS')
if (!SCENE_KEYED) {
  console.error('⛔ FAIL — cartograph/serve.js no longer declares SCENE_KEYED_DESIGN_FIELDS.')
  process.exit(2)
}

// Channels that encode a PLACE or a town's own composition — read from the one declaration the seed strip also uses
// (cartograph/lookDesign.mjs#PLACE_DESIGN_FIELDS), never copied here.
const { PLACE_DESIGN_FIELDS: CAMERA_AND_PLACE } = await import(join(ROOT, 'cartograph/lookDesign.mjs'))

const idx = readJsonOrNull(join(PUBLIC_DIR, 'looks/index.json'))
if (!idx) { console.error('⛔ FAIL — public/looks/index.json unreadable.'); process.exit(2) }
const entry  = (idx.looks || []).find(l => l.id === idx.default)
const design = readJsonOrNull(join(PUBLIC_DIR, 'looks', String(idx.default), 'design.json'))

// ⛔ A VACUOUS PASS IS A LIE IN GREEN INK. `design` is null when the 0-state's
// design.json is absent or unparseable — and the three "carries no X" assertions
// below are all satisfied BY NOTHING BEING THERE, so they reported ✅ about a file
// that did not exist. The run still failed on the existence check, but three green
// ticks were asserting a path they never touched. Every assertion that reads
// `design` must first refuse to run without it.
// (Caught 2026-09-19 by hiding the file and reading the output, after a peer shipped
// a gate whose --dry-run returned before the line it claimed to have mutation-tested.)
const needDesign = () => design ? null
  : 'NOT MEASURED — the default Look has no readable design.json, so this asserts nothing'

let pass = 0, fail = 0
const check = (label, fn) => {
  try { const why = fn(); if (why) { console.log(`  ⛔ FAIL  ${label}\n           ${why}`); fail++ } else { console.log(`  ✅ pass  ${label}`); pass++ } }
  catch (err) { console.log(`  ⛔ THREW ${label}\n           ${err.message}`); fail++ }
}

console.log(`\nKIT 0-STATE — is the default Look a kit, or a town?\ndefault: "${idx.default}"  ·  scene-keyed fields read from serve.js: ${SCENE_KEYED.join(', ')}\n`)

check('index.json names a default Look, and it exists on disk', () => {
  if (!idx.default) return 'index.json has no `default` — nothing defines the 0-state'
  if (!entry) return `index.default is "${idx.default}" but no entry with that id exists`
  if (!design) return `public/looks/${idx.default}/design.json is missing or unreadable`
  return null
})

check('the default Look is NOT a town — its entry binds no scene', () => (
  // ⛔ No entry ⇒ `entry?.scene` is undefined ⇒ this would pass on nothing.
  !entry ? `NOT MEASURED — index.default is "${idx.default}" but no entry with that id exists` :
  entry.scene
    ? `the 0-state is bound to scene "${entry.scene}". A town cannot be the kit's default: ` +
      `every new Look seeds from it and every unresolved client falls back to it (A00).`
    : null
))

check('the default Look carries no scene-keyed authoring', () => {
  const v = needDesign(); if (v) return v
  const found = SCENE_KEYED.filter(f => design?.[f] != null &&
    (typeof design[f] !== 'object' || Object.keys(design[f]).length))
  return found.length ? `carries ${found.join(', ')} — a town's own keys are the kit's 0-state` : null
})

check('the default Look stores no CAMERA and no PLACE', () => {
  const v = needDesign(); if (v) return v
  const found = CAMERA_AND_PLACE.filter(f => design?.[f] != null &&
    (!Array.isArray(design[f]) || design[f].length))
  return found.length
    ? `carries ${found.join(', ')} — these are coordinates in some town's LOCAL frame, ` +
      `so they mean nothing in town #2. The opening view is derived from the scene's own extent.`
    : null
})

check('the 0-state RESTATES NOTHING — design.json is empty, so it cannot drift from the defaults', () => {
  const v = needDesign(); if (v) return v
  const keys = Object.keys(design)
  return keys.length
    ? `design.json declares ${keys.length} channel(s): ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '…' : ''}. ` +
      `Every channel already has a kit default in the store's DESIGN_FIELDS; writing them here copies ` +
      `the source and goes stale the next time a default moves.`
    : null
})

// ── the door the carry came through ─────────────────────────────────────────
check('no design hydrator can reach live store state (`d.X || get().X` is the carry)', () => {
  const start = STORE.search(/^const DESIGN_FIELDS = \[/m)
  if (start < 0) return 'src/cartograph/stores/useCartographStore.js no longer declares DESIGN_FIELDS'
  let i = STORE.indexOf('[', start), end = -1
  for (let depth = 0; i < STORE.length; i++) {
    if (STORE[i] === '[') depth++
    else if (STORE[i] === ']' && --depth === 0) { end = i; break }
  }
  const block = STORE.slice(start, end + 1)
  const bad = [...block.matchAll(/hydrate:\s*\(\s*d\s*,\s*(\w+)/g)].map(m => m[0])
  if (bad.length) {
    return `${bad.length} hydrator(s) take a second parameter: ${bad.join(' · ')}. ` +
           `A hydrator that can read live state writes "whatever the LAST Look left here" into ` +
           `the Look being opened — absence stops meaning "the kit default" and starts meaning "inherit".`
  }
  if (/for \(const f of DESIGN_FIELDS\) out\[f\.key\] = f\.hydrate\(design,/.test(STORE)) {
    return 'hydrateDesign() still forwards a second argument to the hydrators — the door is open'
  }
  return null
})

check('no client module hardcodes a Look id that names a town', () => {
  const townIds = new Set((idx.looks || []).filter(l => l.scene).map(l => l.id))
  // ⛔ With no town-bound Looks there is nothing a literal COULD name, so a green
  // tick here would mean "we looked for nothing and did not find it".
  if (!townIds.size) return 'NOT MEASURED — no Look in the index binds a scene, so no literal can be recognised as naming a town'
  const bad = []
  for (const rel of ['src/cartograph/stores/useCartographStore.js', 'src/cartograph/Toolbar.jsx']) {
    const p = join(ROOT, rel)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    for (const m of src.matchAll(/^\s*const\s+(\w*LOOK_ID\w*)\s*=\s*['"]([^'"]+)['"]/gm)) {
      if (townIds.has(m[2])) bad.push(`${rel}: ${m[1]} = '${m[2]}'`)
    }
  }
  return bad.length
    ? `${bad.join(' · ')} — the 0-state id is SERVED (index.json \`default\`); a literal in the ` +
      `browser bundle is the client's own copy of "when in doubt, use that town".`
    : null
})

// ⛔ THE FAILURE MODE THIS CHANGE CREATED. Making the 0-state `{}` means an empty
// design is now a LEGITIMATE, EXPECTED shape — so a design.json that is present
// but unparseable must not also produce `{}`, or a damaged file renders as the
// pristine kit default and the next autosave overwrites the real one.
check('a damaged design.json cannot masquerade as the kit default', () => {
  const start = SERVE.search(/^function readLookDesign\(/m)
  if (start < 0) return 'serve.js no longer declares readLookDesign() — absent and corrupt are indistinguishable again'
  let i = SERVE.indexOf('{', start), body = ''
  for (let depth = 0; i < SERVE.length; i++) {
    if (SERVE[i] === '{') depth++
    else if (SERVE[i] === '}' && --depth === 0) { body = SERVE.slice(start, i + 1); break }
  }
  if (!/throw/.test(body)) return 'readLookDesign() does not throw on an unparseable file — it reports {} instead'
  if (!/existsSync/.test(body)) return 'readLookDesign() does not distinguish absent from unreadable'
  // Every design read must go through it; a stray `readJsonOrNull(lookDesignPath(...)) || {}` reopens the hole.
  const strays = [...SERVE.matchAll(/readJsonOrNull\(lookDesignPath\([^)]*\)\)\s*\|\|\s*\{\}/g)]
  return strays.length ? `${strays.length} design read(s) still use \`readJsonOrNull(lookDesignPath(..)) || {}\`` : null
})

check('POST /looks refuses a Look it cannot bind to a scene', () => (
  /const newScene = .*\|\|\s*DEFAULT_MAP/.test(SERVE)
    ? 'serve.js still falls back to DEFAULT_MAP when no scene can be resolved — ' +
      'a Look whose town we cannot name is unbuildable, not an LS Look'
    : null
))

check('the store declares no Lafayette Square hero path as the kit default', () => {
  // ⛔ Balance the brackets — a naive /\[[^\]]*\]/ stops at the `]` INSIDE a
  // `position: [x,y,z]` and hands `new Function` a fragment, so the check THROWS
  // where it should FAIL. Caught mutation-testing this file (2026-09-19).
  const v = constArray(STORE, 'HERO_KEYFRAMES_DEFAULT')
  if (!v) return 'useCartographStore no longer declares HERO_KEYFRAMES_DEFAULT'
  return v.length
    ? `HERO_KEYFRAMES_DEFAULT holds ${v.length} keyframe(s) — a hero path is a coordinate in ONE town's frame`
    : null
})

// ── THE KIT'S DAY ─────────────────────────────────────────────────────────────────────────────────────────────
const SLOTS = NAMED_TOD_SLOTS.map(s => s.id)
function dayGaps(ch) {
  if (ch?.animated !== 'tod') return 'not keyed by time of day'
  const missing = SLOTS.filter(id => !(id in (ch.values || {})))
  if (!missing.length) return null
  // A blank tile is legitimate only as a light's OFF stretch: some key fades up into the keys after it and some key
  // fades down out of the keys before it (animatedParam.js#todEdge validates each mark against its neighbours).
  const up = SLOTS.some(id => todEdge(ch, id)?.fade === 'up'), down = SLOTS.some(id => todEdge(ch, id)?.fade === 'down')
  return up && down ? null : `blank at ${missing.join(', ')} with no ▲/▼ marks — a hole, not an off stretch`
}
const dayProblems = (get) => KIT_DAY_CHANNELS.flatMap(k => { const g = dayGaps(get(k)); return g ? [`${k}: ${g}`] : [] })
check(`the kit's day keys every channel at every sun moment (${SLOTS.length} slots: ${SLOTS.join(' · ')})`, () => {
  const bad = dayProblems(kitDayChannel)
  return bad.length ? bad.join(' · ') : null
})

const townLooks = (idx.looks || []).filter(l => l.scene).map(l => l.id)
const towns = Object.fromEntries(townLooks.map(id => [id, readJsonOrNull(join(PUBLIC_DIR, 'looks', id, 'design.json'))]).filter(([, d]) => d))
const copiedFrom = (get) => KIT_DAY_CHANNELS.flatMap(k => Object.entries(towns)
  .filter(([, d]) => d[k] && JSON.stringify(d[k]) === JSON.stringify(get(k))).map(([id]) => `${k} = ${id}'s`))
check("no channel of the kit's day is a town's Look copied in", () => {
  if (!Object.keys(towns).length) return 'NOT MEASURED — no town-bound Look is readable'
  const c = copiedFrom(kitDayChannel)
  return c.length ? `${c.join(' · ')} — the default day must be designed, not one town's authoring` : null
})

// Every path an unauthored channel travels must land on the day: a path that seeds its own flat default hands that
// town a different day in Stage, in the slab and on first paint.
const BAKE = readFileSync(join(ROOT, 'cartograph/bake-scene.js'), 'utf8')
const PROD = ['components', 'cartograph'].flatMap(dir => readdirSync(join(ROOT, 'src', dir)).filter(f => /\.jsx?$/.test(f))
  .map(f => readFileSync(join(ROOT, 'src', dir, f), 'utf8'))).join('\n')
const unreached = (bake, prod) => KIT_DAY_CHANNELS.flatMap(k => {
  const out = []
  const inBake = new RegExp(`\\b${k}:\\s*design\\.${k}\\s*\\|\\|\\s*kitDayChannel\\('${k}'\\)`).test(bake) || (k === 'archLight' && /migrateArchLight\(design\)/.test(bake))
  if (!inBake) out.push(`${k}: bake-scene does not seed the day`)
  if (!new RegExp(`kitDayChannel\\('${k}'\\)`).test(prod)) out.push(`${k}: no production consumer first-paints the day`)
  return out
})
check('an unauthored channel reaches the day in the bake and in production', () => {
  const u = unreached(BAKE, PROD)
  return u.length ? u.join(' · ') : null
})
check('Stage hydrates an absent day channel to the day, and never writes the unchanged day back', () => {
  if (!/const _kit = \(key, d, migrate\) => \(d\[key\] == null && kitDayChannel\(key\)\)/.test(STORE)) return 'the store has no _kit hydrator — an absent channel hydrates to flat defaults'
  if (!/for \(const k of KIT_DAY_CHANNELS\) if \(k in out && JSON\.stringify\(out\[k\]\) === JSON\.stringify\(kitDayChannel\(k\)\)\) delete out\[k\]/.test(STORE))
    return 'serializeDesign writes an unchanged day channel into the town — the next change to the kit day would never reach it'
  return null
})

// ── mutation tests: each property must be SEEN to fail ────────────────────────────────────────────────────────
if (process.argv.includes('--mutate')) {
  console.log('\nMUTATIONS (each must be caught):')
  const holed = (k) => { const c = kitDayChannel(k); if (k === 'bloom') delete c.values.deep; return c }
  const m1 = dayProblems(holed).length > 0
  const firstTown = Object.keys(towns).find(id => KIT_DAY_CHANNELS.some(k => towns[id][k]))
  const firstKey = firstTown && KIT_DAY_CHANNELS.find(k => towns[firstTown][k])
  const m2 = firstTown ? copiedFrom(k => k === firstKey ? towns[firstTown][k] : kitDayChannel(k)).length > 0 : null
  const m3 = unreached(BAKE.replace("kitDayChannel('mist')", "{ values: { ...MIST_FLAT_DEFAULTS } }"), PROD).length > 0
  for (const [label, caught] of [['bloom loses its Deep night key', m1], [`the kit copies ${firstTown}'s ${firstKey}`, m2], ['the bake seeds mist flat', m3]]) {
    if (caught === null) { console.log(`  ⚠️  NOT MEASURED  ${label} (no town carries a day channel to copy)`); continue }
    console.log(`  ${caught ? '✅ caught' : '⛔ MISSED'}  ${label}`); caught ? pass++ : fail++
  }
}

console.log(`\n${fail ? '⛔' : '✅'} ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
