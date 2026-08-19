interface GPU {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
  readonly queue: GPUQueue;
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
    label?: string;
  }): GPUBuffer;
  createTexture(descriptor: {
    size: { width: number; height: number };
    format: string;
    usage: number;
    label?: string;
  }): GPUTexture;
  createSampler(descriptor?: { magFilter?: string; minFilter?: string }): GPUSampler;
  createShaderModule(descriptor: { code: string; label?: string }): GPUShaderModule;
  createBindGroupLayout(descriptor: { entries: GPUBindGroupLayoutEntry[] }): GPUBindGroupLayout;
  createPipelineLayout(descriptor: { bindGroupLayouts: GPUBindGroupLayout[] }): GPUPipelineLayout;
  createBindGroup(descriptor: {
    layout: GPUBindGroupLayout;
    entries: Array<{ binding: number; resource: GPUBindingResource }>;
  }): GPUBindGroup;
  createComputePipelineAsync(descriptor: {
    layout: GPUPipelineLayout | 'auto';
    compute: { module: GPUShaderModule; entryPoint: string };
  }): Promise<GPUComputePipeline>;
  createRenderPipelineAsync(descriptor: {
    layout: GPUPipelineLayout | 'auto';
    vertex: { module: GPUShaderModule; entryPoint: string };
    fragment: {
      module: GPUShaderModule;
      entryPoint: string;
      targets: Array<{ format: string }>;
    };
    primitive: { topology: 'triangle-list' };
  }): Promise<GPURenderPipeline>;
  createCommandEncoder(): GPUCommandEncoder;
  addEventListener(type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void): void;
  destroy(): void;
}

interface GPUUncapturedErrorEvent {
  error: { message: string };
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: { type: 'uniform' | 'storage' | 'read-only-storage' };
  texture?: { sampleType: 'float' | 'unfilterable-float' };
  storageTexture?: { access: 'write-only'; format: string };
  sampler?: { type: 'filtering' | 'non-filtering' };
}

type GPUBindingResource = GPUTextureView | GPUSampler | { buffer: GPUBuffer };

interface GPUShaderModule {
  getCompilationInfo?: () => Promise<{ messages: Array<{ type: string; message: string; lineNum: number }> }>;
}

interface GPUBindGroupLayout {}
interface GPUPipelineLayout {}
interface GPUBindGroup {}
interface GPUSampler {}
interface GPUComputePipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}
interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: ArrayBufferView | ArrayBuffer): void;
  writeTexture(
    destination: { texture: GPUTexture },
    data: ArrayBufferView | ArrayBuffer,
    dataLayout: { bytesPerRow: number; rowsPerImage: number },
    size: { width: number; height: number },
  ): void;
}

interface GPUBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GPUCommandEncoder {
  beginComputePass(): GPUComputePassEncoder;
  beginRenderPass(descriptor: {
    colorAttachments: Array<{
      view: GPUTextureView;
      clearValue: { r: number; g: number; b: number; a: number };
      loadOp: 'clear' | 'load';
      storeOp: 'store';
    }>;
  }): GPURenderPassEncoder;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
  finish(): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(vertexCount: number): void;
  end(): void;
}

interface GPUCommandBuffer {}
interface GPUTexture {
  createView(): GPUTextureView;
  destroy(): void;
}
interface GPUTextureView {}

interface GPUCanvasContext {
  configure(config: { device: GPUDevice; format: string; alphaMode?: 'opaque' | 'premultiplied' }): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

interface Navigator {
  gpu?: GPU;
}

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}
