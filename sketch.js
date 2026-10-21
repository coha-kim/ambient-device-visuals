// ambient-device-visuals -- smooth gradient orbs for multiple populations, with a
// temporary, fully-reversible metaball MERGE where individuals from DIFFERENT
// populations meet. Intra-population attraction is independent and is never
// changed by portable-device input.
//
// Two logic domains are kept deliberately separate -- this boundary is what
// later sensor mapping depends on:
//
//   AUTONOMOUS (fixed, never sensor-exposed) -- Orb.wander()
//     Each orb wanders on its OWN Perlin-noise walk (seeded per orb). Nothing
//     an orb does here depends on any other orb. Movement SPEED is per population
//     (see speedByPop); the noise walk itself is fixed.
//
//   INTER-POPULATION (sensor-exposed: per-population attractionStrength; also
//   overallSize / per-population speed) -- Orb.applyCrossPopulationForces()
//     attractionStrength is set by the PULLED orb's own population, so it can be
//     asymmetric (pop 1 can chase the others harder than they chase it), and it
//     sweeps that population's contact with the others from a clean BOUNCE (weak
//     -- a firm repulsion shell held outside metaball fusion range) to a MERGE
//     (strong -- the shell recedes and attraction pulls orbs deep enough to
//     fuse). Proximity also sets each orb's `mergeAmount` (0..1) for the render;
//     move apart and it falls straight back to 0 -- no retained state, no bond.
//
// RENDER: every orb goes through a real metaball pipeline, ONE PASS. Each orb
// is drawn as a single disc filled with a smooth radial gradient (base colour
// at the rim, lightened toward white at the centre -- a continuous falloff,
// not discrete bands), all into one offscreen buffer. That buffer is then
// blitted onto the canvas through an SVG "goo" filter -- a Gaussian blur
// followed by a steep alpha step (feColorMatrix). The blur makes nearby discs'
// fields overlap and their gradients blend; the alpha step is a HARD threshold
// on the SHAPE only (colour channels pass through untouched), so overlapping
// discs fuse into a single shape with a genuine neck and a crisp iso-surface
// edge -- no soft halo bleeding into the background. A lone orb thresholds
// straight back to a clean hard-edged disc with a smooth gradient inside it.
// Where two different-population discs overlap in the neck, the blur mixes
// their gradients, so the bridge is a smooth blend, not an alpha overlay.
// The field disc size is FIXED (FIELD_REACH) -- a lone orb is always the same
// size whatever its attractionStrength; fusion is gated by the physics letting
// orbs get close, not by inflating the discs.
//
// Each population has its own `speed` slider: it scales that population's
// wander-clock advance and its per-frame step size (see speedByPop).

// ---- fixed config (set at init, NOT live-adjustable) ----
const CANVAS_W = 1024;
const CANVAS_H = 600;
const POP_COUNT = 3;
const MIN_INDIVIDUALS_PER_POP = 2;
const MAX_INDIVIDUALS_PER_POP = 4;
const POP_COLORS = Object.freeze(['#33C4A0', '#C6E2B6', '#DCEBD3']);

// ---- orb shape ----
// Each orb is one disc at this radius (as a fraction of overallSize), filled
// with a smooth radial gradient: base colour at the rim, lerped toward white
// at the centre. "base outward, lighten inward only" -- the rim is exactly the
// base colour and the centre is the lightest point; nothing is darker than
// the base colour.
const OUTER_RATIO = 1.00;
const CENTER_LIGHTEN = 0.66;

// ---- autonomous wander (fixed) ----
const MOVE_BASE_PX = 1.5;    // px/frame at speed 1
const NOISE_BASE   = 0.005;  // wander-time advance per frame at speed 1
// vx = noise(seed+off0) - noise(seed+off1), vy likewise with off2/off3. Four
// far-apart offsets so the channels are mutually decorrelated; a difference of
// two noise samples is zero-mean whatever noise()'s own mean is (see wander()).
const WANDER_NOISE_OFFSETS = [0, 2113, 4229, 6337];
const EDGE_MARGIN  = 110;
const EDGE_STEER   = 2.6;
const ROAM_FORCE = 0.035;
const ROAM_RADIUS_X = 0.34;
const ROAM_RADIUS_Y = 0.30;

