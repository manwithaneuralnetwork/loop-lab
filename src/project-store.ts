import type { ParameterValues } from './engine/protocol';

export interface ProjectState {
  code: string;
  parameterValues: ParameterValues;
  gridVisible: boolean;
  worldWidth: number;
  worldHeight: number;
}

const STORAGE_KEY = 'loop-lab.project.v1';

export function loadProject(fallbackCode: string): ProjectState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<ProjectState> | null;
    return {
      code: stored?.code || fallbackCode,
      parameterValues: stored?.parameterValues || {},
      gridVisible: stored?.gridVisible ?? true,
      worldWidth: stored?.worldWidth || 1080,
      worldHeight: stored?.worldHeight || 1080
    };
  } catch {
    return { code: fallbackCode, parameterValues: {}, gridVisible: true, worldWidth: 1080, worldHeight: 1080 };
  }
}

export function saveProject(project: ProjectState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}
