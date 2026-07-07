# Arborist — Orientation (read this first)

**The front door.** Plain-language, no jargon — what the Arborist *is*, who it serves, where each piece's job starts and stops, and an honest note on what's real vs half-built. This is the shared mental model everything else hangs off. When the model here and the deeper docs disagree, **this doc is the model; the code is the truth** — fix whichever is wrong.

*(Agreed end-to-end with Jacob, 2026-07-07. Supersedes the competing "front door" framings — `README.md` is the contract/API, the quartet is the detail, `BATON`/`FOREST-BUILDER-KIT-MATCHER` are archived design records.)*

---

## What the Arborist is, in one breath

The Arborist is a **bounded service** that turns *"give me species X"* into **the best tree asset it can build for X**. It does **not** decide where trees go or how many — that's the neighborhood's business. Its whole job is: **species → a pristine, whole, unique tree asset.**

The **Cartograph** (the map/neighborhood pipeline) is its **client**.

---

## The chain — who owns what

```
CARTOGRAPH INTAKE                 ARBORIST  (the service)                 THE JOIN            RUNTIME
─────────────────                 ──────────────────────                 ────────            ───────
the real tree CENSUS              Library → Salon → Grove                 the BAKE            Slab → Universal
(where + which species,      ►    (species → pristine unique      ►       (census ×      ►    Reader
 regionally real)            "give  tree ASSETS, best-available)  "here    grove)              (draws it)
                              me X"                                are X"
```

- **Cartograph intake — owns *where* + *which*.** It holds the real tree **census**: 700+ placement points, each with a regionally-real species (from city/OSM/forestry data). It **asks the Arborist** for those species "at whatever level of detail it has."
- **Arborist — the service.** Three rooms:
  - **Library** — the **species-level catalog** the neighborhood draws from, backed by a substrate of reusable **parts** (chassis · bark · leaf). *"LS asks the Library for regionally-appropriate species."*
  - **Salon** — where a species that **needs work** gets **built or fixed** — one *unique* tree at a time.
  - **Grove** — the **~8–19 unique, pristine tree assets** that ship. It is the **truth window for the ASSET**: each unique tree, whole and final. It is *not* the 700-tree scene and never holds one.
- **The bake — the join.** The Cartograph places its **census × the Arborist's grove** — the few unique trees instanced across the many points.
- **Slab — the frozen placed scene.** Dumb. It is what it is handed.
- **Universal Reader — draws it.** Runtime only: per-frame frustum + occlusion + **LOD *selection*** against the live camera.

---

## The law (the boundary rules)

1. **The Arborist hands off pristine wholes.** When a unique tree leaves the **Grove** it is *final*: correct identity, baked true scale, its LOD ladder (lod0/1/2), its atlas. Nothing downstream may improve or repair the asset.
2. **The 700-tree *scene* is the Cartograph's, not the Arborist's.** Which species sits at each point, **substitution** to cover points from the few available trees, the **hero-pan cull** that trims *instances*, placement, scaling-per-instance — all downstream of the Grove. **The Grove never holds 700; the cull "isn't real" as an asset decision — it just trims copies of the same handful of trees.**
3. **The Slab is dumb; the Reader is runtime.** After the bake, nothing invents or drops a *unique asset* — only its *visibility* changes (per-frame frustum + LOD selection). "Smart" runtime work is fine **because it starts from pristine inputs.**

**Say it in one line:** *the Arborist prepares pristine unique trees; the Cartograph places the few across the many; the Slab freezes it; the Reader draws it — and nothing after the Grove alters an asset, only where and whether it's seen.*

---

## The two seams that must be daylight-tight

Everything unpredictable about LS trees lives on one of two seams:

