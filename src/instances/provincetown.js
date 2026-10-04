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
  // The town's locale — authored, never the viewer's browser and never another town's (Jacob, 2026-09-28:
  // "localize the almanac"). Every date, time, temperature and price the Ward shows is formatted from this.
  locale: { language: "en-US", temperature: "fahrenheit", currency: "USD", length: 'feet' },
  domain: null,   // ⛔ NOT A SOURCE (2026-09-26): the production domain lives in Operations (src/lib/townOrigin.js).

  contentRoot: 'content/provincetown/',

  branding: {
    faviconUrl: null,
    mark: "🦞",   // OLD PLAYER ONLY, UNTIL CUTOVER: a copy of the Look's identity.mark (the source). ▶ node checks/claims-a-towns-identity-is-its-own.mjs
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
  // `buildingId` is the building the set-piece stands on, one of the town's own buildings (OSM
  // way 164024699, the tower). The slot reads its footprint from the slab, the bake builds no box
  // for it, and its listing and card go through this id. ▶ node checks/claims-set-piece-contract.mjs
  // `model: null` means the placeholder renders.
  setPiece: {
    kind: 'pilgrim-monument',
    buildingId: 'osm-164024699',
    name: 'Pilgrim Monument',         // the way's OSM `name`; printed at the plinth's south face
    model: null,
  },

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
