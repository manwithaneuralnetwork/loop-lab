import type { ParameterValues } from './engine/protocol';

export type ProjectFileKind = 'code' | 'asset';

export interface ProjectFile {
  id: string;
  path: string;
  kind: ProjectFileKind;
  content: string;
  mime?: string;
}

export interface ExportHistoryEntry {
  id: string;
  name: string;
  createdAt: string;
  bytes: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

export interface ProjectState {
  files: ProjectFile[];
  folders: string[];
  activeFileId: string;
  openFileIds: string[];
  parameterValues: ParameterValues;
  gridVisible: boolean;
  worldWidth: number;
  worldHeight: number;
  exportHistory: ExportHistoryEntry[];
}

export interface ProjectCheckpoint {
  id: string;
  createdAt: string;
  project: ProjectState;
  reason: 'autosave' | 'manual' | 'import';
}

interface LegacyProjectState extends Partial<ProjectState> { code?: string }

const STORAGE_KEY = 'loop-lab.project.v1';
const DATABASE_NAME = 'loop-lab-workspace';
const DATABASE_VERSION = 1;
const PROJECT_KEY = 'current';
const CHECKPOINT_INTERVAL = 30_000;
const CHECKPOINT_LIMIT = 10;
let lastCheckpointAt = Date.now();

export function createProjectFile(path: string, content = '', kind: ProjectFileKind = 'code', mime?: string): ProjectFile {
  return { id: crypto.randomUUID(), path, kind, content, mime };
}

export function uniquePath(files: ProjectFile[], requestedPath: string): string {
  const clean = requestedPath.replace(/\\/g, '/').replace(/^\/+/, '') || 'untitled.js';
  if (!files.some((file) => file.path === clean)) return clean;
  const slash = clean.lastIndexOf('/');
  const directory = slash >= 0 ? clean.slice(0, slash + 1) : '';
  const filename = slash >= 0 ? clean.slice(slash + 1) : clean;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  let index = 2;
  while (files.some((file) => file.path === `${directory}${stem}-${index}${extension}`)) index += 1;
  return `${directory}${stem}-${index}${extension}`;
}

function fallbackProject(fallbackCode: string, additionalFiles: Array<{ path: string; content: string }> = []): ProjectState {
  const file = createProjectFile('simulation.js', fallbackCode);
  return {
    files: [file, ...additionalFiles.map((item) => createProjectFile(item.path, item.content))],
    folders: ['assets'], activeFileId: file.id, openFileIds: [file.id], parameterValues: {},
    gridVisible: true, worldWidth: 1080, worldHeight: 1080, exportHistory: []
  };
}

function normalizeProject(stored: LegacyProjectState, fallbackCode: string): ProjectState {
  const files = stored.files?.length ? stored.files : [createProjectFile('simulation.js', stored.code || fallbackCode)];
  const activeFileId = files.some((file) => file.id === stored.activeFileId) ? stored.activeFileId! : files[0].id;
  const openFileIds = (stored.openFileIds || [activeFileId]).filter((id) => files.some((file) => file.id === id));
  return {
    files, folders: stored.folders || ['assets'], activeFileId,
    openFileIds: openFileIds.length ? openFileIds : [activeFileId],
    parameterValues: stored.parameterValues || {}, gridVisible: stored.gridVisible ?? true,
    worldWidth: stored.worldWidth || 1080, worldHeight: stored.worldHeight || 1080,
    exportHistory: stored.exportHistory || []
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects');
      if (!database.objectStoreNames.contains('checkpoints')) database.createObjectStore('checkpoints', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCurrent(database: IDBDatabase): Promise<ProjectState | undefined> {
  const transaction = database.transaction('projects', 'readonly');
  return requestValue(transaction.objectStore('projects').get(PROJECT_KEY)) as Promise<ProjectState | undefined>;
}

async function putCurrent(database: IDBDatabase, project: ProjectState): Promise<void> {
  const transaction = database.transaction('projects', 'readwrite');
  await requestValue(transaction.objectStore('projects').put(structuredClone(project), PROJECT_KEY));
}

async function putCheckpoint(database: IDBDatabase, checkpoint: ProjectCheckpoint): Promise<void> {
  const transaction = database.transaction('checkpoints', 'readwrite');
  await requestValue(transaction.objectStore('checkpoints').put(checkpoint));
}

export async function loadProject(fallbackCode: string, additionalFiles: Array<{ path: string; content: string }> = []): Promise<ProjectState> {
  try {
    const database = await openDatabase();
    const stored = await getCurrent(database);
    database.close();
    if (stored) { lastCheckpointAt = Date.now(); return normalizeProject(stored, fallbackCode); }
  } catch { /* IndexedDB fallback below. */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as LegacyProjectState | null;
    const project = legacy ? normalizeProject(legacy, fallbackCode) : fallbackProject(fallbackCode, additionalFiles);
    await saveProject(project, false);
    return project;
  } catch {
    return fallbackProject(fallbackCode, additionalFiles);
  }
}

export async function saveProject(project: ProjectState, createRecovery = true): Promise<void> {
  try {
    const database = await openDatabase();
    const now = Date.now();
    if (createRecovery && now - lastCheckpointAt >= CHECKPOINT_INTERVAL) {
      const previous = await getCurrent(database);
      if (previous) await putCheckpoint(database, {
        id: crypto.randomUUID(), createdAt: new Date(now).toISOString(), project: previous, reason: 'autosave'
      });
      lastCheckpointAt = now;
    }
    await putCurrent(database, project);
    database.close();
    if (createRecovery) await pruneCheckpoints();
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }
}

export async function createCheckpoint(project: ProjectState, reason: ProjectCheckpoint['reason'] = 'manual'): Promise<ProjectCheckpoint> {
  const checkpoint: ProjectCheckpoint = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), project: structuredClone(project), reason
  };
  const database = await openDatabase(); await putCheckpoint(database, checkpoint); database.close();
  await pruneCheckpoints();
  return checkpoint;
}

export async function listCheckpoints(): Promise<ProjectCheckpoint[]> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction('checkpoints', 'readonly');
    const values = await requestValue(transaction.objectStore('checkpoints').getAll()) as ProjectCheckpoint[];
    database.close();
    return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

async function pruneCheckpoints(): Promise<void> {
  const values = await listCheckpoints();
  if (values.length <= CHECKPOINT_LIMIT) return;
  const database = await openDatabase();
  const transaction = database.transaction('checkpoints', 'readwrite');
  await Promise.all(values.slice(CHECKPOINT_LIMIT).map((checkpoint) => requestValue(transaction.objectStore('checkpoints').delete(checkpoint.id))));
  database.close();
}
