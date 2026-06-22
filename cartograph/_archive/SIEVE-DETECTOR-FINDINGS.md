# Sieve — Correctness Detector, first pass (forensic, 2026-06-13)

**Read-only.** Harness: `scratch/correctness-detector.mjs` (`node scratch/correctness-detector.mjs --raw`).
No production code touched. This is the seed of the POLYGON-FIRST §5 correctness suite —
the invariants that *flag the bad streets automatically* so a kit never hand-fixes them.

The honest headline: **a first-pass detector recalls ~58% of the labeled defects, at
~43% precision, and one of the six invariants the brief named (max-turn) does NOT catch
West 18th** — for a real reason, not a tuning miss. Details below. Every flag is a
**candidate for the operator's eye**, never a verdict (proxy renders mislead on this map).

---

## 0. The provenance correction that reframes the whole exercise

The brief assumed the 35 `source:'curated'` streets carry a **pre-hand-fix raw-OSM**
geometry in `_original`, so the detector could be validated by flagging that raw form.
**That assumption is wrong, and it matters.** Reading `cartograph/seed-centerlines.js`:

- The 35 curated chains come from a **hand-authored `src/data/block_shapes.json`**, NOT
  from OSM. They were drawn correct from the start; `source:'curated'` is a *provenance
  label*, not a "was-broken-then-fixed" record.
- `_original` is just `st.points.map(...)` stamped at seed time (`seed-centerlines.js:202`)
  — a frozen copy of the *curated* geometry for the revert button. So `_original ==
  points` for **33 of 35** curated chains; it is **never the raw OSM**. Validating against
  `_original` would be validating against the answer key.
- The genuine pre-hand-fix geometry lives in **`raw/osm.json → ground.highway`**, by name —
  all 31 curated names exist there as 1–22 OSM way-fragments each. The harness stitches
  those fragments (endpoint-weld) to reconstruct the raw chain (`--raw`).

**Labeled-set arithmetic:** 35 curated *chains* collapse to **31 distinct *names***
(Lasalle, Rutger, South 18th, Waverly each carry 2). The harness attributes a tile/run
flag to a street by `skelId → name`, so recall is honestly measured **per-name against 31**,
not per-chain against 35.

---

## 1. The detector — six invariants

| Invariant | Layer | What it catches | Source |
|---|---|---|---|
| **max-turn** | chain (ribbons.streets + raw OSM) | jagged digitization — ≥2 vertices turning >50° (segments ≥1 m) | new |
| **width-step** | chain | a `pavementHW` jump >1 m across a *same-name through-node* | new |
| **curb∥chain** | tile (`buildTileGround.iA`) | curb not a parallel offset of its chain in a straight run middle | `litmus-curb-parallel` |
| **iA self-int** | tile | the curb ring self-crosses | new |
| **face-closure** | tile | tile ring degenerate / zero-area / zero-length edges | new |
| (corner-guard) | — | byte-stability of corners under the throat clamp — *a regression guard, not a defect detector; left as its own harness* | exists |

Thresholds are set from **first principles, deliberately NOT fit to 31**: a residential road
turning >50° between digitized vertices is a jag; a same-name through-street whose two sides
differ by >1 m of half-width is a datum step; a straight-run curb >0.75 m off its half-width
is non-parallel. They are reported, not tuned-to-target.

---

## 2. The confusion report (current frame, ANY invariant)

```
recall    = 18/31  (58%)   curated names flagged
precision = 18/42  (43%)   of flags are curated
grid FP   = 24/82          clean-grid names flagged
```

Per-invariant (curated-caught / grid-false-positives):

| Invariant | flags | curated | grid FP | reads as |
|---|---|---|---|---|
| curb∥chain   | 32 | **14** | 18 | the broadest catcher — but also the noisiest |
| width-step   | 12 | **8**  | 4  | the **cleanest signal** (2:1 curated) — the datum-step class |
| iA self-int  | 13 | 7  | 6  | catches divided/perimeter blobs; co-fires with curb |
| max-turn     | 7  | **0** | 7  | **catches none of the labeled set** (see §3) |
| face-closure | 0  | 0  | 0  | **fires on nothing** — tile rings all close (see §4) |

