/**
 * surfaces.mjs — WHICH GENERATOR PAINTS A GROUND GROUP, AND WHAT IT NEEDS TO KNOW.
 *
 * ⭐ ONE TABLE, decided once for every surface (`docs/briefs/BRIEF-surface-lab.md §4`,
 * adopted by Boz 2026-09-24). It replaces `BakedGround.jsx`'s GRASS_FACES — a
 * three-entry Set holding precisely the three faces Lafayette Square has, the same
 * shape as every other "table cast around town #1" the kit has had to retire.
 * `lu-policy.mjs` answers "may a tree stand here?"; this answers "what does the
 * ground look like?". They are two axes on the same class id and live side by side.
 *
 * ⛔ PURE — no fs, no node imports — because the RUNTIME reads it (BakedGround) as
 * well as the kit. Same module on both sides; no second copy to drift.
 *
 * THE MODEL
 *   · class → surface: SURFACE_OF_CLASS, plus the operator's sparse remap
 *     (`design.json#surfaces.classes` → `scene.json#surfaces.classes`).
 *   · a surface declares its PARAMETERS, each with a unit and a SOURCE:
 *       physics  — a property of the material, cited as a `references/` finding id
 *                  (codes-first; `node checks/claims-references-are-sound.mjs`).
 *                  Until the finding exists the value is [U] and the parameter is
 *                  ABSENT — never a number typed in.
 *       derived  — computed from the scene (the face, the terrain, the town's own
 *                  beach). Absent until the derivation has run, and SAYS so.
 *       authored — the operator's value, with a NEUTRAL default (Layer 0 Class D:
 *                  never a default that happened to suit town #1).
 *   · a missing input is a NAMED ABSENT PARAMETER, reported loudly by the consumer,
 *     never a stand-in value (memory `project_a_sentinel_is_not_a_value`).
 */

