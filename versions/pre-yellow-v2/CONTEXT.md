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
