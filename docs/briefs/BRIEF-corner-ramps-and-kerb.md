# BRIEF — corners carry ramps and crosswalks, and the kerb is raised

**You are the dispatched agent. Name yourself** — one word, yours, not one a RUNNING session holds
(`ListAgents`, then `/rename`). **Agent: FRESH** — the corner canon is long and hard-won and must be read
whole, with no assumptions carried in from another window.

**Instruction: confirm-then-build.** Read the canon and code below, tell Boz what you found (**report to the session `lafayette-square-nosync-d5`, NOT "Boz the Elder"** — two coordinator seats are running; the Elder runs a separate work group), and if the
code contradicts this brief — **stop and flag**. ⭐ This brief touches SECTION's ruled corner; the stop is
cheaper than a fifth reverted corner pass (`_archive/RIBBONS-history-2026-06-12.md §7`).

---

## 0. What this is — three rulings (Jacob, 2026-10-05)

Real corners have things ours do not: where the kerb actually DROPS (one diagonal ramp, a perpendicular
pair, or none), detectable-warning tiles at each ramp, crosswalks that meet the ramps across the street,
and a kerb with height. NYC records curb cuts (`CURB_CUT`, 2022 planimetrics), which made the gap
visible — but this is **kit-general**: every town gets it, evidence or no evidence.

1. ✅ **A ramp is a POSITION on the corner's arc; the pad is unchanged.** The ADA pad (SECTION §4, "the
   RAMP") stays exactly what it is — concrete from tangent to tangent, reaching the kerb. A corner now
   also carries a short list of **ramps**: where along its arc, how wide, whether it has a warning strip.
   A ramp marks where the kerb drops and where the warning tiles go. ⛔ It is a SLICE of the same band,
   never a constructed primitive (RIBBONS §1, invariant 1; SECTION §4 "the corner constructs nothing").
2. ✅ **Crosswalks live on the same arc** — a crosswalk runs from a ramp to the matching ramp across the
   street. Same object family, same corner record.
3. ✅ **The kerb is RAISED** — real height, dropping to zero at each ramp. ⚠️ Today the ground is one flat
   plane; nothing in `bake-ground.js` or `BakedGround.jsx` knows kerb height (grep, 2026-10-05). This is
   the largest part of the brief and is kit-wide.

### ⭐ THE LAYER, NAMED FIRST (`CLAUDE.md` route step 4)
- **Ramps, warning strips, crosswalks = FILL (Section).** They are slices and materials of the band
  stroked inward off the frozen curb; they never move the curb. A change that moves `iA` is out of bounds.
- **The raised kerb = a BAKE attribute of the curb strip, not a SHAPE change.** WHERE the kerb is stays
  SHAPE (① → ②, Survey, frozen in `shape.json`); this brief gives that frozen strip HEIGHT at the ground
  bake. ⛔ If raising it appears to need the curb re-drawn, that is a SHAPE question — stop and flag.

### Where each corner's ramps come from — the same layering as everything else
1. **Evidence where it exists:** a city curb-cut layer (NYC `CURB_CUT`, acquired by
   `BRIEF-nyc-adapter.md`), or OSM `kerb=lowered` / `highway=crossing` nodes (`ROADMAP A09` — those tags
   are currently DROPPED at ingest; fixing that is in scope if you need them).
2. **Otherwise a rule:** the town's or state's norm (NYC: a perpendicular pair per corner; an older
   town: one diagonal at the apex). ⛔ The norm is AUTHORED per town/state with a neutral default —
   never a constant that happens to be right for the first town (`CLAUDE.md` Layer 0, Class D).
3. **The operator overrides any corner** — a Section gesture (ramp style / positions).
Every ramp carries its source, exactly like widths (`ROADMAP A23`).

## 0a. ✅ RULED after the pre-build report (Jacob, 2026-10-05) — these override §3's sequence where they differ

1. **The ramp override lives on each LEG's existing slot** — `blockCustoms[skelId][side][segOrd]`, e.g.
   `ramps: { start, end }` ("a ramp at my corner end"). Identity rides `iaStamp`; nothing is recovered.
   When the two legs disagree, **authored wins**, the same precedence the frontage resolution uses.
   No new authoring channel, no corner-keyed table, ⛔ never the per-ring arc ordinal.
