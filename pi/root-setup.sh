#!/bin/sh
# One-time system settings that need sudo. Run on the Pi: sudo ~/harvey/ambient-device-visuals/pi/root-setup.sh
set -e
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
HERE=$(dirname "$(readlink -f "$0")")
. "$HERE/hotspot.local.env"

# Hardware watchdog: if the Pi itself hangs, it reboots within 15 s and the services start again.
mkdir -p /etc/systemd/system.conf.d
printf '[Manager]\nRuntimeWatchdogSec=15s\nRebootWatchdogSec=2min\n' > /etc/systemd/system.conf.d/harvey-watchdog.conf
systemctl daemon-reexec

# No screen blanking, and no background package updates competing with the visuals during opening hours.
raspi-config nonint do_blanking 1 || true
systemctl disable --now apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true

# No taskbar or desktop icons behind the kiosk (its notifications could draw over the visuals). labwc -m merges
# the system autostart with the user one, so they must be removed here. Original kept as autostart.harvey-backup.
[ -f /etc/xdg/labwc/autostart.harvey-backup ] || cp /etc/xdg/labwc/autostart /etc/xdg/labwc/autostart.harvey-backup
sed -i -E 's@^(/usr/bin/lwrespawn /usr/bin/(pcmanfm-pi|wf-panel-pi).*)@# harvey: \1@' /etc/xdg/labwc/autostart

# Exhibition hotspot profile, created switched off. Turn it on with: sudo .../pi/hotspot.sh on
nmcli con delete harvey-hotspot 2>/dev/null || true
nmcli con add type wifi ifname wlan0 con-name harvey-hotspot autoconnect no ssid "$HOTSPOT_SSID" \
  802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel 6 \
  ipv4.method shared ipv4.addresses 10.42.0.1/24 ipv6.method disabled \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$HOTSPOT_PASSWORD" wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp
nmcli con modify harvey-hotspot connection.autoconnect-priority 100 802-11-wireless.powersave 2
echo "Done. Watchdog on, blanking off, auto-updates off, hotspot '$HOTSPOT_SSID' ready (off)."
