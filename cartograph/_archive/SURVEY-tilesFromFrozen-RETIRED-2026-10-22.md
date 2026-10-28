# SURVEY §5.1's D2 tile-freeze correction — RETIRED 2026-10-22

**Why retired:** BRIEF-the-disc-is-one-source §2a (Boz's ruling (a), 2026-10-21/22). `ribbons.tiles[]`, derive.js's D2 face
freeze and its early boundary crop (`clipStreet` → `extractFaces` → `ribbonsLayer.tiles`) are DELETED. Its last reader was
the Measure tool's dead-end cap handles, which now read the frozen shape's cap records (`capEnd` + the ① tip, stamped at
the mint). `tilesFromFrozen` itself had already gone with the legacy shape pass (2026-10-20), so the passage below
described a function and a consumer that no longer existed: ROT.

**Live home now:** `src/cartograph/BlockGeometryV2Debug.jsx#v2Caps` (cap handles from shape.json's `tiles[].caps`),
`src/lib/tileGround.js` (the mint's `across`/`cap` marks; the run emitter's cap records).

## The text that left SURVEY.md §5.1, verbatim

> ⚠️ **PARTLY SUPERSEDED — corrected 2026-08-02. The D2 tile freeze shipped; this section predates it.**
> **Verified on trunk:** `ribbons.json` **does** carry `tiles[]` — **101** frozen block faces for LS, **694**
> for Altadena — and `tilesFromFrozen` (`tileGround.js:774`) is the **live** consumer at `:2197`:
> `tiles = smooth > 0 ? null : tilesFromFrozen(ribbons?.tiles, streets)`. Since `STREET_SMOOTH` is pinned
> **0**, the default path reads the **frozen** faces; it does **not** re-walk the chains.
> ⛔ **So do not read the paragraph below as "there is no block polygon in the artifact" and go build one —
> that is rebuilding shipped infrastructure.** What remains true is the *narrower* claim: the **silhouette**
> (stroke + fillet + corner identity) is still constructed per-build from chain-derived measures, and the
> wall still sits at `sectionPass` rather than P2. The topology is frozen; the **shape** is not.

## Excised from SURVEY §3, 2026-10-28 (the code was made to keep §4 and §7)

> 4. **`sectionOpen`** turns the tiles into the layers Survey draws. **H** (the grade-separated highways) is swept from its
>    own sections. The tiles are `protoShapeTiles` — exactly what freezes into `shape.json` on Survey-exit.

It was true of the code: Survey drew ③'s curb band (`tg.curb`, struck by `sectionOpen` and cut at every curb ramp) and its
fill. It contradicted the doctrine (§4 "NOT Survey: … ADA pads", §7 "no pedestrian depth"), and the code was fixed to the
doctrine (Survey draws ②'s `iA` curb line; Jacob, 2026-10-28, LS: the blue line showed the ramp cuts).

