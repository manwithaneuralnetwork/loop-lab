import { CanvasRenderer } from './engine/canvas-renderer';
import { SimulationRuntime } from './engine/simulation';
import type { ProjectState } from './project-store';

function projectSources(project: ProjectState): Record<string, string> {
  return Object.fromEntries(project.files.filter((file) => file.kind === 'code').map((file) => [file.path, file.content]));
}

function projectAssets(project: ProjectState): Record<string, string> {
  return Object.fromEntries(project.files.filter((file) => file.kind === 'asset').map((file) => [file.path, file.content]));
}

export class ProjectCardPreview {
  private runtime: SimulationRuntime | null = null;
  private renderer: CanvasRenderer | null = null;
  private animationFrame = 0;
  private framesRemaining = 0;

  constructor(private readonly host: HTMLElement, private readonly project: ProjectState) {
    const canvas = document.createElement('canvas'); canvas.className = 'project-preview-canvas';
    this.host.prepend(canvas);
    if (!('transferControlToOffscreen' in canvas)) { this.host.classList.add('preview-unavailable'); return; }
    try {
      this.runtime = new SimulationRuntime(project.worldWidth, project.worldHeight);
      const sources = projectSources(project); const assets = projectAssets(project);
      const entry = sources['simulation.js'] ? 'simulation.js' : Object.keys(sources)[0];
      if (!entry) throw new Error('No simulation entry file.');
      const botEntry = project.botMode && sources['bot.js'] ? 'bot.js' : null;
      this.runtime.loadProject(sources, entry, project.parameterValues, assets, botEntry);
      this.renderer = new CanvasRenderer(canvas.transferControlToOffscreen()); this.renderer.resize(440, 280);
      for (let frame = 0; frame < 72 && !this.runtime.world.finished; frame += 1) this.runtime.step();
      this.renderer.render(this.runtime.world); this.host.dataset.preview = 'ready';
      this.host.addEventListener('pointerenter', this.play);
      this.host.addEventListener('pointerleave', this.pause);
      this.host.addEventListener('focusin', this.play);
      this.host.addEventListener('focusout', this.pause);
    } catch {
      canvas.remove(); this.host.classList.add('preview-unavailable');
    }
  }

  destroy(): void {
    this.pause(); this.host.removeEventListener('pointerenter', this.play); this.host.removeEventListener('pointerleave', this.pause);
    this.host.removeEventListener('focusin', this.play); this.host.removeEventListener('focusout', this.pause);
  }

  private readonly play = (): void => {
    if (!this.runtime || !this.renderer) return;
    if (this.runtime.world.finished) this.runtime.restart();
    this.framesRemaining = 180; this.host.dataset.preview = 'playing';
    if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.tick);
  };

  private readonly pause = (): void => {
    this.framesRemaining = 0; this.host.dataset.preview = 'ready';
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame); this.animationFrame = 0;
  };

  private readonly tick = (): void => {
    this.animationFrame = 0;
    if (!this.runtime || !this.renderer || this.framesRemaining <= 0) { this.host.dataset.preview = 'ready'; return; }
    this.runtime.step(); this.renderer.render(this.runtime.world); this.framesRemaining -= 1;
    if (!this.runtime.world.finished && this.framesRemaining > 0) this.animationFrame = requestAnimationFrame(this.tick);
    else this.host.dataset.preview = 'ready';
  };
}
