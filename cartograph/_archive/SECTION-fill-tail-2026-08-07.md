# SECTION §7 — the FILL open tail as it stood before 2026-08-07 (Diary)

> **Retired 2026-08-07.** `SECTION.md §7` was rewritten around the measured construction of
> `sectionPassTile` (the band is built whole off the frozen `iA`, then cut by per-run stencils; unclaimed
> band renders as land use). The material below is the **archaeology** that section carried — the
> 2026-06-12 → 2026-08-06 investigation of the same defect family, its attempted cures, and the counts
> quoted along the way.
>
> **Live home for all of it: `cartograph/SECTION.md §7`.** Nothing here is current. It is kept because it
> records *what was tried and why it was abandoned*, which is what stops the class being re-walked.

---

## 1. The ped-band junction construction / per-edge continuity item (filed 2026-06-12)

At junction-dense, asymmetric-width, name-shift-crossing streets (canonical exemplar: the **Dolman ↔ West
18th ↔ South 18th** transition; also Carroll, Kennett) the ped FILL fragments — broken sidewalks, slivers,
jagged corners. **Not a loop bug** (18th renders as coherent streets — `SPLINE-18TH-FINDINGS.md`); the same
family as the Albion cul-de-sac notch (`SECTION-CAP-CLAMP-FORENSIC.md`).

**Three compounding mechanisms** (renders: `scratch/w18-{mid,lcorner,rcorner}.png`):

1. **Per-edge width-STEPS** — the sidewalk jogs where genuinely-varying surveyed widths change between fes
   (Dolman L 7.29 / R 4.67, `widthSource:"survey"`); the `SKELETON §5g` "author the frontage, fan across
   through-nodes" rule applies, but many boundaries here are *real* corners/name-shifts rather than
   through-nodes, so the steps are partly legitimate data, partly under-fanned.
2. **Treelawn-Y/N ordering FLIPS** — the mono-width strip swap inverts curb→treelawn→sidewalk vs
   curb→sidewalk→treelawn between adjacent fes, reading as breaks.
3. **Junction band FRAGMENTATION** — independently-stroked ped bands from the legs / dead-end bulbs /
   name-shift segments overlap into slivers and gaps because there is no constructed junction
   ped-silhouette (the asphalt junction *is* constructed at prebake — E3.2 / `SKELETON §5e` — the ped bands
   are not). G12 band-neck is the thin-tile face of this.

**Resolution recorded 2026-06-12 (Jacob): it is POLYGON-FIRST, not a FILL build.** The forensic
(`scratch/w18-*.mjs` — the attribution overlay + neck/mechanism harnesses) showed the throat slivers are a
*local junction-throat neck on a clean silhouette* (`iA` has **0 self-intersections**; the face pinches
below band-depth right at the throat). The deeper root is that the junction is never constructed as ONE
polygon. The benefit of polygon-first is one SSoT polygon per junction from which asphalt, curb, treelawn
AND sidewalk all derive (the cross-section lives on the road — `OSM2STREETS-GROUNDING §1.2`), so a
*separate* ped silhouette is the wrong move: a fourth thing reconstructing the junction is the disagreement
we are deleting.

Reframed 2026-06-13 (Jacob) as **upstream — the SHAPE campaign**: the skeleton produces correct geometry
off which the ped derives. A `thinTile`→`cap` band-neck clamp was built and **reverted** 2026-06-12 (it
cleaned a treelawn overlap, never touched the discontinuity; the silhouette was already clean).

Live home at the time: `BACKLOG §NOW` — drive `# curated` → 0 via skeleton interpretation; first brief
`HANDOFF-curve-primitive-skeleton.md` (West-18th corners). The 2026-06-12 "intersection-everywhere /
polygon-first junction construction" framing and its brief were archived as the wrong task
(`_archive/handoffs/…-SUPERSEDED-2026-06-13.md`); the data question closed at `INTAKE §5.1`.

---

## 2. Dead-end mouth-collapse — the sub-case (2026-06-22, `DEAD-END-MOUTH-FORENSIC.md`)

The Kennett / Albion / Whittemore butt-caps are the dead-end member of the family. `extractFaces` walks a
dead-end as a **zero-width spur**, so the face's mouth vertex collapses and the FILL (vertex-keyed
`cornerT`) wraps only one of the two real mouth corners. Confirmed FILL-rooted-in-the-face-identity (smooth
in Survey; `iA` already carries both mouth fillets).

**LANDED FILL-side, eye-confirmed 2026-06-22 (`opts.deadEndMouthWrap`)** — not a face reshape (those moved
`iA` and blew up multi-spur tiles). The lever: **snap** the two spur run-ends to the two fillet apexes (two
`cornerT` keys), **trim** the through-road's sector back to free the corner wedge, and **synthesize the
through-leg** so the `§6.1` Idea-A deep-leg slide fires. Bounded per-mouth disc (asymmetric-center) → `iA`
byte-identical on all 101 tiles, multi-spur safe; Benton/loops + `kennett`/`park-avenue` customs untouched.

Rollout extension `42ec46e7`: the 2 genuine single-fillet mouths (south-13th / henrietta) wrap; strip-swap
cap rebuilt (reported one-side-only).

**Lesson recorded at the time:** every proxy lied (two false "LANDED" reports); the eye was the only gate.

---

## 3. The DEFAULT-FILL front (2026-06-22, `scratch/CORNER-MARKERS-2026-06-22.md`)

The operator circled 23 dysfunctional corners; the diagnosis confirmed **the curb (`iA`) is clean
everywhere — not junction construction** (Kennett and the complex intersections are fine; the
`SKELETON §5b`/`§5e` spike era is over). The dysfunction was attributed to the **default TL/SW⟷SW
arrangement** not reflecting reality, via weak per-side survey provenance in `gleanTreelawn` (14
`sidewalk-1side` + 4 `assessor` streets mis-glean).

**That mechanism did not survive measurement.** Re-measured 2026-08-06: 209 two-sided streets, **50 flip
L/R (24%)**, and all 50 are `anchor:'inner-edge'` divided carriageways or corridor spines, where the
inboard ped zone is zeroed **by design** (`RIBBONS §2`). Zero ordinary streets mis-glean. Either `302de36b`
closed it or the original 35% always counted the divided roads.

Step 1 (`302de36b`, per-street glean — inferred side inherits the measured Y/N, 6 flips) read as "did
nothing" on the operator's eye. The ~20 valley cases (0.25–0.75 m) were surfaced but not applied.

∴ **this front had no surviving mechanism** when it was retired here.

---

## 4. Counts quoted by the section and not reproducible

- **"~100 sliver/median/loop thorns"** (the G12 capacity-guard sizing) — carried in prose with no command
  attached; the population it describes has never been re-derived. The G12 *subclasses* are real and are
  named in `SECTION-CAP-CLAMP-FORENSIC.md`; the number is not evidence.
- **"35% of two-sided streets flip L/R Y/N"** — superseded by the 24%-and-all-divided measurement in §3
  above.
- **`n=951 / 391 / 508 / ~50`** (the treelawn-glean distribution) — measured against a `survey.json`
  denominator that cannot be reconstructed. The live figure, over the shipped `ribbons.json` (418 street
  sides), is **269 N · 127 Y · 22 valley**, and lives in `SECTION.md §3.1`.
