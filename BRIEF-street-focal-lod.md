# BRIEF — per-instance Street-focal LOD (the real bark-seam fix)

> **Status: SCOPED, not built. 2026-06-23 (Linden).** Dispatch-ready. This is the fix the bark-seam investigation converged on, and the same change that resolves the Street-lod0 weight problem and finally makes the high-pass bark detail pay off. Prereq landed: the tree-weight wall + LOD ladder + Browse fix (commits `6c3ff5e5`, `3be3ba03`).

## ▶ Why this exists — it solves THREE things at once

1. **The bark seam smear on the near tree (the real fix).** Reducing the tiled bark mesh makes triangles bridge the UV-tiling seams → stretch/mip-blur (the "cross + swirls" on the Street maple). Seam-locking curbs the worst of it but can't eliminate it — *any* reduction smears. The only true fix is **don't reduce the bark you're standing next to.** See the seam explanation in the session notes / `[[tree-weight-wall-is-flat-normals]]`.
2. **The Street-lod0 OOM.** `GeoTierDriver` uses a **single global** `geoTier` (`InstancedTrees.jsx:483`): at street distance it swaps **every** tree to lod0 (`:542`). lod0 is heavy (crisp bark; linden lod0 = 12 MB). 745 placements × lod0 = the same ~94M-tri wall the weight fix just escaped. So today lod0 bark is *forced* to stay reduced/smeared — we can't make it crisp for all trees.
3. **The high-pass bark detail (Cinder, Brief 2.1a) never pays off.** It adds fine bark crispness at tier 2 (street) — but rides the *same* smeared lod0 UVs, so the detail it adds is stretched right where you'd want it. On an un-smeared focal tree it would finally land.

**The unlock:** make LOD **per-instance** — only the 1–few trees nearest the camera (the *focal* set) load lod0 (crisp, full-res bark, no smear); everything else loads lod1/lod2 by distance. With only 1–3 heavy lod0 trees resident, heavy/crisp lod0 is affordable, the focal tree is smear-free, and the detail layer lands.

## Current state (what's built, what blocks)

- `GeoTierDriver` (`InstancedTrees.jsx:418`) reads `computeTier(camera)` (browse→0 / hero→1 / street→2), debounced 0.25s, and sets one **global** `geoTier`.
- The `groups` memo (`:489–589`) buckets placements by **(variant URL × tile)** into InstancedMeshes; `lodKey = geoTier===0?'lod2':geoTier===2?'lod0':'lod1'` (`:542`) picks **one LOD for the whole forest**.
- lod0 bark is still *reduced* (Lever 5 → ~13–20K tris, seam-locked) — so even the focal tree isn't fully crisp yet. **Per-instance focal must be paired with raising the focal lod0 bark toward full-res** (affordable because few load) to actually kill the smear. See "lod0 bark" below.

## The hard design question — instancing (decide first)

Per-instance visibility/LOD fights instancing (the whole forest is `(species,variant)` InstancedMeshes). Two shapes (from the visibility-cull handoff):
- **Per-variant** (conservative): the bulk stays instanced at the global tier; preserves draw-call economy. **Recommended for the bulk.**
- **Per-placement** (focal only): the nearest N placements become **unique** lod0 meshes (a few extra draw calls — fine for 1–3 trees). **Recommended for the focal set only.**

**Recommended hybrid:** keep the existing instanced path for the bulk, but change the *bulk* street LOD from lod0 → **lod1**, and add a small **focal group** that renders the nearest 1–3 placements at **lod0** (unique, non-instanced or tiny instanced), debounced on focal-set change like `GeoTierDriver`.

## Implementation sketch

1. **Focal selector** (new, mirrors `GeoTierDriver`): each frame, when `computeTier===2` (street), find the nearest 1–N placements to the camera within a focal radius. Debounce changes (~0.25s, like the LOD swap) so walking doesn't thrash. Emit the focal placement IDs.
2. **Bulk LOD:** change `:542` so street maps the *bulk* to **lod1** (not lod0). The bulk stays instanced + light; no OOM.
3. **Focal group:** render the focal placements at **lod0** in a dedicated small group (its own `useGLTF(lod0url)`), with the same material/bark uniforms/sway. Pop is acceptable at first; fade/scale-in is the polish.
4. **lod0 bark = crisp for focal.** Today lod0 bark is reduced (smears). Since only 1–3 lod0 trees load, make the focal lod0 bark **full or near-full res** — options: (a) skip Lever 5 + emitLod bark reduction for lod0, or (b) a dedicated `lod0-focal` emit with bark target ≈ source. Validate by eye that the seam smear is gone on the focal tree.
5. **DoF coupling (the Street strategy):** background (bulk lod1) trees sit behind the focal tree → DoF-blur them (the handoff's "DoF is the cover"). The blur hides that the bulk isn't full-res. This is the concrete Street context: 1 full focal + N hero-lod1 + DoF.

## Acceptance (operator's eye, lit app — proxies lie)

- Walk up to a tree in Street → **its bark is crisp, no seam cross/swirls**; the high-pass detail visibly lands.
- The rest of the forest stays light; **no black screen / context loss** at street.
- Walking between trees re-targets the focal tree without thrash or a load storm.
- linden_american focal tree is crisp too (its lod0 is the heavy 12 MB — fine for 1 resident; if still too heavy, it's the species that most wants a proper re-UV, tracked separately).

## Open questions for standup

- **N focal trees:** 1 (just the nearest) or the nearest few? Start with 1, widen if the eye wants it.
- **Transition:** pop vs fade when the focal tree changes. Pop first, polish later.
- **Focal lod0 bark res:** how crisp is crisp enough — full source, or a high cap? Eye-gate it.
- **linden:** does the focal tree need linden's bark re-UV'd (the genuine UV-seam-dense holdout) before its focal lod0 looks right, or is full-res-but-dense acceptable up close?

## Files

- `src/components/InstancedTrees.jsx` — `GeoTierDriver` (`:418`), the `groups` memo + `lodKey` (`:542`), new focal selector + focal group.
- `arborist/publish-glb.js` / `arborist/decimate-tree.mjs` — optional `lod0` bark "keep crisp" path (skip reduction for the focal LOD).
- DoF: wherever the post-FX/DoF is configured (couple background blur to the focal context).

## Don't re-derive

- The seam smear is **not** fixable at low resolution — it's intrinsic to reducing a tiled mesh across UV seams. Seam-lock (landed) is the partial; **per-instance focal + crisp focal lod0 is the only true fix.**
- The bulk must **not** go to lod0 at street — that's the OOM. Only the focal set.
- Posterization already masks the smear at distance; the detail layer is the near-tree story. This brief is purely the near/focal tree.
