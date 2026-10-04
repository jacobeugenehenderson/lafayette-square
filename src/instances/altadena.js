/**
 * Altadena — scaffolded by cartograph/scaffold-instance.mjs from this town's own geography.json and
 * neighborhood.json (2026-10-04). Every null is DECLARED — unknown, never borrowed.
 * ⭐ Edit freely: this file is the town's authored identity.
 */
export default {
  lookId: "altadena",
  skyMode: 'cheap',

  geography: {
    lat: 34.19212,
    lon: -118.13529,
    timezone: "America/Los_Angeles",
    lonToMeters: 92079,
    latToMeters: 111000,
    bbox: { minLat: 34.16347, maxLat: 34.22285, minLon: -118.17794, maxLon: -118.08879 },
    cityState: null,
    stateCode: null,
  },

  name: "Altadena",
  domain: null,

  contentRoot: 'content/altadena/',

  branding: {
    faviconUrl: null,
    // ⛔ NO MARK YET — the operator authors one (an emoji), in the Look. Until then the town shows its own initial.
    mark: null,
    ogImage: null,
    assetSlug: "altadena",
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

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
