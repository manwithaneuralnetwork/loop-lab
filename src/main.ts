import './styles.css';
import './refinements.css';
import { createCodeEditor } from './code-editor';
import type { ParameterDefinition, ParameterSchema, ParameterValue, ParameterValues, RuntimeToHostMessage } from './engine/protocol';
import { isParameterDefinition } from './engine/parameters';
import { loadProject, saveProject } from './project-store';
import { RuntimeBridge } from './runtime-bridge';
import { BOUNCING_BALLS_CODE } from './samples/bouncing-balls';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing workspace element: ${selector}`);
  return element;
}

const project = loadProject(BOUNCING_BALLS_CODE);
const editorBody = query<HTMLElement>('.editor-body');
editorBody.innerHTML = '<div id="codeEditor" aria-label="Simulation code"></div>';

const viewport = query<HTMLElement>('.viewport');
viewport.querySelector('canvas')?.remove();
const runButton = query<HTMLButtonElement>('.app-actions .run-button');
const [restartButton, playButton, stepButton] = [...document.querySelectorAll<HTMLButtonElement>('.transport-controls button')];
const timeReadout = query<HTMLParagraphElement>('.transport p');
const progressBar = query<HTMLElement>('.timeline i');
const playhead = query<HTMLElement>('.timeline span');
const gridButton = query<HTMLButtonElement>('.grid-button');
const worldWidthInput = query<HTMLInputElement>('#worldWidth');
const worldHeightInput = query<HTMLInputElement>('#worldHeight');
const logs = query<HTMLElement>('.logs');
const properties = query<HTMLElement>('.properties');
const saveState = query<HTMLElement>('.crumbs em');

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let currentParams: ParameterValues = {};
let pendingCode: string | null = null;
let initialRunComplete = false;
let isPlaying = true;

function setSaveState(saved: boolean): void {
  saveState.textContent = saved ? '● Saved' : '● Unsaved';
  saveState.classList.toggle('unsaved', !saved);
  query<HTMLElement>('.tabs .active i').textContent = saved ? '' : '●';
  query<HTMLElement>('.files .active i').textContent = saved ? '' : '●';
}

function persistProject(): void {
  saveProject(project);
  setSaveState(true);
}

function scheduleSave(): void {
  setSaveState(false);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistProject, 450);
}

const editor = createCodeEditor(
  query<HTMLElement>('#codeEditor'),
  project.code,
  (code) => { project.code = code; scheduleSave(); },
  runCode
);
setSaveState(true);

const runtime = new RuntimeBridge(viewport, handleRuntimeMessage, project.worldWidth, project.worldHeight);
runtime.start();

function stamp(): string {
  return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHTML(value: unknown): string {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}

function addLog(message: string, level: 'info' | 'ok' | 'error' = 'info'): void {
  const row = document.createElement('p');
  const icon = level === 'error' ? '×' : level === 'ok' ? '●' : '›';
  row.innerHTML = `<time>${stamp()}</time><span class="${level}">${icon}</span> ${escapeHTML(message)}`;
  logs.append(row);
  logs.scrollTop = logs.scrollHeight;
}

function runCode(): void {
  project.code = editor.getCode();
  persistProject();
  pendingCode = project.code;
  logs.innerHTML = '';
  addLog('Compiling simulation…');
  runtime.replace();
  isPlaying = true;
  playButton.textContent = 'Ⅱ';
}

function updateParameter(key: string, value: ParameterValue): void {
  currentParams[key] = value;
  project.parameterValues[key] = value;
  runtime.post({ type: 'params', params: { [key]: value } });
  scheduleSave();
}

function renderParameters(schema: ParameterSchema, values: ParameterValues): void {
  currentParams = { ...values };
  properties.innerHTML = '';
  const groups = new Map<string, Array<[string, ParameterDefinition]>>();
  Object.entries(schema).forEach(([key, rawDefinition]) => {
    const definition = isParameterDefinition(rawDefinition) ? rawDefinition : { value: rawDefinition };
    const group = definition.group || 'Parameters';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)?.push([key, definition]);
  });

  groups.forEach((items, groupName) => {
    const section = document.createElement('section');
    section.innerHTML = `<h3><span class="chevron-down"></span>${escapeHTML(groupName.toUpperCase())}</h3>`;
    items.forEach(([key, definition]) => {
      const label = document.createElement('label');
      label.append(document.createTextNode(key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())));
      if (typeof definition.value === 'boolean') {
        const toggle = document.createElement('button');
        toggle.className = `switch ${currentParams[key] ? 'active' : ''}`;
        toggle.innerHTML = '<i></i>';
        toggle.addEventListener('click', () => {
          const value = !currentParams[key];
          toggle.classList.toggle('active', Boolean(value));
          updateParameter(key, value);
        });
        label.append(toggle);
      } else {
        const input = document.createElement('input');
        input.value = String(currentParams[key]);
        input.type = definition.type === 'color' ? 'color' : 'number';
        if (definition.min != null) input.min = String(definition.min);
        if (definition.max != null) input.max = String(definition.max);
        if (definition.step != null) input.step = String(definition.step);
        input.addEventListener('input', () => updateParameter(key, input.type === 'number' ? Number(input.value) : input.value));
        label.append(input);
      }
      section.append(label);
    });
    properties.append(section);
  });
}

function handleRuntimeMessage(message: RuntimeToHostMessage): void {
  if (message.type === 'ready') {
    if (pendingCode !== null) {
      runtime.post({ type: 'run', code: pendingCode, params: project.parameterValues });
      pendingCode = null;
      initialRunComplete = true;
    } else if (!initialRunComplete) {
      logs.innerHTML = '';
      addLog('Compiling simulation…');
      runtime.post({ type: 'run', code: editor.getCode(), params: project.parameterValues });
      initialRunComplete = true;
    }
  } else if (message.type === 'parameters') renderParameters(message.schema, message.params);
  else if (message.type === 'log') addLog(message.message, message.level);
  else if (message.type === 'error') {
    addLog(message.message, 'error');
    playButton.textContent = '▶';
    isPlaying = false;
  } else if (message.type === 'status') {
    isPlaying = message.playing;
    playButton.textContent = isPlaying ? 'Ⅱ' : '▶';
  } else if (message.type === 'time') {
    const total = Number(currentParams.duration) || 0;
    const percent = total ? Math.min(100, (message.elapsed / total) * 100) : 0;
    timeReadout.innerHTML = total
      ? `<b>${formatTime(message.elapsed)}</b> / ${formatTime(total)}`
      : `<b>${formatTime(message.elapsed)}</b>`;
    progressBar.style.width = `${percent}%`;
    playhead.style.left = `${percent}%`;
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

runButton.addEventListener('click', runCode);
restartButton.addEventListener('click', () => runtime.post({ type: 'restart' }));
playButton.textContent = 'Ⅱ';
playButton.addEventListener('click', () => {
  isPlaying = !isPlaying;
  playButton.textContent = isPlaying ? 'Ⅱ' : '▶';
  runtime.post({ type: 'play', playing: isPlaying });
});
stepButton.addEventListener('click', () => {
  isPlaying = false;
  playButton.textContent = '▶';
  runtime.post({ type: 'step' });
});

if (!project.gridVisible) {
  viewport.classList.add('grid-off');
  gridButton.classList.add('inactive');
}
gridButton.addEventListener('click', () => {
  project.gridVisible = !viewport.classList.toggle('grid-off');
  gridButton.classList.toggle('inactive', !project.gridVisible);
  scheduleSave();
});

worldWidthInput.value = String(project.worldWidth);
worldHeightInput.value = String(project.worldHeight);
function applyViewportAspect(): void {
  viewport.style.aspectRatio = `${project.worldWidth} / ${project.worldHeight}`;
}
applyViewportAspect();

function updateDimensions(): void {
  project.worldWidth = Math.max(64, Math.min(4096, Number(worldWidthInput.value) || 1080));
  project.worldHeight = Math.max(64, Math.min(4096, Number(worldHeightInput.value) || 1080));
  worldWidthInput.value = String(project.worldWidth);
  worldHeightInput.value = String(project.worldHeight);
  applyViewportAspect();
  runtime.resize(project.worldWidth, project.worldHeight);
  runtime.post({ type: 'restart' });
  scheduleSave();
}

let dimensionTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDimensionUpdate(): void {
  if (dimensionTimer) clearTimeout(dimensionTimer);
  dimensionTimer = setTimeout(updateDimensions, 250);
}
worldWidthInput.addEventListener('input', scheduleDimensionUpdate);
worldHeightInput.addEventListener('input', scheduleDimensionUpdate);

window.addEventListener('beforeunload', () => {
  persistProject();
  runtime.dispose();
  editor.destroy();
});
