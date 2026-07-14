# HANDOFF — Altadena pour: identity + ground perf

**To:** the next Boz. **From:** the 2026-07-14 session. **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md gate): `ORIENTATION.md` → `README §⭐ START HERE` → this + [[project_altadena_pour_identity_and_ground_perf]]. Sibling context: [[project_altadena_mountain_landscape_hero]], [[project_extent_pen_boundary]].

You are Boz. Jacob was pouring **Altadena** — a NEW hood, the whole **Census-Designated Place** (~15,397 buildings, ≈2× the real walkable neighborhood). It went badly in three compounding ways; all root causes are now fixed and committed. This baton carries what landed, the doctrine we settled, and the open tail.

---

## The incident (why this arc exists)

Jacob was in the Designer on Altadena. Symptoms, in the order they surfaced: buildings vanished after a bake → gray screen → the tab said "Cartograph — Lafayette Square" while he was in Altadena → the browser froze ("Page Unresponsive") on a 432 MB ground. Three independent bugs, not one:

1. **Identity** — Altadena had a *scene* but no *Look*, so baking fell back to the default (`lafayette-square`) Look and **clobbered LS's slab**.
2. **Landscape** — the San Gabriel mountain model was auto-swept into the pour because a `sangabriel.obj` sat in the scene's data dir.
3. **Ground** — the flat land-use fills were tessellated to 23.6M triangles / 432 MB, which froze the tab.

---

## LANDED (committed on `curb-offset-draw`)

- **`69825d1a` fix(extent): first bake out of Extent creates a Look.** `ExtentApp.jsx` — the committed-hood `onBuild` re-apply branch baked only IF a Look existed and never created one, so `activeLook` stayed on `lafayette-square`. Now mirrors the first-pour branch. **Root fix for the masquerade.**
- **`a20619cc` fix(bake): landscape is an explicit Stage intake.** `serve.js` — was gated on `existsSync(data/<scene>/terrain/sangabriel.obj)`; now on `design.landscape.source` (explicit Look opt-in). Altadena's terrain assets moved out of the pour dir → `cartograph/_landscape-intake/altadena/` (untracked, local).
- **`304edcac` perf(ground): 432 MB → 18 MB (24×).** (a) `bake-ground.js` — the soft-fill refine seeded a fine **15 m mesh with no terrain to follow**; gated on a terrain sampler, no terrain → coarse 64 m cap. 432→43 MB. (Confirmed NOT terrain-conformance: re-bake with terrain gone was byte-identical.) (b) **Inhabited cull** (opt-in via `nb.contextMargin`, default 80 m; `src/lib/inhabitedMask.js` + `tileGround.js`) — drops ground tiles outside the developed footprint + one block of context. 43→18 MB.
- **`79bc1584` fix(designer): the Looks pulldown can't show/keep a foreign Look.** `Toolbar.jsx` — `looks` is GLOBAL and the label resolved `activeLookId` against all of it with **no scene check**, so it printed another hood's name ("Lafayette Square" while in Altadena; later "Altadena" while in LS). **Not cosmetic — the BAKE follows `activeLookId`**, so the mislabel is the mechanism that let one hood's slab clobber the other's. Label now falls back to the current scene's own Look, and the active Look **self-corrects** to the scene.

**Three independent guards now stand against a repeat:** Extent creates a Look (`69825d1a`) · landscape can't auto-sweep (`a20619cc`) · the pulldown can't hold a foreign Look (`79bc1584`).

**Also:** reverted `SceneMapLayers.jsx` (a re-clip removal made on a wrong premise; unneeded once the identity root was fixed).

---

## LS (PROD) — audited and RESTORED, 2026-07-14. Read this before touching LS.

Jacob got (rightly) worried LS had been "in the mix." Audit result: **LS is fully clean** — tracked and untracked, verified `center [-15,-15]`, no exclusions, 1082 buildings, `scene.json` with no landscape block, slab matching its authored design. My commits touched **zero** LS paths, and re-baking LS's ground produced a **byte-identical `ground.bin`** — the terrain-gate and cull are a proven no-op for LS (it has terrain; it has no `contextMargin`).

**But the audit found a real hazard — the one worth carrying forward:**

> **Applying/committing an extent on an already-authored hood RE-CENTERS it.** An LS Extent apply moved `center [-15,-15] → [0,0]`, added 2 exclusions, re-poured (1082→1081), reprojected `src/data/ribbons.json`, and re-baked the whole slab in the shifted frame. The **Look design survived** — which is the trap: `blockCustoms` / `blockLandUse` / corner overrides hash off **bbox-derived block keys**, plus shot bounds (`cx:95, cz:-158`) and hero keyframes. Shift the frame and authored work isn't deleted, it's **silently orphaned**. All of it was uncommitted; `git restore` recovered it exactly.

