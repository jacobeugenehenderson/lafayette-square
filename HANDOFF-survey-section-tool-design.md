# Survey / Section — Tool-Design Proposal (the design spine for T3)

**Status: DRAFT for Jacob to shape.** This is the *design* layer under T3 (`HANDOFF-tile-T3-authoring.md`): not "relocate the old handles onto tiles," but **how the authoring tools are designed into the reconceived Survey/Section split.** T3 implements *this*, so we get *designed* tools, not bolted-on ones.

**Grounded in:** `RIBBONS.md §5` (the Measure operator model — click-select-fe, the handle stack, the translucency-focus, edit-row/edit-block, the ctrl-click strip flip) · the tool-split decisions (`[[project_two_bakes_two_walls]]`: Survey=hardscape shape / Section=ped-zone chop / Stage=look) · the tile construction (Survey strokes outward, Section strokes the complement inward).

---

## The organizing principle: the tool split *is* the construction split

| Tool | Authors | Construction | Frozen? |
|---|---|---|---|
| **Survey** | the hardscape **SHAPE** | the **outward** stroke: chain → asphalt + corners + caps + curb | shapes it → **freezes at the wall** |
| **Section** (was Measure) | the ped **PROFILE** | the **inward** stroke: complement → treelawn/sidewalk strips | strokes the **frozen** hardscape |
| *(LU)* | *nothing — emergent* | the flooded remainder | — |
| **Stage** | the **LOOK** | materials/colors/light over the frozen slab | — |

**The wall is the seam between Survey and Section** — and it's the architectural payoff: Survey shapes the hardscape and *freezes* it; **Section strokes a frozen edge, so ped-width drags are live and cheap** (no silhouette fight — this is the old "F1 responsiveness" win, dissolved by construction). Author footprint in Survey, profile in Section.

---

## Survey — the hardscape-shape tool

**Owns** (everything that defines the asphalt silhouette + how it terminates + rounds):

