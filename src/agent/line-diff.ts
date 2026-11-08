export type DiffKind = 'context' | 'add' | 'remove' | 'skip';
export interface DiffLine { kind: DiffKind; text: string; oldLine?: number; newLine?: number; count?: number }

function splitLines(value: string): string[] {
  return value ? value.replace(/\r\n/g, '\n').split('\n') : [];
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const oldLines = splitLines(before); const newLines = splitLines(after);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix); const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  const result: DiffLine[] = oldLines.slice(0, prefix).map((text, index) => ({ kind: 'context', text, oldLine: index + 1, newLine: index + 1 }));
  let oldNumber = prefix + 1; let newNumber = prefix + 1;

  if (oldMiddle.length * newMiddle.length <= 250_000) {
    const table = Array.from({ length: oldMiddle.length + 1 }, () => new Uint32Array(newMiddle.length + 1));
    for (let oldIndex = oldMiddle.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newMiddle.length - 1; newIndex >= 0; newIndex -= 1) {
        table[oldIndex][newIndex] = oldMiddle[oldIndex] === newMiddle[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
      }
    }
    let oldIndex = 0; let newIndex = 0;
    while (oldIndex < oldMiddle.length || newIndex < newMiddle.length) {
      if (oldIndex < oldMiddle.length && newIndex < newMiddle.length && oldMiddle[oldIndex] === newMiddle[newIndex]) {
        result.push({ kind: 'context', text: oldMiddle[oldIndex], oldLine: oldNumber++, newLine: newNumber++ }); oldIndex += 1; newIndex += 1;
      } else if (newIndex < newMiddle.length && (oldIndex === oldMiddle.length || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
        result.push({ kind: 'add', text: newMiddle[newIndex++], newLine: newNumber++ });
      } else {
        result.push({ kind: 'remove', text: oldMiddle[oldIndex++], oldLine: oldNumber++ });
      }
    }
  } else {
    oldMiddle.forEach((text) => result.push({ kind: 'remove', text, oldLine: oldNumber++ }));
    newMiddle.forEach((text) => result.push({ kind: 'add', text, newLine: newNumber++ }));
  }

  for (let index = suffix; index > 0; index -= 1) {
    const text = oldLines[oldLines.length - index]; result.push({ kind: 'context', text, oldLine: oldNumber++, newLine: newNumber++ });
  }
  return result;
}

export function compactDiff(lines: DiffLine[], context = 3): DiffLine[] {
  const changed = lines.map((line, index) => line.kind !== 'context' ? index : -1).filter((index) => index >= 0);
  if (!changed.length) return lines.slice(0, Math.min(lines.length, context * 2 + 1));
  const visible = new Set<number>();
  changed.forEach((index) => {
    for (let offset = -context; offset <= context; offset += 1) if (index + offset >= 0 && index + offset < lines.length) visible.add(index + offset);
  });
  const result: DiffLine[] = []; let index = 0;
  while (index < lines.length) {
    if (visible.has(index)) { result.push(lines[index]); index += 1; continue; }
    const start = index; while (index < lines.length && !visible.has(index)) index += 1;
    result.push({ kind: 'skip', text: '', count: index - start });
  }
  return result;
}

