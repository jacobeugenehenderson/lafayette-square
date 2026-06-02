# OSM-FORENSICS — The Skeleton's Semantic Frame

> **Forensic report.** Pathologist: **Vesalius** (named for the anatomist who corrected centuries of received error by *dissecting the bones* instead of trusting the textbook). Dispatched 2026-05-31, delivered 2026-06-01. **Read-only forensics — this is a report, not a fix.** Companion brief: `HANDOFF-osteopathologist.md`. Doctrine: `PIPELINE.md §P1, §Wall`; memory `project_skeleton_is_the_first_bake`.

## The verdict, up front

**The marrow is already in the raw OSM. The First Bake is throwing it away.** Every quantitative claim below was measured, not intuited (scripts: `scratch/vesalius-skeleton-forensics.cjs`, `scratch/vesalius-raw-vs-us.cjs`, `scratch/vesalius-rich-frame-proto.cjs`). The single dominant finding:

> **The skeleton frame is strictly *poorer* than the raw OSM it is built from.** Raw OSM hands us clean shared-node junction topology (322 shared-node junctions, only **3** with any multi-node clutter). The skeleton then *destroys* 79 of those junctions via RDP simplification — **79 of 79** frame-invisible T-junctions had a raw OSM node at exactly **0.00 m** that we removed. We are not diagnosing OSM. We are diagnosing **ourselves**.

This reframes the whole publish-blocker. The downstream pain (customs graveyard, the corner saga, the 3 m re-projection snap, the hardcoded "densify West 18th" hack) are all **symptoms of a frame too thin** — the bones carried so little that everything downstream had to re-derive, re-snap, and hand-patch what OSM already knew. The fix is not invention. It is **stop discarding, then derive the few things OSM doesn't carry from standards.** The prototype in `scratch/` demonstrates that a richer frame is extractable *today* with no new data source.

---

## Part 1 — The Semantic-Situation Catalog (the screenplay)

For each situation: ① the real thing · ② how OSM (mis)represents it · ③ the correct skeleton representation · ④ the downstream interpretation it eliminates · ⑤ how it's resolved. **Real LS instances cited and measured.**

### 1.1 Junction typology + node precision  ★ canonical failure

| | |
|---|---|
| ① Real thing | A node is one of: **dead-end** (cul-de-sac, gets a round cap/bulb) · **T / butt** (a street ends *on* a through street, single point, **butts in → NO round cap**) · **cross** (X) · **Y / merge** · **through-vertex** (a bend, no junction). |
| ② OSM | Carries it **correctly** as graph degree at shared nodes. Measured on LS vehicular ways: **deg-1 = 103** (dead-ends), **deg-2 = 1951** (through/bend), **deg-3 = 141** (T-junctions), **deg-4 = 84** (crosses), **deg-5+ = 10** (Y/complex). Junction node precision is clean: 322 shared-node junctions, **only 3** split across >1 node (worst span 5.49 m). |
| ③ Correct skeleton rep | A **typed node** on every chain endpoint and interior junction: `{kind: deadend\|T\|cross\|Y\|bend, degree, capDecision}`. The cap decision is a **node fact** derived from degree, not an authored field. |
| ④ Eliminates | The entire downstream cap guess (`chainPavementRing` reads only an operator-authored `capEnd==='round'`; default "blunt" *hopes* the asphalt union covers it). It also eliminates the 3 m re-projection snap in `derive.js` (`IX_SEG_SNAP=3.0`) that bolts junctions back on after the frame lost them. |
| ⑤ Resolved by | **Algorithm** (re-node from raw coords + degree classification). Prototyped — see Part 3 / `vesalius-rich-frame-proto.cjs`. |

**The canonical failure, measured.** Of the skeleton's 484 chain endpoints: **302** coincide with another chain's vertex (junction survived as a shared vertex), **79** are stranded on another chain's *segment interior* (the junction node was deleted), **103** are isolated (true dead-end *or* map-boundary exit — the frame can't tell which). The endcap decision the brief calls "the canonical failure" is unmade for **all 182** non-shared-vertex endpoints. `src/lib/buildBlockGeometryV2.js:118-124` confirms: cap is `'round'` only if the operator authored it; otherwise blunt-and-pray.

### 1.2 Noise vs. feature

