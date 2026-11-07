/// <reference lib="webworker" />
import { CanvasRenderer } from './canvas-renderer';
import type { HostToRuntimeMessage, RuntimeToHostMessage } from './protocol';
import { SimulationRuntime } from './simulation';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtime = new SimulationRuntime(1080, 1080);
let renderer: CanvasRenderer | null = null;
let playing = true;
let playbackRate = 1;
let stepAccumulator = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function send(message: RuntimeToHostMessage): void { workerScope.postMessage(message); }
function fail(error: unknown): void {
  playing = false;
  const value = error instanceof Error ? error : new Error(String(error));
  const sourceLocation = value.stack?.match(/<anonymous>:(\d+):(\d+)/);
  send({
    type: 'error', message: value.message, stack: value.stack,
    line: sourceLocation ? Math.max(1, Number(sourceLocation[1]) - 3) : undefined,
    column: sourceLocation ? Number(sourceLocation[2]) : undefined
  });
  send({ type: 'status', playing: false });
}

function reportLoaded(): void {
  send({ type: 'parameters', schema: runtime.schema, params: runtime.params });
  send({ type: 'log', level: 'ok', message: `Simulation initialized with seed ${runtime.params.seed ?? 1}` });
  send({ type: 'log', level: 'info', message: `Created ${runtime.world.objects.length} objects` });
}

function restart(): void {
  runtime.restart();
  renderer?.render(runtime.world);
  reportLoaded();
  send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
}

function tick(): void {
  if (!playing) return;
  try {
    stepAccumulator += playbackRate;
    while (stepAccumulator >= 1) {
      runtime.step();
      stepAccumulator -= 1;
    }
    const duration = Number(runtime.params.duration) || 0;
    if (duration > 0 && runtime.elapsed >= duration) {
      if (runtime.params.autoRestart !== false) restart();
      else { playing = false; send({ type: 'status', playing }); }
    }
    renderer?.render(runtime.world);
    if (runtime.frame % 6 === 0) {
      send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
    }
  } catch (error) { fail(error); }
}

workerScope.onmessage = (event: MessageEvent<HostToRuntimeMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      runtime = new SimulationRuntime(message.width, message.height);
      renderer = new CanvasRenderer(message.canvas);
      renderer.resize(message.width, message.height);
      timer = setInterval(tick, 1000 / 60);
      send({ type: 'ready' });
    } else if (message.type === 'run') {
      runtime.load(message.code, message.params);
      playing = true;
      renderer?.render(runtime.world);
      reportLoaded();
    } else if (message.type === 'restart') restart();
    else if (message.type === 'play') {
      playing = message.playing;
      send({ type: 'status', playing });
    } else if (message.type === 'speed') {
      playbackRate = Math.max(0.25, Math.min(4, message.rate));
    } else if (message.type === 'seek') {
      playing = false;
      runtime.seek(message.seconds);
      renderer?.render(runtime.world);
      send({ type: 'status', playing: false });
      send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
    } else if (message.type === 'step') {
      playing = false;
      runtime.step();
      renderer?.render(runtime.world);
      send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
    } else if (message.type === 'params') runtime.updateParameters(message.params);
    else if (message.type === 'resize') {
      runtime.resize(message.width, message.height);
      renderer?.resize(message.width, message.height);
      renderer?.render(runtime.world);
    }
  } catch (error) { fail(error); }
};

workerScope.addEventListener('close', () => { if (timer) clearInterval(timer); });
