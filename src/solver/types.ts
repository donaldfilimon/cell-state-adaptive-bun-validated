import type { ChallengeId } from './constants';

export type ModuleId = 'sensors' | 'temporal' | 'novelty' | 'world' | 'arbiter' | 'tools';

export type MetricState = {
  confidence: number;
  novelty: number;
  memory: number;
  predictionError: number;
  energy: number;
};

export type SimBackend = 'webgpu' | 'cpu';

export type SimSnapshot = {
  state: Float32Array;
  metrics: MetricState;
  progress: number;
  module: ModuleId;
  status: string;
  tick: number;
  kind: ChallengeId;
  backend: SimBackend;
  unavailableReason?: string;
};
