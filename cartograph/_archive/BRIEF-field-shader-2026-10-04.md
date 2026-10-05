<!-- BRIEF-STATE
status: LANDED
dispatched: no
written: 2026-09-20 · re-scoped 2026-09-26 (the six-month cycle + plant impostors, Jacob)
evict-when: huron's fields play the season — dirt → tilled rows → sprouts → plants → harvest → back — and Jacob has eyed it near and far, with LS's park grass unchanged.
-->

# BRIEF — A FIELD IS NOT A LAWN

*Written 2026-09-20 by the coordinator seat. Second of two landscape-leverage briefs; the first is
`BRIEF-water-shader.md`.*

> ### ⭐ THE ASK — Jacob, 2026-09-20
> *"Will we be able to fill a field with Corn? Just realizing we should add more foliage if that's
> possible."* · *"Without a hero object, we're going to need to get a lot of visible leverage from
> the landscape itself, and that means beautiful (expensive) water and beautiful fields."*

> ### ⭐⭐ RE-SCOPED 2026-09-26 — A DAY-LEVEL TASK: THE SIX-MONTH FIELD *(Jacob)*
> *"Huron requires rowcrops, and I want to make a 6-month material/shader that starts out brown (dirt), gets
> plowed/tilled into raised rows, then the rows sprout. Impostor plants can fill in until harvest when the
> sequence can play in reverse."*
> ⇒ **One cycle, driven by the shared calendar** (`src/hooks/useCalendar.js` — `dayOfYear`; the lab's month
> control), in stages: **bare dirt → tilled raised rows → sprouts → plants (impostors) → harvest → reversed back
> to dirt.** This supersedes §6's season bullet (winter barren → spring tilled → summer sprouting) by extending
> it through harvest, and it **brings plant impostors INTO scope** (§8 had them out).
> - **The stage dates are a property of the town, never a constant** (Layer 0 Class D): planting and harvest
>   day-of-year, with a unit and a source in `surfaces.mjs` — **authored with a neutral default, or a
>   `references/registry.json` finding** (e.g. USDA's published usual planting/harvesting dates for the state).
>   ⛔ Not "April to October" hardcoded; that is Ohio corn, and it is wrong in the next town.
> - **Raised rows** are relief the eye reads near and mid: row bearing and spacing DERIVED per field (§4①②
>   unchanged), rows shaded by the sun through the shared sockets. A shader answer first; say plainly if near
>   views need geometry.
> - **The plants**: impostor cards along the rows, growing with the stage, instanced — the first consumer of
>   `lu-policy.mjs#plantingOf` (`agricultural → { with: ['zea_mays'], pattern: 'rows' }`). ⚠️ The impostor
>   machinery is the Arborist's (`arborist/bake-impostors.js`, `HeroImpostorTrees.jsx`) — reuse its capture and
>   card path; ⛔ no second impostor system. Count their cost against the phone budget (Column B) and report it.
> - **Reverse at harvest**: the same states played back, not a second sequence.
> - **Crop type**: one generic crop first. OSM `crop=*` and USDA's Cropland Data Layer (national, per-field,
>   yearly) are the per-crop sources later — measure what each covers on huron; don't build per-crop yet.
> ✅ **RULED 2026-09-26 (Jacob): THIS BRIEF IS THE GROUND ONLY.** *"I only want the ground with row texture and patterns and colors."* The season lives entirely in the ground surface here. **Plants move to their own brief, `BRIEF-botanica.md`** — *"eventually (maybe soon) we'll ALSO populate the specialized LU with impostors."* ⛔ No plant work in this brief.
> ▶ **Order for the day:** §5's area measurement (short) → the dirt/tilled/sprout surface cycle in the lab →
>   the plant impostors → Jacob's eye in the lab at eye/mid/overhead across the months. **Stop and ask** before
>   anything needs a re-pour or bake.

