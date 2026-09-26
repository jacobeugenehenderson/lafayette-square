# Diary — ARCHITECTURE §4 SelecTree bullet, as it stood before 2026-09-25 (evicted 2026-09-26)

Superseded by the fix in `scratch/dossier-harvest.mjs` (acebbdf3: SelecTree takes the exact record or a
same-species cultivar, else skips) and held by `checks/claims-no-dossier-rests-on-a-wrong-species.mjs`.
Live home: `arborist/ARCHITECTURE.md` "The species pipeline" §4.

- **SelecTree** — queried by name, then: exact non-cultivar match → **any non-cultivar record** → first result.
  > ⛔⛔ **THAT MIDDLE STEP IS A FALLBACK, AND `|| res[0]` BEHIND IT IS A SECOND ONE** that can return a cultivar. "Any non-cultivar record" can be *a different species*: a `Sorbus americana` query returned **`Sorbus decora`**, and its traits were emitted behind an `unverified` flag. That is a fallback in the Layer 0 sense — no exact match became a plausible-looking wrong answer — and it produced the only bad data in batch 2. It is contained downstream (§7) but **containment is not the fix**; USDA's skip-on-mismatch is the shape SelecTree should take.
