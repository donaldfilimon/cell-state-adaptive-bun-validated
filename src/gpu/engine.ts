import {
  FIELD_FLOATS,
  GRID,
  STATE_FLOATS,
  STEP_HZ,
  type ChallengeId,
  type SimBackend,
  type SimSnapshot,
  advance,
  createField,
  createInitialState,
  snapshotFromState,
  stepField,
} from '../solver';
import { COMPUTE_WGSL, RENDER_WGSL } from './shaders';

const STATE_BYTES = STATE_FLOATS * 4;
const BUF_MAP_READ = 0x0001;
const BUF_COPY_SRC = 0x0004;
const BUF_COPY_DST = 0x0008;
const BUF_UNIFORM = 0x0040;
const BUF_STORAGE = 0x0080;
const TEX_COPY_DST = 0x02;
const TEX_BINDING = 0x04;
const TEX_STORAGE = 0x08;
const STAGE_FRAGMENT = 0x2;
const STAGE_COMPUTE = 0x4;
const MAP_READ = 0x0001;
const FIELD_FORMAT = 'rgba16float';

type Surface = {
  canvas: HTMLCanvasElement;
  gpu: GPUCanvasContext | null;
  cpu: CanvasRenderingContext2D | null;
};

function navigatorGpu(): GPU | undefined {
  return navigator.gpu;
}

/** Ignore GPU readback that started before a challenge reset or destroy. */
export function shouldApplyGpuReadback(dead: boolean, mappedGen: number, currentGen: number): boolean {
  return !dead && mappedGen === currentGen;
}

function fitCanvas(canvas: HTMLCanvasElement, fallbackW: number, fallbackH: number): { w: number; h: number } {
  const w = Math.max(1, Math.round(canvas.clientWidth || fallbackW));
  const h = Math.max(1, Math.round(canvas.clientHeight || fallbackH));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { w, h };
}

export class SimulationEngine {
  backend: SimBackend = 'cpu';
  unavailableReason?: string;
  running = true;

  private surfaces: Surface[] = [];
  private challenge: ChallengeId = 'navigation';
  private cpuState = createInitialState('navigation');
  private fieldA = createField();
  private fieldB = createField();
  private ping = true;
  private dead = false;
  private acc = 0;
  private last = 0;
  private mapping = false;
  private readGen = 0;
  private tile: HTMLCanvasElement | null = null;
  private tileCtx: CanvasRenderingContext2D | null = null;

  private device: GPUDevice | null = null;
  private format = 'bgra8unorm';
  private stateBufA: GPUBuffer | null = null;
  private stateBufB: GPUBuffer | null = null;
  private fieldTexA: GPUTexture | null = null;
  private fieldTexB: GPUTexture | null = null;
  private fieldViewA: GPUTextureView | null = null;
  private fieldViewB: GPUTextureView | null = null;
  private sampler: GPUSampler | null = null;
  private paramsBuf: GPUBuffer | null = null;
  private renderParamsBuf: GPUBuffer | null = null;
  private staging: GPUBuffer | null = null;
  private stepPipeline: GPUComputePipeline | null = null;
  private fieldPipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private bindAB: GPUBindGroup | null = null;
  private bindBA: GPUBindGroup | null = null;
  private renderBindA: GPUBindGroup | null = null;
  private renderBindB: GPUBindGroup | null = null;

  async init(canvases: HTMLCanvasElement[]): Promise<void> {
    if (this.dead) return;
    const gpuOk = await this.tryWebGpu(canvases);
    if (this.dead) return;
    if (!gpuOk) this.initCpu(canvases);
    if (this.dead) return;
    this.resetTo(this.challenge);
  }

  setChallenge(id: ChallengeId): void {
    this.challenge = id;
    this.resetTo(id);
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  snapshot(): SimSnapshot {
    return snapshotFromState(this.cpuState, this.backend, this.unavailableReason);
  }

  frame(now: number): void {
    if (this.dead) return;
    this.fitSurfaces();
    if (!this.last) this.last = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running) {
      this.acc += dt;
      const stepDt = 1 / STEP_HZ;
      let n = 0;
      while (this.acc >= stepDt && n < 3) {
        this.acc -= stepDt;
        this.stepOnce(true);
        n += 1;
      }
      if (n === 0) this.presentOnly();
      else this.present();
    } else {
      this.stepOnce(false);
      this.present();
    }
  }

