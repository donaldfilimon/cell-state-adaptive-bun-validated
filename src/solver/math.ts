export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function pct(unit: number): number {
  return Math.round(clamp01(unit) * 100);
}
