# Dispatch brief — THE SURVEY VIEW (skeleton + curb wireframe, distinct from Section)

**For a COLD agent.** Self-contained. This is a **render/view** change only — it does NOT touch the construction (`tileGround`), the authoring tools, the Wall, or the derive fix. Pick a name; sign commits.

## 0. The idea (and why it matters)

Today the Survey tool shows the **same full-painted map as Section**, just with different handles. Survey should **look different** — it's the tool for the **skeleton and the hardscape polygons/curbs**, so it should *show* exactly that and suppress the ped/LU fill (which is Section's domain). Beyond aesthetics, this is a **diagnostic instrument**: with only centerlines + IXs + curb outlines visible, you can see at a glance whether a problem is in the **skeleton** (chains/IXs) or the **ribbons** (fill) — the "is this chains again?" first-diagnostic, made visible. (The micro-segment-at-IX defect just chased would have been obvious in this view.)

## 1. In Survey mode (`tool === 'surveyor'`), SHOW

1. **The aerial map** — keep it (it's the visual-alignment reference). Reuse the existing `AerialBase` / `AerialFocus` (the two-layer loader). No change.
2. **The centerlines** — render the **SAME centerline** Section uses (`MapLayers.jsx:443` `centerlineLines`), for **visual continuity** between the two tools. Reuse it; do **not** create a separate Survey centerline.
3. **A distilled volume of IXs** — the intersection nodes as markers. Source: the **`intersections`** in the ribbons artifact (`CartographApp.jsx:589` "post-bake intersections + faces"; `BlockGeometryV2Debug` "reads centerlines + intersections"). "Distilled" = one clean marker per real junction (the canonical IX set), not every chain vertex. (Confirm the exact field/shape in the artifact.)
4. **The polygon outlines = the curbs** — the curb-line ring as **OUTLINES, not filled**. Source = the **live tile path**'s curb/asphalt-inner ring (`buildTileGround` output / `shapeTiles` `iA` / the curb ring) — **not** the dead figure-ground `curbBands`/`blockRounded` (that path is superseded; use the tile output the live render already consumes).
5. **Corner controls** — `CornerEditHandles` (already Survey-gated). Keep.
6. **Keep the translucency scheme** already in use (`surveyEditing` edit-state translucency, `BlockGeometryV2Debug`). Don't rip it out — preserve the focus/emphasis behavior, adapted to the wireframe elements (selected emphasized, context dimmed, aerial showing through). Jacob's eye tunes.
7. **A blue color story overall** — centerlines, curb outlines, IX markers, corner controls in a coherent **blue** palette, so Survey reads as visually **distinct from Section**. (Pick the blues; Jacob's eye tunes.)

## 2. In Survey mode, HIDE

- **All the interior customs / ribbon fill:** treelawn, sidewalk, the filled corners/ADA pads, and the **land-use fill**. These are the painted band/LU meshes in `BlockGeometryV2Debug` (`treelawn`/`sidewalk`/`curb`-fill/`asphalt`-fill/`luByClass`/`tileLuMats`, gated today by `layerVis`). **Suppress them when `tool === 'surveyor'`.** That detail is Section's concern, not Survey's.
- (The curb appears in Survey only as an **outline**, per §1.4 — not the filled curb band.)

## 3. Where it plugs in

- **Tool gate:** `tool === 'surveyor'` (store `s.tool`; the pill is `Panel.jsx` `ToolPill`).
- **Render mount:** `CartographApp.jsx` (where `BlockGeometryV2Debug`, `MapLayers`, `AerialBase`/`AerialFocus`, `SurveyorOverlay`, `CornerEditHandles` mount).
- **Suppress fill:** gate the band/LU meshes in `BlockGeometryV2Debug`'s render by tool (Survey → off). Add the curb-outline + IX-marker render (Survey → on).
- **Reuse:** `MapLayers` `centerlineLines` (centerlines), `AerialBase`/`AerialFocus` (aerial), `CornerEditHandles` (corners), the `surveyEditing` translucency.

## 4. ⚠️ Coordination

This touches `BlockGeometryV2Debug`'s **render conditionals** — the same file the Section work lives in. **Sequence after the Section construction settles, or coordinate**, so two agents aren't editing its render JSX at once. (The *construction* — `sectionPass` etc. — is separate from this *view* gating, but they share the file.) Use the **live tile path**, never the dead figure-ground emitter.

## 5. Definition of done (Jacob's eye)

- **Survey** = blue wireframe: aerial + centerlines (same as Section) + IX markers + curb **outlines** + corner controls + the translucency-focus. **No** treelawn/sidewalk/LU fill.
- **Section** view **unchanged** (full paint).
- The two tools' centerlines are visibly continuous (same geometry).
- Skeleton-vs-ribbon problems are now visually separable in Survey.

## 6. Non-scope

- Don't change the construction (`tileGround`/`sectionPass`), the authoring/handles' behavior, the bake, Section's view, or the Wall. **View/render only.**
- Don't revive the figure-ground emitter; read the live tile outputs.

*Provenance: Boz, 2026-06-02, from Jacob's Survey-view spec. The banked "Survey should look different from Section" item, now specified. Cold-start self-contained.*
