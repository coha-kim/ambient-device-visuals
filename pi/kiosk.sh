#!/bin/sh
# Full-screen Chromium showing the ambient visuals. Run by harvey-kiosk.service, which restarts it if it exits.
export XDG_RUNTIME_DIR="/run/user/$(id -u)" WAYLAND_DISPLAY=wayland-0
ROOM=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["room"])' "$(dirname "$0")/exhibition-config.json")

# Wait for the desktop session and the relay after boot.
until [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ]; do sleep 1; done
until curl -sf http://127.0.0.1:8787/health >/dev/null; do sleep 1; done

PROFILE="$HOME/.config/harvey-kiosk"
# A crash or power cut must never show Chromium's "restore pages" prompt.
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PROFILE/Default/Preferences" 2>/dev/null

exec /usr/bin/chromium --ozone-platform=wayland --kiosk --user-data-dir="$PROFILE" \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run --password-store=basic \
  --disable-pinch --overscroll-history-navigation=0 --disable-features=Translate,TouchpadOverscrollHistoryNavigation \
  --check-for-update-interval=31536000 --autoplay-policy=no-user-gesture-required \
  "http://127.0.0.1:8787/ambient/?room=$ROOM"