| | |
|---|---|
| ① Real thing | A mid-chain vertex is either real geometry (a bend, a junction, a name/cross-section change) or OSM digitizing noise on a straight run. |
| ② OSM | Modest noise. LS raw: 2,032 highway ways, max **71** vertices in any one way, avg **5.4**. The "millions" framing is hyperbole — raw OSM is not noisy at LS. |
| ③ Correct skeleton rep | **Junction-protected simplification**: collapse only collinear degree-2 runs below tolerance; **never** collapse a junction node (deg≠2) or a curve vertex (turn > angle tol). |
| ④ Eliminates | The 79 self-inflicted interior-Ts (see Part 3). Today's blanket RDP (`skeleton.js#simplify`, devTol 0.2 m / angle 2°) is **junction-blind** — it removes a junction vertex whenever the through-street is locally straight there, which is *most* Ts. |
| ⑤ Resolved by | **Algorithm.** Prototype removes 33% of vertices while keeping **all 338** junction nodes (vs production's 48% removal that destroys 79). |

### 1.3 Same-named real-topology (cul-de-sac ↔ through ↔ cul-de-sac, or severed)

| | |
|---|---|
| ① Real thing | One name spans physically disconnected pieces, or a road severed across a gap shares a name on both sides. |
| ② OSM | Distinct ways, same `name`, with a real spatial gap. |
| ③ Correct skeleton rep | Topology-true: separate chains with **typed endpoints** (each gap end is a real dead-end/cul-de-sac), not force-welded. |
| ④ Eliminates | False welds *and* false dead-ends. The brief is explicit: **don't build a split tool** — make the frame *understand* the severance. |
| ⑤ Resolved by | **Inference** (gap-distance + dead-end typing), operator-confirm for ambiguous cases. |

**Real LS instances** (35 names emit >1 chain). Genuine severances (large endpoint gap): **California Avenue** (2 chains, 74.4 m gap), **St. Vincent Court** (54.5 m), **Truman Parkway** sections, **Carroll Street** (26.9 m), **Eads Avenue** (29.0 m). These are *correct* multi-chain cases. **But** the same list is contaminated by a *different* pathology — see 1.7.

### 1.4 Name-change along one continuous street  ★ end-to-end stress case

**The Dolman → 18th U-street. Traced fully.**

| | |
|---|---|
| ① Real thing | A single physical U-shaped road: enters the neighborhood as **Dolman Street**, runs south down the east limb, bends at the bottom, returns north up the west limb as **South 18th Street**. The name changes mid-run. It is **one continuous road**. |
| ② OSM | Split into separate ways at the name change, **with no transition marker** — but the ways **share an endpoint exactly**. Measured transition point: Dolman `osm661952868` end (608.6, −391.2) == West 18th `osm1350963412` end, gap **0.00 m**. |
| ③ Correct skeleton rep | **One continuous chain** carrying a `nameTransitions: [{at: point, from:'Dolman Street', to:'South 18th Street'}]` marker; the bottom bend held as a **true arc** (sufficient density); the cross-section change recorded as a transition feature (1.5), not averaged. |
| ④ Eliminates | (a) The false break into "Dolman" + "18th" as unrelated streets. (b) The **hardcoded `CURVE_STREETS = ['West 18th Street']` densify hack** in `derive.js:1122` — that manual patch exists *only* because the frame didn't carry enough arc density at this bend. (c) The manual `LaSalle`-extend magic-coordinate hack two lines below it (`derive.js:1131-1136`). |
| ⑤ Resolved by | **Algorithm** (shared-endpoint weld across name change + name-transition stamp) + **inference** (arc densification to ribbon-offset-safe density). |

**This one case bundles four situations** exactly as the brief predicted: a name-transition point (1.4), joints to weld (the Dolman fragments `osm151115533` + `osm661952868` + `osm1350467176` chain end-to-end), a real cross-section change (Dolman residential 2-lane → South 18th, which becomes secondary 3–4 lane further south — 1.5), and an arc to smooth (the bottom bend — the West 18th densify hack). **Resolving 1.4 in the frame deletes two hardcoded hacks from `derive.js`.**

### 1.5 Cross-section transition within a street

| | |
|---|---|
| ① Real thing | A street whose profile (lanes/width/sidewalk/treelawn) genuinely changes partway — e.g. South 18th transitions residential 2-lane ↔ secondary 3–4-lane. |
| ② OSM | Carried as a **`lanes`/`highway`-class change between adjacent ways** of the same name. LS: `lanes` present on **242** ways with values that *do* change along South 18th (2 → 3 → 4). |
| ③ Correct skeleton rep | The chain stays continuous; the transition is a **feature node** carrying `{at: point, fromProfile, toProfile}`. Not averaged, not false-split. |
| ④ Eliminates | Width/lane averaging and the temptation to break the street in two (which would corrupt junction continuity). |
| ⑤ Resolved by | **Ingest** (the `lanes`/class change is already in OSM) + **inference** (mark the transition where adjacent same-name ways differ). |

### 1.6 The third category — paved positive space that is neither street nor block

| | |
|---|---|
| ① Real thing | Medians, concrete aprons/expanses on thoroughfares, traffic islands, refuge islands, plazas. Paved/landscaped positive space that is *not* a travel street and *not* a block interior. |
| ② OSM | Scattered across tags, **no median tag at all**. LS carries: `highway=pedestrian, area=yes` plazas/aprons (**9** ways), `crossing:island=yes` refuge islands (**31**), and **implicit median gaps** between divided carriageways (never tagged). `man_made` = 0. |
| ③ Correct skeleton rep | A **first-class `apron`/`median`/`island` polygon layer** in the frame, parallel to streets and blocks — paved positive space with its own material tag. The median specifically is **derivable**: it is the polygon *between* a divided pair the frame already pairs. |
| ④ Eliminates | The figure-ground hole. `PIPELINE.md §P5`: `block = stencil − asphalt` has **no slot** for paved-positive-that-isn't-a-street, so these are silently lost (memory `feedback_silhouette_straight_emitter_skipped_fes` is the same disease downstream). |
| ⑤ Resolved by | **Ingest** (plazas/islands from existing tags) + **derivation** (median = gap polygon between paired carriageways). |

**Median width is computed today and thrown away.** `skeleton.js#analyzePhases` already pairs antiparallel carriageways (28 divided pairs at LS) and **measures the gap** (`meanPerpDistanceXZ`) — then emits two centerlines and discards the number. Measured real medians: **South Jefferson ~12 m**, **Truman Parkway ~41 m**. The median polygon is one `difference` away from data the frame already holds.

---

## Part 2 — Attribute Triage

For every semantic field, sorted into the four buckets, grounded in measured tag coverage (`vh` = 333 vehicular/named LS ways) and `skeleton.js#makeStreet` (L589: emits `{id, name, highway, oneway, points, sources, phase}`).

| Attribute | Bucket | OSM coverage (LS) | Evidence / note |
|---|---|---|---|
| name | **(a) KEPT** | 288 ways | grouped + welded by name |
| highway class | **(a) KEPT** | 2032/2032 | carried to `street.highway` |
| oneway | **(a) KEPT** | 250/333 | drives divided classifier |
| divided/carriageway pairing | **(a) KEPT (partial)** | 28 pairs | `phase.pairKey` carried — **but median width discarded** |
| **lanes** | **(b) IN OSM, IGNORED** | **242/333** | never read into the frame — high-value, free |
| **lanes:forward / :backward** | **(b) IGNORED** | 5 / 5 | asymmetric section, dropped |
| **surface** | **(b) IGNORED** | **261/333** | paved/unpaved material, dropped |
| **maxspeed** | **(b) IGNORED** | 171/333 | class/width prior, dropped |
| **median width** | **(b) IGNORED (computed!)** | 28 pairs | measured in `analyzePhases`, then thrown away |
| turn:lanes, cycleway, parking:* | **(b) IGNORED** | 13 / 50 / 3 | present, dropped |
| crossing / crossing:markings | **(b) IGNORED** | 384 / 383 | crosswalk locations, dropped |
| **junction type / dead-ends / connectivity** | **(c) DERIVABLE** | n/a | degree classification — **prototyped** (141 T, 84 X, 103 dead) |
| **corner / curb-return radius R** | **(c) DERIVABLE** | n/a | from junction type + class (Part 4) |
| **median polygon** | **(c) DERIVABLE** | n/a | gap between paired carriageways |
| name-transition point | **(c) DERIVABLE** | n/a | shared endpoint across same-road name change |
| **width (curb-to-curb)** | **(d) RESIDUAL** | **0/333** | **OSM has none** → must seed from lanes + standards |
| **sidewalk presence/width** | **(d) RESIDUAL** | **4/333** | too sparse → standards seed (north-star) |
| **treelawn / planting strip** | **(d) RESIDUAL** | 0 | not in OSM → standards seed |
| curb width | **(d) RESIDUAL** | `kerb` on 2 | standards default |
| curb ramps / detectable warnings | **(d) RESIDUAL** | `tactile_paving` 184 (nodes) | PROWAG default; node hints exist |

**The triage answers "how do we tell the system":** mostly we *don't* — bucket (b) is **ingest** (it's already there, we drop it), bucket (c) is **derive** (prototyped), and only bucket (d) — chiefly **width, sidewalk, treelawn** — burdens the operator, and even that is **standards-seeded** so the operator only touches genuine exceptions. **Width has zero OSM coverage at LS**, so seeding it from `lanes × lane-width + parking` (Part 4) is the *only* path to a default cross-section — and it works (Part 5 north-star).

