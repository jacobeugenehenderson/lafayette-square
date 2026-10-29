// The Arch-stands migration's PLAN — pure (no fs), so the checks that prove it run in `npm test`'s safe tier.
// The one-shot that reads and writes the Looks is scripts/migrate-arch-stands.mjs; what it does is decided here.
//   ▶ node checks/claims-the-arch-stands-where-it-is.mjs · node checks/claims-the-survey-hero-is-retired.mjs

export const RETIRED_ARCH_FIELDS = ['distance', 'bearingX', 'bearingZ']

/** The `arch` block without its retired placement, or null when it has none. Pure; refuses a block it cannot read. */
export function migrateArch(arch, look) {
  const v = arch?.values
  if (!v || arch.animated) throw new Error(`[migrate] ⛔ ${look}: \`arch\` is not a flat { values } block — not migrated`)
  if (!RETIRED_ARCH_FIELDS.some(k => k in v)) return null
  const out = { ...v }
  for (const k of RETIRED_ARCH_FIELDS) delete out[k]
  return { ...arch, values: out }
}

/** The design's keyframes carrying its retired hero, or null when it has no `heroSubject`. Pure; refuses by name. */
export function migrateHero(design, look) {
  if (!('heroSubject' in design)) return null
  const hs = design.heroSubject, keys = design.heroKeyframes || []
  let id = null
  if (hs) {
    if ((hs.kind === 'arch')) id = 'arch'
    else if ((hs.kind === 'landmark' || hs.kind === 'building') && hs.id) id = hs.id
    else throw new Error(`[migrate] ⛔ ${look}: heroSubject ${JSON.stringify(hs)} is no focus object — not migrated; say what its first key should focus`)
    if (!keys.length) throw new Error(`[migrate] ⛔ ${look}: heroSubject ${JSON.stringify(hs)} and no keyframe to carry it — not migrated; key the shot first`)
  }
  const out = keys.map((k, i) => {
    if (k?.focus === 'hero') { const { focus, ...rest } = k; return id ? { ...rest, focus: id } : rest }
    if (i === 0 && id && !(typeof k?.focus === 'string' && k.focus)) return { ...k, focus: id }
    return k
  })
  return { heroKeyframes: out }
}

/**
 * ⛔ ALL OR NOTHING (Zob): every Look is PLANNED before any is written. A refusal anywhere refuses the whole run, naming
 * every refusal, and writes nothing — never Looks 1–3 migrated and 4+ not (claims-a-failed-apply-leaves-one-state).
 * @param looks [{ id, design }] (design null: the Look has no design.json)
 * @param save (id, design) => void, called only once every Look has planned cleanly, and only with `write`
 * @returns [{ id, notes }] for the Looks that change
 */
export function runMigration(looks, { write, save }) {
  const plans = [], refusals = []
  for (const { id, design: d } of looks) {
    if (!d) continue
    try {
      const out = { ...d }, notes = []
      const a = d.arch ? migrateArch(d.arch, id) : null
      if (a) { out.arch = a; notes.push(`arch ${JSON.stringify(d.arch.values)} → ${JSON.stringify(a.values)}`) }
      const h = migrateHero(d, id)
      if (h) {
        delete out.heroSubject
        if (d.heroKeyframes) out.heroKeyframes = h.heroKeyframes
        notes.push(`heroSubject ${JSON.stringify(d.heroSubject)} → retired; key focus ${JSON.stringify((d.heroKeyframes || []).map(k => k.focus ?? null))} → ${JSON.stringify(h.heroKeyframes.map(k => k.focus ?? null))}`)
      }
      if (notes.length) plans.push({ id, out, notes })
    } catch (e) { refusals.push(e.message) }
  }
  if (refusals.length) throw new Error(`[migrate] ⛔ ${refusals.length} Look(s) refused — NOTHING written:\n  ${refusals.join('\n  ')}`)
  if (write) for (const { id, out } of plans) save(id, out)
  return plans.map(({ id, notes }) => ({ id, notes }))
}

/** The run's record, stamped on each Look's entry in public/looks/index.json when the migration writes. */
export const MIGRATION_ID = 'arch-stands'
/** The index with every Look's entry stamped `migrated[MIGRATION_ID] = at` (ms). Pure. */
export function stampIndex(index, at) {
  return { ...index, looks: index.looks.map(l => ({ ...l, migrated: { ...(l.migrated || {}), [MIGRATION_ID]: at } })) }
}

/**
 * ⭐ A SLAB THAT STILL CARRIES A RETIRED FIELD: OWED A RE-BAKE, OR WRONG? Decided by RECORDED FACTS only (Zob's condition,
 * Boz 2026-10-29): the slab's own `bakedAt` against the migration's stamp on the Look's index entry. ⛔ Never an mtime,
 * and never "the design still has the old fields" (that would read as owed forever and never go red).
 *   'clean'  the slab carries nothing retired
 *   'owed'   baked BEFORE the migration ran: its re-bake is owed (a check says NOT CHECKED, exit 2 — PTown waits on its
 *            pour, LS re-bakes in the tranche)
 *   'red'    baked AFTER the migration and still carrying it, or no stamp (the migration never ran), or no bakedAt
 * @returns { verdict, why }
 */
export function slabVerdict({ carries, stamp, bakedAt }) {
  if (!carries) return { verdict: 'clean', why: 'carries nothing retired' }
  if (!Number.isFinite(stamp)) return { verdict: 'red', why: `no ${MIGRATION_ID} stamp on the Look's index entry — the migration has not run (scripts/migrate-arch-stands.mjs --write)` }
  if (!Number.isFinite(bakedAt)) return { verdict: 'red', why: 'the slab records no bakedAt — when it was baked is unknown' }
  if (bakedAt < stamp) return { verdict: 'owed', why: `baked ${new Date(bakedAt).toISOString()}, before the migration (${new Date(stamp).toISOString()}) — scene re-bake owed` }
  return { verdict: 'red', why: `baked ${new Date(bakedAt).toISOString()}, AFTER the migration (${new Date(stamp).toISOString()}), and still carries it` }
}
