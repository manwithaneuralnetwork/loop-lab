import { activateProject, duplicateProject, listProjects, saveProject, storeProject, type ProjectState } from './project-store';
import { PROJECT_TEMPLATES, STARTER_PROJECTS, type ProjectTemplate } from './project-templates';
import { ProjectCardPreview } from './project-card-preview';
import { SimulationRuntime } from './engine/simulation';
import { ExportDialog, type ExportSource } from './export/export-dialog';

interface DashboardOptions {
  onNotice(message: string): void; onNavigate(): void; onOpen(): void; onClose(): void;
  onProjectUpdated(project: ProjectState): void;
}

function exportSource(project: ProjectState): ExportSource {
  const files = Object.fromEntries(project.files.filter((file) => file.kind === 'code').map((file) => [file.path, file.content]));
  const assets = Object.fromEntries(project.files.filter((file) => file.kind === 'asset').map((file) => [file.path, file.content]));
  const entry = files['simulation.js'] ? 'simulation.js' : Object.keys(files)[0];
  if (!entry) throw new Error('This project has no simulation entry file.');
  const runtime = new SimulationRuntime(project.worldWidth, project.worldHeight);
  runtime.loadProject(files, entry, project.parameterValues, assets, project.botMode && files['bot.js'] ? 'bot.js' : null);
  return { code: files[entry], files, assets, entry, schema: runtime.schema, params: runtime.params,
    worldWidth: project.worldWidth, worldHeight: project.worldHeight, history: project.exportHistory };
}

export class ProjectDashboard {
  private readonly root = document.createElement('section');
  private readonly exportTrigger = document.createElement('button');
  private projects: ProjectState[] = [];
  private previews: ProjectCardPreview[] = [];
  private exportProject: ProjectState;

  constructor(private readonly active: ProjectState, private readonly options: DashboardOptions) {
    this.exportProject = active;
    this.root.className = 'project-dashboard'; this.root.hidden = true;
    this.root.innerHTML = `
      <header><div class="dashboard-brand"><span class="brand-mark"><i></i><i></i></span><strong>LOOP LAB</strong><b>/</b><span>Projects</span></div><div><button class="dashboard-close">Back to workspace</button><button class="primary dashboard-new">＋ New project</button></div></header>
      <main><div class="dashboard-intro"><div><span>YOUR WORKSPACE</span><h1>Projects</h1><p>Start small, iterate quickly, and keep every experiment in one place.</p></div></div>
      <section><div class="dashboard-section-title"><h2>Recent projects</h2><span class="project-count"></span></div><div class="project-grid recent-projects"></div></section>
      <section><div class="dashboard-section-title"><h2>Start from a template</h2><span>Three focused starting points</span></div><div class="project-grid template-projects"></div></section>
      <section><div class="dashboard-section-title"><h2>Starter projects</h2><span>Complete examples ready to remix</span></div><div class="starter-projects"></div></section></main>`;
    document.body.append(this.root);
    new ExportDialog(this.exportTrigger, () => exportSource(this.exportProject), (entry) => {
      this.exportProject.exportHistory.unshift(entry); this.exportProject.exportHistory = this.exportProject.exportHistory.slice(0, 12);
      void saveProject(this.exportProject, false);
    });
    this.root.querySelector('.dashboard-close')?.addEventListener('click', () => this.close());
    this.root.querySelector('.dashboard-new')?.addEventListener('click', () => this.showCreateDialog(PROJECT_TEMPLATES[0]));
    this.renderTemplates();
    this.renderStarters();
  }

  async open(): Promise<void> { this.options.onOpen(); this.projects = await listProjects(); this.renderProjects(); this.root.hidden = false; }
  close(): void { this.previews.forEach((preview) => preview.destroy()); this.previews = []; this.root.hidden = true; this.options.onClose(); }

