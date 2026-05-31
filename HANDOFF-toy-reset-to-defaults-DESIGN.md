# BRIEF: Toy "reset to defaults" — pipeline-pure, two-button

## §0. Getting started — read this first

**You ARE the dispatched agent.** Not a helper, not a planner — the person who builds this.
Name yourself (one word, a surveyor/drafting term fits the trail). Taken, off-limits: Coping,
Verge, Holm, Quoin, Datum, Détente, Vernier, Ballast, Azimuth, Alidade, **Trammel** (that's me, the
agent who drafted this — retiring). Sign your commits and your handoff with your name.

**What you're inheriting.** Jacob wants the toy scene to "reset to defaults." The work that's
*already shipped* this arc: a per-block-customs reset button (`cf24cb7`) and a clean
`blockCustoms:{}` toy baseline (`52d7f9e`). What's left — and what this brief is — is the bigger
ask Jacob then sharpened: **the reset must mimic the real-neighborhood production process**
(skeleton → data wall → polygonization), not hand-stamp numbers into a file. That reframe is the
soul of this task; if you find yourself writing literal measure values into `overlay.json`, stop —
you've left the pipeline (I made exactly that mistake before catching it).

**The one idea to hold.** "Generic" is not a magic number — it is `defaultMeasure(chain.type)`,
*computed* from the survey. Reset = remove the operator's override so the pipeline default
re-applies. The toy is the construction test surface
([[feedback_toy_is_the_construction_spike_surface]]); the *value is in making the edits*, and the
generic baseline is just the deliberately-boring "home" to return to. Everything in §1–§4 follows
from this.

**How to work this brief.** Read §1 (pipeline) and §2 (locked decisions) before touching anything —
the two decisions are settled with Jacob, don't re-litigate them. §3 is the design; §4 is the
plumbing reality that makes this a real arc (the overlay layer is backend-owned — a store mutation
alone will desync disk from render). Verify my line-number references against the live code before
relying on them; the code drifts, and my shell was unreliable so I read rather than ran.

**Commit boundaries.** Yours to write: `src/cartograph/Panel.jsx`,
`src/cartograph/stores/useCartographStore.js`, whatever overlay-reset write path you add
(`api.js` / `serve.js`), and the rebaked `public/baked/toy/*` + reset `cartograph/data/toy/clean/overlay.json`.
**Do NOT touch** `defaultMeasure`/`TYPE_PAVEMENT_HW` in `streetProfiles.js` (LS blast radius — it
changes every real residential street), the V1 keystone emitter in `buildBlockGeometryV2.js`, or
the other agents' untracked `HANDOFF-*.md` files in the tree (asphalt-as-ribbon, dead-end-typology,
ls-migration, toy-to-stage-bake — not yours, leave them).

**Surface, don't expand.** This is scoped additive (§4): store actions + one overlay-write path + 2
buttons + the flush-before-bake ordering. If it balloons past ~120 LOC, or if delete-and-rederive
turns out non-idempotent on skeleton, or if the two locked decisions stop fitting reality — **stop
and surface to Jacob via Boz.** An honest stop beats a silent redesign.

