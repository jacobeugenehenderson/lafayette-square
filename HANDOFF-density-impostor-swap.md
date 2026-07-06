# HANDOFF — the density swap: make HiPointe's 7,167 trees lightweight

> **Agent: FRESH → name yourself.** **Foreground** (background writes are denied). **Worktree** (`isolation: worktree`).
> **⏳ DISPATCH AFTER `HANDOFF-overhead-hula-impostor.md` LANDS + MERGES** (or run as a WARM continuation of that agent). This brief's runtime step routes impostor-role trees to that brief's `buildOverheadHulaGeometry`, and both edit `src/components/InstancedTrees.jsx` — do **not** run them in parallel on that shared file (`feedback_load_bearing_files_serial_dispatch`). The **bake-policy** half (steps 1–2) is independent of D1 and can be built/validated first if you want to start before D1 merges.

## Route first (the CLAUDE.md gate)
`ORIENTATION.md` → `arborist/README.md §⭐ START HERE` → `BATON-tree-render-next.md` (the role-at-bake + optical-parity doctrine; "Browse gets its OWN role oracle"). This is the tree-render **role/tiering** layer, decided at bake.

## The task, in one line
HiPointe-DeMun renders **all 7,167 trees as full `lod1` mesh** today. Make the bulk swap to the cheap **overhead hula impostor** (from D1) so the neighborhood is lightweight from above — **without deleting the forest** and **without touching the LS demo's all-mesh look.**

## Why they're all mesh right now (VERIFIED — don't re-derive, fix these)
`public/baked/hipointe-demun/trees.json`: 7,167 instances, every `heroTier: (none)`, `heroTierMeta: null`. Three coupled causes:
1. **The classifier was run against the WRONG look.** `bakeTrees` defaults `--heroLook lafayette-square` (`bake-trees.js:455`), so HiPointe's trees were scored against **LS's** hero pan, not their own.
2. **The canopy-dims join is broken.** HiPointe's placement `variantId`s have **0/5 coverage** in its `trees-atlas.json#canopyByVariant` (17 keys, none matching the 5 placement variants). The classifier needs `canopies.length === instances.length` (`bake-trees.js:584`) — with the join broken it skips (→ `heroTierMeta: null`) or falls back to junk dims. **Diagnose the variantId key mismatch** (bake-look writes `canopyByVariant`; bake-trees reads it — the keys must be the same variant identity on both sides; this is a `feedback_customs_identity_must_unify_across_consumers`-class bug).
3. **`PROM_THRESHOLD: 0` is deliberate** (`bake-trees.js:252`) — it keeps the **LS demo** all-mesh on purpose. With threshold 0, `m >= 0` is always true → every classified tree → mesh. The comment itself names 7,167-scale as the "real signal" that restores a front-row dial. **This is that signal.**

## ⛔ THE TRAP — do NOT hero-frustum-cull an overhead scene
`classifyHeroTiers` tags a tree `cull` if it's **never seen in the hero frustum** (`bake-trees.js:406`, `everSeen[i]`). HiPointe is viewed **from directly overhead**; its hero pan is 3 horizontal keyframes, so **most of the 7,167 never enter the hero frustum** → the hero-pan classifier would **cull the entire overhead forest.** The overhead view shows *all* trees at once — hero-frustum absence must NOT drop them. **For an overhead-primary scene, "not seen by the hero pan" → `impostor`, never `cull`.** Only a genuinely always-occluded-from-above tree is a cull candidate, and that needs an overhead occlusion test, not the hero one — so for the blunt pass, **default to no cull** (or a conservative overhead-occlusion cull only). This is the one thing you cannot get wrong.

## The policy to build (BLUNT first — Jacob's call; the fine Browse oracle is deferred)
A **per-scene tiering policy**, defaulting to the current LS behavior so LS is byte-untouched:
- **`promThreshold` becomes a per-bake parameter** threaded through `bakeTrees({ ..., promThreshold })` + a `--promThreshold` CLI arg, **default 0** (LS demo unchanged — verify LS re-bakes byte-identical). Set it aggressive for HiPointe (`bake-trees.js` comment gives the LS calibration: `0.02→469 mesh · 0.05→194 · 0.07→38`; HiPointe is denser/different — pick by the resulting histogram + Jacob's eye, not a magic number).
- **HiPointe intent:** the bulk → `impostor` (overhead hula), a hero front-row (if any hero shots exist — `m ≥ promThreshold`) → `mesh`, **no hero-frustum cull** (the trap above). Expect a histogram like *a few hundred mesh + ~thousands impostor + minimal/zero cull*, not the current all-mesh.
- Where the per-scene value lives: cleanest is a per-look bake config (so `/grove/bake?look=hipointe-demun` picks it up) — but **default-0-safe** is the hard requirement; choose the home that keeps LS at 0 with no per-invocation flag needed. Respect *scene = dataset + a per-scene knob, NOT a forked pipeline* (`feedback_no_parallel_pipeline_for_scenes`).

## The runtime swap (depends on D1)
Once tiers exist, `InstancedTrees.jsx` **already** routes `inst.heroTier === 'impostor'` → `ImpostorSpecies` and drops `'cull'` (the grouping memo ~L713-739); mesh-role → `lodForRole` → `lod1` (correct, leave it). So the bake policy alone already diverts the bulk off the mesh path. The remaining work:
- **Route impostor-role → the OVERHEAD hula geometry** (`buildOverheadHulaGeometry` from D1), not the hero `buildImpostorGeometry` cross — HiPointe is overhead-primary and a top-down cross reads as an ugly line/X (the analytic-cross look Jacob killed 2026-06-25). Pick the view-appropriate impostor geometry for the scene. If D1 hasn't landed when you validate **perf**, the hero cross is acceptable **for the GPU/frame-ms measurement only, with the QC tint** — never as the ship look.

## Eye-gate (perf is real frame-ms + Jacob's eye, NOT the fake gauge)
- **Correctness:** HiPointe overhead shows the **complete** forest (no missing trees from a wrong cull); the tier histogram collapses mesh from 7,167 to a few hundred; LS re-bakes byte-identical (demo untouched).
- **Perf:** gate on **device / staging frame-ms** and the **smoothness of the overhead pan**, NOT the emulator GPU gauge — that gauge is a count-vs-fake-budget verdict that reads red with zero trees and was never a real signal (`bake-trees.js:252` comment; `feedback_instrument_verdict_then_fix`; `[[preview-equals-pyramid-tier-ladder]]`). The win is: 7,167 mesh → hundreds of mesh + thousands of ~dozen-quad billboards.
- **`feedback_dont_claim_confirmed_without_verifying`** — drive the actual HiPointe overhead in the app; report the histogram + the frame-ms before/after.

## Scope + commit boundaries
- **In scope:** the per-scene tiering policy + the canopy-join fix + the classifier-run fix + the impostor-geometry routing for overhead scenes. **Out of scope:** the fine Browse role oracle (deferred), the D1 look-authoring, any LS look change.
- Worktree branch; **canon docs off-limits** (Boz folds the outcome into `bake-trees.js`/`arborist` canon + `BATON` after eye-gate). Commit only your own files. Surface scope drift before crossing it (`feedback_baby_must_surface_scope_drift`).
- ⚠️ Re-bake artifacts: `/grove/bake?look=hipointe-demun` is the full regenerate-from-source chain; commit-or-discard the resulting baked JSON is Jacob's call.
