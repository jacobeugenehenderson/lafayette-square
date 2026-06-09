# Meteorologist — Operations

The operator's manual: here's the panel, here's the knob, here's when to turn it. The procedural counterpart to `FEATURES.md` (which sells the tool) and `ARCHITECTURE.md` (which explains how it works). If you want to *do a thing*, it's here.

> Reference doc (procedural). Seeded 2026-06-08; populate as the tool stabilizes. Voice: "to do X, click Y." Conventions and the layout model live in `INTERFACE.md`; live wiring state in `STATUS.md`.

---

## 0. Launch + save model

- **Open** `/meteorologist.html` (its own app shell). Or use Stage's Sky & Light card → "launch meteorologist →".
- **Backend:** `meteorologist/serve.js` (port 3335). It must be running for autosave to land.
- **There is no Save button.** Every edit autosaves through `serve.js` after validation. The only explicit action is **Revert** (per-Condition, per-channel) — a recovery affordance.
- **Validate the artifacts** any time:
  ```bash
  cd meteorologist
  npm run validate -- ../public/clouds/presets.json ../public/clouds/almanac.json ../public/clouds/modulators.json
  ```
  Expect `ok: 52 presets, 16 rules, 7 modulators`. A failure prints the offending path and exits 1.

---

## 1. The three modes (top bar)

`TEAPOT ⎮ CONDITIONS ⎮ MODULATORS` — co-equal libraries, not nested.

- **Teapot** — author individual **cloud presets** (one cloud's intrinsic shape/lighting). Click a row → Teacup workstage.
- **Conditions** — author **weather situations** (when a weather payload should produce which clouds + sun/wind/precip). Click a row → Condition editor.
- **Modulators** — author **continuous phenomena** (signal-driven deltas layered on top of Conditions — cold-front gold, wildfire smoke, etc.).

**Look picker** (top right) — selects which Cartograph Look's *sky* is imported as the authoring backdrop. It does **not** scope your edits (Teapot + Conditions are global); it only changes the sky you author against. Switch Looks to confirm a cloud reads under multiple skies.

---

## 2. Authoring a cloud (Teapot → Teacup)

1. Pick a preset in the Teapot library.
2. Use the **slot tabs** to choose your audience:
   - **Cloud Chamber** (first tab) — the cloud isolated against sky, tight framing. The at-a-glance "is this fluffy or wispy?" read. Tune intrinsic shape here. *(Code currently labels this "Browse" / overhead — see `STATUS.md`; the Cloud-Chamber framing is the intent.)*
   - **Ground** — the same cloud in situ, standing under the hero tree on the LS stage. Verify it reads at real scale.
3. **Time of Day card** (top of the right rail) — scrub TOD (7 waypoints) and the Year strip (4 season anchors); Playback animates time. The sky + sun respond live.
4. **Cloud parameters** (13 TodChannels) — drag a slider to author the value at the current TOD slot. Each param can be **flat** (one value) or **animated** (per-slot keyframes via the chip strip). Sliders are editable only when the playhead sits on an attached slot.
5. **"Previewed under"** selector — pick a Condition whose sky modulations color the backdrop while you tune (cumulonimbus under Thunderstorm, then Clear Day).

What you can't do here: precip/lightning rates. Those are **expression**, authored per-cloud inside a Condition (§3), not intrinsic to the cloud.

---

## 3. Authoring a weather situation (Conditions → Condition editor)

A Condition = **When** (predicates) + **Directive** (atmospheric output) + **Clouds-in-condition** (the blend).

1. Pick a Condition (or the dropdown in the header).
2. **When this condition fires** (range sliders, bottom of rail) — the `weatherPayload` boundaries (tempC, cloudCover, precipMmHr, stormDistanceKm, sun elevation…) that make the Almanac evaluator select this Condition. Not TOD-animated.
3. **Sky modulations** (TodChannels) — darken / desat / halo / light dome / wind speed / wind dir. How the sky reads in this situation.
4. **Clouds in this condition** — pick which Teapot presets blend (capability-filtered: a cloud only appears if it can do what the Condition expresses), set per-cloud **weight**, and the **expression** flags (rain rate / snow rate / lightning) gated by that cloud's capabilities.
5. **Revert to ship defaults** (bottom of Sky-modulations) — restores this Condition's on-disk defaults. Per-Condition only; others untouched.

---

## 4. Seeing the weather (the in-situ environment)

> Status (2026-06-08): the canary's **Ground/in-situ environment wiring is in progress** — see `STATUS.md`. The tree is lit and sways; clouds and sky render. Selecting a Condition does **not yet** drive precip / scene-darkening / lightning in the canary (that bridge is the active build). In **production** it all works — the canary is catching up to it.

When wired, the in-situ model is: **the tree sits still, the weather animates around it.** Leaves sway with wind; clouds drift and darken; rain/snow falls; lightning flashes. You're standing under the tree while the sky performs.

---

## 5. Known operational gaps

- **Precip/lightning/darkening don't preview in the canary yet** — they work in production; the Conditions→canary bridge is being built (`STATUS.md` → "Environment wiring").
- **Lightning never fires from a Condition** — the almanac authors no `lightning` field; the driver consumes one that nothing writes (Phase 3b adds it).
- **No fixtures / Preview Studio** — you can't yet preview an arbitrary weather scenario without waiting for it; Phase 5b.
- **Cloud morphology is limited** — the renderer is one isotropic FBM, so dramatic genera (mammatus, fractus, towering cumulonimbus) can't be expressed yet (cloud-realism work is tabled).
- **Slot naming drift** — code says "Browse"/overhead; the intended first slot is the "Cloud Chamber" thumbnail. Reconcile pending.

---

## 6. Cross-references

- [`FEATURES.md`](./FEATURES.md) — what the tool is + why (the brochure)
- [`INTERFACE.md`](./INTERFACE.md) — the canonical layout model (every surface, what it owns)
- [`STATUS.md`](./STATUS.md) — live wiring matrix (what's hooked up right now)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how it sits in the kit + the consume-from-Stage / staging-area doctrine
- [`CANON.md`](./CANON.md) — what's in the Teapot, what's not, why