  destroy(): void {
    this.dead = true;
    this.device?.destroy();
    this.device = null;
    for (const surface of this.surfaces) surface.gpu?.unconfigure();
    this.surfaces = [];
  }

  private async tryWebGpu(canvases: HTMLCanvasElement[]): Promise<boolean> {
    if (this.dead) return false;
    const gpu = navigatorGpu();
    if (!gpu) {
      this.unavailableReason = 'WebGPU is unavailable in this browser. Running the same closed-loop solver on the CPU.';
      return false;
    }
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (this.dead) return false;
      if (!adapter) {
        this.unavailableReason = 'No WebGPU adapter was found. Running the same closed-loop solver on the CPU.';
        return false;
      }
      const device = await adapter.requestDevice();
      if (this.dead) {
        device.destroy();
        return false;
      }
      const format = gpu.getPreferredCanvasFormat();
      this.device = device;
      this.format = format;
      device.addEventListener('uncapturederror', (event) => {
        console.error('WebGPU uncaptured error', event.error.message);
      });
      await this.createGpuResources(device, format);
      if (this.dead) {
        device.destroy();
        this.device = null;
        return false;
      }
      const surfaces: Surface[] = [];
      for (const canvas of canvases) {
        const context = canvas.getContext('webgpu');
        if (!context) {
          this.unavailableReason = 'The canvas could not acquire a GPU context. Running the same closed-loop solver on the CPU.';
          device.destroy();
          this.device = null;
          return false;
        }
        context.configure({ device, format, alphaMode: 'opaque' });
        surfaces.push({ canvas, gpu: context, cpu: null });
      }
      this.surfaces = surfaces;
      this.backend = 'webgpu';
      this.unavailableReason = undefined;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.unavailableReason = `WebGPU failed to initialize (${message}). Running the same closed-loop solver on the CPU.`;
      this.device?.destroy();
      this.device = null;
      return false;
    }
  }

  private async createGpuResources(device: GPUDevice, format: string): Promise<void> {
    const usageStorage = BUF_STORAGE | BUF_COPY_DST | BUF_COPY_SRC;
    const usageUniform = BUF_UNIFORM | BUF_COPY_DST;
    const texUsage = TEX_STORAGE | TEX_BINDING | TEX_COPY_DST;
    this.stateBufA = device.createBuffer({ size: STATE_BYTES, usage: usageStorage, label: 'stateA' });
    this.stateBufB = device.createBuffer({ size: STATE_BYTES, usage: usageStorage, label: 'stateB' });
    this.fieldTexA = device.createTexture({ size: { width: GRID, height: GRID }, format: FIELD_FORMAT, usage: texUsage, label: 'fieldA' });
    this.fieldTexB = device.createTexture({ size: { width: GRID, height: GRID }, format: FIELD_FORMAT, usage: texUsage, label: 'fieldB' });
    this.fieldViewA = this.fieldTexA.createView();
    this.fieldViewB = this.fieldTexB.createView();
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.paramsBuf = device.createBuffer({ size: 16, usage: usageUniform, label: 'params' });
    this.renderParamsBuf = device.createBuffer({ size: 16, usage: usageUniform, label: 'renderParams' });
    this.staging = device.createBuffer({
      size: STATE_BYTES,
      usage: BUF_MAP_READ | BUF_COPY_DST,
      label: 'stateRead',
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL, label: 'sim-compute' });
    const renderModule = device.createShaderModule({ code: RENDER_WGSL, label: 'sim-render' });
    await this.assertShader(computeModule, 'compute');
    await this.assertShader(renderModule, 'render');

    const computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: STAGE_COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: STAGE_COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: STAGE_COMPUTE, texture: { sampleType: 'float' } },
        { binding: 3, visibility: STAGE_COMPUTE, storageTexture: { access: 'write-only', format: FIELD_FORMAT } },
        { binding: 4, visibility: STAGE_COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    const renderLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: STAGE_FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: STAGE_FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: STAGE_FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const computePipeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
    const renderPipeLayout = device.createPipelineLayout({ bindGroupLayouts: [renderLayout] });

    this.stepPipeline = await device.createComputePipelineAsync({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'step_main' },
    });
    this.fieldPipeline = await device.createComputePipelineAsync({
      layout: computePipeLayout,
      compute: { module: computeModule, entryPoint: 'field_main' },
    });
    this.renderPipeline = await device.createRenderPipelineAsync({
      layout: renderPipeLayout,
      vertex: { module: renderModule, entryPoint: 'vs' },
      fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    const makeComputeBind = (stateIn: GPUBuffer, stateOut: GPUBuffer, fieldIn: GPUTextureView, fieldOut: GPUTextureView) =>
      device.createBindGroup({
        layout: computeLayout,
        entries: [
          { binding: 0, resource: { buffer: stateIn } },
          { binding: 1, resource: { buffer: stateOut } },
          { binding: 2, resource: fieldIn },
          { binding: 3, resource: fieldOut },
          { binding: 4, resource: { buffer: this.paramsBuf! } },
        ],
      });
    this.bindAB = makeComputeBind(this.stateBufA, this.stateBufB, this.fieldViewA, this.fieldViewB);
    this.bindBA = makeComputeBind(this.stateBufB, this.stateBufA, this.fieldViewB, this.fieldViewA);
    this.renderBindA = device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: this.fieldViewA },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.renderParamsBuf } },
      ],
    });
    this.renderBindB = device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: this.fieldViewB },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.renderParamsBuf } },
      ],
    });
  }

  private async assertShader(module: GPUShaderModule, label: string): Promise<void> {
    if (!module.getCompilationInfo) return;
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((item) => item.type === 'error');
    if (errors.length > 0) {
      throw new Error(`${label} WGSL: ${errors.map((item) => `${item.lineNum}: ${item.message}`).join('; ')}`);
    }
  }

  private clearFieldTextures(device: GPUDevice): void {
    const zeros = new ArrayBuffer(GRID * GRID * 8);
    const layout = { bytesPerRow: GRID * 8, rowsPerImage: GRID };
    const size = { width: GRID, height: GRID };
    if (this.fieldTexA) device.queue.writeTexture({ texture: this.fieldTexA }, zeros, layout, size);
    if (this.fieldTexB) device.queue.writeTexture({ texture: this.fieldTexB }, zeros, layout, size);
  }

  private initCpu(canvases: HTMLCanvasElement[]): void {
    this.backend = 'cpu';
    this.surfaces = canvases.map((canvas) => ({
      canvas,
      gpu: null,
      cpu: canvas.getContext('2d', { alpha: false, willReadFrequently: false }),
    }));
    if (!this.unavailableReason) {
      this.unavailableReason = 'WebGPU is unavailable. Running the same closed-loop solver on the CPU.';
    }
    const tile = document.createElement('canvas');
    tile.width = GRID;
    tile.height = GRID;
    this.tile = tile;
    this.tileCtx = tile.getContext('2d', { alpha: false });
  }

  private resetTo(id: ChallengeId): void {
    this.readGen += 1;
    this.cpuState = createInitialState(id);
    this.fieldA = createField();
    this.fieldB = createField();
    this.ping = true;
    this.acc = 0;
    const device = this.device;
    if (device && this.stateBufA && this.stateBufB && this.fieldTexA && this.fieldTexB) {
      device.queue.writeBuffer(this.stateBufA, 0, this.cpuState);
      device.queue.writeBuffer(this.stateBufB, 0, this.cpuState);
      this.clearFieldTextures(device);
      this.stepGpu(false);
      return;
    }
    const src = this.ping ? this.fieldA : this.fieldB;
    const dst = this.ping ? this.fieldB : this.fieldA;
    stepField(this.cpuState, src, dst, false);
    this.ping = !this.ping;
  }

  private stepOnce(running: boolean): void {
    if (this.backend === 'webgpu' && this.device) {
      this.stepGpu(running);
      return;
    }
    this.cpuState = advance(this.cpuState, running);
    const src = this.ping ? this.fieldA : this.fieldB;
    const dst = this.ping ? this.fieldB : this.fieldA;
    stepField(this.cpuState, src, dst, running);
    this.ping = !this.ping;
  }

  private stepGpu(running: boolean): void {
    const device = this.device;
    if (!device || !this.stepPipeline || !this.fieldPipeline || !this.paramsBuf) return;
    const params = new Uint32Array([GRID, GRID, running ? 1 : 0, 0]);
    device.queue.writeBuffer(this.paramsBuf, 0, params);
    const bind = this.ping ? this.bindAB : this.bindBA;
    if (!bind) return;
    const encoder = device.createCommandEncoder();
    const stepPass = encoder.beginComputePass();
    stepPass.setPipeline(this.stepPipeline);
    stepPass.setBindGroup(0, bind);
    stepPass.dispatchWorkgroups(1);
    stepPass.end();
    const fieldPass = encoder.beginComputePass();
    fieldPass.setPipeline(this.fieldPipeline);
    fieldPass.setBindGroup(0, bind);
    fieldPass.dispatchWorkgroups(Math.ceil(GRID / 8), Math.ceil(GRID / 8));
    fieldPass.end();
    const written = this.ping ? this.stateBufB : this.stateBufA;
    if (written && this.staging && !this.mapping) {
      encoder.copyBufferToBuffer(written, 0, this.staging, 0, STATE_BYTES);
    }
    device.queue.submit([encoder.finish()]);
    this.ping = !this.ping;
    this.kickReadback();
  }

  private kickReadback(): void {
    if (!this.staging || this.mapping) return;
    this.mapping = true;
    const staging = this.staging;
    const gen = this.readGen;
    staging.mapAsync(MAP_READ).then(() => {
      if (shouldApplyGpuReadback(this.dead, gen, this.readGen)) {
        this.cpuState = new Float32Array(staging.getMappedRange()).slice();
      } else {
        void staging.getMappedRange();
      }
      staging.unmap();
      this.mapping = false;
    }).catch(() => {
      this.mapping = false;
    });
  }

  private presentOnly(): void {
    if (this.backend === 'webgpu') this.presentGpu();
    else this.presentCpu();
  }

  private present(): void {
    this.presentOnly();
  }

  private presentGpu(): void {
    const device = this.device;
    const pipeline = this.renderPipeline;
    if (!device || !pipeline || !this.renderParamsBuf) return;
    const fieldBind = this.ping ? this.renderBindA : this.renderBindB;
    if (!fieldBind) return;
    for (const surface of this.surfaces) {
      if (!surface.gpu) continue;
      const { w, h } = fitCanvas(surface.canvas, 640, 360);
      device.queue.writeBuffer(this.renderParamsBuf, 0, new Float32Array([w, h, GRID, GRID]));
      const encoder = device.createCommandEncoder();
      const view = surface.gpu.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.12, g: 0.05, b: 0.22, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, fieldBind);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  }

  private presentCpu(): void {
    const field = this.ping ? this.fieldA : this.fieldB;
    const tile = this.tile;
    const tileCtx = this.tileCtx;
    if (!tile || !tileCtx) return;
    const image = tileCtx.createImageData(GRID, GRID);
    for (let i = 0; i < FIELD_FLOATS; i++) {
      image.data[i] = Math.max(0, Math.min(255, Math.round(field[i] * 255)));
    }
    tileCtx.putImageData(image, 0, 0);
    for (const surface of this.surfaces) {
      const ctx = surface.cpu;
      if (!ctx) continue;
      const { w, h } = fitCanvas(surface.canvas, 640, 360);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#08080d';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(tile, 0, 0, w, h);
    }
  }

  private fitSurfaces(): void {
    for (const surface of this.surfaces) {
      const fallback = surface.canvas.classList.contains('hero-sim-canvas') ? 520 : 640;
      fitCanvas(surface.canvas, fallback, surface.canvas.classList.contains('hero-sim-canvas') ? 520 : 360);
    }
  }
}

export { COMPUTE_WGSL, RENDER_WGSL };
