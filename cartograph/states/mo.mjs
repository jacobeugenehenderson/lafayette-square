// states/mo.mjs — MISSOURI: the wells and vocabularies a Missouri town takes from its state (cartograph/states/index.mjs).
// ⛔ Missouri has NO statewide parcel layer (measured 2026-10-05: the only statewide service, gis.mo.gov
// FMDCrealEstate_StateOwnedParcels, holds state-owned property only). Its wells are SUB-STATE — a county's or an
// independent city's own assessor — so a town names the jurisdiction wells it straddles; there is nothing to select.
export default {
  code: 'MO', name: 'Missouri', version: 1,
  parcels: {
    // St. Louis City — an INDEPENDENT CITY: its assessor holds only City parcels.
    // ⛔ raw/stl_parcels.json is scripts/03-fetch-stl-parcels.py's output (it folds second columns the button cannot);
    // do not re-fetch through cartograph/fetch-parcels.mjs until the field map grows a fallback-column form.
    'stl-city': {
    "protocol": "arcgis",
    "jurisdiction": "city",
    "file": "stl_parcels.json",
    "attribution": "City of St. Louis Assessor — Assessor_Public_Parcels",
    "endpoint": "https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer/11/query",
    "land_use_code_format": "stl-assessor-numeric",
    "fields": {
      "handle": "Handle",
      "address": "SITEADDR",
      "owner": "OwnerName",
      "year_built": "FirstYearBuilt",
      "building_sqft": "SQFT",
      "land_area": "LandArea",
      "appraised_value": "AprResImprove",
      "land_use_code": "AsrLandUse1",
      "zoning": "Zoning",
      "units": "NbrOfUnits",
      "num_buildings": "NbrOfBldgsRes",
      "vacant": "VacantLot",
      "historic_district": "NatHistDist"
    },
    "constants": {
      "municipality": "St. Louis"
    },
    "provides": [
      "handle",
      "address",
      "owner",
      "year_built",
      "building_sqft",
      "land_area",
      "appraised_value",
      "land_use_code",
      "zoning",
      "units",
      "num_buildings",
      "vacant",
      "historic_district"
    ],
    "absent": [],
    "zoning_code_format": "stl-letter"
  },
    // St. Louis County — numeric LUCODE, decoded by the assessor's own table (the town's `landUseCodes`).
    // ⛔ Same caveat: raw/stlco_parcels.json is scripts/03b's output.
    'stl-county': {
    "protocol": "arcgis",
    "jurisdiction": "county",
    "file": "stlco_parcels.json",
    "attribution": "St. Louis County OpenData — Tax Parcels",
    "endpoint": "https://maps.stlouisco.com/hosting/rest/services/OpenData/OpenData/FeatureServer/7/query",
    "land_use_code_format": "stl-assessor-numeric",
    "fields": {
      "handle": "LOCATOR",
      "address": "PROP_ADD",
      "owner": "OWNER_NAME",
      "year_built": "YEARBLT",
      "building_sqft": "RESQFT",
      "land_area": "ACRES",
      "appraised_value": "TOTAPVAL",
      "land_use_code": "LUCODE",
      "zoning": "ZONING",
      "units": "LIVUNIT",
      "municipality": "MUNICIPALITY"
    },
    "provides": [
      "handle",
      "address",
      "owner",
      "year_built",
      "building_sqft",
      "land_area",
      "appraised_value",
      "land_use_code",
      "zoning",
      "units",
      "municipality"
    ],
    "absent": [
      "num_buildings",
      "vacant",
      "historic_district"
    ],
    "zoning_code_format": "stl-letter"
  },
  },
  addressPoints: {},
  // 'stl-assessor-numeric' is read in parcel-landuse.mjs#classifyParcelLandUse (City ranges + the County decode table).
  vocabularies: {},
}
