# Harvey on the Raspberry Pi (exhibition setup)

The Pi runs everything itself; no laptop is needed on the day.

| Piece | What it does | Restarts when |
|---|---|---|
| `harvey-relay.service` | Node relay (WebSocket for ambient + portables), serves the visuals, dashboard at `/dashboard`, freeze watchdog | it exits (2 s) |
| `harvey-kiosk.service` | Full-screen Chromium showing the ambient visuals | it exits (3 s), or the relay sees no frames for 30 s / fps < 5 / page disconnected (at most every 2 min) |
| Hardware watchdog | Reboots the Pi if the system hangs for 15 s | set by `root-setup.sh` |

Both services are user services of `pi-coha`, enabled at boot (linger is on, desktop autologin is on). `root-setup.sh` removes the desktop panel and icons from `/etc/xdg/labwc/autostart` (original saved as `autostart.harvey-backup`; copy it back to restore the normal desktop).

## Addresses

| | Home Wi-Fi (now) | Exhibition hotspot |
|---|---|---|
| SSH | `ssh -i ~/.ssh/harvey-pi_v1 pi-coha@raspberrypi-coha.local` | `ssh -i ~/.ssh/harvey-pi_v1 pi-coha@10.42.0.1` |
| Dashboard | http://raspberrypi-coha.local:8787/dashboard | http://10.42.0.1:8787/dashboard |
| Terminal monitor (on the Pi) | `~/harvey/ambient-device-visuals/pi/status.py --watch` | same |

The fixed exhibition room is in `exhibition-config.json`. Web portable for testing: `http://<pi>:8787/portable/?room=<room>&population=1`.

## Commands

- Deploy after editing on the Mac: `pi/deploy.sh` (copies both projects to `~/harvey/` and restarts services).
- One-time system settings (watchdog, no blanking, no auto-updates, hotspot profile): `sudo ~/harvey/ambient-device-visuals/pi/root-setup.sh`
- Hotspot: `sudo ~/harvey/ambient-device-visuals/pi/hotspot.sh on` / `off`. It stays on across reboots until turned off. Name and password are in `pi/hotspot.local.env` (not in git). Turning it on drops SSH over home Wi-Fi; join the hotspot to reconnect. While the Mac is on the hotspot it has no internet.
- Logs: `journalctl --user -u harvey-relay -f`, `journalctl --user -u harvey-kiosk -f`.

## Portable device (ESP32) protocol

Connect: `ws://10.42.0.1:8787/socket?room=<room>&role=portable&population=<0|1|2>`. Each portable owns one population, set in its firmware; one holder per population at a time (`population-busy` error otherwise).

Send JSON text frames: `{"version":1,"type":"hold"}` on press, `{"version":1,"type":"intensity","intensity":0..1}` while held (at least every 2.5 s, at most 60 messages/s), `{"version":1,"type":"release"}` on release. Silence for 2.5 s while held releases automatically.

The relay sends `{"type":"snapshot","serverNow":…, "states":[…3]}` immediately on connect and every 100 ms. For its own population a portable that just woke up reads:

- `phase`: `idle`, `holding` or `recovering`
- `intensity`: current value, already decayed
- `recoverySeconds`: total natural decay for the last hold (5× hold, 30–120 s)
- `recoveryElapsedSeconds`, `recoveryRemainingSeconds`: where in that decay it is now
- `holdDurationSeconds`, `fromIntensity`: the hold that started it

Use the relative seconds, not `serverNow`: the Pi has no internet time on the hotspot, so its wall clock may be wrong, while the relative values are always right. The decay curve is `recoveryRemaining()` in `harvey-link-v1.mjs`.
