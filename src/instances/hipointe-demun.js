/**
 * Installation config — Hi-Pointe–DeMun (installation #2). Authored from the
 * installation's own payload: cartograph/data/hipointe-demun/geography.json +
 * content/profile.json (NEIGHBORHOOD-INPUTS §5.1.1 Layer 0 / §5.1.2). Self-
 * contained — references nothing about any other installation.
 *
 * Boots via `?look=hipointe-demun`. Its baked slab (public/baked/hipointe-demun/)
 * + content (content/{listings,menus,roster,profile}.json) load through the
 * exact seam LS uses. Delivery (Cary) is NOT live here — module.delivery.enabled
 * is false; the Cary/legal/commerce fields are placeholders until it is.
 */
export default {
  lookId: 'hipointe-demun',
  skyMode: 'cheap',

  // Geography — from cartograph/data/hipointe-demun/geography.json (center =
  // boundary-polygon centroid; bbox = fetch extent).
  geography: {
    lat: 38.64231,
    lon: -90.30968,
    timezone: 'America/Chicago',
    lonToMeters: 86948,
    latToMeters: 111000,
    bbox: { minLat: 38.6199, maxLat: 38.66469, minLon: -90.34789, maxLon: -90.27148 },
    cityState: 'St. Louis, MO',   // spans STL City + Clayton + Richmond Heights
    stateCode: 'MO',
  },

  name: 'Hi-Pointe–DeMun',
  domain: 'jacobhenderson.studio/hipointe-demun',   // TBD deploy subpath (§7)

  // Content asset root (§5.1.2), relative to BASE_URL. HPDM is the clean template:
  // its logos/photos live in its own payload (cartograph/data/hipointe-demun/
  // content/), served in dev by the vite middleware at /content/hipointe-demun/.
  contentRoot: 'content/hipointe-demun/',

  branding: {
    title: 'Hi-Pointe–DeMun',
    faviconUrl: null,   // Phase 4 (index.html inject) — not read at runtime
    ogImage: null,
    assetSlug: 'hipointe-demun',
  },

  // Delivery not live → legal/commerce are placeholders (the operator is the
  // same Product owner; the per-neighborhood DBA/tax only matter once Cary runs).
  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: null,
    governingState: 'Missouri',
  },
  commerce: {
    salesTaxRate: 0.09238,   // placeholder — STL County area; refine when delivery is live
  },

  // Profile — content Layer 0, from content/profile.json.
  profile: {
    population: 6500,
    buildingCount: null,     // live-derived from the slab + content
    founded: 1917,           // platted (Hi-Pointe 1917 · DeMun 1923)
    parkAcres: null,         // no single central park like LS's; NR district = 105.5 ac
    landmarkName: 'DeMun Park',
    historicDistrictName: 'Hi-Pointe–DeMun Historic District',
    tagline: "A 1920s garden-city district at the southwest corner of Forest Park.",
    about: "Hi-Pointe–DeMun is a streetcar-era historic district straddling the St. Louis city limit and Clayton at Forest Park's southwest corner. Platted 1917–1923 and largely built in the 1920s, its brick-and-limestone homes, terra-cotta and slate roofs, and three-story apartments around DeMun Park reflect landscape architect Henry Wright's “new town” plan of curved, traffic-calmed streets and shared greens. Anchors include the 1922 Hi-Pointe Theatre — the oldest continually operating single-screen cinema in St. Louis — the Tudor Cheshire Inn, the walkable DeMun Avenue shops, and the Collegiate Gothic campus of Concordia Seminary.",
  },

  // Delivery OFF (no courier program here yet); other modules on. Mount-gating is
  // Phase 3 — these flags document intent; the App.jsx mounts don't gate on them
  // yet, so delivery UI still renders ungated until that lands.
  modules: {
    bulletin: true,
    delivery: {
      enabled: false,
      zoneDescription: null,
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

  // No Cary program → placeholder endpoints (Cary-dependent UI is delivery-module
  // territory that Phase 3 gating will hide; inert until then).
  cary: {
    smsNumber: null,
    smsNumberDisplay: null,
    email: null,
  },
  contact: {
    email: null,
  },
}
