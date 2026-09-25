/**
 * Provincetown — scaffolded by cartograph/scaffold-instance.mjs from this town's own geography.json and
 * neighborhood.json (2026-09-25). Every null is DECLARED — unknown, never borrowed.
 * ⭐ Edit freely: this file is the town's authored identity.
 */
export default {
  lookId: "provincetown",
  skyMode: 'cheap',

  geography: {
    lat: 42.05167,
    lon: -70.18666,
    timezone: "America/New_York",
    lonToMeters: 82660,
    latToMeters: 111000,
    bbox: { minLat: 41.97211, maxLat: 42.13123, minLon: -70.29349, maxLon: -70.07982 },
    cityState: null,
    stateCode: null,
  },

  name: "Provincetown",
  domain: null,

  contentRoot: 'content/provincetown/',

  branding: {
    title: "Provincetown",
    faviconUrl: null,
    // Authored.
    mark: "⚓",
    ogImage: null,
    assetSlug: "provincetown",
  },

  // No legal documents declared → the legal pages say "not declared" (src/instances/copy/index.jsx).
  legal: {
    entityName: null,
    dba: null,
    governingState: null,
  },

  commerce: { salesTaxRate: null },

  profile: {
    population: null, buildingCount: null, founded: null, parkAcres: null,
    landmarkName: null, historicDistrictName: null, tagline: null, about: null,
  },

  modules: {
    bulletin: true,
    delivery: { enabled: false, zoneDescription: null },
    contact: true, codedesk: true, sms: true, chat: true, info: true, events: true, society: true, residences: true,
  },

  // The town's set-piece: the Pilgrim Monument, roughed in from the reconstruction dossier
  // and awaiting the artist's model. Renderer: src/components/PilgrimMonument.jsx. Dossier
  // table + the drop-in contract: src/setpieces/pilgrimMonument.js.
  // `footprint` is OSM way 164024699's ring as lon/lat. ▶ node checks/claims-pilgrim-monument-site.mjs
  // re-reads it against raw/osm.json. `model: null` means the placeholder renders.
  setPiece: {
    kind: 'pilgrim-monument',
    osmWay: 164024699,
    name: 'Pilgrim Monument',         // the way's OSM `name`; printed at the plinth's south face
    footprint: [[-70.1886329,42.052274],[-70.1885986,42.052243],[-70.1885667,42.0522142],[-70.1886086,42.0521885],[-70.1886552,42.0521601],[-70.1886889,42.0521904],[-70.1887215,42.0522198],[-70.1886746,42.0522485]],
    model: null,
  },

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
