# HANDOFF — Section tool: forensic census + doctrine alignment

**State:** dispatch-ready. **Agent: FRESH** (read-only forensic specialist — like Vesalius/Plumb; parallel to Groma's `skeleton.js` work, different files, no collision). **Domain:** cartograph Section/Measure authoring + render surface.
**Drafted:** 2026-06-03 (Boz). **Mode:** READ-ONLY. No code edits, no canon edits — the only write is the output doc.

---

## Purpose

Section is the second lagging geometry tool (the FILL tool; ≈ today's "Measure" refit onto the frozen Survey shape). Before we build it, map it — the validated "evidence before excision" playbook (Vesalius's render-path census, Plumb's chain-consumer census, the LS forensic inventory all paid off). Output is the **Section build backlog**: what current Measure is, where it violates the wall, where it drifts, and which of the visible defects are Section's job vs Survey's.

**Deliverable: `cartograph/SECTION-CENSUS.md`** (the RENDER-PATH-CENSUS.md precedent — a State/forensic doc). Plus a final-message exec summary (counts: wall-violations, drift sites, defect SHAPE/FILL split, the ordered gap list).

---

## Read first (the rubric — the doctrine target; do not re-derive it)

1. `cartograph/ARCHITECTURE.md §2.1` — the **3-S taxonomy** (canon): **Survey = SHAPE**, **Section = FILL**, **Stage = LOOK**.
2. `PIPELINE.md §Wall` + memory `[[project_two_bakes_two_walls]]` — **the wall (option B, deep):** Section reads **ONLY frozen artifacts**, never the live chain. Every reach-back to chains is a violation.
3. `RIBBONS.md` (the FILL construction) — the mono-width ribbon, the 2-strip / 16-field model, **corner = band bent (a band-slice), never a constructed fillet** (§3.9a), ADA pads, caps. This is what Section *authors into*.
4. memory `[[project_ribbon_three_representations]]` — a ribbon has **three representations that drift** (authoring handles / live preview `buildChainBandsLive` / committed bake `emitBlockRingBands`). Success = **WYSIWYG**. Drift is a defect class to inventory.
5. Prior design thinking — `HANDOFF-survey-section-tool-design.md` (the design spine) + `HANDOFF-tile-T3-authoring.md`. **Consolidate against these, don't duplicate** (the per-touch gate: history first).

### The target (pre-filled — the rubric the census measures against)
**Section = FILL.** Reads the **frozen Survey hardscape** (the curb edge / asphalt silhouette). Strokes **ped ribbons INWARD** from that frozen edge. Authors: **ped widths** (treelawn / sidewalk), **ribbon corner FILLS**, **ADA pads**, **caps**. Freezes → the **ground bake** (wall #2 feeds Stage). 
**Boundary that resolves the defects:** corner **SHAPE** = Survey (frozen input — NOT Section's job); corner **FILL** = Section. Every defect must be attributed to one side of this line.

---

## Tasks (the census)

**1. Current-Measure inventory.** The panel(s) and overlays (`MeasurePanel` / `MeasureOverlay` / the Survey|Measure|Design pill → the Measure surface), the handles (`pavementHW` / `treelawnOuter` / `propertyLine` — RIBBONS §"Up to 3 handles per side"), what each authors, where the data lands (`design.blockCustoms` via `feCustomKey`, `design.json`), the live-preview path (`buildChainBandsLive`), the bake path (`emitBlockRingBands`). One clean map of the tool as it exists.

**2. Wall-compliance audit — THE key question.** Where does Measure/Section **read the live chain** (`ribbons.streets[].points`, `centerlineData.measure`, any `rb?.measure` fallback) or any non-frozen source? List every reach-back as a wall violation, with file:line. This is the option-B deep-wall audit — the thing that decides whether Section *can* be made chain-incapable. (Watch for `[[feedback_scene_blind_fixture_latent_fault]]` — single-scene imports feeding scene-keyed renders.)

**3. Three-representations drift.** For the authoring handles vs `buildChainBandsLive` vs the bake emitter: where do they diverge? (Sibling-leg monowidth, corner zones, ADA, caps — `[[feedback_live_drag_preview_migrates_with_main_emitter]]`.) List each divergence; WYSIWYG is the bar.

**4. Defect catalogue + SHAPE/FILL attribution (the prize).** Catalogue the visible defects (broken corners / pads / caps — the recent images). For EACH, attribute: **SHAPE** (Survey's job — frozen input, out of Section's scope) or **FILL** (Section's job). Flag any whose attribution **depends on what Survey freezes** as `TBD-with-Survey` (the input-contract seam). Do not "fix" anything — classify.

**5. Gap list = the Section build backlog.** Synthesize 1–4 into an ordered list: what Section must gain/lose/fix to become the doctrine-target FILL tool. This is the brief-after-this.

---

## The one open seam (scope guard)

Section's **input** is the frozen Survey artifact, and that schema is **still settling** (the divided-pair station-overlap fix is part of getting Survey to 0). **Do not over-specify the frozen contract.** Characterize everything stable now (current Measure, wall-gaps, drift, defect attribution); treat the precise frozen-artifact schema as the **single flagged TBD input**. If a finding hinges entirely on the unsettled schema, mark it `TBD-with-Survey` and move on — don't block.

---

## Write / commit boundaries

- **READ-ONLY.** No code edits, no canon-doc edits.
- **Single write:** create `cartograph/SECTION-CENSUS.md`.
- **Name yourself** (one word). Commit only that doc (the working tree has parallel in-flight edits — `git add` only your file). Commit message ends with the `Co-Authored-By:` trailer.
- Final message = the exec summary (the counts + the ordered gap list).

---

## On landing (Boz)

- Backlog one-liner + the gap list becomes the **Section build docket**.
- The doctrine-target rubric (above) graduates to canon when Section *builds* (OPERATIONS = the Section panel/knobs; RIBBONS = the FILL construction) — per the per-touch gate, not before (keeps canon from churning while the tool is still settling).
- Retire this HANDOFF to NOTES once the census lands.
