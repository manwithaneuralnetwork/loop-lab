import { normalizeParameters } from './parameters';
import type { ParameterSchema, ParameterValues } from './protocol';
import { World } from './world';

interface SimulationHooks {
  parameters: ParameterSchema;
  setup: ((world: World, params: ParameterValues) => void) | null;
  update: ((world: World, dt: number, params: ParameterValues) => void) | null;
}

export function compileSimulation(
  source: string,
  world: World,
  params: ParameterValues
): SimulationHooks {
  const transformed = source.replace(/\bexport\s+(?=(const|let|var|function|class)\b)/g, '');
  const factory = new Function(
    'world',
    'params',
    `"use strict";\n${transformed}\nreturn { parameters: typeof parameters !== "undefined" ? parameters : {}, setup: typeof setup === "function" ? setup : null, update: typeof update === "function" ? update : null };`
  ) as (world: World, params: ParameterValues) => SimulationHooks;
  return factory(world, params);
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
  private hooks: SimulationHooks = { parameters: {}, setup: null, update: null };

  constructor(width: number, height: number, stepSize = 1 / 60) {
    this.width = width;
    this.height = height;
    this.stepSize = stepSize;
    this.world = new World(width, height);
  }

  load(source: string, overrides: ParameterValues = {}): void {
    this.source = source;
    const discoveryWorld = new World(this.width, this.height);
    const discovered = compileSimulation(source, discoveryWorld, {});
    this.schema = discovered.parameters || {};
    this.params = normalizeParameters(this.schema, overrides);
    this.elapsed = 0;
    this.frame = 0;
    this.world = new World(this.width, this.height, Number(this.params.seed) || 1);
    this.hooks = compileSimulation(source, this.world, this.params);
    this.hooks.setup?.(this.world, this.params);
  }

  restart(): void { this.load(this.source, this.params); }

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
    for (let frame = 0; frame < targetFrame; frame += 1) this.step();
  }

  step(): void {
    this.hooks.update?.(this.world, this.stepSize, this.params);
    this.world.advance(this.stepSize);
    this.elapsed += this.stepSize;
    this.frame += 1;
  }
}
