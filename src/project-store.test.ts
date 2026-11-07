import { describe, expect, it } from 'vitest';
import { uniquePath, type ProjectFile } from './project-store';

describe('project file paths', () => {
  const files = [
    { id: '1', path: 'simulation.js', kind: 'code', content: '' },
    { id: '2', path: 'assets/note.txt', kind: 'code', content: '' }
  ] satisfies ProjectFile[];

  it('keeps an unused path', () => expect(uniquePath(files, 'helpers.js')).toBe('helpers.js'));
  it('numbers duplicate root files', () => expect(uniquePath(files, 'simulation.js')).toBe('simulation-2.js'));
  it('numbers duplicate nested files', () => expect(uniquePath(files, 'assets/note.txt')).toBe('assets/note-2.txt'));
});
