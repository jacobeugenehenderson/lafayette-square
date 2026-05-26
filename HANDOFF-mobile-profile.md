# Handoff (DRAFT — for fresh-Boz sanity-check, NOT dispatch-ready) — Mobile Profile as Authored Channel

> **Status: DRAFT for review.** This arc is large and touches the most contended files in the repo
> (`Scene.jsx`, `PreviewApp.jsx`, the slab schema, Stage authoring, the bake). Do NOT dispatch until a
> second pass (fresh-context Boz + Jacob) pressure-tests the open design questions in §3. The phasing
> in §5 is provisional.

## 1. Why this exists (the ethos)

What the product *is* on a phone is a **product decision the operator controls**, not something agents
hardwire. Right now it's the opposite: ~20 `IS_MOBILE` branches scattered across 6 files silently decide
what mobile users get, invisible to and uncontrollable by the operator. This violates "**user control over
what makes it to runtime**" and is the textbook case for "**hardwires come out when channels install**"
([[hardwires_come_out_when_channels_install]], [[project_slab_carries_full_authored_product]]). The fix:
mobile degradation becomes an **operator-authored channel**, baked into the slab. See
[[project_mobile_profile_authored_channel]] for the settled shape.

## 2. Settled decisions (operator, 2026-05-26 — do NOT relitigate without cause)

- **Per-layer inclusion (Option A)** — reuse the existing layer taxonomy; operator sets "ship on mobile?"
  per layer. NOT per-tree/micro (that granularity stays automatic, e.g. the tree `heroTier`).
- **Authored in STAGE, baked into the slab.** Runtime detects device → selects the authored profile →
  renders it. Device *sensing* stays in code (consolidate the 6 duplicated regexes to one); device
  *policy* becomes authored.
- **Seeded with today's hardwired choices as DEFAULTS** — no day-one behavior change ("dope the artifact").
- **NO write-back from Preview to the slab** (operator: "too many chances for mischief, too little
  payoff"). Preview stays a pure slab reader; it *measures* and *reflects*, never authors.
- **The Stage mobile profile ("what ships to mobile") ≠ the Preview inspection toggles ("what am I
  toggling to check perf").** Same per-layer *shape*, different purpose + surface.

## 3. OPEN DESIGN QUESTIONS (the point of the review — please pressure-test)

**Q1 — Inclusion-only, or inclusion + quality? (the crux.)** The `IS_MOBILE` hardwires are a *mix*:
  - **Layer inclusion** (clean fit for Option A): drop `BakedLamps`, arch only-in-hero, defer street lights.
  - **Intra-layer quality** (does NOT fit a per-layer on/off): `StreetLights` glow/halo/pool radii + alpha,
    `SlabBuildings`/`LafayetteScene` texture-res skip, `dpr` 1, `antialias` off, shadows off, the
    `PostProcessing` mobile branch.
  A pure layer-inclusion profile handles the first group and **strands the second**. Options:
  (a) author inclusion only; leave intra-layer quality as a device-adaptive default in code (lean: simplest,
  but then "what ships to mobile" is only *half* operator-controlled);
  (b) extend the profile to a small set of **quality flags** per layer/global (shadows, dpr, post-fx tier,
  texture tier) — richer schema + Stage UI, but the operator controls quality too;
  (c) a coarse global "mobile quality preset" (low/med) bundling the GPU knobs, + per-layer inclusion on top.
  **Which line?** This sizes the whole arc.

**Q2 — Per-Look or per-instance/deploy?** I've assumed the profile is **per-Look** (authored in design.json,
  baked into each Look's slab) — consistent with the authoring ethos. But mobile/desktop is a *device* split,
  arguably a per-instance/deploy concern (like [[project_kit_deploy_path_agnostic|BASE_URL]]). Is "drop the
  arch on mobile" really a per-Look artistic choice, or a product-wide policy? **Lean per-Look (ethos), but
  this is a genuine fork** — if it's product-wide, the home is instance/kit config, not design.json.

**Q3 — Can today's behavior be reproduced as a seeded default faithfully?** Some hardwires are entangled
  (the StreetLights shader-constant branch bakes mobile into the *shader*; `LafayetteScene` texture-skip is a
  load-time guard). Audit whether each maps cleanly to a profile knob or needs refactoring first. If some
  don't map, the "no day-one behavior change" promise is at risk — surface before Phase A.

**Q4 — Sequencing / convergence.** This touches `Scene.jsx` (the same file buildings-cutover + trees-Phase-E
  touch), `PreviewApp.jsx` (measurement arc + trees impostor flag), the slab schema, Stage, the bake — the
  most contended surfaces in flight. Almost certainly must land AFTER the measurement regime + after the
  buildings/trees Scene.jsx work settles. Is "last in the queue" right, or does something force it earlier?

## 4. The hardwire inventory (verified 2026-05-26)

- `Scene.jsx`: `:138` no-hero-on-mobile, `:651` antialias, `:673` dpr, `:674`/`:676` shadows+`StageShadows`,
  `:716` no `BakedLamps`, `:717` arch only-if-hero, `:721` `DeferredStreetLights`.
- `StreetLights.jsx`: `:29/:30/:38` radii, `:234` alpha (shader constant).
- `SlabBuildings.jsx:45`, `LafayetteScene.jsx:58`: texture/detail skip.
- `PostProcessing.jsx:357`: mobile post-fx branch.
- `ContactModal.jsx`: UI-only (out of scope — not render policy).
- Device-sense regex `/iPhone|iPad|iPod|Android/i` duplicated in 6 files → consolidate to one.

## 5. Provisional phasing (revisit after §3 is settled)

- **Phase 0 — Audit.** Inventory every `IS_MOBILE` branch, classify inclusion-vs-quality (feeds Q1), map each
  to a seeded-default profile value or flag as entangled (Q3). No code.
- **Phase A — Consolidate device sensing** to one `IS_MOBILE` source. Pure refactor, zero behavior change.
- **Phase B — Profile schema + bake.** Author `mobileProfile` in design.json (scope per Q1), seed defaults,
  bake into the slab. No runtime consumption yet.
- **Phase C — Runtime profile selection.** Replace `IS_MOBILE ? …` policy branches with profile-driven
  rendering; device-sense → profile-select; profile content → from slab. **Hardwires come out here.** Seeded
  defaults ⇒ mobile renders identically to today (the verification gate).
- **Phase D — Stage "Mobile" authoring.** A Stage view that applies the mobile profile (operator *sees* what
  the phone gets) + per-layer (and per-Q1 quality) authoring → design.json.
- **Phase E — Preview reflects + measures** the mobile profile (read-only; no write-back).
- **Phase F — Docs + cleanup.** SLAB-CONTRACT (new channel), FEATURES, retire scattered regexes.

## 6. Fresh-Boz review prompts

1. **Q1 is the big one** — inclusion-only vs inclusion+quality. Does leaving intra-layer quality as an
   adaptive default undercut the whole ethos point, or is it a reasonable v1 line? Is (c) the right middle?
2. **Q2** — per-Look vs product-wide. Is a per-Look mobile profile actually coherent, or am I forcing the
   authoring-ethos frame onto what's really a deploy/device concern?
3. Is the **seeded-default "no behavior change"** promise realistic given the entangled hardwires (Q3)?
4. Is the **phasing** honest about which user-visible behavior each phase does/doesn't change?
5. Am I **over-scoping**? Is there a smaller version that delivers the ethos win (operator controls what
   ships to mobile) without the full schema+Stage-UI+runtime arc?
6. Anything the **live-context me** has rationalized that doesn't hold up cold?
