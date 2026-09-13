# RETIRED — PREBAKE §2.5 / §2.5a, the boundary clip and its census

> ⛔ **THE MECHANISM DESCRIBED BELOW NO LONGER EXISTS.** The boundary clip was **excised
> 2026-09-05, `ec7dd3f4`** ("The frame keeps its chains and its curves: the clip is gone"),
> on Jacob's ruling: it trimmed every street/alley/path polyline to
> `max(streetFade.outer, radius) + 30` and so let **`streetFade` — a render knob — decide what
> exists**, cutting inside the frozen bb on every kit-built scene (LS 40–85 m, HPDM 60–123 m,
> Altadena 642–850 m). *"The disc HIDES what is outside it"* — this was the one step that
> **deleted**.
>
> **Archived, not deleted, because this text carries RULINGS and design record** (`CLAUDE.md`:
> excision is for dead *code* and the artifacts of a state we will not return to; never for
> rulings). ⛔ **Nothing in it is true of the code today. Do not cite it as current.**
>
> **Live home for what survives → `cartograph/PREBAKE.md §2.5`** (building membership; the
> `cornersAdjacent` consumer status; the unbuilt bake-time crop).
>
> ### What the excision closed, measured on `src/data/ribbons.json` 2026-09-08
> | the census below claims | measured today |
> |---|---|
> | 31 tips manufactured at exactly `keepR` (1030 m), "to the metre" | **0 of 343** chains have an endpoint within 0.5 m of 1030 |
> | streets polyline-clipped, nothing beyond `keepR` | **138 of 343** chains carry a vertex beyond 1030 |
>
> ⇒ **the manufactured-rim-tip class and its nodeless-vertex reciprocal are closed BY REMOVAL**,
> which is what `ec7dd3f4` predicted ("what dies with it — measured, not hoped").
> ⛔ **NOT the 51 interior dead-end tips** — 51 pre-clip, 51 post. `A0` does not close.
>
> ⚠️ **Instrument status:** `checks/claims-nodeless-tip-classifier.mjs` parses `keepR` out of
> `pipeline.js` and now **fails loudly and correctly** ("the probe's source-read is stale — FIX
> THE PROBE against the new source; do not guess the rule"). That is the guard working as
> designed. `checks/claims-preclip-walk.mjs` is separately broken
> (`resolveChainSegmentation is not a function`, via `scratch/_substrate-feed.mjs:58`) — a
> different fault, not this one.
>
> *Retired 2026-09-08. Verbatim text follows.*

---

## 2.5 ⭐ The boundary clip — the Data-Wall neuter (2026-07-04)

`pipeline.js` runs a **boundary clip** immediately **after `deriveLayers(...)` and before the `map.json` write** — a **KIT** step, **gated on the scene carrying a `neighborhood_boundary.json`** (a bare `existsSync`). ⚠️ **Every scene including `toy` carries the file, so the clip fires everywhere** (LS: `keepR = 1030 m`). What LS lacks is a **`polygon` key** — the different fact that makes the building-membership test fall back to the disc. It is the Data Wall doing its defining job (§0): **neutering a spurious polygon *at the wall* rather than carrying it whole downstream.**

The canonical spur is a named **boundary arterial** that enters the fetch at full *city* length and overshoots the hood. **South Big Bend ran 3882 m across a 2502 m hood** (Forsyth 3677 m, Wydown 2905 m); kept whole, these arterials stick out asymmetrically (south + east) and **skew the entire content bbox SE.** The clip has three moves, keyed to the layer:

- **⭐ Streets / alleys / paths are polyline-CLIPPED, not kept whole** (`clipRun`): each polyline is trimmed to the boundary circle and **only the longest inside run is kept — the rest are silently discarded.** ⚠️ **Lossy, and unfixed:** a street that leaves and re-enters the hood loses its shorter in-hood run. **0 chains on LS produce a second piece**, so it fires nowhere here — a town-#2 landmine, not a measured loss. ⛔ Its fix is **not** a second street entry: minting an id downstream of `skeleton.js:1681` orphans authored slots (`RIBBONS §2`). It goes as a **loud report**. After the clip the ribbons street bbox is **symmetric** — `x[-1439..1434] z[-1441..1441]` (was `x[-2110..1770] z[-1940..1940]`, skewed SE); max street span **3882 → 2144 m**.
- **Faces / tiles / features drop-if-outside** — a feature entirely outside `keepR` is **removed**: top-level `layers[cat]` arrays + ribbons faces / tiles / medians / corridors / junctions / nameTransitions. The `touches` test is **inclusive** so a tile→street edge ref straddling the edge survives. ⭐ **This is the move that earns the size win below**, not the polyline clip. `keepR = max(streetFade.outer, radius) + 30` — **floored and fail-loud** since `b54cbaae`; gate `node scratch/claims-clip-extent-floor.mjs` (§2.5a).
- **⭐ Building MEMBERSHIP = `((polygon − exclusions) ∪ activate) − hide`** (2026-07-20). **The POLYGON decides; the disc RENDERS.** The operator's **inclusion polygon** (`nb.polygon`, lon/lat, re-projected into the re-centered frame) is the membership test; the flattened **exclusion loops** (`nb.exclusions`) carve strays OUT via `pointInPolygon`, and per-building `activate`/`hide` overrides layer on top (`NEIGHBORHOOD-INPUTS §5.2`). **A scene with no polygon falls back to the disc.** Applied in `pipeline.js` so `map.json` is the single filtered source (2D Designer + bake); `bake-buildings.js` re-applies the same belt-and-suspenders. Live home: `INTAKE.md §0.5` · design of record `EXTENT-DESIGN.md`.
- **The 3D ground mesh is stencil-bounded to ±1461 regardless** (a clean disc) — the clip changes the **ribbons/content bounds**, not the ground mesh.

Result on a wide 5.4 km test fetch: `map.json` **180 → 52 MB**, ribbons **22 → 8 MB**, streets **2117 → 300**.

> ### ⛔ 2.5a — THE RIM CHOP IS A MISSING RIM CHAIN, NOT THE CLIP (2026-08-12)
> **Jacob, seeing round-capped stubs north of Chouteau: *"I am seeing artificially cut off streets in this
> whole area."* Then, on the mechanism: *"cut off streets are on the map boundary, very rough chop that
> gets 'close enough' to the edge of the disc."***
>
> ▶ **Reproduce, any scene: `node checks/claims-deadend-populations.mjs [scene]`.** It prints the three
> populations this section used to tabulate — skeleton (pre-clip) · rendered (post-clip, the one
> `tileGround.js:2787` recomputes and caps) · `junctionMap` (frozen stamp) — plus the frozen tile caps.
> ⚠️ **Name the population or the old figures do not reproduce:** they count **degree-1 nodes EXCLUDING
> `gradeSeparated`** (57 chains held out on LS). On that population `94` total, `42` beyond the hood and
> `33` interior-at-`<0.8R` reproduce exactly. **`29 at clip radius` does NOT — it measures 25.**
> ✅ **CAUSE ESTABLISHED 2026-08-21** — that 25 is the nodeless-tip population below, and it is exact.
>
> **What the clip does, measured:** it **never touches the interior dead-end population** — 51 interior
> degree-1 tips pre-clip, 51 post. It manufactures **31 tips at the rim**, at exactly `keepR` (1030 m on
> LS) to the metre — the guillotine — and the cap machinery then gives each a **round cap**, so a chopped
> street renders as a cul-de-sac.
> - ⛔ **`streetFade` IS A RENDER PARAMETER** (a shader fade — `boundary.js:10`, `BakedGround.jsx:117`)
>   deciding **content extent**. Same defect shape as the outer-polygon finding (`RIBBONS §1`).
> - ✅ **THE FROZEN TILE/CAP SYSTEM IS CLEAN** — no caps sit at the clip radius, because the tile and cap
>   freeze run **before the clip exists** (`pipeline.js:111` `deriveLayers` vs `:139`; `derive.js:4707`
>   resolves caps against the original chain endpoints). ⇒ `RIBBONS §1`'s ruled dead-end class is **not**
>   contaminated. ▶ `node checks/claims-deadend-populations.mjs`
> ### ⛔⛔ THE RECIPROCAL HALF — **THE CLIP MANUFACTURES VERTICES THAT HAVE NO NODE** *(2026-08-21, agent Gimbal, `6d2fcb4d`)*
> This section knew the clip **strands** nodes outside the rim. It did not record the other direction, and
> **that direction is what breaks the sidewalk band.**
> ▶ `node checks/claims-nodeless-tip-classifier.mjs --source=pour`
> - **The sequence, in source:** `pipeline.js:111` `deriveLayers` builds `junctionMap` over **full-length
>   chains**; the clip then runs and `clipRun` **mints brand-new endpoint coordinates** at the circle. The
>   category filter is `if (Array.isArray(arr))` — `junctionMap` is an **object**, so it is **skipped**.
>   ⇒ **A frozen index outlives a mutation of the geometry it indexes, with no re-derive and no refusal.**
> - **Every nodeless degree-1 tip sits within 0.5 m of `keepR` — 25/25 LS · 67/67 HPDM, zero exceptions,
>   zero unexplained.** ⛔ **No node source declined them; at derive time those vertices DID NOT EXIST.**
>   Every source is correct. **There is no coverage gap in `junctionMap`.**
> - **Downstream — and ⛔ READ THE SCOPE BEFORE THE CONSEQUENCE:** no node ⇒ no `cornersAdjacent` ⇒ the
>   walk hits `no-successor`/`no-node` ⇒ **the run does not close** (`substrateWalk.js:262-280`).
>   ⛔⛔ **THAT CHAIN ENDS INSIDE A SWITCHED-OFF PRODUCER. IT DOES NOT REACH THE SHIPPED MAP.**
>   `cornersAdjacent` has exactly **one** consumer, `substrateWalk.js`, and the walk is **default-off,
>   structurally**: `tileGround.js:3047` gates it on `opts.substrateTiles` (passed by nothing) or
>   `SUBSTRATE_TILES=1` (absent in the browser). Flag off ⇒ **tiles are the frozen `shape.json`,
>   byte-for-byte** (`tileGround.js:3042`, its own comment).
>   ▶ `grep -rn "substrateTiles\|cornersAdjacent" src cartograph --include="*.js" --include="*.jsx"`
>   ⇒ **This defect explains nothing the operator is looking at today.** It is a blocker on the walk
>   becoming the producer — real, and scoped to that. *(Corrected 2026-08-21: this line said "⇒ a hole in
>   the ped band" flatly, and that framing sent two sessions into the chain graph after production
>   symptoms.)*
> - **The reciprocal population is the larger one:** `junctionMap` nodes beyond `keepR` — a small share
>   on LS, a large majority on HPDM. HPDM's index mostly describes streets that are not in the map.
>   ▶ `node checks/claims-nodeless-tip-classifier.mjs --source=pour` ("THE RECIPROCAL HALF")
> - ⛔ **THE NAIVE CURE IS A PLAUSIBLE-LOOKING WRONG MAP:** minting a node at the cut promises a **cap
>   coupler** there, i.e. the kit would render a guillotined arterial as a **cul-de-sac by design**.
> - ⚠️ **Bears on the ruling below but does not overturn it** — that ruling rests on there being no
>   interior population to recover, which still holds (51 interior tips pre-clip, 51 post). **What is new
>   is the invalidation defect, which is general and not rim-specific.** Jacob's ruling owed.
> - ⛔ **Populations here are POST-MINT (95 pendant-tip nodes, 25 rim tips); the figures above are
>   PRE-MINT (29 deg-1 nodes, 31 rim tips). Different populations — never merge them.**
>
> - ⚠️ **`junctionMap` is stamped pre-clip and never re-filtered** — none of its degree-1 nodes sit at the
>   clip radius, but a minority of unlocatable stamps name a chain the whole-feature drop removed
>   (agent A, `a2e0f6c4`). ⛔ **Do not read this as "Slice 1 is mostly artifact."** That reading came from
>   quoting the `<0.8R` column as though it were the real-tip count — by hood radius it is a larger
>   share, and the interior population the tip couplers sit on is untouched by the clip.
>   ▶ `node checks/claims-deadend-populations.mjs` — re-derive both columns; ⚠️ this whole §2.5a
>   census has drifted further since 2026-08-21 (the grade-separated holdout count alone has moved),
>   so treat every number in this subsection as unverified until re-measured.
>
> ### ✅ RULED 2026-08-12 — THE RIM IS THE SUBSTRATE'S JOB; ② CLOSED WITHOUT REMOVING THE CLIP
> `__boundary__` is a **synthetic id with no chain behind it in `ribbons.streets`** (`RIBBONS §1`), so
> `derive.js:4697` closes the faces against the contour at **892** while the streets run on to **1030** and
> get capped. ⇒ **the cure ships with the substrate slice.** ⛔ **Do not re-open the clip for it.**
> ⛔⛔ **ROT EVICTED 2026-08-21 — this sentence used to read "when the boundary becomes an ordinary chain
> with an ordinary band." JACOB RETRACTED THAT ON 2026-08-12** (`RIBBONS §1`: *"I was wrong; the radius is
> not an ordinary chain"*). **The rim BOUNDS, it does not OWN — no coupler, no band.** ⇒ the rim will
> **never** supply junction nodes, so ⛔ **do not expect the nodeless-tip class to close as a side effect
> of the boundary becoming a participant. It cannot.** *(The live candidate is different and unmeasured:
> `derive.js:4632`'s own "build full, crop last" — the punch-out walks the FULL graph and the stencil
> crops, in which case the clip's manufactured vertices are never walked. Unestablished; see the brief.)* *(Superseded: an earlier sequencing ruled "remove the artificial cut and reconnect the nodes
> first." The measurement above closed it — there is no interior population to recover.)*
>
> What the clip did need was the two defects it shared with the bake bbox (`bake-ground.js`): a **floor**,
> so a look band narrower than the disc cannot cut inside the hood, and **no fallback** — `?? Infinity`
> clipped nothing and still printed a clean kept/dropped line. Both landed `b54cbaae`; the gate for the
> class is `node scratch/claims-clip-extent-floor.mjs`. ⭐ `§2.5`'s original job is real (a city-length
> arterial skewing the content bbox) and was **kept, not removed**.
>
> ⛔⛔ **NEVER AN EXTENT OPERATION. THIS IS THE TRAP.** `EXTENT-DESIGN §3.3` (D4, measured 2026-08-08):
> **`commit-extent`/`rescope` ALWAYS reset `center`, `fade`, `streetFade`, `innerFadeOffset` to hardcoded
> values, with no protection and no warning** — and **LS is the ONLY scene carrying authored values there**
> (`center:[-15,-15]` = Lafayette Park's centroid; `innerFadeOffset:134`; every other scene `[0,0]`/200).
> **`streetFade` is in that reset set, and it is the very field `keepR` reads.** ⇒ **the tool would
> silently destroy LS's authored centre and fade** — on production `lafayette-square.com`, a scene that
> **has never been poured** (`EXTENT-DESIGN §2`) and that the worklist rules is **conformed LAST**.
>
> ⛔ **CLEAN IT UP; DO NOT PATCH, AND DO NOT KEEP AN IMPRINT** *(Jacob: "this is the very definition of
> clogging dead code effluvium… we will not return to this state, so it is no benefit to save an imprint
> of it. **This is true in the documentation as well.**")* Excise knobs, wiring **and prose** in one pass.
> ⚠️ A **deliberate, scoped exception** to *archive-don't-delete*: it covers **dead code and the artifacts
> of a state we will not return to** — never design record or rulings. *(Doctrine: §6.)*


---

## APPENDIX — `ROADMAP` A17's `clipRun` duplicate-vertex lead, retired 2026-09-08

> ⛔ **A DEAD LEAD, KEPT ONLY SO ITS METHOD IS NOT RE-DERIVED.** It attributed A17's unreliable
> sidewalk/treelawn swap to duplicate vertices `clipRun` inserted (`a+(b−a)·t`, `t=1` not bit-exact).
> **Struck 2026-09-08** — `node scratch/segord-duplicate-forensic.mjs` returns 0 duplicate-carrying
> chains, 0 zero-length spans, 0 partitions that move. **And the clip itself was excised 2026-09-05
> (`ec7dd3f4`), so the mechanism cannot recur.**
> ⭐ Its two LIVE consequences stayed in `ROADMAP` A17 and are not repeated here.
> ⛔ Nothing below is true of the code today. Verbatim text follows.

  - ### ⭐⭐⭐ THE LEAD — **JACOB, 2026-08-21: *"the streets we manually clipped way back at the beginning are causing us trouble."*** MEASURED, AND THE CORRELATION IS STRONG.
    ⛔ **This is a LEAD WITH A RECEIPT, NOT A CAUSE.** The last link is unmeasured and named below.
    - **`clipRun` inserts a duplicate vertex into chains it never clips** — it rebuilds polylines as `a+(b−a)·t` and `t=1` is not bit-exact. **16 of 209 shipped chains carry one** *(reproduces agent Ferrule's 2026-08-12 figure independently)*.
      ▶ `node -e "const r=require('./src/data/ribbons.json');let n=0;for(const s of r.streets){if(!s.points)continue;for(let i=1;i<s.points.length;i++)if(Math.hypot(s.points[i][0]-s.points[i-1][0],s.points[i][1]-s.points[i-1][1])<1e-6){n++;break}}console.log(n,'of',r.streets.length)"`
    - ⭐⭐ **THE AUTHORING SITS ON THEM: 27 of LS's 49 authored `blockCustoms` slots — 55% — are on a duplicate-vertex chain** (`park-avenue-1` 12 · `mississippi-avenue` 9 · `south-18th-street-3` 5 · `south-jefferson-avenue-3` 1). 12 more affected chains carry no authoring.
    - ⭐⭐⭐ **AND 13 OF THE 16 DUPLICATES SIT ON AN INTERSECTION COORDINATE** (shared by ≥2 chains), **every one of them interior** — so each passes `naturalSegments`' `i > 0 && i < n-1` filter (`buildBlockGeometryV2.js:660`). Three of the four authored streets are in that set.
    - **Why that would break the swap, IF the last link holds:** `segOrd` is an **ordinal over the chain's POINT-INDEX array**, partitioned at IX vertices, and `blockCustoms` is keyed `skelId · side · segOrd`. A duplicate **at an IX** would let coordinate-match resolve **two** indices for one intersection ⇒ a **zero-length segment consuming an ordinal** ⇒ **every later slot on that chain addresses the wrong span.** That is "the swap is unreliable," and it would be **worst on the most-authored streets** — the kit's signature failure shape.
    - ### ⛔⛔ STRUCK 2026-09-08 — **THE ORDINALS NO LONGER MOVE. THE LEAD IS DEAD.**
      ▶ `node scratch/segord-duplicate-forensic.mjs` → **0 duplicate-carrying chains · 0 where the
      resolver returns both indices · 0 zero-length spans minted · 0 chains whose partition MOVES.**
      The skeleton has moved under this lead (the ①/tessellation work), and `clipRun`'s duplicates
      are gone from the shipped chains. ⛔ **Do not reason from the block below — it is the record
      of a lead that no longer reproduces**, kept only so its method is not re-derived.
      ⚠️ **AND IT WAS UNRUNNABLE THE WHOLE TIME IT WAS BEING CITED**: the probe imported
      `resolveChainSegmentation` from `buildBlockGeometryV2.js` after it moved to
      `chainSegmentation.js`, so A17's key-space evidence could not be reproduced by anyone who
      tried. Repaired 2026-09-08; **existence is not runnability**, which is why
      `scratch/claims-doc-pointers-resolve.mjs --run` exists.
      ⭐ Consequence for the operator: the authoring key space is MORE stable than this ticket
      implies — a re-authoring pass is not exposed to the duplicate-vertex class it describes.
    - ### ~~MEASURED 2026-08-28 — THE ORDINALS MOVE. THE LEAD SURVIVES.~~ *(struck, above)*
      ▶ `node scratch/segord-duplicate-forensic.mjs` — builds the partition for every duplicate-carrying chain WITH and WITHOUT the duplicate and diffs the slot→span mapping.
      **12 of 16 duplicate-carrying chains move.** `resolveChainSegmentation` adds **every** point index whose 0.5 m coord bucket is shared by ≥2 chains (`:724-727` — per-INDEX, no dedup by coordinate), so a duplicate at an IX returns **both** indices; `naturalSegments` then pushes `{start:i, end:i+1}` — a **zero-length span that consumes an ordinal** — and every later `segOrd` on that chain shifts by one. 12 phantom spans minted on LS.
      ⭐ **3 of the 4 authored streets are hit:** `mississippi-avenue`, `south-18th-street-3`, `park-avenue-1` (and `park-avenue-0`/`-3` unauthored). ⛔ `south-jefferson-avenue-3` is **NOT** — its duplicate is not at an IX, which is the control that makes the other 12 mean something.
      ⛔⛔ **STILL NOT A DIAGNOSIS OF THE SWAP.** This proves the KEY SPACE shifts, not that the click writes the shifted key. **The remaining measurement is the polygon-side one already named above:** click an edge whose swap does not take → which frozen tile ring contains it → what `tile.runs` says owns that arc → is that the key the write produced. **Do not close A17 on this.**
