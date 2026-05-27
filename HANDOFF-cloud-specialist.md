# Handoff — Cloud-Design Specialist

> **You ARE the dispatched agent.** Name yourself (don't ask; pick a name and sign your commits with it).
> Your lineage is **Nimbus**, the prior cloud specialist who seeded the preset library, the 67 quality
> tags, the WMO codes, the 42 reference photos, and the descriptions. You inherit that work and go
> deeper. Clouds are your **only** concern.
>
> **The one-line goal:** the clouds must look like the cloud they're *supposed to be*, and sit *in* the
> sky rather than pasted on top. This is the **backdrop of the entire map** — it has to be among the
> highest-fidelity, most realistic assets in the composition. Right now it is not.

## What the operator wants — read this first

Judge everything by the **visible result**. The operator (Jacob) optimizes for the look, not for
vocabulary or control count: *"if we found a cloud simulator off the shelf and it worked like magic and
it was all jargon I'd embrace it."* So:

- **Off-the-shelf is welcome — often preferred.** Don't assume you must build bespoke. If a known
  volumetric-cloud renderer / shader / library reaches the bar within our budget, adopting it is a great
  outcome. Survey what exists *before* building from scratch (see Phase 0).
- **Jargon and complexity are fine when they earn their keep.** Don't avoid a technique because it's
  unfamiliar or technical. The bar is "does it reach the look," not "is it simple."
- **The one discipline:** don't add controls/complexity that *don't* move the result. The failure mode
  to avoid is a pile of similar, opaquely-named knobs presented as if quantity were progress
  (*"adding 64 knobs of jargon labels doesn't get me anywhere"*). Keep operator knobs distinct and
  legible — derive internal params, expose only the genuinely independent ones.
- **Don't route the work through a metaphor.** Jacob may gesture with analogies (Photoshop layers, AE
  noise mattes, fractal/moiré) — take those as quick pointers, not the working vocabulary. Use whatever
  actually produces realistic clouds and name controls for what they visibly do.

## Where things stand (your baseline)

The data model is already rich — **don't rebuild it**:
- `public/clouds/presets.json` — 52 presets (39 cloud), each with **distinct, taxonomically-correct**
  params; 67 quality tags (`fibrous`, `turreted`, `pouches`, `mares-tails`, `mackerel`, `lens`,
  `roll`, `ragged`, `veil`…), WMO codes, per-preset descriptions.
- `public/clouds/photos/` — 42 reference photos (one per preset) + `SOURCES.json`.
- `meteorologist/pipeline/schema/preset.schema.json` — has a `modifiers` field already reserved for
  "accessory features layered atop the base genus by the shader" (anticipated, never implemented).

**The problem is the renderer, not the data.** `src/components/atmosphere-materials.js` builds the
density field from **one isotropic FBM** (`coverage, density, thickness, baseAlt, warpFreq, warpAmp,
noiseSeed, octaves`). That vocabulary is *amount and lumpiness only* — it has no way to make a cirrus
streak, a cumulus cauliflower, a mammatus pouch, or a flat stratus sheet. So every genus renders as the
same puffy blob, and the rich quality tags are a spec the shader never fulfilled. **That is the gap you
close.**

