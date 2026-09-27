<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: every time-of-day channel the kit has is keyed at all seven slots in the kit's own defaults, each value is either cited or named as a design choice, a check proves it, Jacob has seen the default day on two towns at every slot, and he has ruled which existing towns adopt it.
-->

# The kit's day: a designed time-of-day default for every town

**You are the dispatched agent: a time-of-day design specialist. Name yourself: one word, not a name another
RUNNING session holds** (check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.**

## The ask (Jacob, 2026-09-27)

*"Look at all our controls and times of day and create the keyframes for every ToD, and save it as the base default
for all maps. This will require a design discussion, so it will require a colloquial read-in on our platform, a
scientific read-in on what times of day would produce, and then a comprehensive pass through our controls. We have
tools for dramatic effects including neon, so I want to make sure we are taking advantage."*

## Why this is the kit and not a look

Every town today pours with a day that someone has to hand-correct. The day is keyed to seven **named sun moments**,
not clock hours: Dawn · Sunrise · Noon · Golden · Sunset · Dusk · Night (`src/cartograph/animatedParam.js`
`NAMED_TOD_SLOTS`). Each slot's minute is computed live from SunCalc at the town's own latitude and date. So a day
designed on those slots is **portable by construction**: it follows the real sun in any town and any season. That is
what makes a designed default a kit asset rather than one town's look (`CLAUDE.md` Layer 0).
⛔ The trap: a value that looks right at Provincetown's 42°N and is wrong at 55°N, or a value tuned to one town's
buildings. Every value must be justified by the **sun's position or the physics of light**, never by how one town
looks.

## Four phases. Stop after phases 2 and 3.

### 1 · The colloquial read-in: what this platform is
`ORIENTATION.md` (the whole thing) · `SHOW-BIBLE.md §0–§1` · `cartograph/STAGE.md` (all of it, and especially §1
the channel families and §1.5 per-shot overrides) · `cartograph/OPERATIONS.md` (every Stage card) ·
`cartograph/FEATURES.md` (Stage) · `ls/STREET-VIEW.md` (the eye-level shot). Then open Stage on Provincetown and
Huron and scrub a full day at Hero, Browse and Street.

### 2 · The scientific read-in: what each slot should produce
For each of the seven slots: the sun's elevation, the sky's luminance and colour, the colour temperature of direct
and skylight, shadow length and softness, the ground's illuminance, the moon and stars, how the eye adapts (the
Purkinje shift at night), and what artificial light does: sodium versus LED street lamps, neon, lit windows.
⭐ **Every number you rely on is recorded in `references/registry.json`**, with its source's terms checked (the
registry already refuses sources that bar AI use; follow its pattern). A value with no source is labelled a
**design choice** and argued, never passed off as physics.
⚠️ **Latitude:** in a high-latitude summer, SunCalc returns no `night` (and sometimes no `dusk`). Say what the
kit's day must do there. Two nearby US towns (LS 38.6°N, Provincetown 42°N) will never reveal it.

### 3 · The controls pass
Enumerate every Stage control from the code, not from memory. The channels and their defaults live in
`src/cartograph/skyLightChannels.js` (`*_FLAT_DEFAULTS`) and the store's `DESIGN_FIELDS`
(`src/cartograph/stores/useCartographStore.js`). For each one: what it moves, whether it is keyed by time of day,
and **what it should do at each slot**.
- ⭐ **Don't redo the controls audit.** `BRIEF-stage-controls-audit.md` (Loupe, 2026-09-26) measured every knob's
  name, effect and range, and its check is live: ▶ `node checks/claims-stage-controls-are-live.mjs`. Read the
  commits (`git log --grep=Loupe`) and build on them.
- ⭐ **The dramatic tools, by name**, because Jacob wants them used: neon (`NEON_*`, open-by-hours ×
  time-of-day intensity), lamp glow and pools (`LANTERN_*`, `LAMPGLOW_*`), set-piece uplights, bloom, halo, mist,
  stars, constellations, the Milky Way (`BRIEF-milky-way.md`), clouds and weather. For each, say where in the day it
  should carry the picture.
