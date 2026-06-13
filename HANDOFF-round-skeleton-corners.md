# HANDOFF — Round the skeleton's existing centerline corners

**Agent: FRESH.** Small, self-contained skeleton-geometry job. **Name yourself.**

**Task, one line:** In **`skeleton.js`** (after the RDP step, frozen into `skeleton.json`), **round the centerline corner vertices that are already there** — replace each sharp bend with a small tangent arc (a polyline fillet) — **keeping the path exactly**, so the curb polygon (a parallel offset of the centerline) follows with smooth rounded corners.

This **supersedes** `HANDOFF-polygon-first-junction-construction.md` (archived 2026-06-13). That brief aimed at "intersection-everywhere junction construction" — the **wrong task**. What Jacob actually wants is far simpler, in his words: *"the centerline is correct, only the corners need to be smoothed"* → *"smooth the centerline"* → *"just make the corners that were already there rounded."*

---

## ⛔ Read this first — the lessons from the day this thrashed (2026-06-13)

The work is small. The failure mode is not. A full session was burned by **not doing the simple thing**. Internalize these or repeat them:

1. **Round the EXISTING corners. Do NOT resample/refit the curve.** Refitting a jagged arc to "4 clean points" (circle-fit + resample) *moves the path* (~2.8 m off the real street) and shifts corners across **52 tiles** — Jacob: **"No."** He does not want a new curve; he wants the corner he drew, rounded.
2. **Reach all the way back to the SKELETON.** The centerline is born in `skeleton.js` (RDP, §3 step 8) and **frozen**. Editing the polygon/curb in `tileGround.js` (the render) is the *chains-die-at-the-wall* anti-pattern — Jacob's exact tell: **"the fact that you keep editing the polygon tells me you aren't reaching back all the way to the skeleton."** The fix is upstream, frozen, never re-derived at render.
3. **Render-time smoothing is a dead end** (`streetSmooth>0`): it re-extracts every face from the smoothed chains live → garbled blocks ("totally disrupted"). Tried + reverted. Don't.
4. **Ground in `SKELETON.md` BEFORE touching code** (Jacob had to order it). Note the RDP doctrine comment (`skeleton.js:767`): RDP keeps a curve's minimal control points and *intends* "one smoothing pass" to regenerate it — but that pass was meant as **rounding the corners**, not resampling to new points.
5. **The EYE is the only gate.** Proxy SVG renders misled repeatedly — Jacob: *"this is a terrible, non-representative thing."* Validate on the lit app (5173 / a re-freeze), never a scratch SVG.

---

## The method (concrete)

A standard polyline corner-round, in `skeleton.js`, after the RDP loop (`~:1473`), before the canonical-direction pass:

- For each street, for each **interior vertex** whose turn exceeds a threshold (start ~15–20°; it's tunable on Jacob's eye), **replace that one vertex with a short circular arc tangent to both legs** — radius bounded by ~⅓ of the shorter adjacent segment (so short legs don't over-round and adjacent corners don't collide), capped at a small max (a few metres).
- **Pin real junctions** (degree ≥ 3) and **chain endpoints** — never round *through* a cross-street; round only the mid-chain bends that are the street's own corners.
- The path between corners is **untouched** (straights stay straight; the grid stays pristine).
- Freeze into `skeleton.json`, then re-run the pipeline so `ribbons.json` carries the rounded frame; the curb offset follows by construction.

**Tuning is expected** — radius + turn-threshold are knobs Jacob will set by eye on the lit app. Start conservative.

## Build + validate

1. Implement the corner-round in `skeleton.js`; **`node cartograph/skeleton.js`** → re-freezes `skeleton.json`.
2. **`node cartograph/pipeline.js && node cartograph/promote-ribbons.js`** → re-freezes `ribbons.json` (the live Survey frame). *(These regenerate derived artifacts only — `skeleton.json` / `map.json` / `ribbons.json`. They do NOT touch `design.json` or `public/baked/*`. Still: checkpoint first.)*
3. **Gate = Jacob's eye** on `5173/cartograph`: West 18th (the canonical case — `South 18th ↔ West 18th ↔ Dolman`, world ≈ `(516…609, −414…−391)`) reads as a clean rounded bend; the grid is unchanged; no garble.
4. Sanity (not the gate): `extractFaces` face count stable; no new `iA` self-intersections (a `buildTileGround` harness over `ribbons.json`).

## ⛔ Boundaries

- **Round, don't resample.** Keep the path; round the corners only.
- **Skeleton layer only.** No `tileGround`/render smoothing.
- **The rebuild regenerates the frame, not the bakes** — Jacob's go + a checkpoint before re-freezing.
- **Corner-guard note:** deliberate corner-rounding *will* change those corners (not byte-identical) — expected. Keep it surgical so only real corners move, and verify the hard-won FILL corners (`SECTION §6`) still read clean on the eye.

---
*Drafted 2026-06-13 after a thrash that the per-touch doc gate is meant to prevent. The old polygon-first brief is in `cartograph/_archive/handoffs/` (dated). — Keystone.*
