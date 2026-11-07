import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const SAMPLE_CODE = `// Loop Lab — Bouncing Balls
// Edit a value or behavior, then click Run code.

export const parameters = {
  seed:        { value: 42, min: 1, max: 999, step: 1, group: "Simulation" },
  count:       { value: 14, min: 1, max: 50, step: 1, group: "Simulation" },
  duration:    { value: 20, min: 1, max: 120, step: 1, group: "Simulation" },
  autoRestart: { value: true, group: "Simulation" },
  gravity:     { value: 520, min: 0, max: 1200, step: 10, group: "Physics" },
  restitution: { value: 0.88, min: 0.2, max: 1, step: 0.01, group: "Physics" },
  speed:       { value: 1, min: 0.25, max: 2, step: 0.05, group: "Physics" },
  trails:      { value: true, group: "Appearance" },
  ballColor:   { value: "#ff6b2c", type: "color", group: "Appearance" }
};

export function setup(world, params) {
  world.background = "#121315";

  for (let i = 0; i < params.count; i++) {
    world.circle({
      x: world.random(30, world.width - 30),
      y: world.random(30, world.height * 0.48),
      radius: world.random(7, 15),
      color: i % 5 === 0 ? "#f4f3ef" : params.ballColor,
      vx: world.random(-170, 170) * params.speed,
      vy: world.random(-40, 80) * params.speed,
      bounce: true,
      trail: params.trails ? 18 : 0
    });
  }
}

export function update(world, dt, params) {
  for (const ball of world.objects) {
    ball.velocity.y += params.gravity * dt;
    ball.restitution = params.restitution;
  }
}`;

