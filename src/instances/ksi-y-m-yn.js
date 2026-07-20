/**
 * Installation config — Księży Młyn, Łódź (installation #3, the first NON-US pour).
 * Authored from the installation's own payload: cartograph/data/ksi-y-m-yn/
 * geography.json + the intake research. Self-contained — references nothing about
 * any other installation. Boots via `?look=ksi-y-m-yn`.
 *
 * Why this file matters: without it, `?look=ksi-y-m-yn` fell through to the
 * lafayette-square instance (src/instance.js DEFAULT_LOOK), so the player wore
 * LS's IDENTITY — LS street labels, LS lamps, `landmarkName: 'Lafayette Park'`,
 * St. Louis geography — over Łódź's slab. This is the fix at source: a real
 * installation identity, and the home for the Polish locale (i18n track).
 */
export default {
  lookId: 'ksi-y-m-yn',
  skyMode: 'cheap',

  // Geography — from cartograph/data/ksi-y-m-yn/geography.json (center = boundary
  // centroid; bbox = fetch extent). Timezone drives weather/TOD/sun for the region.
  geography: {
    lat: 51.75218,
    lon: 19.47574,
    timezone: 'Europe/Warsaw',
    lonToMeters: 68914,
    latToMeters: 111000,
    bbox: { minLat: 51.746, maxLat: 51.760, minLon: 19.462, maxLon: 19.492 },
    cityState: 'Łódź, Poland',
    stateCode: 'PL',
  },

  // ⭐ Locale — the first non-English installation. The i18n/localisation-service
  // track reads this: Polish UI catalog + metric units + 24-hour clock, all
  // installation-derived (task: player i18n). Declared here now; the service that
  // consumes it is the build-once kit machinery still to land.
  locale: {
    language: 'pl',
    units: 'metric',
    clock: '24h',
  },

  name: 'Księży Młyn',
  domain: 'jacobhenderson.studio/ksi-y-m-yn',   // TBD deploy subpath

  contentRoot: 'content/ksi-y-m-yn/',

  branding: {
    title: 'Księży Młyn',
    faviconUrl: null,
    ogImage: null,
    assetSlug: 'ksi-y-m-yn',
  },

  // Delivery/commerce not live → placeholders (Poland VAT noted for when it is).
  legal: {
    entityName: 'Jacob Henderson LLC',
    dba: null,
    governingState: 'Łódzkie',
  },
  commerce: {
    salesTaxRate: 0.23,   // placeholder — Poland standard VAT; refine if commerce goes live
  },

  // Profile — content Layer 0. Authored from intake research; counts live-derived
  // from the slab + content as they land.
  profile: {
    population: null,
    buildingCount: null,
    founded: 1873,          // Scheibler's spinning mill completed 1873
    parkAcres: null,
    landmarkName: "Scheibler's Mill",
    historicDistrictName: 'Księży Młyn',
    tagline: "Scheibler's red-brick textile empire — a 19th-century “city within a city.”",
    about: "Księży Młyn is Karol Scheibler's “city within a city” — the largest and best-preserved of Łódź's 19th-century textile complexes. Around a monumental 207-metre red-brick spinning mill, the “king of cotton” raised a self-sufficient industrial settlement: rows of brick workers' houses (the famuły), a school, hospital, fire station, shops and gasworks, laid out in the manner of an English mill town. The Herbst Palace and the Scheibler residence — now the Museum of Cinematography — anchor its edges, with Źródliska Park and its mill pond to the west. A recognised historic monument, it is one of Europe's most remarkable industrial landscapes, at the heart of the city once called the “Polish Manchester.”",
  },

  // Conservative manifest for a fresh non-US install: map essentials on; the
  // content/commerce modules stay OFF until Łódź content (landmarks, listings,
  // place cards) is authored — "features switched by the manifest, not guessed
  // ⭐ Modules default ON kit-wide (moduleOn is opt-OUT — src/instance.js). Łódź
  // runs the WHOLE player for the demo — delivery/Cary INCLUDED (couriers exist in
  // Poland). Everything defaults on; delivery just needs its nested shape here.
  // NOTE: delivery surfaces the LS-hardcoded LegalPage — that's a KIT bug to
  // instance-derive (src/pages/LegalPage.jsx), NOT a reason to opt out.
  modules: {
    delivery: { enabled: true, zoneDescription: null },
  },

  cary: {
    smsNumber: null,
    smsNumberDisplay: null,
    email: null,
  },
  contact: {
    email: null,
  },
}
