# HANDOFF — A1: the through-node construction gate fix (the tabled T-artifact)

**Agent: FRESH.** This is a self-contained SHAPE-construction fix with a written root cause — no
warm context needed beyond the findings doc. Name yourself (one word, joins the trail).

**Route first (CLAUDE.md gate):** `ORIENTATION.md` → `README.md §⭐ START HERE` (the **Corners /
thorns** row) → then the reads below. Do not re-derive the mechanism — it is already forensically
pinned; your job is the fix + the detector retune, gated on Jacob's eye.

---

## The one-line task
A straight, uniform-width deg-3 **T-junction** on a through-street gets **no covering polygon**, so
the through-street's sidewalk/treelawn band **fragments** where the side street T's in (the visible
"green punches to the curb + pale sliver"). **Build the through-node polygon unconditionally for
genuine deg-3 through-nodes that are not E3-constructed.** Then retune the detector to flag that
subclass (the ~4–8 that read to the eye), not the 64 it fires today.

## Read these, to the section (the pointer is Boz's job, not yours to go find)
1. **`scratch/THRUNODE-GATE-FINDINGS.md`** — the full root cause + matched pair + cure + the detector
   predicate. This is your primary spec. **Read it first.**
2. **`RIBBONS.md §1`** — the derivation chain + the corner invariants (corner = band bent, jtMiter,
   never a constructed primitive). The through-node polygon you build must honor these.
3. **`cartograph/POLYGON-FIRST.md §3` (D6a) + `WALL.md §0`** — WHY this is a producer-side construction
   (the curb/junction is stroked live; the freeze is A2, a *later* ticket — you are NOT freezing here,
   you are constructing correctly on the live producer, exactly the sequence POLYGON-FIRST §3 prescribes:
   "D6a ships alone and visible" before the freeze).
4. **`HANDOFF-junction-construction.md`** — the sibling arc (the junction organ). The E3.2 apron +
   `[THRU]` window machinery you're extending lives here conceptually.
