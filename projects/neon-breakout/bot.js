// Export automation for Neon Breakout.
// Video rendering runs this update before the simulation's update on every fixed step.
import { readBotState, applyBotInput } from "./simulation.js";

export function update(world) {
  const state = readBotState(world);
  if (!state || state.finished) return;

  let paddleX = state.ball.x;
  let target = null;
  if (state.ball.vy > 0 && state.bricks.length) {
    // Aim the next upward bounce at the lowest remaining brick. Moving the
    // paddle's center changes the contact offset and therefore the exit angle.
    target = state.bricks.reduce((best, brick) => {
      if (!best || brick.y > best.y) return brick;
      if (brick.y === best.y && Math.abs(brick.x - state.ball.x) < Math.abs(best.x - state.ball.x)) return brick;
      return best;
    }, null);
    const travelTime = (state.world.height - target.y) / Math.max(1, Math.abs(state.ball.vy));
    const desiredVx = Math.max(-560, Math.min(560, (target.x - state.ball.x) / Math.max(0.18, travelTime)));
    const contactOffset = Math.max(-0.78, Math.min(0.78, desiredVx / 558));
    paddleX = state.ball.x - contactOffset * state.paddle.width * 0.5;
  }
  applyBotInput(world, {
    paddleX,
    aimX: target?.x,
    aimY: target?.y
  });
}
