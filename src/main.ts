import './styles.css';
import './refinements.css';
import { createCodeEditor } from './code-editor';
import type { ParameterDefinition, ParameterSchema, ParameterValue, ParameterValues, RuntimeToHostMessage } from './engine/protocol';
import { isParameterDefinition } from './engine/parameters';
import { loadProject, saveProject, type ProjectFile } from './project-store';
import { RuntimeBridge } from './runtime-bridge';
import { BOUNCING_BALLS_CODE, BOUNCING_BALLS_HELPERS } from './samples/bouncing-balls';
import { ExportDialog } from './export/export-dialog';
import { WorkspaceFiles } from './workspace-files';
import { ProjectActions } from './project-actions';
import { ProjectDashboard } from './project-dashboard';

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing workspace element: ${selector}`);
  return element;
}

const project = await loadProject(BOUNCING_BALLS_CODE, [{ path: 'helpers.js', content: BOUNCING_BALLS_HELPERS }]);
const activeAtStart = project.files.find((file) => file.id === project.activeFileId && file.kind === 'code') || project.files[0];
const editorBody = query<HTMLElement>('.editor-body');
editorBody.innerHTML = '<div id="codeEditor" aria-label="Project code editor"></div>';
const viewport = query<HTMLElement>('.viewport');
viewport.querySelector('canvas')?.remove();
const stage = query<HTMLElement>('.stage');
const runButton = query<HTMLButtonElement>('.app-actions .run-button');
const [restartButton, playButton, stepButton] = [...document.querySelectorAll<HTMLButtonElement>('.transport-controls button')];
const timeReadout = query<HTMLParagraphElement>('.transport p');
const timeline = query<HTMLElement>('.timeline');
const progressBar = query<HTMLElement>('.timeline i');
const playhead = query<HTMLElement>('.timeline span');
const gridButton = query<HTMLButtonElement>('.grid-button');
const fullscreenButton = query<HTMLButtonElement>('.stage-tools button[title="Fullscreen"]');
const speedButton = query<HTMLButtonElement>('.transport .speed');
const audioButton = query<HTMLButtonElement>('.audio-controls button');
const audioVolume = query<HTMLInputElement>('.audio-controls input');
const worldWidthInput = query<HTMLInputElement>('#worldWidth');
const worldHeightInput = query<HTMLInputElement>('#worldHeight');
const logs = query<HTMLElement>('.logs');
const properties = query<HTMLElement>('.properties');
const saveState = query<HTMLElement>('.crumbs em');
const liveStatus = query<HTMLElement>('.live-status');
const problemCount = query<HTMLElement>('.console-tabs button:nth-child(2) b');
const profileStatus = query<HTMLElement>('.profile-status');
query<HTMLElement>('.crumbs > strong').textContent = project.name;
document.title = `${project.name} — Loop Lab`;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let currentSchema: ParameterSchema = {};
let currentParams: ParameterValues = {};
let pendingCode: string | null = null;
let initialRunComplete = false;
let isPlaying = true;
let isScrubbing = false;
let suppressEditorChange = false;
let errors = 0;
let navigatingToProject = false;

function entryFile(): ProjectFile {
  return project.files.find((file) => file.path === 'simulation.js') || project.files.find((file) => file.kind === 'code')!;
}

function projectSources(): Record<string, string> {
  return Object.fromEntries(project.files.filter((file) => file.kind === 'code' && /\.(?:js|ts)$/.test(file.path)).map((file) => [file.path, file.content]));
}

function projectAssets(): Record<string, string> {
  return Object.fromEntries(project.files.filter((file) => file.kind === 'asset').map((file) => [file.path, file.content]));
}

function setSaveState(saved: boolean): void {
  saveState.textContent = saved ? '● Saved' : '● Unsaved';
  saveState.classList.toggle('unsaved', !saved);
  document.querySelector<HTMLElement>('.tabs .active i')?.replaceChildren(document.createTextNode(saved ? '' : '●'));
  document.querySelector<HTMLElement>('.files .active i')?.replaceChildren(document.createTextNode(saved ? '' : '●'));
}

async function persistProject(): Promise<void> {
  try { await saveProject(project); setSaveState(true); }
  catch { setSaveState(false); addLog('Project storage is full. Remove large imported assets before closing.', 'error'); }
}

function scheduleSave(): void {
  setSaveState(false);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void persistProject(), 450);
}

const editor = createCodeEditor(query<HTMLElement>('#codeEditor'), activeAtStart.content, (code) => {
  if (suppressEditorChange) return;
  const active = project.files.find((file) => file.id === project.activeFileId);
  if (active?.kind === 'code') active.content = code;
  scheduleSave();
}, runCode, () => project.files.map((file) => file.path));

query<HTMLButtonElement>('.activity div:first-child button:nth-child(2)').addEventListener('click', () => editor.openSearch());

function showFile(file: ProjectFile): void {
  suppressEditorChange = true;
  editor.setCode(file.content);
  suppressEditorChange = false;
}

let workspaceFiles: WorkspaceFiles;
workspaceFiles = new WorkspaceFiles(project, {
  onActivate: showFile,
  onChange: scheduleSave,
  onNotice: (message) => addLog(message)
});
new ProjectActions(project, workspaceFiles, { onNotice: (message) => addLog(message) });
const dashboard = new ProjectDashboard(project, {
  onNotice: (message) => addLog(message, 'ok'),
  onNavigate: () => { navigatingToProject = true; if (saveTimer) clearTimeout(saveTimer); }
});
query<HTMLButtonElement>('.projects-link').addEventListener('click', () => void dashboard.open());
query<HTMLButtonElement>('.project-back').addEventListener('click', () => void dashboard.open());
setSaveState(true);

const runtime = new RuntimeBridge(viewport, handleRuntimeMessage, project.worldWidth, project.worldHeight);
runtime.start();

new ExportDialog(query<HTMLButtonElement>('.export-button'), () => ({
  code: entryFile().content,
  files: projectSources(),
  assets: projectAssets(),
  entry: entryFile().path,
  schema: currentSchema,
  params: { ...currentParams },
  worldWidth: project.worldWidth,
  worldHeight: project.worldHeight,
  history: project.exportHistory
}), (entry) => {
  project.exportHistory.unshift(entry);
  project.exportHistory = project.exportHistory.slice(0, 12);
  void persistProject();
});

function stamp(): string {
  return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHTML(value: unknown): string {
  const node = document.createElement('div'); node.textContent = String(value); return node.innerHTML;
}

function addLog(message: string, level: 'info' | 'ok' | 'warning' | 'error' = 'info', line?: number, column?: number, file = 'simulation.js'): void {
  const row = document.createElement(line ? 'button' : 'p');
  const icon = level === 'error' ? '×' : level === 'ok' ? '●' : level === 'warning' ? '!' : '›';
  row.innerHTML = `<time>${stamp()}</time><span class="${level}">${icon}</span> ${escapeHTML(message)}${line ? `<em>${escapeHTML(file)}:${line}${column ? `:${column}` : ''}</em>` : ''}`;
  if (line) {
    row.className = 'source-log';
    row.addEventListener('click', () => { const source = project.files.find((candidate) => candidate.path === file) || entryFile(); workspaceFiles.openFile(source.id); editor.focusLine(line); });
  }
  logs.append(row); logs.scrollTop = logs.scrollHeight;
}

function setRuntimeStatus(status: 'live' | 'paused' | 'error'): void {
  liveStatus.className = `live-status ${status}`;
  liveStatus.innerHTML = `<i></i>${status === 'live' ? 'Live' : status === 'paused' ? 'Paused' : 'Error'}`;
}

function runCode(): void {
  void runtime.resumeAudio();
  const entry = entryFile();
  if (project.activeFileId === entry.id) entry.content = editor.getCode();
  void persistProject(); pendingCode = entry.content; logs.innerHTML = ''; errors = 0; problemCount.textContent = '0';
  addLog('Compiling simulation…'); runtime.replace(); isPlaying = true; playButton.textContent = 'Ⅱ'; setRuntimeStatus('live');
}

function updateParameter(key: string, value: ParameterValue): void {
  currentParams[key] = value; project.parameterValues[key] = value;
  runtime.post({ type: 'params', params: { [key]: value } }); scheduleSave();
}

function renderParameters(schema: ParameterSchema, values: ParameterValues): void {
  currentSchema = schema; currentParams = { ...values }; properties.innerHTML = '';
  const groups = new Map<string, Array<[string, ParameterDefinition]>>();
  Object.entries(schema).forEach(([key, raw]) => {
    const definition = isParameterDefinition(raw) ? raw : { value: raw };
    const group = definition.group || 'Parameters'; if (!groups.has(group)) groups.set(group, []); groups.get(group)?.push([key, definition]);
  });
  groups.forEach((items, groupName) => {
    const section = document.createElement('section'); section.innerHTML = `<h3><span class="chevron-down"></span>${escapeHTML(groupName.toUpperCase())}</h3>`;
    items.forEach(([key, definition]) => {
      const label = document.createElement('label'); label.append(document.createTextNode(key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())));
      if (typeof definition.value === 'boolean') {
        const toggle = document.createElement('button'); toggle.className = `switch ${currentParams[key] ? 'active' : ''}`; toggle.innerHTML = '<i></i>';
        toggle.addEventListener('click', () => { const value = !currentParams[key]; toggle.classList.toggle('active', value); updateParameter(key, value); }); label.append(toggle);
      } else {
        const input = document.createElement('input'); input.value = String(currentParams[key]); input.type = definition.type === 'color' ? 'color' : 'number';
        if (definition.min != null) input.min = String(definition.min); if (definition.max != null) input.max = String(definition.max); if (definition.step != null) input.step = String(definition.step);
        input.addEventListener('input', () => updateParameter(key, input.type === 'number' ? Number(input.value) : input.value)); label.append(input);
      }
      section.append(label);
    }); properties.append(section);
  });
  scrubber.max = String(Math.max(60, Number(scrubber.max) || 60));
}

function handleRuntimeMessage(message: RuntimeToHostMessage): void {
  if (message.type === 'ready') {
    if (pendingCode !== null) { runtime.post({ type: 'run', code: pendingCode, files: projectSources(), assets: projectAssets(), entry: entryFile().path, params: project.parameterValues }); pendingCode = null; initialRunComplete = true; }
    else if (!initialRunComplete) { logs.innerHTML = ''; addLog('Compiling simulation…'); runtime.post({ type: 'run', code: entryFile().content, files: projectSources(), assets: projectAssets(), entry: entryFile().path, params: project.parameterValues }); initialRunComplete = true; }
  } else if (message.type === 'parameters') renderParameters(message.schema, message.params);
  else if (message.type === 'log') addLog(message.message, message.level);
  else if (message.type === 'error') {
    errors += 1; problemCount.textContent = String(errors); addLog(message.message, 'error', message.line, message.column, message.file);
    playButton.textContent = '▶'; isPlaying = false; setRuntimeStatus('error');
  } else if (message.type === 'status') {
    isPlaying = message.playing; playButton.textContent = isPlaying ? 'Ⅱ' : '▶'; if (!liveStatus.classList.contains('error')) setRuntimeStatus(isPlaying ? 'live' : 'paused');
  } else if (message.type === 'finished') {
    addLog(`Simulation finished: ${message.reason}`, 'ok');
    isPlaying = false; playButton.textContent = '▶'; setRuntimeStatus('paused'); updateTimeline(message.elapsed);
  } else if (message.type === 'audio') {
    audioButton.classList.remove('pulse'); void audioButton.offsetWidth; audioButton.classList.add('pulse');
  } else if (message.type === 'profile') {
    const profile = message.profile; const stressed = profile.frameMs > 16.7 || profile.objects > profile.maxObjects * 0.8;
    profileStatus.textContent = `${Math.round(profile.fps)} fps · ${profile.objects.toLocaleString()} objects`;
    profileStatus.classList.toggle('warning', stressed);
    profileStatus.title = `Update ${profile.updateMs.toFixed(2)} ms · Render ${profile.renderMs.toFixed(2)} ms · ${profile.longFrames} long frames in the last second · ${profile.objects}/${profile.maxObjects} objects`;
  } else if (message.type === 'time' && !isScrubbing) updateTimeline(message.elapsed);
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60); const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

function updateTimeline(elapsed: number): void {
  const range = Math.max(60, Number(scrubber.max) || 60, Math.ceil(elapsed / 10) * 10 + 10);
  scrubber.max = String(range); const percent = Math.min(100, (elapsed / range) * 100);
  timeReadout.innerHTML = `<b>${formatTime(elapsed)}</b>`;
  progressBar.style.width = `${percent}%`; playhead.style.left = `${percent}%`; scrubber.value = String(elapsed);
}

runButton.addEventListener('click', runCode);
restartButton.addEventListener('click', () => { void runtime.resumeAudio(); runtime.post({ type: 'restart' }); });
playButton.textContent = 'Ⅱ'; playButton.addEventListener('click', () => { void runtime.resumeAudio(); isPlaying = !isPlaying; runtime.post({ type: 'play', playing: isPlaying }); });
stepButton.addEventListener('click', () => { isPlaying = false; runtime.post({ type: 'step' }); });
viewport.addEventListener('pointerdown', () => void runtime.resumeAudio(), { once: true });
audioButton.addEventListener('click', () => {
  const muted = !runtime.isAudioMuted(); runtime.setAudioMuted(muted);
  audioButton.classList.toggle('muted', muted); audioButton.setAttribute('aria-pressed', String(muted));
  audioButton.textContent = muted ? '×' : '♪';
});
audioVolume.addEventListener('input', () => { runtime.setAudioVolume(Number(audioVolume.value)); if (runtime.isAudioMuted()) audioButton.click(); });

const scrubber = document.createElement('input');
scrubber.className = 'timeline-scrubber'; scrubber.type = 'range'; scrubber.min = '0'; scrubber.max = '60'; scrubber.step = String(1 / 60); scrubber.value = '0'; timeline.append(scrubber);
scrubber.addEventListener('pointerdown', () => { isScrubbing = true; runtime.post({ type: 'play', playing: false }); });
scrubber.addEventListener('input', () => updateTimeline(Number(scrubber.value)));
scrubber.addEventListener('change', () => { runtime.post({ type: 'seek', seconds: Number(scrubber.value) }); isScrubbing = false; });

const speedMenu = document.createElement('div'); speedMenu.className = 'speed-menu'; speedMenu.hidden = true;
[0.25, 0.5, 1, 2, 4].forEach((rate) => { const option = document.createElement('button'); option.textContent = `${rate}×`; option.className = rate === 1 ? 'active' : ''; option.addEventListener('click', () => { runtime.post({ type: 'speed', rate }); speedButton.firstChild!.textContent = `${rate}× `; speedMenu.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button === option)); speedMenu.hidden = true; }); speedMenu.append(option); });
query<HTMLElement>('.transport').append(speedMenu); speedButton.addEventListener('click', () => { speedMenu.hidden = !speedMenu.hidden; });

function setPseudoFullscreen(active: boolean): void {
  stage.classList.toggle('pseudo-fullscreen', active); fullscreenButton.textContent = active ? '×' : '⛶';
}
fullscreenButton.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else if (stage.classList.contains('pseudo-fullscreen')) setPseudoFullscreen(false);
  else void stage.requestFullscreen().catch(() => setPseudoFullscreen(true));
});
document.addEventListener('fullscreenchange', () => { stage.classList.toggle('fullscreen', document.fullscreenElement === stage); fullscreenButton.textContent = document.fullscreenElement ? '×' : '⛶'; });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && stage.classList.contains('pseudo-fullscreen')) setPseudoFullscreen(false); });

if (!project.gridVisible) { viewport.classList.add('grid-off'); gridButton.classList.add('inactive'); }
gridButton.addEventListener('click', () => { project.gridVisible = !viewport.classList.toggle('grid-off'); gridButton.classList.toggle('inactive', !project.gridVisible); scheduleSave(); });

worldWidthInput.value = String(project.worldWidth); worldHeightInput.value = String(project.worldHeight);
function applyViewportAspect(): void { viewport.style.aspectRatio = `${project.worldWidth} / ${project.worldHeight}`; }
applyViewportAspect();
function updateDimensions(): void {
  project.worldWidth = Math.max(64, Math.min(4096, Number(worldWidthInput.value) || 1080)); project.worldHeight = Math.max(64, Math.min(4096, Number(worldHeightInput.value) || 1080));
  worldWidthInput.value = String(project.worldWidth); worldHeightInput.value = String(project.worldHeight); applyViewportAspect(); runtime.resize(project.worldWidth, project.worldHeight); runtime.post({ type: 'restart' }); scheduleSave();
}
let dimensionTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDimensionUpdate(): void { if (dimensionTimer) clearTimeout(dimensionTimer); dimensionTimer = setTimeout(updateDimensions, 250); }
worldWidthInput.addEventListener('input', scheduleDimensionUpdate); worldHeightInput.addEventListener('input', scheduleDimensionUpdate);

window.addEventListener('beforeunload', () => { if (!navigatingToProject) void persistProject(); runtime.destroy(); editor.destroy(); });
