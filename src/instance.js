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

// ─────────────────────────────────────────────────────────────────────────
// DRAFT — HiPointe-DeMun (neighborhood #2), pour step 0: geography seam only.
//
// NOT WIRED IN. `instance.js` is single-instance today ("switching
// neighborhoods = replace the exported INSTANCE"). This is a parked draft of
// the geography block so the config seam is real; it does NOT change the
// running LS app. To pour HiPointe you would today swap the LS values in
// INSTANCE above for these — see the routing flag below before doing so.
//
// MULTI-INSTANCE ROUTING — DECIDED 2026-07-02 (not a from-scratch build).
// The routing mostly EXISTS: the cartograph backend already has a `scene`
// axis (data/<scene>/, sceneRawDir/Dir, per-scene routes; toy is a 2nd scene)
// and every Look carries a `scene` field (serve.js). At runtime the pulldown
// sets lookId → ?look= → every baked consumer fetches /baked/<lookId>/. So
// selecting a baked neighborhood already routes geometry/trees/lamps/scene.
//   The ONE gap: GEOGRAPHY doesn't ride the axis. lat/lon/tz/projection below
// are read as import-time constants (const LATITUDE = INSTANCE.geography.lat)
// in ~10 runtime files (Atmosphere/sun, useWeather, Planetarium, GatewayArch,
// DawnTimeline, splash) — never keyed by lookId.
//   DECISION: bake geography INTO the slab (scene.json / baked manifest) and
// make those ~10 consumers read it reactively per-lookId via the existing
// useSceneJson pattern — NOT a per-town instance.js fork, NOT a client
// registry. Source of truth stays data/<scene>/neighborhood_boundary.json;
// the bake copies it into the slab (slab-is-the-identity). So the geography
// block below is really a DRAFT of what HiPointe's BAKE should emit — its home
// graduates into the pour/bake, not this module. (Build = a later brief.)
//   Deploy identity (domain, cary, contact) is per-DEPLOYMENT, NOT viewer-
// switchable — stays host/subpath-scoped at deploy (§7 jacobhenderson.studio/
// <hood>). Separate, smaller, deferred.
//
// Extent provenance: minimal-enclosing circle over trusted OSM anchors
// (Hi-Pointe admin polygon + DeMun anchors + best-guess Skinker E edge).
// center + radius live in cartograph/data/hipointe-demun/neighborhood_boundary.json.
// Contested edges (Skinker E, Wydown/DeMun N, the §9 "Big Bend" mismatch —
// OSM's Big Bend Blvd is ~900m SW in Maplewood, not this east border) are
// best-guess, operator-nudgeable on the aerial (NEIGHBORHOOD-INPUTS §11).
// Full method: HANDOFF-hipointe-pour-step0.md.
export const HIPOINTE_DEMUN_DRAFT = {
  lookId: 'hipointe-demun',
  skyMode: 'cheap',
  geography: {
    lat: 38.63434,
    lon: -90.30165,
    timezone: 'America/Chicago', // shared with LS — same STL tz
    // Recomputed for THIS latitude (38.634°N): 111320·cos(lat). LS's 86774 is
    // latitude-specific (38.616°N); HiPointe is ~0.018° north, so ~86957.
    lonToMeters: 86957,
    latToMeters: 111000,
    // Fetch-convenience bbox = circle center ± radius (1350m). Clipping is to
    // the radius/boundary, not this box (INTAKE §0).
    bbox: { minLat: 38.6221, maxLat: 38.6465, minLon: -90.3172, maxLon: -90.2861 },
  },
  name: 'Hi-Pointe & DeMun',
  domain: 'TBD', // §7-step-8: jacobhenderson.studio/hipointe-demun subpath (unconfirmed)
  // cary/contact endpoints: per-instance, provision when #2 goes live.
}
