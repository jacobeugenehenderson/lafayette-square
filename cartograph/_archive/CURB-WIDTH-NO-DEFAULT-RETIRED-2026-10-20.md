# The curb width had no default — RETIRED 2026-10-20

**Why retired.** Jacob, 2026-10-20: *"we should just make them like curbs… 6 inches everywhere."* Every town's Look was set
to 0.1524 (9123c743), and Boz reversed the "no default at all" half of the 2026-10-19 ruling (acf5fb70, ruling (b)): a town
that authors no `curbWidth` now inherits the kit's, declared once at `src/cartograph/streetProfiles.js#KIT_CURB_WIDTH`
and resolved by `resolveCurbWidth` at the design-read layer (the bake's `lookDesign.mjs`, the store, the probe feed).
The half that stands is that no code substitutes: a builder called with no width still refuses.
▶ `node checks/claims-a-look-authors-its-curb-width.mjs`

## The superseded passages

**`cartograph/OPERATIONS.md` § the Designer's knobs, "Curb":**

- **Curb** — global width, its own material. ⛔ **`curbWidth` is required: author it at onboarding** with the town's other fields (metres, in the town's home Look; Survey › Streets › Curb, or `design.json`). It has **no default**: a curb is a fact about a town (LS 0.381, PTown 0.1524), so the kit seeds none. A town without one shows *not authored* and **refuses by name** in the pour, the ground bake, the zone tester and Survey: *"author curbWidth in this town's Look"*. ▶ `node checks/claims-a-look-authors-its-curb-width.mjs`

**`checks/claims-a-look-authors-its-curb-width.mjs`, its claim (row 1 was "every Look authors a finite curbWidth, or is
named as refusing"):** `curbWidth` is a fact about a town (LS 0.381, PTown 0.1524), authored in the town's home Look. No kit
value is neutral, so NOTHING substitutes one. A town whose Look carries none REFUSES by name ("author curbWidth in this
town's Look") in the producer, the bake, the zone tester and the editor; the editor shows the absence as absence. Before
the ruling, eight sites quietly substituted 6 in (CURB_WIDTH or the literal 0.1524), so Jackson Heights poured, baked and
drew at a curb nobody authored.

**`src/cartograph/Panel.jsx`, Survey › Curb:** "AUTHORED per Look, no default: a Look that carries none shows 'not
authored' and the ground refuses to build until one is set" · the row's "⛔ not authored — drag to set one".

**`scratch/_proto-feed.mjs`:** "⛔ NO DEFAULT. The curb width is AUTHORED (Jacob, 2026-09-06) … A scene with no authored
curb width is a real state; it must be reported, not filled in." The feed now reads the bake's resolved width, so no probe
measures a curb the bake does not draw.
