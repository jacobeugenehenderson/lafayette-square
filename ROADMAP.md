# ROADMAP — the whole remaining board, pruned to zero

> **What this is.** The one **cross-domain** master of everything left to do — cartograph, arborist,
> meteorologist, the `ls/` public app, security, kit-productization. It exists because we're in the
> **home stretch**: the whole backlog (not just MEMORY's immediate task) must be *constantly surfaced
> and pruned until it is gone*. This is that surface.
>
> **How it's built (one home per fact).** This is a prioritized **index**, NOT a restatement. Each
> line is a one-liner + a size + a **→ pointer to its detail home** (a domain `BACKLOG` section or a
> `HANDOFF-*.md`). The pointer is the truth; this file is the *ordering*.
>
> **The pruning discipline.** When an item lands, **strike it from ROADMAP *and* its detail home in
> the same breath** (the accord sweep — `BOZ.md §3`). Never let a done item sit here. Tiny aesthetic
> bugs get *added* here as they surface (or vanish on their own) — the list breathes until it empties.
>
> **Sizes:** S = hours · M = a session · L = multi-session.
> **DoD everywhere = Jacob's eye on the real render, never a proxy** (`feedback_proxy_render_is_not_the_operator_eye`).
>
> *Established 2026-07-17 (Boz + Jacob, the whole-corpus appraisal). The frame is Jacob's: two
> columns to done + close security, then the tail is process-cleanup ahead of human-developer
> engagement. Reachable from `ORIENTATION.md` + `README §⭐ START HERE`.*

---

## ⚠️ Live / blocking defects — do on contact
- **Prod: 88 trees 404 on lafayette-square.com** — `origin/main` census requests `platanus/skeleton-4` ×88, no such GLB ships. Fixed by the re-bake at the tree eye-gate; **do NOT `git restore public/baked/**`** (working tree is more correct). S · → folds into **B6**.
- **Build blocker: dangling symlink** `public/photos/lafayette-square/other` fails `npm run build` (vite publicDir copy). Blocks every prod build → blocks baking. S · → `arborist/BACKLOG.md`.
- **Latent prod crash: `MountainBackdrop.jsx:68`** white-screens any Look that opts into landscape without overrides — one-line guard (`.values ?? LANDSCAPE_FLAT_DEFAULTS`) drafted, unapplied. S · → `HANDOFF-altadena-pour.md:77`.

---

# THE NEAR-TERM PUSH — two columns + a close-out (run in parallel)

> The two columns are independent (A = cartograph geometry, B = arborist/render) and dispatch
> concurrently; security is a bounded third track. Jacob's thesis: **land both columns + close
> security and what's left is scant** — at which point the work becomes the cleanup tail below.

## Column A — the SHAPE finish (Front A)  ·  *the final aesthetic of a premier product, not optional polish*
> The governing rule is locked (one uninterrupted frontage chain real-corner→real-corner; the ADA
> transition slope fires ONLY on arrangement-*difference*) — `SECTION.md` canon (`0f0a6473`).

- **A1 · Flippable cul-de-sac LEGS** — the dead-end **cap** flip + dip-in slope **LANDED & eye-confirmed 2026-07-18** (`5a0eecc8`→`330004ec`): toggle-swap cap, semicircle swap, legs bend so the sidewalk stays contiguous. The live remainder is the **legs**: a leg material flip currently renders **Δ=0.0** — the terminal-leg custom isn't reaching the strip, and/or the new crossing-band transition zone overrides it. M · → `HANDOFF-dead-end-cap-flip.md` (status block + next-task). *(To ship the caps: a real prod bake regenerates `shape.json` + `design.json` — the current re-bake/test-flips are uncommitted working-copy only.)*
- **A2 · Through-node T-artifact re-fix** — the prior cure (`222e403c`) **FAILED the eye**: the marker keys the wrong run (side-street pick on split-skelId at Mackay; coord-miss at Kennett). Re-identify the through-street incl. the split case; verify on the **frozen** render, not the live sliver-count. Consider defaulting `thruTNode` OFF until re-done. M · → `HANDOFF-thrunode-gate-fix.md`, `scratch/THRUNODE-GATE-FINDINGS.md`.
- **A3 · Freeze the curb in prebake** *(structural — closes the centerline leak)* — build curb+junction ONCE from the frozen frame; Survey consumes it; only the active element re-strokes → Check C green, chains can't leak. **Rebuild-gated.** L · → `HANDOFF-freeze-the-curb-in-the-first-bake.md` (D6b/c).
- **A4 · Robust bezier offset → curves ON → re-bake HPDM** *(this IS "HPDM chunky")* — `CURVE_FIT` is built + eye-approved but **OFF**; `STREET_SMOOTH` is pinned 0 because the offset isn't robust on tight bends (turning it on sprays needles). **Strictly downstream of A3.** L · → `HANDOFF-curve-primitive-skeleton.md`, `smoothCenterline.js:150`.
- **A5 · band-fold G12 thorn clamp** — the local capacity clamp; built but stranded on `8e1e414`, unlanded. Eye-gate + canon fold. S–M · → `HANDOFF-band-fold-fix.md`.
- **A6 · junction-construction geometry** — build the osm2streets trim-back/assemble polygon at *every* node (metadata spans all nodes; geometry is divided-only today). L · → `HANDOFF-junction-construction.md`.
- **A7 · Fortify corner identity + the ADA-regime trigger** — **some real corners aren't getting ADA treatment.** A dedicated pass on *what is a corner* (identity, not angle — `feedback_walker_corner_detection_is_identity_not_angle`) and *when/how to force the ADA regime* on one. Jacob held it to see if the through-node + cap fixes would shake it out; they didn't fully → its own pass. The **inverse of A2** (through-node = a FALSE corner wrongly firing ADA; this = REAL corners NOT firing) — same root question, corner identity. M–L · → `SECTION` canon (the governing rule) · `RIBBONS §1/§4`.
- **A8 · Sidewalk proximity-join** — when two sidewalk runs come within proximity and leave a **thin treelawn sliver** between them (seen at a cul-de-sac bulb ↔ leg), **join them into one contiguous sidewalk** instead of leaving the gap. Consistent with the frontage-contiguity governing rule, applied *between* runs. Likely **FILL/Section** (the inward ped stroke arrangement) — ⚠️ confirm the layer (FILL join vs a curb-proximity SHAPE thing) with the canon open before touching. M · → `SECTION` canon · *(surfaced 2026-07-18 from the cul-de-sac render)*.
- *(Gated sibling: **D3 corner-identity freeze at prebake** — the false-corner cure is live; doctrine wants it decided once upstream. M · → `PREBAKE §5`. Do with A3, don't cleanup-refactor.)*

## Column B — tree impostor editing + placement  ·  *this IS "works on a phone" (trees are the OOM/perf culprit)*
> Column B makes the phone light. The instrument that *proves* it's light (the measurement regime) is
> the confidence-half, parked in the Horizon (**H1**) — pull it forward when you want publish-and-know.
>
> **▶ STATUS 2026-07-18 — impostors are NOT landed.** The hero-impostor foundation + capture are BUILT
> (branch `hero-impostor-foundation`, 21 commits) and **look good in the authoring surface** — but they
> **do not load in the PLAYER** (`impostors=0` in the consumer app). The crux is the **player-side load /
> slab-carry, not the capture**: likely `bake-look` must carry the impostor manifest
> (`overheadBySpecies`/`heroImpostorBySpecies` — the `serve.js:1431` durability TODO), the overhead
> artifacts are untracked so they never ship, and/or a demand-frame is needed on async load. **This
> player-load gap is the real B1 remainder.** Merge to trunk + reconcile `InstancedTrees.jsx` still pending.

- **B1 · Salon hero-impostor editorial surface** — canopy-only hero impostor mirroring the proven overhead pattern: a `HeroImpostorBaker` on Bake→Slab + a Hero-view eye-gate + a baked `heroImpostorBySpecies` + `bake-look` carry. Trades ~39 MB lod1 geometry for baked billboards. **Prereqs:** fix the `ImpostorSpecies` `Matrix4` aliasing bug (`InstancedTrees.jsx:~435`); turn on `HERO_TIER.PROM_THRESHOLD` (currently 0 = all-mesh). L · → `HANDOFF-hero-impostor-and-startup-weight.md`.
  - *Startup lane (rides this HANDOFF):* `loadAudit` profiler BUILT/uncommitted (verify+commit, S); **KTX2/Basis-compress the tree atlas** 27.6 MB→~5 MB (M).
- **B2 · Overhead-impostor chain** — snapshot-wireup Ph2/3 (POST the baked bands + `overheadBySpecies` manifest; runtime camera-height select with hysteresis + cross-fade) + disc-display player-paint fix + **durability** (`bake-look` must carry `overheadBySpecies`; the artifacts are untracked → won't ship). L · → `HANDOFF-overhead-snapshot-impostor-wireup.md`, `HANDOFF-overhead-disc-display.md`.
- **B3 · BATON tree-impostor LOD render** — the billboard geometry/material at full optical parity + the capture-architecture decision (in-browser GPU RTT recommended) + Hero/Browse two-impostor + occlusion→cull. The impostor arc is **PARKED** (code dormant, `PROM_THRESHOLD=0`); this is the live forward plan. L · → `BATON-tree-render-next.md`.
- **B4 · density-impostor-swap** — bulk-swap HPDM's ~7,167 mesh trees to impostor: per-scene threshold (default-0-safe for LS) + canopy-dims join fix + classifier-run fix. **Shares `InstancedTrees.jsx` with B2 → serialize.** M · → `HANDOFF-density-impostor-swap.md`.
- **B5 · atlasKind `/stem/` classifier bug** — 11.3% of placements render **black** (foliage samples the bark atlas); one fix clears black canopies AND the overhead blank-bands. Needs standup + a re-bake (stale atlas blanks the whole grove). M · → `HANDOFF-tree-spokes-and-census.md §3f`, `atlas-kind-classifier.js:52`.
- **B6 · Placement / census correctness** — the live prod 404 (above) fixed by the re-bake at eye-gate; **+ the tree-spokes overhead artifact still UNIDENTIFIED** (next step is a scene-graph probe in Browse, not more theory — 9 theories already ruled out). S + M · → `HANDOFF-grove-neighborhood-axis.md`, `HANDOFF-tree-spokes-and-census.md`.
- **B7 · 23a merged-mesh segmentation** — split "group-shot" merged-mesh forest GLBs into individual trees (the real root of the rows-of-trees / lost-willow artifact). Now dispatchable (gauntlet landed). M–L · → `HANDOFF-23a-merged-mesh-segmentation.md`.
- **B8 · Trees "demander" force-render** — explicit `invalidate()` when tree assets finish loading so trees appear unconditionally (async-load race on the on-demand loop). M · → `BATON-tree-render-next.md`, BACKLOG NOW.

## Close-out — Supabase / Cary security  ·  *"just be done with it"*
- **S1 · Apply migration `009`** — drafted, not pushed. Fixes **F-1 (CRITICAL: `sms_messages` has no RLS → anon reads/writes PII)**, F-7 (definer view leaks name/email/phone), F-8 (3 `security definer` fns without `search_path`). Needs Jacob's interactive `supabase db push` + re-run Advisor. S · → `HANDOFF-security-audit.md`, `SECURITY.md`.
- **S2 · Service-role auth + webhook signatures** *(the design conversation — hard prereq before any real Cary user/dollar)* — F-2/3/4/5: functions trust body-supplied ids with no caller auth; `requests` RLS is `USING(true)`; **no Stripe/Checkr/Twilio signature verification anywhere**. M · → `SECURITY.md` F-2…F-5.
- **S3 · Remaining Supabase findings** — F-6 IDOR · F-9 TwiML injection · F-10 GPS-read scope · F-11 cron fail-open · F-12 `serve.js` command-injection (dev) · F-13 CORS · the Auth-dashboard lints (OTP expiry / leaked-password / redirect URLs). S–M each · → `SECURITY.md`.
- *(Sibling, distinct arc — the **LS Apps-Script** side: admin-token ship-blocker + no rate-limiting, both 🔴. Ships-blocks the LS app, not Supabase. → `ls/STATUS.md §security`. Tracked in the Horizon LS-app cluster **H7**.)*

## Quick independent wins — cheap, public-visible, no column dependency
- ~~**Lamp census restore**~~ **LANDED `87fe26fb` (2026-07-18)** — scene-homed the raw OSM file + allowlisted + re-baked: 80 fallback → **536 real OSM lamps** (641 clipped to hood). Render path was already live. Pending final eye-confirm; retire `HANDOFF-lamp-census-restore.md` once confirmed.
- **Ground foundation-crack (mechanism B)** — on a slope the ground falls below the flat foundation top and exposes a concrete band. Cure = a `bake-terrain.js` footprint-flatten + apron sharing one `footprintMeanElevation()` helper with `bake-buildings.js`. Rebuild-gated. *(Mechanism A — the tessellation split — is already fixed.)* M · → `HANDOFF-ground-foundation-crack.md`, `scratch/GROUND-BUILDING-CRACK-FINDINGS.md`.
- **Forest Park census free win** — read `FORESTRY_TREES/MapServer/4` (4,297 trees, richer schema) we currently ignore; best species prior for the HPDM census gap. "Costs one integer." S · → `HANDOFF-tree-spokes-and-census.md:33`.
- **Milky Way re-enable** — ⚠️ NOT a one-liner (the `CelestialBodies.jsx:~1194` pointer is STALE; that file no longer exists and the runtime celestial renderer isn't grep-locatable — 2026-07-18). Channel plumbing is live (`skyLightChannels.js` `MILKYWAY_FLAT_DEFAULTS` → `bake-scene.js`); the *renderer* is missing/renamed. Needs a talk-out investigation: locate/revive the night-sky render, view across TOD, report what beautiful costs. M · → talk-out brief. · **building-dissolve UI sliders** · **landmark-label nudge**. S each · → `ls/STATUS.md`, `ls/BACKLOG.md`.
- *…tiny aesthetic bugs land here as they surface.*

---

# THE CLEANUP TAIL — process-cleanup ahead of human-developer engagement
> Code legibility + pristine docs + the kit-productization that makes the whole thing hand-off-able to
> a human developer. This is where the horizon's "make it legible" subset lives.

- **C1 · blank-app / Universal Reader** — Ph4 (`branding.copy` bundle + build-time `index.html` inject) + **the zero-hardcode gate** (grep the reader for LS literals → zero) + the per-instance content sidecar (off `src/data/buildings`) + the module manifest. The legibility spine for handoff. L · → `HANDOFF-blank-app-instance-decoupling.md`, `plans/front-front-end-and-productization.md`, `SLAB-CONTRACT §C2`, `NEIGHBORHOOD-INPUTS §5.1`.
- **C2 · HiPointe backend-tenancy — deploy + verify** — per-look Apps Script backend; code shipped on `sheet-tenancy`, Jacob runs `clasp push && clasp deploy` + the 5-step eye-gate (no cross-tenant leak). S · → `HANDOFF-neighborhood-backend-tenancy.md`, `DEPLOY-CHECKLIST-backend-tenancy.md`.
- **C3 · The correctness-detector campaign** — the real kit deliverable: one automatic check per bug-class → CI gate → onboarding loop (run-suite → fix-class → green). This is what lets a human work town #2..N without re-inspecting everything. L · → BACKLOG kit-correctness track, `POLYGON-FIRST §5`, `scratch/correctness-detector.mjs`.
- **C4 · figure-ground dead-path excision** — extract the still-live helpers from `buildBlockGeometryV2.js` (3,371 lines, ~13 importers) → migrate authoring onto tiles (T3) → delete the builder + `BlockGeometryV2Debug.jsx` + the `bake-ground.js:28` import (T4). L · → `HANDOFF-tile-T3-authoring.md`, `DOC-CODE-COHERENCE` C3/C4/B4, `plans/clean-for-handoff.md` W2.
- **C5 · Doc-pristineness to zero** — drive `DOC-CODE-COHERENCE` corpse-lies to ✅ (C5–C13, D1–D8); codify the doc-currency mechanism into `BOZ §3`; physical-archive the parked material (RUNTIME-DELTA, the misfiled cartograph sky-ADRs in `meteorologist/NOTES`); reconcile the three May-12 "marriage-leap" plans (partly OBE). M · → `cartograph/DOC-CODE-COHERENCE.md`, `plans/clean-for-handoff.md`.
- **C6 · Retire landed HANDOFFs** → the Diary (`cartograph/_archive/`, per CLAUDE.md — ⚠️ *this line originally said `_archive/handoffs/`; reconcile the intended home*). **✅ 5 archived 2026-07-18** (`DEAD-END-MOUTH-FORENSIC`, `HANDOFF-ls-planting-LANDED`, `HANDOFF-section-perf`, `SPAR-SKELETON-FORENSIC`, `SPLINE-18TH-FINDINGS` — each verified done + unreferenced first). **Pending:** `ls-statistical-planting` / `hipointe-pour-step0` (verify done); `designer-load-forensic` (blocked — README still refs it, de-ref first); `thrunode-gate-fix` / `grove-neighborhood-axis` (LIVE A2/B6 detail-homes — archive when their lines land). The ~14 other done-stamped root handoffs stay put as live ROADMAP detail-homes and ride the pruning discipline (strike + archive when their line lands). S · → `ACCORDANCE-REVIEW.md` detritus survey.
- **C7 · LS pre-public cleanout** — mode-conditional `rollupOptions.input` (drops the ~4.5 MB cartograph chunk from prod), `copyPublicDir:false` allow-list, deployment-ID audit gate, two verified-orphan deletions. M · → `plans/pre_public_cleanout.md`.
- **C8 · render-pipeline-install Ph4/5** — the SCENE tree onto the one manifest + fold render-conformance/preview-measurement in as installer capabilities (makes the render path legible + parity structural). M · → `HANDOFF-render-pipeline-install.md`.
- **C9 · Detritus-survey code-legibility items** *(2026-07-18 survey — record in `ACCORDANCE-REVIEW.md`; Tier 1 archive sweep already done)*. Headline: the *source* is disciplined (7 `TODO/HACK` markers repo-wide, near-zero commented code) — the sediment is docs + `scratch/` + 2–3 god-files. Three tracked, none urgent:
  - **(a) Decompose `cartograph/derive.js#deriveLayers()`** — a single **~3,465-line function** (L1009→~4474, 75% of the 4,607-line file) — into named phases like its siblings (`detectDividedStreets`, `correctStreetWidths`, …). A deliberate SHAPE-core refactor, **eye-gated, NOT a delete**. L. *(Distinct from C4's `buildBlockGeometryV2.js` excision — different file.)*
  - **(b) De-barnacle the patch-over-prose docs** — `arborist/FEATURES.md` (40 dated + 31 `Brief` tags, incl. "read X below as Y" clauses) + `arborist/ARCHITECTURE.md` (713 ln) + `meteorologist/NOTES.md` (957 ln): pull the dated decision-log to `_archive`, rewrite the "read-as" clauses to plain current-state. Finishes the FEATURES voice sweep. M · folds with **C5**.
  - **(c) `scratch/` sediment triage** — 1,048 files (~459 images); archive/delete the pre-July render-dumps + stale `.md`. It's git-tracked, so cut deliberately. S.

---

# THE HORIZON — approaching, not far
> Bumped below the near-term push, but the horizon is coming up fast — these won't stay here long, and
> several are already part-planned or part-superseded. Re-tier into the push as a column empties.

- **H1 · Publish-confidence / mobile-measurement** *(the confidence-half of Column B's phone goal)* — `preview-measurement` (**real per-tier device numbers = the hard gate**; today `phone-hi==phone-lo`, both guessed) · render-conformance Ph4–7 · mobile-profile B/C/E · phone-slice frustum culling (trees + buildings) · hero-motion smoothness (spatial Arch-bounce → catmullRom cusp/FOV) · the 7 Browse-shot looks · heroTier wrong-camera-target (~1200 m, unblocks all tree-LOD). L · → `HANDOFF-preview-measurement.md`, `HANDOFF-render-conformance.md`, `HANDOFF-mobile-profile.md`, BACKLOG NOW.
- **H2 · Altadena / CDP pour** — ground-refine-cdp scale blocker (26.3M tris/88 min → per-hood knob) · the Stage landscape-upload flow (sets `landscape.source`, unbuilt) · mountain radial cut + shading pass · fix the wrong (LS) lamps. L · → `HANDOFF-altadena-pour.md`, `HANDOFF-altadena-mountain-hero.md`, `HANDOFF-ground-refine-cdp.md`.
- **H3 · HiPointe productization** — building-position-from-slab (dead clicks / missing pins) · content-join re-join (24 stale listings) · city-county-divide render · HPDM lamp coord bug + trees eye-gate. L · → respective HANDOFFs.
- **H4 · Meteorologist** — the **Tuner** (the `capture-render` primitive T-1 gates everything) · cloud-specialist morphology renderer · 8 weather-wiring gaps (W-1…W-8) · sky-pivot seasonal deviations · Preview Studio · wind-field · audiologist. L · → `meteorologist/TUNER.md`, `HANDOFF-cloud-specialist.md`, `meteorologist/STATUS.md`.
- **H5 · Streaming-slab spatial chunking** *(Jacob, 2026-07-17)* — chunk the monolithic merged-mesh slab at coarse region granularity + stream just-in-time along the fixed hero pan → attacks mobile OOM. **Composes with Column B** (impostor placeholder first, geometry streams in). L · → BACKLOG Front B, `SLAB-CONTRACT`.
- **H6 · Arborist depth** — leaf-base library gaps (~6) · phenology (season/color ramp + annual-cycle editor) · STAGE-2 Sugar-Maple vertical slice · full dossiers · green-light readiness gate · night-emissive foliage · birch-bare render. L · → `arborist/BACKLOG.md`, `arborist/README.md`.
- **H7 · LS app features** — Cary order pipeline + POS (L) · generic place-card templates · honorary-townie endpoint · TOD-aware OG preview · **LS Apps-Script security ship-blockers (🔴)** · ~12 completeness gaps (event edit/delete, community-stats hydration, courier-count stub…). S–L · → `ls/BACKLOG.md`, `ls/STATUS.md`.
- **H8 · Kit intake** — custom street-data import (generalize `survey.json`) · the chassis-tagging gauntlet (the manual 0/241 pass — surface built, tagging not) · productionize the scene-generic content-intake stage. S–L · → `SKELETON.md`, `[[project_chassis_tagging_gauntlet]]`, `NEIGHBORHOOD-INPUTS §11`.
