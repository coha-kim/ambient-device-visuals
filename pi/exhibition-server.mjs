// Exhibition relay for the Pi: the Harvey WebSocket relay plus a monitoring dashboard and a visuals freeze watchdog.
import os from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarveyServer } from '../../portable-device-visuals/connection-v1/server-v1.mjs';
import { sampleState } from '../harvey-link-v1.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(resolve(here, 'exhibition-config.json'), 'utf8'));
const run = promisify(execFile);
const sh = async (cmd, args) => { try { return (await run(cmd, args, { timeout: 3000 })).stdout.trim(); } catch { return null; } };
const startedAt = Date.now();

// Recent notable events, newest last, for the dashboard.
const events = [];
function log(level, message) {
  events.push({ at: Date.now(), level, message }); if (events.length > 80) events.shift();
  console.log(`[${level}] ${message}`);
}

const { server, wss, rooms } = createHarveyServer({ onRequest });
const label = ws => `${ws.role}${ws.role === 'portable' ? ` pop ${ws.population}` : ''} (${ws.ip})`;
wss.on('connection', ws => {
  ws.ip = ws._socket?.remoteAddress?.replace('::ffff:', '') || '?';
  log('info', `${label(ws)} connected${ws.roomId === config.room ? '' : ' to a non-exhibition room'}`);
  ws.on('close', code => log(ws.role === 'ambient' ? 'warn' : 'info', `${label(ws)} disconnected (${code})`));
});

const throttleBits = { 0: 'under-voltage now', 1: 'frequency capped now', 2: 'throttled now', 3: 'soft temp limit now',
  16: 'under-voltage since boot', 17: 'frequency capped since boot', 18: 'throttled since boot', 19: 'soft temp limit since boot' };

async function fanRpm() {
  for (const dir of await readdir('/sys/class/hwmon').catch(() => [])) {
    const rpm = await readFile(`/sys/class/hwmon/${dir}/fan1_input`, 'utf8').catch(() => null);
    if (rpm !== null) return Number(rpm);
  }
  return null;
}

async function kioskService() {
  const out = await sh('systemctl', ['--user', 'show', 'harvey-kiosk.service', '-p', 'ActiveState,NRestarts,ActiveEnterTimestampMonotonic']);
  if (!out) return null;
  const p = Object.fromEntries(out.split('\n').map(l => l.split('=')));
  const uptimeUs = Number(p.ActiveEnterTimestampMonotonic) ? os.uptime() * 1e6 - Number(p.ActiveEnterTimestampMonotonic) : 0;
  return { state: p.ActiveState, restarts: Number(p.NRestarts) || 0, activeSeconds: Math.max(0, Math.round(uptimeUs / 1e6)) };
}

