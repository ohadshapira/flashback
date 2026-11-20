#!/usr/bin/env bash
# One-time setup of a fresh Debian/Ubuntu VM for flashback. Run it ON the VM:   bash vm-setup.sh
set -euo pipefail

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> 2 GB swap (a 1 GB VM runs out of memory while building the image without it)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> App folder"
mkdir -p "$HOME/flashback/data"
# the container runs as uid 1000 and must be able to write the database and photos here
sudo chown -R 1000:1000 "$HOME/flashback/data"

echo "==> Nightly cleanup of expired games (03:30)"
CRON_LINE="30 3 * * * bash $HOME/flashback/deploy/cleanup.sh >> $HOME/flashback/cleanup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'flashback/deploy/cleanup.sh' ; echo "$CRON_LINE" ) | crontab -

echo
echo "Done. Log out and back in once (so the docker group applies), upload the project to ~/flashback, create ~/flashback/.env, then:"
echo "  cd ~/flashback && docker compose up -d --build"
