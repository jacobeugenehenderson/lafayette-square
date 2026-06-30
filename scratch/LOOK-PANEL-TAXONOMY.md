# Look-panel taxonomy — current map + proposed reorganization

> 2026-06-30, with Jacob. The look-authoring panels are organized by **render
> mechanism** (which pass/shader each knob pokes), not by **operator intent**
> (what you're trying to achieve). This maps the current state, names the
> incoherences, and proposes an intent-based reorg. Source of truth for the
> channels: `src/cartograph/skyLightChannels.js`; for the layout:
> `CartographPost.jsx` + `CartographSkyLight.jsx`.

## Current taxonomy (what the operator sees)

### POST card (`CartographPost.jsx`)
| Section | Channels | What each actually is (mechanism) |
|---|---|---|
| **Camera** | Exposure · Warmth | FilmGrade `uExposure` (gain) · ambient/hemi color bias |
| **Shadow** | AO · Fill | N8AO post pass · FilmGrade `uToe` (shadow tone-lift) |
| **Soften** | Bloom | CustomBloom pyramid |
| **Finish** | Grade · Grain · Antialiasing (SMAA) · Focus (DoF) · **Shadow** | FilmGrade contrast/toe/sat/brightness/vignette · FilmGrain · SMAA pass · RomanceDoF · **SoftShadows (cast shadows)** |

### SKY & LIGHT card (`CartographSkyLight.jsx`)
| Section | Channels |
|---|---|
| **Atmosphere** | Mist · Halo · Sky Layer Gain · Neon |
| **Lighting** | Ambient · Hemisphere · Moon light · Sun light |
| **Celestial** | Constellations · Stars · (Milky Way, commented out) |

### HERO & HORIZON card
Arch placement · Arch Lighting · Horizon disc · Shots (FOVs/bounds) · Browse heading

### LAMPS card
Lamp Glow (ground pool + tree canopy) · Lantern (the lamp's own emission)

### SURFACES card (separate — `CartographSurfaces.jsx`)
layerColors · luColors · materials (color/physics/palette) · [NEW, not yet a knob: surface desaturate/value treatment]

---

## The incoherences (why "nothing works intuitively")

1. **"Shadow" is two different things in two places.** A *section* named "Shadow"
   holds AO + Fill — but the actual **cast-shadow** control (the `shadow` channel,
   SoftShadows) sits under **"Finish,"** nowhere near it. The operator's shadow
   control isn't in the Shadow section.

2. **"How dark are the darks" is scattered across 4–5 controls in 2 sections, and
   two of them fight:**
   - AO (post N8AO) → Post › Shadow
   - Fill (FilmGrade toe) → Post › Shadow
   - Shadow / cast shadows (SoftShadows) → Post › Finish
   - **Grade › Toe** (FilmGrade toe) → Post › Finish — *the SAME uniform Fill
     drives; Fill overrides it, so the Grade Toe slider is **dead**.*
   - Baked **AO lightmap** on the ground (a second occlusion, not even a panel knob)

3. **"How bright" has no home.** Exposure (gain, Post › Camera) · Brightness (lift,
   Post › Finish › Grade) · Sky Layer Gain (sky-only gain, Sky&Light › Atmosphere) ·
   Ambient/Hemisphere (fill-light intensity, Sky&Light › Lighting). Four brightness
   levers across two cards and four sections.

4. **"Fill" is mislabeled.** In every other tool, *fill light* = the soft secondary
   light. Here "Fill" is a **shadow tone-lift** (the toe), and the *actual* fill
   light is **Ambient + Hemisphere** — filed under a different card. A designer
   reaching for "fill" finds the wrong thing.

5. **"Grade" and "Finish" are mechanism-buckets, not intents.** "Finish" lumps
   color grade + film grain + antialiasing + depth-of-field + cast shadows —
   unrelated, bundled only because they're "the other post passes." SMAA (a pure
   technical AA toggle) sits beside artistic DoF and Grade.

6. **Color is split five ways** with no home: Warmth (Post›Camera) · Grade›Saturation
   (Post›Finish) · Sky colors (Sky&Light) · Mist/Halo color (Sky&Light›Atmosphere) ·
   surface colors (Surfaces card).

7. **One mental act touches three places.** "The sun" = Sun light intensity
   (Sky&Light›Lighting) + its cast-shadow softness (Post›Finish) + its fill
   (Ambient/Hemi, Sky&Light›Lighting). Authoring "the sun" is a scavenger hunt.

**Root cause:** every knob was exposed *wherever its effect already lived in the
pipeline* ("knobs on the existing X effect, promoted from envState"), and the
section labels (Camera/Shadow/Soften/Finish/Atmosphere) describe **where in the
renderer** it sits, not **what you're doing**.

---

## Proposed taxonomy — grouped by intent (the question you're answering)

> Designer-familiar shape (Lightroom/DaVinci basic panels). Each group = one
> question. Most of this is a **pure re-grouping of the same `TodChannel`s** under
> new section names — channels/store/bake unchanged.

1. **Tone** — *how bright & how punchy*
   - Exposure (gain) · **Brightness** (lift) · Contrast
   - (Exposure + Brightness side-by-side = the HSB "B" story, gain vs lift.)

2. **Color** — *what hue & mood*
   - Warmth (white balance) · Saturation · [Surface desaturation, when it lands]

3. **Light & Shadow** — *the 3D lighting* (the big consolidation)
   - Sun light · Moon light
   - **Fill light** (= today's Ambient + Hemisphere — renamed to what it is)
   - **Cast shadows** (today's `shadow`: size/samples + a strength)
   - **Occlusion** (today's AO; note the baked-lightmap twin to unify later)
   - **Shadow depth/lift** (today's "Fill" — renamed; **kill the dead Grade›Toe**)

4. **Sky & Air** — *the dome & atmosphere*
   - Sky gain/color · Mist · Halo · Stars · Constellations · Milky Way · Clouds

5. **Glow & Light Sources** — *emissive things*
   - **Bloom** (the global aura — and the lantern's halo should come from HERE)
   - **Lantern (the fixture)** — filament (hard-bright) + glow; its aura = Bloom.
     *Fixes the conflation:* today's "Lantern" + "Lamp Glow" are two half-descriptions
     of this ONE object. Merge them into one "Lantern" fixture control.
   - **Ground pools** — the baked radial light pool under each lamp. Its **own**
     control (today it's slaved to lantern brightness — give it back its own knob).
   - **Canopy glow** — the tree under-lamp emitter (today's `lampGlow.trees`).
   - **Neon** · **Arch Lighting**

   > Corrected model (Jacob 2026-06-30): lamps = **three** things — the fixture
   > (lantern + aura/bloom), the ground pool, the canopy emitter — not the current
   > "Lantern / Lamp Glow" two-way split that conflates fixture with pool+canopy.

6. **Lens & Film** — *camera/finish artifacts*
   - Focus (DoF) · Vignette · Grain · [Antialiasing (SMAA) → a "Quality" footnote, not an art knob]

7. **Surfaces** — *albedo & materials* (existing card; add the surface desaturate/value knob here)

8. **Framing & Landmarks** — *the shot* (existing Hero & Horizon): Shots · Arch placement · Horizon · Browse heading

### The specific fixes baked into the reorg
- **Kill the dead control:** remove Grade›Toe (Fill owns the toe uniform).
- **Un-double "Shadow":** one home (Light & Shadow) for cast shadow; the section
  name no longer collides with the channel.
- **Rename "Fill" → "Shadow lift/depth";** promote Ambient+Hemi to **"Fill light."**
- **Explode "Grade":** contrast/brightness → Tone, saturation → Color, vignette → Lens.
  "Grade"/"Finish" as catch-alls disappear.
- **Separate technical from art:** SMAA (and any device-quality toggles) leave the
  art panels.
- **Flag the two occlusions** (baked lightmap + N8AO post) as one intent for an
  eventual mechanism merge.

---

## ✅ Phase A — LANDED (2026-06-30, UI-only, slab byte-identical)

- **"Light & Sky"** card (was "Sky & Light") leads with a unified **Light & Shadow**
  section: Sun · Moon · Fill light (was Ambient) · Sky fill (was Hemisphere) · Cast
  shadows (was the buried Post›Finish "Shadow") · Occlusion (was AO) · Shadow lift
  (was the mislabeled "Fill"). Then Sky & Air · Night Sky · Neon.
- **"Image"** card (was "Post"): Tone & Color (Exposure · Warmth · Grade) · Glow
  (Bloom) · Lens & Film (Focus · Grain · Antialiasing).
- **"Light Sources"** card (was "Lamps"): Lantern · Lamp Glow · **Arch uplights**
  (moved out of Hero & Horizon — a source, not framing; relabeled from "Hero Lighting").
- **Dead Grade›Toe removed** (Fill owns the uToe uniform).
- **Fades reframed** to "turn-on/off speed" (was "ramp in/out minutes" jargon).
- All mechanism section names (Camera/Shadow/Soften/Finish/Atmosphere/Lighting/
  Celestial) → intent names.

**Deferred to Phase B:** Bloom + Neon → "Light Sources" (needs cascade-aware mount
consolidation — they're shot-forkable; Lantern/ArchLight read the store directly) ·
lamp fixture/pool/canopy restructure · split Grade so Brightness sits beside Exposure
(channel split) · merge the two AOs · consistent easing defaults · card ORDER pass.

## Scope / sequencing (so this is low-risk)

- **Phase A — pure UI regroup (cheap, high payoff, low risk):** re-mount the same
  `TodChannel`s under the intent sections; rename labels (Fill→Shadow lift,
  Ambient/Hemi→Fill light); remove the dead Grade›Toe slider. **No channel keys,
  store, resolver, or bake change** → design.json/slab byte-identical; only the
  panel's section headers + order + a few labels move.
- **Phase B — consolidations (optional, later, real code):** unify the two AOs;
  fold a `strength` into Cast shadows; the surface desaturate/value knob into
  Surfaces. Each its own eye-gated step.

## The fade controls (`transitionIn` / `transitionOut`) — formalize or drop

**What they do (`animatedParam.js`):** per-channel ramp widths in *minutes*. The
resolver holds a slot's value until within `transitionIn` minutes of it, then
lerps in; mirror past the slot with `transitionOut`. They shape **how a channel
crosses between time-of-day keyframes** (hold-then-ramp vs. ramp the whole way).

**They DO make sense — keep them (Jacob 2026-06-30).** The real use case: a manmade
light coming **on ~30 min before dusk** and snapping off at dawn, instead of slowly
ghosting up/down across the multi-hour slot tweens ("I could let them build over the
long tweens, but it's not as good"). They're a **turn-on/off timing** control for
lights — legitimate and wanted.

**What's actually wrong is only framing + consistency:**
- **Explained as jargon.** "Transition in: 30" = minutes of ramp; maps to no feeling.
  Frame it as **"turn-on / turn-off speed"** (snappy ↔ gradual), which is what it is
  for the lights it's used on.
- **Seeded inconsistently with no rule.** `30/30` on lampGlow, mist, halo, grade,
  dof, neon, dirSun, archLight, lantern — but `0/0` on bloom, skyGain, hemi, dirMoon.
  Accreted, not authored. Pick a sane default and apply it consistently (lights get
  tight ramps; atmospherics can default longer).

**Formalize, don't drop:** relabel for what it does (turn-on/off speed) + fix the
default consistency. (A later, optional **per-keyframe** version — each slot owns its
in/out — would let a light snap on at dusk yet fade off slowly at dawn; only if the
single per-channel ramp proves too coarse.)

## Open decisions for Jacob
1. **Merge Tone + Color into one "Basic" panel** (Lightroom-style: Exposure ·
   Brightness · Contrast · Warmth · Saturation), or keep them as two groups?
2. **Card structure:** keep two big cards (Post / Sky&Light) re-sectioned inside,
   or break into the 8 intent groups as their own cards/accordions?
3. **Rename scope:** labels only (cheap), or also rename the underlying channel
   keys (`fill`→`shadowLift`, etc. — touches design.json + migration)?
4. **How far in this pass:** Phase A only (regroup + kill dead + relabel), or A+B?