2. **+ 3. Stamp ①'s JUNCTION identity onto each corner at freeze.** It answers both flags with carried
   identity: a corner at a junction (degree ≥ 3) gets ramps and crosswalks; a mid-block BEND keeps its
   pad and gets no ramp; crosswalks pair by same junction + same crossing road. ⛔ Not the owner-change
   test, not a ray-and-snap (proximity recovery, A15). ⚠️ It changes the frozen artifact ⇒ it lands with
   the **next scheduled re-pour** of the towns, coordinated with Boz (another work group re-pours).
   **First, read-only:** measure per town how many eased corners are bends, and post it.
   ✅ **Measured (Flare, 2026-10-05, from `public/baked/<town>/shape.json`):** bends are LS 9.2% · HPDM
   13.1% · huron 10.9% · provincetown 27.9% of arcs — and the count MOVES with the road key (raw skelId
   vs ordinal-stripped), which is why owner labels cannot decide it. ⭐ **The junction id must be stamped
   from ① itself, independent of the owner stamp (`iaStamp`)** — arcs with a null-stamped flank (LS 122,
   huron 338, provincetown 146; cause not established) are otherwise unclassifiable.
   ⛔ This lifts §7's "no change to ①/② construction" bound **for this stamp only** — the shape itself
   does not move; `a03-curb-identity` / `claims-repour-changes-nothing` must show geometry unchanged.
4. **The raised kerb lifts the WHOLE BLOCK inboard of the kerb face** (curb, walk, lawn, land use) by an
   authored height with a neutral default; asphalt stays at 0; a riser along `iA`; each ramp is the walk
   sloping h → 0. Buildings, trees and lamps ride the lifted ground. ⛔ Not a lip strip, not a
   riser-only look ("it's only seen from far" is not an available argument). **Measure this option's
   cost first** (flatten, coplanar check, AO, anchors, phone-lo frame time) and stop with the numbers.
5. **Default ramp style = NONE, loudly.** No ramp markers without evidence or an authored town/state
   norm, and every pour prints *"N corners have no ramp source"*. The pad is unchanged regardless.
6. **Rot found, to fix in the same landing as the code it describes:** `SECTION §6.1`'s "TL↔TL is GRASS
   AT THE KERB through the whole arc" (contradicts §4) and the painter comment near "THE CORNER — READ,
   NOT MEASURED" ("AND the owner changes" / "a mid-block BEND is NOT a corner") — both against the code.

7. ✅ **LS's norm (Jacob, 2026-10-05): the 45° DIAGONAL corner, ramp 1.5 m, warning strip 0.6 m.** (Briefly
   ruled perpendicular the same evening, then revised.) Written to `cartograph/data/lafayette-square/norms.json`.
8. ⭐ **Each CORNER's style is its own (Jacob: "our system will need to be able to tell the difference between
   45 degree corners and perpendicular sets").** A town's norm is only the default. Per corner: **evidence** —
   curb-cut positions along the arc (NYC `CURB_CUT`; OSM `kerb=lowered` where mapped): one cut at the arc's
   middle ⇒ diagonal · two near its ends ⇒ perpendicular · none ⇒ no ramp · anything else ⇒ `unreadable`,
   counted, never guessed → else the **town norm** → **override** on top. The census reports each rung
   separately. ⛔ Binding a cut to a corner is by containment in the arc's own span, never nearest-arc.
9. ❓ **Crosswalks at a diagonal corner — proposed, awaiting Jacob:** *a crosswalk always runs square across the
   street it crosses*; at a perpendicular corner it ends at that leg's ramp, at a diagonal corner it ends where
   the square crosswalk meets the kerb and the apex ramp lands inside it. (Literal ramp-to-ramp at diagonal
   corners crosses the intersection box diagonally — Flare, landing 2.) Do not build until ruled.

**Order:** landing 1 = ramps by evidence/norm as 2D material on junction corners (needs the stamp ⇒
with the re-pour) · landing 2 = crosswalks (same stamp) · landing 3 = the kerb, after its measurement.

## 1. Read first — whole, not sampled

