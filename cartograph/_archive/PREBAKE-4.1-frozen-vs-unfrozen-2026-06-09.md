# ARCHIVED — PREBAKE §4.1: "the half that is frozen vs the half that is not" (as written 2026-06-09)

> **Archived 2026-07-31.** Kept for its producer diagnosis and the parallelism diagnostic, which
> still stand.
>
> ⛔ **Its consumer claim is FALSE and was false from 2026-07-14/15**: it says the curb is
> "re-stroked live, every frame". Every non-Survey view renders from the frozen `shape.json`; only
> Survey strokes live, by design. Left uncorrected, this text caused a session on 2026-07-31 to
> report that working infrastructure did not exist.
>
> Live SSOT → `cartograph/WALL.md §2` · `cartograph/PIPELINE.md §Wall`.

---

### 4.1 ⭐⭐ The half that's frozen vs the half that isn't — the PRODUCER still traces chains (2026-06-09, **materially corrected 2026-07-31**)

> ⛔⛔ **READ THIS BEFORE THE 2026-06-09 TEXT BELOW — it is seven weeks stale on the consumer side and it misled a session on 2026-07-31 into telling the operator that a working wall did not exist.**
>
> | | state | evidence |
> |---|---|---|
> | **Consumer boundary** | ✅ **BUILT, WIRED, DEFENDED** | **Every non-Survey view — Section/Measure *and* the neutral Design view — renders from the frozen `shape.json`** (`BlockGeometryV2Debug.jsx:562`). Frozen `iA` on **93/101** LS tiles + per-run curb polylines with measures. `sectionOpen` has **no chain in lexical scope** (`tileGround.js:1812`). Race-guarded twice (`72bbc989`, `59e5f109`). |
> | **Survey live-strokes** | ✅ **BY DESIGN** | Survey is the tool that *edits* the SHAPE. Not a leak. |
> | **Producer boundary** | 🔴 **OPEN — this is the real remaining gap** | `shape.json` is *minted* by `buildTileGround(liveRibbons,…)` then snapshotted → **a photograph of a live chain-stroke, not a pure function of the frozen frame.** **Check C RED** (`POLYGON-FIRST §2`). |
> | **A fallback inside the wall** | ⛔ **NEW, live, unfixed** | A failed `shape.json` fetch **silently falls back to a live build** (`BlockGeometryV2Debug.jsx:589`), as does a scene with no freeze (`:595`). Layer-0 violation: the operator sees a plausible map and never learns the freeze didn't happen. |
>
> **Accurate SSOT for the wall's state: `WALL.md §31`** (it was right all along) and `ARCHITECTURE.md §79`. The text below is kept for its diagnosis of the *producer* — which still stands — and must not be quoted as evidence that downstream consumers re-derive. **They do not.**

D2 **froze the face TOPOLOGY** (`ribbons.tiles[]` = per tile `{ring, edges:[{skelId,side}]}`, the `extractFaces` walk run once at prebake; `derive.js` D2 block, consumed by `tileGround.tilesFromFrozen`). That half of the program landed. **But the CURB GEOMETRY is NOT frozen** — `buildTileGround` re-strokes the chains **live, every frame in Survey** (`BlockGeometryV2Debug.jsx:661–686` → `tg.curb` / `curbOutline`) and again in the bake, building the curb as a *union* of per-chain strokes + E3 corner keep-out cuts + node aprons + `filletRing`. The Survey blue silhouette **is** `buildTileGround(liveRibbons).curb`, read from `ribbons.json` — **not** the baked `shape.json` (same engine, two times; rebaking changes nothing visible in Survey because Survey recomputes live).

**This is the live leak the skeleton exists to abolish: a downstream consumer still building geometry from chains.** Its most visible symptom is the **divided-transition "d" bulge** (`HANDOFF-freeze-the-curb-in-the-first-bake.md`): the curb along a *straight* chain (e.g. Mississippi at Lafayette) is not a clean parallel offset — it bows ~4 m — because the live union *can* bow it. A correct curb is, by definition, `chain ⊕ halfWidth` (a parallel offset), with genuine corners as the intersection of two offsets — a **pure function of the skeleton**. So the curb belongs in the frozen body; the bow is the proof it isn't there yet.

> **Diagnostic that beats node-archaeology:** test whether each curb side is **parallel to its own chain** (`chain ± halfWidth`). The chain is straight ground-truth; deviation from parallel — except at a genuine corner — *is* the artifact, and tells you which side drifted. Measure deviation from the definition; don't reconstruct the corner from the node soup. *(Ruled out this session as wrong altitude: de-taper-nose tuning, face-ring vertex moves, `cornersAtIx`/§437, and "the corner is missing" — the E3 corner does fire; the union just yields a non-parallel curb. See the brief.)*
- **Contradiction to clear (code comments):** `tileGround.js` header and the `bake-ground.js` import comment still say *"TOY only / LS stays on figure-ground (transitional)"* — **stale** (pre-T2). The code runs LS on tiles unconditionally (`isTileScene = true`, `BlockGeometryV2Debug.jsx:253`; bake calls `buildTileGround` at `bake-ground.js:293`). Fix the comments when the code phase opens; until then, trust the code.

