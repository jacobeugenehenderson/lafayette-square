# Lafayette Square

3D neighborhood visualization of Lafayette Square, St. Louis.

**Live site:** https://lafayette-square.com

---

## Local development

```bash
npm install
npm run dev
```

`npm run dev` launches **everything in one terminal** with prefixed colored logs:

| Prefix | Process | Port | Role |
|---|---|---|---|
| `web`   | `vite`                  | 5173 | Main neighborhood app + helper UIs (Cartograph, Stage, Arborist) |
| `carto` | `cartograph/serve.js`   | 3333 | Cartograph backend: skeleton/overlay I/O, Looks API, bake CLI runner |
| `arb`   | `arborist/serve.js`     | 3334 | Arborist backend: species library, specimen browser API, tree bake CLI runner |
| `met`   | `meteorologist/serve.js`| 3335 | Meteorologist backend: Teapot (clouds) + Almanac (weather rules) I/O, almanac evaluator endpoint *(not yet wired into dev script — see meteorologist/README.md)* |

`Ctrl-C` kills all three. Escape hatches if you want to run one in isolation:

```bash
npm run dev:web         # vite only
npm run dev:cartograph  # cartograph backend only
npm run dev:arborist    # arborist backend only
```

The dev server reads environment variables from `.env` (gitignored):

