import { describe, expect, it } from 'vitest';
import { compactDiff, lineDiff } from './line-diff';

describe('lineDiff', () => {
  it('marks inserted and removed lines with stable line numbers', () => {
    const result = lineDiff('one\ntwo\nthree', 'one\nchanged\nthree\nfour');
    expect(result.map((line) => line.kind)).toEqual(['context', 'add', 'remove', 'context', 'add']);
    expect(result.find((line) => line.text === 'changed')).toMatchObject({ kind: 'add', newLine: 2 });
    expect(result.find((line) => line.text === 'two')).toMatchObject({ kind: 'remove', oldLine: 2 });
  });

  it('collapses distant unchanged regions while preserving context', () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
    const after = before.replace('line 10', 'changed');
    const compact = compactDiff(lineDiff(before, after), 2);
    expect(compact.some((line) => line.kind === 'skip' && (line.count || 0) > 0)).toBe(true);
    expect(compact.some((line) => line.text === 'changed' && line.kind === 'add')).toBe(true);
  });
});
