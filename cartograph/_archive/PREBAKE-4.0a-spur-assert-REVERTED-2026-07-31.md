# ARCHIVED — PREBAKE §4.0a: assert the spur before polygonization (REVERTED)

> **Archived 2026-07-31**, moved out of `PREBAKE.md` rather than left as a correction stacked on
> top of the text it corrects (`CLAUDE.md` "Keep it trimmed", `BOZ.md §3`).
>
> **Disposition: BUILT, EYE SAID WORSE ON BOTH SCENES, REVERTED (`7b5b87a3`).** `SPUR_OUTLINE` does
> not exist in the code. The construction is in history at `152e7734`; the probes, debug dumps and
> crop set are kept (crops on branch `polygon-asks-stamp`).
>
> ⭐ **The transferable lesson, and the reason this is worth keeping:** every gate was GREEN — slits
> 50→9, blocks 101→101, junction band 101→110 clean, Check A unchanged — and the result was worse on
> the operator eye. **These probes do not predict the eye.** Anyone re-opening the dead-end class
> must not re-derive that table and read it as success.
>
> Live doctrine for dead ends → `cartograph/POLYGON-FIRST.md §2.1` (Checks 1–5).

---

> ### ⭐⭐ 4.0a — ASSERT THE SPUR *BEFORE* POLYGONIZATION (2026-07-31) — ⛔ TRIED, EYE SAID WORSE, REVERTED
>
> ⛔⛔ **STATUS 2026-07-31, read before anything below: this was built, the eye was run, and it
> was REVERTED (`7b5b87a3`). `SPUR_OUTLINE` does not exist in the code — it is gone from trunk.**
> Everything below describes the construction as it was; keep it as the design record, not as
> a live flag you can turn on.
>
> **The verdict, in Jacob's terms:** *"Every gate I had said better or neutral. All of that was
> true and none of it was the point. The gate is the eye and the eye says no."* Every number in
> the MEASURED table further down was accurate **and the result was still worse on both scenes.**
> ⭐ That is the lesson worth more than the construction: **these probes do not predict the eye.**
> A future pass at this class must not re-run this table and conclude it is winning.
>
> ⭐ **And the arc surfaced a defect bigger than the one it was fixing:** the committed
> `ribbons.json` did **not** reproduce from a fresh `pipeline.js` run — **233 vs 228 junction
> nodes, asphalt 75 vs 71 rings.** That file *was* the map; re-deriving it produced a materially
> different and worse one. **The pipeline is not reproducible against its own committed output.**
> For a kit that is first-order: town #2 has no known-good artifact to notice the divergence
> against — the pour is simply whatever it is that day. ⛔ **Do not re-promote over a committed
> artifact without the operator's eye on the difference first.**
>
> The diagnosis kept: the probes, `CORNER_DUMP` / `JUNC_DUMP` / `LITMUS_ALL`, and the crop set
> (committed to `polygon-asks-stamp` during the 2026-07-31 cleanup). The construction itself
> stays in history at **`152e7734`** if it is wanted again.
>
> **In plain words:** blocks are traced by following street centre-lines. At a dead end the
> trace ran out to the tip and straight back along the same line, so the block came back with
> a zero-width crack instead of a street-shaped notch. The fix is not to cut width into that
> crack afterwards — it is to **lay the dead-end street down as a two-sided shape first**, and
> only then trace the blocks. ⭐ **The sequence is the fix** (Jacob): *"the slit needs to be
> asserted BEFORE the polygonization."* Built in **`cartograph/spurOutline.js`**, called from
> `derive.js` immediately before `extractFaces`. Same mechanism the map boundary already uses.
>
> **What is emitted is an OPEN U — two curbs + an END COUPLER — not a closed ring.** The U's
> free ends land on the through street's centreline, road-width apart, and the FACE WALK closes
> the notch (its fourth side is the through-centreline between the landings). ⚠️ Closure is a
> property of the graph, not of the stroke — when a landing fails to splice, nothing closes the
> U, it floats inside the block, and because asserting a spur also TRIMS ITS CENTRELINE AWAY
> that street loses its road outright. That is the 2026-06 pendant-prune failure exactly
> (`dd4ddb6d`); it hit `south-jefferson-avenue-0`/`-8`. Hence the detect-and-roll-back pass:
> never trust the closure, verify it after the walk.
>
> ⭐ **The second mouth corner is CREATED, not detected** (`POLYGON-FIRST §2.1` Check 5): the
> two curbs land at two distinct points, so each leg is bounded corner→coupler like any other.
> Identity rides the strokes (`spurSide`/`spurCap`/`spurOf`/`atCurb`), never recovered from ring
> geometry afterwards.
>
> **MEASURED (`SPUR_OUTLINE=1`, LS, 2026-07-31)** — ⛔ **every row below is TRUE and the eye still
> said WORSE.** Kept as the record of what these probes can and cannot tell you. The flag is gone:
>
> | | flag OFF | flag ON | probe |
> |---|---|---|---|
> | rings with a repeated vertex (Check 1) | 50 | **9** | `coupler-slit-universal.mjs` |
> | `tiles[].caps` (the slit registry) | 50 | **9** | inline |
> | BLOCK faces | 101 | **101** | inline |
> | road notch faces | 0 | **41** | inline |
> | spurs at full road width | 43 / 52 | **45 / 52** | `spur-asphalt-truth.mjs` |
> | junction band CLEAN | 101 | **110** | `correctness-detector.mjs` |
> | tips asserted | — | **43 of 52**, 2 rolled back | `[S]` log line |
>
> ⭐ **Block topology does not move (101 → 101)** — what separates this from whole-map punch-out,
> measured to re-topologise **25 of 101** faces (`ea3ab870`).
>
> **The FILL half.** An edge asserted at the curb carries **`atCurb`** through
> `tilesFromFrozen` → `groupRuns` → the run, and the block's asphalt inset is **zero** there
> (both the per-run stroke and `baseDepth`, which feeds `iA`; `asphalt = tile.ring − iA`). The
> notch IS the road; nothing paints it twice.
>
> **The junction band.** Net better (101 → 110 clean). The cause was a **datum change read as a
> street corner**: at a landing one edge is a curb line and the other a centreline, so
> `cornerAt`'s `a !== b` bid a fillet and shattered the ped band. Cured by suppressing the corner
> across that seam and zeroing `vertR` there. 2 junctions still lose CLEAN (`Truman×Lafayette`,
> one 4.7 m² fragment at exactly the 14 m throat radius; `Rutger`, one sub-threshold sliver).
>
> ### ⛔ OPEN — what is owed before this ships
> 1. **Jacob's eye in Survey — NEVER RUN.** The only remaining gate. Dolman · South 18th ·
>    Simpson · Nicholson: click a dead-end leg → that leg, whole, reacts; no partner flip, no
>    neighbouring corner or cap moving. Needs `scratch/rebake-shape.mjs` first.
> 2. **The END COUPLER is not doctrine-conformant.** `SECTION §6.3`: the cap is an end coupler
>    whose shoulders are lane-switch corners, the bulb is ONE semicircle, and **width is
>    germane** — a spur may be authored asymmetric (Nicholson left 2.50 m / right 6.70 m), so
>    *"any dead-end detector keyed on both shoulders at the same radius is wrong by
>    construction."* `spurOutline.endCoupler` **averages the two radii** and does **not taper
>    depth across the shoulders**. Both owed.
> 3. **9 tips not asserted** — one class: a mouth with geometry on only one side (an L-corner, or
>    a T whose cross street ends at the mouth), so one curb has nothing to land on. Plus
>    `south-18th-street-4` ×2, a disconnected stub touching nothing.
> 4. **Retire what this makes redundant** — `walkOrd`, the mouth disc, the synthetic cap fe
>    (acceptance §5). After the eye passes, not before.
>
> **Flag off ⇒ byte-identical** in `plain` and `design`; no detector invariant moves.
>
> **Bugs found building it — the expensive knowledge.** The landing search returned a *copy* of
> the segment, so the splice never matched and every curb dangled (reproducing the 2026-06 prune
> exactly) · the mouth test required degree ≥ 3 and walked past spurs ending in an L-corner · the
> landing ray aimed at the tip end instead of the mouth end · the inversion guard used an outward
> tangent instead of the **point-order** tangent, rejecting 25 sound spurs · `atCurb` was written
> as a *running* flag and latched, so two spurs never even asserted lost their asphalt · the
> road-tile early-return skipped `shapeTiles.push`, breaking the documented `shapeTiles[i] ≡
> tiles[i]` alignment.
>
> ⚠️ **`spur-asphalt-truth.mjs` must NOT read `tiles[].caps`** to find tips. A cap exists only
> where the freeze *failed* to close, so once spurs are asserted the caps vanish and a
> caps-driven probe stops measuring the spurs the fix repaired — it dropped 50 rows to 7 and read
> as a pass. It takes tips from `junctionMap`'s pendant-tip stamps instead.

Two independent topologies pass through prebake, and the one that matters isn't frozen:

- **`streets[]` come from the skeleton; `faces[]` come from raw OSM.** That's the **two-source seam** — the skeleton was bolted on *beside* the original raw-OSM face derivation, not *in front of* it. The faces carry raw OSM's node topology (un-simplified, un-consolidated), so they don't agree with the chains.
- **The block SHAPE is re-derived in Survey, not frozen here.** `tileGround.extractFaces` (`tileGround.js:303`, called `:779`) walks the **skeleton chains'** shared-vertex graph to build the tiles/blocks **on every render and bake**. `ribbons.faces` (the raw-OSM polygons) is consumed only for LU color (`:808`). So the real polygon is born downstream, per-build — with two costs: (1) the **false corner** is manufactured every build (`SURVEY.md §6`: the carriageway stub is a vertex in that per-build graph); (2) **every edit re-derives the whole map**, the perf sink behind the sticky Designer tools (`SURVEY.md §4.1`).

