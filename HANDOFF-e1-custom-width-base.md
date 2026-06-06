# HANDOFF — E1: bake the custom street-width base into the skeleton

**Goal:** make the frame born **as close to reality as possible** — base widths sourced **custom (`survey.json`, operator-measured) → OSM (`lanes`/`width`) → AASHTO (`seedSection`)**, baked into the **skeleton seed**, and **propagated onto every chain** (including divided splits — where it currently breaks). The operator then only *tweaks* (existing handles). The custom data is already there and correct; the bug is that it isn't reaching the chains.

**Evidence:** `raw/survey.json` (68 streets, 61 measured) says **South 18th pHW 5.73** (~11.5 m), matching the operator's traced curb (~10.6 m) — but the live S-18th chain renders at **pHW 2** (4 m, a default). The correct value exists; it's being shadowed/not-propagated.

**Agent: FRESH** (name yourself). **`isolation: worktree` — sync to trunk tip FIRST.** General-purpose, **forensic-then-build** (resolve the wiring question before landing). Verify on Jacob's eye before "done."

> **Push back if the framing is wrong** (four agents have caught wrong instructions — that's the job).

## Read first (to the section)
`SKELETON.md §2` (the `seed` field — the width-sourcing priority I added) + `§3 step 6` (`makeStreet`/`seedSection`) · `DIVIDED-CORRIDOR-PLAN.md` (Alidade — chains at inner edge, `chainGap`, the propagation) · `HANDOFF-d1-carriageway-measure-hygiene.md §REPORT` (Gunter — the broadcast-smear / overlay-shadowing measure issues) · memories `[[feedback_geometry_bugs_may_be_data_bugs]]`, `[[feedback_perp_side_convention]]`. Code: `cartograph/derive.js:679` (`loadSurvey`) + where survey widths are applied; `skeleton.js seedSection` + `makeStreet`; the overlay→measure merge.

## ⚠️ The key forensic question — resolve BEFORE building
`survey.json`'s `pavementHalfWidth` is **"centerline → sidewalk-centerline"** = the **block-edge / ROW** distance (what the operator *traces*: the curb). The live `measure.pavementHW` is the **asphalt** half-width (centerline → asphalt edge), driven by lanes/parking — a **different quantity**. So S-18th's asphalt=4m may not be "wrong"; the **block edge** should be ~11m (survey.json) and isn't. **Pin exactly:** what does the trace/`survey.json` feed (block edge/curb), what feeds the asphalt (lanes), and where does the live block-edge come from today? Wire the custom source to the **right** quantity. Do not conflate asphalt with block-edge.

## The build
1. **Forensic — pin the propagation break.** Why doesn't `survey.json`'s width reach the chains (S-18th chain 2 vs survey 5.73)? Candidates: survey applied per-*name* but lost across the divided split (`-0`/`-N` chains); stale/default **overlay** values shadowing survey (the D1 broadcast-smear class); seed (AASHTO) winning over custom; the block-edge-vs-asphalt mismatch above. State the cause.
2. **Bake the source into the skeleton seed:** `seedSection`/the skeleton sources width **custom (`survey.json`) → OSM lanes → AASHTO**, so the frame carries the best base. Key by street **name → propagate to ALL its chains** (incl. divided carriageways), honoring the inner-edge model (D1; chains at inner edge).
3. **Overlay = tweaks only.** Genuine operator tweaks still win over the base; stale/default overlay values must NOT shadow the custom base (reconcile the priority — the D1 lesson).

## Done
A/B across all streets + on **Jacob's live eye**: block edges/curbs land at the measured/traced widths (S-18th ~11 m, not 4 m), correct across divided corridors too; the base is `survey.json`-sourced where available; overlay holds only tweaks. Report the propagation cause + the block-edge-vs-asphalt resolution. ⛔ Don't touch canonical docs (Boz conforms). Sync to trunk, commit, report refs.

## Out of scope
The **kit** onboarding-import + management of custom data (separate LATER backlog item) · E2 constructed median · E3 transition/fold/corner · E4 rip-out · the 3 T-bumps · brief F (north-void).

---

## REPORT (Lye, 2026-06-05) — DONE, pending Jacob's live eye

### The propagation cause (Q1) — four stacked causes, none in polygonization

1. **The seed was born but never consumed.** `skeleton.seed` (AASHTO tier) was carried to ribbons.json and read by NOTHING — `computeStreetMeasure` never looked at it. Even the AASHTO seed (S-18th: 3.96/5.49) beat the live 2.0.
2. **The overlay shadowed every chain on the map.** All **220/220** overlay entries carried a `measure`, so the survey-aware default path never ran for ANY chain. The shadow was *self-perpetuating*: `_loadCenterlines` gives every chain a truthy measure (`ov ?? legacy ?? rb.measure`) and `_saveOverlay` persisted it for every street — every save re-broadcast the baked baseline into overlay.json wholesale (the caps had a `_baselineCapStart` guard against exactly this; measure never got one). Plus migrate-overlay's name-broadcast (the D1 smear).
3. **S-18th's `2` pinned:** `correctStreetWidths` (lamp correction) floors at `Math.max(2, avgLampDist − infra)` — the legacy centerlines.json S-18th measure is `defaultSideMeasure` output at the **lamp floor hw=2** (its treelawns match the formula to 1e-4: 4.16−0.914−2 = 1.2456 ✓), broadcast onto all 8 chains. D1 fixed carriageway *sides*; the outer magnitude stayed this residue.
4. **The block-edge/asphalt conflation:** survey.js says it itself (`:221` + header): *"pavementHalfWidth = centerline to sidewalk centerline. **Block edge goes here.** Street pavement is rendered independently from lane/parking tags. Tree lawn is the natural gap."* — but `streetProfiles.defaultSideMeasure` fed it in as **asphalt** `pavementHW` (its doc-comment "centerline → curb-inner" was the corpse-lie). 67 overlay entries carried the survey float verbatim as asphalt — West-18th rendered a **15.6 m asphalt half-width**.

### The block-edge vs asphalt resolution (the ⚠ question)

- **survey.json measures the BLOCK EDGE** (per-side sidewalk-centerline distances; back-of-sidewalk = swDist + sidewalk/2; assessor `rowWidth`/2 = the ROW edge). It does NOT measure asphalt.
- **The asphalt is lanes-driven** (242 OSM ways carry `lanes`; `width` = 0%). makeStreet read only the FIRST fragment's tags → lanes dropped on welded chains (S-18th's lanes never arrived) — fixed with a per-chain vote over ALL source ways.
- **Wiring landed:** survey pins the sidewalk position per side → treelawn = the natural gap (survey.js's original intent, restored); asphalt = OSM lanes → AASHTO, **clamped** so it never crosses a survey sidewalk (impossible-road guard). Block edge lands at the survey position; curb at the lanes/AASHTO width.
- **Side identity is geometry-resolved per chain per bake** (survey L/R keys are point-order-relative to the ORIGINAL OSM directions = the persisted-side-key class; the canonical-direction pass flips 62 chains). Each chain measures its own perp distances to parallel OSM sidewalks (measure-RIGHT = (−dz,dx)) and takes the survey value pairing that best matches — reversal-proof, and divided-corridor contamination (Park Ave's 2.99 median-path value) sinks into the median side that `innerEdgeAssign` zeroes.

### The build

- `skeleton.js` — `chainLanes` (per-chain lanes vote over sources; 50 chains recovered lanes) · `stampCustomWidths` late pass (post-direction-normalize): `seed.left/right` = `{pavementHW, treelawn, sidewalk, blockEdgeHW, source}` + `seed.widthSource`. 155 streets seeded (123 geometry-sided, 27 symmetric-fallback, 5 assessor-row). **Geometry-neutral: 0/220 points changed.**
- `streetProfiles.js` — `measureFromSeed(seed, type)` (the base builder; highway classes keep TYPE profiles — seedSection's residential fallback put parking on ramps) · honest comments on `defaultSideMeasure` (legacy fallback; conflation documented).
- `derive.js` — `computeStreetMeasure` consumes the seed; **legacy centerlines measure tier REMOVED** (its 11 measured names all live in overlay already — pure re-shadow risk).
- `useCartographStore.js` — `_baselineMeasure`/`_measureFromOverlay` + measure-diff save guard: untouched chains no longer persist baseline measures (**overlay = tweaks only, enforced at the source**).
- `rebase-overlay-measures.js` (new, one-shot, D1 discipline: backup, `--root`, `--dry-run`, full disposition log) — fingerprints machine measures: legacy-equal (gated on the legacy measure ITSELF proving machine — legacy-era operator authoring like Missouri's keeps all its broadcast copies), current-generator replay, free-hw formula evidence (drag-proof: `applyKindToMeasure` breaks the sum), TYPE/survey-float + machine shapes, and a proven-machine-float pool for the broadcast residue on carriageway outers (revises D1's "keep outer residue" — the seed is the better datum now). **178 dropped → seed base · 42 kept.** Every keep cross-checks against an independent authored label (D1's 3 authored-inboard, Alidade's authored spines 10.59/10.66/10.31, the blessed park pair 6.86/6.70).

### A/B (proxy — Jacob's eye is the gate)

- Pre-repair bake: **byte-identical measures/geometry** (regression gate — proved the shadow). Post-repair: **178/220 measures re-based, 0 point changes, faces 178→178**, ground bake clean, vite build clean.
- **S-18th**: every chain at survey widths — spine `-3`: pav 3.25/5.49 (curb-to-curb **8.7 m**, was 4.0; operator trace ~10.6), block edges at **4.92/8.06 = ~13 m ROW** (the brief's "~11 m" scale ✓). Carriageways outer 3.25–3.96, inboard 0 (the inner-edge model propagates through the seed ✓).
- **West-18th**: 15.6 m *asphalt* → 5.49 m asphalt + 9.2 m treelawn, block edge at the same 16.4 m survey position (the conflation cured, the block edge kept).
- 46 block-edge sides moved >2 m (papin side-flip corrected, gravois/waverly floods cured, motorway links restored to 2.44 m ramp profiles). Sweep candidates for the eye: Papin, Gravois, Waverly, S-21st, Park Ave west stretch.

### Known seams (honest list)

- **lafayette-avenue-0/-1 keep the operator-era 10.56** (Alidade's trace wants ~15.6 on `-1` south) — operator data wins by rule; the trace-driven repair stays Alidade's open E1-row option (Jacob's call), or a Survey drag.
- **Park Avenue's survey `sidewalkLeft: 2.99` is contaminated** (divided-aggregation artifact — a median-side path). The proximity assignment sinks it inboard on carriageways; on the spine `-5`/`-4`-outer it still pinches (~2.1 m pav). Root = survey DATA; the kit re-import (out of scope) is the cure; meanwhile operator tweak.
- The **alley ROW-buffer path** (derive `[7/8]`) still uses the old centerlines/defaultMeasure proxy for clip reach — untouched to keep the change surgical (±2 m clip reach, pre-existing wrongness).
- Doc-code rows for Boz: `SKELETON.md §2 seed` (per-side schema + widthSource now real — the "kit move" landed), width-sourcing mentions in FEATURES/RIBBONS, the removed centerlines measure tier.

### Delivery (the eye needs the main tree)

The live app reads skeleton/overlay from the **main tree** (both gitignored, per-tree). After merging this branch to trunk, run in the main tree:
```
node cartograph/rebase-overlay-measures.js --dry-run   # eyeball dispositions against live edits
node cartograph/rebase-overlay-measures.js             # timestamped backup automatic
node cartograph/skeleton.js && node cartograph/pipeline.js --skip-elevation
node cartograph/promote-ribbons.js && node cartograph/bake-ground.js
```
then reload Survey. (The main tree's overlay.json may hold operator edits newer than this worktree's copy — the dry-run lists every disposition; anything Jacob authored since will KEEP by the fingerprint rules, but eyeball it.)
