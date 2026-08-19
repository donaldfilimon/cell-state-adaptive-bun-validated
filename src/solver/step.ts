import { ANOMALY_PERIOD, IX, KIND, NAV_SPEED, PLAN_STAGES } from './constants';
import { hashNoise } from './hash';
import { clamp, clamp01, hypot2 } from './math';
import { objective } from './objective';

const WAYPOINTS = [
  [0.15, 0.5],
  [0.38, 0.72],
  [0.62, 0.28],
  [0.85, 0.55],
  [0.85, 0.55],
] as const;

/**
 * Closed-loop step: next packed state is a function of current state and the
 * challenge environment. Does not mutate `state`.
 */
export function stepPacked(state: Float32Array): Float32Array {
  const next = new Float32Array(state);
  next[IX.tick] = (state[IX.tick] | 0) + 1;
  const kind = state[IX.kind] | 0;
  switch (kind) {
    case KIND.navigation:
      stepNav(next);
      break;
    case KIND.anomaly:
      stepAnomaly(next);
      break;
    case KIND.optimization:
      stepOpt(next);
      break;
    case KIND.planning:
      stepPlan(next);
      break;
    case KIND.partial:
      stepPartial(next);
      break;
    default:
      stepNav(next);
  }
  return next;
}

/** Pause keeps state. A running flag of false returns a copy without dynamics. */
export function advance(state: Float32Array, running: boolean): Float32Array {
  if (!running) return new Float32Array(state);
  return stepPacked(state);
}

function stepNav(s: Float32Array): void {
  const phase = s[IX.navPhase] + 0.045;
  s[IX.navPhase] = phase;
  const tx = 0.5 + 0.32 * Math.cos(phase);
  const ty = 0.5 + 0.32 * Math.sin(phase * 0.7);
  s[IX.navTargetX] = tx;
  s[IX.navTargetY] = ty;

  let ax = s[IX.navAgentX];
  let ay = s[IX.navAgentY];
  const dx = tx - ax;
  const dy = ty - ay;
  const dist = hypot2(dx, dy);
  s[IX.navLastDist] = s[IX.navDist];
  s[IX.navDist] = dist;

  let nx = dx / (dist + 1e-6);
  let ny = dy / (dist + 1e-6);

  const e0 = repel(ax, ay, s[IX.navO0X], s[IX.navO0Y], s[IX.navO0R], (fx, fy) => {
    nx += fx;
    ny += fy;
  });
  const e1 = repel(ax, ay, s[IX.navO1X], s[IX.navO1Y], s[IX.navO1R], (fx, fy) => {
    nx += fx;
    ny += fy;
  });

  const len = hypot2(nx, ny);
  const vx = (nx / (len + 1e-6)) * NAV_SPEED;
  const vy = (ny / (len + 1e-6)) * NAV_SPEED;
  ax = clamp(ax + vx, 0.03, 0.97);
  ay = clamp(ay + vy, 0.03, 0.97);
  s[IX.navAgentX] = ax;
  s[IX.navAgentY] = ay;
  s[IX.navVelX] = vx;
  s[IX.navVelY] = vy;
  s[IX.navPath] += hypot2(vx, vy);
  s[IX.navEffort] = e0 + e1;
  const newDist = hypot2(tx - ax, ty - ay);
  s[IX.navDist] = newDist;
  if (newDist < 0.07) s[IX.navReach] = 1;
}

function repel(
  ax: number,
  ay: number,
  ox: number,
  oy: number,
  radius: number,
  acc: (fx: number, fy: number) => void,
): number {
  const rx = ax - ox;
  const ry = ay - oy;
  const d = hypot2(rx, ry);
  const margin = radius + 0.08;
  if (d >= margin) return 0;
  const strength = ((margin - d) / margin) * 4.2;
  acc((rx / (d + 1e-6)) * strength, (ry / (d + 1e-6)) * strength);
  return strength;
}

