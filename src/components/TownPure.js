// TownPure.js — the kit's RENDERER-FREE public door: what an app needs from the kit that draws no town.
//
// Owns: the second public entry beside Town.jsx (Zob's ruling, 2026-11-02, after Ward's pin run found the place card's module
// graph reaching the whole renderer through PlaceList → Town.jsx, and the place check throwing in Node; what threw there is
// not established). Every name here comes from a
// kit module whose import graph reaches no renderer; Town.jsx re-exports these same names FROM HERE, so a name has one door
// and one instance (one failure store, one frame sampler) whichever door an app uses.
// ⭐ Membership is written here and JUDGED by a check, never by this comment: ▶ node checks/claims-the-pure-entry-loads-no-renderer.mjs
// and claims-the-pure-entry-loads-without-a-browser.mjs (Zob's): its graph reaches no three, @react-three/*, react-dom or any
// package whose dependencies reach them; it loads with no browser (vite SSR, as the Ward's checks load it); one door per name;
// never empty.
// Must never: re-export a module that draws (a component, a hook over renderer state). Those stay on Town.jsx: useTownWeather
// (its sky store imports three), useTownMoonImage (TownMoon.jsx, @react-three/fiber), placeTown (TownPlace.jsx, the terrain),
// adoptSlabManifest (slabUrl.js imports bakedUrl.js, which reads the page's ward-asset-base tag AT LOAD under a runtime build:
// its doctrine, "a runtime build served without the tag throws here, at load"; Zob's ruling (A), 2026-11-02). Nothing here
// may read the page when it is imported.

// The kit's one measure of the frame and its one way to spread work across frames (src/lib/frameSlices.js): the town's own
// first-use work rides it, and an app imports it through a public door, never by path, so there is one instance and one rAF sampler.
export { frameInterval, frameTimeLeft, runSliced, rowsInAFrame } from '../lib/frameSlices.js'
// The kit's one failure sink (src/lib/failures.js): what a boundary took out of the town, and why. The app decides how
// its visitor sees it; ⛔ never silent.
export { default as useFailures, failuresFor } from '../lib/failures.js'
// An emoji as this device draws it, and its inked pixels — one home for the method (src/lib/glyphInk.js); the Ward's
// vignette measurement and glyph fitting read it here.
export { glyphInk, EMOJI_FONT, COLOUR_ALPHA } from '../lib/glyphInk.js'
// The weather at an instant is one answer (lib/weatherAt.js); an app catches its out-of-forecast error by this class.
export { WeatherRangeError } from '../lib/weatherAt.js'
// Where the renderer's own files live (the page's ward-kit-base; src/lib/kitUrl.js) — the Ward's Almanac reads the
// weather icons through it, so they have one home: the kit bundle.
export { kitUrl } from '../lib/kitUrl.js'
// The tide, for an Almanac: pure functions over the town's tide constituents (cartograph/tide.mjs), no renderer state.
export { tideExtrema, tideAt } from '../../cartograph/tide.mjs'
// The town's identity record, the kit's way: the backend key and the tab title (src/lib/townRecord.js), one reader for the
// kit's apps and the Ward.
export { tenantOf, titleOf } from '../lib/townRecord.js'
// A building's street address from the slab (src/lib/buildingAddress.js).
export { useBuildingAddress } from '../lib/buildingAddress.js'
