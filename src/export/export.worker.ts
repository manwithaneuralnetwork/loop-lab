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
let outputFps = 30;

function send(message: ExportWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function sendFrame(): void {
  if (!runtime || !renderer || !canvas) return;
  if (frame >= totalFrames || (frame > 0 && runtime.world.finished)) {
    send({ type: 'complete', frames: frame, finished: runtime.world.finished });
    return;
  }
  // The simulation always advances at its fixed 60 Hz step. Output rates that
  // do not divide 60 (notably 24 fps) alternate step counts to stay aligned
  // with the exact presentation timestamp rather than drifting over time.
  const targetTime = (frame + 1) / outputFps;
  while (!runtime.world.finished && runtime.elapsed + 1e-9 < targetTime) runtime.step();
  const audio = runtime.world.drainAudio();
  renderer.render(runtime.world);
  const bitmap = canvas.transferToImageBitmap();
  send({ type: 'frame', bitmap, frame: frame + 1, totalFrames, audio }, [bitmap]);
  frame += 1;
}

scope.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === 'preflight') {
      runtime = new SimulationRuntime(message.worldWidth, message.worldHeight);
      runtime.loadProject(message.files, message.entry || 'simulation.js', message.params, message.assets, message.files['bot.js'] ? 'bot.js' : null);
      const limitFrames = Math.ceil(message.limitSeconds / runtime.stepSize);
      while (!runtime.world.finished && runtime.frame < limitFrames) runtime.step();
      send({
        type: 'preflight', finished: runtime.world.finished, duration: runtime.elapsed,
        frames: runtime.frame, reason: runtime.world.finishReason
      });
    } else if (message.type === 'start') {
      runtime = new SimulationRuntime(message.worldWidth, message.worldHeight);
      if (message.files) runtime.loadProject(
        message.files, message.entry || 'simulation.js', message.params, message.assets,
        message.files['bot.js'] ? 'bot.js' : null
      );
      else runtime.load(message.code, message.params);
      canvas = new OffscreenCanvas(message.outputWidth, message.outputHeight);
      renderer = new CanvasRenderer(canvas);
      renderer.resize(message.outputWidth, message.outputHeight);
      frame = 0;
      totalFrames = message.totalFrames;
      outputFps = message.fps;
      void renderer.preload(runtime.world).then(sendFrame).catch((error) => send({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
    } else if (message.type === 'next') sendFrame();
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