const WORKER_SOURCE = String.raw`
let canvas, ctx, width = 640, height = 640;
let playing = true, timer = null, elapsed = 0, frame = 0;
let code = "", params = {}, schema = {}, hooks = {};
const STEP = 1 / 60;

function send(type, detail = {}) { postMessage({ type, ...detail }); }
function makeRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

class Body {
  constructor(kind, options) {
    this.kind = kind;
    this.position = { x: Number(options.x) || 0, y: Number(options.y) || 0 };
    this.velocity = { x: Number(options.vx) || 0, y: Number(options.vy) || 0 };
    this.radius = Number(options.radius) || 10;
    this.width = Number(options.width) || 20;
    this.height = Number(options.height) || 20;
    this.color = options.color || "#ff6b2c";
    this.bounce = Boolean(options.bounce);
    this.restitution = Number(options.restitution ?? 0.88);
    this.trailLength = Number(options.trail) || 0;
    this.trail = [];
  }
  bounceInside(bounds, restitution = this.restitution) {
    const rx = this.kind === "circle" ? this.radius : this.width / 2;
    const ry = this.kind === "circle" ? this.radius : this.height / 2;
    if (this.position.x - rx < bounds.left) { this.position.x = bounds.left + rx; this.velocity.x = Math.abs(this.velocity.x) * restitution; }
    if (this.position.x + rx > bounds.right) { this.position.x = bounds.right - rx; this.velocity.x = -Math.abs(this.velocity.x) * restitution; }
    if (this.position.y - ry < bounds.top) { this.position.y = bounds.top + ry; this.velocity.y = Math.abs(this.velocity.y) * restitution; }
    if (this.position.y + ry > bounds.bottom) { this.position.y = bounds.bottom - ry; this.velocity.y = -Math.abs(this.velocity.y) * restitution; }
  }
}

function createWorld(seed) {
  const random = makeRandom(seed);
  const world = {
    objects: [], background: "#121315", width, height,
    bounds: { left: 0, top: 0, right: width, bottom: height },
    random(min = 0, max = 1) { return min + random() * (max - min); },
    circle(options = {}) { const body = new Body("circle", options); this.objects.push(body); return body; },
    rectangle(options = {}) { const body = new Body("rectangle", options); this.objects.push(body); return body; },
    clear() { this.objects.length = 0; }
  };
  return world;
}
let world = createWorld(1);

function compile(source) {
  const transformed = source.replace(/\bexport\s+(?=(const|let|var|function|class)\b)/g, "");
  const factory = new Function("world", "params", "\"use strict\";\n" + transformed + "\nreturn { parameters: typeof parameters !== \"undefined\" ? parameters : {}, setup: typeof setup === \"function\" ? setup : null, update: typeof update === \"function\" ? update : null };");
  return factory(world, params);
}

function defaultsFromSchema(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, definition]) => [key, definition && typeof definition === "object" && "value" in definition ? definition.value : definition]));
}

function reset() {
  elapsed = 0; frame = 0;
  try {
    const firstPass = compile(code);
    schema = firstPass.parameters || {};
    params = { ...defaultsFromSchema(schema), ...params };
    world = createWorld(params.seed || 1);
    hooks = compile(code);
    if (hooks.setup) hooks.setup(world, params);
    send("parameters", { schema, params });
    send("log", { level: "ok", message: "Simulation initialized with seed " + (params.seed ?? 1) });
    send("log", { level: "info", message: "Created " + world.objects.length + " objects" });
    render();
  } catch (error) { fail(error); }
}

function fail(error) {
  playing = false;
  send("error", { message: error?.message || String(error), stack: error?.stack || "" });
}

function simulateStep() {
  try {
    if (hooks.update) hooks.update(world, STEP, params);
    for (const body of world.objects) {
      if (body.trailLength) {
        body.trail.push({ x: body.position.x, y: body.position.y });
        if (body.trail.length > body.trailLength) body.trail.shift();
      }
      body.position.x += body.velocity.x * STEP;
      body.position.y += body.velocity.y * STEP;
      if (body.bounce) body.bounceInside(world.bounds);
    }
    elapsed += STEP; frame += 1;
  } catch (error) { fail(error); }
}

function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = world.background || "#121315";
  ctx.fillRect(0, 0, width, height);
  for (const body of world.objects) {
    if (body.trail.length) {
      body.trail.forEach((point, index) => {
        ctx.globalAlpha = (index + 1) / body.trail.length * 0.23;
        ctx.fillStyle = body.color;
        ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(1, body.radius * 0.42), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = body.color; ctx.shadowBlur = 13; ctx.fillStyle = body.color;
    if (body.kind === "circle") { ctx.beginPath(); ctx.arc(body.position.x, body.position.y, body.radius, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(body.position.x - body.width / 2, body.position.y - body.height / 2, body.width, body.height);
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}

function tick() {
  if (!playing) return;
  simulateStep();
  if (Number(params.duration) > 0 && elapsed >= Number(params.duration)) {
    if (params.autoRestart !== false) reset();
    else { playing = false; send("status", { playing }); render(); }
  } else render();
  if (frame % 6 === 0) send("time", { elapsed, frame, objectCount: world.objects.length });
}

onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    canvas = message.canvas; width = message.width; height = message.height;
    canvas.width = width; canvas.height = height; ctx = canvas.getContext("2d");
    timer = setInterval(tick, 1000 / 60); send("ready");
  }
  if (message.type === "run") { code = message.code; params = { ...(message.params || {}) }; playing = true; reset(); }
  if (message.type === "restart") { playing = true; reset(); }
  if (message.type === "play") { playing = message.playing; send("status", { playing }); }
  if (message.type === "step") { playing = false; simulateStep(); render(); send("time", { elapsed, frame, objectCount: world.objects.length }); }
  if (message.type === "params") { params = { ...params, ...message.params }; send("log", { level: "info", message: "Parameters updated" }); }
  if (message.type === "resize") { width = message.width; height = message.height; canvas.width = width; canvas.height = height; world.width = width; world.height = height; world.bounds.right = width; world.bounds.bottom = height; render(); }
};
`;

