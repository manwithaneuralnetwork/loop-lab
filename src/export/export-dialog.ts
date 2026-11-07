import { isParameterDefinition } from '../engine/parameters';
import type { ParameterDefinition, ParameterSchema, ParameterValue, ParameterValues } from '../engine/protocol';
import { buildExportPlan, coerceParameterValue, randomizeParameters, type ExportPlan } from './export-options';
import type { ExportWorkerResponse } from './export-protocol';

export interface ExportSource {
  code: string;
  schema: ParameterSchema;
  params: ParameterValues;
  worldWidth: number;
  worldHeight: number;
}

type SourceProvider = () => ExportSource;

function displayName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function preferredMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return [
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
  private source: ExportSource | null = null;
  private values: ParameterValues = {};
  private worker: Worker | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private cancelled = false;
  private rendering = false;

  constructor(openButton: HTMLButtonElement, private readonly getSource: SourceProvider) {
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
        <div class="export-parameter-header"><strong>Render parameters</strong><span>Snapshot only — your workspace stays unchanged</span></div>
        <div class="export-parameters"></div>
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

    openButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.cancelButton.addEventListener('click', () => this.rendering ? this.cancelRender() : this.close());
    this.randomButton.addEventListener('click', () => this.randomize());
    this.exportButton.addEventListener('click', () => void this.startExport());
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
    if (this.values.duration == null) this.values.duration = 10;
    this.renderParameters();
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
    return buildExportPlan(this.source.worldWidth, this.source.worldHeight, this.values);
  }

  private updateSummary(): void {
    const plan = this.plan();
    this.summary.textContent = `${plan.width} × ${plan.height}  ·  ${plan.fps} fps  ·  ${plan.duration.toFixed(2).replace(/\.00$/, '')} sec`;
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
    if (!('duration' in this.source.schema)) {
      groups.set('Video', [['duration', { value: 10, min: 0.25, max: 300, step: 0.25, group: 'Video' }]]);
    }

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
            if (key === 'duration') this.updateSummary();
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

    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'export-capture-canvas';
      canvas.width = plan.width;
      canvas.height = plan.height;
      document.body.append(canvas);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D is unavailable.');
      this.captureCanvas = canvas;

      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
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
        link.href = url;
        link.download = `loop-lab-${timestamp}.webm`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.setRendering(false);
        this.progress.querySelector('i')?.setAttribute('style', 'width: 100%');
        this.setStatus(`Export complete — ${formatFileSize(blob.size)} saved.`);
        this.cleanupJob();
      };
      recorder.start();

      const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onerror = (event) => this.finishWithError(event.message || 'The export worker stopped unexpectedly.');
      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const message = event.data;
        if (message.type === 'frame') {
          context.clearRect(0, 0, plan.width, plan.height);
          context.drawImage(message.bitmap, 0, 0, plan.width, plan.height);
          message.bitmap.close();
          track.requestFrame();
          const percent = (message.frame / message.totalFrames) * 100;
          this.progress.querySelector('i')?.setAttribute('style', `width: ${percent}%`);
          this.setStatus(`Rendering frame ${message.frame.toLocaleString()} of ${message.totalFrames.toLocaleString()}…`);
          window.setTimeout(() => worker.postMessage({ type: 'next' }), 1000 / plan.fps);
        } else if (message.type === 'complete') {
          this.setStatus('Finalizing WebM file…');
          window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 100);
        } else if (message.type === 'error') this.finishWithError(message.message);
      };
      worker.postMessage({
        type: 'start',
        code: this.source.code,
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
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.captureCanvas?.remove();
    this.captureCanvas = null;
  }
}
