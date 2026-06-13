# HANDOFF — Construct the junction PED-silhouette (the weird-junction fix)

**Agent: FRESH, but standup with Jacob first — this is a rebuild-gated SHAPE/FILL build, not a small job.** Name yourself.

**Task, one line:** At every real junction, the **asphalt** silhouette is constructed once (junctionMap / E3.2, frozen at prebake), but the **ped bands are not** — they're stroked independently per-leg in `sectionPass`, blind to the junction. So at junction-dense / name-shift streets the ped FILL **fragments** (slivers, gaps, jagged corners). **Construct the junction PED-silhouette the same way the asphalt one is — one polygon the bands derive from — so the ped junction is coherent by construction, not by luck.**

This is the **intersection-everywhere** mechanism applied to its *genuine* target. (The archived `HANDOFF-polygon-first-junction-construction.md` aimed this at "T-sidewalks don't connect" on West 18th — an unconfirmed proxy ghost; West 18th turned out to be a corner-round, not a junction. **That framing was wrong; this target is real** — the weird junctions the detector flags.)

---

## ⛔ Read this first — the gates (a full day was burned on 2026-06-13 by skipping them)

1. **Route + read the canon to the section BEFORE planning** (`CLAUDE.md` gate). Home docs: **`SECTION.md §7`** (the ped-band junction family — *this is the spec*), **`OSM2STREETS-GROUNDING.md`** (the trim-back / junction-as-data-model standard — we are not inventing; we're applying the standard), **`SKELETON.md §5e`** + the `junctionMap` construction in `tileGround.js` (how the *asphalt* junction is already built — extend that pattern, don't reinvent).
2. **Name the layer: this is SHAPE→FILL, at PREBAKE.** The junction ped-silhouette must be **constructed once and frozen** (like the asphalt junction), then `sectionPass` derives bands *from the frozen junction polygon* — NOT stroked live per-leg. Patching `sectionPass`'s per-leg strokes is the *chains-die-at-the-wall* anti-pattern (`SECTION §7` already calls this out: "the fix is a FAMILY pass, not one-street patches").
3. **The EYE is the only gate.** Proxy renders mislead on this map (banked twice on 2026-06-12). Validate on the lit app after a re-freeze, never a scratch SVG.
4. **Reuse forensics.** `scratch/w18-*.png`, `SECTION-CAP-CLAMP-FORENSIC.md` (the G12 throat/neck work), and the **`junction-band` correctness invariant** (the detector — `scratch/correctness-detector.mjs`, the Sieve→Loom→… campaign) already measure this. Run them; don't rebuild them.

---

## The target (the detector's verdict, not a guess)

The genuine weird junctions — **Carroll, Hickory St, Hickory Lane, Grattan** (the curated names that no geometric/loop/cap invariant catches). The `junction-band` invariant (built this session) is the **definition-of-done**: it flags exactly these, and the fix is finished when it goes green on them **and the eye confirms.**

`SECTION §7` names the three compounding mechanisms — fix the family, not the streets:
1. **per-edge width-STEPS** — surveyed widths jog the sidewalk at fe boundaries (the `width-step` invariant's territory; §5g fan-the-frontage applies, but many boundaries are *real* corners / name-shifts, not through-nodes → a per-edge step policy: fan vs honor).
2. **treelawn-Y/N ordering FLIPS** — a mono-width strip swap inverts curb→TL→SW vs curb→SW→TL between fes.
3. **junction band FRAGMENTATION** — the core: the asphalt junction is one constructed polygon; the ped bands are independent strokes → overlap into slivers / gaps. **Construct the junction ped-silhouette (E3 pattern, asphalt→ped) so the bands derive from it.**

Also wire the **open G12 half**: the `thinTile` signal (`tileGround.js:~2383`) is computed but **orphaned** from the `cap` clamp (it only feeds `bandJoin`) — wire `thinTile → cap` so the band-neck / partial-degeneracy case (the Albion cul-de-sac notch) clamps instead of folding.

## Build + validate

1. **Standup the plan with Jacob first** (after routing + reading `SECTION §7`). This touches the frozen prebake substrate — align before editing.
2. Construct the junction ped-silhouette at prebake (extend the `junctionMap` asphalt construction to ped); derive `sectionPass` bands from the frozen junction polygon; wire `thinTile→cap`; add the per-edge step policy.
3. **Rebuild is Jacob's explicit go + a checkpoint first** — the re-freeze / re-bake regenerates `ribbons.json` and (if baked) clobbers `public/baked/*` + `design.json` (Jacob's uncommitted authoring). Never re-bake without his word.
4. **Gate = Jacob's eye** on `5173/cartograph`: Carroll / Hickory / Grattan junctions read as one coherent ped silhouette (no slivers/gaps/jags); the clean grid junctions are unchanged.
5. **Sanity (not the gate):** the `junction-band` invariant goes green on the four; no new grid false-positives; `extractFaces` face count stable.

## ⛔ Boundaries

- **Construct + freeze; don't patch live strokes.** The junction ped-silhouette is a prebake artifact, like the asphalt one.
- **Family pass, not one-street patches** — the same construction lifts the clean junctions too; that's the point.
- **Rebuild-gated** — Jacob's go + checkpoint before any re-freeze/re-bake; commit only your own files (never his bakes).

---
*Drafted 2026-06-13. Supersedes the archived `HANDOFF-polygon-first-junction-construction.md` (wrong target). The DoD is the `junction-band` correctness invariant — the detector defines "done," the eye confirms it. — Keystone.*
