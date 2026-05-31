# Cartograph Backlog

> **This doc is STATE + forward-work only** — *where we are* and *what's next*. One kind per doc (see `BOZ.md` → doc architecture): no diary here (that's `NOTES.md` + git), no how-it-works (that's the Reference layer: README / FEATURES / ARCHITECTURE / PIPELINE / RIBBONS). When an arc completes, its *fact* updates Reference, its *why* updates ARCHITECTURE's decisions, its *narrative* flows to NOTES — it does **not** stay here.
>
> **Ribbons / corners / curbs / intersections / block geometry:** every such entry is governed by `cartograph/RIBBONS.md` (§1 regime + §3.9 emitters + §6 failure modes) and `cartograph/PIPELINE.md` (the address-map). Read before working.
>
> *Pruned from a 4,567-line chronological diary on 2026-05-31. The full pre-prune history — including the ★IP NACTO/AASHTO pad-geometry + ADA corner-radius decisions — is preserved at `git show 4bf8af2:cartograph/BACKLOG.md`. Salvage of those decisions into ARCHITECTURE's Decisions section + diary into NOTES is deferred to a later consolidation pass (see §Triage).*

---

## 🔥 NOW — the active front

- **The geometry wall-arc** (the through-line; `[[project_two_bakes_two_walls]]`, `[[project_skeleton_is_the_first_bake]]`, PIPELINE §Wall):
  1. **C5 cutover** — migrate LS off the legacy per-leg emitter onto the mono-width `emitBlockRingBands`. Flip `useRingBandEmitter` for LS, eyeball, then delete `silhouetteStraightEmitter` + `buildFrontageBandsV2` + the dead `buildFrontageBands`. (RIBBONS §3.9; HANDOFF-ls-migration.)
  2. **Chain-consumer census** — enumerate every chain read in Phase B (P4/P7/P8 + the probe fallback); state what each becomes post-wall (move-to-Survey-bake / eliminate / Survey-tool-only). The linchpin that scopes the wall-move *and* tells the Toy-skeleton tooling which chain-reads to preserve vs retire.
  3. **Wall-move** — run figure-ground + corner rounding as "the First Bake" at Survey-exit; freeze `blockRounded`; downstream consults no chains. Corners + curb + polygon-shaper authoring move into Survey. (Block-independence verified — re-bake is block-local; HANDOFF-block-independence-SURFACE.)
- **Toy reset → skeleton bake, deploy editing tools from that state** (Jacob, in-flight; HANDOFF-toy-reset-to-defaults-DESIGN — the two-button reset shipped `ea7c754`).
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
| toy-reset-to-defaults-DESIGN | two-button reset | shipping (`ea7c754`) |
| asphalt-as-ribbon | authored asphalt extent | live → NEXT |
| dead-end-typology | endpoint typology | live → NEXT |
| render-conformance | env parity (DRAFT) | cold-review gate |
| audit-{cartograph,arborist,ls-app,docs} | forensic pathology | campaign |
| **completed — pending P5 archive** | degenerate-W-flood · pass2-customs-hardening · block-independence · ribbon-corners · measure-authoring-redesign · neon · neon-roof-depth · hero-keyframes · preview-measurement · mobile-profile · sky-and-light · buildings-bake · tree-hero-lod · cloud-specialist | retire to outcome+commit refs |

## §Triage (carried, not lost)

The pre-prune BACKLOG (`git show 4bf8af2:cartograph/BACKLOG.md`, 4,567 lines) held ~184 done/superseded markers and 11 session-end pins (pure diary) plus a few buried live items I classified from memory + HANDOFF state, not a full line-by-line read. **If a live item isn't above, it's in that git blob.** Two deliberate carries for a later pass: (1) the **★IP NACTO/AASHTO pad-geometry + ADA corner-radius decisions** → ARCHITECTURE Decisions section; (2) the **diary/session-pins** → NOTES or left in git. Neither deleted — both addressed when the consolidation reaches them.
