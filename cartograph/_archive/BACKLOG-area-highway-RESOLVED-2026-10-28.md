# BACKLOG text, resolved 2026-10-28: an area highway is a surface

Moved from `cartograph/BACKLOG.md`, verbatim, when `kerf/area-highway` made an area highway (area=yes or an OSM multipolygon) a
surface that leaves the street network (`src/cartograph/streetClass.js#isArea`, the skeleton's area drop, derive's path layer).
▶ `node checks/claims-an-area-highway-is-a-surface.mjs`

From the Altadena tranche paragraph:

> **ALTADENA'S TRANCHE BAKE REFUSED (2026-10-25, Kerf), a named stop:** "no class in the vocabulary (src/cartograph/streetClass.js) for
> highway=path area=yes" (an AREA highway is a plaza or surface, not a street: the same class as the isArea item below).

From the filed list:

> streetClass.js#isArea reads only area=yes (highway multipolygons chained as streets: JH 3, PTown 1, Huron 1).

Measured at the change, against integration's skeleton code on the same data: the chains that leave are hipointedemun
st-louis-walk-of-fame, dr-huston-smith-meditation-garden, chapman-plaza, south-terrace · huron the-deering-family-terrace-0/-1,
receiving-area-b · jacksonheights diversity-plaza-0..3 (one linear `diversity-plaza` remains) · altadena refused before, builds
now · lafayettesquare and provincetown: none. No authored skelId changes (claims-authored-skelids-keep-their-ways). HPDM's two
frame crossings (claims-a-nodeless-crossing-is-grade-separated, st-louis-walk-of-fame × delmar-boulevard-9) go 2 → 0.
