/**
 * Installation config — Lafayette Square (installation #1, the eponymous
 * Product default). One self-contained per-install config module; `instance.js`
 * selects among them by `?look=`. Values are byte-identical to the pre-boot
 * hardcoded INSTANCE. (NEIGHBORHOOD-INPUTS §5.1.2 — installations are
 * self-contained; none references another.)
 */
export default {
  // Slab pointer — which baked Look the runtime loads.
  lookId: 'lafayette-square',

  // Sky renderer (TEMPORARY stopgap — see src/lib/skyMode.js). 'cheap' ships the
  // restored procedural <CloudDome/>; 'volumetric' mounts the Meteorologist
  // <Atmosphere/> slab. `?sky=volumetric` overrides per-URL.
  skyMode: 'cheap',

  // Fixed-truth geography. SunCalc, weather API, planetarium sidereal math read here.
  geography: {
    lat: 38.6160,
    lon: -90.2161,
    timezone: 'America/Chicago',  // IANA tz for weather API + display
    // WGS84 → local-scene-meters conversion at this latitude. SSOT for the
    // projection (frontend AerialTiles + cartograph backend config.js).
    lonToMeters: 86774,
    latToMeters: 111000,
    // Neighborhood bbox: S above I-44, N past Chouteau, W past Jefferson.
    bbox: { minLat: 38.6100, maxLat: 38.6230, minLon: -90.2290, maxLon: -90.2070 },
    // City/state the installation sits in (legal + display copy).
    cityState: 'St. Louis, MO',
    stateCode: 'MO',
  },

  // Display name — the neighborhood name (varies per installation).
  name: 'Lafayette Square',

  // Deploy-side hostname.
  domain: 'lafayette-square.com',

  // Branding assets (the reader's chrome). copy: the Legal/Info prose bundle is
  // DEFERRED to Phase 4 — it stays literal in the components until then.
  branding: {
    title: 'Lafayette Square',                                   // index.html <title>/OG (Phase 4)
    faviconUrl: 'https://lafayette-square.com/favicon.svg',      // index.html (Phase 4)
    ogImage: 'https://lafayette-square.com/photos/og-preview.jpg', // index.html (Phase 4)
    assetSlug: 'lafayette-square',                               // per-look asset filenames; == lookId for #1
  },

  // Legal entity + governing law (installation-specific).
  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: 'Lafayette Square Deliveries',
    governingState: 'Missouri',
  },

  // Commerce constants (installation-specific: local sales-tax jurisdiction).
  commerce: {
    salesTaxRate: 0.08725,   // MO 4.225% + St. Louis 4.5%
  },

  // Neighborhood profile — content Layer-0 facts (masthead, InfoModal).
  // buildingCount is live-derived from the slab; the rest are supplied.
  profile: {
    population: 2164,
    buildingCount: null,     // live-derived (_buildingCount); null = use the live count
    founded: 1851,
    parkAcres: 30,
    landmarkName: 'Lafayette Park',
    historicDistrictName: 'Lafayette Square Historic District',
  },

  // Module manifest — which features this installation runs. LS = all-on.
  // App.jsx mount-gating is Phase 3. "Cary" is a Product constant, not a field —
  // delivery.enabled gates PRESENCE; participant data (cary.*) carries variation.
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

  // Cary courier program contact endpoints (per-instance).
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
