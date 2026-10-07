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
 *     scene with its web address, and serve.js refuses numeric scene ids.
 *  6. THE WEB ADDRESS (BRIEF-nyc-adapter §3.0) — a town's address may differ from its
 *     name's slug ("Jackson Heights" → jacksonheights): the stated address is the scene
 *     id AND the Look id, refused (never corrected, never suffixed) when it is not one;
 *     and a draft JOINS a folder that is only declared (sources.json, never fetched).
 *     Driven through cartograph/scene-address.mjs, the module serve.js runs.
 */
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const { slugifyName, sceneIdForName, sceneIdForAddress, suggestedName, isNumericId } =
  await import(pathToFileURL(join(ROOT, 'src/lib/sceneSlug.js')).href)
const { lookIdFor, isDeclaredOnly, planJoin, executeJoin } =
  await import(pathToFileURL(join(ROOT, 'cartograph/scene-address.mjs')).href)

const fails = []
const ok = []
const check = (name, pass, detail) => (pass ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`)

// ── 1. the slug table (display name → scene id) ─────────────────────────────
const TABLE = [
  ['Provincetown', 'provincetown'], /* fixture */
  ['The Cloisters', 'the-cloisters'],        // no article stripping
  ['Księży Młyn', 'ksiezy-mlyn'],             // ł folded, not dropped (was ksi-y-m-yn)
  ['Lafayette Square', 'lafayette-square'], /* fixture */
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
check('Fetch still requires a display name (sceneIdForName(name))', /sceneIdForName\(\s*name\s*\)/.test(extent))
check('Fetch names the scene with its web address (sceneIdForAddress(address))', /sceneIdForAddress\(\s*address\s*\)/.test(extent))
check('a new Look is named after the display name, not the id', !/createLook\(\{\s*name:\s*scene\b/.test(extent))
const pours = extent.match(/createLook\(\{[^}]*\}\)/g) || []
check('every Pour creates its Look AT the scene id (id: scene)', pours.length >= 1 && pours.every(c => /\bid:\s*scene\b/.test(c)), pours.join(' | '))
const serve = read('cartograph/serve.js')
check('serve.js refuses numeric scene ids', (serve.match(/isNumericId\(/g) || []).length >= 2)
check('serve.js mints Look ids through scene-address.mjs#lookIdFor', /lookIdFor\(\{\s*statedId/.test(serve))
check('serve.js joins a declared-only folder through planJoin/executeJoin', /planJoin\(src, dst\)/.test(serve) && /executeJoin\(src,/.test(serve))

// ── 6. the web address (§3.0) ───────────────────────────────────────────────
check('"Jackson Heights" slugs to jackson-heights (why the address must be statable)', sceneIdForName('Jackson Heights').id === 'jackson-heights')
check('the stated address jacksonheights is a scene id as given', sceneIdForAddress('jacksonheights').id === 'jacksonheights') /* fixture */
for (const bad of ['', 'Jackson Heights', 'jacksonheights.online', 'JacksonHeights', '11372', '-x'])
  check(`address "${bad}" is refused, not corrected`, !sceneIdForAddress(bad).id && !!sceneIdForAddress(bad).error)
{ const L = lookIdFor({ statedId: 'jacksonheights', name: 'Jackson Heights', existingIds: ['huron'] }) /* fixture */
  check('name ≠ address ⇒ the Look id is the stated address', L.id === 'jacksonheights', JSON.stringify(L)) } /* fixture */
{ const L = lookIdFor({ statedId: 'jacksonheights', name: 'Jackson Heights', existingIds: ['jacksonheights'] }) /* fixture */
  check('a taken stated Look id is REFUSED (409), never suffixed', !L.id && L.status === 409, JSON.stringify(L)) }
{ const L = lookIdFor({ statedId: 'Jackson Heights', name: 'x', existingIds: [] })
  check('a stated Look id that is not an address is refused (400)', !L.id && L.status === 400, JSON.stringify(L)) }
{ const L = lookIdFor({ name: 'Huron', existingIds: ['huron'] }) /* fixture */
  check('with no stated id, a Designer Look is the name slug made unique', L.id === 'huron-2', JSON.stringify(L)) }
{ const T = mkdtempSync(join(tmpdir(), 'scene-address-'))
  try {
    const draft = join(T, 'jackson-heights'), decl = join(T, 'jacksonheights') /* fixture */
    mkdirSync(draft); writeFileSync(join(draft, 'neighborhood.json'), '{"name":"Jackson Heights"}')
    mkdirSync(join(decl, 'raw'), { recursive: true }); writeFileSync(join(decl, 'sources.json'), '{"state":"NY"}')
    check('a folder holding only sources.json is declared-only', isDeclaredOnly(decl))
    check('a drafted folder (neighborhood.json) is not declared-only', !isDeclaredOnly(draft))
    const J = planJoin(draft, decl)
    check('the draft joins the declared folder with no clash', J.clash.length === 0 && J.moves.length === 1, JSON.stringify(J))
    executeJoin(draft, J)
    check('after the join: the declaration survives, the draft is in, the draft folder is gone',
      existsSync(join(decl, 'sources.json')) && existsSync(join(decl, 'neighborhood.json')) && !existsSync(draft))
    const d2 = join(T, 'd2'); mkdirSync(d2); writeFileSync(join(d2, 'sources.json'), '{}')
    const decl2 = join(T, 'decl2'); mkdirSync(decl2); writeFileSync(join(decl2, 'sources.json'), '{"state":"NY"}')
    const J2 = planJoin(d2, decl2)
    check('a file both hold with DIFFERENT bytes is a CLASH (the move is refused, nothing overwritten)', J2.clash.includes('sources.json'), JSON.stringify(J2))
    const d3 = join(T, 'd3'), decl3 = join(T, 'decl3'); mkdirSync(d3); mkdirSync(decl3)
    for (const d of [d3, decl3]) writeFileSync(join(d, 'building-overrides.json'), '{"activate":[],"hide":[]}')
    writeFileSync(join(decl3, 'sources.json'), '{"state":"NY"}'); writeFileSync(join(d3, 'neighborhood.json'), '{}')
    const J3 = planJoin(d3, decl3)
    check('a file both hold BYTE-IDENTICAL is not a clash (the join proceeds)', J3.clash.length === 0 && J3.same.includes('building-overrides.json'), JSON.stringify(J3))
    executeJoin(d3, J3)
    check('…and after it the declaration, the draft and one copy of the shared file are there', existsSync(join(decl3, 'sources.json')) && existsSync(join(decl3, 'neighborhood.json')) && existsSync(join(decl3, 'building-overrides.json')) && !existsSync(d3))
const serveSrc = read('cartograph/serve.js')
check('opening a town writes nothing: an empty override set with no file is not written', /!activate\.length && !hide\.length && !existsSync\(ovPath\)/.test(serveSrc))
check('the Extent autosave skips a set equal to what it loaded (a read is never a write)', /if \(k === ovLoaded\.current\) return/.test(read('src/cartograph/ExtentApp.jsx')))
  } finally { rmSync(T, { recursive: true, force: true }) } }

for (const o of ok) console.log(`✓ ${o}`)
for (const f of fails) console.log(`✗ ${f}`)
process.exit(fails.length ? 1 : 0)
