import { WORKSPACE_AGENT_API_VERSION, type WorkspaceAgentAPI } from './workspace-agent-api';

interface AgentPanelOptions {
  api: WorkspaceAgentAPI;
  activeFile(): string;
  onStateChange(): void;
}

export class AgentPanel {
  private readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly thread: HTMLElement;
  private readonly apiDrawer: HTMLElement;
  private openState = false;

  constructor(private readonly editor: HTMLElement, private readonly options: AgentPanelOptions) {
    this.root = document.createElement('section'); this.root.className = 'agent-panel'; this.root.hidden = true;
    this.root.innerHTML = `
      <header class="agent-header">
        <div><span>AI WORKSPACE</span><h2>Loop Agent</h2></div>
        <div class="agent-connection"><i></i><b>Offline</b><span>No provider connected</span></div>
      </header>
      <div class="agent-layout">
        <div class="agent-main">
          <div class="agent-thread" aria-live="polite">
            <article class="agent-message assistant"><span>LOOP AGENT</span><p>I’m ready to work inside this project once a local or MCP provider is connected. The workspace tools are already available, but nothing will be sent and no files can change while offline.</p></article>
          </div>
          <div class="agent-suggestions">
            <button type="button">Explain the active file</button><button type="button">Improve this simulation</button><button type="button">Find likely bugs</button>
          </div>
          <form class="agent-composer">
            <textarea rows="3" placeholder="Describe what you want to change…" aria-label="Agent prompt"></textarea>
            <footer><span class="agent-context">Context: active project</span><button type="submit" class="primary">Stage request</button></footer>
          </form>
        </div>
        <aside class="agent-sidebar">
          <section><span>CONNECTION</span><h3>Bring your own agent</h3><p>Loop Lab will support a local bridge or MCP client. Provider credentials and inference stay outside the project.</p><button class="agent-setup" type="button">View connection plan</button></section>
          <section><span>WORKSPACE ACCESS</span><h3>Permission-aware tools</h3><p>Reading is available immediately. File writes and running code always require host approval.</p><button class="agent-api-toggle" type="button">View tool API</button></section>
        </aside>
      </div>
      <div class="agent-api-drawer" hidden><header><div><span>WORKSPACE TOOL API</span><h3>${WORKSPACE_AGENT_API_VERSION}</h3></div><button type="button" aria-label="Close API reference">×</button></header><div class="agent-api-list"></div></div>`;
    this.editor.querySelector('.editor-body')?.append(this.root);
    this.textarea = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.thread = this.root.querySelector('.agent-thread') as HTMLElement;
    this.apiDrawer = this.root.querySelector('.agent-api-drawer') as HTMLElement;
    this.bind(); this.renderManifest();
  }

  get isOpen(): boolean { return this.openState; }

  open(): void {
    this.openState = true; this.editor.classList.add('agent-active'); this.root.hidden = false;
    this.updateContext(); this.options.onStateChange(); queueMicrotask(() => this.textarea.focus());
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false; this.editor.classList.remove('agent-active'); this.root.hidden = true; this.apiDrawer.hidden = true;
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.agent-suggestions button').forEach((button) => button.addEventListener('click', () => {
      this.textarea.value = button.textContent || ''; this.textarea.focus();
    }));
    this.root.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault(); const prompt = this.textarea.value.trim(); if (!prompt) return;
      this.addMessage('YOU', prompt, 'user'); this.textarea.value = '';
      this.addMessage('OFFLINE', 'Request staged locally. No model is connected, so nothing was transmitted and no project files changed. Connect a local bridge or MCP client later to execute it.', 'system');
    });
    this.root.querySelector('.agent-api-toggle')?.addEventListener('click', () => { this.apiDrawer.hidden = false; });
    this.root.querySelector('.agent-api-drawer header button')?.addEventListener('click', () => { this.apiDrawer.hidden = true; });
    this.root.querySelector('.agent-setup')?.addEventListener('click', () => {
      this.addMessage('CONNECTION PLAN', 'First target: a local bridge that can use an existing Codex or Claude CLI login. MCP will expose the same workspace tools to external clients. Hosted tokens are intentionally not required.', 'system');
    });
  }

  private updateContext(): void {
    const context = this.root.querySelector('.agent-context');
    if (context) context.textContent = `Context: ${this.options.activeFile()} + project files`;
  }

  private addMessage(label: string, copy: string, kind: 'user' | 'assistant' | 'system'): void {
    const message = document.createElement('article'); message.className = `agent-message ${kind}`;
    const heading = document.createElement('span'); heading.textContent = label;
    const body = document.createElement('p'); body.textContent = copy; message.append(heading, body); this.thread.append(message);
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  private renderManifest(): void {
    const list = this.root.querySelector('.agent-api-list') as HTMLElement; list.innerHTML = '';
    this.options.api.manifest().tools.forEach((tool) => {
      const row = document.createElement('article'); row.innerHTML = `<div><code>${tool.name}</code><p>${tool.description}</p></div><b class="risk-${tool.risk}">${tool.risk}</b>`; list.append(row);
    });
  }
}

