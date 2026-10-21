# LeandroSQ/js-metaballs: algorithm, implementation, and Raspberry Pi 5 implications

## Real algorithm and implementation approach

### Takeaway
This repository implements a **per-pixel scalar influence field**, not marching squares, contour extraction, polygon meshing, or a geometric blob approximation. Each pixel/fragment sums contributions from up to 20 metaballs; the result is thresholded/remapped into a color. The CPU path evaluates the field in JavaScript into an `ImageData` buffer; the preferred GPU path evaluates the same style of field in a WebGL fragment shader over a full-screen quad.

### Cited findings
- The README explicitly says the algorithm is: “For each and every pixel in the canvas, sum the radius over the distance from the pixel to the center of the meta ball for every meta ball in the scene. Divide it by 255 and apply as the color for the pixel.” It also says the project began with Canvas but was converted to WebGL because of performance issues. [README](https://github.com/LeandroSQ/js-metaballs/blob/master/README.md)
- CPU rendering allocates `createImageData(width, height)`, iterates every pixel, then loops over every blob and adds `18000 * (blob.radius * 2) / dist`; it writes packed 32-bit RGBA values and calls `putImageData`. [CPU renderer source](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/cpu-renderer.js)
- The repository’s `Math.distance` helper returns `(dx*dx + dy*dy)`, i.e. **squared Euclidean distance**, despite its name. Therefore the actual CPU field is proportional to `2r / d²` (with a large constant), not a conventional `r / d` implementation using true Euclidean distance. [Math helpers](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/extensions.js)
- The default GPU shader uses `calculateDistance` that also returns squared coordinate distance, then sums `18000.0 * (radius * 2.0) / dist` for each metaball. It has `#define MAX_METABALLS 20` and uniforms for count, radii, positions, and resolution. [Default fragment shader](https://github.com/LeandroSQ/js-metaballs/blob/master/src/assets/fragment_shader1.glsl)
- The WebGL renderer creates a two-triangle-equivalent full-screen `TRIANGLE_STRIP` from four vertices `[(1,1),(-1,1),(1,-1),(-1,-1)]`; the fragment shader runs once per rasterized pixel. It uploads each ball’s position/radius as uniforms and calls `drawArrays(..., 0, 4)`. [GPU renderer](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/gpu-renderer.js)
- The project exposes six GPU fragment shaders, but they are alternative field/color transfer experiments, not contour/mesh algorithms. They vary the contribution or post-processing: raw normalized sum, inverse-distance-style variants, sine/HSL coloring, repeated threshold subtraction, grid effects, and noise. [Shader directory](https://github.com/LeandroSQ/js-metaballs/tree/master/src/assets)
- The vertex shader only passes through the quad position (`gl_Position = aVertexPosition`); no geometry is generated for the metaballs. [Vertex shader](https://github.com/LeandroSQ/js-metaballs/blob/master/src/assets/vertex_shader.glsl)

### Inferences
- The visible boundary is an **implicit isosurface in a 2D field**: pixels whose accumulated sum crosses the shader’s threshold become visible. This is a true field evaluation in the sense that influences are accumulated continuously at sample points, but it is not a physically canonical metaball potential and does not produce an explicit contour object.
- “Divide by 255” in the README is a simplified description. The default CPU/GPU path first treats sums below 200 as black and maps values above 200 via `(sum - 200) / 55`; color channels then apply gradients. The source is authoritative for the actual transfer function.
- Because `dist` is squared distance, the implementation behaves like an inverse-square falloff with radius-weighted strength. The commented shader alternatives show the author experimented with other falloffs, including `pow(diameter / dist, 2.0)`, but those are not the default path.

### Gaps
- The project does not document a formal mathematical field equation, an intended isovalue, or a comparison against standard metaball kernels. The exact behavior must therefore be described from the source expressions above.
- There is no benchmark table, measured resolution, GPU model, or FPS comparison in the repository. “GPU acceleration” and the performance motivation are documented qualitatively only.

## Organic deformation and smooth necks

### Takeaway
There is no mesh deformation or per-blob shape simulation. Blobs remain circles represented by `(x, y, radius)` and move/breathe through simple kinematics. The organic silhouette and smooth necks arise from thresholding the **sum of overlapping radial fields**: when two fields add above the visible threshold in the gap, the implicit boundary joins them smoothly; when the gap falls below threshold, they separate.

### Cited findings
- `Blob` initializes at the center, chooses a target radius in `[50, 300]`, starts at radius 0, and picks a signed axis direction and speed in `[-150, 150]`. [Blob source](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/blob.js)
- Each update advances position by direction × speed × `deltaTime`, lerps radius toward `targetRadius`, and bounces at canvas bounds. There is no vertex list, mesh, contour tracing, noise displacement, or force-based blob deformation. [Blob source](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/blob.js)
- The main loop creates exactly five `Blob` objects, updates each, and passes them to the selected renderer. [Main source](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/main.js)
- In the default shader, the accumulated field is remapped only after summation: `if (sum > 200.0) sum = (sum - 200.0) / 55.0; else sum = 0.0`. The CPU renderer uses the equivalent threshold/remap logic. [Shader](https://github.com/LeandroSQ/js-metaballs/blob/master/src/assets/fragment_shader1.glsl); [CPU renderer](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/cpu-renderer.js)

### Inferences
- Smooth necks are a sampling/rendering consequence of an implicit threshold, not a separate “neck smoothing” routine. The field is continuous away from the singular center, so the threshold crossing between two nearby centers can form a smooth saddle/bridge.
- “Deformation” in this demo means changing the field shape as centers move and radii change. Individual primitives stay circular; overlapping influence changes the composite boundary.
- The GPU path’s color gradients and optional noise/grid/sine shaders can make the result look more organic or textured, but those effects alter appearance, not the underlying contour topology.

### Gaps
- No source specifies the exact visual threshold in geometric units or guarantees smoothness under low-resolution rendering. At small canvas sizes or high device-pixel ratios, sampling artifacts can still appear.
- There is no temporal smoothing beyond radius lerp and the movement update; no collision dynamics or spring simulation is present.

## Performance, browser, WebGL, and Raspberry Pi 5 implications

### Takeaway
The CPU implementation is an expensive `O(width × height × number_of_blobs)` JavaScript loop with a full-frame `ImageData` allocation/writeback. The WebGL implementation keeps the same per-fragment/per-blob arithmetic but parallelizes pixels on the GPU and was added specifically after Canvas performance problems. On Raspberry Pi 5, the WebGL route is the practical choice because the official hardware exposes VideoCore VII with OpenGL ES 3.1/Vulkan 1.3, but browser/driver support must be tested and active cooling/power matter under sustained load.

### Cited findings
- The README states that the original Canvas implementation had performance issues even after using buffers aligned with image data, and that it was converted to WebGL for GPU acceleration. [README](https://github.com/LeandroSQ/js-metaballs/blob/master/README.md)
- CPU cost scales with every output pixel and every ball: nested loops cover `width × height × balls.length`, with a distance calculation and field addition in the inner loop. It then performs a full `putImageData` upload to the canvas. [CPU renderer](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/cpu-renderer.js)
- The GPU renderer attempts `webgl2`, then `webgl`, then `experimental-webgl`, and alerts if no context is available. It compiles shader files fetched at runtime and draws a full-screen strip. [GPU renderer](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/gpu-renderer.js)
- The main loop targets 60 FPS using `setTimeout`, not `requestAnimationFrame` (the latter is present only as a commented-out alternative). [Main loop](https://github.com/LeandroSQ/js-metaballs/blob/master/src/scripts/main.js)
- MDN describes WebGL as a browser API for hardware-accelerated 2D and 3D graphics using an HTML canvas and the underlying graphics system. [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
- MDN describes Canvas 2D as a drawing API and `putImageData()` as copying pixel data into a canvas; this is the relevant CPU-side full-frame transfer used here. [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API); [putImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData)
- Raspberry Pi’s official product page lists Raspberry Pi 5’s Broadcom BCM2712 2.4 GHz quad-core Cortex-A76 CPU and VideoCore VII GPU supporting OpenGL ES 3.1 and Vulkan 1.3. It also says the Pi 5 performs best with active cooling and recommends an official 27 W USB-C supply for full performance. [Raspberry Pi 5 specifications](https://www.raspberrypi.com/products/raspberry-pi-5/)
- The HTML UI lets users switch between CPU and GPU and select six fragment shaders; the default starts on CPU. [HTML](https://github.com/LeandroSQ/js-metaballs/blob/master/src/index.html)
- The build uses Browserify/Babel and serves static assets, including GLSL files. [Build configuration](https://github.com/LeandroSQ/js-metaballs/blob/master/gulpfile.js); [package manifest](https://github.com/LeandroSQ/js-metaballs/blob/master/package.json)

### Inferences
- For a current practical browser implementation on Pi 5, use the GPU mode, cap the rendered canvas to a sensible output resolution, and avoid multiplying by a high device-pixel ratio unnecessarily. The source’s GPU work is approximately `pixels × active balls`; the default app has five balls although the shader reserves 20.
- CPU mode may be acceptable at low resolution or for testing, but it scales poorly at full-screen 1080p/4K because JavaScript performs millions of inner-loop operations and a full image upload each frame. This is an engineering inference from the nested loops and buffer path, not a repository benchmark.
- Pi 5’s advertised OpenGL ES 3.1 capability is favorable for WebGL, but WebGL availability in a specific browser depends on the browser’s graphics backend/driver. The code’s context fallback and alert make lack of WebGL a runtime compatibility issue rather than something guaranteed by the hardware specification.
- The uniform-array design caps the shader at 20 balls, while the current main loop supplies five. More balls increase fragment-loop cost linearly; increasing canvas pixel count increases cost linearly as well.
- Sustained animation can load both GPU and CPU (movement, uniform updates, browser compositing). Raspberry Pi’s own cooling guidance implies that a case fan/active cooler is prudent for stable sustained performance; this is a deployment recommendation, not a measured result for this repository.

### Gaps
- No official project benchmark reports FPS, watts, temperature, or resolution on Raspberry Pi 5; do not claim a measured FPS or guaranteed 60 FPS.
- No repository evidence establishes whether a particular Pi 5 browser build exposes WebGL2 versus only WebGL1. The renderer supports both context names, but shader compatibility should be tested on the target browser.
- The code has an apparent off-by-one loop condition (`if (i > uMetaBallCount) break`) in shaders, which permits `i == uMetaBallCount` rather than stopping before it. This may evaluate one extra uniform slot; the repository does not discuss the behavior, so treat it as an implementation quirk rather than a performance measurement.
