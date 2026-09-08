# The Progression — from nodes and chains to the drawn surface

**The one narrative for how a street network becomes a drawn map.** Read this before any stage doc.
Everything below it (`SKELETON` · `PREBAKE` · `SURVEY` · `SECTION` · `RIBBONS` · `POLYGON-FIRST`) is
**detail only** — the mechanism, the schema, the open defect. *What each stage is for* is said once,
here, and nowhere else.

> **Status: v1.0 (2026-09-06) — the narrative scrub.** Rewritten in plain language on Jacob's
> instruction: *"the technical issues frequently expose themselves when you just drop the jargon and
> say logically what we're trying to do."* This edition **absorbs `WALL.md` whole** (retired to
> `_archive/WALL-2026-09-06.md`) and **absorbs the "what this stage is" opening** of the six stage docs.
> The `§P1`–`§P10` addresses other docs cite are preserved, at the bottom.
>
> ⛔ **The survey that produced this rewrite — every place the docs and the code were found to disagree,
> classified — is `DOC-CODE-COHERENCE.md` §“The 2026-09-06 progression survey”.** This doc says what is
> supposed to happen. That one says where we are off.

---

## How to read this doc

**1. Plain language is the point, not a courtesy.** If a sentence here can only be understood by
someone who already knows the jargon, the sentence is wrong and should be rewritten, not annotated.
Nine tenths of this project's expensive confusions have been a piece of vocabulary standing in for a
thought nobody had finished.

**2. Every stage carries a *how you would tell if this were wrong* line, naming a real instrument.**
⭐⭐ **This is the correction to the corpus's biggest structural fault, and it was diagnosed from the
outside on 2026-09-06:** *the docs are strong on rulings and weak on how to measure.* An agent
arrives, finds a ruling with no instrument attached, invents an instrument, and **the instrument is
where the errors live.** One agent, one day, produced seven findings that were all measurement errors
wearing a defect's clothes — a copied-sign `signedArea`, gross `|area|` over an annulus, area-over-
perimeter on an annulus outer ring, outer-minus-holes on a pooled band, an SVG renderer painting
compound-path holes solid, centroid block-assignment, nearest-segment instead of perpendicular. **Every
one produced a plausible number.** ⛔ So: a ruling without an instrument is half a ruling. There are
**664 `.mjs` probes in `scratch/`** (`ls scratch/*.mjs | wc -l`) — the answer is almost never to write
the 665th.

**3. ⛔ Do not follow a `file.js:NNN` citation without checking it.** Measured 2026-09-06, *before* this
scrub, across the eight docs that then described this progression: **99 code citations — 13 verifiably
correct, 51 provably stale, 35 naming no symbol at all and therefore uncheckable.**
▶ `node scratch/claims-doc-code-citations.mjs` (add `--window=N`; `SHOW_OK=1` to see the passes)
⛔ **Re-run it rather than quoting that figure** — it moved the moment `WALL.md` was folded in, and it
will move again. **The number is not the point; the class is.**
⭐ The check can only prove staleness, never freshness — a pass means "a symbol named on the doc line
appears near the cited line," which is evidence, not proof. **This doc therefore cites SYMBOLS, not
line numbers.** `grep -n` is one keystroke and never rots. Any line number reintroduced here is a
regression.

---

## The whole thing in six sentences, with no jargon at all

1. We start with a **real city's street lines**, traced from public map data — thousands of little
   points strung into wiggly lines.
2. We **clean those lines up** until they are as simple as the streets really are — a city block
   should be four corners, not thirty wiggles.
3. From the cleaned lines we work out **where the blocks are**: the enclosed pieces of land between
   the streets.
4. An operator, looking at an **aerial photograph**, says how wide each street really is — and we
   push each block's edge inward by that amount to get **the curb**.
5. Working inward from the curb, we lay down the **pavement**: tree-lawn, sidewalk, ramps.
6. Then we **freeze the result** and hand it to the app, which trusts it completely and never
   recomputes any of it.

**Everything else in this document is one of those six sentences said more carefully.** If you find
yourself unable to say which of the six you are working on, that is the actual problem, and no amount
of reading further down will fix it.

---

## The three laws

These apply at every stage. They are the whole of the doctrine; the rest is mechanism.

### ⭐ Law 1 — Everything is a shadow of the centerline. Fix the line, not the shadow.

The order is **centerline → block shape → curb → pavement ribbon.** The street's centerline is the one
true source. The curb is only that line pushed outward. Even *what counts as a corner* is read off it.

⛔ **So if a block or a curb looks wrong, the bug is almost always upstream in the line.** Patching the
shape while the line stays rough is editing a shadow: it comes back. The recurring, expensive mistake
in this repo is diagnosing at the stage where the symptom is *visible* rather than where it is *caused*.

### ⭐⭐ Law 2 — Freezing wrong data is worse than not freezing at all.

*(Jacob, 2026-06-05. Carried verbatim from the retired `WALL.md §1`, because it is a live rule and not
a piece of history.)*

Each stage in this progression ends by **freezing** its output, and everything downstream then trusts
that output **unconditionally** — no re-derivation, no second-guessing, no reaching back. That trust is
the entire value of a freeze.

∴ freezing a *defect* does not merely carry it forward. It **launders garbage into authority**: the
next stage, the bake, and the public app all treat the false corner as ground truth and build on it,
and the defect is now trusted — harder to see, harder to dislodge. **Frozen-wrong-data is odious to the
process.** It can never be a definition of done.

