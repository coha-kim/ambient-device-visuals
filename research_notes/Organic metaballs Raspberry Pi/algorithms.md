# Organic 2D metaballs on Raspberry Pi 5: algorithm tradeoffs

## Algorithmic costs by architecture

### Takeaway
All four approaches can produce merged blobs from an additive scalar field and an isovalue. The dominant variable differs: CPU scalar + marching squares is proportional to sampled cells × active balls plus contour output; Canvas 2D raster is proportional to raster pixels × balls (unless drawing compact-support primitives); a WebGL full-screen fragment shader has the same pixel × ball work but executes it on the GPU; fluid/advection adds several full-grid passes per simulation step and is not a cheaper replacement for the blob field.

### Cited Findings
- A metaball is an implicit contour of a summed influence field. Blinn's original formulation uses a Gaussian contribution and a threshold, `F(x)=sum(b_i exp(-a_i|x-p_i|^2))`; compact polynomial and inverse-square variants are also documented. [WPI metaballs notes](https://web.cs.wpi.edu/~matt/courses/cs563/talks/metaballs.html); [Paul Bourke, implicit surfaces](https://paulbourke.org/geometry/implicitsurf/index.html)
- Marching Squares classifies each 2×2 cell using four binary corner tests, giving 2^4=16 cases and a lookup table; interpolation along crossed edges improves contour placement. [Wikipedia, Marching squares](https://en.wikipedia.org/wiki/Marching_squares)
- Therefore a scalar-grid implementation with `G=(Wg-1)(Hg-1)` cells and `N` balls has dominant field cost O(Wg·Hg·N) for naïve evaluation, plus O(G) case lookup/interpolation and O(S) output/painting where S is emitted contour segments. If compact support or spatial bins reduce the average balls affecting a cell to k, field cost becomes O(Wg·Hg·k), k≪N in sparse scenes. (Complexity is an engineering derivation from the cited algorithm, not a benchmark.)
- A fragment shader executes once per rasterized fragment/pixel covered by the full-screen primitive. A direct 2D shader that sums N metaballs therefore costs O(W·H·N) fragment evaluations per rendered frame, with no CPU marching-squares segment list. [MDN GLSL shaders](https://developer.mozilla.org/en-US/docs/Games/Techniques/3D_on_the_web/GLSL_Shaders)
- Raspberry Pi 5's official product brief lists a quad-core 2.4 GHz Cortex-A76 CPU and 800 MHz VideoCore VII GPU with OpenGL ES 3.1/Vulkan 1.2 support; this makes WebGL available, but the brief does not establish a particular browser/shader FPS. [Raspberry Pi 5 product brief](https://pip.raspberrypi.com/documents/RP-008348-DS-3-raspberry-pi-5-product-brief.pdf)
- Canvas `ImageData.data` is a 4-channel `Uint8ClampedArray`; `putImageData` presents it on the canvas. A CPU raster field at display resolution thus performs at least one write per output pixel and generally N influence evaluations per pixel. [MDN ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData); [MDN putImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData)
- Stable Fluids (Stam, SIGGRAPH 1999) uses semi-Lagrangian advection, implicit diffusion and pressure projection; the backward trace is stable for large time steps but introduces numerical diffusion. [Stam publication page](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pub.html); [Stable Fluids PDF](https://www.dgp.toronto.edu/people/stam/reality/Research/pdf/ns.pdf)

### Inferences
- At 1024×600, full-resolution CPU raster is 614,400 pixels/frame. Even N=8 means roughly 4.9 million ball contributions before coloring; this is usually more work than evaluating a 256×150 or 320×188 simulation grid and upscaling it.
- A WebGL shader is the cleanest way to avoid SVG blur/threshold's DOM/filter overhead: one draw call, one full-screen pass, and a uniform array/texture of ball data. GPU cost still scales with output pixels and N; it is not “free,” and mobile/embedded drivers may be fill-rate or shader-arithmetic limited.
- Marching Squares is preferable when a vector-like contour is required: at 256×150 there are only 37,995 cells (`255*149`), and emitted segments are usually far below pixel count. For a soft ambient image, however, explicit contour topology and segment rasterization are extra CPU work that a shader avoids.
- Fluid/advection is a motion/texture generator, not an inexpensive metaball renderer. A 2D solver typically touches the whole simulation grid repeatedly (advection, forces, diffusion/projection), so its grid cost is O(G·P) per step for a constant number P of passes, plus whatever metaball/ink injection is used. It can produce organic trails/swirls, but is overkill if only merged blobs are required.

### Gaps
- I found no authoritative Raspberry Pi 5 browser benchmark comparing these exact four implementations at 1024×600. FPS, thermal throttling, and WebGL driver behavior must be measured on the target image/browser.

## Practical optimizations and measurable knobs

### Takeaway
The largest wins are reducing simulation resolution and update frequency, bounding field influence, and eliminating allocation/DOM work. Typed arrays, lookup tables, dirty rectangles, and worker rendering are implementation enablers; they do not change the underlying asymptotic terms.

### Cited Findings
- `requestAnimationFrame` generally follows display refresh and is throttled/paused when a page is not visible; the timestamp should drive motion so animation speed is refresh-rate independent. [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- OffscreenCanvas can transfer a canvas to a Web Worker; MDN/web.dev describe this as moving 2D or WebGL rendering off the main thread to keep UI work responsive. [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas); [web.dev OffscreenCanvas](https://web.dev/articles/offscreen-canvas)
- Marching Squares' finite 16-case table is directly amenable to a precomputed case/edge lookup; ambiguous saddle cases need a consistent rule (the asymptotic decider is a recognized resolution). [Wikipedia, Marching squares](https://en.wikipedia.org/wiki/Marching_squares); [Wikipedia, Asymptotic decider](https://en.wikipedia.org/wiki/Asymptotic_Decider)
- ImageData's typed RGBA array is directly mutable and can be reused across frames rather than allocated each frame. [MDN ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData)

### Inferences
- Use a logical field grid such as 256×150 (≈38k cells) or 320×188 (≈60k), then bilinear/upscale to 1024×600. Field quality is controlled by grid spacing and contour threshold; benchmark 160×94, 256×150, 320×188 and 512×300 rather than assuming native resolution.
- For CPU scalar + marching squares: store ball positions/radii in `Float32Array`; store field in `Float32Array` or quantized fixed/8-bit values when quality permits; reuse output buffers; use a 16-entry case table; avoid per-cell objects, arrays, closures, and string/DOM SVG path construction. Interpolate only crossed edges. Emit into a preallocated segment buffer or draw directly into a raster target.
- Use compact-support fields (for example a polynomial that is exactly zero past a radius) to avoid evaluating every ball for every cell. Uniform spatial bins or a ball bounding-box scan reduce each cell's candidate list. This changes practical average k, but requires bin maintenance as balls move.
- Dirty regions are effective for CPU raster/marching squares if only a small fraction of the scene changes: mark the union of old/new ball influence rectangles, expand by the support radius, and recompute only intersecting cells. For continuously moving balls spanning most of the frame, dirty-region benefit approaches zero.
- Decouple simulation from presentation: update ball motion/field at 15–30 Hz and present/upscale at display cadence, or render every second/third `requestAnimationFrame` for an ambient display. Use elapsed timestamps, not frame count. This is an engineering choice; no source measured the visual threshold for this specific display.
- In WebGL, keep a single full-screen triangle/quad and one shader pass; upload ball centers/radii once per frame via a small uniform array or a texture. Avoid ray marching in 2D: direct field evaluation has predictable N iterations per fragment. Break/early-out when the accumulated field exceeds threshold only if the visual equation tolerates it; sort/partition balls by likely influence if that improves early exits. At high N, pack active balls and cap the loop to a fixed maximum for driver-friendly GLSL.
- Canvas 2D can use a low-resolution offscreen canvas and scale it with image smoothing chosen deliberately; a single `putImageData` per frame is preferable to many path/gradient calls. OffscreenCanvas is useful if CPU work would block UI, but it does not reduce total CPU arithmetic.
- For fluid/advection, use a much smaller simulation grid than display resolution, ping-pong typed-array fields, fixed low iteration counts, and inject blobs only near active regions. The main optimization is reducing passes/resolution; unlike a static scalar field, dirty rectangles are difficult once advection transports values globally.

### Gaps
- No citable source found giving a universal “best” grid size, ball-count limit, or exact Pi 5 FPS. Those are workload/browser/thermal dependent and require profiling with `performance.now()`, browser GPU diagnostics, and temperature/power logging on the target unit.

## Lowest-cost architecture for 1024×600 ambient output

### Takeaway
Engineering recommendation: start with a direct WebGL fragment-shader metaball field rendered to a 1024×600 canvas, using a modest active-ball count and a single pass. If GPU use/driver reliability is the primary constraint, the lowest predictable fallback is a low-resolution CPU field (256×150-ish) with direct raster/upscale, not full-resolution Canvas and not marching squares unless an actual contour is needed. Use fluid/advection only as an optional low-resolution secondary texture for richer motion.

### Cited Findings
- WebGL fragment shaders run per covered fragment, and Raspberry Pi 5 provides OpenGL ES 3.1-capable VideoCore VII hardware; these facts support a GPU full-screen-field design but do not prove target performance. [MDN GLSL shaders](https://developer.mozilla.org/en-US/docs/Games/Techniques/3D_on_the_web/GLSL_Shaders); [Raspberry Pi 5 product brief](https://pip.raspberrypi.com/documents/RP-008348-DS-3-raspberry-pi-5-product-brief.pdf)
- SVG/DOM and Canvas APIs are separate from WebGL; the cited browser docs describe pixel buffers and shader execution, but I found no apples-to-apples source measuring SVG blur/threshold against these metaball methods. Therefore “less GPU than SVG” is a target hypothesis to verify, not a measured fact.

### Inferences
- Recommended decision order:
  1. **WebGL direct field**: lowest likely CPU cost and best organic merging at native output; one fragment invocation per output fragment and no contour segment allocation. Prefer this when WebGL2/context stability is acceptable.
  2. **CPU low-res raster field + upscale**: lowest complexity/dependency risk and often lowest total GPU demand; use compact support/spatial bins, typed arrays, reused ImageData, 15–30 Hz updates. It trades some softness/resolution for deterministic CPU work.
  3. **CPU low-res field + marching squares**: choose only when a crisp contour/path is needed. Its cell scan is cheap at reduced grid, but segment generation and rasterization are avoidable overhead for a filled ambient blob.
  4. **Fluid/advection**: choose for smoke-like flow/history and accept several grid passes; do not choose merely to make metaballs merge.
- A hybrid can be attractive: WebGL computes field and color; CPU updates a small ball buffer. If fluid motion is desired, advect a low-res velocity/dye field and use it to perturb ball centers or shader coordinates, rather than running a full-resolution fluid solver.
- “Less GPU than SVG blur/threshold” should be tested as energy and utilization, not inferred from FPS alone: compare GPU busy %, CPU %, frame time, temperature, and power at equal visual quality and update rate. Include a no-animation idle baseline and thermal steady state.
- Suggested acceptance matrix for the target: 1024×600 output; N=4/8/16/32; logical grids 160×94, 256×150, 320×188, 512×300; 15/30/60 Hz update; 10-minute thermal run. Record median/p95 frame time, dropped frames, CPU/GPU utilization, temperature, and watts. This is a proposed measurement protocol, not measured data.

### Gaps
- No source measured SVG blur/threshold GPU usage on Raspberry Pi 5 or established that WebGL is always lower power. Browser choice (Chromium version, Mesa/V3D driver, compositor, canvas color format), display refresh, and thermal profile can reverse the ranking. Benchmark the actual deployment.
