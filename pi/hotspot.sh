#!/bin/sh
# Switch the Pi's Wi-Fi between the exhibition hotspot and its usual network.
#   sudo hotspot.sh on   -> broadcasts the hotspot now and after every boot (Pi at 10.42.0.1)
#   sudo hotspot.sh off  -> back to the usual Wi-Fi
# Your SSH session over the usual Wi-Fi drops when the hotspot turns on; rejoin via the hotspot.
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
case "$1" in
  on)  nmcli con modify harvey-hotspot connection.autoconnect yes
       # Run detached so the switch completes even though this SSH session is about to drop.
       nohup nmcli con up harvey-hotspot >/tmp/harvey-hotspot.log 2>&1 &
       echo "Hotspot starting. Join it, then: ssh pi-coha@10.42.0.1 — dashboard: http://10.42.0.1:8787/dashboard" ;;
  off) nmcli con modify harvey-hotspot connection.autoconnect no
       nohup sh -c 'nmcli con down harvey-hotspot; nmcli dev wifi rescan; sleep 3; nmcli dev connect wlan0' >/tmp/harvey-hotspot.log 2>&1 &
       echo "Hotspot off; reconnecting to the usual Wi-Fi." ;;
  *)   nmcli -t -f NAME,DEVICE con show --active | grep -q '^harvey-hotspot:' && echo "Hotspot is on" || echo "Hotspot is off"
       echo "Usage: sudo $0 on|off" ;;
esac
