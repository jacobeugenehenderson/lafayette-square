# Publishing Lafayette Square

## Working directory

**All development happens from `~/Desktop/lafayette-square`.** This is the one and only working repo.

The external drive (`/Volumes/Today/lafayette-square`) is a manual archive copy — do NOT develop from it. Claude Code, Vite dev server, Supabase CLI, and all git operations run from the Desktop copy.

**Why:** The external drive is too slow for Vite's HMR and file watcher. Supabase's local Docker stack (7 containers, ~3-4 GB RAM) crashes the system when run from it. The Desktop SSD copy solves both.

**To sync the archive:** `git -C /Volumes/Today/lafayette-square pull` (only when you want to update it manually).

---

## Single source of truth: the deployment ID

Every API URL in this project must use the same Apps Script deployment ID. It appears in **four** places:

| Location | File / Setting | Used by |
|----------|---------------|---------|
| This file | Section 2 below | Humans reading docs |
| `.env` | `VITE_API_URL` | Local dev server (`npm run dev`) |
| GitHub Secret | `VITE_API_URL` | Production build (`npm run build` in Actions) |
| CodeDesk iframe | `public/codedesk/index.html` → `window.LSQ_API_URL` | QR Generator |

**Current deployment ID:** `AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ`

If these drift apart, you get "Unknown-action" errors because old deployments don't have newer endpoints. **After any `clasp deploy`, verify all four match.** Run this to check the code locations:

```bash
grep -r 'AKfycb' .env public/codedesk/index.html PUBLISH.md --include='*.md' --include='*.html' --include='*.env' | grep -v node_modules
```

The GitHub Secret must be checked manually at [Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions).

---

## Quick reference

| What changed | What to do |
|---|---|
| Frontend → **staging** | commit, then `git push origin curb-offset-draw` → `staging.yml` deploys staging (the trunk IS the staging trigger) |
| Promote **staging → prod** | once staging is verified: `git push origin <branch>:main` → `deploy.yml` deploys lafayette-square.com (clean fast-forward; main + trunk stay a few commits apart) |
| Apps Script only | `cd apps-script && npx clasp push && npx clasp deploy -i <ID>` |
| Both | Do both. Order doesn't matter. |
| Worker only | Update in Cloudflare dashboard |
| New env var needed in prod | Add to GitHub Secrets + `deploy.yml`, push to trigger rebuild |

---

## 0.5 The multi-neighborhood deploy model — one factory, many destinations

> **The "end process" doctrine** (2026-07-04, prompted by the HiPointe-DeMun URL purchase). The rest of this doc is the LS-specific mechanics; this section is the *frame* those mechanics serve once there is more than one neighborhood. Reference — the developer/operator model for how a poured neighborhood reaches the public.

**Two independent axes, never one decision.** They *feel* fused because "move Bake onto the live site" touches both at once — keep them apart and each has a clean answer:

- **Axis A — WHERE it deploys (destination/domain).** `jacobhenderson.studio/<hood>` vs. the neighborhood's own apex (`hipointedemun.com`). **This is a per-instance *variable*, not a fork.**
- **Axis B — WHO holds the authoring keys (the install *tier*).** *Guided install* (you at the wheel, sharing the rendered result) vs. *full 3rd-party self-serve* (the "front-front-end"). This is about **where the factory lives**, and the higher tier is deferred (`plans/front-front-end-and-productization.md`).

**Axis A — one factory, many destinations.** A neighborhood is a data folder (`cartograph/data/<hood>`) → bakes to a slab (`public/baked/<hood>`) → pointed to by `INSTANCE.lookId` (`src/instance.js`), `?look=`/`?scene=` override. **One build already serves LS + toy + hipointe-demun.** The deploy destination is *not* wired into the artifact — it's a CNAME + the domain field in `instance.js`. The **same built bytes** get re-homed at a different target; this is literally how staging already works today (`staging.yml` builds `dist/` and pushes it to a *separate* repo with its own `--base`). So a per-neighborhood destination is that same move with a different target — **config, not architecture.**

- **The concrete surface for Axis A:** the Publish endpoints in `cartograph/serve.js` (dev-only) hardcode `STAGING_BRANCH` and `PROD_BRANCH = main` and commit a scoped `slabPathspecs` for one look. **Parameterizing those two constants + the pathspecs by scene is the whole job.** Small, well-bounded — not yet built. ⚠️ **Live drift (2026-07-11): `STAGING_BRANCH` still = `cartograph-looks-pass-ab`, the dead pre-2026-07-08 branch that deploys nothing** (`staging.yml` moved to `curb-offset-draw`, `26a62407`). So the Preview's Publish→staging button currently pushes to a branch no workflow watches — fix the constant to `curb-offset-draw` when the parameterization lands (or sooner).