- ⛔ **Known open defects this work runs into, with homes:** `ROADMAP H-34`: the ground's night darkness has no
  owner (`floorWhite` has no time-of-day term, and the ambient term *rises* toward night). That is an unbuilt
  decision and Jacob's ruling, so name what your day needs from it and don't route around it. `H-15`: the two-body
  sun/moon rig, whose eye gate at the crossover hour is owed.
  ⚠️ **Weather confounds the look** (Jacob found the "dark horizon" was the weather setting, 2026-09-27). Judge
  every slot in `clear` weather, and state it.

**⛔ STOP after 2 and 3.** Publish one page for Jacob (an Artifact) with the science per slot, the controls map, and
your proposed day: one table with a row per channel, a column per slot, and a sentence of intent per slot, plus how
it uses the dramatic tools. **That page is the design discussion.** Nothing is authored until he rules on it.

### 4 · Author it, save it as the kit's default, prove it
- Author on a **scratch Look forked from Provincetown** (Stage › Look › New). ⛔ **Stage autosaves every knob into
  the open town's `design.json`**, so never author on a real town. Tell Jacob its name.
- ⭐ **Where "the base default for all maps" lives:** the kit's 0-state Look (`public/looks/kit-default/design.json`)
  is `{}` **on purpose**. Every absent channel resolves from the code defaults above, and `serve.js` says why:
  *"Writing the defaults into the file would restate the source and go stale."* ⇒ the default day is written into
  **the code defaults** (as time-of-day channels where they are keyed), not into a file.
- ⛔⛔ **CHANGING A CODE DEFAULT REACHES EVERY EXISTING TOWN THAT HAS NOT AUTHORED THAT CHANNEL.** An absent channel
  resolves from the default at load, so Provincetown, Huron, HPDM and LS would all move on every channel they left
  unkeyed (Provincetown keys `skyGain` only at dawn and night, for example). **Before changing anything, measure it
  per town:** which channels each `design.json` authors and which it inherits. Put that table in front of Jacob.
  **Which towns adopt the new day is his ruling.** A town that should keep its current look must have it written
  into its own `design.json` first.
- The check (the deliverable): every time-of-day channel in the kit defaults is keyed at all seven slots; every
  value names its source or its design reason; and no default carries a town's name or a value copied from one
  town's Look. ▶ extend `checks/claims-look-default-has-no-town.mjs`, whose "assert a property of the default,
  never a comparison against LS" rule is the model. Mutation-test it.
- Jacob's eye: the default day on **two towns** (Provincetown and Huron) at every slot, at Hero and at Street.

## The chain

**Upstream (you trust):** SunCalc slot times per town · the channel resolver (`animatedParam.js`) · the store's
hydration.
**Downstream (trusts you):** every new pour's first look · every existing town's unauthored channels · the baked
`scene.json` each town ships, which carries the resolved day into The Ward. A channel the bake doesn't carry never
reaches the public (`SLAB-CONTRACT`), so check that each channel you key reaches `scene.json`.

## Bounds

- Phases 1–3: read, measure, research, report. No edits except `references/registry.json` entries and the page.
- Phase 4, after Jacob's ruling: `skyLightChannels.js`, the store's `DESIGN_FIELDS`, the check, and the canon
  (`STAGE.md`, `OPERATIONS.md`, `FEATURES.md`: the kit ships a designed day). No bake without Jacob's go in your
  window; other towns re-bake only on his ruling.
- Shared tree: commit only your own paths (`git commit -- <paths>`). Other agents today: Strand (shore, water,
  revetment), Plinth (the set-piece: `SetPiece.jsx`, `PilgrimMonument.jsx`, `SceneNeon.jsx`, `provincetown.js`), and
  possibly a weather-controls agent in `CartographSkyLight.jsx`. Clear any of those files with Boz before editing.
- Commit messages name the register reached.

**The instruction is confirm-then-build:** read the canon and the code, tell Jacob what you found, and if the code
contradicts this brief, stop and flag him.