5. **Code loci** (verify line numbers — `tileGround.js` drifts): `src/lib/tileGround.js:2461` (the gate
   — ROOT), `:2405-2534` (the `[THRU]` window construction), `:2415-2417,:2433` (the `jmNodeKeys`
   apron-skip), `:926` `sectionPassTile` / `:1016` `isThrough` (the tile-local guard — the SYMPTOM
   site; **do NOT patch here**, that's the reverted FILL-band-neck class), `derive.js` junctionMap
   (the E3-constructed flags: `continuity`/`deTaper`/`apron`).

## The fix (SHAPE producer — `tileGround.js`)
At `:2461`, the window/apron is skipped by `if (dw < 0.02 && kink < 0.3) continue`. That premise is
**false for a genuine T**: a deg-3 through-node's side-street mouth *always* splits the through-frontage
across two block faces, regardless of width-step or kink. So:

- For a node that is **deg-3, has exactly one through-street** (a street with an interior vertex at the
  node — the others terminate), and is **NOT already E3-constructed** (empty `continuity`/`deTaper`/`apron`
  in its junctionMap record) — **always build the through-node window + its run-split station**, sized to
  span the side-street mouth, independent of `dw`/`kink`.
- The window must (a) supply asphalt/ped coverage bridging the mouth notch so the concentric ped offsets
  run continuously past it, and (b) record the split-station so the through-frontage ends are marked
  **through-continuations** (no ADA-corner bid, no `tangentTrim`) — which is what makes the tile-local
  `isThrough` fire within a tile at `:1016`.
- Equivalently (implementer's call — pick the smaller diff): route these deg-3 straight T's into the
  **E3.2 apron path** so `jmNodeKeys` covers them like 4-ways.

⛔ **Blast-radius guards (write a check for each before trusting the eye):**
- Do **NOT** over-construct nodes that already work — E3-constructed nodes and 4-ways must be byte-identical
  before/after (they already build a window/apron; your condition excludes them).
- Do **NOT** touch `sectionPassTile`/`isThrough` construction — the fix is the *covering polygon* upstream,
  not the FILL stroke.
- The Mackay×Hickory sibling has the through-street split into two skelIds (`hickory-street-0/-1`) — confirm
  your through-street detection handles the two-skelId case (interior-vertex test, not same-skelId).

## The detector retune (`scratch/correctness-detector.mjs`)
Add/retune a flag on the **through-node-break predicate** (all inputs already present in the harness):

> deg-3 ∧ exactly one through-street ∧ that through-street's same `skelId|side` frontage splits across
> ≥2 tiles ∧ NOT E3-constructed ∧ no THRU window (kink < 0.3 ∧ dw < 0.02).

Report it at the **junction level**, separate from the raw sliver count. Pre-fix it should isolate the
fall-through set (Kennett×S18th, Rutger, Mississippi-Alley, Carroll on S18th; Mackay×Hickory; Hickory×Ohio).
**Post-fix it must go to 0** at those nodes (the window is now built) — that is your RED-until-true gate.
Leave the raw junction-band sliver count as-is (it measures the *other* subclasses).

## The eye-gate (the real DoD — Jacob's eye, not the proxy)
The detector is NOT the verdict (it over-fires 64 vs the ~3–4 that read). Render/inspect these nodes
after the fix and confirm the through sidewalk band runs **continuous** past the mouth:
- **Kennett Place × S 18th** `(386.5, 149.0)` — the clean archetype.
- **Mackay/McKay × Hickory** `(29.3, -434.9)` — the messier sibling.
- Spot-check the S-18th cluster (Rutger, Mississippi-Alley, Carroll) and a **clean 4-way** (no regression).

⚠️ **Rebuild-gated.** Seeing this on Jacob's lit app needs a re-bake of the LS shape/ground, and there
are **uncommitted baked artifacts in the tree** — **do NOT bake without Jacob's go** (a bake clobbers
them). Prove the geometry in the Designer 2D FILL view first (which re-strokes live), then coordinate the
bake with Jacob for the Stage eye-gate.

## Commit bounds
- **Yours to touch:** `src/lib/tileGround.js` (the gate/construction), `scratch/correctness-detector.mjs`
  (the retune), and any new probe/proof harness in `scratch/` (name it, don't leave `_probe_*` litter).
- **Off-limits (Boz owns):** all canon docs (`WALL`/`POLYGON-FIRST`/`RIBBONS`/`SKELETON`/`README`/`BACKLOG`).
  Report your landing back to Boz; the doc accord is Boz's to route.
- **Do NOT** commit any `public/baked/**` re-bake without Jacob's explicit go.

## Surface scope drift (the derivation-first gate)
The forensic already ran the derivation-first probe and confirmed this is genuinely un-constructed (not a
width-datum or classification issue that dissolves upstream). **But** if while implementing you find a node
in your target set whose break actually dissolves to a datum/classification fix rather than the missing
window — **STOP and flag Boz.** That gate was right twice this month; honor it.

## Definition of done
1. `tileGround.js` builds the through-node polygon for genuine deg-3 through-nodes not E3-constructed;
   E3/4-way nodes byte-identical.
2. The detector's through-node predicate → 0 at Kennett/Mackay/the S18th cluster; raw junction-band
   unchanged for the other subclasses.
3. **Jacob's eye** confirms the through band runs continuous at Kennett + Mackay, no 4-way regression.
4. Landing reported to Boz (commit refs + eye-gate result) for the doc accord + the A2 freeze sequencing.

*Drafted 2026-07-16 (Boz + Jacob night-shift standup). Root cause: `scratch/THRUNODE-GATE-FINDINGS.md`.
This is macro FRONT A1 (`BACKLOG.md`). A2 (freeze the constructed junction → close the centerline leak)
follows once this proves out on Jacob's eye — the POLYGON-FIRST §3 sequence.*
