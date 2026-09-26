# BRIEF — Provincetown's places: prime the pump from the PBG guide

<!-- BRIEF-STATE
status: LANDED 2026-09-25/26 — 380 listings researched (5429bc8e), wired and live on staging (e936db9d). Owed: the held places (Wellhead; ROADMAP status block)
dispatched: no
written: 2026-09-25
evict-when: Provincetown's listings are matched to the PBG guide, the missing businesses are added, the most prominent places carry hours + a description, the landmarks have full place cards, and Jacob has seen it on staging.
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-25, and **Jacob dispatches.**

## Who you are

**Name yourself: one word, your own.** **Agent: FRESH.** You're the one active agent; be lean with tokens.

## Jacob's ask

> *"My main priority is getting Provincetown showable … PTown is where our business/listings potential is going to really shine. Note: we can get listings from the PBG, I know because I used to work there!"*
> *"The point is to prime the pump; once we push it over the edge of the hill we won't be going back for more."*

## Where it stands

`cartograph/data/provincetown/content/listings.json` holds **344 places** from OSM + Overture, with **0 hours and 0 descriptions**. ▶ Re-derive, don't quote: a `node -e` over `listings.json` counting each field.

## The job

1. **Read the Provincetown Business Guild's 2026 guide:** `/Users/jacobhenderson/Desktop/2026-PBG-GUIDE-REV_smaller.pdf` (Jacob's copy). ⛔ Don't commit the PDF.
2. **Match** its businesses to the 344 listings.
3. **Add the ones the map is missing**, as `adds`.
4. **Fill facts** (hours, phone, website, category) and **write each description in your own words** from the guide and the business's own site. Record provenance per fact (`_source`, `_fetched`) the way huron's research did.
5. **Order the work by prominence** (`cartograph/prominence.mjs`, and the guide's own emphasis), so the places a visitor meets first are done first.
6. **Landmarks get full place cards:** the Pilgrim Monument, Town Hall, MacMillan Wharf, the Provincetown Art Association & Museum, the Province Lands visitor center, and others the guide or the town treats as landmarks.

⭐ **Hours must be real.** Seasonal towns change hours by season: record the season each set of hours belongs to where the source says, never padded or guessed (`INTAKE-CATALOGUE §3.2b`, unmarked seasonal hours).

## How it lands

- Write into `cartograph/data/provincetown/content/listings.overrides.json` (`adds` / `patches`).
- **Key every patch by the listing's `_key`** (`ovt-<GERS>` or its OSM key), never its display id or its name. ⛔ An override that matches nothing is silently dropped today (`ROADMAP H-29`), so check every key resolves before committing.
- Then run `node cartograph/bake-content.js --scene=provincetown` and report counts before and after (listings, with hours, with description, landmark cards).
- Jacob re-bakes and publishes to staging.

## Read first

- `INTAKE-CATALOGUE §3.2b–3.3` (what place research turns up; the two listing bases);
- `ROADMAP H-29` (override keys), `H-33` (how huron's roster was researched);
- `cartograph/bake-content.js` (`applyListingOverrides`);
- huron's `content/listings.overrides.json` as the worked example.

## Coordination

- The checkout is shared: commit only your own paths.
- Run `node scripts/bake-in-flight.mjs` before saving anything the dev servers import.
- ⛔ No stash, reset, rebase or branch switch.
- Report to Boz.
