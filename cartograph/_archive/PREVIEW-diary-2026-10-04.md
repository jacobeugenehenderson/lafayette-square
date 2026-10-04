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
