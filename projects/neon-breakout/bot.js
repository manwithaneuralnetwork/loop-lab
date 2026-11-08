// Export automation for Neon Breakout.
// Video rendering runs this update before the simulation's update on every fixed step.
import { readBotState, applyBotInput } from "./simulation.js";

let lockedTarget = null;

function chooseCleanupTarget(state) {
  return state.bricks.reduce((best, brick) => {
    const distance = Math.hypot(brick.x - state.ball.x, brick.y - state.ball.y);
    const bestDistance = best ? Math.hypot(best.x - state.ball.x, best.y - state.ball.y) : Infinity;
    return distance < bestDistance ? brick : best;
  }, null);
}

function chooseBankShot(state) {
  const useLeftWall = state.ball.x < state.world.width / 2;
  return {
    // Aim just outside the playable bounds. The boundary reflection turns
    // this into a shallow bank that enters above the brick wall instead of
    // repeatedly striking its front face.
    x: useLeftWall ? 10 : state.world.width - 10,
    y: state.layout.top + 100
  };
}

export function update(world) {
  const state = readBotState(world);
  if (!state || state.finished) return;

  // Lock one plan for the entire descent. Re-evaluating every frame causes
  // jitter and makes the paddle look indecisive.
  if (state.ball.vy <= 0) lockedTarget = null;
  if (state.ball.vy > 0 && !lockedTarget && state.bricks.length) {
    lockedTarget = state.bricks.length <= 6
      ? chooseCleanupTarget(state)
      : chooseBankShot(state);
  }

  applyBotInput(world, {
    paddleX: state.ball.x,
    aimX: lockedTarget?.x,
    aimY: lockedTarget?.y
  });
}
