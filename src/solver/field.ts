import { GRID, IX, KIND } from './constants';
import { clamp01, hypot2 } from './math';
import { objective } from './objective';

export const FIELD_FLOATS = GRID * GRID * 4;

export function createField(): Float32Array {
  return new Float32Array(FIELD_FLOATS);
}

/** CPU twin of the WGSL field compute: decay + stamp the packed state. */
export function stepField(
  state: Float32Array,
  fieldIn: Float32Array,
  fieldOut: Float32Array,
  running: boolean,
): void {
  const kind = state[IX.kind] | 0;
  const decay = running ? 0.88 : 1;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const u = (x + 0.5) / GRID;
      const v = (y + 0.5) / GRID;
      let r = fieldIn[i] * decay;
      let g = fieldIn[i + 1] * decay;
      let b = fieldIn[i + 2] * decay;
      const base = stamp(kind, state, u, v);
      r = clamp01(base[0] + r * 0.55);
      g = clamp01(base[1] + g * 0.55);
      b = clamp01(base[2] + b * 0.55);
      fieldOut[i] = r;
      fieldOut[i + 1] = g;
      fieldOut[i + 2] = b;
      fieldOut[i + 3] = 1;
    }
  }
}

function stamp(kind: number, s: Float32Array, u: number, v: number): [number, number, number] {
  switch (kind) {
    case KIND.navigation:
      return stampNav(s, u, v);
    case KIND.anomaly:
      return stampAnomaly(s, u, v);
    case KIND.optimization:
      return stampOpt(s, u, v);
    case KIND.planning:
      return stampPlan(s, u, v);
    case KIND.partial:
      return stampPartial(s, u, v);
    default:
      return [0.05, 0.05, 0.08];
  }
}

function glow(dist: number, radius: number, intensity: number): number {
  const x = dist / radius;
  return intensity * Math.exp(-x * x * 3.2);
}

function stampNav(s: Float32Array, u: number, v: number): [number, number, number] {
  let r = 0.035;
  let g = 0.035;
  let b = 0.055;
  const d0 = hypot2(u - s[IX.navO0X], v - s[IX.navO0Y]);
  const d1 = hypot2(u - s[IX.navO1X], v - s[IX.navO1Y]);
  if (d0 < s[IX.navO0R]) {
    r += 0.18;
    b += 0.12;
  }
  if (d1 < s[IX.navO1R]) {
    r += 0.16;
    b += 0.14;
  }
  const t = glow(hypot2(u - s[IX.navTargetX], v - s[IX.navTargetY]), 0.07, 1);
  const a = glow(hypot2(u - s[IX.navAgentX], v - s[IX.navAgentY]), 0.055, 1);
  r += 1.0 * t * 0.9;
  g += 0.31 * t;
  b += 0.65 * t;
  r += 0.44 * a;
  g += 0.9 * a;
  b += 1.0 * a;
  return [r, g, b];
}

function stampAnomaly(s: Float32Array, u: number, v: number): [number, number, number] {
  const sal = s[IX.anoSalience];
  const flag = s[IX.anoFlag];
  const wave = 0.5 + 0.5 * Math.sin((u * 18 + s[IX.anoPhase]) * (1 - flag * 0.4));
  const band = Math.exp(-((v - (0.5 + (s[IX.anoObs] - 0.5) * 0.4)) ** 2) * 40);
  const heat = sal * (0.4 + flag);
  return [
    0.06 + heat * 0.95 + band * 0.2,
    0.04 + wave * 0.08 + (1 - flag) * band * 0.15,
    0.1 + (1 - heat) * 0.25 + flag * 0.35,
  ];
}

function stampOpt(s: Float32Array, u: number, v: number): [number, number, number] {
  const f = clamp01((objective(u, v) + 0.2) / 1.3);
  let r = 0.04 + (1 - f) * 0.12;
  let g = 0.05 + f * 0.22;
  let b = 0.1 + f * 0.35;
  const probe = glow(hypot2(u - s[IX.optX], v - s[IX.optY]), 0.05, 1);
  const best = glow(hypot2(u - s[IX.optBestX], v - s[IX.optBestY]), 0.07, 1);
  r += 0.44 * probe + 1.0 * best * 0.55;
  g += 0.9 * probe + 0.31 * best * 0.4;
  b += 1.0 * probe + 0.65 * best;
  return [r, g, b];
}

function stampPlan(s: Float32Array, u: number, v: number): [number, number, number] {
  const energy = s[IX.planEnergy];
  let r = 0.04;
  let g = 0.04 + energy * 0.05;
  let b = 0.07 + energy * 0.08;
  const d = hypot2(u - s[IX.planPosX], v - s[IX.planPosY]);
  const body = glow(d, 0.06, 1);
  const corridor = Math.exp(-((v - 0.5) ** 2) * 12) * 0.12;
  r += 0.55 * body + corridor;
  g += 0.35 * body + energy * body;
  b += 1.0 * body + corridor * 0.8;
  const stage = s[IX.planStage];
  const bead = glow(hypot2(u - (0.15 + Math.min(stage, 3) * 0.23), v - 0.22), 0.035, 0.8);
  g += bead * 0.8;
  b += bead;
  return [r, g, b];
}

function stampPartial(s: Float32Array, u: number, v: number): [number, number, number] {
  const est = glow(hypot2(u - s[IX.estX], v - s[IX.estY]), 0.08 + s[IX.covP] * 0.2, 1);
  const obs = glow(hypot2(u - s[IX.obsX], v - s[IX.obsY]), 0.04, 0.8);
  const hid = glow(hypot2(u - s[IX.hidX], v - s[IX.hidY]), 0.05, 0.25);
  return [
    0.04 + obs * 0.9 + hid * 0.4,
    0.04 + est * 0.55 + hid * 0.15,
    0.08 + est * 0.95 + obs * 0.2,
  ];
}
