# Consolidated eyeball checklist — run AFTER the dead-end integrated bake

**When:** the dead-end agent lands + produces the **integrated D1+D5 bake** (D1 already in its base, so its bake carries D1 weld + grade-sep + station-overlap + dead-end prune all at once). Walk the LS map **once** against this list; each ✅/❌ flips a ledger row (`HANDOFF-tile-feature-ledger.md`) or closes an arc. Built by Boz 2026-06-04 (prep while dead-end cooks).

**Why batched:** the ledger says several rows are "awaiting one consolidated LS eyeball"; D1 + dead-end both reshape the faces the FILL strokes off, so eyeballing *before* the integrated bake would judge stale geometry. One pass on the fresh bake settles all of it.

> ⚠️ **Bake hygiene:** confirm you're viewing the integrated bake — `--look=lafayette-square` (a bare `bake-ground.js` writes a phantom `baked/default/` nothing reads, `feedback_bake_ground_scene_clobbers_default_look`). The thorns confusion this morning was NOT stale-bake (the bake had the guard), but always confirm the look.

---

## A. Divided-road arc — closes the D1/station-overlap HANDOFFs

| # | Look at | Expect | Flips |
|---|---|---|---|
| A1 | **Truman Pkwy** (the parkway corridor) | each carriageway is ONE continuous ribbon (was 8 shattered chains → 2); a **continuous median** strip between them, not the old 71×303-strip + 15m island + gaps | closes D1 (`5348fbc`); retire `HANDOFF-divided-carriageway-weld` → NOTES |
| A2 | **Truman #5/#6 zone** (the old skewed wedge) | NO skewed diagonal "median" wedge; those offset stubs render as plain one-ways | closes station-overlap (`8392b3e`); retire `HANDOFF-divided-pair-station-overlap` |
| A3 | **all 11 divided corridors** (Lafayette, Park Ave, S Jefferson, Officer David Haynes, Papin, …) | each still shows **2 carriageways**, none fused laterally, none collapsed to 1 | no-regression gate; if any < 2 or fused → flag |
| A4 | **the median itself** (Truman) | ⚠️ EXPECT IMPERFECT — median *coverage* improved but per-tile LU/material **tagging** is downstream (D3/D8). Note how far off it reads — informs the D3/D8 dispatch | informs, doesn't gate |

## B. Dead-end arc — the dead-end agent's own acceptance gate

| # | Look at | Expect | Flips |
|---|---|---|---|
| B1 | **Mackay (and every round cul-de-sac)** | survives unchanged — round asphalt cap + treelawn ped wrap, NOT pruned | dead-end no-regression |
| B2 | **the spike-into-block exemplars** (the slack-triangle offenders from your Photoshop images) | block snaps to a **clean rectangle**; the dead-end renders as a **thin asphalt stub** with its proper cap; **triangles gone** | dead-end definition-of-done (b) |
| B3 | **blunt/none stubs** | LU abuts the flat asphalt end, no ped wrap | G8 blunt half |
| B4 | **~195 existing dead-ends broadly** | no regression — most already render fine | dead-end no-regression |

## C. Tile rows awaiting the consolidated eyeball (from the ledger)

| # | Look at | Expect | Flips |
|---|---|---|---|
| C1 | **G9 — exterior/perimeter roads** | outer street-arms now reach their ends with asphalt (no stop-short) | ledger G9 → ✅ |
| C2 | **G8 — dead-end cap typology** | round vs flat per authored `capEnds` (overlaps B1/B3 — same look) | ledger G8 → ✅ |
| C3 | **A2 — Corners slider** | ⚠️ likely STILL not live (authoring-on-figure-ground, T3) — confirm whether dragging global Corners reshapes tile corners or no-ops | ledger A2 (probably stays 🔜T3) |
| C4 | **G5 pad / point-ramp** | the solid all-SW corner pad (the ❤️ moment) still holds on the fresh faces — corner does NOT come to a point | ledger G5 pad stays ✅ |

## D. Known-RED — confirm still broken, scope the fix (do NOT expect green)

| # | Look at | Expect (RED) | Next |
|---|---|---|---|
| D1 | **G12 thorns — Benton place + thin loops/slivers/medians everywhere** | thorns STILL present (the guard only catches full-collapse, not partial-degeneracy — see ledger G12). The fresh bake won't fix it; the **code** must. | dispatch the G12-completion fix (post-dead-end, `tileGround.js` guard → engage on partial-degeneracy without over-clamping in-spec tiles) |
| D2 | **G5 ADA tangents** — the tA/tB treelawn→all-SW transition at IX corners | re-check on the fresh faces; may shift. If the glitch persists → real construction residual | dispatch G5-tangents (diagnose-before-fix, §7 history lesson; same file → after G12 or batched with it) |

## E. Grade-sep (already A/B'd, pending live eye — BACKLOG)

| # | Look at | Expect | Flips |
|---|---|---|---|
| E1 | **I-44 / Ozark Expwy corridor + ramps** | highway + ramps render as flat asphalt **behind** the local network; NO interchange triangles/slivers/false-blocks; ordinary blocks/junctions unaffected | BACKLOG grade-sep "pending Jacob's eye" → done |

---

**After the walk:** tell Boz the ✅/❌ per row. Boz then: flips the ledger, retires the divided-road HANDOFFs → NOTES (on A1/A2 ✅), and sequences the two post-dead-end `tileGround.js` fixes (G12-completion + G5-tangents) as one same-file dispatch so they share a re-bake. *(This checklist is scratch — throwaway after the walk.)*
