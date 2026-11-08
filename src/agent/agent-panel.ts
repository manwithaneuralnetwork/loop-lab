import { WORKSPACE_AGENT_API_VERSION, type WorkspaceAgentAPI } from './workspace-agent-api';
import { CodexBridge, type AgentConversationMessage, type CodexProposal } from './codex-bridge';

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
  private readonly bridge: CodexBridge;
  private readonly connection: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly history: AgentConversationMessage[] = [];
  private connected = false;
  private busy = false;
  private openState = false;

  constructor(private readonly editor: HTMLElement, private readonly options: AgentPanelOptions) {
    this.root = document.createElement('section'); this.root.className = 'agent-panel'; this.root.hidden = true;
    this.root.innerHTML = `
      <header class="agent-header">
        <div><span>AI WORKSPACE</span><h2>Loop Agent</h2></div>
        <div class="agent-connection"><i></i><b>Checking…</b><span>Looking for Codex CLI</span></div>
      </header>
      <div class="agent-layout">
        <div class="agent-main">
          <div class="agent-thread" aria-live="polite">
            <article class="agent-message assistant"><span>LOOP AGENT</span><p>Connect your local Codex CLI to work on this project. Codex reads a snapshot in a read-only sandbox; proposed file changes stay in Loop Lab until you approve them.</p></article>
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
          <section><span>CONNECTION</span><h3>Local Codex CLI</h3><p>Uses the Codex installation and ChatGPT login on this computer. No API key is stored by Loop Lab.</p><ol class="agent-steps"><li>Install Codex CLI</li><li>Run <code>codex login</code></li><li>Start Loop Lab locally</li></ol><button class="agent-setup" type="button">Connect Codex CLI</button></section>
          <section><span>WORKSPACE ACCESS</span><h3>Permission-aware tools</h3><p>Reading is available immediately. File writes and running code always require host approval.</p><button class="agent-api-toggle" type="button">View tool API</button></section>
        </aside>
      </div>
      <div class="agent-api-drawer" hidden><header><div><span>WORKSPACE TOOL API</span><h3>${WORKSPACE_AGENT_API_VERSION}</h3></div><button type="button" aria-label="Close API reference">×</button></header><div class="agent-api-list"></div></div>`;
    this.editor.querySelector('.editor-body')?.append(this.root);
    this.textarea = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.thread = this.root.querySelector('.agent-thread') as HTMLElement;
    this.apiDrawer = this.root.querySelector('.agent-api-drawer') as HTMLElement;
    this.bridge = new CodexBridge(options.api); this.connection = this.root.querySelector('.agent-connection') as HTMLElement;
    this.submitButton = this.root.querySelector('.agent-composer .primary') as HTMLButtonElement;
    this.bind(); this.renderManifest(); void this.refreshConnection();
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
    this.root.querySelector('form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.submit(); });
    this.root.querySelector('.agent-api-toggle')?.addEventListener('click', () => { this.apiDrawer.hidden = false; });
    this.root.querySelector('.agent-api-drawer header button')?.addEventListener('click', () => { this.apiDrawer.hidden = true; });
    this.root.querySelector('.agent-setup')?.addEventListener('click', () => void this.refreshConnection(true));
  }

  private async refreshConnection(report = false): Promise<void> {
    this.setConnection('checking', 'Checking…', 'Looking for Codex CLI');
    const status = await this.bridge.status(); this.connected = status.available && status.authenticated;
    if (this.connected) {
      this.setConnection('connected', 'Connected', status.version || 'Codex CLI');
      const button = this.root.querySelector('.agent-setup') as HTMLButtonElement; button.textContent = 'Recheck connection';
      if (report) this.addMessage('CONNECTED', `${status.version || 'Codex CLI'} is signed in and ready. Requests use your existing Codex account.`, 'system');
    } else {
      this.setConnection('offline', 'Offline', status.error || (status.available ? 'Run codex login' : 'Codex CLI not found'));
      if (report) this.addMessage('CONNECTION', status.error || 'Codex CLI was not found. Install it, sign in, and try again.', 'system');
    }
    this.submitButton.textContent = this.connected ? 'Send to Codex' : 'Stage request';
  }

  private setConnection(state: string, title: string, detail: string): void {
    this.connection.className = `agent-connection ${state}`;
    (this.connection.querySelector('b') as HTMLElement).textContent = title;
    (this.connection.querySelector('span') as HTMLElement).textContent = detail;
  }

  private async submit(): Promise<void> {
    const prompt = this.textarea.value.trim(); if (!prompt || this.busy) return;
    this.addMessage('YOU', prompt, 'user'); this.textarea.value = '';
    if (!this.connected) {
      this.addMessage('OFFLINE', 'Request staged locally. Connect Codex CLI, then send it again.', 'system'); return;
    }
    this.history.push({ role: 'user', content: prompt }); this.busy = true; this.submitButton.disabled = true; this.submitButton.textContent = 'Thinking…';
    try {
      const reply = await this.bridge.chat(prompt, this.history.slice(0, -1));
      this.history.push({ role: 'assistant', content: reply.message }); this.addMessage('CODEX', reply.message, 'assistant');
      reply.proposals.forEach((proposal) => this.addProposal(proposal));
    } catch (error) {
      this.addMessage('BRIDGE ERROR', error instanceof Error ? error.message : String(error), 'system');
    } finally {
      this.busy = false; this.submitButton.disabled = false; this.submitButton.textContent = 'Send to Codex';
    }
  }

  private addProposal(proposal: CodexProposal): void {
    const card = document.createElement('article'); card.className = 'agent-proposal';
    const copy = document.createElement('div'); const path = document.createElement('code'); path.textContent = proposal.path;
    const summary = document.createElement('p'); summary.textContent = proposal.summary; copy.append(path, summary);
    const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply';
    apply.addEventListener('click', async () => {
      apply.disabled = true; apply.textContent = 'Applying…';
      try { await this.bridge.apply(proposal); apply.textContent = 'Applied'; card.classList.add('applied'); }
      catch (error) { apply.disabled = false; apply.textContent = 'Retry'; this.addMessage('APPLY ERROR', error instanceof Error ? error.message : String(error), 'system'); }
    });
    card.append(copy, apply); this.thread.append(card); this.thread.scrollTop = this.thread.scrollHeight;
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

