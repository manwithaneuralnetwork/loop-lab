import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { hoverTooltip, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';

const WORLD_COMPLETIONS: Completion[] = [
  { label: 'circle', type: 'method', detail: '(options) → Body', info: 'Create a circular body and add it to the world.', apply: 'circle({ x: 0, y: 0, radius: 10 })' },
  { label: 'rectangle', type: 'method', detail: '(options) → Body', info: 'Create an axis-aligned rectangular body.', apply: 'rectangle({ x: 0, y: 0, width: 20, height: 20 })' },
  { label: 'sprite', type: 'method', detail: '(options) → Body', info: 'Create a sprite using an imported project asset.', apply: 'sprite({ asset: "assets/image.png", x: 0, y: 0, width: 64, height: 64 })' },
  { label: 'text', type: 'method', detail: '(options) → Body', info: 'Create a text object.', apply: 'text({ text: "Label", x: 0, y: 0 })' },
  { label: 'playSound', type: 'method', detail: '(path, options?) → id', info: 'Play imported audio with optional volume, rate, pan, and loop.', apply: 'playSound("assets/sound.mp3", { volume: 0.3 })' },
  { label: 'finish', type: 'method', detail: '(reason?)', info: 'Finish the simulation when its own completion condition is met.', apply: 'finish("Complete")' },
  { label: 'random', type: 'method', detail: '(min?, max?) → number', info: 'Generate a deterministic seeded random number.' },
  { label: 'find', type: 'method', detail: '(idOrName) → Body?', info: 'Find an object by stable ID or name.' },
  { label: 'tagged', type: 'method', detail: '(tag) → Body[]', info: 'Return active objects with a tag.' },
  { label: 'remove', type: 'method', detail: '(bodyOrId) → boolean', info: 'Remove an object immediately.' },
  { label: 'overlaps', type: 'method', detail: '(a, b) → boolean', info: 'Test whether two body bounds overlap.' },
  { label: 'queryPoint', type: 'method', detail: '(x, y) → Body[]', info: 'Find objects under a world-space point.' },
  { label: 'queryBounds', type: 'method', detail: '(bounds) → Body[]', info: 'Find objects intersecting a region.' },
  { label: 'hasAsset', type: 'method', detail: '(path) → boolean', info: 'Check whether a project asset exists.' },
  { label: 'asset', type: 'method', detail: '(path) → string', info: 'Resolve an imported asset to its runtime URL.' },
  { label: 'objects', type: 'property', detail: 'Body[]', info: 'All current renderable objects.' },
  { label: 'input', type: 'property', detail: '{ pointer, keys }', info: 'Pointer and keyboard state in world coordinates.' },
  { label: 'camera', type: 'property', detail: 'Camera', info: 'The world camera: position, zoom, and centerOn().' },
  { label: 'elapsed', type: 'property', detail: 'number', info: 'Elapsed fixed-step simulation time in seconds.' },
  { label: 'frame', type: 'property', detail: 'number', info: 'Current fixed-step frame number.' },
  { label: 'width', type: 'property', detail: 'number', info: 'World width.' },
  { label: 'height', type: 'property', detail: 'number', info: 'World height.' },
  { label: 'bounds', type: 'property', detail: 'Bounds', info: 'World boundary rectangle.' },
  { label: 'background', type: 'property', detail: 'string', info: 'Canvas background color.' }
];

const BODY_COMPLETIONS: Completion[] = [
  { label: 'position', type: 'property', detail: '{ x, y }', info: 'World-space center position.' },
  { label: 'velocity', type: 'property', detail: '{ x, y }', info: 'Velocity in world units per second.' },
  { label: 'hit', type: 'method', detail: '(side) → boolean', info: 'Whether the body hit a world boundary during the previous step.', apply: 'hit("bottom")' },
  { label: 'touches', type: 'method', detail: '(bodyOrId) → boolean', info: 'Whether this body contacted another body during the previous step.' },
  { label: 'destroy', type: 'method', detail: '()', info: 'Safely remove this body after the current step.' },
  { label: 'hasTag', type: 'method', detail: '(tag) → boolean', info: 'Check an object tag.' },
  { label: 'restitution', type: 'property', detail: 'number', info: 'Collision bounciness from 0 to 1.' },
  { label: 'collidable', type: 'property', detail: 'boolean', info: 'Enable or disable object collision response.' },
  { label: 'static', type: 'property', detail: 'boolean', info: 'Static bodies collide but do not move.' },
  { label: 'layer', type: 'property', detail: 'number', info: 'Render order; higher layers draw later.' },
  { label: 'visible', type: 'property', detail: 'boolean', info: 'Whether the body is rendered.' },
  { label: 'active', type: 'property', detail: 'boolean', info: 'Whether the body updates and collides.' }
];

const CAMERA_COMPLETIONS: Completion[] = [
  { label: 'centerOn', type: 'method', detail: '(x, y)', info: 'Center the camera on a world position.' },
  { label: 'zoom', type: 'property', detail: 'number', info: 'Camera scale. 1 is the default.' },
  { label: 'x', type: 'property', detail: 'number', info: 'Camera world-space left edge.' },
  { label: 'y', type: 'property', detail: 'number', info: 'Camera world-space top edge.' }
];

const ROOT_COMPLETIONS: Completion[] = [
  { label: 'setup', type: 'function', detail: 'export function setup(world, params)', info: 'Runs once when the simulation starts or restarts.', apply: 'export function setup(world, params) {\n  \n}' },
  { label: 'update', type: 'function', detail: 'export function update(world, dt, params)', info: 'Runs at a deterministic fixed 60 Hz.', apply: 'export function update(world, dt, params) {\n  \n}' },
  { label: 'parameters', type: 'variable', detail: 'export const parameters', info: 'Expose code-owned values in the Parameters panel.', apply: 'export const parameters = {\n  speed: { value: 1, min: 0, max: 10, step: 0.1, group: "Simulation" }\n};' }
];

function parameterCompletions(code: string): Completion[] {
  const block = code.match(/export\s+const\s+parameters\s*=\s*\{([\s\S]*?)\n\s*\};?/m)?.[1] || '';
  return [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => ({
    label: match[1], type: 'property', detail: 'exposed parameter', info: `The current value of ${match[1]} from the Parameters panel.`
  }));
}

function loopCompletions(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/[\w$.]*$/);
  if (!before || (before.from === before.to && !context.explicit)) return null;
  const chain = before.text;
  const dot = chain.lastIndexOf('.');
  if (dot >= 0) {
    const owner = chain.slice(0, dot);
    const from = before.from + dot + 1;
    if (owner.endsWith('world.camera')) return { from, options: CAMERA_COMPLETIONS, validFor: /^\w*$/ };
    if (owner === 'world' || owner.endsWith('.world')) return { from, options: WORLD_COMPLETIONS, validFor: /^\w*$/ };
    if (owner === 'params') return { from, options: parameterCompletions(context.state.doc.toString()), validFor: /^\w*$/ };
    if (/(?:ball|body|player|object|target)$/i.test(owner)) return { from, options: BODY_COMPLETIONS, validFor: /^\w*$/ };
  }
  if (!context.explicit && chain.length < 2) return null;
  return { from: before.from, options: ROOT_COMPLETIONS, validFor: /^\w*$/ };
}

