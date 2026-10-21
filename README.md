# Ambient Device Visuals

Standalone p5.js visuals extracted from the original `capstone-poc/orbmerge` sketch.

Three populations of two to four smooth gradient metaball boids move freely and are differentiated by colour. Each population gets a stable randomized count of 2–4 boids at initialization, and each boid has a randomized radius within ±20 px. Boids have no same-population cohesion and no long-range population attraction; different populations respond only when their field radii overlap, where the shared scalar field creates the metaball collision shape. Inter-population attraction defaults to 0.8 and is the only attraction controlled by portable-device input. The darkest population (#33C4A0) uses zero inter-population attraction, while the other populations use 1.0. Autonomous movement uses a moderate 1.5 px/frame base speed. Fixed population colours: `#33C4A0`, `#C6E2B6`, `#DCEBD3`, with lighter centres.

## Run

From this project directory:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Internet access is needed to load the pinned p5.js 2.3.1 CDN dependency. Chromium is recommended for the source sketch's SVG canvas filter.

The canvas and metaball field are calculated at the display's native 1024 × 600 resolution, with pixel density fixed to 1. Blob size is doubled for fuller display coverage while each blob retains its randomized ±20 px radius variation. The expensive full-resolution field updates at 30 Hz while the display continues presenting it at the browser frame rate. This avoids field-grid upscaling and stair-stepped contours. Existing local edits hide the controls. There is no colour picker.

See [CONTEXT.md](CONTEXT.md) for project history and scope.

## WebSocket v1

From the sibling `portable-device-visuals` repository, run `npm install` then `npm run bridge`. Open http://127.0.0.1:8787/ and use the two pairing links. `ambient-link-v1.mjs` maps the portable's intensity to reduced attraction for its second population, then restores baseline over 5× its full button-hold duration. Size and drift speed stay independent. Other populations retain their baseline.

Existing local edits hiding the controls were preserved. Pre-connection entry files are under `versions/pre-websocket-v1/`. See the portable project's `connection-v1/README-v1.md` for secure phone access and tuning. Physical phone/display feel remains unverified.

Yellow visibility v2: population index 1 is temporarily #FFD84D for interaction testing. Only its colour changes; hold/shake mapping, merge physics and recovery remain the same. Pre-change files are in `versions/pre-yellow-v2/`.

Recovery v5: after any positive hold, recovery lasts at least 30 seconds and at most 2 minutes. The middle range follows 5× the full hold duration (e.g. 10 seconds held → 50 seconds recovery). Holds of 24 seconds or longer reach the 2-minute maximum.

Current palette v6 uses the first three swatches from the supplied reference, left to right: #009A8A, #3CBDAF, #77EDD7. This supersedes the temporary yellow. The portable matches the second colour.
