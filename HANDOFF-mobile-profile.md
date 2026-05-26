# Handoff — Mobile Policy: Per-Look Inclusion (slab) + Product Quality (instance)

> **Status: review-integrated, near-dispatch-ready.** Cold-review (Boz #2, 2026-05-26) reframed the
> architecture; live-context Boz verified its two load-bearing claims against the code and integrated it.
> Open items before dispatch: Jacob's nod on the §2 amendment (accepted by seat-holder, see Provenance),
> and the convergence sequencing in §6. Still touches contended files — lands after the in-flight arcs.

## Provenance (why this brief changed shape)

The first draft proposed one slab-authored "mobile profile." Cold-review caught that **`IS_MOBILE` is
overloaded across two axes with *different timing constraints*** — and unifying them into one slab channel
is what manufactured the original "Q1 stranding" problem. The real cut is **global-vs-per-layer**, which is
*also* the **sync-vs-async** cut, which routes to **two existing homes**. Verified by the seat-holder:
- **`INSTANCE` (`src/instance.js`) exists and is the doctrinal home for product-wide fixed-truth** — its
  docstring: "fixed-truth identity the slab doesn't carry" ([[project_slab_is_the_instance_identity]]).
- **Canvas-construction props can't be slab-authored** — `Scene.jsx`'s camera comment confirms "Canvas's
  initial fov fires before scene.json resolves"; the code already works around this exact bootstrapping
  constraint for fov. So `gl`/`dpr`/`shadows` *must* be synchronous (`INSTANCE`), not async (slab).

## 1. Why this exists (the ethos)

What the product *is* on a phone is a **product decision the operator controls**, not something agents
hardwire. Today ~20 `IS_MOBILE` branches across 6 files silently decide what mobile users get — invisible,
uncontrollable, duplicated. Violates "**user control over what makes it to runtime**"; textbook
"**hardwires come out when channels install**" ([[hardwires_come_out_when_channels_install]],
[[project_slab_carries_full_authored_product]], [[project_mobile_profile_authored_channel]]).

## 2. The architecture — two axes, two homes (SETTLED)

`IS_MOBILE` is doing two unrelated jobs. Split them:

| Axis | What | Home | Why | Timing |
|------|------|------|-----|--------|
| **Inclusion** | which *layers* ship to mobile (lamps, arch, street lights…) | **slab / design.json**, Stage-authored, **per-Look** | mount-gates *inside* the render tree; an authored artistic choice | async-fine (gates after slab loads) |
| **Global quality** | `dpr` / `antialias` / `shadows` / post-fx tier | **`INSTANCE.mobileQuality`**, **product-wide** | device *capability*, not art; Canvas-*construction* props | **must be synchronous** — set before the slab resolves |
| **Shader-baked / structural** | `StreetLights` GLSL-template alpha + module consts; `PostProcessing` mobile effect graph | **stays code-side, documented** | converting a GLSL template constant to a slab uniform is a refactor wildly disproportionate to "halo 0.30 vs 0.45" | below operator-interest threshold ([[feedback_smallness_as_precondition]]) |

**Device *sensing* stays in code** (consolidate the 6 duplicated `/iPhone|iPad|iPod|Android/i` regexes to
ONE source). **Device *policy* splits to the two homes above.** Both seeded with today's hardwired values
as defaults → **no day-one behavior change** ("dope the artifact"). Hardwires then come out.

**Carried over from the original settled decisions:** per-layer **inclusion** is Option A (reuse the layer
taxonomy), Stage-authored; NOT per-tree/micro (that stays automatic). **NO write-back from Preview to the
slab** (operator). Stage mobile-inclusion ("what ships") ≠ Preview inspection toggles ("what am I measuring").

**On the per-Look inclusion home (don't over-justify):** today inclusion is one global `IS_MOBILE`, so the
per-Look *value* is partly speculative. Justify it as "the per-Look authoring surface already exists; seed
all Looks identically from today's hardwires; the option's free if a Look ever diverges" — not with a use
case we don't have. If no Look ever diverges, nothing's lost.

## 3. Resolved design (was "open questions")

The reframe in §2 dissolves the original Q1/Q2/Q3:
- **Q1 (inclusion-only vs +quality):** neither — it's a *disciplined* split, not a ladder. We have exactly
  two device states, not a low/med spectrum; **don't invent a quality ladder.** One flat `mobileQuality`
  block + per-layer inclusion + a documented code-side tail. Both halves of "what ships to mobile" are
  controlled honestly without per-layer-quality schema blowup.
- **Q2 (per-Look vs deploy):** *both, correctly routed* — inclusion per-Look (slab), quality product-wide
  (`INSTANCE`). The "device concern" instinct was right for the quality half.
- **Q3 (faithful seeded default):** easier under the reframe — the entangled/shader-baked cases **don't
  move** (they stay code-side), so there's nothing to reproduce for them. Inclusion + flat quality both map
  cleanly to seeded values.

## 4. Hardwire inventory, classified (verified 2026-05-26)

- **Inclusion → slab:** `Scene.jsx:716` no `BakedLamps`, `:717` arch only-if-hero, `:721`
  `DeferredStreetLights`, `:138` no-hero-on-mobile (confirm this one's an inclusion vs a quality call).
- **Global quality → `INSTANCE`:** `Scene.jsx:651` antialias, `:673` dpr, `:674`/`:676` shadows +
  `StageShadows`. (`SlabBuildings:45` / `LafayetteScene:58` texture/detail skip → quality-ish; audit which.)
- **Shader-baked / structural → stays code-side, documented:** `StreetLights:234` alpha (compiled into the
  GLSL source via template literal), `:29–38` radii (module consts), `PostProcessing:357` (separate effect
  graph). `ContactModal` = UI-only, out of scope.
- Device-sense regex duplicated 6× → consolidate to one.

## 5. Provisional phasing (the smaller arc)

- **Phase 0 — Audit.** Classify every `IS_MOBILE` branch into the three §4 buckets; confirm the inclusion
  list and the seeded `mobileQuality` values mirror today exactly; confirm the `:138`/texture-skip edge calls.
- **Phase A — Consolidate device sensing** to one `IS_MOBILE`. Pure refactor, zero behavior change.
- **Phase B — `INSTANCE.mobileQuality`** (sync, product-wide): move `gl`/`dpr`/`shadows`/post-fx-tier to read
  from it, seeded to today's values. Mobile renders identically. (No slab/Stage work — self-contained.)
- **Phase C — Inclusion channel** in design.json + bake → slab; seed from today's inclusion hardwires; runtime
  gates layer mounts on the authored inclusion map. Hardwired inclusion branches come out. Identical behavior.
- **Phase D — Stage "Mobile" view + per-layer inclusion authoring** → design.json. Operator sees what the
  phone gets and toggles inclusion.
- **Phase E — Preview reflects** the mobile profile (read-only; no write-back) + measures it.
- **Phase F — Docs + cleanup.** SLAB-CONTRACT (inclusion channel), `INSTANCE` docs (mobileQuality), FEATURES,
  retire regexes; document the code-side shader/structural tail.

Note: Phases B and C are independent (different homes) and individually shippable — B has no slab/Stage
dependency at all, so it can land early and cheaply.

## 6. Convergence + sequencing

Touches `Scene.jsx` (buildings-cutover + trees-Phase-E also touch it), `PreviewApp.jsx` (measurement arc +
trees impostor flag), the slab schema, Stage, the bake, AND `INSTANCE`. Highest convergence of any in-flight
work → **lands last**, after measurement + the buildings/trees Scene.jsx work settles. The measurement regime
is its *instrument* (per-layer cost → informs the inclusion authoring). Surface to Boz before touching
`Scene.jsx` / `PreviewApp.jsx` / the slab schema so it sequences behind the others.

## 7. Remaining review prompts (smaller now)

1. Is **`:138` no-hero-on-mobile** inclusion or quality? (It gates a *shot*, not a layer — may be neither.)
2. Are the **texture/detail skips** (`SlabBuildings:45`, `LafayetteScene:58`) a global quality flag, or
   per-layer quality that argues for *some* per-layer quality after all? (The one place §2's clean split
   might leak — audit before Phase 0 closes.)
3. Still the right call to leave the **shader-baked tail** code-side, or does honesty-of-"what ships"
   demand even those be operator-visible (even if read-only)?
