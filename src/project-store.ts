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

interface LegacyProjectState extends Partial<ProjectState> { code?: string }

const STORAGE_KEY = 'loop-lab.project.v1';

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

function fallbackProject(fallbackCode: string): ProjectState {
  const file = createProjectFile('simulation.js', fallbackCode);
  return {
    files: [file], folders: ['assets'], activeFileId: file.id, openFileIds: [file.id], parameterValues: {},
    gridVisible: true, worldWidth: 1080, worldHeight: 1080, exportHistory: []
  };
}

export function loadProject(fallbackCode: string): ProjectState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as LegacyProjectState | null;
    if (!stored) return fallbackProject(fallbackCode);
    const migrated = stored.files?.length ? stored.files : [createProjectFile('simulation.js', stored.code || fallbackCode)];
    const activeFileId = migrated.some((file) => file.id === stored.activeFileId) ? stored.activeFileId! : migrated[0].id;
    const openFileIds = (stored.openFileIds || [activeFileId]).filter((id) => migrated.some((file) => file.id === id));
    return {
      files: migrated,
      folders: stored.folders || ['assets'],
      activeFileId,
      openFileIds: openFileIds.length ? openFileIds : [activeFileId],
      parameterValues: stored.parameterValues || {},
      gridVisible: stored.gridVisible ?? true,
      worldWidth: stored.worldWidth || 1080,
      worldHeight: stored.worldHeight || 1080,
      exportHistory: stored.exportHistory || []
    };
  } catch {
    return fallbackProject(fallbackCode);
  }
}

export function saveProject(project: ProjectState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}