```
VITE_API_URL=https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec
VITE_SUPABASE_URL=https://ngbvgjzrpnfrqmzkqvch.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

If `VITE_API_URL` is missing, the dev server falls back to in-memory mocks (no real data).
If `VITE_SUPABASE_URL` is missing, the Supabase client returns a safe stub (Cary features inert).

---

## Architecture at a glance

The project is organized as a **public-facing runtime app** plus a small set of **standalone helper apps** that produce the assets the runtime consumes. Each helper publishes one canonical artifact; the runtime composes them.

| Helper | Built in | Publishes | Consumed by |
|---|---|---|---|
| **Cartograph** (`/cartograph`) | `src/cartograph/` + `cartograph/` | `public/looks/<id>/ground.svg` (per Look) | Stage's `SvgGround` |
| **Stage** (`/stage`)             | `src/stage/` + `src/cartograph/Stage*` | (eventually) `stage-config.json` per Look | Runtime scene environment |
| **Arborist** (`/arborist`)       | `src/arborist/` + `arborist/`          | `public/trees/<species>/{skeleton-N.glb, tips-N.json, manifest.json}` | Runtime `InstancedTrees` (planned) |
| **Meteorologist** (in Stage)     | `meteorologist/` + `src/cartograph/` (UI inline) + `src/components/Atmosphere.jsx` (planned) | `public/clouds/{presets,almanac}.json` | Runtime `<Atmosphere />` (planned) |

---

## Documentation map

> **This section is the index — find any doc from here without being told where to look.** Docs live *next to their code* and follow **three kinds**, separated by tense (the architecture is codified in [`BOZ.md`](BOZ.md)): **Reference** (how it works / why — eternal-present) · **State** (where we are / what's next — the `BACKLOG` + the `HANDOFF-*.md` future-looking to-do layer) · **Diary** (how we got here — `NOTES` + git). *One kind per doc; content flows downstream as it ages.*
>
> **⭐ Audience note — three readers within Reference:** **FEATURES** = user/investor (*what it is, why it's special* — the brochure). **OPERATIONS** = operator (*here's the panel, here's the knob, here's when to turn it* — the manual; the engineering/"actuarial" counterpoint to FEATURES, **paired with it per domain**). **README · ARCHITECTURE · PIPELINE · RIBBONS** = developer (contract / build+rationale / execution / geometry). So **FEATURES is never subsumed** — distinct audience; engineer-internals migrate FEATURES→ARCHITECTURE, operator-knobs migrate FEATURES→OPERATIONS, keeping FEATURES the clean pitch. *(OPERATIONS is seeded in cartograph; other domains get one as they're touched.)*

**Start here, any session:**
- **[`BOZ.md`](BOZ.md)** — coordinator onboarding, the living doc Process, and "where to start." The front door.
- **This `README.md`** — the doc index (you're in it) + dev setup.

### Per-domain docs

The project is **four domains** + the runtime, each documented beside its code:

| Domain | Reference | State | Diary |
|---|---|---|---|
| **Cartograph** — map-making toolkit (Designer / Stage / Preview / bake) | [README](cartograph/README.md) · [FEATURES](cartograph/FEATURES.md) *(user/pitch)* · [OPERATIONS](cartograph/OPERATIONS.md) *(operator manual — seed)* · [ARCHITECTURE](cartograph/ARCHITECTURE.md) · [PIPELINE](cartograph/PIPELINE.md) · **[RIBBONS](cartograph/RIBBONS.md)** (geometry canon — read before any ribbon/corner work) | [BACKLOG](cartograph/BACKLOG.md) + the root `HANDOFF-*.md` briefs | [NOTES](cartograph/NOTES.md) · [OSM-FORENSICS](cartograph/OSM-FORENSICS.md) · [RENDER-PATH-CENSUS](cartograph/RENDER-PATH-CENSUS.md) |
| **LS app** — the consumer surface (place cards, residence, guardians, Cary) | [FEATURES](ls/FEATURES.md) · [ARCHITECTURE](ls/ARCHITECTURE.md) · [reference/INVENTORY-DATA](ls/reference/INVENTORY-DATA.md) (every data source) · [INVENTORY-API](ls/reference/INVENTORY-API.md) (every endpoint) · [RUNTIME-DELTA](ls/reference/RUNTIME-DELTA.md) | [BACKLOG](ls/BACKLOG.md) | — |
| **Arborist** — tree library + bake | [README](arborist/README.md) · [SPEC](arborist/SPEC.md) · [FEATURES](arborist/FEATURES.md) · [ARCHITECTURE](arborist/ARCHITECTURE.md) · [ROSTER-COVERAGE](arborist/ROSTER-COVERAGE.md) | [BACKLOG](arborist/BACKLOG.md) | [NOTES](arborist/NOTES.md) |
| **Meteorologist** — clouds + weather (UI lives inside Stage, no separate route) | [README](meteorologist/README.md) · [SPEC](meteorologist/SPEC.md) · [FEATURES](meteorologist/FEATURES.md) · [ARCHITECTURE](meteorologist/ARCHITECTURE.md) · [CANON](meteorologist/CANON.md) · [INTERFACE](meteorologist/INTERFACE.md) | [BACKLOG](meteorologist/BACKLOG.md) · [STAGE_MIGRATION](meteorologist/STAGE_MIGRATION.md) · [CLOUD-PHASE0](meteorologist/CLOUD-PHASE0.md) | [NOTES](meteorologist/NOTES.md) |

Cartograph and LS are **standalone yet completely overlapped** — cartograph could pour slabs for other neighborhoods; LS could surface other operators' slabs. Read the domain relevant to your session; flag mid-session contradictions; update at session end.

### Cross-domain / strategic (repo root)

- **[`SLAB-CONTRACT.md`](SLAB-CONTRACT.md)** — the formal cartograph↔LS boundary (the slab format; owned by neither app).
- **[`AGENT-VALIDATION-SURFACES.md`](AGENT-VALIDATION-SURFACES.md)** — where to validate (toy vs LS); the guardrails.
- **[`AUDIT-MATRIX.md`](AUDIT-MATRIX.md)** + the `HANDOFF-audit-*.md` set — the forensic-audit campaign.
- **[`plans/`](plans/)** — forward/strategic: productization, basemap-swap, pre-public-cleanout, kit-couplers.
- **[`PUBLISH.md`](PUBLISH.md)** — deploy procedures · `BUSINESS_LISTINGS.md` · `CARY-BRIEF.md`.

### State layer & working dirs

- **`HANDOFF-*.md`** (repo root) — dispatch-ready briefs = the **future-looking to-do**; live ones are indexed from the relevant `BACKLOG`.
- **`scratch/`** — git-tracked working files (briefs, audits, journals); throwaway-ish, *not* canonical.
- **`inventory/`** — the LS content corpus (narrative + page); data, not docs.
- **`_archive/`** — retired docs (git keeps the rest).
- **`memory/`** — the coordinator's continuity (auto-loaded; `MEMORY.md` is its index, and it points back here).

> *Incomplete? This index is incorporated **a bit at a time** — if a doc isn't mapped here yet, add it to its domain×kind cell (or the right root bucket) when you touch it. The index is canonical; keep it honest.*

URL routes during development:

| Route        | What it is |
|---|---|
| `/`          | Public neighborhood viewer (the runtime) |
| `/cartograph`| Cartograph helper app (Designer + Stage + Surfaces) |
| `/stage`     | Standalone Stage page (camera/lighting authoring, no cartograph data) |
| `/arborist`  | Arborist helper app (species library + specimen workstage; scaffold) |

---

## Stack

React Three Fiber, Three.js, Zustand, Tailwind CSS, Vite, Supabase (Cary courier system).

## Backend

- **Apps Script** (`apps-script/Code.js`) — listings, reviews, events, check-ins, residence, guardian claims, QR designs.
- **Supabase** — Cary courier system (requests, sessions, auth). Not yet live.
- **Cloudflare Worker** (`worker.js`) — OG meta tags for social link previews.
- **Cartograph backend** (`cartograph/serve.js`) — local-only Node service for the authoring helpers (Looks API, bake CLI runner, overlay I/O). Not deployed; helpers are dev-time tools.

## Admin access

Append `?admin` to any URL to trigger the admin login prompt. The passphrase is validated server-side and a session token is issued (valid 6 hours, stored in sessionStorage). Use `?logout` to end the session.

Set the passphrase in Apps Script: `PropertiesService.getScriptProperties().setProperty('ADMIN_PASSPHRASE', 'your-secret')`

## Publishing

See [PUBLISH.md](PUBLISH.md) for deployment procedures (frontend, backend, DNS, worker).
