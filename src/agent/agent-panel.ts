import { WORKSPACE_AGENT_API_VERSION, type WorkspaceAgentAPI } from './workspace-agent-api';
import { CodexBridge, type AgentConversationMessage, type ReviewedCodexProposal } from './codex-bridge';
import { compactDiff, lineDiff } from './line-diff';

interface AgentPanelOptions {
  api: WorkspaceAgentAPI;
  activeFile(): string;
  onStateChange(): void;
  createRecoveryPoint(): Promise<void>;
  undoLastChange(): Promise<boolean>;
  runProject(): void;
  onNotice(message: string): void;
}

export class AgentPanel {
  private readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly thread: HTMLElement;
  private readonly apiDrawer: HTMLElement;
  private readonly reviewDrawer: HTMLElement;
  private readonly bridge: CodexBridge;
  private readonly connection: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly history: AgentConversationMessage[] = [];
  private connected = false;
  private busy = false;
  private openState = false;
  private currentReviews: ReviewedCodexProposal[] = [];
  private activeReviewIndex = 0;
  private lastUndoButton: HTMLButtonElement | null = null;

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
      <div class="agent-api-drawer" hidden><header><div><span>WORKSPACE TOOL API</span><h3>${WORKSPACE_AGENT_API_VERSION}</h3></div><button type="button" aria-label="Close API reference">×</button></header><div class="agent-api-list"></div></div>
      <section class="agent-review-drawer" hidden>
        <header><div><span>AGENT CHANGE SET</span><h3>Review proposed changes</h3></div><button type="button" aria-label="Close change review">×</button></header>
        <div class="agent-review-layout"><nav class="agent-review-files" aria-label="Proposed files"></nav><div class="agent-diff"><header><code></code><p></p></header><div class="agent-diff-lines"></div></div></div>
        <footer><div><button type="button" class="agent-select-all">Select all</button><label><input class="agent-run-after" type="checkbox" checked> Run after apply</label></div><button type="button" class="primary agent-apply-selected">Apply selected</button></footer>
      </section>`;
    this.editor.querySelector('.editor-body')?.append(this.root);
    this.textarea = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.thread = this.root.querySelector('.agent-thread') as HTMLElement;
    this.apiDrawer = this.root.querySelector('.agent-api-drawer') as HTMLElement;
    this.reviewDrawer = this.root.querySelector('.agent-review-drawer') as HTMLElement;
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
    this.root.querySelector('.agent-review-drawer > header button')?.addEventListener('click', () => { this.reviewDrawer.hidden = true; });
    this.root.querySelector('.agent-select-all')?.addEventListener('click', () => {
      const shouldSelect = this.currentReviews.some((proposal) => !proposal.selected && proposal.changed);
      this.currentReviews.forEach((proposal) => { proposal.selected = proposal.changed && shouldSelect; }); this.renderReview();
    });
    this.root.querySelector('.agent-apply-selected')?.addEventListener('click', () => void this.applySelected());
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
      if (reply.proposals.length) await this.addChangeSet(await Promise.all(reply.proposals.map((proposal) => this.bridge.review(proposal))));
    } catch (error) {
      this.addMessage('BRIDGE ERROR', error instanceof Error ? error.message : String(error), 'system');
    } finally {
      this.busy = false; this.submitButton.disabled = false; this.submitButton.textContent = 'Send to Codex';
      if (!this.reviewDrawer.hidden) this.updateReviewFooter();
    }
  }

  private async addChangeSet(proposals: ReviewedCodexProposal[]): Promise<void> {
    const changed = proposals.filter((proposal) => proposal.changed);
    if (!changed.length) { this.addMessage('NO CHANGES', 'Codex returned file contents, but they match the current project.', 'system'); return; }
    this.currentReviews = changed; this.activeReviewIndex = 0;
    const card = document.createElement('article'); card.className = 'agent-change-set';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = `${changed.length} proposed file change${changed.length === 1 ? '' : 's'}`;
    const paths = document.createElement('p'); paths.textContent = changed.map((proposal) => proposal.path).join(' · '); copy.append(title, paths);
    const review = document.createElement('button'); review.type = 'button'; review.textContent = 'Review changes'; review.addEventListener('click', () => this.openReview(changed));
    card.append(copy, review); this.thread.append(card); this.thread.scrollTop = this.thread.scrollHeight; this.openReview(changed);
  }

  private openReview(proposals: ReviewedCodexProposal[]): void {
    this.currentReviews = proposals; this.activeReviewIndex = Math.min(this.activeReviewIndex, proposals.length - 1);
    this.reviewDrawer.hidden = false; this.renderReview();
  }

  private renderReview(): void {
    const files = this.reviewDrawer.querySelector('.agent-review-files') as HTMLElement; files.innerHTML = '';
    this.currentReviews.forEach((proposal, index) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = index === this.activeReviewIndex ? 'active' : '';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = proposal.selected; checkbox.disabled = !proposal.changed;
      checkbox.setAttribute('aria-label', `Include ${proposal.path}`);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => { proposal.selected = checkbox.checked; this.updateReviewFooter(); });
      const copy = document.createElement('span'); const path = document.createElement('code'); path.textContent = proposal.path;
      const summary = document.createElement('small'); summary.textContent = proposal.exists ? 'Modified' : 'New file'; copy.append(path, summary);
      row.append(checkbox, copy); row.addEventListener('click', () => { this.activeReviewIndex = index; this.renderReview(); }); files.append(row);
    });
    const active = this.currentReviews[this.activeReviewIndex];
    const headerPath = this.reviewDrawer.querySelector('.agent-diff > header code') as HTMLElement;
    const headerSummary = this.reviewDrawer.querySelector('.agent-diff > header p') as HTMLElement;
    headerPath.textContent = active?.path || ''; headerSummary.textContent = active?.summary || '';
    const lines = this.reviewDrawer.querySelector('.agent-diff-lines') as HTMLElement; lines.innerHTML = '';
    if (active) compactDiff(lineDiff(active.before, active.after)).forEach((line) => {
      const row = document.createElement('div'); row.className = `diff-${line.kind}`;
      if (line.kind === 'skip') { row.textContent = `··· ${line.count} unchanged lines ···`; lines.append(row); return; }
      const oldNumber = document.createElement('span'); oldNumber.textContent = line.oldLine ? String(line.oldLine) : '';
      const newNumber = document.createElement('span'); newNumber.textContent = line.newLine ? String(line.newLine) : '';
      const marker = document.createElement('b'); marker.textContent = line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ';
      const code = document.createElement('code'); code.textContent = line.text || ' '; row.append(oldNumber, newNumber, marker, code); lines.append(row);
    });
    this.updateReviewFooter();
  }

  private updateReviewFooter(): void {
    const selected = this.currentReviews.filter((proposal) => proposal.selected).length;
    const apply = this.reviewDrawer.querySelector('.agent-apply-selected') as HTMLButtonElement;
    apply.disabled = selected === 0 || this.busy; apply.textContent = selected ? `Apply selected (${selected})` : 'Select a file';
    const selectAll = this.reviewDrawer.querySelector('.agent-select-all') as HTMLButtonElement;
    selectAll.textContent = this.currentReviews.every((proposal) => proposal.selected || !proposal.changed) ? 'Clear selection' : 'Select all';
  }

  private async applySelected(): Promise<void> {
    const selected = this.currentReviews.filter((proposal) => proposal.selected); if (!selected.length || this.busy) return;
    const apply = this.reviewDrawer.querySelector('.agent-apply-selected') as HTMLButtonElement;
    this.busy = true; apply.disabled = true; apply.textContent = 'Creating checkpoint…';
    try {
      await this.options.createRecoveryPoint();
      for (let index = 0; index < selected.length; index += 1) {
        apply.textContent = `Applying ${index + 1}/${selected.length}…`; await this.bridge.apply(selected[index]);
      }
      this.lastUndoButton?.setAttribute('disabled', ''); this.reviewDrawer.hidden = true;
      const ran = (this.reviewDrawer.querySelector('.agent-run-after') as HTMLInputElement).checked;
      if (ran) this.options.runProject();
      this.options.onNotice(`Agent applied ${selected.length} file change${selected.length === 1 ? '' : 's'}${ran ? ' and ran the project' : ''}.`);
      this.addAppliedMessage(selected, ran);
    } catch (error) {
      this.addMessage('APPLY ERROR', error instanceof Error ? error.message : String(error), 'system');
    } finally { this.busy = false; this.updateReviewFooter(); }
  }

  private addAppliedMessage(proposals: ReviewedCodexProposal[], ran: boolean): void {
    const message = document.createElement('article'); message.className = 'agent-applied-message';
    const copy = document.createElement('div'); const heading = document.createElement('span'); heading.textContent = 'CHANGES APPLIED';
    const body = document.createElement('p'); body.textContent = `${proposals.map((proposal) => proposal.path).join(', ')}${ran ? ' · preview restarted' : ''}`; copy.append(heading, body);
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo changes'; this.lastUndoButton = undo;
    undo.addEventListener('click', async () => {
      undo.disabled = true; undo.textContent = 'Restoring…';
      if (await this.options.undoLastChange()) { undo.textContent = 'Restored'; message.classList.add('restored'); this.addMessage('RESTORED', 'The project was restored to its pre-agent checkpoint and rerun.', 'system'); }
      else { undo.disabled = false; undo.textContent = 'Retry undo'; }
    });
    message.append(copy, undo); this.thread.append(message); this.thread.scrollTop = this.thread.scrollHeight;
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

