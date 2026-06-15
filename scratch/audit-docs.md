# Doc-corpus audit — gap map + FEATURES front-door seed

**Auditor: Codex (read-only). 2026-06-14. 86 docs (50 root · 31 cartograph · 5 archive).** The deliverable of the long-pending `audit-docs` leg (README/AUDIT-MATRIX indexed it as the HANDOFF-audit-* set; this leg never ran until now).

> ✅ **EXECUTED 2026-06-14 (mechanical cleanup committed).** Repointed the dead pointers · retired 11 closed root HANDOFFs to git (narrative → `NOTES.md` 2026-06-14) · archived 5 closed spikes → `cartograph/_archive/` · banner-flagged 3 held docs (OSM-FORENSICS, -EVAL, PREBAKE-POLYGONIZATION-PLAN — failed the lift-first gate, archive pending Jacob's eye) · indexed the correctness-suite trilogy + `tile-T3-corner-handles` (verified live, NOT subsumed). Accord-swept clean (0 dead pointers). **FEATURES front-door (Pass 2) — RESOLVED with Jacob 2026-06-14:** the settled-doctrine headlines became **`ORIENTATION.md`** (root — the universal first read, plain-language bridge register, wired as the enforced first read into CLAUDE/BOZ/README). FEATURES stays the pure pitch and **still owes its engineer back-half migrated out** (→ ARCHITECTURE / OPERATIONS / NOTES). That migration is the live task.

Orientation — checked against the four navigational surfaces: `README §START HERE` (settled-state by topic) + `README §Documentation map` · `BOZ §0` (Suite matrix + feature index) · `PIPELINE` (stage spine) · `BACKLOG` (State index). Standard for "clean": could an agent extract the load-bearing facts without missing them in the noise (BOZ §3).

---
## PASS 1 — THE GAP MAP

### 1. Orphans (indexed in no catalog)
- **HANDOFF-tile-T3-corner-handles.md** — true orphan, 0 inbound refs; dispatch-ready (2026-06-08) but invisible; likely subsumed by tile-T3-authoring + section-per-edge-fill.
- **BOZ-MORNING-HANDOFF.md** — true orphan, 0 inbound; stale (2026-06-01), argues the abandoned "stroke construction" pivot. Archive.
- **HANDOFF-curb-corridor-construction.md** — orphan; superseded ("wrong drift").
- **HANDOFF-curb-offset-draw.md** — orphan; branch-name HANDOFF, superseded by freeze-the-curb.
- **HANDOFF-survey-construction-forensic.md** — orphan; deliverable `scratch/SURVEY-CONSTRUCTION-FORENSIC.md` is indexed in BACKLOG, root brief is a spent dup.
- **THROAT-JUNCTION-FINDINGS · LOOM-TOPO-FINDINGS · SIEVE-DETECTOR-FINDINGS** — soft orphans, reachable only from POLYGON-FIRST §5; the correctness-suite trilogy is load-bearing but findable from no top-level index.
- **SPLINE-18TH-FINDINGS.md** — soft orphan, reachable only via SECTION prose.
- **The 4 HANDOFF-audit-{arborist,cartograph,docs,ls-app}.md** — glob-indexed only; `audit-docs` is the one that never ran (this audit executes it).
- **CLAUDE.md** — not indexed, but it's the always-loaded gate by design. No action.
- Reachable-only-via-prose (lower severity): SPAR-SKELETON-FORENSIC (SKELETON), HANDOFF-through-road-simplify (SKELETON), HANDOFF-divided-transition-block-tongue (BOZ §0), HANDOFF-band-fold-fix-RESULT (BOZ §0).

### 2. Stale / superseded (closed content sitting hot — flag, don't move)
- **Closed root HANDOFFs:** REVERTED/ABANDONED — 18th-loop-skeleton (OBE), band-fold-fix-RESULT (stranded on 8e1e414), dead-end-spike-prune (reverted dd4ddb6). SUPERSEDED — band-fold-fix, divided-transition-block-tongue (→freeze-the-curb), curb-offset-draw, curb-corridor-construction, pipeline-reconception, BOZ-MORNING-HANDOFF. LANDED — through-road-simplify (c4cb191), prebake-d2-face-freeze (folded-live), section-per-edge-fill (b5c7e98), buildings-bake (L1.3), SPAR-SKELETON-FORENSIC. SPENT forensic briefs (deliverable in scratch/) — section-forensic, survey-construction-forensic, the 3 landed audit-{arborist,cartograph,ls-app}.
- **cartograph/ Reference/Plan carrying obsolete claims:** RENDER-PATH-CENSUS (pre-Wall regime, STALE) · PREBAKE (mild — frames curb-freeze gap as more open than it is; needs "D2 folded-live" line) · **FEATURES** (large explicitly-superseded figure-ground/V2 passages left in place) · LOOP-STREETS (two RESOLVED banners above the live model) · closed plan/spike docs still at top-level: JUNCTION-CURE-PLAN (landed 9c275ce), DIVIDED-CORRIDOR-PLAN (landed), PREBAKE-POLYGONIZATION-PLAN (D2 folded), OSM-FORENSICS + -EVAL (landed), TRUMAN-FORENSICS (landed), SHADOW_HANDOFF (Apr-14, no banner/anchor).

### 3. Hot/cool violations (cool history a load-in is forced to read)
- ~7 dated forensics/spikes live in `cartograph/` not `_archive/`: OSM-FORENSICS, -EVAL, JUNCTION-CURE-PLAN, DIVIDED-CORRIDOR-PLAN, PREBAKE-POLYGONIZATION-PLAN, TRUMAN-FORENSICS, RENDER-PATH-CENSUS, SHADOW_HANDOFF (cool by nature — violation is *location*).
- ~40 HANDOFF-*.md piled at root — BOZ §2 forbids it; ~13 closed (list 2); the documented 24→pile failure recurring.
- **FEATURES back half (~lines 280–497, ~220 lines)** — developer engineer-internals + dated DONE-narratives in the brochure register (depth-buffer GLSL, polygonOffset, neon winding, bake mtime). The single largest signal-in-noise + register violation.
- BACKLOG NOW lead paragraph (line 11) — one ~600-word block, dense but load-bearing.

### 4. Overlaps (consolidation candidates)
- **Junction-band/thorns/cap-clamp:** band-fold-fix + -RESULT + junction-band-thorns-FINDINGS + THROAT-JUNCTION-FINDINGS + SECTION-CAP-CLAMP-FORENSIC + SECTION §7 (5–6 docs, one bug-family) → consolidate live truth into SECTION §7 + one findings doc.
- **Curb freeze/offset:** freeze-the-curb (live) + curb-offset-draw + curb-corridor-construction (dead) + POLYGON-FIRST §1-3 + PREBAKE §4.1/§5 → two dead briefs shadow the live one.
- **Divided roads:** DIVIDED-CORRIDOR-PLAN + TRUMAN-FORENSICS + divided-transition-block-tongue + PREBAKE-POLYGONIZATION-PLAN + FEATURES §367-387 → cure landed, collapse spikes.
- **Junction/intersection construction:** JUNCTION-CURE-PLAN + OSM2STREETS-GROUNDING + _archive/…SUPERSEDED + round-skeleton-corners → parked, scattered across 4.
- **OSM frame forensics:** OSM-FORENSICS + -EVAL + OSM2STREETS-GROUNDING → one evidence base.
- **Curve-fit/smoothing:** vector-curve-construction + SKELETON §3.5 + RIBBONS §1 → live, well-pointed, low-pri.
- **Spent forensic briefs vs scratch/ deliverables:** section-forensic↔SECTION-FORENSIC; survey-construction-forensic↔SURVEY-CONSTRUCTION-FORENSIC.

### 5. Dead pointers (refs to moved/absent docs)
- **HANDOFF-too-much-line-root-cause.md** — DEAD; cited PIPELINE ×2 (§Wall + P1) + dead-end-spike-prune.
- **HANDOFF-polygon-first-junction-construction.md** (bare) — DEAD; now `_archive/handoffs/…-SUPERSEDED-2026-06-13.md`; cited round-skeleton-corners (ghost), BACKLOG (names both, OK-ish).
- **HANDOFF-stroke-construction.md + HANDOFF-wall-move.md** — DEAD; cited pipeline-reconception.
- **HANDOFF-wall-W1-identity.md + HANDOFF-stroke-construction.md** — DEAD; cited BOZ-MORNING-HANDOFF (itself archive-bound).
- **HANDOFF-junction-band-thorns.md** (dispatch brief) — DEAD; only FINDINGS exists; cited junction-band-thorns-FINDINGS.
- **HANDOFF-toy-reset-to-defaults-DESIGN.md** — DEAD; cited toy-to-stage-bake.
- **HANDOFF-wall-phase-d.md** — DEAD at root (exists only in a worktree); cited prebake-d2-face-freeze.
- **Origin-brief refs** ("Deliverable of HANDOFF-{osteopathologist, p1-frame-enrichment, osm2streets-grounding, truman-forensics}") — DEAD (low severity); the deleted-after-delivery pattern.
- **NOT dead (don't "fix"):** SLAB-CONTRACT.md resolves (root, 435 lines; the ~30 bare cites are the filename-ref convention) · SECTION-CENSUS-2026-06-03 refs correctly point to `_archive/`.

---
## PROPOSED MOVE / RETIRE / REPOINT (for Boz, after review)
- **Retire to NOTES** (commit-if-untracked → capture one-liner → delete, BOZ §2): 18th-loop-skeleton, band-fold-fix, band-fold-fix-RESULT, dead-end-spike-prune, divided-transition-block-tongue, curb-offset-draw, curb-corridor-construction, pipeline-reconception, through-road-simplify, prebake-d2-face-freeze, section-per-edge-fill, buildings-bake, section-forensic, survey-construction-forensic, the 3 landed audit-{arborist,cartograph,ls-app}, tile-T3-corner-handles (verify subsumed first).
- **Archive to `cartograph/_archive/` (dated):** BOZ-MORNING-HANDOFF; the closed cartograph spikes (JUNCTION-CURE-PLAN, DIVIDED-CORRIDOR-PLAN, PREBAKE-POLYGONIZATION-PLAN, OSM-FORENSICS, -EVAL, TRUMAN-FORENSICS, RENDER-PATH-CENSUS, SHADOW_HANDOFF) — **lift each still-load-bearing fact to its Reference home FIRST** (most already pointed-to from SKELETON/RIBBONS/POLYGON-FIRST; verify before cutting).
- **Repoint** the 7 hard dead pointers (delete-the-ref or "superseded → see X"): PIPELINE ×2, round-skeleton-corners, BACKLOG bare ref, the FINDINGS/origin-brief cites.
- **Index (kill orphans):** add the correctness-suite trilogy (SIEVE/LOOM/THROAT-FINDINGS) to BOZ §0 feature index under a "Correctness suite" row → POLYGON-FIRST §5; surface audit-docs as the open audit leg.
- **Accord sweep** after the moves (BOZ §3): re-grep the corpus; every archived doc's inbound refs repointed in the same breath.

---
## PASS 2 — THE FEATURES FRONT-DOOR SEED

### 2.1 Settled-doctrine headlines (the "don't re-derive" set, with pointers)
1. **Polygons Only — the TILE model.** tiles = faces of the centerline graph; strips painted inward; the corner is the inward-offset (never a constructed fillet primitive). → RIBBONS §1, POLYGON-FIRST, README §START HERE.
2. **The Skeleton is The First Bake.** By Survey-exit, hold an extremely-simplified polygon-ready frozen frame (clean block ≈ 4 corners). → SKELETON, PIPELINE §skeleton.
3. **Chains die at the Wall.** No geometry from chains past the freeze; first diagnostic = "is this chains again?"; fix = move the wall earlier, never patch chains deeper. → PIPELINE §Wall, WALL.
4. **The Derivation Chain: centerline → polygon → ribbon.** Centerline is the ROOT; the polygon is BOTH geometry AND identity (leg/corner/treelawn-vs-sidewalk read off it); fix at the centerline first (patching the polygon on a rough centerline edits a shadow). → RIBBONS §1, SKELETON §3.5.
5. **The curb is a concentric/parallel offset of the centerline (D6a).** NOT an asphalt-union carve; cleanup lives on the frame, never the curb (the concentric law). → POLYGON-FIRST §1, vector-curve-construction Law 1.
6. **SHAPE automated / LOOK authored — the KIT INVARIANT.** Hand-authored SHAPE is a defect; data-derivable → automatic; only creative LOOK is authored; the 35 curated streets are the metric → 0. → SKELETON §6, INTAKE §6.1, BACKLOG NOW.
7. **Two-carriageway divided model LOCKED.** Carriageways stay 2 chains at the inner edge; pairing gated on station-overlap; median constructed at prebake (E2) or emergent. → RIBBONS §3.1, DIVIDED-CORRIDOR-PLAN, FEATURES §367-387.
8. **The curve-fit ONE KNOB (STREET_SMOOTH).** Single SSoT smoothing read by Survey+curb+Section+bake; a consume-time map never baked into the sparse frame (densify stales intersections.ix → smooth a copy); built but dormant at 0 pending the robust offset. → SKELETON §3.5, vector-curve-construction.
9. **SHAPE = Survey · FILL = Section.** Survey freezes the hardscape silhouette; Section strokes ped FILL inward off the frozen curb; ribbon is mono-width, the corner is the band BENT (never a constructed corner primitive). → SURVEY, SECTION, PIPELINE §Ribbon.
10. **The slab is the contract.** Cartograph pours a flat/fortified/dumb slab; LS trusts it unconditionally; authored-but-not-baked is invisible. → SLAB-CONTRACT (root), FEATURES "Architecture in one paragraph".
11. **The correctness suite — automate the operator's eye.** One RED-until-true invariant per bug-class; the detector is the deliverable; validated against the 35; the 35 lean topological. → POLYGON-FIRST §5.
12. **Inputs are authoritative, not guessed.** City parcels/ROW + operator-measured widths + OSM geometry + ML footprints, fortified against max-res aerial; no external street source helps (County rejected). → FEATURES "inputs are authoritative", INTAKE §5.1/§6.
13. **Compass frame only.** One frame; no rotation constants in the math/data layer (the 9.2° park rotation is real-world geometry). → FEATURES §Frame discipline.
14. **Grade separation handled.** gradeSeparated excluded from the face graph, stroked flat on its own layer, rendered behind local. → PIPELINE §Wall, README.
15. **Toy is the canonical pipeline test rig.** A new scene routes through the existing pipeline, never a toy-only branch. → FEATURES, AGENT-VALIDATION-SURFACES.
16. **The doc architecture.** Three kinds (Reference/State/Diary, one per doc); three registers (FEATURES user / OPERATIONS operator / dev docs); additive-never-destructive; hot/cool. → BOZ §0–3.
17. **(Mis-homed → relocate to ARCHITECTURE):** polygonOffset is inert under logarithmicDepthBuffer — resolve coplanar with renderOrder (transparent) / Y-separation (opaque). → FEATURES "Layering" (relocate).

### 2.2 Current index surfaces (so consolidation loses nothing)
- **README §START HERE:** pipeline-order line · the 2026-06-13 "fix is upstream in the skeleton" strategic note · a 10-row settled-conclusion table (Skeleton·Prebake·Survey·WALL·Corners/thorns·Divided·Grade-sep·Construction-model·Derivation-chain·Section·Doc-process), each = conclusion + home.
- **README §Documentation map:** three-kinds + three-readers explainer · per-domain table (Cartograph/LS/Arborist/Meteorologist × Reference/State/Diary) · the cartograph-tools subsection · the 8-stage authoritative-home table · cross-domain refs (SLAB-CONTRACT, AGENT-VALIDATION-SURFACES, AUDIT-MATRIX, plans/, PUBLISH) · state-layer & working-dirs · URL routes.
- **BOZ §0:** the matrix (topic × register × kind) · register→home table · the 8-stage Suite table · the feature index (9 cross-cutting constructions) · the two operations (FIND/KEEP) · the one law.

### 2.3 Register-health verdict
- **FEATURES — DRIFTED (highest-value cleanup).** Top third is a true brochure; the rest is ~220 lines of dev-internals + dated DONE the doc's own migration note says belong in ARCHITECTURE (engineer-internals) + OPERATIONS (operator-knobs). To make it the front door: lift the 2.1 headlines up front, migrate the engineer back-half out.
- **OPERATIONS — STALLED SEED.** 34 lines, mostly "to populate as T3 lands" placeholders, untouched since 2026-06-01. The operator register is effectively empty.
- **Dev docs — healthy.** SKELETON/RIBBONS/POLYGON-FIRST/SURVEY/SECTION/WALL/INTAKE/BAKE/STAGE/PREVIEW current, well-cross-referenced, honest TARGET-vs-CURRENT separation.

---
**Bottom line:** the dev-doc spine is in good shape; the rot is (a) ~13 closed HANDOFFs + ~8 closed forensics piled hot at root & cartograph/, (b) ~9 dead pointers from prior retirements, (c) the two non-dev registers — FEATURES bloated past its audience, OPERATIONS never built. (a)+(b) are mechanical accord-sweep; the **FEATURES front-door elevation (2.1 + 2.2 as the seed) is the high-leverage move.**
