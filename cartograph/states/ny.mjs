// states/ny.mjs — NEW YORK: the wells and vocabularies a New York town takes from its state (cartograph/states/index.mjs).
// ⭐ New York City is a SUB-STATE jurisdiction here, as St. Louis City is in mo.mjs: its wells are the city's own
// (Department of City Planning, NYC Open Data), citywide across all five boroughs, so an NYC town selects nothing —
// the fetch envelope scopes them (BRIEF-nyc-adapter §3.1). NYC is the first Ward Group: one adapter, many Wards.
// More NYC well KINDS (buildings, trees, address points, surfaces) arrive with the fetchers that read them (§3.2).

/**
 * ⭐ PLUTO `LandUse` — the Department of City Planning's 11 land-use categories, the same in all five boroughs
 * (PLUTO data dictionary). Served zero-padded ("01"); read as LAND use:
 *   01 one & two family · 02 multi-family walk-up · 03 multi-family elevator      → residential
 *   04 mixed residential & commercial                                               → residential (mixed)
 *   05 commercial & office · 06 industrial & manufacturing
 *   07 transportation & utility                                                     → industrial (utility)
 *   08 public facilities & institutions · 09 open space & outdoor recreation
 *   10 parking facilities · 11 vacant land
 * ⛔ A code this cannot place (blank, or outside 01–11) returns `unknown` — the parcel abstains, never a guess.
 * ▶ node checks/claims-a-state-gives-its-towns-their-wells.mjs
 */
export function readNycPlutoLandUse(code) {
  const out = (use, use_subtype = null) => ({ use, use_subtype, use_confidence: use === 'unknown' ? 'low' : 'high' })
  const t = String(code ?? '').trim()
  if (!/^\d{1,2}$/.test(t)) return out('unknown')
  switch (Number(t)) {
    case 1: case 2: case 3: return out('residential')
    case 4: return out('residential', 'mixed')
    case 5: return out('commercial')
    case 6: return out('industrial')
    case 7: return out('industrial', 'utility')
    case 8: return out('institutional')
    case 9: return out('recreation', 'open_space')
    case 10: return out('parking')
    case 11: return out('vacant')
    default: return out('unknown')
  }
}

export default {
  code: 'NY', name: 'New York', version: 1,
  parcels: {
    // NYC MapPLUTO — every tax lot in the five boroughs, one feature layer (DCP's own ArcGIS service; polygons).
    'nyc-mappluto': {
      protocol: 'arcgis',
      jurisdiction: 'city',
      file: 'nyc_parcels.json',
      attribution: 'NYC Department of City Planning — MapPLUTO',
      endpoint: 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0/query',
      land_use_code_format: 'nyc-pluto-landuse',
      // BBL = borough · block · lot, the city's permanent tax-lot id. BldgArea is gross floor area in square feet —
      // the unit `building_sqft` already means everywhere (derive.js SQFT_TO_SQM).
      fields: { handle: 'BBL', address: 'Address', land_use_code: 'LandUse', building_sqft: 'BldgArea',
                units: 'UnitsTotal', num_buildings: 'NumBldgs', historic_district: 'HistDist' },
      constants: { municipality: 'New York' },
      provides: ['handle', 'address', 'land_use_code', 'building_sqft', 'units', 'num_buildings', 'historic_district'],
      // ⛔ Deliberately not taken: owner names are not ours to carry (ma.mjs's rule) · YearBuilt is 0 where unknown (the
      // "built in year zero" ma.mjs refuses; the footprint well carries construction_year) · AssessTot is ASSESSED,
      // not appraised · ZoneDist1 is a vocabulary nobody has declared · LotArea is square feet and the kit's
      // `land_area` has no declared unit (St. Louis City and County already disagree), so it waits for one.
      absent: ['owner', 'year_built', 'appraised_value', 'zoning', 'land_area', 'vacant'],
    },
  },
  addressPoints: {},
  vocabularies: { 'nyc-pluto-landuse': readNycPlutoLandUse },
}