**The guardrail is mandatory, not optional.** §"Guardrail" — gate on the REAL current toy (with
Jacob's asymmetric edits present), not a synthetic case. A reset that looks right on a contrived
input but no-ops or diverges on the actual data is not the fix. I learned this the hard way earlier
this arc ([[feedback_render_guard_against_real_data_not_synthetic]]). Also: verify your edits
actually applied before trusting test output ([[feedback_verify_edits_applied_before_trusting_output]]) —
my session had a flaky shell that returned stale/phantom results more than once.

**Required reading (in order):** this §0 → §1–§4 below → `cartograph/RIBBONS.md` §1 (the data-wall
doctrine, load-bearing) → `src/cartograph/measureModel.js` header (the per-fe authoring wall) →
the memories linked throughout. Then build.

---

*Drafted by Trammel, follow-on to reset-toy-blocks button `cf24cb7`. Nothing built yet; pipeline
mapped by reading code (shell was unreliable). The rest of this doc is the design.*

## Locked decisions (REVISED after Stadia's pipeline finding — supersedes the original)

> Trammel's original decision #1 ("generic = `defaultMeasure('residential')` ~5.18/1.37/1.52, reset
> = strip overlay → derive default re-applies") was **WRONG for the toy** and is retired. Stadia
> verified the toy bake never runs derive.js and never reads overlay.json — it reads
> `src/data/toy/toy-ribbons.json` (derived from authored `toy-input.json`). Independently
> re-confirmed by Trammel: `bake-ground.js:577` reads `<scene>-ribbons.json` for the toy.
> See "STADIA FINDINGS" below for the full trace. The "## The pipeline" section just below was
> written under the WRONG (derive/overlay) theory — read it as LS-only; the toy path is
> centerlines→derive-toy.js→toy-ribbons.json→bake.

1. **"Generic" = the authored toy fixture baseline** (`toy-input.json` → `toy-ribbons.json`), NOT
   `defaultMeasure`. Jacob's model: centerlines arrive as nodes → derive lines + convention-generic
   widths/treatments → **plus deliberately-authored "neighborhood test features"** (Benton Place's
   one-side `terminal:treelawn, sidewalk:0`; Waverly's `3/0/0 terminal:none` bare segment). These
   **feature-level details are FIXTURE and must be KEPT** — Jacob will add more such features over
   time. They are the "home," not user edits.

2. **Reset strips ONLY the user-authored session layer; it KEEPS the fixture.** Three strip targets,
   one keep:
   - STRIP `overlay.json` chain measures + segmentMeasures (live-Designer Survey/Measure edits)
   - STRIP `design.json.blockCustoms`
   - STRIP `design.json` corner overrides (Neighborhood only): `cornerRadiusScale→1`,
     `cornerRadiusOverrides→{}`, `cornerCornerRadiusOverrides→{}`
   - KEEP `toy-input.json` / `toy-ribbons.json` (the convention-generic + feature baseline).
   This is **decision (a1)** from the conversation, not (a2): do NOT flatten Benton/Waverly to
   symmetric-treelawns-everywhere — that would erase test features.

3. **Two-button model** (Jacob: "Reset Selected" + "Reset Neighborhood"). Reset Selected strips the
   selected chain(s)' overlay measures + their fes' blockCustoms; Reset Neighborhood strips all
   three layers scene-wide. Corner overrides reset with Neighborhood.

4. **Build path = Stadia's corrected (a): store-side only** (clear centerlineData measures +
   segmentMeasures → awaited `_saveOverlay()` → mergeLiveRibbons falls back to the toy-ribbons
   baseline; blockCustoms→{}; corners cleared; rebake). ~100 LOC. **No derive.js / promote-ribbons /
   serve.js changes** — those belong to finding #2 (below), a separate arc.

**Finding #2 (logged, NOT in this arc):** Jacob's asymmetric overlay edits (HW4 ~12m, VW2 ~17m +
segmentMeasures) never reached the bake — `toy-ribbons.json` is all-generic and dates to May 16; the
live Designer shows them via `mergeLiveRibbons` but baked/Stage/Preview never has. The Survey-tool
overlay write has no path into the toy bake (derive.js is LS-hardwired, ignores `--scene`). This is
the standing "is this chains again?" debt. Triage separately with Boz; making "reset mimics
production" *literally* true (overlay edits actually baking) is the bigger arc (b).

## The pipeline (verified by reading the code)

```
raw/centerlines.json          surveyed centerlines (id, name, type, points)  — toy: type:"residential"
  → derive.js                 skeletonize + resolve per-chain measure
clean/skeleton.json           topology (IXs, divided flags)
clean/overlay.json            per-chain measures {left,right,symmetric}  ← THE MEASURE LAYER (reset target #1)
  → buildBlockGeometryV2  ===== DATA WALL =====  chains end; polygons are the surface
design.json.blockCustoms      per-fe authoring — the ONLY post-wall write target  (reset target #2)
design.json corner overrides  cornerRadiusScale + ix/corner radius maps        (reset target #3)
  → bake-ground.js
public/baked/toy/ground.{bin,json}
```

**Measure resolution in `derive.js` (≈line 2338-2346):** per skeleton chain,
`measure = overlayById[s.id]?.measure ?? computeStreetMeasure(...)`. So **overlay measures win;
the default is the fallback.** A pipeline-pure reset = **remove the chain's overlay measure entry
so the derive/bake default re-applies** — not "write 5/1.5/1.5 by hand."

**The generic default = `defaultMeasure('residential')`** (streetProfiles.js:112-131), which is:
```
pavementHW = TYPE_PAVEMENT_HW.residential = 2*10*FT/2 + 7*FT  = 5.1816 m
treelawn   = SV_TREELAWN = 4.5*FT                              = 1.3716 m
sidewalk   = SV_SIDEWALK = 5*FT                                = 1.524  m
terminal   = 'sidewalk',  symmetric = true   (both sides identical)
```
All 9 toy chains are `type:"residential"`, so every chain's generic is exactly this tuple. The
"generic" is therefore **computable, not a magic constant** — call `defaultMeasure(chain.type)`.

