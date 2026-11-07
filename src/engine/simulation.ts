import { normalizeParameters } from './parameters';
import type { ParameterSchema, ParameterValues } from './protocol';
import { World } from './world';
import { compileProject, type ProjectSources, type SimulationHooks } from './module-runtime';

export function compileSimulation(
  source: string,
  world: World,
  params: ParameterValues
): SimulationHooks {
  return compileProject({ 'simulation.js': source }, 'simulation.js', world, params);
}

export class SimulationRuntime {
  readonly stepSize: number;
  world: World;
  schema: ParameterSchema = {};
  params: ParameterValues = {};
  elapsed = 0;
  frame = 0;
  private width: number;
  private height: number;
  private source = '';
  private sources: ProjectSources = {};
  private entry = 'simulation.js';
  private assets: Record<string, string> = {};
  private hooks: SimulationHooks = { parameters: {}, setup: null, update: null };

  constructor(width: number, height: number, stepSize = 1 / 60) {
    this.width = width;
    this.height = height;
    this.stepSize = stepSize;
    this.world = new World(width, height);
  }

  load(source: string, overrides: ParameterValues = {}): void {
    this.loadProject({ 'simulation.js': source }, 'simulation.js', overrides);
  }

  loadProject(sources: ProjectSources, entry = 'simulation.js', overrides: ParameterValues = {}, assets: Record<string, string> = {}): void {
    this.source = sources[entry] || '';
    this.sources = { ...sources };
    this.entry = entry;
    this.assets = { ...assets };
    const discoveryWorld = new World(this.width, this.height, 1, this.assets);
    const discovered = compileProject(this.sources, this.entry, discoveryWorld, {});
    this.schema = discovered.parameters || {};
    this.params = normalizeParameters(this.schema, overrides);
    this.elapsed = 0;
    this.frame = 0;
    this.world = new World(this.width, this.height, Number(this.params.seed) || 1, this.assets);
    this.hooks = compileProject(this.sources, this.entry, this.world, this.params);
    this.hooks.setup?.(this.world, this.params);
  }

  restart(): void { this.loadProject(this.sources, this.entry, this.params, this.assets); }

  updateParameters(values: ParameterValues): void {
    this.params = { ...this.params, ...values };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.world.resize(width, height);
  }

  seek(seconds: number): void {
    this.restart();
    const targetFrame = Math.max(0, Math.round(seconds / this.stepSize));
    for (let frame = 0; frame < targetFrame && !this.world.finished; frame += 1) this.step();
  }

  step(): void {
    if (this.world.finished) return;
    this.hooks.update?.(this.world, this.stepSize, this.params);
    this.world.advance(this.stepSize);
    this.elapsed += this.stepSize;
    this.frame += 1;
    this.world.elapsed = this.elapsed;
    this.world.frame = this.frame;
  }
}
