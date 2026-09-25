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

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
