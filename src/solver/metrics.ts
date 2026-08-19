import { ID_BY_KIND, IX, KIND, PLAN_STAGES, type ChallengeId } from './constants';
import { clamp01, pct } from './math';
import { objective } from './objective';
import type { MetricState, ModuleId, SimBackend, SimSnapshot } from './types';

export function challengeIdOf(state: Float32Array): ChallengeId {
  return ID_BY_KIND[state[IX.kind] | 0] ?? 'navigation';
}

/** Progress / success in 0–1, derived from packed state. */
export function progressFromState(state: Float32Array): number {
  const kind = state[IX.kind] | 0;
  switch (kind) {
    case KIND.navigation: {
      const dist = state[IX.navDist];
      const reach = state[IX.navReach] > 0.5 ? 0.15 : 0;
      return clamp01(1 - dist / 1.2 + reach);
    }
    case KIND.anomaly: {
      const eventSal = state[IX.anoEventSal];
      const bg = Math.max(state[IX.anoBgEma], 1e-4);
      const contrast = eventSal / (eventSal + bg);
      const hits = state[IX.anoHits];
      const falseAlarms = state[IX.anoFalse];
      const quality = hits / (hits + falseAlarms + 1);
      return clamp01(0.55 * contrast + 0.45 * quality);
    }
    case KIND.optimization: {
      const best = state[IX.optBestF];
      const start = objective(0.18, 0.82);
      const peak = objective(0.72, 0.28);
      return clamp01((best - start) / (peak - start + 1e-6));
    }
    case KIND.planning: {
      const stage = Math.min(state[IX.planStage], PLAN_STAGES);
      const prog = stage >= PLAN_STAGES ? 0 : state[IX.planStageProg];
      return clamp01((stage + prog) / PLAN_STAGES);
    }
    case KIND.partial: {
      const err = state[IX.err];
      const init = Math.max(state[IX.initErr], 1e-3);
      return clamp01(1 - err / init);
    }
    default:
      return 0;
  }
}

export function metricsFromState(state: Float32Array): MetricState {
  const kind = state[IX.kind] | 0;
  switch (kind) {
    case KIND.navigation:
      return {
        confidence: pct(1 - state[IX.navDist] / 1.15),
        novelty: pct(0.25 + state[IX.navEffort] * 0.45 + (state[IX.navReach] > 0.5 ? 0.15 : 0)),
        memory: pct(clamp01(state[IX.navPath] / 2.4)),
        predictionError: pct(Math.abs(state[IX.navDist] - state[IX.navLastDist]) * 14 + state[IX.navDist] * 0.2),
        energy: pct(0.2 + hypotVel(state) * 8 + state[IX.navEffort] * 0.2),
      };
    case KIND.anomaly:
      return {
        confidence: pct(1 - state[IX.anoBgEma] * 2.2),
        novelty: pct(state[IX.anoSalience] * 1.6 + state[IX.anoAttend] * 0.2),
        memory: pct(0.35 + (1 - Math.abs(state[IX.anoHabit] - 0.5) * 0.8)),
        predictionError: pct(state[IX.anoSalience]),
        energy: pct(0.18 + state[IX.anoAttend] * 0.7),
      };
    case KIND.optimization:
      return {
        confidence: pct(0.25 + progressFromState(state) * 0.7),
        novelty: pct(0.2 + state[IX.optSigma] * 2.2 + (state[IX.optImproved] > 0.5 ? 0.25 : 0)),
        memory: pct(clamp01(state[IX.optProbes] / 80)),
        predictionError: pct(clamp01((objective(0.72, 0.28) - state[IX.optCurrF]) * 0.85)),
        energy: pct(0.3 + state[IX.optSigma] * 1.6),
      };
    case KIND.planning:
      return {
        confidence: pct(0.2 + progressFromState(state) * 0.55 + state[IX.planValidity] * 0.25),
        novelty: pct(state[IX.planUnc]),
        memory: pct(0.4 + state[IX.planCompleted] / PLAN_STAGES * 0.5),
        predictionError: pct(1 - state[IX.planValidity]),
        energy: pct(1 - state[IX.planEnergy]),
      };
    case KIND.partial:
      return {
        confidence: pct(1 - state[IX.err] * 1.4),
        novelty: pct(state[IX.covP] * 1.6),
        memory: pct(1 - state[IX.covP]),
        predictionError: pct(state[IX.err] * 1.5),
        energy: pct(0.28 + state[IX.covP] * 0.9),
      };
    default:
      return { confidence: 0, novelty: 0, memory: 0, predictionError: 0, energy: 0 };
  }
}

