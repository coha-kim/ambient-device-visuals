// Harvey WebSocket protocol and recovery model, v1. All durations are numbers.
export const RECOVERY_MULTIPLIER = 5;
export const BASE_ATTRACTION = 1.3;
export const OWNER_POPULATION = 1; // #2A9284, zero based.
export const newState = () => ({ phase: 'idle', intensity: 0, period: 0, holdDurationSeconds: 0, recoverySeconds: 0 });
export function recoveryRemaining(progress) {
  const t = Math.max(0, Math.min(1, progress));
  // Normalized exponential: a gentle tail, with an exact baseline at the end.
  return (Math.exp(-3 * t) - Math.exp(-3)) / (1 - Math.exp(-3));
}
export function sampleState(state, now) {
  const s = { ...state };
  if (s.phase === 'holding') {
    s.holdDurationSeconds = Math.max(0, (now - s.holdStartedAt) / 1000);
    s.period = Math.min(20, Math.max(s.period, s.holdDurationSeconds));
  } else if (s.phase === 'recovering') {
    const t = s.recoverySeconds > 0 ? (now - s.releasedAt) / (s.recoverySeconds * 1000) : 1;
    const remaining = recoveryRemaining(t);
    s.intensity = s.fromIntensity * remaining;
    s.period = s.fromPeriod * remaining;
    if (t >= 1) { s.phase = 'idle'; s.intensity = 0; s.period = 0; }
  }
  return s;
}
export function beginHold(state, now) {
  return { ...sampleState(state, now), phase: 'holding', holdStartedAt: now, holdDurationSeconds: 0, recoverySeconds: 0 };
}
export function endHold(state, now) {
  if (state.phase !== 'holding') return state;
  const s = sampleState(state, now);
  return { ...s, phase: 'recovering', releasedAt: now, fromIntensity: s.intensity, fromPeriod: s.period,
    recoverySeconds: s.holdDurationSeconds * RECOVERY_MULTIPLIER };
}
export const attractionFor = intensity => BASE_ATTRACTION * (1 - Math.max(0, Math.min(1, intensity)));

export function connectionOptions(location) {
  const query = new URLSearchParams(location.search);
  let endpoint = query.get('ws');
  if (!endpoint && /^\/(portable|ambient)\//.test(location.pathname)) {
    endpoint = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/socket`;
  }
  const room = query.get('room');
  if (!endpoint || !/^[a-f0-9]{32}$/.test(room || '')) return null;
  const url = new URL(endpoint);
  if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) return null;
  const rawPopulation = query.get('population');
  const population = rawPopulation === null ? OWNER_POPULATION : Number(rawPopulation);
  if (!Number.isInteger(population) || population < 0 || population > 2) return null;
  url.searchParams.set('room', room);
  url.searchParams.set('population', String(population));
  return { url, population };
}
export class HarveyLink {
  constructor({ role, onSnapshot = () => {}, onStatus = () => {}, location = globalThis.location }) {
    this.options = connectionOptions(location);
    this.onSnapshot = onSnapshot; this.onStatus = onStatus; this.role = role;
    this.snapshot = null; this.receivedAt = 0; this.attempt = 0; this.stopped = false;
    this.population = this.options?.population ?? OWNER_POPULATION;
    if (this.options) this.connect(); else onStatus('standalone');
  }
  connect() {
    if (this.stopped) return;
    this.onStatus('connecting');
    const url = new URL(this.options.url); url.searchParams.set('role', this.role);
    const socket = this.socket = new WebSocket(url);
    socket.addEventListener('open', () => { this.attempt = 0; this.onStatus('connected'); });
    socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'snapshot' && message.version === 1 && Array.isArray(message.states)) {
        this.snapshot = message; this.receivedAt = performance.now(); this.onSnapshot(message);
      } else if (message.type === 'error') this.onStatus(message.code);
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      this.onStatus('disconnected');
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), Math.min(10000, 500 * 2 ** this.attempt++));
    });
  }
  get connected() { return this.socket?.readyState === 1; }
  send(type, intensity) {
    if (!this.connected) return false;
    this.socket.send(JSON.stringify({ version: 1, type, ...(intensity === undefined ? {} : { intensity }) }));
    return true;
  }
  state(population = this.population) {
    if (!this.snapshot) return null;
    return sampleState(this.snapshot.states[population], this.snapshot.serverNow + performance.now() - this.receivedAt);
  }
  stop() { this.stopped = true; clearTimeout(this.retry); this.socket?.close(); }
}
