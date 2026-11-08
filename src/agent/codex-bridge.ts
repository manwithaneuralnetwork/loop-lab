import type { WorkspaceAgentAPI } from './workspace-agent-api';

export interface CodexBridgeStatus {
  available: boolean;
  authenticated: boolean;
  version?: string;
  auth?: string;
  error?: string;
}

export interface CodexProposal { path: string; summary: string; content: string }
export interface CodexAgentReply { message: string; proposals: CodexProposal[] }
export interface AgentConversationMessage { role: 'user' | 'assistant'; content: string }

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Local bridge returned ${response.status}.`);
  return payload;
}

export class CodexBridge {
  constructor(private readonly api: WorkspaceAgentAPI) {}

  async status(): Promise<CodexBridgeStatus> {
    try { return responseJson(await fetch('/__loop/agent/status')); }
    catch (error) { return { available: false, authenticated: false, error: error instanceof Error ? error.message : String(error) }; }
  }

  async chat(prompt: string, history: AgentConversationMessage[]): Promise<CodexAgentReply> {
    const [contextResponse, filesResponse] = await Promise.all([
      this.api.call({ tool: 'workspace.get_context' }),
      this.api.call({ tool: 'workspace.list_files', input: { includeAssets: false } })
    ]);
    if (!contextResponse.ok || !filesResponse.ok) throw new Error(contextResponse.error || filesResponse.error || 'Could not collect workspace context.');
    const listed = filesResponse.result as Array<{ path: string; kind: string }>;
    const files = await Promise.all(listed.map(async (file) => {
      const response = await this.api.call({ tool: 'workspace.read_file', input: { path: file.path } });
      if (!response.ok) throw new Error(response.error); return { ...file, ...(response.result as { content: string }) };
    }));
    return responseJson(await fetch('/__loop/agent/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, context: contextResponse.result, files })
    }));
  }

  async apply(proposal: CodexProposal): Promise<void> {
    const response = await this.api.call({ tool: 'workspace.write_file', input: { path: proposal.path, content: proposal.content } }, { allowWrite: true });
    if (!response.ok) throw new Error(response.error || 'Could not apply the proposed edit.');
  }
}

