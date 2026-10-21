// claims-a-slab-uploads-only-under-its-own-name.mjs — A SLAB UPLOADS ONLY UNDER THE NAME IT WAS BAKED UNDER (T1).
//
// ⭐ WHY (Boz, 2026-10-21, for LS's rename `lafayette-square` → `lafayettesquare`): a slab carries its name INSIDE its
//   files (`look`, `scene`, `town`, `lookName` in its root JSONs), and the player keys every slab URL by it. A slab moved
//   or copied under another name keeps the old stamp and reads `baked/<old>/…`: for LS, the keys the live
//   lafayette-square.com serves. HPDM's rename hit this on 2026-10-04 ("the slab had been MOVED, not re-baked").
// ⭐ READ, NEVER RESTATED: the stamp fields, the required stamps and the judgement are the uploader's own pure rule
//   (`scripts/slab-name-rule.mjs`), imported. The uploader itself (`scripts/upload-baked-to-r2.mjs`) is READ AS TEXT,
//   never imported (it reaches the network): its plan() must call the rule and throw on it before the plain-name early
//   continue, so staging, prod and the CLI all refuse.
// ⭐ A SLAB WITH NO MANIFEST DOES NOT UPLOAD, plain or hashed (Boz's ruling, 2026-10-21): manifest.json's `town` is a
//   required stamp, so Altadena and Jackson Heights (no manifest today) refuse. That is CORRECT: a slab without a
//   manifest is not publishable. Their refusal is reported below as correct, never as a pass of the rule.
// ROWS, on slabs planted in this run's own temp dir (root JSONs only: the rule reads nothing else):
//   1. a slab whose every stamp names its directory: no mismatch.
//   2. each stamp field in turn naming another town: named, by file and field.
//   3. a slab moved to another name with its files unchanged (the LS rename): every stamp named.
//   4. manifest.json absent · manifest.json without `town` · ground.json without `look`: each named.
//   5. a root JSON that will not parse: named. 6. a non-string `look` (manifest's look record) is not a name.
//   7. the uploader imports the rule and plan() throws on it before `if (!names)`.
//   8. the main checkout's own baked towns (public/baked, when present): each passes under its own name, or is
//      refused only for an absent manifest (correct, above); each, judged under another name, is refused. Read only.
//
//   node checks/claims-a-slab-uploads-only-under-its-own-name.mjs [--selftest]
// ⭐ MUTATION TEST (`--selftest`): the stamp list emptied · the required stamps emptied (mutated copies of the rule, in
//   this run's own temp dir) · the call removed from plan() · the call moved after `if (!names)` (the uploader's text,
//   in memory) → each RED.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

const SELF = process.argv.includes('--selftest')
const RULEF = join(ROOT, 'scripts/slab-name-rule.mjs')
const UPF = join(ROOT, 'scripts/upload-baked-to-r2.mjs')
const BAKED = join(ROOT, 'public/baked')
// one loader, one parameter (checks/tier.mjs follows the import to its source)
const loadRule = async (ruleUrl) => import(ruleUrl)

// PLANTED SLABS, in this run's own temp dir, at fixed paths (checks/tier.mjs reads every write's target): `s` a whole
// slab, `m` no manifest.json, `t` a manifest without `town`, `l` a ground without `look`, `u` an unparseable root JSON.
// All four stamp fields sit in one file (stamps.json, from the rule's own list); the manifest's `look` is an object.
const TMP = mkdtempSync(join(tmpdir(), 'slab-name-'))
const S = join(TMP, 's', 'alpha'), M = join(TMP, 'm', 'alpha'), T = join(TMP, 't', 'alpha'), L = join(TMP, 'l', 'alpha'), U = join(TMP, 'u', 'alpha')
mkdirSync(join(TMP, 's', 'alpha'), { recursive: true })
mkdirSync(join(TMP, 'm', 'alpha'), { recursive: true })
mkdirSync(join(TMP, 't', 'alpha'), { recursive: true })
mkdirSync(join(TMP, 'l', 'alpha'), { recursive: true })
mkdirSync(join(TMP, 'u', 'alpha'), { recursive: true })
const J = (o) => JSON.stringify(o)
const MANIFEST = J({ town: 'alpha', look: { mark: 'x', accent: '#fff' } })
const GROUND = J({ look: 'alpha' })
const stampsOf = (R, odd = null) => J(Object.fromEntries(R.SLAB_NAME_STAMPS.map(f => [f, f === odd ? 'beta' : 'alpha'])))
const plantAll = (R) => {
  writeFileSync(join(TMP, 's', 'alpha', 'manifest.json'), MANIFEST)
  writeFileSync(join(TMP, 's', 'alpha', 'ground.json'), GROUND)
  writeFileSync(join(TMP, 's', 'alpha', 'stamps.json'), stampsOf(R))
  writeFileSync(join(TMP, 'm', 'alpha', 'ground.json'), GROUND)
  writeFileSync(join(TMP, 't', 'alpha', 'manifest.json'), J({ look: { mark: 'x' } }))
  writeFileSync(join(TMP, 't', 'alpha', 'ground.json'), GROUND)
  writeFileSync(join(TMP, 'l', 'alpha', 'manifest.json'), MANIFEST)
  writeFileSync(join(TMP, 'l', 'alpha', 'ground.json'), J({ bin: 'ground.bin' }))
  writeFileSync(join(TMP, 'u', 'alpha', 'manifest.json'), MANIFEST)
  writeFileSync(join(TMP, 'u', 'alpha', 'ground.json'), GROUND)
  writeFileSync(join(TMP, 'u', 'alpha', 'trees-atlas.json'), '{ "lookName": "alpha", ') }
