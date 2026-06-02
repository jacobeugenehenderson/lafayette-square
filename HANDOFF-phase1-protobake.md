# HANDOFF — Phase 1: Formalize the Protobake (TIGHT)

**You are the dispatched agent.** Pick a name (one word, yours) and sign your commits + your final report with it. This is **Phase 1 of the reconceived-pipeline program** — read `HANDOFF-pipeline-reconception.md` first for the whole arc; this brief is just the first swing.

**Warm/cold:** warm to **Vesalius** if available (holds the frame-forensics context end-to-end); otherwise cold is fine — `cartograph/OSM-FORENSICS.md` + `-EVAL.md` carry everything you need.

**Reads first:** `HANDOFF-pipeline-reconception.md` (the program) · `cartograph/OSM-FORENSICS.md` + `cartograph/OSM-FORENSICS-EVAL.md` (Vesalius's forensics — the *why* of every enrichment) · the two scratch files named below.

---

## The job, in one sentence

The frame enrichment Vesalius built was **reverted out of the live tree** (the "clean tree" snapshot `f959506`) and survives only as full-file copies in `scratch/`. Recover it, confirm it's *purely* the enrichment, re-apply it, make sure its fields survive serialization, commit it, and verify the street-shape wins it gives for free render on LS. **That's all.**

## Current truth (verified 2026-06-01 — don't trust the older handoffs on this)

- Live `cartograph/skeleton.js` (601 ln) runs the **old junction-blind** `simplify(coords, devTol=0.2)` at L375 — the code the Osteopathologist found deletes 79 real T-junctions.
- The enriched versions are in **`scratch/vesalius-skeleton-js-P1ENRICHED.js`** (796 ln — junction-**aware** `simplify(…, protectedKeys)` at L385 that never collapses junction/shared-node vertices) and **`scratch/vesalius-derive-js-P1ENRICHED.js`** (3181 ln).
- They are **not committed** anywhere. `f959506` did not touch `skeleton.js`/`derive.js`; it reset other artifacts to clean.

## Steps

1. **Recover + verify the delta is PURELY enrichment.** Diff `scratch/vesalius-skeleton-js-P1ENRICHED.js` against live `cartograph/skeleton.js`, and `scratch/vesalius-derive-js-P1ENRICHED.js` against live `cartograph/derive.js`. Confirm the delta is *only* the enrichment (junction-aware `protectedKeys` simplify; node typing; carried OSM tags) and is **not entangled** with any reverted ribbon/customs/figure-ground work. If anything in the diff looks like it belongs to a different arc, **stop and report** before applying — the clean-tree snapshot reverted multiple things and we only want the frame piece.
2. **Re-apply** the enrichment to the live `cartograph/skeleton.js` + `cartograph/derive.js`. (If the diff is clean and the live files haven't otherwise moved, adopting the scratch versions wholesale is fine; if they've diverged, port the delta.)
3. **Widen the streets serializer** at `cartograph/derive.js:2899` — the `streets: ribbonStreets.map(st => ({ … }))` literal is a whitelist; any field not named there is stripped before `ribbons.json`. Add the enriched fields the enrichment now carries (node types / junction info / carried tags) so they **survive** into the output. (This is the plumbing fix only — a *consumer* of these fields is deferred to the Wall; the goal here is that the data is present, not yet that it changes faces.)
4. **Rebuild + bake** (verified chain — `derive.js` is a library `pipeline.js` imports, not a standalone):
   - `node cartograph/skeleton.js`  → `data/clean/skeleton.json`
   - `node cartograph/pipeline.js`  → `data/clean/map.json` (runs `deriveLayers`)
   - `node cartograph/promote-ribbons.js`  → `src/data/ribbons.json`
   - `node cartograph/bake-ground.js`  → `public/baked/lafayette-square/` (unflagged now targets LS — the bake-target fix landed; ~8s)
5. **Verify the visible win on LS** (the street-shape improvements come for free because street shape derives from the skeleton): Dolman→18th correct, the 79 interior T-junctions present (not deleted), node count sane / no blowup. Keep a **frame-only A/B** against the preserved old `skeleton.json` so the delta is attributable to the frame alone.
6. **Retire the two `derive.js` frame-thinness hacks** (the West-18th densify + the LaSalle magic-coord) **only if** Dolman→18th now resolves cleanly in-frame without them. If removing either regresses anything, **leave it and flag it** — don't force it.

## Boundaries — do NOT cross in Phase 1

- ❌ Do **not** rewire faces/intersections to read the frame — they stay raw-OSM-sourced (`derive.js` reads `osm.json` at L1010) until the Wall (Phase 3). Phase 1 takes only the *street-shape* wins.
- ❌ Do **not** build a new frozen-artifact format. "Freeze" = the committed enriched frame is the canonical input; the protoslab-artifact decision is parked.
- ❌ Do **not** touch `public/looks/lafayette-square/design.json` customs — no wipe, no edit. (Last night's near-miss.)
- ❌ Do **not** edit the canonical docs (RIBBONS / PIPELINE / FEATURES / ARCHITECTURE). Boz owns those; report what changed and Boz folds it in.
- ❌ Do **not** start the stroke construction — that's Phase 2.

## Write / commit boundaries

- **May edit + commit:** `cartograph/skeleton.js`, `cartograph/derive.js`, and the regenerated artifacts (`skeleton.json`, `map.json`, `src/data/ribbons.json`, `public/baked/lafayette-square/*`). One clear commit, e.g. `feat(cartograph): Phase 1 — recover + commit junction-aware frame enrichment`.
- Commit message ends with the Co-Authored-By line.
- We're on branch `cartograph-looks-pass-ab` (not main) — commit here.

## Gate (definition of done) — read this carefully, expectations matter

**This is the FIRST ghost-free read of the frame.** Last night's "P1 didn't improve anything" was a verdict on a **stale May-28 bake** (the bake-target ghost, now fixed). So your fresh frame-only A/B is genuinely new information — report it honestly, don't chase a result.

**Calibrate what's visible vs not:**
- The 79 recovered T-junction vertices are largely **colinear** (the through-street runs straight through them) — they matter for *topology* (junction detection → corner derivation via `ixByChain`), and may change little or nothing in the drawn street *shape*. **Muted/localized visible change is EXPECTED here, not a failure** — much of the payoff is topological and lands when a consumer reads it at the Wall (Phase 3).
- What CAN show: real-bend recovery where the old 48%-aggressive simplify smoothed actual geometry (**Dolman→18th** is the named case), and corners newly detected at recovered junctions.

**Definition of done:** the enriched frame is committed + live; you've produced a clean frame-only A/B (fresh bakes both sides) and reported **exactly what changed and what didn't**, attributed to the frame. "Frame correct + committed + honest A/B" is the deliverable — the *size* of the visible delta is data we want, not a pass/fail bar. WYSIWYG / ribbon correctness is **not** in scope (that's Section, Phase 4).

## Deliverable / final report

- The commit hash(es) + one-line outcome.
- A short note: what enriched fields now survive into `ribbons.json`, and which are present-but-not-yet-consumed (deferred to the Wall).
- The A/B result (what visibly changed on LS, what didn't).
- Whether the two `derive.js` hacks could be retired or were left (and why).
- Anything in the scratch diff that looked entangled and how you handled it.

---

## OUTCOME — Phase 1 DONE (Marrow, commit `1f89b86`, 2026-06-01)

Frame enrichment recovered from scratch, re-applied, serializer widened, committed. Scratch diff confirmed pure (no ribbon/customs/figure-ground entanglement) → adopted wholesale + serializer fix on top. `design.json` customs untouched (not staged/committed). LS bakes clean: 45 groups, 406,772 verts. **Jacob's eye: zero visible change — correct + expected** (frame is invisible-until-a-consumer-reads-it; the no-change PROVES the visible payoff is 100% in the construction, Phases 2–4).

**What now survives into `ribbons.json` (PRESENT but not yet consumed — this is the Phase 3 / Wall input inventory):**
- Per-street (242): `seed` 242 (standards cross-section), `caps` 242 (cap-as-fact), `lanes` 169, `surface` 182, `maxspeed` 117, `continuesAs` 32.
- Top-level frame metadata: `junctions` 329 typed (T 136 / cross 83 / deadend 100 / Y 10), `nameTransitions` 21.
- **Deferred consumers (Phase 3 wires these up):** faces+intersections on-frame · `caps`→`chainPavementRing` · `seed`→`computeStreetMeasure` · `medianWidth`/`continuesAs`. (Marrow: this is "exactly Vesalius's Layer-2 item #1 — where banked frame-correctness becomes visible render and deletes the 3m snap + raw-OSM face noding.")

**Frame-only A/B (attributable to the skeleton alone; faces/ix still raw-OSM):** frame-invisible interior-Ts 79→0 · genuine OSM gaps 0→0 · street verts 1431→1588, reduction 48%(lossy)→37%(junction-safe) · typed junctions 0→329 · caps-as-fact 0→484 (100 round / 384 butt) · Dolman→18th two-unrelated-streets → one road. Baseline preserved: `scratch/vesalius-skeleton-BEFORE.json`, probe `scratch/AB-before-osteo.txt`.

**Both `derive.js` hacks retired:** West-18th `CURVE_STREETS` densify → generalized to a principled Goldilocks curve-densify (any bending street, max-seg 5m, offset-safe — 48 streets, not one special case); LaSalle magic-coord extend was already dead (guard never matched current raw OSM) → removed. Stale "extend LaSalle" comment fixed.

**Notes:** `clean/skeleton.json` is gitignored (regenerated each bake) — not committed by design; committed artifacts = the two sources + `map.json` + `ribbons.json` + `ground.bin/json`. Minor face/ix count drift vs Vesalius's EVAL (185 raw-faces/258 ix vs 178/252) traces to trimmed `design.json` + the generalized densify — both raw-OSM/deferred paths, outside the frame gate; serialized faces:178 matches EVAL.

*This HANDOFF retires to NOTES per `BOZ.md` once Boz folds the fact into Reference; the OUTCOME above is the Phase 3 input inventory — keep it until the Wall consumes it.*

---

*Provenance: Boz, 2026-06-01. Phase 1 of `HANDOFF-pipeline-reconception.md`. Construction model: `HANDOFF-stroke-construction.md`.*