---

## Part 3 — Frame Fidelity & where the pathology lives

The substrate (mono-width ribbon on a frozen polygon) is sound — this section is about the **frame**.

### 3.1 Node precision — raw is clean, *we* corrupt it

| Measurement | Value |
|---|---|
| Raw vehicular shared-node junctions | 322 |
| …with multi-node clutter (>1 node, ≤6 m) | **3** (worst span 5.49 m) |
| Skeleton endpoints stranded on a segment interior (junction lost) | **79** |
| …of which had a raw OSM node at the exact spot we deleted | **79 / 79 (0.00 m)** |
| Genuine OSM gaps (terminating way truly ends mid-segment, no node) | **0** |

**This is the most important finding in the report.** Per the brief's "localize raw vs. us" — the answer is unambiguous: **100% self-inflicted.** Raw OSM had the junction; `skeleton.js#simplify` (junction-blind RDP) removed the through-street's vertex at the T because the through street is locally straight there. Magnitude is a red herring — even one would be a defect — but the *direction* is the story: the First Bake is a **net loss of topology**.

### 3.2 Why current snapping misses it

`skeleton.js` welds by **name group only** (`weldChains`, gated on signature+pairKey) and never nodes across different names — there is **no cross-street junction step in the frame at all.** Junctions are re-discovered *downstream* in `derive.js`: `nodeEdges` (`node.js`) geometrically intersects segments, but `segmentIntersection` (`node.js:37-39`) returns **interior crossings only** — it explicitly rejects endpoint hits (`u <= EPSILON`). So a T (one street's *endpoint* on another's interior) is invisible to the noder unless OSM already shared the node — and we just deleted that node in P1. The result is patched back with a **3 m fuzzy re-projection** (`derive.js:2407 IX_SEG_SNAP=3.0`). The frame loses the junction; a 3 m snap guesses it back. That fragility *is* the customs/wall-move pain upstream.

