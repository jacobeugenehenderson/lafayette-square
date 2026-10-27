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
      registry: 'massgis-l3-parcels',   // terms: references/registry.json (checks/claims-references-are-sound.mjs)
      endpoint: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query',
      select: { where: 'TOWN_ID = {town_id}' },
      land_use_code_format: 'ma-dor-numeric',
      fields: { handle: 'LOC_ID', address: 'SITE_ADDR', land_use_code: 'USE_CODE', row_type: 'POLY_TYPE', land_use_desc: 'USE_DESC' },
      // POLY_TYPE is MassGIS's own ROW marker (verified served at the endpoint, 2026-10-18; PTown's bbox: FEE 6,578 · TAX 3).
      // It rides the next PTown fetch; ma_parcels.json on disk predates it.
      provides: ['handle', 'address', 'land_use_code', 'row_type', 'land_use_desc'],
      // ⛔ Deliberately not taken: owner names are not ours to carry; YEAR_BUILT is 0 on vacant land (the "built in
      // year zero" this list exists to stop); ZONING is a per-town vocabulary nobody has declared.
      absent: ['owner', 'year_built', 'building_sqft', 'land_area', 'appraised_value', 'zoning', 'units',
               'num_buildings', 'vacant', 'historic_district', 'municipality'],
    },
  },
  addressPoints: {},
  // ⭐ HISTORY WELLS — facts about a BUILDING, read per record and joined by geometry and address (bake-content.js
  // #joinHistory). ⛔ Never a district layer: MHCINV_POLY (areas) is not read; membership is Extent's (Jacob, 2026-10-21).
  history: {
    // The MHC inventory (MACRIS), as MassGIS distributes it: a file geodatabase, read locally with GDAL
    // (cartograph/fetch-history.mjs). The town selects itself by TOWN_NAME, as MHC spells it.
    'mhc-inventory': {
      protocol: 'file',
      reader: 'mhc-gdb',
      registry: 'mhc-inventory',
      file: 'mhc_inventory.json',
      gdb: { zip: 'MHC_Inventory_GDB.zip', dataset: 'MHC_Inventory.gdb', layer: 'MHCINV_PT',
             download: 'https://www.arcgis.com/home/item.html?id=e27a15d822ef4b10bb4dd6eb631ceb3c' },
      select: { where: "TOWN_NAME = '{town_name}'" },
      attribution: 'Massachusetts Historical Commission, MACRIS inventory (via MassGIS)',
    },
  },
  vocabularies: { 'ma-dor-numeric': readMaDorCode },
  // ⭐ HOW THIS STATE'S HISTORY RECORDS READ (bake-content.js#historyFacts takes all of it from here; ⛔ none of it is kit
  // code, and a town whose state has no `history_vocabulary` is refused by name when it declares a records well).
  history_vocabulary: {
    // MHC's DESIGNATIO codes, as far as a source establishes them. The layer's own legend (MHC_Historic_Inventory.lyr and
    // the MassGIS item's description) names LHD, PR and the National Register; NRIND / NRDIS are the Register's two ways
    // of listing — individually, and within a listed group — and agree with nomination 89001148 p.40, which names the
    // individually listed buildings (the Library, the Universalist and Center Methodist churches: NRIND in the data).
    // ⛔ A code not here (NRDOE, NRTRA, …) is reported by name and writes nothing: its meaning is not established.
    designations: {
      NRIND: 'Individually listed on the National Register of Historic Places',
      NRDIS: 'Listed on the National Register of Historic Places, as one of a group of buildings nominated together',
      LHD: 'Locally designated (Local Historic District)',
      PR: 'A preservation restriction is recorded',
    },
    // the codes that mean the building IS on the National Register (the card's "National Register" status)
    listed: ['NRIND', 'NRDIS'],
    // MHC's TYPE values for a resource that IS its footprint (a house; a lighthouse, a wharf, the Monument). An Object (a
    // statue) or a Burial Ground on the same lot gives the building no facts. ⛔ A record with no TYPE names nothing and is
    // counted by id — never defaulted to a building.
    names_footprint: ['Building', 'Structure'],
    // ARCHITECTU values that are placeholders, not styles (read off PTown's records, 2026-10-26)
    style_placeholders: ['No style', 'Not researched', 'Other'],
  },
}
