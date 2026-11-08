import { createProjectFile, uniquePath, type ProjectFile, type ProjectState } from './project-store';

interface WorkspaceFilesOptions {
  onActivate(file: ProjectFile): void;
  onAgentOpen(): void;
  isAgentActive(): boolean;
  onChange(): void;
  onNotice(message: string): void;
}

const TEXT_EXTENSIONS = new Set(['js', 'ts', 'json', 'txt', 'md', 'css', 'html', 'glsl', 'vert', 'frag']);

function filename(path: string): string { return path.split('/').pop() || path; }
function dirname(path: string): string { return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''; }
function extension(path: string): string { return filename(path).split('.').pop()?.toLowerCase() || ''; }
function icon(file: ProjectFile): string {
  if (file.kind === 'asset') return file.mime?.startsWith('audio/') ? '♫' : file.mime?.startsWith('image/') ? '▧' : '◆';
  return extension(file.path) === 'json' ? '{}' : 'JS';
}

export class WorkspaceFiles {
  private readonly list: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly importInput: HTMLInputElement;
  private selectedPath = '';
  private readonly collapsedFolders = new Set<string>();
  private explorerCollapsed = false;

  constructor(private readonly project: ProjectState, private readonly options: WorkspaceFilesOptions) {
    this.list = document.querySelector('.files') as HTMLElement;
    this.tabs = document.querySelector('.tabs') as HTMLElement;
    const topAdd = document.querySelector('.panel-title .add-button') as HTMLButtonElement;
    const explorerToggle = document.querySelector('.explorer-toggle') as HTMLButtonElement;
    const importButton = document.querySelector('.new-file') as HTMLButtonElement;
    this.importInput = document.createElement('input');
    this.importInput.type = 'file';
    this.importInput.multiple = true;
    this.importInput.hidden = true;
    document.body.append(this.importInput);
    topAdd.addEventListener('click', () => void this.createFile(''));
    explorerToggle.addEventListener('click', () => {
      this.explorerCollapsed = !this.explorerCollapsed;
      explorerToggle.setAttribute('aria-expanded', String(!this.explorerCollapsed));
      explorerToggle.classList.toggle('collapsed', this.explorerCollapsed);
      this.list.hidden = this.explorerCollapsed;
    });
    importButton.addEventListener('click', () => this.importInput.click());
    this.importInput.addEventListener('change', () => void this.importFiles());
    this.render();
  }

  get activeFile(): ProjectFile {
    return this.project.files.find((file) => file.id === this.project.activeFileId) || this.project.files[0];
  }

  openFile(id: string): void {
    const file = this.project.files.find((candidate) => candidate.id === id);
    if (file) this.activate(file);
  }

  render(): void {
    this.renderExplorer();
    this.renderTabs();
  }

  private renderExplorer(): void {
    this.list.innerHTML = '';
    const folderNames = new Set([
      ...this.project.folders,
      ...this.project.files.map((file) => dirname(file.path)).filter(Boolean)
    ]);
    [...folderNames].forEach((folder) => {
      const parts = folder.split('/');
      for (let index = 1; index < parts.length; index += 1) folderNames.add(parts.slice(0, index).join('/'));
    });
    this.project.files.filter((file) => !dirname(file.path)).sort((a, b) => a.path.localeCompare(b.path)).forEach((file) => this.list.append(this.fileRow(file, 0)));
    [...folderNames].filter((folder) => !dirname(folder)).sort().forEach((folder) => this.renderFolder(folder, folderNames, 0));
  }

  private renderFolder(folder: string, folders: Set<string>, depth: number): void {
    const folderRow = document.createElement('div');
    const collapsed = this.collapsedFolders.has(folder);
    folderRow.className = `file-row folder-row ${this.selectedPath === folder ? 'selected' : ''}`;
    folderRow.style.setProperty('--tree-depth', String(depth));
    folderRow.setAttribute('role', 'treeitem');
    folderRow.setAttribute('aria-expanded', String(!collapsed));
    const select = document.createElement('button');
    select.className = 'file-main directory';
    select.innerHTML = `<span class="chevron-down ${collapsed ? 'collapsed' : ''}"></span>`;
    select.append(document.createTextNode(filename(folder)));
    select.addEventListener('click', () => {
      this.selectedPath = folder;
      if (collapsed) this.collapsedFolders.delete(folder); else this.collapsedFolders.add(folder);
      this.renderExplorer();
    });
    const actions = document.createElement('div'); actions.className = 'file-actions';
    const add = document.createElement('button');
    add.className = 'file-action'; add.title = 'Add empty file'; add.setAttribute('aria-label', `Add file to ${folder}`); add.textContent = '+';
    add.addEventListener('click', () => void this.createFile(folder));
    const rename = document.createElement('button');
    rename.className = 'file-action'; rename.title = 'Rename folder'; rename.setAttribute('aria-label', `Rename ${folder}`); rename.textContent = '✎';
    rename.addEventListener('click', () => void this.renameFolder(folder));
    const remove = document.createElement('button');
    remove.className = 'file-action danger'; remove.title = 'Delete folder'; remove.setAttribute('aria-label', `Delete ${folder}`); remove.textContent = '×';
    remove.addEventListener('click', () => void this.deleteFolder(folder));
    actions.append(add, rename, remove); folderRow.append(select, actions); this.list.append(folderRow);
    if (collapsed) return;
    this.project.files.filter((file) => dirname(file.path) === folder).sort((a, b) => a.path.localeCompare(b.path)).forEach((file) => this.list.append(this.fileRow(file, depth + 1)));
    [...folders].filter((candidate) => dirname(candidate) === folder).sort().forEach((child) => this.renderFolder(child, folders, depth + 1));
  }

