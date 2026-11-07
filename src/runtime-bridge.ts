import type { HostToRuntimeMessage, RuntimeToHostMessage } from './engine/protocol';

type RuntimeListener = (message: RuntimeToHostMessage) => void;

export class RuntimeBridge {
  private worker: Worker | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly listener: RuntimeListener,
    private width: number,
    private height: number
  ) {}

  start(): void {
    this.dispose();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'runtime-canvas';
    this.viewport.prepend(this.canvas);
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL('./engine/runtime.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<RuntimeToHostMessage>) => this.listener(event.data);
    this.worker.onerror = (event) => this.listener({ type: 'error', message: event.message });
    this.post({ type: 'init', canvas: offscreen, width: this.width, height: this.height }, [offscreen]);
  }

  replace(): void { this.start(); }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.post({ type: 'resize', width, height });
  }

  post(message: HostToRuntimeMessage, transfer: Transferable[] = []): void {
    this.worker?.postMessage(message, transfer);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.canvas?.remove();
    this.canvas = null;
  }
}
