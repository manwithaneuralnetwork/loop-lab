import { describe, expect, it } from 'vitest';
import { compileProject, resolveModulePath, transformModule } from './module-runtime';
import { World } from './world';

describe('project module runtime', () => {
  it('resolves relative files and implicit JavaScript extensions', () => {
    expect(resolveModulePath('simulation.js', './helpers', { 'simulation.js': '', 'helpers.js': '' })).toBe('helpers.js');
    expect(resolveModulePath('scenes/main.js', '../helpers', { 'scenes/main.js': '', 'helpers.ts': '' })).toBe('helpers.ts');
  });

  it('transforms common import and export syntax', () => {
    const result = transformModule('import value, { add as sum } from "./math.js"; export const answer = sum(value, 2);');
    expect(result).toContain('const value = require("./math.js").default');
    expect(result).toContain('add: sum');
    expect(result).toContain('Object.assign(exports, { answer })');
  });

  it('executes a multi-file simulation', () => {
    const hooks = compileProject({
      'simulation.js': 'import { make } from "./helpers.js"; export const parameters = { count: { value: 3 } }; export function setup(world, params) { make(world, params.count); }',
      'helpers.js': 'export function make(world, count) { for (let i = 0; i < count; i++) world.circle({ x: i }); }'
    }, 'simulation.js', new World(100, 100), {});
    const world = new World(100, 100);
    hooks.setup?.(world, { count: 3 });
    expect(world.objects).toHaveLength(3);
  });

  it('rejects external packages with a clear message', () => {
    expect(() => compileProject({ 'simulation.js': 'import thing from "pixi.js";' }, 'simulation.js', new World(10, 10), {})).toThrow(/External package imports/);
  });
});
