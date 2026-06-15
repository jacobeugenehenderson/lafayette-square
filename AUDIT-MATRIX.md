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

**Ribbons and corners are NOT fixed yet** (the 2026-05-27 uniform-width arc was attempted under
`HANDOFF-ribbon-corners.md` and REVERTED 2026-05-28 in `ea0bed6` — root cause documented in
`cartograph/RIBBONS.md §6.10` + `memory/feedback_per_leg_straight_only_overshoot.md`; brief
rewrite pending). Everything that system governs — curbs, intersections, block geometry, the
measure path, **couplers** (`toggleCoupler`, `setSegmentMeasure`, segment measures) — is
**unfinished work-in-progress, NOT cruft.** Its loose ends (dead-looking code, zero-caller
writers, back-compat shims) are WIP toward an in-progress fix; the rewrite may re-introduce them.

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

---

# THE MASTER MATRIX — aggregated (2026-06-15)

> **Step 2 of the campaign (the Doc Officer's aggregation).** The four pathologist walks LANDED; their full per-domain tables live (tracked) in `scratch/audit-{cartograph,arborist,ls-app,docs}.md`. This section is the **cross-domain rollup + the two derived queues + the reconciled cross-cutting threads** — the synthesis the per-domain tables don't give on their own. It does **not** re-paste the ~108 rows verbatim (the scratch files are the detail of record); it aggregates them. **No cuts** — the removal freeze holds (everything `remove` is *queued*, executed in one window after v1).

## Domain index (the detail of record)

| Domain | Report | Rows | real / duct-tape / vestigial | keep / fix / remove | Headline |
|---|---|---|---|---|---|
| **Cartograph** | `scratch/audit-cartograph.md` | ~47 | 22 / 18 / 5 | 23 / 15 / 4 (+2 build) | the 33-field design block hand-kept in 3 places (clobber risk) |
| **Arborist** | `scratch/audit-arborist.md` | ~33 | 18 / 9 / 6 | 20 / 9 / 4 (+`_attic` sweep) | heroTier classifier scores the WRONG camera target (~1200 m off) |
| **LS App** | `scratch/audit-ls-app.md` | ~28 | 18 / 7 / 2 | 19 / 7 / 2 | pins read live data while buildings read the slab (last contract gap) |
| **Docs** | `scratch/audit-docs.md` | 86 docs | gap-map (not cruft-classed) | EXECUTED `eb030eb` | dev-spine healthy; FEATURES bloat + closed-HANDOFF pile (both since resolved) |
| **Sky / weather** | — | — | — | — | not walked (cloud-specialist `HANDOFF` tabled, meteorologist/BACKLOG) |

*Totals (the three code domains): ~108 classified rows; ~58 keep, ~31 fix, ~10 remove-queued.*

## ⓵ The deferred removal queue (cross-domain) — 🧊 FROZEN until v1

> Every `Action: remove` row, gathered. **None executed** — they cut in ONE window after v1, against a stable tree, with fresh evidence each is truly dead. Supersedes the informal list in the freeze section above.

| Item / Location | Domain | Why dead | Verify-before-cut |
|---|---|---|---|
| `POST /rebuild` → `node render.js` (`serve.js:674`) | Cartograph | `render.js` absent on disk; stub throws | drop the `rebuild()` caller (`api.js:63`) too |
| `_saveCenterlines` alias (`store:1785`) | Cartograph | dead back-compat shim aliasing `_saveOverlay` | confirm 0 callers |
| `GET /analyze` (`serve.js:264`) | Cartograph | hardcoded LS parcel path | "fix (LS-pathed) or remove" — confirm unused first |
| ⛔ coupler write path (`toggleCoupler:1901` / `setSegmentMeasure:1984`) | Cartograph | V1 measure authoring, 0 callers | **CONFLICT: in the exclusion zone (couplers/measure = RIBBONS WIP). HOLD — do not queue-cut; flag Boz.** |
| `Grove.jsx hovered` state | Arborist | set, only feeds cosmetic ternaries; no real consumer | — |
| `Workstage.jsx` (legacy Salon) | Arborist | pre-18A surface, only via `?legacy=workstage` | remove after Brief 18B confirmed |
| `public/baked/lafayette-square.json` | Arborist | stale 745-inst pre-classifier bake, no producer/consumer | **keep the sibling `baked/lafayette-square/` directory** — only the `.json` goes |
| `arborist/_attic/` sweep (~8 stranded one-shots) | Arborist | completed migration/recovery scripts, no caller | separate Boz-signed sweep brief |
| `PRESETS.browse` (`Scene.jsx:62`) | LS App | every browse path resolves from `scene.shots…browse.bounds`; unreachable | **`PRESETS.hero` STAYS** (load-bearing) |
| `public/lsq-tokens.css` redundant load | LS App | every `--lsq-*` it sets is overridden by `theme.css` inline | CodeDesk-internal, low value |

*(Doc-corpus removals are NOT here — the docs audit already EXECUTED its retirements, `eb030eb`: dead pointers repointed, 11 closed HANDOFFs retired, 5 spikes archived. Those were doc moves under the additive law, not code cuts under the freeze.)*

## ⓶ The productization register (cross-domain) — feeds `plans/front-front-end-and-productization.md`

> The `Productization unlock` column, aggregated by tier. **Tier 1 (future-setting) is "the first draft of what the intake/settings screen must collect"** (plan §"three documentation purposes").

**Tier 1 — future-setting (the settings/intake screen):**
- **Geography** — `lat/lon`, BBOX, projection (Cartograph knot #2: `instance.js` is SSoT but `config.js`/`AerialTiles` re-hardcode it; INSTANCE confirmed clean on the LS side) — *the first geography field.*
- **Basemap source** — Esri/aerial tile URL, Overpass/USGS/Fontsource endpoints (Cartograph).
- **Brand/theme** — `cartograph.css --carto-*`, `design.css --vic-*`/`--tod-*` palettes, MapPin/MapPin gradients, street-label typography.
- **Default Look** — `DEFAULT_LOOK_ID` (hardcoded ×5, Cartograph).
- **Per-instance contact** — Cary SMS/email/domain (already correctly in `instance.js` SSoT — the model setting).
- **Device profile** — mobile depth-mode (LINEAR vs log) + the whole mobile render DELTA (LS App §4) + Cartograph Mobile|Desktop tab.
- **Grove gallery** — "show as baked" toggle (Arborist).

**Tier 2 — slab-field (the format):**
- *Done channels (LS App, slab-field-done):* building geometry/material + per-building index, hero subject + keyframes/motion, browse framing/bounds, camera FOVs + eye height + heading, Gateway Arch placement, palette/materialPhysics/materialColors, ground/land-use/ribbons/lightmap, trees, street lamps, neon uniforms + tube geometry/anchors, sky tint/celestial/horizon, post-FX channels.
- *NOT yet done (the open slab fields):* **landmark pin anchors** (pins still read live data — the last building-geometry contract gap); **`scene.clouds`** (dead in the shipping path until volumetric sky lands); **building texture-name catalog**; **zoning→category map** (per-instance); **postFx** (`DEFAULT_LAYERS`, Cartograph scaffold); **mobile profile**; **camera framing** (`shots.browse.bounds`, Cartograph knot #3); **per-Look tree bake path** (`BAKE_URL` hardwired to `default.json`, Arborist).

**Tier 4 — api-route:**
- Scene data routes (`/<scene>/{markers,measurements,centerlines,overlay,skeleton}`), Looks CRUD (`/looks…`), bake (`POST /looks/<id>/bake`) — Cartograph's scene-aware multi-instance seam.
- LS App: none tagged; the Apps-Script single-`action` dispatch + the `MOCKS` table are the natural seed for a tier-4 contract spec.

## ⓷ Blocked-on / release knots (the generative column)

| Knot | Domain | What's stuck behind it / ships when untied |
|---|---|---|
| **33-field design block in 3 places** (knot #1) | Cartograph | blocks safe addition of ANY new Stage channel (clouds UI, mobile-delta) without re-risking the keyframe clobber → one `DESIGN_FIELDS` descriptor |
| **heroTier scores wrong camera target** | Arborist | blocks the whole hero-LOD / impostor payoff (Azimuth B–E) → shared `resolveHeroSubject` + re-bake |
| **`scene.clouds` dead in shipping path** | LS App | authored cloud preset invisible in production → ships when volumetric `Atmosphere` sky lands |
| **pins read live, not slab** | LS App | last building-geometry contract gap → `useSlabBuildingIndex` resolver |
| **mobile profile unauthored** | LS App + Cartograph | mobile-specific Look authoring → conformance Phases 4–5 (Vernier) |
| **camera framing constants triplicated** (knot #3) | Cartograph | clean multi-instance framing → render-conformance Phase 6 |
| **coupler read path** | Cartograph | needs overlay.json data migration off couplers before the path can drop (exclusion-zone WIP) |

**Serialization:** `Scene.jsx`/`PreviewApp.jsx`/`scene.json` edits must converge with **Azimuth** (tree LOD A→B, has `scene.json` in flight) and **Vernier** (conformance owner) — the same convergence the camera arc respected.

## ⓸ Cross-cutting threads — reconciled (do NOT re-design)

- **CSS / design tokens (Lintel correction, stands).** `design.css` ⟷ `lsq-tokens.css` are **NOT duplicates** (zero variable overlap — two different apps' token sets; LS's app token source is already singular). The real dups: **inside CodeDesk** (`lsq-tokens.css` ⟷ `theme.css` inline) + **`cartograph.css`'s parallel `--carto-*`** set + ~10 raw hex. Work = CodeDesk-internal dedup + decide whether `cartograph.css` aligns to `design.css` or stays the tool's own. ⛔ Do not propagate the original "merge LS's two token files" mislabel.
- **Mobile.** `src/lib/isMobile.js` is the confirmed single *sensing* source (6 importers, dup regex already removed). Open = the *policy* (which layers ship + global quality) → split across slab/`design.json` (inclusion, per-Look) + `INSTANCE.mobileQuality` (global). Cartograph owns authoring/preview-mobile; LS owns the shipped regime.
- **The camera-framing → slab-contract class.** One root behind three domains: Cartograph knot #3 (constants triplicated), Arborist heroTier (scores the stale `[400,45,-100]` while cameras aim at the arch `[1584,45,-528]`), LS App hero camera (already fixed). The tree classifier is the one un-migrated consumer. `memory/project_camera_framing_slab_contract`.
- **The slab contract is the spine.** LS App §1 maps every rendered thing read-vs-hardcoded; mostly honored + recently hardened. The open gaps are the Tier-2 "NOT yet done" list above. A **slab-completeness assertion** (a `whole-scene` dirty export silently mis-tiers trees) folds into conformance Phase-6 parity.

## ⓹ Register health (the doc half of the "Engineering" purpose)
- **FEATURES** — front-door elevation **LANDED** since the audit (`6b0e6a3`/`0818e93` purged the engineer back-half → ARCHITECTURE/OPERATIONS; `ORIENTATION.md` created as the plain-language bridge).
- **OPERATIONS** — still a **stalled seed** (placeholders, "populate as T3 lands"); the operator register is effectively empty.
- **Dev docs** — healthy (SKELETON/RIBBONS/POLYGON-FIRST/SURVEY/SECTION/WALL/INTAKE/BAKE/STAGE/PREVIEW current, honest TARGET-vs-CURRENT).

## What this aggregation does NOT yet do (the remaining Show Bible steps)
1. **The Show Bible doc itself** — the 3-purpose artifact (Marketing per-app capability sheets · Fundraising master map · Engineering reach/fix/troubleshoot; plan §"three documentation purposes"). Doesn't exist as a file; this matrix is its raw material.
2. **Execute the removal queue** — after v1 only.
3. **Route Tier-1/2/4 into `plans/`** — the register above is assembled; wiring it into the productization horizons is the next non-destructive step.
4. **Re-audit the exclusion zone** — ribbons/corners/curbs/intersections were inventoried-only and HELD; with the tile model now largely landed they can be classified for real (freeze still applies to what it flags).
5. **OPERATIONS** — build it out as T3 authoring lands.

*Aggregated 2026-06-15 by the Doc Officer step. Detail of record: `scratch/audit-{cartograph,arborist,ls-app,docs}.md` (tracked). Source extractions verified against the four reports, not status claims.*
