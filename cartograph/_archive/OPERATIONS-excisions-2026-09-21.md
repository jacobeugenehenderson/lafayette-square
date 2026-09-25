# Diary — verbatim text excised from `cartograph/OPERATIONS.md`, 2026-09-21

Retired for CURRENCY, not for truth. Each block below names the live home its fact moved to,
so a citation that lands here resolves forward rather than dead-ending.

---

## 1. The document's own status banner (was line 5)

**Live home:** the provenance footer at the end of `OPERATIONS.md`, which already carries the same
dates in the same order. Excised because it said the same thing twice, at the two places a reader
opens the file, and the duplicate is what makes a stale build-date feel doubly attested.

> **Status: populated 2026-06-14** (the operator-knob content migrated out of FEATURES, purifying FEATURES to pure what/why); **Stage + Preview built out to the full per-card knob master list 2026-06-26** (grounded against the panel code — `CartographSkyLight.jsx` / `CartographPost.jsx` / `CartographSurfaces.jsx` / `PreviewApp.jsx`); **Extent (intake→pour) flow added 2026-07-04; rewritten to the inclusion-polygon procedure 2026-07-20** (`ExtentApp.jsx` + `BezierPen.jsx`, committed on trunk). Still grows as the tile re-pour's **T3 authoring migration** reshapes the Survey/Section tools — fill in as those settle.

---

## 2. The "un-taken fork" correction paragraph (was line 623)

**Live home:** the two bullets immediately above it in `OPERATIONS.md §How it ships` — *"the slab
needs no commit and no push"* / *"everything else still does"* — which state the live fact directly.

**Why excised rather than kept:** this is the anti-pattern `CLAUDE.md` names by name — *a correction
banner sitting next to the false sentence it corrects.* The banner's job ended when its subject was
gone, and keeping both means the false sentence is still on the page, still quotable, and reached
first because it is shorter. The lesson inside it is real and is preserved here.

> ⭐⭐ **AND THE FORK THIS PARAGRAPH CALLED "UN-TAKEN" WAS TAKEN — BY A THIRD ROUTE IT DID NOT CONTEMPLATE.** It read: *"Derived artifacts are intentionally git-tracked, not ignored — that's what lets CI stay a plain `vite build`. The alternative — gitignore them and bake in CI — is a deliberate, un-taken fork."* That framed it as a binary, and the binary was false. **We gitignored the slab and still did not bake in CI:** the authoring machine uploads it to R2, so CI stays a plain `vite build` *and* the 516 MiB leaves the repo. The reasoning that kept them tracked — "it's what lets CI stay simple" — turned out to be defending a constraint that had a third answer. ⚠️ Everything else derived (`ribbons.json`, `looks/index.json`) is **still tracked**; this applies to `public/baked/` alone.

⭐ **The transferable half, and the reason this block is kept at all:** a doc that frames a decision as
a binary forecloses the answer that is actually taken. "Deliberate, un-taken fork" reads as a closed
question and stopped anyone re-asking it for months.

---

## 3. Superseded knob text, replaced in place 2026-09-21

Each was **ROT** — the doc described an older reality — and the correction landed in the same
sentence rather than beside it. Verbatim, so a citation of the old wording resolves:

> - **Cast shadows** (`shadow`) — the sun's shadow-map quality: kernel size + per-pixel samples (softer/cleaner ↔ cheaper). *(Was the "Shadow" knob under Post›Finish.)*

**Superseded by** `3dcb5dd3`: the field is **Penumbra (m)**, range 1–60, and every stored value was
migrated ×(1800/4096). The texel unit only ever held still because the shadow frustum was hardcoded
to ±900 m in every town.

> ⚠️ **After any CLI `bake-ground.js`, run `bake-ground-ao.js` too** — the geometry bake rewrites `ground.json` without the AO `lightmap` block, so a standalone ground bake ships flat-lit (the `serve.js /bake` GUI chains them automatically; only manual CLI bakes hit this — see `BACKLOG.md`).

**Superseded by** `4e971116`: the ground bake now carries an existing `lightmap` block forward and
stamps a `groundKey`; a mismatch is **refused loudly** by the renderer, naming the command. The
instruction to re-run the AO pass stands; the *silent flat-lit* failure it warned about does not.

> - **Lamps.** Two wells: the OSM fetch (`raw/osm_street_lamps.json`) + an **authored** well …

**Superseded by** `4e971116`: three wells, not two, and the first is the town's own live pull —
`raw/osm_street_lamps.json` is a hand export that **nothing in the pipeline writes**.

> - **Authoring vs. runtime controls (2026-06-24).** The Hero shot opens in **runtime**: the bounce **plays** and the orbit controls are **locked** — you're watching exactly what ships.

**Superseded by** `757f6918` + `e6b0de43`: the gate is **playing vs. not playing**, never shot vs.
shot. ⚠️ Both halves of the original comment were load-bearing and one was deleted on the way —
the lock's second job (hand the camera to the flight during a take) cost a day's round trip when
the sentence naming it went.

> ⚠️ It calibrates to the terrain exaggeration (`V_EXAG`); if you ever raise exaggeration, re-bake and re-check the slopes.

**Superseded by** `9378acfb`: `V_EXAG` no longer exists. The exaggeration is `design.terrainExag`,
per town, defaulting to the neutral 1.


## 2026-09-24 — Hero history, excised from `OPERATIONS.md` Stage ▸ Camera / Shots (Gantry, pruning while adding the H-3 highway section)

*The live rules stay in OPERATIONS; the "it used to" narrative moves here, verbatim.*

  - ⭐ **EVERY TOWN HAS A HERO CAMERA** *(2026-09-21)*. ⛔ It used to be Lafayette Square's alone: one flag, `hasHero`, gated the mount of the thing that **drives the playback** — so on a poured town the Play button toggled a state nothing read, and keyframes recorded perfectly and then did nothing. The flag read as *"does this town have a hero OBJECT"*, and it does not gate an object: a town with no landmark still needs a camera path, and the resolver already answers "no landmark" with the hood centroid. Retired from the registry entirely.
  - ⭐ **THE FIRST KEYFRAME IS THE ENTRY POSE — on every town, since 2026-09-22.** Landing in Hero puts you at the path start you authored, with its FOV. ⛔ It used to do that only on Lafayette Square: a generic "fit the town's radius" scaffold ran afterwards and overwrote the authored pose on every poured town (huron: 4.2 km out and 1.7 km up, against an authored 457 m — the operator waited out a long load to arrive somewhere they had not chosen). The scaffold now yields to authored keyframes, exactly as Browse's does to an authored frame, and still covers a town with none (the kit stores no camera until you save one).
