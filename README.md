# Astar Care

Care-operations web app for **Astar Health Service** — rostering, shift notes, incident reports, clock in/out, availability and fortnightly pay, in one self-contained `index.html`.

- **Stack:** vanilla HTML/CSS/JS (no build step), Supabase (database · auth · storage)
- **Admin sign-in:** PIN pad
- **Workers:** email + password (forced password change on first sign-in)

## Run locally

```bash
node server.js
```

Then open http://localhost:8766.

## Deploy

Static host — serve `index.html` from the repo root (Render Static Site: build command empty, publish directory `.`).

## Layout

| File | What it is |
|---|---|
| `index.html` | The whole app |
| `server.js` | Tiny local dev server (plain Node http, no deps) |
| `parts/` | Source sections concatenated into `index.html` (head/CSS, core, shell, worker, notes+incidents, calendar, roster, admin) |

To rebuild `index.html` after editing a part:

```bash
cat parts/p1_head.html parts/p2_core.js parts/p3_shell.js parts/p4_worker.js parts/p5_note_incident.js parts/p6_calendar.js parts/p7_roster.js parts/p8_admin_rest.js > index.html && printf '</script>\n</body>\n</html>\n' >> index.html
```
