# HANDOFF — fix the 18th complex: data-first divided detection (the standard way)

**Goal:** replace our **geometric** divided-road detection (pair any two roughly-parallel same-name chains) with the **data-first** detection osm2streets uses (`OSM2STREETS-GROUNDING.md`, Macadam). This un-fabricates the spurious "divided road" on **South 18th** — which is actually a **motorway_link ramp paired with a service drive** — so 18th renders as normal streets around a normal block again.

**Root (settled by the grounding, do not re-derive):** our detector is four geometric gates inside a name group (60 m gap ceiling, **no class gate, no connectivity gate**). 18th's pair `28522831`(motorway_link ramp) + `166624144`(service), both named "South 18th Street," 3.2 m apart, sails through → fabricated `anchor:'inner-edge'` divided road → E1 weird width + E2 median-split the block. The standard refuses it **three independent ways**: class mismatch · `*_link` → ramp dispatch · no split/rejoin topology.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** Build-then-verify. **Push back** if the framing's wrong.

> ⚠️ **Data access (worktree trap).** `overlay.json`/`skeleton.json` are gitignored — read main-tree absolute paths. `src/data/ribbons.json` tracked.

**Read first:** **`cartograph/OSM2STREETS-GROUNDING.md`** (the data-first spec + the 18th forensics + the `innerSign`=face-adjacency recommendation — your primary source) · `SKELETON.md` (the divided detection / `weldChains` / `makeStreet`). Code: the divided-pair detector in `skeleton.js` (the four geometric gates), `makeStreet` (`skeleton.js:1452` — the class-flattening bug), the raw OSM tags.

**The build (per the grounding):**
1. **Data-first divided detection.** A pair is divided ONLY if: **(a) same drivable highway class** (no ramp+service); **(b) neither is a `*_link`** (motorway_link/trunk_link/etc. → dedicated ramp dispatch, never a carriageway); **(c) split/rejoin connectivity** (a real divided road diverges from a node and rejoins — topology, not parallelism); **(d) drop the 60 m gap ceiling.** Geometry (parallelism/gap) is **demoted to confirmation**, not the trigger.
2. **The class-flattening fix (`makeStreet:1452`).** It stamps the whole name group with the **first fragment's** highway class — the same first-fragment flattening the D6 comment fixed for `oneway`, still live for `highway`. Make it **per-fragment** (it also defeats `gradeSeparated` for named ramps — verify that's fixed too).
3. **`innerSign` = face adjacency** (which half-edge bounds the median face), not the perpendicular vote — the grounding shows this is the standard formulation and that the **E3.4 foot-vote bug class can't exist** in it. Fold in if clean; if it's bigger than expected, flag it for the intersection-everywhere brief and note why.

**Verify:**
- **18th un-fabricated** — pair `28522831-166624144` (and check `301606663-1297584456`) no longer divided; 18th renders as **normal streets + a normal block** (correct width all the way, no median-split) **on Jacob's live eye**.
- **No regression to REAL divided corridors** — Truman and the genuine dual carriageways stay divided (re-run the divided-pair list before/after; report what changed).
- **Named ramps** get correct `gradeSeparated`.

**Done:** 18th is normal; the real divided roads intact; class/gradeSeparated correct — **clean on Jacob's eye**. Report the full before/after divided-pair list. ⛔ No canonical-doc edits (Boz conforms). Sync to trunk, commit, report refs.

**Out of scope:** intersection-everywhere + trim (the **next** brief — "the initial thing": the perpendicular-join artifacts at the plain Ts) · the fillet/authoring kit (stays ours) · the marks (E3-generalization fixes those, next).