- `cartograph/SECTION.md` **§4 entire** (RAMP vs SLOPE, "the legs decide the corner", the TL↔TL blunt end)
  and **§6** (the corner construction + the "how to change the corners" guide).
- `cartograph/RIBBONS.md` **§1** (the invariants; "the corner is where ① TURNS").
- `cartograph/_archive/RIBBONS-history-2026-06-12.md` **§6.9** (AASHTO/ADA corner doctrine) and **§7**
  (every corner attempt and why it was reverted).
- `ROADMAP` **A7** (corners declined 17–63% by town — a ramp needs a corner that exists) and **A09**.
- `cartograph/ARCHITECTURE.md §8` (the single-plane ground; `flattenPaintStack`; coplanar groups).

## 2. Code sites

| what | where |
|---|---|
| the FILL construction, per tile | `src/lib/tileGround.js#sectionPassTile` |
| the ramp/slope edges | `tileGround.js` — grep `walkFromD`, `walkToD`, `rampLen` (read `rampLen` as the SLOPE's run) |
| corner arcs and their stamp | `tileGround.js` — grep `iaCorner`, `filletRing`, `cornerFillets` |
| the curb width | `tileGround.js#edgeDepth` (`curbWidth` is authored per Look) |
| the flattened ground plane | `cartograph/bake-ground.js#flattenPaintStack`; renderer `src/components/BakedGround.jsx` |
| ground conformance (anchors sit on the drawn ground) | `cartograph/ARCHITECTURE.md §8 "Ground conformance"` |

## 3. Sequence — three landings, each eye-gated

1. **Ramps on the arc, 2D.** The corner record gains its ramp list; Section paints the warning strips and
   marks the drop positions as material. Default = the rule; evidence overrides where present; operator
   overrides last. **Check:** every recorded curb cut (where a town has them) lands on an arc ramp of the
   right corner — per town, mutation-tested.
2. **Crosswalks.** Ramp-to-ramp striping across the street, on the asphalt. **Check:** every crosswalk
   ends at a ramp on both sides.
3. **The raised kerb.** The kerb strip gets height, dropping to zero across each ramp. ⚠️ Before
   building, **measure and report**: what the single-plane ground assumes, what height does to
   `flattenPaintStack`, the coplanar-overlap check, ground-AO, the lamp/tree anchors, and frame cost on
   phone-lo. ⛔ A kerb height is AUTHORED per town (a Look or town value) with a neutral default.
   **Stop after the measurement and bring Boz the cost before building it.**

## 4. The chain

- **Trusts:** ① and ②'s corner — a ramp needs a built corner arc; where A7 says a corner was declined,
  a ramp has nowhere to sit (report those, do not invent arcs). The frozen `shape.json` stamp (`iaCorner`).
- **Trusted by:** the bake (ground geometry), anchors, AO, and Preview's cost numbers.

## 5. Can the instrument see the change?

Section paints LIVE off the frozen shape (SECTION §4: the FILL is frozen nowhere) — a 2D ramp change is
visible on reload with no re-freeze. The raised kerb is a BAKE change: it shows only after a ground bake,
in Stage/Preview, never in the Designer. Name the surface on every eye-gate, and the scene.

## 6. Validation surface

Section in the Designer (2D), then Stage/Preview (the kerb). ⛔ No parallel renderer. First eye-gate on
**Lafayette Square** (the most authored town) and one other; Jackson Heights once poured.

## 7. Bounds

- Writes: `src/lib/tileGround.js` (Section corner), `cartograph/bake-ground.js` (kerb), checks under
  `checks/`. ⛔ No change to ①/② shape construction.
- ⛔ **Another work group is active (Boz the Elder).** Saves to `src/lib/` and `cartograph/` are bake
  inputs — confirm with Boz that no bake is running before each landing. Commit through explicit paths
  only (`BOZ §3.7`).
- Registers: `FEATURES` (the capability), `OPERATIONS` (ramp style, kerb height knobs). Name them in the
  commit.

## 8. Done when

Every corner shows its ramps and crosswalks by rule, evidence or override, each with its source; the
kerb stands up and drops at each ramp; the checks are mutation-tested; Jacob's eye in Section and Stage,
scene recorded.
