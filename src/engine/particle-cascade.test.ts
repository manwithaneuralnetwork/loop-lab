import { describe, expect, it } from 'vitest';
import cascadeSource from '../../projects/particle-cascade/simulation.js?raw';
import { SimulationRuntime } from './simulation';

describe('Particle Cascade project', () => {
  it('builds a chain reaction and completes deterministically', () => {
    const runtime = new SimulationRuntime(900, 900);
    runtime.load(cascadeSource);
    const game = runtime.world as typeof runtime.world & {
      gameState: { reactions: number; finishing: boolean };
    };
    for (let frame = 0; frame < 14 * 60 && !runtime.world.finished; frame += 1) runtime.step();
    expect(game.gameState.reactions).toBeGreaterThan(10);
    expect(runtime.world.finished).toBe(true);
    expect(runtime.world.finishReason).toBe('Cascade complete');
  });
});
