/**
 * ⭐ THE CUTOVER-CASUALTY CLASS.
 *
 * Every dossier authored against the 19-axis rubric could only ever name a value the OLD
 * value set carried. Where the right word did not exist, the author picked the nearest
 * available one and wrote the truth in a `note`. The 19→31 cutover added the missing
 * words -- and nobody went back to re-author.
 *
 * ⛔ This is NOT "the sources disagree with us." A source disagreeing with an authored
 * value is the OPERATOR'S AUTHORING and is first-class. The signal is narrower and it is
 * structural: the source's term DID NOT EXIST in the pre-cutover set for that axis. The
 * author could not have rejected a word that was not on offer, so the authored value is a
 * nearest-available artifact, not a considered choice.
 *
 * Instance that produced this check (2026-08-24): betula_nigra `leaf.shape` is HARD
 * `ovate`; its own note reads "diamond/rhombic doubly-toothed"; NC State says deltoid and
 * SelecTree says rhomboid. Pre-cutover `leaf.silhouette` had no rhomboid and no deltoid.
 *
 * ⛔ Reports only. Re-authoring a hard identity axis is the operator's call, never a
 * script's -- the output is a worklist, not a patch.
 *
 *   node scratch/claims-cutover-casualties.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { resolveTerm, resolveSpecies, aliasesFor, normalize, TERM_REDIRECTS, NOT_A_TRAIT } from '../arborist/vocabulary.mjs'

const root = path.join(import.meta.dirname, '..')
const rubric = JSON.parse(readFileSync(path.join(root, 'arborist/rubric.json'), 'utf8'))
const before = rubric._cutover?.valuesBefore
if (!before) { console.error('⛔ rubric._cutover.valuesBefore missing — cannot compute the class'); process.exit(1) }

// Which pre-cutover axis fed each live axis. Straight from the cutover record: renamed
// axes keep their old set; the two DROPPED axes were split across several live ones.
const FED_BY = { 'bark.texture': 'bark.type' }
for (const id of ['leaf.type', 'leaf.shape', 'leaf.margin']) FED_BY[id] = 'leaf.silhouette'
for (const id of ['leaf.arrangement', 'leaf.growthway']) FED_BY[id] = 'leaf.ways'

const obsPath = path.join(root, 'scratch/dossier-raw-observations.jsonl')
if (!existsSync(obsPath)) { console.error('⛔ no harvest at scratch/dossier-raw-observations.jsonl'); process.exit(1) }

// Same field map the hydrator uses, read from ITS source so the two cannot drift.
const hydSrc = readFileSync(path.join(root, 'arborist/hydrate-dossiers.mjs'), 'utf8')
const fmBlock = hydSrc.match(/const FIELD_MAP = \{[\s\S]*?\n\}/)
const FIELD_MAP = Object.fromEntries([...fmBlock[0].matchAll(/^\s*'?([A-Za-z_/ ,()0-9-]+?)'?:\s*'([a-z.]+)',/gm)].map(m => [m[1], m[2]]))

// ⚠️ `resolveSpecies` returns the DISPLAY name ("Red Maple"), not the canonicalId
// ("acer_rubrum"). Index every name a dossier answers to, the way the hydrator does --
// keying on canonicalId alone silently matched nothing and the check reported a false PASS.
const dDir = path.join(root, 'arborist/dossiers')
const byName = new Map()
let nDossier = 0
for (const f of readdirSync(dDir).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(dDir, f), 'utf8'))
  // ⛔ A minted stub was built TODAY from the current rubric with the current vocabulary.
  // It cannot be a casualty of a cutover that predates it, and flagging one is a category
  // error -- the class is specifically an AUTHORED value the old value set could not hold.
  if (d.provenance?.minted) continue
  nDossier++
  const rec = { file: f, d }
  const id = d.canonicalId || f.replace('.json', '')
  for (const n of [id, d.key, d.scientific, ...(d.inventoryNames || []), ...aliasesFor(id)]) {
    if (n) byName.set(normalize(n), rec)
  }
}
const lookupSpecies = (raw) => {
  const cands = [resolveSpecies(raw).value, raw, ...aliasesFor(resolveSpecies(raw).value)]
  for (const c of cands) { const hit = byName.get(normalize(c)); if (hit) return hit }
  return null
}

const obs = readFileSync(obsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const findings = new Map()

for (const o of obs) {
  let axis = FIELD_MAP[o.field]
  if (!axis) continue
  const nv = normalize(o.value)
  if (NOT_A_TRAIT[axis]?.[nv]) continue
  let forced = null
  const redir = TERM_REDIRECTS[axis]?.[nv]
  if (redir) { axis = redir.axis; forced = redir.value }

  const oldAxis = FED_BY[axis]
  if (!oldAxis) continue                       // axis is new outright — nothing was overwritten
  const oldSet = (before[oldAxis] || []).map(normalize)

  const hit = lookupSpecies(o.species)
  if (!hit) continue
  const cell = hit.d.required?.[axis]
  if (!cell || cell.target == null) continue   // empty stays red; that is a hydration job

  const r = forced != null ? { resolved: true, value: forced } : resolveTerm(axis, o.value)
  if (!r.resolved || r.value === cell.target) continue

  // ⭐ THE TEST: could the author have chosen this word at authoring time?
  if (oldSet.includes(normalize(r.value))) continue   // yes → a real disagreement, NOT a casualty
  const k = `${hit.file}|${axis}`
  if (!findings.has(k)) findings.set(k, { file: hit.file, axis, oldAxis, target: cell.target, hardness: cell.hardness, note: cell.note, says: new Map() })
  const f = findings.get(k)
  f.says.set(r.value, (f.says.get(r.value) || new Set()).add?.(o.source) ?? new Set([o.source]))
}

console.log(`\ncutover: ${rubric._cutover.from} → ${rubric._cutover.to} axes on ${rubric._cutover.at}`)
console.log(`dossiers: ${nDossier}   harvest observations: ${obs.length}\n`)

if (!findings.size) { console.log('✅ PASS — no authored value is contradicted by a term the old rubric could not express.'); process.exit(0) }

// ⭐⭐ THE DISCRIMINATOR. "A source disagrees with us" is weak -- near-synonyms abound
// (fissured/furrowed, scaly/shaggy), and a red maple is genuinely BOTH lobed and serrate.
// The strong signal is the dossier CONTRADICTING ITSELF: the author wrote the true trait
// into the `note` because the value set had no word for it, then picked the nearest term
// as the target. When a source's term corroborates the NOTE against the TARGET, the
// authored value is an artifact of the old vocabulary and not a judgment call.
//   betula_nigra: target `ovate`, note "diamond/rhombic", SelecTree "rhomboid" → fires.
// ⛔ Everything else stays UNADJUDICATED -- listed, not judged. This check does not know
// which near-synonym is right, and must not pretend to.
const stem = (t) => normalize(t).replace(/[^a-z]/g, '').slice(0, 5)
for (const f of findings.values()) {
  f.selfContradicts = f.note
    ? [...f.says.keys()].some(v => stem(v).length >= 4 && normalize(f.note).replace(/[^a-z]/g, ' ').includes(stem(v)))
    : false
}
const tier1 = [...findings.values()].filter(f => f.selfContradicts)
const hard = [...findings.values()].filter(f => f.hardness === 'hard')
console.log(`${findings.size} candidate${findings.size === 1 ? '' : 's'} (${hard.length} on a HARD identity axis) — ${tier1.length} contradict their own note:\n`)
const rank = (f) => (f.selfContradicts ? 2 : 0) + (f.hardness === 'hard' ? 1 : 0)
for (const f of [...findings.values()].sort((a, b) => rank(b) - rank(a))) {
  const says = [...f.says].map(([v, srcs]) => `${v} (${[...srcs].join(', ')})`).join('  ·  ')
  console.log(`  ${f.selfContradicts ? '⛔ CONTRADICTS OWN NOTE' : 'ℹ️  unadjudicated'}   ${f.file}  ${f.axis}${f.hardness === 'hard' ? '  (HARD)' : ''}`)
  console.log(`      authored : ${f.target}      ← nearest available in ${f.oldAxis}`)
  console.log(`      sources  : ${says}`)
  if (f.note) console.log(`      its note : "${f.note}"`)
  console.log('')
}
console.log(`▶ ACT ON: the ${tier1.length} marked CONTRADICTS OWN NOTE — the author recorded the true trait in prose`)
console.log('  because the old value set had no word for it. The word exists now.')
console.log('▶ The rest are UNADJUDICATED near-synonyms. This check does not know which is right,')
console.log("  and re-authoring a hard identity axis is the operator's call, never a script's.")
