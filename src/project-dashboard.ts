import { activateProject, duplicateProject, listProjects, storeProject, type ProjectState } from './project-store';
import { PROJECT_TEMPLATES, type ProjectTemplate } from './project-templates';

interface DashboardOptions { onNotice(message: string): void }

export class ProjectDashboard {
  private readonly root = document.createElement('section');
  private projects: ProjectState[] = [];

  constructor(private readonly active: ProjectState, private readonly options: DashboardOptions) {
    this.root.className = 'project-dashboard'; this.root.hidden = true;
    this.root.innerHTML = `
      <header><div class="dashboard-brand"><span class="brand-mark"><i></i><i></i></span><strong>LOOP LAB</strong><b>/</b><span>Projects</span></div><div><button class="dashboard-close">Back to workspace</button><button class="primary dashboard-new">＋ New project</button></div></header>
      <main><div class="dashboard-intro"><div><span>YOUR WORKSPACE</span><h1>Projects</h1><p>Start small, iterate quickly, and keep every experiment in one place.</p></div></div>
      <section><div class="dashboard-section-title"><h2>Recent projects</h2><span class="project-count"></span></div><div class="project-grid recent-projects"></div></section>
      <section><div class="dashboard-section-title"><h2>Start from a template</h2><span>Three focused starting points</span></div><div class="project-grid template-projects"></div></section></main>`;
    document.body.append(this.root);
    this.root.querySelector('.dashboard-close')?.addEventListener('click', () => this.close());
    this.root.querySelector('.dashboard-new')?.addEventListener('click', () => this.showCreateDialog(PROJECT_TEMPLATES[0]));
    this.renderTemplates();
  }

  async open(): Promise<void> { this.projects = await listProjects(); this.renderProjects(); this.root.hidden = false; }
  close(): void { this.root.hidden = true; }

  private renderProjects(): void {
    const grid = this.root.querySelector<HTMLElement>('.recent-projects')!; grid.innerHTML = '';
    this.root.querySelector<HTMLElement>('.project-count')!.textContent = `${this.projects.length} project${this.projects.length === 1 ? '' : 's'}`;
    for (const project of this.projects) {
      const card = document.createElement('article'); card.className = `project-card ${project.id === this.active.id ? 'active-project' : ''}`;
      const updated = new Date(project.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      card.innerHTML = `<div class="project-card-preview"><i></i><i></i><span>${project.worldWidth} × ${project.worldHeight}</span></div><div class="project-card-copy"><div><h3></h3>${project.id === this.active.id ? '<b>OPEN</b>' : ''}</div><p>${project.files.length} files · Updated ${updated}</p><footer><button class="open-project">${project.id === this.active.id ? 'Return to project' : 'Open project'}</button><button class="duplicate-project" title="Duplicate project">Duplicate</button></footer></div>`;
      card.querySelector('h3')!.textContent = project.name;
      card.querySelector('.open-project')?.addEventListener('click', () => void this.openProject(project.id));
      card.querySelector('.duplicate-project')?.addEventListener('click', () => void this.duplicate(project));
      grid.append(card);
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

  private async openProject(id: string): Promise<void> { if (id === this.active.id) { this.close(); return; } await activateProject(id); window.location.reload(); }
  private async duplicate(project: ProjectState): Promise<void> {
    const copy = await duplicateProject(project); this.projects = await listProjects(); this.renderProjects(); this.options.onNotice(`Duplicated ${project.name} as ${copy.name}.`);
  }

  private showCreateDialog(template: ProjectTemplate): void {
    const dialog = document.createElement('dialog'); dialog.className = 'file-dialog new-project-dialog';
    dialog.innerHTML = `<form method="dialog"><span>NEW PROJECT</span><h3>Create from ${template.name}</h3><p>${template.description}</p><label>Project name<input name="name" maxlength="64" value="Untitled Project" autocomplete="off"></label><footer><button value="cancel">Cancel</button><button value="create" class="primary">Create project</button></footer></form>`;
    document.body.append(dialog); const input = dialog.querySelector<HTMLInputElement>('input')!;
    dialog.addEventListener('close', () => { if (dialog.returnValue === 'create') void this.create(template, input.value); dialog.remove(); });
    dialog.showModal(); input.select();
  }

  private async create(template: ProjectTemplate, name: string): Promise<void> {
    const project = template.create(name.trim() || 'Untitled Project'); await storeProject(project, true); window.location.reload();
  }
}
