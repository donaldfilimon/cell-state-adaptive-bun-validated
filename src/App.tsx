import { useCallback, useMemo, useRef, useState } from 'react';
import { CHALLENGES, MODULES, type ChallengeId, type ModuleId } from './solver';
import { useLabSimulation } from './useLabSimulation';

const biology = [
  ['E. coli', 'Temporal comparison', 'Receptor modification stores a short molecular trace of recent conditions, enabling gradient-following without a nervous system.'],
  ['Physarum', 'Distributed adaptation', 'Oscillatory chemistry and cytoplasmic flow coordinate choice, habituation, and path formation across a single giant cell.'],
  ['Stentor', 'State-dependent behavior', 'Repeated stimulation can alter later responses, showing that learning-like dynamics need not require neurons.'],
  ['Molecular networks', 'Feedback and thresholds', 'Protein, metabolic, ionic, and gene-regulatory loops create persistent state, competition, hysteresis, and switching.'],
];

const memoryLayers = [
  ['Fast state', '10 ms–10 s', 'Leaky temporal traces, event integration, phase and oscillator state.'],
  ['Adaptive state', 'Seconds–hours', 'Habituation, gain control, thresholds, homeostatic variables.'],
  ['Model state', 'Minutes–days', 'Predictive representations, learned dynamics, strategies, causal hypotheses.'],
  ['Episodic state', 'Days–years', 'Versioned experiences, provenance, outcomes, plans, and reusable abstractions.'],
];

const safetyItems = [
  ['Pathological habituation', 'Critical signals may be suppressed after repetition.', 'Protected channels, decay floors, adversarial novelty tests.'],
  ['Perseveration', 'The machine may continue an obsolete strategy.', 'Prediction-error thresholds, forced re-evaluation, strategy diversity.'],
  ['False confidence', 'A coherent internal model can still be wrong.', 'Calibration, external verification, disagreement and abstention.'],
  ['Graceful degradation', 'A damaged layer should not collapse the entire system.', 'Redundant paths, safe reflexes, health checks, bounded fallback modes.'],
  ['Consciousness claims', 'Adaptive behavior does not establish subjective experience.', 'Use operational language: state, learning, prediction, control—not sentience.'],
];

