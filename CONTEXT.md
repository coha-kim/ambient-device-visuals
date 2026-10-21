# Project context

Updated: 2026-10-07

## Purpose and source

A new independent project and public GitHub repository named `ambient-device-visuals`, outside `capstone-poc`, with fresh Git history. Source: only the `capstone-poc/orbmerge` folder, copied on 2026-10-07. The source project is untouched.

## Requested changes

Preserve original Orbmerge visuals and movements. Replace editable colours with fixed shades based on #2A9284: dark #1D665C, base #2A9284, light #6AB3A9. Each orb still has a smooth radial gradient toward a lighter centre. No colour UI or sensor colour mutation remains.

## Current behaviour

- 3 populations, 5 orbs each; original 1024 x 600 canvas.
- Independent Perlin-noise wander; per-population speed.
- Cross-population attraction, repulsion and hard separation; reversible metaball merging.
- Single SVG goo-filter pass over radial-gradient discs, half-resolution buffers.
- Overall size, per-population speed and attraction controls, reset and FPS retained.
- updateParamsFromSensor remains a stub for size, speed and attraction; no network transport is included.
- No gallery navigation or dependencies on sibling projects.

## Scope boundaries

This is the original desktop sketch extraction, not orbmerge-mobile, the separate ~/orbmerge project, or the orbmerge-display WebSocket project. Earlier phone/Pi/network plans are background only; this extraction does not implement phone controls, kiosk startup or full-viewport rendering. Hardware performance on Raspberry Pi 5 and the 7-inch XC9026 display remains unverified.

## Files and dependencies

index.html loads pinned p5.js 2.3.1 from jsDelivr and sketch.js. README.md gives local serving instructions. Internet is currently required for p5.js. No npm build is needed.

## Working preferences

Keep this project independent. Ask for clarification when scope is unclear. Avoid repeating prior explanations, and maintain this context file when project scope or behaviour changes.

## WebSocket v1 — 2026-10-19 (supersedes network status above)

The existing local edits hiding controls are preserved. `ambient-link-v1.mjs` uses `harvey-link-v1.mjs` to receive room snapshots and calls `updateParamsFromSensor` before physics in `draw()`. Only attraction changes: `1.3 * (1 - intensity)` on the selected population (default 1, #2A9284). Stronger shake creates greater separation from other populations. Full button-hold duration sets recovery at 10× hold time, using the relay's clock and the same recovery curve as portable. Size, speed, rendering and autonomous wander are unchanged. Relay and phone HTTPS/WSS instructions live in the sibling portable repo's `connection-v1/README-v1.md`. Original entry files including local unsaved edits are saved in `versions/pre-websocket-v1/`. No GitHub Pages deployment or physical-phone validation is implied.

## Yellow visibility v2 — 2026-10-19

For testing, the portable-controlled population (index 1) is yellow #FFD84D on the ambient display. Only its display colour and the sketch cache version changed. The other populations, gradient lightening, physics and interaction mapping are unchanged. Pre-change files are saved in `versions/pre-yellow-v2/`. Pressing without shaking does not reduce attraction; held shaking accumulates intensity. At intensity >= approximately 0.5385, attraction reaches the <=0.6 bounce-only setting.

## Recovery tuning v4 — 2026-10-19

Current recovery multiplier is 5: a hold lasting N seconds returns both visuals to baseline over 5N seconds after release. This supersedes earlier 10× values. Hold-only input, intensity build-up, yellow population and the recovery curve are unchanged. Backups are in `versions/pre-recovery-v4/`.

## Recovery range v5 — 2026-10-19

Current recovery is 5× the full hold duration, clamped to 30–120 seconds for any positive hold. A zero-duration no-op has zero recovery. Examples: 3s → 30s; 10s → 50s; 24s or longer → 120s. This supersedes the unbounded v4 timing. Both copies of `harvey-link-v1.mjs` use `recoverySecondsFor`. The hold-only input and decay curve are unchanged. Backups are in `versions/pre-recovery-v5/`.

## Reference palette v6 — 2026-10-20

Sampled the centres of the supplied palette image: #009A8A, #3CBDAF, #77EDD7, #E1EBD7, #CAE7AD, left to right. There are three ambient populations, so their base colours use the first three in that order. The portable renderer matches its default owner, population index 1, with #3CBDAF. Both retain lightened centres. The temporary yellow is replaced by this palette. Recovery, interaction, population counts and background colours are unchanged. Pre-change files are saved in `versions/pre-palette-v6/`.

## Larger blobs v7 — 2026-10-20

Blob radius increased by 25% in both visuals. Ambient overallSize is 65 (previously 52). Portable uses 0.10625 of the shorter viewport dimension, clamped to 27.5–65 px (previously 0.085, clamped to 22–52 px). Palette v6 and the 30–120 second recovery remain. Pre-change files are saved in `versions/pre-size-v7/`.
