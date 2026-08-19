# Cell-State Adaptive Problem Solver

A cinematic, interactive website for a biologically inspired adaptive problem-solving architecture.

## Run with Bun

```bash
bun install
bun run dev
```

Open the local URL printed by Vite.

## Production build

```bash
bun run build
bun run start
```

## Stack

- Bun runtime with a production static server
- React 19
- TypeScript
- Vite
- Zero UI-framework dependencies

## Included interactions

- Selectable architecture modules with a live inspector
- Animated signal routing through the machine
- Five closed-loop problem-class simulations (navigation, anomaly filtering, black-box optimization, long-horizon planning, partial observability)
- Live simulation stepped in WebGPU compute shaders when available, with an explicit CPU fallback
- Lab metrics derived from solver state (not independent random walks)
- Responsive mobile navigation
- Reduced-motion support

## Scientific positioning

The site explicitly avoids claiming that any machine can solve every mathematically definable problem. It presents a practical design target: broad, adaptive problem solving under computability, optimization, uncertainty, and safety constraints.

## Runtime note

Development uses Vite through Bun. Production output is served by `Bun.serve` from `server.ts`.
