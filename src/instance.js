/**
 * INSTANCE — per-instance configuration. The runtime reads from this
 * module instead of hardcoding LS-specific values; swapping this file
 * (or build-time-replacing it) is how a different instance (Cary,
 * future neighborhoods) reuses the same kit.
 *
 * Authored identity (sky, materials, palette, arch placement, ...)
 * travels through the slab — see `slab-is-the-instance-identity`.
 * THIS module covers the fixed-truth identity the slab doesn't carry:
 * geography, instance id, contact endpoints.
 *
 * Doctrine: project_slab_is_the_instance_identity,
 * project_kit_helpers_pattern.
 */
export const INSTANCE = {
  // Slab pointer — which baked Look the runtime loads by default.
  // The ?look= URL override still wins where it's wired (Preview's
  // standalone path).
  lookId: 'lafayette-square',

  // Sky renderer (TEMPORARY stopgap — see src/lib/skyMode.js). 'cheap'
  // ships the restored procedural <CloudDome/>; 'volumetric' mounts the
  // Meteorologist <Atmosphere/> slab. Default 'cheap' while the per-genus
  // cloud work cooks; `?sky=volumetric` overrides per-URL. Remove this
  // (and the switch) once the volumetric sky is the only sky.
  skyMode: 'cheap',

  // Fixed-truth geography. SunCalc, weather API, planetarium sidereal
  // math all read from here.
  geography: {
    lat: 38.6160,
    lon: -90.2161,
    timezone: 'America/Chicago',  // IANA tz for weather API + display
    // WGS84 → local-scene-meters conversion at this latitude. SSOT for the
    // projection: both the frontend (AerialTiles) and the cartograph backend
    // (config.js) read these instead of re-hardcoding the same numbers.
    lonToMeters: 86774,
    latToMeters: 111000,
    // Neighborhood bbox: S above I-44, N past Chouteau, W past Jefferson.
    bbox: { minLat: 38.6100, maxLat: 38.6230, minLon: -90.2290, maxLon: -90.2070 },
    // City/state the installation sits in (legal + display copy).
    cityState: 'St. Louis, MO',
    stateCode: 'MO',
  },

  // Display name. The neighborhood name (varies per installation). Read
  // this wherever the *neighborhood* is named — NOT for Product constants
  // like "Cary" or "Lafayette Square"-the-Product (those stay literal).
  name: 'Lafayette Square',

  // Deploy-side hostname. Use sparingly at runtime.
  domain: 'lafayette-square.com',

  // Branding assets (the reader's chrome). name/domain live flat above (one
  // home each — don't duplicate). copy: the crafted Legal/Info prose bundle is
  // DEFERRED to Phase 4 — it stays literal in the components until then.
  branding: {
    title: 'Lafayette Square',                                   // index.html <title>/OG (Phase 4 build-time inject)
    faviconUrl: 'https://lafayette-square.com/favicon.svg',      // index.html (Phase 4)
    ogImage: 'https://lafayette-square.com/photos/og-preview.jpg', // index.html (Phase 4)
    assetSlug: 'lafayette-square',                               // per-look asset filenames (e.g. <slug>.svg); == lookId for #1
  },

  // Legal entity + governing law (installation-specific: a different operator
  // in a different state changes these).
  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: 'Lafayette Square Deliveries',
    governingState: 'Missouri',
  },

  // Commerce constants (installation-specific: local sales-tax jurisdiction).
  commerce: {
    salesTaxRate: 0.08725,   // MO 4.225% + St. Louis 4.5%
  },

  // Neighborhood profile — the content Layer-0 facts the reader shows
  // (bulletin masthead, InfoModal). buildingCount is live-derived from the
  // slab; the rest are supplied. (NEIGHBORHOOD-INPUTS §5.1.1 Layer 0.)
  profile: {
    population: 2164,
    buildingCount: null,     // live-derived (_buildingCount); null = use the live count
    founded: 1851,
    parkAcres: 30,
    landmarkName: 'Lafayette Park',
    historicDistrictName: 'Lafayette Square Historic District',
  },

  // Module manifest — which features this installation runs. LS = all-on.
  // Phase 1 defines the home; the App.jsx mount-gating is Phase 3. "Cary" is a
  // Product constant, NOT a field — delivery.enabled gates PRESENCE only, and
  // participant data (cary.* above, zoneDescription) carries the variation.
  modules: {
    bulletin: true,
    delivery: {
      enabled: true,
      zoneDescription: 'Chouteau Avenue to Interstate 44, Jefferson Avenue to Truman Parkway',
    },
    contact: true,
    codedesk: true,
    sms: true,
    chat: true,
    info: true,
    events: true,
    society: true,
    residences: true,
  },

  // Cary courier program contact endpoints (per-instance: each
  // neighborhood that runs Cary has its own SMS + email).
  cary: {
    smsNumber: '+18773351917',
    smsNumberDisplay: '(877) 335-1917',
    email: 'cary@lafayette-square.com',
  },

  // General contact endpoint.
  contact: {
    email: 'hello@lafayette-square.com',
  },
}

// This module is the DEFAULT installation (Lafayette Square) only. Every other
// installation is a self-contained data folder — its geography lives in
// cartograph/data/<installation>/geography.json (+ neighborhood_boundary.json),
// loaded BY ID; nothing about another installation is parked here. (Multi-
// installation routing decision + HiPointe extent provenance: the project
// memory + HANDOFF-hipointe-pour-step0.md.)
