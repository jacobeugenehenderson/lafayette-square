# SLAB-CONTRACT — superseded text, excised 2026-09-25

> Retired for CURRENCY. Live contract: `SLAB-CONTRACT.md` (§5 lamps now v2 with `groundRaw` + `terrain`; §3.3 context channels).

### 6.4. Consumer status — RESOLVED (L1.3, 2026-05-26)

**Hybrid shipped.** `src/components/SlabBuildings.jsx` is the single buildings consumer for **Preview and production**: it draws the merged mesh (matching the live `Building`/`Foundations` material exactly) and resolves per-building identity against the §6.3 index. `SceneNeon` sources neon geometry/anchors from the index when it's published (production + Preview), falling back to live `src/data/buildings` where it isn't (Stage authoring). `src/preview/BakedBuildings.jsx` is **deleted**. **Stage keeps its live `LafayetteScene` mount** (authoring needs live retint via `paletteOverride`/`materialPhysicsOverride`), so the `import` of `src/data/buildings` remains in the shared `LafayetteScene`/`SceneNeon` files for that path + the content layer — production no longer *renders* live building geometry, which is the render-path gate. (L1.3 shipped 2026-05-26; brief landed → `_archive/handoffs/`.)



- ~~**L1.1** Production `Scene.jsx` mounts `BakedLamps` (consumes §5) instead of live `StreetLights`.~~ **SHIPPED** — production mounts `BakedLamps`.


- ~~**L1.3** Buildings strategy — hybrid (slab mesh + per-building index sidecar; version 2).~~ **SHIPPED** (2026-05-26, render-scoped) — `SlabBuildings` consumes the merged mesh + §6.3 index in Preview *and* production; `SceneNeon` + selection resolve identity against the slab; `BakedBuildings` deleted. The render path no longer renders live building geometry. Remaining (separate future brief, NOT L1.3): relocating the *content* DB (name/address/architect…) off `src/data/buildings` — the content importers (`SidePanel`, `GlassSearch`, `useListings`, `CheckinPage`, `PlaceCard`) intentionally still read it as source.


## 5. `lamps.json` — lamp point cloud

```jsonc
{
  "version": 1,
  "look": "lafayette-square",
  "count": 80,
  "lamps": [
    { "x": -76.5, "z": 144.3, "park": true },
    { "x": 61.0, "z": -79.4, "park": true },
    …
  ]
}
```

| Field | Meaning |
|---|---|
| `count` | Length of `lamps` array. |
| `lamps[].x`, `lamps[].z` | World-meters position. Y is computed at runtime from terrain. |
| `lamps[].park` | Bool: park-style lamp (vs street-style). Drives lamp model + glow params. |

Consumer: `src/components/BakedLamps.jsx` — Stage, Preview, *and* production (L1.1 shipped; production `Scene.jsx` mounts `<BakedLamps />`, mobile via `DeferredStreetLights`). The live `StreetLights` component is now toy-only.



Last verified: 2026-05-26 (L1.3 shipped — `buildings.json` → **version 2** render-scoped index; §0/§1/§6/§11 updated; `SlabBuildings` is the Preview+production consumer; `BakedBuildings` deleted). Prior full pass: 2026-05-12 against `cartograph-looks-pass-ab @ b39834b`. Cross-refs: [`cartograph/ARCHITECTURE.md`](cartograph/ARCHITECTURE.md) (producer architecture), [`ls/ARCHITECTURE.md`](ls/ARCHITECTURE.md) §2 (consumer architecture), [`ls/reference/INVENTORY-DATA.md`](ls/reference/INVENTORY-DATA.md) §A (consumer mount status).
