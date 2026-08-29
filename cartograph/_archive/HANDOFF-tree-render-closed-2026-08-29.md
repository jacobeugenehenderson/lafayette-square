# Diary — the two closed entries from HANDOFF-tree-render, retired 2026-08-29

Both were marked ✅ CLOSED and left sitting in that handoff's OPEN list, which
`CLAUDE.md` names as the anti-pattern: a resolved item kept "for context" is read as
work by everyone who scans the list afterwards. They are here so nothing is lost, and
their live homes are named so nobody has to come looking.

**Live homes.** The capture-frame mechanism is enforced by
`scratch/claims-the-capture-frame-is-the-clip-frame.mjs`, and OPEN item 0 in the
handoff carries what is still owed on it (the fix has not propagated). The
duplicate-identity rule is written up in `arborist/FEATURES` ▸ the roster light, and
in `[[project_one_tree_two_library_ids]]`.

---

1. ✅ **`maple_silver`'s overhead capture — CLOSED.** The band cuts were computed in the chassis-LOCAL
   frame; the camera clips in WORLD (`camY − y`). Node scale <1 put the top cut above the crown:
   `maple_silver` (0.707) retained **2%** of its canopy band, `linden_american` (0.782) 27% — the
   *"unexplained"* blank canopy of 2026-07-22, same mechanism — `tilia_americana` (0.004) nothing at
   all. Scale ≥1 pushed the cuts inside the crown and passed, every time, which is why it looked
   species-specific. ⭐ The same slip shipped the **card height** in the wrong frame roster-wide
   (`maple_silver` 29.7 m for a 21.0 m tree; HPDM's `picea_abies` **681 m**) — ⛔ **every Look baked
   before today must re-bake.** Fixed in `captureImpostor.js`; ▶ `node scratch/claims-the-capture-frame-is-the-clip-frame.mjs`.
   ⚠️ **Jacob's *"silver maple leaves have fronts and backs"* hint is UNACCOUNTED FOR** — it points at
   colour and nothing measured here touches colour. Still open as its own question, not as this bug.
2. ✅ **The duplicate-identity class — CLOSED 2026-08-28** (`a56328dd` · corrected `deab54ed`).
   `pickVariant` now swaps a raw twin for its composed sibling, looked up in the whole POOL and
   gated by the same style filter. Verified by re-baking: LS 670 → **0** placements on a raw twin.
   ⛔ Deliberately NOT the "fallback may only select a COMPOSED asset" this line prescribed — I built
   that first and measured it: every composed asset is broadleaf, so it renders spruces as maples and
   would have restyled 4,375 of HPDM's 8,346 placements, most of them genuine gaps rather than twins.
   ⭐ Quality is not the discriminator either (all four species are quality 4); composed ⟺ the
   manifest carries a `bark` record. [[project_one_tree_two_library_ids]]