async function network() {
  const devices = (await sh('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'dev']) || '').split('\n').filter(Boolean)
    .map(l => { const [device, type, state, connection] = l.split(':'); return { device, type, state, connection }; })
    .filter(d => ['wifi', 'ethernet'].includes(d.type));
  const wifi = devices.find(d => d.type === 'wifi' && d.connection);
  const mode = wifi ? await sh('nmcli', ['-g', '802-11-wireless.mode', 'con', 'show', wifi.connection]) : null;
  let signal = null, channel = null;
  if (mode === 'infrastructure') {
    const active = (await sh('nmcli', ['-t', '-f', 'ACTIVE,SIGNAL,CHAN', 'dev', 'wifi']) || '').split('\n').find(l => l.startsWith('yes:'));
    if (active) [, signal, channel] = active.split(':').map(Number);
  }
  const addresses = Object.entries(os.networkInterfaces()).filter(([n]) => n !== 'lo')
    .flatMap(([n, list]) => list.filter(a => a.family === 'IPv4').map(a => ({ interface: n, address: a.address })));
  // Devices on the hotspot that the Pi has recently exchanged packets with.
  const neighbours = wifi && mode === 'ap' ? (await sh('ip', ['-4', 'neigh', 'show', 'dev', wifi.device]) || '').split('\n')
    .filter(l => /REACHABLE|STALE|DELAY|PROBE/.test(l)).map(l => ({ address: l.split(' ')[0], state: l.trim().split(' ').pop() })) : [];
  return { devices, wifi: !wifi ? null : { connection: wifi.connection, mode: mode === 'ap' ? 'hotspot' : 'client', signal, channel },
    hotspotClients: neighbours, addresses };
}

let lastThrottled = 0;
async function pi() {
  const temp = Number(await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8').catch(() => NaN)) / 1000;
  const throttledHex = await sh('vcgencmd', ['get_throttled']);
  const throttled = throttledHex ? parseInt(throttledHex.split('=')[1], 16) : 0;
  const flags = Object.entries(throttleBits).filter(([bit]) => throttled & (1 << bit)).map(([, name]) => name);
  if ((throttled & 0xf) && !(lastThrottled & 0xf)) log('warn', `Pi reports: ${flags.join(', ')}`);
  lastThrottled = throttled;
  const volts = await sh('vcgencmd', ['pmic_read_adc', 'EXT5V_V']);
  return { model: (await readFile('/proc/device-tree/model', 'utf8').catch(() => '')).replace(/\0/g, ''),
    tempC: Number.isFinite(temp) ? Math.round(temp * 10) / 10 : null, throttledFlags: flags,
    supplyVolts: volts ? Number(volts.split('=').pop().replace('V', '')) : null, fanRpm: await fanRpm(),
    load: os.loadavg().map(n => Math.round(n * 100) / 100), cpus: os.cpus().length,
    memoryUsedPercent: Math.round((1 - os.freemem() / os.totalmem()) * 100), uptimeSeconds: Math.round(os.uptime()) };
}

function connections() {
  const now = Date.now(), room = rooms.get(config.room);
  const clients = [...wss.clients].map(ws => ({ role: ws.role, population: ws.population, ip: ws.ip, exhibitionRoom: ws.roomId === config.room,
    connectedSeconds: Math.round((now - ws.connectedAt) / 1000), lastMessageSeconds: Math.round((now - ws.lastMessageAt) / 1000) }));
  const populations = (room?.states || []).map((s, i) => {
    const v = sampleState(s, now);
    return { population: i, phase: v.phase, intensity: Math.round(v.intensity * 1000) / 1000, holder: !!room.holders[i],
      recoveryRemainingSeconds: v.phase === 'recovering' ? Math.max(0, Math.round(v.recoverySeconds - (now - v.releasedAt) / 1000)) : 0 };
  });
  return { clients, populations };
}

function graphics(kiosk) {
  const ambient = [...wss.clients].filter(ws => ws.role === 'ambient' && ws.roomId === config.room);
  const stats = ambient.map(ws => ws.stats).filter(Boolean).sort((a, b) => b.at - a.at)[0];
  return { kiosk, ambientConnected: ambient.length > 0, fps: stats?.fps ?? null, viewport: stats ? `${stats.width}×${stats.height}` : null,
    lastReportSeconds: stats ? Math.round((Date.now() - stats.at) / 1000) : null };
}

let lastStatus = null;
async function status() {
  const [piStatus, net, kiosk] = await Promise.all([pi(), network(), kioskService()]);
  lastStatus = { at: Date.now(), relayUptimeSeconds: Math.round((Date.now() - startedAt) / 1000), room: config.room,
    pi: piStatus, network: net, graphics: graphics(kiosk), ...connections(), events: events.slice(-40) };
  return lastStatus;
}

// Restart the kiosk when the visuals stop reporting frames (frozen renderer, crashed tab, lost socket).
let lastKioskRestart = 0;
async function restartKiosk(reason) {
  lastKioskRestart = Date.now(); log('warn', `Restarting visuals: ${reason}`);
  await sh('systemctl', ['--user', 'restart', 'harvey-kiosk.service']);
}
setInterval(async () => {
  const kiosk = await kioskService(), g = graphics(kiosk);
  if (kiosk?.state !== 'active' || kiosk.activeSeconds < config.watchdog.graceSeconds) return;
  if (Date.now() - lastKioskRestart < config.watchdog.minRestartIntervalSeconds * 1000) return;
  if (!g.ambientConnected) await restartKiosk('display page is not connected');
  else if (g.lastReportSeconds === null || g.lastReportSeconds > config.watchdog.staleSeconds) await restartKiosk('display page stopped reporting frames');
  else if (g.fps !== null && g.fps < config.watchdog.minFps) await restartKiosk(`frame rate dropped to ${g.fps} fps`);
}, 10000).unref();

async function onRequest(req, res, url) {
  if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(resolve(here, 'dashboard.html'))); return true;
  }
  if (url.pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await status())); return true;
  }
  if (url.pathname === '/api/restart-visuals' && req.method === 'POST') {
    await restartKiosk('requested from dashboard'); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return true;
  }
  return false;
}

server.listen(config.port, config.host, () => log('info', `Exhibition relay on http://${config.host}:${config.port}/ — dashboard at /dashboard`));
