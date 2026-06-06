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