function App() {
  const heroRef = useRef<HTMLCanvasElement>(null);
  const labRef = useRef<HTMLCanvasElement>(null);
  const getCanvases = useCallback(() => [heroRef.current, labRef.current], []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleId>('temporal');
  const [challengeId, setChallengeId] = useState<ChallengeId>(CHALLENGES[0].id);
  const [running, setRunning] = useState(true);
  const snapshot = useLabSimulation(getCanvases, challengeId, running);
  const challenge = useMemo(
    () => CHALLENGES.find((item) => item.id === challengeId) ?? CHALLENGES[0],
    [challengeId],
  );
  const metrics = snapshot.metrics;
  const tick = snapshot.tick;
  const routeModule = snapshot.module;
  const selected = MODULES.find((item) => item.id === activeModule) ?? MODULES[0];

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Cell-State Adaptive home">
          <span className="brand-orb" aria-hidden="true" />
          <span>Cell-State Adaptive</span>
        </a>
        <button
          className="menu-button"
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Toggle navigation"
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav className={mobileOpen ? 'nav-links open' : 'nav-links'} aria-label="Primary navigation">
          <a href="#architecture" onClick={() => setMobileOpen(false)}>Architecture</a>
          <a href="#biology" onClick={() => setMobileOpen(false)}>Biology</a>
          <a href="#lab" onClick={() => setMobileOpen(false)}>Lab</a>
          <a href="#roadmap" onClick={() => setMobileOpen(false)}>Roadmap</a>
          <a className="nav-cta" href="#build" onClick={() => setMobileOpen(false)}>Build the prototype</a>
        </nav>
      </header>

      <main>
        <section className="hero section" id="top">
          <div className="hero-copy reveal">
            <h1>A machine that remembers, adapts, predicts, and escalates.</h1>
            <p>
              Not a machine that literally solves every possible problem. A multiscale adaptive state machine designed to solve a broad range of real-world problems by preserving history, learning task structure, and choosing the right level of cognition.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#architecture">Explore the architecture</a>
              <a className="button secondary" href="#lab">Run a challenge</a>
            </div>
            <div className="hero-proof" aria-label="Core principles">
              <span>Persistent state</span>
              <span>Closed-loop action</span>
              <span>Uncertainty-aware</span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Live cell-state simulation">
            <div className="field-lines" aria-hidden="true" />
            <canvas
              ref={heroRef}
              id="hero-simulation"
              className="hero-sim-canvas"
              aria-label="WebGPU cell-state field"
            />
            <div className="cell-core">
              <div className="cell-ring ring-one" />
              <div className="cell-ring ring-two" />
              <div className="cell-ring ring-three" />
              <div className="nucleus">
                <span>STATE</span>
                <strong>{String(tick % 100).padStart(2, '0')}</strong>
              </div>
              {Array.from({ length: 12 }).map((_, index) => (
                <i key={index} style={{ '--i': index } as React.CSSProperties} />
              ))}
            </div>
            <div className="visual-caption">
              <span>Input becomes memory.</span>
              <span>Memory changes action.</span>
            </div>
          </div>
        </section>

        <section className="limits section" aria-labelledby="limits-title">
          <div>
            <h2 id="limits-title">The goal is breadth, not mathematical omnipotence.</h2>
          </div>
          <div className="limits-copy">
            <p>
              Computability places hard limits on universal problem solving, and no-free-lunch results rule out one optimizer that dominates across every possible objective. The engineering target is therefore conditional generality: adapt quickly when structure exists, detect when assumptions fail, and escalate to more deliberate methods only when necessary.
            </p>
            <div className="limit-rail">
              <span>React</span><b>→</b><span>Adapt</span><b>→</b><span>Predict</span><b>→</b><span>Plan</span><b>→</b><span>Verify</span>
            </div>
          </div>
        </section>

        <section className="architecture section" id="architecture" aria-labelledby="architecture-title">
          <div className="section-heading">
            <h2 id="architecture-title">One closed loop. Multiple timescales.</h2>
            <p>Select a module to inspect how state flows through the machine.</p>
          </div>
          <div className="architecture-layout">
            <div className="machine-flow" role="list" aria-label="Machine modules">
              {MODULES.map((module, index) => {
                const isSelected = activeModule === module.id;
                const isActive = running && routeModule === module.id;
                return (
                  <div className="flow-item" key={module.id}>
                    <button
                      type="button"
                      className={`module-node ${isSelected ? 'selected' : ''} ${isActive ? 'signal-active' : ''}`}
                      onClick={() => setActiveModule(module.id)}
                      aria-pressed={isSelected}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{module.name}</strong>
                      <small>{module.short}</small>
                    </button>
                    {index < MODULES.length - 1 && <div className="connector" aria-hidden="true"><i /></div>}
                  </div>
                );
              })}
              <div className="feedback-loop" aria-hidden="true">Safety feedback ↺</div>
            </div>

            <aside className="inspector" aria-live="polite">
              <div className="inspector-index">Module {String(MODULES.findIndex((item) => item.id === selected.id) + 1).padStart(2, '0')}</div>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <dl>
                <div><dt>Primary role</dt><dd>{selected.role}</dd></div>
                <div><dt>Current status</dt><dd>{routeModule === selected.id && running ? 'Processing signal' : 'Maintaining state'}</dd></div>
                <div><dt>Live challenge</dt><dd>{challenge.name} · tick {tick}</dd></div>
              </dl>
              <button className="text-button" type="button" onClick={() => setRunning((value) => !value)}>
                {running ? 'Pause simulation' : 'Resume simulation'}
              </button>
            </aside>
          </div>
        </section>

        <section className="biology section" id="biology" aria-labelledby="biology-title">
          <div className="section-heading split-heading">
            <h2 id="biology-title">The machine borrows motifs, not metaphors.</h2>
            <p>Cells demonstrate compact computational primitives. The design translates those primitives into measurable engineering mechanisms.</p>
          </div>
          <div className="biology-list">
            {biology.map(([name, principle, description], index) => (
              <article className="biology-row" key={name}>
                <span className="row-number">0{index + 1}</span>
                <h3>{name}</h3>
                <strong>{principle}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <p className="science-note">
            Learning-like behavior and persistent state are evidence of proto-cognitive computation—not proof of subjective consciousness.
          </p>
        </section>

        <section className="memory section" aria-labelledby="memory-title">
          <div className="section-heading">
            <h2 id="memory-title">Memory is not one database.</h2>
            <p>Each layer retains the minimum state needed for its timescale, then exposes compressed evidence upward.</p>
          </div>
          <div className="memory-timeline">
            {memoryLayers.map(([name, duration, description], index) => (
              <article className="memory-layer" key={name}>
                <div className="memory-axis"><span style={{ width: `${24 + index * 22}%` }} /></div>
                <span className="row-number">0{index + 1}</span>
                <h3>{name}</h3>
                <strong>{duration}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lab section" id="lab" aria-labelledby="lab-title">
          <div className="section-heading split-heading">
            <h2 id="lab-title">Problem-solving lab</h2>
            <p>Choose a challenge class and observe which layers become dominant as the machine updates its internal state.</p>
          </div>
          <div className="lab-layout">
            <div className="challenge-picker" role="list" aria-label="Challenge classes">
              {CHALLENGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === challenge.id ? 'challenge active' : 'challenge'}
                  onClick={() => setChallengeId(item.id)}
                  aria-pressed={item.id === challenge.id}
                >
                  <span>{item.name}</span>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
            <div className="lab-console">
              <div className="console-header">
                <div>
                  <span>Active challenge</span>
                  <strong>{challenge.name}</strong>
                </div>
                <button type="button" className="run-toggle" onClick={() => setRunning((value) => !value)}>
                  <i className={running ? 'running' : ''} />
                  {running ? 'Running' : 'Paused'}
                </button>
              </div>
              <div className="sim-stage">
                <canvas
                  ref={labRef}
                  id="lab-simulation"
                  className="sim-canvas"
                  aria-label="Challenge simulation"
                />
                <div className="sim-meta">
                  <span className={snapshot.backend === 'webgpu' ? 'sim-backend gpu' : 'sim-backend cpu'}>
                    {snapshot.backend === 'webgpu' ? 'WebGPU compute' : 'CPU fallback'}
                  </span>
                  <span>Progress {Math.round(snapshot.progress * 100)}%</span>
                </div>
                {snapshot.backend === 'cpu' && snapshot.unavailableReason && (
                  <p className="sim-fallback" role="status">{snapshot.unavailableReason}</p>
                )}
              </div>
              <div className="route-display" aria-label="Active processing route">
                {challenge.route.map((id, index) => {
                  const module = MODULES.find((item) => item.id === id)!;
                  const active = running && routeModule === id;
                  return (
                    <div className={active ? 'route-step active' : 'route-step'} key={`${id}-${index}`}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{module.short}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="metrics-grid">
                <Metric label="Confidence" value={metrics.confidence} />
                <Metric label="Novelty" value={metrics.novelty} />
                <Metric label="Memory utilization" value={metrics.memory} />
                <Metric label="Prediction error" value={metrics.predictionError} inverse />
                <Metric label="Energy budget" value={metrics.energy} inverse />
              </div>
              <div className="progress-track" aria-label="Challenge progress">
                <div><span>Success signal</span><strong>{Math.round(snapshot.progress * 100)}%</strong></div>
                <i style={{ width: `${Math.round(snapshot.progress * 100)}%` }} />
              </div>
              <div className="console-log" aria-live="polite">
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <p>{running ? snapshot.status : 'Simulation paused. Internal state is preserved.'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="hardware section" aria-labelledby="hardware-title">
          <div className="section-heading">
            <h2 id="hardware-title">A practical hardware path</h2>
            <p>Prototype on conventional systems, then migrate bottlenecks to event-driven and in-memory substrates.</p>
          </div>
          <div className="hardware-stack">
            {[
              ['Input', 'Event cameras, microphones, telemetry, structured APIs'],
              ['Fast dynamics', 'GPU or neuromorphic reservoir layers'],
              ['Adaptive control', 'Low-latency recurrent and homeostatic state'],
              ['World model', 'Accelerated learned dynamics plus symbolic constraints'],
              ['Memory', 'Versioned object store, vector retrieval, provenance graph'],
              ['Future substrate', 'Memristive arrays and analog dynamical compute'],
            ].map(([label, copy], index) => (
              <article key={label}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{label}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="safety section" aria-labelledby="safety-title">
          <div className="section-heading split-heading">
            <h2 id="safety-title">Failure modes must be first-class state.</h2>
            <p>The machine should represent its own uncertainty, degradation, and policy boundaries—not bolt them on after deployment.</p>
          </div>
          <div className="safety-table" role="table" aria-label="Safety risks and controls">
            <div className="safety-row safety-head" role="row">
              <span role="columnheader">Risk</span><span role="columnheader">Failure</span><span role="columnheader">Control</span>
            </div>
            {safetyItems.map(([risk, failure, control]) => (
              <div className="safety-row" role="row" key={risk}>
                <strong role="cell">{risk}</strong><span role="cell">{failure}</span><span role="cell">{control}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="roadmap section" id="roadmap" aria-labelledby="roadmap-title">
          <div className="section-heading">
            <h2 id="roadmap-title">Prototype in five controlled stages.</h2>
          </div>
          <ol className="roadmap-list">
            {[
              ['Closed-loop simulator', 'Build one environment with sparse events, persistent state, and measurable task success.'],
              ['Adaptive gating', 'Add habituation, novelty protection, and recovery tests under distribution shift.'],
              ['Predictive control', 'Learn local dynamics and select information-gathering actions when uncertainty rises.'],
              ['Tool escalation', 'Route difficult cases to search, planning, solvers, and human review with explicit budgets.'],
              ['Embodied validation', 'Deploy on event-driven hardware and compare energy, latency, robustness, and calibration.'],
            ].map(([title, copy]) => (
              <li key={title}><h3>{title}</h3><p>{copy}</p></li>
            ))}
          </ol>
        </section>

        <section className="build section" id="build" aria-labelledby="build-title">
          <div className="build-panel">
            <div>
              <h2 id="build-title">Build the smallest machine that can surprise us.</h2>
              <p>Start with one measurable environment, one persistent state vector, one adaptive gate, and one verified action loop. Generality should emerge from reusable mechanisms—not inflated claims.</p>
            </div>
            <a className="button primary" href="#references">Review the foundations</a>
          </div>
        </section>

        <section className="references section" id="references" aria-labelledby="references-title">
          <div className="section-heading split-heading">
            <h2 id="references-title">Scientific foundations</h2>
            <p>Use these themes as starting points for literature review and experimental design.</p>
          </div>
          <div className="reference-list">
            {[
              'E. coli chemotaxis, receptor methylation, and temporal gradient sensing',
              'Physarum habituation, oscillatory dynamics, and distributed decision-making',
              'Stentor learning-like behavior and non-neural adaptive state',
              'Reservoir computing and dynamical systems for temporal processing',
              'Active inference, predictive processing, and uncertainty-aware control',
              'Neuromorphic event-driven sensing and memristive computation',
              'Computability limits and no-free-lunch results for optimization',
            ].map((item, index) => (
              <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></div>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <span>Cell-State Adaptive Problem Solver</span>
        <span>Architecture concept • Built for rigorous experimentation</span>
      </footer>
    </div>
  );
}

function Metric({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const status = inverse ? 100 - value : value;
  return (
    <div className="metric">
      <div><span>{label}</span><strong>{value}%</strong></div>
      <div className="metric-track"><i style={{ width: `${value}%`, opacity: 0.45 + status / 180 }} /></div>
    </div>
  );
}

export default App;
