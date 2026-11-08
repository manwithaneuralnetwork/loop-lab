import { describe, expect, it } from 'vitest';
import simulationSource from '../../projects/neon-breakout/simulation.js?raw';
import botSource from '../../projects/neon-breakout/bot.js?raw';
import { SimulationRuntime } from './simulation';

describe('Neon Breakout project', () => {
  function finishedScore(source: string): number {
    const runtime = new SimulationRuntime(720, 960);
    runtime.loadProject({ 'simulation.js': source, 'bot.js': botSource }, 'simulation.js', {}, {}, 'bot.js');
    const game = runtime.world as typeof runtime.world & { gameState: { score: number; finished: boolean } };
    for (let frame = 0; frame < 59 * 60 && !game.gameState.finished; frame += 1) runtime.step();
    expect(game.gameState.finished).toBe(true);
    return game.gameState.score;
  }

  it('rewards brick streaks between paddle hits', () => {
    const withoutAimBonus = simulationSource.replace(' + state.brickHitsSincePaddle * 5', '');
    expect(finishedScore(simulationSource)).toBeGreaterThan(finishedScore(withoutAimBonus));
  });

  it('lets bot.js clear the board, plays the hit effect, and holds the result for one second', () => {
    const runtime = new SimulationRuntime(720, 960);
    runtime.loadProject({
      'simulation.js': simulationSource,
      'bot.js': botSource
    }, 'simulation.js', {}, {}, 'bot.js');

    const game = runtime.world as typeof runtime.world & {
      gameState: {
        score: number; lives: number; startingLives: number; remaining: number;
        finished: boolean; effects: unknown[];
        ball: { position: { y: number } }; layout: { top: number };
      };
    };
    let reachedBehindWall = false;
    for (let frame = 0; frame < 59 * 60 && !game.gameState.finished; frame += 1) {
      runtime.step();
      if (game.gameState.ball.position.y < game.gameState.layout.top - 22 && game.gameState.remaining > 6) reachedBehindWall = true;
    }
    expect(reachedBehindWall).toBe(true);
    expect(game.gameState.score).toBeGreaterThan(0);
    expect(game.gameState.lives).toBe(game.gameState.startingLives);
    expect(game.gameState.remaining).toBe(0);
    expect(game.gameState.effects.length).toBeGreaterThan(0);
    expect(runtime.world.finished).toBe(false);
    for (let frame = 0; frame < 59; frame += 1) runtime.step();
    expect(runtime.world.finished).toBe(false);
    runtime.step();
    expect(runtime.world.finishReason).toBe('All bricks cleared');
  });
});