const named = (bad, needle) => bad.some(b => b.includes(needle))

// the uploader's wiring, read as text: the import, the call, the throw, and both before `if (!names)`
const wiring = (up) => {
  const imp = /import \{[^}]*\bslabNameMismatches\b[^}]*\} from '\.\/slab-name-rule\.mjs'/.test(up)
  const plan = up.indexOf('export function plan('), call = up.indexOf('slabNameMismatches(town, l)', plan)
  const thr = up.indexOf('if (misnamed.length) {', call), early = up.indexOf('if (!names)', plan)
  return imp && plan > 0 && call > plan && thr > call && early > thr && /if \(misnamed\.length\) \{\s*throw new Error/.test(up.slice(thr, thr + 80)) }

async function rows(R, up) {
  const out = []
  plantAll(R)
  out.push(['1. a slab whose every stamp names its directory: no mismatch', R.slabNameMismatches(S, 'alpha').length === 0])
  const each = R.SLAB_NAME_STAMPS.map(f => { writeFileSync(join(TMP, 's', 'alpha', 'stamps.json'), stampsOf(R, f))
    return named(R.slabNameMismatches(S, 'alpha'), `stamps.json:${f}`) })
  writeFileSync(join(TMP, 's', 'alpha', 'stamps.json'), stampsOf(R))
  out.push([`2. each stamp field naming another town is named (${R.SLAB_NAME_STAMPS.join(', ')})`, R.SLAB_NAME_STAMPS.length > 0 && each.every(Boolean)])
  // the move: the same files, judged under another name (the rule reads the name it is given, never the directory's)
  const moved = R.slabNameMismatches(S, 'gamma'), want = R.SLAB_NAME_STAMPS.length + 2
  out.push([`3. a slab moved to another name with its files unchanged: every stamp named (${moved.length} of ${want})`, R.SLAB_NAME_STAMPS.length > 0 && moved.length === want])
  out.push(['4. manifest.json absent · manifest.json without `town` · ground.json without `look`: each named',
    named(R.slabNameMismatches(M, 'alpha'), 'manifest.json: absent') && named(R.slabNameMismatches(T, 'alpha'), 'manifest.json:town missing')
    && named(R.slabNameMismatches(L, 'alpha'), 'ground.json:look missing')])
  out.push(['5. a root JSON that will not parse is named', named(R.slabNameMismatches(U, 'alpha'), 'trees-atlas.json: unparseable')])
  out.push(['6. a non-string `look` (manifest.json\'s look record) is not a name', !named(R.slabNameMismatches(S, 'alpha'), 'manifest.json:look')])
  out.push(['7. the uploader imports the rule, and plan() throws on it before `if (!names)` (staging, prod and the CLI all refuse)', wiring(up)])
  return out
}

