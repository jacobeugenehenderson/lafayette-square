# Lafayette Square — Backlog

The path from where we are (branch `cartograph-looks-pass-ab`) to where we're going (clean LS app deployed on the cartograph slab at `lafayette-square.com`).

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; check off completions during work; prune toward pristine. The cartograph trinity under `cartograph/` covers authoring; this is the consumer side.

Last updated: 2026-05-12 (BACKLOG reframed — Phase A/B/C structure replaces speculative L1/L2 sketch)

---

## Session-end pin (read first)

**The end state is one thing: LS app running stably on the cartograph slab at `lafayette-square.com`.** Mobile-stable, error-free, secure, beautiful, lightweight. Cartograph polish continues on its own track (`cartograph/BACKLOG.md`); we don't wait for it.

**The product doctrine** (see `feedback_beautiful_first_lightweight_51` memory): beautiful + stable are co-equal; stability wins forced tradeoffs 51/49; **never resolve a tradeoff by making the product look cheaper.** The fix to "we can't do both" is always to be more clever.

**Main is fully pre-slab.** Production today renders via `VectorStreets` + `StreetRibbons` (live) — no `public/baked/`, no `BakedGround.jsx`. The branch ships a complete rendering-architecture switchover, not an incremental migration. That's why this is a three-phase operation, not a flat punchlist.

**Three named operations** stand between here and merge-to-main:

### Phase A — Diagnostic
**Reason for the season.** Produce `ls/reference/RUNTIME-DELTA.md` (or equivalent): the canonical document of what changes when this branch lands on main. Three sub-catalogs:
1. **Architecture diffs** — old VectorStreets/StreetRibbons path vs. new slab path. Per-component what changed and why.
2. **What ships now that didn't** — authoring surfaces (`/cartograph.html`, `/arborist.html`, `/preview.html`, `src/cartograph/`, `src/arborist/`, `src/preview/`, `src/stage/`, `src/toy/`), the new cross-imports (`useCartographStore` reached from production runtime), bundle deltas, asset volume. Each item gets a verdict: keep / strip / gate / parametrize.
3. **What stops working or changes for users** — behavioral delta on the consumer surface (place cards, neon, click handling, mobile interactions). Do the nerves still smile?

**Phase A writes no code.** Pure read + reason + document. Cleverness pass happens in Phase B against Phase A's findings.

### Phase B — Plan
Author the two operations from cartograph's v1 punchlist:
- `project_ls_basemap_swap.md` — the marriage leap. How the rendering-architecture switchover actually ships.
- `project_pre_public_cleanout_security_audit.md` — excise authoring code/data from prod, sterilize bake, whitelist build. Probably splits into engineering + parametrize + security audit as three documents.

**Parametrize** the LS-as-place from LS-as-kit. Hardcoded `lookId="lafayette-square"`, hardcoded St. Louis lat/lon, hardcoded place names, identity flow assumptions, etc. The consumer-app shell becomes neighborhood-parametric so the kit can serve other instances. Cary's data layer is part of the per-instance config (property IDs, courier scope, Supabase project); Cary the system travels with the kit.

**Plan is surgical.** Each excise/parametrize move identifies the nerves it must reconnect before the next move starts.

### Phase C — Execute
When absolutely prepared and there will be no surprises. One excise, one parametrize at a time, each in its own commit, each with browser-eyeball verification (mobile + desktop) before the next. The marriage leap = the merge to main once everything passes.

---

## Concurrent / non-blocking

These don't gate the marriage leap; they progress on their own tracks.

| Item | Notes |
|---|---|
| **Cartograph evergreen** | Visual stack refinements (`cartograph/BACKLOG.md`) continue. Each bake produces a fresher slab; the deployed site picks up new slab data as you ship. |
| **Arborist roster swap** | Trees library upgrade post-stability. Hot-swappable into `public/baked/<look>/trees/` + `default.json`; no LS app code changes needed. |
| **Cary v1 status decision** | Ship behind placeholder vs. wire up Supabase live. Affects bundle weight + secrets. Resolution lands in Phase B's parametrize plan (Cary's data layer is the kit-instance boundary). |
| **`ls/FEATURES.md` end-user experience writeup** | Browse / Hero / Street / PlaceCard / Bulletin / residence / handles. Doc work, lags execution opportunistically. |
| **`ls/reference/SECURITY.md`** | Device-hash identity, admin passphrase, Supabase RLS posture. Lands as part of Phase B's security audit doc. |

