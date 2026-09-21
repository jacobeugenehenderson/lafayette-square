/**
 * Installation config — Huron, Ohio (installation #3). Self-contained: it
 * references nothing about any other installation.
 *
 * ⛔ WHY THIS FILE HAD TO EXIST BEFORE THE TOWN COULD BE JUDGED. Until now there
 * was no `huron` entry in INSTANCES, so every load of `?look=huron` printed
 * "THIS PAGE IS NOW WEARING ANOTHER TOWN'S identity, geography and legal
 * jurisdiction" and fell back to Lafayette Square — which meant huron rendered
 * at ST. LOUIS'S LATITUDE. ⭐ For a weather-and-environment tracker that is not
 * cosmetic: the sun and moon are computed from `INSTANCE.geography`, so every
 * celestial position, every shadow angle and every reflection on the lake was
 * being solved for a town 800 km away.
 *
 * Boots via `?look=huron`; the baked slab lives at public/baked/huron/.
 */
export default {
  lookId: 'huron',
  skyMode: 'cheap',

  // ⭐ VERBATIM from cartograph/data/huron/geography.json — the committed extent,
  // frame origin frozen at the fetch centre. ⛔ Copied, never re-derived: the
  // pour and the runtime must agree on where the town is, and two derivations of
  // one fact is how they stop agreeing.
  geography: {
    lat: 41.39497,
    lon: -82.56244,
    timezone: 'America/New_York',
    lonToMeters: 83509,
    latToMeters: 111000,
    bbox: { minLat: 41.35042, maxLat: 41.43952, minLon: -82.62165, maxLon: -82.50322 },
    cityState: 'Huron, OH',
    stateCode: 'OH',
  },

  name: 'Huron',
  domain: null,   // no deploy target yet

  contentRoot: 'content/huron/',

  branding: {
    title: 'Huron',
    faviconUrl: null,
    ogImage: null,
    assetSlug: 'huron',
  },

  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: null,
    governingState: 'Ohio',
  },

  commerce: {
    // ⛔⛔ NULL ON PURPOSE, AND DELIBERATELY NOT A PLACEHOLDER NUMBER. A wrong
    // rate is a wrong charge on a real transaction and nothing in the build
    // catches it — so this stays empty until someone sets it from the Erie
    // County / Ohio authority. ⚠️ This diverges from hipointe-demun, which ships
    // a placeholder figure: a plausible-looking wrong number is the failure mode
    // this kit can least afford, and delivery is OFF here so nothing needs one.
    // ▶ Set it when `modules.delivery.enabled` becomes true, not before.
    salesTaxRate: null,
  },

  // ⛔ UNAUTHORED, NOT UNKNOWN-TO-ME: there is no content/profile.json in
  // cartograph/data/huron/content/ (it carries listings + roster only). These
  // are the town's own facts and they are the operator's to write; inventing a
  // population, a founding date or an "about" paragraph would put fiction on a
  // page that presents itself as a record of a real place.
  profile: {
    population: null,
    buildingCount: null,
    founded: null,
    parkAcres: null,
    landmarkName: null,
    historicDistrictName: null,
    tagline: null,
    about: null,
  },

  // Delivery OFF — no courier program here. The Cary/contact endpoints stay null
  // rather than pointing at another town's inbox.
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

  cary: {
    smsNumber: null,
    smsNumberDisplay: null,
    email: null,
  },
  contact: {
    // ⚠️ PUBLIC when set — it renders on the legal page, which no module flag
    // gates. Unset renders a labelled gap and `src/instance.js` names it at boot,
    // which is the right state until there is an alias for this town.
    email: null,
  },
}
