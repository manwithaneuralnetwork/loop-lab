import type { HostToRuntimeMessage, RuntimeToHostMessage } from './engine/protocol';

type RuntimeListener = (message: RuntimeToHostMessage) => void;

export class RuntimeBridge {
  private worker: Worker | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly handleKeyDown = (event: KeyboardEvent) => this.handleKey(event, true);
  private readonly handleKeyUp = (event: KeyboardEvent) => this.handleKey(event, false);

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
    this.canvas.tabIndex = 0;
    this.viewport.prepend(this.canvas);
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL('./engine/runtime.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<RuntimeToHostMessage>) => this.listener(event.data);
    this.worker.onerror = (event) => this.listener({ type: 'error', message: event.message });
    this.canvas.addEventListener('pointermove', (event) => this.postPointer(event));
    this.canvas.addEventListener('pointerdown', (event) => { this.canvas?.setPointerCapture(event.pointerId); this.canvas?.focus(); this.postPointer(event, true); });
    this.canvas.addEventListener('pointerup', (event) => this.postPointer(event, false));
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
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

  private postPointer(event: PointerEvent, down?: boolean): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.post({ type: 'input', pointer: {
      x: ((event.clientX - rect.left) / rect.width) * this.width,
      y: ((event.clientY - rect.top) / rect.height) * this.height,
      ...(down == null ? {} : { down })
    } });
  }

  private handleKey(event: KeyboardEvent, pressed: boolean): void {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    this.post({ type: 'input', key: event.key, pressed });
  }

  dispose(): void {
    this.worker?.terminate();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.worker = null;
    this.canvas?.remove();
    this.canvas = null;
  }
}