### 3.3 Arc density — Goldilocks, set by the widest ribbon

Density is **not** "fewest nodes." A wide ribbon offset of a coarse arc opens kinks/gaps at the joints; the tolerance is a fraction of the ribbon width `W`, so **the widest ribbon the centerline must support sets the density floor** — a frame requirement. Measured on the Dolman U-bend (R≈30 m): to keep the offset kink under 10% of `W`, a `W=12 m` residential ribbon needs ≥3 segments per 90°, a `W=24 m` arterial ribbon ≥2. Today's frame is the *opposite* of density-aware: blanket RDP thins curves, then `derive.js` hand-re-densifies one named street (`CURVE_STREETS`). The frame should hold the bend at offset-safe density (or as a true arc) from P1.

### 3.4 Self-inflicted fragmentation (the weld's other failure)

Of the 35 same-name multi-chain cases (1.3, 1.7), many have a **0.00 m** min endpoint gap — i.e. fragments that *touch exactly* but the welder left split: Lafayette (13 chains), South Jefferson (14), Park Avenue (11), Geyer (9), Papin (7). Some is correct (divided carriageways must stay separate), but the count says the frame is **over-fragmented**: a chain the operator expects to click as one street is many. This compounds the customs-identity drift downstream (every fragment is its own keying surface).

