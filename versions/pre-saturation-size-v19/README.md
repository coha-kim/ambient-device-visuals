# Ambient Device Visuals

Standalone p5.js visuals extracted from the original `capstone-poc/orbmerge` sketch.

Three populations of two to four smooth gradient metaball boids move freely and are differentiated by colour. Each population has one master blob, randomly 5–10 px larger than its children; children retain randomized sizes up to 20 px below the base size. Blob display size uses a moderate 1.4 scale tuning. Boids use independent zero-mean Perlin wandering with edge steering only; there is no gravity, population roaming target, or attraction during free movement. Their movement speed varies smoothly between slow and faster phases with a nonzero minimum, so they never become static. Boids interact across populations only within an attraction-dependent collision radius; contact immediately produces a shared metaball merge. Merged fields blend population colours naturally, with a subtle colour-tinted ring around each blob so merged populations remain readable without hard boundaries. All populations now start with the same baseline inter-population attraction, while portable-device values can adjust each population from that baseline. Portable-device attraction values control only these inter-population collision radii and responses. Near canvas walls, reflected field influence slightly deforms blobs instead of leaving a perfect clipped circle. The canvas background is `#2F302F` with a white page margin for visibility. Autonomous movement uses a 0.9 px/frame base speed with a smooth speed envelope. Fixed population colours: `#33C4A0`, `#C6E2B6`, `#DCEBD3`, with lighter centres.

## Run

From this project directory:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Internet access is needed to load the pinned p5.js 2.3.1 CDN dependency. Chromium is recommended for the source sketch's SVG canvas filter.

The canvas and metaball field are calculated at the display's native 1024 × 600 resolution, with pixel density fixed to 1. Blob size is doubled for fuller display coverage while each blob retains its randomized ±20 px radius variation. The expensive full-resolution field updates at 30 Hz while the display continues presenting it at the browser frame rate. This avoids field-grid upscaling and stair-stepped contours. Existing local edits hide the controls. There is no colour picker.

See [CONTEXT.md](CONTEXT.md) for project history and scope.

## WebSocket v1

From the sibling `portable-device-visuals` repository, run `npm install` then `npm run bridge`. Open http://127.0.0.1:8787/ and use the two pairing links. `ambient-link-v1.mjs` maps each portable population's intensity from the shared `0.8` baseline, then restores baseline over 5× its full button-hold duration. Size and drift speed stay independent.

Existing local edits hiding the controls were preserved. Pre-connection entry files are under `versions/pre-websocket-v1/`. See the portable project's `connection-v1/README-v1.md` for secure phone access and tuning. Physical phone/display feel remains unverified.

Yellow visibility v2: population index 1 is temporarily #FFD84D for interaction testing. Only its colour changes; hold/shake mapping, merge physics and recovery remain the same. Pre-change files are in `versions/pre-yellow-v2/`.

Recovery v5: after any positive hold, recovery lasts at least 30 seconds and at most 2 minutes. The middle range follows 5× the full hold duration (e.g. 10 seconds held → 50 seconds recovery). Holds of 24 seconds or longer reach the 2-minute maximum.

Current palette v6 uses the first three swatches from the supplied reference, left to right: #009A8A, #3CBDAF, #77EDD7. This supersedes the temporary yellow. The portable matches the second colour.
