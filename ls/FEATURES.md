# Lafayette Square — Features & Roles

The consumer product orientation doc. What the LS app *is*, who uses it, and the load-bearing product decisions.

> Part of the **LS trinity** (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. Stale claims are worse than no claims. The cartograph authoring toolkit has its own parallel trinity under `cartograph/` — see root `README.md` for the index.

For *runtime composition, mount tree, data flow* see `ARCHITECTURE.md` in this directory. For *dev setup* see the root `README.md`. For the *slab handoff contract* (what cartograph publishes that LS consumes) see `cartograph/FEATURES.md §"Architecture in one paragraph"`.

---

## What LS is, in one paragraph

Lafayette Square (`lafayette-square.com`) is the **public-facing 3D neighborhood app** that builds on top of cartograph's slab. It's the consumer product: visitors browse the neighborhood overhead and at street level; residents claim their building and post to a lobby; business owners (guardians) claim their listing and edit hours / photos / menus; couriers (Cary) operate a request-and-dispatch courier system; townies check in. Cartograph + Stage are the *authoring* environments that produce the substrate the LS app runs on; the LS app and its product surfaces (place cards, bulletin, residence, guardians, Cary, check-ins, handles) live downstream.

The split is intentional and load-bearing: **cartograph is fortified, slow, careful authoring; LS is fast, trusting, end-user-facing runtime.** Authoring artifacts are pristine and immutable; LS consumes them and never edits them. This is the publish-loop pattern, applied from the consumer side. See `cartograph/ARCHITECTURE.md §1` for the publisher side of the same boundary.

---

## Audience roles

| Role | Who | Surfaces |
|---|---|---|
| **End user / visitor** | Anyone with the URL | Public neighborhood viewer, place cards, BrowseHeader, info modals |
| **Townie** | Local with the QR check-in card | Check-in flow, status progression |
| **Resident** | Someone who claims a residence | Lobby posts, resident counts, claim flow |
| **Guardian** | Business owner who claims a listing | Place card editor, hours, photos, menus, QR studio |
| **Courier** | Cary participant (not yet live) | Onboarding, dashboard, request/session flow |
| **Admin** | Operator with passphrase | `?admin` prompt, admin-only edits across all listings |
| **Slab operator** | The authoring half — cartograph + Stage + Arborist | (Not part of the LS surface; see cartograph trinity) |

---

## The end-user experience

[TO BE FILLED — describe Browse / Hero / Street modes, PlaceCard interactions, Bulletin, Cary, check-in flow, residence claim, handles & avatars, neon for open businesses. Each as a short paragraph.]

### Browse mode
[TO BE FILLED]

### Hero mode
[TO BE FILLED]

### Street mode
[TO BE FILLED]

### Place cards
[TO BE FILLED]

### Bulletin
[TO BE FILLED]

### Residence + Lobby
[TO BE FILLED]

### Guardian / business listing edits
[TO BE FILLED]

### Cary (courier system)
[TO BE FILLED — current status: behind "coming soon" placeholders per PUBLISH.md §5. Not yet live but architected.]

### Check-in (townie QR)
[TO BE FILLED]

### Handles + avatars
[TO BE FILLED]

---

## The slab contract from the LS side

What LS trusts cartograph to publish, and what LS does *not* re-author:

[TO BE FILLED by Live-data inventory pass — but the canonical reading is:]
- **Trusts as immutable:** `public/baked/<look>/ground.{json,bin}` + `ground.lightmap.png`, `public/baked/<look>/buildings.{json,bin}`, `public/baked/<look>/lamps.json`, `public/baked/<look>/scene.json`, `public/baked/default.json` (arborist tree placements + GLB variants), `public/clouds/{presets,almanac}.json`.
- **Live data still consumed at runtime (intentional or to-be-baked):** [enumerated in `ls/ARCHITECTURE.md` Live-data inventory]
- **Live data still consumed at runtime (load-bearing, won't ever bake):** GAS listings/events/reviews, Supabase Cary sessions, handles, residence claims, guardian state. These are dynamic by definition.

---

## Product / runtime decisions worth knowing

[TO BE FILLED as decisions emerge from inventory + composition pass. Candidates from the walk:]
- **Per-building neon stays live, not slab.** `LafayetteScene` reads `_allBuildings` and `src/data/buildings` directly for per-building neon + click handlers + place state. The merged building bake exists for performance proof in Preview but doesn't replace the live mount.
- **Mobile-first staging.** `LafayetteScene` mobile-detects and staggers heavy content (labels, markers) across seconds to avoid GPU upload crashes.
- **Time-of-day is live, not baked.** `useTimeOfDay` + `useSkyState` + `CelestialBodies` + `CloudDome` compute sun/moon/sky continuously. The slab carries no time-of-day data.
- **Authoring routes ship to production today.** `/cartograph`, `/arborist`, `/stage`, `/preview` bundle into the prod build. Stripping them is a v1 BACKLOG item — they expose authoring surfaces to end users and bloat first-paint (cartograph chunk is 4.5MB minified / 1.1MB gzipped).

---

## Mobile stability + performance posture

The bake pipeline exists because mobile first-paint is the optimization target. Everything LS does at runtime must be measured against:

- First contentful paint on cellular
- GPU memory budget (shaders + textures + geometry)
- Frame stability under scroll / interaction
- Bundle size (current top offenders: cartograph 4.5MB, main 1.2MB, vendor 738KB, index 966KB — see prod build output)

Preview's GPU profiler is the canonical proving ground (see `cartograph/FEATURES.md §"Preview"`). Any LS-runtime change that touches the mount tree should be re-checked in Preview's phone-aspect frame before merge.

---

## Pointers

- `ls/ARCHITECTURE.md` — runtime composition, mount tree, live-data inventory, backend touchpoints
- `ls/BACKLOG.md` — current LS punchlist (slab migrations, route strips, perf gates)
- `cartograph/FEATURES.md` — authoring-side product orientation
- `cartograph/ARCHITECTURE.md` — publisher / slab side of the boundary
- `PUBLISH.md` — deployment procedures (Pages, GAS, Worker, DNS, Supabase)
- `README.md` — dev setup + trinity index
