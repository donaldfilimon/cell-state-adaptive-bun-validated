/** Unknown-to-the-solver 2D objective. Matches WGSL `objective`. Higher is better. */
export function objective(x: number, y: number): number {
  const dx = x - 0.72;
  const dy = y - 0.28;
  const basin = 1 - (dx * dx + dy * dy) / 0.85;
  const sx = Math.sin(9 * x);
  const sy = Math.sin(9 * y);
  const ripple = 0.12 * (sx * sx + sy * sy);
  return basin - ripple;
}
