# Orientation — start here (everyone, first)

**The universal first read.** Plain-language, no jargon — what we're building, how the pieces depend on each other, the handful of things we've already figured out (so nobody re-derives them), and where to go for your piece. This is the *bridge* doc: not the sales pitch (`cartograph/FEATURES.md`), not the deep dev canon (`SKELETON` / `RIBBONS` / `PIPELINE`) — the throughline that connects them, in language you can say out loud to anyone.

---

## What we're building, in one breath

> ### ⛔ READ THIS AS A CONSTRAINT, NOT A PREAMBLE
> Every doc below this line is written in **Lafayette Square proper nouns** — `south-18th-street-3`,
> "LS's 50 dead ends", `park-avenue-1`. That is because LS was **first**, not because it is the
> subject. **The subject is the kit.** When a doc says *"LS has 50 dead ends,"* read it as *"50 dead
> ends in the first town — the method has to find them in a town nobody has looked at."*
>
> **The test, before you propose anything: what does this do for town #2?** If the answer needs an
> operator who has already seen that street, it is not a fix. And **no fallbacks** — a failed pour
> must fail loudly, because a plausible-looking wrong map is worse than no map. Full form:
> `CLAUDE.md` **Layer 0**. *(Written down here since the beginning; promoted to a gate 2026-07-31
> after a full day was spent patching LS instances and ending in an exception table.)*

A **kit for pouring 3D neighborhoods.** You feed it real city data; it produces a **slab** — a flat, fast, fortified map the public app stands on like a foundation. Lafayette Square is the first neighborhood off the line. The whole point is that the *next* neighborhood pours from the same kit, by a different operator, with almost no hand-work. **Aesthetics and performance are co-equal and non-negotiable** — it has to be beautiful *and* run on a phone.

## The dependency chain — in plain words

*(Confirmed with Jacob 2026-07-31, in his corrections. If you read only one thing before touching the pipeline, read this — three separate passes in one day went wrong on **step 3** alone.)*

1. **Intake — stamp and label, simultaneously.** Pull OSM, parcels and right-of-way, whatever **street widths** the city has, ML footprints, aerials. The first minibake stamps and labels in **one** pass.
2. **Skeleton — the generic "to code" bake.** The messy traced lines become a clean, **hardened and named** frame: fragments welded, wiggles simplified (junction-protected — a junction-*blind* pass once deleted 79 of them), name-transitions resolved so a road stays one road across a name change. ⭐ **What comes out is to *spec*, not to reality** — regular, to-code streets.
3. **Prebake — the polygon world. ⚠️⚠️ THIS IS THE ARMED MINE.** The centerline graph is cut into **tiles** (the bounded faces between streets) and that topology is frozen. ⛔ **AUTHORING HAS NOT HAPPENED YET.** Streets only become overridable *after* this step — prebake never reads the operator's edits (verified in code: zero reads). **So anything that freezes geometry here freezes the to-code default instead of the actual town.** That is why *"freeze the curb in prebake"* was an impossible instruction, and it is `CLAUDE.md` **Layer 0 q3** in structural form.
4. **Survey — conform the drawn map to reality.** The operator opens regular, to-spec streets over the **aerial** and reshapes them until the drawing matches the ground: widths, caps, corner radius. ⭐ **A single block may change width several times across its span** — LS is historical and idiosyncratic, and **this is what the authoring tools are FOR.**
5. **The Wall — chain *links* die; welded chains become polygons.** After it there is no such thing as *"this chain link."* Forever after it is **"this surface / this edge of this tile."** Chains stop being independent entities.
6. **Section — the pedestrian FILL**, stroked *inward* from the frozen curb: treelawn, sidewalk, materials, ADA pads. It physically cannot see a chain.
7. **Bake → Stage → Preview.** The geometry is poured; the **slab** proper also carries trees, weather and lighting. We render **from Preview** into commits, staging sites and live URLs.
8. **The Ward — the public app.** The slab ships to **The Ward**, and The Ward has everything it needs to **animate** everything in the slab.