// ---- attraction forces ----
// Inter-population strength is exposed to the portable device. Intra-population
// strength is fixed here so portable input cannot change within-group cohesion.
const BASE_INTER_ATTRACTION = 0.8;
const COLLISION_REACH_FACTOR = 1.05;
const INTER_ATTRACTION_SCALE_BY_POP = Object.freeze([0.0, 1.0, 1.0]);
// Radii scale with overallSize so the behaviour looks the same at any orb size.
//
// attractionStrength sweeps a population's cross-population contact from a clean
// BOUNCE to a MERGE:
//   weak  -> a firm repulsion shell sits OUTSIDE metaball fusion range, so
//            different-population orbs deflect off each other and never fuse.
//   strong-> the shell recedes to a small anti-collapse core AND attraction
//            pulls orbs deep past fusion range, so a fat coloured neck forms.
// mergeT in [0,1] is how far along that sweep this population sits (0 below
// MERGE_THRESHOLD, 1 at ATTR_MAX); it lerps both the shell radius and its gain.
const MERGE_THRESHOLD    = 0.6;   // attractionStrength at/below this = pure bounce, no merge
const MERGE_RESPONSE     = 0.68;  // <1 makes mid-range portable changes more visible
const INTERACTION_FACTOR = 2.6;   // attraction reaches this * overallSize
const MERGE_FULL_FACTOR  = 1.4;   // mergeAmount reaches 1 at this * overallSize (deep overlap)
const ATTRACT_BASE   = 0.18;      // px/frame per unit attractionStrength, at contact
const REPEL_DIST_BOUNCE = 2.8;    // soft-shell onset at mergeT 0 (* overallSize) -- beyond fusion range
const REPEL_DIST_MERGE  = 1.3;    // soft-shell onset at mergeT 1 (* overallSize) -- anti-collapse core only
const REPULSION_BOUNCE  = 3.0;    // px/frame max soft repel at mergeT 0 -- cushions the approach
const REPULSION_MERGE   = 0.9;    // px/frame max soft repel at mergeT 1 -- a light cushion
// HARD floor on different-population spacing, enforced as a position correction
// (resolveCrossPopulationSeparation). This is the actual guarantee that a weak
// pair BOUNCES: at mergeT 0 it holds them BOUNCE_SEPARATION * overallSize apart,
// just outside metaball fusion range; it shrinks to 0 as mergeT -> 1 so strong
// pairs are free to overlap and MERGE. The soft shell above just smooths it.
const BOUNCE_SEPARATION  = 2.5;   // * overallSize, at mergeT 0
const SEPARATION_ITERS   = 2;     // relaxation passes per frame (keeps 3-population shoves stable)

// ---- metaball merge rendering ----
// The goo filter runs at BUFFER resolution (cheap), then the thresholded layer
// is scaled up to the canvas with a plain bilinear blit -- that upscale also
// lends the hard iso-surface a slightly organic softness for free.
const MERGE_BUFFER_SCALE = 1.0; // calculate the field at the display's native 1024x600 resolution
// Disc radius fed into the field = ring radius * FIELD_REACH constant. This is
// randomized per orb so populations do not form identical circles. Whether two
// orbs FUSE is decided by the summed field and their physics.
const FIELD_REACH = 1.10;
const ATTR_MAX = 4;              // attraction slider max; the per-population sliders use this directly
const DISPLAY_SIZE_SCALE = 2.36; // twice the current display blob size
const RADIUS_VARIATION_PX = 20;
const FIELD_ISO = 0.20;
const FIELD_EDGE = 0.10;
const FIELD_RENDER_INTERVAL = 2; // update the expensive full-resolution field at 30Hz

// 0 at/below MERGE_THRESHOLD (pure bounce), ramping to 1 at ATTR_MAX (full
// merge). Drives the repulsion shell, the hard separation floor, and the
// render's mergeAmount, so one number moves a population along bounce<->merge.
function mergeTFor(pop) {
  const attraction = effectiveInterAttractionFor(pop);
  const normalized = constrain(
    (attraction - MERGE_THRESHOLD) / (ATTR_MAX - MERGE_THRESHOLD),
    0,
    1
  );
  return Math.pow(normalized, MERGE_RESPONSE);
}

function effectiveInterAttractionFor(pop) {
  return attractionStrengthByPop[pop] * INTER_ATTRACTION_SCALE_BY_POP[pop];
}

function effectiveBlobSize() {
  return overallSize * DISPLAY_SIZE_SCALE;
}

// ---- live params (sliders now; updateParamsFromSensor() later) ----
let overallSize = 65; // v7: 25% larger blobs
// per-population, indexed by pop. Attraction on an orb uses ITS OWN population's
// value, so pop 1 chasing pop 2 need not equal pop 2 chasing pop 1.
let attractionStrengthByPop = Array(POP_COUNT).fill(BASE_INTER_ATTRACTION);
let speedByPop = Array(POP_COUNT).fill(1.0);

