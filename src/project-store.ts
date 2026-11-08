import type { ParameterValues } from './engine/protocol';

export type ProjectFileKind = 'code' | 'asset';
export interface ProjectFile { id: string; path: string; kind: ProjectFileKind; content: string; mime?: string }
export interface ExportHistoryEntry { id: string; name: string; createdAt: string; bytes: number; width: number; height: number; fps: number; duration: number }
export interface ProjectState {
  id: string; name: string; createdAt: string; updatedAt: string;
  files: ProjectFile[]; folders: string[]; activeFileId: string; openFileIds: string[];
  parameterValues: ParameterValues; gridVisible: boolean; worldWidth: number; worldHeight: number;
  botMode: boolean;
  exportHistory: ExportHistoryEntry[];
}
export interface ProjectCheckpoint {
  id: string; projectId: string; createdAt: string; project: ProjectState; reason: 'autosave' | 'manual' | 'import';
}
interface LegacyProjectState extends Partial<ProjectState> { code?: string }

const STORAGE_KEY = 'loop-lab.project.v1';
const DATABASE_NAME = 'loop-lab-workspace';
const DATABASE_VERSION = 2;
const LEGACY_PROJECT_KEY = 'current';
const ACTIVE_PROJECT_KEY = 'activeProjectId';
const CHECKPOINT_INTERVAL = 30_000;
const CHECKPOINT_LIMIT = 10;
let lastCheckpointAt = Date.now();

export function createProjectFile(path: string, content = '', kind: ProjectFileKind = 'code', mime?: string): ProjectFile {
  return { id: crypto.randomUUID(), path, kind, content, mime };
}

export function uniquePath(files: ProjectFile[], requestedPath: string): string {
  const clean = requestedPath.replace(/\\/g, '/').replace(/^\/+/, '') || 'untitled.js';
  if (!files.some((file) => file.path === clean)) return clean;
  const slash = clean.lastIndexOf('/'); const directory = slash >= 0 ? clean.slice(0, slash + 1) : '';
  const filename = slash >= 0 ? clean.slice(slash + 1) : clean; const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename; const extension = dot > 0 ? filename.slice(dot) : '';
  let index = 2; while (files.some((file) => file.path === `${directory}${stem}-${index}${extension}`)) index += 1;
  return `${directory}${stem}-${index}${extension}`;
}

export function createProjectState(
  name: string, code: string, additionalFiles: Array<{ path: string; content: string }> = [],
  dimensions: { width: number; height: number } = { width: 1080, height: 1080 }
): ProjectState {
  const now = new Date().toISOString(); const file = createProjectFile('simulation.js', code);
  return {
    id: crypto.randomUUID(), name: name.trim() || 'Untitled Project', createdAt: now, updatedAt: now,
    files: [file, ...additionalFiles.map((item) => createProjectFile(item.path, item.content))], folders: ['assets'],
    activeFileId: file.id, openFileIds: [file.id], parameterValues: {}, gridVisible: true,
    worldWidth: dimensions.width, worldHeight: dimensions.height, botMode: false, exportHistory: []
  };
}

export function duplicateProjectState(source: ProjectState, requestedName = `${source.name} Copy`): ProjectState {
  const now = new Date().toISOString(); const idMap = new Map<string, string>();
  const files = source.files.map((file) => { const id = crypto.randomUUID(); idMap.set(file.id, id); return { ...structuredClone(file), id }; });
  return {
    ...structuredClone(source), id: crypto.randomUUID(), name: requestedName, createdAt: now, updatedAt: now, files,
    activeFileId: idMap.get(source.activeFileId) || files[0].id,
    openFileIds: source.openFileIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)), exportHistory: []
  };
}

