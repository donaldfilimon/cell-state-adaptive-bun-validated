# Goals

## Improve and solve and simulate in WebGPU
status: done
- Closed-loop solvers for the five challenge classes replace random metric walks
- Live lab steps packed state in WGSL compute and presents a GPU canvas, with CPU fallback
- Outcome: five challenges step via shipped `advance`/`stepPacked`; metrics and progress come from that state; WebGPU compute + canvas present when available; explicit CPU fallback otherwise. Playwright: filled GPU canvas, pause/switch, dual server start.
