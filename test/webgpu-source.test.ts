import { describe, expect, test } from 'bun:test';
import { COMPUTE_WGSL, RENDER_WGSL } from '../src/gpu/shaders';

describe('shipped WebGPU path', () => {
  test('compute shader writes simulation buffers', () => {
    expect(COMPUTE_WGSL).toContain('@compute');
    expect(COMPUTE_WGSL).toContain('step_main');
    expect(COMPUTE_WGSL).toContain('field_main');
    expect(COMPUTE_WGSL).toContain('state_out');
    expect(COMPUTE_WGSL).toContain('var<storage, read_write> state_out');
    expect(COMPUTE_WGSL).toContain('textureStore(field_out');
    expect(COMPUTE_WGSL).toContain('step_nav');
    expect(COMPUTE_WGSL).toContain('step_anomaly');
    expect(COMPUTE_WGSL).toContain('step_opt');
    expect(COMPUTE_WGSL).toContain('step_plan');
    expect(COMPUTE_WGSL).toContain('step_partial');
  });

  test('render shader presents the simulation field', () => {
    expect(RENDER_WGSL).toContain('@vertex');
    expect(RENDER_WGSL).toContain('@fragment');
    expect(RENDER_WGSL).toContain('textureSample');
    expect(RENDER_WGSL).toContain('texture_2d<f32>');
    expect(COMPUTE_WGSL).toContain('textureStore');
    expect(COMPUTE_WGSL).toContain('texture_storage_2d');
  });

  test('engine requests adapter, device, and configures a GPU canvas', async () => {
    const source = await Bun.file(new URL('../src/gpu/engine.ts', import.meta.url)).text();
    expect(source).toContain('requestAdapter');
    expect(source).toContain('requestDevice');
    expect(source).toContain("getContext('webgpu')");
    expect(source).toContain('configure');
    expect(source).toContain('dispatchWorkgroups');
    expect(source).toContain('beginRenderPass');
    expect(source).toContain('Running the same closed-loop solver on the CPU');
  });

  test('hash_noise uses 24-bit conversion so f32 matches TS hashNoise', () => {
    expect(COMPUTE_WGSL).toContain('return f32(n >> 8u) * (1.0 / 16777216.0);');
    expect(COMPUTE_WGSL).not.toContain('f32(n) * (1.0 / 4294967296.0)');
  });

  test('init aborts after awaits if destroyed and never falls back to 2d', async () => {
    const source = await Bun.file(new URL('../src/gpu/engine.ts', import.meta.url)).text();
    const init = source.slice(source.indexOf('async init('), source.indexOf('setChallenge'));
    expect(init).toMatch(/const gpuOk = await this\.tryWebGpu\(canvases\);\s*if \(this\.dead\) return;/);
    expect(init).toMatch(/if \(!gpuOk\) this\.initCpu\(canvases\);\s*if \(this\.dead\) return;/);
    expect(init.match(/if \(this\.dead\) return;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('tryWebGpu aborts after each await when dead and does not getContext', async () => {
    const source = await Bun.file(new URL('../src/gpu/engine.ts', import.meta.url)).text();
    const fn = source.slice(source.indexOf('private async tryWebGpu'), source.indexOf('private async createGpuResources'));
    expect(fn).toMatch(/await gpu\.requestAdapter[\s\S]*?if \(this\.dead\) return false;/);
    expect(fn).toMatch(/const device = await adapter\.requestDevice\(\);\s*if \(this\.dead\) \{\s*device\.destroy\(\);\s*return false;/);
    const resourcesIdx = fn.indexOf('await this.createGpuResources');
    const contextIdx = fn.indexOf("getContext('webgpu')");
    expect(resourcesIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeGreaterThan(resourcesIdx);
    expect(fn.slice(resourcesIdx, contextIdx)).toContain('if (this.dead)');
    expect(fn.slice(resourcesIdx, contextIdx)).toContain('device.destroy()');
  });

  test('tryWebGpu catch destroys the device before dropping the handle', async () => {
    const source = await Bun.file(new URL('../src/gpu/engine.ts', import.meta.url)).text();
    const fn = source.slice(source.indexOf('private async tryWebGpu'), source.indexOf('private async createGpuResources'));
    const catchBlock = fn.slice(fn.indexOf('catch'));
    expect(catchBlock).toMatch(/this\.device\?\.destroy\(\);[\s\S]*this\.device = null;/);
  });

  test('webgpu stepOnce only steps GPU and readback updates cpuState', async () => {
    const source = await Bun.file(new URL('../src/gpu/engine.ts', import.meta.url)).text();
    const stepOnce = source.slice(source.indexOf('private stepOnce'), source.indexOf('private stepGpu'));
    expect(stepOnce).toMatch(
      /if \(this\.backend === 'webgpu' && this\.device\) \{\s*this\.stepGpu\(running\);\s*return;/,
    );
    expect(stepOnce.indexOf('this.stepGpu')).toBeLessThan(stepOnce.indexOf('advance'));
    const kick = source.slice(source.indexOf('private kickReadback'), source.indexOf('private presentOnly'));
    expect(kick).toMatch(/this\.cpuState = new Float32Array\(/);
    expect(kick).toContain('getMappedRange()');
    const resetTo = source.slice(source.indexOf('private resetTo'), source.indexOf('private stepOnce'));
    expect(resetTo).toContain('this.cpuState = createInitialState(id)');
  });
});
