# Ambient Device Visuals

Standalone p5.js visuals extracted from the original `capstone-poc/orbmerge` sketch.

Three populations of five smooth gradient blobs wander independently and bounce or merge according to their attraction settings. Fixed population colours: `#1D665C`, `#2A9284`, `#6AB3A9`, with lighter centres.

## Run

From this project directory:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Internet access is needed to load the pinned p5.js 2.3.1 CDN dependency. Chromium is recommended for the source sketch's SVG canvas filter.

The original 1024 × 600 canvas, overall size slider, per-population speed and attraction sliders, reset button and FPS counter are retained. There is no colour picker.

See [CONTEXT.md](CONTEXT.md) for project history and scope.