let orbs = [];
let individualsPerPop = [];
let popColors = [];              // fixed p5.Color per population (rim)
let popCenterColors = [];        // fixed p5.Color per population (gradient centre)
let levelBuffer;                 // metaball field buffer
let fieldImageData;
let fieldOrbs = [];
let WHITE;

let noiseAccumByPop = Array(POP_COUNT).fill(0);  // advanced by each pop's speed -> wander time
let roamPhaseByPop = Array.from({ length: POP_COUNT }, (_, p) => p * Math.PI * 2 / POP_COUNT);
let sliderRefs = {};
let fpsSpan = null;

function setup() {
  const holder = document.getElementById('canvas-holder');
  pixelDensity(1);
  const cnv = createCanvas(CANVAS_W, CANVAS_H);
  cnv.parent(holder);
  cnv.style('display', 'block');
  WHITE = color(255);
  popColors = POP_COLORS.map(hex => color(hex));
  popCenterColors = popColors.map(base => lerpColor(base, WHITE, CENTER_LIGHTEN));
  const bw = Math.round(CANVAS_W * MERGE_BUFFER_SCALE);
  const bh = Math.round(CANVAS_H * MERGE_BUFFER_SCALE);
  levelBuffer = createGraphics(bw, bh);
  levelBuffer.pixelDensity(1);
  fieldImageData = levelBuffer.drawingContext.createImageData(
    levelBuffer.canvas.width,
    levelBuffer.canvas.height
  );
  levelBuffer.drawingContext.imageSmoothingEnabled = true;

  initOrbs();

  console.log(
    `[orbmerge] ${POP_COUNT} populations x ${individualsPerPop.join('/')} = ${orbs.length} orbs, ` +
    `shared scalar-field metaballs at ${levelBuffer.width}x${levelBuffer.height} ` +
    `(${MERGE_BUFFER_SCALE}x of canvas, pixel density 1).`
  );
}

function initOrbs() {
  orbs = [];
  individualsPerPop = Array.from(
    { length: POP_COUNT },
    () => floor(random(MIN_INDIVIDUALS_PER_POP, MAX_INDIVIDUALS_PER_POP + 1))
  );
  const cx = width / 2, cy = height / 2;
  for (let p = 0; p < POP_COUNT; p++) {
    // Each population starts loosely gathered around its own point, so the
    // first cross-population contact is a genuine approach (a merge event)
    // rather than everything spawning in one pile.
    const a = (p / POP_COUNT) * TWO_PI - HALF_PI;
    const gx = cx + Math.cos(a) * width * 0.38;
    const gy = cy + Math.sin(a) * height * 0.38;
    for (let i = 0; i < individualsPerPop[p]; i++) {
      orbs.push(new Orb(
        constrain(gx + random(-70, 70), 60, width - 60),
        constrain(gy + random(-70, 70), 60, height - 60),
        p));
    }
  }
}

// STUB -- later WebSocket / sensor rig. Only the sensor-controllable params are
// reachable here (inter-population attractionStrength + speed, overallSize);
// intra-population attraction and autonomous wander constants are intentionally
// out of reach.
// speeds / attractionStrengths are arrays indexed by population; undefined or
// missing entries are left untouched.
function updateParamsFromSensor(data) {
  if (data.overallSize !== undefined) setParam('overallSize', data.overallSize, (v) => { overallSize = v; });
  if (Array.isArray(data.speeds)) data.speeds.forEach((s, p) => {
    if (p < POP_COUNT && s !== undefined) setParam('speed' + p, s, (v) => { speedByPop[p] = v; });
  });
  if (Array.isArray(data.attractionStrengths)) data.attractionStrengths.forEach((a, p) => {
    if (p < POP_COUNT && a !== undefined) setParam('attract' + p, a, (v) => { attractionStrengthByPop[p] = v; });
  });

}

function setParam(key, value, assign) {
  const ref = sliderRefs[key];
  const v = ref ? constrain(value, ref.min, ref.max) : value;
  assign(v);
  if (ref) { ref.slider.value(v); ref.valSpan.html(String(v)); }
}

function draw() {
  window.harveyAmbientV1?.update();
  background(7, 7, 11);

  for (let p = 0; p < POP_COUNT; p++) {
    noiseAccumByPop[p] += NOISE_BASE * speedByPop[p];
    roamPhaseByPop[p] += NOISE_BASE * speedByPop[p] * 0.35;
  }

  // --- AUTONOMOUS: each orb on its own seed, on its population's clock ---
  for (const o of orbs) o.wander(noiseAccumByPop[o.pop]);

  // --- INTER-POPULATION: attraction / soft repulsion shell + merge proximity ---
  for (const o of orbs) o.applyCrossPopulationForces(orbs);

  for (const o of orbs) o.update();

  // --- RENDER: every orb through the single-pass metaball pipeline ---
  if (frameCount % FIELD_RENDER_INTERVAL === 0) {
    renderOrbLayers();
  } else {
    image(levelBuffer, 0, 0, width, height);
  }

}

