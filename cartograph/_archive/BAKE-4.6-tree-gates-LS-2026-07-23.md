# BAKE §4.6 as it stood before 2026-09-26 — the LS tree-gate table (measured 2026-07-23)

Retired from `cartograph/BAKE.md §4.6` on 2026-09-26: its counts were a single town's, dated, and no longer reproduced (LS bakes 5111, not 5001). The live home is `BAKE.md §4.6`, which carries the rule and the commands.

## 4.6 What the tree gates actually exclude (measured 2026-07-23)

Harness: **`scratch/tree-lu-exclusion-census.mjs`** (read-only; runs the *same* `makeZoneTester` the bake uses against the *same* frozen shape, so it reports the real gate). LS, census union **6767**:

| gate | trees | share | |
|---|---|---|---|
| **hardscape PAINT** — pavement 713 · sidewalk 569 · asphalt 293 · parking_lot 70 · curb 38 · footway 14 · alley 5 · building 5 | **1707** | 25.2% | our strips are *guesses*, so surveyed trees here get **nudged**, not dropped |
| **LU allow-model** — `lu:parking` 371 · `lu:commercial` 186 · `lu:unknown` 80 | **637** | **9.4%** | the hard-typed land-use interiors |
| kept (`treelawn` 513 + `lu` 3910) | 4423 | 65.4% | |

⭐ **The LU allow-model is the SMALLER gate — 637 trees, 9.4%.** Relaxing it is a modest, bounded win: flip a class to `soft` in **`cartograph/data/<scene>/lu-policy.json`** (`{"commercial":"soft"}`) — a per-scene override, no kit edit. Kit defaults + the reasoning live in `cartograph/lu-policy.mjs` (unrecognized classes already default **soft + loud**, the HPDM bald-blocks fix).

⚠️ **Read these as "which gate bites," not as a yield.** The zone verdict is not the bake's final answer: `bake-trees.js` then dedups across wells and **nudges** trees from *surveyed* wells onto legal ground rather than dropping them (only *invented* wells are dropped). That is why LS bakes **5001** — more than the 4423 raw-kept.

