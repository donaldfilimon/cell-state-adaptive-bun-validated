/** Integer mixer shared with WGSL `hash_noise` in `src/gpu/shaders.ts`. */
export function hashU32(tick: number, salt: number): number {
  let n = (Math.imul(tick >>> 0, 374761393) + Math.imul(salt >>> 0, 668265263)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n;
}

/**
 * Deterministic 0–1 noise. Matches WGSL `hash_noise` via 24-bit conversion
 * (`(n >>> 8) / 2^24`) so f32 and JS stay identical for n > 2^24.
 */
export function hashNoise(tick: number, salt: number): number {
  return (hashU32(tick, salt) >>> 8) / 16777216;
}