function normalizeProject(stored: LegacyProjectState, fallbackCode: string, fallbackName = 'Orbit Study'): ProjectState {
  const files = stored.files?.length ? stored.files : [createProjectFile('simulation.js', stored.code || fallbackCode)];
  const activeFileId = files.some((file) => file.id === stored.activeFileId) ? stored.activeFileId! : files[0].id;
  const openFileIds = (stored.openFileIds || [activeFileId]).filter((id) => files.some((file) => file.id === id));
  const now = new Date().toISOString();
  return {
    id: stored.id || crypto.randomUUID(), name: stored.name || fallbackName, createdAt: stored.createdAt || now, updatedAt: stored.updatedAt || now,
    files, folders: stored.folders || ['assets'], activeFileId, openFileIds: openFileIds.length ? openFileIds : [activeFileId],
    parameterValues: stored.parameterValues || {}, gridVisible: stored.gridVisible ?? true,
    worldWidth: stored.worldWidth || 1080, worldHeight: stored.worldHeight || 1080, botMode: stored.botMode ?? false, exportHistory: stored.exportHistory || []
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects');
      if (!database.objectStoreNames.contains('checkpoints')) database.createObjectStore('checkpoints', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('workspace')) database.createObjectStore('workspace');
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function getProject(database: IDBDatabase, id: string): Promise<LegacyProjectState | undefined> {
  return requestValue(database.transaction('projects', 'readonly').objectStore('projects').get(id));
}
async function putProject(database: IDBDatabase, project: ProjectState): Promise<void> {
  await requestValue(database.transaction('projects', 'readwrite').objectStore('projects').put(structuredClone(project), project.id));
}
async function activeProjectId(database: IDBDatabase): Promise<string | undefined> {
  return requestValue(database.transaction('workspace', 'readonly').objectStore('workspace').get(ACTIVE_PROJECT_KEY));
}
async function setActive(database: IDBDatabase, id: string): Promise<void> {
  await requestValue(database.transaction('workspace', 'readwrite').objectStore('workspace').put(id, ACTIVE_PROJECT_KEY));
}
async function putCheckpoint(database: IDBDatabase, checkpoint: ProjectCheckpoint): Promise<void> {
  await requestValue(database.transaction('checkpoints', 'readwrite').objectStore('checkpoints').put(checkpoint));
}

async function persistDevelopmentProject(project: ProjectState): Promise<void> {
  if (!import.meta.env.DEV) return;
  const response = await fetch('/__loop/projects', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project)
  });
  if (!response.ok) throw new Error((await response.json() as { error?: string }).error || 'Could not write the development project.');
}

export async function syncDevelopmentProjects(): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    const response = await fetch('/__loop/projects'); if (!response.ok) return;
    const diskProjects = await response.json() as ProjectState[]; if (!diskProjects.length) return;
    const database = await openDatabase();
    const cached = await requestValue(database.transaction('projects', 'readonly').objectStore('projects').getAll()) as LegacyProjectState[];
    for (const project of diskProjects) {
      const sameName = cached.find((candidate) => candidate.name?.toLowerCase() === project.name.toLowerCase());
      const normalized = normalizeProject(project, '');
      if (sameName?.id) normalized.id = sameName.id;
      await putProject(database, normalized);
    }
    database.close();
  } catch { /* IndexedDB remains available when the development adapter is offline. */ }
}
async function migrateLegacy(database: IDBDatabase, fallbackCode: string): Promise<ProjectState | null> {
  const legacy = await getProject(database, LEGACY_PROJECT_KEY); if (!legacy) return null;
  const project = normalizeProject(legacy, fallbackCode); await putProject(database, project); await setActive(database, project.id);
  await requestValue(database.transaction('projects', 'readwrite').objectStore('projects').delete(LEGACY_PROJECT_KEY)); return project;
}