1. **Salon preview ↔ Grove ↔ the baked unique GLB** — **asset parity.** What you author must equal what ships *as the asset*. Today it leaks: the Salon previews **lod0** but LS ships **lod1**; **botanical scale is preview-only** (not baked); some knobs (leaf tint, bark gradient) never reach the bake at all. → *close these; the Grove must be WYSIWYG for the asset.*
2. **Cartograph census ↔ Arborist grove** — the **species-key handoff.** The census says `quercus_alba`; the grove is keyed `oak_white`; the join can't match, so it **substitutes a different tree even though the right one exists**. → *align the species vocabulary across this one boundary.* **This is the single highest-value reliability fix** — it's not in the Grove and not in the Slab, it's the handshake.

The "wintery/sparse at noon" look sits on seam #1 (the unique asset renders as lod1 in fog/DoF, vs full-green lod0 on the Salon's neutral cyc). The "~50% substitution" sits on seam #2 (mostly *by design* — that's how you cover 700 points with ~8 trees — but the *avoidable* part is the key mismatch).

---

## Call it what it is: reskinning, not assembly

The "**create a species from parts**" pitch implies procedural **assembly** — grow a novel branch skeleton from primitives. That is **not** what the code does. What it does is **curate + reskin**:

- **Chassis** = a whole, pre-modeled vendor tree silhouette. You **pick from ~239**; you don't grow one. *A tree's identity is mostly its branch structure — and that's the one thing you can't compose.*
- **Bark** = always a texture swap.
- **Leaves** = the only genuinely composable part — reskin (default) or a real geometric respray (opt-in "synthesized").

This is fine — reskinning can look great **if the ~239 chassis cover the species the neighborhood asks for.** So it's a **coverage** problem, not a capability one. And the real bottleneck is **asset management**: the parts aren't sorted/tagged usefully, so the matcher under-reports what's buildable. **We can almost certainly build more species right now than we think — by fixing tagging/findability, not by building new capability.**

**Our procedural generator is not usable** and its workspace is hidden. (The overhead-canopy impostor is *procedural* and "fine" but faint — a placeholder to revisit before winter, not proof procedural is ready.)

---

## The LsoD — one honest paragraph

"LsoD" tangles three different axes: viewing **contexts** (Street / Hero / Browse) × geometry **LODs** (lod0/1/2) × render **tiers** (mesh / impostor / cull). Today it collapses to the simplest thing: **everything ships mesh + lod1; impostors are off (parked); ~37% of *instances* are hero-pan-culled.** The clean split to hold: **the LOD *ladder* is a Grove/prep product** (baked into the pristine asset); **LOD *selection* is runtime** (the Reader picks per camera). Settling the LsoD properly is open work.

---

## Honest state — live / parked / not-delivered

- **Live + real:** the rubric / matcher / coverage tools; the publish → bake → slab **spine** (byte-verified); the **Salon** plate-rack; the **Grove** bake (regenerate-from-source).
- **Parked / hidden:** the **procedural** + **LiDAR** workspaces (URL-only, hidden — leave hidden); the **impostor render arc** (built → reverted → parked); `BATON` + `FOREST-BUILDER-KIT-MATCHER` (design records → archive).
- **Dead knobs (being swept):** leaf **tint** (does nothing to the main tree), bark **gradient** (no control), the three **Add +** stubs, **Adopt** (removed 2026-07-07).
- **Not yet delivered:** "species from parts" proven perfect (the Sugar-Maple vertical slice was never signed off); leaf **color / season** ramp; **asset tagging**; and both **daylight-gap** closures above.

---

## Read order / route

1. **This doc** — the model.
2. **`README.md`** — the contract: inputs/outputs, API endpoints, CLI, ship-to-slab procedure.
3. The **quartet** — `FEATURES.md` (operator surface) · `ARCHITECTURE.md` (load-bearing patterns) · `BACKLOG.md` (in-flight / next) · `NOTES.md` (dated decisions).
4. `OPERATIONS.md` — the operator's manual (the real knobs + the ship procedure). *(To be written.)*

*Archived design records (history, not canon): `_archive/BATON-tree-render-next.md`, `_archive/FOREST-BUILDER-KIT-MATCHER.md`, `SPEC.md`, `STAGE0-KEYSTONE.md`, `LIBRARY-BUILDER.md`. `SALON-INTERFACE.md` stays as the Salon design doc.*
