# Ambient Device Visuals

Standalone p5.js visuals extracted from the original `capstone-poc/orbmerge` sketch.

Three populations of five smooth gradient blobs wander independently and bounce or merge according to their attraction settings. Fixed population colours: `#1D665C`, `#2A9284`, `#6AB3A9`, with lighter centres.

## Run

From this project directory:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Internet access is needed to load the pinned p5.js 2.3.1 CDN dependency. Chromium is recommended for the source sketch's SVG canvas filter.

The original 1024 × 600 canvas and physics are retained. Existing local edits hide the controls. There is no colour picker.

See [CONTEXT.md](CONTEXT.md) for project history and scope.

## WebSocket v1

From the sibling `portable-device-visuals` repository, run `npm install` then `npm run bridge`. Open http://127.0.0.1:8787/ and use the two pairing links. `ambient-link-v1.mjs` maps the portable's intensity to reduced attraction for its base-teal population, then restores baseline over 10× its full button-hold duration. Size and drift speed stay independent. Other populations retain their baseline.

Existing local edits hiding the controls were preserved. Pre-connection entry files are under `versions/pre-websocket-v1/`. See the portable project's `connection-v1/README-v1.md` for secure phone access and tuning. Physical phone/display feel remains unverified.
