# Astar Care

Care-operations web app for **Astar Health Service** — rostering, shift notes, incident reports, clock in/out, availability and fortnightly pay, in one self-contained `index.html`.

- **Stack:** vanilla HTML/CSS/JS (no build step), Supabase (database · auth · storage)
- **Admin sign-in:** PIN pad
- **Workers:** email + password (forced password change on first sign-in)

## Run locally

```bash
node server.js
```

- Worker portal: http://localhost:8766
- Admin portal: http://localhost:8766/admin

## Deploy

Static host — serve the repo root (Render Static Site: build command empty, publish directory `.`). `/` is the worker portal, `/admin/` the admin portal.

## Layout

| File | What it is |
|---|---|
| `index.html` | The whole app (worker portal) |
| `admin/index.html` | Same app served at `/admin` — shows only the admin PIN sign-in |
| `sw.js` | Service worker for web-push notifications |
| `manifest.json`, `icon-*.png` | PWA manifest and icons (needed for iPhone notifications) |
| `server.js` | Tiny local dev server (plain Node http, no deps) |
| `parts/` | Source sections concatenated into `index.html` by `build.sh` (`p11_pdf.js` is the dependency-free PDF writer behind Export records → Save as PDF) |

Push notifications are sent by the Supabase Edge Function `push` (VAPID web push); device subscriptions live in `ac_push_subs`.

To rebuild after editing a part:

```bash
./build.sh
```