**So every freeze has two halves, and both must hold:**
1. **The freeze is real** — a genuine artifact boundary, not a function call buried inside one build.
2. **What is frozen is correct** — confirmed on the operator's eye *before* it is trusted.

### ⭐⭐⭐ Law 3 — If a construction needs elaborate scaffolding, suspect the input.

*(Ruled 2026-09-06. The long form, with the numbers, is `SKELETON.md §0.1`.)*

A whole day went into guards — corner-cluster collapsing, fillet-setback budgets, self-intersection
handling, severance detection — each one propping up the last, against a shape built from the
**un-simplified** lines: 8.5× the points, and **705 vertices on a block that should have about 8**.
Feeding it the simplified skeleton instead moved every failure count at once, **with no new code**:
corners declining as "too tight" went **338 → 39**.

⛔ **A map whose blocks are mostly quadrilaterals should not need scaffolding.** When you find yourself
writing the fourth guard, stop and go look at what you are feeding the thing.

---

## The nine steps

Each step says: **what it is for** · **in** · **out** · **the rule** · **how you would tell it was
wrong** · where the detail lives.

---

### 0 · Extent — say what the neighborhood *is*, and fix the frame

**What it is for.** Before this step there is no town. Someone has to decide which streets and
buildings are in and which are out — and that decision cannot be looked up, because most
neighborhoods people name are not in any gazetteer (Hi-Pointe–DeMun is two areas somebody joined).

**In:** a place name and a map view. **Out:** a labeled point cloud — the *served skeleton* — plus the
**frame origin**, the coordinate zero every later stage is keyed to.

**The rule.** ⛔ **The frame origin may grow or shrink, but it must NEVER move.** Growing from a fixed
center leaves every stored coordinate and building id still resolving. *Moving* it reprojects
everything at once and re-orders identity — that is how a neighborhood's content once went from 84
anchors to 5.

Membership is **`((polygon − exclusions) ∪ activate) − hide`**, and the formula is **ordered**: the
finest gesture wins. A per-building `activate` beats an exclusion loop; `hide` beats everything. The
**circle is what we draw; the polygon is what decides.**

**How you would tell it was wrong:** the hood sits centered in its envelope. A correctly-isolated hood
sits **off-center** — there are two centerpoints (the fetch center, frozen; the hood center, derived
from the kept buildings), and them coinciding means the isolation did nothing.

→ `EXTENT-DESIGN.md` (design of record) · `INTAKE.md §0.5` (as-built)

---

### 1 · Intake — stamp and label, in one pass

**What it is for.** Pull the real record: map geometry, parcels, right-of-way, whatever street widths
the city publishes, machine-learned building footprints, aerial imagery.

**In:** the frame. **Out:** raw, labeled features.

**The rule.** **The inputs are real, not guessed.** A generic 3D map extrudes a default city; this one
is grounded in the actual record, block by block. And **a census is the union of its wells** — when
several sources supply the same kind of thing, we combine them and de-duplicate. ⛔ We never let one
source win and hide the others: the day this neighborhood gained an automatic lamp fetch, its 80
hand-placed park lamps quietly stopped shipping, and **nobody noticed, because the total went up.**

**How you would tell it was wrong:** a count that moved in the right direction. Check the *sources*
present, not the total.

→ `INTAKE.md`

---

### 2 · Skeleton — make the lines as simple as the streets really are

**What it is for.** The traced lines are a mess: OSM noise read as real bends, one road broken into
fragments, a road that changes name treated as two roads. This step welds, simplifies and names them
into a clean frame. **What comes out is to *spec*, not to reality** — regular, to-code streets. Making
them match the actual ground is the operator's job, two steps later.

**In:** raw traced geometry. **Out:** `skeleton.json` — canonical chains with stable ids, a typed
junction list, name-transitions, divided-carriageway pairs, grade-separation flags.

**The rule — and this is a ruling, 2026-09-06:** ⭐⭐⭐ **THE SKELETON IS THE SSoT. IT SIMPLIFIES;
NOTHING DOWNSTREAM COPES.** Every consumer takes the **simplified** geometry — not the densified
trace, not a locally-corrected copy of it.

⛔ **Why that is a ruling and not a preference:** prebake was freezing **three different geometries out
of one pass**, so the blocks and the block-shaped holes were **two independent partitions of the same
map**. Every probe comparing them was measuring that divergence rather than a defect in either. **Both
render. Neither can be seen to be wrong.** That is the worst failure mode this project has.

⛔ **And simplification is junction-protected, always.** A junction-*blind* simplify once deleted **79
of 79** interior T-junctions that sat in the raw data at exactly 0.00 m. Nearly every downstream scar
— the 3 m fuzzy re-projection snap, the blunt-and-pray cap — traces to that loss.

⭐ **And the skeleton is a black box to the operator.** They do not edit the line graph — they
*fortify* on top of it, two steps later, with widths and caps and corner radius. Survey once existed as
*controls for the skeleton*, and those controls were too complex and not very helpful. **∴ if the
skeleton is right, Survey shrinks to thin fortification** — which is the real reason simplification
here is worth more than cleverness anywhere downstream. *(Carried from the excised `SKELETON.md §0`.)*

**How you would tell it was wrong:**
▶ `node scratch/claims-faces-on-the-ssot.mjs <scene>` — do the blocks change when you swap the input?
▶ `node scratch/claims-repour-changes-nothing.mjs <scene>` — a re-pour must move nothing.
And the blunt one: **a city block should have about 8 vertices.** If it has 700, stop (Law 3).

