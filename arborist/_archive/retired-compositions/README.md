# Retired compositions

⛔ **Archived, never deleted** — a composition is the operator's authoring
(`feedback_archive_dont_delete_ask_before_big_edits`). Restore by copying the file back to
`arborist/state/<species>/compositions.json` and re-baking.

- **`acer_saccharum-compositions-2026-08-27.json`** — retired 2026-08-27 (Jacob: *"retire the
  acer_saccharum row"*). A `"Brief 7 smoke test"` recipe that reached **516 placements, 10% of
  the LS map**: chassis `sugar_maple_low_poly_forest_o` (a STAND of ~20 trees, 106 m across for a
  10.4 m tree), `leaves.mode: synthesized` (the kit spray — leaves not on the branches), and a
  `#ff0000 → #0000ff` bark gradient, the only one in the LS atlas.
  ⭐ **The gradient is why re-authoring could not have saved it:** `bark.gradientStops` has NO UI
  anywhere in `src/` — the multi-stop editor was swept 2026-06-25 as "superseded by the rubric
  colour axis + posterize", the editor went and the authored value stayed. A new chassis, new
  leaves and new bark would all have applied; the red would not have moved.
  ⇒ `acer_saccharum` and `maple_sugar` are ONE species (`1ebdcdfc`); census "Maple, Sugar" now
  routes to `maple_sugar`, which carries a single-trunk chassis and authored leaves.
