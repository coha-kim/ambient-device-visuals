# Raspberry Pi 5 browser and GPU/WebGL/Canvas considerations

## Raspberry Pi documentation: hardware and graphics stack

### Takeaway
Raspberry Pi's own product documentation establishes a capable but bounded graphics platform: Pi 5 has a VideoCore VII GPU, OpenGL ES 3.1 and Vulkan 1.3 support, and two 4Kp60 HDMI outputs. Those are API/display capability statements, not guarantees about a particular browser's WebGL backend, shader throughput, latency, or sustained frame rate.

### Cited Findings
- Raspberry Pi's official Pi 5 specification lists a Broadcom BCM2712 2.4 GHz quad-core 64-bit Arm Cortex-A76 CPU, VideoCore VII GPU with OpenGL ES 3.1 and Vulkan 1.3, and dual 4Kp60 HDMI output with HDR support: [Raspberry Pi 5 product page](https://www.raspberrypi.com/products/raspberry-pi-5/).
- The same page identifies the 4Kp60 HEVC decoder, LPDDR4X-4267 SDRAM options, and two four-lane MIPI camera/display transceivers. These describe available hardware, not a browser canvas's effective render target or memory bandwidth: [Raspberry Pi 5 product page](https://www.raspberrypi.com/products/raspberry-pi-5/).
- Raspberry Pi says Pi 5 is supported by current Raspberry Pi OS and legacy Bookworm, while versions older than Bookworm are not supported. A deployment should therefore treat OS image/browser version as part of the compatibility matrix: [Raspberry Pi 5 product page, FAQ](https://www.raspberrypi.com/products/raspberry-pi-5/).
- Raspberry Pi recommends a high-quality 5 V/5 A USB-C supply and says Pi 5 performs best with active cooling; this matters for a continuously animated installation because power/thermal conditions can affect sustained clocks and throttling even though the product page does not quantify browser performance: [Raspberry Pi 5 product page, FAQ](https://www.raspberrypi.com/products/raspberry-pi-5/).
- Raspberry Pi's documentation has a graphics-driver section, but the product specification is the clearest primary source for the Pi 5 GPU/API claims. It should not be paraphrased as a promise that every browser exposes Vulkan or OpenGL ES directly: [Raspberry Pi configuration documentation](https://www.raspberrypi.com/documentation/computers/configuration.html#graphics-drivers).

### Inferences
- A 1024x600 canvas is far below the advertised dual-4K display pixel dimensions, so display resolution alone is unlikely to be the limiting factor. This is an engineering inference, not a Raspberry Pi benchmark.
- The Pi 5 GPU/API facts make WebGL a reasonable first implementation to prototype, but the actual browser context must be tested at runtime (`canvas.getContext('webgl2')`, then `webgl` fallback) and monitored for context loss. Do not infer WebGL 2, extensions, or a specific driver from the board's Vulkan/OpenGL ES specification alone.
- Continuous animation increases the value of active cooling and a correctly rated supply. That is a deployment recommendation inferred from Raspberry Pi's own “performs best with active cooling” and power guidance, not a measured thermal limit for this display.

### Gaps
- The cited Raspberry Pi product/documentation pages do not provide browser-specific WebGL FPS, fragment-shader throughput, Canvas 2D acceleration guarantees, or `readPixels` latency for Pi 5.
- They do not establish which browser build, compositor, Mesa driver, or window-system path a particular installation will use. Measure those on the target OS/browser rather than assuming them.

## Browser API and graphics facts from MDN/Khronos

### Takeaway
Canvas 2D is an API for drawing shapes, text, images, and other objects; WebGL exposes a GPU-oriented programmable pipeline in which fragment shaders produce per-fragment output. `requestAnimationFrame` schedules work before repaint and generally tracks display refresh, while OffscreenCanvas can move rendering into a worker. CPU readback from WebGL is explicitly a synchronization cost in MDN's WebGL guidance, so avoid per-frame readback unless the design requires it.

### Cited Findings
- MDN defines `CanvasRenderingContext2D` as the 2D rendering context for a canvas, used for drawing shapes, text, images, and other objects: [MDN CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D). The API definition does not promise that a browser will use the GPU or CPU for a given operation.
- MDN says `requestAnimationFrame()` calls the supplied callback before the next repaint and that callback frequency generally matches the display refresh rate. It also notes that calls are paused in most browsers when running in background tabs/hidden iframes, and that timestamps are shared for callbacks in the same agent: [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
- MDN documents `OffscreenCanvas` as available in Web Workers and says rendering operations can run in a worker to avoid heavy work on the main thread. It documents `HTMLCanvasElement.transferControlToOffscreen()` and transferable ownership of the canvas, and notes that `requestAnimationFrame()` can also be used in workers: [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).
- MDN's WebGL best-practices guide says `requestAnimationFrame` normally makes an explicit `gl.flush()` unnecessary at a frame boundary; when not using rAF, `flush()` can encourage eager execution: [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_webglflush_when_not_using_requestanimationframe).
- The same guide warns that several WebGL queries can cause synchronous stalls on the calling thread. In particular, `readPixels()` to the CPU is described as “finish + round-trip”; the guide recommends GPU-GPU readback with asynchronous data readback instead when readback is needed: [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#flush_when_expecting_results).
- MDN describes `WebGLRenderingContext.readPixels()` as reading a block of pixels from the framebuffer into a `TypedArray` or `DataView`: [MDN readPixels](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels). The WebGL 2 specification defines the exact framebuffer/read-buffer, format/type, bounds, and error behavior: [Khronos WebGL 2.0 specification, reading pixels](https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.10).
- MDN recommends batching WebGL draw calls into fewer, larger calls because batching generally improves performance: [MDN WebGL best practices, batch draw calls](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#batch_draw_calls).
- WebGL Fundamentals explains the division between vertex and fragment shader stages and shows fragment shaders computing the color of fragments; it is educational rather than a browser/driver guarantee: [WebGL Fundamentals, shaders and GLSL](https://webglfundamentals.org/webgl/lessons/webgl-shaders-and-glsl.html).

### Inferences
- A metaball field is a strong fit for one fullscreen WebGL draw: put the metaball distance/field evaluation and color mapping in a fragment shader, with positions/radii/time as uniforms. This minimizes JavaScript-side per-pixel work and draw-call count; it is an engineering design inference from the programmable fragment stage and batching guidance.
- At 1024x600 there are 614,400 logical pixels. At 60 displayed frames per second, a fullscreen fragment path evaluates roughly 36.864 million pixel locations per second before accounting for shader instruction count, overdraw, browser scaling, and compositing. This arithmetic is an estimate, not a Pi 5 performance result.
- `requestAnimationFrame` is the appropriate pacing primitive for a visible animation. Use its timestamp (rather than assuming exactly 16.67 ms) to advance simulation consistently; cap or reduce work if the observed callback interval is longer.
- OffscreenCanvas is useful if main-thread responsiveness matters, but it is not automatically faster: worker scheduling, message/transfer overhead, browser support, and compositor behavior still require measurement. A simple fullscreen shader may be faster on the main thread than a worker architecture.
- Avoid `gl.readPixels()` every frame for diagnostics, image processing, or feedback loops unless necessary. If a visual-only metaball output is sufficient, keep the pipeline GPU-to-display; if occasional screenshots are needed, read back at a lower cadence/resolution and measure stalls.

### Gaps
- MDN documents API behavior and broad performance caveats, not Pi 5-specific timings. It does not establish whether a given browser's Canvas 2D implementation is GPU accelerated.
- “WebGL uses the GPU” should be stated carefully: WebGL is a browser graphics API backed by an implementation; availability, software fallback, GPU process behavior, and extensions vary by browser/platform. Verify the context and renderer on the target machine rather than treating the API name as proof of acceleration.
- MDN's pages do not guarantee worker rAF support in every browser/version or identical OffscreenCanvas behavior across browsers. Feature-test the exact deployment browser.

## Practical recommendations: facts versus engineering inference

### Takeaway
The defensible plan is to treat official Pi 5 specifications and web API semantics as facts, then validate performance and browser behavior experimentally. Start with a fullscreen WebGL shader and a Canvas 2D fallback, use rAF pacing, avoid CPU readback, and keep a low-cost fallback path. Label all FPS, thermal, and acceleration conclusions as measurements or inferences rather than promises from the documentation.

### Cited Findings
- **Fact:** Pi 5 advertises VideoCore VII, OpenGL ES 3.1, Vulkan 1.3, and dual 4Kp60 HDMI output ([Raspberry Pi](https://www.raspberrypi.com/products/raspberry-pi-5/)).
- **Fact:** Canvas 2D provides drawing operations but its API definition does not prescribe an implementation strategy ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)).
- **Fact:** rAF is scheduled before repaint and generally follows display refresh; browsers may pause it for hidden pages ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
- **Fact:** OffscreenCanvas can run rendering in a worker and can receive a transferred canvas control surface ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)).
- **Fact:** CPU `readPixels` may force a finish/round-trip and synchronous stalls; batching is generally beneficial ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).

### Inferences
- **Recommended implementation:** fullscreen WebGL fragment shader, one draw per frame, uniform-driven animation, no per-frame readback. This follows from API capabilities and performance guidance but is not guaranteed to beat Canvas 2D on every browser build.
- **Fallback:** retain a Canvas 2D or reduced-resolution path, and test context creation at startup. A fallback is prudent because the docs do not promise a browser/driver combination.
- **Frame pacing:** use rAF and timestamp-based motion; optionally skip/reduce updates when the measured frame interval exceeds the target. This is an engineering response to rAF semantics, not a claim of a fixed 60 Hz.
- **Resolution strategy:** render at native 1024x600 first; if shader cost or thermal behavior is poor, render at a lower internal resolution and upscale, preserving CSS/display size. The quality/performance tradeoff must be measured on the target.
- **Readback strategy:** do not use `readPixels` as part of the steady-state render loop. If required, throttle it, reduce the rectangle size, and consider asynchronous WebGL 2 mechanisms where supported; validate that the browser actually exposes the needed features.
- **Deployment test matrix:** record browser/version, OS image, context type (`webgl2`/`webgl`), `gl.getParameter(RENDERER/VERSION)` where available, canvas backing dimensions, observed frame intervals, and temperature under sustained load. Renderer strings and timings are runtime observations, not Raspberry Pi documentation facts.
- **Power/thermal:** use the recommended supply and active cooling for an always-on display. This is supported as a deployment precaution by Raspberry Pi's product guidance, while any specific throttling threshold or FPS impact remains unestablished here.

### Gaps
- No authoritative source located here gives a Pi 5 browser benchmark for a metaball shader at 1024x600, a guaranteed Canvas 2D acceleration mode, or a guaranteed 60 FPS result.
- No source establishes that all Pi 5 browser distributions expose WebGL 2 or OffscreenCanvas in the same way. Compatibility and performance must be checked in the actual kiosk/browser image.
- No source establishes a fixed maximum number of metaballs, shader iterations, or safe readback frequency. These are workload parameters to tune experimentally.