---

## Doc work already done (this session)

| Item | Where |
|---|---|
| LS trinity scaffolded | `ls/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Cartograph trinity moved | `cartograph/{FEATURES,ARCHITECTURE,BACKLOG}.md` |
| Two-trinity index | Root `README.md` |
| Live-data inventory | `ls/ARCHITECTURE.md §2` + `ls/reference/INVENTORY-DATA.md` |
| Runtime composition map | `ls/ARCHITECTURE.md §1` |
| API reference (50+ GAS endpoints + Supabase + Worker + open-meteo) | `ls/reference/INVENTORY-API.md` |
| Slab boundary spec | `SLAB-CONTRACT.md` (root) |
| Rollback floor | Tag `v1-pre-cartograph-merge` on `origin/main @ 20866ef` |
| Spring cleaning | 400 MB facade-decor + 40 ribbons backups + ARCH.md archived |
| L1.1 BakedLamps swap | Shipped (production parity with Stage/Preview) |

---

## Mid-session contradictions (carry-overs)

Items the inventory + slab-contract walks flagged. None affect runtime; all should be resolved at next touch of the relevant trinity.

| ID | Item | Where | Owner |
|---|---|---|---|
| K.1 | `cartograph/FEATURES.md:259,275` + `cartograph/ARCHITECTURE.md:116,136` reference `src/components/StreetRibbons.jsx` which no longer exists | Cartograph trinity | Next cartograph session |
| K.2 | `CloudDome` is procedural — `public/clouds/{presets,almanac}.json` are published but have no runtime consumer. Either wire `CloudDome` to consume or remove the artifacts. | LS runtime + meteorologist | Phase A surfaces it; Phase B decides |
| K.3 | `PlanetariumOverlay` has `viewMode === 'planetarium'` infrastructure in `Scene.jsx` but the component isn't imported anywhere in production. Verify it's not dead infrastructure. | LS runtime | Phase A |
| K.4 | `SLAB-CONTRACT.md §3` claims ground lightmap UVs are bbox-derived; not verified in `BakedGround.jsx`. (Manifest has no `uvFormat` for ground, only buildings.) | Doc accuracy | Slab-contract update |
| K.5 | `SLAB-CONTRACT.md §4` calls `scene.json` `layerVis` "redundant" — not verified against `bake-ground.js`. If `layerVis` also drives Designer toggle visibility, it's not redundant. | Doc accuracy | Slab-contract update |

---

## Stale handoff docs (kept, with explicit retire conditions)

These have live references — they retire when their successor lands.

| Item | Retire when |
|---|---|
| `HANDOFF-clouds-day3-clouddome-v2.md` | `<Atmosphere />` ships and supersedes the shader tuning rubric (per `meteorologist/README.md`) |
| `HANDOFF-neon.md` | NeonBands lifts decision history into `ls/FEATURES.md §"Neon"`; refs in source comments rewritten |
| `HANDOFF-sky-and-light.md` | Sky/light pipeline gets lifted into both trinities |
| `cartograph/SHADOW_HANDOFF.md` | Cartograph BACKLOG item C.4 (Shadow post-pass) lands; doc is ingested into ARCHITECTURE |

---

## Pointers

- [`ls/FEATURES.md`](FEATURES.md) — product orientation
- [`ls/ARCHITECTURE.md`](ARCHITECTURE.md) — runtime composition + live-data inventory
- [`ls/reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md) — data catalog (partner-pasteable)
- [`ls/reference/INVENTORY-API.md`](reference/INVENTORY-API.md) — backend catalog (partner-pasteable)
- [`../SLAB-CONTRACT.md`](../SLAB-CONTRACT.md) — boundary spec between cartograph and LS
- [`../cartograph/BACKLOG.md`](../cartograph/BACKLOG.md) — authoring-side punchlist (the visual stack v1)
- Memory: `feedback_beautiful_first_lightweight_51` — product doctrine
- Memory: `feedback_orphan_audit_full_repo` — orphan-classification rule
