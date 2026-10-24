#!/bin/sh
# Run on the Mac: copy both projects to the Pi and (re)start the exhibition services.
set -e
PI=${PI:-pi-coha@raspberrypi-coha.local}
SSH="ssh -i $HOME/.ssh/harvey-pi_v1 -o IdentitiesOnly=yes"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
$SSH "$PI" 'mkdir -p ~/harvey'
rsync -az --delete -e "$SSH" --exclude .git --exclude .DS_Store --exclude versions --exclude reports --exclude research_notes \
  "$ROOT/ambient-device-visuals" "$PI:harvey/"
rsync -az --delete -e "$SSH" --exclude .git --exclude .DS_Store --exclude versions --exclude tests --exclude .claude \
  "$ROOT/portable-device-visuals" "$PI:harvey/"
$SSH "$PI" 'set -e
  A=~/harvey/ambient-device-visuals/pi
  mkdir -p ~/.config/systemd/user ~/.config/labwc
  cp $A/systemd/*.service ~/.config/systemd/user/
  cp $A/labwc-autostart ~/.config/labwc/autostart
  systemctl --user stop harvey-ambient-display-v2 harvey-ambient-preview-v2 2>/dev/null || true
  systemctl --user daemon-reload
  systemctl --user enable harvey-relay.service harvey-kiosk.service
  systemctl --user restart harvey-relay.service harvey-kiosk.service
  sleep 3; systemctl --user is-active harvey-relay.service harvey-kiosk.service'
