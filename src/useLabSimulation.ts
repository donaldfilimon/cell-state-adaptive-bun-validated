import { useEffect, useRef, useState } from 'react';
import { SimulationEngine } from './gpu/engine';
import {
  createInitialState,
  snapshotFromState,
  type ChallengeId,
  type SimSnapshot,
} from './solver';

export function useLabSimulation(
  getCanvases: () => Array<HTMLCanvasElement | null>,
  challengeId: ChallengeId,
  running: boolean,
): SimSnapshot {
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() =>
    snapshotFromState(createInitialState(challengeId), 'cpu'),
  );
  const engineRef = useRef<SimulationEngine | null>(null);
  const challengeRef = useRef(challengeId);
  const runningRef = useRef(running);
  challengeRef.current = challengeId;
  runningRef.current = running;

  useEffect(() => {
    const canvases = getCanvases().filter((item): item is HTMLCanvasElement => item !== null);
    if (canvases.length === 0) return undefined;
    const engine = new SimulationEngine();
    engineRef.current = engine;
    let raf = 0;
    let cancelled = false;
    let lastUi = 0;

    engine.init(canvases).then(() => {
      if (cancelled) {
        engine.destroy();
        return;
      }
      engine.setChallenge(challengeRef.current);
      engine.setRunning(runningRef.current);
      setSnapshot(engine.snapshot());
      const loop = (now: number) => {
        engine.frame(now);
        if (now - lastUi >= 80) {
          lastUi = now;
          setSnapshot(engine.snapshot());
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
    };
  }, [getCanvases]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      setSnapshot(snapshotFromState(createInitialState(challengeId), snapshot.backend, snapshot.unavailableReason));
      return;
    }
    engine.setChallenge(challengeId);
    setSnapshot(engine.snapshot());
  }, [challengeId]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setRunning(running);
    setSnapshot(engine.snapshot());
  }, [running]);

  return snapshot;
}
