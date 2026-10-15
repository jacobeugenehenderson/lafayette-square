# Ward Browse / tilt / Tower Light — superseded passages, 2026-10-14

Retired by Meridian's build of BRIEF-ward-browse-noon-and-the-far-trees (tilt: the `overhead` regime, src/lib/cameraRegimes.js
and src/components/RegimeControls.jsx). Kept for the record; not current. Live homes are named with each passage.

## ROADMAP.md, the "Deferred … camera's transitions and ownership rules as per-town data" bullet

> ⭐ Includes Browse tilt / mild parallax (Jacob, 2026-10-04), which the redesigned overhead impostor makes affordable (`arborist/BACKLOG.md`).

Retired because Browse tilt landed (2026-10-14) as a kit regime, not as per-town data; the rest of that bullet stands. Live home:
`src/lib/cameraRegimes.js` (`overhead`), `cartograph/OPERATIONS.md` "Browse lean", the Ward README §3 "Tilt the map".

## arborist/ARCHITECTURE.md, the overhead-snapshot table's "selected by" cell

> | selected by | camera height (`useOverheadMode` → `viewMode === 'browse'`) | …

Retired as ROT: the code keys the overhead drawing off the SHOT (`useOverheadMode` reads `useTownShot()`), as the Ward README §11
rules ("the drawing is chosen by the shot, not by camera height"). Live home: the same cell, corrected.