> ### ▶ STATE 2026-09-26 (Furrow)
> ✅ **The surface cycle is built and baked on huron:** `crop` in `surfaces.mjs` (dates `f-usda-corn-grain-dates-{state}`,
> spacing `f-ars-corn-row-traditional`, ridge `f-nrcs-346-ridge-min-height`; `growFrac`/`headlandM` authored), field ids in
> the ground bake (`src/lib/fieldAxis.js`), the albedo + relief in `grassMaterial.js`, `greenhouse` its own class.
> ▶ `node checks/claims-crop-rows-derived-per-field.mjs` (mutation-tested each run). ⚠️ A "field" is a FACE (the check prints the count;
> OSM's farmland polygons are the finer unit, not built). ✅ **EYE-GATED 2026-10-04 (Jacob): "that already looked good, it was just applied to the wrong places."** The surface is done; WHERE it
> paints is land use's: `BRIEF-land-use-per-piece-and-the-control.md` + `BRIEF-land-use-derivation.md`. ⏭ Retire to the Diary at the next
> sweep (17 citations to repoint, some in code). The plants moved to `BRIEF-botanica.md`
> (PARKED) by the 2026-09-26 ruling above. *(Boz the Younger, 2026-10-04: the check is green, 6 fields on 6 axes.)*

---

## 1. You are the dispatched agent. Name yourself — one word, not a name another RUNNING session holds (check `ListAgents`; ask Jacob to `/rename`).

## 2. Agent: **FRESH**

⚠️ `BRIEF-water-shader.md` is the sibling and may be live. **You share a pattern and nothing else** —
different scale, different physics, different failure modes. ⛔ Do not merge the work; coordinate
through Boz if both are running.

## 3. ✅ THE PREREQUISITE LANDED 2026-09-20 — **`agricultural` IS A CLASS NOW, AND SO IS `orchard`**

`landuse:farmland · meadow · farmyard · greenhouse_horticulture · plant_nursery` → **`agricultural`**;
`landuse:orchard` → **`orchard`** (`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`). Measured
on a re-poured huron: its face classes went **9 → 12**, with **`agricultural` 0 → 8 faces.**
▶ Re-derive, never quote: `node checks/claims-every-lu-tag-has-a-home.mjs`.

> ### ✅ MEASURED 2026-09-26 (Furrow) — THE CENTROID CEILING IS GONE; TWO OTHER GAPS ARE NOT
> The coverage vote (`dc0c264f`) replaced the centroid vote: **142 of the 152 ha of OSM farmland in
> huron's disc reach baked `agricultural` ground.** But the baked class covers **541 ha**, only 142 of it
> farmland in OSM (47 greenhouse, ~300 with no OSM land use) — cause not established; that is
> `BRIEF-land-use-derivation`'s, routed to Boz. And the ground mesh draws **7,396 m²** of the class
> outside its own polygons (filled holes, a rim sliver), reported by the bake every pour.
> ▶ Re-derive: the `[bake-ground] face:agricultural` lines every ground bake prints.

## 4. THE MECHANISM EXISTS — build IN the surface lab

- **Which surface a class gets** is one table, `cartograph/surfaces.mjs` (`SURFACE_OF_CLASS`), and a
  crop's parameters (row bearing, spacing, headland, season) are declared there with a unit and a
  source — the one settings model (`BRIEF-surface-lab §4`). ⛔ No parameter home elsewhere.
- **The material** is an albedo chunk in `grassMaterial.js#makeGroundSurfaceMaterial`: every socket
  (weather, sun, lamp pool, contact shadow) is shared, so a crop inherits the environment. ⛔ No
  parallel material.
- **Build and eye it in the lab**: ▶ `lab.html?look=huron&at=class:agricultural` (month = season).

### ① WHAT A CROP IS, THAT A LAWN IS NOT
⭐ **ROWS.** That is the whole perceptual difference and it is mostly free: the grass noise is
isotropic; a crop is **strongly anisotropic** — a row frequency and a row *bearing*.
⚠️ **And the bearing is a real question, not a constant:** rows follow the field's own long axis, and
that is derivable per-face from the polygon (minimum-area rectangle, or the dominant edge direction).
⛔ **A fixed bearing across every field in a town will read as wallpaper** — it is the single most
likely way this ships looking wrong. Derive it per face.
⭐ Also unlike a lawn: **seasonal height and colour** (bare soil → green → gold → stubble) and a
**headland** — the turning strip at the field edge where rows stop. The headland is cheap and it is
most of what makes a field read as *worked* rather than *striped*.

### ② SCALE — the failure mode this brief shares with the water one
⛔ The grass material's frequencies are tuned for **a lawn seen from a sidewalk.** huron's farmland
is measured at **37 features**, and a field is viewed mostly **near-to-mid**, not at 40 km² like the
lake. ⚠️ **Different problem from water, same discipline: derive the frequency from the feature's own
extent, not a constant.** A row spacing that looks right on a 20 m verge is corduroy on a 400 m field.

## 5. ⭐ THE MEASUREMENT TO DO FIRST — it decides how much of this is worth building

▶ **Size the audience before designing the treatment.** Per town, per candidate class, measure:
**how many faces, what total area, and what fraction of the disc.** huron's raw carries
**farmland 37 · meadow 12 · greenhouse_horticulture 3 · orchard 1** — ▶ re-derive, and get the AREA,
which nobody has. ⛔ **If farmland is 2% of huron's disc, a corn shader is a luxury; if it is 30%, it
is the town's whole look.** Neither is known today and the brief should not assume.
⚠️ **And measure it on altadena too** — it is the other non-LS town with area to spare, and a
treatment justified by one town is an instance patch.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE
- **How many crop treatments?** One generic "cropland", or corn / soy / wheat distinctly? ⭐ OSM
  carries `crop=*` on some farmland — ▶ **measure how many of huron's 37 actually have it** before
  proposing a per-crop system that the data cannot feed.
- ✅ **`orchard` — ASKED AND RULED (Jacob, 2026-09-20).** It is a **placement pattern, not a surface**,
  and it is not the Arborist's either: the Arborist is a species FACTORY. `orchard` is now its own LU
  class carrying a **`planted`** policy row — `{ ground: 'planted', with: [...], pattern: 'grid' }` —
  and ⛔ **nothing reads that spec yet.** There is a filter (`forbidden-surface.mjs`) where there
  should also be a **generator**, and that generator is the unowned piece. ⛔ Still not yours to
  absorb; it is now *named* rather than open. (`lu-policy.mjs`'s `plantingOf()` is the socket.)
- **`meadow` vs `grassland` vs `grass`** — three tags, and it is not obvious they are three looks.

## 7. ⛔ Can the instrument SEE the change?
⚠️ **Largely not, and say so rather than faking it** — this is a LOOK, and a check asserting
"beautiful" would be worse than none. What IS checkable, and should be:
- ⭐ **row bearing is DERIVED per face, not constant** — mutation: hardcode one and prove it fails.
  That pins §4①, the thing that silently degrades into wallpaper.
- frequency derived from extent, not a constant (§4②).
- every agricultural face resolves to the crop material once the class exists — **and none does
  today**, which is the §3 prerequisite stated as an assertion.

**Eye-gate surface:** huron, **near AND far** — ⛔ a field that reads well overhead and as corduroy at
eye level has failed. ⭐ **LS's park grass UNCHANGED is the control**: if the lawn moves, the
extension was not faithful.

## 8. Write/commit bounds
**In bounds:** a crop albedo chunk in `grassMaterial.js` · its rows in `cartograph/surfaces.mjs` · the
new check.
**In bounds since 2026-09-26:** the crop plant impostors (reusing the Arborist's impostor path) and their instancing.
**Also in bounds since 2026-09-26 (Jacob, on Furrow's questions):** a per-face id baked into the ground group for per-field row bearing, with a **Huron** re-bake to show it; and ONE vocabulary change — `landuse:greenhouse_horticulture` leaves `agricultural` for its own class (a greenhouse is a building, not a field). Every town's land-use counts before/after in the report.
⛔ **OUT:** the LU vocabulary itself (`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`) · water
(`BRIEF-water-shader.md`) · the arborist's placement (`orchard`, see §6) · the containment-direction fix.
⛔ **LS's grass must come out UNCHANGED.** It is the control and the one surface an operator knows.
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. The agricultural audience is **measured by area**, two towns, before anything is built.
2. A crop surface exists in `surfaces.mjs` + the ground-surface factory, inheriting weather, sun and lamps, with the three seasons.
3. **Row bearing and frequency are derived per face** — and a check proves it, mutation-tested.
4. LS's grass is unchanged; Jacob has seen huron's fields **near and far.**
5. `orchard` is **asked about, not absorbed.**

---

> # ⭐⭐ THE GATE THIS BRIEF IS ACTUALLY JUDGED ON *(Jacob, 2026-09-20 — applied to every open brief)*
>
> ### ⛔ "DOES IT LOOK GOOD" IS NOT AN EYE-GATE. IT IS AN AUTHORING SESSION, AND IT IS NOT YOURS.
> *"Until I am in the authoring moments of the camera, I'm just looking at elements. I think we spend
> a lot of time worrying about the moment an operator sees the map for the first time being ugly or
> random, and I think that's a silly concern."*
>
> ⭐ **A first pour being ugly is FINE AND EXPECTED.** *"Even grass with houses on it looks beautiful
> and gets the project advancing."* ⇒ **Do not hedge against an aesthetic judgment. Do not tune.**
> ▶ **THE GATE IS: is the element PRESENT and CORRECT?** Does it arrive · is it seated · does the
> class exist · did the count change. Measurable, falsifiable, and none of it about composition.
>
> ⛔ **THE ONE EXCEPTION, AND IT IS THE REAL RISK:** where a WRONG element looks PLAUSIBLE — a
> cornfield rendering as lawn, a pond rendering as nothing, buildings buried under terrain. ⭐ That
> is not an aesthetic worry, it is *"the map is lying and nothing says so."* **Protect that. Ignore
> the rest.**
>
> ✅ **THE PARAMETER HOME IS DECIDED (2026-09-24):** `cartograph/surfaces.mjs` — a surface's parameters
> with unit and source, the operator's layer in `design.json#surfaces` (`BRIEF-surface-lab §4`). This
> brief names its parameters there.
