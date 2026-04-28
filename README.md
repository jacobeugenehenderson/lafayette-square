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

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the publish-loop pattern, the Looks model (per-Look styling vs. shared geometry), and the Designer/Stage role split. Each helper has its own README documenting its inputs, outputs, and command surface:

- [`cartograph/README.md`](cartograph/README.md)
- [`arborist/README.md`](arborist/README.md) (scaffold — see [`arborist/SPEC.md`](arborist/SPEC.md) for the build plan)

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
