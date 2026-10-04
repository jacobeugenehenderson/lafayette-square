# PREVIEW.md — superseded passages, 2026-10-04

Retired by Phase 2 D (Vane): Preview's phone tiers now mount the phone's pass set, and pass inclusion is the quality
profile's (`qualityProfile.js#includesPass`). Live home: `cartograph/PREVIEW.md §0.1` and `§3`. Kept for the record;
not current.

> ### ⛔⛔ THE PARITY CLAIM IS DESKTOP-ONLY, AND THIS PAGE USED TO STATE IT UNCONDITIONALLY *(corrected 2026-09-02)*
> **Production drops five post-FX passes on mobile** — `renderPipeline.jsx:252`, `platform = IS_MOBILE ? 'mobile' : 'desktop'`, and the manifest marks **`ao` · `pyramid` · `dof` · `bloom` · `aerial`** as `platform: 'desktop'`. **A phone renders `grade` + `smaa` + `grain` and nothing else.**
>
> ⛔ **AND PREVIEW CANNOT SHOW YOU THAT.** `const included = inspect ? POSTFX_PIPELINE : …filter(…)` — **inspecting installs the WHOLE desktop pipeline regardless of tier**, by design, so the toggle matrix can reach every pass. `IS_MOBILE` is a user-agent sniff, so on the desktop doing the inspecting it is always `false`. **`phone-hi`/`phone-lo` are a desktop render at a phone-ish pyramid resolution inside a phone bezel** — the device selector swaps the *yardstick* (`deviceProfiles.js` budgets) and the pyramid *degree*, never the *pass set*. The code comment at `renderPipeline.jsx:253` says exactly this; only this doc overclaimed.
>
> ⭐ **Two consequences worth holding.** The **pyramid tuner's phone rungs tune a pass no phone runs** (`RENDER_TIERS['phone-lo'].pyramid` feeds `DownsamplePyramid`, which is desktop-only) — so a number read off them is not a mobile number. And the **all-on cost total is a DESKTOP cost**: §3's "all on == production" holds for desktop and overstates mobile, which runs five fewer passes.
>
> ▶ **This is a known arc, not an oversight** — `_handoffs/HANDOFF-mobile-profile.md` ("~20 `IS_MOBILE` branches across 6 files silently decide what mobile users get") plans `INSTANCE.mobileQuality` + per-profile slab channels, and the v0.2 regime (§0.2) is what would let Preview *honor* per-platform inclusion. ⭐ **Both handoffs are now TRACKED (2026-09-02)** — they were in the gitignored `_handoffs/`, which is why this read as undecided rather than merely unbuilt. Board row: **`ROADMAP.md H1`**.



---

- **"All on" must equal production's literal mount list** — so the all-on cost number is the shipping cost. ⛔ **True of DESKTOP production only** (§0.1): mobile ships five fewer passes, so all-on *overstates* the mobile cost and no toggle state reproduces the mobile set. A toggle

---

The layer roster (`PreviewApp.jsx:361`): **Scene** — Ground, Buildings, Trees, Park, Streetlamps, Gateway Arch, Neon, Sky+Sun, Clouds, Atmospheric Fog. **Post-FX** — N8AO, Bloom, Aerial Perspective, Film Grade, Film Grain.

---

Two deliberate default-state divergences from production, both QA bypasses (`DEFAULT_LAYERS`, `PreviewApp.jsx:392`):
- **Neon is forced all-tubes-on** for worst-case profiling (production gates neon by open-by-hours / TOD) — mirrors Stage's "Force Neon On."
- **Bloom defaults off** (in Preview only) — *not* because it's broken (that flag was stale — cleared 2026-06-21, Jacob; the cited `project_bloom_diagnosis_actual` never existed); off only so a reload doesn't burn into a black scene. Revisit defaulting it on for parity.

---

- 🟡 **Temporary local defaults** — `DEFAULT_LAYERS` (neon-forced / bloom-off) live in Preview's source; they belong in a `phone-profile.json` field-of-truth once that lands (`feedback_stage_is_source_preview_is_mirror`). Stage authors, the Look serializes, Preview reads — the defaults object is a placeholder until then.


---

- **Preview *is* production + bolt-ons — on DESKTOP.** Same render tree, byte-for-byte, plus the profiler, phone frame and toggle matrix. ⛔ **On mobile it is not:** production drops `ao`/`pyramid`/`dof`/`bloom`/`aerial`, Preview installs them all regardless of tier, and no tier selector changes that (§0.1). The cost numbers are honest **desktop** numbers.


