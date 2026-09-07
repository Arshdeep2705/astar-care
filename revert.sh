#!/bin/sh
# One-word rollback to the CLASSIC app (git tag "classic" = the app as it was before the
# 2026-09 UI/evidence rework).  Run from the Astar Care folder:
#   sh revert.sh all        -> whole app back to classic (a new commit; nothing is lost)
#   sh revert.sh worker     -> just the worker screens
#   sh revert.sh roster     -> just the admin roster
#   sh revert.sh admin      -> the other admin screens (inbox/availability/pay/team)
#   sh revert.sh summary    -> the Reports/Summary tab + export
#   sh revert.sh design     -> just the CSS/design tokens (p1_head.html)
#   sh revert.sh notes      -> shift-note / incident editor screens
#   sh revert.sh calendar   -> worker calendar
#   sh revert.sh undo       -> undo the last revert (git revert of the revert)
# Then: sh build.sh && git push   (push = deploy).  Compare first: git diff classic -- parts/
cd "$(dirname "$0")"
case "$1" in
  all)      git checkout classic -- parts/ build.sh index.html admin/index.html version.json ;;
  worker)   git checkout classic -- parts/p4_worker.js parts/p3_shell.js ;;
  roster)   git checkout classic -- parts/p7_roster.js ;;
  admin)    git checkout classic -- parts/p8_admin_rest.js ;;
  summary)  git checkout classic -- parts/p9_evidence.js parts/p10_export.js ;;
  design)   git checkout classic -- parts/p1_head.html ;;
  notes)    git checkout classic -- parts/p5_note_incident.js ;;
  calendar) git checkout classic -- parts/p6_calendar.js ;;
  undo)     git revert --no-edit HEAD; exit $? ;;
  *) echo "usage: sh revert.sh all|worker|roster|admin|summary|design|notes|calendar|undo"; exit 1 ;;
esac
sh build.sh && git add -A && git commit -q -m "Revert '$1' to classic (tag classic)" && echo "Reverted '$1' to classic. Now: git push  (to deploy)"
