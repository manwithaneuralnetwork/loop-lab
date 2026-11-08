import { describe, expect, it } from 'vitest';
import simulationSource from '../../projects/neon-breakout/simulation.js?raw';
import botSource from '../../projects/neon-breakout/bot.js?raw';
import { SimulationRuntime } from './simulation';

describe('Neon Breakout project', () => {
  it('loads the real project and lets bot.js play without losing a life', () => {
    const runtime = new SimulationRuntime(720, 960);
    runtime.loadProject({
      'simulation.js': simulationSource,
      'bot.js': botSource
    }, 'simulation.js', {}, {}, 'bot.js');

    for (let frame = 0; frame < 60 * 30 && !runtime.world.finished; frame += 1) runtime.step();
    const game = runtime.world as typeof runtime.world & {
      gameState: { score: number; lives: number; startingLives: number; remaining: number };
    };
    expect(game.gameState.score).toBeGreaterThan(0);
    expect(game.gameState.lives).toBe(game.gameState.startingLives);
    expect(game.gameState.remaining).toBeLessThan(48);
  });
});
