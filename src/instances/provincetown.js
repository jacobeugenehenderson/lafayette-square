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

  contentRoot: 'content/provincetown/',

  branding: {
    faviconUrl: null,
    mark: "🦞",   // OLD PLAYER ONLY, UNTIL CUTOVER: a copy of the Look's identity.mark (the source). ▶ node checks/claims-a-towns-identity-is-its-own.mjs
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
    landmarkName: null, historicDistrictName: null,
    tagline: "Discover Provincetown, Massachusetts, a vibrant seaside town at the tip of Cape Cod, celebrated for its art, history, LGBTQ+ culture, and distinctive coastal character.",
    about: null,
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

  // Displays (src/displays; BRIEF-the-monument-lights-up): the monument's Light Show. The record is the town's
  // authored data, here until Stage's Displays section writes it; the looks are the town's content (contentRoot).
  // `season` names the town's published calendar row (r-provincetown-light-season-is-authored: from November 11,
  // authored); with no calendar read the display is off. The strands end ~20 ft above the monument's base (Jacob,
  // 2026-10-31); `ringRadiusM` is still a guess, open.
  displays: [{
    id: 'monument-lights', kind: 'light-show', name: 'Light Show', attach: 'setPiece',
    drawer: 'displays/monument-lights/looks.json',            // under the town's contentRoot: its content, not the kit's
    season: 'monument-lighting',
    strands: { glow: 20, show: 60, ringRadiusM: 31, footHeightM: 6.1 },   // 6.1 m = 20 ft
    dimUplights: 0.15,                  // while lit (glow or show), the monument's floods fade to 15% of what the Look authors
    // All 26 looks, spread so each tradition recurs and no two neighbours share a main colour; Progress Pride → Chevron →
    // Trans (vertical stripes, the chevron, horizontal stripes); Doves → Red Ribbon → White Bulbs close (Jacob, 2026-10-31).
    run: [
      { look: 'classic-tree', seconds: 10 }, { transition: 'cascade' }, { look: 'snowflakes', seconds: 8 },
      { transition: 'curtain' }, { look: 'santa', seconds: 8 }, { transition: 'melt' }, { look: 'menorah', seconds: 10 },
      { transition: 'sparkle' }, { look: 'bear', seconds: 8 }, { transition: 'iris' }, { look: 'holly', seconds: 8 },
      { transition: 'twirl' }, { look: 'dreidel', seconds: 8 }, { transition: 'rising-spiral' },
      { look: 'candy-cane', seconds: 8 }, { transition: 'expanding-stripes' }, { look: 'stars', seconds: 8 },
      { transition: 'blackout-bloom' }, { look: 'rudolph', seconds: 8 }, { transition: 'cascade' },
      { look: 'gift-pride', seconds: 6 }, { transition: 'curtain' }, { look: 'snowman', seconds: 8 },
      { transition: 'melt' }, { look: 'kwanzaa-bands', seconds: 8 }, { transition: 'sparkle' },
      { look: 'snowfall', seconds: 10 }, { transition: 'iris' }, { look: 'plaid', seconds: 8 }, { transition: 'twirl' },
      { look: 'bells', seconds: 8 }, { transition: 'rising-spiral' }, { look: 'progress-pride', seconds: 3 },
      { transition: 'chevron' }, { look: 'trans', seconds: 8 }, { transition: 'expanding-stripes' },
      { look: 'gingerbread', seconds: 8 }, { transition: 'blackout-bloom' }, { look: 'peppermint', seconds: 8 },
      { transition: 'cascade' }, { look: 'ornaments', seconds: 8 }, { transition: 'curtain' },
      { look: 'gift-red', seconds: 8 }, { transition: 'melt' }, { look: 'santas-hat', seconds: 8 },
      { transition: 'sparkle' }, { look: 'doves', seconds: 8 }, { transition: 'blackout-bloom' },
      { look: 'red-ribbon', seconds: 25 }, { transition: 'shatter' }, { look: 'white-bulbs', seconds: 10 },
    ],
    viewingSpots: [],
  }],

  cary: { smsNumber: null, smsNumberDisplay: null, email: null },
  contact: { email: null },
}