### 3.5 Proof the marrow is extractable — `vesalius-rich-frame-proto.cjs`

A read-only prototype re-derives a richer frame from raw OSM with **no new data**:

```
JUNCTION TYPOLOGY (frame OUTPUT, from raw coords):
  deg1 DEAD-END  -> round cap : 103
  deg2 thru/bend -> weld/keep : 1951
  deg3 T-JUNCTION-> butt, no terminator cap : 141
  deg4 CROSS                  : 84
  deg5+ Y/complex             : 10
  => every endcap & corner decision is now a NODE FACT.

JUNCTION-PROTECTED simplification (Goldilocks):
  raw 2741 verts -> 1826 (33% removed), ALL 338 junctions kept
  (production: 1431 / 48% removed, but DESTROYED 79 T-nodes)

ATTRIBUTE INGEST (present today, dropped today):
  lanes 242 · oneway 250 · surface 261 · maxspeed 171 · width 0
```

The prototype keeps **every** junction while still removing a third of the noise, and turns the cap/corner decision into a typed node fact. That is the publish-blocker's root, demonstrated solvable in ~150 lines of read-only code.

---

## Part 4 — The Standards Layer (★IP — destined for `ARCHITECTURE.md` Decisions)

Compiled from current governing documents (full research + source URLs in `scratch/` agent trace). Confidence: **[P]** primary-source confirmed · **[S]** reputable secondary · **[U]** widely-published but unverified against the paywalled primary. These are the **default/prior** that seeds buckets (b) and (d).

### ADA / PROWAG (2023 final rule) — **[P], governs corners + sidewalks**

| Element | Value | Standard | Notes |
|---|---|---|---|
| Sidewalk min clear (PAR) width | **48 in / 1.22 m** (60 in / 1.52 m on medians) | PROWAG R302.3 | class-independent |
| PAR cross slope (general) | ≤ 1:48 (2.1%) | R302.6 | crosswalk allows 5.0% where uncontrolled — keys off **traffic control, not street class** |
| Curb ramp running slope | ≤ 1:12 (8.3%) | R304.2.1 | |
| Curb ramp width | ≥ 48 in / 1.22 m | R304.5.1 | |
| Curb ramp landing | ≥ 48×48 in / 1.22×1.22 m | R304.2.5 | |
| Detectable warning depth | ≥ 24 in / 610 mm; dome height 0.2 in / 5.1 mm | R305.1 | truncated domes |

### AASHTO Green Book (GDHS-7, 2018) — **[U] (tables paywalled — confirm before authoritative use)**

| Element | Value | Range | Variation by class |
|---|---|---|---|
| Lane width — local/residential | 10–11 ft | 9–12 ft | 9 ft only low-speed/-volume |
| Lane width — arterial | 11 ft (12 high-truck) | 10–12 ft | |
| Parking lane | 8 ft | 7–9 ft | |
| **Curb-return radius R** | 15 ft typical | **5–10 ft** local-local · **15–25 ft** w/ buses · **30–50+ ft** truck/arterial | **most class-dependent figure** |
| Median (raised refuge) | 6 ft (carries PAR) | ≥4 ft raised; 6 ft w/ crossing | wider on arterials |
| Design vehicle turning R | P≈24 ft · SU-30≈42 ft · WB-67≈45 ft | — | sets corner envelope |

### NACTO USDG / MUTCD — **[P]/[S]**

| Element | Value | Standard |
|---|---|---|
| Travel lane (urban default) | 10 ft (11 ft truck/transit only) | NACTO Lane Width [P] |
| Sidewalk through zone | 5–7 ft residential, 8–12 ft commercial | NACTO Sidewalk Zones [P] |
| **Planting/treelawn (furnishing zone)** | **min 2 ft / 0.6 m; typ 4–6 ft** | NACTO Sidewalk Zones [P] |
| Crosswalk width | ≥ 6 ft / 1.8 m | MUTCD Part 3 [S] |
| Bike lane | 4 ft min (5 ft at curb/parking); buffered +2–3 ft | AASHTO/NACTO [S] |
| **Curb-return radius R (NACTO)** | 10–15 ft urban (5–10 residential) | NACTO Corner Radii [P] |
| Curb height / gutter pan | 6 in curb / 12–24 in pan | local DOT std plans [U] |

