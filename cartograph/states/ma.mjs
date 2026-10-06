// states/ma.mjs — MASSACHUSETTS: the wells and vocabularies a Massachusetts town takes from its state
// (cartograph/states/index.mjs). The parcel well is STATEWIDE (MassGIS); a town selects its own TOWN_ID.

/**
 * ⭐ THE DOR PROPERTY-CLASS CODE — the same in all 351 towns (Massachusetts DOR Classification Handbook). MassGIS
 * carries it as USE_CODE, 3–4 characters, the first three being the DOR code ("1010" = 101 + a local suffix).
 * Read as LAND use, by class:
 *   0xx  mixed use — the second digit names the PRIMARY class (013x primarily residential, 031x primarily commercial)
 *   1xx  residential · 13x is residential LAND, vacant (developable / potentially / undevelopable)
 *   2xx  open space
 *   3xx  commercial · 39x vacant commercial land
 *   4xx  industrial · 44x vacant industrial land
 *   5xx  personal property — not land: ABSTAINS
 *   6xx  forest land (Ch. 61) · 7xx agricultural (Ch. 61A) · 8xx recreational (Ch. 61B)
 *   9xx  exempt — public, charitable, religious · 932 conservation land (municipal / county)
 * ⛔ A code this cannot place returns `unknown` (the parcel abstains), never a guess.
 * ▶ node checks/claims-a-state-gives-its-towns-their-wells.mjs
 */
export function readMaDorCode(code) {
  const c = String(code ?? '').replace(/\D/g, '').slice(0, 3)
  const out = (use, use_subtype = null) => ({ use, use_subtype, use_confidence: use === 'unknown' ? 'low' : 'high' })
  if (c.length !== 3) return out('unknown')
  const [d1, d2] = [c[0], c[1]]
  if (d1 === '0') return d2 === '1' ? out('residential', 'mixed') : d2 === '3' ? out('commercial', 'mixed') : d2 === '4' ? out('industrial', 'mixed') : out('unknown')
  if (d1 === '1') return d2 === '3' ? out('vacant') : out('residential')
  if (d1 === '2') return out('recreation', 'open_space')
  if (d1 === '3') return d2 === '9' ? out('vacant') : out('commercial')
  if (d1 === '4') return d2 === '4' ? out('vacant') : out('industrial')
  if (d1 === '6') return out('forest')
  if (d1 === '7') return out('agricultural')
  if (d1 === '8') return out('recreation')
  if (d1 === '9') return c === '932' ? out('park', 'conservation') : out('institutional')
  return out('unknown')                                   // 5xx personal property and anything unplaced
}

export default {
  code: 'MA', name: 'Massachusetts', version: 1,
  parcels: {
    // MassGIS Standardized Assessors' Parcels (Level 3), statewide, one feature layer. Condominium records arrive
    // STACKED on one polygon; painting unions per class, so they cannot double-paint.
    'massgis-l3': {
      protocol: 'arcgis',
      jurisdiction: 'town',
      file: 'ma_parcels.json',
      attribution: 'MassGIS (Bureau of Geographic Information) — Massachusetts Property Tax Parcels (Level 3)',
      endpoint: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query',
      select: { where: 'TOWN_ID = {town_id}' },
      land_use_code_format: 'ma-dor-numeric',
      fields: { handle: 'LOC_ID', address: 'SITE_ADDR', land_use_code: 'USE_CODE' },
      provides: ['handle', 'address', 'land_use_code'],
      // ⛔ Deliberately not taken: owner names are not ours to carry; YEAR_BUILT is 0 on vacant land (the "built in
      // year zero" this list exists to stop); ZONING is a per-town vocabulary nobody has declared.
      absent: ['owner', 'year_built', 'building_sqft', 'land_area', 'appraised_value', 'zoning', 'units',
               'num_buildings', 'vacant', 'historic_district', 'municipality'],
    },
  },
  addressPoints: {},
  vocabularies: { 'ma-dor-numeric': readMaDorCode },
}
