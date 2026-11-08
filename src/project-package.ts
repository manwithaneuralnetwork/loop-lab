import type { ProjectFile, ProjectState } from './project-store';

export interface LoopLabPackage {
  format: 'loop-lab-project';
  version: 1;
  exportedAt: string;
  project: ProjectState;
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<ProjectFile>;
  return typeof file.id === 'string' && typeof file.path === 'string' && !file.path.includes('..')
    && (file.kind === 'code' || file.kind === 'asset') && typeof file.content === 'string';
}

export function serializeProjectPackage(project: ProjectState): string {
  const packageValue: LoopLabPackage = {
    format: 'loop-lab-project', version: 1, exportedAt: new Date().toISOString(), project
  };
  return JSON.stringify(packageValue, null, 2);
}

export function parseProjectPackage(source: string): ProjectState {
  const value = JSON.parse(source) as Partial<LoopLabPackage>;
  if (value.format !== 'loop-lab-project' || value.version !== 1 || !value.project) {
    throw new Error('This is not a supported Loop Lab project package.');
  }
  const project = value.project as Partial<ProjectState>;
  if (!Array.isArray(project.files) || !project.files.length || !project.files.every(isProjectFile)) {
    throw new Error('The project package contains invalid files.');
  }
  if (!project.files.some((file) => file.path === 'simulation.js' && file.kind === 'code')) {
    throw new Error('The project package is missing simulation.js.');
  }
  const activeFileId = project.files.some((file) => file.id === project.activeFileId)
    ? project.activeFileId! : project.files.find((file) => file.kind === 'code')!.id;
  const now = new Date().toISOString();
  return {
    id: typeof project.id === 'string' ? project.id : crypto.randomUUID(),
    name: typeof project.name === 'string' ? project.name : 'Imported Project',
    createdAt: typeof project.createdAt === 'string' ? project.createdAt : now,
    updatedAt: typeof project.updatedAt === 'string' ? project.updatedAt : now,
    files: project.files,
    folders: Array.isArray(project.folders) ? project.folders.filter((folder): folder is string => typeof folder === 'string') : [],
    activeFileId,
    openFileIds: Array.isArray(project.openFileIds) ? project.openFileIds.filter((id): id is string => typeof id === 'string' && project.files!.some((file) => file.id === id)) : [activeFileId],
    parameterValues: project.parameterValues && typeof project.parameterValues === 'object' ? project.parameterValues : {},
    gridVisible: project.gridVisible ?? true,
    botMode: project.botMode ?? false,
    worldWidth: Number(project.worldWidth) || 1080,
    worldHeight: Number(project.worldHeight) || 1080,
    exportHistory: Array.isArray(project.exportHistory) ? project.exportHistory : []
  };
}

export function packageFilename(projectName = 'loop-lab-project'): string {
  const safe = projectName.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'loop-lab-project';
  return `${safe}.looplab`;
}
