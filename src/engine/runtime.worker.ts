/// <reference lib="webworker" />
import { CanvasRenderer } from './canvas-renderer';
import type { HostToRuntimeMessage, RuntimeToHostMessage } from './protocol';
import { SimulationRuntime } from './simulation';
import { DEFAULT_WORLD_LIMITS } from './world';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtime = new SimulationRuntime(1080, 1080);
let renderer: CanvasRenderer | null = null;
let playing = true;
let playbackRate = 1;
let stepAccumulator = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let profileStartedAt = performance.now();
let profileFrames = 0;
let updateTotal = 0;
let renderTotal = 0;
let longFrames = 0;
let lastWarningAt = 0;

function send(message: RuntimeToHostMessage): void { workerScope.postMessage(message); }
function flushAudio(): void {
  runtime.world.drainAudio().forEach((command) => send({ type: 'audio', command }));
}
function fail(error: unknown): void {
  playing = false;
  const value = error instanceof Error ? error : new Error(String(error));
  const projectLocation = value.stack?.match(/loop:\/\/\/([^:\n]+):(\d+):(\d+)/);
  const sourceLocation = projectLocation || value.stack?.match(/<anonymous>:(\d+):(\d+)/);
  send({
    type: 'error', message: value.message, stack: value.stack,
    file: projectLocation?.[1],
    line: sourceLocation ? Math.max(1, Number(sourceLocation[projectLocation ? 2 : 1]) - 3) : undefined,
    column: sourceLocation ? Number(sourceLocation[projectLocation ? 3 : 2]) : undefined
  });
  send({ type: 'status', playing: false });
}

function reportLoaded(): void {
  send({ type: 'parameters', schema: runtime.schema, params: runtime.params });
  send({ type: 'log', level: 'ok', message: `Simulation initialized with seed ${runtime.params.seed ?? 1}` });
  send({ type: 'log', level: 'info', message: `Created ${runtime.world.objects.length} objects` });
  flushAudio();
}

function restart(): void {
  runtime.restart();
  playing = true;
  resetProfile();
  renderer?.render(runtime.world);
  reportLoaded();
  send({ type: 'status', playing: true });
  send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
}

function resetProfile(): void {
  profileStartedAt = performance.now(); profileFrames = 0; updateTotal = 0; renderTotal = 0; longFrames = 0;
}

function reportProfile(now: number): void {
  const elapsed = now - profileStartedAt; if (elapsed < 1000 || profileFrames === 0) return;
  const updateMs = updateTotal / profileFrames; const renderMs = renderTotal / profileFrames;
  const profile = {
    fps: (profileFrames * 1000) / elapsed, updateMs, renderMs, frameMs: updateMs + renderMs,
    objects: runtime.world.objects.length, maxObjects: DEFAULT_WORLD_LIMITS.maxObjects, longFrames
  };
  send({ type: 'profile', profile });
  if ((profile.frameMs > 16.7 || profile.objects > profile.maxObjects * 0.8) && now - lastWarningAt > 5000) {
    const message = profile.objects > profile.maxObjects * 0.8
      ? `Resource warning: ${profile.objects.toLocaleString()} of ${profile.maxObjects.toLocaleString()} objects in use.`
      : `Performance warning: simulation work averages ${profile.frameMs.toFixed(1)} ms per frame.`;
    send({ type: 'log', level: 'warning', message }); lastWarningAt = now;
  }
  resetProfile();
}

function tick(): void {
  if (!playing) return;
  try {
    const frameStartedAt = performance.now();
    stepAccumulator += playbackRate;
    while (stepAccumulator >= 1) {
      runtime.step();
      flushAudio();
      stepAccumulator -= 1;
    }
    const updateFinishedAt = performance.now();
    if (runtime.world.finished) {
      playing = false;
      send({ type: 'finished', reason: runtime.world.finishReason, elapsed: runtime.elapsed, frame: runtime.frame });
      send({ type: 'status', playing });
    }
    renderer?.render(runtime.world);
    const renderFinishedAt = performance.now();
    const frameMs = renderFinishedAt - frameStartedAt;
    profileFrames += 1; updateTotal += updateFinishedAt - frameStartedAt; renderTotal += renderFinishedAt - updateFinishedAt;
    if (frameMs > 16.7) longFrames += 1;
    reportProfile(renderFinishedAt);
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
      if (message.files) runtime.loadProject(message.files, message.entry || 'simulation.js', message.params, message.assets);
      else runtime.load(message.code, message.params);
      playing = true;
      resetProfile();
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
      runtime.world.drainAudio();
      renderer?.render(runtime.world);
      send({ type: 'status', playing: false });
      send({ type: 'time', elapsed: runtime.elapsed, frame: runtime.frame, objectCount: runtime.world.objects.length });
    } else if (message.type === 'input') {
      runtime.world.updateInput(message.pointer, message.key, message.pressed);
    } else if (message.type === 'step') {
      playing = false;
      runtime.step();
      flushAudio();
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