// 8. the main checkout's own baked towns, judged by the live rule: their root JSONs copied into the temp dir, under
// their own name and under another
function census(R) {
  if (!existsSync(BAKED)) return { said: 'no public/baked here: the baked towns are not judged (said, not passed)' }
  // read only: each town judged where it lies, under its own name and under another (the rule compares the name it is given)
  const towns = readdirSync(BAKED, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  return { res: towns.map(t => { const a = R.slabNameMismatches(join(BAKED, t), t), b = R.slabNameMismatches(join(BAKED, t), t + '-renamed')
    return { t, pass: a.length === 0, noManifest: a.length > 0 && a.every(x => x.startsWith('manifest.json: absent')), bad: a,
      movedRefused: b.some(x => !x.startsWith('manifest.json')) } }) }
}

const R0 = await loadRule(pathToFileURL(RULEF).href)
const UP = readFileSync(UPF, 'utf8')

if (SELF) {
  const ruleSrc = readFileSync(RULEF, 'utf8')
  const STAMPS = "export const SLAB_NAME_STAMPS = ['look', 'scene', 'town', 'lookName']"
  const NOSTAMPS = 'export const SLAB_NAME_STAMPS = []'
  const REQ = "export const SLAB_REQUIRED_STAMPS = { 'manifest.json': 'town', 'ground.json': 'look' }"
  const NOREQ = 'export const SLAB_REQUIRED_STAMPS = {}'
  const CALL = '    const misnamed = slabNameMismatches(town, l)\n'
  const NOCALL = '    const misnamed = []\n'
  const EARLY = '    if (!names) { files.push(...own); continue }\n'
  for (const [a, src] of [[STAMPS, ruleSrc], [REQ, ruleSrc], [CALL, UP], [EARLY, UP]]) if (src.split(a).length !== 2) throw new Error(`selftest: the source no longer carries \`${a.trim().slice(0, 70)}\` once — re-aim the mutation`)
  const stampsPath = join(mkdtempSync(join(tmpdir(), 'slab-name-nostamps-')), 'slab-name-rule.mjs')
  writeFileSync(stampsPath, ruleSrc.replace(STAMPS, NOSTAMPS))
  const reqPath = join(mkdtempSync(join(tmpdir(), 'slab-name-noreq-')), 'slab-name-rule.mjs')
  writeFileSync(reqPath, ruleSrc.replace(REQ, NOREQ))
  // the call moved after the early continue: the block cut out of its place and set after `if (!names)`
  const blockAt = UP.indexOf(CALL), blockEnd = UP.indexOf('    const why = notPublished', blockAt)
  const block = UP.slice(blockAt, blockEnd)
  const movedUp = UP.slice(0, blockAt) + UP.slice(blockEnd).replace(EARLY, EARLY + block)
  const muts = [
    ['the stamp list emptied', await loadRule(pathToFileURL(stampsPath).href), UP, [1, 2]],
    ['the required stamps emptied', await loadRule(pathToFileURL(reqPath).href), UP, [3]],
    ['the call removed from plan()', R0, UP.replace(CALL, NOCALL), [6]],
    ['the call moved after `if (!names)`', R0, movedUp, [6]],
  ]
  let bad = 0
  for (const [what, R, up, idx] of muts) { const r = await rows(R, up), red = idx.some(i => !r[i][1])
    console.log(`  ${red ? '✅' : '⛔'} mutant · ${what}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'}`); if (!red) bad++ }
  const live = await rows(R0, UP)
  if (!live.every(r => r[1])) { console.log('  ⛔ the live rule is not GREEN, so the mutants prove nothing'); bad++ }
  process.exit(bad ? 1 : 0)
}

const R = await rows(R0, UP)
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const c = census(R0)
let censusOk = true
if (c.said) console.log(`  ⚪ 8. ${c.said}`)
else for (const x of c.res) {
  const own = x.pass ? 'passes under its own name' : x.noManifest ? 'refused: no manifest.json (correct: a slab without a manifest is not publishable)' : `⛔ refused under its own name: ${x.bad.slice(0, 3).join(' · ')}`
  if (!x.pass && !x.noManifest) censusOk = false
  if (!x.movedRefused) censusOk = false
  console.log(`  ${(x.pass || x.noManifest) && x.movedRefused ? '✅' : '⛔'} 8. ${x.t}: ${own} · a copy under another name ${x.movedRefused ? 'is refused' : '⛔ is NOT refused'}`)
}
const ok = R.every(r => r[1]) && censusOk
console.log(ok ? '\n✅ a slab uploads only under the name it was baked under' : '\n⛔ a slab could upload under a name it does not carry')
process.exit(ok ? 0 : 1)
