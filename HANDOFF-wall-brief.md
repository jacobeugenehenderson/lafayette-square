# Dispatch brief — THE WALL: freeze the hardscape, cut Section off the chains

**For a COLD agent.** Self-contained; every location cited file:line. This is the **highest-stakes brief of the arc** — it's an architectural refactor whose success criterion is *the picture doesn't change* (byte-identical render), while the data flow underneath changes fundamentally. Read it all before touching code. Pick a name; sign your commits.

---

## 0. Name yourself, read the canon

- **`cartograph/ARCHITECTURE.md §2.1`** — the three-tool taxonomy (Survey=SHAPE, Section=FILL, Stage=LOOK). The Wall is the seam between Survey and Section.
- memory/topic **`project_two_bakes_two_walls`** + **`project_the_palimpsest_code_path_multiplicity`** — *why* this exists: the recurring "fix landed on the wrong code path" disease. The cure is "collapse to ONE frozen, id-stable, skeleton-sourced artifact." This brief builds the **physical** half of that cure.
- **`RIBBONS.md §5`** — the Section/Measure operator model (unchanged by this brief).

## 1. What the Wall is — and the two "go backs" (read carefully)

Today `buildTileGround` computes the whole ground — asphalt silhouette **and** the inward ped strips — in one pass, reading from the live chain/ribbon graph. The Wall splits that into:
- a **shape pass** (Survey's hardscape: asphalt-inner ring + corner fillets + caps) that emits a **frozen artifact**, and
- a **section pass** (the inward ped strips + LU flood + ADA) that consumes **only that frozen artifact** — never the live chain graph.

**Two different "go backs" — the Wall forbids exactly one:**
- ✅ **The operator re-authoring + re-baking is ALWAYS allowed.** Re-open Survey, adjust the shape, re-run the shape pass → a new frozen artifact. The freeze is a **regenerable snapshot, not a one-way lock.**
- ⛔ **The section-pass code reaching back to the chain is what we make impossible.** Section reads the frozen artifact; it has no code path to `streetsOrig`/`centerlineData`/the chain graph.

Forbidding the second is what makes the first *safe*: re-bake produces one artifact, everything downstream reflects it, no drift. This is the cure for the palimpsest.

## 2. Current state (from a completeness audit — verified, file:line)

- **The seam already exists in the code: `src/lib/tileGround.js:759`** — production of `iA` (the asphalt-inner / curb-line ring, `:745`) ends the shape work. Everything from `:760` onward — the concentric ped offsets `iC`/`iT`/`iW` (`:760-762`), the LU flood (`luForRing`, `:763`), the ADA pad, the dead-end caps — is pure Section and reads only off `iA` + frozen params. **You are formalizing a boundary that already exists, not inventing one.**
- **Almost everything Section consumes is already frozen at bake** (`bake-ground.js:289-299` reads `design.json`: `curbWidth`, `streetSmooth`, `blockLandUse`, corner overrides, `blockCustoms`). The live render (`BlockGeometryV2Debug.jsx:553`) reads the same from the store; live==bake.
- **⭐ There is exactly ONE real reach-back into the live chain: `segOrd`.** To key per-fe ped/asphalt widths (`blockCustoms[skelId][side][segOrd]`), `runMeasure()` (`:527-537`) calls `runSegOrd(run)` (`:510-523`), which **probes the original un-smoothed chain `streetsOrig` to recompute the segment ordinal.** This is the last thread tying Section to the chain graph.
- **Two minor gaps, both low-effort:** `isMedianFacing()` (`:728`) reads `street.anchor` live — but `anchor` is already in `ribbons.streets[]`, just consume it from the frozen field; `vertR` (per-corner radius, `:742`) is already frozen at bake via the corner-override params.

## 3. The work — four phases, each byte-identical-gated

**The guiding rule: REPLACE-THEN-DELETE.** Make the frozen artifact *complete* (carries every field Section needs) **before** cutting any reach-back. The cut is the **last** move. (This is the scene-blind-fixture lesson — cutting a source before the replacement is complete surfaces `undefined`.)

**Phase A — freeze `segOrd` (and `anchor`) into per-run metadata.** In the shape-pass region (where the chain is legitimately available), compute `segOrd` per run **once** (move/reuse `runSegOrd`'s logic, `:510-523`) and store it, alongside `side`, `skelId`, `anchor`, and `tileIdx`, in a `perRunMeta` array. This is *additive* — nothing reads it yet. Gate: byte-identical render (you've added data, changed no output).

**Phase B — split `buildTileGround` into `shapePass` + `sectionPass`.** Refactor so:
- `shapePass(ribbons, opts)` → the **frozen artifact**: `{ perTile: [{ iA-ring, cornerFillets, caps, lu, perRunMeta:[{segOrd, side, skelId, anchor, tileIdx}], repDepths:{treelawn, sidewalk, isMedianTile} }], ... }`. (Note `tl`/`sw` rep-depths are already deterministic on frozen `measures[]` — `repDepth`, `:658-666` — so they belong in the artifact.)
- `sectionPass(artifact, designParams)` → the ped strips + LU flood + ADA + caps (the current `:760-845` logic), reading `segOrd` from `artifact.perRunMeta` instead of calling `runSegOrd`.
- `buildTileGround` becomes `shapePass` then `sectionPass(shapeResult, …)` — still one live call. Gate: byte-identical render.

**Phase C — THE CUT.** Narrow `sectionPass`'s signature to `(artifact, designParams)` **only** — no `ribbons`, no `streetsOrig`, no `centerlineData`, no chain access. It must be impossible for it to reach the chain because it isn't handed it. **Verify mechanically: `grep` `sectionPass` (and anything it calls) for `streetsOrig`/`centerlineData`/`ribbons.streets` → must be zero.** Fold the `anchor` (median) read into `perRunMeta` consumption (`:728`), pass `vertR`/corner data via the artifact or params. Gate: byte-identical render + the grep comes back clean.

**Phase D — serialize the artifact at bake.** Have `bake-ground.js` write the frozen `shapePass` artifact (so it persists as the single source Section reads — both for the bake's own `sectionPass` and, later, for live Section-mode reads). Keep `ground.json`/`ground.bin` output byte-identical. Gate: re-bake LS + toy, byte-identical (`git diff` the baked artifacts).

## 4. Invariants & gates (non-negotiable)

1. **Byte-identical render before/after each phase** — this is THE gate. The Wall changes plumbing, not pixels. Confirm on Jacob's eye (toy + LS Designer) *and* by `git diff` on a re-bake (`node cartograph/bake-ground.js --look=lafayette-square` — ⚠️ you MUST pass `--look=lafayette-square`; an unflagged bake writes a phantom `baked/default/` nothing reads).
2. **Replace-then-delete** — artifact complete before the cut; the cut (Phase C) is last.
3. **Re-bake always works** — re-running `shapePass` regenerates the artifact; the operator can re-author Survey and re-freeze anytime. Don't build anything that makes the freeze permanent/one-way.
4. **live==bake preserved** — the same `shapePass`/`sectionPass` run in `BlockGeometryV2Debug` (live) and `bake-ground.js` (bake).

## 5. Explicit NON-scope (do not do these here)

- **NOT id-stability / incremental block-local re-bake machinery.** That's the later grand wall-move optimization. This brief = the *physical* wall (the function-boundary cut) + a *complete* serialized artifact. Keep the artifact to exactly what `sectionPass` consumes — no speculative schema.
- **NOT the live "Section-mode skips shapePass" perf optimization.** The split *enables* it (Section editing ped widths against a frozen shape = cheap, no shape recompute — the responsiveness payoff), but implementing that is a follow-on. Here, `buildTileGround` still runs both passes live.
- **NOT Section troubleshooting** — the ADA pad, dead-end caps, curb-cosmetic-lip, strip-swap punch-list is the *next* brief (Section), done on the frozen shape this brief produces. Don't fix ped bugs here; just preserve current behavior byte-for-byte.
- **NOT the decoration sub-bakes** (buildings/lamps/trees) — different bakes, untouched.
- **NOT deleting figure-ground** — that's T4, later.

## 6. Validation, commits, gotchas

**Validation surface:** Toy Designer (live, hard-refresh) + LS Designer; and `git diff` on a re-bake of both. Byte-identical is the bar at every phase. Jacob's eye gates the final result.

**Commit ladder** (one commit per phase, each independently byte-identical):
1. Phase A — `perRunMeta` (segOrd/anchor/…) computed + stored, unused.
2. Phase B — `shapePass`/`sectionPass` split, `sectionPass` reads `segOrd` from the artifact.
3. Phase C — the cut: narrow `sectionPass`'s signature; grep-clean of chain access.
4. Phase D — serialize the artifact at bake.

**Gotchas (banked):**
- **Validate on Jacob's eye, not a proxy** — a self-built rasterizer that disagrees with the app is void.
- **Verify edits applied** (Read/`git diff`) before trusting build/bake output (Edit-then-Bash can race).
- **`scratch/` is git-tracked** — don't `rm -rf`; delete throwaways by exact name.
- **The `--look=lafayette-square` flag is mandatory** on `bake-ground.js` (unflagged writes a phantom `baked/default/`).
- `segOrd`'s chain-probe stays in `shapePass` (where the chain is available and legitimate) — you're not deleting the computation, you're *relocating* it to the side of the wall that's allowed to see the chain, and freezing its result.

**The payoff in one line:** after Phase C, `grep sectionPass` for chain access returns nothing — Section is *physically* incapable of reaching the chain graph, and re-bake is the only way its shape input changes. That's chains-die-for-Section.

*Provenance: Boz, 2026-06-02, on Jacob's go. Built from a read-only completeness audit (seam @ tileGround.js:759, sole reach-back = segOrd). Cold-start self-contained per the dispatch model.*
