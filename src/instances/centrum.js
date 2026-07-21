/**
 * Śródmieście, Łódź — installation #4. The second Polish pour, and the first
 * time two installations share one city (with Księży Młyn).
 *
 * ⛔ WHY THIS FILE EXISTS — it is a bleed fix, not a nicety.
 *
 * `src/instance.js` resolves the active installation from `?look=`, and an
 * UNREGISTERED look falls back to Lafayette Square. Centrum was unregistered,
 * so `?look=centrum` did not merely lose its own name and tax rate — it set
 * `INSTANCE.lookId` to `'lafayette-square'`, and SIX render gates are written
 * as `INSTANCE.lookId === 'lafayette-square'`:
 *
 *   Scene.jsx:860            the Gateway Arch
 *   LafayettePark.jsx:848    the park lake, grotto pond, bridge and fence
 *   LafayettePark.jsx:803    the park title label
 *   StreetLights.jsx:74      Lafayette Square's 80 lamps
 *   lampLightmap.js:23       their baked light pools
 *   LafayetteScene.jsx:106   LS's per-building height/kind overrides
 *
 * All six passed at once, so Łódź rendered with the St. Louis Gateway Arch
 * standing in it and Lafayette Park's water on its ground. Registering the
 * installation closes all six, because each gate was correct — it was the
 * identity underneath them that was wrong (`INTAKE-CATALOGUE §0`, bleed #5).
 *
 * ⚠️ `altadena` and `toy` are still unregistered and still wear this fault.
 *
 * Facts below are taken from `cartograph/data/centrum/{geography,neighborhood}.json`
 * or left null. `fmtStat` renders null as "—", which is the honest answer; a
 * plausible-looking invented population is not.
 */
export default {
  lookId: 'centrum',
  skyMode: 'cheap',

  // Transcribed from cartograph/data/centrum/geography.json — the pre-bake
  // projection SSOT. Keep in step with it; the sky is computed from lat/lon.
  geography: {
    lat: 51.76352,
    lon: 19.45901,
    timezone: 'Europe/Warsaw',
    lonToMeters: 68897,
    latToMeters: 111000,
    bbox: { minLat: 51.7366, maxLat: 51.7884, minLon: 19.41841, maxLon: 19.50187 },
    cityState: 'Łódź, Poland',
    stateCode: 'PL',
  },

  locale: {
    language: 'pl',
    units: 'metric',
    clock: '24h',
  },

  name: 'Śródmieście',
  domain: 'jacobhenderson.studio/centrum',   // TBD deploy subpath

  contentRoot: 'content/centrum/',

  branding: {
    title: 'Śródmieście, Łódź',
    faviconUrl: null,
    ogImage: null,
    assetSlug: 'centrum',
  },

  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: null,
    governingState: 'Łódzkie',
  },
  commerce: {
    salesTaxRate: 0.23,   // placeholder — Poland standard VAT; refine if commerce goes live
  },

  // Content Layer 0. Nulls are deliberate: this district has had no intake
  // research pass, and an invented figure would be worse than a dash.
  profile: {
    population: null,
    buildingCount: null,
    founded: null,
    parkAcres: null,
    landmarkName: 'Piotrkowska Street',
    historicDistrictName: 'Śródmieście',
    tagline: "The neon-lit spine of Poland's great textile city.",
    about: null,
  },

  // Modules default ON kit-wide (opt-OUT, not opt-in). Delivery carries the
  // nested shape Cary expects; the LS-hardcoded LegalPage it surfaces is a KIT
  // bug to instance-derive, not a reason to opt out (same note as Księży Młyn).
  modules: {
    delivery: { enabled: true, zoneDescription: null },
  },

  // ⚠️ NOT set, unlike Księży Młyn. The municipal LOD2 makieta covers the
  // revitalization area; nothing is baked at public/baked/centrum/citymodel/,
  // and the real gate is PRESENCE of that manifest rather than this flag
  // anyway. Left off so it states the truth rather than a hope.
  cityModel: false,

  cary: {
    smsNumber: null,
    smsNumberDisplay: null,
    email: null,
  },
  contact: {
    email: null,
  },
}
