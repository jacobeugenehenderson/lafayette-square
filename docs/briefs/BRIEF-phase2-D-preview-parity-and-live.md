# BRIEF — Phase 2 · D: Preview runs what ships, and live data has one reading per instant

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-04
evict-when: Preview's phone tiers run the production phone pass set; Preview's all-on equals production's mount list; the tier tuner is wired or gone; one weather-at-time-t and one forecast interpolator across kit and Ward; slab files addressed by where the manifest was fetched (or a loud stamp check) and the manifest fetched once; checks #3, #5, #6, #7 from the map green and mutation-tested; Jacob has eyed a scrubbed hour and a phone tier
-->

**Boz drafted this 2026-10-04 from Thread's continuity map; Jacob dispatches.** Phase 2, tranche 2, package **D**. Runs in parallel
with **A** and **C**.

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, yours, and not one a RUNNING session holds** (`ListAgents`; ask Jacob to
`/rename`). **Agent: FRESH.**
- The kit and the Ward (`~/Desktop/dev.nosync/theward`, pushed to `theward-player`). ⛔ No pours or bakes;
  `node scripts/bake-in-flight.mjs` before saving anything the dev servers import. Ports: 5173 / 5180.
- ⚠️ A kit change reaches the Ward only when its kit pin moves (`theward/checks/kit.mjs`; the pin move publishes the kit bundle).
  Tell Jacob when yours needs one; staging and production follow only by his Publish/Promote.
- Visible changes (a phone tier now dropping passes, a scrubbed sky) get **Jacob's eye** before they ship.
- Commit only your own paths. **Three-part fix** (`CLAUDE.md`); the commit names its register (`cartograph/PREVIEW.md` and
  `OPERATIONS.md` § Preview at least: both overstate today).

## Read first

1. **The spec**: the Phase 2 text at the end of `cartograph/_archive/BRIEF-runtime-continuity-DELIVERED-2026-10-04.md`, sections **Preview / Production Parity**,
   **Existing Detail / Downres Ladder** and **Live Handoffs**: *"Fix the current mobile discrepancy so phone profiles exercise the
   actual production-mobile pipeline."* *"Do not create a second LOD/quality/device regime."* *"Bake the ability to find live
   information, not the live information itself."*
2. **The map**: `scratch/runtime-continuity/MAP.md` **§1** Bake → Preview and Bake → Player rows, **§2** duplicate authorities 5 and 8,
   silent substitutions (Ward, slab stamps, the vacuous check), **§7** checks 3, 5, 6, 7.
3. **The ladder, before you touch it**: `cartograph/ARCHITECTURE.md §8` (the post-FX blur ladder, `DownsamplePyramid` shared by DoF
   and Bloom), `src/lib/qualityProfile.js` (its header names the mobile pass inclusion as *"the next step, and it lands HERE"*),
   `src/lib/renderTiers.js`, `src/preview/deviceProfiles.js`.

## The work

1. **Phone tiers run the production phone pass set.** `inspect` is always passed, so `included = POSTFX_PIPELINE` (9 passes); a
   production phone gets 3 (grade, smaa, grain) (`renderPipeline.jsx#RenderPipeline`). The `TIER_QUALITY` comment says the opposite.
   ⇒ the selected tier's real pass set, via `qualityProfile.js`, with the inspection toggles still reaching every pass the tier
   includes. ⛔ Not a second regime: one profile decides, Preview chooses it.
2. **Preview's "all on" is production's mount list.** `heroLadder` mounts in Preview whenever its toggle is on, ignoring its gate;
   production mounts it only when DoF is on (`renderPipeline.jsx#mountOn`).
3. **The do-nothing tier tuner.** `phone-hi` vs `phone-lo` and the pyramid tuner change nothing that renders: nothing imports
   `pyramidDegreeFor` (`renderTiers.js`). Wire it into the ladder or delete it (and the duplicated tier tables `RENDER_TIERS` /
   `DEVICE_PROFILES` / `TIER_QUALITY` become one).
4. **One weather per instant.** At a scrubbed time the label shows that hour's forecast (`theward/src/almanac/reading.jsx#readingAt`)
   while the sky shows **current** conditions under that hour's sun (`useAtmosphereDirective`; `src/hooks/useWeather.js#fetchWeather`
   feeds `current`). Measured 2026-10-04 on LS: "Clear Sky" (forecast noon 0% cloud) over an overcast sky (current 100%). Also two
   forecast interpolators: the Ward's cubic and the kit's linear (`dawnTimeline.js#interpolateForecast`). ⇒ one function answers
   "weather at time t", and the label and the sky both read it; `current` only when the clock is live. Also: `readingAt` silently
   shows "now" for a time outside the forecast, and `fetchWeather` swallows errors. Both become loud.
5. **The slab finds its files by where it was fetched.** `BakedGround` and `SlabBuildings` build file URLs from the stamped `m.look`,
   not from the Look requested, unchecked; moving HPDM's slab to its new name broke it until re-baked (2026-10-04). The tree atlas path
   already refuses a mismatch loudly; match it. And `manifest.json` is fetched twice per page with separate caches (the Ward's
   `manifest.js` and the kit's `slabUrl.js#townOf`): once.
6. **Fix the vacuous check.** `claims-baked-consumers-get-a-cache-bust` passes while checking **0 mount sites**. A check that counts
   zero must fail.

## ✅ Rulings at dispatch (Jacob, 2026-10-04; agent Vane)
- **Row 3: the tier tuner is NOT deleted.** It is unfinished, not dead (the aspiration case: surface, never evict). Its phone rungs are the intent that phones run every effect at a lower ladder rung instead of dropping passes (`renderTiers.js`, `plans/clean-for-handoff.md §W1`). Label it honestly; finishing it is separate ladder work, and drop vs low-rung is Jacob's call after measurement.
- **Row 6: re-aim the cache-bust check** at the current slab URL scheme (the `?t=` scheme was retired in `0c619894`), and a zero count fails.

- **Per-surface switches (Jacob, 2026-10-04):** *"we'll still have to have the option to disable things in any of the surfaces: desktop, phone hi or phone lo; we don't want to 'cancel bloom' because we can't get it going on a lo phone."* ⇒ the target is per-surface inclusion **as data** (the unbuilt deployment-policy setting; not D's to build). Row 1 reads inclusion through ONE function in `qualityProfile.js`, where that data will plug in. ⛔ Don't spread or harden the fixed `platform: 'desktop'` tag.

## Out of scope

The **deployment-policy file** (the per-platform channel listing). The map shows it doesn't exist; fix the doc that says it does, but
building it is Deployment / Mastering, after the measurement tranche.

## The chain

- **Trusts:** `qualityProfile.js` (the device question's one home), the bake's manifest, Open-Meteo (one fetch).
- **Trusted by:** every Preview measurement (they must describe what the target ships), the Ward's Almanac and sky, Promote's proof.

## Can the instrument see it?

`claims-preview-phone-runs-production-passes` (map §7 #3), `claims-the-slab-addresses-files-by-where-it-was-fetched` (#5),
`claims-one-weather-per-instant` (#6), and #7 (the zero-site check fails). Mutation-test each. Live: Preview at a phone tier on one
town; the Ward at a scrubbed hour where forecast and current differ.

## Deliverable

The six rows; the checks; `PREVIEW.md` / `OPERATIONS.md` brought into line (5 passes → the real count; the pyramid "degree swap" that
reaches nothing; the deployment-policy claim). **Read the spec, the map rows and the code, tell Jacob what you found, then build. If
the code contradicts this brief, stop and flag him.**
