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
  },

  // Display name. Used sparingly in runtime (aria-labels, OG meta);
  // most "Lafayette Square" UI copy is crafted flavor text and stays
  // literal until a second instance forces the rewrite.
  name: 'Lafayette Square',

  // Deploy-side hostname. Use sparingly at runtime.
  domain: 'lafayette-square.com',

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