→ `SKELETON.md` (§0.1 is the ruling; §2 the schema; §3 the build stages; §5 the open gap)

---

### 3 · Prebake — work out where the blocks are, and freeze it

**What it is for.** Turn the line network into a **shape world**: the enclosed pieces of land between
the streets. This is the compile that produces the one geometry document everything downstream reads.

**In:** the simplified skeleton + the operator's measurements (`clean/overlay.json`) + the boundary.
**Out:** `ribbons.json` — `{ streets, intersections, faces, tiles, protopolygon, … }`.

**⚠️ THIS IS THE ARMED MINE OF THE WHOLE PROGRESSION, and the mine is narrower than the folklore.**
Prebake reads **one** of the two authoring channels, not zero. It **does** read the street-keyed
measures, caps and anchors the operator writes. It does **not** read `design.json` / `blockCustoms` —
the per-edge SHAPE overrides. ⇒ **Anything frozen here that depends on per-edge shape intent freezes
the to-code default instead of the actual town; anything that depends only on street-level measurement
does not.** ⛔ The overgeneralisation *"prebake is authoring-blind"* is false and has mis-scoped at
least one design question.

**The boundary clip lives here**, and it is a kit step, not a local fix: features wholly outside the
hood are dropped, buildings are resolved by the membership formula, and streets are **clipped, not
kept whole** — an arterial running 3882 m across a 2502 m hood, kept whole, drags the content bounds
sideways.

**The rule.** ⭐⭐ **The neighborhood is ONE CLOSED SHAPE — a compound path.** Think of it the way
Illustrator does: the boundary is the outer contour, and the streets and land-use fills run out and
close *against* it. Nothing is left open; nothing is "outside the data." The soft edge you see is a
**fade applied last, as a look.** ⛔ **So the rim is an edge of the drawing, never an absence** — code
that reads *"no street on this edge"* as *"nothing here"* leaves a hole exactly where the shape should
close.

**How you would tell it was wrong:** re-pour and diff (`claims-repour-changes-nothing.mjs`). A pour
that moves geometry is either reading a different input than the last one did, or reading authoring it
should not be reading.

→ `PREBAKE.md` · `POLYGON-FIRST.md`

---

### 3a · What a block actually *is* — the one open question in the middle of this progression

This is the single place where **what is supposed to happen** and **what happens** differ in kind
rather than in quality, so it gets its own step. ⛔ Do not resolve the tension by picking the sentence
you prefer.

**What the code ships today.** A block is a **face of the line graph**: walk the planar graph of the
centerlines' shared vertices, and every enclosed face is a block. The centerlines are the *grout* and
the blocks are the *tiles* between them.

**Why that is known to be insufficient, and it is not a matter of taste.** A graph face **cannot close
around a dead end.** The walk goes out along the spur and back over the same vertices, so the "shape"
it returns is a traversal, not a shape: **all 50 dead-end tips in the first town are zero-width
slits.** Most of them merely *look* right, because a later cosmetic step displaces the drawn edge off
the ring by up to 13 m.

⭐ **And the tell was hiding in a name.** `detectTileCaps` is *a slit detector wearing a cap detector's
name*: its criterion — same street, both adjacent edges, opposite sides, at a street's end — is
precisely *"the ring doubled back here."* That list is **a registry of the places the freeze failed to
close a shape**, and it was used for months as a source of identity.

**What was ruled instead (2026-08-12), built, and now switched ON.** The substrate is a
**punch-out**: take every street centerline, stroke each to a hairline width, unite them all into one
closed compound path — **the holes in that shape are the blocks.**

> ✅ **`blocks = boundary − stroked roads` IS BUILT** — `mintProtopolygon` takes a `boundary`, and the
> subtraction subject is **a plain rectangle around all the ink**, never the disc. ⭐⭐ **The circle is
> stamped LAST, on finished geometry, per object.** ⛔ **A disc — or a disc plus a margin — is still the
> circle deciding block geometry;** that was tried at both radii and is the same order error one step
> out. ⭐ **Why it removes a class rather than guarding one: a square cut has no endpoint**, so there is
> nothing for a cap, bulb or fillet to be built on.
> *(Filed here 2026-09-06 as an **aspiration** — "the code unions the roads only, takes no boundary" —
> and it landed the same day. ⭐ Note which way it resolved: the aspiration was right and the code moved
> to it. That is the case for not "correcting" a ruling to match the code.)*
> ⚠️ **Two superseded comments still sit above the corrected ones in `mintProtopolygon`** — *"the
> boundary is the CLIP, never a subject"* directly above *"① is NOT cut here… it was, briefly, and that
> was the same order error."* **A correction next to the sentence it corrects is the anti-pattern**;
> the false half is reached first because it is higher up. Not yet excised.

The compound shape is `①`, the *protopolygon*. It is never seen, never authored, never rounded. Every one of its
edges carries which street and which side made it, and every crossing carries which two streets met
there — so **a corner is a crossing you read, not an angle you compute.** A dead end closes into a real
notch instead of a slit. **A median is a block** (a block with no sidewalk).

**Where it stands:** ① is minted and frozen into `ribbons.json` as `protopolygon` — `rings`, `labels`,
`owners`, `crossings` — and ⭐⭐ **it is a PURE FUNCTION OF THE SKELETON, measured, not assumed.**
`mintProtopolygon` reads **no authored value, no width, no measure, and nothing prebake produces**;
`derive.js` opens `clean/skeleton.json` directly for the simplified points and **refuses to freeze ① at
all** if the skeleton is absent or any chain is unjoinable, rather than falling back to the dense
chains. ⇒ **① depends on nothing that prebake adds.**