1. **Per-side asphalt width** (`pavementHW`) — *per-fe* (per block-edge), with **edit-row** to fan it along a chain. This is the **asphalt-edge handle** — dragging it sets how far the chain strokes outward. *(In §5 this handle lives in the Measure stack; it moves to Survey.)*
2. **Corner-R kit** (3-tier: global Corners slider × per-IX × per-corner; gold=authored; right-click revert) — IX-keyed (corner identity). Shapes the tile corner round. *(Today in "Blocks > Shape" — it's a Survey concern; move it here.)*
3. **Caps** (per chain-endpoint: round / blunt / none) — the dead-end termination. *(Already author-wired: `mergeLiveRibbons` mirrors `capStart/capEnd → capEnds` → the tile reads it.)*
4. **Curb** — **global** width (Jacob), but an **editable** width control, and it carries its **own shader/material** (distinct from asphalt + sidewalk). The asphalt-silhouette stroke.
5. **Smoothing** — **automatic** (the system detects what to smooth; no per-street slider). **Authoring affordance (Jacob):** when an area is *selected*, render it **un-smoothed (raw/faceted)** so the operator sees the authored vertices and knows smoothing is applied; it **returns to smooth on `enter`** (commit/deselect). **⭐ Curve fineness:** the operator *sees* the curves up close (street view), so **jack up tessellation fineness on ALL curves — smoothed centerlines AND corner arcs — so they read as true béziers, to the extent the vert budget affords.** (= ledger P3; curves are a small vert fraction + high value → fine curves, trim flat-LU bulk.)

**Interaction:** select a street (click its centerline — §5 grammar) → drag the **asphalt-edge handle** per side → shape corners via the kit at IXs → set caps at dead-ends. Survey is where you make "very nice clean data draw the street map attractively the first time."

**Maps to:** the outward stroke — `pavementHW` = the grout→curb depth on each tile edge; corner-R = the tile corner round; caps = the dead-end cap; curb = the silhouette stroke.

---

## Section (was Measure) — the ped-profile tool

**Owns** (the ped cross-section, per-fe, against the *frozen* hardscape):

1. **Treelawn + sidewalk widths** — *per-fe*, via the **ped handles** (`treelawnOuter`, `propertyLine`). The inward band depths.
2. **Strip materials** — the **LU↔SW swap** (ctrl-click in a strip; `materials:{outer,inner}` per fe — M3 made the data overridable, T3 plugs in the gesture).
3. *(LU is **not** authored — it's the flooded remainder. Full-flood, no internal ring.)*

**Interaction (§5, preserved):** click a centerline → select → clickdown projects to `(segOrd, side)` → resolves to the live `(blockKey, edgeOrd)` fe → drag the **ped handles** perpendicular to set widths; **ctrl-click** a strip to flip its material; **edit-row vs edit-block** scope. Strokes the frozen hardscape → live.

**Maps to:** the inward stroke — the ped strips offset from the frozen asphalt edge; corner ped = the structural all-SW ADA pad (not operator-overridable).

---

## Shared interaction grammar (both tools)

These are the *same* in Survey and Section — only the targets differ:
- **Click-to-select** (centerline → fe), per-fe identity (W1 `feCustomKey`).
- **Translucency-focus** — selected chain/fe + its block translucent (~0.55), context **opaque**. ⚠️ **This is by design (RIBBONS §5) — NOT a bug to "fix" toward all-translucent (misdiagnosed before).** Rebuilt against tiles in T3.
- **Edit-entire-row vs edit-block** modes (fan-per-fe vs anchored-fe).
- **Symmetric mirror** toggle (transient UI; applies to per-side widths in both tools).
- **Anti-overlap handle stagger.**

---

## Key design departures from today (what T3 actually changes)

1. **The 3-handle stack SPLITS across two tools.** Today all three (`pavementHW` / `treelawnOuter` / `propertyLine`) live in Measure. Now: **asphalt-edge → Survey; ped handles → Section.** Each tool shows **ONLY its own** handles (Jacob — *not* the other tool's boundaries as context). The map geometry still renders; only the tool's own handles are editable.
2. **Corner kit + caps + curb → Survey** (they shape the hardscape).
3. **Smoothing is automatic** (no per-street slider).
4. **LU is emergent, not authored** (Section authors ped widths/materials; LU floods to the remainder).
5. **Translucency model preserved** (don't redesign it; rebuild it on tiles per §5).

---

## Resolved (Jacob, 2026-06-01)

1. **Handle visibility:** each tool shows **ONLY its own** handles — *not* the other tool's as context.
2. **Smoothing:** **auto**; selected area renders **un-smoothed (raw)** so the operator sees it's being smoothed, **returns to smooth on `enter`**; **jack up curve fineness on ALL curves (béziers) to the extent affordable** — the operator sees them close-up in street view (= P3).
3. **§5 Measure model:** **carry as-is** — *"when Measure is working it's a pretty elegant tool"* (Jacob). T3 migrates it onto tiles; it does **not** redesign it.
4. **Curb:** **global** width, but **editable**, with its **own shader/material**.
5. **Rename:** rides separately (stale-label rule); this designs the tools conceptually, not the code labels.

---

## How this feeds T3

T3's rows get a design home: **A1** handles → split Survey(asphalt-edge)/Section(ped); **A2** corner kit → Survey; **A4** caps → Survey; **M3-gesture** strip-swap → Section; **A9** translucency → shared, per §5. T3 implements *these designed tools* — Survey shapes, Section profiles, the grammar shared — not relocated handles. That's the difference between "authoring works" and "authoring is *designed*."

*Provenance: Boz, 2026-06-01, from Jacob's "work the tools into the actual design of the Survey section." A draft for Jacob to shape; the design spine for `HANDOFF-tile-T3-authoring.md`.*
