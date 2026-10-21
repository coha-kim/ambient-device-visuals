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