### ⭐⭐⭐ AND IT IS THE PRODUCER, FOR SURVEY *AND* SECTION — LANDED 2026-09-06
**Every layer either tool draws comes from ①②③.** Two flags, and the split between them is the whole
point: **`protoProducer` swaps what SURVEY DRAWS · `protoArtifact` swaps what SECTION OPENS.** Both are
ON in the Designer (`BlockGeometryV2Debug.jsx`, grep `protoProducer`), and the bake takes `--proto`
(argv, deliberately — this codebase gates on argv, not `process.env`).

⭐ **It is a change of CONSUMER, not of construction.** ②③ already offset the grout contour; the
artifact freezes what they made, and `sectionOpen` already consumed a tile carrying its own bands. **No
geometry was written to land it.**
▶ `node scratch/claims-survey-and-section-agree.mjs` — asphalt, curb, sidewalk and block agree to
**0 m²** between the two tools, LU class sets identical. **That gate is the definition of "the same
thing," and it is what "Survey and Section are one construction" means operationally.**

⛔ **Both flags REFUSE rather than fall back** — asking for ① and silently getting the chain artifact is
the plausible-looking success Law 2 forbids.

> ⚠️ **The `--proto` CLI bake is NOT how Section gets its artifact** — §5, *"who writes the frozen file."*

*(Excised 2026-09-06: this paragraph and the artifact-contract block said ① reached nothing on screen,
written hours before the swap landed the same day →* `_archive/PIPELINE-3a-artifact-contract-2026-09-06.md`*.)*

> ⛔⛔ **`?grout=1` IS NOT ①, AND CONFUSING THE TWO WILL COST YOU A DAY.** The grout overlay strokes each
> chain at the **authored half-width** and unites them — offset-then-polygonize, the old order. It builds
> **the curb**, not the protopolygon; `RIBBONS §1` says so in as many words. Two different constructions
> that happen to share a block of code and a nearly-identical flag name (`grout: true` from the URL vs
> `grout: 'proto'` from the bake).
> ⚠️ **And the overlay shows nothing at idle anyway** — it is gated on the live build, which does not run
> while the frozen path renders. **An overlay gated on a live build is invisible in the state the
> operator actually sits in.**

> ### ⭐⭐ THE TILE CONTRACT — a UNION WITH OPTIONAL MEMBERS, and the produce/refuse split is RULED
> **A frozen block and a proto block are not the same object**, and the difference is a decision, not a
> shortfall. On LS the artifact carries **20 keys, but only 14 on every block; 6 are optional.** ⇒ **A
> consumer may not assume a field is there, and a producer emitting all of them would be
> over-promising.** Planning against *"the tile has N fields"* is planning against something that does
> not exist.
>
> ⭐⭐ **RULED 2026-09-06 — ①'s tile SUPPLIES 2 and REFUSES 9, and the rule that decides them is: does
> this field tell someone HOW TO BUILD, or WHAT A THING IS?** `runs` and `lu` are **identity and fact** —
> which block was clicked, which authored slot a frontage owns, what the land use is — and they are
> supplied. `tl` `sw` `cap` `bandJoin` are **inputs to a walk**; `vertR` `fillets` are the fillet
> machinery the node's handles replace; `roundTips` `bluntTips` `roundTipKeys` are cap machinery a
> contour already IS. **A walk needs boundaries; an offset needs only a value per point.**
> ⛔ **REFUSE MEANS THE CONSUMER STOPS READING IT, WHICH IS THE REAL WORK** — and every refusal is
> recorded **with a reason**, never left as a silent absence. Full ruling + the table: `RIBBONS §1`.
>
> ⛔ **Derive the contract, don't quote it — both sides, and don't sample one block:**
> ▶ `node -e "const f=require('./public/baked/<scene>/shape.json'); const t=f.tiles||f; const u=new Set(); for(const x of t) Object.keys(x).forEach(n=>u.add(n)); const opt=[...u].filter(k=>!t.every(x=>k in x)); console.log('union',u.size,'| optional',opt.length,'->',opt.sort().join(', '))"`
> ▶ and ⛔ **name which proto object you mean** — there are two, with different shapes.
> `tilesFromProto` returns `{ring, edges}` and is called by **nothing** in `src/`; what `--proto`
> actually freezes is `protoShapeTiles`. Saying "the proto tile" without saying which is how a real
> gap gets stated as an unreproducible number.

⭐ **Two things this path already gets exactly right, and they are the model — copy them, don't soften
them.** Both are Law 2 enforced at a boundary, and both exist because Layer 0 says a plausible-looking
success is the worst outcome a kit can have:
- **The bake throws and refuses** if ① is asked to be the producer and yields no blocks, rather than
  quietly freezing the chain artifact under a flag that says otherwise.
- **A block that cannot be named is refused and counted, never silently dropped.** An unnamed ring
  downstream takes depth 0 and lays its curb on the centerline — a plausible-looking wrong map.

