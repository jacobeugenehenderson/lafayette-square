/**
 * overture-licence.mjs — WHAT A TOWN OWES FOR ITS OVERTURE PLACES, PER RECORD.
 *
 * ⛔⛔ READ THIS FIRST: OVERTURE PLACES HAS NO THEME-LEVEL LICENCE.
 *
 * Every other Overture theme does. Read at the source 2026-09-20, from the
 * distribution's own bytes — the STAC collection declares:
 *
 *     "license": "other"
 *     rel:license → https://docs.overturemaps.org/attribution/
 *   ▶ curl -s https://stac.overturemaps.org/<release>/places/place/collection.json
 *
 * …and that page gives Buildings, Divisions and Transportation each a line
 * reading "License for theme: ODbL", and gives PLACES NO SUCH LINE AT ALL. In
 * its place is a list of contributing datasets, each with its own terms. So:
 *
 *   ⭐ WHAT A TOWN OWES DEPENDS ON WHICH RECORDS THAT TOWN ACTUALLY GOT.
 *
 * A town whose places came from AllThePlaces owes nothing (CC0). A town whose
 * places came from Meta must SHIP THE TERMS (CDLA Permissive 2.0 §2.1). Most
 * towns will owe several things at once. There is no single string that is true
 * for this source, and inventing one would be the MSBF error exactly: recorded
 * as ODbL in this repo for months, actually CDLA Permissive 2.0, and a web
 * search still answers ODbL today.
 *
 * ⭐ THIS IS `intake-rows.mjs`:180-189 WORKING AS WRITTEN, NOT A DEVIATION FROM
 * IT. That paragraph says a row whose well is chosen per town "has no kit-global
 * licence and MUST NOT get a guessed one — the file on that town's disk came
 * from somewhere this module cannot know." Overture Places is the same problem
 * one notch finer: the well is chosen per RECORD. So the row carries no
 * kit-global `licence`, and the credit is DERIVED from the town's own artifact,
 * which records `sources[].dataset` on every place for exactly this purpose.
 *
 * ⛔⛔ AND THE TWO OBLIGATIONS ARE DIFFERENT ACTS — `intake-rows.mjs`:190-197.
 *   'attribution'  — ODbL §4.3: name the database AND the licence, both linked.
 *                    You CREDIT.
 *   'licence-text' — CDLA Permissive 2.0 §2.1: sharing the Data means you "make
 *                    available the text of this agreement with the shared Data."
 *                    You SHIP THE TERMS. Crediting is not that.
 * An AGGREGATED source carries BOTH KINDS AT ONCE, which is the case that file's
 * warning was written against: "a surface that renders both as one '© X' line
 * has quietly substituted the easy obligation for the real one." ⇒ `requires` is
 * preserved PER DATASET here and merged per source downstream. ⛔ Never collapse
 * this table to a single line.
 *
 * ── ⛔ AN UNKNOWN DATASET IS LOUD, NEVER GUESSED ────────────────────────────
 * `DATASET_LICENCES` is an ALLOW-LIST transcribed from the attribution page's
 * own markup. A dataset absent from it is UNREADABLE, and unreadable is reported
 * — never inferred from the parent distribution, which is the MSBF error with a
 * new hat. It reports through `createVocabularyGate`, the kit's established
 * "name what this town brought that the kit lacks" idiom, as its third customer
 * (that module's header invites a third customer and forbids forking it).
 *
 * ⚠️ AND THE GATE FIRES ON TOWN #1, WHICH IS THE POINT. huron's 482 places stamp
 * `Overture` (482) and `Overture-signals` (297) as source datasets, and NEITHER
 * APPEARS ON OVERTURE'S OWN ATTRIBUTION PAGE. The kit therefore cannot state
 * their terms, so it says so — they land in `bake-sources.js`'s `owed`, by name,
 * visible in the artifact rather than only in a scrolled-past log.
 *
 * ⚠️ RE-READ THE BYTES BEFORE TRUSTING THIS TABLE. Upstream terms change under
 * you and a stale licence on a public page is worse than no page:
 *   ▶ node checks/claims-overture-licence-table-is-current.mjs
 */
import { createVocabularyGate } from './osm-vocabulary.mjs'

const CDLA_2_0 = { name: 'CDLA Permissive 2.0', url: 'https://cdla.dev/permissive-2-0/', requires: 'licence-text' }

/**
 * Transcribed 2026-09-20 from the `<li>` elements of
 * https://docs.overturemaps.org/attribution/ — the page the places STAC
 * collection's own `rel:license` link points at. URLs are the page's own hrefs,
 * not reconstructed.
 *
 * ⛔ Keys are the `sources[].dataset` values Overture stamps on a record, which
 * are NOT always the display names on that page (`meta` on the record,
 * "Meta" on the page). Matching is exact after lowercasing — ⛔ never fuzzy.
 * A near-miss must fail into the gate, because a near-miss is precisely how a
 * wrong licence gets asserted.
 */
