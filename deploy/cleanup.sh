#!/usr/bin/env bash
# Deletes expired games and orphaned media (the app also does this opportunistically). Run by cron on the VM.
cd "$(dirname "$0")/.." || exit 1
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/cron/cleanup',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"