> ### ⭐⭐ WHY THERE ARE BAKES AT ALL — the principle under the whole architecture
> **It is all about managing and condensing complex data into simple data.** *(Jacob.)* Authoring has to be **fluid**: the operator must reshape a curb or corner **asymmetrically, on a single polygon**, and see it immediately. **Anything that requires the whole map to be retraced 60× a second does not work** — and that constraint governs the **pre-wall** bakes just as much as the post-wall ones. Every freeze in this chain exists to hand the next stage something simpler than what it received. ⚠️ **A freeze is therefore a PERFORMANCE move as much as a correctness one**, and "correct but re-derived every frame" is a failure of the same architecture.

---

## The same chain, as a diagram

```
real-world data → SKELETON → prebake → SURVEY → ⟦THE WALL⟧ → SECTION → BAKE → the SLAB → the public app
 (OSM, parcels,   (clean      (the       (author    (freeze!)   (author   (pour)   (what       (Lafayette
  measured         street      frozen     the                    the                 ships)      Square,
  widths,          frame)      shapes)    hardscape              sidewalks                        then town
  aerials)                                SHAPE)                 = FILL)                           #2, #3…)
```

Read it left-to-right: messy inputs get traced into a clean **frame**, frozen into **shapes**, dressed with **sidewalks**, given a **look**, and **baked** into the slab **The Ward** trusts. We're currently working the early stages (skeleton + survey); the look is largely authored. ⚠️ *The diagram compresses steps 7–8 — the full sequence is Bake → **Stage** → **Preview**, and we render from Preview; see the prose above.*

---

## What's already figured out (don't re-derive these)

> These are the things we keep having to *stop re-discovering*. Each is a plain phrase you can hold and repeat; the **→** points to the deep home if you need the engineering.

### How the map gets built

- **The skeleton is the first bake.** Before any prettifying, we trace the real streets into a clean, *simplified* frame — a city block should be ~4 corners, not 30 wiggles. Get the bones simple and everything downstream is healthy. → `SKELETON.md`
- **Chains die at the wall.** We start from messy traced street-lines ("chains"). At one point — *the Wall* — we **freeze** them into finished shapes, and after that nobody may reach back to the messy lines. When something looks broken, the first question is always *"did we sneak back across the wall?"* — and the fix is to move the freeze *earlier*, never to patch the messy lines deeper. → `cartograph/PIPELINE.md §Wall`
- **Polygons, not pen-strokes.** The map is made of **shapes** — the block-tiles between streets — not of drawn lines. We paint the sidewalk and grass *inward* from each block's edge. → `cartograph/RIBBONS.md §1`

### The golden rule for fixing things

- **Everything is a shadow of the centerline.** The order is **centerline → block shape → sidewalk ribbon.** The street's centerline is the one true source; the curb is just that line pushed outward by half the road's width; even *what counts as a corner* is read off it.
- **So fix it at the centerline, not the shadow.** If a block or a curb looks wrong, the real bug is almost always upstream in the centerline. Patching the shape while the centerline stays rough is editing a shadow — it comes right back. → `cartograph/RIBBONS.md §1`, `SKELETON.md §3.5`
- **The curb is a concentric offset.** The curb isn't drawn on its own — it's the centerline stepped outward a fixed distance, parallel to it everywhere. Fix the line, the curb follows. → `cartograph/POLYGON-FIRST.md §1`

### What's automatic vs. hand-made (this is the kit)

