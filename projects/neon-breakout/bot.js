// Export automation for Neon Breakout.
// Video rendering runs this update before the simulation's update on every fixed step.
import { readBotState, applyBotInput } from "./simulation.js";

export function update(world) {
  const state = readBotState(world);
  if (!state || state.finished) return;

  // A small velocity lead makes the paddle look intentional without becoming perfect.
  const lead = state.ball.vy > 0 ? state.ball.vx * 0.055 : 0;
  applyBotInput(world, { paddleX: state.ball.x + lead });
}
