// states/ny.mjs — NEW YORK: the wells and vocabularies a New York town takes from its state (cartograph/states/index.mjs).
// ⭐ New York City is a SUB-STATE jurisdiction here, as St. Louis City is in mo.mjs: its wells are the city's own
// (Department of City Planning, NYC Open Data), citywide across all five boroughs, so an NYC town selects nothing —
// the fetch envelope scopes them (BRIEF-nyc-adapter §3.1). NYC is the first Ward Group: one adapter, many Wards.
// More NYC well KINDS (surfaces) arrive with the fetchers that read them (§3.2).
import { tidy } from '../building-address.mjs'
import { normaliseId } from '../permanent-id.mjs'
const s = (v) => (v == null ? '' : String(v).trim())

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
  buildings: {
    // NYC Building Footprints (DoITT/OTI) — the city's own outlines, each carrying the BIN, the Building Identification
    // Number the city keeps permanent. ⭐ On an NYC town this well IS the geometry well: Microsoft's is not fetched
    // (footprint-well.mjs); OSM still unions in. Fetched by cartograph/fetch-buildings.mjs.
    'nyc-buildings': {
      protocol: 'socrata',
      file: 'nyc_buildings.json',
      attribution: 'NYC Office of Technology and Innovation — Building Footprints (NYC Open Data 5zhs-2jue)',
      endpoint: 'https://data.cityofnewyork.us/resource/5zhs-2jue.json',
      geomField: 'the_geom',
      columns: 'the_geom,bin,height_roof,ground_elevation,construction_year,feature_code',
      // ⭐ THE PERMANENT ID. Served as a string here and as a NUMBER ("4043753.0") by BES — normalised once, to an
      // integer string. `placeholder`: the borough "million BINs" (x000000) the city stamps on footprints it has not
      // numbered — measured citywide 2026-10-05, the ONLY BINs on more than one footprint. Not an identity.
      permanentId: { field: 'bin', kind: 'bin', placeholder: '^[1-5]000000$' },
      // Units AS SERVED: NYC's are US feet. `height` is the kit's metres (bake-buildings reads tags.height).
      fields: { height: { from: 'height_roof', unit: 'ft' }, 'nyc:ground_elevation_ft': { from: 'ground_elevation' },
                'nyc:construction_year': { from: 'construction_year' }, 'nyc:feature_code': { from: 'feature_code' } },
    },
  },
  buildingAttributes: {
    // Building Elevation and Subgrade (DCP) — joined by BIN only, no geometry. Feet above sea level, NAVD88.
    // ⛔ Acquired and joined; nothing in the kit reads it yet (BRIEF-nyc-adapter §3.2a).
    'nyc-bes': {
      protocol: 'socrata',
      attribution: 'NYC Department of City Planning — Building Elevation and Subgrade (NYC Open Data bsin-59hv)',
      endpoint: 'https://data.cityofnewyork.us/resource/bsin-59hv.json',
      geomField: 'the_geom',
      columns: 'bin,z_grade,z_floor,subgrade',
      joinOn: 'bin',
      fields: { 'nyc:z_grade_ft_navd88': { from: 'z_grade' }, 'nyc:z_floor_ft_navd88': { from: 'z_floor' }, 'nyc:subgrade': { from: 'subgrade' } },
    },
  },
  trees: {
    // ⭐ Each tree well READS its own rows into one shape (cartograph/fetch-trees.mjs): { lon, lat, species (Latin, so
    // both wells name a trunk alike), common, dbh (inches, as served — the unit the city inventories share), condition,
    // standing } — `standing: false` is a record that the tree is GONE (removed, stump, shaft), never planted.
    // NYC Forestry Tree Points — the Parks Department's LIVE inventory (updated continuously).
    'nyc-forestry': {
      protocol: 'socrata',
      file: 'nyc_forestry_trees.json',
      attribution: 'NYC Parks — Forestry Tree Points (NYC Open Data hn5i-inap)',
      // ⭐ The LATER survey of the same street trees: its removal records drop a 2015 tree within DEDUP_M (fetch-trees).
      supersedes: ['nyc-street-census-2015'],
      endpoint: 'https://data.cityofnewyork.us/resource/hn5i-inap.json',
      geomField: 'location',
      columns: 'objectid,location,genusspecies,dbh,tpcondition,tpstructure',
      read(r) {
        const [lon, lat] = r.location?.coordinates || []
        const [latin, common] = s(r.genusspecies).split(' - ')
        return { lon, lat, species: s(latin) || null, common: s(common) || null, dbh: r.dbh != null ? Number(r.dbh) : null,
                 condition: s(r.tpcondition) || null, standing: s(r.tpstructure) === 'Full', dead: s(r.tpcondition) === 'Dead', recordId: s(r.objectid) }
      },
    },
    // NYC 2015 Street Tree Census — volunteer + staff survey, frozen 2017. No geometry column: scoped by lat/lon.
    'nyc-street-census-2015': {
      protocol: 'socrata',
      file: 'nyc_street_tree_census_2015.json',
      attribution: 'NYC Parks — 2015 Street Tree Census (NYC Open Data uvpi-gqnh)',
      endpoint: 'https://data.cityofnewyork.us/resource/uvpi-gqnh.json',
      geomField: { lat: 'latitude', lon: 'longitude' },
      columns: 'tree_id,latitude,longitude,spc_latin,spc_common,tree_dbh,status,health',
      read(r) {
        return { lon: Number(r.longitude), lat: Number(r.latitude), species: s(r.spc_latin) || null, common: s(r.spc_common) || null,
                 dbh: r.tree_dbh != null ? Number(r.tree_dbh) : null, condition: s(r.health) || s(r.status) || null,
                 standing: s(r.status) !== 'Stump', dead: s(r.status) === 'Dead', recordId: s(r.tree_id) }
      },
    },
  },
  addressPoints: {
    // NYC AddressPoint — the city's E-911 address layer (DoITT), the same kind as Ohio's LBRS. Every point carries the
    // BIN of the building it addresses, so on a BIN-keyed town the address joins by IDENTITY, containment as the check
    // (BRIEF-nyc-adapter §3.2a). Queens house numbers are hyphenated ("81-11") and are kept whole.
    'nyc-addresspoint': {
      protocol: 'socrata',
      provider: 'nyc-addresspoint',
      file: 'nyc_address_points.json',
      attribution: 'NYC Office of Technology and Innovation — AddressPoint (NYC Open Data uf93-f8nk)',
      endpoint: 'https://data.cityofnewyork.us/resource/uf93-f8nk.json',
      geomField: 'the_geom',
      columns: 'the_geom,bin,house_number,house_number_suffix,full_street_name',
      // ⭐ The address is the city's own: house number (+ suffix) and full street name as served ("37 AVE"), no unit.
      // A record with no house number or street name is not an address. `bin` rides along for the join.
      compose(a) {
        const n = tidy(`${s(a.house_number)}${s(a.house_number_suffix) ? ' ' + s(a.house_number_suffix) : ''}`)
        const street = tidy(s(a.full_street_name))
        if (!s(a.house_number) || !street) return null
        return { housenumber: n, street, unit: null, address: tidy(`${n} ${street}`), bin: normaliseId(a.bin) }
      },
    },
  },
  vocabularies: { 'nyc-pluto-landuse': readNycPlutoLandUse },
}