export const DATASET_LICENCES = {
  meta:         { source: 'Meta',         sourceUrl: 'https://about.meta.com/',   credit: 'Places data from Meta', ...CDLA_2_0 },
  microsoft:    { source: 'Microsoft',    sourceUrl: 'https://www.microsoft.com/en-us/', credit: 'Places data from Microsoft', ...CDLA_2_0 },
  pinmeto:      { source: 'PinMeTo',      sourceUrl: 'https://www.pinmeto.com/',  credit: 'Places data from PinMeTo', ...CDLA_2_0 },
  krick:        { source: 'Krick',        sourceUrl: 'https://www.krick.com/',    credit: 'Places data from Krick', ...CDLA_2_0 },
  renderseo:    { source: 'RenderSEO',    sourceUrl: 'https://www.renderseo.com/', credit: 'Places data from RenderSEO', ...CDLA_2_0 },
  dac:          { source: 'DAC',          sourceUrl: 'https://www.dacgroup.com/', credit: 'Places data from DAC', ...CDLA_2_0 },
  brightquery:  { source: 'BrightQuery',  sourceUrl: 'https://brightquery.com/',  credit: 'Places data from BrightQuery', ...CDLA_2_0 },
  foursquare:   {
    source: 'Foursquare', sourceUrl: 'https://foursquare.com/',
    credit: 'Copyright 2024 Foursquare Labs, Inc. All rights reserved.',
    name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0',
    // Apache 2.0 §4 wants the licence text AND the NOTICE retained, so it is a
    // 'licence-text' obligation in this kit's vocabulary — with a second file to
    // carry. ⛔ The NOTICE is not decoration and not a credit line; a surface
    // that renders only `credit` has dropped half of what §4 asks for.
    requires: 'licence-text',
    notice: 'https://opensource.foursquare.com/places-notice-txt/',
    note: 'Foursquare data was transformed to the Overture schema. Changed: 2026-03-18.',
  },
  alltheplaces: {
    source: 'AllThePlaces', sourceUrl: 'https://alltheplaces.xyz/',
    // ⭐ CC0 waives the requirement; it does not make the source untrue. The
    // entry exists so the provenance is still answerable, and `requires: null`
    // is what stops it being rendered as a debt.
    credit: 'Places data from AllThePlaces', name: 'CC0 1.0',
    // ⛔ 'none' — DECLARED-none, not null. CC0 is a public-domain dedication and
    // genuinely requires nothing, which is a different fact from "nobody has
    // established what this requires". A null here would be a sentinel: it reads
    // as no obligation while meaning nobody looked.
    url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.en', requires: 'none',
  },
}

const GATE_PROSE = {
  noun: 'place',
  classNoun: 'source dataset',
  unit: 'records',
  // ⛔ NOT area-weighted. A place record has no footprint, and the first two
  // customers of this gate are polygons. See `weighted` in osm-vocabulary.mjs.
  weighted: false,
  body: [
    '   Overture stamps a contributing dataset on every place, and PLACES HAS NO',
    '   THEME-LEVEL LICENCE — obligations are per dataset. These datasets are not',
    '   on Overture\'s own attribution page, so the kit cannot state their terms.',
    '   ⛔ They are reported as OWED and are NOT credited. Most records first:',
  ],
}

const GATE_REMEDY =
  'Read the terms at the source — https://docs.overturemaps.org/attribution/ — and add the dataset ' +
  'to DATASET_LICENCES in cartograph/overture-licence.mjs. ⛔ Do NOT infer them from the parent ' +
  'distribution: Overture Places has no theme licence to inherit, and inferring one is the MSBF error ' +
  '(recorded here as ODbL for months; it is CDLA Permissive 2.0).'

/**
 * ⭐ Resolve a town's Overture artifact into credits + debts.
 *
 * @param {{places?: Array<{sources?: string[]}>}} artifact — the parsed
 *        `raw/overture-places.json`.
 * @returns {{credits: Array, owed: Array, gate: object}} `credits` is one entry
 *        per SOURCE with `requires` intact and `records` counting how many of
 *        this town's places rest on it; `owed` is one entry per unreadable
 *        dataset. ⛔ A dataset is never in both.
 */
export function licencesForArtifact(artifact) {
  const gate = createVocabularyGate('overture-places', GATE_REMEDY, GATE_PROSE)
  const bySource = new Map()
  const unknown = new Map()

  for (const place of artifact?.places || []) {
    for (const dataset of place.sources || []) {
      const hit = DATASET_LICENCES[String(dataset).toLowerCase()]
      if (!hit) {
        // ⛔ Counted per RECORD, not per dataset — "3 records we cannot licence"
        // and "300" are different sizes of problem and the operator acts on the
        // difference. The gate's `record` is called once per record for that.
        gate.record(String(dataset), null, { dataset, example: place.name })
        unknown.set(dataset, (unknown.get(dataset) || 0) + 1)
        continue
      }
      const entry = bySource.get(hit.source) || { ...hit, records: 0 }
      entry.records++
      bySource.set(hit.source, entry)
    }
  }

  return {
    credits: [...bySource.values()].sort((a, b) => b.records - a.records),
    owed: [...unknown.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([dataset, records]) => ({ dataset, records, reason: 'not on Overture\'s attribution page — terms unknown to this kit' })),
    gate,
  }
}