> ### ⛔⛔ THE AXIS IS **CHAINS vs ①**, NOT "FROZEN vs LIVE" — and getting this wrong turns a defect into an excuse
> *(Jacob's correction, 2026-09-06.)* ① is frozen into `ribbons.json`, which the **live** build already
> loads. So a live build can build **from ①**, and the frozen/live distinction is beside the point. The
> requirement is **"the shape comes from ① everywhere"** — not "the frozen artifact wins." Stating it as
> the latter lets a real gap be reported as a constraint.

**What is open, disclosed per pour — and ⛔ this list is DISCLOSED BY THE CONSTRUCTION, not maintained
here.** The pour warns by name for each; re-read it from a run, never from this paragraph:
- ✅ **CLOSED — ③ NO LONGER SHIPS THE FILL FROZEN.** The tile freezes the SILHOUETTE and the
  **STAMP** (`iaStamp` per contour point, `iaFull` the uncut contour it indexes) and Section strikes
  ③'s own ladder live off them — ⭐ Survey and Section now agree because they run the **same
  painter**, not because both read one frozen strike. ▶ `node scratch/claims-proto-fill-is-live.mjs`
  reports the frozen-vs-live band/asphalt delta and the authoring-reaches-the-fill check per scene.
  ⭐⭐ **AND THE OPERATOR'S "JOIN LINE" WAS THREE FABRICATED JOINS, ALL FOUND BY EYE:** the ped
  resolved per **chain** instead of per road · the ring's own **array seam at index 0** read as a
  corner · and ② **minting a corner at every chain cut** — *"① has no nodes"*. → `SECTION §4` and
  `RIBBONS §1`'s 2026-09-07 amendment.
  ⛔ Open: **cap folds** (`§6.3`, the bulb has no halves — unbuilt) and a small divider residual,
  cause not established. ⚠️ A `shape.json` poured before the flip still carries `bands`; that path
  draws and **warns**, and the cure is a re-pour.
  ▶ `node scratch/claims-proto-fill-is-live.mjs` · `node scratch/claims-a-corner-is-where-one-turns.mjs`
  *(⛔ this cited `claims-proto-has-no-nodes.mjs`, which does not exist in the tree — a pointer that
  does not resolve reads as evidence already gathered. `MEMORY §C` quotes a result from it too.)*
- ⛔ **There is no `median` land-use class** — ③ carries no median or loop concept, and the pour warns by
  name rather than letting the class vanish silently. **A known gap, not a fallback.**
- ⛔ **47 in-disc blocks bounded by a single street** get ordinary-block treatment.
- ✅ **CLOSED 2026-09-06 — "grade-separated regions inside the disc draw no panel."** Ruled (Jacob):
  ***"we need to build these blocks the same way we make the others."*** A region bounded by
  motorways and ramps **is a block** — real land, with a curb, a sidewalk and a land use — and it was
  being dropped whole, so ③ had nothing to stroke and the operator saw a hole with no sidewalk.
  ⭐ **The tag was conflating two things:** the HIGHWAY'S OWN ROADWAY still gets no city curb (a flat
  stroke through its own accumulator), but the **block between** highways is not the highway's curb.
  ▶ 43 in-disc regions / 0.293 km² recovered · tiles 117 → 151 · no-curb absence 67 blocks /
  348,273 m² → 22 / 5,787 m². ⚠️ **Cost, disclosed: in-disc curb spikes 8 → 16** — the thin-run class
  between close ramps comes with them, and *"if the curbs touch, there's no block"* still applies.
- ⛔ **The legs do not run straight through an intersection** — the operator's standing SHAPE ask. Built
  twice and reverted twice; **the defect is the REJOIN, not the intersection test** (an unbounded line
  intersection puts the apex arbitrarily far away on near-parallel legs — the same degeneracy the miter
  clamp catches). A correct attempt must **bound the apex**. → `RIBBONS §1`.

*(This paragraph listed two other things as "still untrue" — the drawn centreline diverging from ①, and
the authored corner radius being unbuilt. **Both were closed the same evening**, and the first by being
reinterpreted rather than fixed: the 20.80 m was never two lines diverging, it was **the discarded
curve** — a skeleton street's `points` is the control polygon and the curves live in `segments`.
Converging them without finding that would have **deleted the curve from both sides**. Retired to
`_archive/PIPELINE-3a-artifact-contract-2026-09-06.md`.)*

**How you would tell it was wrong:**
▶ `node scratch/claims-proto-curb-is-parallel.mjs` — is the curb the authored width from ① everywhere?
▶ `node scratch/draw-one-block.mjs --street NAME` — **draw one block and look at it.**
⭐⭐ **The unit is the block.** Every whole-map total used during this arc hid a localised defect: a
mean over 101 blocks cannot tell you that one of them is inside out.

> ### ⭐ THE ①②③ NOTATION, DEFINED ONCE — it is used across the corpus and defined nowhere
> These three are **one move repeated**, which is the whole point of the model:
> - **① the protopolygon** — every centerline stroked to a hairline and united into one closed compound
>   path. **Its holes are the blocks.** Never seen, never authored, never rounded; frozen at prebake.
> - **② the curb** — take a block (a hole in ①) and push its boundary **inward** by the authored
>   half-width of the street on each edge. One operation, no cases.
> - **③ the pavement** — the same move again: each band is ② pushed further in. ⇒ sidewalk and
>   tree-lawn are offsets of **one contour**, which is why **a seam between them is not constructible**
>   (step 6).

→ `RIBBONS.md §1` (the substrate ruling) · `POLYGON-FIRST.md §2.1` (the enforceable content rule)

---

### 4 · Survey — make the drawing match the ground

