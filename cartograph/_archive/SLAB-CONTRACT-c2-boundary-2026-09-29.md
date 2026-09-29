# SLAB-CONTRACT §6.3 — the C2 boundary paragraph, retired 2026-09-29

Diary. Superseded when the street address moved into the slab's per-building index (Jacob, 2026-09-29; live text: SLAB-CONTRACT.md §6.3). Retired for currency, not truth.

**C2 boundary (why the index is render-scoped, not a full per-building record):** `buildings.json` (source) does two jobs — a *geometry/render* record (footprint, materials, zoning, anchors), which belongs in the slab, and a *content* record (name, address, architect, historic_status…), which is LS app content. The slab doctrine ("production trusts the slab, never reaches into source") is about the **3D render** trusting baked geometry/optics; it never required dissolving the content DB into the bake. So the render path resolves `raycast → id` against the slab, and the content layer resolves `id → record` via `buildingMap` / `useListings`. Relocating the content DB off `src/data/buildings` is a *separate future brief*, not part of L1.3.
