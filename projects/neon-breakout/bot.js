// Export automation for Neon Breakout.
// Video rendering runs this update before the simulation's update on every fixed step.
import { readBotState, applyBotInput } from "./simulation.js";

let lockedTarget = null;
let lastTargetX = null;

function chooseCleanupTarget(state) {
  return state.bricks.reduce((best, brick) => {
    const distance = Math.hypot(brick.x - state.ball.x, brick.y - state.ball.y);
    const bestDistance = best ? Math.hypot(best.x - state.ball.x, best.y - state.ball.y) : Infinity;
    return distance < bestDistance ? brick : best;
  }, null);
}

function chooseStrategicTarget(state) {
  const brickWidth = state.layout.brickWidth;
  return state.bricks.reduce((best, brick) => {
    const below = state.bricks.filter((other) =>
      other.y > brick.y && Math.abs(other.x - brick.x) < brickWidth * 0.62
    ).length;
    const aboveInLane = state.bricks.filter((other) =>
      other.y < brick.y && Math.abs(other.x - brick.x) < brickWidth * 0.62
    ).length;
    const neighbors = state.bricks.filter((other) =>
      other !== brick && Math.abs(other.x - brick.x) < brickWidth * 1.45 && Math.abs(other.y - brick.y) < state.layout.brickHeight * 1.7
    ).length;
    const laneChange = lastTargetX == null ? 0 : Math.abs(brick.x - lastTargetX) / state.world.width;

    // Exposed bricks are reliable shots. Prefer ones supporting a tall lane,
    // surrounded by bricks, and away from the previous target so trajectories
    // sweep the board instead of repeating vertically.
    const score = (below === 0 ? 80 : -below * 45)
      + aboveInLane * 18
      + neighbors * 7
      + laneChange * 24
      + brick.y / state.world.height * 12;
    return !best || score > best.score ? { brick, score } : best;
  }, null)?.brick;
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
      : chooseStrategicTarget(state);
    lastTargetX = lockedTarget?.x ?? lastTargetX;
  }

  applyBotInput(world, {
    paddleX: state.ball.x,
    aimX: lockedTarget?.x,
    aimY: lockedTarget?.y
  });
}