**What it is for.** Step 2 produced streets that are correct to *code*. Real neighborhoods are not to
code. The operator opens the drawing over the **aerial photograph** and reshapes it until it matches
what is actually there: how wide each street really is, what happens at each dead end, how tight each
corner turns.

**In:** the prebaked frame. **Out:** operator intent (`clean/overlay.json` for street-level measures;
`looks/<id>/design.json` for per-edge overrides), and the frozen shape at the end of it.

**The rule — and it is the one this project keeps breaking:**

> ### ⭐⭐⭐ THE OVERRIDE IS THE PRODUCT. A DIFFERENCE BETWEEN BLOCKS IS NEVER, BY ITSELF, EVIDENCE OF A BUG.
> A single street may change width **several times across its span**. This neighborhood is historical
> and idiosyncratic, and **that is what the authoring tools are FOR.** ⛔ So *"adjacent blocks have
> different widths"* · *"half the override slots don't resolve"* · *"the change stops partway along the
> street"* are **descriptions of a working product.**
>
> ⛔⛔ **∴ ANY measurement taken without the scene's authored state loaded is measuring the wrong
> thing** — and it is wrong in this kit's signature shape: it fails **worst on the most heavily
> authored town** and looks **cleanest on a fresh pour**. Blind exactly where the map is most
> worked-on.
>
> ⭐ **And symmetry is not evidence of a mechanical write.** A street's width changes at a cross-street,
> **on both sides at once, because that is where blocks end.** Before calling a write partial, ask what
> the map looks like if it is *correct* — and if the answer is "exactly this," there is no finding.

**Survey is SHAPE only.** Pavement depths — tree-lawn, sidewalk, ramps — are the next step. A
pedestrian control appearing in this tool is tool-conflation, to be removed.

**How you would tell it was wrong:** the honest test is a **distance** one — *is the curb at the
**authored** half-width from its own centerline* — and it must run **with authoring loaded.**
⛔⛔ **Our flagship instrument does not.** `litmus-curb-parallel.mjs` passes `blockCustoms: null` — it
runs with authoring switched off — and scored one avenue's authored 8.70 m half-width as a "3.13 m
bow." It also **silently skips a block with no curb ring at all**, printing *"this block has no curb"*
as a modest bow. **A fallback inside the detector, which is the one place it must never be.** Until
that is fixed, its aggregate is not evidence of anything. *(Re-verified in the code 2026-09-06: both
still present.)*

→ `SURVEY.md` · `SKELETON.md §4` (the authoring catalogue)

---

### 5 · The Wall — the freeze, and the moment streets stop being lines

**What it is for.** Everything up to here thinks in **lines**. Everything after here thinks in
**shapes**. The Wall is the moment we stop being able to reach back.

After it there is no such thing as *"this chain link."* Forever after it is **"this surface, this edge
of this block."**

**⭐ Why there are freezes at all — the principle under the whole architecture.** *"It is all about
managing and condensing complex data into simple data"* (Jacob). Authoring has to be **fluid**: the
operator must reshape one curb, asymmetrically, on one block, and see it immediately. **Anything that
requires the whole map to be retraced 60 times a second does not work.** Every freeze in this
progression exists to hand the next stage something simpler than what it received. ⚠️ **A freeze is
therefore a performance move as much as a correctness one** — "correct but re-derived every frame" is
a failure of the same architecture.

**Where it stands, in three plain sentences:**

- ✅ **Nothing downstream can reach back.** The pavement builder's function signature takes the frozen
  shapes and scalars and **has no handle on streets at all** — reaching back would require changing
  the signature, which is visible and auditable. That is real and it holds.
- 🔴 **But the frozen thing is still a photograph of a live trace, not a derived shape.** The artifact
  is minted by running the live builder over the live lines and snapshotting the result. So the freeze
  is honest about *when* it happened and dishonest about *what it is*. Fixing that is the standing
  program: build the curb **once, from the frozen frame** (i.e. from ①), so the artifact is *derived*
  rather than *traced*.
- ⭐ **Authoring is not a chain.** The Wall kills *where geometry comes from*; it does **not** kill the
  operator's overrides. A downstream stage looking up a width by street id is **legitimate** — it is a
  dictionary lookup returning numbers, while every polygon still comes from the frozen artifact. ⛔ **A
  wall that blinded the far side to authoring would make every downstream view render the un-authored
  default** — the wall erasing the product. ⚠️ The real hazard the structural check cannot see: that
  lookup table is **keyed by street id**, so **if street ids renumber, authored overrides orphan
  silently.** Prove key parity before renumbering.

> ### ⛔⛔ WHO WRITES THE FROZEN FILE: **THE BROWSER DOES.** Not the bake.
> `serve.js`'s `POST /<scene>/shape` — **the client autosaves `shape.json` on Survey-exit** with the
> live `_shapeArtifact` it just rendered, into the path Section fetches. ⇒ **the file on disk is a
> photograph of the last Survey exit**, and a CLI bake writing it is overwritten by the next one.
> ⛔ **It has cost twice, both times from reading the file instead of the clock:** an afternoon believing
> `--proto` bakes had landed (`dfd95f3b`), and a fillet count taken off an artifact timestamped two
> hours before the producer being measured — which reported the opposite of the live build.
> ⭐ **`shape.json` answers "what did Survey last draw," never "what does the construction do now."**
> For the second question, run the construction; check the mtime before trusting the file.

