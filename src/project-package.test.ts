import { describe, expect, it } from 'vitest';
import { packageFilename, parseProjectPackage, serializeProjectPackage } from './project-package';
import type { ProjectState } from './project-store';

const project: ProjectState = {
  id: 'project', name: 'Test Project', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  files: [{ id: 'entry', path: 'simulation.js', kind: 'code', content: 'export function setup() {}' }],
  folders: [], activeFileId: 'entry', openFileIds: ['entry'], parameterValues: {}, gridVisible: true,
  worldWidth: 640, worldHeight: 360, botMode: false, exportHistory: []
};

describe('Loop Lab project packages', () => {
  it('round trips complete project state', () => {
    expect(parseProjectPackage(serializeProjectPackage(project))).toEqual(project);
  });

  it('rejects packages without the entry file', () => {
    const value = JSON.parse(serializeProjectPackage(project)); value.project.files[0].path = 'other.js';
    expect(() => parseProjectPackage(JSON.stringify(value))).toThrow(/simulation\.js/);
  });

  it('creates safe package names', () => expect(packageFilename('My Great Project!')).toBe('my-great-project.looplab'));
});