---

## From OPERATIONS.md § Preview

(linear depth, no shadow map, the hero-only pieces, no building textures, the phone post-FX); Desktop with the desktop profile. The Canvas is re-created on a tier switch (depth can't change live). Until 2026-09-28 every tier drew the device's own profile, so "phone" measured the phone's frame through a desktop renderer. ▶ `node checks/claims-the-canvas-is-the-towns.mjs`

---

- **Post-FX layers** — N8AO, Bloom, Halo (aerial perspective), Film Grade, Film Grain, SMAA, **DoF** *(WIP)*.
- **Two deliberate default divergences from production** (`DEFAULT_LAYERS`): **Neon is forced all-on** (worst-case profiling, vs. production's TOD-gated neon), and **Bloom defaults off** (only so a reload doesn't burn into a black scene — not because it's broken). Flip them on for true parity.

---

trust the all-on total; neon is forced-on.

---

### The pyramid tuner — *in flight* ⏳

The **Pyramid · <env>** card, collapsed by default (click its heading to open). Per-device sliders (**Levels · Resolution · Radius**) that tune the **shared downsample pyramid** feeding Bloom + DoF — `Resolution` is the looks↔cost dial (finer mips cost perf). Persists per-environment to `localStorage` (`preview.renderTiers.v1`). ⚠️ **This is part of the in-flight measurement-regime / shared-pyramid arc, not settled doctrine** — the pyramid being shared + re-bracketable per device tier is still being worked out (`HANDOFF-preview-measurement.md`, `[[preview-equals-pyramid-tier-ladder]]`). Document/operate it as provisional; the channel set and where it lives may still move.

---

**The layer-toggle matrix is *ephemeral inspection* ("what am I measuring") — never persisted as policy; "all-on" equals production.** Separately, the operator authors **deployment policy** here: the per-platform channel-listing (desktop vs. mobile inclusion), the one thing Preview writes.

---

The per-platform **inclusion manifest** — *which channels ship to desktop vs. mobile* — is a **cost-driven deployment decision**, so it's authored here at the gate, beside the instrument that responds (`PREVIEW.md §0.2`). ⚠️ **Not yet built** — the editorial surface lands with the v0.2 measurement regime (`HANDOFF-preview-measurement.md`, Phase 3–4). Until then Preview writes nothing; its product is the operator's *verdict* ("ship the slab" / "back to Stage").

---

**Evicted from `PREVIEW.md` 2026-10-04 (Phase 2 E, Plumb).** §4's third caveat — *"Neon is forced on — worst-case, unlike production's authored/TOD-gated neon (§3)"* — described a Preview override removed in `55fdab64`; `SceneCaveats` no longer carries it. The header's *"In flight — the v0.2 measurement-regime arc … Not yet built"* was replaced by §4a, the startup and residency gauges that landed.

**Also evicted the same day: `PREVIEW.md §6 Status`**, which repeated §2's toolkit as a checklist and cited line numbers that had drifted (`PreviewApp.jsx:619`). As it stood:

## 6. Status — done / partial

**DONE (shipping, verified in code):**
- ✅ **Render parity** — Preview mounts production's exact tree (slab buildings + foundations + neon off the slab index; L1.3 cutover 2026-05-26). `BakedBuildings` deleted; no separate render path.
- ✅ **GPU profiler** — per-frame draws/tris off `renderer.info` (autoReset off, delta'd for post-FX honesty), rolling CPU frame-time, spike log with cause attribution.
- ✅ **Per-layer cost** — settled pre/post-toggle attribution (Vernier Phase-0 timing fix); live cost bars on every Scene + Post-FX layer.
- ✅ **Phone mode**, **layer matrix**, **TOD scrub**, **shot picker** (adjacency-gated), **soft-reload**, **trigger/phoneBus spans** — all live.
- ✅ **Hero parity** — the authored bounce replays through the shared `heroAnim.js`, identical to Stage and production.

**PARTIAL / the tail:**
- 🟡 **Cold reload** — soft-reload remounts `CanvasContents` (re-fetch); a true cold reload via `sessionStorage` handoff is sketched, not built (`PreviewApp.jsx:619`).
- 🟡 **`BasicLights` fallback** — a Preview-only inspection light for "celestial off"; held resident-but-hidden, never drawn in the all-on path (no production analog).

---

**Also evicted: `PREVIEW.md §0`'s retired-doctrine banner** ("STAGING IS REDUNDANT FOR SLAB-DATA" IS RETIRED), reduced to its surviving sufficiency line. Its last paragraph ("Promote to Prod is `git push origin <branch>:main`") was rot: `OPERATIONS.md` § Publish records that Promote ships one Map and no longer pushes `main` (2026-09-26). As it stood:

> ### ⛔⛔ "STAGING IS REDUNDANT FOR SLAB-DATA" IS RETIRED — IT WAS REVERSED ON 2026-09-03, AND THIS PAGE OUTLIVED IT BY A DAY
> This paragraph read: *"because Preview already renders the slab in production's exact tree, **staging is REDUNDANT for slab-data** — the publish flow pushes straight to prod; staging-first applies only to code/structural changes."* Settled 2026-06-30, and **true until the bucket stopped being one key space.**
> **What replaced it:** one bucket, **two prefixes** (`staging/` and the un-prefixed prod keys). ⛔ **A bake may only ever write `staging/`**; production is a separate, deliberate promotion. The reason is the one the old rule could not price: *"the bigger issue is there's no way to preview it before it goes live"* (Jacob) — a pour reached `lafayette-square.com` the instant it uploaded, with no gate and no way back except re-baking a slab that may no longer exist.
> ⭐⭐ **THE COST OF THIS SENTENCE OUTLIVING ITS TRUTH, MEASURED 2026-09-04 — it was load-bearing in CODE, not just prose, in three places:**
> - **`/promote` shipped code and no slab.** Under the old rule the bake *did* reach prod directly, so promotion had nothing to upload; the split moved the mechanism and left the wiring. Nothing anywhere ran `--env=prod`. **830 of 915 prod objects were stale** — a complete but older canopy, rendering plausibly, telling nobody.
> - **`/deployed?target=` accepted the target and discarded it,** reading prod's keys for both rows — *citing this paragraph by name to justify it.* The staging row reported production's slab, so the panel's two gestures could not disagree.
> - **`PUBLISH.md §6`** carried the matching sentence ("per-environment prefixes are the fix if it ever bites"). It bit.
>
> ⭐ **The doctrine that survives is the half about *sufficiency*: Preview is still the gate for a slab** — it renders the slab in production's exact tree, and no amount of staging soak tells you more than that. What died is the claim about *mechanism*: that shipping a slab therefore needs no separate environment. It does now, because the two environments hold **different bytes**.
> ▶ `PUBLISH.md §6` · `node checks/claims-the-slab-envs-do-not-collide.mjs`
> ⛔⛔ **BUT READ WHAT THE BUTTON DOES, NOT WHAT THE DOCTRINE INTENDS (2026-08-28).** "Promote to Prod" is `git push origin <branch>:main` — it fast-forwards prod to your whole working HEAD, so **every commit you are carrying ships, not just the baked look.** The doctrine above is about *sufficiency* (a slab needs no staging soak); the mechanism is a full release. ⭐ The slab COMMIT is properly scoped (`slabPathspecs` cannot sweep unrelated dirty files) — it is the PUSH TARGET that is wide.
> ⛔ And the staging target must be derived, never quoted: it was pinned to a branch nothing had deployed for four weeks, so the button reported success and staging never moved. ▶ `node checks/claims-the-publish-gate-pushes-where-staging-deploys.mjs`

**Also evicted: `PREVIEW.md §4`'s budget paragraph**, which cited `BUDGET_MS=16 (PreviewApp.jsx:431)` and `SPIKE = {…}`, constants that moved to `deviceProfiles.js` in June. As it stood:

**The budget is anchored to milliseconds**, the only thing that directly determines smoothness. Per-layer bars are scaled to `BUDGET_MS=16` (`PreviewApp.jsx:431`); the GPU panel warns frame-time amber >22ms, red >33ms, and shows draws / tris against soft caps (200 draws, 1M tris). Draws + tris are shown for context but **don't drive the bar color** — a layer that takes 1ms but uploads a million tris is fine on a modern GPU. Spike detection fires on the same thresholds (`SPIKE = {ms:33, calls:200, tris:1_000_000}`) plus any metric doubling its tracked baseline, and tags the spike with the most-recent gesture label.