**Doctrine:** the exclusion-band / pen tooling is **Altadena-shaped**. LS predates it, is small and tight, and **does not want it** (Jacob: "LS doesn't need the cull because it's so much smaller and more manageable"). Don't re-author a dialed-in hood's extent.

---

## Doctrine we settled (don't re-derive)

- **Cartograph pours the 2D record → a FLAT neighborhood. The 3D landscape MODEL is a STAGE intake**, uploaded deliberately per-Look — **never** auto-detected from files in `data/<scene>/`. ("Theoretically the operator hasn't uploaded it yet.")
- **A flat square is two triangles.** Fine ground subdivision exists *only* to let the runtime bend the mesh over terrain. No terrain → no fine mesh. (Jacob caught this; I wrongly blamed terrain twice before routing to canon.)
- **The inhabited cull is Jacob's design, verbatim:** find the streets/blocks *with buildings* → **offset that SHAPE outward one block** → blend. Park-safe (hole-fill keeps enclosed greens). **Not radial.** Derived from the *member* buildings, so the pen's exclusion loops flow through automatically. **Opt-in per hood.** The margin is a **knob** (`nb.contextMargin`), never hardwired.
- **Automatic now, editable band later** — expose the derived inhabited edge as an operator-nudgeable band in a future pass; automatic for now.

---

## OPEN — the tail (prioritized)

1. **Full Altadena slab bake.** `scene.json`/`trees`/`lamps` are from partial bakes. Run `POST /looks/altadena/bake` (force) — it won't crash now (ground is 805k tris; the `groundSampler` `RangeError` is gone). This is what renders Altadena **end-to-end in Stage / Preview / Production** (Jacob's stated goal). Trees over 15k buildings is heavy/slow — set expectations.
2. **Wire the Designer 2D cull.** The bake path is done, but the Designer's *live* 2D ground renders through **`buildBlockGeometryV2`** (`BlockGeometryV2Debug.jsx:430`), a DIFFERENT emitter than the bake's `buildTileGround` — and possibly the `SceneMapLayers` overlay. **Trace which emitter actually draws the green fills before wiring.** Load-bearing 2D path — don't guess.
3. **`LANDSCAPE_FLAT_DEFAULTS` is misnamed** (`src/cartograph/skyLightChannels.js:257`). It holds the real San Gabriel values (`snowline: 1500`…), so `bake-scene.js:134` stamps mountain config into *every* `scene.json`. Inert (no GLB → nothing renders), but should be omitted when there's no landscape source. Don't touch the shared channel UI defaults.
4. **Nomenclature debt.** The Extent "Bake" button reads "Baking slab" — Jacob flagged it as imprecise and wants the vocabulary disciplined. Noted, not fixed.
5. **Canon folds owed** (from the pen-boundary arc): fold the pour/Look + landscape-intake doctrine into `NEIGHBORHOOD-INPUTS §11` / `INTAKE.md` / `README`.

*(DONE 2026-07-14: the 66 contaminated LS tree/atlas files — restored + cleaned; LS verified fully clean.)*

---

## Gotchas the next Boz must not relearn the hard way

- **The cull balloon.** Culling tiles *alone* INCREASES triangles — the perimeter fill (`tileGround.js:3151`, `differenceRings([stencil], tileUnion)`) re-fills the culled void because the stencil is still the full disc (+1.6M tris). The fix (in place): when `opts.tileKeep`, the frame becomes `intersectRings([stencil], offsetRings(tileUnion, cullMargin))`. Keep the frame tied to the kept tiles.
- **Per-building Clipper offset does NOT scale** (15k buildings hung >60 s). The mask is raster (occupancy → dilate → fill-holes, ~6 ms). Don't "improve" it back into a polygon union.
- **NEVER partial-bake against PROD.** Running `bake-ground.js` standalone **drops `poolmap`/`colormap` from `ground.json`** (it skips those steps) — I did this to LS while "verifying" and had to restore. Use the full bake path, or don't touch LS.
- **Nothing here is eye-verified in the live app.** The operator's eye gates FILL/visual (`feedback_proxy_render_is_not_the_operator_eye`). Triangle counts and code paths are proven; Jacob must confirm Altadena *looks* right after the full bake + reload. Don't claim "confirmed" without his eye.

**Pickup order I'd take:** #1 (see Altadena render whole) → #2 (Designer) → #3/#4/#5 (polish + canon).