## The two-button design

Both buttons = "restore generic at some scope across all 3 layers, then rebake." Toy-only
(`scene==='toy'`), each behind a `confirm()`.

### Reset Selected
For the currently-selected chain(s) — the Measure tool selects by centerline, which spans ≥2
adjacent block-edges (that's Jacob's "selected blocks"):
- **overlay:** delete those chains' `overlay.json` measure entries (→ derive/bake re-applies the
  residential default). Write via the backend `saveOverlay` path (see Plumbing).
- **blockCustoms:** drop entries for fes on those chains — reuse the existing
  `clearBlockEdgeCustomsForChain(streetIdx)` store action (already walks `_v2FrontageEdges` by chain
  identity; it's the exact precedent).
- **corners:** drop ix/corner overrides at IXs touched by those chains (optional for v1 — could be
  Neighborhood-only; confirm with operator).
- Rebake.

### Reset Neighborhood
Whole scene:
- **overlay:** reset every chain to `defaultMeasure(chain.type)` symmetric. Two equivalent routes —
  (a) delete `clean/overlay.json` then `node cartograph/derive.js --scene=toy` (purest, but derive
  also rewrites skeleton — verify it's idempotent on skeleton first), or (b) overwrite every
  `overlay.streets[id].measure` with the computed default and drop `segmentMeasures`/`materials`
  (narrower blast radius, no skeleton churn — **recommended**).
- **blockCustoms:** clear to `{}` — reuse the shipped `resetToyBlockCustoms()` action's body.
- **corners:** `cornerRadiusScale → 1`, `cornerRadiusOverrides → {}`,
  `cornerCornerRadiusOverrides → {}` — reuse the existing `clearAllIxCornerRadii()` store action
  (it does exactly this).
- Rebake.

The shipped "Reset toy blocks" button is the blockCustoms-only narrow case; **fold it into this
family** (it becomes redundant once Neighborhood exists — retire it or relabel, operator's call;
flag per [[feedback_vestigial_ux_is_a_wall_violation]]).

## Plumbing reality (why this is a real arc, not a store action)

The Designer renders from the live store, but `overlay.json` is owned by the **backend**
(`fetchOverlay`/`saveOverlay` in `src/cartograph/api.js`; `serve.js` writes the file). A reset that
touches **chain measures** must write through that path or the on-disk overlay and the live render
diverge ([[feedback_debounced_save_must_flush_before_dependent_post]] is the relevant hazard — the
overlay write must land before the bake POST reads it). blockCustoms + corners live in design.json
(store + `_saveDesignDebounced`, already handled). So scope = **store actions + an overlay-reset
write path (likely a small serve.js endpoint or a saveOverlay call) + 2 Panel buttons + the
flush-before-bake ordering.** Hold to additive; if it balloons past ~120 LOC, surface.

## Guardrail (MANDATORY — [[feedback_render_guard_against_real_data_not_synthetic]])
Before shipping: click each button against the REAL current toy (with Jacob's asymmetric edits
present), confirm the render returns to generic, AND confirm a from-scratch
`derive + bake` of an overlay-stripped toy produces the SAME `ground.json`. The button must
reproduce the pipeline, not approximate it. Do NOT gate on a synthetic flood — gate on real data.

## Doctrine touchpoints
- [[feedback_toy_is_the_construction_spike_surface]] — the test value is in MAKING the edits; the
  generic baseline is the "home" to return to, deliberately boring.
- [[feedback_clean_regen_must_be_idempotent_complete]] — if route (a) (delete+derive) is used, it
  MUST regenerate everything it deletes; prefer route (b) overwrite to avoid this trap.
- [[feedback_json_stringify_loses_handauthored_format]] — overlay writes via JSON.stringify lose
  hand-formatting; acceptable here since overlay is machine-owned, but note it.
- [[project_reset_toy_button_queued]] — update once shipped; the "+ Add to Looks" counterpart still
  unbuilt.

## Status
Design locked, brief dispatch-ready. Working tree clean of my exploration (overlay.json restored to
HEAD; only this doc added + the other agents' untouched HANDOFFs). Recommend a fresh agent picks
this up — my shell is unreliable this session and the name retires.

---

## STADIA FINDINGS — STOP & SURFACE (2026-05-30, working shell, no code written yet)

I (Stadia) traced the *live* toy pipeline with a working shell before building. The brief's central
pipeline theory does not match reality for the toy bake. Stopping per §0's stop rule ("if the two
locked decisions stop fitting reality — stop and surface; an honest stop beats a silent redesign").

### What the toy bake actually reads (evidence)
- `serve.js` bake endpoint runs `pipeline.js`/`promote-ribbons.js`/`derive.js` **only `if (isDefaultScene)`**.
  Toy is not the default scene, so **derive.js never runs during a toy bake** (serve.js:540, 552-553).
- `derive.js` does **not** parse `--scene` at all — it is hardwired to `RAW_DIR`/`CLEAN_DIR` =
  `DEFAULT_SCENE` ('lafayette-square'). `node derive.js --scene=toy` would silently process LS data.
- `bake-ground.js` reads toy measures from `src/data/toy/toy-ribbons.json` (bake-ground.js:577-579),
  **not** from `cartograph/data/toy/clean/overlay.json`. Toy `clean/` has only `overlay.json` +
  `skeleton.json` — **no `map.json`, no `ribbons.json`.**
- `src/data/toy/toy-ribbons.json` is produced by **`derive-toy.js`**, which reads
  `src/data/toy/toy-input.json` (hand-authored chains WITH measures) and passes `measure` through
  verbatim. It does **not** read overlay.json. `promote-ribbons.js` writes only the hardcoded
  default-scene path `src/data/ribbons.json` (promote-ribbons.js:13-14, 23) — it never produces the
  toy file. derive-toy.js is run manually (`node cartograph/derive-toy.js`), not by the bake.

### Consequence 1 — "generic = pipeline residential default" is wrong for the toy
The brief's locked decision #1 says generic = `defaultMeasure('residential')` ≈ 5.18/1.37/1.52,
re-applied by removing the overlay override so derive falls back. Reality: the toy's generic baseline
is **`toy-input.json`** (per-chain: mostly 5/1.5/1.5, plus 4/1.5/1.5 and 3/0/0 for Benton/Waverly/cut).
That IS the deliberately-boring home — just authored in toy-input.json, not computed by defaultMeasure,
and never routed through derive's fallback. The numbers differ slightly (round 5/1.5/1.5 vs 5.18/1.37/1.52).

### Consequence 2 — the real bug: Jacob's asymmetric overlay edits were NEVER baked
overlay.json carries Jacob's edits (HW4 ~12m asymmetric pavement; VW2 ~17m + segmentMeasures), but
`toy-ribbons.json` (the bake's measure source) is all-generic and dates to **May 16**. The overlay is
read only by the **live Designer** (`_loadCenterlines` → `mergeLiveRibbons`), never by the bake. So
the baked / Stage / Preview toy has **never** shown those edits. This is a data-wall seam: the Survey
tool's overlay write has no path into the toy bake. ("Is this chains again?" — yes; matches the
skeleton-is-the-first-bake standing debt.)

### The reset is still achievable — and simpler than the brief (store-side only)
`mergeLiveRibbons` (mergeLiveRibbons.js:43) only overrides a chain's measure when the live entry has
both sides; clear the overlay measure and the live render falls back to the `toy-ribbons.json`
baseline. So a correct, minimal reset (no derive.js / promote-ribbons / serve.js changes):
1. Clear `centerlineData.streets[].measure` + `segmentMeasures`, then `_saveOverlay()` (await the
   POST before bake) — live render returns to the toy-input baseline; disk overlay stripped. Caps preserved.
2. `blockCustoms → {}`.
3. (Neighborhood) `cornerRadiusScale → 1`, `cornerRadiusOverrides → {}`, `cornerCornerRadiusOverrides → {}`.
4. Rebake.
Two-button model (locked #2) still holds. Net visible effect: live render returns to the toy-input
baseline; blockCustoms + corners clear in the bake. (The bake's MEASURES were already generic, since
the bake never read the overlay edits — see Consequence 2.)

### Honest guardrail (brief's can't be met as written)
The brief's "from-scratch derive+bake of an overlay-stripped toy produces the same ground.json" is
unsatisfiable — no toy derive runs in the bake. Honest equivalent: live render returns to the
toy-input baseline AND the rebaked ground matches a clean `toy-input` bake.

### Decision needed from Jacob (via Boz) before I build
- (a) Ship the corrected store-side reset above (returns toy to its toy-input baseline; clears all 3
  override layers; two buttons). Small, safe, ~100 LOC. "Generic" = toy-input baseline.
- (b) Additionally fix Consequence-2's seam so overlay edits reach the toy bake (make derive.js
  scene-aware, or wire derive-toy/promote into the toy bake). Bigger arc, touches the pipeline,
  out of this brief's ~120 LOC scope; makes "reset mimics production" literally true.
- Stadia recommends (a) now + log Consequence 2 as a separate finding for Boz to triage.

— Stadia (no production code written; awaiting confirm)