- **⭐⭐ Everything is a best guess, and everything is overridable — THE OVERRIDE IS THE PRODUCT.** The kit machine-pours any town's geometry, land-use, trees, weather, and content — a strong first draft — and the operator can override *any* of it. Automation's job is to make the guess better; override is first-class at every layer, **never a "defect."** *(Supersedes "shape is automatic; hand-fixes are bugs-to-zero," retired 2026-07-02.)* → `NEIGHBORHOOD-INPUTS.md §0.0`
  > ⛔⛔ **THE COROLLARY, AND IT IS LOAD-BEARING (`CLAUDE.md` Layer 0, question 3):** a real neighborhood is **historical and idiosyncratic — that is why the authoring tools exist at all.** So **any measurement taken without the scene's authored state loaded is measuring the wrong thing**, and it fails in the kit's signature shape: **worst on the most heavily authored town, cleanest on a fresh pour** — blind exactly where the map is most worked-on.
  >
  > **Before calling anything a defect, ask whether it is the authoring gesture's intended output.** Worked example, and it fooled three passes in one day: `Block = iA = tile − the authored roadway` (`SURVEY §3`), and the asphalt-edge handle *"strokes the pavement half-width outward; the block follows"* (`SURVEY §4`). **So a small block is what a wide authored street LOOKS like.** A census that measured block *area* and reported "collapsed curb rings" was measuring the operator's own edits. The only honest test is a **distance** one — *is the curb at the **authored** half-width from its centerline* — and it must run **with** authoring loaded.
- **Let the machine catch the bugs.** Instead of an operator eyeballing every street, one automatic check per kind-of-bug flags the bad ones. That checker is the real prize — it's what lets the kit work on town #2, #3, #100 without a human re-inspecting everything. → `cartograph/POLYGON-FIRST.md §5`
- **The inputs are real, not guessed.** Real city parcels and right-of-way, operator-*measured* street widths, real map geometry, ML building footprints — all fortified against high-res aerial photos. A generic 3D map extrudes a default city; ours is grounded in the actual record, block by block. → `cartograph/INTAKE.md`

### How it ships