function loopDiagnostics(code: string, state: Parameters<typeof syntaxTree>[0], projectPaths: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const cursor = syntaxTree(state).cursor();
  do {
    if (cursor.type.isError) diagnostics.push({ from: cursor.from, to: Math.max(cursor.from + 1, cursor.to), severity: 'error', message: 'JavaScript syntax error.' });
  } while (cursor.next());
  const warn = (expression: RegExp, message: string, severity: Diagnostic['severity'] = 'warning') => {
    for (const match of code.matchAll(expression)) diagnostics.push({ from: match.index, to: match.index + match[0].length, severity, message });
  };
  warn(/Math\.random\s*\(/g, 'Use world.random() so playback and exports remain deterministic.');
  warn(/(?:requestAnimationFrame|setInterval|setTimeout)\s*\(/g, 'Use update(world, dt, params); Loop Lab owns the fixed-step clock.');
  for (const match of code.matchAll(/(?:import[\s\S]*?from\s*|import\s*)["']([^"']+)["']/g)) {
    if (!match[1].startsWith('.')) diagnostics.push({ from: match.index, to: match.index + match[0].length, severity: 'error', message: 'Only relative project imports are currently supported.' });
  }
  for (const match of code.matchAll(/world\.(?:asset|playSound)\(\s*["']([^"']+)["']/g)) {
    if (!projectPaths.includes(match[1])) diagnostics.push({ from: match.index, to: match.index + match[0].length, severity: 'error', message: `Project asset not found: ${match[1]}` });
  }
  return diagnostics;
}

const documentation = new Map([...WORLD_COMPLETIONS, ...BODY_COMPLETIONS, ...CAMERA_COMPLETIONS].map((completion) => [completion.label, completion]));

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
  ,'.cm-tooltip': { border: '1px solid #383c42', backgroundColor: '#1b1d20', color: '#d7d8dc' }
  ,'.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#30231e', color: '#fff' }
  ,'.cm-completionDetail': { color: '#858a91', fontStyle: 'normal' }
  ,'.cm-diagnostic': { fontFamily: 'Manrope, sans-serif', fontSize: '11px' }
}, { dark: true });

export interface CodeEditor {
  getCode(): string;
  setCode(code: string): void;
  focusLine(line: number): void;
  openSearch(): void;
  destroy(): void;
}

export function createCodeEditor(
  parent: HTMLElement,
  initialCode: string,
  onChange: (code: string) => void,
  onRun: () => void,
  getProjectPaths: () => string[] = () => []
): CodeEditor {
  const view = new EditorView({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      editorTheme,
      syntaxHighlighting(loopHighlight),
      autocompletion({ override: [loopCompletions], activateOnTyping: true }),
      lintGutter(),
      linter((view) => loopDiagnostics(view.state.doc.toString(), view.state, getProjectPaths()), { delay: 350 }),
      hoverTooltip((view, position) => {
        const word = view.state.wordAt(position); if (!word) return null;
        const item = documentation.get(view.state.doc.sliceString(word.from, word.to)); if (!item) return null;
        return { pos: word.from, end: word.to, above: true, create: () => {
          const dom = document.createElement('div'); dom.className = 'loop-doc-tooltip';
          dom.innerHTML = `<strong>${item.label}</strong><code>${item.detail || ''}</code><p>${String(item.info || '')}</p>`;
          return { dom };
        } };
      }),
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
    openSearch: () => { openSearchPanel(view); view.focus(); },
    destroy: () => view.destroy()
  };
}
