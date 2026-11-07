import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const loopHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: '#c7a0ff' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#e9d18b' },
  { tag: [tags.string, tags.special(tags.string)], color: '#b6d78b' },
  { tag: [tags.number, tags.bool, tags.null], color: '#ff7e45' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#6f747c', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className], color: '#73c7ff' },
  { tag: tags.propertyName, color: '#d7d8dc' }
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#151619', color: '#d7d8dc', fontSize: '12px' },
  '.cm-scroller': { fontFamily: '"DM Mono", monospace', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '14px 0', caretColor: '#ff6b2c' },
  '.cm-gutters': { backgroundColor: '#151619', color: '#50555d', borderRight: '1px solid #222428' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,.025)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(255,107,44,.24)' },
  '.cm-cursor': { borderLeftColor: '#ff6b2c' },
  '.cm-foldGutter': { display: 'none' }
}, { dark: true });

export interface CodeEditor {
  getCode(): string;
  setCode(code: string): void;
  focusLine(line: number): void;
  destroy(): void;
}

export function createCodeEditor(
  parent: HTMLElement,
  initialCode: string,
  onChange: (code: string) => void,
  onRun: () => void
): CodeEditor {
  const view = new EditorView({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      editorTheme,
      syntaxHighlighting(loopHighlight),
      keymap.of([indentWithTab, { key: 'Mod-Enter', run: () => { onRun(); return true; } }]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      })
    ],
    parent
  });
  return {
    getCode: () => view.state.doc.toString(),
    setCode: (code: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    focusLine: (line: number) => {
      const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
      const position = view.state.doc.line(safeLine).from;
      view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
      view.focus();
    },
    destroy: () => view.destroy()
  };
}
