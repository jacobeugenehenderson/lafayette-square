# FINDINGS — South 18th "loop" skeleton brief (Spline)

**Verdict: STOP — the brief is overtaken by events. No skeleton change is warranted.**
This is the §2 / §50 gate firing: *"If the forensic shows 18th is NOT a clean 'U-loop with
block interior' but something else, STOP and flag Boz — the fix changes."* It is "something
else," in the most favorable way: **the South 18th horseshoe already renders as coherent
normal streets enclosing regular blocks, with curbs present, in the current committed state.**
The prescribed fix (detect the loop, tag `interior:'block'`) would be a **pure no-op on the
render** — there is no defect for it to fix.

Branch `spline-18th-loop` off `curb-offset-draw` (worktree). **Zero code changes made.**
Forensic scripts + renders under `scratch/spline-*`.

---

## What the brief assumed vs. what the data shows

The brief's premise (HANDOFF §0/§1/§5): *the curb is absent along 18th's body — a
perpendicular ray from the centerline travels 100–217 m before hitting any curb — because the
chains never resolve into a face-bounding ring; the authoring handles float; the corners are
dysfunctional.* Root hypothesized: **18th is a mis-shapen tangle the skeleton never resolves
into the U/horseshoe LOOP it is**, so no face/tile forms and no curb is drawn.

**That premise was true for a transient broken state that was fixed on 2026-06-11, the same
day the brief was written — by two commits that both LANDED, neither of which is the
loop-detection this brief proposes:**

1. **The dead-end pendant-prune (`28f8856`) was REVERTED (`dd4ddb6`).** Asphalt/curb is
   tile-sourced; the active prune deleted every dead-end's footprint → *"the curb is absent
   along the body."* The 18th legs are dead-ends (see below), so they were the worst-hit. The
   revert restored woven dead-ends. **`src/data/ribbons.json` is committed at `dd4ddb6`** — so
   the canonical artifact already has the legs woven with curbs.
