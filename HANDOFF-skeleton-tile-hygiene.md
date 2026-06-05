# HANDOFF — Skeleton & tile hygiene (de-risk pass)

**Goal:** excise the verified corpse-lies that have **no geometry effect** — remove one real drift source + several landmines/stale comments, so the next work builds on clean ground. Smallest, safest dispatch; do it first.

**Agent: FRESH** (you are the dispatched agent — pick a one-word name and use it). **`isolation: worktree`** (mutates code; may run parallel to other briefs). General-purpose.

**Read first (to the section):** `cartograph/DOC-CODE-COHERENCE.md` rows **C1, C2, C9, C10, C11** (your worklist) · `cartograph/SKELETON.md §3` (the build stages) · `cartograph/ARCHITECTURE.md §7` "Bake writes go through `io.js`'s `writeIfChanged`" (the contract you're restoring) · how `pipeline.js` / `promote-ribbons.js` already call `writeIfChanged`.

**Boundaries:** code + the `DOC-CODE-COHERENCE.md` ledger only. ⛔ Do **not** touch the canonical Reference docs (`SKELETON.md` etc.) — Boz conforms those. ⛔ **No geometry changes** — `skeleton.json` content must stay byte-identical. Commit on your worktree branch; report commit refs.

**The tasks (all verified, mechanical):**
1. **C10 — the drift gremlin (highest value).** `skeleton.js:1193` writes `skeleton.json` with plain `writeFileSync`. Switch it to `io.js writeIfChanged` (mirror `pipeline.js`/`promote-ribbons.js`). Why: `skeleton.json` is a `needsRebuild` input (`serve.js:57,532`), so every `skeleton.js` run currently bumps its mtime → forces a full `ribbons.json`+bake rebuild even when content is identical → the "byte-identical inputs, regression appeared" drift class.
2. **C9 — dead code.** Delete `simplify()` (`skeleton.js:593-632`) — the old junction-blind local filter, replaced by `simplifyRDP`; confirm **no caller** (only a comment ref at `:973`; update that comment to name `simplifyRDP`/the protected-keys mechanism).
3. **C1** — `tileGround.js:6-10`: remove the stale *"TRANSITIONAL: TOY only; LS stays on figure-ground … NOT a kept scene-flag"* lines; state plainly that LS runs tiles unflagged (`isTileScene = true`).
4. **C2** — `bake-ground.js:30`: drop *"T1 — toy tiles (transitional)"* from the import comment.
5. **C11** — `tileGround.js:893-895`: trim the stale `R-CLAMP:` comment header (the code does **no** clamp; `:898` says so).

**Done:** `node skeleton.js && node pipeline.js && node promote-ribbons.js` run clean; **`skeleton.json` byte-identical** to pre-change (the whole point — pure hygiene); running `skeleton.js` a second time with no input change does **not** force a downstream rebuild (confirm `needsRebuild` skips); no `simplify()` symbol remains; comments match code. Flip C1/C2/C9/C10/C11 → ✅ in the ledger with your commit ref. **Verify the no-spurious-rebuild claim concretely (run twice, observe the skip).**

**Out of scope:** any geometry/behaviour change · deleting `buildBlockGeometryV2`/figure-ground (that's T4) · the divided-corner / prebake work.
