import { describe, expect, it } from 'vitest';
import cascadeSource from '../../projects/particle-cascade/simulation.js?raw';
import { SimulationRuntime } from './simulation';

describe('Particle Cascade project', () => {
  it('builds a chain reaction and completes deterministically', () => {
    const runtime = new SimulationRuntime(900, 900);
    runtime.load(cascadeSource);
    const game = runtime.world as typeof runtime.world & {
      gameState: { reactions: number; collisions: number; nextParticleId: number; lastSpawnInterval: number; finishing: boolean };
    };
    expect(runtime.world.tagged('particle')).toHaveLength(0);
    runtime.step();
    expect(runtime.world.tagged('particle').length).toBeGreaterThan(0);
    for (let frame = 0; frame < 14 * 60 && !runtime.world.finished; frame += 1) runtime.step();
    expect(game.gameState.reactions).toBeGreaterThan(10);
    expect(game.gameState.collisions).toBeGreaterThan(0);
    expect(game.gameState.reactions).toBeGreaterThanOrEqual(game.gameState.collisions * 2);
    expect(game.gameState.nextParticleId).toBeGreaterThan(40);
    expect(game.gameState.lastSpawnInterval).toBeGreaterThan(0.035);
    expect(runtime.world.finished).toBe(true);
    expect(runtime.world.finishReason).toBe('Cascade complete');
  });
});
