# BRIEF — what the intake throws away, and what it never asks for

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-06
evict-when: RULING: Jacob has ruled on the list of what the intake drops and never asks for
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to the session `Boz the Younger`** (or whichever Boz Jacob names when he dispatches you).

**Instruction: confirm-then-build.** Read the canon and code below, run the existing census, and tell Boz what you
found. If the code contradicts this brief, **stop and flag**. ⛔ **Read-only until Jacob rules on your list:** no
fetch, no ingest change, no pour.

---

## 0. What this is (Jacob, 2026-10-06)

*"Should we have an agent look at all the info we take in and what we throw away, to make sure we're not throwing
away more valuable info?"* The trigger: every town's OSM carries `barrier=kerb` nodes with `kerb=lowered|flush|raised`
(HPDM: 1,286), which are the evidence for each corner's curb-cut style. The kit never asked for them, so no census
saw them missing (`BRIEF-corner-ramps-and-kerb §3` step 2, Sill).

⭐ **The deliverable is a CHECK, not a report** (`CLAUDE.md` Layer 0; "prune as you go" rule 1). It runs on a town
nobody has looked at and says what that town's sources hold that the kit drops.

## 1. What exists — extend it, don't rebuild it

`checks/claims-intake-is-consumed.mjs` answers **"what did we fetch that nothing uses?"** for OSM. It parses the
consumer vocabularies out of source, never restates them, and prints a per-town census. ▶ Run it on every town first.
**It has two blind spots, and they are this brief:**

1. **What we never ASK for.** It sees only what was fetched. The kerb nodes were never in the query (`fetch.js`
   asks `node["highway"]` plus a heavy set), so they never appear as "unclaimed".
2. **What a non-OSM well drops at ingest.** Parcels, a city's building footprints (NYC: BIN, `height_roof`,
   ground elevation), address points, tree inventories, elevation datasets, tide, CDL. Each well's fetch and
   ingest keeps some columns and discards the rest, and nothing lists the discards.

## 2. Read first

- `INTAKE-CATALOGUE.md` (the intake manifest; every input and where it comes from) · `cartograph/INTAKE.md`.
- `cartograph/OSM-FORENSICS.md` ("stop dropping it") and `ROADMAP A09` (node tags at ingest; Sill corrected its
  row 2026-10-06).
- `cartograph/states/*.mjs` (the declared wells, per state and city) and `BRIEF-nyc-adapter.md §3.2a`.
- `checks/claims-intake-absence-is-loud.mjs` (absence must be loud, never a quiet zero).

## 3. The work

1. **Census the never-asked.** For each town, inventory what OSM holds in its frozen bbox (key and value counts, by
   element type) with read-only Overpass queries, against what `fetch.js` requests. Print the keys we never request,
   ranked by count. ⛔ The bbox is the town's own; no constant.
2. **Census each well's discards.** For each declared well, list the source's full schema (its metadata endpoint,
   or the raw response) against the fields the ingest keeps. Read both from source, never a copied list.
3. **Fold both into the existing check** (or one sibling it imports), so one run answers all three: fetched and
   unused · never asked · discarded at ingest. ⛔ Mutation-test it: a deleted consumer, a narrowed query and a
   dropped column must each show up.
4. **Classify, and STOP for Jacob.** For each finding, give its kit use in one line (which step could read it, for
   what) and a class: **worth having · unrelated · vestigial**. Rank by value to the product, not by count. Write
   only measured numbers; where a use is a guess, say so.

## 4. Bounds

- Writes: `checks/` and the catalogue rows describing what you found. ⛔ No change to `fetch.js`, the wells or
  ingest until Jacob rules on the list; each "worth having" becomes its own landing, with its consumer.
- Overpass and the open-data portals rate-limit: query slowly, cache raw responses under `scratch/`, and never
  write under `cartograph/data/`.
- Commit through explicit paths only (`BOZ §3.7`). Each commit names the register it reached (`INTAKE-CATALOGUE`
  counts), or says "reaches no register".

## 5. Done when

One command prints, for any town, what its sources hold that the kit never asks for, drops at ingest, or fetches
and never uses. It is mutation-tested, and Jacob has ruled on the ranked list.
