#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run this installer as root inside your Nest container.' >&2
  exit 1
fi
if [ "$(pwd -P)" != /opt/nullo ]; then
  printf '%s\n' 'Clone the bot to /opt/nullo and run this from /opt/nullo.' >&2
  exit 1
fi
if ! /usr/bin/node -e 'if(process.versions.node.split(".")[0] !== "24") process.exit(1)'; then
  printf '%s\n' 'Install Node.js 24 at /usr/bin/node first; see README.md.' >&2
  exit 1
fi

getent passwd nullo >/dev/null || useradd --system --user-group --home-dir /var/lib/nullo --shell /usr/sbin/nologin nullo
install -d -o nullo -g nullo -m 700 /var/lib/nullo
install -d -m 700 /etc/nullo
npm ci --omit=dev
PLAYWRIGHT_BROWSERS_PATH=/opt/nullo-browsers npx playwright install --with-deps chromium
chmod -R a+rX /opt/nullo-browsers
if [ ! -f /etc/nullo/bot.env ]; then
  install -m 600 deploy/bot.env.example /etc/nullo/bot.env
fi
install -m 644 deploy/nullo.service /etc/systemd/system/nullo.service
systemctl daemon-reload
printf '%s\n' 'Installed. Now edit /etc/nullo/bot.env, then run systemctl enable --now nullo.service.'

