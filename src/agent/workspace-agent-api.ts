import { createProjectFile, type ProjectFile, type ProjectState } from '../project-store';

export const WORKSPACE_AGENT_API_VERSION = 'loop-lab.workspace.v1';

export type WorkspaceAgentRisk = 'read' | 'proposal' | 'write' | 'run';
export type WorkspaceAgentToolName =
  | 'workspace.list_files'
  | 'workspace.read_file'
  | 'workspace.get_context'
  | 'workspace.propose_edit'
  | 'workspace.write_file'
  | 'workspace.run_project';

export interface WorkspaceAgentToolDefinition {
  name: WorkspaceAgentToolName;
  description: string;
  risk: WorkspaceAgentRisk;
  input: Record<string, string>;
}

export interface WorkspaceAgentRequest {
  id?: string;
  tool: WorkspaceAgentToolName;
  input?: Record<string, unknown>;
}

export interface WorkspaceAgentAuthorization {
  allowWrite?: boolean;
  allowRun?: boolean;
}

export interface WorkspaceAgentRuntimeContext {
  playing: boolean;
  errors: number;
  profile: string;
}

export interface WorkspaceAgentHost {
  project: ProjectState;
  runtime(): WorkspaceAgentRuntimeContext;
  onFileWritten(file: ProjectFile): void;
  onRun(): void;
}

export interface WorkspaceAgentResponse {
  id: string;
  ok: boolean;
  tool: WorkspaceAgentToolName;
  result?: unknown;
  error?: string;
  approvalRequired?: 'write' | 'run';
}

const TOOLS: WorkspaceAgentToolDefinition[] = [
  { name: 'workspace.list_files', description: 'List project files without returning their contents.', risk: 'read', input: { includeAssets: 'boolean (optional)' } },
  { name: 'workspace.read_file', description: 'Read one text file from the active project.', risk: 'read', input: { path: 'string' } },
  { name: 'workspace.get_context', description: 'Read project, active file, parameter, dimension, and runtime context.', risk: 'read', input: {} },
  { name: 'workspace.propose_edit', description: 'Prepare a reviewable file replacement without changing the project.', risk: 'proposal', input: { path: 'string', content: 'string', summary: 'string' } },
  { name: 'workspace.write_file', description: 'Create or replace a text file after explicit host approval.', risk: 'write', input: { path: 'string', content: 'string' } },
  { name: 'workspace.run_project', description: 'Run the current project after explicit host approval.', risk: 'run', input: {} }
];

function requestId(request: WorkspaceAgentRequest): string {
  return request.id || crypto.randomUUID();
}

function cleanPath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function textInput(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  return value;
}

export class WorkspaceAgentAPI {
  constructor(private readonly host: WorkspaceAgentHost) {}

  manifest(): { version: string; tools: WorkspaceAgentToolDefinition[] } {
    return { version: WORKSPACE_AGENT_API_VERSION, tools: TOOLS.map((tool) => ({ ...tool, input: { ...tool.input } })) };
  }

  async call(request: WorkspaceAgentRequest, authorization: WorkspaceAgentAuthorization = {}): Promise<WorkspaceAgentResponse> {
    const id = requestId(request); const input = request.input || {};
    try {
      if (!TOOLS.some((tool) => tool.name === request.tool)) throw new Error(`Unknown workspace tool: ${request.tool}`);
      if (request.tool === 'workspace.list_files') {
        const includeAssets = input.includeAssets !== false;
        return this.success(id, request.tool, this.host.project.files
          .filter((file) => includeAssets || file.kind === 'code')
          .map(({ id: fileId, path, kind, mime }) => ({ id: fileId, path, kind, mime })));
      }
      if (request.tool === 'workspace.read_file') {
        const path = cleanPath(input.path); const file = this.host.project.files.find((candidate) => candidate.path === path);
        if (!file) throw new Error(`File not found: ${path}`);
        if (file.kind !== 'code') throw new Error(`Binary assets cannot be read as text: ${path}`);
        return this.success(id, request.tool, { path: file.path, content: file.content });
      }
      if (request.tool === 'workspace.get_context') {
        const active = this.host.project.files.find((file) => file.id === this.host.project.activeFileId);
        return this.success(id, request.tool, {
          project: { id: this.host.project.id, name: this.host.project.name },
          activeFile: active?.path || null,
          openFiles: this.host.project.openFileIds.map((fileId) => this.host.project.files.find((file) => file.id === fileId)?.path).filter(Boolean),
          world: { width: this.host.project.worldWidth, height: this.host.project.worldHeight },
          botMode: this.host.project.botMode,
          parameters: { ...this.host.project.parameterValues },
          runtime: this.host.runtime()
        });
      }
      if (request.tool === 'workspace.propose_edit') {
        const path = cleanPath(input.path); const content = textInput(input, 'content'); const summary = textInput(input, 'summary');
        const current = this.host.project.files.find((file) => file.path === path);
        return this.success(id, request.tool, {
          proposalId: crypto.randomUUID(), path, summary, exists: Boolean(current),
          before: current?.content || '', after: content, changed: current?.content !== content
        });
      }
      if (request.tool === 'workspace.write_file') {
        if (!authorization.allowWrite) return { id, ok: false, tool: request.tool, error: 'Host approval is required before writing project files.', approvalRequired: 'write' };
        const path = cleanPath(input.path); const content = textInput(input, 'content');
        if (!path) throw new Error('path must identify a project file.');
        let file = this.host.project.files.find((candidate) => candidate.path === path); const created = !file;
        if (file?.kind === 'asset') throw new Error('Binary assets cannot be replaced through the text workspace API.');
        if (file) file.content = content;
        else { file = createProjectFile(path, content); this.host.project.files.push(file); }
        this.host.onFileWritten(file);
        return this.success(id, request.tool, { path: file.path, created });
      }
      if (!authorization.allowRun) return { id, ok: false, tool: request.tool, error: 'Host approval is required before running project code.', approvalRequired: 'run' };
      this.host.onRun(); return this.success(id, request.tool, { started: true });
    } catch (error) {
      return { id, ok: false, tool: request.tool, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private success(id: string, tool: WorkspaceAgentToolName, result: unknown): WorkspaceAgentResponse {
    return { id, ok: true, tool, result };
  }
}

