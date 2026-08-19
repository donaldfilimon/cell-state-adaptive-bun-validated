import type { ChallengeId } from './constants';
import type { ModuleId } from './types';

export type Challenge = {
  id: ChallengeId;
  name: string;
  description: string;
  route: ModuleId[];
};

export const MODULES: Array<{
  id: ModuleId;
  name: string;
  short: string;
  description: string;
  role: string;
}> = [
  {
    id: 'sensors',
    name: 'Event Sensors',
    short: 'Sense',
    description: 'Convert continuous change into sparse events, preserving what changed instead of repeatedly sampling what stayed the same.',
    role: 'Change detection and uncertainty-aware input encoding.',
  },
  {
    id: 'temporal',
    name: 'Fast Temporal State',
    short: 'Integrate',
    description: 'A leaky recurrent reservoir compares present input with recent history across overlapping time constants.',
    role: 'Milliseconds-to-seconds temporal context.',
  },
  {
    id: 'novelty',
    name: 'Habituation Gate',
    short: 'Filter',
    description: 'Repeated harmless patterns are suppressed while deviations, contradictions, and novel signals remain salient.',
    role: 'Attention allocation and adaptation.',
  },
  {
    id: 'world',
    name: 'Predictive World Model',
    short: 'Predict',
    description: 'Forecasts likely state transitions, estimates hidden causes, and measures mismatch between expectation and reality.',
    role: 'Belief updating and counterfactual prediction.',
  },
  {
    id: 'arbiter',
    name: 'Action Arbiter',
    short: 'Choose',
    description: 'Selects reactions, experiments, plans, or tool calls using utility, uncertainty, cost, and safety constraints.',
    role: 'Escalation from reflex to deliberate planning.',
  },
  {
    id: 'tools',
    name: 'Tools & World',
    short: 'Act',
    description: 'Executes bounded actions, measures outcomes, and returns evidence to the state machine for continuous correction.',
    role: 'Embodied action and closed-loop verification.',
  },
];

export const CHALLENGES: Challenge[] = [
  {
    id: 'navigation',
    name: 'Dynamic navigation',
    description: 'Reach a moving target through a partially observed environment with changing obstacles.',
    route: ['sensors', 'temporal', 'world', 'arbiter', 'tools'],
  },
  {
    id: 'anomaly',
    name: 'Anomaly filtering',
    description: 'Ignore repetitive background activity while surfacing rare, consequential deviations.',
    route: ['sensors', 'temporal', 'novelty', 'arbiter'],
  },
  {
    id: 'optimization',
    name: 'Black-box optimization',
    description: 'Probe an unknown objective, preserve useful trajectories, and adapt the search strategy as structure emerges.',
    route: ['world', 'arbiter', 'tools', 'temporal'],
  },
  {
    id: 'planning',
    name: 'Long-horizon planning',
    description: 'Coordinate nested goals while monitoring uncertainty, resource constraints, and plan validity.',
    route: ['temporal', 'world', 'arbiter', 'tools'],
  },
  {
    id: 'partial',
    name: 'Partial observability',
    description: 'Infer hidden state from incomplete, delayed, and noisy evidence rather than assuming the current input is complete.',
    route: ['sensors', 'temporal', 'novelty', 'world', 'arbiter'],
  },
];

export function challengeById(id: ChallengeId): Challenge {
  return CHALLENGES.find((item) => item.id === id) ?? CHALLENGES[0];
}
