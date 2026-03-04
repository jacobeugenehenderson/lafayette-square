# Publishing Lafayette Square

## 1. Frontend (GitHub Pages)

Deploys automatically on every push to `main`.

```
git add -A && git commit -m "description" && git push
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds with `base: '/'` and deploys `dist/` via `actions/deploy-pages@v4`.

The `public/CNAME` file tells GitHub Pages to serve at `lafayette-square.com`.

To trigger a re-deploy without code changes:
```
git commit --allow-empty -m "Trigger deploy" && git push
```

### Secrets

| Secret | Purpose |
|--------|---------|
| `VITE_API_URL` | Apps Script deployment URL, baked in at build time |

Set in repo [Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions).

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

## Keeping them in sync

| What changed | What to do |
|---|---|
| Frontend code only | Push to `main` — Actions deploys automatically |
| Apps Script only | `clasp push && clasp deploy -i <ID>` |
| Both | Do both. Order doesn't matter. |
| Worker only | Update in Cloudflare dashboard |
| New Apps Script deployment (new URL) | 1. Deploy new script. 2. Update `VITE_API_URL` in GitHub Secrets. 3. Update `.env` locally. 4. Push to trigger frontend rebuild. |

## Troubleshooting

**Deploy didn't happen after push?**
Check Actions tab — the workflow might have failed. Common causes: `npm ci` failure (lockfile drift) or missing Node version.

**Site shows old version?**
GitHub Pages CDN can cache for up to 10 minutes. Hard-refresh or check the Actions log to confirm the deploy completed.

**Local build looks wrong?**
Run `npm run build && npm run preview` to test the production build locally. Preview serves at `localhost:4173/`.
