# Publishing Lafayette Square

The site deploys automatically to GitHub Pages on every push to `main`.

## Live URLs

| URL | Notes |
|-----|-------|
| `https://jacobeugenehenderson.github.io/lafayette-square/` | GitHub Pages (canonical) |
| `https://jacobhenderson.studio/lafayette-square` | Custom domain redirect (via Cloudflare) |

## How It Works

### 1. Push to `main`

```
git add -A && git commit -m "description" && git push
```

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs automatically:
- Checks out code
- Installs dependencies (`npm ci`)
- Builds (`npm run build`) with `base: '/lafayette-square/'`
- Deploys the `dist/` folder to GitHub Pages via `actions/deploy-pages@v4`

### 2. Vite Base Path

In `vite.config.js`, the `base` is set conditionally:

```js
base: command === 'build' ? '/lafayette-square/' : '/'
```

- **Dev** (`npm run dev`): serves at `/` (localhost:5173)
- **Build** (`npm run build`): assets reference `/lafayette-square/` prefix

### 3. GitHub Repo Settings (one-time)

In the repo **Settings > Pages**:
- **Source**: GitHub Actions
- **Branch**: (not applicable — deploy is via Actions artifact, not branch)

If Pages shows "disabled," go to Settings > Pages and select **GitHub Actions** as the source. The workflow handles the rest.

### 4. Cloudflare Redirect (one-time)

`jacobhenderson.studio` DNS is managed by Cloudflare. To route `/lafayette-square` to the GitHub Pages deploy:

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the `jacobhenderson.studio` zone
3. Go to **Rules > Redirect Rules**
4. Create a rule:
   - **Rule name**: Lafayette Square redirect
   - **When**: Custom filter expression
     - Field: `URI Path`, Operator: `starts with`, Value: `/lafayette-square`
   - **Then**:
     - Type: `Dynamic`
     - Expression: `concat("https://jacobeugenehenderson.github.io", http.request.uri.path)`
     - Status code: `301`
     - **Preserve query string**: checked
5. Save and deploy

This sends `jacobhenderson.studio/lafayette-square` → `jacobeugenehenderson.github.io/lafayette-square/` while preserving the path and query params.

### 5. Secrets

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

**Custom domain 404?**
Verify the Cloudflare redirect rule is active and the expression matches `/lafayette-square`.

**Local build looks wrong?**
Run `npm run build && npm run preview` to test the production build locally. Preview serves at `localhost:4173/lafayette-square/`.
