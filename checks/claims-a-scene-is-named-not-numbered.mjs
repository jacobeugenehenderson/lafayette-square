#!/usr/bin/env node
/**
 * claims-a-scene-is-named-not-numbered.mjs — a neighborhood's scene id is the slug
 * of its NAME, never a ZIP or other bare number.
 *
 *   node checks/claims-a-scene-is-named-not-numbered.mjs
 *
 * Jacob: "Naming the scene from the ZIP isn't acceptable." A ZIP search made a town
 * called `02657`; `44839` once sat in the picker the same way. The rule lives in
 * src/lib/sceneSlug.js (shared by the Extent panel and serve.js). This defends:
 *
 *  1. THE SLUG RULES — the table below, run against the real function.
 *  2. THE REFUSALS — an empty, symbol-only or numeric name yields no scene id.
 *  3. THE SUGGESTION — a ZIP geocode suggests its locality; ZIPs that disagree
 *     suggest nothing (the operator names it).
 *  4. NO SCENE ON DISK, AND NO LOOK, IS NUMBERED — cartograph/data/<id>/ and
 *     public/looks/index.json.
 *  5. THE WIRING — the Extent search no longer slugs the query, Fetch names the
 *     scene with sceneIdForName, and serve.js refuses numeric scene ids.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const { slugifyName, sceneIdForName, suggestedName, isNumericId } =
  await import(pathToFileURL(join(ROOT, 'src/lib/sceneSlug.js')).href)

const fails = []
const ok = []
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)

// ── 1. the slug table (display name → scene id) ─────────────────────────────
const TABLE = [
  ['Provincetown', 'provincetown'],
  ['The Cloisters', 'the-cloisters'],        // no article stripping
  ['Księży Młyn', 'ksiezy-mlyn'],             // ł folded, not dropped (was ksi-y-m-yn)
  ['Lafayette Square', 'lafayette-square'],
  ['HiPointe-DeMun', 'hipointe-demun'],
  ['Hi-Pointe + De Mun', 'hi-pointe-de-mun'],
  ['  São Paulo  ', 'sao-paulo'],
  ['Straße am Ørsted', 'strasse-am-orsted'],
  ['Huron OH', 'huron-oh'],
  ['District 9', 'district-9'],               // digits are fine beside letters
]
for (const [name, want] of TABLE) {
  const got = sceneIdForName(name).id
  check(`"${name}" → ${want}`, got === want, got === want ? '' : `got ${JSON.stringify(got)}`)
}

// ── 2. refusals ─────────────────────────────────────────────────────────────
for (const name of ['', '   ', '02657', '44839, 44870', '12345-6789', '—']) {
  const r = sceneIdForName(name)
  check(`"${name}" is refused`, !r.id && !!r.error, r.id ? `got id ${r.id}` : '')
}

// ── 3. the suggestion ───────────────────────────────────────────────────────
const zip = (d) => ({ ok: true, displayName: d })
check('a ZIP suggests its locality',
  suggestedName([zip('02657, Provincetown, Barnstable County, Massachusetts, United States')]) === 'Provincetown')
check('ZIPs in two towns suggest nothing',
  suggestedName([zip('44839, Huron, Erie County, Ohio'), zip('44870, Sandusky, Erie County, Ohio')]) === '')
check('ZIPs in one town suggest it',
  suggestedName([zip('44839, Huron, Erie County, Ohio'), zip('44839-1234, Huron, Ohio')]) === 'Huron')

// ── 4. nothing on disk is numbered ──────────────────────────────────────────
const dataDir = join(ROOT, 'cartograph/data')
const numberedDirs = readdirSync(dataDir).filter((d) => statSync(join(dataDir, d)).isDirectory() && isNumericId(d))
check('no cartograph/data/<scene> is a number', numberedDirs.length === 0, numberedDirs.join(', '))
const looks = JSON.parse(read('public/looks/index.json')).looks || []
const numberedLooks = looks.filter((l) => isNumericId(l.id) || (l.scene && isNumericId(l.scene))).map((l) => l.id)
check('no Look or its scene is a number', numberedLooks.length === 0, numberedLooks.join(', '))

// ── 5. the wiring ───────────────────────────────────────────────────────────
const extent = read('src/cartograph/ExtentApp.jsx')
check('Extent no longer slugs the search text into the scene (sluggifyPlace gone)', !/sluggifyPlace/.test(extent))
check('Fetch names the scene with sceneIdForName(name)', /sceneIdForName\(\s*name\s*\)/.test(extent))
check('a new Look is named after the display name, not the id', !/createLook\(\{\s*name:\s*scene\b/.test(extent))
const serve = read('cartograph/serve.js')
check('serve.js refuses numeric scene ids', (serve.match(/isNumericId\(/g) || []).length >= 3)
check('serve.js slugs Look ids with the shared rule', /function slugify\(name\)\s*\{\s*return slugifyName\(/.test(serve))

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
