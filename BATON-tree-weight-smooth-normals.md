# Baton — Arborist tree-weight, Cut 1: the smooth-normals base

> **Agent: FRESH** — name yourself when you pick this up. *(FRESH because it's a
> self-contained bake-pipeline task; no cross-arc continuity is load-bearing.)*
> Branch `curb-offset-draw`. **Paste-and-go:** this note is your whole launch
> brief; the deep reference is `HANDOFF-visibility-cull-lods.md` (read its ⚡
> CORRECTION banner first). The **eye-gate is Jacob's** — you hand him the
> before/after and stop.

## Route first (CLAUDE.md hard gate — read to the section, don't grep-and-go)
`ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → `HANDOFF-visibility-cull-lods.md`
**§⚡ CORRECTION banner** (the real fix; SKIP "Cut A") + keep **§"THE STRATEGY → Cut B"**
and **§"the three contexts"** for *later* batons only. Then the repro harness
`scratch/LINDEN-*.mjs` and the decimation/`simplify` step in `bake-trees.js`.

## Your task — ONE cut, not the arc
Fix the decimation floor so the tree GLBs are actually light, then wire it into
the bake. **Only the smooth-normals base** — visibility culling (Cut B) and the
per-context Street/Hero/Browse LODs are *later* batons, not this one.

## The thing that makes this small (don't miss it)
The "16 MB GLBs, `simplify` can't shrink them" wall is **NOT UV-lock — it's FLAT
NORMALS.** Per-face normals split the bark into a triangle-soup with no shared
edges, so the texture-safe `simplify` no-ops (byte-identical = the "127K floor").
**The fix is three boring steps — no re-UV / re-bake / xatlas / render-to-texture:**

```
smooth (recompute vertex normals) → weld (merge coincident verts) → simplify
```

**Proven + measured** (re-confirm, don't re-derive): `82,822 → 20,130 → 1,001`
tris; a full tree **16.2 MB×3 → 5.5 / 2.2 / 1.1 MB** real LOD ladder. Repro:
`scratch/LINDEN-*.mjs`. Memory: `tree-weight-wall-is-flat-normals`.

## Steps
1. **Re-confirm in scratch** on a 16 MB offender (`ash_green`): smooth → weld →
   simplify; print the tri ladder + byte sizes; match (≈) the numbers above.
2. **Wire into the bake** — fold smooth-normals + weld **before** the existing
   `simplify` in `bake-trees.js`. Don't touch the atlas/UVs or the bloom
   single-program constraint. Produce a real lod0/1/2 ladder.
3. **Regenerate + measure** — re-bake; confirm the published set drops from
   ~1.7 GB toward the real ladder, and the Grove stops context-losing (it OOM'd
   on the 16 MB meshes).
4. **STOP at the eye-gate** — render before/after and hand to Jacob. Do NOT
   self-approve the look.

## The eye-gate is Jacob's
Smooth-shading the bark turns **faceted → smooth** — a real look change that
**needs his eye in the Salon** (`feedback_proxy_render_is_not_the_operator_eye`).

## Gotchas (banked — don't rediscover)
- Phase-1 `/grove/bake` regenerate needs an **arborist backend restart** to go live.
- `GeoTierDriver` (`InstancedTrees.jsx`) is **moot + risky until the LODs are
  light** — leave it gated off; don't lean on it this baton.
- **Commit only your own files** (selective `git add`) — there's in-flight
  Preview/post-stack work + an uncommitted slab in the tree; leave it untouched.
- Verify in the **lit app**, never a proxy render.

## Hand back to Jacob
The tri/byte ladder · the bake diff (files touched) · the before/after render for
his eye-gate · any surprise vs the measured numbers.
