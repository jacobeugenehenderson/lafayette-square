# BRIEF — a historic district is the town's own: its name from the source, never Hi-Pointe–DeMun's

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-11
evict-when: The check in §5 is green on every town on disk, after it was seen red on jacksonheights; no town's roster names a district its own data does not declare; huron and provincetown carry null, not false, for in_historic_district; HPDM's 598 district buildings are unchanged.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.** The work is
one file family and needs no prior context. **Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each against the code and the artifacts, say
what you found, and if the code contradicts this brief, stop and flag Boz before building.

---

## 1. The defect (Boz, 2026-10-11; read in source and measured on disk)

`cartograph/bake-content.js` (the roster loop, search `const inDistrict`) writes HPDM's district into every town:

- `historic_district: inDistrict ? 'Hi-Pointe–DeMun Historic District' : null`: a town name as a literal in the kit.
- `DISTRICT_STREETS` (`ALAMO`, `SAN BONITA`, `DE MUN`, …) and `districtEligible = municipality !== 'RICHMOND HEIGHTS'`:
  HPDM's nomination streets and HPDM's county exclusion, applied to every town.
- The Ward prints `historic_district` on the place card (`~/Desktop/dev.nosync/theward/src/place/Facts.jsx`).

Measured (re-derive by counting `historic_district` values in each `cartograph/data/<scene>/content/roster.json`):
hipointedemun 598 (correct), **jacksonheights 695** (Queens; untracked, not yet published), lafayette-square-staging 655
(retired scene). Jackson Heights' parcel well supplies the real name (`states/ny.mjs`, `historic_district: 'HistDist'`),
and `fetch-parcels.mjs` collapses it to `{ national: !!hd }`, so the kit throws the true name away and writes HPDM's.

`CLAUDE.md` Layer 0, Class D: a constant whose value happened to be correct for the town it was written on.

**Second half, the same field family.** `in_historic_district` went `null → false` on huron (318) and provincetown
(1,382) at their last re-bakes: `9f6eb3a9` swapped `addrHouseStreet` (null on an unparseable address) for `addressParts`
(always an object). Nothing reads `in_historic_district` (grepped kit and the three Ward repos), so it is harmless. But
`false` claims "not in a district" for a town that has no district source at all. ⇒ Take the rule `fetch-parcels.mjs`
already applies to `vacant`: a town with no district source writes `null`; `false` only where a source could have said
yes.

## 2. Read first

- `CLAUDE.md` Layer 0 (questions 1 and 2, Class D).
- `ORIENTATION` "A census is the union of its wells" and "NO FALLBACKS".
- `INTAKE.md`, wherever it covers parcels and `historic_district`.

## 3. Code sites (cite symbols; lines drift)

- `cartograph/bake-content.js`: `DISTRICT_STREETS`, `inDistrictStreet`, the `districtEligible`/`inDistrict` block, the
  record's `historic_district` / `in_historic_district` / `architecture.district` / `historic_status`, `loadNrInventory`
  (per-town `content/nr-inventory.json`: does it carry a district name?), and the run summary's `in_district` stat.
- `cartograph/fetch-parcels.mjs`: the `historic_district` shape (the `vacant` line beside it is the pattern).
- `cartograph/states/{mo,ny,oh,ma}.mjs`: what each well's `historic_district` field actually holds (a name, a flag, a
  code?). Read the field, never assume.
- `cartograph/data/hipointedemun/`: where HPDM's district belongs as the town's own declared data (an existing file,
  e.g. `jurisdiction.json` or `sources.json`, before a new one).
- `cartograph/prominence.mjs` (the comment excluding `in_historic_district`): stays true; confirm.

## 4. The shape (confirm it fits the code, then build)

1. **The name comes from the town.** The source's own name when a well supplies one; else the town's declared district
   (HPDM's name, streets and county exclusion move into HPDM's data); else `null`. ⛔ No district name, street list or
   municipality in kit code. ⛔ No fallback to another town's district.
2. **Membership is honest about its source.** A town with no district source (no well field, no NR inventory, no
   declaration) writes `in_historic_district: null`. `false` only where a source exists and said no.
3. **The parcel well keeps the name** when it carries one (NY), without breaking the wells that carry a flag (MO).
4. Delete what this replaces in the same commit, and say what was removed.

## 5. The check (see it FAIL first; mutation-test it)

`checks/claims-a-district-is-the-towns-own.mjs`, over every town via `checks/_scenes.mjs` `eachTown`: every
`historic_district` name in a town's roster comes from that town's own source or declaration, and a town with no
district source writes `null` membership. ⛔ Read the sources, never restate them. Mutations: put HPDM's literal back
(→ red on jacksonheights) · write `false` for a sourceless town (→ red on huron).

## 6. Bounds

- **Writes:** `cartograph/bake-content.js`, `cartograph/fetch-parcels.mjs`, `cartograph/states/*.mjs` only if a field
  mapping must change, HPDM's own data file, `checks/`.
- ⛔ **No bake, no re-fetch, no Publish or Promote without Boz's clear.** Swale is on the ground deformer: one bake at a
  time on the machine, load-gated. Prove the change by running `bake-content` for each town only once Boz clears it.
- ⛔ LS's listings are hand-curated (`845a253d`): confirm LS is untouched.
- The working tree holds uncommitted roster diffs on huron, provincetown and hipointedemun (the `null → false`). Leave
  them for your re-run to supersede; ⛔ never commit them as they are.
- Commit through explicit pathspecs only (`git commit -- <paths>`), checking each commit's name-status.
- **Registers:** `INTAKE.md` (where a district comes from) and `OPERATIONS` if a town now declares its district. Say
  in the commit which registers it reached.

## 7. Done when

The check is green on every town on disk, after being seen red. HPDM still names its 598, Jackson Heights names its own
district (or `null` if its source has none), huron and provincetown write `null`, and no kit file names a town's
district.
