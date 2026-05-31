# Cartograph Backlog

> **This doc is STATE + forward-work only** — *where we are* and *what's next*. One kind per doc (see `BOZ.md` → doc architecture): no diary here (that's `NOTES.md` + git), no how-it-works (that's the Reference layer: README / FEATURES / ARCHITECTURE / PIPELINE / RIBBONS). When an arc completes, its *fact* updates Reference, its *why* updates ARCHITECTURE's decisions, its *narrative* flows to NOTES — it does **not** stay here.
>
> **Ribbons / corners / curbs / intersections / block geometry:** every such entry is governed by `cartograph/RIBBONS.md` (§1 regime + §3.9 emitters + §6 failure modes) and `cartograph/PIPELINE.md` (the address-map). Read before working.
>
> *Pruned from a 4,567-line chronological diary on 2026-05-31. The full pre-prune history — including the ★IP NACTO/AASHTO pad-geometry + ADA corner-radius decisions — is preserved at `git show 4bf8af2:cartograph/BACKLOG.md`. Salvage of those decisions into ARCHITECTURE's Decisions section + diary into NOTES is deferred to a later consolidation pass (see §Triage).*

---

## 🔥 NOW — the active front

- 🚨 **REGRESSION — ribbon authoring tools broken on toy after the reset (TOP PRIORITY, flagged 2026-05-31 EOD).** Jacob: the ribbon authoring tools no longer work in the toy scene following the toy-reset / V1.6-baseline work. **NOT diagnosed** — flagged at end of day; trust no cause until reproduced.
  - **Bracket (the lead):** broke *after* the toy-reset arc. Suspects, newest first: `8a1d9d1` (post-V1.6 baseline — cleaned `blockCustoms` + regenerated bakes; **prime suspect**, it changed the overlay/design/bakes the live authoring path reads) · `ea7c754` (two-button reset) · `cf24cb7` (Reset toy blocks button) · `52d7f9e` (clear blockCustoms→{} + rebake). All in git → clean `git bisect`, nothing lost.
  - **First moves tomorrow:** (1) reproduce in Designer → toy → Measure/Survey; capture the *actual* failure (console error? renders nothing? edits don't persist/rebake? `BlockGeometryV2Debug` throws?). (2) bisect the 4 suspects, or the cheap test: temporarily restore `8a1d9d1^`'s `overlay.json`/`design.json` and see if authoring returns. (3) render real before/after — don't theorize ([[feedback_render_guard_against_real_data_not_synthetic]]); verify edits applied before trusting output ([[feedback_verify_edits_applied_before_trusting_output]]).
  - **Don't reflexively revert** the baseline — it was *intended* state (committed deliberately). The bug may be that the authoring tools don't handle the clean/empty-`blockCustoms` baseline, not that the baseline is wrong. Diagnose, then evolve-vs-revert ([[feedback_evolve_vs_revert_judgment]]).
  - **Stakes — this blocks the arc below.** C5 / census / wall-move all validate on the toy authoring surface ([[feedback_toy_is_the_construction_spike_surface]]). Toy is the spike rig; if its authoring is down, the geometry work can't proceed. **Fix this first.**

- **The geometry wall-arc** (the through-line; `[[project_two_bakes_two_walls]]`, `[[project_skeleton_is_the_first_bake]]`, PIPELINE §Wall):
  1. **C5 cutover** — migrate LS off the legacy per-leg emitter onto the mono-width `emitBlockRingBands`. Flip `useRingBandEmitter` for LS, eyeball, then delete `silhouetteStraightEmitter` + `buildFrontageBandsV2` + the dead `buildFrontageBands`. (RIBBONS §3.9; HANDOFF-ls-migration.)
  2. **Chain-consumer census** — enumerate every chain read in Phase B (P4/P7/P8 + the probe fallback); state what each becomes post-wall (move-to-Survey-bake / eliminate / Survey-tool-only). The linchpin that scopes the wall-move *and* tells the Toy-skeleton tooling which chain-reads to preserve vs retire. **DONE 2026-05-31 (Plumb): `HANDOFF-chain-consumer-census.md`** — 33 sites mapped across the 3 paths. Headline: P9/P12/P13 already chain-free; keeper emitter P10 reads chains in *one* fallback; dependency is concentrated in P4–P8 producers + 2 metadata leaks + the P11 fillet residual (HARD §H1). Metadata freeze (`bakeFeScalars` pattern) is cheap; geometry freeze (corner Vc/tangents) is the project. 6 HARD residuals incl. dead-end caps (→ dead-end typology) + identity-id scheme.
  3. **Wall-move** — run figure-ground + corner rounding as "the First Bake" at Survey-exit; freeze `blockRounded`; downstream consults no chains. Corners + curb + polygon-shaper authoring move into Survey. (Block-independence verified — re-bake is block-local; finding in the census H-bucket + git `2854aa3`.)
- **Toy reset → skeleton bake, deploy editing tools from that state** (Jacob, in-flight; two-button reset shipped `ea7c754`, post-V1.6 baseline `8a1d9d1`; design HANDOFF retired to git `2854aa3`).
- **Toy → Stage bake path** doesn't carry through (HANDOFF-toy-to-stage-bake). Reframed as Slab-Players: fold into render-conformance Phase 6 (Preview-inherits-Stage) rather than patching the path — unless it blocks the operator now, then patch tactically.

## NEXT

- **Survey · Section · Stage rename** — *decided, not yet built.* Tools: Survey = hardscape shape (footprints + corners + curb + polygon-shaper); Section (was "Measure") = ped-zone chop; Stage = look. Rides with the wall-move arc. ⚠️ Do NOT rename code/FEATURES/MeasurePanel until implemented (stale-label rule). (`[[project_two_bakes_two_walls]]`.)
- **Story-Pass address-maps for Meteorologist + Arborist** — same template as PIPELINE.md (`[[project_story_pass_campaign]]`).
- **Doc-consolidation Process** (the living Process, `BOZ.md`): P3 RIBBONS §5/§6/§7 freshness+archive (other Boz owns) · P4 NOTES (4,369-line diary) + this BACKLOG ✅ done · P5 archive completed HANDOFFs · P6 helper docs. ARCHITECTURE grows a Decisions section.
- **Asphalt-as-ribbon** (HANDOFF-asphalt-as-ribbon) — authored outer-extent for asphalt. Reframed as Survey-owns-SHAPE; likely a Survey capability post-wall-move, not an emit-side addition. Destination set; timing by urgency.
- **Dead-end / Spike typology** (HANDOFF-dead-end-typology) — endpoint types (Spike / Stub-with-cap / Stub-no-cap). Chain-consumer-census territory; reframe as "what Survey-side authoring do chain-endpoints become?"
- **Hero keyframe FOV regression** (not urgent) — per-keyframe FOV slider stopped surfacing in Stage Hero UX; model intact (`StageApp.jsx:840-849`), loss is UI. Diff against Détente's `3ebf510`.
- **TAA post-pass** (not urgent) — temporal AA on the production Canvas for the live-3D↔slab seam. `[[project_zfighting_known_cosmetic]]`.
- **Render-conformance open phases** (HANDOFF-render-conformance): REDEPLOY so deployed app picks up the camera/LOG fixes · Phase 3 dedup the 6 `IS_MOBILE` regexes + browse-altitude dup · Phases 4–7 (BLOCKED on Jacob's cold-review) · Phase 6 Stage↔Preview↔Production parity (Preview-inherits-Stage) · measurement empirical meter-verify.

## LATER / PARKED

- **Hosted bake service with auth** (v2+, post-v1) — per-operator publish without git write access. The kit's multi-operator horizon.
- **Non-building landmarks** — own treatment (not the building path).
- **Slab completeness** — ongoing: anything authored-but-not-baked is invisible to the deployed product. Audit gaps as they surface (FEATURES "the slab carries the full authored product").
- **Doc-debt sweep** — stale `BakedBuildings` refs in `ls/ARCHITECTURE.md`, `ls/reference/INVENTORY-DATA.md §A`, `RUNTIME-DELTA.md`.

## ⏸ AWAITING JACOB (QC / confirm gates)

- **Buildings bake L1.3** — production-app visual confirm (HANDOFF-buildings-bake; slab→v2 cutover shipped).
- **Hero-tree LOD/impostors** — Phase A classification-overlay QC; at the A→B seam (HANDOFF-tree-hero-lod).
- **Render-conformance Phases 4–7** — gated on Jacob's cold-review of HANDOFF-render-conformance (DRAFT).

## 🏛 STANDING CAMPAIGNS (multi-session)

- **The living Process / doc-architecture** — this conversation, codified in `BOZ.md`. Three doc kinds (Reference / State / Diary); content flows downstream as it ages; one pass per session paired with active work.
- **Forensic audit + productization → Show Bible** (`[[project_forensic_audit_and_productization_campaign]]`) — HANDOFF-audit-{cartograph,arborist,ls-app,docs}. Pathologists per domain → rip-up/clean-out → capability statement.

## 🛠 IN-FLIGHT HANDOFFS (the detail layer — index)

| HANDOFF | what | status |
|---|---|---|
| ls-migration | C5 cutover conversation-starter | live → NOW |
| toy-to-stage-bake | bake path Toy→Stage | live → NOW |
| asphalt-as-ribbon | authored asphalt extent | live → NEXT |
| dead-end-typology | endpoint typology | live → NEXT |
| render-conformance | env parity (DRAFT) | cold-review gate |
| audit-{cartograph,arborist,ls-app,docs} | forensic pathology | campaign |
| **retired 2026-05-31 (`2854aa3`, in git)** | block-independence · degenerate-W-flood · pass2-customs-hardening · ribbon-corners · measure-authoring-redesign · toy-reset-to-defaults | done — recoverable via git |
| **still tracked, pending P5 retire** | neon · neon-roof-depth · hero-keyframes · preview-measurement · mobile-profile · sky-and-light · buildings-bake · tree-hero-lod · cloud-specialist | retire to outcome+commit refs |

## §Triage (carried, not lost)

The pre-prune BACKLOG (`git show 4bf8af2:cartograph/BACKLOG.md`, 4,567 lines) held ~184 done/superseded markers and 11 session-end pins (pure diary) plus a few buried live items I classified from memory + HANDOFF state, not a full line-by-line read. **If a live item isn't above, it's in that git blob.** Two deliberate carries for a later pass: (1) the **★IP NACTO/AASHTO pad-geometry + ADA corner-radius decisions** → ARCHITECTURE Decisions section; (2) the **diary/session-pins** → NOTES or left in git. Neither deleted — both addressed when the consolidation reaches them.
