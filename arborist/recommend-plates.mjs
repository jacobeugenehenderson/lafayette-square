/**
 * recommend-plates.mjs — RANKED PLATES FOR A SPECIES, and the system build that takes the top one.
 *
 * Jacob, 2026-09-25: "use chassis pieces we already have and then a human operator can look at
 * the tree the system builds and swap out any element for something better" · "we can also make
 * algorithmic recommendations". So, per plate (chassis · bark · leaf):
 *
 *   S  same species   — the plate's label names this species
 *   G  same genus     — the plate's label names this genus
 *   T  trait only     — the species' dossier + the matcher (`matcher.js`) call it workable
 *
 * ranked S > G > T, then by the matcher's score when a dossier exists. Each option carries its
 * reason in plain words ("same genus · conical habit"). ⛔ A reason never carries a filename or a
 * species read off one — labels are internal evidence (Jacob, 2026-09-25).
 * ⛔ No dossier ⇒ no trait tier, and the reason SAYS so; ties inside a tier then break by label
 * specificity and id, and the reason says that too. Nothing is ranked by a guess it hides.
 *
 * The build writes `arborist/state/<id>/compositions.json` with the top pick per plate and an
 * `auto` block — `{ <plate>: { pick, tier, reason } }` — so a plate is "auto" exactly while its
 * value still equals `auto.<plate>.pick`; an operator swap retires the claim with no bookkeeping.
 * ⛔ It never overwrites an authored composition or a curation entry. It may re-rank its OWN
 * untouched build (every plate still equal to its auto pick) — one operator swap and it refuses.
 *
 *   node arborist/recommend-plates.mjs --species <salonId> --scientific "Genus species"         # print
 *   node arborist/recommend-plates.mjs --species <salonId> --scientific "…" --label "…" --build [--evergreen]
 *
 * Reads the labels `ingest.js` writes into arborist/state/part-index.json; refuses without them.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { matcher } from './matcher.js'
import { dossierForSalonSpecies } from './salon-options.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLATES = ['chassis', 'bark', 'leaf']
const TIER_ORDER = { S: 0, G: 1, T: 2 }
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const labelSpecies = (l) => [].concat(l?.species || []).map(slug)
const labelGenera = (l) => (l?.genera || [l?.genus]).filter(Boolean).map(slug)
const NOUN = { texture: 'bark', habit: 'habit', type: 'type', shape: 'leaf', margin: 'margin', trunks: 'trunks' }
const traitWords = (m) => (m?.perAxis || []).filter(x => x.withinTol && x.actual != null)
  .map(x => typeof x.actual === 'number' ? `${x.axis.split('.')[1]} fits` : `${x.actual} ${NOUN[x.axis.split('.')[1]] || x.axis.split('.')[1]}`)

/** Ranked options for one plate. `parts` = part-index parts (labelled). */
// `used` = plates other species already compose with. With no dossier to judge between two
// equal plates, the one nobody uses ranks first — so two towns' groves come out distinct rather
// than cloned (brief step 4). It only ever breaks a tie; it never lifts a plate over a better tier.
export function recommend({ scientific, partType, parts, rubric, dossier, used = new Set() }) {
  const key = slug(scientific), genus = key.split('_')[0]
  const pool = parts.filter(p => p.partType === partType)
  const unlabelled = pool.filter(p => !p.label)
  if (unlabelled.length) throw new Error(`⛔ ${unlabelled.length} ${partType} part(s) carry no label — run node arborist/ingest.js first`)
  const scored = dossier ? new Map(matcher(rubric, dossier, partType, pool).options.map(o => [o.partId, o])) : null
  const out = []
  for (const p of pool) {
    const m = scored?.get(p.partId)
    const tier = labelSpecies(p.label).includes(key) ? 'S'
      : labelGenera(p.label).includes(genus) ? 'G'
      : m?.verdict === 'workable' ? 'T' : null
    if (!tier) continue
    const words = [tier === 'S' ? 'same species' : tier === 'G' ? 'same genus' : 'matches by trait', ...traitWords(m)]
    // specificity only means something at S: a leaf pack drawn for this species alone beats one
    // shared by three. At G it would favour a plate labelled with ANOTHER species — no evidence.
    out.push({ partId: p.partId, tier, score: m?.score ?? null, specificity: tier === 'S' ? labelSpecies(p.label).length : 0,
      fresh: !used.has(p.partId), assigned: !String(p.path || '').includes('/_unassigned/'), words })
  }
  out.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    || (b.score ?? -1) - (a.score ?? -1)
    || a.specificity - b.specificity
    || (b.fresh - a.fresh)
    || (b.assigned - a.assigned)
    || a.partId.localeCompare(b.partId))
  return out.map((o, i) => {
    const tied = !dossier && out.some((x, j) => j !== i && x.tier === o.tier)
    const tail = !dossier ? (tied ? ['no dossier — order within this tier is not a judgment'] : ['no dossier — not trait-checked']) : []
    const fresh = tied && o.fresh ? ['no other species uses it'] : []
    return { partId: o.partId, tier: o.tier, score: o.score, reason: [...o.words, ...fresh, ...tail].join(' · ') }
  })
}

