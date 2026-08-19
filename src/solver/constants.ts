export const STATE_FLOATS = 48;
export const GRID = 96;
export const ANOMALY_PERIOD = 23;
export const PLAN_STAGES = 4;
export const NAV_SPEED = 0.038;
export const STEP_HZ = 18;

export const KIND = {
  navigation: 0,
  anomaly: 1,
  optimization: 2,
  planning: 3,
  partial: 4,
} as const;

export type ChallengeId =
  | 'navigation'
  | 'anomaly'
  | 'optimization'
  | 'planning'
  | 'partial';

export const KIND_BY_ID: Record<ChallengeId, number> = {
  navigation: KIND.navigation,
  anomaly: KIND.anomaly,
  optimization: KIND.optimization,
  planning: KIND.planning,
  partial: KIND.partial,
};

export const ID_BY_KIND: ChallengeId[] = [
  'navigation',
  'anomaly',
  'optimization',
  'planning',
  'partial',
];

/** Packed-buffer indices. Challenge-specific fields overlay from slot 8. */
export const IX = {
  kind: 0,
  tick: 1,

  navAgentX: 8,
  navAgentY: 9,
  navTargetX: 10,
  navTargetY: 11,
  navVelX: 12,
  navVelY: 13,
  navPhase: 14,
  navDist: 15,
  navO0X: 16,
  navO0Y: 17,
  navO0R: 18,
  navO1X: 19,
  navO1Y: 20,
  navO1R: 21,
  navPath: 22,
  navLastDist: 23,
  navEffort: 24,
  navReach: 25,

  anoObs: 8,
  anoHabit: 9,
  anoSalience: 10,
  anoFlag: 11,
  anoPhase: 12,
  anoHits: 13,
  anoFalse: 14,
  anoBgEma: 15,
  anoEventSal: 16,
  anoAttend: 17,
  anoLastBg: 18,

  optX: 8,
  optY: 9,
  optBestX: 10,
  optBestY: 11,
  optBestF: 12,
  optSigma: 13,
  optProbes: 14,
  optCurrF: 15,
  optImproved: 16,
  optPlateau: 17,

  planStage: 8,
  planStageProg: 9,
  planValidity: 10,
  planEnergy: 11,
  planSub: 12,
  planCompleted: 13,
  planUnc: 14,
  planReplans: 15,
  planPosX: 16,
  planPosY: 17,
  planResting: 18,

  hidX: 8,
  hidY: 9,
  estX: 10,
  estY: 11,
  obsX: 12,
  obsY: 13,
  covP: 14,
  err: 15,
  hidVX: 16,
  hidVY: 17,
  initErr: 18,
} as const;