  private fileRow(file: ProjectFile, depth: number): HTMLElement {
    const row = document.createElement('div');
    row.className = `file-row ${depth ? 'nested' : ''} ${file.id === this.project.activeFileId ? 'active' : ''}`;
    row.style.setProperty('--tree-depth', String(depth));
    row.setAttribute('role', 'treeitem');
    const select = document.createElement('button');
    select.className = 'file-main';
    const badge = document.createElement('span');
    badge.className = file.kind === 'code' ? (extension(file.path) === 'json' ? 'json' : 'js') : 'asset-icon';
    badge.textContent = icon(file);
    select.append(badge, document.createTextNode(filename(file.path)));
    select.addEventListener('click', () => this.activate(file));
    const actions = document.createElement('div'); actions.className = 'file-actions';
    const rename = document.createElement('button');
    rename.className = 'file-action'; rename.title = 'Rename file'; rename.textContent = '✎';
    rename.addEventListener('click', () => void this.renameFile(file));
    const remove = document.createElement('button');
    remove.className = 'file-action danger'; remove.title = 'Delete file'; remove.textContent = '×';
    remove.addEventListener('click', () => void this.deleteFile(file));
    actions.append(rename, remove); row.append(select, actions);
    return row;
  }

  private renderTabs(): void {
    this.tabs.innerHTML = '';
    this.project.openFileIds.forEach((id) => {
      const file = this.project.files.find((candidate) => candidate.id === id);
      if (!file || file.kind === 'asset') return;
      const tab = document.createElement('button');
      tab.className = file.id === this.project.activeFileId ? 'active' : '';
      const badge = document.createElement('span');
      badge.className = extension(file.path) === 'json' ? 'json' : 'js';
      badge.textContent = icon(file);
      const dirty = document.createElement('i');
      const close = document.createElement('b'); close.textContent = '×'; close.title = 'Close tab';
      close.addEventListener('click', (event) => { event.stopPropagation(); this.closeTab(file.id); });
      tab.append(badge, document.createTextNode(` ${filename(file.path)} `), dirty, close);
      tab.addEventListener('click', () => this.activate(file));
      this.tabs.append(tab);
    });
    const agent = document.createElement('button');
    agent.className = `agent-tab ${this.options.isAgentActive() ? 'active' : ''}`;
    agent.innerHTML = '<span>✦</span> Agent'; agent.title = 'Open Loop Agent';
    agent.addEventListener('click', () => this.options.onAgentOpen()); this.tabs.append(agent);
  }

  private activate(file: ProjectFile): void {
    this.selectedPath = file.path;
    if (file.kind === 'asset') {
      this.options.onNotice(`${file.path} is stored as a project asset.`);
      this.renderExplorer();
      return;
    }
    this.project.activeFileId = file.id;
    if (!this.project.openFileIds.includes(file.id)) this.project.openFileIds.push(file.id);
    this.options.onActivate(file);
    this.render();
    this.options.onChange();
  }

  private async createFile(folder: string): Promise<void> {
    const requested = await this.requestValue('New file', 'File name', 'untitled.js');
    if (!requested) return;
    const path = uniquePath(this.project.files, folder ? `${folder}/${filename(requested)}` : requested);
    const file = createProjectFile(path);
    this.project.files.push(file);
    this.activate(file);
  }

