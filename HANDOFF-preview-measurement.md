# Handoff — Preview: the publish-confidence instrument (the measurement regime)

> **Status: DRAFT — design ratified at standup 2026-06-17 (Jacob), not yet phased-for-dispatch.**
> The long-referenced keystone (`HANDOFF-tree-hero-lod.md`, `HANDOFF-mobile-profile.md`,
> `HANDOFF-render-conformance.md` all cite a "preview-measurement" brief that never existed). This is it,
> and the standup widened its scope: it is no longer just "the toggle/measurement convention" — it is the
> arc that turns Preview from a *desktop truth-meter* into a **publish-confidence instrument**.
>
> ⛔ **ROUTE FIRST** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` (Preview row) →
> `cartograph/PREVIEW.md` (the keystone Reference — read it whole; this brief builds the v0.2 it documents)
> → this brief. Adjacent arcs this one absorbs/coordinates: `HANDOFF-render-conformance.md` **Phase 4**
> (virtual phone renders the mobile path — now a sub-deliverable here) and `HANDOFF-mobile-profile.md`
> **Phases C–E** (the inclusion channel — now **authored in Preview**, see the doctrine reversal below).

---

## The north star (Jacob, standup)

> **The operator publishes and *knows* it will work — no push-and-wait troubleshooting.**

Today Preview answers "how expensive is the shipping render *on the operator's desktop*?" — which is the
wrong question, because the desktop always says "fine." The three things that actually break a deployed
phone are things the current instrument **cannot see**:

1. **Thermal** — "the phone shouldn't instantly hit 300°." This is *sustained* load over 60–90 s, not one
   frame's cost. Instantaneous frame-ms is blind to it.
2. **Crash on transition** — "the app must NEVER crash from overload." The OOM / WebGL-context-loss vector
   is the **upload spike during a transition** (shot change, TOD scrub, cold load) when geometry/textures
   upload and shaders compile at once — not steady-state.
3. **Frame budget on the target device** — not on the desktop.

The redesign re-aims the whole instrument at these three, each read **against a named virtual device**, and
gives the operator a **per-platform editorial surface** to bring a hot device under budget *while watching
the gauge respond.*

---

## The doctrine change — ratified (B), 2026-06-17

**Preview now AUTHORS deployment policy.** This is a *scoped* refinement of
`feedback_stage_is_source_preview_is_mirror`, not a teardown ("we've grown" — Jacob):

- **The Look still mirrors.** Stage authors the art (materials, colors, geometry, the rich `design.json`);
  Preview reads the frozen slab, never re-derives it. Unchanged.
- **Deployment policy is authored at the gate.** *Which channels ship to desktop vs. mobile* is **not
  Look-art — it is a cost-driven deployment decision**, and the cost instrument lives in Preview. So the
  per-platform inclusion manifest is **owned and edited in Preview**, the publish gate, where the operator
  can decide-while-measuring.

⚠️ **This overturns a twice-cold-reviewed line in `HANDOFF-mobile-profile.md §2`** ("NO write-back from
Preview to the slab; Stage authors inclusion, Preview mirrors"). The *reason* that line existed — never
conflate "what am I measuring" (inspection toggles) with "what ships" (inclusion) — is **preserved** by
giving inclusion its own editorial surface, distinct from the inspection toggles (see §6). Only the *host
app* moved: Stage → Preview. Mobile-profile §2 + render-conformance Phase 5 are repointed to here.

---

## What exists today (grounded in code, 2026-06-17)

Preview v0.1 is live and solid *for its original scope*; this arc extends it. The relevant machinery:

- **`GpuMonitor.jsx`** — per-frame draws/tris off `renderer.info` (autoReset off, delta'd for post-FX
  honesty), rolling CPU frame-ms, spike log. Per-layer cost via `measureToggle`: settled pre-baseline →
  skip 2 transient samples → average 5 post → **signed Δ in {ms, draws, tris}** (the Vernier Phase-0 fix).
  `GpuPanel` shows ms/fps + draws/tris against caps **200 / 1M**, and geos/tex/progs with **`cap=null`**
  (no budget, no color).
- **`StripChart.jsx`** — a rich event-bounded recorder. It **deliberately does not plot ms** (`:40` — at
  vsync the GPU burns ~98% of every frame regardless of work, so ms is "information-free"); it plots
  `composite()` = `max(draws/200, tris/1M)` *then re-expresses it as "effMs"* to reuse the ms gradient +
  axis. Has **swimlanes** (`camera` / `assets` / `compile`), **cluster detection** ("3× cluster —
  stagger"), EVENT/AMBIENT recording via `phoneBus`. The `compile` lane is literally `hint: '(todo)'`.
- **`isMobile.js`** — ONE shared `IS_MOBILE` UA sniff (render-conformance Phase 3 already consolidated the
  7 duplicated regexes). Drives the platform forks in `Scene.jsx` / `PostProcessing.jsx` etc.
- **Phone mode** — `PhoneFrame` renders a phone *aspect/bezel* but **desktop settings** inside it
  (render-conformance §6-F): the virtual phone currently tests nothing real.

**The two real problems, precisely:**
- **(P1) The per-channel tax is denominated in desktop-ms** — information-free at vsync, so unclicking a
  channel shows a meaningless "≈0 ms." This is Jacob's "the gauges are inert."
- **(P2) The budget is mobile-hardcoded AND duplicated** — `{ms:17|16, draws:200, tris:1M}` lives
  separately in `GpuMonitor` (SPIKE) and `StripChart` (BUDGET). No desktop variant, no device-tier, no
  fill/memory/thermal budget at all.

---

## The build (six pieces)

### 1. Device-profile SSoT — *do this first; everything reads it*
One module = the named virtual devices + their budgets. Collapses the two duplicated `BUDGET`/`SPIKE`
copies (P2). Each profile carries: `{ drawBudget, triBudget, fillBudget (px/frame), memBudgetMB,
frameBudgetMs, thermalSustainableMs }` + the render-path knobs (`dpr`, `antialias`, `logDepth`, post-fx
tier — the same set `mobile-profile`'s `INSTANCE.mobileQuality` defines; reconcile to ONE home, don't fork
a parallel budget table). Tiers: at least `desktop`, `phone-hi` (current iPhone), `phone-lo` (the gate that
matters). `GpuMonitor`, `StripChart`, the verdict, and the channel-listing all read from here.

### 2. The virtual device — emulation, not literal downclocking
⚠️ **A browser cannot downclock its GPU** (no WebGL/WebGPU API). "Truly weaken our processing" is delivered
as a faithful *proxy*, in two independent axes:
- **(a) Workload** = render the **mobile render path** (dpr 1, AA→SMAA, no log-depth, mobile post-fx tier,
  LOD tiers). This **IS `render-conformance` Phase 4** — fold it in here, don't run it twice. Answers
  "what work would the phone's GPU be handed."
- **(b) Weak hardware** = **supersample fill-strain**: render at N× pixels so each frame costs the desktop
  GPU proportionally more. Smooth at 3× ⇒ smooth on a ~3×-weaker GPU. The honest stand-in for "weaker."
- Then **read every gauge against the profile budget (§1), not the desktop's actual frame-ms.**

### 3. Re-aim the gauges (fixes P1)
- **Per-channel tax → % of device budget**, not desktop ms. Flipping a channel shows "Trees: 38% of the
  phone-lo draw budget · 14 MB." A tax against a ceiling, legible at a glance.
- **Honest StripChart units** — the work-ratio is fine (the `:40` reasoning is correct), but stop labeling
  it "ms" with a "60 fps" line. Label the axis as **% of budget** (or the dominant axis), so the chart
  doesn't claim a unit it isn't plotting.
- **At-a-glance verdict, per device** — one headline: `phone-lo: ✅ ships · ⚠️ throttles ~90 s · ❌ over
  memory`, backed by the three sub-gauges below.

### 4. The thermal / sustained gauge (failure mode 1)
Integrate frame cost over a rolling window; if sustained load stays above `thermalSustainableMs`, project
the throttle ("at this load the device throttles in ~N s, dropping to ~X fps"). New — nothing today sees
sustained load.

### 5. The memory + transition gauges (failure mode 2)
- **Memory ceiling** — wire `memBudgetMB` to the resident `geos/tex/progs` (today `cap=null`). The
  never-crash gauge.
- **Transition-spike** — the bones exist: `phoneBus` EVENT spans + the StripChart swimlanes already bracket
  camera/assets/compile gestures and flag clusters. Finish the **`compile` lane** (`(todo)`) and surface
  **peak-cost-during-a-span** (vs. steady-state) as the transition crash-risk readout.

### 6. The channel-listing — the per-platform editorial surface
A **new surface, separate from the inspection toggles** (§ doctrine — never conflate "measuring" with
"shipping"). A listing of every channel with **Desktop ✓/✗ · Mobile ✓/✗** — "the final editorial decision"
(Jacob). It is the **inclusion manifest** (`mobile-profile` Phase C's channel), now authored here and
persisted (Preview's one sanctioned write). **Coupling that closes the loop:** flipping "Trees → Mobile ✗"
**immediately drops its tax from the phone-device readout** — decide *and* watch it come under budget, in
one place. (The existing layer-toggle matrix stays exactly as-is: ephemeral inspection, never persisted,
"all-on == production.")

---

## Sequencing
1. **Device-profile SSoT (§1)** — pure refactor, unblocks all else, zero behavior change (seed from today's
   hardcoded 200/1M/17).
2. **Re-aim gauges to the budget denominator (§3) + memory ceiling (§5a)** — high-leverage, mostly
   front-end; makes the instrument legible immediately.
3. **Virtual device (§2)** — workload path (= render-conformance Phase 4) then supersample strain.
4. **Thermal (§4) + transition spikes (§5b)** — the two new failure-mode gauges.
5. **Channel-listing editorial (§6)** — depends on the inclusion manifest landing (mobile-profile Phase C);
   the editorial-in-Preview is the reversal's payload.

## Open decisions (Jacob's, before/within dispatch)
- **Device tiers** — which phones are the named profiles, and the real budget numbers (the current
  200/1M/17 are guesses; a real iPhone-class measurement should seed `phone-hi`).
- **Inclusion manifest home** — does it live in `design.json` (per-Look, as mobile-profile spec'd) even
  though Preview now authors it, or a deploy-side manifest? (Per-Look still seems right; only the *editor*
  moved.) Confirm at Phase C.

## Coordination
- **Absorbs** render-conformance **Phase 4**; **inherits** mobile-profile **Phases C–E** under the reversal.
  Touches `PreviewApp.jsx`, `GpuMonitor.jsx`, `StripChart.jsx`, the new device-profile module, `INSTANCE`,
  and (Phase 6) the slab/inclusion schema. **High convergence with the tree arc (Azimuth C/E) and
  buildings on `Scene.jsx`/`PreviewApp.jsx` — serialize; surface to Boz before editing those.**
- Canonical off-limits unless the dispatch says so: the slab contract (except the inclusion channel), the
  neon doctrine. 49/51 throughout — the instrument is correctness, but the look must still hold.

*Filed 2026-06-17 (Boz) from the afternoon standup. Supersedes the dangling "preview-measurement"
references in three briefs. The Reference home for the settled result is `cartograph/PREVIEW.md` v0.2.*
