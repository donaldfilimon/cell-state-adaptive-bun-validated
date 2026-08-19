import { describe, expect, test } from 'bun:test';
import {
  ANOMALY_PERIOD,
  CHALLENGES,
  IX,
  KIND,
  advance,
  createInitialState,
  hashNoise,
  hashU32,
  metricsFromState,
  progressFromState,
  resetState,
  stepPacked,
  type ChallengeId,
} from '../src/solver';

const IDS: ChallengeId[] = CHALLENGES.map((c) => c.id);

function packedEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function run(id: ChallengeId, steps: number, running = true): Float32Array {
  let state = createInitialState(id);
  for (let i = 0; i < steps; i++) state = advance(state, running);
  return state;
}

describe('closed-loop solvers', () => {
  test('each challenge class is present', () => {
    expect(IDS).toEqual(['navigation', 'anomaly', 'optimization', 'planning', 'partial']);
  });

  for (const id of IDS) {
    describe(id, () => {
      test('step changes state and is a function of current state', () => {
        const start = createInitialState(id);
        const once = stepPacked(start);
        const twice = stepPacked(once);
        const againFromStart = stepPacked(start);
        expect(packedEqual(once, start)).toBe(false);
        expect(packedEqual(twice, once)).toBe(false);
        expect(packedEqual(againFromStart, once)).toBe(true);
        expect(once[IX.tick]).toBe(1);
        expect(twice[IX.tick]).toBe(2);
      });

      test('metrics are derived from packed state, not independent walks', () => {
        const start = createInitialState(id);
        const a = metricsFromState(start);
        const b = metricsFromState(new Float32Array(start));
        expect(a).toEqual(b);
        const later = run(id, 8);
        const fromLater = metricsFromState(later);
        expect(fromLater).toEqual(metricsFromState(new Float32Array(later)));
        expect(fromLater).not.toEqual(a);
        const keys: Array<keyof typeof a> = ['confidence', 'novelty', 'memory', 'predictionError', 'energy'];
        for (const key of keys) {
          expect(typeof fromLater[key]).toBe('number');
          expect(fromLater[key]).toBeGreaterThanOrEqual(0);
          expect(fromLater[key]).toBeLessThanOrEqual(100);
        }
      });

      test('pause keeps state', () => {
        const mid = run(id, 5, true);
        const paused = advance(mid, false);
        expect(packedEqual(paused, mid)).toBe(true);
        const held = run(id, 12, false);
        expect(packedEqual(held, createInitialState(id))).toBe(true);
      });

      test('reset / switch returns to that challenge start', () => {
        const moved = run(id, 11, true);
        const reset = resetState(id);
        expect(packedEqual(reset, createInitialState(id))).toBe(true);
        expect(packedEqual(moved, reset)).toBe(false);
        for (const other of IDS) {
          if (other === id) continue;
          const switched = resetState(other);
          expect(switched[IX.kind]).toBe(KIND[other]);
          expect(packedEqual(switched, createInitialState(other))).toBe(true);
        }
      });
    });
  }

  test('navigation distance shrinks and stays bounded while the solver acts', () => {
    const start = createInitialState('navigation');
    const d0 = start[IX.navDist];
    const later = run('navigation', 90, true);
    const d1 = later[IX.navDist];
    expect(d1).toBeLessThan(d0);
    expect(d1).toBeLessThan(0.55);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d1).toBeLessThan(1.2);
    expect(progressFromState(later)).toBeGreaterThan(progressFromState(start));
    const frozen = run('navigation', 90, false);
    expect(frozen[IX.navDist]).toBe(d0);
  });

  test('anomaly steps distinguish a rare event from repeated background', () => {
    let state = createInitialState('anomaly');
    let lastEvent = 0;
    let lastBackground = 0;
    for (let i = 0; i < ANOMALY_PERIOD * 2 + 3; i++) {
      state = stepPacked(state);
      if (state[IX.anoFlag] > 0.5) lastEvent = state[IX.anoSalience];
      else lastBackground = state[IX.anoSalience];
    }
    expect(lastEvent).toBeGreaterThan(lastBackground);
    expect(lastEvent).toBeGreaterThan(0.2);
    expect(state[IX.anoHits]).toBeGreaterThan(0);
    expect(progressFromState(state)).toBeGreaterThan(progressFromState(createInitialState('anomaly')));
  });

  test('optimizer best-so-far is monotonic and improves from the start', () => {
    let state = createInitialState('optimization');
    const startBest = state[IX.optBestF];
    let previous = startBest;
    for (let i = 0; i < 120; i++) {
      state = stepPacked(state);
      expect(state[IX.optBestF]).toBeGreaterThanOrEqual(previous);
      previous = state[IX.optBestF];
    }
    expect(state[IX.optBestF]).toBeGreaterThan(startBest);
    expect(progressFromState(state)).toBeGreaterThan(progressFromState(createInitialState('optimization')));
  });

  test('planning progress and completed stages advance toward the goal', () => {
    const start = createInitialState('planning');
    let state = start;
    let completed = 0;
    for (let i = 0; i < 80; i++) {
      state = stepPacked(state);
      expect(state[IX.planCompleted]).toBeGreaterThanOrEqual(completed);
      completed = state[IX.planCompleted];
    }
    expect(progressFromState(state)).toBeGreaterThan(progressFromState(start));
    expect(state[IX.planCompleted]).toBeGreaterThan(0);
    expect(progressFromState(state)).toBeLessThanOrEqual(1);
  });

  test('partial-observability estimate error improves versus the initial guess', () => {
    const start = createInitialState('partial');
    const later = run('partial', 50, true);
    expect(later[IX.err]).toBeLessThan(start[IX.err]);
    expect(later[IX.err]).toBeLessThan(start[IX.initErr]);
    expect(progressFromState(later)).toBeGreaterThan(progressFromState(start));
  });
});

describe('hashNoise parity with WGSL 24-bit conversion', () => {
  const pairs: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [5, 9],
    [23, 3],
    [128, 4],
    [4096, 2],
    [100000, 7],
  ];

  test('is deterministic and in [0, 1)', () => {
    for (const [tick, salt] of pairs) {
      const value = hashNoise(tick, salt);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(hashNoise(tick, salt)).toBe(value);
    }
  });

  test('matches shipped mixer plus 24-bit conversion used by WGSL hash_noise', () => {
    expect(hashNoise(5, 9)).toBe((hashU32(5, 9) >>> 8) / 16777216);
    for (const [tick, salt] of pairs) {
      expect(hashNoise(tick, salt)).toBe((hashU32(tick, salt) >>> 8) / 16777216);
    }
  });
});
