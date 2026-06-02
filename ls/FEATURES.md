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

### Planetarium (sky) mode
The third camera mode looks *up*: the authored sky dome, the sun and moon in their real positions for the current time and date, ~523 catalog stars with constellations, and (once re-enabled) the Milky Way. The sky's color envelope is operator-authored and animates across the day; clouds are volumetric and driven by live weather. *(Note: the runtime has three camera modes — Hero, Browse, Planetarium. There is no separate walk-around "street" mode today; street-level closeness comes from selecting a place, which flies the camera in tight.)*

### Place cards
Click any building to open its card. **Claimed places** show photos, hours (with a live open/closed indicator), contact info, a menu where applicable, reviews with a fleur-de-lis rating, and upcoming events. **Unclaimed buildings** still open — LS auto-synthesizes a read-only card from the building's own record (year built, stories, architectural style, zoning, historic status, square footage), so every structure in the neighborhood is discoverable and described. Townies can leave reviews (with optional photos); guardians edit their card inline.

### Bulletin
A neighborhood bulletin board organized into groups (Marketplace, Services, Neighbors, Cary) and sub-sections (including Missed Connections, Square Notes). Townies with a handle can post; posts support full markdown authoring (bold, links, images, headings, colors, lists — 15+ tools) with live preview. Each post takes threaded comments, and any post can spin off into a **private direct-message thread** between two neighbors. Some sections (Missed Connections, Square Notes) default to anonymous posting; the app asks how you want to appear and remembers your choice.

### Residence + Lobby
Anyone can claim their home. Once verified — by an admin, a QR invite, or another already-verified resident of the building, or automatically if a device you've linked is already verified — you become a resident with access to that building's **private lobby**: a residents-only message board (text + photos) and a view of your co-residents. Residence claims last a year.

### Guardian / business listing edits
A business owner claims their listing by scanning the QR card physically posted at the location (the secret on the card proves presence). The first claimant becomes the **guardian** (full control); anyone they add afterward is a **keyholder** with exactly the per-field permissions the guardian grants (menu, hours, photos, replies, events). Guardians edit everything inline — hours, photos, logo, tags/category, menu, and events — and can reply to reviews, post events, and manage their staff roster. All edits are gated server-side, not just in the UI.

### Cary (courier system)
A neighborhood courier request-and-dispatch system, backed by Supabase (phone-OTP auth, courier profiles, realtime dispatch + chat). It's **architected and the backend is live** — courier dots already render on the map and the community masthead counts active couriers from Supabase — but the rider/courier UI ships behind "coming soon" placeholders (per `PUBLISH.md §5`). Full inventory of this section is deferred (it was held off the forensic pass).

### Check-in (townie QR)
The neighborhood's trust ladder. Scanning a place's QR check-in card logs a visit (one per place per day); reach **3 distinct check-in days within a rolling 14-day window** and you become a **townie** — which unlocks reviewing places and posting to the bulletin board. Check-ins also fire quietly whenever you open a place card. Status is computed server-side; there's no way to fake your way in.

### Handles + avatars
Your public face in the neighborhood: a chosen `@handle` plus an emoji avatar set on a colored "vignette" backdrop. Identity is tied to your device (anonymous by design — no email, no password) and can be carried to another device via a short linking token, so the same handle follows you across phone and laptop.

---

## The slab contract from the LS side

What LS trusts cartograph to publish, and what LS does *not* re-author (confirmed by the 2026-06-02 inventory):

- **Trusts as immutable:** `public/baked/<look>/ground.{json,bin}` + `ground.lightmap.png`, `public/baked/<look>/buildings.{json,bin}` (**now the production building source — `SlabBuildings`, not Preview-only**), `public/baked/<look>/lamps.json`, `public/baked/<look>/scene.json`, `public/baked/default.json` (arborist tree placements + GLB variants), `public/clouds/{presets,almanac,modulators}.json` (**now consumed at runtime by the volumetric `Atmosphere` via the meteorologist directive — no longer "published but unconsumed"**).
- **Live data still consumed at runtime (intentional or to-be-baked):** enumerated in `ls/ARCHITECTURE.md` §2 "could/should bake" table.
- **Live data still consumed at runtime (load-bearing, won't ever bake):** GAS listings/events/reviews/bulletins/threads, Supabase Cary sessions, handles, residence + guardian claims, check-ins, community counts, and live Open-Meteo weather. These are dynamic by definition.

---

## Product / runtime decisions worth knowing

[TO BE FILLED as decisions emerge from inventory + composition pass. Candidates from the walk:]
- **Buildings render off the slab (L1.3, shipped 2026-05-26).** Production + Preview mount `SlabBuildings` — the merged-mesh buildings bake (`buildings.json` **v2**) plus a render-scoped per-building index. Identity (click / hover / neon / selection / place card) resolves `raycast → building id` against the slab index (`useSlabBuildingIndex`), then `id → record` via the content layer (`buildingMap` / `useListings`) — the slab owns spatial identity, content owns what to display. `SceneNeon` sources tube geometry/anchors from the index. **Stage keeps the live `LafayetteScene` mount** (authoring needs live retint), so `SceneNeon` falls back to live `src/data/buildings` there. The `src/data/buildings` *render* dependency is gone from production; the *content* importers (`SidePanel`, `GlassSearch`, `useListings`, `CheckinPage`, `PlaceCard`) still read it as the content DB — relocating that is a separate future brief. `BakedBuildings` is deleted. See `HANDOFF-buildings-bake.md` + `SLAB-CONTRACT.md §6`.
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
