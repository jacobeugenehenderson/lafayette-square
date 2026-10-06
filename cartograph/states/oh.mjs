// states/oh.mjs — OHIO: the wells and vocabularies an Ohio town takes from its state (cartograph/states/index.mjs).
// Both wells are STATEWIDE layers (OGRIP); a town selects its own county.
import { tidy } from '../building-address.mjs'
const s = (v) => (v == null ? '' : String(v).trim())
export default {
  code: 'OH', name: 'Ohio', version: 1,
  parcels: {
    // Ohio Statewide Parcels — its StateLUC is self-describing ("510: Res-Single Family").
    // land_use_code_format_why: Ohio's StateLUC arrives as `500: Res-Vacant Land` — the code AND its meaning in one string — so it is read by classifyUseFromText, not by St. Louis's numeric ranges. ⛔ Declaring 'stl-assessor-numeric' here would strip it to 500 and land it in `400 <= n < 700 => commercial, confidence HIGH`: a residential vacant lot reported as a confident commercial building.
    // zoning_code_format_why: Deliberately ABSENT. Erie County's parcels carry no zoning column at all (see `absent`), and an undeclared zoning vocabulary means UNREADABLE, never 'assume St. Louis'. Huron's buildings therefore take their category from the land-use code, not from a zoning letter.
    // absent_why: The statewide layer carries parcel identity, situs address, the state land-use code and lot area — and nothing else. Valuation, year built, zoning and unit counts live in the county CAMA behind a per-parcel HTML lookup (CAMADataSite), which is not a bulk endpoint. These are declared ABSENT so the roster emits null rather than zero: `INTAKE-CATALOGUE §3.2`'s correction says what an assessor UNIQUELY gives is valuation / zoning / year_built / units, and this well gives none of it. What it does give is the ADDRESS SPINE, which is what huron was actually missing — 51 addr:street tags in OSM against 3,678 buildings.
    'ohio-statewide': {
    "protocol": "arcgis",
    "jurisdiction": "county",
    "file": "oh_parcels.json",
    "attribution": "Ohio Statewide Parcels — OGRIP (Ohio Geographically Referenced Information Program)",
    "endpoint": "https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0/query",
    "land_use_code_format": "self-describing",
    "fields": {
      "handle": "LocalParcelID",
      "address": "SitusAddressAll",
      "land_use_code": "StateLUC",
      "land_area": "LandArea"
    },
    "provides": [
      "handle",
      "address",
      "land_use_code",
      "land_area"
    ],
    "absent": [
      "owner",
      "year_built",
      "building_sqft",
      "appraised_value",
      "zoning",
      "units",
      "num_buildings",
      "vacant",
      "historic_district",
      "municipality"
    ],
    "select": {
      "where": "County = '{county}'"
    }
  },
  },
  addressPoints: {
    // Ohio's Statewide LBRS Address Points (all 88 counties, E-911 field-verified). Public use "as is".
    // why (declared for huron 2026-09-29, Jacob's go): Huron (Erie County, Ohio). OSM carries 28 addressed buildings here against 3,700 in the slab; the statewide LBRS layer is the county's E-911 address points, field-verified, one endpoint for all 88 counties — the KIT answer for any Ohio town (declared 2026-09-29, Jacob's go). Joined by containment: in the footprint, or in the parcel the building stands in (ohio-statewide parcels above).
    'ohio-lbrs': {
    "protocol": "arcgis",
    "provider": "ohio-lbrs",
    "file": "oh_address_points.json",
    "attribution": "Ohio Statewide LBRS Address Points — OGRIP (Ohio Geographically Referenced Information Program)",
    endpoint: 'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/Statewide_LBRS_Address_Points/FeatureServer/0/query',
    outFields: 'HOUSENUM,UNITNUM,ST_PREFIX,ST_NAME,ST_TYPE,ST_SUFFIX,ST_SUFFIX2',
    // ⭐ The address is composed from the point's own fields — house number + street parts — WITHOUT the unit
    // (cartograph/address-points.mjs's header). A record with no house number or street name is not an address.
    compose(a) {
      const n = s(a.HOUSENUM)
      const street = [a.ST_PREFIX, a.ST_NAME, a.ST_TYPE, a.ST_SUFFIX, a.ST_SUFFIX2].map(s).filter(Boolean).join(' ')
      if (!n || n === '0' || !s(a.ST_NAME)) return null
      return { housenumber: n, street, unit: s(a.UNITNUM) || null, address: tidy(`${n} ${street}`) }
    },
    "select": {
      "where": "COUNTY = '{county}'"
    }
  },
  },
  vocabularies: {},   // 'self-describing' is the kit's own text reader (parcel-landuse.mjs), not Ohio's
}