// Evaluate one shared metaball field. The contour is the isosurface of the
// summed influences, so contact changes the silhouette instead of preserving
// two independent circles.
function renderOrbLayers() {
  const w = levelBuffer.width;
  const h = levelBuffer.height;
  const scale = w / width;
  const pixels = fieldImageData.data;
  pixels.fill(0);

  fieldOrbs = orbs.map((o) => {
    const radius = o.visualRadius();
    const rim = popColors[o.pop];
    const radiusInField = radius * scale;
    return {
      x: o.pos.x * scale,
      y: o.pos.y * scale,
      radiusInField,
      radiusSquared: radiusInField * radiusInField,
      minX: Math.max(0, Math.floor((o.pos.x - radius) * scale)),
      maxX: Math.min(w - 1, Math.ceil((o.pos.x + radius) * scale)),
      minY: Math.max(0, Math.floor((o.pos.y - radius) * scale)),
      maxY: Math.min(h - 1, Math.ceil((o.pos.y + radius) * scale)),
      red: red(rim),
      green: green(rim),
      blue: blue(rim)
    };
  });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let field = 0;
      let redSum = 0, greenSum = 0, blueSum = 0;

      for (const o of fieldOrbs) {
        if (x < o.minX || x > o.maxX || y < o.minY || y > o.maxY) continue;
        const dx = x + 0.5 - o.x;
        const dy = y + 0.5 - o.y;
        const normalizedDistanceSquared = (dx * dx + dy * dy) / o.radiusSquared;
        if (normalizedDistanceSquared >= 1) continue;

        const influence = (1 - normalizedDistanceSquared) ** 2;
        field += influence;
        redSum += o.red * influence;
        greenSum += o.green * influence;
        blueSum += o.blue * influence;
      }

      const index = (y * w + x) * 4;
      const edgePosition = constrain(
        (field - (FIELD_ISO - FIELD_EDGE)) / (FIELD_EDGE * 2),
        0,
        1
      );
      const alpha = edgePosition * edgePosition * (3 - 2 * edgePosition);
      if (alpha <= 0) continue;
      const inv = 1 / field;
      const centerLight = constrain((field - FIELD_ISO) * 0.55, 0, CENTER_LIGHTEN);
      pixels[index] = lerp(redSum * inv, 255, centerLight);
      pixels[index + 1] = lerp(greenSum * inv, 255, centerLight);
      pixels[index + 2] = lerp(blueSum * inv, 255, centerLight);
      pixels[index + 3] = alpha * 255;
    }
  }

  levelBuffer.drawingContext.putImageData(fieldImageData, 0, 0);
  image(levelBuffer, 0, 0, width, height);
}

// HARD floor on different-population spacing -- the guarantee that a weak pair
// BOUNCES rather than merges. Each population's floor is BOUNCE_SEPARATION *
// overallSize scaled by (1 - mergeT), so a pop at attraction 0 keeps a gap wide
// enough that its metaball fields never fuse, and a pop near ATTR_MAX has no
// floor at all. For a mixed pair the WIDER floor wins -- if either side refuses
// to merge, the pair bounces. A couple of relaxation passes keep 3-population
// pile-ups from jittering. Runs after update(), so it also re-clamps to canvas.
function resolveCrossPopulationSeparation(all) {
  const sepByPop = [];
  for (let p = 0; p < POP_COUNT; p++) {
    sepByPop[p] = effectiveBlobSize() * BOUNCE_SEPARATION * (1 - mergeTFor(p));
  }
  for (let it = 0; it < SEPARATION_ITERS; it++) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.pop === b.pop) continue;
        const minSep = Math.max(sepByPop[a.pop], sepByPop[b.pop]);
        if (minSep <= 0) continue;
        let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
        let d = Math.hypot(dx, dy);
        if (d >= minSep) continue;
        if (d < 1e-4) { dx = 1; dy = 0; d = 1e-4; }
        const push = (minSep - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.pos.x -= ux * push; a.pos.y -= uy * push;
        b.pos.x += ux * push; b.pos.y += uy * push;
      }
    }
  }
  const r = Math.max(...all.map(o => o.visualRadius()));
  for (const o of all) {
    o.pos.x = constrain(o.pos.x, r, width - r);
    o.pos.y = constrain(o.pos.y, r, height - r);
  }
}