function stepAnomaly(s: Float32Array): void {
  const tick = s[IX.tick] | 0;
  const phase = s[IX.anoPhase] + 0.35;
  s[IX.anoPhase] = phase;
  const background = 0.5 + 0.12 * Math.sin(phase);
  const isAnomaly = tick > 0 && tick % ANOMALY_PERIOD === 0 ? 1 : 0;
  const observation = isAnomaly ? 1 : background;
  const habit = s[IX.anoHabit];
  const error = observation - habit;
  const salience = Math.abs(error);
  const learn = 0.15 * (1 - smoothstep(0.16, 0.42, salience));
  s[IX.anoHabit] = clamp(habit + learn * error, 0, 1);
  s[IX.anoObs] = observation;
  s[IX.anoSalience] = salience;
  s[IX.anoFlag] = isAnomaly;
  s[IX.anoAttend] = smoothstep(0.18, 0.5, salience);

  if (isAnomaly) {
    s[IX.anoEventSal] = salience;
    if (salience > 0.22) s[IX.anoHits] += 1;
  } else {
    s[IX.anoLastBg] = salience;
    s[IX.anoBgEma] = s[IX.anoBgEma] * 0.85 + salience * 0.15;
    if (salience > 0.28) s[IX.anoFalse] += 1;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function stepOpt(s: Float32Array): void {
  const tick = s[IX.tick] | 0;
  const sigma = s[IX.optSigma];
  const n1 = Math.max(hashNoise(tick, 1), 1e-6);
  const n2 = hashNoise(tick, 2);
  const mag = Math.sqrt(-2 * Math.log(n1));
  const g1 = mag * Math.cos(2 * Math.PI * n2);
  const g2 = mag * Math.sin(2 * Math.PI * n2);
  const cx = clamp01(s[IX.optX] + g1 * sigma);
  const cy = clamp01(s[IX.optY] + g2 * sigma);
  const cf = objective(cx, cy);
  s[IX.optCurrF] = cf;
  s[IX.optProbes] += 1;
  if (cf >= s[IX.optBestF]) {
    s[IX.optBestF] = cf;
    s[IX.optBestX] = cx;
    s[IX.optBestY] = cy;
    s[IX.optX] = cx;
    s[IX.optY] = cy;
    s[IX.optSigma] = Math.max(0.02, sigma * 0.96);
    s[IX.optImproved] = 1;
    s[IX.optPlateau] = 0;
  } else {
    s[IX.optX] = s[IX.optX] * 0.82 + s[IX.optBestX] * 0.18;
    s[IX.optY] = s[IX.optY] * 0.82 + s[IX.optBestY] * 0.18;
    s[IX.optSigma] = Math.min(0.28, sigma * 1.035);
    s[IX.optImproved] = 0;
    s[IX.optPlateau] += 1;
  }
}

function stepPlan(s: Float32Array): void {
  let stage = s[IX.planStage];
  let prog = s[IX.planStageProg];
  let energy = s[IX.planEnergy];
  let validity = s[IX.planValidity];
  let unc = s[IX.planUnc];

  if (stage >= PLAN_STAGES) {
    s[IX.planResting] = 0;
    s[IX.planEnergy] = clamp01(energy + 0.01);
    s[IX.planUnc] = Math.max(0.04, unc * 0.98);
    return;
  }

  if (energy < 0.1) {
    s[IX.planResting] = 1;
    s[IX.planEnergy] = clamp01(energy + 0.08);
    s[IX.planValidity] = clamp01(validity * 0.985);
    s[IX.planUnc] = clamp01(unc + 0.015);
    return;
  }

  s[IX.planResting] = 0;
  if (unc > 0.72) {
    validity = 0.48;
    unc = 0.4;
    s[IX.planReplans] += 1;
  }

  prog += 0.09 * validity;
  energy -= 0.03;
  unc = Math.max(0.05, unc - 0.02);
  validity = clamp01(validity + 0.02 * (1 - validity));

  if (prog >= 1) {
    stage += 1;
    prog = 0;
    s[IX.planCompleted] += 1;
    s[IX.planSub] = 0;
  } else {
    s[IX.planSub] = Math.floor(prog * 3);
  }

  const from = WAYPOINTS[Math.min(stage | 0, PLAN_STAGES - 1)];
  const to = WAYPOINTS[Math.min((stage | 0) + 1, PLAN_STAGES)];
  s[IX.planPosX] = from[0] + (to[0] - from[0]) * prog;
  s[IX.planPosY] = from[1] + (to[1] - from[1]) * prog;
  s[IX.planStage] = Math.min(stage, PLAN_STAGES);
  s[IX.planStageProg] = prog;
  s[IX.planEnergy] = clamp01(energy);
  s[IX.planValidity] = validity;
  s[IX.planUnc] = unc;
}

function stepPartial(s: Float32Array): void {
  const tick = s[IX.tick] | 0;
  let hx = s[IX.hidX] + s[IX.hidVX] * 0.03;
  let hy = s[IX.hidY] + s[IX.hidVY] * 0.03;
  let vx = s[IX.hidVX];
  let vy = s[IX.hidVY];
  if (hx < 0.06 || hx > 0.94) {
    vx = -vx;
    hx = clamp(hx, 0.06, 0.94);
  }
  if (hy < 0.06 || hy > 0.94) {
    vy = -vy;
    hy = clamp(hy, 0.06, 0.94);
  }
  s[IX.hidX] = hx;
  s[IX.hidY] = hy;
  s[IX.hidVX] = vx;
  s[IX.hidVY] = vy;

  const obsX = clamp01(hx + (hashNoise(tick, 3) - 0.5) * 0.18);
  const obsY = clamp01(hy + (hashNoise(tick, 4) - 0.5) * 0.18);
  s[IX.obsX] = obsX;
  s[IX.obsY] = obsY;

  const p = s[IX.covP];
  const r = 0.09;
  const k = p / (p + r);
  s[IX.estX] = s[IX.estX] + k * (obsX - s[IX.estX]);
  s[IX.estY] = s[IX.estY] + k * (obsY - s[IX.estY]);
  s[IX.covP] = (1 - k) * p + 0.008;
  s[IX.err] = hypot2(s[IX.estX] - hx, s[IX.estY] - hy);
}