  async createFolder(): Promise<void> {
    const requested = await this.requestValue('New folder', 'Folder name', 'folder');
    const folder = requested?.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!folder || this.project.folders.includes(folder)) return;
    this.project.folders.push(folder);
    this.selectedPath = folder;
    this.render();
    this.options.onChange();
  }

  private async renameFile(file: ProjectFile): Promise<void> {
    if (file.path === 'simulation.js') { this.options.onNotice('simulation.js is the project entry file and cannot be renamed.'); return; }
    const requested = await this.requestValue('Rename file', 'File name', filename(file.path));
    if (!requested) return;
    file.path = uniquePath(this.project.files.filter((candidate) => candidate.id !== file.id), `${dirname(file.path) ? `${dirname(file.path)}/` : ''}${filename(requested)}`);
    this.render(); this.options.onChange();
  }

  private async deleteFile(file: ProjectFile): Promise<void> {
    if (file.path === 'simulation.js') { this.options.onNotice('simulation.js is required as the project entry file.'); return; }
    if (!await this.confirmAction('Delete file', `Delete ${file.path}? This cannot be undone.`)) return;
    this.project.files = this.project.files.filter((candidate) => candidate.id !== file.id);
    this.project.openFileIds = this.project.openFileIds.filter((id) => id !== file.id);
    if (this.project.activeFileId === file.id) this.activate(this.project.files.find((candidate) => candidate.kind === 'code')!);
    else { this.render(); this.options.onChange(); }
  }

  private async renameFolder(folder: string): Promise<void> {
    const value = await this.requestValue('Rename folder', 'Folder name', folder);
    const requested = value?.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!requested || requested === folder || this.project.folders.includes(requested)) return;
    const requestedParent = dirname(folder);
    const replacement = requestedParent ? `${requestedParent}/${filename(requested)}` : filename(requested);
    const conflicts = this.project.folders.some((name) => name !== folder && name === replacement);
    if (conflicts) return;
    this.project.folders = this.project.folders.map((name) => name === folder || name.startsWith(`${folder}/`) ? `${replacement}${name.slice(folder.length)}` : name);
    this.project.files.forEach((file) => { if (dirname(file.path) === folder || file.path.startsWith(`${folder}/`)) file.path = `${replacement}${file.path.slice(folder.length)}`; });
    if (this.collapsedFolders.delete(folder)) this.collapsedFolders.add(replacement);
    this.render(); this.options.onChange();
  }

  private async deleteFolder(folder: string): Promise<void> {
    const contained = this.project.files.filter((file) => dirname(file.path) === folder || file.path.startsWith(`${folder}/`));
    if (!await this.confirmAction('Delete folder', `Delete ${folder}${contained.length ? ` and ${contained.length} contained file(s)` : ''}? This cannot be undone.`)) return;
    const ids = new Set(contained.map((file) => file.id));
    this.project.files = this.project.files.filter((file) => !ids.has(file.id));
    this.project.folders = this.project.folders.filter((name) => name !== folder && !name.startsWith(`${folder}/`));
    [...this.collapsedFolders].filter((name) => name === folder || name.startsWith(`${folder}/`)).forEach((name) => this.collapsedFolders.delete(name));
    this.project.openFileIds = this.project.openFileIds.filter((id) => !ids.has(id));
    if (ids.has(this.project.activeFileId)) this.activate(this.project.files.find((file) => file.kind === 'code')!);
    else { this.render(); this.options.onChange(); }
  }

  private closeTab(id: string): void {
    if (this.project.openFileIds.length === 1) return;
    this.project.openFileIds = this.project.openFileIds.filter((openId) => openId !== id);
    if (this.project.activeFileId === id) {
      const next = this.project.files.find((file) => file.id === this.project.openFileIds.at(-1));
      if (next) { this.project.activeFileId = next.id; this.options.onActivate(next); }
    }
    this.render(); this.options.onChange();
  }

  private async importFiles(): Promise<void> {
    const selected = [...(this.importInput.files || [])];
    const oversized = selected.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      this.importInput.value = '';
      this.options.onNotice(`${oversized.name} is larger than the 25 MB per-file project limit.`);
      return;
    }
    if (selected.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
      this.importInput.value = ''; this.options.onNotice('That import exceeds the 100 MB project import limit.'); return;
    }
    for (const source of selected) {
      const ext = extension(source.name);
      const isText = source.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext);
      const folder = isText ? '' : 'assets';
      const path = uniquePath(this.project.files, folder ? `${folder}/${source.name}` : source.name);
      const content = isText ? await source.text() : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(source);
      });
      const file = createProjectFile(path, content, isText ? 'code' : 'asset', source.type);
      this.project.files.push(file);
      if (isText) this.activate(file);
    }
    this.importInput.value = '';
    this.render(); this.options.onChange();
    this.options.onNotice(`Imported ${selected.length} file${selected.length === 1 ? '' : 's'}.`);
  }

  private requestValue(title: string, label: string, initial: string): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog'); dialog.className = 'file-dialog';
      dialog.innerHTML = `<form method="dialog"><h3>${title}</h3><label>${label}<input value="${initial.replace(/"/g, '&quot;')}"></label><footer><button value="cancel">Cancel</button><button value="confirm" class="primary">Confirm</button></footer></form>`;
      document.body.append(dialog); const input = dialog.querySelector('input') as HTMLInputElement;
      dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm' ? input.value.trim() : null; dialog.remove(); resolve(result); });
      dialog.showModal(); input.select();
    });
  }

  private confirmAction(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog'); dialog.className = 'file-dialog';
      const form = document.createElement('form'); form.method = 'dialog';
      const heading = document.createElement('h3'); heading.textContent = title;
      const copy = document.createElement('p'); copy.textContent = message;
      const footer = document.createElement('footer'); footer.innerHTML = '<button value="cancel">Cancel</button><button value="confirm" class="danger">Delete</button>';
      form.append(heading, copy, footer); dialog.append(form); document.body.append(dialog);
      dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm'; dialog.remove(); resolve(result); }); dialog.showModal();
    });
  }
}