const RUNTIME_HTML = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src 'none'"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style></head><body><script>
const workerSource = ${JSON.stringify(WORKER_SOURCE)};
let worker, canvas;
function bootWorker() {
  if (worker) worker.terminate();
  if (canvas) canvas.remove();
  canvas = document.createElement('canvas'); document.body.append(canvas);
  worker = new Worker(URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'})));
  worker.onmessage = (event) => parent.postMessage({ channel:'loop-runtime', ...event.data }, '*');
  worker.onerror = (event) => parent.postMessage({ channel:'loop-runtime', type:'error', message:event.message }, '*');
  const rect = document.body.getBoundingClientRect();
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type:'init', canvas:offscreen, width:Math.max(1,Math.round(rect.width)), height:Math.max(1,Math.round(rect.height)) }, [offscreen]);
}
bootWorker();
addEventListener('message', event => {
  if (!event.data || event.data.channel !== 'loop-host') return;
  if (event.data.type === 'replace-worker') bootWorker();
  else worker?.postMessage(event.data);
});
new ResizeObserver(entries => { const r=entries[0].contentRect; worker?.postMessage({type:'resize',width:Math.max(1,Math.round(r.width)),height:Math.max(1,Math.round(r.height))}); }).observe(document.body);
<\/script></body></html>`;

const editorBody = document.querySelector('.editor-body');
editorBody.innerHTML = '<div id="codeEditor" aria-label="Simulation code"></div>';

const STORAGE_KEY = 'loop-lab.project.v1';
const savedProject = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
})();
const project = {
  code: savedProject?.code || SAMPLE_CODE,
  parameterValues: savedProject?.parameterValues || {},
  gridVisible: savedProject?.gridVisible ?? true
};
const saveState = document.querySelector('.crumbs em');
let saveTimer = null;

function setSaveState(saved) {
  saveState.textContent = saved ? '● Saved' : '● Unsaved';
  saveState.classList.toggle('unsaved', !saved);
  document.querySelector('.tabs .active i').textContent = saved ? '' : '●';
  document.querySelector('.files .active i').textContent = saved ? '' : '●';
}
function persistProject() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  setSaveState(true);
}
function scheduleSave() {
  setSaveState(false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistProject, 450);
}

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
  '.cm-gutters': { backgroundColor: '#151619', color: '#50555d', borderRight: '1px solid #222428', paddingTop: '14px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,.025)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(255,107,44,.24)' },
  '.cm-cursor': { borderLeftColor: '#ff6b2c' },
  '.cm-foldGutter': { display: 'none' }
}, { dark: true });
const editor = new EditorView({
  doc: project.code,
  extensions: [
    basicSetup,
    javascript(),
    editorTheme,
    syntaxHighlighting(loopHighlight),
    keymap.of([indentWithTab, { key: 'Mod-Enter', run: () => { runCode(); return true; } }]),
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      project.code = update.state.doc.toString();
      scheduleSave();
    })
  ],
  parent: document.querySelector('#codeEditor')
});
const getCode = () => editor.state.doc.toString();
setSaveState(true);

const viewport = document.querySelector('.viewport');
viewport.querySelector('canvas')?.remove();
const frame = document.createElement('iframe');
frame.className = 'runtime-frame';
frame.setAttribute('sandbox', 'allow-scripts');
frame.setAttribute('title', 'Loop Lab simulation runtime');
frame.srcdoc = RUNTIME_HTML;
viewport.prepend(frame);

const primaryButton = document.querySelector('.app-actions .primary');
primaryButton.textContent = 'Run code';
primaryButton.title = 'Run code (Ctrl/⌘ + Enter)';
const transportButtons = [...document.querySelectorAll('.transport > div:first-child button')];
const [restartButton, playButton, stepButton] = transportButtons;
const timeReadout = document.querySelector('.transport p');
const progressBar = document.querySelector('.timeline i');
const playhead = document.querySelector('.timeline span');
const gridButton = document.querySelector('.grid-button');
const logs = document.querySelector('.logs');
const properties = document.querySelector('.properties');
let runtimeReady = false;
let isPlaying = true;
let currentParams = {};
let lastCode = project.code;
let pendingCode = null;
let initialRunComplete = false;

function send(message) { frame.contentWindow?.postMessage({ channel:'loop-host', ...message }, '*'); }
function stamp() { return new Date().toLocaleTimeString([], { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
function addLog(message, level = 'info') {
  const row = document.createElement('p');
  row.innerHTML = `<time>${stamp()}</time><span class="${level}">${level === 'error' ? '×' : level === 'ok' ? '●' : '›'}</span> ${escapeHTML(message)}`;
  logs.append(row); logs.scrollTop = logs.scrollHeight;
}
function escapeHTML(value) { const node=document.createElement('div'); node.textContent=String(value); return node.innerHTML; }

function runCode() {
  lastCode = getCode();
  project.code = lastCode;
  persistProject();
  pendingCode = lastCode;
  logs.innerHTML = '';
  addLog('Compiling simulation…');
  send({ type:'replace-worker' });
  document.querySelector('.tabs .active i').textContent = '';
  isPlaying = true; playButton.textContent = 'Ⅱ';
}

function renderParameters(schema, values) {
  currentParams = { ...values };
  properties.innerHTML = '';
  const groups = new Map();
  Object.entries(schema || {}).forEach(([key, definition]) => {
    const config = definition && typeof definition === 'object' && 'value' in definition ? definition : { value: definition };
    const group = config.group || 'Parameters';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([key, config]);
  });
  groups.forEach((items, groupName) => {
    const section = document.createElement('section');
    section.innerHTML = `<h3>⌄ &nbsp; ${escapeHTML(groupName.toUpperCase())}</h3>`;
    items.forEach(([key, config]) => {
      const label = document.createElement('label');
      const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      label.append(document.createTextNode(title));
      if (typeof config.value === 'boolean') {
        const toggle = document.createElement('button'); toggle.className = `switch ${currentParams[key] ? 'active' : ''}`; toggle.innerHTML = '<i></i>';
        toggle.addEventListener('click', () => {
          currentParams[key] = !currentParams[key];
          project.parameterValues[key] = currentParams[key];
          toggle.classList.toggle('active', currentParams[key]);
          send({type:'params',params:{[key]:currentParams[key]}});
          scheduleSave();
        });
        label.append(toggle);
      } else {
        const input = document.createElement('input'); input.value = currentParams[key]; input.type = config.type === 'color' ? 'color' : 'number';
        if (config.min != null) input.min = config.min; if (config.max != null) input.max = config.max; if (config.step != null) input.step = config.step;
        input.addEventListener('input', () => {
          currentParams[key] = input.type === 'number' ? Number(input.value) : input.value;
          project.parameterValues[key] = currentParams[key];
          send({type:'params',params:{[key]:currentParams[key]}});
          scheduleSave();
        });
        label.append(input);
      }
      section.append(label);
    });
    properties.append(section);
  });
}

window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.channel !== 'loop-runtime') return;
  const message = event.data;
  if (message.type === 'ready') {
    runtimeReady = true;
    if (pendingCode !== null) {
      send({ type:'run', code:pendingCode, params:project.parameterValues });
      pendingCode = null;
      initialRunComplete = true;
    } else if (!initialRunComplete) {
      logs.innerHTML = '';
      addLog('Compiling simulation…');
      send({ type:'run', code:getCode(), params:project.parameterValues });
      initialRunComplete = true;
    }
  }
  if (message.type === 'parameters') renderParameters(message.schema, message.params);
  if (message.type === 'log') addLog(message.message, message.level);
  if (message.type === 'error') { addLog(message.message, 'error'); playButton.textContent = '▶'; isPlaying = false; }
  if (message.type === 'time') {
    const current = message.elapsed || 0;
    const total = Number(currentParams.duration) || 0;
    const percent = total ? Math.min(100, current / total * 100) : 0;
    timeReadout.innerHTML = total ? `<b>${formatTime(current)}</b> / ${formatTime(total)}` : `<b>${formatTime(current)}</b>`;
    progressBar.style.width = `${percent}%`; playhead.style.left = `${percent}%`;
  }
});

function formatTime(seconds) { const minutes=Math.floor(seconds/60); const rest=seconds-minutes*60; return `${String(minutes).padStart(2,'0')}:${rest.toFixed(2).padStart(5,'0')}`; }
primaryButton.addEventListener('click', runCode);
restartButton.addEventListener('click', () => send({type:'restart'}));
playButton.textContent = 'Ⅱ';
playButton.addEventListener('click', () => { isPlaying = !isPlaying; playButton.textContent = isPlaying ? 'Ⅱ' : '▶'; send({type:'play',playing:isPlaying}); });
stepButton.addEventListener('click', () => { isPlaying = false; playButton.textContent = '▶'; send({type:'step'}); });
if (!project.gridVisible) { viewport.classList.add('grid-off'); gridButton.classList.add('inactive'); }
gridButton.addEventListener('click', () => {
  project.gridVisible = viewport.classList.toggle('grid-off') === false;
  gridButton.classList.toggle('inactive', !project.gridVisible);
  scheduleSave();
});
window.addEventListener('beforeunload', persistProject);