  private renderProjects(): void {
    this.previews.forEach((preview) => preview.destroy()); this.previews = [];
    const grid = this.root.querySelector<HTMLElement>('.recent-projects')!; grid.innerHTML = '';
    this.root.querySelector<HTMLElement>('.project-count')!.textContent = `${this.projects.length} project${this.projects.length === 1 ? '' : 's'}`;
    for (const project of this.projects) {
      const card = document.createElement('article'); card.className = `project-card ${project.id === this.active.id ? 'active-project' : ''}`;
      const updated = new Date(project.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      card.innerHTML = `<div class="project-card-preview"><div class="preview-grid"></div><span class="preview-status"><i></i> HOVER TO PREVIEW</span><b>${project.worldWidth} × ${project.worldHeight}</b></div><div class="project-card-copy"><div><h3></h3>${project.id === this.active.id ? '<b>OPEN</b>' : ''}</div><p>${project.files.length} files · Updated ${updated}</p><footer><button class="open-project">${project.id === this.active.id ? 'Return to project' : 'Open project'}</button><button class="export-project"><span>▶</span> Export</button><button class="settings-project" aria-label="Open project settings" title="Project settings">⚙</button></footer><button class="duplicate-project">Duplicate project</button></div>`;
      card.querySelector('h3')!.textContent = project.name;
      card.querySelector('.open-project')?.addEventListener('click', () => void this.openProject(project.id));
      card.querySelector('.duplicate-project')?.addEventListener('click', () => void this.duplicate(project));
      card.querySelector('.settings-project')?.addEventListener('click', () => this.showSettings(project));
      const exportButton = card.querySelector<HTMLButtonElement>('.export-project')!;
      exportButton.addEventListener('click', () => { this.exportProject = project; this.exportTrigger.click(); });
      grid.append(card);
      this.previews.push(new ProjectCardPreview(card.querySelector<HTMLElement>('.project-card-preview')!, project));
    }
  }

  private renderTemplates(): void {
    const grid = this.root.querySelector<HTMLElement>('.template-projects')!;
    for (const template of PROJECT_TEMPLATES) {
      const card = document.createElement('button'); card.className = 'template-card'; card.style.setProperty('--template-accent', template.accent);
      card.innerHTML = `<span class="template-icon">＋</span><div><h3></h3><p></p></div><span class="template-arrow">→</span>`;
      card.querySelector('h3')!.textContent = template.name; card.querySelector('p')!.textContent = template.description;
      card.addEventListener('click', () => this.showCreateDialog(template)); grid.append(card);
    }
  }

  private renderStarters(): void {
    const grid = this.root.querySelector<HTMLElement>('.starter-projects')!;
    for (const starter of STARTER_PROJECTS) {
      const card = document.createElement('article'); card.className = 'starter-card'; card.style.setProperty('--starter-accent', starter.accent);
      card.innerHTML = `<div class="starter-mark"><span>COMPLETE PROJECT</span><i>◆</i></div><div class="starter-copy"><h3></h3><p></p><div class="starter-tags"></div></div><button type="button">Use starter <span>→</span></button>`;
      card.querySelector('h3')!.textContent = starter.name; card.querySelector('p')!.textContent = starter.description;
      const tags = card.querySelector<HTMLElement>('.starter-tags')!;
      starter.tags.forEach((tag) => { const item = document.createElement('span'); item.textContent = tag; tags.append(item); });
      card.querySelector('button')?.addEventListener('click', () => this.showCreateDialog(starter, `${starter.name} Remix`));
      grid.append(card);
    }
  }

  private async openProject(id: string): Promise<void> {
    if (id === this.active.id) { this.close(); return; }
    this.options.onNavigate(); await activateProject(id); window.location.reload();
  }
  private async duplicate(project: ProjectState): Promise<void> {
    const copy = await duplicateProject(project); this.projects = await listProjects(); this.renderProjects(); this.options.onNotice(`Duplicated ${project.name} as ${copy.name}.`);
  }

  private showSettings(project: ProjectState): void {
    const dialog = document.createElement('dialog'); dialog.className = 'file-dialog project-settings-dialog';
    dialog.innerHTML = `<form method="dialog"><span>PROJECT SETTINGS</span><h3></h3><label>Name<input name="name" maxlength="64"></label><div class="settings-dimensions"><label>Width<input name="width" type="number" min="240" max="3840" step="10"></label><label>Height<input name="height" type="number" min="240" max="3840" step="10"></label></div><label class="settings-check"><input name="grid" type="checkbox"> Show viewport grid</label><label class="settings-check"><input name="bot" type="checkbox"> Use bot.js for preview</label><footer><button value="cancel">Cancel</button><button value="save" class="primary">Save settings</button></footer></form>`;
    dialog.querySelector('h3')!.textContent = project.name;
    const name = dialog.querySelector<HTMLInputElement>('[name="name"]')!; name.value = project.name;
    const width = dialog.querySelector<HTMLInputElement>('[name="width"]')!; width.value = String(project.worldWidth);
    const height = dialog.querySelector<HTMLInputElement>('[name="height"]')!; height.value = String(project.worldHeight);
    const grid = dialog.querySelector<HTMLInputElement>('[name="grid"]')!; grid.checked = project.gridVisible;
    const bot = dialog.querySelector<HTMLInputElement>('[name="bot"]')!; bot.checked = project.botMode; bot.disabled = !project.files.some((file) => file.path === 'bot.js');
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'save') void this.saveSettings(project, {
        name: name.value.trim() || project.name,
        width: Math.max(240, Math.min(3840, Number(width.value) || project.worldWidth)),
        height: Math.max(240, Math.min(3840, Number(height.value) || project.worldHeight)),
        grid: grid.checked, bot: bot.checked
      });
      dialog.remove();
    });
    dialog.showModal(); name.select();
  }

  private async saveSettings(project: ProjectState, values: { name: string; width: number; height: number; grid: boolean; bot: boolean }): Promise<void> {
    project.name = values.name; project.worldWidth = values.width; project.worldHeight = values.height;
    project.gridVisible = values.grid; project.botMode = values.bot; await saveProject(project, false);
    if (project.id === this.active.id) { Object.assign(this.active, structuredClone(project)); this.options.onProjectUpdated(this.active); }
    this.projects = await listProjects(); this.renderProjects(); this.options.onNotice(`Updated settings for ${project.name}.`);
  }

  private showCreateDialog(template: ProjectTemplate, suggestedName = 'Untitled Project'): void {
    const dialog = document.createElement('dialog'); dialog.className = 'file-dialog new-project-dialog';
    dialog.innerHTML = `<form method="dialog"><span>NEW PROJECT</span><h3>Create from ${template.name}</h3><p>${template.description}</p><label>Project name<input name="name" maxlength="64" autocomplete="off"></label><footer><button value="cancel">Cancel</button><button value="create" class="primary">Create project</button></footer></form>`;
    document.body.append(dialog); const input = dialog.querySelector<HTMLInputElement>('input')!;
    input.value = suggestedName;
    dialog.addEventListener('close', () => { if (dialog.returnValue === 'create') void this.create(template, input.value); dialog.remove(); });
    dialog.showModal(); input.select();
  }

  private async create(template: ProjectTemplate, name: string): Promise<void> {
    const project = template.create(name.trim() || 'Untitled Project'); this.options.onNavigate(); await storeProject(project, true); window.location.reload();
  }
}