class Orb {
  constructor(x, y, pop) {
    this.pos = createVector(x, y);
    this.pop = pop;
    this.autoVel = createVector(0, 0);
    this.collisionForce = createVector(0, 0);
    this.mergeAmount = 0;
    this.radiusOffset = random(-RADIUS_VARIATION_PX, RADIUS_VARIATION_PX);
    // per-individual seed so wander paths never fall into sync across a population.
    this.noiseSeed = random(1000);
  }

  visualRadius() {
    return OUTER_RATIO * Math.max(20, effectiveBlobSize() + this.radiusOffset) * FIELD_REACH;
  }

  // AUTONOMOUS -- velocity is the DIFFERENCE of two Perlin channels per axis
  // (this orb's own seed + its population's wander clock), plus a soft steer
  // away from the canvas edges. No reference to any other orb.
  //
  // Why a difference: the earlier version took a SINGLE noise channel as an
  // angle (heading = noise * TWO_PI * turns). p5's noise() clusters around its
  // mean (~0.47, NOT 0.5), so that heading clustered around one direction and
  // every orb crept that way forever -- the "everything drifts right" bug.
  // noise()*2-1 has the same disease (mean ~= -0.06, so a steady pull). A
  // difference of two independent noise samples is exactly zero-mean and
  // symmetric no matter what noise()'s mean is, so there is no net drift.
  wander(nz) {
    const [o0, o1, o2, o3] = WANDER_NOISE_OFFSETS;
    let vx = noise(this.noiseSeed + o0, nz) - noise(this.noiseSeed + o1, nz);
    let vy = noise(this.noiseSeed + o2, nz) - noise(this.noiseSeed + o3, nz);

    const m = EDGE_MARGIN;
    if (this.pos.x < m)          vx += EDGE_STEER * (1 - this.pos.x / m);
    if (this.pos.x > width - m)  vx -= EDGE_STEER * (1 - (width - this.pos.x) / m);
    if (this.pos.y < m)          vy += EDGE_STEER * (1 - this.pos.y / m);
    if (this.pos.y > height - m) vy -= EDGE_STEER * (1 - (height - this.pos.y) / m);

    this.autoVel.set(vx, vy);
    if (this.autoVel.magSq() > 1e-6) this.autoVel.setMag(MOVE_BASE_PX * speedByPop[this.pop]);

    const phase = roamPhaseByPop[this.pop];
    const targetX = width * 0.5 + Math.cos(phase) * width * ROAM_RADIUS_X;
    const targetY = height * 0.5 + Math.sin(phase * 0.83) * height * ROAM_RADIUS_Y;
    this.autoVel.x += (targetX - this.pos.x) * ROAM_FORCE / width;
    this.autoVel.y += (targetY - this.pos.y) * ROAM_FORCE / height;
  }

  // INTER-POPULATION -- attraction toward, and a repulsion shell around,
  // DIFFERENT-population orbs, plus this orb's merge proximity (0..1) for the
  // render. Same-population orbs are skipped entirely.
  //
  // Only different-population boids interact, and only while their field
  // radii overlap. Their shared field creates the metaball collision shape;
  // attraction changes the local collision response, not free movement.
  applyCrossPopulationForces(all) {
    this.collisionForce.set(0, 0);
    this.mergeAmount = 0;

    const attr = effectiveInterAttractionFor(this.pop);
    const mergeT = mergeTFor(this.pop);
    const ownRadius = this.visualRadius();

    for (const other of all) {
      if (other === this || other.pop === this.pop) continue;
      const dx = other.pos.x - this.pos.x;
      const dy = other.pos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      const collisionReach = (ownRadius + other.visualRadius()) * COLLISION_REACH_FACTOR;
      if (d >= collisionReach) continue;

      const ux = d > 1e-4 ? dx / d : 1;
      const uy = d > 1e-4 ? dy / d : 0;
      const contact = constrain(1 - d / collisionReach, 0, 1);
      const attract = attr * ATTRACT_BASE * contact;
      this.collisionForce.x += ux * attract;
      this.collisionForce.y += uy * attract;

      const m = mergeT * contact;
      if (m > this.mergeAmount) this.mergeAmount = m;
    }
  }

  update() {
    this.pos.x += this.autoVel.x + this.collisionForce.x;
    this.pos.y += this.autoVel.y + this.collisionForce.y;
    // keep the whole outer ring on-canvas so the goo filter never clips a blob
    // at the edge (wander()'s edge steer usually keeps orbs off this clamp).
    const r = this.visualRadius();
    this.pos.x = constrain(this.pos.x, r, width - r);
    this.pos.y = constrain(this.pos.y, r, height - r);
  }
}
