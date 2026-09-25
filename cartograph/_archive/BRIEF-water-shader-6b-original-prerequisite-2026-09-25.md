# BRIEF-water-shader §6b — the original prerequisite, retired 2026-09-25

It was marked *"(superseded — retained for provenance)"* in the live brief, which is the
anti-pattern CLAUDE.md names: a correction sitting next to the false sentence it corrects. The
superseding text is §6c–§6e in the brief. Kept here, dated, for provenance.

## 6b. (superseded — retained for provenance) THE ORIGINAL PREREQUISITE

`derive.js`'s `OSM_TO_LU` has **no entry for `natural:water`** — 157 features across four towns.
⇒ **There is no LU class for a water material to attach to**, the way grass attaches to
`park`/`residential`/`recreation`. ▶ `BRIEF-lu-vocabulary.md` is that work and it explicitly asks
whether water needs an LU class or is correctly drawn by another path. ⛔ **Establish which before
you wire anything** — if water is drawn by its own path today, attaching to LU would be a second
producer, and this project already has too many.

