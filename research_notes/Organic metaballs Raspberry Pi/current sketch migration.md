# Organic metaball renderer migration for `ambient-device-visuals`

## Why the current blobs separate after contact

### Takeaway
The current implementation makes merging a transient visual consequence of proximity, not a physical or topological state. Once positions are pushed apart by the separation solver or autonomous motion, `mergeAmount` is recomputed as zero and the renderer receives separate discs again.

### Cited Findings
- `Orb.applyCrossPopulationForces(all)` begins each call with `this.mergeAmount = 0`; it then computes `m` from current distance and `mergeT`, retaining only the largest current neighbor contribution. There is no hysteresis, bond graph, merged cluster, or accumulated field state. [Current `sketch.js`, `applyCrossPopulationForces`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L389-L430)
- The hard solver `resolveCrossPopulationSeparation(all)` runs after `Orb.update()`. For each cross-population pair it enforces `minSep = max(sepByPop[a.pop], sepByPop[b.pop])`; at weak attraction this is `overallSize * BOUNCE_SEPARATION`, explicitly keeping the pair outside the fusion range. [Current `sketch.js`, `resolveCrossPopulationSeparation`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L304-L338)
- Rendering is a shared raster pass: `renderOrbLayers()` draws one radial-gradient disc per orb, applies `feGaussianBlur`, then a steep alpha `feColorMatrix`, and upscales the result. This can make nearby discs touch, but it does not create a persistent object that survives separation. [Current `sketch.js`, `renderOrbLayers` and `injectGooFilter`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L227-L303)
- A goo filter is conventionally blur followed by alpha thresholding; it changes the visible contour of overlapping source shapes, not their simulation state. [MDN, `feGaussianBlur`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feGaussianBlur); [Gooey filter construction](https://animationpatterns.art/animations/gooey-blob-construction/)
- A smooth SDF union similarly defines a blended contour from instantaneous primitive distances. Inigo Quilez describes smooth-min/smooth-union as replacing a regular minimum with a smooth operator; it does not imply sticky dynamics. [Inigo Quilez, Smooth Minimum](https://iquilezles.org/articles/smin/)

### Inferences
- The main cause is intentional, not a bug in SVG: `mergeAmount` is a distance-derived display scalar and `resolveCrossPopulationSeparation()` can immediately undo the overlap required by the filter.
- `FIELD_REACH` plus the `0.18 * mergeAmount` radius boost is also only a visual enlargement. It cannot preserve a neck after centers separate.
- To get organic merged blobs, separate **field topology** from **particle collision policy**. A field renderer can preserve a single contour while members remain nearby; persistent merge requires a small state machine or cluster-level dynamics in addition to the contour.

### Gaps
- The prompt mentions three user-provided references, but no reference URLs or attachments are present in the repository or visible task context. The recommendations below therefore use the current source plus public technical references; the three unspecified references should be reconciled before implementation.

## External parameter contract and mapping

### Takeaway
Keep `overallSize`, `speeds[]`, and `attractionStrengths[]` as the only live contract. Map size to field radius/grid scale, speeds to the existing wander clocks and optionally low-amplitude field advection, and attraction strengths to both cross-population approach and a field blend/persistence control. Do not expose solver constants, grid resolution, contour threshold, viscosity, or autonomous noise constants.

### Cited Findings
- `updateParamsFromSensor(data)` accepts `data.overallSize`, an indexed `data.speeds` array, and an indexed `data.attractionStrengths` array; undefined or missing entries are left unchanged through `setParam()`. [Current `sketch.js`, `updateParamsFromSensor`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L180-L202)
- The live arrays are population-indexed (`speedByPop`, `attractionStrengthByPop`) and attraction is deliberately keyed to the pulled orb’s own population, allowing asymmetry. [Current `sketch.js`, live params and `Orb.applyCrossPopulationForces`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L119-L126)
- Speeds currently advance `noiseAccumByPop[p]` and set each orb’s autonomous step magnitude; this is the safest mapping to retain unchanged. [Current `sketch.js`, `draw()` and `Orb.wander()`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L204-L219)
- A scalar field can be contoured with marching squares; the algorithm extracts an iso-contour from a sampled scalar field rather than requiring independent circles. [Marching squares overview](https://en.wikipedia.org/wiki/Marching_squares)
- Smooth union is a standard way to blend implicit primitives; its blend parameter controls the width/softness of the transition. [Inigo Quilez, Smooth Minimum](https://iquilezles.org/articles/smin/)

### Inferences
- **`overallSize`**: preserve its current units (pixels). Use `radius = overallSize * FIELD_REACH` for each source contribution and scale the field cell size or render target only if needed for performance. Do not encode size by changing attraction; size must remain independent as it is today.
- **`speeds[p]`**: leave the current `NOISE_BASE * speedByPop[p]` and `MOVE_BASE_PX * speedByPop[p]` behavior intact. If a fluid-like renderer adds advection, use `speeds[p]` only as a bounded per-population injection/advection multiplier; never make it alter radius, threshold, or merge persistence.
- **`attractionStrengths[p]`**: retain the current owner/pulled-population semantics. Derive `mergeTFor(p)` as the normalized control signal, use it to reduce the pair separation floor and increase pair/cluster blend radius or bond formation probability. For a pair with populations `a` and `b`, use a documented symmetric effective blend such as `max(mergeT(a), mergeT(b))` (matching the current “wider floor wins” policy) or `min` if the product requirement is “both must opt in”; do not silently average away asymmetry.
- Keep the WebSocket adapter unchanged: `ambient-link-v1.mjs` calls `updateParamsFromSensor({ attractionStrengths })` for the selected population, while `harvey-link-v1.mjs` preserves `BASE_ATTRACTION = 1.3` and the recovery curve. [Current `ambient-link-v1.mjs`](https://github.com/coha-kim/ambient-device-visuals/blob/main/ambient-link-v1.mjs); [Current `harvey-link-v1.mjs`](https://github.com/coha-kim/ambient-device-visuals/blob/main/harvey-link-v1.mjs)

### Gaps
- The current contract does not specify whether arrays are always length three, whether values are normalized, or whether `overallSize` may change while a blob is bonded. Preserve current permissive behavior and add validation/tests before tightening it.

## Minimal surgical migration versus rewrite

### Takeaway
The lowest-risk path is to replace only `renderOrbLayers()` with a sampled scalar-field renderer while initially retaining `Orb.wander()`, `Orb.applyCrossPopulationForces()`, `Orb.update()`, and the public sensor function. A full fluid solver is a separate rewrite and is not justified until the field renderer fails the desired organic motion or Raspberry Pi budget.

### Cited Findings
- The existing pipeline already centralizes rendering in one function and uses half-resolution buffers (`MERGE_BUFFER_SCALE = 0.5`), making a field buffer a localized replacement. [Current `sketch.js`, setup and rendering constants](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L100-L160)
- WebGL is the browser API intended for GPU-accelerated 2D/3D graphics and can support a fragment-shader field evaluation when Canvas/SVG becomes a bottleneck. [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
- SDF smooth unions provide a compact shader-side contour alternative to drawing many blurred discs. [Inigo Quilez, Smooth Minimum](https://iquilezles.org/articles/smin/)

### Inferences
- **Phase 0 — instrument/fallback:** add a renderer switch (default current goo, optional field renderer), expose no new sensor keys, and record frame time, field resolution, contour count, and WebGL/SVG support. Keep the current renderer as a runtime fallback.
- **Phase 1 — minimal scalar field:** at the existing half-resolution, sample `F(x,y) = Σ w_i * kernel(distance(x, orb_i)/radius_i)` for all 15 orbs. Use a smooth radial kernel (e.g. inverse-square or compact polynomial), choose one iso-threshold, and color each pixel by weighted population contribution. This naturally produces larger, non-circular necks without changing physics. A fragment shader is preferable for Pi if available; a CPU field plus marching squares is a correctness prototype.
- **Phase 2 — contour/organic perturbation:** render the iso-contour using marching squares or an SDF fragment shader, then add low-amplitude, deterministic noise to the field coordinates or radii. Keep perturbation below approximately 5–10% of `overallSize`; it should make silhouettes organic, not destroy contact determinism.
- **Phase 3 — persistence only if required:** add `mergeState`/bond clusters keyed by orb IDs. On contact above a threshold, create a bond with a short hold time; decay/release only after distance exceeds a larger hysteresis threshold for a release duration. Render a cluster field from member centers and preserve individual population color weights. This directly addresses “merged after contact” rather than faking it with blur.
- **Fluid-like rewrite:** only after profiling. A stable fluid solver needs velocity advection, diffusion/viscosity, pressure solve/projection, and boundary handling; it introduces grid state, timestep stability, resizing, and more Pi/GPU failure modes. Use it when the desired effect is actual flow/trails, not merely organic merged contours.
- **Fallback order:** WebGL field → Canvas 2D scalar field/marching squares → current SVG goo filter. If a renderer fails capability detection or exceeds a frame budget for several frames, switch back without changing parameters or physics.

### Gaps
- No target Raspberry Pi model/browser benchmark or visual acceptance screenshot is included. Measure on the actual Chromium/device before selecting CPU marching squares versus WebGL.

## Correctness and acceptance risks

### Takeaway
The highest risks are not the contour math alone: asymmetric population controls, contradictory separation floors, cluster release semantics, fixed canvas assumptions, and hidden UI/observability. These need explicit acceptance tests before replacing the renderer.

### Cited Findings
- There are three populations and five orbs each, with fixed `CANVAS_W = 1024`, `CANVAS_H = 600`, and a fixed initialization layout. [Current `sketch.js`, fixed config and `initOrbs()`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L45-L50); [Current `sketch.js`, `initOrbs`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L160-L178)
- Physics clamps positions using `overallSize`, but canvas creation is fixed at 1024×600; responsive CSS stretches the canvas rather than changing the simulation dimensions. [Current `sketch.js`, `setup()` and `Orb.update()`](https://github.com/coha-kim/ambient-device-visuals/blob/main/sketch.js#L137-L158); [Current `index.html`](https://github.com/coha-kim/ambient-device-visuals/blob/main/index.html#L8-L35)
- The controls container is hidden with `display: none !important`, so there is no visible UI for diagnosing live values or renderer state. [Current `index.html`](https://github.com/coha-kim/ambient-device-visuals/blob/main/index.html#L17-L25)

### Inferences
- **Population asymmetry:** a sensor reducing only population 1’s attraction should not accidentally reduce population 0/2’s field blend. Define pair blend policy explicitly and test all ordered pairs `(a,b)`, including one side at 0 and the other at `ATTR_MAX`.
- **Merge persistence:** distinguish visual overlap from semantic bonding. Acceptance cases should cover contact, one-frame separation, sustained separation, re-contact, and a third population entering an existing cluster.
- **Separation floor:** current `resolveCrossPopulationSeparation()` is intentionally incompatible with persistent overlap at low attraction. For field-only migration retain it; for sticky bonds skip or replace the pair floor for bonded members, while still applying a cluster anti-collapse radius.
- **Canvas dimensions:** avoid hard-coding field extents to CSS pixels. Either preserve the 1024×600 simulation contract and document it, or introduce a resize transform that updates buffers, edge margins, and clamping together. Test high-DPI and a non-1024 viewport.
- **No visible UI:** add a development-only overlay or console diagnostics behind a flag, not public controls. It should show `overallSize`, each speed/attraction, renderer mode, buffer dimensions, and FPS without changing the sensor contract.
- **Color correctness:** for a scalar field, compute per-population weights before thresholding so a bridge between populations blends by field contribution; do not threshold each population separately or the neck will split into layered silhouettes.
- **Numerical correctness:** guard zero-distance pairs, finite sensor values, and empty/short arrays. Keep `setParam()` clamping behavior and add tests for NaN/Infinity because a field shader receiving invalid uniforms can blank the frame.

### Gaps
- There are no automated tests, visual snapshots, or documented performance thresholds in the current repository. A migration should add a deterministic headless/fixture test for parameter mapping and a small renderer comparison fixture before deleting the SVG path.