**Axis B — keep the factory local (that's the point of the tiers).** *Guided install* ships **slabs, not tools** — the authoring app (Stage/Bake) never leaves your machine, so you're never anchored to a client's project; the "shared creative" happens through the preview/publish loop (they react to the staging URL, you iterate). "Move Bake onto the live site" is **Tier B, deferred** — the only tier where live-site authoring makes sense, and the tier where the anchoring worry is solved by design (they drive, not you). Don't build it to serve a guided install.

**The one real tradeoff — a neighborhood's *default* home:**

| | Subpath (`studio/<hood>`) | Own apex (`<hood>.com`) |
|---|---|---|
| Infra now | ~zero (one build, one Pages target) | per-hood Pages target + CNAME + `--base` |
| Product story | weaker (shares studio identity) | strong ("this is HiPointe's civic thing") |
| Worth it when | proving the pour · guided installs | a client who's paid for their own home |

> **Recommendation (settled):** default to the **subpath now**, make the deploy target a **per-instance variable**, and **promote to an apex only when a client commits** — so promotion is a one-line config change, never a re-architecture. That keeps everything in "one factory, many destinations" and never anchors you.

**On buying the domain:** buy `<hood>.com` for the *name* if you want (cheap option value), but it's **decoupled** from the technical work — the pour ships to the studio subpath regardless, and the domain just becomes a CNAME you flip later. Don't let the purchase gate or reshape the build. *(HiPointe stages first to `jacobhenderson.studio/hipointe-demun`; see `NEIGHBORHOOD-INPUTS.md §7` step 8 for the pour sequence, `cartograph/_archive/HANDOFF-hipointe-pour-step0-LANDED-2026-07-02.md` for step-0 state.)*

> **Interim — the Preview Publish buttons for a non-LS look (decided 2026-07-06, Boz + Jacob).** Because the domain is decoupled (above), the "Push"/Publish button does **not** no-op. **Staging stays live for every look** — one build serves all, so `?look=hipointe-demun` already previews on the staging site. **Prod-promote for a non-LS look is disabled with an honest label** ("ships to its own home once its deploy target's set"), *never* a silent no-op — a button that lies about working is the misleading-UI anti-pattern (`feedback_stale_opaque_overlay_worse_than_hidden`). The real unblock is the per-scene destination (`STAGING_BRANCH`/`PROD_BRANCH`/pathspecs parameterized by scene, above) — small, well-bounded, not yet built. ⏳ **Guard not yet wired in code** — this note records the *decision*; the Preview Publish panel still shows the LS-scoped buttons. Tracked in `HANDOFF-blank-app-instance-decoupling.md`.

---

## 1. Frontend (GitHub Pages)

Deploys automatically on every push to `main`. **Per the working loop (strategy B, 2026-06-26), promote to `main` only after verifying on staging** (the trunk `curb-offset-draw`) — see the Quick reference above + [`cartograph/OPERATIONS.md §Save → ship`](cartograph/OPERATIONS.md). Both branches are slab-era and stay a few commits apart, so prod promotion is a clean fast-forward.

```bash
# solo, work directly on the trunk:
git push origin curb-offset-draw        # → staging (verify here first)
git push origin curb-offset-draw:main   # → prod, once staging looks right
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds with Vite and deploys `dist/` via `actions/deploy-pages@v4`.

The `public/CNAME` file tells GitHub Pages to serve at `lafayette-square.com`.

To trigger a re-deploy without code changes:
```bash
git commit --allow-empty -m "Trigger deploy" && git push
```

### Staging (preview before prod)

There is a **second** Pages target for previewing slab/look work before it reaches `lafayette-square.com`:

| Branch | Workflow | Deploys to |
|---|---|---|
| `main` | `deploy.yml` | **lafayette-square.com** (prod, this section) |
| `curb-offset-draw` (the trunk) | `staging.yml` | **`lafayette-square-staging`** (GitHub Pages preview) |

Push a feature branch to the trunk to stage it; push the trunk to `main` to ship. **CI does not bake** — both workflows are `vite build` + serve the *committed* slab, so the artifacts you committed are exactly what deploys (bake + commit before you push). The slab save→ship discipline (source-vs-derived, dirty-tree triage, the symptom→door table) lives in **`cartograph/OPERATIONS.md §Save → ship`**.

### Build-time environment (GitHub Secrets)

These are injected during `npm run build` in the Actions workflow:

| Secret | Purpose |
|--------|---------|
| `VITE_API_URL` | Apps Script deployment URL |
| `VITE_SUPABASE_URL` | Supabase project URL (for Cary, when live) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (for Cary, when live) |

Set in repo [Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions).

When adding a new secret, also add it to `.github/workflows/deploy.yml` under the `npm run build` step's `env:` block.

### Production build test

```bash
npm run build && npm run preview
```

Preview serves at `localhost:4173/`.

## 2. Backend (Google Apps Script)

The API lives in `apps-script/Code.js`, deployed via `clasp`.

**Deployment ID:** `AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ`

**Deploy steps:**
```bash
cd apps-script
npx clasp push
npx clasp deploy -i AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ
```

If `clasp push` fails with `invalid_grant`, re-authenticate:
```bash
npx clasp login
```

**The deployment URL is:**
```
https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec
```

This URL is stable across `clasp deploy` calls (same deployment ID = same URL). There are multiple old deployments in the project — always use the ID above.

See **"Single source of truth"** at the top of this file for all locations that must match this deployment ID.

### What the backend handles

- **Listings** — CRUD for places, photos, tags, hours
- **Reviews & events** — per-listing, device-hash auth
- **Check-ins** — townie QR scans, local status progression
- **Guardian claims** — secret-based, one device per listing
- **Residence** — claim + verify flow, lobby posts, resident counts
- **QR designs** — styled QR image storage for QR Studio
- **Handles** — per-device identity (avatar, display name)

### Sheets

The Apps Script reads/writes to a Google Sheets workbook. Key sheets:

| Sheet | Purpose |
|-------|---------|
| Listings | All landmark/business data (synced from `landmarks.json` on init) |
| Checkins | Device check-in log per location |
| Reviews | Star ratings + text reviews |
| Events | Community calendar events |
| Guardians | Device → listing guardian mapping |
| Residents | Device → building residence claims + verification status |
| LobbyPosts | Per-building resident-only posts |
| Handles | Device → handle/avatar mapping |
| QRDesigns | Styled QR images per listing |

## 3. Cloudflare Worker (`worker.js`)

Injects per-place OG meta tags for social link previews on `/place/*` routes.

Deploy via Cloudflare dashboard: **Workers & Pages > lafayette-square-proxy > Edit Code**, paste `worker.js`, save and deploy.

Route: `lafayette-square.com/place/*` on the `lafayette-square.com` zone.

## 4. DNS (Cloudflare)

`lafayette-square.com` DNS is managed by Cloudflare (proxied):

| Record | Value |
|--------|-------|
| `A` (×4) | `185.199.108–111.153` (GitHub Pages) |
| `CNAME www` | `jacobeugenehenderson.github.io` |

GitHub repo Settings > Pages: custom domain `lafayette-square.com`, Enforce HTTPS on.

## 5. Supabase (Cary — not yet live)

Project: `ngbvgjzrpnfrqmzkqvch` on supabase.co

The Cary courier system uses Supabase for:
- Phone OTP auth (couriers)
- Realtime subscriptions (request/session updates)
- Edge functions (dispatch, session completion)

**Do NOT run `supabase start` locally.** The local dev stack spins up ~7 Docker containers (~3-4 GB RAM) and has repeatedly crashed the system. All Cary development uses the hosted project.

```bash
# Link to the hosted project (one-time)
supabase link --project-ref ngbvgjzrpnfrqmzkqvch

# ⛔ ALWAYS check the history FIRST — an empty "Remote" column means db push
#    will replay the WHOLE stack, die on migration 001, and apply NOTHING.
#    (That was the live state until 2026-08-24; repaired then, so it should
#    now list every applied migration in both columns.)
supabase migration list

# Push schema changes
supabase db push

# Deploy edge functions
supabase functions deploy

# Which functions are actually live? Several in the repo have NEVER been
# deployed — do not assume a file under supabase/functions/ is running.
supabase functions list --project-ref ngbvgjzrpnfrqmzkqvch
```

⛔ **`supabase db dump` / `db diff` need Docker.** `migration list`, `db push`, `functions list` and
`inspect db *` all talk to the remote directly and do not.

Currently behind "coming soon" placeholders in the UI. When ready to launch:
1. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to GitHub Secrets
2. Add them to `deploy.yml` env block
3. Push to trigger rebuild

## Troubleshooting

**Deploy didn't happen after push?**
Check Actions tab — the workflow might have failed. Common causes: `npm ci` failure (lockfile drift) or missing Node version.

**Site shows old version?**
GitHub Pages CDN can cache for up to 10 minutes. Hard-refresh or check the Actions log to confirm the deploy completed.

**`clasp push` says "invalid_grant"?**
Run `npx clasp login` to re-authenticate.

**"Unknown-action" error from the API?**
The frontend is hitting an old Apps Script deployment that doesn't have the endpoint. The deployment ID has drifted — see **"Single source of truth"** at the top of this file. Check all four locations match, update the GitHub Secret, and push to trigger a rebuild.

**Local dev freezes or crashes?**
If Docker/Supabase local is running, stop it immediately: `supabase stop`. The local stack uses ~3-4 GB RAM and is not needed — use the hosted project instead. If Supabase isn't the cause, check if `VITE_SUPABASE_URL` points to a running instance. If it's missing, remove the var from `.env` — the stub client will keep the app functional.
