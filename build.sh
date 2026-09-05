#!/bin/sh
# Build Astar Care: concat parts into index.html, then derive the admin-portal
# copy with its own title, manifest and home-screen icon (so "Add to Home
# Screen" on /admin opens the ADMIN portal, not start_url "/").
cd "$(dirname "$0")"
cat parts/p1_head.html parts/p2_core.js parts/p3_shell.js parts/p4_worker.js \
    parts/p5_note_incident.js parts/p6_calendar.js parts/p7_roster.js \
    parts/p8_admin_rest.js parts/p9_evidence.js > index.html
printf '</script>\n</body>\n</html>\n' >> index.html
mkdir -p admin
# stamp the build version (drives the auto-reload of stale installed apps)
V=$(date +%Y%m%d%H%M%S)
sed -i "s|__BUILD__|$V|" index.html
printf '{"v":"%s"}\n' "$V" > version.json
sed -e 's|<title>Astar Care</title>|<title>Astar Care Admin</title>|' \
    -e 's|href="/manifest.json"|href="/admin/manifest.json"|' \
    -e 's|<link rel="apple-touch-icon" href="/icon-192.png">|<link rel="apple-touch-icon" href="/icon-admin-192.png">|' \
    index.html > admin/index.html
echo "built index.html + admin/index.html (v$V)"
