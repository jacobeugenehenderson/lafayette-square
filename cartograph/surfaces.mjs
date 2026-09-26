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
      beachSlopeDeg: {
        unit: '°', source: 'derived',
        from: 'p95 slope of the town\'s beach band (sand ground within beachBandM of the coast), at the terrain grid step',
        needs: ['coast', 'terrain', 'water datum', 'beachBandM'],
      },
      // How far the beach reaches inland from the waterline. Read against the coastDist
      // context channel (cartograph/bake-coast-distance.js).
      beachBandM: {
        unit: 'm', source: 'physics', channel: 'coastDist',
        question: 'q-beach-band-width', finding: null,        // [U] until answered
      },
      duneBlendDeg: {
        unit: '°', source: 'authored', default: 0,           // neutral: a hard state change
      },
    },
  },
  // ⭐ Coursed granite — a SET-PIECE surface, not a land-use one (no class maps to it). First
  // wearer: Provincetown's Pilgrim Monument placeholder (src/components/PilgrimMonument.jsx).
  // Values come from the reconstruction dossier §4 (source `pilgrim-dossier-v1`).
  granite: {
    params: {
      // Course heights are drawn within this range, continuous from the base to the top.
      courseHeightIn: { unit: 'in', source: 'physics', finding: 'f-pilgrim-course-height' },
      // Joints are drawn at the documented MAXIMUM, the widest the source allows.
      jointIn:        { unit: 'in', source: 'physics', finding: 'f-pilgrim-joint-width' },
      // Split (quarry) faces rather than dressed ashlar.
      face:           { unit: '—',  source: 'physics', finding: 'f-pilgrim-split-faces' },
      // Stone length along a course: the dossier gives none (U). ABSENT ⇒ no vertical joints.
      blockLengthIn:  { unit: 'in', source: 'physics', question: null, finding: null },
      // How deep the split face's relief reads, and how much stone-to-stone tone varies.
      // No source states either: neutral defaults (0 = flat, uniform).
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
 * A surface's parameter VALUES: physics from the registry's findings, authored from the
 * operator's layer (`scene.surfaces.params.<surface>`) or the neutral default. Returns
 * `{ values, absent }`: a physics param with no finding, or a finding missing from the
 * registry, is ABSENT and named, never filled in. Pure: the caller passes the registry.
 */
export function resolveSurfaceParams(surface, registry, authored = {}) {
  const def = SURFACES[surface]
  if (!def) throw new Error(`⛔ resolveSurfaceParams: no surface "${surface}"`)
  const byId = new Map((registry?.findings || []).map(f => [f.id, f]))
  const values = {}, absent = []
  for (const [name, p] of Object.entries(def.params)) {
    if (authored?.[name] != null) { values[name] = authored[name]; continue }
    if (p.source === 'authored') { values[name] = p.default; continue }
    if (p.source === 'physics' && p.finding && byId.has(p.finding)) { values[name] = byId.get(p.finding).value; continue }
    absent.push(`${name} (${p.unit}, ${p.source}${p.finding ? ' — finding ' + p.finding + ' missing' : ' — no source'})`)
  }
  return { values, absent }
}