/** The generators that exist. A surface id not listed here is an error, not a no-op. */
export const SURFACES = {
  // The park grass. Its look constants predate this table and are the CONTROL:
  // LS's grass must render unchanged. No scene-scale parameter.
  grass: { params: {} },

  // ⭐ Sand — one generator for `beach` AND `dune` (ruled 2026-09-24): the dune state
  // is driven by the RELIEF, not the tag, because on Provincetown the tag covers
  // 3.8 ha of ~670 ha of mapped coastal dune (▶ node scratch/marram-sand-relief.mjs).
  sand: {
    params: {
      // Slope is read at the terrain grid's OWN step (terrain.json), never a constant.
      // The dune state turns on above the town's own beach, and the slope scale tops
      // out at the angle a dry sand slip face stands at.
      reposeDeg: {
        unit: '°', source: 'physics',
        question: 'q-dry-sand-repose-angle', finding: 'f-usgs-dune-repose',   // USGS: 30–34° (a range)
      },
      // ⭐ DERIVED PER TOWN at bake (cartograph/bake-coast-distance.js deriveSand), written to
      // context.json `derived.sand`; ABSENT, named, when the town can't answer. The percentile
      // and the ground are declared HERE and read by the bake — never restated there.
      beachSlopeDeg: {
        unit: '°', source: 'derived', percentile: 0.95, over: ['beach', 'sand', 'dune'], within: 'beachBandM',
        from: 'p95 terrain slope (at the grid step) of the town\'s sand ground within beachBandM of the waterline',
      },
      // How far the beach reaches inland from the waterline. A property of a COAST, not of sand:
      // one number for every town would be a Class D constant (Boz, 2026-09-25).
      // Receipt, not value: Provincetown measures 98 m (▶ node scratch/marram-beach-band.mjs).
      beachBandM: {
        unit: 'm', source: 'derived', channel: 'coastDist', percentile: 0.95, over: ['beach'],
        from: 'p95 coastDist over the town\'s beach-tagged ground (OSM natural=beach, clean/map.json)',
        question: 'q-beach-band-width',
      },
      duneBlendDeg: {
        unit: '°', source: 'authored', default: 0,           // neutral: a hard state change
      },
    },
  },
  // ⭐ ROW CROPS — the six-month field (BRIEF-field-shader, 2026-09-26): bare dirt → tilled raised
  // rows → sprouts → plants → harvest, then the same states played back. Driven by the shared
  // calendar (useCalendar dayOfYear). Generator: grassMaterial.js CROP_ALBEDO.
  // ⭐ `perField`: the bake writes a field id per vertex and each field's own axis, so the rows'
  // bearing is DERIVED per field (its minimum-area rectangle), never a town-wide constant.
  crop: {
    perField: true,
    params: {
      // WHEN — a property of the town, keyed by its STATE (derived from the town's own OSM,
      // `townState`), never "April to October". Each field draws its own planting and harvest
      // day inside the most-active (15–85%) window. No finding for the state → ABSENT, and the
      // field stays bare dirt, named.
      calendar: {
        unit: 'day of year', source: 'physics', finding: 'f-usda-corn-grain-dates-{state}',
        question: 'q-crop-calendar',
      },
      rowSpacingIn:  { unit: 'in', source: 'physics', finding: 'f-ars-corn-row-traditional', question: 'q-crop-row-spacing' },
      // A MINIMUM (NRCS 346): the ridges are drawn at it.
      ridgeHeightIn: { unit: 'in', source: 'physics', finding: 'f-nrcs-346-ridge-min-height', question: 'q-crop-ridge-height' },
      // How much of the field's own season (planting → harvest) the forward sequence takes to
      // reach full plants; harvest plays it back at the same speed. Scale-free: a fraction of the
      // town's season, so it moves with the calendar. No source states it.
      growFrac:  { unit: '× season', source: 'authored', default: 0.5 },
      // The turning strip where rows stop, at each end of the field's long axis. 0 = no headland.
      headlandM: { unit: 'm', source: 'authored', default: 0 },
    },
  },
  // ⭐ The Pilgrim Monument's coursed granite — a SET-PIECE surface, not a land-use one
  // (no class maps to it). Named for its monument because every value below is THAT
  // structure's: a second town's granite set-piece gets its own entry with its own sources,
  // never these. Generator: src/components/graniteMasonryMaterial.js.
  'pilgrim-granite': {
    params: {
      // Course heights (dossier §4), drawn within this range, continuous base to top.
      courseHeightIn: { unit: 'in', source: 'physics', finding: 'f-pilgrim-course-height' },
      // Courses COUNTED on Carpenter's 1908 plate, where the plate resolves them.
      courseCount:    { unit: 'courses', source: 'physics', finding: 'm-pilgrim-courses-base-to-wash1' },
      // Joints at the documented MAXIMUM, the widest the source allows.
      jointIn:        { unit: 'in', source: 'physics', finding: 'f-pilgrim-joint-width' },
      // The mortar joint's shade against the stone (I: derived from the documented mix).
      jointShade:     { unit: '× stone albedo', source: 'physics', finding: 'd-pilgrim-joint-shade' },
      // Split (quarry) faces rather than dressed ashlar.
      face:           { unit: '—',  source: 'physics', finding: 'f-pilgrim-split-faces' },
      // Stone length and joint stagger: running bond, from Baker (1908) §200/§202.
      stoneLength:    { unit: '× course depth', source: 'physics', finding: 'd-pilgrim-stone-length' },
      // How deep the split face reads, and how much course-to-course tone varies. No source
      // states either: authored, neutral defaults (0 = flat, uniform).
      reliefM:        { unit: 'm',  source: 'authored', default: 0 },
      toneVar:        { unit: '×',  source: 'authored', default: 0 },
    },
  },
}

/** LU class → surface. ⛔ Absent means "the class's flat colour" (FadeMesh), which is
 *  the kit's honest default for a class nobody has built a generator for. */
