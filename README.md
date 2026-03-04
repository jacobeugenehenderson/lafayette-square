# Lafayette Square

3D neighborhood visualization of Lafayette Square, St. Louis.

**Live site:** https://lafayette-square.com

---

## Local development

```bash
npm install
npm run dev
```

The dev server reads `VITE_API_URL` from `.env` (gitignored). Make sure it matches the current deployment URL:

```
VITE_API_URL=https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec
```

If `.env` is missing or has no `VITE_API_URL`, the dev server falls back to in-memory mocks (no real data).

## Stack

React Three Fiber, Three.js, Zustand, Tailwind CSS, Vite

## Admin access

Append `?admin=lafayette1850` to activate admin features (persists to localStorage).

## Publishing

See [PUBLISH.md](PUBLISH.md) for deployment procedures (frontend, backend, DNS, worker).