- **The slab is the contract.** We pour a flat, dumb, fast "slab" the public app trusts blindly and can't argue with. The catch: **if it isn't baked into the slab, the public never sees it** — what the operator sees in authoring only ships if it travels through the bake. → `SLAB-CONTRACT.md`
- **⭐ The public app is called THE WARD** *(named 2026-07-31 — a shared word so it can be discussed without saying "the public app" every time; it appears in no older doc)*. **The slab ships to The Ward, and The Ward has everything it needs to ANIMATE everything in the slab.**
- **The Ward reads three payloads, not one.** It is a generic **player**; Lafayette Square is just installation #1 (`?look=lafayette-square`). It reads (1) the **slab** — the *render* (geometry, ground, buildings' render-side, trees), poured by the kit; (2) the **content** — names, history, listings — a separate per-installation layer read *alongside* the slab, not baked in; and (3) the **installation config** (`src/instances/<look>.js`) — identity, geography, branding, and a **module manifest** that switches whole features on or off. **The kit *pours* slabs; the player *plays* them — the consumer app is not itself a kit** (the kit is the authoring side: cartograph/arborist/meteorologist). → `SLAB-CONTRACT.md §0/§C2`, `NEIGHBORHOOD-INPUTS §5.1`, `ls/ARCHITECTURE.md §2`
- **Features are switched by the manifest, not guessed from presence.** Each installation turns on only the features it runs (`INSTANCE.modules.*` — bulletin, delivery/Cary, events, …). "Show it if the data's there" is leaky — a feature with empty data still tries to mount (the ungated-Cary bug) — so the switch is an **explicit declarative flag**, not an inference. LS = everything on. → `ls/ARCHITECTURE.md §6`
- **⭐ What a neighborhood IS — the definition everything else serves.** Jacob, 2026-07-21: *"A neighborhood is a collection of buildings/structures which are connected by people-run accounts. The idea is that a neighborhood can be described by its **hard surfaces** but it is **enlivened by their soft contents**."* The unit is the **structure**, not the area. Geometry is a **proxy** for the account relation, and proxies fail at the margin — which is why per-building correction is first-class rather than a gap to design away. **Corollary: losing soft contents outranks losing geometry.** ⭐ **But the boundary isn't everything and also is — it's a "self-tensing circle"** (Jacob): you must determine the polygon to determine who is included, and you don't know where the hood *is* until you have them. Don't collapse that into a hierarchy in either direction. And **the circle is the fundamental graphical piece — the ground plane of the map**: we present in a virtual environment where the **horizon is "whatever is outside the neighborhood,"** so the hood reads as a planet of its own. That links the disc's centroid to the hood's mass — an off-center disc doesn't just offend the eye, it breaks the world. → `cartograph/ARCHITECTURE.md §Extent`
- **A census is the union of its wells.** Lamps and trees come from several sources at once (a city fetch, an OSM fetch, a hand-placed set). We **combine them all** and remove duplicates — we never let one source win and hide the others. Density is part of the product: a missing source doesn't error, it just makes the place look thinner and deader. *(This bit us: the day Lafayette Square gained an automatic lamp fetch, its 80 hand-placed **park** lamps quietly stopped shipping, and nobody noticed because the total went up.)* → `cartograph/BAKE.md §4.5`
- **⛔⛔ NO FALLBACKS — a fallback turns a failure into a plausible-looking success, which is the worst outcome a kit can have.** If town #2 fails to load and the operator is shown Lafayette Square, they do not see a bug; they see a map, and they trust it. Jacob, 2026-07-31: *"There should be no fallback; it would help exactly 0 to have a failed neighborhood loading to fall back to Lafayette Square."* **Measured, live, unfixed:** `measureModel.js` seeds street widths in EVERY scene from LS's `ribbons.json` keyed by street NAME → **24 Altadena streets silently inherit St. Louis measurements** (Allen Ave, Iowa Ave, and every auto-named `motorway_link N`). Both Polish pours collide on **0**, so it is invisible in exactly the scenes you'd use to prove the kit travels. Silent substitution is the defect — the same shape as a stale artifact that still renders, a scene that quietly isn't the one you built, and a skip list that makes unhandled cases look handled.
- **⛔ Lafayette Square is not just a scene — it's the mold the kit was cast around, and that's still dangerous.** Every other neighborhood's data lives in its own folder; LS's lives at the *shared default* paths that the kit falls back to when a poured scene's input is missing. So **LS is the fallback**, and **pouring a second neighborhood can overwrite production LS** — it happened on 2026-07-23. Until those defaults are retired, treat any non-LS pour as destructive to LS and check what changed right after. → `cartograph/ARCHITECTURE.md §Extent` (the palimpsest warning), `EXTENT-DESIGN.md §2.1`
- **One compass frame, no trick rotations.** Every coordinate sits at its true GPS position; there are no secret rotation constants hiding in the math. → `cartograph/ARCHITECTURE.md`
- **Everything sits on the ground we actually draw.** On a rolling site, objects look fake the instant they float. So every object — tree, lamp, path — is anchored to the **one rendered ground surface** (a height baked per object), not each guessing its own elevation off a smoother field the coarse ground only approximates. The buildings always worked this way (their foundations); it now covers everything that stands on the ground. → `cartograph/ARCHITECTURE.md §8 "Ground conformance"`

