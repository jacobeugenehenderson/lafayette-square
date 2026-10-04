# Tree-cost forensic: verdict (Grain, 2026-10-04)

Brief: `docs/briefs/BRIEF-tree-cost-forensic.md`. Measure only; no fix.
Reproduce any row: `node scratch/tree-cost/probe.mjs --town=<town> --shot=<browse|hero|street> --mode=<desktop|phone-hi>`
(`--tris-only` skips the timing). Raw runs are in `runs/*.json`.

**Instrument:** headless Chrome on this M1, driving the running :5173 Preview. The tier is confirmed live per run (`tier:` line).
GPU ms come from `frameCost.js#gpuWindow`: fresh frames, a 2.5 s window, bracketed rest/off/rest, and the rest-to-rest spread is the
noise. Components are classified off geometry, never off names: overhead = `aOverhead` + flat · hero = `aOverhead` + vertical ·
mesh = `aBark` · lamps = `town:lamps`. Each toggle is checked to have hidden its meshes ("still shown after: 0"). Every ms figure is
**this desktop's GPU**. Phone-hi is the M1 at a 242×525 buffer, **not a phone**.

## Table (resident; desktop unless noted)

| Town · shot · surface | Draws (meshes) | Tris | Frame | Trees off Δ | Lamps off Δ | Trees+lamps off Δ: full px → ¼ px |
|---|---|---|---|---|---|---|
| LS · Browse · desktop | overhead 27 (16,173 inst = 5,391 × 3 bands) | 25.36M (1,568/inst) | 386 draws · 30.57M · 90 ms | **−39.5** | −4.5 | −43.3 → −44.6 |
| LS · Browse · phone-hi | same | 25.36M | 296 draws · 44 ms | **−29.0** | −6.7 | −36.3 → −36.6 |
| LS · Hero · desktop | hero 162 (16,173 inst) | 0.78M (8 / 128 per inst) | 322 draws · 8.52M · 125 ms | −20.3 | ≈0 (±2.4) | −36.5 → −24.0 (±6) |
| LS · Street · desktop | hero 162 | 0.78M | 428 draws · 5.99M · 123 ms | −21.3 | −8.5 | −37.2 → −38.6 |
| Huron · Browse · desktop | overhead 24 (55,278 inst) | 86.68M | 314 draws · 115.99M · 254 ms | **−93.4** | −40.4 | −129 → −145 |
| Huron · Hero · desktop | hero 144 (55,278 inst) | 2.65M | 226 draws · 46.22M · 185 ms | −15.4 | **−53.4** | −66 → −75 |
| Huron · Street · desktop | hero 144 | 2.65M | 540 draws · 31.95M · 147 ms | −14.8 (±9) | −41.8 | −57 → −69 |

**Arrival versus resident:** in every Browse run no mesh tree ever drew. The overhead quads appear with their textures already
resident at t+3–9 s, and nothing tree-shaped draws before that. **No mesh-tree geometry (`aBark`) is mounted at all** on LS or Huron
in any shot. Hero and Street draw every tree as a hero card. The brief's lead ("mesh until the discs arrive") is refuted. The code
already said so: mesh hides on `overheadAssets` *existing*, which happens before any texture decodes.

**Pixel scaling:** a quarter of the pixels leaves the trees' ms unchanged on every cleanly measured row ⇒ **geometry, not fill**,
at these buffer sizes. Fill at a real phone's ~1170×2530 is **unmeasured**.

## Overhead grid sweep (in-page rebuild of `buildOverheadBandDisc`'s quad; no URL override exists)

| Grid | Overhead tris (LS) | LS desktop | LS phone-hi | Huron desktop |
|---|---|---|---|---|
| 28 (today) | 25.36M | 89.7 ms | 43.5 | 255 |
| 16 | 8.28M | 66.0 | 27.0 | 212 |
| 8 | 2.07M | 57.5 | 18.5 | 167 |
| 4 | 0.52M | 54.0 | 14.2 | 176 |
| 1 (flat) | 0.03M | 52.8 | 15.6 | 188 |

Huron's readings below 8 lie within its rest drift (244–275 ms); read 8 and below as the floor.

## Verdict per shot

- **Browse: verdict 2, heavy cards, on the OVERHEAD quads, not the hero stack.** Each band is a 28×28 tessellated quad
  (`impostorGeometry.js#buildOverheadBandDisc`, `grid ?? 28`; the tessellation exists only for vertex flutter), × 3 bands = 4,704
  tris per tree. Not wrong representation, not overdraw, not arrival. It scales with tree count: Provincetown's 37,043 trees ⇒
  ≈174M tris (arithmetic, not run). Remedy, one line: flat bands with fragment-stage flutter.
  - For the redesign: the punch-out core saves *pixels*, which did not measure as the bottleneck here. The win is the flattening; the
    core is for the look and for parallax.
- **Hero / Street: cause not established.** The hero cards cost 15–21 ms, but neither triangles nor pixels predict it: Huron has
  3.4× LS's card tris and costs less. What would establish it: separate per-draw cost (144–162 draws) from vertex-shader cost, with
  a GPU frame capture or an in-page merge of species into fewer draws.

## Found that the brief did not expect

1. **The lamps.** 4,304 tris each, drawn again in the shadow pass(es): ×2 in Browse, ×3 in Hero. On Huron Hero the lamps (−53 ms)
   cost more than the trees. This also accounts for Plumb's unexplained 2.5M gap (the lamps' shadow pass). Not trees; outside scope.
2. **A cold Preview load into Street crashed the canvas** (ShotFlight with no `streetAt`). Fixed by Lens in `fd3cf5a5`.
3. **Headless probes leaked their Chromes** (`chrome.kill` alone doesn't kill the browser); kill by profile path. Plumb adopted it in
   `5dfb1d12`. My first ms readings were contaminated by this; every number above was re-taken on a clean GPU.

## Wind-sheet API (agreed with Gale, pending Jacob's ruling)

`windAt(xz)` (field read, one sampler, both stages: once per tree in the vertex shader for hula and lean) · `windDetail(xz)`
(analytic, in Gale's module, no sampler, per fragment at the band's UV-mapped world XZ for the ~1.8 m flutter) · consumer-side floors
stay as multipliers · Grove/Salon set a named specimen extent; unset throws. Samplers on the cards: 4/16 used. Gale will measure
`windDetail`'s per-fragment cost at phone-hi and at a full ~1170×2530 buffer.