/** Every plate another species' composition already uses (chassis · bark ref · leaf pack). */
export function usedPlates(exceptId) {
  const out = new Set(), dir = path.join(ROOT, 'arborist/state')
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === exceptId) continue
    const f = path.join(dir, e.name, 'compositions.json')
    if (!existsSync(f)) continue
    for (const c of readJSON(f).compositions || []) for (const v of [c.chassis, c.bark?.ref, c.leaves?.pack]) if (v) out.add(v)
  }
  return out
}

function loadInputs() {
  const index = readJSON(path.join(ROOT, 'arborist/state/part-index.json'))
  const rubric = readJSON(path.join(ROOT, 'arborist/rubric.json'))
  return { parts: index.parts || [], rubric }
}

/** The system build: slot 1 = the top pick per plate, marked auto. Returns the composition. */
export function buildComposition({ id, scientific, parts, rubric, used = usedPlates(id) }) {
  const dossier = dossierForSalonSpecies(id)
  const recs = Object.fromEntries(PLATES.map(t => [t, recommend({ scientific, partType: t, parts, rubric, dossier, used })]))
  const top = (t) => recs[t][0] || null
  const auto = {}
  for (const t of PLATES) auto[t === 'leaf' ? 'leaves' : t] = top(t)
    ? { pick: top(t).partId, tier: top(t).tier, reason: top(t).reason }
    : { pick: null, tier: null, reason: `no ${t} plate names this species or genus${dossier ? ', and none matches its dossier' : ', and no dossier to match by trait'} — ${t === 'chassis' ? 'NOT BUILDABLE' : 'the default stands'}` }
  if (!top('chassis')) throw new Error(`⛔ ${id}: no chassis ranks for ${scientific} — ${auto.chassis.reason}`)
  // A form id (`rounded_01`) reaches its GLB through `derivedFrom`, as the 2026-08-25 rename
  // wrote it on every composition (generate-salon resolveChassisPath). Internal; never shown.
  const src = parts.find(p => p.partType === 'chassis' && p.partId === top('chassis').partId)?.sourcePath
  const derivedFrom = src ? path.basename(src, '.glb') : null
  if (!derivedFrom) throw new Error(`⛔ ${id}: chassis ${top('chassis').partId} records no sourcePath in the part-index`)
  return {
    composition: {
      slot: 1, name: 'Slot 1 (auto)',
      chassis: top('chassis').partId,
      bark: top('bark') ? { ref: top('bark').partId } : {},
      leaves: top('leaf') ? { pack: top('leaf').partId } : {},
      deformer: {}, transform: {},
      ...(derivedFrom !== top('chassis').partId ? { derivedFrom } : {}),
      auto: { builtAt: new Date().toISOString().slice(0, 10), by: 'arborist/recommend-plates.mjs', dossier: dossier ? dossier.canonicalId : null, ...auto },
    },
    recs,
  }
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : null }
  const id = arg('species'), scientific = arg('scientific')
  if (!id || !scientific) { console.error('usage: --species <salonId> --scientific "Genus species" [--label "…" --build [--evergreen]]'); process.exit(2) }
  const { parts, rubric } = loadInputs()
  const { composition, recs } = buildComposition({ id, scientific, parts, rubric })
  console.log(`${id} (${scientific}) — dossier: ${composition.auto.dossier ?? 'none'}`)
  for (const t of PLATES) {
    console.log(`  ${t}: ${recs[t].length} ranked`)
    for (const r of recs[t].slice(0, 5)) console.log(`    ${r.tier} ${r.partId.padEnd(24)} ${r.reason}`)
  }
  if (!process.argv.includes('--build')) return
  const label = arg('label')
  if (!label) { console.error('⛔ --build needs --label (the operator-facing name)'); process.exit(2) }
  const compPath = path.join(ROOT, 'arborist/state', id, 'compositions.json')
  // A re-rank may replace the SYSTEM's own picks, and nothing else: every slot must still be
  // exactly what an auto build wrote (each plate equal to its auto pick). One operator swap
  // anywhere and the composition is authored — refused.
  const untouched = (c) => c.auto && c.chassis === c.auto.chassis?.pick
    && (c.bark?.ref ?? null) === (c.auto.bark?.pick ?? null) && (c.leaves?.pack ?? null) === (c.auto.leaves?.pick ?? null)
  const prior = existsSync(compPath) ? (readJSON(compPath).compositions || []).filter(c => c && c.chassis) : []
  if (prior.length && !prior.every(untouched))
    throw new Error(`⛔ ${id} has an authored composition (an operator chose a plate) — the build never overwrites one. Swap plates in the Salon.`)
  if (prior.length) console.log(`↻ ${id}: re-ranking an untouched auto build`)
  mkdirSync(path.dirname(compPath), { recursive: true })
  writeFileSync(compPath, JSON.stringify({ species: id, compositions: [composition], savedAt: Date.now() }, null, 2))
  const curPath = path.join(ROOT, 'arborist/state/_species-curation.json')
  const cur = readJSON(curPath)
  if (!cur.species[id]) {
    cur.species[id] = { label, scientific, deciduous: !process.argv.includes('--evergreen'), promoted: true }
    writeFileSync(curPath, JSON.stringify(cur, null, 2) + '\n')
  }
  console.log(`✅ built ${id} → ${path.relative(ROOT, compPath)} (auto). Next: node arborist/generate-salon.js --look <look> --species ${id}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message || e); process.exit(1) })
}
