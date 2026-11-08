import { describe, expect, it } from 'vitest';
import { SimulationRuntime } from './simulation';

const source = `
export const parameters = {
  seed: { value: 7 },
  speed: { value: 10 }
};
export function setup(world, params) {
  world.circle({ x: world.random(0, 100), y: 20, vx: params.speed });
}
export function update(world, dt, params) {
  world.objects[0].velocity.y += params.speed * dt;
}
`;

describe('SimulationRuntime', () => {
  it('loads code, normalizes parameters, and calls setup', () => {
    const runtime = new SimulationRuntime(200, 100);
    runtime.load(source, { speed: 20, stale: 1 });
    expect(runtime.params).toEqual({ seed: 7, speed: 20 });
    expect(runtime.world.objects).toHaveLength(1);
  });

  it('advances with a deterministic fixed timestep', () => {
    const runtime = new SimulationRuntime(200, 100, 0.25);
    runtime.load(source);
    const initialX = runtime.world.objects[0].position.x;
    runtime.step();
    expect(runtime.elapsed).toBe(0.25);
    expect(runtime.frame).toBe(1);
    expect(runtime.world.objects[0].position.x).toBeCloseTo(initialX + 2.5);
    expect(runtime.world.objects[0].velocity.y).toBeCloseTo(2.5);
  });

  it('restarts to the same seeded initial state', () => {
    const runtime = new SimulationRuntime(200, 100);
    runtime.load(source);
    const initialX = runtime.world.objects[0].position.x;
    runtime.step();
    runtime.restart();
    expect(runtime.elapsed).toBe(0);
    expect(runtime.frame).toBe(0);
    expect(runtime.world.objects[0].position.x).toBe(initialX);
  });

  it('keeps the current parameter values when restarting', () => {
    const runtime = new SimulationRuntime(200, 100);
    runtime.load(source);
    runtime.updateParameters({ speed: 32 });
    runtime.restart();
    expect(runtime.params.speed).toBe(32);
    expect(runtime.world.objects[0].velocity.x).toBe(32);
  });

  it('seeks deterministically from the initial state', () => {
    const runtime = new SimulationRuntime(200, 100, 0.25);
    runtime.load(source);
    runtime.seek(1);
    expect(runtime.elapsed).toBe(1);
    expect(runtime.frame).toBe(4);
    const x = runtime.world.objects[0].position.x;
    runtime.seek(1);
    expect(runtime.world.objects[0].position.x).toBe(x);
  });

  it('finishes from a code-defined condition instead of parameter duration', () => {
    const runtime = new SimulationRuntime(200, 100, 0.25);
    runtime.load(`
      export const parameters = { duration: { value: 0.1 } };
      export function update(world) {
        if (world.frame >= 2) world.finish("Target reached");
      }
    `);
    runtime.step(); runtime.step(); runtime.step(); runtime.step();
    expect(runtime.world.finished).toBe(true);
    expect(runtime.world.finishReason).toBe('Target reached');
    expect(runtime.elapsed).toBe(0.75);
  });

  it('runs an export bot before the simulation update', () => {
    const runtime = new SimulationRuntime(200, 100, 0.25);
    runtime.loadProject({
      'simulation.js': `
        export function setup(world) { world.control = 0; world.circle({ x: 0 }); }
        export function readState(world) { return world.objects[0].position.x; }
        export function applyInput(world, value) { world.control = value; }
        export function update(world) { world.objects[0].position.x += world.control; }
      `,
      'bot.js': `
        import { readState, applyInput } from './simulation.js';
        export function update(world) { applyInput(world, readState(world) + 2); }
      `
    }, 'simulation.js', {}, {}, 'bot.js');
    runtime.step();
    expect(runtime.world.objects[0].position.x).toBe(2);
    runtime.step();
    expect(runtime.world.objects[0].position.x).toBe(6);
  });
});
