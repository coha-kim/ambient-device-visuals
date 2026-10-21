# Organic metaballs, SVG blur/threshold, Canvas/WebGL, and fluid/advection references

## What the repository contains, and status of the three references

### Takeaway
No set of three external user references is present or accessible in the repository/context. Repository search found only local documentation plus p5.js and W3C URLs; therefore the comparison below uses representative primary projects and the checked-in implementation as explicitly labeled substitutes.

### Cited Findings
- `README.md` identifies this as a p5.js extraction with three populations of five blobs, a 1024x600 canvas, and Chromium recommended for the source sketch's SVG canvas filter — [repository README](https://github.com/seoha-kim/ambient-device-visuals/blob/main/README.md).
- `CONTEXT.md` documents a half-resolution single SVG goo-filter pass over radial-gradient discs, but says Raspberry Pi 5 hardware performance remains unverified — [repository context](https://github.com/seoha-kim/ambient-device-visuals/blob/main/CONTEXT.md).
- URL scanning across all tracked Markdown/JS/MJS/HTML found only localhost/loopback links, the W3C SVG namespace, and the pinned p5.js 2.3.1 CDN; no three external reference URLs or README links were found — [repository tree](https://github.com/seoha-kim/ambient-device-visuals/tree/main).
- The checked-in renderer creates two 512x300 p5 graphics buffers (`MERGE_BUFFER_SCALE = 0.5`), draws all 15 discs into one buffer, applies `feGaussianBlur`, then a `feColorMatrix` alpha transform, and upscales once — [sketch.js](https://github.com/seoha-kim/ambient-device-visuals/blob/main/sketch.js).

### Inferences
- The “three references” may have existed in an unavailable chat/attachment rather than this checkout. It is not valid to attribute any technique or benchmark to them.
- The repository's own claim that SVG filters “ARE GPU-accelerated in the Pi Chromium” is an engineering assumption, not a measured benchmark; `CONTEXT.md` explicitly says hardware performance is unverified.

### Gaps
- Exact identities, versions, licenses, benchmark devices, and implementation details of the user's three references cannot be recovered from this repository/context.

## What representative projects actually implement and what costs they imply

### Takeaway
Three primary substitutes cover the requested technique space: an SVG goo filter, a GPU implicit-surface metaball renderer, and a GPU Navier–Stokes fluid solver. They are materially different workloads: the current SVG approach is a small fixed number of raster/filter passes; fluid simulation adds several full-screen framebuffer passes and an iterative pressure solve; marching-cubes metaballs add a 3D grid and geometry/texture work.

### Cited Findings
- The canonical SVG goo recipe is a blur followed by an alpha threshold: MDN defines `feGaussianBlur` as applying a Gaussian blur to an input graphic, while the SVG filter primitive specification documents `feColorMatrix` as a matrix operation on color/alpha channels — [MDN feGaussianBlur](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feGaussianBlur), [MDN feColorMatrix](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feColorMatrix), [W3C Filter Effects](https://www.w3.org/TR/filter-effects-1/).
- This repository's exact threshold is alpha' = 16·alpha − 6, with identity RGB; this preserves authored colors while making the post-blur shape edge steep — [sketch.js filter code](https://github.com/seoha-kim/ambient-device-visuals/blob/main/sketch.js).
- `gmjoseph/marching-squares-p` explicitly provides a 2D metaballs implementation with both WebGL and Canvas renderers — [project README](https://github.com/gmjoseph/marching-squares-p).
- `sjpt/metaballsWebgl` is a three.js/WebGL/WebGL2 GPU implementation using optimized marching cubes; its README says positions (and optionally colors) are supplied in a texture and reports 10,000 spheres at a 100³ grid and 60 fps using 33% of a 1080-class GPU. That is a documented project benchmark, not a Raspberry Pi result — [project README](https://github.com/sjpt/metaballsWebgl/blob/main/README.md).
- `PavelDoGreat/WebGL-Fluid-Simulation` is a GPU Navier–Stokes implementation, and its source `step()` performs curl, vorticity, divergence, pressure clear, a configurable loop of pressure/Jacobi passes, gradient subtraction, velocity advection, and dye advection — [README](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/README.md), [step source](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/script.js).
- The same fluid source allocates separate velocity, dye, divergence, curl, and double-buffered pressure framebuffers; its GUI exposes simulation resolution values 32/64/128/256 and pressure iterations — [framebuffer/config source](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/script.js).
- `Locko2901/webgl-fluid-simulation` documents the same GPU architecture (advection, pressure projection, vorticity confinement), plus configurable simulation and dye resolutions and optional bloom/marbling post-processing — [project README](https://github.com/Locko2901/webgl-fluid-simulation).
- Raspberry Pi's product materials describe Pi 5's VideoCore VII GPU and dual 4Kp60 display capability; current ecosystem documentation/search results report OpenGL ES 3.1 support, but these are capability facts, not a guarantee that browser SVG filters or a particular shader sustains a target FPS — [Raspberry Pi announcement](https://www.raspberrypi.com/news/introducing-raspberry-pi-5/), [Pi 5 product brief](https://pip.raspberrypi.com/documents/RP-008348-DS-3-raspberry-pi-5-product-brief.pdf).

### Inferences
- For 15 blobs at 1024x600, the current 512x300 SVG path is likely much cheaper than a fluid solver: it rasterizes ~153,600 filter pixels per buffer pass, whereas a fluid solver commonly executes roughly 7 + pressure-iteration full-screen passes per step, often at multiple resolutions. The pixel/pass arithmetic is an engineering estimate, not measured on Pi.
- Marching cubes is inappropriate overkill for 2D blobs: a 100³ grid has one million cells before interpolation/mesh work, whereas a 2D 512x300 field has 153,600 pixels. The cited 100³ benchmark is for a much stronger GPU and cannot be transferred to Pi.
- SVG filter cost is implementation-dependent. Blur kernels, filter-region expansion (this code uses 160%), browser compositing, color-space conversion, and readback/texture upload can dominate; “GPU accelerated” does not establish bounded frame time.

### Gaps
- None of the representative projects reports Raspberry Pi 5 at 1024x600 with the exact browser, filter, FPS, thermal state, or power profile. No defensible numeric FPS claim can be made without measuring the deployed stack.

## Lower-cost Raspberry Pi 5 architecture and adaptation without repository edits

### Takeaway
Keep the existing physics and visual design, but treat SVG as a candidate backend rather than a guarantee. For a Pi deployment, first benchmark the current 0.5-resolution single-pass path; if unstable, use a lower-resolution Canvas 2D or WebGL fragment-field backend. Reserve fluid/advection for a separate low-resolution accent layer, not the metaball core.

### Cited Findings
- The current physics is CPU-side and small: 15 objects, Perlin-noise wander, cross-population pair checks, two separation relaxation iterations, then one render call — [sketch.js](https://github.com/seoha-kim/ambient-device-visuals/blob/main/sketch.js).
- The current renderer already has the main low-cost levers: half-resolution buffers, one shared pass, fixed disc count, fixed Gaussian blur (`stdDeviation=5` in buffer pixels), one upscale, and a suggested ~0.4 buffer scale in its startup note — [sketch.js](https://github.com/seoha-kim/ambient-device-visuals/blob/main/sketch.js).
- WebGL fluid references expose simulation resolution independently from display/dye resolution, a useful pattern for keeping expensive simulation work below 1024x600 — [Pavel fluid source](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/master/script.js), [Locko fluid README](https://github.com/Locko2901/webgl-fluid-simulation).
- WebGL's programmable fragment pipeline is supported by Pi 5's documented graphics capability, but actual browser/API availability and performance must be checked on the image used for deployment — [Pi 5 announcement](https://www.raspberrypi.com/news/introducing-raspberry-pi-5/), [product brief](https://pip.raspberrypi.com/documents/RP-008348-DS-3-raspberry-pi-5-product-brief.pdf).

### Inferences
- Recommended staged architecture (no repository edits required):
  1. Run Chromium kiosk at the native 1024x600 display size and benchmark the existing SVG backend with `MERGE_BUFFER_SCALE` conceptually at 0.5, 0.4, and 0.33. Record frame-time percentiles, not only displayed FPS.
  2. Keep physics at 15 blobs and update it at a fixed 30/60 Hz; decouple rendering so a missed frame does not change motion.
  3. If SVG is the bottleneck, replace only the rendering backend in a deployment wrapper: draw radial discs to a low-resolution Canvas 2D surface and use `globalCompositeOperation`/blur where available, or use a WebGL fragment shader that evaluates the sum of 15 radial fields and applies `smoothstep`/threshold in one pass.
  4. If an organic flow is required, add a 128–256-wide fluid/dye simulation (velocity + dye ping-pong textures) and composite its output behind/inside the 15-blob layer. Reduce pressure iterations and disable bloom/sunrays first; these are extra full-screen passes.
  5. Avoid marching cubes and avoid per-blob SVG DOM elements. The former is a 3D workload; the latter increases DOM/filter/compositing overhead. The existing one-buffer approach is preferable.
  6. Use thermal/power-aware testing: cold start, 10-minute sustained run, kiosk compositor enabled, and the actual Chromium flags. A Pi 5 capability sheet cannot predict throttling or driver behavior.
- The cheapest faithful option is likely “CPU physics + low-resolution field render + one upscale.” A shader field can avoid Gaussian blur entirely: each fragment sums a compact radial influence from 15 positions, then maps the scalar field to a hard contour and color. This is an engineering design recommendation, not a cited benchmark.
- If exact gradient-preserving bridges are important, retain the current SVG path as the visual reference and use WebGL only after screenshot comparison; field shaders may change color mixing and edge appearance.

### Gaps
- No deployment benchmark, browser version, Mesa/driver version, Pi cooling setup, target frame-rate requirement, or power budget was supplied.
- No repository edits were made. These recommendations are architecture/test guidance only; they do not claim that the current SVG implementation is already suitable for sustained Pi 5 use.