2. **`rayHitCurb` got its distance cap (`MeasureOverlay.jsx:184`, `maxT = pavHW + cw +
   RAY_CURB_MARGIN`, applied at `:395`).** That is the exact source of the "100–217 m float"
   (the function's own comment names "S 18th / Dolman / Carroll" and cites `handle-diag.mjs`),
   and the defensive cap is **already present in committed code** → the handle now falls back
   to the centerline ruler instead of latching a far curb. This is Boz's §5 fix, already in.

So **both roots the brief names are already addressed.** The "loop never built" root does not
exist: faces *do* form along the legs (they're crossed by Carroll/Park/Hickory/Rutger and the
grid), and the curb *does* exist.

---

## §2 forensic answers (the mandatory four)

**§2.1 — What is South 18th, on the ground?**
A large **U/horseshoe dead-end**, ~640 m legs, a **constant ~104–106 m gap** between them
(this constant gap is exactly why the *old* geometric detector mis-paired them as a divided
corridor). Composition (verified against `skeleton.json` + raw OSM):

| role | chain | class | endpoints | note |
|---|---|---|---|---|
| **west leg** | `south-18th-street-3` | residential | (516,−414)→(374,229) | `continuesAs west-18th-street`; **top is a true dead-end (deg 1)** |
| **bottom arc (U-close)** | `west-18th-street` | residential | (516,−414)→(609,−391) | both ends deg 2 (joins the legs) |
| **east leg** | `dolman-street-1` | residential | (609,−391)→(475,243) | `continuesAs west-18th-street`; **top is a true dead-end (deg 1)** |
| ramps (separate) | `south-18th-street-1`,`-7` | motorway_link | far north | NOT folded in |
| service (separate) | `south-18th-street-4` | service | far north | NOT folded in |
| arterial (separate) | `south-18th-street-2`,`-5`,`-6` | secondary | z≈−450..−796 | `-5`/`-6` are a legit divided pair, far south, untouched |
| unrelated | `south-18th-street-0` | residential | (259,583) | `continuesAs geyer-avenue-6`, far north — not the U |

The ramps/service/arterial are **already separate chains** with their own (correct) classes —
nothing folds them into the residential horseshoe.

**§2.2 — Where does the loop close, across which name-shifts?**
The horseshoe closes **only at the south** (the `west-18th-street` arc); the **north end is
OPEN — both legs dead-end** at (373.5,228.7) and (475.4,242.8) (confirmed deg-1 in the graph
AND in raw OSM: nothing within 12 m of either tip). Name-shifts present and correctly stamped:
`South 18th → West 18th @(516,−414)` and `Dolman → West 18th @(609,−391)`. `continuesAs` and
`nameTransitions[]` already record both. So the "multi-chain across names" trace the brief
wanted **already exists in the frame** — but it isn't needed for any face: the interior is
enclosed by the ordinary grid, not by the legs joining at the top.

**§2.3 — Why is the curb absent along the body?**
**It isn't, in the committed state.** Ray-cast from each leg centerline to the nearest
`buildTileGround` curb ring (`scratch/spline-raycast.mjs`) hits at **~3.2–5.5 m on both
sides** the entire length (matching the surveyed asymmetric half-widths). The only large gap
is one segment at the **Park × Dolman degree-5 junction** (z≈−52, ~42–56 m) — that is the
§5b/§5e junction-construction class, explicitly **out of scope** (§4), and already largely
resolved (`9c275ce`). Point-classification (`scratch/spline-pt.mjs`) finds **no void** on the
feature: the lower/mid interior is asphalt+blocks, and even the **upper open corridor between
the two dead-ending legs is covered by a `residential` block face** (the dead-ends render as
woven spurs inside the larger grid block). The 100–217 m figure was the pruned/uncapped state.

**§2.4 — Anything still mis-paired as divided here?**
**No.** All three legs are `phase: single/spine`, `anchor:center`, `innerSign:0`,
`pairId:none`. No false median is emitted on them. The only green median in the area is
**Truman Parkway** (`pairKey 151115548-…`, a real, separate N-S divided road east of the
horseshoe) — legitimate, and **must not regress**. The divided-detection is robustly safe
here even against future loosening: the legs share no endpoint and their rejoin bridge
(`west-18th`, ~93 m) exceeds `REJOIN_BRIDGE_MAX = 35 m`, so `pairRejoins` can never pair them.

---

## The "interior:'block'" tag would do nothing

`derive.js`'s loop-median emitter (`:3269`) only fires on a **single self-closing chain**
(endpoints within `LOOP_SNAP = 2 m` — Benton/Park Place/Saint Vincent). The 18th horseshoe is
**multi-chain and open at the top**, so it never triggers the emitter — **no median is emitted
on it today.** Setting `overlay.loops[<leg>].interior = 'block'` only *suppresses* that
emitter, which already doesn't fire. The interior is already regular blocks. ⇒ the tag is a
no-op. The legs already render as "normal streets, sidewalks on BOTH sides" — the exact §2
target.

## The widths are correct (not a residue)

The asymmetric half-widths (`south-18th-3` 3.25/5.49, `dolman-1` 3.76/5.49) are **surveyed
data**, not the old "weird width all the way down": `survey.json` records Dolman `sidewalkLeft
7.29 / Right 4.67` ("32.85 ft curb-to-curb via Google Maps") and South 18th `sidewalkLeft 4.16
/ Right 7.x`; `seed.widthSource:"survey"`. The kit (custom > OSM > AASHTO) applied them
correctly. The real streets are asymmetric.

---

## Render evidence (current committed state, `scratch/spline-*`)

- **`spline-zoom-uclose.png`** — the south U-close arc: clean asphalt, treelawn + sidewalk
  both sides, properly rounded corners where West 18th meets both legs, a woven cul-de-sac
  stub. A coherent loop road.
- **`spline-zoom-carroll.png`** — Carroll crossing both legs: clean blocks, proper corners,
  the surveyed width asymmetry rendering correctly. Normal grid.
- **`spline-zoom-deadtops.png`** — both leg tops as clean **round woven cul-de-sacs** (the
  authored `capEnd:'round'`).
- **`spline-void-full.png`** — whole feature with **void painted magenta**: no magenta shows
  on the horseshoe (no missing tile anywhere); the green strip is Truman Parkway's real median.

---

## Recommendation

1. **Make no skeleton change.** Building the loop detector here is speculative — it fixes
   nothing visible and risks regressing the (now-correct) render. The brief's own §2 gate says
   to stop in exactly this situation.
2. **Mark `HANDOFF-18th-loop-skeleton.md` as OBE / superseded** by `dd4ddb6` (prune revert) +
   the `rayHitCurb` cap. Note in `LOOP-STREETS.md §0` that 18th is **not a constructed loop**:
   it's a normal horseshoe of grid streets whose interior is ordinary blocks; the only "loop"
   risk (divided mis-pairing) is permanently closed by the data-first gates + the 93 m > 35 m
   rejoin bridge. (Canon edits are Boz's per §6 — flagging, not doing.)
3. **If Jacob still sees a defect at 18th/Dolman/Carroll/Kennett**, it is one of two
   *out-of-scope* classes, not a loop: (a) the **handle still drifting** at a junction gap →
   tune Boz's `rayHitCurb` cap / fallback (overlay, §5); (b) a **junction-construction**
   kink/notch like the one visible below the dead-end tops → §5e/§5g construction layer,
   `tileGround` — explicitly fenced off from this brief (§4). Get a fresh screenshot of the
   specific defect before any build.

## Invariants (trivially intact — no change was made)

Real divided roads (Truman/Park/Lafayette/…), Benton/Waverly loops, the endpoint-weld, the
ramps/service near 18th — all untouched, because **no file was modified**.

## Rebuild sequence

**None run** — there is no change to rebuild, and re-running the pipeline would only reproduce
the committed `dd4ddb6` artifacts (skeleton.js + derive.js are unchanged since), while risking
a race on the ground artifacts other live sessions hold (§6). The committed `ribbons.json`
already embodies the current pipeline output; all renders above are `buildTileGround` over it +
the current `tileGround.js`, i.e. exactly what the lit app shows.
