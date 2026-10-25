# POLYGON-FIRST §1 — the slit probes on the frozen face artifact (RETIRED 2026-10-25)

Moved from `cartograph/POLYGON-FIRST.md` §1 (after the gate table) when caps-from-shape deleted derive.js's D2 face freeze:
`ribbons.tiles[]`, the artifact these probes walk, is no longer written, so they have nothing to read. The scripts stay in
`scratch/` as the record of the method. Checks 1–2 of the gate have no live instrument until one is written on ①'s shape
(`shape.json` tiles and their cap records).

Verbatim, as it stood:

> ⭐ **THE PROBES RUN ON TRUNK (ported 2026-07-30, Boz).** `coupler-fold-legs.mjs` (the shared helper) +
> `coupler-slit-universal.mjs` · `coupler-slit-anatomy.mjs` · `coupler-fe-coverage.mjs` derive every dead-end
> fold from the **frozen face artifact alone** — `ribbons.tiles[].{ring, edges{skelId,side}, caps{vertexIdx}}`
> — walking run spans by INTEGER RING INDEX, never by position (position collapses at a zero-width spur).
> No Slice-1 fields, no src change. Just `node scratch/coupler-slit-universal.mjs`.
>
> ⛔ **The BRANCH originals (`polygon-asks-stamp`) still read `run.foldBranch` / `run.walkOrd` /
> `buildFoldWalkIndex`, and copying THOSE to trunk does not fail — it lies** (`coupler-slit-anatomy` prints
> nothing; `coupler-slit-universal` prints `0 slits`, which reads as *"no defect"*). The ported versions
> replaced them; don't re-copy from the branch.
