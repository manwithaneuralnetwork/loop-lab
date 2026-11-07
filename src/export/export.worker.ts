/// <reference lib="webworker" />
import { CanvasRenderer } from '../engine/canvas-renderer';
import type { ExportWorkerRequest, ExportWorkerResponse } from './export-protocol';
import { SimulationRuntime } from '../engine/simulation';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let runtime: SimulationRuntime | null = null;
let renderer: CanvasRenderer | null = null;
let canvas: OffscreenCanvas | null = null;
let frame = 0;
let totalFrames = 0;
let stepsPerFrame = 2;

function send(message: ExportWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function sendFrame(): void {
  if (!runtime || !renderer || !canvas) return;
  if (frame >= totalFrames) {
    send({ type: 'complete' });
    return;
  }
  if (frame > 0) {
    for (let step = 0; step < stepsPerFrame; step += 1) runtime.step();
  }
  renderer.render(runtime.world);
  const bitmap = canvas.transferToImageBitmap();
  send({ type: 'frame', bitmap, frame: frame + 1, totalFrames }, [bitmap]);
  frame += 1;
}

scope.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === 'start') {
      runtime = new SimulationRuntime(message.worldWidth, message.worldHeight);
      runtime.load(message.code, message.params);
      canvas = new OffscreenCanvas(message.outputWidth, message.outputHeight);
      renderer = new CanvasRenderer(canvas);
      renderer.resize(message.outputWidth, message.outputHeight);
      frame = 0;
      totalFrames = message.totalFrames;
      stepsPerFrame = Math.max(1, Math.round((1 / message.fps) / runtime.stepSize));
      sendFrame();
    } else if (message.type === 'next') sendFrame();
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