**How you would tell it was wrong.** The freeze degrades **loudly, by design**: if the frozen shape is
absent or fails to load, the view still draws — refusing to render would make onboarding a new town
impossible — but it sets a **reason string** on the store, and a non-dismissable banner says so. ⛔
**The defect was the silence, not the draw.** ⚠️ Not eye-verified: the banner cannot fire on any scene
that has a freeze.

> ### ⛔ AND THE WALL IS A *HANDLE* RULE WHERE IT NEEDS TO BE A *CONTENT* RULE
> *(Jacob, 2026-07-25: "an absolute datawall rule where we are polygons only by the time we get to the
> Section tools.")* The signature guarantees no consumer can reach the line. **It says nothing about
> whether the frozen artifact IS one** — and at a dead end, it is (§3a). The rule wanted is **content,
> checked at the freeze, failing the bake**: rings simple and of non-zero area · no doubled-back vertex
> · every edge with an interior on exactly one side · no real feature described by a patch.
> Enforceable form: `POLYGON-FIRST.md §2.1`.

---

### 6 · Section — lay the pavement, working inward

**What it is for.** With the curb frozen, the operator authors what lies between the curb and the
property line: tree-lawn, sidewalk, the way the ribbon bends round a corner, the ramp pad at the
crossing, the wrap round a round dead end.

*(⭐ The tool is still labeled **Measure** on screen. Same thing, two names — the rename is queued.
Learn the pairing or every doc reads as though it is about something else.)*

**In:** the frozen shape. **Out:** the drawn ground surface — and per-edge intent in `design.json`.

**The rule.** **It strokes INWARD off a frozen edge and it physically cannot see a street.** And the
band is **mono-width**: one total depth per block, so the outer edge is a clean concentric wrap. What
varies per edge is the *divider* (where tree-lawn ends and sidewalk begins) and the *materials*. The
phrase to hold is **"ribbon monowidth, strips variable."**

⭐⭐ **The corner is the band BENT, never a constructed thing.** The corner is simply *where that
continuous band curves* — a slice of the same offsets. ⛔ **If you find yourself constructing a corner
shape, stop.** You have reverted to the model this whole regime exists to kill. Every one of this
project's corner defects has been a construction reaching for a special case.

> ### ⛔ AND THE CURB HAS **TWO** PRODUCERS — do not say "the curb is a concentric offset" and stop there
> Most of the time it is: the centerline stepped outward a fixed distance, parallel everywhere. **But a
> median, a sliver or a dead-end disc is not an edge-offset**, so it is built by a **boolean carve**
> instead — and that is the *right* answer for it, not a degradation. ⛔ *"The curb is a concentric
> offset"* therefore describes **most blocks, not the map**, and the carved share **varies by town** —
> ▶ `node scratch/a07-producer-disclosure.mjs` — so **no single scene reveals the split.**
> ⭐ Which producer built each block is **stamped into the frozen shape** (`producer` +
> `producerReason`), precisely because a reader who believes the headline will debug a carved block with
> reasoning that cannot apply to it. **Read the stamp before reasoning about a curb.**
>
> *(This bullet exists because the previous edition of this doc printed the headline as one of two
> "load-bearing facts" and never mentioned the carve. Filed as rot in the 2026-09-06 survey.)*

⭐ **And it is always populated best-effort, then overridden.** Every edge gets a sane default with no
operator action; authoring is purely correction on top. **The operator never starts from blank.**

**How you would tell it was wrong.** ⭐⭐ **A seam between two bands is not constructible.** Tree-lawn
and sidewalk are offsets of *one* contour. **So if you can see a seam, something is still being built
per-street**, and you have found a real defect rather than a cosmetic one. That is the sharpest
single-glance test in the whole progression — use it.

→ `SECTION.md` (the FILL single source of truth) · `RIBBONS.md §3.4`

---

### 7 · Bake → Stage → Preview — pour the slab

**What it is for.** Freeze the whole drawn world into a flat, fast, dumb artifact — the **slab** — that
carries geometry, ground, buildings, trees, weather and lighting.

**The rule.** **The slab is the contract**, and the catch is total: **if it isn't baked into the slab,
the public never sees it.** What the operator sees while authoring only ships if it travels through
the bake.

**How you would tell it was wrong:** something authored and visible in the tool is missing from the
deployed map. That is always a bake-completeness question, never a rendering one.

→ `BAKE.md` · `STAGE.md` · `PREVIEW.md` · `SLAB-CONTRACT.md`

---

### 8 · The Ward — the public app plays the slab

**What it is for.** The Ward is a **generic player**; this neighborhood is installation #1. It reads
three payloads, not one: the **slab** (the render), the **content** (names, history, listings — read
alongside, never baked in), and the **installation config** (identity, branding, and a module manifest
that switches whole features on or off).

**The rule.** **Features are switched by the manifest, not guessed from presence.** "Show it if the
data's there" is leaky — a feature with empty data still tries to mount.

→ `SLAB-CONTRACT.md` · `ls/ARCHITECTURE.md`

---

## Two words that mean two things. Learn both or lose a day — several have.

### ⛔⛔ "polygon"
- **To Jacob it is THE CURB** — the drawn edge of the roadway, pushed out from the centerline by the
  authored half-width.
- **To the code and most docs it is THE BLOCK FACE.**

⭐ When Jacob says *"if we were properly polygonized we wouldn't be having these conversations,"* **he
is talking about the curb.** ⛔ Do not answer it with block-face reasoning. ▶ **Say which one you mean,
every time — "block face" or "curb ring", never the bare word.**

### "Measure" / "Section"
The operator opens a tool called **Measure**; the canon calls the stage **Section**. Same thing.
Likewise the operator's **Extent** is the canon's *intake*, and **Stage** / **Preview** are the *look*
and the *stress test*.

### ⭐⭐ And the mistake that hides inside a street name
You measure a coordinate, you want to know which street it is on, so you ask the street graph *"which
line is nearest this point?"* — and a line-world diagnosis arrives attached to the name. **It never
feels like switching layers; it feels like locating the defect**, which is exactly why the check never
fires.

⛔ That query **is** proximity recovery of a street label, which is forbidden — two earlier mechanisms
died of it. ⭐⭐ **And it is unnecessary, because the shape is named too.** The frozen artifact's runs
carry street, side and ordinal per arc, and every inset vertex is bound to its owning edge. **The same
street names are already there**, as attributes of arcs rather than nodes of a graph.

▶ **The move: coordinate → the block whose ring contains it** (by geometry — ⛔ never by index; the
live pass and the frozen artifact number blocks differently) **→ which arc is unpainted and who owns
it.** Name a street last, as a label for the human.

⭐ **Jacob naming streets is correct** — authoring is street-keyed because that is the product. The
error is converting his street-name *report* into a line-world *diagnosis*.

---

## Old anchors → where they went

⛔ **The corpus, the `_archive/`, and the dated audit reports still cite the previous edition's section
names.** They resolve here:

| cited as | now |
|---|---|
| `WALL.md` (the whole file) | **§5 · The Wall** — absorbed whole; the file is `_archive/WALL-2026-09-06.md` |
| `WALL.md §1` | **Law 2** — freezing wrong data is worse than not freezing |
| `WALL.md §31`, `WALL.md §5b` | ⚠️ **never existed.** `WALL.md` had §0–§6. `§31` was cited 13 times, twice as *"the accurate SSOT"* |
| `PIPELINE §Wall` | **§5 · The Wall** |
| `PIPELINE §Tile` | **step 3a** — what a block actually is |
| `PIPELINE §intake` / `§pour` | **steps 0–1** |
| `PIPELINE §skeleton` / `§prebake` / `§survey` / `§section` / `§bake` | **steps 2 / 3 / 4 / 6 / 7** |
| `PIPELINE §144` and the figure-ground ladder | retired — `_archive/PIPELINE-v0.2-address-map-2026-09-06.md` |
| `§P1`–`§P10` | **unchanged**, at the bottom of this doc |

---

## The §P addresses — kept, because other docs cite them

⛔ **These are addresses, not descriptions.** The description of each is above; do not restate it here,
and do not add line numbers.

| | stage | what it does | detail |
|---|---|---|---|
| **P1** | Skeleton | raw trace → the clean, named, simplified frame | `SKELETON.md` |
| **P2** | Fortification | the operator's measures, caps, anchors, corner radius | `SURVEY.md` |
| **P3** | Promote | compile frame + intent → `ribbons.json` | `PREBAKE.md` |
| **P4** | Blocks | the enclosed faces between the streets — ⚠️ and §3a above | `RIBBONS.md §3.2` |
| **P5** | Curb SHAPE | each block edge offset by the authored half-width, corners rounded once | `RIBBONS.md §3.3` |
| **⟦WALL⟧** | the freeze | → `shape.json`; streets stop being lines | §5 above |
| **P6** | Pavement FILL | tree-lawn / sidewalk / bent corner / ramp pad, stroked inward | `SECTION.md` |
| **P7** | Curb stroke | one continuous stroke per block, wrapping the whole silhouette | `RIBBONS.md §3.5` |
| **P8** | Land use / median | per-block color; the tree-lawn picks up its block's color | `RIBBONS.md §3.5` |
| **P9** | Materials | every band mapped to a layer; per-Look colors | `STAGE.md` |
| **P10** | Bake siblings | ground / ao / buildings / lamps / scene → the slab | `BAKE.md` |

**One module, two consumers:** P4–P8 run through the *same* construction for both the live 2D view and
the offline bake — **live == bake by construction.** ⚠️ That is a property of the *path*, not a
correctness claim: the live view faithfully shows the bake **including its current defects.**

---

## Where we are off

⛔ **This doc says what is supposed to happen. It does not track what is broken.**
▶ **`DOC-CODE-COHERENCE.md` §“The 2026-09-06 progression survey”** — every divergence found in this
scrub, classified as **rot** (the doc describes an old reality — evict), **regression** (the doc
describes what should still be true; the code drifted — fix the code), or **aspiration** (the doc
describes intent that was never built — ⛔ neither evict nor correct; surface it as work).

⛔⛔ **The third is this kind of pass's own failure mode.** An aspiration looks exactly like rot, so a
sweep that brings docs into line with code will **delete decisions**, quietly, one plausible edit at a
time. Which side is wrong is a judgment about where the project is *going* — take it to Jacob.

---

*v1.0, 2026-09-06 — the narrative scrub. Rewritten in plain language; absorbed `WALL.md`
(`_archive/WALL-2026-09-06.md`) and the "what this stage is" opening of `SKELETON` · `PREBAKE` ·
`SURVEY` · `SECTION` · `RIBBONS` · `POLYGON-FIRST`, each of which now holds detail only and points
here. The previous edition is `_archive/PIPELINE-v0.2-address-map-2026-09-06.md`. ⛔ Deliberately
carries no `file.js:NNN` citations — 51 of the corpus's 99 were measured stale the day this was
written (`node scratch/claims-doc-code-citations.mjs`).*
