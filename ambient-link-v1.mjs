import { HarveyLink, attractionFor } from './harvey-link-v1.mjs';
const link = new HarveyLink({ role: 'ambient', onStatus(status) {
  document.documentElement.dataset.harveyConnection = status;
} });
// Called by the sketch before its physics step; only attraction is exposed.
window.harveyAmbientV1 = { link, update() {
  if (!link.snapshot) return;
  const attractionStrengths = link.snapshot.states.map((_, population) => attractionFor(link.state(population).intensity));
  window.updateParamsFromSensor({ attractionStrengths });
} };
// Render health for the Pi dashboard and freeze watchdog: browser frame rate every 2 seconds.
let frames = 0, since = performance.now();
(function count() { frames++; requestAnimationFrame(count); })();
setInterval(() => {
  const now = performance.now(), fps = Math.round(frames * 10000 / (now - since)) / 10;
  frames = 0; since = now;
  if (link.connected) link.socket.send(JSON.stringify({ version: 1, type: 'stats', fps, width: innerWidth, height: innerHeight }));
}, 2000);
