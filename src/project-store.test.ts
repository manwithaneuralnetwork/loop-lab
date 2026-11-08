import { describe, expect, it } from 'vitest';
import { createProjectState, duplicateProjectState, uniquePath, type ProjectFile } from './project-store';

describe('project file paths', () => {
  const files = [
    { id: '1', path: 'simulation.js', kind: 'code', content: '' },
    { id: '2', path: 'assets/note.txt', kind: 'code', content: '' }
  ] satisfies ProjectFile[];

  it('keeps an unused path', () => expect(uniquePath(files, 'helpers.js')).toBe('helpers.js'));
  it('numbers duplicate root files', () => expect(uniquePath(files, 'simulation.js')).toBe('simulation-2.js'));
  it('numbers duplicate nested files', () => expect(uniquePath(files, 'assets/note.txt')).toBe('assets/note-2.txt'));
});

describe('project lifecycle', () => {
  it('creates a named project with an entry file', () => {
    const project = createProjectState('New Loop', 'export function setup() {}');
    expect(project.name).toBe('New Loop');
    expect(project.files[0].path).toBe('simulation.js');
  });

  it('duplicates files with fresh identities and no export history', () => {
    const source = createProjectState('Original', 'export function setup() {}');
    source.exportHistory.push({ id: 'render', name: 'render.webm', createdAt: source.createdAt, bytes: 1, width: 100, height: 100, fps: 30, duration: 1 });
    const copy = duplicateProjectState(source);
    expect(copy.name).toBe('Original Copy');
    expect(copy.id).not.toBe(source.id);
    expect(copy.files[0].id).not.toBe(source.files[0].id);
    expect(copy.exportHistory).toEqual([]);
  });
});