function hypotVel(state: Float32Array): number {
  return Math.hypot(state[IX.navVelX], state[IX.navVelY]);
}

export function activeModule(state: Float32Array): ModuleId {
  const kind = state[IX.kind] | 0;
  switch (kind) {
    case KIND.navigation:
      if (state[IX.navEffort] > 0.35) return 'sensors';
      if (state[IX.navDist] > 0.28) return 'world';
      if (hypotVel(state) > 0.02) return 'tools';
      return 'arbiter';
    case KIND.anomaly:
      if (state[IX.anoFlag] > 0.5 || state[IX.anoSalience] > 0.28) return 'novelty';
      if (state[IX.anoAttend] > 0.35) return 'arbiter';
      return 'sensors';
    case KIND.optimization:
      if (state[IX.optImproved] > 0.5) return 'world';
      if (state[IX.optPlateau] > 4) return 'arbiter';
      return 'tools';
    case KIND.planning:
      if (state[IX.planResting] > 0.5) return 'temporal';
      if (state[IX.planUnc] > 0.5) return 'world';
      if (state[IX.planValidity] < 0.7) return 'arbiter';
      return 'tools';
    case KIND.partial:
      if (state[IX.err] > 0.22) return 'sensors';
      if (state[IX.covP] > 0.2) return 'world';
      return 'temporal';
    default:
      return 'temporal';
  }
}

export function statusFromState(state: Float32Array): string {
  const kind = state[IX.kind] | 0;
  switch (kind) {
    case KIND.navigation:
      return `Distance to target ${state[IX.navDist].toFixed(2)}. ${state[IX.navReach] > 0.5 ? 'Target reached at least once.' : 'Closing the gap.'}`;
    case KIND.anomaly:
      return state[IX.anoFlag] > 0.5
        ? `Rare event. Salience ${state[IX.anoSalience].toFixed(2)} vs background ${state[IX.anoBgEma].toFixed(2)}.`
        : `Background. Habituated salience ${state[IX.anoSalience].toFixed(2)}. Hits ${state[IX.anoHits] | 0}.`;
    case KIND.optimization:
      return `Best-so-far ${state[IX.optBestF].toFixed(3)} after ${state[IX.optProbes] | 0} probes (σ=${state[IX.optSigma].toFixed(2)}).`;
    case KIND.planning:
      return `Stage ${Math.min((state[IX.planStage] | 0) + 1, PLAN_STAGES)}/${PLAN_STAGES} · ${Math.round(progressFromState(state) * 100)}% · energy ${state[IX.planEnergy].toFixed(2)}.`;
    case KIND.partial:
      return `Hidden-state error ${state[IX.err].toFixed(3)} (started ${state[IX.initErr].toFixed(3)}).`;
    default:
      return 'Idle.';
  }
}

export function snapshotFromState(
  state: Float32Array,
  backend: SimBackend,
  unavailableReason?: string,
): SimSnapshot {
  return {
    state,
    metrics: metricsFromState(state),
    progress: progressFromState(state),
    module: activeModule(state),
    status: statusFromState(state),
    tick: state[IX.tick] | 0,
    kind: challengeIdOf(state),
    backend,
    unavailableReason,
  };
}
