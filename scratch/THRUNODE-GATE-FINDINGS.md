# Through-node ribbon break at T-junctions — root cause (forensic, 2026-07-16)

**Read-only forensic. Scene = lafayette-square.** The long-tabled T-intersection artifact
(the through-street's sidewalk band breaking where a side street T's in) — root cause found,
matched pair confirmed as ONE mechanism, cure + detector-retune predicate below.

## The defect (operator-confirmed, by eye)
At a T where a side street meets a straight through-street, the through-street's **continuous
sidewalk/treelawn band BREAKS at the junction station** — green treelawn punches to the curb, a
pale sliver appears where the band should run straight past. **Invisible in Survey** (the curb
silhouette `iA` is clean — this is why it "doesn't show in Survey") → it is a FILL/ribbon-interior
*manifestation* of an upstream *un-constructed junction polygon*, NOT a curb-silhouette defect and
NOT a FILL bug (the FILL band-neck patch for this class was tried and reverted — see `THROAT-JUNCTION-FINDINGS.md`).

## The matched pair — ONE mechanism
- **Kennett Place × S 18th** `(386.5,149.0)` — the **clean archetype**. Through-street
  `south-18th-street-3 | right`, split by the mouth into `segOrd=4` (tile9) and `segOrd=6` (tile10).
  deg-3, E3-constructed = **false**, kink 0.085, uniform width both sides (`pavementHW 5.49 / tl 0.9 / sw 1.52`).
- **McKay/Mackay × Hickory** `(29.3,-434.9)` — the **messier sibling**: Hickory itself splits into
  two skelIds (`hickory-street-0` / `-1`) at the meeting, so the same-skelId premise breaks twice.
- **Same class, whole S-18th cluster**: Rutger×S18th `(453.6,-197)`, Mississippi-Alley×S18th
  `(440.4,-148)`, Carroll×S18th `(394.5,99)` — all deg-3, all E3=false, all sub-0.3 kink, all flagged.
  *(The OTHER dysfunctions in the S18th/Dolman cluster — the 18th↔Dolman name-transition, divided
  corners — are DIFFERENT defects; not this one.)*

## The mechanism (root → symptom)
1. **ROOT — `src/lib/tileGround.js:2461`:** the through-node window/apron construction is gated
   `if (dw < 0.02 && kink < 0.3) continue` — "straight + uniform width → nothing to construct."
2. A genuine deg-3 T **always** interrupts the through-frontage: the side-street mouth splits it
   across **two block faces (two tiles)**, regardless of kink or width. So the gate's premise is
   **false for a T** — the mouth *is* the thing to construct around.
3. These nodes are also not E3-constructed (their `junctionMap` record has empty
   `continuity`/`deTaper`/`apron`), so the `jmNodeKeys` apron-skip at `:2415-2417,:2433` doesn't
   cover them either. **Neither an apron nor a THRU window is built.**
4. **SYMPTOM — `sectionPassTile` `:926`, `isThrough` `:1016`:** the ped-continuity guard is
   **tile-local** (`endSkelCount` over one tile's runs, `:1007-1015`). Neither tile sees both ends
   of the through-run, so `isThrough` returns false in both; each unbridged end falls to the ADA
   corner-ramp bid (`:1115-1125`) + `tangentTrim` (`:1107-1114`); the treelawn is replaced by the
   all-SW corner slice → the visible break. **Patching here = the reverted FILL-band-neck class.**

Classification: fundamentally **(d)** the covering through-node polygon is not constructed, which
then presents as **(c)** an uncovered wedge + **(a)** two independently-cornered halves.

## The cure (smallest upstream change — NOT a FILL patch)
At `:2461`, **stop gating window/apron construction on `dw`/`kink` for genuine deg-3 through-nodes
that are not E3-constructed** — always build the through-node polygon + its run-split station
(sized to span the side-street mouth), so the constructed junction (a) supplies asphalt/ped
coverage bridging the mouth notch (the concentric ped offsets run continuously past it) and (b)
records a split-station marking the through-frontage ends as through-continuations (no corner bid,
no `tangentTrim`). Equivalently: route these deg-3 straight T's into the E3.2 apron path so
`jmNodeKeys` covers them like 4-ways. **Risk to write into the brief:** must NOT over-construct the
4-ways/aproned nodes that already work; changes the SHAPE producer → eye-gate on Kennett + Mackay +
a re-bake before trusting.

## Detector retune (make it an eye-proxy — flag ~4–8, not 64)
The detector currently sums *any* ≥2 sub-8m² throat slivers → **64 junctions**, far more than the
~3–4 that read to the eye, because sliver-count also fires on 4-way corner notches + divided-road
overruns. This through-node-break subclass has a sharp, separable predicate (all inputs already
present):

> **deg-3 node** ∧ **exactly one street passes through** (has an interior vertex at the node) ∧
> that through-street's same `skelId|side` frontage **splits across ≥2 tiles** ∧ the node is
> **NOT E3-constructed** (empty `continuity`/`deTaper`/`apron`) ∧ **no THRU window built**
> (through-kink < 0.3 ∧ width-step dw < 0.02).

Flag on THAT predicate, not raw sliver count → isolates exactly the fall-through set (Kennett,
Rutger, Mississippi-Alley, Carroll on S18th; the Mackay×Hickory pair; Hickory×Ohio) and drops the
corner-notch/median noise. **When the window is built (the cure), the flag clears** — same
predicate is the RED-until-true gate.

## VERDICT
{McKay×Hickory, Kennett×S18th} is **ONE mechanism**. The `:2461` gate declares a straight,
uniform-width deg-3 T "nothing to construct"; the mouth splits the through-frontage across two
tiles; the tile-local `isThrough` corner-trims each half → the band fragments. **Smallest fix:**
always build the through-node polygon for genuine deg-3 through-nodes not E3-constructed (drop the
`dw`/`kink` gate for that case). Couples to the curb-freeze (A2): the constructed junction must be
frozen in prebake so it isn't re-stroked from chains every bake (Check C).

*(Supersedes the "it's the G12 band-fold thorn" label for this specific artifact — that was wrong;
this is the un-constructed through-node, a sibling of `HANDOFF-junction-construction.md`.)*