**Two pipeline-critical notes.** (1) **Corner radius `R` is the most class-dependent and most-contested figure**, and AASHTO (size *up* to fit trucks, 15–50 ft) and NACTO (size *down* for pedestrians, 5–15 ft) pull opposite ways. A frame that picks `R` by street class needs an explicit policy choice — this is the corner-saga's standards anchor. (2) Almost all PROWAG figures are **class-independent** — they key off the pedestrian facility, so the frame can seed sidewalk/ramp geometry without knowing street class.

> **★ Decision (2026-06-01, Jacob): adopt NACTO defaults; the AASHTO `[U]` rows stay unverified — purchase declined.** The $342 Green Book PDF was weighed and skipped: it doesn't *hand* the frame anything NACTO doesn't, for this place. Rationale is ground-truth, not budget — **Lafayette Square is a pedestrian-scaled neighborhood; trucks do pass through, but poorly, because the geometry was never built for them.** That means the real curb radii on the ground *are* tight (NACTO-scale), so seeding `R` from NACTO (5–15 ft urban / residential) **matches reality more honestly than AASHTO's truck-swept radii would** — NACTO is the *more correct* authority here, not the cheaper compromise. Revisit only if/when the frame must seed an arterial/designated-truck-route corner, where AASHTO's design-vehicle radii (SU-30 ≈ 42 ft, WB-67 ≈ 45 ft) become the binding figure. The design-vehicle turning radii are the one thing genuinely locked behind the paywall; everything else the brief needs is NACTO-primary-confirmed and free.

---

## Part 5 — Recommendation

### ⭐ North-star test: **PASSED in prototype.**

An ordinary residential street, **zero authoring**, from `lanes` tag + standards seeds:

```
"Oregon Place"     (residential, 2 lanes): pavementHW 5.49 m | curb 0.15 | treelawn 1.52 | sidewalk 1.52 | ROW-half 8.68 m
"Mississippi Ave"  (residential, 2 lanes): pavementHW 5.49 m | curb 0.15 | treelawn 1.52 | sidewalk 1.52 | ROW-half 8.68 m
```

Treelawn and sidewalk land in the correct real-world spots by default, derived from `(lanes × 10 ft + 2 × 8 ft parking)/2` curb-to-curb, + PROWAG 5 ft sidewalk + NACTO 5 ft treelawn + 6 in curb. **Special authoring is now reserved for genuine exceptions.** The frame carries enough.

### Corner-relief test: **confirmed — chains-root + corner-confusion are one disease.**

`PIPELINE.md §Wall` claims a correct frame relieves the 13-month corner saga from upstream. The evidence supports it. The corner machinery (`cornersAtIx`, P7) needs three things the frame should *hand it as facts* but today *guesses*: (1) a **clean single junction node** (we delete 79); (2) a **butt-vs-cap decision** (today operator-authored or blunt-and-pray); (3) a **class-seeded `R`** (Part 4). Give the corner pass typed nodes + cap decisions + seeded `R`, and the per-leg/constructed-corner temptation — the thing the mono-width regime exists to kill — loses its last excuse, exactly as §Wall predicts. The corner saga is downstream of a thin frame.

### Wall-move read: **a richer frame makes clean-slate cheap and correct — lean clean-slate.**

The wall-move's clean-slate-vs-migrate decision tilts hard toward **clean-slate** if the frame is enriched first. The migration pain exists because the current frame is so thin that years of operator customs and downstream patches accreted *to compensate for missing marrow* — that accreted layer is what's expensive to migrate. **If the frame carries junction type, cap decisions, ingested attributes, and standards-seeded cross-sections, most of those customs become unnecessary** (the north-star: exceptions only). You would migrate a *small* exception set onto a *rich* frame, rather than carrying forward a *large* compensation layer onto a thin one. **Recommendation: enrich the frame first, then clean-slate — the richer frame is what makes the clean slate correct.** (Hold against memory `project_wall_move_eventual_picture` — Boz owns the ledger; this is a frame-side input to that call.)

### What the refinement brief should do, prioritized by leverage