### A few more, settled (won't reopen)
Divided roads stay two centerlines with the median between them · grade-separated roads (bridges/ramps) are pulled out of the block grid and drawn flat · street smoothing rides **one knob** (`STREET_SMOOTH`), never two copies kept in sync by hand · the practice scene ("toy") routes through the *same* pipeline, never a private one · a neighborhood is **an inclusion polygon made of real streets** — you say what it IS (the gazetteer's boundary, or click the bounding streets and watch the ring close), and exclusion loops + per-building toggles are *corrections* to that. The circle is what we **render**, not what decides. Membership = `(polygon ∪ activate) − (exclusions ∪ hide)` (`INTAKE §0.5`, `NEIGHBORHOOD-INPUTS §5.2`). *(Retracted 2026-07-20: this line used to read "a circle with bites taken out — the disc IS the boundary"; that made subtraction the only gesture and cost 147 Księży Młyn buildings, silently.)* **Street names come FROM the fetch**, so the boundary is authored only *after* the data lands — the search sizes a generous envelope, it does not know the hood. **The gazetteer is a hint, never a requirement:** an *invented* neighborhood (Hi-Pointe–DeMun is two areas someone joined) gets no usable ring, and that is the normal case for any hood a person named — so picking streets must work from zero. Consequently there are **two centerpoints**: the fetch center, frozen as the frame origin, and the hood center derived from the kept buildings, which is what the disc should be drawn on. A correctly-isolated hood sits **off-center** in its envelope; that is expected, not a defect. ⭐ **And the frame origin may grow or shrink, but must NEVER move** — grow/shrink from a fixed center leaves every retained coordinate and building id resolving; *moving* it reprojects everything at once and re-orders identity, which is how a hood's content once went from 84 anchors to 5. **Design of record: [`EXTENT-DESIGN.md`](EXTENT-DESIGN.md)** (what the Extent tool actually makes is the **served skeleton** — a labeled point cloud — not the disc; hood<disc<bb; the seal is the identity registry); as-built: `cartograph/ARCHITECTURE §Extent`. *(Where each lives: the `README` cross-cutting feature index.)*

---

## Find your piece

The project is **four parts** plus the public runtime. Each is documented next to its code in three flavors — **FEATURES** (the pitch: what & why), **OPERATIONS** (the operator's manual: the knobs), and the **dev** docs (how it's built).

| If you're working on… | Go to |
|---|---|
| **The map kit** — streets, blocks, curbs, the bake | `cartograph/` — start `README §⭐ START HERE` (settled-state by stage) + the `README` cross-cutting feature index (where-X-lives) |
| **The public app** — place cards, residences, the courier | `ls/` — `FEATURES` / `ARCHITECTURE` / `STATUS` |
| **The trees** — the kit-matcher tree builder | `arborist/` — start **`arborist/README.md §⭐ START HERE`** (the goal + current state) → **`SALON-INTERFACE.md`** (root — the Salon **plate-rack**, the realized rubric-forward front, 2026-06-25) → `scratch/FOREST-BUILDER-KIT-MATCHER.md` (the ratified architecture); **no-cull** — all trees draw; Authored-only, LiDAR/Procedural kept as peers |
| **The weather** — clouds + sky rules | `meteorologist/` — `README` / `WEATHER-MODEL` |

**The three navigational indexes** (when you need to *find* something, not be *oriented*) — all in `README.md` + `PIPELINE.md`, never `BOZ.md` (that's the coordinator's doc, summoned only when you're Boz):
- `README.md §⭐ START HERE` — the settled conclusion **per pipeline stage**, with status.
- `README.md` Documentation map — **where does X live**: the artifact homes + the cross-cutting feature index.
- `cartograph/PIPELINE.md` — the **execution spine**: how raw data becomes the slab, step by step.

**And when you need to know *what's left*** (not where it lives): **[`ROADMAP.md`](ROADMAP.md)** — the one cross-domain master of all remaining work, ranked and pruned to zero. We're in the home stretch; ROADMAP is the surface we prune the whole board against. Two columns to done (the SHAPE finish + the tree impostor/placement scheme = "works on a phone") + the security close-out, then the cleanup tail toward human-developer engagement, then the approaching horizon.

**And when you want the *outside-in* read** — does the shipped code deliver what the docs promise? — **[`ACCORDANCE-REVIEW.md`](ACCORDANCE-REVIEW.md)**: an investor-lens diligence report + a two-way punchlist (**build the thing we claim** ↔ **correct the claim to match the thing**). The lens; `ROADMAP`/`AUDIT-MATRIX` are the boards.

**And when you're onboarding a NEW town** — how do we actually pour *and* hydrate an installation? — **[`ONBOARDING.md`](ONBOARDING.md)**: the followable intake→hydration playbook (slab → instance → content/cards/menus → activation → isolation) + the card-depth standard, so nobody re-derives it from the code.

> *New doc, 2026-06-14 — the executive-orientation surface the doc-system arc called for. Reference-kind; keep it plain and lean. The doctrine here is the colloquial face of the dev canon — when the canon changes, change the one-liner, keep the pointer.*
