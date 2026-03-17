# Lafayette Square

3D neighborhood visualization of Lafayette Square, St. Louis.

**Live site:** https://lafayette-square.com

---

## Local development

```bash
npm install
npm run dev
```

The dev server reads environment variables from `.env` (gitignored):

```
VITE_API_URL=https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec
VITE_SUPABASE_URL=https://ngbvgjzrpnfrqmzkqvch.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

If `VITE_API_URL` is missing, the dev server falls back to in-memory mocks (no real data).
If `VITE_SUPABASE_URL` is missing, the Supabase client returns a safe stub (Cary features inert).

## Stack

React Three Fiber, Three.js, Zustand, Tailwind CSS, Vite, Supabase (Cary courier system)

## Backend

- **Apps Script** (`apps-script/Code.js`) — listings, reviews, events, check-ins, residence, guardian claims, QR designs
- **Supabase** — Cary courier system (requests, sessions, auth). Not yet live.
- **Cloudflare Worker** (`worker.js`) — OG meta tags for social link previews

## Admin access

Append `?admin` to any URL to trigger the admin login prompt. The passphrase is validated server-side and a session token is issued (valid 6 hours, stored in sessionStorage). Use `?logout` to end the session.

Set the passphrase in Apps Script: `PropertiesService.getScriptProperties().setProperty('ADMIN_PASSPHRASE', 'your-secret')`

## Publishing

See [PUBLISH.md](PUBLISH.md) for deployment procedures (frontend, backend, DNS, worker).
