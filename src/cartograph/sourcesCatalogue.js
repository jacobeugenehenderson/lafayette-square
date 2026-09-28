/**
 * THE SOURCES CATALOGUE — every input that goes into pouring a town: what to do about it, and where it can come from.
 * Plain data (no React), so the panel (SourcesPanel.jsx) draws it and a check can read it. Moved out of the panel
 * 2026-09-28; the rulings on its shape are in the comments below, kept with the rows they rule.
 */
// What the operator DOES about a SOURCE — each source carries its own `act` + `where` (a row's action is the action of
// the source it shows this town: Poland's register is a fetch, the US one a hand procedure).
export const FETCH = 'fetch'   // an endpoint exists — one button (BRIEF §2.2b)
export const DOC   = 'doc'     // a written procedure; go read/update it
export const OWED  = 'owed'    // ⚠ the procedure exists only in someone's head
export const NONE  = 'none'    // nothing to acquire, ever
export const CHOOSE = 'choose' // the town decides, in a panel here — "choose it here" opens it

// ⛔ NAME THE SOURCE. Jacob, 2026-07-20: *"'Building footprints' should say
// 'microsoft' or whatever — I hate all this dumb treacle."* The proper noun IS
// the value. "ML aerial imagery" describes Microsoft's product while leaving
// the reader unable to go get it, which inverts the panel's purpose
// (`BRIEF §7` — every row resolves to a place to go).
//
// ⭐ AND THE SOURCE IS A CHOICE, NOT A LABEL. Jacob: *"microsoft should be a
// button in case there's another place they could find that data."* This is
// `INTAKE-CATALOGUE §5.1` landing in the UI: the footprint row has **no single
// best source**. Microsoft's ML footprints are right in St. Louis and would be
// actively WORSE in Łódź, where hand-mapped OpenStreetMap carries roughly twice
// the geometric detail (measured: median 5 vertices vs 7, Centrum 9). So the
// row lists its alternatives and the operator picks; the pipeline's silent
// "prefer MSBF wherever it exists" encodes a US assumption.
//
// `sources[0]` is the default shown collapsed. ⚠️ Entries marked `unverified`
// are ones the catalogue could not confirm live — they are shown as leads, not
// asserted as facts (`BRIEF §6`).
export const GROUPS = [
  // ⭐ GROUPED BY WHO SUPPLIES IT (Jacob, 2026-07-21). He framed the tiering as
  // "foundation → building → sky" to convey the idea; the axis underneath it is
  // the SUPPLIER, and naming that makes the three genuinely distinct rather than
  // a metaphor:
  //
  //   AUTOMATIC       global open datasets that cover everywhere and arrive on
  //                   their own — gold, immutable, never the operator's problem
  //   PUBLIC RECORDS  published by an institution: a survey, an assessor, a
  //                   forestry department, a heritage register
  //   LOCAL KNOWLEDGE nobody published it. You look, you ask, you walk around.
  //
  // "Local knowledge" is the trade term (as on a chart: *local knowledge
  // required*), and it is literally what a menu and which-corner-bar-matters
  // are. Earlier cuts grouped by our own domains, then by effort — both sorted
  // the list by how WE think about it rather than by what it asks of the reader.
  {
    title: 'Automatic', tone: 'given',
    // ⭐ LOCKED (Jacob, 2026-07-21). Not merely automatic — IMMUTABLE. The kit
    // chooses the right base for the region (Microsoft's footprints in the US,
    // hand-mapped OpenStreetMap in Europe) and the operator never makes that
    // call. So these rows carry no Fetch pill — there is no button to press —
    // and no "+ other source": you cannot record a well for something you are
    // not being asked to supply. The alternatives stay VISIBLE because knowing
    // what the kit is drawing on is worth something; they are just read-only.
    locked: true,
    // ⭐ GOLD, AND IMMUTABLE (Jacob, 2026-07-21). These two arrive on their own
    // when you press Fetch — no account, no portal, no hunting, nothing to
    // decide. They are the bedrock the rest is positioned against, and the
    // operator never has to think about them at all. Listing them is not a
    // chore; it is the reassurance that the floor is already under you.
    rows: [
      { name: 'Street & building base',
        sources: [{ name: 'OpenStreetMap', note: 'ODbL · global · free · no account', covers: 'global', act: FETCH, where: 'Overpass' }],
        steps: ['Nothing to obtain by hand — the Extent tool fetches it when you pour.',
                'Carries storey counts, roof shapes and materials wherever the local mappers recorded them.'] },
      { name: 'Building footprints',
        sources: [
          { name: 'Microsoft Global ML Footprints', note: 'best in the US · no coverage off-continent', covers: ['US'], act: FETCH, where: 'fetch-msbf' },
          { name: 'OpenStreetMap', note: 'better in Europe — ~2× the vertex detail', covers: 'global', act: FETCH, where: 'Overpass' },
          { name: 'Overture', note: 'aggregate alternative', unverified: true, covers: 'global', act: OWED, where: 'an Overture buildings fetch (fetch-overture-places is places only)' },
        ],
        steps: ['Free, no account.',
                'In the US, take Microsoft — it is more accurate than the older US OSM imports.',
                'In Europe, take OpenStreetMap — it is hand-mapped and carries more detail than Microsoft.'] },
    ],
  },
  {
    title: 'Public records', tone: 'records',
    // Every one of these was published by an institution — a national survey, a
    // county assessor, a city forestry department, a heritage register, an
    // agricultural service. Free, though a couple want a free account and two
    // are a genuine hunt for the right municipal portal. The gathering lives
    // here, and it is the tier an agent can most usefully be pointed at.
    rows: [
      { name: 'Ground elevation',
        sources: [
          { name: 'USGS 3DEP 1/3 arc-sec', note: 'US · ~10 m · public domain · lat/lon', covers: ['US'], act: FETCH, where: 'USGS' },
          { name: 'USGS 3DEP 1 metre', note: 'US · ~100× denser · UTM · several tiles fine', covers: ['US'], act: FETCH, where: 'USGS' },
        ],
        steps: ['Free, no account.',
                'Run the bake with no source — it prints the exact tile(s) THIS town needs, and the curl for both resolutions.',
                'First pour: The National Map → 1/3 arc-second DEM as GeoTIFF. ~10 m, and enough to stand a town on.',
                'Where the shore matters: 1 m lidar. ⭐ The CRS is read off the tile — UTM north or geographic, both accepted — and several tiles are mosaicked here, so neither is a reason to reach for the coarser product.',
                'Three ways in: raw/elevation.tif · raw/elevation/*.tif · raw/elevation-sources.txt, one URL per line, read in place by range request. A town of 1 m is ~940 MB across four tiles and none of it has to land on disk.',
                '⛔ A CRS the reader cannot NAME is refused rather than guessed at. A DEM silently treated as the wrong projection bakes terrain from the wrong place, confidently, and nothing downstream can tell.',
                '⚠️ ~10 m smooths anything narrower than ~20 m, and a cell straddling a shore averages land with water: huron carried Lake Erie at two elevations 1.17 m apart until 1 m collapsed it to one surface.',
                '⚠️ On a coastal town expect ~20% nodata — lidar returns nothing off open water. Normal there, a red flag anywhere else; the bake prints the share and says which case it is.',
                'Outside the US: a national elevation GeoTIFF covering your bbox.',
                'Check the no-data value — the US one is USGS-specific and other sources differ.'] },
      { name: 'Parcels, zoning, year built',
        sources: [
          { name: 'the county assessor', note: 'ArcGIS or Socrata · per-jurisdiction', covers: ['US'], act: DOC, where: 'cartograph/INTAKE.md' },
          { name: 'INSPIRE Cadastral Parcels', note: 'EU · geometry and id, rarely valuation', unverified: true, covers: ['EU'], act: OWED, where: 'the INSPIRE procedure' },
        ],
        steps: ['Usually free; some counties require a free account.',
                'Search "<your county> assessor open data" or "<county> GIS parcels".',
                'Look for an ArcGIS FeatureServer or Socrata endpoint — you want the download URL, not the map viewer.',
                'Export the parcel layer as GeoJSON covering your neighbourhood.',
                'Outside the US this often does not exist in this shape. Addresses do not depend on it — they come from OpenStreetMap.'] },
      { name: 'Tree census',
        // The census UNIONS every well it finds — losing one silently prints
        // park-only trees (2026-07-22 regression). Each source below is a well.
        sources: [
          { name: 'OpenStreetMap', note: 'natural=tree · real positions · fetched with the base — the "osm" well', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
          { name: 'city forestry inventory', note: 'ArcGIS FeatureServer · free · no key — the "city-inventory" well', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
          { name: 'authored park census', note: 'hand-curated for a signature park — the "park" well', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
          { name: 'opentrees.org', note: 'aggregates several hundred municipal inventories', unverified: true, covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
          { name: 'a public-records request', note: 'when the contractor never published it', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
        ],
        steps: ['The census UNIONS all its wells — OSM trees + city inventory + authored park — deduped by trunk.',
                'OSM natural=tree comes free with the street fetch; the city inventory is the hand-found part.',
                'Search "<your city> tree inventory open data" or "<city> street trees GIS" for the inventory.',
                'Export as GeoJSON — species, diameter and condition per tree if offered.',
                'This locates YOUR trees. What each species looks like ships with the platform.'] },
      { name: 'Canopy raster',
        sources: [
          { name: 'NLCD Tree Canopy (USDA)', note: 'US · public domain', covers: ['US'], act: FETCH, where: 'MRLC' },
          { name: 'ESA WorldCover', note: '10 m · global · CC BY', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
        ],
        steps: ['Free, no account.',
                'Fills yards and parkland no per-tree survey reaches.',
                'Optional — a town can ship counted trees only, which is what Lafayette Square does.'] },
      { name: 'Historic designation',
        sources: [
          { name: 'NID rejestr zabytków', note: 'Poland · already on the public map', covers: ['PL'], act: FETCH, where: 'Overpass' },
          { name: 'National Register (NPS)', note: 'US · free PDFs · needs OCR', covers: ['US'], act: DOC, where: 'INTAKE-CATALOGUE.md §3.2' },
          { name: 'Historic England', note: 'UK · per-building', unverified: true, covers: ['GB'], act: OWED, where: 'the Historic England procedure' },
        ],
        steps: ['Free everywhere it exists.',
                'In much of Europe this arrives free with the street fetch — it is already tagged.',
                'In the US it is a National Register nomination PDF from NPGallery, and the per-building table has to be read out of the scan by hand.'] },
      { name: 'Street lamps',
        sources: [
          { name: 'OpenStreetMap', note: 'highway=street_lamp · global · free · no account', covers: 'global', act: FETCH, where: 'Overpass' },
          { name: 'city lighting GIS', note: 'where a municipality publishes its lamp inventory', unverified: true, covers: 'global', act: FETCH, where: 'Overpass' },
        ],
        steps: ['Free, no account.',
                'Real lamp positions where OSM mappers recorded them — St. Louis has thousands.',
                'Fetched from OSM with the street base; a town OSM never mapped can fall back to procedural placement.'] },
      { name: 'Facade imagery',
        sources: [{ name: 'Mapillary', note: 'street-level · free account · API key', covers: 'global', act: DOC, where: 'cartograph/INTAKE.md' }],
        steps: ['Free, but needs an account and a token.',
                'Create a Mapillary account, then generate a client token in developer settings.',
                'Optional — used for matching building facades.'] },
      { name: 'Species dossiers',
        sources: [
          { name: 'USDA PLANTS', note: 'free', covers: ['US', 'CA'], act: DOC, where: 'arborist/dossiers/_SCHEMA.md' },
          { name: 'Silvics of North America', note: 'USDA Forest Service · free', covers: ['US', 'CA'], act: DOC, where: 'arborist/dossiers/_SCHEMA.md' },
          { name: 'i-Tree Species', note: 'USFS · free', covers: ['US'], act: DOC, where: 'arborist/dossiers/_SCHEMA.md' },
          { name: 'a national flora', note: 'outside North America', unverified: true, covers: 'global', act: DOC, where: 'arborist/dossiers/_SCHEMA.md' },
        ],
        steps: ['Free sources; the writing is the work — about 20 minutes per species.',
                'One profile per species in your mix: habit, branching, seasonal colour, how it ages.',
                'Scored against a fixed rubric so two species can be compared, not merely described.',
                'A good agent-assist candidate — the sources are public and the rubric is closed.'] },
      { name: 'Species routing',
        sources: [
          { name: 'the city planting list', note: 'plus hardiness zone and a state extension guide', covers: 'global', act: DOC, where: 'TREE-INTAKE.md' },
        ],
        steps: ['Free; a table you write once per region.',
                'Maps the species names in your census onto the species the library carries.',
                'Derived automatically where a census exists — hand-seeded where none does.'] },
    ],
  },
  {
    title: 'Local knowledge', tone: 'local',
    // No dataset holds any of this. You look, you ask, you walk around — and a
    // neighbourhood is the only party that can supply it, which is why it sits
    // at the top of the stack rather than the bottom. The trade sense of the
    // phrase is the right one: *local knowledge required*.
    rows: [
      // ⛔ THIS ROW PROMISED OVERTURE PLACES BY NAME WITH NO PATH BEHIND IT until
      // 2026-09-20 — the note read "free · what Łódź used", and Łódź had been
      // excised (2026-09-19) along with the only route those records ever came
      // by. A live operator surface naming a source the kit could not fetch,
      // crediting a town that no longer exists. Both halves are real now:
      // `fetch-overture-places.js` acquires it, and bake-content folds it in.
      // ⭐ The row stays DOC rather than FETCH deliberately — the BASE is a
      // button, but hours and descriptions are hand-work and always were, and
      // calling the whole row a button would promise the part that is not.
      // How the town looks — its mark, accent, rating mark, lit tint, category colours. Nothing to fetch: the town chooses, and the
      // choosing is done in the Identity panel (IdentityPanel.jsx). A to-do until every channel is chosen.
      { name: 'Identity',
        sources: [{ name: 'the town', note: 'its own choice — never another town\'s', covers: 'global', act: CHOOSE, where: 'Identity' }],
        steps: ['Ask the town: the emoji it goes by, the one it rates with, its accent colour, the tint for lit roofs, and a colour for each category of place.',
                'Choose each in the Identity panel. Until then the kit\'s neutral value shows, and says so.'] },
      { name: 'Businesses & hours',
        sources: [
          { name: 'Overture Places', note: 'free · one command, any town · ⛔ licence is per record', covers: 'global', act: DOC, where: 'NEIGHBORHOOD-INPUTS.md' },
          { name: 'OpenStreetMap POIs', note: 'free · the default base', covers: 'global', act: DOC, where: 'NEIGHBORHOOD-INPUTS.md' },
        ],
        steps: ['Free base; the corrections are the work.',
                'Two bases: OSM POIs by default, or Overture Places where a town\'s OSM is thin — declared as meta.baseSource in listings.overrides.json.',
                'The base gets you names and rough categories.',
                'Real hours, descriptions and what a place is actually for come from visiting the websites one at a time.'] },
      { name: 'Menus',
        sources: [{ name: 'the restaurant', note: 'no endpoint exists', covers: 'global', act: DOC, where: 'NEIGHBORHOOD-INPUTS.md' }],
        steps: ['No source exists — you ask, or you read the menu off their site.',
                'Lafayette Square, the most complete install, is at about 25% coverage. Partial is normal.'] },
      { name: 'Photographs & logos',
        sources: [
          { name: 'the business', note: 'credit their domain · never hotlink', covers: 'global', act: DOC, where: 'content/ASSETS.md' },
          { name: 'Wikimedia Commons', note: 'for landmarks · free', covers: 'global', act: DOC, where: 'content/ASSETS.md' },
        ],
        steps: ['Free, but hand-collected, and the eye is the only real check.',
                'Save the file locally — never link to someone else\'s server.',
                'A social-media URL can return a valid image that is actually a grey placeholder. Look at every one.',
                'If a business genuinely has no logo, record that. It is a finding, and it saves the next person the search.'] },
    ],
  },
]

// ── WHOSE source: every source says what it `covers` — 'global', or ISO 3166-1 codes / a group below. ─────────────
// ⛔ Found 2026-09-28: the panel showed each row's FIRST source, so Lafayette Square's Historic designation read
// Poland's register (a Łódź pour's leftover) and every national row led with one country's dataset. A town is shown
// the sources that cover ITS country (its jurisdiction.json, via the intake), then the global ones; a row where
// nothing covers it says "none known", and a town whose country is unknown says so — never another country's.
// ▶ node checks/claims-a-towns-sources-are-its-own.mjs
export const COUNTRY_GROUPS = {
  EU: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
       'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
}

/** Does this source apply in `country` (ISO 3166-1 alpha-2)? */
export function coversCountry(source, country) {
  if (source.covers === 'global') return true
  return source.covers.some((c) => c === country || COUNTRY_GROUPS[c]?.includes(country))
}

/**
 * A row as THIS town sees it. `jurisdiction` is the intake's ({ country, … }; country null = not yet fetched).
 * → { shown: the source to name (null when none applies) — the row's action is ITS act/where,
 *     state: 'ok' | 'none-known' | 'country-unknown',
 *     ordered: the town's sources, then the global ones, then everyone else's — each tagged `foreign` with who it is for }
 */
export function resolveRow(row, jurisdiction) {
  const country = jurisdiction?.country ?? null
  const national = row.sources.filter((s) => s.covers !== 'global')
  const global = row.sources.filter((s) => s.covers === 'global')
  if (!country) {
    if (!national.length) return { shown: global[0] ?? null, state: 'ok', ordered: row.sources }
    return { shown: null, state: 'country-unknown', ordered: row.sources.map((s) => (s.covers === 'global' ? s : { ...s, foreign: s.covers.join(' · ') })) }
  }
  const mine = national.filter((s) => coversCountry(s, country))
  const theirs = national.filter((s) => !coversCountry(s, country)).map((s) => ({ ...s, foreign: s.covers.join(' · ') }))
  const ordered = [...mine, ...global, ...theirs]
  return mine.length || global.length ? { shown: ordered[0], state: 'ok', ordered } : { shown: null, state: 'none-known', ordered }
}
