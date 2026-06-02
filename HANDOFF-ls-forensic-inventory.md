# HANDOFF — LS Forensic Inventory (reverse-document the robust-but-undocumented app)

**You ARE the dispatched agent.** Pick a name (one word, yours); sign your report with it. **Agent: FRESH (cold)** — LS is its own domain; no prior context is load-bearing (the tile work was all cartograph). **READ-ONLY — no code changes.**

## The job

**Lafayette Square is the product Jacob ultimately ships — and it's *robust but barely documented.*** The code is the ground truth; you are doing **reverse-documentation**: read the LS app code and **inventory what's actually there, section by section, with each thing's state** — so we can finally *see the whole picture and where we are in it*. (This is the LiDAR scan of the doctrine, pointed at LS.)

This **subsumes `HANDOFF-audit-ls-app.md`** — that brief's slab-contract/de-hardwiring lens rides along here as a *secondary* capture (below); don't run both.

## Primary deliverable — the section inventory + state

LS's features are **"sections in a 3-ring binder"** (Jacob — e.g. *Cary* is a whole section). Walk each, from the code. **For every feature in a section, capture three things:**
1. **What it does** — the capability, in plain user-facing voice (→ feeds `ls/FEATURES`).
2. **How it's built** — the mount path + data source (components + backend) (→ feeds `ls/ARCHITECTURE` + `ls/OPERATIONS`).
3. **State** — `robust` / `partial` / `stubbed` / `gap` / `dead`. **This column is the point** — it's what turns "a list" into "where we are."

**The sections (from a recon of `src/` — confirm + correct against the code):**
- **Runtime / scene composition** — `Scene.jsx`, `LafayetteScene.jsx`, `BakedGround`, `SlabBuildings`, `Atmosphere`/`CelestialBodies`/`CloudDome`, `GatewayArch`, `LafayettePark`, `NeonBands`/`SceneNeon`, `StreetLights`/`BakedLamps`, `InstancedTrees`, `Terrain`, `PostProcessing`, the camera/`Controls`/shots. *(How LS composes the slab + live elements into the rendered neighborhood.)*
- **Places / listings / search** — `PlaceCard`, `GlassSearch`, `SidePanel`, `InfoModal`, the listings data + hooks.
- **Cary / courier** (a big section) — `CaryAuth`, `CourierDashboard`, `CourierOnboarding`, `CourierDots`, `ChatModal`, `SmsInbox`, `SafetyReport`, `CodeDeskModal`, `ContactModal` (the Supabase courier system).
- **Accounts / roles / identity** — `AvatarCircle`/`AvatarEditor`, `RoleBadge`, `UserDot`, `AdminPrompt`; residence + guardian claims; admin access (`?admin`).
- **Events / bulletins / community** — `EventTicker`, `BulletinModal`.
- **Time / atmosphere / environment** — `ClockCalendarPump`, `DawnTimeline`, the Atmosphere/sky consumption (the meteorologist integration on the consumer side).
- **Data / backends / API** — `apps-script/Code.js` (the 50+ GAS endpoints), Supabase (Cary), `worker.js` (OG tags), the `src/hooks`/`src/lib` data layer, `src/data`, `src/pages`.

(If the code reveals sections the recon missed, add them — you're the one reading it.)

## Secondary captures (free while you read — absorbs `audit-ls-app`)

Read `AUDIT-MATRIX.md` + `SLAB-CONTRACT.md` for the lens, then note as you go:
- **Slab-contract read-vs-hardcoded** — for everything the app *renders*, does it read the slab (`scene.json`/bins) or **hardcode** an LS-specific? Every hardcode is a triple gap (future-setting · slab-field · third-party-build barrier). List them.
- **Endpoint inventory** — the `/api/*` + GAS + Supabase + worker endpoints the app consumes (seeds the future API surface).
- **Deploy + auth facts** — the deploy path, what's behind a login/password (for the Show Bible / the road-to-live).

These are *secondary* — don't let them crowd out the primary section inventory + state.

## Boundaries

- ❌ **READ-ONLY** — no code edits. Evidence from the code, not pattern-matched guesses (`feedback_no_speculative_cruft_lists`).
- ❌ Don't edit the canonical `ls/` docs — Boz folds your inventory in (canonical docs are Boz/operator-owned).
- ❌ Not yours: the authoring tools (cartograph), tree/cloud *internals* (just note LS's *consumption* of them).

## Deliverable

**`scratch/ls-forensic-inventory.md`** — the **section × (what/how/state)** inventory as the centerpiece, + the secondary slab-contract / endpoint / deploy captures. Boz routes it into the `ls/` docs (FEATURES/ARCHITECTURE/OPERATIONS/reference) **and builds the whole-picture status map** (products × features × state × position on the road to LS-live) from it.

## Dispatch note

**Scale:** SERIAL — one agent per section, one at a time. Jacob's locked order (2026-06-02):

1. **Runtime / scene composition** ← dispatching now
2. **Places / listings / search**
3. **Accounts / roles / identity**
4. **Events / bulletins / community**
5. **Time / atmosphere / environment**
6. **Data / backends / API**
7. **Cary / courier** — *ON HOLD* (do last, or skip this round)

Each dispatch is **one section only** — read just that section's code, fill its slice of the inventory (what/how/state) + the secondary captures *for that section*, write to `scratch/ls-forensic-inventory.md` (append; don't clobber a prior section's block). Boz assembles the whole-picture map as each lands.

*(A fan-out — one agent per section in parallel — would be denser/faster but is a multi-agent workflow requiring Jacob's explicit "workflow" opt-in. We chose serial.)*

*Provenance: Boz, 2026-06-02. Reverse-documentation of LS toward the whole-picture map; subsumes `HANDOFF-audit-ls-app.md`. The ultimate goal is LS live online — this fills the LS half of the road map.*
