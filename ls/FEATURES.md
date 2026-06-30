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

> Filled from the 2026-06-02 forensic inventory (`scratch/ls-forensic-inventory.md`, §§1–6). Voice here is user-facing; the build details live in `ARCHITECTURE.md`, the operator's side in `OPERATIONS.md`.

A visitor lands on a cinematic shot of the neighborhood, then drops into an overhead view they can explore. Every building is clickable — the ones a business or resident has claimed open into rich place cards; the rest open into auto-generated cards drawn from the building's own architectural record, so *nothing in the neighborhood is a dead pixel*. Open businesses glow with neon. Locals who've checked in become "townies" and earn the right to review places and post to the neighborhood bulletin board; people who claim their home become residents with a private building lobby; business owners ("guardians") claim and curate their listing. The sky overhead is the real St. Louis sky at the real time of day, with live weather. It's a neighborhood you can read, not just look at.

### Browse mode
The everyday view: the camera floats overhead, framed on the neighborhood, and the visitor pans and explores. The framing (where it sits, which way north points) is authored in Cartograph's Stage and travels through the bake — the operator composes the establishing overhead and production replays it exactly. From here, the side panel opens the directory (every place, grouped by category), search, and the community masthead (live townie / resident / guardian / courier counts). Tapping a place or a search result flies the camera to it and opens its card.

### Hero mode
The landing shot — the first framing every visitor sees. A slow cinematic camera *bounce*: the camera sweeps a Catmull-Rom path out-and-back through the operator-authored keyframes, holding its gaze on the neighborhood's designated hero subject (the Gateway Arch) the whole time. The path's keyframes, per-keyframe FOV, the bounce period/easing, and the subject are all authored in Cartograph's Stage (Hero shot) and travel through the bake in `scene.json` (`heroKeyframes` / `heroMotion` / `heroSubject`); production replays them through `Scene.jsx`'s CameraRig and the shared `src/preview/heroAnim.js` motion model — identical to what the operator previewed in Stage.

### Street view & the night sky
**Double-click anywhere on the map and the camera drops to the street** — it flies down to standing eye height (~1.7 m) at that exact spot, resting on the real ground relief, and you look around in place: turn a full 360°, tilt from the horizon all the way up to straight overhead. The neighborhood at human scale.

And when you look up, it's a *real* sky. The sun and moon sit in their **true positions for the current date and time** at Lafayette Square's latitude — the moon even shows its correct phase. ~523 catalog stars wheel overhead in their actual places, each tinted by its **real spectral color**: blue-white for the hot stars, warm gold, deep red for the cool giants. And the **constellations are drawn in like the Grand Central Terminal ceiling** — gold figure-lines and labels tracing the patterns, with each joint glowing in its star's true color. The sky's color envelope is operator-authored and animates across the day; the clouds are volumetric and driven by live weather. *(The Milky Way, planets, meteors and aurora are the planned build-out of this view.)*

*(Under the hood this is the `planetarium` camera mode; the UI calls it street view. Three camera modes total — Hero, Browse, and this. A free-roaming walk-around is a planned future evolution.)*

### Place cards
Click any building to open its card. **Claimed places** show photos, hours (with a live open/closed indicator), contact info, a menu where applicable, reviews with a fleur-de-lis rating, and upcoming events. **Unclaimed buildings** still open — LS auto-synthesizes a read-only card from the building's own record (year built, stories, architectural style, zoning, historic status, square footage), so every structure in the neighborhood is discoverable and described. Townies can leave reviews (with optional photos); guardians edit their card inline.

> **The full spec — every card field, the menu/delivery data model, and how cards get authored — is [`PLACE-CARDS.md`](PLACE-CARDS.md).** This is the directory ("the Society Pages") and the enhanced card behind it.

### Bulletin
A neighborhood board in groups (Marketplace, Services, Neighbors, Cary) and sections. **Townies** with a handle can post — with full markdown authoring (15+ tools, live preview) — take threaded comments, and spin any post into a **private DM thread**. The Neighbors sections (Missed Connections, Square Notes, Emergency) default to anonymous. → Full spec (taxonomy, gates, comment/thread model, data shapes): [`BULLETIN.md`](BULLETIN.md).

### Residence + Lobby
Anyone can claim their home. Once verified — by an admin, a QR invite, another already-verified resident, or a device you've linked — you become a **resident** with access to that building's **private lobby**: a residents-only message board (text + photos) and a view of your co-residents. Residence lasts a year. → Full spec (the four verify paths, the lobby gates, the data model): [`RESIDENTS.md`](RESIDENTS.md). *(Distinct from a "resident place card" — the card kind — which is in [`PLACE-CARDS.md`](PLACE-CARDS.md).)*

