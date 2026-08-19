/** WGSL compute: advances packed simulation state and writes the visual field texture. */
export const COMPUTE_WGSL = /* wgsl */ `
struct SimState { data: array<f32, 48> }
struct Params {
  grid_w: u32,
  grid_h: u32,
  running: u32,
  _pad: u32,
}

@group(0) @binding(0) var<storage, read> state_in: SimState;
@group(0) @binding(1) var<storage, read_write> state_out: SimState;
@group(0) @binding(2) var field_in: texture_2d<f32>;
@group(0) @binding(3) var field_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> params: Params;

fn hash_noise(tick: u32, salt: u32) -> f32 {
  var n: u32 = tick * 374761393u + salt * 668265263u;
  n = n ^ (n >> 13u);
  n = n * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n >> 8u) * (1.0 / 16777216.0);
}

fn objective(x: f32, y: f32) -> f32 {
  let dx = x - 0.72;
  let dy = y - 0.28;
  let basin = 1.0 - (dx * dx + dy * dy) / 0.85;
  let sx = sin(9.0 * x);
  let sy = sin(9.0 * y);
  return basin - 0.12 * (sx * sx + sy * sy);
}

fn cl01(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }

fn copy_state() {
  for (var i = 0u; i < 48u; i++) {
    state_out.data[i] = state_in.data[i];
  }
}

fn repel(ax: f32, ay: f32, ox: f32, oy: f32, radius: f32) -> vec3<f32> {
  let rx = ax - ox;
  let ry = ay - oy;
  let d = length(vec2<f32>(rx, ry));
  let margin = radius + 0.08;
  if (d >= margin) { return vec3<f32>(0.0); }
  let strength = ((margin - d) / margin) * 4.2;
  return vec3<f32>((rx / (d + 1e-6)) * strength, (ry / (d + 1e-6)) * strength, strength);
}

fn step_nav() {
  let phase = state_in.data[14] + 0.045;
  state_out.data[14] = phase;
  let tx = 0.5 + 0.32 * cos(phase);
  let ty = 0.5 + 0.32 * sin(phase * 0.7);
  state_out.data[10] = tx;
  state_out.data[11] = ty;
  var ax = state_in.data[8];
  var ay = state_in.data[9];
  let dx = tx - ax;
  let dy = ty - ay;
  let dist = length(vec2<f32>(dx, dy));
  state_out.data[23] = state_in.data[15];
  var nx = dx / (dist + 1e-6);
  var ny = dy / (dist + 1e-6);
  let r0 = repel(ax, ay, state_in.data[16], state_in.data[17], state_in.data[18]);
  let r1 = repel(ax, ay, state_in.data[19], state_in.data[20], state_in.data[21]);
  nx = nx + r0.x + r1.x;
  ny = ny + r0.y + r1.y;
  let len = length(vec2<f32>(nx, ny));
  let vx = (nx / (len + 1e-6)) * 0.038;
  let vy = (ny / (len + 1e-6)) * 0.038;
  ax = clamp(ax + vx, 0.03, 0.97);
  ay = clamp(ay + vy, 0.03, 0.97);
  state_out.data[8] = ax;
  state_out.data[9] = ay;
  state_out.data[12] = vx;
  state_out.data[13] = vy;
  state_out.data[22] = state_in.data[22] + length(vec2<f32>(vx, vy));
  state_out.data[24] = r0.z + r1.z;
  let new_dist = length(vec2<f32>(tx - ax, ty - ay));
  state_out.data[15] = new_dist;
  if (new_dist < 0.07) { state_out.data[25] = 1.0; }
}

fn step_anomaly() {
  let tick = u32(state_out.data[1]);
  let phase = state_in.data[12] + 0.35;
  state_out.data[12] = phase;
  let background = 0.5 + 0.12 * sin(phase);
  var is_anom = 0.0;
  if (tick > 0u && (tick % 23u) == 0u) { is_anom = 1.0; }
  var observation = background;
  if (is_anom > 0.5) { observation = 1.0; }
  let habit = state_in.data[9];
  let error = observation - habit;
  let salience = abs(error);
  let learn = 0.15 * (1.0 - smoothstep(0.16, 0.42, salience));
  state_out.data[9] = cl01(habit + learn * error);
  state_out.data[8] = observation;
  state_out.data[10] = salience;
  state_out.data[11] = is_anom;
  state_out.data[17] = smoothstep(0.18, 0.5, salience);
  if (is_anom > 0.5) {
    state_out.data[16] = salience;
    if (salience > 0.22) { state_out.data[13] = state_in.data[13] + 1.0; }
  } else {
    state_out.data[18] = salience;
    state_out.data[15] = state_in.data[15] * 0.85 + salience * 0.15;
    if (salience > 0.28) { state_out.data[14] = state_in.data[14] + 1.0; }
  }
}

fn step_opt() {
  let tick = u32(state_out.data[1]);
  let sigma = state_in.data[13];
  let n1 = max(hash_noise(tick, 1u), 1e-6);
  let n2 = hash_noise(tick, 2u);
  let mag = sqrt(-2.0 * log(n1));
  let g1 = mag * cos(6.2831853 * n2);
  let g2 = mag * sin(6.2831853 * n2);
  let cx = cl01(state_in.data[8] + g1 * sigma);
  let cy = cl01(state_in.data[9] + g2 * sigma);
  let cf = objective(cx, cy);
  state_out.data[15] = cf;
  state_out.data[14] = state_in.data[14] + 1.0;
  if (cf >= state_in.data[12]) {
    state_out.data[12] = cf;
    state_out.data[10] = cx;
    state_out.data[11] = cy;
    state_out.data[8] = cx;
    state_out.data[9] = cy;
    state_out.data[13] = max(0.02, sigma * 0.96);
    state_out.data[16] = 1.0;
    state_out.data[17] = 0.0;
  } else {
    state_out.data[8] = state_in.data[8] * 0.82 + state_in.data[10] * 0.18;
    state_out.data[9] = state_in.data[9] * 0.82 + state_in.data[11] * 0.18;
    state_out.data[13] = min(0.28, sigma * 1.035);
    state_out.data[16] = 0.0;
    state_out.data[17] = state_in.data[17] + 1.0;
  }
}

fn waypoint(i: i32) -> vec2<f32> {
  switch i {
    case 0: { return vec2<f32>(0.15, 0.5); }
    case 1: { return vec2<f32>(0.38, 0.72); }
    case 2: { return vec2<f32>(0.62, 0.28); }
    default: { return vec2<f32>(0.85, 0.55); }
  }
}

fn step_plan() {
  var stage = state_in.data[8];
  var prog = state_in.data[9];
  var energy = state_in.data[11];
  var validity = state_in.data[10];
  var unc = state_in.data[14];
  if (stage >= 4.0) {
    state_out.data[18] = 0.0;
    state_out.data[11] = cl01(energy + 0.01);
    state_out.data[14] = max(0.04, unc * 0.98);
    return;
  }
  if (energy < 0.1) {
    state_out.data[18] = 1.0;
    state_out.data[11] = cl01(energy + 0.08);
    state_out.data[10] = cl01(validity * 0.985);
    state_out.data[14] = cl01(unc + 0.015);
    return;
  }
  state_out.data[18] = 0.0;
  if (unc > 0.72) {
    validity = 0.48;
    unc = 0.4;
    state_out.data[15] = state_in.data[15] + 1.0;
  }
  prog = prog + 0.09 * validity;
  energy = energy - 0.03;
  unc = max(0.05, unc - 0.02);
  validity = cl01(validity + 0.02 * (1.0 - validity));
  if (prog >= 1.0) {
    stage = stage + 1.0;
    prog = 0.0;
    state_out.data[13] = state_in.data[13] + 1.0;
    state_out.data[12] = 0.0;
  } else {
    state_out.data[12] = floor(prog * 3.0);
  }
  let si = i32(min(stage, 3.0));
  let start_pt = waypoint(si);
  let to_pt = waypoint(si + 1);
  state_out.data[16] = start_pt.x + (to_pt.x - start_pt.x) * prog;
  state_out.data[17] = start_pt.y + (to_pt.y - start_pt.y) * prog;
  state_out.data[8] = min(stage, 4.0);
  state_out.data[9] = prog;
  state_out.data[11] = cl01(energy);
  state_out.data[10] = validity;
  state_out.data[14] = unc;
}

fn step_partial() {
  let tick = u32(state_out.data[1]);
  var hx = state_in.data[8] + state_in.data[16] * 0.03;
  var hy = state_in.data[9] + state_in.data[17] * 0.03;
  var vx = state_in.data[16];
  var vy = state_in.data[17];
  if (hx < 0.06 || hx > 0.94) {
    vx = -vx;
    hx = clamp(hx, 0.06, 0.94);
  }
  if (hy < 0.06 || hy > 0.94) {
    vy = -vy;
    hy = clamp(hy, 0.06, 0.94);
  }
  state_out.data[8] = hx;
  state_out.data[9] = hy;
  state_out.data[16] = vx;
  state_out.data[17] = vy;
  let obs_x = cl01(hx + (hash_noise(tick, 3u) - 0.5) * 0.18);
  let obs_y = cl01(hy + (hash_noise(tick, 4u) - 0.5) * 0.18);
  state_out.data[12] = obs_x;
  state_out.data[13] = obs_y;
  let p = state_in.data[14];
  let k = p / (p + 0.09);
  state_out.data[10] = state_in.data[10] + k * (obs_x - state_in.data[10]);
  state_out.data[11] = state_in.data[11] + k * (obs_y - state_in.data[11]);
  state_out.data[14] = (1.0 - k) * p + 0.008;
  let ex = state_out.data[10] - hx;
  let ey = state_out.data[11] - hy;
  state_out.data[15] = length(vec2<f32>(ex, ey));
}

@compute @workgroup_size(1)
fn step_main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x != 0u) { return; }
  copy_state();
  if (params.running == 0u) { return; }
  state_out.data[1] = state_in.data[1] + 1.0;
  let kind = i32(state_in.data[0]);
  switch kind {
    case 0: { step_nav(); }
    case 1: { step_anomaly(); }
    case 2: { step_opt(); }
    case 3: { step_plan(); }
    default: { step_partial(); }
  }
}

fn glow(d: f32, radius: f32, intensity: f32) -> f32 {
  let x = d / radius;
  return intensity * exp(-x * x * 2.4);
}

fn stamp_nav(uv: vec2<f32>) -> vec3<f32> {
  var col = vec3<f32>(0.07, 0.08, 0.16);
  col = col + vec3<f32>(0.04, 0.02, 0.06) * (0.5 + 0.5 * sin(uv.x * 28.0) * sin(uv.y * 28.0));
  let d0 = distance(uv, vec2<f32>(state_out.data[16], state_out.data[17]));
  let d1 = distance(uv, vec2<f32>(state_out.data[19], state_out.data[20]));
  if (d0 < state_out.data[18]) { col = vec3<f32>(0.28, 0.1, 0.38); }
  if (d1 < state_out.data[21]) { col = vec3<f32>(0.24, 0.08, 0.4); }
  let t = glow(distance(uv, vec2<f32>(state_out.data[10], state_out.data[11])), 0.1, 1.2);
  let a = glow(distance(uv, vec2<f32>(state_out.data[8], state_out.data[9])), 0.08, 1.3);
  col = col + vec3<f32>(1.0, 0.32, 0.68) * t;
  col = col + vec3<f32>(0.45, 0.95, 1.0) * a;
  return col;
}

fn stamp_anomaly(uv: vec2<f32>) -> vec3<f32> {
  let sal = state_out.data[10];
  let flag = state_out.data[11];
  let wave = 0.5 + 0.5 * sin((uv.x * 18.0 + state_out.data[12]) * (1.0 - flag * 0.4));
  let band = exp(-pow(uv.y - (0.5 + (state_out.data[8] - 0.5) * 0.4), 2.0) * 28.0);
  let heat = sal * (0.45 + flag);
  return vec3<f32>(
    0.1 + heat * 0.95 + band * 0.35,
    0.06 + wave * 0.18 + (1.0 - flag) * band * 0.25,
    0.16 + (1.0 - heat) * 0.35 + flag * 0.45
  );
}

fn stamp_opt(uv: vec2<f32>) -> vec3<f32> {
  let f = cl01((objective(uv.x, uv.y) + 0.2) / 1.3);
  var col = vec3<f32>(0.06 + (1.0 - f) * 0.18, 0.07 + f * 0.32, 0.16 + f * 0.5);
  let probe = glow(distance(uv, vec2<f32>(state_out.data[8], state_out.data[9])), 0.07, 1.2);
  let best = glow(distance(uv, vec2<f32>(state_out.data[10], state_out.data[11])), 0.09, 1.1);
  col = col + vec3<f32>(0.44, 0.9, 1.0) * probe + vec3<f32>(1.0, 0.32, 0.7) * best;
  return col;
}

fn stamp_plan(uv: vec2<f32>) -> vec3<f32> {
  let energy = state_out.data[11];
  var col = vec3<f32>(0.06, 0.07 + energy * 0.1, 0.14 + energy * 0.12);
  let body = glow(distance(uv, vec2<f32>(state_out.data[16], state_out.data[17])), 0.08, 1.2);
  let corridor = exp(-pow(uv.y - 0.5, 2.0) * 10.0) * 0.22;
  col = col + vec3<f32>(0.7, 0.4, 1.0) * body + vec3<f32>(corridor, energy * body, corridor * 0.9);
  let stage = state_out.data[8];
  let bead = glow(distance(uv, vec2<f32>(0.15 + min(stage, 3.0) * 0.23, 0.22)), 0.05, 1.0);
  col = col + vec3<f32>(0.2, bead, bead * 1.1);
  return col;
}

fn stamp_partial(uv: vec2<f32>) -> vec3<f32> {
  let est = glow(distance(uv, vec2<f32>(state_out.data[10], state_out.data[11])), 0.1 + state_out.data[14] * 0.25, 1.2);
  let obs = glow(distance(uv, vec2<f32>(state_out.data[12], state_out.data[13])), 0.06, 1.0);
  let hid = glow(distance(uv, vec2<f32>(state_out.data[8], state_out.data[9])), 0.07, 0.45);
  return vec3<f32>(
    0.08 + obs * 1.0 + hid * 0.5,
    0.07 + est * 0.7 + hid * 0.2,
    0.16 + est * 1.0 + obs * 0.25
  );
}

fn stamp(uv: vec2<f32>) -> vec3<f32> {
  let kind = i32(state_out.data[0]);
  switch kind {
    case 0: { return stamp_nav(uv); }
    case 1: { return stamp_anomaly(uv); }
    case 2: { return stamp_opt(uv); }
    case 3: { return stamp_plan(uv); }
    default: { return stamp_partial(uv); }
  }
}

@compute @workgroup_size(8, 8)
fn field_main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.grid_w || id.y >= params.grid_h) { return; }
  let uv = vec2<f32>((f32(id.x) + 0.5) / f32(params.grid_w), (f32(id.y) + 0.5) / f32(params.grid_h));
  var decay = 0.86;
  if (params.running == 0u) { decay = 1.0; }
  let prev = textureLoad(field_in, vec2<i32>(i32(id.x), i32(id.y)), 0).rgb * decay;
  let base = stamp(uv);
  let rgb = clamp(base + prev * 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
  textureStore(field_out, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(rgb, 1.0));
}
`;

/** WGSL present: samples the simulation field texture across the GPU canvas. */
export const RENDER_WGSL = /* wgsl */ `
struct RenderParams {
  canvas_w: f32,
  canvas_h: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var field_sampler: sampler;
@group(0) @binding(2) var<uniform> params: RenderParams;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = pos.xy / vec2<f32>(params.canvas_w, params.canvas_h);
  let c = textureSample(field, field_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)));
  return vec4<f32>(c.rgb, 1.0);
}
`;
