# Publishing Lafayette Square

The site deploys automatically to GitHub Pages on every push to `main`.

## Live URL

**https://lafayette-square.com**

Served via GitHub Pages with a custom domain. The `public/CNAME` file tells GitHub Pages to serve at `lafayette-square.com`.

## How It Works

### 1. Push to `main`

```
git add -A && git commit -m "description" && git push
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs automatically:
- Checks out code
- Installs dependencies (`npm ci`)
- Builds (`npm run build`) with `base: '/'`
- Deploys the `dist/` folder to GitHub Pages via `actions/deploy-pages@v4`

### 2. DNS (Cloudflare)

`lafayette-square.com` DNS is managed by Cloudflare, pointing to GitHub Pages IPs:

| Record | Value |
|--------|-------|
| `A` | `185.199.108.153` |
| `A` | `185.199.109.153` |
| `A` | `185.199.110.153` |
| `A` | `185.199.111.153` |
| `CNAME www` | `lafayette-square.com` |

### 3. GitHub Repo Settings (one-time)

In the repo **Settings > Pages**:
- **Source**: GitHub Actions
- **Custom domain**: `lafayette-square.com`

### 4. Secrets

The workflow uses one optional secret:

| Secret | Purpose |
|--------|---------|
| `VITE_API_URL` | API base URL injected at build time |

Set in repo **Settings > Secrets and variables > Actions**.

## Troubleshooting

**Deploy didn't happen after push?**
Check Actions tab — the workflow might have failed. Common causes: `npm ci` failure (lockfile drift) or missing Node version.

**Site shows old version?**
GitHub Pages CDN can cache for up to 10 minutes. Hard-refresh or check the Actions log to confirm the deploy completed.

**Local build looks wrong?**
Run `npm run build && npm run preview` to test the production build locally. Preview serves at `localhost:4173/`.