### Guardian / business listing edits
A business owner claims their listing by scanning the QR card posted at the location (the secret on the card proves presence). The first claimant is the **guardian** (full control); anyone they add is a **keyholder** with exactly the per-field permissions granted. Guardians edit everything inline (hours, photos, logo, tags, menu, events), reply to reviews, and manage their staff roster — all gated server-side. → Full spec (claim flow, permission model, staff ops, every gate): [`GUARDIANS.md`](GUARDIANS.md).

### Cary (courier system)
A neighborhood request-and-dispatch courier system on Supabase (phone-OTP auth, realtime). The **courier side is live** — onboarding, the dashboard (GPS, request-accept, live meter, safety reports), and live courier dots on the map — while the **requester** side (creating a delivery from a place card) is still a "coming soon" placeholder. → App-integration spec: [`CARY.md`](CARY.md). Program/legal/schema: [`../CARY-BRIEF.md`](../CARY-BRIEF.md) + [`../cary/`](../cary/).

### Check-in (townie QR)
The neighborhood's trust ladder. Scanning a place's QR check-in card logs a visit; reach **3 distinct check-in days within a rolling 14-day window** and you become a **townie** — which unlocks reviewing places, posting to the bulletin, commenting, and starting DM threads. Status is computed server-side; there's no way to fake your way in. → Full spec (the computation, the gated actions, the data model): [`TOWNIES.md`](TOWNIES.md).

### Handles + avatars
Your public face in the neighborhood: a chosen `@handle` plus an emoji avatar set on a colored "vignette" backdrop. Identity is tied to your device (anonymous by design — no email, no password) and can be carried to another device via a short linking token, so the same handle follows you across phone and laptop. → Specs: [`IDENTITY.md`](IDENTITY.md) (handle/avatar) · [`DEVICE-LINK.md`](DEVICE-LINK.md) (the cross-device handoff + sign-out). The public privacy/terms pages are [`PUBLIC-PAGES.md`](PUBLIC-PAGES.md).

---

## The slab contract from the LS side

What LS trusts cartograph to publish, and what LS does *not* re-author (confirmed by the 2026-06-02 inventory):

- **Trusts as immutable:** `public/baked/<look>/ground.{json,bin}` + `ground.lightmap.png`, `public/baked/<look>/buildings.{json,bin}` (**now the production building source — `SlabBuildings`, not Preview-only**), `public/baked/<look>/lamps.json`, `public/baked/<look>/scene.json`, `public/baked/default.json` (arborist tree placements + GLB variants), `public/clouds/{presets,almanac,modulators}.json` (**the volumetric `<Atmosphere/>` consumer is now wired via the meteorologist directive — no longer "published but unconsumed" — though it is gated OFF by default; production ships the cheap `<CloudDome/>` and `<Atmosphere/>` only mounts under `?sky=volumetric`**).
- **Live data still consumed at runtime (intentional or to-be-baked):** enumerated in `ls/ARCHITECTURE.md` §2 "could/should bake" table.
- **Live data still consumed at runtime (load-bearing, won't ever bake):** GAS listings/events/reviews/bulletins/threads, Supabase Cary sessions, handles, residence + guardian claims, check-ins, community counts, and live Open-Meteo weather. These are dynamic by definition.

---

## Product / runtime decisions worth knowing

- **Buildings render off the slab (L1.3, shipped 2026-05-26).** Production + Preview mount `SlabBuildings` — the merged-mesh buildings bake (`buildings.json` **v2**) plus a render-scoped per-building index. Identity (click / hover / neon / selection / place card) resolves `raycast → building id` against the slab index (`useSlabBuildingIndex`), then `id → record` via the content layer (`buildingMap` / `useListings`) — the slab owns spatial identity, content owns what to display. `SceneNeon` sources tube geometry/anchors from the index. **Stage keeps the live `LafayetteScene` mount** (authoring needs live retint), so `SceneNeon` falls back to live `src/data/buildings` there. The `src/data/buildings` *render* dependency is gone from production; the *content* importers (`SidePanel`, `GlassSearch`, `useListings`, `CheckinPage`, `PlaceCard`) still read it as the content DB — relocating that is a separate future brief. `BakedBuildings` is deleted. See `SLAB-CONTRACT.md §6`.
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
