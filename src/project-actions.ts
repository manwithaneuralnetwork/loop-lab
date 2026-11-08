import { createCheckpoint, listCheckpoints, saveProject, type ProjectCheckpoint, type ProjectState } from './project-store';
import { packageFilename, parseProjectPackage, serializeProjectPackage } from './project-package';
import type { WorkspaceFiles } from './workspace-files';

interface ProjectActionsOptions {
  onNotice(message: string): void;
}

export class ProjectActions {
  private readonly menu: HTMLDivElement;
  private readonly input: HTMLInputElement;

  constructor(
    private readonly project: ProjectState,
    private readonly files: WorkspaceFiles,
    private readonly options: ProjectActionsOptions
  ) {
    const button = document.querySelector('.panel-title div button:last-child') as HTMLButtonElement;
    this.menu = document.createElement('div'); this.menu.className = 'project-menu'; this.menu.hidden = true;
    this.menu.innerHTML = `
      <button data-action="folder"><span>＋</span> New folder</button>
      <i></i>
      <button data-action="download"><span>⇩</span> Download project</button>
      <button data-action="open"><span>⇧</span> Open .looplab file</button>
      <i></i>
      <button data-action="checkpoint"><span>◈</span> Save checkpoint</button>
      <button data-action="recover"><span>↶</span> Recovery history</button>`;
    document.querySelector('.explorer')?.append(this.menu);
    this.input = document.createElement('input'); this.input.type = 'file'; this.input.accept = '.looplab,application/json'; this.input.hidden = true; document.body.append(this.input);
    button.title = 'Project actions';
    button.addEventListener('click', () => { this.menu.hidden = !this.menu.hidden; });
    this.menu.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.action;
      this.menu.hidden = true;
      if (action === 'folder') void this.files.createFolder();
      else if (action === 'download') this.download();
      else if (action === 'open') this.input.click();
      else if (action === 'checkpoint') void this.checkpoint();
      else if (action === 'recover') void this.showRecovery();
    });
    this.input.addEventListener('change', () => void this.openPackage());
    document.addEventListener('click', (event) => {
      if (!this.menu.hidden && event.target !== button && !this.menu.contains(event.target as Node)) this.menu.hidden = true;
    });
  }

  private download(): void {
    const blob = new Blob([serializeProjectPackage(this.project)], { type: 'application/vnd.loop-lab.project+json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = packageFilename(this.project.name); link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.options.onNotice(`Downloaded ${link.download} (${this.formatBytes(blob.size)}).`);
  }

  private async openPackage(): Promise<void> {
    const file = this.input.files?.[0]; this.input.value = '';
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('Project packages must be smaller than 100 MB.');
      const imported = parseProjectPackage(await file.text());
      if (!await this.confirmImport(imported, file.name)) return;
      await createCheckpoint(this.project, 'import');
      imported.id = this.project.id; imported.name = this.project.name;
      imported.createdAt = this.project.createdAt; imported.updatedAt = new Date().toISOString();
      await saveProject(imported, false);
      window.location.reload();
    } catch (error) {
      this.options.onNotice(error instanceof Error ? error.message : String(error));
    }
  }

  private confirmImport(imported: ProjectState, packageName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog'); dialog.className = 'file-dialog package-confirm';
      const assets = imported.files.filter((file) => file.kind === 'asset').length;
      const form = document.createElement('form'); form.method = 'dialog';
      const heading = document.createElement('h3'); heading.textContent = 'Open project package?';
      const copy = document.createElement('p'); copy.textContent = `${packageName} contains ${imported.files.length} files, ${assets} assets, and a ${imported.worldWidth}×${imported.worldHeight} world. Your current project will be checkpointed before it is replaced.`;
      const footer = document.createElement('footer'); footer.innerHTML = '<button value="cancel">Cancel</button><button value="confirm" class="primary">Open project</button>';
      form.append(heading, copy, footer); dialog.append(form); document.body.append(dialog);
      dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm'; dialog.remove(); resolve(result); }); dialog.showModal();
    });
  }

  private async checkpoint(): Promise<void> {
    const checkpoint = await createCheckpoint(this.project, 'manual');
    this.options.onNotice(`Checkpoint saved at ${new Date(checkpoint.createdAt).toLocaleTimeString()}.`);
  }

  private async showRecovery(): Promise<void> {
    const checkpoints = await listCheckpoints(this.project.id);
    const dialog = document.createElement('dialog'); dialog.className = 'recovery-dialog';
    const header = document.createElement('header'); header.innerHTML = '<div><span>PROJECT SAFETY</span><h2>Recovery history</h2></div><button aria-label="Close recovery history">×</button>';
    const list = document.createElement('div'); list.className = 'recovery-list';
    if (!checkpoints.length) list.innerHTML = '<p class="empty">No recovery checkpoints yet. They are created automatically while you work.</p>';
    checkpoints.forEach((checkpoint) => list.append(this.checkpointRow(checkpoint, dialog)));
    dialog.append(header, list); document.body.append(dialog);
    header.querySelector('button')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  }

  private checkpointRow(checkpoint: ProjectCheckpoint, dialog: HTMLDialogElement): HTMLElement {
    const row = document.createElement('article');
    const date = new Date(checkpoint.createdAt);
    const size = new Blob([JSON.stringify(checkpoint.project)]).size;
    row.innerHTML = `<div><strong>${date.toLocaleString()}</strong><span>${checkpoint.reason} · ${checkpoint.project.files.length} files · ${this.formatBytes(size)}</span></div><button>Restore</button>`;
    row.querySelector('button')?.addEventListener('click', () => void this.confirmRestore(checkpoint, dialog));
    return row;
  }

  private async confirmRestore(checkpoint: ProjectCheckpoint, parent: HTMLDialogElement): Promise<void> {
    const confirmed = await new Promise<boolean>((resolve) => {
      const dialog = document.createElement('dialog'); dialog.className = 'file-dialog';
      dialog.innerHTML = '<form method="dialog"><h3>Restore checkpoint?</h3><p>Your current project will be saved as a checkpoint first, then replaced.</p><footer><button value="cancel">Cancel</button><button value="confirm" class="primary">Restore</button></footer></form>';
      document.body.append(dialog); dialog.addEventListener('close', () => { const value = dialog.returnValue === 'confirm'; dialog.remove(); resolve(value); }); dialog.showModal();
    });
    if (!confirmed) return;
    await createCheckpoint(this.project, 'manual');
    await saveProject(checkpoint.project, false);
    parent.close(); window.location.reload();
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