export async function loadProject(fallbackCode: string, additionalFiles: Array<{ path: string; content: string }> = []): Promise<ProjectState> {
  try {
    const database = await openDatabase(); let project: ProjectState | null = null; const activeId = await activeProjectId(database);
    if (activeId) { const stored = await getProject(database, activeId); if (stored) project = normalizeProject(stored, fallbackCode); }
    project ||= await migrateLegacy(database, fallbackCode);
    if (!project) {
      const values = await requestValue(database.transaction('projects', 'readonly').objectStore('projects').getAll()) as LegacyProjectState[];
      if (values.length) { project = normalizeProject(values[0], fallbackCode); await setActive(database, project.id); }
    }
    database.close(); if (project) { lastCheckpointAt = Date.now(); return project; }
  } catch { /* IndexedDB fallback below. */ }
  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as LegacyProjectState | null;
    const project = legacy ? normalizeProject(legacy, fallbackCode) : createProjectState('Orbit Study', fallbackCode, additionalFiles);
    await saveProject(project, false); return project;
  } catch { return createProjectState('Orbit Study', fallbackCode, additionalFiles); }
}

export async function saveProject(project: ProjectState, createRecovery = true): Promise<void> {
  project.updatedAt = new Date().toISOString();
  try {
    const database = await openDatabase(); const now = Date.now();
    if (createRecovery && now - lastCheckpointAt >= CHECKPOINT_INTERVAL) {
      const previous = await getProject(database, project.id);
      if (previous) await putCheckpoint(database, {
        id: crypto.randomUUID(), projectId: project.id, createdAt: new Date(now).toISOString(), project: normalizeProject(previous, ''), reason: 'autosave'
      });
      lastCheckpointAt = now;
    }
    await putProject(database, project); await setActive(database, project.id); database.close();
    if (createRecovery) await pruneCheckpoints(project.id);
  } catch { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
  await persistDevelopmentProject(project);
}

export async function storeProject(project: ProjectState, activate = true): Promise<void> {
  const database = await openDatabase(); await putProject(database, project); if (activate) await setActive(database, project.id); database.close();
  await persistDevelopmentProject(project);
}
export async function listProjects(): Promise<ProjectState[]> {
  try {
    const database = await openDatabase();
    const values = await requestValue(database.transaction('projects', 'readonly').objectStore('projects').getAll()) as LegacyProjectState[];
    database.close(); return values.filter((value) => value.files?.length).map((value) => normalizeProject(value, '')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}
export async function activateProject(id: string): Promise<void> {
  const database = await openDatabase(); if (!await getProject(database, id)) { database.close(); throw new Error('Project not found.'); }
  await setActive(database, id); database.close();
}
export async function duplicateProject(project: ProjectState): Promise<ProjectState> {
  const existing = new Set((await listProjects()).map((candidate) => candidate.name.toLowerCase()));
  const base = `${project.name} Copy`; let name = base; let index = 2;
  while (existing.has(name.toLowerCase())) name = `${base} ${index++}`;
  const copy = duplicateProjectState(project, name); await storeProject(copy, false); return copy;
}

export async function createCheckpoint(project: ProjectState, reason: ProjectCheckpoint['reason'] = 'manual'): Promise<ProjectCheckpoint> {
  const checkpoint: ProjectCheckpoint = { id: crypto.randomUUID(), projectId: project.id, createdAt: new Date().toISOString(), project: structuredClone(project), reason };
  const database = await openDatabase(); await putCheckpoint(database, checkpoint); database.close(); await pruneCheckpoints(project.id); return checkpoint;
}
export async function listCheckpoints(projectId?: string): Promise<ProjectCheckpoint[]> {
  try {
    const database = await openDatabase();
    const values = await requestValue(database.transaction('checkpoints', 'readonly').objectStore('checkpoints').getAll()) as ProjectCheckpoint[];
    database.close();
    return values.map((checkpoint) => ({ ...checkpoint, projectId: checkpoint.projectId || checkpoint.project.id }))
      .filter((checkpoint) => !projectId || checkpoint.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}
async function pruneCheckpoints(projectId: string): Promise<void> {
  const values = await listCheckpoints(projectId); if (values.length <= CHECKPOINT_LIMIT) return;
  const database = await openDatabase(); const store = database.transaction('checkpoints', 'readwrite').objectStore('checkpoints');
  await Promise.all(values.slice(CHECKPOINT_LIMIT).map((checkpoint) => requestValue(store.delete(checkpoint.id)))); database.close();
}