**Caught (18):** Benton, Chouteau, Dillon Drive, Dolman, Lafayette, Lasalle, Mackay,
Mississippi Alley, Mississippi Ave, Missouri, Park, Rutger, South 18th, South 21st,
South 22nd, South Jefferson, Truman Pkwy, Waverly.

**Missed (13 — no invariant fired):** Albion · Carroll · Dillon St · Grattan · Hickory Lane ·
Hickory St · Kennett · Nicholson · Preston · Rutger Lane · Simpson · Vail · Whittemore.

---

## 3. Which invariant catches which class — and why max-turn whiffs

- **width-step** is the **flagship signal** for the *datum-step* family (memory's
  Vail/Mackay/Albion class): Park 5.06 m, Missouri 4.28 m, S. Jefferson 3.45 m,
  Lafayette 3.55 m, S. 18th 1.52 m. These are exactly the streets whose `pavementHW`
  jumps across a through-node — a genuine pipeline defect, cleanly isolated. 2:1
  curated-to-grid is the best precision of any invariant.
- **curb∥chain + iA self-int** co-fire on the **divided/perimeter** family (Park,
  Chouteau, Mississippi, S. Jefferson) — the "d-bulge" union-carve that POLYGON-FIRST
  is named after. They confirm Check A is RED here. But curb∥chain is **broad**: 18 grid
  false-positives, because *any* tight real corner or thin tile also bows the curb in a
  way the cheap ray heuristic can't distinguish from an artifact (the litmus's own
  documented blind spot, §A).

- **max-turn catches 0 of the labeled set, including West 18th — and this is the
  load-bearing honest finding.** The brief said "West 18th MUST fail max-turn." It does
  not, and *cannot as written*, for three compounding reasons:
  1. **West 18th is `source:'osm'`, not curated** (`west-18th-street-0`). It is genuinely
     NOT in the labeled set — the brief conflated it with curated *South* 18th.
  2. Its frame chain is only **5 points, max turn 29.9°**. The famous "jagged arc" is a
     **rendering** artifact — how a sparse-vertex arc gets *stroked into a ribbon* — not a
     vertex-turn-angle defect. A pure chain-vertex turn check is **blind to render-stage
     jaggedness.** (This echoes the banked lesson: the 18th symptoms were partly proxy
     artifacts on a snaking chain, already addressed by `dd4ddb6`/`646b8b1`.)
  3. Where max-turn *does* fire on raw chains, it conflates **legitimate sharp corners**
     with jags: run on the curated geometry as-stored, it flags Waverly (179.9° — that's
     the *U-turn of the loop*, by design), Hickory, Truman. So on the **frame** (chains
     split at nodes) it finds 0 curated and 7 grid (motorways, ramps, St-Vincent) — the
     opposite of useful. **max-turn is the weakest invariant of the six** and needs a
     corner-aware reformulation (turn-density over arc-length, or curvature-sign flips)
     before it earns its place.

The `--raw` pass confirms it: stitched raw-OSM chains for all 31 curated names show
**0 jags** at the 50°/2-count threshold (worst single turns are legitimate loop/corner
vertices: Park 150°, S.18th 132°, S.Jefferson 132°). **The hand-fix did not remove
vertex-jaggedness — because the raw OSM geometry was not vertex-jagged to begin with.**
The curation fixed *topology and width interpretation*, not zigzag vertices. This is the
single most important correction to the campaign's mental model.

---

## 4. The gaps — what NO invariant catches

The 13 missed curated names cluster sharply, and the misses are diagnostic:

- **The LS "Places" — the loops & cul-de-sacs** (Albion, Vail, Kennett, Nicholson,
  Preston, Simpson, Whittemore): **completely uncaught.** These are short, single-chain,
  correct-width streets whose *defect is topological* — the loop median is an emergent
  enclosed face (`LOOP-STREETS §0`), the cul-de-sac needs a cap. **No geometric invariant
  on a single chain can see "this should have closed into a median" or "this needs a
  tangent cap."** This is the **#1 gap**: the detector needs **topology invariants** —
  *loop-closes* (does the ring close in the graph?) and *cul-de-sac-cap-tangent*
  (POLYGON-FIRST §5 names both; neither is built yet).
- **The weird junctions** (Carroll, Hickory St, Hickory Lane, Grattan): the defect is
  *junction-band fragmentation* / per-edge width steps that don't cross a clean same-name
  through-node, so width-step misses them and curb∥chain's corner-margin blinds it.
- **Stubs** (Rutger Lane, Dillon St): too short for the curb sampler (`MIN_RUN=22m`).

Named-but-unbuilt invariants from POLYGON-FIRST §5 that would close these gaps:
**loop-closes · cul-de-sac-cap-tangent · no-polygon-overlap (between tiles) · divided-median-sane.**
The single highest-leverage add is **loop-closure** — it alone would recover ~7 of the 13
misses (the Places).

**Conversely, the precision problem** (24 grid false-positives) is dominated by curb∥chain.
That invariant is doing what the litmus already warns: it proves the *weak* claim ("the curb
isn't a parallel offset") and cannot, by design, separate artifact-bulge from real-corner in
the junction zone. Until the curb is frozen (D6a/b) and the **Tier-2 identity test** becomes
writable, curb∥chain will keep flagging legitimate corners. **Don't trust curb∥chain as a
per-street verdict; trust width-step.**

---

## 5. Recommendations for the suite (POLYGON-FIRST §5, parts 1–4)

1. **Promote width-step** — it is the cleanest, cheapest, most defect-specific invariant.
   It directly indexes the datum-step family the morning brief targets
   (`HANDOFF-junction-datum-repair`). Make it the first CI gate.
2. **Build the topology invariants next** (loop-closes, cap-tangent) — they cover the
   biggest blind spot (the Places, ~7 streets) that *no current geometric check sees*.
3. **Reformulate or demote max-turn** — as a raw vertex-turn count it is corner-blind and
   render-blind. Either make it corner-aware (turn-density per metre on a run *between*
   nodes, excluding ±1 node-vertex) or replace it with a **render-stage ribbon-smoothness**
   check, since the West-18th class lives in the stroke, not the chain.
4. **Do NOT tune curb∥chain tighter to chase precision** — its noise is structural (the
   unfrozen curb). The right fix is upstream (freeze → Tier-2 identity), per §0 of
   POLYGON-FIRST. Treat its flags as "divided/perimeter candidates," cross-confirmed by
   iA-self-int, not as verdicts.
5. **Acceptance is not "flag exactly 31."** A correct suite flags each *defect class* with a
   class-specific invariant; recall climbs by *adding invariants for the missed classes*
   (topology), not by widening thresholds on the ones that fire. Per-name 58% with two
   genuinely-unbuilt invariant classes is an honest floor, not a ceiling.

---

## 6. Validation verdict (the acceptance test for the detector itself)

- **Recall 18/31 (58%)** — moderate. The miss is *concentrated in two classes* (loops/Places,
  weird-junctions) that need *topology* invariants this first pass doesn't have. That is the
  right kind of miss: it points at named, unbuilt checks, not at threshold tuning.
- **Precision 43%** — low, dominated by curb∥chain's structural noise on real corners. The
  cleaner invariants (width-step 2:1, self-int) are trustworthy; the broad one is not.
- **The `--raw` validation FALSIFIED a campaign premise**: the curated streets' raw OSM
  geometry is **not vertex-jagged**, so "flag the 35's raw form with max-turn" is not how
  the detector earns its keep. The labeled set is defined by *topology/width-interpretation*
  defects, which is where the next invariants must go.

Every flag in §2 is a **candidate for the operator**, surfaced cheaply and automatically —
which is the point of the suite. The operator's eye remains the gate; the detector's job is
to make sure the eye never has to *find* the candidate, only *judge* it.