**Three render fixes just landed (uncommitted at handoff — build on them, don't redo them):**
- **Slab-follows-cloud** (`Atmosphere.jsx`): the render volume now tracks `[baseAlt, baseAlt+thickness]`
  each frame, so any preset's altitude renders (was hardcoded to the ~1200m cumulus band).
- **Authoring-normalize** (`CanaryScene.jsx` passes `displayBaseAlt`): the Teacup places any preset in
  the band its cameras frame, so you can author shape regardless of real altitude.
- **Additive lighting** (`atmosphere-materials.js`): `lit = ambient + direct + silver`; the sky-colored
  ambient floor is no longer multiplied to black by self-shadow. Shadows pick up the sky now — but they
  still read matte because the scattering model is single-bounce (Phase 2 below).

There's a built-in debug switch you'll use constantly:
`window.atmosphereMaterial.uniforms.uDebugMode.value = 3` (mesh), `1` (raw density), `2` (raw FBM), `0` (normal).

## The approach — decided in Phase 0, not pre-committed

The hard constraint is **real-time budget**, not technique: this is the whole-sky backdrop and must hold
up on desktop AND the virtual phone. So an offline physics sim is out — but a real-time
simulator/renderer (off-the-shelf or bespoke) that hits the budget is fully in. Two candidate paths,
chosen on evidence in Phase 0:

- **Adopt an off-the-shelf real-time cloud renderer/shader** if one reaches the look within our budget
  and integrates with our sky (this is welcome — don't reinvent if it exists).
- **Build a per-morphology approach** if nothing off-the-shelf fits: keep the volumetric raymarch slab
  (it's sound and integrates with the sky — you'd replace the *density field* + *scattering*, not the
  architecture), and give each cloud family its own recipe (`cumuliform`, `cirriform`, `stratiform`,
  `cumulonimbiform`, `mammatus`, `lenticular`…) so a cumulus and a cirrus differ *in kind*, not just
  amount.

Either way the bar is the same: clouds look like their genus and glow/sit in the sky. Recommend the path
to Boz/Jacob with evidence before going wide.

## Phases (the spine — confirm/narrow with Boz before going wide)

**Phase 0 — Audit + survey (no shader code).** Three threads:
- **Reference-library audit (do this first — it gates everything).** The operator has flagged
  **photographic lapses** in the library: photos that are missing, weak, ambiguous, or don't actually
  show the genus they're labelled for. Go through all 42 against `SOURCES.json`, list the gaps, and
  propose fills (better/additional shots per genus — multiple angles + lighting are ideal). You can't
  reverse-engineer or verify a shape against a bad reference, so flag what needs re-sourcing before
  relying on it. Sourcing the actual images may be an operator step — surface the list.
- **Quality → geometry audit.** For each genus, from a *good* reference + its tags, write down the one or
  two features that make it instantly recognizable (cirrus = combed parallel streaks; cumulus = hard
  cauliflower lobes, flat base; mammatus = downward pouches; stratus = featureless sheet). Map each
  quality tag to the feature that produces it. Deliverable: a morphology taxonomy + what today's shader
  can/can't make (it can't make most).
- **Off-the-shelf survey.** Evaluate existing real-time cloud renderers/shaders against our look bar,
  budget (desktop + virtual phone), and sky-integration needs. Recommend adopt-vs-build with evidence.

Deliverable: morphology taxonomy + a reference-library gap list + an off-the-shelf recommendation.

**Phase 1 — Noise/shape vocabulary.** Build the composable matte library + the morphology recipes, and a
**small** set of plainly-named operator knobs that drive them. Extend the preset schema for the new
dials. The point is a cumulus and a cirrus now look *different in kind*, not just in amount.

**Phase 2 — Scattering / luminance.** Make clouds glow and sit in the sky: a multiple-scattering
approximation + phase function + powder/dark-edge handling, building on the additive ambient floor that
just landed. This is the "lack of luminance / not integrated / dark band" complaint.

**Phase 3 — Re-author the 39 presets** against the reference photos with the new vocabulary; refine
tags/descriptions where the audit surfaced gaps. Operator does final by-eye approval per genus.

## Constraints + boundaries

- **Performance is in-scope throughout** — it's the whole-sky backdrop and must hold up on desktop and
  the virtual phone (raymarch step budget, mobile early-Z). Don't let fidelity blow the frame budget;
  the hybrid exists precisely to avoid simulation cost.
- **Don't add knobs that don't move the result** (see "What the operator wants"). Distinct, legible
  controls only — if a recipe needs 12 internal parameters, expose the few genuinely independent ones
  and derive the rest. Complexity/jargon is fine when it earns its keep.
- **Commit boundaries:** you own `src/components/atmosphere-materials.js`, `Atmosphere.jsx`, the preset
  schema, and `presets.json` re-authoring. Coordinate before touching the directive pipeline, the
  Conditions side, or `CanaryScene` framing beyond what Phase 1 needs.
- **Surface anything not in this brief** — extra files, schema changes, new defaults — in your status
  and commit bodies.
- **Out of scope / parked:** the deployed build's separate wispy-cloud path (not wired to weather) —
  see `meteorologist/BACKLOG.md`; the Teacup weather-overlay preview lens (separate follow-on).

## Reference

- Diagnosis + render-fix history: `meteorologist/NOTES.md` 2026-05-27 entry.
- Data: `public/clouds/presets.json`, `public/clouds/photos/`, `meteorologist/pipeline/schema/preset.schema.json`.
- Renderer: `src/components/atmosphere-materials.js`, `src/components/Atmosphere.jsx`.
- Judge by the result; off-the-shelf and jargon are welcome when they reach the look — avoid only
  knobs/complexity that don't.
