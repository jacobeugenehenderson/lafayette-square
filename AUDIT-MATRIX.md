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
| **Action** | `keep` · `fix` (real solution sketched — OK to do now) · `remove` (**TAG ONLY — frozen until v1 release; see the removal freeze below. Do not execute now.**). |
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

## 🧊 Removal freeze — tag now, cut after v1 release

**Until v1 is released, we do NOT execute removals.** The codebase is still moving toward v1, and
there's probably plenty like the ribbon/corner case — code that looks dead but is WIP toward an
unfinished feature, or load-bearing in a way the audit can't yet see. Wrongly removing something
mid-development is a hull-punch; holding a dead stub for a few weeks costs nothing.

So during the run-up:
- **Non-destructive work proceeds now** — fixes (duct-tape → real welds), consolidations to a single
  source of truth (e.g. the `DESIGN_FIELDS` descriptor), de-hardwiring toward settings. These preserve
  behavior and de-risk.
- **Removals freeze.** Anything classified `remove` is *tagged into a deferred queue*, NOT cut. The
  Documentation Officer maintains the queue (every `Action: remove` row). It executes in ONE dedicated
  cleanup window **after v1 ships**, against a stable tree, with fresh evidence each item is truly dead.

(Already in the queue, not executed: `PRESETS.browse`, the stale `lafayette-square.json` bake, the
`/rebuild` stub, the CodeDesk token dup, the arborist `_attic` sweep. Comment-only doc fixes are not
removals — fine to do now.)

## ⛔ Exclusion zone — ribbons / corners / curbs / intersections / block geometry / measure / couplers

**Ribbons and corners are NOT fixed yet** (the corner-arc continuation is mid-flight — see
`cartograph/RIBBONS.md` + the cartograph BACKLOG). Everything that system governs — curbs,
intersections, block geometry, the measure path, **couplers** (`toggleCoupler`,
`setSegmentMeasure`, segment measures) — is **unfinished work-in-progress, NOT cruft.** Its loose
ends (dead-looking code, zero-caller writers, back-compat shims) are WIP toward an in-progress
fix and the queued sub-B redo may re-introduce them.

**Rule: do NOT classify anything in this zone as vestigial or duct-tape, and do NOT remove or
"fix" it during this campaign. HOLD it all until ribbons/corners are fixed.** Audit it for the
*record* (inventory it, note it's RIBBONS-governed WIP), but it's off-limits for the rip-up.
This is the classify-before-cut third question: "is this WIP toward the corner fix?" → if yes, hold.
(Already cost us once: knot-4's V1 measure/coupler path was tagged removable; pulled and held.)

## Example rows (from this session — the pattern)

| Item / Location | Cruft-class | Action | Productization |
|---|---|---|---|
| `IS_MOBILE` UA regex (was in 7 files) | duct-tape (dup) | fixed → `src/lib/isMobile.js` | future-setting (device profile) |
| `browseAltitudeFor` inlined in Scene.jsx | duct-tape (dup) | fixed → `src/lib/browseAltitude.js` | slab-field (browse bounds) |
| Hero camera read stale `PRESETS` not slab | duct-tape | fixed (resolve from slab) | slab-field (camera framing) |
| `park-ave` photo symlink (dangling) | vestigial | removed | future-setting (asset roots) |
