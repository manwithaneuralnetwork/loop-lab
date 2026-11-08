import { describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '../project-store';
import { WorkspaceAgentAPI } from './workspace-agent-api';

function project(): ProjectState {
  return {
    id: 'project-1', name: 'Test Project', createdAt: '', updatedAt: '',
    files: [{ id: 'file-1', path: 'simulation.js', kind: 'code', content: 'export function setup() {}' }],
    folders: ['assets'], activeFileId: 'file-1', openFileIds: ['file-1'], parameterValues: { speed: 2 },
    gridVisible: true, worldWidth: 720, worldHeight: 960, botMode: false, exportHistory: []
  };
}

function api() {
  const state = project(); const onFileWritten = vi.fn(); const onRun = vi.fn();
  return { state, onFileWritten, onRun, api: new WorkspaceAgentAPI({
    project: state, runtime: () => ({ playing: true, errors: 0, profile: '60 fps' }), onFileWritten, onRun
  }) };
}

describe('WorkspaceAgentAPI', () => {
  it('lists and reads project files', async () => {
    const fixture = api();
    expect((await fixture.api.call({ tool: 'workspace.list_files' })).ok).toBe(true);
    const response = await fixture.api.call({ tool: 'workspace.read_file', input: { path: 'simulation.js' } });
    expect(response.result).toEqual({ path: 'simulation.js', content: 'export function setup() {}' });
  });

  it('returns useful runtime and project context', async () => {
    const response = await api().api.call({ tool: 'workspace.get_context' });
    expect(response.result).toMatchObject({ activeFile: 'simulation.js', world: { width: 720, height: 960 }, runtime: { playing: true } });
  });

  it('creates proposals without mutating files', async () => {
    const fixture = api();
    const response = await fixture.api.call({ tool: 'workspace.propose_edit', input: { path: 'simulation.js', content: 'changed', summary: 'Test edit' } });
    expect(response.ok).toBe(true); expect(fixture.state.files[0].content).toBe('export function setup() {}');
  });

  it('requires host approval for writes and runs', async () => {
    const fixture = api();
    const denied = await fixture.api.call({ tool: 'workspace.write_file', input: { path: 'simulation.js', content: 'changed' } });
    expect(denied.approvalRequired).toBe('write'); expect(fixture.state.files[0].content).not.toBe('changed');
    const allowed = await fixture.api.call({ tool: 'workspace.write_file', input: { path: 'simulation.js', content: 'changed' } }, { allowWrite: true });
    expect(allowed.ok).toBe(true); expect(fixture.state.files[0].content).toBe('changed'); expect(fixture.onFileWritten).toHaveBeenCalledOnce();
    const run = await fixture.api.call({ tool: 'workspace.run_project' });
    expect(run.approvalRequired).toBe('run'); expect(fixture.onRun).not.toHaveBeenCalled();
  });
});
