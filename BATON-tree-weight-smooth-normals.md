# BATON — tree-weight fix, Cut 1: smooth-normals base (the universal weight cut)

> **Dispatch baton, 2026-06-24.** First task of the Arborist tree-weight arc.
> **Coordinated** by the Preview/post-stack session (the pyramid/device-regime
> agent) — **report results back to the coordinator**, who eye-gates with Jacob.
> **You are FRESH** — name yourself when you pick this up. Branch `curb-offset-draw`.

---

## The task (one cut, not the whole arc)
Make the tree GLBs actually light by fixing the **decimation floor**, then wire it
into the bake. This is **only the smooth-normals base cut** — the visibility cull
(Cut B) and the per-context LODs are a *later* topping, NOT this baton.

## ⚡ The thing that makes this small (don't miss it)
The wall everyone fought ("16 MB GLBs, `simplify` can't shrink them") is **NOT
UV-lock** — it's **FLAT NORMALS**. Per-face normals split the bark into a
triangle-soup with no shared edges, so the texture-safe `simplify` no-ops and
floors at ~127K tris (lod0=lod1 byte-identical). **The fix is three boring steps,
no re-UV / re-bake / xatlas / render-to-texture:**

```
smooth (recompute vertex normals) → weld (merge coincident verts) → simplify
```

**Already proven + measured** (don't re-derive — re-confirm): `82,822 → 20,130 →
1,001` tris; a full tree **16.2 MB×3 → 5.5 / 2.2 / 1.1 MB** real LOD ladder. Repro
harness: `scratch/LINDEN-*.mjs`. Memory: `tree-weight-wall-is-flat-normals`.
⛔ The `HANDOFF-visibility-cull-lods.md` body still describes "Cut A: re-UV +
re-bake" as the base — **that is superseded** (see its top banner). Ignore it.

## Route first (hard gate, CLAUDE.md)
`ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → `HANDOFF-visibility-cull-lods.md`
(read its ⚡ CORRECTION banner, skip Cut A, keep Cut B + the three-context map for
later). Then the repro harness `scratch/LINDEN-*.mjs` and the bake decimation in
`bake-trees.js`.

## Steps
1. **Re-confirm the fix in a scratch harness** on a known offender (`ash_green` —
   a 16 MB tree): smooth → weld → simplify; print the tri ladder + byte sizes.
   Match (≈) the measured numbers above. Cheap; it's the proof the wiring will rest on.
2. **Wire it into the bake** — fold smooth-normals + weld **before** the existing
   `simplify` step in the tree decimation (`bake-trees.js`). Don't change the
   atlas/UVs or the bloom single-program constraint. Produce a real lod0/1/2 ladder.
3. **Regenerate + measure** — re-bake the trees; confirm the published set drops
   from ~1.7 GB toward the real ladder, and the Grove stops context-losing (it was
   OOM'ing on the 16 MB meshes).
4. **STOP at the eye-gate.** Render the new LODs and report to the coordinator —
   do **not** self-approve the look.

## The eye-gate (the operator's, not yours)
Smooth-shading the bark turns **faceted → smooth**; that's a real look change that
**needs Jacob's eye in the Salon** (`feedback_proxy_render_is_not_the_operator_eye`).
Hand the before/after to the coordinator; Jacob calls it.

## Gotchas (banked — don't rediscover)
- Phase-1 `/grove/bake` regenerate needs an **arborist backend restart** to go live.
- `GeoTierDriver` in `InstancedTrees.jsx` is **moot + risky until the LODs are
  actually light** — leave it gated off / don't lean on it this baton.
- **Commit only your own files** (selective `git add`). The working tree has the
  coordinator's Preview/post-stack work + uncommitted slab — **do not touch it**.
- Verify in the **lit app**, never a proxy render.

## Scope boundary
In: the smooth-normals base weight fix + its bake wiring + the measurement.
Out (later batons): visibility culling (Cut B), per-context Street/Hero/Browse
LODs, the Salon per-context knobs, frustum culling. One cut, clean, eye-gated.

## Report back to the coordinator
The tri/byte ladder you measured · the bake wiring diff (files touched) · the
before/after render for Jacob's eye-gate · any surprise vs the measured numbers.
