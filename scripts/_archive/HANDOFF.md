# Handoff: Street-Aligned Block Generation

## Goal

Generate accurate city block shapes ("positive shapes") by fixing our street data to match reality, then deriving blocks and sidewalks from corrected streets.

## Reference Screenshot

`Screenshot 2026-02-09 at 10.54.14 PM.png` in the project root — this is a debug overlay (`debug-map.html`) showing ALL our geometry layers (block lots, sidewalks, street centerlines, building footprints, neighborhood border) projected onto OpenStreetMap tiles. This is the ground truth. Open `http://localhost:5175/debug-map.html` to interact with it live (toggle layers, zoom, hover for IDs).

## Workflow

### 1. Fix street data against the reference map

Open the debug map and compare our yellow centerlines (`block_shapes.json → streets`) and red building footprints against the real OSM streets. Our source street data is `src/data/streets.json` (604 segments, 156 named). Key issues identified so far:

- We currently EXCLUDE alleys (`Mississippi Alley`, `Hickory Lane`, `Rutger Lane`) and service-type streets. **We need to incorporate ALL streets and alleys.** Alleys are real streets that form block boundaries in this neighborhood.
- Some street polylines are too short — they stop before reaching perpendicular streets. We currently paper over this with aggressive endpoint extension (100m for short streets). The correct fix is to align the source polylines with reality.
- The southern edge bleeds into the I-44 highway corridor. Need a neighborhood boundary clip.
- Street ROW widths come from `src/data/blocks_clean.json → street_widths` plus manual overrides in the script. These may need adjustment based on the map.

### 2. Run the street cleanup / block generation script

```bash
node scripts/generate-block-shapes.mjs
```

This script (rewritten this session using `clipper-lib`):
- Joins same-name segments into continuous polylines
- Buffers each polyline by half its ROW width
- Unions all buffered polygons
- Extracts the enclosed voids as block shapes (positive shapes)
- Filters out park overlaps and tiny artifacts
- Rounds corners via shrink-then-expand
- Computes sidewalk outer rings

Output: `src/data/block_shapes.json` with `border`, `streets[]`, and `blocks[]` (each block has `lot`, `sidewalk`, `centroid`, `area`).

### 3. Compare positive shapes against the screenshot

Refresh `debug-map.html` after regenerating. The blue block lots should align with real city blocks visible on the map. Buildings (red) should sit inside blocks, not on streets. Check:
- Every real block has a corresponding blue shape
- No blue shapes cover roads or highways
- Block edges align with actual curb lines / property boundaries

### 4. Confirm sidewalk placement

Each block has a `sidewalk` ring (orange dashed in debug map) that is the `lot` polygon expanded by 2m (`SIDEWALK_WIDTH`). Verify:
- Sidewalk rings sit between blocks and road surface
- No gaps or overlaps between adjacent block sidewalks
- Sidewalk width looks reasonable against the map scale

## Key Files

| File | Purpose |
|------|---------|
| `src/data/streets.json` | Raw street segments (source of truth to fix) |
| `src/data/blocks_clean.json` | Street ROW widths from parcel data |
| `scripts/generate-block-shapes.mjs` | Block generation script (clipper-lib based) |
| `src/data/block_shapes.json` | Generated output: border, streets, blocks |
| `src/components/VectorStreets.jsx` | 3D renderer — reads block_shapes.json |
| `debug-map.html` | Leaflet debug overlay for comparing geometry vs real map |
| `Screenshot 2026-02-09 at 10.54.14 PM.png` | Reference screenshot of current state |

## Current State

- `clipper-lib` installed as dev dependency
- `generate-block-shapes.mjs` fully rewritten with buffer/union approach — produces 42 blocks
- `VectorStreets.jsx` updated: reads cleaned polylines from `block_shapes.json.streets` for center lines, flat road-colored ground plane
- Debug map overlay working at `debug-map.html`
- Blocks are close but not accurate enough yet — streets and alleys need to be fixed against the real map first, then the script re-run

## Coordinate System

- Center: LAT=38.6160, LON=-90.2161 (Lafayette Park center)
- X = east (+), Z = south (+)
- `localToLatLng(x, z)`: lat = 38.616 - z/111000, lon = -90.2161 + x/86774
- Park group rotation: -9.2 deg around Y axis
