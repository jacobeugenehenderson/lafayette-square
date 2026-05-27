# The Audit Matrix — shared instrument for the forensic campaign

> One spec, filled per domain by each pathologist. This is the boat survey: walk every
> environment, inventory every asset + behavior, classify it, and note what cleaning it
> unlocks. Read-only — no code changes during the audit. See the campaign record in
> memory (`project_forensic_audit_and_productization_campaign`) and the productization
> horizons in `plans/front-front-end-and-productization.md`.

## How to deploy it

1. Each pathologist fills **their domain's rows** as a markdown table in **their own report
   file** (`scratch/audit-<domain>.md`) — separate files so the parallel walks don't collide.
2. The **Documentation Officer** aggregates the domain tables into the master matrix → the
   Show Bible.
3. Findings route by column: `remove` → Boz sign-off before deletion · `duct-tape` →
   fix-ticket · `blocked-on` → release sequence · `productization` → settings/slab/API.

## The rendering environments (the rows are walked across these)

`Designer` (Survey / Measure / Design) · `Toy` · `Stage` · `Preview-Desktop` ·
`Preview-Mobile` · `Production (the LS app)`. The Arborist walks the tree surfaces
(Salon / Grove + these); Meteorologist (cloud specialist, in flight) walks the sky/weather
surfaces; Cartograph walks the authoring corpus; the LS App Pathologist walks Production +
the integration/emit seam.

## Cross-cutting threads (co-owned, reconcile existing — do NOT design from scratch)

Some concerns span domains; two pathologists co-own and reconcile what already exists:

- **CSS / design tokens.** **CORRECTED by the LS App audit (Lintel, 2026-05-27):** the original
  premise "`design.css` + `lsq-tokens.css` are duplicate token files → reconcile to one" was
  half-wrong — they have **zero variable overlap**; they're two *different apps'* token sets (the
  LS app vs. the CodeDesk QR tool). **LS's app token source is already singular** — not a problem.
  The **real** duplication is *inside* CodeDesk (`lsq-tokens.css` ⟷ `theme.css` inline copy), and
  separately `cartograph.css` runs its own parallel `--carto-*` set + ~10 raw hex (Cartograph audit).
  So the CSS work is NOT "merge LS's two token files" — it's: dedup CodeDesk internally, and decide
  whether `cartograph.css`'s token set should align to LS's or stay the tool's own. Doc Officer:
  do not propagate the original mislabel.
- **Mobile.** LS App owns the *shipped* mobile regime + integration; Cartograph owns
  authoring/preview-mobile (the Stage Mobile|Desktop tab); collaborate. `IS_MOBILE` is already
  one source (`src/lib/isMobile.js`).

## Columns (per item)

| Column | What it captures |
|---|---|
| **Item / Location** | Feature or asset + where it lives (`file:symbol`). |
| **Environments** | Which of the environments above it appears in. |
| **What it is** | One plain line. |
| **Capability statement** | "You can do X." The marketing line — **and the dead-code detector: if this reads as nonsense ("marry a man in South America in one click"), flag it.** |
| **Source(s) of truth** | Where its data/config lives. Flag **duplication** and **hard-wiring** (hardcoded LS-specifics). |
| **Cruft-class** | `real` (keep) · `duct-tape` (load-bearing hack → **fix/replace, never just remove**) · `vestigial` (dead → remove). |
| **Action** | `keep` · `fix` (with the real solution sketched) · `remove` (**with evidence it's dead**). |
| **Blocked-on / releases** | If it's a knot: what's stuck behind it, and what ships when it's untied. |
| **Productization unlock** | `future-setting` (tier 1, front-front-end) · `slab-field` (tier 2, the format) · `api-route` (tier 4) · `none`. |
| **Conflicts / notes** | Collisions with other items; Stage↔Production divergence; contract violations. |

## The two rules that keep the rip-up from sinking the boat

1. **Classify before cutting.** The danger isn't dead code — it's mistaking **duct-tape**
   (load-bearing) for **vestigial** (dead) and punching a hole in the hull (the
   `frustumCulled`-looked-vestigial / camera-looked-like-bloom failure mode). Duct-tape →
   *fix*, vestigial → *remove*. Prove the class in the report.
2. **The campaign is generative, not only subtractive.** Subtractive (remove vestigial) +
   corrective (fix duct-tape with real welds) + generative (release blocked work). The
   `blocked-on` column is how we know which stuck feature each untied knot frees.

## Example rows (from this session — the pattern)

| Item / Location | Cruft-class | Action | Productization |
|---|---|---|---|
| `IS_MOBILE` UA regex (was in 7 files) | duct-tape (dup) | fixed → `src/lib/isMobile.js` | future-setting (device profile) |
| `browseAltitudeFor` inlined in Scene.jsx | duct-tape (dup) | fixed → `src/lib/browseAltitude.js` | slab-field (browse bounds) |
| Hero camera read stale `PRESETS` not slab | duct-tape | fixed (resolve from slab) | slab-field (camera framing) |
| `park-ave` photo symlink (dangling) | vestigial | removed | future-setting (asset roots) |