export const SURFACE_OF_CLASS = {
  park:        'grass',
  residential: 'grass',
  agricultural: 'crop',
  recreation:  'grass',
  beach:       'sand',
  dune:        'sand',
}

/** Material kinds (ribbon bands) with a surface of their own, whatever block they are on. */
export const SURFACE_OF_MATERIAL = {
  lawn:     'grass',
  treelawn: 'grass',
  median:   'grass',
}

/** Validate an operator remap once; bad rows are DROPPED AND NAMED, never coerced. */
export function resolveClassTable(override, report = console.error) {
  const table = { ...SURFACE_OF_CLASS }
  for (const [lu, surf] of Object.entries(override || {})) {
    if (surf === null) { delete table[lu]; continue }            // operator: flat colour
    if (!SURFACES[surf]) { report(`[surfaces] ⛔ "${lu}" → "${surf}": no such surface (have ${Object.keys(SURFACES).join(', ')}). Row ignored.`); continue }
    table[lu] = surf
  }
  return table
}

/**
 * The surface a baked ground group renders with, or null for flat colour.
 *   face 'park'                → table['park']
 *   mat  'treelawn'            → SURFACE_OF_MATERIAL['treelawn']
 *   mat  'treelawn:residential'→ grass only if the BLOCK's class is grass — a
 *                                curbside strip on a parking lot stays the lot's colour.
 * ⚠️ That last rule is the pre-table behaviour, carried verbatim so LS is unchanged.
 */
export function surfaceOfGroup(group, table = SURFACE_OF_CLASS) {
  if (group.kind === 'face') return table[group.id] ?? null
  const c = group.id.indexOf(':')
  if (c < 0) return SURFACE_OF_MATERIAL[group.id] ?? null
  const bare = group.id.slice(0, c), variant = group.id.slice(c + 1)
  const own = SURFACE_OF_MATERIAL[bare]
  if (!own) return null
  return table[variant] === own ? own : null
}

/**
 * A surface's parameter VALUES: physics from the registry's findings (an id may carry the town's
 * `{state}`, passed in `place`), authored from the
 * operator's layer (`scene.surfaces.params.<surface>`) or the neutral default. Returns
 * `{ values, absent }`: a physics param with no finding, or a finding missing from the
 * registry, is ABSENT and named, never filled in. Pure: the caller passes the registry.
 */
export function resolveSurfaceParams(surface, registry, authored = {}, derived = {}, place = {}) {
  const def = SURFACES[surface]
  if (!def) throw new Error(`⛔ resolveSurfaceParams: no surface "${surface}"`)
  const byId = new Map((registry?.findings || []).map(f => [f.id, f]))
  const values = {}, absent = []
  for (const [name, p] of Object.entries(def.params)) {
    if (authored?.[name] != null) { values[name] = authored[name]; continue }
    if (p.source === 'authored') { values[name] = p.default; continue }
    // A finding id may be keyed by the town's place (`{state}`): no place → no id → ABSENT.
    const fid = p.finding?.replace(/\{(\w+)\}/g, (_, k) => place?.[k] ?? '\u0000')
    if (p.source === 'physics' && fid && !fid.includes('\u0000') && byId.has(fid)) { values[name] = byId.get(fid).value; continue }
    if (fid?.includes('\u0000')) { absent.push(`${name} (${p.unit}, physics — finding ${p.finding}: the town's ${p.finding.match(/\{(\w+)\}/)[1]} is not known)`); continue }
    // `derived` = the town's context.json `derived.<surface>`: { value } or { absent, why }.
    if (p.source === 'derived') {
      const d = derived?.[name]
      if (d && Number.isFinite(d.value)) { values[name] = d.value; continue }
      absent.push(`${name} (${p.unit}, derived — ${d?.why || 'not derived: bake the context'})`)
      continue
    }
    absent.push(`${name} (${p.unit}, ${p.source}${fid ? ' — finding ' + fid + ' missing' : ' — no source'})`)
  }
  return { values, absent }
}
