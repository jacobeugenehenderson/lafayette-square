# HANDOFF — Altadena pour: identity + ground perf

**To:** the next Boz. **From:** the 2026-07-14 session. **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md gate): `ORIENTATION.md` → `README §⭐ START HERE` → this + [[project_altadena_pour_identity_and_ground_perf]]. Sibling context: [[project_altadena_mountain_landscape_hero]], [[project_extent_pen_boundary]].

You are Boz. Jacob was pouring **Altadena** — a NEW hood, the whole **Census-Designated Place** (~15,397 buildings, ≈2× the real walkable neighborhood). It went badly in three compounding ways; all three root causes are now fixed and committed. This baton carries what landed, the doctrine we settled, and the open tail.

---

## The incident (why this arc exists)

Jacob was in the Designer on Altadena. Symptoms, in the order they surfaced: buildings vanished after a bake → gray screen → the tab said "Cartograph — Lafayette Square" while he was in Altadena → the browser froze ("Page Unresponsive") on a 432 MB ground. Three independent bugs, not one:

1. **Identity** — Altadena had a *scene* but no *Look*, so baking fell back to the default (`lafayette-square`) Look and **clobbered LS's slab** (mountains + ground baked *into* LS).
2. **Landscape** — the San Gabriel mountain model was auto-swept into the pour because a `sangabriel.obj` sat in the scene's data dir.
3. **Ground** — the flat land-use fills were tessellated to 23.6M triangles / 432 MB, which froze the tab.

---

## LANDED (committed on `curb-offset-draw`)

- **`69825d1a` fix(extent): first bake out of Extent creates a Look.** `ExtentApp.jsx` — the committed-hood `onBuild` re-apply branch baked only IF a Look existed and never created one, so `activeLook` stayed on `lafayette-square`. Now mirrors the first-pour branch (ensure a Look, then bake). **This is the root fix for the whole masquerade.**
- **`a20619cc` fix(bake): landscape is an explicit Stage intake.** `serve.js` — the landscape bake was gated on `existsSync(data/<scene>/terrain/sangabriel.obj)`. Now gated on `design.landscape.source` (explicit Look opt-in). Altadena's terrain assets were **moved out of the pour dir** → `cartograph/_landscape-intake/altadena/` (untracked, local).
- **`304edcac` perf(ground): 432 MB → 18 MB (24×).** Two parts:
  - `bake-ground.js` — the soft-fill refine was seeding a fine **15 m mesh with no terrain to follow** (misapplied terrain param `REFINE_MAX_EDGE_M`). Gated on a terrain sampler; no terrain → coarse 64 m cap. **432 → 43 MB.** (Confirmed NOT terrain-conformance: re-baking with terrain removed was byte-identical.)
  - **Inhabited cull** (opt-in via `nb.contextMargin`, default 80 m; `src/lib/inhabitedMask.js` + `tileGround.js` + `bake-ground.js`) — drops ground tiles outside the developed footprint + one block of context. **43 → 18 MB.**

**Also:** reverted `SceneMapLayers.jsx` (a re-clip removal made on a wrong premise; unneeded once the identity root was fixed).

---

## Doctrine we settled (don't re-derive)

- **Cartograph pours the 2D record → a FLAT neighborhood. The 3D landscape MODEL is a STAGE intake**, uploaded deliberately per-Look. It must **never** be auto-detected from files sitting in `data/<scene>/`. ("Theoretically the operator hasn't uploaded it yet.")
- **A flat square is two triangles.** Fine ground subdivision exists *only* to let the runtime bend the mesh over terrain. No terrain → no fine mesh. (Jacob caught this; I wrongly blamed terrain twice before routing to canon.)
- **The inhabited cull is Jacob's design, verbatim:** find the streets/blocks *with buildings* → **offset that SHAPE outward one block** → blend. Park-safe (hole-fill keeps enclosed greens). **Not radial.** Derived from the *member* buildings, so the pen's exclusion loops flow through automatically. **Opt-in per hood** (LS is small/tight and doesn't need it). The margin is a **knob** (`nb.contextMargin`), never hardwired.
- **Automatic now, editable band later** — expose the derived inhabited edge as an operator-nudgeable band in a future pass; keep it automatic for now.

---

## OPEN — the tail (prioritized)

1. **Clean the LS tree contamination.** 66 dirty files under `public/baked/lafayette-square/trees/**` + `trees-atlas*` + `lafayette-square.json` — fallout from the masquerade bake running the trees step *as* lafayette-square. Almost certainly restore-to-committed (like the ground/scene.json we `git restore`'d). **Confirm with Jacob, then restore** — don't assume it's his intentional roster change.
2. **Full Altadena slab bake.** `scene.json`/`trees`/`lamps` are from partial bakes. Run `POST /looks/altadena/bake` (force) — it won't crash now (ground is 805k tris, the `groundSampler` `RangeError` is gone). This is what lets Altadena render **end-to-end in Stage / Preview / Production** (Jacob's stated goal). Trees over 15k buildings is heavy/slow — set expectations.
3. **Wire the Designer 2D cull.** The bake path is done, but the Designer's *live* 2D ground renders through **`buildBlockGeometryV2`** (`BlockGeometryV2Debug.jsx:430`), a DIFFERENT emitter than the bake's `buildTileGround` — and possibly the `SceneMapLayers` overlay. **Trace which emitter actually draws the green fills before wiring** the cull there. Load-bearing 2D path — don't guess.
4. **`LANDSCAPE_FLAT_DEFAULTS` is misnamed** (`src/cartograph/skyLightChannels.js:257`). It holds the real San Gabriel values (`snowline: 1500`…), so `bake-scene.js:134` stamps mountain config into *every* `scene.json`. Inert (no GLB → nothing renders), but should be omitted when there's no landscape source. Small fix; don't touch the shared channel UI defaults.
5. **Canon folds owed** (from the pen-boundary arc, still open): fold the pour/Look + landscape-intake doctrine into `NEIGHBORHOOD-INPUTS §11` / `INTAKE.md` / `README`.

---

## Gotchas the next Boz must not relearn the hard way

- **The cull balloon.** Culling tiles *alone* INCREASES triangles — the perimeter fill (`tileGround.js:3151`, `differenceRings([stencil], tileUnion)`) re-fills the culled void because the stencil is still the full disc (+1.6M tris). The fix (already in): when `opts.tileKeep`, the frame becomes `intersectRings([stencil], offsetRings(tileUnion, cullMargin))`. If you touch the cull, keep the frame tied to the kept tiles.
- **Per-building Clipper offset does NOT scale** (15k buildings hung >60 s). The mask is raster (occupancy → dilate → fill-holes, ~6 ms). Don't "improve" it back into a polygon union.
- **Nothing here is eye-verified in the live app.** The operator's eye gates FILL/visual (`feedback_proxy_render_is_not_the_operator_eye`). I proved byte/triangle counts and code paths; Jacob must confirm Altadena *looks* right after the full bake + reload. Don't claim "confirmed" without his eye.
- **Nomenclature debt:** the Extent "Bake" button reads "Baking slab" — Jacob flagged it as imprecise, wants the vocabulary disciplined. Noted, not fixed.

**Pickup order I'd take:** #1 (clean LS — protect PROD) → #2 (see Altadena render whole) → #3 (Designer) → #4/#5 (polish + canon).