1. **Re-node + junction-type the frame (highest leverage).** Recover OSM's shared nodes, classify degree → `{deadend, T, cross, Y, bend}`, **emit the cap decision as a node fact.** Kills the 79-junction loss, the blunt-and-pray cap, and the 3 m re-projection snap. Prototyped.
2. **Junction-protected simplification.** Replace blanket RDP with junction-protected (never collapse deg≠2 or curve vertices); density floor set by widest ribbon `W`. Kills the West 18th densify hack and the offset-kink risk.
3. **Ingest bucket (b):** `lanes`, `surface`, `maxspeed`, `lanes:forward/backward`, **median width** (already computed). Near-free; carries the cross-section.
4. **Standards-seed bucket (d):** width (0% OSM coverage — mandatory), sidewalk, treelawn, curb, **`R` from NACTO-by-class** (per the 2026-06-01 decision above — tight pedestrian-scale radii are honest to LS; AASHTO truck radii deferred to any future arterial/truck-route corner). Delivers the north-star.
5. **Name-transition + cross-section-transition as features.** Weld same-road across name changes (Dolman→18th) with a transition stamp; mark profile changes instead of averaging/splitting. Kills the LaSalle/West-18th hardcodes.
6. **Third-category layer:** median polygon (gap between paired carriageways) + plazas/islands from existing tags → first-class positive-paved-space, fixing the figure-ground hole.

### Adoptable prior art (survey, don't reinvent)

- **`osm2streets` (A/B Street)** — closest analog; its **intersection consolidation** and T/dead-end typing map directly onto recommendation #1. Adopt the *approach* (degree-typed junctions), by **algorithm**.
- **Routing-graph builders (OSRM/Valhalla/GraphHopper)** — coincident-node clustering + clean-graph simplification → recommendation #2, by **algorithm**.
- **JOSM validator rules** — a codified defect catalog; useful as the **inference** layer that flags ambiguous severances/transitions for **operator** confirm (#5).

---

## Closing — the 3–5 highest-leverage findings & scope for the next brief

1. **The frame is poorer than its source. 79/79 lost T-junctions were present in raw OSM at 0.00 m — we deleted every one.** The publish-blocker's root is not OSM noise and not the substrate; it is a junction-blind First Bake that *discards* topology. (Part 3.1)
2. **The marrow is already there; the fix is mostly "stop dropping it."** `lanes` (242), `surface` (261), `maxspeed` (171), `oneway` (250), and the already-computed median width are in OSM and thrown away at P1. Only **width** (0% coverage) and **sidewalk/treelawn** genuinely need seeding — and standards seed them. (Part 2)
3. **A richer frame is extractable today — demonstrated, not asserted.** The read-only prototype recovers all 338 junctions, types every node, keeps offset-safe density at 33% reduction, and passes the north-star cross-section with zero authoring. (Part 3.5, Part 5)
4. **The corner saga and the chains-root problem are one disease.** Typed nodes + cap-as-fact + class-seeded `R` relieve `cornersAtIx` from upstream, exactly as `§Wall` predicts. (Part 5 corner-relief)
5. **Two hardcoded `derive.js` hacks (West 18th densify, LaSalle extend) are frame-thinness scars** — a frame that carries name-transitions and offset-safe arcs deletes them. The Dolman→18th U is the canonical case and the regression test. (Part 1.4)

**Recommended scope for the refinement brief:** a **frame-enrichment pass at P1** — re-node + junction-type + cap-decision (#1), junction-protected/offset-safe simplification (#2), attribute ingest (#3), standards-seed (#4) — built and validated against **Dolman→18th** (name-transition + arc + cross-section + welds, all four), the **79 interior-Ts** (must drop to 0), and the **north-star** (ordinary street, zero authoring). **Sequence the wall-move clean-slate *after* this enrichment** — the rich frame is what makes the clean slate cheap and correct. Substrate untouched; the screenplay finally carries the whole story so downstream is the easy cosmetics it was always meant to be.

— *Vesalius*

---
*Scripts (all read-only, in `scratch/`): `vesalius-skeleton-forensics.cjs` (catalog + node precision), `vesalius-raw-vs-us.cjs` (raw-vs-us + Dolman trace), `vesalius-rich-frame-proto.cjs` (extractability proof). Every numeric claim here is reproducible by running them against `cartograph/data/lafayette-square/raw/osm.json` + `clean/skeleton.json`.*
