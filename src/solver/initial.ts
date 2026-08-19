import { KIND, KIND_BY_ID, STATE_FLOATS, IX, type ChallengeId } from './constants';
import { hypot2 } from './math';
import { objective } from './objective';

export function createInitialState(id: ChallengeId): Float32Array {
  const s = new Float32Array(STATE_FLOATS);
  s[IX.kind] = KIND_BY_ID[id];
  s[IX.tick] = 0;
  switch (KIND_BY_ID[id]) {
    case KIND.navigation:
      initNav(s);
      break;
    case KIND.anomaly:
      initAnomaly(s);
      break;
    case KIND.optimization:
      initOpt(s);
      break;
    case KIND.planning:
      initPlan(s);
      break;
    case KIND.partial:
      initPartial(s);
      break;
    default:
      initNav(s);
  }
  return s;
}

export function resetState(id: ChallengeId): Float32Array {
  return createInitialState(id);
}

function initNav(s: Float32Array): void {
  s[IX.navAgentX] = 0.14;
  s[IX.navAgentY] = 0.16;
  s[IX.navPhase] = 0.4;
  s[IX.navTargetX] = 0.5 + 0.32 * Math.cos(0.4);
  s[IX.navTargetY] = 0.5 + 0.32 * Math.sin(0.4 * 0.7);
  s[IX.navVelX] = 0;
  s[IX.navVelY] = 0;
  s[IX.navO0X] = 0.5;
  s[IX.navO0Y] = 0.18;
  s[IX.navO0R] = 0.1;
  s[IX.navO1X] = 0.3;
  s[IX.navO1Y] = 0.55;
  s[IX.navO1R] = 0.11;
  s[IX.navDist] = hypot2(s[IX.navTargetX] - s[IX.navAgentX], s[IX.navTargetY] - s[IX.navAgentY]);
  s[IX.navLastDist] = s[IX.navDist];
  s[IX.navPath] = 0;
  s[IX.navEffort] = 0;
  s[IX.navReach] = 0;
}

function initAnomaly(s: Float32Array): void {
  s[IX.anoObs] = 0.5;
  s[IX.anoHabit] = 0.5;
  s[IX.anoSalience] = 0;
  s[IX.anoFlag] = 0;
  s[IX.anoPhase] = 0;
  s[IX.anoHits] = 0;
  s[IX.anoFalse] = 0;
  s[IX.anoBgEma] = 0.08;
  s[IX.anoEventSal] = 0;
  s[IX.anoAttend] = 0;
  s[IX.anoLastBg] = 0.08;
}

function initOpt(s: Float32Array): void {
  s[IX.optX] = 0.18;
  s[IX.optY] = 0.82;
  s[IX.optBestX] = 0.18;
  s[IX.optBestY] = 0.82;
  s[IX.optBestF] = objective(0.18, 0.82);
  s[IX.optSigma] = 0.16;
  s[IX.optProbes] = 0;
  s[IX.optCurrF] = s[IX.optBestF];
  s[IX.optImproved] = 0;
  s[IX.optPlateau] = 0;
}

function initPlan(s: Float32Array): void {
  s[IX.planStage] = 0;
  s[IX.planStageProg] = 0;
  s[IX.planValidity] = 1;
  s[IX.planEnergy] = 1;
  s[IX.planSub] = 0;
  s[IX.planCompleted] = 0;
  s[IX.planUnc] = 0.35;
  s[IX.planReplans] = 0;
  s[IX.planPosX] = 0.15;
  s[IX.planPosY] = 0.5;
  s[IX.planResting] = 0;
}

function initPartial(s: Float32Array): void {
  s[IX.hidX] = 0.2;
  s[IX.hidY] = 0.8;
  s[IX.estX] = 0.5;
  s[IX.estY] = 0.5;
  s[IX.obsX] = 0.2;
  s[IX.obsY] = 0.8;
  s[IX.covP] = 0.4;
  s[IX.hidVX] = 0.35;
  s[IX.hidVY] = -0.22;
  s[IX.err] = hypot2(0.3, -0.3);
  s[IX.initErr] = s[IX.err];
}
