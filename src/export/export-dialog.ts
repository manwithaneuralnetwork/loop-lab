import { isParameterDefinition } from '../engine/parameters';
import type { ParameterDefinition, ParameterSchema, ParameterValue, ParameterValues } from '../engine/protocol';
import { buildExportPlan, coerceParameterValue, randomizeParameters, type ExportPlan } from './export-options';
import type { ExportWorkerResponse } from './export-protocol';
import type { ExportHistoryEntry } from '../project-store';
import { AudioEngine } from '../audio-engine';

export interface ExportSource {
  code: string;
  files: Record<string, string>;
  assets: Record<string, string>;
  entry: string;
  schema: ParameterSchema;
  params: ParameterValues;
  worldWidth: number;
  worldHeight: number;
  history: ExportHistoryEntry[];
}

type SourceProvider = () => ExportSource;

function displayName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function preferredMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ].find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export class ExportDialog {
  private readonly backdrop: HTMLDivElement;
  private readonly parameters: HTMLDivElement;
  private readonly summary: HTMLParagraphElement;
  private readonly status: HTMLParagraphElement;
  private readonly progress: HTMLDivElement;
  private readonly randomButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly resolutionSelect: HTMLSelectElement;
  private readonly fpsSelect: HTMLSelectElement;
  private readonly maxDurationInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly history: HTMLDivElement;
  private source: ExportSource | null = null;
  private values: ParameterValues = {};
  private worker: Worker | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private cancelled = false;
  private rendering = false;
  private nextFrameTimer: number | null = null;
  private renderStartedAt = 0;
  private exportAudio: AudioEngine | null = null;

  constructor(
    openButton: HTMLButtonElement,
    private readonly getSource: SourceProvider,
    private readonly onComplete: (entry: ExportHistoryEntry) => void = () => undefined
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'export-backdrop';
    this.backdrop.hidden = true;
    this.backdrop.innerHTML = `
      <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="exportTitle">
        <header>
          <div><span class="export-kicker">LOCAL RENDER</span><h2 id="exportTitle">Export video</h2></div>
          <button class="export-close" type="button" aria-label="Close export dialog">×</button>
        </header>
        <div class="export-format">
          <div class="export-format-icon">▶</div>
          <div><strong>WebM video</strong><p class="export-summary"></p></div>
          <span>LOCAL</span>
        </div>
        <div class="export-settings">
          <label>Name<input class="export-name" value="loop-lab-render"></label>
          <label>Resolution<select class="export-resolution"><option value="720">720p max</option><option value="1080">1080p max</option><option value="original">Original</option></select></label>
          <label>Frame rate<select class="export-fps"><option value="24">24 fps</option><option value="30" selected>30 fps</option><option value="60">60 fps</option></select></label>
          <label>Max length<input class="export-duration" type="number" min="1" max="300" step="1" value="10"></label>
        </div>
        <div class="export-parameter-header"><strong>Render parameters</strong><span>Snapshot only — your workspace stays unchanged</span></div>
        <div class="export-parameters"></div>
        <div class="export-history"></div>
        <div class="export-progress" hidden><i></i></div>
        <p class="export-status" aria-live="polite"></p>
        <footer>
          <button class="export-random secondary" type="button"><span>✦</span> Randomize</button>
          <div></div>
          <button class="export-cancel secondary" type="button">Cancel</button>
          <button class="export-start primary" type="button"><span>▶</span> Export WebM</button>
        </footer>
      </section>`;
    document.body.append(this.backdrop);

    this.parameters = this.backdrop.querySelector('.export-parameters') as HTMLDivElement;
    this.summary = this.backdrop.querySelector('.export-summary') as HTMLParagraphElement;
    this.status = this.backdrop.querySelector('.export-status') as HTMLParagraphElement;
    this.progress = this.backdrop.querySelector('.export-progress') as HTMLDivElement;
    this.randomButton = this.backdrop.querySelector('.export-random') as HTMLButtonElement;
    this.cancelButton = this.backdrop.querySelector('.export-cancel') as HTMLButtonElement;
    this.exportButton = this.backdrop.querySelector('.export-start') as HTMLButtonElement;
    this.closeButton = this.backdrop.querySelector('.export-close') as HTMLButtonElement;
    this.resolutionSelect = this.backdrop.querySelector('.export-resolution') as HTMLSelectElement;
    this.fpsSelect = this.backdrop.querySelector('.export-fps') as HTMLSelectElement;
    this.maxDurationInput = this.backdrop.querySelector('.export-duration') as HTMLInputElement;
    this.nameInput = this.backdrop.querySelector('.export-name') as HTMLInputElement;
    this.history = this.backdrop.querySelector('.export-history') as HTMLDivElement;

    openButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.cancelButton.addEventListener('click', () => this.rendering ? this.cancelRender() : this.close());
    this.randomButton.addEventListener('click', () => this.randomize());
    this.exportButton.addEventListener('click', () => void this.startExport());
    this.resolutionSelect.addEventListener('change', () => this.updateSummary());
    this.fpsSelect.addEventListener('change', () => this.updateSummary());
    this.maxDurationInput.addEventListener('input', () => this.updateSummary());
    this.backdrop.addEventListener('click', (event) => {
      if (event.target === this.backdrop && !this.rendering) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.backdrop.hidden && !this.rendering) this.close();
    });
  }

  private open(): void {
    this.source = this.getSource();
    this.values = { ...this.source.params };
    this.maxDurationInput.value = '10';
    this.nameInput.value = `loop-lab-${new Date().toISOString().slice(0, 10)}`;
    this.renderParameters();
    this.renderHistory();
    this.updateSummary();
    this.setStatus('Ready to render on this device.');
    this.progress.hidden = true;
    this.progress.querySelector('i')?.setAttribute('style', 'width: 0%');
    this.exportButton.innerHTML = '<span>▶</span> Export WebM';
    this.backdrop.hidden = false;
    document.body.classList.add('export-open');
    this.closeButton.focus();
  }

  private close(): void {
    if (this.rendering) return;
    this.backdrop.hidden = true;
    document.body.classList.remove('export-open');
  }

  private plan(): ExportPlan {
    if (!this.source) throw new Error('No export source is available.');
    const maxSide = this.resolutionSelect.value === 'original'
      ? Math.max(this.source.worldWidth, this.source.worldHeight)
      : Number(this.resolutionSelect.value);
    return buildExportPlan(this.source.worldWidth, this.source.worldHeight, maxSide, Number(this.fpsSelect.value), Number(this.maxDurationInput.value));
  }

  private renderHistory(): void {
    if (!this.source?.history.length) { this.history.innerHTML = ''; return; }
    this.history.innerHTML = '<h3>RECENT EXPORTS</h3>';
    this.source.history.slice(0, 3).forEach((entry) => {
      const row = document.createElement('p');
      row.innerHTML = `<strong>${entry.name}</strong><span>${entry.width}×${entry.height} · ${entry.fps} fps · ${formatFileSize(entry.bytes)}</span>`;
      this.history.append(row);
    });
  }

  private updateSummary(): void {
    const plan = this.plan();
    const audio = this.source && Object.values(this.source.assets).some((asset) => asset.startsWith('data:audio/')) ? '  ·  audio' : '';
    this.summary.textContent = `${plan.width} × ${plan.height}  ·  ${plan.fps} fps  ·  up to ${plan.duration.toFixed(2).replace(/\.00$/, '')} sec${audio}`;
  }

  private renderParameters(): void {
    if (!this.source) return;
    this.parameters.innerHTML = '';
    const groups = new Map<string, Array<[string, ParameterDefinition | ParameterValue]>>();
    Object.entries(this.source.schema).forEach(([key, definition]) => {
      const group = isParameterDefinition(definition) ? definition.group || 'Parameters' : 'Parameters';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)?.push([key, definition]);
    });
    groups.forEach((items, group) => {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = group.toUpperCase();
      section.append(heading);
      items.forEach(([key, rawDefinition]) => {
        const definition = isParameterDefinition(rawDefinition) ? rawDefinition : { value: rawDefinition };
        const label = document.createElement('label');
        const name = document.createElement('span');
        name.textContent = displayName(key);
        label.append(name);
        if (typeof definition.value === 'boolean') {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = `export-toggle ${this.values[key] ? 'active' : ''}`;
          toggle.setAttribute('role', 'switch');
          toggle.setAttribute('aria-checked', String(Boolean(this.values[key])));
          toggle.innerHTML = '<i></i>';
          toggle.addEventListener('click', () => {
            this.values[key] = !this.values[key];
            toggle.classList.toggle('active', Boolean(this.values[key]));
            toggle.setAttribute('aria-checked', String(Boolean(this.values[key])));
          });
          label.append(toggle);
        } else {
          const input = document.createElement('input');
          input.type = definition.type === 'color' ? 'color' : typeof definition.value === 'number' ? 'number' : 'text';
          input.value = String(this.values[key] ?? definition.value);
          if (definition.min != null) input.min = String(definition.min);
          if (definition.max != null) input.max = String(definition.max);
          if (definition.step != null) input.step = String(definition.step);
          input.addEventListener('input', () => {
            this.values[key] = coerceParameterValue(definition, input.value);
          });
          label.append(input);
        }
        section.append(label);
      });
      this.parameters.append(section);
    });
  }

  private randomize(): void {
    if (!this.source || this.rendering) return;
    this.values = randomizeParameters(this.source.schema, this.values);
    this.renderParameters();
    this.updateSummary();
    this.setStatus('Randomized creative parameters. Duration was kept unchanged.');
  }

  private setStatus(message: string, error = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('error', error);
  }

  private setRendering(rendering: boolean): void {
    this.rendering = rendering;
    this.randomButton.disabled = rendering;
    this.exportButton.disabled = rendering;
    this.closeButton.disabled = rendering;
    this.cancelButton.textContent = rendering ? 'Cancel render' : 'Close';
    this.exportButton.innerHTML = rendering ? '<span class="export-spinner"></span> Rendering…' : '<span>▶</span> Export again';
  }

  private async startExport(): Promise<void> {
    if (!this.source || this.rendering) return;
    const mimeType = preferredMimeType();
    if (!mimeType || !HTMLCanvasElement.prototype.captureStream) {
      this.setStatus('This browser cannot create local WebM exports.', true);
      return;
    }

    const plan = this.plan();
    this.cancelled = false;
    this.setRendering(true);
    this.progress.hidden = false;
    this.progress.querySelector('i')?.setAttribute('style', 'width: 0%');
    this.setStatus('Preparing local renderer…');
    this.renderStartedAt = performance.now();

    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'export-capture-canvas';
      canvas.width = plan.width;
      canvas.height = plan.height;
      document.body.append(canvas);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D is unavailable.');
      this.captureCanvas = canvas;

      let renderedFrames = 0;
      let conditionFinished = false;

      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const audioSources = Object.values(this.source.assets).filter((asset) => asset.startsWith('data:audio/'));
      if (audioSources.length) {
        this.setStatus('Decoding project audio…');
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();
        this.exportAudio = new AudioEngine(audioContext, audioDestination);
        this.exportAudio.setVolume(0.8);
        await this.exportAudio.resume();
        await this.exportAudio.preload(audioSources);
        audioDestination.stream.getAudioTracks().forEach((audioTrack) => stream.addTrack(audioTrack));
      }
      this.stream = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
      this.recorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => this.finishWithError('The browser video encoder stopped unexpectedly.');
      recorder.onstop = () => {
        if (this.cancelled) { this.cleanupJob(); return; }
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) { this.finishWithError('The encoded video was empty.'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const cleanName = this.nameInput.value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || `loop-lab-${timestamp}`;
        link.href = url;
        link.download = `${cleanName}.webm`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.setRendering(false);
        this.progress.querySelector('i')?.setAttribute('style', 'width: 100%');
        const actualDuration = renderedFrames / plan.fps;
        this.setStatus(`Export complete — ${actualDuration.toFixed(2)}s · ${formatFileSize(blob.size)} saved.`);
        const entry: ExportHistoryEntry = {
          id: crypto.randomUUID(), name: `${cleanName}.webm`, createdAt: new Date().toISOString(), bytes: blob.size,
          width: plan.width, height: plan.height, fps: plan.fps, duration: actualDuration
        };
        this.onComplete(entry);
        this.renderHistory();
        this.cleanupJob();
      };
      recorder.start();

      const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onerror = (event) => this.finishWithError(event.message || 'The export worker stopped unexpectedly.');
      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const message = event.data;
        if (message.type === 'frame') {
          renderedFrames = message.frame;
          message.audio.forEach((command) => void this.exportAudio?.play(command));
          context.clearRect(0, 0, plan.width, plan.height);
          context.drawImage(message.bitmap, 0, 0, plan.width, plan.height);
          message.bitmap.close();
          track.requestFrame();
          const percent = (message.frame / message.totalFrames) * 100;
          this.progress.querySelector('i')?.setAttribute('style', `width: ${percent}%`);
          const elapsed = (performance.now() - this.renderStartedAt) / 1000;
          const remaining = message.frame > 0 ? Math.max(0, (elapsed / message.frame) * (message.totalFrames - message.frame)) : 0;
          this.setStatus(`Rendering frame ${message.frame.toLocaleString()} of ${message.totalFrames.toLocaleString()} · about ${Math.ceil(remaining)}s left`);
          this.nextFrameTimer = window.setTimeout(() => worker.postMessage({ type: 'next' }), 1000 / plan.fps);
        } else if (message.type === 'complete') {
          renderedFrames = message.frames;
          conditionFinished = message.finished;
          this.setStatus(conditionFinished ? 'Simulation finished — finalizing WebM file…' : 'Maximum length reached — finalizing WebM file…');
          window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 100);
        } else if (message.type === 'error') this.finishWithError(message.message);
      };
      worker.postMessage({
        type: 'start',
        code: this.source.code,
        files: this.source.files,
        assets: this.source.assets,
        entry: this.source.entry,
        params: this.values,
        worldWidth: this.source.worldWidth,
        worldHeight: this.source.worldHeight,
        outputWidth: plan.width,
        outputHeight: plan.height,
        fps: plan.fps,
        totalFrames: plan.totalFrames
      });
    } catch (error) {
      this.finishWithError(error instanceof Error ? error.message : String(error));
    }
  }

  private cancelRender(): void {
    if (!this.rendering) return;
    this.cancelled = true;
    this.worker?.terminate();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.setRendering(false);
    this.progress.hidden = true;
    this.setStatus('Render cancelled.');
    this.cleanupJob();
  }

  private finishWithError(message: string): void {
    this.cancelled = true;
    this.worker?.terminate();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.setRendering(false);
    this.setStatus(message, true);
    this.cleanupJob();
  }

  private cleanupJob(): void {
    if (this.nextFrameTimer != null) window.clearTimeout(this.nextFrameTimer);
    this.nextFrameTimer = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.captureCanvas?.remove();
    this.captureCanvas = null;
    this.exportAudio?.dispose();
    this.exportAudio = null;
  }
}
