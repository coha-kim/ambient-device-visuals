#!/usr/bin/env python3
"""Terminal monitor over SSH: same data as the dashboard. Usage: status.py [--watch]"""
import json, sys, time, urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # SSH sessions may arrive with a latin-1 locale

def show():
    try:
        s = json.load(urllib.request.urlopen('http://127.0.0.1:8787/api/status', timeout=5))
    except Exception as e:
        print(f'Relay not reachable: {e}\nCheck: systemctl --user status harvey-relay'); return
    g, p, n = s['graphics'], s['pi'], s['network']
    k = g['kiosk'] or {}
    print(time.strftime('%H:%M:%S'), '— Harvey')
    print(f"Visuals  {g['fps'] if g['fps'] is not None else 'no frames'} fps · page {'connected' if g['ambientConnected'] else 'NOT connected'}"
          f" · kiosk {k.get('state')} · {k.get('restarts', 0)} restarts")
    print(f"Pi       {p['tempC']} °C · {p['supplyVolts']} V · fan {p['fanRpm']} rpm · load {p['load'][0]} · "
          f"warnings: {', '.join(p['throttledFlags']) or 'none'}")
    w = n['wifi'] or {}
    print(f"Network  {w.get('connection', 'Wi-Fi off')} ({w.get('mode')}) · " + ', '.join(a['address'] for a in n['addresses'])
          + (f" · hotspot devices: {len(n['hotspotClients'])}" if w.get('mode') == 'hotspot' else ''))
    for c in s['clients']:
        pop = f" pop {c['population']}" if c['role'] == 'portable' else ''
        print(f"Socket   {c['role']}{pop} {c['ip']} · up {c['connectedSeconds']}s · last msg {c['lastMessageSeconds']}s ago")
    for q in s['populations']:
        if q['phase'] != 'idle':
            print(f"Pop {q['population']}    {q['phase']} · intensity {q['intensity']} · {q['recoveryRemainingSeconds']}s recovery left")
    for e in s['events'][-5:]:
        print(time.strftime('  %H:%M:%S', time.localtime(e['at'] / 1000)), e['message'])

if '--watch' in sys.argv:
    while True:
        print('\033[2J\033[H', end=''); show(); time.sleep(2)
else:
    show()
