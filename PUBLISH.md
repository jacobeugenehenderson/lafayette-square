# Publishing Lafayette Square

## Quick reference

| What changed | What to do |
|---|---|
| Frontend code only | `git push` — Actions deploys automatically |
| Apps Script only | `cd apps-script && npx clasp push && npx clasp deploy -i <ID>` |
| Both | Do both. Order doesn't matter. |
| Worker only | Update in Cloudflare dashboard |
| New env var needed in prod | Add to GitHub Secrets + `deploy.yml`, push to trigger rebuild |

---

## 1. Frontend (GitHub Pages)

Deploys automatically on every push to `main`.

```bash
git add <files> && git commit -m "description" && git push
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds with Vite and deploys `dist/` via `actions/deploy-pages@v4`.

The `public/CNAME` file tells GitHub Pages to serve at `lafayette-square.com`.

To trigger a re-deploy without code changes:
```bash
git commit --allow-empty -m "Trigger deploy" && git push
```

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

### API URL must match in all three places

The deployment URL above must be identical in:

1. **`.env`** — `VITE_API_URL` (used by local dev server)
2. **GitHub Secret** — `VITE_API_URL` in [repo Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions) (used by prod build)
3. **`public/codedesk/index.html`** — `window.LSQ_API_URL` (used by QR Generator iframe)

If you create a new deployment, update all three. Mismatched URLs cause "Unknown-action" errors because old deployments don't have newer endpoints.

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

# Push schema changes
supabase db push

# Deploy edge functions
supabase functions deploy
```

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

**Local dev freezes or crashes?**
If Docker/Supabase local is running, stop it immediately: `supabase stop`. The local stack uses ~3-4 GB RAM and is not needed — use the hosted project instead. If Supabase isn't the cause, check if `VITE_SUPABASE_URL` points to a running instance. If it's missing, remove the var from `.env` — the stub client will keep the app functional.
