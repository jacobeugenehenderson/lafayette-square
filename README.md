# Lafayette Square

3D neighborhood visualization of Lafayette Square, St. Louis.

**Live site:** https://jacobhenderson.studio/lafayette-square

---

## Publishing

The site has two independent deployments that must stay in sync:

### 1. Frontend (GitHub Pages)

Deployed automatically via GitHub Actions on every push to `main`.

**Workflow:** `.github/workflows/deploy.yml`

The build uses a **GitHub secret** to bake in the API URL at build time:

- **Secret name:** `VITE_API_URL`
- **Where to set it:** [Repo Settings > Secrets > Actions](https://github.com/jacobeugenehenderson/lafayette-square/settings/secrets/actions)
- **Current value:** the Apps Script deployment URL (see below)

If the API URL changes (new Apps Script deployment), you **must** update this secret and re-deploy. Otherwise the live site will hit a stale/dead API.

To trigger a re-deploy without code changes:
```
git commit --allow-empty -m "Trigger deploy" && git push
```

### 2. Backend (Google Apps Script)

The API lives in `apps-script/Code.js`, deployed via `clasp`.

**Deployment ID:** `AKfycbwt3WFfB2v2jOf7VLXM-ssGABBf0TA9HkgXpiPo2bnTyAqC3ci4UG5FGoD0hV4hSgRFFQ`

**Deploy steps:**
```bash
cd apps-script
npx clasp push
npx clasp deploy -i AKfycbwt3WFfB2v2jOf7VLXM-ssGABBf0TA9HkgXpiPo2bnTyAqC3ci4UG5FGoD0hV4hSgRFFQ
```

If `clasp push` fails with `invalid_grant`, re-authenticate:
```bash
npx clasp login
```

**The deployment URL is:**
```
https://script.google.com/macros/s/AKfycbwt3WFfB2v2jOf7VLXM-ssGABBf0TA9HkgXpiPo2bnTyAqC3ci4UG5FGoD0hV4hSgRFFQ/exec
```

This URL is stable across `clasp deploy` calls (same deployment ID = same URL). It only changes if you create a *new* deployment instead of updating the existing one.

### Keeping them in sync

| What changed | What to do |
|---|---|
| Frontend code only | Push to `main` — Actions deploys automatically |
| Apps Script only | `clasp push && clasp deploy -i <ID>` |
| Both | Do both. Order doesn't matter. |
| New Apps Script deployment (new URL) | 1. Deploy new script. 2. Update `VITE_API_URL` in GitHub Secrets. 3. Update `.env` locally. 4. Push to trigger frontend rebuild. |

### Local development

```bash
npm install
npm run dev
```

The dev server reads `VITE_API_URL` from `.env` (gitignored). Make sure it matches the current deployment URL:

```
VITE_API_URL=https://script.google.com/macros/s/AKfycbwt3WFfB2v2jOf7VLXM-ssGABBf0TA9HkgXpiPo2bnTyAqC3ci4UG5FGoD0hV4hSgRFFQ/exec
```

If `.env` is missing or has no `VITE_API_URL`, the dev server falls back to in-memory mocks (no real data).

---

## Stack

React Three Fiber, Three.js, Zustand, Tailwind CSS, Vite

## Admin access

Append `?admin=lafayette1850` to activate admin features (persists to localStorage).
