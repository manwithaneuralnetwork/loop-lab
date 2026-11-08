import { describe, expect, it } from 'vitest';
import { inspectExportAutomation } from './export-automation';

describe('export automation requirements', () => {
  it('allows simulations that do not read user input', () => {
    expect(inspectExportAutomation({ 'simulation.js': 'export function update(world) { world.circle(); }' })).toEqual({ interactive: false, botAvailable: false });
  });

  it('requires a root bot.js for interactive simulations', () => {
    expect(inspectExportAutomation({ 'simulation.js': 'export function update(world) { return world.input.pointer.x; }' }).error).toMatch(/bot\.js/);
  });

  it('accepts an interactive simulation with bot.js and ignores comments', () => {
    expect(inspectExportAutomation({
      'simulation.js': '// world.input is documented here\nexport function update(world) { return world.input.pointer.x; }',
      'bot.js': 'export function update() {}'
    })).toEqual({ interactive: true, botAvailable: true });
  });
});
